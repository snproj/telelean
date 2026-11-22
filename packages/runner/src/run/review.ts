/**
 * Slice 2e (docs/slice2-plan.md 1.1's 2e, 2.5, 2.6, 3.6, 3.7): an edit session's review actions, on top of the session
 * layer (session.ts):
 *
 *   decisions  decide (Accept, the declines, back to review, un-reject), Show results, Undo and Redo: core
 *              `reduceReview` on the records and the stage judgement (`reviewStateOf`, the view's labels), refused while
 *              a step runs (D2-62), outside a stage, for a stale stage, and with no stage judgement to read (fail closed).
 *              Each runs in the session's one write queue (§2.6), on the records as they are when its write starts: a
 *              change to the records alone is one run.json write; one with an ItemWrite is four writes (run.json
 *              `inFlight`, the files, a `decision` commit, the records with `head`), its files planned when the write
 *              starts, on the head: the inverse merges first (an un-reject: the decision commit that declined the item;
 *              an Undo: the undone action's commits, newest first; `proposal/files.ts` `inverseMerge`, a conflict refusing
 *              the action), then the reverts (`planItemRevert`), then the written Add premises taken out (their ledger
 *              entries dropped, recorded on the action, the card cleared, the draft key back; the `mark-removed` moved to
 *              another written premise into the same card, fixer 2b2 r1). Its commit joins the action's `commits`, and a
 *              decline's `decline.commit`. A write that moved the head starts a judge (§3.6), coalesced
 *   Submit     (§3.7) waits while the session judges (AF3), then the gate as the view's (nothing listed in review, the
 *              results shown); with nothing Shaky or to be redone, phase `confirming` (§3.10's opening; the final check
 *              is 2f's), no seal (D2-54), a partly accepted cycle refused; otherwise the take-out first (a
 *              `submit-take-out` write, D2-57) and one queue of `submit` steps (a `queue-start` write, its seal), whose
 *              first step's turn starts with the feedback turn (prompts.ts `submitFeedbackTurn`)
 *   the diff   `sessionDiff`: B -> the head's model files; while the results are hidden only with `confirmed`, which
 *              counts as Show results (`raw-diff`)
 *   recovery   a `decide` or `submit-take-out` write found in flight is run again, on the records and the stage judgement
 *              computed again (D2-51, D2-72): either fully made, or (no judgement to read, a refusal now) not made
 */
import {
  ActionError,
  computeItems,
  fallbackLabel,
  isResultOrPart,
  parseItemKey,
  planItemRevert,
  planSubmit,
  premiseDraftKey,
  reduceReview,
  resultsState,
  REVIEW_TEXTS,
  reviewStateOf,
  sessionLabels,
  type ActionOutcome,
  type CascadeEntry,
  type FileChange,
  type ItemRecord,
  type ItemWrite,
  type LedgerEntry,
  type ProjectModel,
  type ReviewAction,
  type ReviewOutcome,
  type ReviewState,
  type SessionAction,
  type StateJudgement,
} from '@telelean/core';

import { filesKey } from '../gate/index.js';
import { diffFileMaps, inverseMerge } from '../proposal/files.js';
import { sha256Text } from '../semantic/project.js';
import type { ShadowCommit } from '../shadow/types.js';
import { submitFeedbackTurn, type FeedbackItem } from './prompts.js';
import { DECISIONS_DID_NOT_PASS, endedTargets, filesModel, SESSION_VIEW_FAILED, SessionRunner, sessionSameFiles, toSessionRecords } from './session.js';
import { errorText, okOutcome, refused, type ActiveRun } from './step.js';
import type { PersistedSession, PersistedStep, SessionWrite } from './types.js';

/**
 * An Accept refused under the "did not pass" heading that a decision's judge made (fixer 2e r1, A-F2): not "Claude's step
 * did not pass" (no step ran), and it says what lifts it. Core's text for the heading of a step stays for a step's.
 */
export const DECIDED_DID_NOT_PASS = `${DECISIONS_DID_NOT_PASS}: nothing can be accepted until it passes. Undo or change a decision to check it again.`;

/** A review action with no stage judgement to read (a judge that could not run, A-F4): refused, fail closed. */
export const NO_JUDGEMENT = 'telelean has no check of the working copy to decide on: reload the window to check it again, or Exit the session.';

type ReviewOk = Extract<ReviewOutcome, { ok: true }>;
const SESSION_CHANGE_ONLY = { run: true, proposal: false, session: true } as const;
type TakenOut = Extract<SessionAction, { kind: 'decide' }>['takenOut'][number];
type WriteAction = Extract<SessionAction, { kind: 'decide' | 'reveal' }>;

const isDeclinedOut = (r: Pick<ItemRecord, 'status' | 'decline'>): boolean => r.status === 'declined' && r.decline?.option !== 'shaky';
/** Its content is out of ws/: declined by Reject or plainly, taken out to be redone, or withdrawn. */
const contentOut = (r: Pick<ItemRecord, 'status' | 'decline' | 'redo'>): boolean => isDeclinedOut(r) || r.redo?.reverted === true || r.status === 'withdrawn';
const isShaky = (r: Pick<ItemRecord, 'status' | 'decline'>): boolean => r.decline?.option === 'shaky' && (r.status === 'declined' || r.status === 'to-be-redone');
const PREMISE_ENTRY_KINDS: ReadonlySet<LedgerEntry['kind']> = new Set<LedgerEntry['kind']>(['premise', 'mark-removed', 'completion']);
/** A written premise's own ledger entries (§3.8): its `premise`, `mark-removed` and `completion` entries. */
const entriesOf = (ledger: readonly LedgerEntry[], key: string): LedgerEntry[] =>
  ledger.filter((e) => PREMISE_ENTRY_KINDS.has(e.kind) && 'item' in e && e.item === key);
const sameEntry = (a: LedgerEntry, b: LedgerEntry): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The inference an item belongs to (§3.7: a Result's target, else the target of the step that proposed it). */
function inferenceOf(r: ItemRecord): string | undefined {
  if (r.kind === 'result') {
    const parsed = parseItemKey(r.key);
    return parsed?.kind === 'proof' ? parsed.node : undefined;
  }
  return r.origin.target === '' ? undefined : r.origin.target;
}

/** The files one review write changes, and what its step 4 records besides the reducer's records (§2.6, §2.9). */
interface PlannedWrite {
  /** ws/ at the head -> after the write (whole files). */
  changes: FileChange[];
  /** The ledger after the write (put-back entries in, taken-out premises' entries out); moved marks have no commit yet. */
  ledger: LedgerEntry[];
  /** Premise records whose card goes (taken out): their draft key again (§3.8). */
  takenOutIds: string[];
  /** The written premises the write takes out, as the action records them (`takenOut`). */
  takenOut: TakenOut[];
  /** `mark-removed` entries moved to another written premise, waiting for the commit's id (fixer 2b2 r1). */
  moved: Array<Extract<LedgerEntry, { kind: 'mark-removed' }>>;
}

export abstract class ReviewRunner extends SessionRunner {
  // ---------------------------------------------------------------------------------------------
  // Guards (D2-62, §2.4, A-F4)

  /**
   * Why a review action is refused now, or undefined: while a step runs (D2-62), outside a stage (a confirmation, Apply),
   * for a stage the user no longer sees, while the view cannot be built (A-F4), and with no stage judgement to read
   * (its classes and RV-5 edges: the reducer would read none, fail open).
   */
  protected reviewRefusal(run: ActiveRun, stage?: number): ActionOutcome | undefined {
    const s = this.sessionOf(run);
    if (this.stepRunning(s)) return refused('refused', REVIEW_TEXTS.stepRunning);
    if (s.phase !== 'stage') return refused('conflict', s.phase === 'applying' ? REVIEW_TEXTS.applyingNow : REVIEW_TEXTS.formalizeConfirming);
    if (stage !== undefined && stage !== s.stage) return refused('conflict', REVIEW_TEXTS.historyChanged);
    const rt = this.runtimeOf(run);
    if (rt.viewError !== undefined) return refused('conflict', SESSION_VIEW_FAILED);
    if (rt.judgement === null) return refused('conflict', this.isJudging(run) ? REVIEW_TEXTS.judging : NO_JUDGEMENT);
    return undefined;
  }

  /**
   * The reducer's input: the records, the stage judgement they were reconciled with, and the view's labels (§2.9).
   *
   * For an Undo (builder 2e): an item whose Accept the undone action took away and whose content that action took out
   * of ws/ (a Reject, a plain decline, their cascades) has no draft in the stage judgement, hence no class, and core's
   * reducer reads a missing class as every badge (fail closed), so restoring its Accept would always be refused with
   * RV-7's text. Such an item gets, in both class maps and only where the judgement has none, the badges its restored
   * Accept recorded: the Undo brings its content back, and the judge that follows classifies it again and returns it to
   * review if its badges grew (RV-7, D2-23); Submit and Apply wait for that judge (AF3).
   */
  protected reviewState(run: ActiveRun, action?: ReviewAction): ReviewState {
    const s = this.sessionOf(run);
    const rt = this.runtimeOf(run);
    const view = rt.view ?? this.buildView(run);
    const state = reviewStateOf(toSessionRecords(s), rt.judgement, view !== null ? sessionLabels(view) : undefined);
    const top = s.stack.done.at(-1);
    if (action?.kind !== 'undo' || top === undefined || top.id !== action.step || (top.kind !== 'decide' && top.kind !== 'reveal')) return state;
    const byId = new Map(s.items.map((r) => [r.id, r]));
    const classes = { ...state.classes };
    const classesBeforeReveal = { ...state.classesBeforeReveal };
    for (const c of top.changes) {
      const accepted = c.before.accepted;
      const r = byId.get(c.item);
      if (accepted === undefined || r === undefined || !contentOut(r)) continue;
      const recorded = { belief: accepted.belief, changesProved: accepted.changesProved, reasons: [], complete: true };
      if (!Object.hasOwn(classes, r.key)) classes[r.key] = recorded;
      if (!Object.hasOwn(classesBeforeReveal, r.key)) classesBeforeReveal[r.key] = recorded;
    }
    return { ...state, classes, classesBeforeReveal };
  }

  /** Whether the stage's results are shown now (§4.7, `resultsState` on the records and `classesBeforeReveal`). */
  protected resultsShown(run: ActiveRun): boolean {
    const s = this.sessionOf(run);
    const judgement = this.runtimeOf(run).judgement;
    return resultsState({ items: s.items, classesBeforeReveal: judgement?.classesBeforeReveal ?? {}, forced: s.forced ?? null }).shown;
  }

  // ---------------------------------------------------------------------------------------------
  // The review actions (§2.5): decide, Show results, Undo, Redo

  /**
   * One review action (§3.6, §4.6): refused before the write queue when the rules say so, then carried out in it on the
   * records as they are when its write starts (checked again there). Resolves after its write's step 4; a write that
   * moved the head starts a judge, which it does not wait for (D2-74).
   */
  protected async reviewNow(run: ActiveRun, action: ReviewAction, stage?: number): Promise<ActionOutcome> {
    const early = this.reviewRefusal(run, stage);
    if (early !== undefined) return early;
    let moved = false;
    let wrote = false;
    const outcome = await this.enqueueWrite(run, async () => {
      const now = this.reviewRefusal(run, stage);
      if (now !== undefined) return now;
      const done = await this.carryOut(run, action);
      moved = done.moved;
      wrote = done.outcome.ok;
      // The judge is due from inside the write (AF3): the session never reads as idle between this write and its
      // judge, so Submit, Apply, a mid-stage Formalize and Retry, which wait for an idle session, wait for it too.
      if (moved) this.requestJudge(run);
      return done.outcome;
    });
    // The view was built while the write held the queue (`judging`): once nothing is queued or judged, it is posted again.
    if (!moved && wrote && !this.isJudging(run)) await this.save(run, SESSION_CHANGE_ONLY);
    return outcome;
  }

  /** §3.6: one judge at a time, coalesced: a judge already queued behind the running one judges the newest head. */
  protected requestJudge(run: ActiveRun): void {
    if (this.disposed || run !== this.run || run.ended) return;
    if (this.runtimeOf(run).queuedJudges > 0) return;
    void this.judgeHead(run, { decided: true });
  }

  /**
   * Inside the write queue: the reducer on the records and the stage judgement as they are now, then its effects (§2.6):
   * the records alone in one run.json write, or the ItemWrite's four writes. `replay`: recovery runs a write found in
   * flight again (its step 1 is written again, the same).
   */
  protected async carryOut(run: ActiveRun, given: ReviewAction): Promise<{ outcome: ActionOutcome; moved: boolean }> {
    // (2f) An Exit that came in while this waited in the queue (Exit skips the queues, AF14) ended the session.
    if (!this.live(run)) return { outcome: refused('conflict', 'This run has ended.'), moved: false };
    const s = this.sessionOf(run);
    // D2-33 (2f): a move's `before` is the positions as they are when its write starts (the runner keeps them).
    const action: ReviewAction =
      given.kind === 'move' ? { kind: 'move', before: Object.fromEntries(Object.keys(given.after).map((id) => [id, s.positions?.[id] ?? null])), after: given.after } : given;
    const state = this.reviewState(run, action);
    const at = this.iso();
    const out = reduceReview(state, action, at);
    if (!out.ok) {
      const refusal = this.refusalOf(out, action, state);
      if (!refusal.ok && refusal.error === REVIEW_TEXTS.acceptDidNotPass && s.decidedHeading !== undefined) return { outcome: { ...refusal, error: DECIDED_DID_NOT_PASS }, moved: false };
      return { outcome: refusal, moved: false };
    }
    // A group Accept that took nothing, Show results while they are shown: nothing changes, no stack step.
    if (out.stack === state.stack && out.write === null) return { outcome: this.okOf(out), moved: false };
    const next = this.recordsAfter(s, out, at, action);
    const write = out.write;
    if (write === null) return { outcome: this.afterWrite(run, s, out, await this.recordsOnly(run, s, next, out)), moved: false };
    let plan: PlannedWrite;
    try {
      plan = await this.planItemWrite(run, s, out, write, action);
    } catch (e) {
      if (e instanceof ItemWriteRefusal) return { outcome: refused(e.code, e.message), moved: false };
      if (e instanceof ActionError) return { outcome: refused(e.code, e.message), moved: false };
      throw e;
    }
    this.applyPlanToRecords(next, plan, write, s, undefined);
    if (plan.changes.length === 0) {
      // Nothing in ws/ changes (the content was out already): the records alone, with the ledger the plan left.
      return { outcome: this.afterWrite(run, s, out, await this.recordsOnly(run, s, next, out)), moved: false };
    }
    // Step 1: the write in flight.
    s.inFlight = { action: { kind: 'decide', action }, parent: s.head };
    try {
      await this.persistChecked(run, { run: false, proposal: false, session: false });
    } catch (e) {
      delete s.inFlight;
      return { outcome: refused('internal', REVIEW_TEXTS.saveFailed(errorText(e))), moved: false };
    }
    // Steps 2 and 3: the files, the `decision` commit.
    let commit: ShadowCommit;
    try {
      await run.shadow.writeFiles(plan.changes);
      commit = await run.shadow.commit('decision', `Your decision: ${out.label || 'review'}`, Math.max(0, run.view.round));
    } catch (e) {
      return { outcome: await this.abortWrite(run, s, e), moved: false };
    }
    // Step 4: the records, with the commit, `head` set and `inFlight` cleared.
    this.applyPlanToRecords(next, plan, write, s, commit.id);
    next.head = commit.id;
    delete next.inFlight;
    run.p.session = next;
    try {
      await this.persistStep4(run);
    } catch (e) {
      return { outcome: refused('internal', REVIEW_TEXTS.saveFailed(errorText(e))), moved: true };
    }
    return { outcome: this.afterWrite(run, s, out, this.okOf(out)), moved: true };
  }

  /** A review write that was made (`outcome.ok`): the writes it makes due follow it in the queue (`afterReviewWrite`). */
  protected afterWrite(run: ActiveRun, before: PersistedSession, out: ReviewOk, outcome: ActionOutcome): ActionOutcome {
    if (outcome.ok) this.afterReviewWrite(run, before, out);
    return outcome;
  }

  /**
   * §3.8 (2f, D2-71): after a review write is made, inside the write queue, the writes it made due join the queue after
   * it (an Accept, or an Undo or Redo that accepts a premise again: its premise write). None here (premises.ts).
   */
  protected afterReviewWrite(_run: ActiveRun, _before: PersistedSession, _out: ReviewOk): void {}

  /**
   * The records after the reducer's outcome (a copy of the session): statuses, questions, declined arrows, the force, the
   * stack, events; and (2f, D2-33) the positions of the cards moved on the Proposed view, which the runner keeps (the
   * reducer records a move on the stack only): a move sets its `after`, its Undo puts its `before` back (a card that had
   * none loses its position), its Redo sets its `after` again.
   */
  protected recordsAfter(s: PersistedSession, out: ReviewOk, at: string, action?: ReviewAction): PersistedSession {
    const next: PersistedSession = structuredClone(s);
    next.items = structuredClone(out.items);
    next.inferences = structuredClone(out.inferences);
    next.rejectedArrows = structuredClone(out.rejectedArrows);
    if (out.forced !== null) next.forced = { ...out.forced };
    else delete next.forced;
    next.stack = { done: structuredClone([...out.stack.done]), undone: structuredClone([...out.stack.undone]) };
    next.nextAction = out.nextAction;
    const lastId = s.events.at(-1)?.id ?? 0;
    next.events = [...s.events, ...out.events.map((e, k) => ({ id: lastId + k + 1, at, text: e.text, items: [...e.items] }))].slice(-50);
    next.viewVersion += 1;
    const moved = movedPositions(out, action);
    if (moved !== undefined) {
      const positions = { ...(s.positions ?? {}) };
      for (const [card, p] of Object.entries(moved)) {
        if (p === null) delete positions[card];
        else positions[card] = { x: p.x, y: p.y };
      }
      if (Object.keys(positions).length > 0) next.positions = positions;
      else delete next.positions;
    }
    return next;
  }

  /** A change to the records alone (§2.6): one run.json write in the queue; a failed write leaves the session as it was. */
  protected async recordsOnly(run: ActiveRun, s: PersistedSession, next: PersistedSession, out: ReviewOk): Promise<ActionOutcome> {
    run.p.session = next;
    try {
      await this.persistChecked(run);
    } catch (e) {
      run.p.session = s;
      return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
    }
    return this.okOf(out);
  }

  /**
   * A write whose files or commit failed after its step 1: ws/ goes back to the head (a `revert` commit, which becomes the
   * head when ws/ differed), `inFlight` is cleared, nothing of the action is recorded. If that fails too, the in-memory
   * session keeps `inFlight` for a reload's recover() to finish.
   */
  protected async abortWrite(run: ActiveRun, s: PersistedSession, e: unknown): Promise<ActionOutcome> {
    this.log('error', `a review write failed: ${errorText(e)}`);
    try {
      await run.shadow.revertTo(s.head, 'Your decision could not be carried out: back to the session head', Math.max(0, run.view.round));
      const newest = (await run.shadow.commits()).at(-1);
      if (newest !== undefined) s.head = newest.id;
      delete s.inFlight;
      await this.persistChecked(run);
    } catch (again) {
      this.log('error', `the working copy could not be restored: ${errorText(again)}`);
    }
    return refused('internal', `telelean could not carry out your decision: ${errorText(e)}`);
  }

  /**
   * The reducer's refusal as an ActionOutcome; `needs-confirmation` with its dialog's lead-in (§3.6, §5.12, D2-64): a
   * decision's by what it does, a Redo's by the decisions it sends again (the undone action's request), an Undo's
   * "Undoing it also returns these accepted items to review:".
   */
  protected refusalOf(out: Exclude<ReviewOutcome, { ok: true }>, action: ReviewAction, state?: ReviewState): ActionOutcome {
    if (out.code !== 'needs-confirmation') return refused(out.code, out.error);
    let lead: string = REVIEW_TEXTS.cascadeBackToReview;
    const redone = action.kind === 'redo' ? state?.stack.undone.find((a) => a.id === action.step) : undefined;
    const decisions = action.kind === 'decide' ? action.decisions : redone?.kind === 'decide' ? redone.request.decisions : [];
    if (action.kind === 'undo') lead = REVIEW_TEXTS.cascadeUndoAccept;
    else {
      const declines = decisions.filter((d) => d.to === 'declined');
      if (declines.some((d) => d.option !== 'shaky')) lead = REVIEW_TEXTS.cascadeReject;
      else if (declines.length > 0) lead = REVIEW_TEXTS.cascadeShaky;
    }
    const error = out.hiddenResults === true ? `${lead} ${REVIEW_TEXTS.cascadeHiddenResults}` : lead;
    return { ok: false, code: 'needs-confirmation', error, cascade: out.cascade.map(copyCascade), ...(out.hiddenResults === true ? { hiddenResults: true as const } : {}) };
  }

  /** The reducer's ok outcome as an ActionOutcome (§2.3): its label, and what it took, left and cascaded. */
  protected okOf(out: ReviewOk): ActionOutcome {
    return {
      ok: true,
      label: out.label,
      undoable: false,
      review: { taken: [...out.taken], left: out.left.map((l) => ({ item: l.item, reason: l.reason })), cascade: out.cascade.map(copyCascade) },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // The ws/ part of an action (§2.9 ItemWrite)

  /**
   * The files of an ItemWrite, planned on the head when its write starts (§2.6, §2.9): the inverse merges, then the
   * reverts and the premise take-outs (`planItemRevert`, on the merged files), and the ledger after it. Throws
   * `ItemWriteRefusal` for a merge that conflicts, and core's ActionError for a revert it cannot plan (nothing written).
   */
  protected async planItemWrite(run: ActiveRun, s: PersistedSession, out: ReviewOk, write: ItemWrite, action: ReviewAction): Promise<PlannedWrite> {
    const shadow = run.shadow;
    const headFiles = await shadow.filesAt(s.head);
    const before = new Map(s.items.map((r) => [r.id, r]));
    const after = new Map(out.items.map((r) => [r.id, r]));
    // 1. The inverse merges: an Undo's action's commits; an un-reject's declining commit (read before the action).
    const all = await shadow.commits();
    const order = new Map(all.map((c, k) => [c.id, k]));
    const owner = action.kind === 'undo' ? out.stack.undone.find((a) => a.id === write.action) : undefined;
    let commits: string[];
    if (action.kind === 'undo') commits = owner !== undefined && (owner.kind === 'decide' || owner.kind === 'reveal') ? [...owner.commits] : [];
    else {
      commits = write.reapply.flatMap((id) => {
        const r = before.get(id);
        return r !== undefined && isDeclinedOut(r) && r.decline?.commit !== undefined ? [r.decline.commit] : [];
      });
    }
    commits = [...new Set(commits)].sort((a, b) => (order.get(b) ?? -1) - (order.get(a) ?? -1));
    let files = new Map(headFiles);
    for (const c of commits) {
      const at = order.get(c);
      const parent = at !== undefined && at > 0 ? all[at - 1] : undefined;
      if (at === undefined || parent === undefined) throw new ItemWriteRefusal('conflict', REVIEW_TEXTS.unrejectConflict('the session history'));
      const merged = inverseMerge(await shadow.filesAt(c), await shadow.filesAt(parent.id), files);
      if (!merged.ok) throw new ItemWriteRefusal('refused', REVIEW_TEXTS.unrejectConflict(merged.file));
      files = merged.files;
    }
    // The written premises the inverted commits' actions took out: their entries (`takenOut`, §2.2).
    const inverted = new Set(commits);
    const takenOutBy = new Map<string, TakenOut>();
    for (const a of [...s.stack.done, ...s.stack.undone]) {
      if ((a.kind !== 'decide' && a.kind !== 'reveal') || !a.commits.some((c) => inverted.has(c))) continue;
      for (const t of a.takenOut) takenOutBy.set(t.item, t);
    }
    // The ledger: the marks those commits moved go (they come back with their premise, or move again below); the entries
    // of the premises written again come back (R1-1, V2A-S3).
    let ledger = s.ledger.filter((e) => !(e.kind === 'mark-removed' && inverted.has(e.commit)));
    for (const id of write.reapply) {
      const r = after.get(id);
      if (r?.kind !== 'add-premise') continue;
      const t = takenOutBy.get(id);
      if (t === undefined) throw new ItemWriteRefusal('conflict', REVIEW_TEXTS.unrejectConflict('the premise card'));
      for (const e of t.ledger) if (!ledger.some((x) => sameEntry(x, e))) ledger.push(e);
    }
    // 2-3. The reverts and the premise take-outs, on the merged files. A premise not written now (brought back by a merge
    // whose status keeps it out, or an Undo's that stays out) is planned from its takenOut entry's ledger entries.
    const takeOut = write.premises.takeOut;
    const writtenNow = (key: string) => ledger.some((e) => e.kind === 'premise' && e.item === key);
    const planLedger = [...ledger];
    for (const id of takeOut) {
      const r = after.get(id) ?? before.get(id);
      if (r === undefined || writtenNow(r.key)) continue;
      const t = takenOutBy.get(id);
      if (t !== undefined) for (const e of t.ledger) if (!planLedger.some((x) => sameEntry(x, e))) planLedger.push(e);
    }
    const ids = [...write.revert, ...takeOut];
    if (ids.length > 0) {
      const keys = new Set(ids.flatMap((id) => [after.get(id)?.key, before.get(id)?.key].filter((k): k is string => k !== undefined)));
      const model = await this.planningModel(run, files);
      const base = await this.loadBaseModel(run);
      const { drafts } = computeItems({ base, current: model, ledger: planLedger, premises: s.premises, inferences: out.inferences, ended: endedTargets(s) });
      const wanted = drafts.filter((d) => keys.has(d.key));
      if (wanted.length > 0) {
        for (const c of planItemRevert({ base, current: model, drafts: wanted, ledger: planLedger })) {
          if (c.after === null) files.delete(c.path);
          else files.set(c.path, c.after);
        }
      }
    }
    // The taken-out premises: those written when the write started are recorded (`takenOut`); every one's entries go;
    // a `mark-removed` whose card another written premise still points into moves to the first of them (fixer 2b2 r1).
    const takenOut: TakenOut[] = [];
    const goneKeys = new Set<string>();
    for (const id of takeOut) {
      const r = before.get(id) ?? after.get(id);
      if (r === undefined) continue;
      goneKeys.add(r.key);
      const own = entriesOf(s.ledger, r.key);
      const premise = own.find((e): e is Extract<LedgerEntry, { kind: 'premise' }> => e.kind === 'premise');
      if (premise !== undefined) takenOut.push({ item: id, card: premise.card, fingerprint: r.fingerprint, ledger: own.map((e) => ({ ...e })) });
    }
    const droppedMarks = planLedger.filter((e): e is Extract<LedgerEntry, { kind: 'mark-removed' }> => e.kind === 'mark-removed' && goneKeys.has(e.item));
    ledger = ledger.filter((e) => !(PREMISE_ENTRY_KINDS.has(e.kind) && 'item' in e && goneKeys.has(e.item)));
    const moved: PlannedWrite['moved'] = [];
    for (const mark of droppedMarks) {
      const stays = ledger.find((e): e is Extract<LedgerEntry, { kind: 'premise' }> => e.kind === 'premise' && e.target === mark.card);
      if (stays === undefined || ledger.some((e) => e.kind === 'mark-removed' && e.card === mark.card)) continue;
      moved.push({ kind: 'mark-removed', card: mark.card, item: stays.item, commit: '' });
    }
    return { changes: diffFileMaps(headFiles, files), ledger, takenOutIds: [...takeOut], takenOut, moved };
  }

  /**
   * The project model the write plans its reverts on: the merged files, with the stage judgement's facts when they are
   * the judged commit's files (computeItems then reads the judged state), else none (text only: a revert needs the
   * items' `provides`, which the texts give).
   */
  protected async planningModel(run: ActiveRun, files: ReadonlyMap<string, string>): Promise<ProjectModel> {
    const judged = this.runtimeOf(run).judgedModel;
    if (judged !== undefined) {
      try {
        if (sessionSameFiles(files, await run.shadow.filesAt(judged.commit))) return judged.model;
      } catch {
        // an unknown commit: plan on the texts
      }
    }
    return filesModel(files, run.p.library);
  }

  /**
   * Step 4's records besides the reducer's (§2.6, §2.9, §3.8): the ledger; each taken-out premise without its card,
   * with its draft key again; and once the commit is made (`commit`), each newly declined item's `decline.commit` and the
   * action's `commits` and `takenOut` (an Undo's write is recorded on no action: its action left the done stack).
   */
  protected applyPlanToRecords(next: PersistedSession, plan: PlannedWrite, write: ItemWrite, s: PersistedSession, commit: string | undefined): void {
    next.ledger = [...plan.ledger, ...plan.moved.map((m) => ({ ...m, commit: commit ?? m.commit }))].filter((e) => !(e.kind === 'mark-removed' && e.commit === ''));
    for (const r of next.items) {
      if (!plan.takenOutIds.includes(r.id) || r.kind !== 'add-premise') continue;
      delete r.card;
      if (r.content.premise !== undefined) r.fingerprint = premiseDraftKey(r.content.premise);
    }
    if (commit === undefined) return;
    // An Undo's write belongs to no done action: the states it restores keep their own `decline.commit`, which the
    // reducer's un-reject reads with the action that declined them (`mergedBackBy`).
    const action = next.stack.done.find((a): a is WriteAction => a.id === write.action && (a.kind === 'decide' || a.kind === 'reveal'));
    if (action === undefined) return;
    action.commits = [...action.commits, commit];
    action.takenOut = [...action.takenOut, ...plan.takenOut];
    const was = new Map(s.items.map((r) => [r.id, r]));
    for (const r of next.items) {
      const before = was.get(r.id);
      if (isDeclinedOut(r) && r.decline !== undefined && (before === undefined || !isDeclinedOut(before))) r.decline = { ...r.decline, commit };
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The raw diff (§2.4, §2.5)

  /**
   * "Raw Lean diff…" of a session: B -> the head's model files. While the results are hidden it answers
   * `needs-confirmation` (`reveal`), unless `confirmed`, when it counts as Show results (RV-6: `raw-diff`).
   */
  protected async sessionDiffNow(run: ActiveRun, stage: number, confirmed: boolean): Promise<{ ok: true; kind: 'diff'; files: FileChange[] } | ActionOutcome> {
    const early = this.reviewRefusal(run, stage);
    if (early !== undefined) return early;
    if (!this.resultsShown(run)) {
      if (!confirmed) return { ok: false, code: 'needs-confirmation', error: REVIEW_TEXTS.rawDiffReveals, reveal: true };
      const shown = await this.reviewNow(run, { kind: 'reveal', via: 'raw-diff' }, stage);
      if (!shown.ok) return shown;
    }
    const s = this.sessionOf(run);
    const [base, head] = await Promise.all([run.shadow.baseFiles(), run.shadow.filesAt(s.head)]);
    const model = (files: ReadonlyMap<string, string>) => new Map([...files].filter(([rel]) => rel.endsWith('.lean')));
    return { ok: true, kind: 'diff', files: diffFileMaps(model(base), model(head)) };
  }

  // ---------------------------------------------------------------------------------------------
  // Submit review (§3.7)

  /**
   * RV-12: waits while the session judges or writes (AF3: `asLastWrite`), then Submit's gate as the view has it: nothing
   * listed in review, the results shown. Nothing Shaky or to be redone: the end confirmation (a partly accepted cycle
   * refused). Otherwise the take-out and the queue of Submit steps, in one job of the write queue, so nothing comes
   * between them.
   */
  protected async submitNow(run: ActiveRun, stage: number): Promise<ActionOutcome> {
    const early = this.reviewRefusal(run, stage);
    if (early !== undefined) return early;
    let first: PersistedStep | undefined;
    const outcome = await this.asLastWrite(run, async (): Promise<ActionOutcome> => {
      const now = this.reviewRefusal(run, stage);
      if (now !== undefined) return now;
      const s = this.sessionOf(run);
      const judgement = this.runtimeOf(run).judgement as StateJudgement;
      const shown = this.resultsShown(run);
      const inReview = s.items.filter((r) => r.status === 'in-review' && (shown || !isResultOrPart(r)));
      if (inReview.length > 0) return refused('refused', REVIEW_TEXTS.submitInReview(inReview.length));
      if (!shown) return refused('refused', REVIEW_TEXTS.submitResultsHidden);
      const plan = planSubmit({ records: toSessionRecords(s), judgement });
      if (plan.confirm) {
        const cycle = plan.partlyAccepted[0];
        if (cycle !== undefined) {
          // The view's gate text: the cycle's items in list order, by the view's labels.
          const view = this.runtimeOf(run).view;
          const labels = view !== null ? sessionLabels(view) : {};
          const order = new Map((view?.items ?? []).map((item, k) => [item.id, k]));
          const listed = [...cycle].sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
          return refused('refused', REVIEW_TEXTS.acceptOrRejectTogether(listed.map((id) => labels[id] ?? this.labelOf(s, id))));
        }
        return this.openConfirmation(run);
      }
      if (plan.takeOut.length > 0) {
        const took = await this.submitTakeOut(run, plan.takeOut);
        if (!took.ok) return took;
      }
      const steps = this.submitSteps(this.sessionOf(run), plan.steps);
      first = steps[0];
      if (first === undefined) return refused('conflict', REVIEW_TEXTS.nothingToRetry);
      const write: Extract<SessionWrite, { kind: 'queue-start' }> = {
        kind: 'queue-start',
        by: 'submit',
        steps: steps.map((x) => x.id),
        submit: steps.map((x) => ({ target: x.target, openItems: [...x.scope.openItems], openProof: x.scope.openProof })),
      };
      const at = this.sessionOf(run);
      at.inFlight = { action: write, parent: at.head };
      try {
        await this.persistChecked(run, { run: false, proposal: false, session: false });
      } catch (e) {
        delete at.inFlight;
        return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
      }
      return this.finishQueueStart(run, write, steps);
    });
    if (!outcome.ok || first === undefined) {
      // The end confirmation (2f): its view was built while the write held the queue (`judging`); once nothing is
      // queued or judged, it is posted again before Submit resolves, so the person sees the check running.
      if (outcome.ok && !this.isJudging(run)) await this.save(run, SESSION_CHANGE_ONLY);
      return outcome;
    }
    // AF14: it resolves once its first step works; a step Claude did not get (a failed `--resume`) answers why.
    const started = await this.startStep(run, first.id);
    if (!started.ok) return started;
    return okOutcome(`Claude is working on “${await this.cardShort(run, first.target)}”`);
  }

  /** An item's label as the reducer's fallback names it (no view). */
  protected labelOf(s: PersistedSession, id: string): string {
    const r = s.items.find((x) => x.id === id);
    return r !== undefined ? fallbackLabel(r) : id;
  }

  /**
   * §3.7, §3.10 step 1: every item accepted or rejected: phase `confirming`, with the check `running` and its id (a
   * hash of F's files key and the item statuses), no Claude step and no seal (D2-54). One run.json write. The final
   * check itself, Apply, Back to review and Exit are 2f's (§3.10).
   */
  protected async openConfirmation(run: ActiveRun): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    const files = await run.shadow.filesAt(s.head);
    const key = filesKey(files);
    const checkId = confirmationCheckId(s, key);
    const next: PersistedSession = structuredClone(s);
    next.phase = 'confirming';
    next.confirmation = { checkId, filesKey: key, state: 'running', failures: [] };
    next.viewVersion += 1;
    run.p.session = next;
    try {
      await this.persistChecked(run);
    } catch (e) {
      run.p.session = s;
      return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
    }
    return okOutcome(REVIEW_TEXTS.confirmingPhase);
  }

  /**
   * D2-57: Submit's take-out, as one `submit-take-out` write (four writes, §2.6): each item becomes to be redone with its
   * content taken out (a Shaky one keeps its decline and note), `redo.because` naming the items other steps open that it
   * rests on (the feedback turn says so); its content goes (`planItemRevert` on the head, a written premise with its
   * ledger entries). Run inside the write queue.
   */
  protected async submitTakeOut(run: ActiveRun, items: readonly string[]): Promise<ActionOutcome> {
    const s = this.sessionOf(run);
    const judgement = this.runtimeOf(run).judgement;
    if (judgement === null) return refused('conflict', NO_JUDGEMENT);
    const ids = items.filter((id) => s.items.some((r) => r.id === id));
    const next: PersistedSession = structuredClone(s);
    const openBy = new Map<string, string>();
    for (const r of s.items) {
      const target = isShaky(r) || r.status === 'to-be-redone' ? inferenceOf(r) : undefined;
      if (target !== undefined) openBy.set(r.key, target);
    }
    const idOf = new Map(s.items.map((r) => [r.key, r.id]));
    for (const r of next.items) {
      if (!ids.includes(r.id)) continue;
      const own = openBy.get(r.key);
      const because: string[] = [];
      const seen = new Set([r.key]);
      const queue = [r.key];
      for (let k = 0; k < queue.length; k++) {
        for (const d of judgement.deps[queue[k] as string] ?? []) {
          if (seen.has(d)) continue;
          seen.add(d);
          queue.push(d);
          const other = openBy.get(d);
          const id = idOf.get(d);
          if (other !== undefined && other !== own && id !== undefined) because.push(id);
        }
      }
      r.status = 'to-be-redone';
      delete r.accepted;
      if (r.decline?.option !== 'shaky') delete r.decline;
      r.redo = { because: [...new Set(because)].sort(), reverted: true };
    }
    const shadow = run.shadow;
    const headFiles = await shadow.filesAt(s.head);
    let changes: FileChange[];
    try {
      const model = await this.planningModel(run, headFiles);
      const base = await this.loadBaseModel(run);
      const { drafts } = computeItems({ base, current: model, ledger: s.ledger, premises: s.premises, inferences: s.inferences, ended: endedTargets(s) });
      const keys = new Set(s.items.filter((r) => ids.includes(r.id)).map((r) => r.key));
      const wanted = drafts.filter((d) => keys.has(d.key));
      changes = wanted.length > 0 ? planItemRevert({ base, current: model, drafts: wanted, ledger: s.ledger }) : [];
    } catch (e) {
      return refused(e instanceof ActionError ? e.code : 'internal', errorText(e));
    }
    // A written premise taken out: its entries go, its card leaves its record, its draft key comes back (§3.8).
    for (const r of next.items) {
      if (!ids.includes(r.id) || r.kind !== 'add-premise' || r.card === undefined) continue;
      next.ledger = next.ledger.filter((e) => !(PREMISE_ENTRY_KINDS.has(e.kind) && 'item' in e && e.item === r.key));
      delete r.card;
      if (r.content.premise !== undefined) r.fingerprint = premiseDraftKey(r.content.premise);
    }
    next.viewVersion += 1;
    if (changes.length === 0) {
      run.p.session = next;
      try {
        await this.persistChecked(run);
      } catch (e) {
        run.p.session = s;
        return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
      }
      return okOutcome('taken out');
    }
    s.inFlight = { action: { kind: 'submit-take-out', items: [...ids] }, parent: s.head };
    try {
      await this.persistChecked(run, { run: false, proposal: false, session: false });
    } catch (e) {
      delete s.inFlight;
      return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
    }
    let commit: ShadowCommit;
    try {
      await shadow.writeFiles(changes);
      commit = await shadow.commit('decision', 'Submit review: taken out first, for the steps that rework what they rest on', Math.max(0, run.view.round));
    } catch (e) {
      return this.abortWrite(run, s, e);
    }
    next.head = commit.id;
    delete next.inFlight;
    run.p.session = next;
    try {
      await this.persistStep4(run);
    } catch (e) {
      // As a decision's step 4 (carryOut): the head moved, so a judge follows; the answer says why (fixer 2e r1, F-FC-3).
      this.requestJudge(run);
      return refused('internal', REVIEW_TEXTS.saveFailed(errorText(e)));
    }
    return okOutcome('taken out');
  }

  /**
   * One `submit` step per affected inference, in the plan's order (D2-57): its question the inference's, `openItems` the
   * keys of its Shaky and to-be-redone items, `openProof` only when its Result is Shaky or to be redone (§3.3).
   */
  protected submitSteps(s: PersistedSession, targets: readonly string[]): PersistedStep[] {
    let n = s.steps.length;
    return targets.flatMap((target) => {
      const inf = s.inferences.find((i) => i.target === target);
      if (inf === undefined) return [];
      const open = s.items.filter((r) => inferenceOf(r) === target && (isShaky(r) || r.status === 'to-be-redone'));
      const result = s.items.find((r) => r.kind === 'result' && inferenceOf(r) === target);
      const openProof = result !== undefined && (isShaky(result) || result.status === 'to-be-redone');
      const id = `s${++n}`;
      const question = { sources: [...inf.question.sources], fromNothing: inf.question.fromNothing };
      const step: PersistedStep = {
        id,
        kind: 'submit',
        target,
        stage: s.stage,
        scope: { step: id, target, question, fuzzyStatements: [], openProof, openArrows: !question.fromNothing, openItems: open.map((r) => r.key) },
        state: 'queued',
        freezes: [],
        gateAttempts: [],
        counters: { turns: 0, checks: 0, agentMs: 0, gateAttempts: 0 },
        agentMs: 0,
      };
      return [step];
    });
  }

  /**
   * §2.8, §3.7: the feedback turn before a Submit queue's first step: the statuses, with the items' labels and Lean
   * texts (prompts.ts `submitFeedbackTurn`), and the steps planned (`steps`: the queue's, in order).
   */
  protected override submitFeedback(run: ActiveRun, s: PersistedSession, steps: readonly PersistedStep[]): string {
    const view = this.runtimeOf(run).view;
    const labels = view !== null ? sessionLabels(view) : {};
    const label = (r: ItemRecord) => labels[r.id] ?? fallbackLabel(r);
    const byId = new Map(s.items.map((r) => [r.id, r]));
    const lean = (r: ItemRecord): string => {
      if (r.content.arrow !== undefined) return `${r.content.arrow.source} → ${r.content.arrow.target}`;
      if (r.content.premise !== undefined && r.card === undefined) return r.content.premise.leanStatement;
      return r.content.decls.map((d) => d.text.trim()).join('\n');
    };
    const row = (r: ItemRecord, extra: Partial<FeedbackItem> = {}): FeedbackItem => ({ label: label(r), lean: lean(r), ...extra });
    const reliedOn = (r: ItemRecord): string[] => {
      const because = (r.redo?.because ?? []).flatMap((id) => {
        const x = byId.get(id);
        return x !== undefined ? [label(x)] : [];
      });
      if (because.length > 0) return because;
      if (r.markers.includes('no-longer-builds')) return ['it no longer built'];
      if (r.markers.includes('no-longer-closes-gap')) return ['it no longer closed the gap'];
      return r.redo?.reverted === true ? ['it no longer passed its checks'] : [];
    };
    const nodes = this.runtimeOf(run).judgedModel?.model.nodes;
    return submitFeedbackTurn({
      stage: s.stage,
      accepted: s.items.filter((r) => r.status === 'accepted').map((r) => row(r)),
      rejected: s.items.filter((r) => isDeclinedOut(r)).map((r) => row(r)),
      shaky: s.items
        .filter((r) => isShaky(r))
        .map((r) => {
          // D2-57: a Shaky item Submit took out says which items' rework it rests on.
          const taker = (r.redo?.because ?? []).flatMap((id) => (byId.get(id) !== undefined ? [label(byId.get(id) as ItemRecord)] : []));
          return row(r, { ...(r.decline?.note !== undefined ? { note: r.decline.note } : {}), ...(taker.length > 0 ? { reliedOn: taker } : {}) });
        }),
      redo: s.items.filter((r) => r.status === 'to-be-redone' && !isShaky(r)).map((r) => row(r, { reliedOn: reliedOn(r) })),
      steps: steps.map((x) => ({ id: x.target, sentence: nodes?.get(x.target)?.node.naturalName ?? x.target })),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Recovery (§2.6, §3.11): a review write found in flight

  /**
   * A `decide` or `submit-take-out` write that a crash interrupted (recover() reverted ws/ to `head`): run again on the
   * records and the stage judgement computed again, through the write queue (D2-51: it is idempotent). True when it was
   * made (fully), false when it was not (no judgement to read, or the rules refuse it now): nothing of it is recorded.
   */
  protected override async replayWrite(run: ActiveRun, write: SessionWrite): Promise<boolean> {
    if (write.kind !== 'decide' && write.kind !== 'submit-take-out') return false;
    if (this.reviewRefusal(run) !== undefined) return false;
    const action = write.kind === 'decide' ? write.action : undefined;
    const items = write.kind === 'submit-take-out' ? write.items : [];
    const made = await this.enqueueWrite(run, async () => {
      if (action !== undefined) return (await this.carryOut(run, action)).moved;
      const before = this.sessionOf(run).head;
      const took = await this.submitTakeOut(run, items);
      return took.ok && this.sessionOf(run).head !== before;
    });
    if (!made) this.log('warn', `a ${write.kind} write found in flight was not made again: the rules refuse it now`);
    return made;
  }
}

/**
 * §3.10 step 1: the end confirmation's check id, a hash of F's files key and the item statuses (each item's id, rev,
 * status, content key and decline option). Apply checks it again, so a status or ws/ change since refuses it (2f).
 */
export function confirmationCheckId(s: Pick<PersistedSession, 'items'>, filesKey: string): string {
  const statuses = s.items.map((r) => [r.id, r.rev, r.status, r.fingerprint, r.decline?.option ?? '']);
  return `ck${sha256Text(JSON.stringify([filesKey, statuses])).slice(0, 16)}`;
}

/** A review write refused while it was planned (a merge that conflicts): nothing was written. */
class ItemWriteRefusal extends Error {
  constructor(
    readonly code: 'refused' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

/**
 * D2-33 (2f): the positions a review action sets, by card (null: the card has none any more), or undefined when it moves
 * nothing: a move its `after`; the Undo of a move (now on top of `undone`) its `before`; the Redo of one (now on top of
 * `done`) its `after`.
 */
function movedPositions(out: ReviewOk, action: ReviewAction | undefined): Readonly<Record<string, { x: number; y: number } | null>> | undefined {
  if (action === undefined) return undefined;
  if (action.kind === 'move') return action.after;
  // An Undo moves the action itself to `undone`; a Redo sends it again through the reducer, which records it anew (a new id).
  const top = action.kind === 'undo' ? out.stack.undone.at(-1) : action.kind === 'redo' ? out.stack.done.at(-1) : undefined;
  if (top?.kind !== 'move' || (action.kind === 'undo' && top.id !== action.step)) return undefined;
  return action.kind === 'undo' ? top.before : top.after;
}

function copyCascade(c: CascadeEntry): CascadeEntry {
  return { item: c.item, to: c.to, why: c.why };
}
