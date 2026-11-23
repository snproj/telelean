/**
 * Slice 2f (docs/slice2-plan.md 1.1's 2f, 2.5, 2.6, 3.9, 3.10): the end of an edit session, on top of the premise writes
 * (premises.ts):
 *
 *   the final check (§3.10 steps 1-3) once Submit review opened the end confirmation (phase `confirming`, the check
 *              `running`): drift read again; `engine.finalCheck` on exactly F (the head), reusing the stage judgement's
 *              file checks when it judged exactly F (EN-2) and the comparator passes the last check recorded; its outcome
 *              (`passed` or `failed` with the failures, "file checks reused") recorded in one run.json write, unless the
 *              confirmation changed meanwhile (Back to review, another check)
 *   Apply      (§3.10 step 4) the check id of a passed check, nothing changed since (the id again from the head and the
 *              records); drift read again (refused, ES-7); the backstop again (pure, never reused); phase `applying`;
 *              `planApply` (exactly F, the real files equal to B, its own read authoritative); with F the subject's
 *              `endorsements.json` (EN-3, D2-18) and `layout.json` (the cards moved on the Proposed view, D2-33) in one
 *              `applyChanges` with M2's history kind `accept-proposal` and its label (D2-67), and Claude's arrows as its
 *              provenance (G1); the attempt records, resolution accepted, each with the arrows its step proposed; the
 *              run ends `accepted`. Nothing accepted: no file changes, no history entry, only the records (D2-39)
 *   Exit       (§3.10 step 6, ES-8, EN-4) any phase but `applying`: a running step stops (as Cancel step stops it) and gets
 *              its attempt record; the attempt records, resolution discarded; the run ends `discarded`; no file changes
 *   Back to review   (§3.10 step 3, D2-54) the submitted stage, unsubmitted, with the stack as it was before Submit
 *   drift      (§3.9, ES-7) `ModelWorkspace.onDidChange`, debounced by 300 ms, once after recovery and right before Apply:
 *              `baseDrift` (open buffers first); a change recorded (`drift`, with when it was first seen, absent while
 *              none differs) and published; steps go on, nothing is merged, the base is never rewritten
 *   moves      (D2-33) a move on the Proposed view is one session-stack step (the reducer's), its positions the runner's
 *   recovery   (§3.10 step 7, §3.11) a confirmation whose check was running (or passed: Apply needs its judgement, which
 *              is not persisted) runs it again; a reload during Apply compares the real files with F (then it finishes
 *              as applied) and with B (then back to confirming); anything else: a notice, the drift, back to confirming
 */
import {
  endorsementHash,
  endorsementsPath,
  layoutPath,
  parseEndorsements,
  parseLayout,
  premiseKey,
  REVIEW_TEXTS,
  serializeEndorsements,
  serializeLayout,
  type ActionOutcome,
  type ArrowProvenance,
  type CanvasPosition,
  type Endorsement,
  type FileChange,
  type ProjectModel,
} from '@telelean/core';

import { filesKey } from '../gate/index.js';
import type { FinalCheckReport } from '../gate/types.js';
import { cancelRun as leanCancelRun } from '../lean/runLean.js';
import { isModelOrProjectFile } from '../workspace/files.js';
import type { Disposable } from '../workspace/types.js';
import { PremiseRunner } from './premises.js';
import { confirmationCheckId } from './review.js';
import { errorText, okOutcome, refused, sentenceShort, type ActiveRun } from './step.js';
import type { PersistedSession, RunManagerOptions } from './types.js';

const SESSION_CHANGE = { run: true, proposal: false, session: true } as const;
/** §3.9: how long the drift watcher waits after a change of the person's files before it reads them. */
export const DRIFT_DEBOUNCE_MS = 300;

/** Runner texts of the end (reported; no core text quotes them). 2k1 (D2-105): Exit's is `REVIEW_TEXTS.exited`. */
export const END_TEXTS = {
  recorded: 'The session\'s outcome is recorded: nothing in your files changed.',
  noConfirmation: 'There is no end confirmation to apply: Submit review first.',
  driftUnknown: (error: string) => `telelean could not compare your files with the session's base (${error}): Apply waits until it can.`,
  checkCouldNotRun: (why: string) => `telelean could not run the final check: ${why}`,
  reloadedDuringApply: (files: readonly string[]) =>
    `The editor reloaded while Apply was writing your files, and they match neither the session's base nor its final state (${files.join(', ')}): nothing was written again. Undo those edits in the editor, then Apply again.`,
  exiting: 'The session is already ending.',
};

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, k) => x === b[k]);

export abstract class EndRunner extends PremiseRunner {
  private driftTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly driftWatch: Disposable | undefined;
  /** Runs whose Exit is under way: Exit skips the host's run queue (AF14), so a double click sends two at once. */
  private readonly exiting = new WeakSet<ActiveRun>();

  constructor(o: RunManagerOptions) {
    super(o);
    // §3.9: the person's files changed (typing, a save, a file watcher's or git's event): drift is read again, debounced.
    try {
      this.driftWatch = o.workspace.onDidChange?.(() => this.scheduleDrift());
    } catch (e) {
      this.log('warn', `the drift watcher could not subscribe: ${errorText(e)}`);
    }
  }

  /** Stops the drift watcher (the manager's dispose). */
  protected disposeEnd(): void {
    if (this.driftTimer !== undefined) clearTimeout(this.driftTimer);
    this.driftTimer = undefined;
    this.driftWatch?.dispose();
  }

  // ---------------------------------------------------------------------------------------------
  // Drift (§3.9, ES-7)

  protected scheduleDrift(): void {
    if (this.disposed) return;
    if (this.driftTimer !== undefined) clearTimeout(this.driftTimer);
    this.driftTimer = setTimeout(() => {
      this.driftTimer = undefined;
      const run = this.run;
      if (run === undefined || run.p.session === undefined || !this.live(run) || run.p.session.phase === 'applying') return;
      void this.refreshDrift(run).catch((e: unknown) => this.log('warn', `drift could not be read: ${errorText(e)}`));
    }, DRIFT_DEBOUNCE_MS);
    this.driftTimer.unref?.();
  }

  /** The model files whose real text (open buffers first) differs from B, sorted; undefined with why when it cannot be read. */
  protected async driftNow(run: ActiveRun): Promise<{ files: string[] } | { error: string }> {
    const workspace = this.o.workspace;
    const readText = workspace.readText?.bind(workspace);
    if (readText === undefined) return { error: 'the workspace cannot read your files' };
    try {
      return { files: [...(await this.o.services.proposals.baseDrift(run.shadow, readText, workspace.modelFiles?.()))].sort() };
    } catch (e) {
      return { error: errorText(e) };
    }
  }

  /**
   * Inside the write queue: records `files` as the session's drift (with when it was first seen, AF9; absent while none
   * differs), one run.json write. True when it changed.
   */
  protected async recordDrift(run: ActiveRun, files: readonly string[]): Promise<boolean> {
    if (!this.live(run) || run.p.session === undefined) return false;
    const s = this.sessionOf(run);
    if (sameList(s.drift?.files ?? [], files)) return false;
    if (files.length === 0) delete s.drift;
    else s.drift = { files: [...files], at: s.drift?.at ?? this.iso() };
    s.viewVersion += 1;
    await this.save(run, SESSION_CHANGE);
    return true;
  }

  /** Reads the drift and records it through the write queue; the files (or why they could not be read). */
  protected async refreshDrift(run: ActiveRun): Promise<{ files: string[] } | { error: string }> {
    const drift = await this.driftNow(run);
    if (!('files' in drift) || !this.live(run)) return drift;
    const changed = await this.enqueueWrite(run, () => this.recordDrift(run, drift.files));
    // The view built while the write held the queue said `judging`: once nothing is queued, it is posted again.
    if (changed && !this.isJudging(run)) await this.save(run, SESSION_CHANGE);
    return drift;
  }

  // ---------------------------------------------------------------------------------------------
  // The final check (§3.10 steps 1-3, EN-2)

  /** §3.10 step 1: the end confirmation is open (2e's review.ts); its final check runs now, after Submit resolved. */
  protected override async openConfirmation(run: ActiveRun): Promise<ActionOutcome> {
    const out = await super.openConfirmation(run);
    const checkId = this.sessionOf(run).confirmation?.checkId;
    if (out.ok && checkId !== undefined) void this.runFinalCheck(run, checkId).catch((e: unknown) => this.log('error', `the final check failed: ${errorText(e)}`));
    return out;
  }

  /**
   * `engine.finalCheck` on exactly F, after drift is read again; its outcome is recorded in the write queue only while the
   * confirmation is still the one with `checkId` and running. A passed check keeps its judgement and F's model for Apply's
   * backstop (`SessionRuntime.final`), and its comparator passes for the next check (EN-2).
   */
  protected async runFinalCheck(run: ActiveRun, checkId: string): Promise<void> {
    const rt = this.runtimeOf(run);
    delete rt.final;
    // Drift is read again (it waits, in the write queue, for the write that opened the confirmation); the view that write
    // built said `judging`, so it is posted again once nothing is queued: "the check running" is what the person sees.
    await this.refreshDrift(run);
    if (!this.live(run)) return;
    if (!this.isJudging(run)) await this.save(run, SESSION_CHANGE);
    let report: FinalCheckReport | undefined;
    let error: string | undefined;
    try {
      const judgement = rt.judgement;
      report = await this.o.services.engine.finalCheck(this.stageContext(run), judgement !== null ? { judgement, comparator: { ...(rt.comparator ?? {}) } } : undefined);
    } catch (e) {
      error = errorText(e);
    }
    if (!this.live(run)) return;
    await this.enqueueWrite(run, async () => {
      const s = this.sessionOf(run);
      const c = s.confirmation;
      if (s.phase !== 'confirming' || c === undefined || c.checkId !== checkId || c.state !== 'running') return;
      const failures = (report?.failures ?? []).map((f) => ({ rule: f.rule, text: f.text, ...(f.items !== undefined ? { items: [...f.items] } : {}), ...(f.declaration !== undefined ? { declaration: f.declaration } : {}) }));
      if (report?.environment !== undefined) failures.unshift({ rule: 'build', text: END_TEXTS.checkCouldNotRun(report.environment) });
      if (error !== undefined) failures.push({ rule: 'build', text: END_TEXTS.checkCouldNotRun(error) });
      const passed = report?.passed === true && error === undefined && failures.length === 0;
      const next: PersistedSession = structuredClone(s);
      next.confirmation = { ...c, state: passed ? 'passed' : 'failed', failures, reusedFileChecks: report?.reusedFileChecks === true };
      next.viewVersion += 1;
      run.p.session = next;
      try {
        await this.persistChecked(run);
      } catch (e) {
        run.p.session = s;
        this.log('error', `the final check's outcome could not be saved: ${errorText(e)}`);
        return;
      }
      if (report?.comparator !== undefined) rt.comparator = { ...(rt.comparator ?? {}), ...report.comparator };
      if (passed && report !== undefined) rt.final = { checkId, judgement: report.judgement, ...(report.model !== undefined ? { model: report.model } : {}) };
    });
    if (!this.isJudging(run)) await this.save(run, SESSION_CHANGE);
  }

  /** The check runs again (its id unchanged: nothing changed): `running`, then the check (recovery, a passed check lost). */
  protected async checkAgain(run: ActiveRun): Promise<void> {
    const s = this.sessionOf(run);
    const c = s.confirmation;
    if (s.phase !== 'confirming' || c === undefined) return;
    if (c.state !== 'running') {
      const next: PersistedSession = structuredClone(s);
      next.confirmation = { ...c, state: 'running', failures: [] };
      next.viewVersion += 1;
      run.p.session = next;
      await this.save(run, SESSION_CHANGE);
    }
    void this.runFinalCheck(run, c.checkId).catch((e: unknown) => this.log('error', `the final check failed: ${errorText(e)}`));
  }

  // ---------------------------------------------------------------------------------------------
  // Back to review, Exit (§3.10 steps 3 and 6)

  protected async backNow(run: ActiveRun, stage: number | undefined): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return refused('refused', REVIEW_TEXTS.stepRunning);
    if (s.phase === 'applying') return refused('conflict', REVIEW_TEXTS.applyingNow);
    if (s.phase !== 'confirming' || stage !== s.stage) return refused('conflict', REVIEW_TEXTS.historyChanged);
    return this.enqueueWrite(run, async () => {
      // An Exit that came in meanwhile (it skips the queues, AF14) ended the session: nothing to go back to.
      if (!this.live(run)) return refused('conflict', 'This run has ended.');
      const now = this.sessionOf(run);
      if (now.phase !== 'confirming' || stage !== now.stage) return refused('conflict', REVIEW_TEXTS.historyChanged);
      // D2-54, EN-2 "with nothing changed": the submitted stage, unsubmitted; Submit made no seal, so the stack is as it was.
      const next: PersistedSession = structuredClone(now);
      next.phase = 'stage';
      delete next.confirmation;
      next.viewVersion += 1;
      run.p.session = next;
      try {
        await this.persistChecked(run);
      } catch (e) {
        run.p.session = now;
        return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
      }
      delete this.runtimeOf(run).final;
      return okOutcome(REVIEW_TEXTS.backToReview);
    });
  }

  /**
   * ES-8, EN-4: Exit, in any phase but `applying` (refused: Apply ends the session itself). A running or interrupted step
   * stops as Cancel step stops it (Claude's process, its Lean jobs) and gets its attempt record; every step's record is
   * written with resolution discarded (D2-11); the run ends `discarded`; ws/ is dropped with the run, the files untouched.
   */
  protected async exitNow(run: ActiveRun): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    if (s.phase === 'applying') return refused('conflict', REVIEW_TEXTS.applyingNow);
    // A second Exit while the first runs would write every step's attempt record twice.
    if (this.exiting.has(run)) return refused('conflict', END_TEXTS.exiting);
    this.exiting.add(run);
    try {
      return await this.exitSession(run, s);
    } finally {
      this.exiting.delete(run);
    }
  }

  private async exitSession(run: ActiveRun, s: PersistedSession): Promise<ActionOutcome> {
    run.stopping = true;
    this.stopClock(run);
    run.abort.abort();
    if (run.ask !== undefined) {
      const ask = run.ask;
      run.ask = undefined;
      ask.reject(new Error('the session was exited'));
    }
    try {
      await run.session?.interrupt();
    } catch {
      // the process may be gone already
    }
    try {
      await (this.o.services.cancelLean ?? leanCancelRun)(run.runId);
    } catch (e) {
      this.log('warn', `the session's Lean jobs could not be cancelled: ${errorText(e)}`);
    }
    if (this.disposed || run !== this.run || run.ended) return refused('conflict', 'This run has ended.');
    const step = this.activeStep(s);
    if (step !== undefined) this.closeStep(run, step, 'cancelled', 'cancelled');
    delete run.p.undeliveredTurn;
    await this.writeSessionAttempts(run, 'discarded');
    this.notice(run, 'info', 'info', REVIEW_TEXTS.exited);
    await this.endRun(run, 'discarded');
    return okOutcome('Session ended');
  }

  // ---------------------------------------------------------------------------------------------
  // Apply (§3.10 step 4)

  /** G1: Claude's arrows Apply writes: each accepted Add arrow, and each accepted Add premise's arrow, with its step. */
  protected provenanceOf(s: PersistedSession): ArrowProvenance[] {
    const out: ArrowProvenance[] = [];
    for (const r of s.items) {
      if (r.status !== 'accepted') continue;
      const arrow = r.content.arrow;
      if (r.kind === 'add-arrow' && arrow !== undefined) {
        const entry = s.ledger.find((e) => e.kind === 'arrow' && e.source === arrow.source && e.target === arrow.target);
        out.push({ source: arrow.source, target: arrow.target, step: entry?.kind === 'arrow' ? entry.step : r.origin.step, kind: 'arrow' });
      }
      if (r.kind === 'add-premise' && r.card !== undefined) {
        const draft = s.premises.find((d) => premiseKey(d.target, d.leanName) === r.key) ?? r.content.premise;
        out.push({ source: r.card, target: draft?.target ?? r.origin.target, step: draft?.step ?? r.origin.step, kind: 'premise' });
      }
    }
    return out;
  }

  /**
   * EN-3, D2-18: the subject's endorsements after Apply: each declaration of an accepted definition, instance, coercion
   * or presupposition item (the end confirmation's "you endorse" list) with `endorsementHash` of its text in F (as the
   * build hashes it: the vocabulary's code, else the item's text), merged into the file's entries (same name: replaced).
   */
  protected endorsementsChange(run: ActiveRun, s: PersistedSession, final: ProjectModel, before: string | null): FileChange | undefined {
    const subject = run.p.view.subject;
    const date = this.iso();
    const fresh: Endorsement[] = [];
    for (const r of s.items) {
      if (r.status !== 'accepted' || r.kind !== 'declaration' || r.declKind === undefined || r.declKind === 'vocabulary-change') continue;
      for (const d of r.content.decls) {
        const code = final.vocabulary.find((v) => v.name === d.name)?.code ?? d.text;
        fresh.push({ name: d.name, textHash: endorsementHash(code), run: run.runId, date });
      }
    }
    if (fresh.length === 0) return undefined;
    const names = new Set(fresh.map((e) => e.name));
    const kept = before !== null ? parseEndorsements(before).endorsed.filter((e) => !names.has(e.name)) : [];
    const after = serializeEndorsements({ format: 'telelean-endorsements', version: 1, endorsed: [...kept, ...fresh] });
    return before === after ? undefined : { path: endorsementsPath(subject), before, after };
  }

  /** D2-33: the subject's layout with the positions of the cards moved on the Proposed view that F has as propositions. */
  protected layoutChange(run: ActiveRun, s: PersistedSession, final: ProjectModel, before: string | null): FileChange | undefined {
    const subject = run.p.view.subject;
    const moved = Object.entries(s.positions ?? {}).filter(([id]) => {
      const node = final.nodes.get(id)?.node;
      return node !== undefined && node.subject === subject && node.type === 'PROPOSITION';
    });
    if (moved.length === 0) return undefined;
    const layout = parseLayout(before);
    const positions: Record<string, CanvasPosition> = { ...(layout.positions ?? {}) };
    for (const [id, p] of moved) positions[id] = { x: p.x, y: p.y };
    const after = serializeLayout({ ...layout, positions });
    return before === after ? undefined : { path: layoutPath(subject), before, after };
  }

  protected async applyNow(run: ActiveRun, stage: number | undefined, check: string | undefined): Promise<ActionOutcome> {
    const early = this.applyRefusal(run, stage, check);
    if (early !== undefined) return early;
    // AF3: Apply waits until no judge runs and the write queue is empty, then is its last write.
    return this.asLastWrite(run, () => this.applyInQueue(run, stage, check));
  }

  /** Why Apply is refused now (the end confirmation's gate, the request's stage and check id), or undefined. */
  protected applyRefusal(run: ActiveRun, stage: number | undefined, check: string | undefined): ActionOutcome | undefined {
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return refused('refused', REVIEW_TEXTS.stepRunning);
    if (s.phase === 'applying') return refused('conflict', REVIEW_TEXTS.applyingNow);
    const c = s.confirmation;
    if (s.phase !== 'confirming' || c === undefined) return refused('conflict', END_TEXTS.noConfirmation);
    if (stage !== s.stage || check !== c.checkId) return refused('conflict', REVIEW_TEXTS.historyChanged);
    if (c.state === 'running') return refused('conflict', REVIEW_TEXTS.applyWaitsForCheck);
    if (c.state === 'failed') return refused('refused', REVIEW_TEXTS.applyCheckFailed);
    return undefined;
  }

  protected async applyInQueue(run: ActiveRun, stage: number | undefined, check: string | undefined): Promise<ActionOutcome> {
    // An Exit that came in while Apply waited (it skips the queues, AF14) ended the session: nothing is applied.
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    const again = this.applyRefusal(run, stage, check);
    if (again !== undefined) return again;
    const s = this.sessionOf(run);
    const c = s.confirmation as NonNullable<PersistedSession['confirmation']>;
    const rt = this.runtimeOf(run);
    const shadow = run.shadow;
    const workspace = this.o.workspace;
    const readReal = workspace.readText?.bind(workspace);
    if (readReal === undefined || workspace.applyChanges === undefined) return refused('not-yet', 'This workspace cannot apply proposals.');
    // The check passed for the same id: no status or ws/ change since (its id again, from the head and the records now).
    const finalFiles = await shadow.filesAt(s.head);
    const key = filesKey(finalFiles);
    if (key !== c.filesKey || confirmationCheckId(s, key) !== c.checkId) return refused('conflict', REVIEW_TEXTS.historyChanged);
    const final = rt.final;
    if (final === undefined || final.checkId !== c.checkId || final.model === undefined) {
      // The passed check's judgement is not at hand (a reload): it runs again, and Apply waits for it.
      void this.checkAgain(run);
      return refused('conflict', REVIEW_TEXTS.applyWaitsForCheck);
    }
    // ES-7: drift read again, right before Apply.
    const drift = await this.driftNow(run);
    if ('error' in drift) return refused('internal', END_TEXTS.driftUnknown(drift.error));
    await this.recordDrift(run, drift.files);
    if (drift.files.length > 0) return refused('conflict', REVIEW_TEXTS.drift(drift.files));
    // The backstop again (§14.5, §4.10): pure, on exactly what passed, never reused.
    const base = await this.loadBaseModel(run);
    const backstop = this.core.applyBackstop({ base, final: final.model, items: s.items, ledger: s.ledger, inferences: s.inferences, judgement: final.judgement });
    if (!backstop.ok) {
      const next: PersistedSession = structuredClone(s);
      next.confirmation = {
        ...c,
        state: 'failed',
        failures: backstop.refusals.map((b) => ({ rule: 'backstop' as const, text: b.text, ...(b.item !== undefined ? { items: [b.item] } : {}), ...(b.name !== undefined ? { declaration: b.name } : {}) })),
      };
      next.viewVersion += 1;
      run.p.session = next;
      await this.save(run, SESSION_CHANGE);
      delete rt.final;
      return refused('refused', REVIEW_TEXTS.applyCheckFailed);
    }
    // Checked again with no await before the phase changes: an Exit either came first (Apply stops here) or meets
    // `applying` (Exit is refused).
    if (!this.live(run)) return refused('conflict', 'This run has ended.');
    // §3.10 step 7: from here a reload compares the real files with F and B.
    const applying: PersistedSession = structuredClone(s);
    applying.phase = 'applying';
    applying.viewVersion += 1;
    run.p.session = applying;
    try {
      await this.persistChecked(run);
    } catch (e) {
      run.p.session = s;
      return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
    }
    const backToConfirming = async (driftFiles?: readonly string[]): Promise<void> => {
      const now = this.sessionOf(run);
      const next: PersistedSession = structuredClone(now);
      next.phase = 'confirming';
      if (driftFiles !== undefined && driftFiles.length > 0) next.drift = { files: [...driftFiles], at: now.drift?.at ?? this.iso() };
      next.viewVersion += 1;
      run.p.session = next;
      await this.save(run, SESSION_CHANGE);
    };
    const accepted = s.items.filter((r) => r.status === 'accepted');
    const arrows = this.provenanceOf(s);
    let outcome: ActionOutcome;
    let changedFiles = false;
    if (accepted.length === 0) {
      // D2-39: nothing accepted, so nothing is applied: no file change, no history entry, no Undo step.
      outcome = okOutcome(END_TEXTS.recorded);
    } else {
      const subject = run.p.view.subject;
      const model = final.model;
      const targets = s.inferences.map((i) => sentenceShort(model.nodes.get(i.target)?.node.naturalName ?? i.target));
      let plan;
      try {
        plan = await this.o.services.proposals.planApply({
          shadow,
          readReal,
          finalState: finalFiles,
          targets,
          nodes: s.inferences.map((i) => i.target),
          ...(workspace.modelFiles !== undefined ? { realFiles: workspace.modelFiles() } : {}),
        });
      } catch (e) {
        await backToConfirming();
        return refused('internal', `Apply failed: ${errorText(e)}`);
      }
      if (!plan.ok) {
        // planApply's own read is authoritative (ES-7): files that differ from B now refuse it, nothing applied.
        await backToConfirming(plan.files);
        return refused(plan.code, plan.error);
      }
      const sidecars: FileChange[] = [];
      try {
        const endorsed = this.endorsementsChange(run, s, model, await readReal(endorsementsPath(subject)));
        if (endorsed !== undefined) sidecars.push(endorsed);
        const layout = this.layoutChange(run, s, model, await readReal(layoutPath(subject)));
        if (layout !== undefined) sidecars.push(layout);
      } catch (e) {
        await backToConfirming();
        return refused('internal', `Apply failed: ${errorText(e)}`);
      }
      outcome = await this.o.services.proposals.apply({ ...plan, changes: [...plan.changes, ...sidecars], ...(arrows.length > 0 ? { arrows } : {}) }, workspace, subject);
      if (!outcome.ok) {
        await backToConfirming();
        return outcome;
      }
      changedFiles = outcome.undoable;
    }
    return this.finishApplied(run, arrows, changedFiles, outcome);
  }

  /** The end of a successful Apply (also after a reload found F in the files): the records, the notice, the run ends `accepted`. */
  protected async finishApplied(run: ActiveRun, arrows: readonly ArrowProvenance[], changedFiles: boolean, outcome: ActionOutcome): Promise<ActionOutcome> {
    await this.writeSessionAttempts(run, 'accepted', arrows);
    run.view.accepted = { changedFiles };
    this.notice(run, 'info', 'info', changedFiles ? REVIEW_TEXTS.applied : END_TEXTS.recorded);
    await this.endRun(run, 'accepted');
    return outcome.ok ? { ...outcome, ...(changedFiles ? {} : { label: END_TEXTS.recorded, undoable: false }) } : outcome;
  }

  // ---------------------------------------------------------------------------------------------
  // Moves (D2-33)

  protected async moveNow(run: ActiveRun, positions: Readonly<Record<string, CanvasPosition>>): Promise<ActionOutcome> {
    const entries = Object.entries(positions);
    if (entries.length === 0) return refused('invalid', 'Choose the cards to move.');
    const early = this.reviewRefusal(run);
    if (early !== undefined) return early;
    const rt = this.runtimeOf(run);
    const model = rt.judgedModel?.model ?? rt.baseModel;
    const subject = run.p.view.subject;
    for (const [id, p] of entries) {
      const node = model?.nodes.get(id)?.node;
      if (id === '__proto__' || node === undefined || node.subject !== subject) return refused('not-found', `No card "${id}" on the Proposed view.`);
      if (node.type !== 'PROPOSITION') return refused('invalid', 'Only propositions have a place on the canvas: the axioms keep their column order.');
      if (typeof p !== 'object' || p === null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return refused('invalid', `The position of "${id}" is not a pair of numbers.`);
    }
    const after = Object.fromEntries(entries.map(([id, p]) => [id, { x: p.x, y: p.y }]));
    // `before` is read again inside the write queue (review.ts carryOut): the positions as they are when the write starts.
    return this.reviewNow(run, { kind: 'move', before: {}, after });
  }

  // ---------------------------------------------------------------------------------------------
  // Recovery (§3.10 step 7, §3.11)

  protected override async recoverSession(run: ActiveRun): Promise<void> {
    await super.recoverSession(run);
    if (this.disposed || run !== this.run || run.ended || run.p.session === undefined) return;
    const s = this.sessionOf(run);
    if (s.phase === 'applying') await this.recoverApply(run);
    else if (s.phase === 'confirming' && s.confirmation !== undefined && s.confirmation.state !== 'failed') await this.checkAgain(run);
    if (this.live(run) && run.p.session !== undefined) void this.refreshDrift(run).catch((e: unknown) => this.log('warn', `drift could not be read: ${errorText(e)}`));
  }

  /**
   * §3.10 step 7: a reload during Apply. The real model files equal F: Apply finished, so it ends as applied (the records,
   * the run `accepted`); they equal B: nothing was written, back to confirming, the check again; anything else: a notice,
   * the drift, back to confirming. Nothing is applied again blindly.
   */
  protected async recoverApply(run: ActiveRun): Promise<void> {
    const s = this.sessionOf(run);
    const shadow = run.shadow;
    const library = run.p.library;
    const readReal = this.o.workspace.readText?.bind(this.o.workspace);
    const [final, base] = await Promise.all([shadow.filesAt(s.head), shadow.baseFiles()]);
    const keep = (files: ReadonlyMap<string, string>) => new Map([...files].filter(([rel]) => isModelOrProjectFile(rel, library)));
    const f = keep(final);
    const b = keep(base);
    const paths = new Set([...f.keys(), ...b.keys(), ...(this.o.workspace.modelFiles?.() ?? []).filter((rel) => isModelOrProjectFile(rel, library))]);
    const real = new Map<string, string | null>();
    for (const rel of paths) real.set(rel, readReal !== undefined ? await readReal(rel).catch(() => null) : null);
    const equals = (files: ReadonlyMap<string, string>) => [...paths].every((rel) => (real.get(rel) ?? null) === (files.get(rel) ?? null));
    if (equals(f)) {
      await this.finishApplied(run, this.provenanceOf(s), !equals(b), okOutcome(REVIEW_TEXTS.applied));
      return;
    }
    const next: PersistedSession = structuredClone(s);
    next.phase = 'confirming';
    if (!equals(b)) {
      const differ = [...paths].filter((rel) => (real.get(rel) ?? null) !== (b.get(rel) ?? null)).sort();
      next.drift = { files: differ, at: s.drift?.at ?? this.iso() };
      this.notice(run, 'environment', 'warning', END_TEXTS.reloadedDuringApply(differ));
    }
    if (next.confirmation !== undefined) next.confirmation = { ...next.confirmation, state: 'running', failures: [] };
    next.viewVersion += 1;
    run.p.session = next;
    await this.save(run, SESSION_CHANGE);
    if (next.confirmation !== undefined) void this.runFinalCheck(run, next.confirmation.checkId).catch((e: unknown) => this.log('error', `the final check failed: ${errorText(e)}`));
  }

  // ---------------------------------------------------------------------------------------------
  // Endorsements of the session's subject, the board's build input (§2.9's note on `maskedModel`)

  protected async loadEndorsements(run: ActiveRun): Promise<void> {
    const subject = run.p.view.subject;
    try {
      const text = (await this.o.workspace.readText?.(endorsementsPath(subject))) ?? null;
      this.runtimeOf(run).endorsements = text !== null ? { [subject]: parseEndorsements(text).endorsed.map((e) => ({ name: e.name, textHash: e.textHash })) } : {};
    } catch (e) {
      this.log('warn', `the endorsements could not be read: ${errorText(e)}`);
    }
  }

  protected override viewEndorsements(run: ActiveRun): { endorsements?: Record<string, Array<{ name: string; textHash: string }>> } {
    const endorsements = run.live?.endorsements;
    return endorsements !== undefined && Object.keys(endorsements).length > 0 ? { endorsements } : {};
  }

  /** B's model, and once per run the session subject's endorsements (the board's build input), read with it. */
  protected override async loadBaseModel(run: ActiveRun): Promise<ProjectModel> {
    const model = await super.loadBaseModel(run);
    if (run.live?.endorsements === undefined) await this.loadEndorsements(run);
    return model;
  }
}
