/**
 * The RunManager (WP3; docs/m2-plan.md sections 2, 3.7, 4 and 7.1; contracts in ./types.ts): one per model root, at
 * most one active run. Slice 2 (docs/slice2-plan.md 2d): every start is an edit session (`formalize`; `start` is a
 * one-inference `formalize`), run by the session layer (./session.ts) on top of the StepRunner (./step.ts), which runs
 * each step as one round. A run of version 1 (M2's, slice 1's) still runs M2's flow here (its proposal, Accept,
 * Feedback, ghost adoption, Discard) until it is reloaded in review, when it is converted into a session (§3.11,
 * ./legacy.ts). It never runs Lean itself (LeanCheckEngine) and writes the user's files only through the
 * ProposalService's apply (Accept).
 */
import path from 'node:path';

import {
  ActionError,
  buildProjectModel,
  isTerminalRunState,
  parseLeanFile,
  REVIEW_TEXTS,
  upgradeLegacyProposal,
  type ActionOutcome,
  type CanvasPosition,
  type FileChange,
  type ItemDecision,
  type ProjectModel,
  type ProposalView,
  type RunVerdict,
  type RunView,
  type SessionView,
} from '@telelean/core';

import type { CheckContext, CheckReport, FreezeOutcome, FreezeRecord, GateReport, RenderedStatement } from '../gate/types.js';
import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import { renderAnswersAsUserTurn } from '../llm/toolSchemas.js';
import type { FinishStatus } from '../llm/types.js';
import { openRunShadow } from '../shadow/index.js';
import { PASSING_COMMIT_KINDS, type ShadowCommit, type ShadowWorkspace } from '../shadow/types.js';
import type { Disposable } from '../workspace/types.js';
import { legacySession } from './legacy.js';
import { nonTerminal, scanRuns, writeJsonAtomic } from './persist.js';
import { adoptionTurn, feedbackTurn, resumeTurn } from './prompts.js';
import { ReviewRunner } from './review.js';
import {
  ActiveRun,
  argsOfAnswered,
  diffMaps,
  driftRefusal,
  errorText,
  headCommit,
  isModelPath,
  okOutcome,
  refused,
  sentenceShort,
  statusForRegate,
  stripGhost,
  summaryOf,
} from './step.js';
import type { FormalizeRequest, RunChange, RunCore, RunManager, RunManagerOptions, RunStartRequest } from './types.js';

export { condenseRateLimit, driftRefusal, ENVIRONMENT_RETRY_MS, gateCheckOf, localTime, rateLimitNotice, validateAnswers, verdictOfStatus } from './step.js';


/** Slice 2: the M2 actions of a proposal refused in an edit session (2h retires them). */
const IN_A_SESSION = 'This run is an edit session: review its items instead.';
/** Slice 2: a session action on a run of version 1. */
const NOT_A_SESSION = 'This run is not an edit session.';

// ---------------------------------------------------------------------------------------------
// The manager

class RunManagerImpl extends ReviewRunner implements RunManager {
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

  proposal(): ProposalView | null {
    const shown = this.run?.saved;
    if (shown === undefined || shown.view.state !== 'review' || shown.proposal === undefined || shown.session !== undefined) return null;
    return structuredClone(shown.proposal);
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

  // ---- what ends a round: M2's proposal (a run of version 1), or a session step's end

  protected roundAccepted(run: ActiveRun): Promise<void> {
    return run.p.session !== undefined ? this.stepAccepted(run) : this.settleAccepted(run);
  }

  protected roundReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void> {
    return run.p.session !== undefined ? this.stepReverted(run, verdict, reason) : this.settleReverted(run, verdict, reason);
  }

  protected roundEnvironment(run: ActiveRun, reason: string): Promise<void> {
    return run.p.session !== undefined ? this.failStep(run, 'failed', reason) : this.failRun(run, reason);
  }

  protected roundCrashed(run: ActiveRun, error: string): Promise<void> {
    return run.p.session !== undefined ? this.failStep(run, 'failed', error) : this.failRun(run, error);
  }

  /** The gate passed: ws/ back to the gate-pass files (edits after finish are discarded), then the proposal. */
  protected async settleAccepted(run: ActiveRun): Promise<void> {
    const r = run.round;
    const gatePass = r.gatePass;
    const passing = r.passing;
    if (gatePass === undefined || passing === undefined) throw new Error('the passing gate state is missing');
    const after = await run.shadow.changes(gatePass.id);
    if (after.length > 0) {
      await run.shadow.revertTo(gatePass.id, 'Discarded edits made after finish', run.view.round);
      this.notice(run, 'info', 'info', 'Changes made after finish were discarded: the proposal shows exactly the files the checks passed.');
    }
    await this.buildProposal(run, r.verdict ?? 'proved', passing.check, passing.flaggedDefinitions);
  }

  /** Give-up, no finish, caps: revert to the last passing commit, normalise it, re-check it, then the proposal. */
  protected async settleReverted(run: ActiveRun, verdict: RunVerdict, reason: string): Promise<void> {
    const shadow = run.shadow;
    const target = await shadow.lastCommit(PASSING_COMMIT_KINDS);
    let reverted: ProposalView['report']['reverted'];
    if (target !== undefined) {
      await shadow.revertTo(target.id, `Reverted to “${target.label}”`, run.view.round);
      reverted = { toCommit: target.id, label: target.label, reason };
      this.notice(run, 'reverted', 'warning', `telelean reverted Claude's working copy to “${target.label}” (${reason}).`);
      if (target.kind === 'base') {
        // Back before any freeze of this round: the shown state is unfrozen.
        run.view.stage = 'formalise';
        run.view.frozen = undefined;
      }
    }
    const ctx = this.checkContext(run);
    try {
      await this.o.services.engine.normalise(ctx);
    } catch (e) {
      this.log('warn', `normalising the reverted state failed: ${errorText(e)}`);
    }
    let check: CheckReport;
    try {
      check = await this.o.services.engine.check(ctx);
    } catch (e) {
      check = { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 };
    }
    if (!this.live(run)) return;
    await this.buildProposal(run, verdict, check, check.rules?.flaggedDefinitions ?? [], reverted);
  }

  protected statementsToRender(run: ActiveRun, check: CheckReport): string[] {
    const model = check.model;
    if (model === undefined) return [];
    const sel = run.p.selection;
    const focus = new Set([sel.target, ...sel.premises, ...sel.adoptedGhosts]);
    const touched = new Set([...(check.rules?.declarations.added ?? []), ...(check.rules?.declarations.changed ?? [])]);
    const names = new Set<string>();
    for (const entry of model.nodes.values()) {
      if (entry.node.subject !== sel.subject) continue;
      const st = entry.node.lean.statement;
      if (st !== undefined && (touched.has(st) || focus.has(entry.node.id))) names.add(st);
    }
    return [...names];
  }

  protected async buildProposal(
    run: ActiveRun,
    verdict: RunVerdict,
    check: CheckReport,
    flagged: GateReport['flaggedDefinitions'],
    reverted?: ProposalView['report']['reverted'],
  ): Promise<void> {
    const { engine, proposals } = this.o.services;
    const shadow = run.shadow;
    let rendered: RenderedStatement[] = [];
    if (check.model !== undefined && check.outcome !== 'environment' && check.g0.length === 0) {
      const names = this.statementsToRender(run, check);
      if (names.length > 0) {
        try {
          rendered = await engine.renderStatements({ shadow, job: this.checkContext(run).job }, names);
        } catch (e) {
          this.log('warn', `statements could not be rendered: ${errorText(e)}`);
        }
      }
    }
    if (!this.live(run)) return;
    let drift: string[] = [];
    try {
      const readText = this.o.workspace.readText?.bind(this.o.workspace);
      if (readText !== undefined) drift = await proposals.baseDrift(shadow, readText, this.o.workspace.modelFiles?.());
    } catch (e) {
      this.log('warn', `drift could not be computed: ${errorText(e)}`);
    }
    const currentGraph = this.graph(run.p.selection.subject);
    if (currentGraph === undefined) throw new Error(`the subject ${run.p.selection.subject} could not be loaded`);
    run.ids.proposal += 1;
    const proposalId = `p${run.ids.proposal}`;
    this.touch(run);
    const proposal = await proposals.build({
      runId: run.runId,
      round: run.view.round,
      proposalId,
      selection: run.p.selection,
      shadow,
      check,
      rendered,
      currentGraph,
      verdict,
      ...(run.p.lastFinish !== undefined ? { finish: run.p.lastFinish } : {}),
      ghosts: run.p.ghosts.map(stripGhost),
      gateAttempts: run.p.gateAttempts.filter((g) => g.round === run.view.round),
      flaggedDefinitions: flagged,
      usage: { ...run.view.usage },
      durationMs: Math.max(0, this.nowMs() - Date.parse(run.view.startedAt)),
      agentMs: run.p.clocks.totalAgentMs + (run.clockSince !== undefined ? Math.max(0, this.nowMs() - run.clockSince) : 0),
      ...(reverted !== undefined ? { reverted } : {}),
      drift,
      graphVersion: this.nowMs(),
    });
    if (!this.live(run)) return;
    run.p.proposal = proposal;
    run.view.proposalId = proposalId;
    run.view.verdict = verdict;
    this.setState(run, 'review');
    this.activity(run, 'system', `Round ${run.view.round} ended: ${verdict}. The proposal is ready for review.`);
    await this.appendAttempt(run, verdict, proposal.report.footprint);
    await this.save(run, { run: true, proposal: true, session: false });
  }

  // ---- RunManager: cancel, resume, discard, dismiss

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

  async discard(runId: string): Promise<ActionOutcome> {
    return this.exclusive('discarding', () => this.discardNow(runId));
  }

  protected async discardNow(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    const state = run.view.state;
    if (state !== 'review' && state !== 'interrupted') return refused('conflict', 'Only a finished round (or an interrupted run) can be discarded; Cancel stops a working run.');
    if (run.p.session !== undefined) {
      // Until 2f's Exit (endSession): a session in a stage, or interrupted, ends discarded; its records are written now (D2-11).
      await this.writeSessionAttempts(run, 'discarded');
      await this.endRun(run, 'discarded');
      return okOutcome('Session ended');
    }
    const hadProposal = state === 'review' && run.p.proposal !== undefined;
    if (state === 'review') await this.resolveAttempt(run, 'discarded');
    else {
      await this.appendAttempt(run, 'cancelled');
      await this.resolveAttempt(run, 'discarded');
    }
    await this.endRun(run, 'discarded');
    // "Stop" on an interrupted run discards no proposal (fixer round 1).
    return okOutcome(hadProposal ? 'Proposal discarded' : 'Run stopped');
  }

  async dismiss(runId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not shown any more.');
    if (!isTerminalRunState(run.view.state)) return refused('conflict', 'Only an ended run can be dismissed.');
    this.run = undefined;
    this.emit({ run: true, proposal: true, session: true });
    return okOutcome('Run dismissed');
  }

  // ---- RunManager: feedback (docs/m2-plan.md section 4.8)

  // ---- RunManager: feedback (docs/m2-plan.md section 4.8)

  async feedback(runId: string, text: string): Promise<ActionOutcome> {
    return this.exclusive('sending feedback', () => this.feedbackNow(runId, text));
  }

  protected async feedbackNow(runId: string, text: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.p.session !== undefined) return refused('conflict', IN_A_SESSION);
    if (run.view.state !== 'review') return refused('conflict', 'Feedback is possible once Claude has finished its round.');
    const trimmed = text.trim();
    if (trimmed === '') return refused('invalid', 'Write what Claude should change.');
    await this.resolveAttempt(run, 'superseded');
    const head = await headCommit(run.shadow);
    this.startNewRound(run, 'formalise');
    if (head !== undefined) run.p.roundStartCommit = head.id;
    this.notice(run, 'info', 'info', `Round ${run.view.round}: your feedback was sent to Claude.`);
    this.activity(run, 'system', `Round ${run.view.round} (Feedback): “${sentenceShort(trimmed, 120)}”`);
    this.setState(run, 'working');
    await this.save(run, { run: true, proposal: true, session: false });
    const outcome = await this.continueSession(run, feedbackTurn(trimmed, this.o.settings.caps));
    return outcome.ok ? okOutcome('Feedback sent to Claude') : outcome;
  }

  // ---- RunManager: ghosts (docs/m2-plan.md section 4.9)

  async adoptGhost(runId: string, ghostId: string, rationale?: string): Promise<ActionOutcome> {
    return this.exclusive('adopting the suggestion', () => this.adoptGhostNow(runId, ghostId, rationale));
  }

  protected async adoptGhostNow(runId: string, ghostId: string, rationale?: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.p.session !== undefined) return refused('conflict', IN_A_SESSION);
    if (run.view.state !== 'review') return refused('conflict', "A suggestion can be adopted once Claude's round has ended.");
    const ghost = run.p.ghosts.find((g) => g.id === ghostId);
    if (ghost === undefined) return refused('not-found', 'That suggestion is not part of this run.');
    if (ghost.state !== 'suggested') return refused('conflict', `That suggestion was already ${ghost.state}.`);
    const shadow = run.shadow;
    const sel = run.p.selection;
    const before = await headCommit(shadow);
    let model: ProjectModel;
    try {
      model = await this.shadowModel(run);
    } catch (e) {
      return refused('internal', `telelean could not read its working copy: ${errorText(e)}`);
    }
    let plan: ReturnType<RunCore['planGhostAdoption']>;
    try {
      plan = this.core.planGhostAdoption(model, {
        subject: sel.subject,
        target: sel.target,
        naturalName: ghost.naturalName,
        leanStatement: ghost.leanStatement,
        leanName: ghost.leanName,
        ...(rationale !== undefined && rationale.trim() !== '' ? { rationale: rationale.trim() } : {}),
        session: run.runId,
        today: this.today(),
      });
    } catch (e) {
      if (e instanceof ActionError) return refused(e.code, e.message);
      return refused('internal', `The suggestion could not be written: ${errorText(e)}`);
    }
    const nextRound = run.view.round + 1;
    let adoptCommit: ShadowCommit;
    try {
      await shadow.writeFiles(plan.changes);
      adoptCommit = await shadow.commit('adopt', `Adopted “${sentenceShort(ghost.naturalName)}”`, nextRound);
    } catch (e) {
      if (before !== undefined) await shadow.revertTo(before.id, 'Adoption undone', run.view.round).catch(() => undefined);
      return refused('internal', `The suggestion could not be written: ${errorText(e)}`);
    }
    const selection = { ...sel, adoptedGhosts: [...sel.adoptedGhosts, plan.nodeId] };
    const ctx: CheckContext = {
      ...this.checkContext(run),
      selection,
      stage: 'formalise',
      round: nextRound,
      teleleanBlocks: [...selection.adoptedGhosts],
      roundStartCommit: adoptCommit.id,
    };
    delete ctx.freeze;
    let frozen: FreezeOutcome;
    try {
      frozen = await this.o.services.engine.freeze(ctx);
    } catch (e) {
      frozen = { ok: false, refusals: [errorText(e)], report: { outcome: 'environment', environment: errorText(e), g0: [], findings: [], diagnostics: [], durationMs: 0 }, environment: errorText(e) };
    }
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    if (!frozen.ok) {
      if (before !== undefined) await shadow.revertTo(before.id, 'Adoption undone: the statements could not be frozen with it', run.view.round);
      const why = frozen.environment !== undefined ? `telelean could not run Lean (${frozen.environment})` : frozen.refusals.join('; ');
      this.notice(run, 'info', 'warning', `“${sentenceShort(ghost.naturalName)}” could not be adopted: ${why}.`);
      await this.save(run);
      return refused('conflict', `The suggestion could not be adopted: ${why}`);
    }
    await this.resolveAttempt(run, 'superseded');
    this.startNewRound(run, 'prove');
    run.p.selection = selection;
    run.p.roundStartCommit = adoptCommit.id;
    run.p.freezes.push(frozen.record);
    run.view.frozen = { round: run.view.round, at: frozen.record.at, permitted: summaryOf(frozen.record.snapshot.permitted) };
    ghost.state = 'adopted';
    ghost.nodeId = plan.nodeId;
    const shortName = plan.leanName.split('.').pop() ?? plan.leanName;
    ghost.leanName = shortName;
    if (frozen.report.model !== undefined) run.lastModel = frozen.report.model;
    this.notice(run, 'info', 'info', `You adopted “${sentenceShort(ghost.naturalName)}” as an axiom; Claude now proves the target with it (round ${run.view.round}).`);
    this.activity(run, 'ghost', `Adopted ${ghost.id} as ${plan.nodeId}; statements frozen again with it selected.`, true);
    this.setState(run, 'working');
    await this.save(run, { run: true, proposal: true, session: false });
    const turn = adoptionTurn({ nodeId: plan.nodeId, sentence: ghost.naturalName, leanName: plan.leanName, statement: ghost.leanStatement, caps: this.o.settings.caps });
    const outcome = await this.continueSession(run, turn);
    return outcome.ok ? okOutcome(`Adopted “${sentenceShort(ghost.naturalName)}”`) : outcome;
  }

  async rejectGhost(runId: string, ghostId: string): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.ended || isTerminalRunState(run.view.state)) return refused('conflict', 'This run has already ended.');
    if (run.p.session !== undefined) return refused('conflict', IN_A_SESSION);
    const ghost = run.p.ghosts.find((g) => g.id === ghostId);
    if (ghost === undefined) return refused('not-found', 'That suggestion is not part of this run.');
    if (ghost.state !== 'suggested') return refused('conflict', `That suggestion was already ${ghost.state}.`);
    ghost.state = 'rejected';
    const shown = run.p.proposal?.ghosts.find((g) => g.id === ghostId);
    if (shown !== undefined) shown.state = 'rejected';
    this.activity(run, 'ghost', `You declined ${ghost.id}: “${sentenceShort(ghost.naturalName)}”.`);
    await this.save(run, { run: true, proposal: run.p.proposal !== undefined, session: false });
    return okOutcome('Suggestion declined');
  }

  /** The shadow's model files parsed (syntactic: what core's adoption plan needs). */
  protected async shadowModel(run: ActiveRun): Promise<ProjectModel> {
    const files = await run.shadow.currentFiles();
    const library = run.p.library;
    const parsed = [...files.entries()].filter(([rel]) => rel.endsWith('.lean') && isModelPath(rel, library)).map(([rel, text]) => parseLeanFile(rel, text));
    const lakefile = files.get('lakefile.toml');
    return buildProjectModel({ files: parsed, fileHashes: {}, library, ...(lakefile !== undefined ? { lakefile: { path: 'lakefile.toml', text: lakefile } } : {}) });
  }

  // ---- RunManager: accept (docs/m2-plan.md section 7.1)

  async accept(runId: string, proposalId: string, definitions: readonly string[]): Promise<ActionOutcome> {
    return this.exclusive('accepting', () => this.acceptNow(runId, proposalId, definitions));
  }

  protected async acceptNow(runId: string, proposalId: string, definitions: readonly string[]): Promise<ActionOutcome> {
    const run = this.runFor(runId);
    if (run === undefined) return refused('not-found', 'That run is not active any more.');
    if (run.p.session !== undefined) return refused('conflict', IN_A_SESSION);
    if (run.view.state !== 'review' || run.p.proposal === undefined) return refused('conflict', 'There is no proposal to accept.');
    const proposal = run.p.proposal;
    if (proposal.proposalId !== proposalId) return refused('not-found', 'That proposal was replaced; review the current one.');
    const missingDefinitions = proposal.definitions.filter((d) => !definitions.includes(d.id));
    if (missingDefinitions.length > 0) return refused('invalid', 'Answer every definition question: a “no” is feedback.');
    const workspace = this.o.workspace;
    const readReal = workspace.readText?.bind(workspace);
    if (readReal === undefined || workspace.applyChanges === undefined) return refused('not-yet', 'This workspace cannot apply proposals.');
    const { proposals, engine } = this.o.services;
    const shadow = run.shadow;
    const request = { proposal, shadow, readReal, today: this.today(), premises: run.p.selection.premises.length };
    const drift = await proposals.baseDrift(shadow, readReal, workspace.modelFiles?.());
    // Spec v4 ES-7 (slice 1f): the run's base never moves. While the user's files differ from it (a hand edit, a git
    // checkout, another tool: the board itself cannot be edited during a run, ES-9), Accept settles nothing and says
    // which files differ; the run stays in review, so undoing those edits makes the same Accept go through.
    if (drift.length > 0) return refused('conflict', driftRefusal(drift));
    let plan = await proposals.planAccept(request);
    if (!plan.ok) return refused(plan.code, plan.error);
    // Slice 1e (1f's verification, ES-7 / A4 "nothing is merged"): the plan reads the user's files again and merges onto
    // what it read, so a hand edit that lands between `baseDrift`'s read and the plan's would be merged silently. The
    // plan's own drift (computed from the very read it applies) is authoritative: if the files differ from the base
    // now, nothing is applied.
    if (plan.drift.length > 0) return refused('conflict', driftRefusal(plan.drift));
    if (!this.live(run)) return refused('conflict', 'This run has ended.');

    let shown: ShadowCommit | undefined;
    if (drift.length > 0) {
      // This rebase is unreachable since slice 1f (ES-7): the drift refusal above returns first. Slice 2 removes it.
      // D-21: rebase onto the user's current files, then re-freeze and re-gate with B = their files at Accept.
      shown = await headCommit(shadow);
      try {
        const library = run.p.library;
        const realPaths = new Set((workspace.modelFiles?.() ?? []).filter((p) => isModelPath(p, library)));
        const wsNow = await shadow.currentFiles();
        const real = new Map<string, string>();
        for (const rel of realPaths) {
          const text = await readReal(rel);
          if (text !== null) real.set(rel, text);
        }
        await shadow.writeFiles(diffMaps(wsNow, real, library));
        const acceptBase = await shadow.commit('accept-base', 'Your files at Accept', run.view.round);
        await shadow.writeFiles(diffMaps(real, plan.shadowState, library));
        const rebase = await shadow.commit('rebase', "Claude's changes rebased onto your files", run.view.round);
        const status = statusForRegate(proposal.report.verdict, run.p.lastFinish?.status);
        const ctx: CheckContext = { ...this.checkContext(run), baseCommit: acceptBase.id, roundStartCommit: rebase.id, stage: 'formalise' };
        delete ctx.freeze;
        await engine.normalise(ctx);
        let failure: string | undefined;
        let freeze: FreezeRecord | undefined;
        if (status === 'proved') {
          const f = await engine.freeze(ctx);
          if (!f.ok) failure = f.environment !== undefined ? `telelean could not run Lean (${f.environment})` : f.refusals.join('; ');
          else freeze = f.record;
        }
        if (failure === undefined) {
          const gateCtx: CheckContext & { status: FinishStatus } = { ...ctx, stage: freeze !== undefined ? 'prove' : 'formalise', status };
          if (freeze !== undefined) gateCtx.freeze = freeze;
          const report = await engine.gate(gateCtx);
          if (report.environment !== undefined) failure = `telelean could not run the checks (${report.environment})`;
          else if (!report.passed) {
            const dctx = this.describeContext(run, report.check.model);
            failure = report.findings.map((f) => this.describe(f, dctx)).join('; ') || 'the checks failed';
          }
        }
        if (failure !== undefined) {
          if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round);
          return refused(
            'conflict',
            `Accept was refused: Claude's changes, applied to your current files, did not pass the checks (${failure}). Discard, or undo your edits since the run started and Accept again.`,
          );
        }
        const shownState = new Map([...(await shadow.currentFiles())].filter(([rel]) => isModelPath(rel, library)));
        plan = await proposals.planAccept({ ...request, shownState });
        if (!plan.ok) {
          if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round);
          return refused(plan.code, plan.error);
        }
      } catch (e) {
        if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round).catch(() => undefined);
        return refused('internal', `Accept failed: ${errorText(e)}`);
      }
    }
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    const outcome = await proposals.apply(plan, workspace, run.p.selection.subject);
    if (!outcome.ok) {
      if (shown !== undefined) await shadow.revertTo(shown.id, 'Accept refused: working copy restored', run.view.round).catch(() => undefined);
      return outcome;
    }
    await this.resolveAttempt(run, 'accepted');
    const target = this.graph(run.p.selection.subject)?.nodes.find((n) => n.id === run.p.selection.target);
    // An Accept that changed no file records the outcome only: no history entry, so no Undo step (fixer round 1). The
    // workspace says which: `undoable` is false exactly when it applied nothing.
    const changedFiles = !outcome.ok || outcome.undoable;
    let label: string | undefined;
    try {
      label = this.core.proposalLabel(proposal.report.verdict, target?.naturalName ?? run.p.selection.target, {
        adoptedGhosts: run.p.selection.adoptedGhosts.length,
        premises: run.p.selection.premises.length,
      });
    } catch {
      label = undefined;
    }
    // Fixer round 3: the outcome as data (core RunView.accepted), so a board that did not send the Accept need not parse
    // the notice below.
    run.view.accepted = { changedFiles };
    if (changedFiles) this.notice(run, 'info', 'info', label !== undefined ? `Accepted: ${label}. Undo reverts it.` : 'Accepted. Undo reverts it.');
    else this.notice(run, 'info', 'info', `Recorded${label !== undefined ? `: ${label}` : ''} (no file changed).`);
    await this.endRun(run, 'accepted');
    return changedFiles ? outcome : { ...outcome, label: label !== undefined ? `Recorded: ${label} (no file changed)` : 'Recorded (no file changed)' };
  }

  async proposalDiff(runId: string, proposalId: string): Promise<FileChange[]> {
    const run = this.runFor(runId);
    const proposal = run?.p.proposal;
    if (run === undefined || run.p.session !== undefined || proposal === undefined || proposal.proposalId !== proposalId) return [];
    return this.o.services.proposals.diffFiles(run.shadow, proposal);
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
    // A proposal saved by a build before spec v4 (three kinds, lifecycle items) is read in the two kinds, so the board
    // can still show it, and Accept or Discard it (slice 1a fixer; the save at the end writes it back upgraded).
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
      p.view.error = `This run was started by an older telelean and could not be converted (${errorText(e)}): Exit it.`;
      this.notice(run, 'info', 'error', p.view.error);
      await this.save(run, { run: true, proposal: true, session: false });
    }
  }

  // ---- Slice 2 (docs/slice2-plan.md 2.5): the review actions. While a step runs, D2-62's refusal. 2e builds decide,
  // reveal, the Undo and Redo, submit and the raw diff (review.ts); `end` and `moveProposed` are 2f's (until then
  // `not-yet`).

  /** The session run `runId` names, or why there is none. */
  protected sessionRun(runId: string): ActiveRun | ActionOutcome {
    const run = this.runFor(runId);
    if (run === undefined || run.ended) return refused('not-found', 'That run is not active any more.');
    if (run.p.session === undefined) return refused('conflict', NOT_A_SESSION);
    return run;
  }

  /** D2-62 for a review action, then `not-yet` until its sub-slice builds it. */
  protected reviewAction(runId: string): Promise<ActionOutcome> {
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return Promise.resolve(run);
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return Promise.resolve(refused('refused', REVIEW_TEXTS.stepRunning));
    return Promise.resolve(refused('not-yet', REVIEW_TEXTS.notBuiltYet));
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

  /** RV-12: one user action at a time (it waits while the session judges, AF3), as Retry step. */
  async submit(runId: string, stage: number): Promise<ActionOutcome> {
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return run;
    if (this.stepRunning(this.sessionOf(run))) return refused('refused', REVIEW_TEXTS.stepRunning);
    return this.exclusive('submitting the review', () => this.submitNow(run, stage));
  }

  /** EN-1-EN-4 (2f). While a step runs only `exit` is not refused (D2-62); Exit itself comes with 2f. */
  end(runId: string, decision: 'apply' | 'exit' | 'back', _stage?: number, _check?: string): Promise<ActionOutcome> {
    if (decision !== 'exit') return this.reviewAction(runId);
    const run = this.sessionRun(runId);
    if (!(run instanceof ActiveRun)) return Promise.resolve(run);
    return Promise.resolve(refused('not-yet', REVIEW_TEXTS.notBuiltYet));
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

  moveProposed(runId: string, _positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome> {
    return this.reviewAction(runId);
  }

}


export function createRunManagerImpl(options: RunManagerOptions): RunManager {
  if (!path.isAbsolute(options.root)) throw new TypeError(`createRunManager: root must be absolute, got ${JSON.stringify(options.root)}`);
  if (!path.isAbsolute(options.runsDir)) throw new TypeError(`createRunManager: runsDir must be absolute, got ${JSON.stringify(options.runsDir)}`);
  return new RunManagerImpl(options);
}
