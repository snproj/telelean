/**
 * Slice 2f (docs/slice2-plan.md 1.1's 2f, 2.6, 2.9, 3.8): an edit session's Add premise items once accepted, on top of
 * the review actions (review.ts):
 *
 *   due writes   (D2-71, AF2) follow from the records. A premise write is due for an accepted Add premise with no ledger
 *                `premise` entry; a completion for an accepted, written one whose target has no proof (a theorem
 *                `.holds`) at the head, with no ledger `completion` entry for it and no "completion not checked" marker on
 *                the target's Result. The action that makes one due enqueues it: an Accept (or an Undo or Redo that accepts
 *                a premise again) its premise write, which runs the completion in the same slot of the write queue, ahead
 *                of any write queued meanwhile, so the completion starts from the `adopt` commit; `recover()` enqueues every
 *                one still due, completions first. Each checks at its step 1 that it is still due, else does nothing.
 *   the premise write   four writes (§2.6): run.json `inFlight`; the card in Claude's words, its arrow into the target and
 *                the removal of the target's "follows from nothing" mark (core `planGhostAdoption`, with the Accept's
 *                `holdAs` and Why read from the record, never a default); `engine.writePremise` (normalise, build, render
 *                P where it was written, the `adopt` commit, its judgement); the records: the ledger's `premise` (and
 *                `mark-removed`) entries, the record's card, the written item's key (from that judgement) as its
 *                `fingerprint` and `accepted.fingerprint` with the draft's key kept in `versions` (same rev), `head`.
 *                A meaning mismatch takes the write back out (ws/ to the write's parent) and returns the item to review,
 *                marked "meaning differs in place"; any other failure (a Lean environment failure, a failed probe,
 *                AP30-4; a failed run.json write) takes it back out too, the item staying accepted and its write due, with
 *                the stage problem "“‹item›” was accepted, but telelean could not write it: ‹error›. …" until a reload
 *   the completion   `theorem T.holds : T := (<checked gap proof>) P.holds` (in place of a pending `axiom T.holds`, or
 *                right after T's statement), `engine.complete` (a new freeze from the state it is written on, gate-proved,
 *                the comparator, the `completion` commit); the records: the ledger's `completion` entry, `head`. A failure
 *                takes it back out (a `revert` commit: the head it was written on), marks T's Result "completion not
 *                checked" with Lean's message (an event), and offers Retry step: a `submit` step for T with its proof
 *                open, put in `retry` (D2-56, F15), with a heading when the stage has none
 *   after each   a judge, requested inside the write so the session never reads idle in between (AF3), whose judge-apply
 *                records the stage judgement of the new head and reconciles it (§3.5: T's Result "updated" once a
 *                completion proved it; a premise sent back to review takes its accepted dependents with it, RV-5)
 *
 * Taking a written premise out is the review writes' (review.ts `planItemWrite`, 2e) and the judge's (`judgeApply`): a
 * premise in review is outside ws/ (§3.1), but for an adopted ghost of a converted v1 run (AF12).
 */
import {
  applyLeanOps,
  applyTextEdits,
  fallbackLabel,
  findDecl,
  holdsName,
  parseLeanFile,
  premiseKey,
  proofKey,
  relativeName,
  REVIEW_TEXTS,
  sessionLabels,
  type FileChange,
  type ItemMarker,
  type ItemRecord,
  type LedgerEntry,
  type PremiseDraft,
  type ProjectModel,
  type ReviewOutcome,
} from '@telelean/core';

import type { CheckContext, CompletionReport, FreezeRecord, PremiseWriteReport } from '../gate/types.js';
import { ReviewRunner } from './review.js';
import { filesModel } from './session.js';
import { errorText, type ActiveRun } from './step.js';
import type { PersistedSession, PersistedStep } from './types.js';

type ReviewOk = Extract<ReviewOutcome, { ok: true }>;
type PremiseEntry = Extract<LedgerEntry, { kind: 'premise' }>;
/** A write's step 1 publishes nothing (the in-memory session changes only at steps 1 and 4, AF11). */
const NO_PUBLISH = { run: false, proposal: false, session: false } as const;
const SESSION_CHANGE = { run: true, proposal: false, session: true } as const;
/** The label of the `revert` commit that takes a premise write back out. */
const TAKEN_BACK = 'The premise could not be written: back to the session head';

/** The ledger `premise` entry of an Add premise item's key: it is written (§3.8). */
export function premiseEntryOf(ledger: readonly LedgerEntry[], key: string): PremiseEntry | undefined {
  return ledger.find((e): e is PremiseEntry => e.kind === 'premise' && e.item === key);
}

/** The target's block holds a "follows from nothing" mark (`follows_from:`) in these files. */
function marked(files: ReadonlyMap<string, string>, library: string, target: string): boolean {
  const model = filesModel(files, library);
  const block = model.nodes.get(target)?.block;
  return block !== undefined && block.lines.some((line) => line.key === 'follows_from');
}

function withChanges(files: ReadonlyMap<string, string>, changes: readonly FileChange[]): Map<string, string> {
  const out = new Map(files);
  for (const c of changes) {
    if (c.after === null) out.delete(c.path);
    else out.set(c.path, c.after);
  }
  return out;
}

/**
 * §3.8: the completion of `target` from the written premise card `card`: `theorem T.holds : T := (<proof>) P.holds`,
 * written as T's names read in T's namespace (as `add-holds-axiom` writes T's pending claim), in place of T's `.holds`
 * (a pending `axiom T.holds`), or right after T's statement when T has none; P's `.holds` fully qualified. The gap
 * proof is Claude's checked term (`PremiseDraft.proof`, a proof of P → T), its later lines indented. Throws when T or P
 * is bound to no Lean statement, or when the text cannot be placed.
 */
export function completionChanges(model: ProjectModel, target: string, card: string, proof: string): FileChange[] {
  const t = model.nodes.get(target);
  const statement = t?.statementDecl;
  const full = statement?.decl.fullName;
  if (t === undefined || statement === undefined || full === undefined) throw new Error(`“${target}” is bound to no Lean statement`);
  const premise = model.nodes.get(card)?.node.lean.statement;
  if (premise === undefined) throw new Error(`the premise card ${card} is bound to no Lean statement`);
  const holds = holdsName(full);
  const placeIn = t.holdsDecl?.file ?? statement.file;
  const file = model.files.get(placeIn);
  if (file === undefined) throw new Error(`telelean could not read ${placeIn}`);
  let text = file.text;
  if (findDecl(file, holds) === undefined) {
    const added = applyLeanOps(file, [{ op: 'add-holds-axiom', statement: full }]);
    if (added.problems.length > 0) throw new Error(added.problems.join(' '));
    text = applyTextEdits(text, added.edits);
  }
  const parsed = parseLeanFile(placeIn, text);
  const decl = findDecl(parsed, holds);
  if (decl === undefined) throw new Error(`telelean could not place ${holds}`);
  const short = relativeName(full, decl.namespace);
  const body = proof.split(/\r?\n/u).map((line, k) => (k === 0 ? line : `  ${line}`)).join(parsed.eol);
  const theorem = `theorem ${short}.holds : ${short} :=${parsed.eol}  (${body}) ${holdsName(premise)}`;
  const replaced = applyLeanOps(parsed, [{ op: 'replace-decl', name: holds, text: theorem }]);
  if (replaced.problems.length > 0) throw new Error(replaced.problems.join(' '));
  return [{ path: placeIn, before: file.text, after: applyTextEdits(text, replaced.edits) }];
}

function addMarker(r: ItemRecord, marker: ItemMarker): void {
  if (!r.markers.includes(marker)) r.markers = [...r.markers, marker];
}

/** The text of a premise write that could not be made, and why (§3.8). Runner text (reported; no core text). */
export const PREMISE_MEANING_EVENT = 'telelean wrote it, but its meaning differs where it was written, so it is back in review:';
/** A completion that did not pass (§3.8, D2-56): its Result reads "completion not checked". Runner text (reported). */
export const completionFailedEvent = (target: string, message: string): string =>
  `telelean's completion of “${target}” did not pass its checks, so its result reads "completion not checked" (Retry step asks Claude to prove it): ${message}`;
/** The heading of a stage whose completion did not pass, with Retry step (REVIEW_TEXTS.stepFailed's ‹reason›). Runner text. */
export const completionFailedHeading = (target: string): string => `telelean's completion of “${target}” did not pass its checks`;

export abstract class PremiseRunner extends ReviewRunner {
  // ---------------------------------------------------------------------------------------------
  // What is due (D2-71)

  /** The record of an Add premise item whose premise write is due: accepted, not written (no card, no ledger entry). */
  protected premiseDue(s: PersistedSession, id: string): ItemRecord | undefined {
    if (s.phase !== 'stage') return undefined;
    const r = s.items.find((x) => x.id === id);
    if (r?.kind !== 'add-premise' || r.status !== 'accepted' || r.card !== undefined) return undefined;
    return premiseEntryOf(s.ledger, r.key) === undefined ? r : undefined;
  }

  /**
   * The record of an Add premise item whose completion is due: accepted and written (its ledger entry, its card at the
   * head), its target not proved at the head (no theorem `.holds`), no ledger `completion` entry for it, and no
   * "completion not checked" marker on the target's Result (a failed completion waits for Retry step, D2-56).
   */
  protected completionDue(s: PersistedSession, id: string, head: ProjectModel): ItemRecord | undefined {
    if (s.phase !== 'stage') return undefined;
    const r = s.items.find((x) => x.id === id);
    if (r?.kind !== 'add-premise' || r.status !== 'accepted') return undefined;
    const entry = premiseEntryOf(s.ledger, r.key);
    if (entry === undefined || head.nodes.get(entry.card) === undefined) return undefined;
    if (s.ledger.some((e) => e.kind === 'completion' && e.item === r.key)) return undefined;
    if (s.items.find((x) => x.key === proofKey(entry.target))?.markers.includes('completion-not-checked') === true) return undefined;
    return head.nodes.get(entry.target)?.node.lean.justificationKind === 'theorem' ? undefined : r;
  }

  /** The draft of an Add premise record: the session's (by its key), else the one its record holds as content. */
  protected premiseDraftOf(s: PersistedSession, r: ItemRecord): PremiseDraft | undefined {
    return s.premises.find((d) => premiseKey(d.target, d.leanName) === r.key) ?? r.content.premise;
  }

  /** The newest freeze of the target's own steps (`engine.complete` freezes again after checking against it). */
  protected lastFreezeOf(s: PersistedSession, target: string): FreezeRecord | undefined {
    return [...s.steps].reverse().find((x) => x.target === target && x.freezes.length > 0)?.freezes.at(-1);
  }

  /** An item's label as the view names it (the reducer's fallback when there is no view). */
  protected premiseLabel(run: ActiveRun, r: ItemRecord): string {
    const view = this.runtimeOf(run).view;
    const labels = view !== null ? sessionLabels(view) : {};
    return Object.hasOwn(labels, r.id) ? (labels[r.id] ?? fallbackLabel(r)) : fallbackLabel(r);
  }

  /** The check context of a premise write or a completion: the stage's, with the ledger entries the write adds (commit ''). */
  protected premiseContext(run: ActiveRun, ledger: readonly LedgerEntry[], freeze?: FreezeRecord): CheckContext {
    const ctx = this.stageContext(run);
    const session = ctx.session;
    if (session === undefined) throw new Error('the stage context has no session');
    return { ...ctx, session: { ...session, ledger }, ...(freeze !== undefined ? { freeze } : {}) };
  }

  // ---------------------------------------------------------------------------------------------
  // Enqueueing (the action that makes one due; recovery)

  /**
   * §3.8: after a review write, inside the write queue, the Add premises it accepted (`ItemWrite.premises.write`, and an
   * already written one accepted now, whose completion may be due) get their job after it in the queue.
   */
  protected override afterReviewWrite(run: ActiveRun, before: PersistedSession, out: ReviewOk): void {
    const was = new Map(before.items.map((r) => [r.id, r.status]));
    const accepted = out.items.filter((r) => r.kind === 'add-premise' && r.status === 'accepted' && was.get(r.id) !== 'accepted').map((r) => r.id);
    const ids = [...new Set([...(out.write?.premises.write ?? []), ...accepted])];
    for (const id of ids) this.enqueuePremiseJob(run, id);
  }

  /** §3.11 (D2-71): recovery enqueues every premise job that may be due, completions first (the written ones). */
  protected override enqueueDueWrites(run: ActiveRun): void {
    const s = this.sessionOf(run);
    const accepted = s.items.filter((r) => r.kind === 'add-premise' && r.status === 'accepted');
    const written = accepted.filter((r) => premiseEntryOf(s.ledger, r.key) !== undefined);
    const unwritten = accepted.filter((r) => premiseEntryOf(s.ledger, r.key) === undefined);
    for (const r of [...written, ...unwritten]) this.enqueuePremiseJob(run, r.id);
  }

  protected enqueuePremiseJob(run: ActiveRun, id: string): void {
    void this.enqueueWrite(run, () => this.premiseJob(run, id))
      .catch((e: unknown) => this.log('error', `a premise write failed: ${errorText(e)}`))
      // The view built while the job held the queue said `judging`: once nothing is queued or judged, it is posted again.
      .then(() => (this.live(run) && run.p.session !== undefined && !this.isJudging(run) ? this.save(run, SESSION_CHANGE) : undefined));
  }

  /**
   * One slot of the write queue: the premise write when it is due, then its completion when that is due (so it starts
   * from the `adopt` commit, ahead of any write queued meanwhile); then a judge when the head moved (§3.6).
   */
  protected async premiseJob(run: ActiveRun, id: string): Promise<void> {
    if (!this.live(run) || run.p.session === undefined) return;
    const before = this.sessionOf(run).head;
    try {
      const wrote = await this.premiseWrite(run, id);
      if ((wrote === 'written' || wrote === 'not-due') && this.live(run)) await this.completionWrite(run, id);
    } finally {
      if (this.live(run) && run.p.session !== undefined && this.sessionOf(run).head !== before) this.requestJudge(run);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The premise write (§3.8, F11)

  protected writeProblem(run: ActiveRun, id: string, text: string | undefined): void {
    const rt = this.runtimeOf(run);
    rt.writeProblems ??= new Map();
    if (text === undefined) rt.writeProblems.delete(id);
    else rt.writeProblems.set(id, text);
  }

  /** §3.8: a premise write that could not be made names its item while it stays accepted and unwritten (SessionView.problems). */
  protected override stageProblems(run: ActiveRun, s: PersistedSession): Array<{ text: string; items: string[] }> {
    const problems = this.runtimeOf(run).writeProblems;
    if (problems === undefined || problems.size === 0) return [];
    const out: Array<{ text: string; items: string[] }> = [];
    for (const [id, text] of problems) {
      const r = s.items.find((x) => x.id === id);
      if (r?.kind === 'add-premise' && r.status === 'accepted' && premiseEntryOf(s.ledger, r.key) === undefined) out.push({ text, items: [id] });
    }
    return out;
  }

  protected async premiseWrite(run: ActiveRun, id: string): Promise<'not-due' | 'written' | 'mismatch' | 'failed'> {
    const s = this.sessionOf(run);
    const r = this.premiseDue(s, id);
    if (r === undefined) return 'not-due';
    const label = this.premiseLabel(run, r);
    const shadow = run.shadow;
    const library = run.p.library;
    const parent = s.head;
    // The stage problem first, so the view that the write's last run.json write publishes holds it.
    const failed = async (error: string, takeBack: boolean): Promise<'failed'> => {
      if (!this.live(run)) return 'failed';
      this.writeProblem(run, id, REVIEW_TEXTS.premiseWriteFailed(label, error));
      if (takeBack) await this.takeBack(run, id, parent, TAKEN_BACK, () => undefined);
      else await this.save(run, SESSION_CHANGE);
      return 'failed';
    };
    const draft = this.premiseDraftOf(s, r);
    const holdAs = r.accepted?.holdAs;
    if (draft === undefined) return failed('telelean has no draft of it', false);
    // §3.8: the hold-as choice and the Why come from the Accept's record, never a default.
    if (holdAs === undefined) return failed('its Accept recorded no choice of how you hold it', false);
    let plan: { changes: FileChange[]; nodeId: string; leanName: string };
    let headFiles: Map<string, string>;
    try {
      headFiles = await shadow.filesAt(parent);
      plan = this.core.planGhostAdoption(filesModel(headFiles, library), {
        subject: run.p.view.subject,
        target: draft.target,
        naturalName: draft.naturalName,
        leanStatement: draft.leanStatement,
        leanName: draft.leanName,
        ...(r.accepted?.rationale !== undefined && r.accepted.rationale.trim() !== '' ? { rationale: r.accepted.rationale.trim() } : {}),
        session: run.runId,
        today: this.today(),
        holdAs,
      });
    } catch (e) {
      return failed(errorText(e), false);
    }
    const removesMark = marked(headFiles, library, draft.target) && !marked(withChanges(headFiles, plan.changes), library, draft.target);
    const entries: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: draft.target, holdAs, item: r.key, commit: '' },
      ...(removesMark && !s.ledger.some((e) => e.kind === 'mark-removed' && e.card === draft.target) ? [{ kind: 'mark-removed' as const, card: draft.target, item: r.key, commit: '' }] : []),
    ];
    // T already proved (a theorem `.holds` at the head): the premise is written, unused (§3.8), and no completion follows.
    const proved = filesModel(headFiles, library).nodes.get(draft.target)?.node.lean.justificationKind === 'theorem';

    // Step 1: the write in flight.
    s.inFlight = { action: { kind: 'premise', item: id }, parent };
    try {
      await this.persistChecked(run, NO_PUBLISH);
    } catch (e) {
      delete s.inFlight;
      return failed(REVIEW_TEXTS.saveFailed(errorText(e)), false);
    }
    // Step 2: the files.
    let report: PremiseWriteReport;
    try {
      await shadow.writeFiles(plan.changes);
      // Step 3: the Lean job, whose `adopt` commit is the write's commit (none when it fails).
      report = await this.o.services.engine.writePremise(this.premiseContext(run, [...s.ledger, ...entries]), { item: r.key, draft, card: plan.nodeId });
    } catch (e) {
      report = { ok: false, error: errorText(e) };
    }
    // Exit stops the run's Lean jobs before it ends the run (`stopping`): a job that failed that way is no failure to record (F-F1).
    if (!this.live(run)) return 'failed';
    if (!report.ok) return failed(report.error, true);
    const written = report.judgement.drafts.find((d) => d.key === r.key);
    if (!report.meaningMatches) {
      this.writeProblem(run, id, undefined);
      await this.takeBack(run, id, parent, 'The premise means something else where it was written: taken back out', (next) => {
        const rec = next.items.find((x) => x.id === id);
        if (rec === undefined) return;
        rec.status = 'in-review';
        delete rec.accepted;
        addMarker(rec, 'meaning-differs-in-place');
        const at = this.iso();
        const lastId = next.events.at(-1)?.id ?? 0;
        next.events = [...next.events, { id: lastId + 1, at, text: PREMISE_MEANING_EVENT, items: [id] }].slice(-50);
      });
      return 'mismatch';
    }
    // AP30-4: never a partial key (a `factsMissing` draft's key lacks its constants): the write could not be judged.
    if (written === undefined || written.factsMissing === true) return failed('telelean could not read the written premise back', true);
    // Step 4: the records, with `head` the `adopt` commit and `inFlight` cleared.
    const commit = report.judgement.commit;
    const next: PersistedSession = structuredClone(this.sessionOf(run));
    const rec = next.items.find((x) => x.id === id);
    if (rec === undefined) throw new Error(`the item ${id} disappeared during its premise write`);
    next.ledger = [...next.ledger, ...entries.map((e) => ({ ...e, commit }))];
    rec.card = plan.nodeId;
    // The draft's key stays in `versions` (same rev, no "updated"); the written item's key is the accepted one.
    if (!rec.versions.some((v) => v.rev === rec.rev && v.fingerprint === rec.fingerprint)) {
      rec.versions = [...rec.versions, { rev: rec.rev, stage: next.stage, fingerprint: rec.fingerprint, content: structuredClone(rec.content) }];
    }
    rec.fingerprint = written.contentKey;
    if (rec.accepted !== undefined) rec.accepted = { ...rec.accepted, fingerprint: written.contentKey };
    if (proved) addMarker(rec, 'unused-premise');
    next.head = commit;
    delete next.inFlight;
    next.viewVersion += 1;
    run.p.session = next;
    this.writeProblem(run, id, undefined);
    await this.persistStep4(run);
    return 'written';
  }

  /**
   * A write taken back out (§3.8): ws/ to the write's parent (a `revert` commit when ws/ differs, which is then the
   * head), `inFlight` cleared, and whatever `change` records, in one run.json write (tried twice).
   */
  protected async takeBack(run: ActiveRun, _id: string, parent: string, label: string, change: (next: PersistedSession) => void): Promise<void> {
    const shadow = run.shadow;
    await shadow.revertTo(parent, label, Math.max(0, run.view.round));
    const newest = (await shadow.commits()).at(-1);
    const next: PersistedSession = structuredClone(this.sessionOf(run));
    if (newest !== undefined) next.head = newest.id;
    delete next.inFlight;
    change(next);
    next.viewVersion += 1;
    run.p.session = next;
    await this.persistStep4(run);
  }

  // ---------------------------------------------------------------------------------------------
  // The completion (§3.8, F11, F15, D2-56)

  protected async completionWrite(run: ActiveRun, id: string): Promise<'not-due' | 'written' | 'failed'> {
    const s = this.sessionOf(run);
    const shadow = run.shadow;
    const library = run.p.library;
    const parent = s.head;
    const files = await shadow.filesAt(parent);
    const model = filesModel(files, library);
    const r = this.completionDue(s, id, model);
    if (r === undefined) return 'not-due';
    const entry = premiseEntryOf(s.ledger, r.key) as PremiseEntry;
    const draft = this.premiseDraftOf(s, r);
    let changes: FileChange[];
    try {
      if (draft === undefined) throw new Error('telelean has no draft of its premise');
      changes = completionChanges(model, entry.target, entry.card, draft.proof);
    } catch (e) {
      await this.completionFailed(run, entry.target, parent, errorText(e), false);
      return 'failed';
    }
    const completion: LedgerEntry = { kind: 'completion', target: entry.target, item: r.key, commit: '' };
    // Step 1: the write in flight.
    s.inFlight = { action: { kind: 'completion', item: id }, parent };
    try {
      await this.persistChecked(run, NO_PUBLISH);
    } catch (e) {
      delete s.inFlight;
      this.log('error', `the completion of “${entry.target}” could not be started: ${errorText(e)}`);
      return 'failed';
    }
    // Steps 2 and 3: the completion's text, then the Lean job and its `completion` commit (none when it fails).
    let report: CompletionReport;
    try {
      await shadow.writeFiles(changes);
      report = await this.o.services.engine.complete(this.premiseContext(run, [...s.ledger, completion], this.lastFreezeOf(s, entry.target)), { item: r.key, draft, card: entry.card });
    } catch (e) {
      report = { ok: false, error: errorText(e) };
    }
    // Exit stops the run's Lean jobs before it ends the run (`stopping`): a job that failed that way is no failure to record (F-F1).
    if (!this.live(run)) return 'failed';
    if (!report.ok) {
      await this.completionFailed(run, entry.target, parent, report.error, true);
      return 'failed';
    }
    // Step 4: the ledger's `completion` entry with its commit, `head` that commit. T's Result is reconciled by the judge.
    const next: PersistedSession = structuredClone(this.sessionOf(run));
    next.ledger = [...next.ledger, { ...completion, commit: report.commit.id }];
    next.head = report.commit.id;
    delete next.inFlight;
    next.viewVersion += 1;
    run.p.session = next;
    await this.persistStep4(run);
    return 'written';
  }

  /**
   * D2-56: a completion that did not pass (or could not be written): taken back out (`written`: ws/ to the write's
   * parent, a `revert` commit), the premise still accepted; T's Result marked "completion not checked", with Lean's
   * message as an event; Retry step offered: a `submit` step for T with its proof open, in `retry`, under the stage's
   * heading (one naming the completion when there is none).
   */
  protected async completionFailed(run: ActiveRun, target: string, parent: string, message: string, written: boolean): Promise<void> {
    if (!this.live(run)) return;
    const apply = (next: PersistedSession) => {
      const result = next.items.find((x) => x.key === proofKey(target));
      if (result !== undefined) addMarker(result, 'completion-not-checked');
      const at = this.iso();
      const lastId = next.events.at(-1)?.id ?? 0;
      next.events = [...next.events, { id: lastId + 1, at, text: completionFailedEvent(target, message), items: result !== undefined ? [result.id] : [] }].slice(-50);
      const inference = next.inferences.find((i) => i.target === target);
      if (inference !== undefined && !next.retry.some((sid) => next.steps.find((x) => x.id === sid)?.target === target)) {
        const sid = `s${next.steps.length + 1}`;
        const question = { sources: [...inference.question.sources], fromNothing: inference.question.fromNothing };
        const queue = next.steps.reduce((m, x) => Math.max(m, x.queue ?? 1), 0);
        const step: PersistedStep = {
          id: sid,
          kind: 'submit',
          target,
          stage: next.stage,
          scope: { step: sid, target, question, fuzzyStatements: [], openProof: true, openArrows: !question.fromNothing, openItems: [] },
          state: 'not-run',
          queue,
          freezes: [],
          gateAttempts: [],
          counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 },
          agentMs: 0,
        };
        next.steps = [...next.steps, step];
        inference.steps = [...inference.steps, sid];
        next.retry = [...next.retry, sid];
      }
      if (next.heading === undefined || next.heading === null) {
        next.heading = { kind: 'failed', text: REVIEW_TEXTS.stepFailed(completionFailedHeading(target)), firstStep: false, retry: { ok: true } };
      }
    };
    if (written) {
      await this.takeBack(run, '', parent, 'The completion did not pass: taken back out', apply);
      return;
    }
    const next: PersistedSession = structuredClone(this.sessionOf(run));
    apply(next);
    next.viewVersion += 1;
    run.p.session = next;
    await this.persistStep4(run);
  }
}
