/**
 * The RunManager (WP3; docs/m2-plan.md sections 2, 3.7, 4 and 7.1; contracts in ./types.ts): one per model root, at
 * most one active run. Slice 2 (docs/slice2-plan.md 2d): every start is an edit session (`formalize`; `start` is a
 * one-inference `formalize`), run by the session layer (./session.ts) on top of the StepRunner (./step.ts), which runs
 * each step as one round. Slice 2h retired M2's review (its proposal, Accept, Feedback, ghost adoption and Discard): a
 * run of version 1 (M2's, slice 1's) is converted into a session when it is recovered in review, or when a round it
 * resumed after a reload ends (§3.11, ./legacy.ts). It never runs Lean itself (LeanCheckEngine) and writes the user's
 * files only through the ProposalService's apply (a session's Apply).
 */
import path from 'node:path';

import {
  isTerminalRunState,
  REVIEW_TEXTS,
  upgradeLegacyProposal,
  type ActionOutcome,
  type CanvasPosition,
  type FileChange,
  type ItemDecision,
  type RunVerdict,
  type RunView,
  type SessionView,
} from '@telelean/core';

import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import { renderAnswersAsUserTurn } from '../llm/toolSchemas.js';
import { openRunShadow } from '../shadow/index.js';
import { PASSING_COMMIT_KINDS, type ShadowWorkspace } from '../shadow/types.js';
import type { Disposable } from '../workspace/types.js';
import { legacySession } from './legacy.js';
import { nonTerminal, scanRuns, writeJsonAtomic } from './persist.js';
import { resumeTurn } from './prompts.js';
import { EndRunner } from './sessionEnd.js';
import { ActiveRun, argsOfAnswered, errorText, okOutcome, refused } from './step.js';
import type { FormalizeRequest, RunChange, RunManager, RunManagerOptions, RunStartRequest } from './types.js';

export { condenseRateLimit, driftRefusal, ENVIRONMENT_RETRY_MS, gateCheckOf, localTime, rateLimitNotice, validateAnswers, verdictOfStatus } from './step.js';


/** Slice 2: a session action on a run of version 1. */
const NOT_A_SESSION = 'This run is not an edit session.';

// ---------------------------------------------------------------------------------------------
// The manager

class RunManagerImpl extends EndRunner implements RunManager {
  constructor(o: RunManagerOptions) {
    super(o);
  }

  // ---- RunManager: queries and listeners

  current(): RunView | null {
    const run = this.run;
    if (run === undefined) return null;
    if (run.saved !== undefined) {
      // Slice 2 (§3.12): a session's RunView follows its SessionView.
      if (run.saved.session !== undefined) return this.sessionRunView(run.saved, run.live?.view ?? null, run.live?.viewError);
      return structuredClone(run.saved.view);
    }
    this.touch(run);
    if (run.p.session !== undefined) return this.sessionRunView(structuredClone(run.p), run.live?.view ?? null, run.live?.viewError);
    return structuredClone(run.view);
  }

  session(): SessionView | null {
    const run = this.run;
    if (run?.saved?.session === undefined) return null;
    const view = run.live?.view ?? null;
    return view !== null ? structuredClone(view) : null;
  }

  onDidChange(listener: (change: RunChange) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  // ---- start and formalize (docs/m2-plan.md sections 2 and 4.1; docs/slice2-plan.md 3.2)

  /** Slice 2 (§2.5): a one-inference `formalize`; the runner's tests and scripts keep using it. */
  async start(request: RunStartRequest): Promise<ActionOutcome> {
    return this.formalize({ subject: request.subject, inferences: [{ target: request.target, premises: request.premises }] });
  }

  async formalize(request: FormalizeRequest): Promise<ActionOutcome> {
    if (this.disposed) return refused('conflict', 'telelean is shutting down.');
    if (request.runId !== undefined || request.stage !== undefined) {
      const run = request.runId !== undefined ? this.runFor(request.runId) : undefined;
      if (run === undefined) return refused('not-found', 'That run is not active any more.');
      if (run.p.session === undefined) return refused('conflict', NOT_A_SESSION);
      return this.exclusive('formalizing', () => this.formalizeInStage(run, request));
    }
    if (this.startLock) return refused('conflict', 'Another run of this model folder is starting.');
    this.startLock = true;
    try {
      return await this.startSession(request);
    } catch (e) {
      this.log('error', `start failed: ${errorText(e)}`);
      return refused('internal', `The run could not start: ${errorText(e)}`);
    } finally {
      this.startLock = false;
    }
  }

  // ---- what ends a round: a session step's end, or (a run of version 1 resumed after a reload) its conversion

  protected roundAccepted(run: ActiveRun): Promise<void> {
    return run.p.session !== undefined ? this.stepAccepted(run) : this.settleLegacy(run);
  }

  protected roundReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void> {
    return run.p.session !== undefined ? this.stepReverted(run, verdict, reason) : this.settleLegacy(run, reason);
  }

  protected roundEnvironment(run: ActiveRun, reason: string): Promise<void> {
    return run.p.session !== undefined ? this.failStep(run, 'failed', reason) : this.failRun(run, reason);
  }

  protected roundCrashed(run: ActiveRun, error: string): Promise<void> {
    return run.p.session !== undefined ? this.failStep(run, 'failed', error) : this.failRun(run, error);
  }

  /**
   * Slice 2h (§3.11, D2-16): the round of a run of version 1 ended (an M2 run, interrupted under an older telelean and
   * resumed here). M2 settled it into a proposal for its Accept, Feedback and Discard, which 2h retires; it becomes an
   * edit session instead, as a v1 run in review does when it is recovered (`convertLegacy`), so its work is reviewed as
   * items. ws/ first goes back to exactly the files the checks passed: the gate-pass commit (edits after finish are
   * discarded), or, for a give-up, a cap or no finish (`reverted`), the last commit that passed (M2's revert).
   */
  protected async settleLegacy(run: ActiveRun, reverted?: string): Promise<void> {
    const shadow = run.shadow;
    if (reverted === undefined) {
      const gatePass = run.round.gatePass;
      if (gatePass === undefined) throw new Error('the passing gate state is missing');
      if ((await shadow.changes(gatePass.id)).length > 0) {
        await shadow.revertTo(gatePass.id, 'Discarded edits made after finish', run.view.round);
        this.notice(run, 'info', 'info', 'Changes made after finish were discarded: the session shows exactly the files the checks passed.');
      }
    } else {
      const target = await shadow.lastCommit(PASSING_COMMIT_KINDS);
      if (target !== undefined) {
        await shadow.revertTo(target.id, `Reverted to “${target.label}”`, run.view.round);
        this.notice(run, 'reverted', 'warning', `telelean reverted Claude's working copy to “${target.label}” (${reverted}).`);
      }
    }
    if (!this.live(run)) return;
    run.view.state = 'review';
    await this.convertLegacy(run);
  }

  // ---- RunManager: cancel, resume, dismiss

  async cancel(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.ended || isTerminalRunState(run.view.state)) return refused('conflict', 'This run has already ended.');
    if (run.stopping) return refused('conflict', 'This run is already being cancelled.');
    // Slice 2 (§2.5): in a session, Cancel is Cancel step; it never ends the session (a start not yet working does).
    if (run.p.session !== undefined && run.view.state !== 'starting') return this.cancelStep(run);
    const inReview = run.view.state === 'review';
    const session = run.session;
    // Mark it as stopping at once, so tool calls and turns that return later change nothing.
    run.stopping = true;
    this.stopClock(run);
    run.abort.abort();
    try {
      await session?.interrupt();
    } catch {
      // the session may already be gone
    }
    try {
      await (this.o.services.cancelLean ?? leanCancelRun)(run.runId);
    } catch (e) {
      this.log('warn', `the run's Lean jobs could not be cancelled: ${errorText(e)}`);
    }
    if (run.p.session !== undefined) await this.writeSessionAttempts(run, 'discarded');
    else if (inReview) await this.resolveAttempt(run, 'discarded');
    else await this.appendAttempt(run, 'cancelled');
    this.notice(run, 'info', 'info', 'You cancelled the run. Its working copy and transcript are kept until old runs are pruned.');
    await this.endRun(run, 'cancelled', { verdict: inReview ? (run.view.verdict ?? 'cancelled') : 'cancelled' });
    return okOutcome('Run cancelled');
  }

  async resume(runId: string): Promise<ActionOutcome> {
    return this.exclusive('resuming', () => this.resumeNow(runId));
  }

  protected async resumeNow(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.view.state !== 'interrupted') return refused('conflict', 'Only an interrupted run can be resumed.');
    // Slice 2 (§3.11): a queue waiting between two steps starts its next step.
    if (run.p.session !== undefined && this.activeStep(run.p.session) === undefined) return this.resumeBetweenSteps(run);
    if (!run.view.canResume || run.p.sessionId === undefined) return refused('conflict', 'This run cannot be resumed: Stop it and start a new one.');
    run.view.canResume = undefined;
    this.setState(run, 'working');
    this.notice(run, 'resumed', 'info', run.p.session !== undefined ? 'Claude resumed the step.' : 'Claude resumed the run.');
    await this.save(run, { run: true, proposal: false, session: run.p.session !== undefined });
    const undelivered = run.p.undeliveredAnswers;
    if (undelivered !== undefined) {
      const args = argsOfAnswered(run.view.answered, undelivered.setId);
      const turn = renderAnswersAsUserTurn(args, {
        answers: undelivered.answers.map((a) => ({ question: a.question, choice: a.choice, scope: a.scope })),
        answeredAt: this.iso(),
      });
      return this.continueSession(run, turn, 'answers');
    }
    // Slice 2 (fixer 2d r1, F-V2D-FC-5 / A-F5): a step whose own turn no session received (its `--resume` failed when it
    // started) gets that turn now, never the generic resume turn: Claude would work without its target and limits.
    const unsent = run.p.undeliveredTurn;
    if (unsent !== undefined) return this.continueSession(run, unsent, 'turn');
    return this.continueSession(run, resumeTurn(this.currentFreeze(run) !== undefined));
  }

  async dismiss(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not shown any more.');
    if (!isTerminalRunState(run.view.state)) return refused('conflict', 'Only an ended run can be dismissed.');
    this.run = undefined;
    this.emit({ run: true, proposal: true, session: true });
    return okOutcome('Run dismissed');
  }

  // ---- recovery and disposal (docs/m2-plan.md section 4.6)

  async recover(): Promise<void> {
    if (this.disposed || this.activeRun() !== undefined) return;
    const scanned = await scanRuns(this.o.runsDir, this.o.root);
    const active = scanned.filter((s) => nonTerminal(s.run.view.state));
    const [newest, ...older] = active;
    for (const old of older) {
      const v = old.run.view;
      v.state = 'failed';
      v.verdict = 'failed';
      v.error = 'superseded by a newer run';
      v.endedAt = this.iso();
      v.updatedAt = this.iso();
      v.pendingQuestions = undefined;
      v.canResume = undefined;
      delete old.run.sessionId;
      delete old.run.pendingAsk;
      try {
        await writeJsonAtomic(old.stateFile, old.run);
      } catch (e) {
        this.log('warn', `an old run could not be marked failed: ${errorText(e)}`);
      }
    }
    if (newest === undefined) return;
    const p = newest.run;
    // A proposal saved by a build before spec v4 (three kinds, lifecycle items) is read in the two kinds (slice 1a fixer):
    // since 2h no board shows a proposal, and a v1 run in review is converted into a session below (2d), which reads the
    // shadow's commits, never the proposal; the upgrade stays so that run.json is never left in the old kinds.
    if (p.proposal !== undefined && upgradeLegacyProposal(p.proposal)) {
      this.log('info', `run ${p.view.runId}: its proposal was saved by an older telelean; it is read with the kinds AXIOM and PROPOSITION`);
    }
    let shadow: ShadowWorkspace;
    try {
      shadow = await (this.o.services.openShadow ?? openRunShadow)(newest.runDir, { root: this.o.root, library: p.library });
    } catch (e) {
      p.view.state = 'failed';
      p.view.verdict = 'failed';
      p.view.error = `the run's working copy could not be opened after the reload (${errorText(e)})`;
      p.view.endedAt = this.iso();
      delete p.sessionId;
      await writeJsonAtomic(newest.stateFile, p).catch(() => undefined);
      return;
    }
    if (this.disposed || this.activeRun() !== undefined) return;
    // Slice 2 (§3.11): a session (run.json v2) comes back through the session layer; a v1 run in review is converted.
    if (p.version === 2 && p.session !== undefined) {
      const run = this.makeRun(p, shadow);
      this.run = run;
      await this.recoverSession(run);
      return;
    }
    if (p.view.state === 'review') {
      const run = this.makeRun(p, shadow);
      this.run = run;
      await this.convertLegacy(run);
      return;
    }
    const run = this.makeRun(p, shadow);
    this.run = run;
    const state = p.view.state;
    if (state === 'starting' || state === 'working' || state === 'gate') {
      if (p.sessionId !== undefined && state !== 'starting') {
        p.view.state = 'interrupted';
        p.view.canResume = true;
        this.notice(run, 'interrupted', 'warning', 'The editor reloaded while Claude was working. Resume continues the same session; Stop discards the run.');
      } else {
        await this.endRun(run, 'failed', { verdict: 'failed', error: 'the editor reloaded before Claude had started' });
        return;
      }
    } else if (state === 'interrupted') {
      p.view.canResume = p.sessionId !== undefined ? true : undefined;
    }
    this.transcript(run, { kind: 'recovered', state: p.view.state });
    await this.save(run, { run: true, proposal: true, session: false });
  }

  /**
   * Window closing: an active run is persisted as `interrupted` (a waiting question or a proposal as it is) and its
   * session closed. run.json is written at once, synchronously; the returned promise resolves once the writes queued
   * before have landed and run.json holds that final state again (the extension waits for it, at most 4 s).
   */
  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const run = this.run;
    let written: Promise<void> = Promise.resolve();
    if (run !== undefined && !run.ended) {
      this.stopClock(run);
      const v = run.view;
      if (v.state === 'working' || v.state === 'gate' || v.state === 'starting') {
        v.state = 'interrupted';
        v.canResume = run.p.sessionId !== undefined ? true : undefined;
        this.notice(run, 'interrupted', 'warning', 'The editor closed while Claude was working.');
      }
      if (run.ask !== undefined) {
        const ask = run.ask;
        run.ask = undefined;
        ask.reject(new Error('telelean is closing'));
      }
      this.touch(run);
      written = run.files.close(`${JSON.stringify(run.p, null, 1)}\n`);
      run.ended = true;
      const session = run.session;
      run.session = undefined;
      run.unsubscribe?.();
      void session?.close({ force: true }).catch(() => undefined);
      // A check, gate or Accept re-check may be running: its result is thrown away, so stop its Lean job now rather
      // than letting it run on for up to leanJobMs when the extension host outlives the manager (fixer round 1).
      void Promise.resolve()
        .then(() => (this.o.services.cancelLean ?? leanCancelRun)(run.runId))
        .catch(() => undefined);
    }
    this.disposed = true;
    this.disposeEnd();
    this.listeners.clear();
    return written;
  }

  /**
   * §3.11 (D2-16): a v1 run left in review becomes a session with one passed step: its selection the inference, the
   * ledger from the v1 run, its pending ghosts Add premise drafts, its adopted ghosts written Add premise items in
   * review; a fresh judge then makes the items (stage 1). If the conversion fails, only Exit (Discard) is offered.
   */
  protected async convertLegacy(run: ActiveRun): Promise<void> {
    const p = run.p;
    try {
      const { session } = await legacySession(p, run.shadow);
      p.version = 2;
      p.session = session;
      delete p.proposal;
      delete p.view.proposalId;
      delete p.view.verdict;
      p.ghosts = [];
      p.view.ghosts = [];
      p.view.state = 'review';
      run.live = undefined;
      this.runtimeOf(run);
      await this.loadBaseModel(run);
      this.transcript(run, { kind: 'converted', from: 1 });
      this.notice(run, 'info', 'info', 'This run was started by an older telelean: it is now an edit session, with every item in review.');
      await this.save(run, { run: true, proposal: true, session: true });
      // Its adopted ghosts' records get their cards from the ledger at every judge-apply (fixer 2d r1, A-F2).
      void this.judgeHead(run, { queueSteps: ['s1'], endsQueue: true });
    } catch (e) {
      this.log('error', `run ${p.view.runId} could not be converted into an edit session: ${errorText(e)}`);
      delete p.proposal;
      delete p.view.proposalId;
      // Slice 2h: with no session, Exit is not offered; Stop (Cancel) ends it, its files untouched.
      p.view.error = `This run was started by an older telelean and could not be converted (${errorText(e)}): Stop it.`;
      this.notice(run, 'info', 'error', p.view.error);
      await this.save(run, { run: true, proposal: true, session: false });
    }
  }

  // ---- Slice 2 (docs/slice2-plan.md 2.5): the review actions. While a step runs, D2-62's refusal. 2e builds decide,
  // reveal, the Undo and Redo, submit and the raw diff (review.ts); 2f `end` (sessionEnd.ts) and `moveProposed`.

  /** The session run `runId` names, or why there is none. */
  protected sessionRun(runId: string): ActiveRun | ActionOutcome {
    const run = this.runFor(runId);
    if (run === undefined || run.ended) return refused('not-found', 'That run is not active any more.');
    if (run.p.session === undefined) return refused('conflict', NOT_A_SESSION);
    return run;
  }

  /** A review action of 2e on the session run `runId` names (review.ts). */
  protected async review(runId: string, act: (run: ActiveRun) => Promise<ActionOutcome>): Promise<ActionOutcome> {
    if (this.disposed) return refused('conflict', 'telelean is shutting down.');
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    try {
      return await act(run);
    } catch (e) {
      this.log('error', `a review action failed: ${errorText(e)}`);
      return refused('internal', `telelean could not carry out your decision: ${errorText(e)}`);
    }
  }

  decide(runId: string, stage: number, own: boolean, decisions: readonly ItemDecision[], confirmed: boolean): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.reviewNow(run, { kind: 'decide', decisions: decisions.map((d) => ({ ...d })), own, confirmed }, stage));
  }

  reveal(runId: string, stage: number, via: 'show-result' | 'activity'): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.reviewNow(run, { kind: 'reveal', via }, stage));
  }

  undoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.reviewNow(run, { kind: 'undo', step, confirmed }));
  }

  redoSession(runId: string, step: number, confirmed: boolean): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.reviewNow(run, { kind: 'redo', step, confirmed }));
  }

  /** 2j2 (D2-92, D2-95): a note for Claude on an item to be redone, as every review action (refused while a step runs). */
  note(runId: string, stage: number, item: string, rev: number, note: string): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.reviewNow(run, { kind: 'note', item, rev, note }, stage));
  }

  /** RV-12: one user action at a time (it waits while the session judges, AF3), as Retry step. */
  async submit(runId: string, stage: number, comment?: string): Promise<ActionOutcome> {
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    if (this.stepRunning(this.sessionOf(run))) return refused('refused', REVIEW_TEXTS.stepRunning);
    return this.exclusive('submitting the review', () => this.submitNow(run, stage, comment));
  }

  /**
   * EN-1-EN-4 (2f, §3.10; sessionEnd.ts). While a step runs only `exit` is not refused (D2-62). Exit is never locked out
   * by another action in progress (the host does not queue it either, AF14), so it can always stop a step; Apply and Back
   * to review are one user action at a time, as Submit review.
   */
  async end(runId: string, decision: 'apply' | 'exit' | 'back', stage?: number, check?: string): Promise<ActionOutcome> {
    if (this.disposed) return refused('conflict', 'telelean is shutting down.');
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    try {
      if (decision === 'exit') return await this.exitNow(run);
      if (this.stepRunning(this.sessionOf(run))) return refused('refused', REVIEW_TEXTS.stepRunning);
      if (decision === 'back') return await this.exclusive('going back to the review', () => this.backNow(run, stage));
      return await this.exclusive('applying the session', () => this.applyNow(run, stage, check));
    } catch (e) {
      this.log('error', `ending the session failed: ${errorText(e)}`);
      return refused('internal', `telelean could not end the session: ${errorText(e)}`);
    }
  }

  async retry(runId: string): Promise<ActionOutcome> {
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    return this.exclusive('retrying the step', () => this.retryNow(run));
  }

  async sessionDiff(runId: string, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome> {
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    try {
      return await this.sessionDiffNow(run, stage, confirmed);
    } catch (e) {
      this.log('error', `the raw diff failed: ${errorText(e)}`);
      return refused('internal', `Could not open the raw Lean diff: ${errorText(e)}`);
    }
  }

  /** D2-33 (2f): a move on the Proposed view, one session-stack step (refused while a step runs, as every review action). */
  moveProposed(runId: string, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome> {
    return this.review(runId, (run) => this.moveNow(run, positions));
  }

}


export function createRunManagerImpl(options: RunManagerOptions): RunManager {
  if (!path.isAbsolute(options.root)) throw new TypeError(`createRunManager: root must be absolute, got ${JSON.stringify(options.root)}`);
  if (!path.isAbsolute(options.runsDir)) throw new TypeError(`createRunManager: runsDir must be absolute, got ${JSON.stringify(options.runsDir)}`);
  return new RunManagerImpl(options);
}
