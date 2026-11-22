/**
 * Slice 2a2 (docs/slice2-plan.md section 4.6): statuses, cascades, groups (RV-8) and the session stack (UN-4–UN-6).
 *
 * `reduceReview(state, action, at)` applies one review action to copies of the records and returns every effect: the
 * records, the questions and declined arrows it changed, Show results' force, the stack, the texts, and the ws/ changes
 * the runner carries out through the write queue (`ItemWrite`). The runner calls it only in a stage: while a step runs,
 * every action is refused before it (D2-62).
 *
 * The rules (the table of §4.6, §3.6, D2-28, D2-48, D2-59, D2-60, D2-64, D2-73):
 *  - Accept: from in review only; every dependency outside the item's SCC accepted (a dependency on a hidden Result's
 *    part makes it wait for the results); an RV-7 item only by its own Accept (`own`, never inferred from a count); a
 *    Result or a Result's part only while the results are shown; never under the "did not pass" heading, never while
 *    its facts are missing (ADV-3), and a Result only once telelean judged it (`judged`, V2A-S5). An Add premise takes
 *    its hold-as choice (never a default); one written in review (a converted v1 ghost) only as an axiom.
 *  - Reject and the plain decline (arrow items: DO-0): the content goes, with every dependent, transitively, that is in
 *    review, to be redone, declined Shaky or accepted: to be redone, reverted. Its key joins `rejectedFingerprints` (a
 *    premise's draft key too), an arrow's ends `rejectedArrows`; DO-0 also takes the arrow's source out of every question
 *    that selected it (`questionArrows`) and makes that Result to be redone. (DO-0's "a card Claude added at either end
 *    is declined with its items" waits for slice 3: no slice-2 step adds a card.) Shaky: nothing leaves ws/; dependents
 *    in review or accepted become to be redone, not reverted. Transform is refused until slice 4.
 *  - Back to review: an accepted item, with its accepted dependents; a Shaky one; un-reject (the inverse merge of the
 *    decision commit brings back everything it took out: the dependents come back to be redone without revert when
 *    nothing else keeps them out, and what must stay out is taken out again after the merge, V2A-C2; a premise's
 *    un-reject merges nothing); an item to be redone only while its content is in ws/. An item whose content a cascade
 *    took out before it was declined keeps `redo` (reverted), and comes back to be redone, not in review.
 *  - Taking an Accept away asks first (`needs-confirmation`): while the results are shown, when accepted dependents lose
 *    theirs; while they are hidden, always, reading only listed statuses (D2-64).
 *  - An action that shows the results applies D2-23 with `classes`; when its returns would hide them again, telelean's
 *    `decided` force keeps them shown (ADV-1). One that makes a meaning item undecided ends Show results' force. Both
 *    are recorded, so Undo puts them back.
 *  - A hidden item's rev and state never change an answer (D2-64, V2A-S2): a request naming one is refused with "show
 *    them first" whatever rev it carries, and an Undo leaves a hidden item that a judge changed since, or whose
 *    restored Accept the rules now refuse, as it is, silently.
 *  - Undo restores the effects its action recorded once the listed items' revs and decisions are still what it left
 *    (else `conflict`) and the restored statuses pass the rules (RV-5, RV-7's own Accept whatever its kind, D2-8, "did
 *    not pass"); taking an Accept away gets RV-5's list as by hand. Redo sends the recorded request again through the
 *    rules, never a recorded state, and is refused when they now leave any of it. Every new action, a seal included,
 *    clears Redo; a seal stops Undo.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import type { ArrowEnds } from '../actions.js';
import type { CanvasPosition } from '../layout.js';
import { premiseDraftKey } from './items.js';
import { parseItemKey } from './keys.js';
import {
  applyItemState,
  cloneRecord,
  decisionKey,
  fallbackLabel,
  inWorkingCopy,
  isArrowKind,
  isDeclinedOut,
  isReverted,
  isUndecided,
  itemStateOf,
  resultTargetOf,
} from './records.js';
import { isMeaningItem, isResultOrPart, resultsState } from './reveal.js';
import { componentOf } from './scc.js';
import { REVIEW_TEXTS } from './texts.js';
import type {
  CascadeEntry,
  DeclineOption,
  GroupItem,
  GroupLeftReason,
  ItemClass,
  ItemDecision,
  ItemRecord,
  ItemState,
  ItemWrite,
  ReviewAction,
  ReviewOutcome,
  ReviewState,
  SealBy,
  SessionAction,
  SessionForce,
  SessionInference,
} from './types.js';

type Ok = Extract<ReviewOutcome, { ok: true }>;
type DecideAction = Extract<SessionAction, { kind: 'decide' }>;
type RevealAction = Extract<SessionAction, { kind: 'reveal' }>;
type Change = DecideAction['changes'][number];

const refused = (error: string, item?: string): ReviewOutcome => ({ ok: false, code: 'refused', error, ...(item !== undefined ? { item } : {}) });
const conflict = (error: string, item?: string): ReviewOutcome => ({ ok: false, code: 'conflict', error, ...(item !== undefined ? { item } : {}) });

/** A class the judgement did not give: every badge (fail closed, D2-25). */
const UNKNOWN_CLASS: ItemClass = { belief: true, changesProved: true, reasons: [], complete: false };
const sameArrow = (a: ArrowEnds, b: ArrowEnds) => a.source === b.source && a.target === b.target;
const sameForce = (a: SessionForce | null, b: SessionForce) => a !== null && a.via === b.via && a.at === b.at;
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

/** The working state of one action: copies of the records and of the session parts an action may change. */
class Work {
  readonly items: ItemRecord[];
  readonly byId: Map<string, ItemRecord>;
  inferences: SessionInference[];
  rejectedArrows: ArrowEnds[];
  forced: SessionForce | null;
  /** The first state (and rev) of every item the action touched. */
  readonly start = new Map<string, { rev: number; state: ItemState }>();
  /** Why a dependent's status changed (CascadeEntry.why), by item id. */
  readonly why = new Map<string, string>();
  readonly questions: DecideAction['questions'] = [];
  readonly arrowsAdded: ArrowEnds[] = [];
  readonly arrowsRemoved: ArrowEnds[] = [];
  /** Items D2-23 returned to review (their badges grew). */
  readonly grew: string[] = [];
  /** Items whose content an inverse merge or an inverted commit brings back but whose status keeps it out (V2A-C2). */
  readonly keepOut = new Set<string>();
  /**
   * Written Add premises an inverse merge or an inverted commit writes again, their card and written key back on their
   * records (`ItemWrite.reapply`), and those it brings back that their status keeps out (`ItemWrite.premises.takeOut`,
   * after the merge): builder 2b1a, carry-overs R1-1 (un-reject) and R1-2 (Undo of Show results).
   */
  readonly premisesBack = new Set<string>();
  readonly premisesOut = new Set<string>();
  /**
   * What the request's un-rejects' inverse merges bring back, by item id (builder 2b1b, carry-over R1-F1): `written`, the
   * declining action's `takenOut` entry of a written Add premise among them; `back`, whether an un-reject brought the
   * item back from taken out (to be redone without revert, D2-60). Where each goes (back, or out again after the merge)
   * is decided by `settleMergedBack` once every decline and back to review of the request is applied, from the status
   * it ends with: a decline later in the same request may keep it out.
   */
  readonly mergedBack = new Map<string, { written?: TakenOut; back: boolean }>();
  /** ADV-3: some class of the stage judgement lacks its facts: no badge comparison reads the classes (D2-23). */
  readonly partialClasses: boolean;
  private readonly dependentsOf = new Map<string, string[]>();
  private readonly component: Map<string, number>;

  constructor(readonly state: ReviewState) {
    this.items = state.items.map(cloneRecord);
    this.byId = new Map(this.items.map((r) => [r.id, r]));
    this.inferences = state.inferences.map((inf) => ({ ...inf, question: { sources: [...inf.question.sources], fromNothing: inf.question.fromNothing }, steps: [...inf.steps] }));
    this.rejectedArrows = state.rejectedArrows.map((a) => ({ ...a }));
    this.forced = state.forced;
    this.partialClasses = [...Object.values(state.classes), ...Object.values(state.classesBeforeReveal)].some((c) => c.factsMissing === true);
    for (const r of this.items) {
      for (const d of this.deps(r.id)) {
        const list = this.dependentsOf.get(d) ?? [];
        list.push(r.id);
        this.dependentsOf.set(d, list);
      }
    }
    this.component = componentOf(
      this.items.map((r) => r.id),
      (id) => this.deps(id),
    );
  }

  deps(id: string): readonly string[] {
    return Object.hasOwn(this.state.deps, id) ? (this.state.deps[id] ?? []) : [];
  }

  /** The dependencies outside the item's SCC (D2-26). */
  outside(id: string): string[] {
    const own = this.component.get(id);
    return this.deps(id).filter((d) => this.component.get(d) !== own || own === undefined);
  }

  /** Every item that depends on `id`, transitively (`id` itself left out). */
  dependents(id: string): string[] {
    const seen = new Set([id]);
    const out: string[] = [];
    const queue = [id];
    for (let k = 0; k < queue.length; k++) {
      for (const d of this.dependentsOf.get(queue[k] as string) ?? []) {
        if (seen.has(d)) continue;
        seen.add(d);
        out.push(d);
        queue.push(d);
      }
    }
    return out;
  }

  /** The record, its first state remembered before the action changes it. */
  touch(id: string): ItemRecord {
    const r = this.byId.get(id) as ItemRecord;
    if (!this.start.has(id)) this.start.set(id, { rev: r.rev, state: itemStateOf(r) });
    return r;
  }

  reveal() {
    return resultsState({ items: this.items, classesBeforeReveal: this.state.classesBeforeReveal, forced: this.forced });
  }

  classOf(r: ItemRecord, shown: boolean): ItemClass {
    const map = shown ? this.state.classes : this.state.classesBeforeReveal;
    return (Object.hasOwn(map, r.key) ? map[r.key] : undefined) ?? UNKNOWN_CLASS;
  }

  label(id: string): string {
    const given = this.state.labels !== undefined && Object.hasOwn(this.state.labels, id) ? this.state.labels[id] : undefined;
    if (given !== undefined) return given;
    const r = this.byId.get(id);
    return r === undefined ? id : fallbackLabel(r);
  }

  /** The ids whose state the action changed (markers included), in the records' order. */
  changed(): string[] {
    return this.items
      .filter((r) => {
        const first = this.start.get(r.id);
        if (first === undefined) return false;
        const now = itemStateOf(r);
        return decisionKey(now) !== decisionKey(first.state) || now.markers.join('\u0000') !== first.state.markers.join('\u0000');
      })
      .map((r) => r.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Groups (RV-8)

/** RV-8 (§4.6; 2a2): the greatest set a group Accept takes, and what it leaves, with why. */
export function planGroupAccept(items: readonly GroupItem[], selected: readonly string[]): { take: string[]; left: Array<{ item: string; reason: GroupLeftReason }> } {
  const byId = new Map(items.map((g) => [g.id, g]));
  const component = componentOf(
    items.map((g) => g.id),
    (id) => byId.get(id)?.dependsOn ?? [],
  );
  const chosen = [...new Set(selected)];
  const left: Array<{ item: string; reason: GroupLeftReason }> = [];
  const take = new Set<string>();
  for (const id of chosen) {
    const g = byId.get(id);
    if (g === undefined) left.push({ item: id, reason: 'not-in-review' });
    else if (g.hidden) left.push({ item: id, reason: 'hidden-result' });
    else if (g.status !== 'in-review') left.push({ item: id, reason: 'not-in-review' });
    else if (g.ownAccept) left.push({ item: id, reason: 'own-accept' });
    else if (g.blocked) left.push({ item: id, reason: 'blocked' });
    else take.add(id);
  }
  // The greatest fixpoint: drop a candidate with a dependency outside its SCC that is neither accepted nor taken.
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of [...take]) {
      const g = byId.get(id) as GroupItem;
      const own = component.get(id);
      const blocked = g.dependsOn.some((d) => component.get(d) !== own && byId.get(d)?.status !== 'accepted' && !take.has(d));
      if (!blocked) continue;
      take.delete(id);
      changed = true;
    }
  }
  for (const id of chosen) if (byId.has(id) && !take.has(id) && !left.some((l) => l.item === id)) left.push({ item: id, reason: 'depends' });
  return { take: chosen.filter((id) => take.has(id)), left };
}

/**
 * RV-8 (§4.6; 2a2): one option for every selected item, `plain` for arrow items; hidden Results are left, and so is
 * an item that is no arrow item when the option is `plain` (`needs-option`, V2A-N2).
 */
export function planGroupDecline(
  items: readonly GroupItem[],
  selected: readonly string[],
  option: DeclineOption,
): { decisions: Array<{ item: string; option: DeclineOption }>; left: Array<{ item: string; reason: GroupLeftReason }> } {
  const byId = new Map(items.map((g) => [g.id, g]));
  const decisions: Array<{ item: string; option: DeclineOption }> = [];
  const left: Array<{ item: string; reason: GroupLeftReason }> = [];
  for (const id of [...new Set(selected)]) {
    const g = byId.get(id);
    if (g === undefined) left.push({ item: id, reason: 'not-in-review' });
    else if (g.hidden) left.push({ item: id, reason: 'hidden-result' });
    else if (g.status === 'declined' || g.status === 'withdrawn' || g.status === null) left.push({ item: id, reason: 'not-in-review' });
    else if (g.arrow) decisions.push({ item: id, option: 'plain' });
    else if (option === 'plain') left.push({ item: id, reason: 'needs-option' });
    else decisions.push({ item: id, option });
  }
  return { decisions, left };
}

// ---------------------------------------------------------------------------------------------
// The rules, on one Work

/** The item is hidden: a Result or a Result's part while the results are hidden. */
const hiddenIn = (shown: boolean) => (r: ItemRecord) => !shown && isResultOrPart(r);

/**
 * Whether an Accept of `r` may go now (§4.5, §4.6): `missing` the listed dependencies outside its SCC that are not
 * accepted; `waits` when it depends on a hidden item. Its RV-7 class and status are the caller's.
 */
function dependencyGate(w: Work, r: ItemRecord, shown: boolean): { missing: string[]; waits: boolean } {
  const hidden = hiddenIn(shown);
  const missing: string[] = [];
  let waits = false;
  for (const d of w.outside(r.id)) {
    const dep = w.byId.get(d);
    if (dep === undefined) continue;
    if (hidden(dep)) waits = true;
    else if (dep.status !== 'accepted') missing.push(d);
  }
  return { missing, waits };
}

/**
 * Why an Accept of `r` is blocked now for a reason other than its dependencies, in the order the own Accept checks
 * them: the "did not pass" heading, its facts missing (ADV-3; when the state's probe failed, the cause and what to do,
 * 2b2, AP30-5), a Result telelean has not judged (V2A-S5).
 */
function blockedBy(w: Work, r: ItemRecord, shown: boolean): string | undefined {
  if (w.state.didNotPass) return REVIEW_TEXTS.acceptDidNotPass;
  const cls = w.classOf(r, shown);
  // 2b2 (§2.1, AP30-5): a failed probe is no file that did not build: no check is coming that would lift it.
  if (cls.factsMissing === true && cls.probeFailure !== undefined) return REVIEW_TEXTS.acceptProbeFailed(cls.probeFailure);
  if (cls.factsMissing === true) return REVIEW_TEXTS.acceptFactsMissing(w.label(r.id));
  if (r.kind === 'result' && r.judged === undefined) return REVIEW_TEXTS.resultNotJudged(w.label(r.id));
  return undefined;
}

/** A GroupItem of a record (the host's side of RV-8). */
function groupItemOf(w: Work, r: ItemRecord, shown: boolean): GroupItem {
  const cls = w.classOf(r, shown);
  const gate = dependencyGate(w, r, shown);
  return {
    id: r.id,
    status: r.status,
    dependsOn: [...w.deps(r.id)],
    ownAccept: cls.belief || cls.changesProved,
    hidden: hiddenIn(shown)(r),
    blocked: blockedBy(w, r, shown) !== undefined || gate.waits,
    arrow: isArrowKind(r.kind),
  };
}

/** The refusal text of a reason a group left an item, or a Redo the rules now refuse (AF13). */
function leftText(w: Work, id: string, reason: GroupLeftReason, shown: boolean): string {
  const r = w.byId.get(id);
  const label = w.label(id);
  if (r === undefined) return REVIEW_TEXTS.conflict(label);
  switch (reason) {
    case 'hidden-result':
      return REVIEW_TEXTS.showResultsFirst;
    case 'not-in-review':
      return REVIEW_TEXTS.leftNotInReview(label);
    case 'own-accept': {
      const cls = w.classOf(r, shown);
      return cls.belief ? REVIEW_TEXTS.leftOwnAccept(label) : REVIEW_TEXTS.leftOwnAcceptProved(label);
    }
    case 'blocked':
      return blockedBy(w, r, shown) ?? REVIEW_TEXTS.acceptWaitsForResults(label);
    case 'depends':
      return REVIEW_TEXTS.acceptNeedsDependencies(
        label,
        dependencyGate(w, r, shown).missing.map((d) => w.label(d)),
      );
    case 'needs-option':
      // Carry-over R1-5: the one text of this left reason (a single plain decline is refused with `plainOnlyArrows`).
      return REVIEW_TEXTS.leftNeedsOption(label);
  }
}

/** Reject, plain decline, a judge's revert: the dependents, transitively, that the content takes down (D2-28). */
function cascadeOut(w: Work, from: string): void {
  for (const id of w.dependents(from)) {
    const x = w.byId.get(id) as ItemRecord;
    const goes = x.status === 'in-review' || x.status === 'accepted' || x.status === 'to-be-redone' || (x.status === 'declined' && x.decline?.option === 'shaky');
    if (!goes) continue;
    w.touch(id);
    x.status = 'to-be-redone';
    delete x.accepted;
    // A Shaky dependent keeps its decline and note: it is still quoted under SHAKY at Submit review (§3.7).
    if (x.decline?.option !== 'shaky') delete x.decline;
    x.redo = { because: union(x.redo?.because ?? [], [from]), reverted: true };
    if (!w.why.has(id)) w.why.set(id, REVIEW_TEXTS.cascadeWhy(w.label(from)));
  }
}

/** Shaky (D2-48): dependents in review or accepted become to be redone, their content kept. */
function cascadeShaky(w: Work, from: string): void {
  for (const id of w.dependents(from)) {
    const x = w.byId.get(id) as ItemRecord;
    if (x.status !== 'in-review' && x.status !== 'accepted') continue;
    w.touch(id);
    x.status = 'to-be-redone';
    delete x.accepted;
    x.redo = { because: [from], reverted: false };
    if (!w.why.has(id)) w.why.set(id, REVIEW_TEXTS.cascadeWhy(w.label(from)));
  }
}

/** Back to review (RV-5): the accepted dependents return to review with it. */
function cascadeBack(w: Work, from: string, why?: string): void {
  for (const id of w.dependents(from)) {
    const x = w.byId.get(id) as ItemRecord;
    if (x.status !== 'accepted') continue;
    w.touch(id);
    x.status = 'in-review';
    delete x.accepted;
    if (!w.why.has(id)) w.why.set(id, why ?? REVIEW_TEXTS.cascadeWhy(w.label(from)));
  }
}

/**
 * The items a decide action carried out: those of its request that it changed (a group's left items are not). Exported
 * for the view (fixer 2c2 r1, C-V2C2-C4): an Undo or Redo of an action that decided an item hidden now is refused (D2-8),
 * so the view offers none.
 */
export function decidedBy(action: Extract<SessionAction, { kind: 'decide' }>): string[] {
  const changed = new Set(action.changes.map((c) => c.item));
  return action.request.decisions.map((d) => d.item).filter((id) => changed.has(id));
}

/** An Add premise's sentence (its card's, once written): its draft's, else its key's Lean name. */
function premiseSentence(r: ItemRecord): string {
  if (r.content.premise !== undefined) return r.content.premise.naturalName;
  const parsed = parseItemKey(r.key);
  return parsed?.kind === 'premise' ? parsed.leanName : r.key;
}

/** The keys a decline rejects (DO-1): the content key, and a premise's draft key (§4.3). */
function rejectedKeysOf(r: ItemRecord): string[] {
  return union([r.fingerprint], r.kind === 'add-premise' && r.content.premise !== undefined ? [premiseDraftKey(r.content.premise)] : []);
}

function arrowOf(r: ItemRecord): ArrowEnds | undefined {
  if (r.content.arrow !== undefined) return r.content.arrow;
  const parsed = parseItemKey(r.key);
  return parsed?.kind === 'arrow' || parsed?.kind === 'unarrow' ? parsed.arrow : undefined;
}

/**
 * The items whose content a change took out of ws/ (in ws/ before, out after): what the action's commits removed, so
 * what their inverse brings back. Written premises are read from the action's `takenOut` instead, which the runner
 * fills with the premises its write took out (§3.8), never here.
 */
function takenOutIn(w: Work, changes: readonly Change[]): string[] {
  const out: string[] = [];
  for (const c of changes) {
    const r = w.byId.get(c.item);
    if (r === undefined || r.kind === 'add-premise') continue;
    if (inWorkingCopy(r.kind, c.before, r.card) && !inWorkingCopy(r.kind, c.after, r.card, c.before)) out.push(c.item);
  }
  return out;
}

/** A written Add premise an action's write took out (§3.8): its card, written key and ledger entries. */
type TakenOut = DecideAction['takenOut'][number];

/**
 * V2A-C2: what the decision commit that declined `r` took out, read from the action on the stack that declined it (the
 * newest done one that left it declined): its inverse merge brings all of it back, the written Add premises its write
 * took out included (`premises`, from the action's `takenOut`: builder 2b1a, carry-over R1-1). Undefined when no such
 * action is on the stack. `mixed` (fixer 2b1b r1, S-F5): that action also un-rejected another item, whose merge its
 * commit holds too, so its inverse would take that item's content out again while its record keeps it in.
 */
function mergedBackBy(w: Work, r: ItemRecord): { items: Set<string>; premises: Map<string, TakenOut>; mixed: boolean } | undefined {
  const done = w.state.stack.done;
  for (let k = done.length - 1; k >= 0; k--) {
    const action = done[k];
    if (action?.kind !== 'decide') continue;
    const c = action.changes.find((x) => x.item === r.id);
    if (c === undefined || !isDeclinedOut(c.after)) continue;
    const premises = new Map(action.takenOut.map((t) => [t.item, t]));
    const mixed = action.changes.some((x) => x.item !== r.id && isDeclinedOut(x.before) && !isDeclinedOut(x.after));
    return { items: new Set([...takenOutIn(w, action.changes), ...premises.keys()]), premises, mixed };
  }
  return undefined;
}

/** A decline (§4.6's table, §3.6, DO-0, DO-1, DO-3). Returns the refusal, if any. */
function decline(w: Work, d: ItemDecision, shown: boolean, at: string): ReviewOutcome | undefined {
  const r = w.byId.get(d.item) as ItemRecord;
  const label = w.label(r.id);
  if (hiddenIn(shown)(r)) return refused(REVIEW_TEXTS.showResultsFirst, r.id);
  const arrow = isArrowKind(r.kind);
  const option: DeclineOption | undefined = arrow ? 'plain' : d.option;
  if (option === 'transform') return refused(REVIEW_TEXTS.transformLater, r.id);
  if (option === undefined || option === 'plain') {
    if (!arrow) return refused(REVIEW_TEXTS.plainOnlyArrows(label), r.id);
  }
  if (r.status === 'declined') return refused(REVIEW_TEXTS.declinedAlready(label), r.id);
  if (r.status === 'withdrawn') return refused(REVIEW_TEXTS.withdrawnStays(label), r.id);
  const chosen = option as DeclineOption;
  w.touch(r.id);
  const reverted = isReverted(r);
  r.status = 'declined';
  const note = chosen === 'shaky' && d.note !== undefined && d.note.trim() !== '' ? d.note : undefined;
  r.decline = { option: chosen, ...(note !== undefined ? { note } : {}), at };
  delete r.accepted;
  // Content a cascade took out stays out: the record keeps `redo`, so un-reject returns it to be redone (D2-60).
  if (!reverted) delete r.redo;
  if (chosen === 'shaky') {
    cascadeShaky(w, r.id);
    return undefined;
  }
  r.rejectedFingerprints = union(r.rejectedFingerprints, rejectedKeysOf(r));
  cascadeOut(w, r.id);
  if (!arrow) return undefined;
  // DO-0: the arrow is never proposed again, and leaves every question that selected it (D2-59).
  const ends = arrowOf(r);
  if (ends === undefined) return undefined;
  if (!w.rejectedArrows.some((a) => sameArrow(a, ends))) {
    w.rejectedArrows.push({ ...ends });
    w.arrowsAdded.push({ ...ends });
  }
  for (const [resultId, arrows] of Object.entries(w.state.questionArrows)) {
    if (!arrows.includes(r.id)) continue;
    const result = w.byId.get(resultId);
    const target = result === undefined ? undefined : resultTargetOf(result);
    const inference = target === undefined ? undefined : w.inferences.find((inf) => inf.target === target);
    if (result === undefined || inference === undefined || !inference.question.sources.includes(ends.source)) continue;
    const before = { sources: [...inference.question.sources], fromNothing: inference.question.fromNothing };
    inference.question = { sources: inference.question.sources.filter((s) => s !== ends.source), fromNothing: inference.question.fromNothing };
    w.questions.push({ target: inference.target, before, after: { sources: [...inference.question.sources], fromNothing: inference.question.fromNothing } });
    // Reverted only if its proof uses the arrow (then the cascade above took it out already). Its content stays, so
    // what depends on it follows as after a Shaky decline (D2-48).
    if (result.status === 'in-review' || result.status === 'accepted' || (result.status === 'declined' && result.decline?.option === 'shaky')) {
      w.touch(result.id);
      result.status = 'to-be-redone';
      delete result.accepted;
      if (result.decline?.option !== 'shaky') delete result.decline;
      result.redo = { because: [r.id], reverted: false };
      w.why.set(result.id, REVIEW_TEXTS.leftQuestion(ends.source, inference.target));
      cascadeShaky(w, result.id);
    }
  }
  return undefined;
}

/** Back to review (§4.6's table): an Accept taken back, a Shaky decline, un-reject, an item to be redone. */
function backToReview(w: Work, d: ItemDecision, shown: boolean): ReviewOutcome | undefined {
  const r = w.byId.get(d.item) as ItemRecord;
  const label = w.label(r.id);
  if (hiddenIn(shown)(r)) return refused(REVIEW_TEXTS.showResultsFirst, r.id);
  switch (r.status) {
    case 'in-review':
      return undefined;
    case 'withdrawn':
      return refused(REVIEW_TEXTS.withdrawnStays(label), r.id);
    case 'to-be-redone':
      if (isReverted(r)) return refused(REVIEW_TEXTS.contentTakenOut, r.id);
      w.touch(r.id);
      r.status = 'in-review';
      delete r.redo;
      delete r.decline;
      return undefined;
    case 'accepted':
      w.touch(r.id);
      r.status = 'in-review';
      delete r.accepted;
      cascadeBack(w, r.id);
      return undefined;
    case 'declined': {
      w.touch(r.id);
      const unreject = isDeclinedOut(r);
      delete r.decline;
      // Content a cascade took out before the decline stays out: back to be redone, not in review (D2-60).
      r.status = isReverted(r) ? 'to-be-redone' : 'in-review';
      if (!unreject) return undefined;
      const keys = new Set(rejectedKeysOf(r));
      r.rejectedFingerprints = r.rejectedFingerprints.filter((k) => !keys.has(k));
      const ends = isArrowKind(r.kind) ? arrowOf(r) : undefined;
      if (ends !== undefined && w.rejectedArrows.some((a) => sameArrow(a, ends))) {
        w.rejectedArrows = w.rejectedArrows.filter((a) => !sameArrow(a, ends));
        w.arrowsRemoved.push({ ...ends });
      }
      // An Add premise's un-reject merges nothing: in review, it is outside ws/ (AF2).
      if (r.kind === 'add-premise') return undefined;
      // V2A-C2: the inverse merge brings back everything the decision commit took out. A dependent comes back to be
      // redone without revert (D2-60) when this item comes back and no other item that took it out is still out;
      // everything else it brings back that must stay out is taken out again after the merge (`ItemWrite.revert`).
      // Without the declining action on the stack, nothing is brought back but this item (fail closed).
      const merged = mergedBackBy(w, r);
      // Fixer 2b1b r1 (S-F5): the decision that declined it also un-rejected another item (a mixed request, which no
      // client sends, §5.7): inverting its whole commit would take that item's merged-back content out again while its
      // record keeps it in ws/. Refused (fail closed); Undo of that decision undoes both together.
      if (merged?.mixed === true) return refused(REVIEW_TEXTS.unrejectMixed(label), r.id);
      const candidates = merged?.items ?? new Set(w.items.filter((x) => isReverted(x) && (x.redo?.because ?? []).includes(r.id)).map((x) => x.id));
      const back = r.status === 'in-review';
      for (const x of w.items) {
        if (x.id === r.id || !candidates.has(x.id)) continue;
        // R1-1: a written Add premise the decision commit took out comes back with the merge too: its card, arrow and
        // mark removal (and its completion) are in ws/ again, but not its ledger entries. One written again since (its
        // record holds a card) is left as it is: the merge of its old take-out either changes nothing (the same write)
        // or meets the new write's lines, a merge conflict that refuses the un-reject (§3.6).
        const written = x.card === undefined ? merged?.premises.get(x.id) : undefined;
        if (written !== undefined) w.touch(x.id);
        let cameBack = false;
        if (merged !== undefined && back && x.status === 'to-be-redone' && isReverted(x)) {
          const rest = (x.redo?.because ?? []).filter((id) => id !== r.id);
          const stillOut = rest.some((id) => {
            const taker = w.byId.get(id);
            return taker !== undefined && (isDeclinedOut(taker) || isReverted(taker));
          });
          w.touch(x.id);
          if (!stillOut) {
            x.redo = { because: x.redo?.because ?? [r.id], reverted: false };
            if (!w.why.has(x.id)) w.why.set(x.id, REVIEW_TEXTS.cascadeWhy(label));
            cameBack = true;
          } else x.redo = { because: rest, reverted: true };
        }
        // Builder 2b1b (carry-over R1-F1): whether the merge's content stays or goes again is decided only once every
        // decline and back to review of the request is applied (`settleMergedBack`), from the status the item ends
        // with: a Reject later in the same request may take back out what this merge brings back.
        const known = w.mergedBack.get(x.id);
        const entry = written ?? known?.written;
        w.mergedBack.set(x.id, { ...(entry !== undefined ? { written: entry } : {}), back: cameBack || known?.back === true });
      }
      return undefined;
    }
  }
}

/**
 * Builder 2b1b (carry-over R1-F1): where what the request's un-reject merges bring back goes, decided once every decline
 * and back to review of the request is applied, from the status each item ends with (`decide` calls it after them).
 * Before, each un-reject decided at once, so a Reject later in the same request (of an item a merged-back premise or
 * declaration also rests on, or of the premise itself) left the premise written, with its card and ledger entries back
 * in ws/ and no Accept standing, and the declaration's content in ws/ while it was taken out.
 *  - A written Add premise (the declining action's `takenOut` entry) that an un-reject of the request brought back (to
 *    be redone without revert, D2-60) and whose status still keeps it in ws/ (to be redone without revert, or declined
 *    Shaky; never in review, since it was not written when the action started, §3.8): written again, its card and
 *    written key back on its record, in `reapply`, the runner putting back that entry's ledger entries (R1-1). Any other
 *    (kept out, declined, back in review, or unwritten and to be redone with its draft kept before the request): its
 *    record takes only the card, for the take-out after the merge (`premises.takeOut`), and keeps its pre-merge key, so
 *    a Reject of it in the same request rejects that key, never the written one.
 *  - Anything else whose status keeps it out is taken out again after the merge (`revert`, V2A-C2).
 */
function settleMergedBack(w: Work): void {
  for (const [id, merged] of w.mergedBack) {
    const x = w.byId.get(id) as ItemRecord;
    const written = merged.written;
    if (written === undefined) {
      if (!inWorkingCopy(x.kind, x, x.card)) w.keepOut.add(id);
      continue;
    }
    x.card = written.card;
    if (merged.back && x.status !== 'in-review' && inWorkingCopy(x.kind, x, written.card)) {
      x.fingerprint = written.fingerprint;
      w.premisesBack.add(id);
    } else w.premisesOut.add(id);
  }
}

/** Accepts `r` (its status, rules and hold-as were checked). A Result records what telelean judged (`judged`). */
function accept(w: Work, r: ItemRecord, d: ItemDecision, how: 'own' | 'group', shown: boolean, at: string): void {
  w.touch(r.id);
  const cls = w.classOf(r, shown);
  r.status = 'accepted';
  delete r.decline;
  delete r.redo;
  const judged = r.kind === 'result' ? r.judged : undefined;
  r.accepted = {
    how,
    fingerprint: r.fingerprint,
    belief: cls.belief,
    changesProved: cls.changesProved,
    at,
    ...(judged !== undefined ? { result: { verdict: judged.verdict, restsOn: [...judged.restsOn] } } : {}),
    ...(r.kind === 'add-premise' && d.holdAs !== undefined
      ? { holdAs: d.holdAs, ...(d.rationale !== undefined && d.rationale.trim() !== '' ? { rationale: d.rationale } : {}) }
      : {}),
  };
}

/** An own Accept's checks (§4.6's first row, §3.8), in the order `acceptGate` reports them. */
function ownAcceptRefusal(w: Work, r: ItemRecord, d: ItemDecision, shown: boolean): ReviewOutcome | undefined {
  const label = w.label(r.id);
  if (hiddenIn(shown)(r)) return refused(REVIEW_TEXTS.showResultsFirst, r.id);
  if (r.status !== 'in-review') return refused(REVIEW_TEXTS.leftNotInReview(label), r.id);
  const blocked = blockedBy(w, r, shown);
  if (blocked !== undefined) return refused(blocked, r.id);
  const gate = dependencyGate(w, r, shown);
  if (gate.missing.length > 0)
    return refused(
      REVIEW_TEXTS.acceptNeedsDependencies(
        label,
        gate.missing.map((id) => w.label(id)),
      ),
      r.id,
    );
  if (gate.waits) return refused(REVIEW_TEXTS.acceptWaitsForResults(label), r.id);
  if (r.kind === 'add-premise') {
    const sentence = premiseSentence(r);
    if (d.holdAs === undefined) return refused(REVIEW_TEXTS.holdAsMissing(sentence), r.id);
    if (r.card !== undefined && d.holdAs === 'pending') return refused(REVIEW_TEXTS.writtenAsAxiom(sentence), r.id);
  }
  return undefined;
}

/** An accepted item's recorded badges no longer cover `cls` (RV-7: it needs its own Accept again, D2-23). */
const badgesGrewFor = (accepted: NonNullable<ItemRecord['accepted']>, cls: ItemClass) =>
  (cls.belief && !accepted.belief) || (cls.changesProved && !accepted.changesProved);

/** D2-23: when an action shows the results, `classes` is in force: accepted items whose badges grew return to review. */
function badgesGrew(w: Work): void {
  // ADV-3: classes judged without some facts are partial; the next full judgement's reconcile applies RV-7.
  if (w.partialClasses) return;
  for (const r of w.items) {
    if (r.status !== 'accepted' || r.accepted === undefined) continue;
    if (!badgesGrewFor(r.accepted, w.classOf(r, true))) continue;
    w.touch(r.id);
    r.status = 'in-review';
    delete r.accepted;
    w.grew.push(r.id);
    w.why.set(r.id, REVIEW_TEXTS.cascadeWhyOwnAccept);
    cascadeBack(w, r.id);
  }
}

/**
 * The action showed the results (§4.6): D2-23 with `classes`. Before it no meaning item was undecided, so when its
 * returns (with their RV-5 dependents) would hide the results again, telelean's `decided` force keeps them shown
 * (ADV-1): the person decided every meaning item, and nothing they decided changed. Returns the force it set.
 */
function showResults(w: Work, at: string): SessionForce | undefined {
  badgesGrew(w);
  if (w.grew.length === 0 || w.forced !== null || w.reveal().shown) return undefined;
  const force: SessionForce = { via: 'decided', at };
  w.forced = force;
  return force;
}

/** The ws/ changes of the items an action touched (§2.9 `ItemWrite`), or null when it touched none. */
function writeOf(w: Work, ids: readonly string[], action: number): ItemWrite | null {
  const write: ItemWrite = { action, revert: [], reapply: [], premises: { write: [], takeOut: [] } };
  for (const id of ids) {
    const r = w.byId.get(id) as ItemRecord;
    const first = w.start.get(id)?.state;
    if (first === undefined) continue;
    const before = inWorkingCopy(r.kind, first, r.card);
    const after = inWorkingCopy(r.kind, r, r.card, first);
    if (r.kind === 'add-premise') {
      if (first.status !== 'accepted' && r.status === 'accepted' && r.card === undefined) write.premises.write.push(id);
      if (before && !after) write.premises.takeOut.push(id);
      continue;
    }
    if (before && !after) write.revert.push(id);
    if (!before && after) write.reapply.push(id);
  }
  // What an inverse merge (or an inverted commit) brings back that must stay out, in the records' order (V2A-C2); the
  // written Add premises it writes again, and those it brings back that must stay out (R1-1, R1-2).
  for (const r of w.items) {
    if (w.keepOut.has(r.id) && !write.revert.includes(r.id)) write.revert.push(r.id);
    if (w.premisesBack.has(r.id) && !write.reapply.includes(r.id)) write.reapply.push(r.id);
    if (w.premisesOut.has(r.id) && !write.premises.takeOut.includes(r.id)) write.premises.takeOut.push(r.id);
  }
  const empty = write.revert.length + write.reapply.length + write.premises.write.length + write.premises.takeOut.length === 0;
  return empty ? null : write;
}

/** A meaning item became undecided (§4.7): it ends Show results' force. */
function anyBecameUndecided(w: Work, ids: readonly string[]): boolean {
  return ids.some((id) => {
    const r = w.byId.get(id) as ItemRecord;
    const first = w.start.get(id)?.state;
    return first !== undefined && isMeaningItem(r, w.state.classesBeforeReveal) && !isUndecided(first) && isUndecided(r);
  });
}

/** Accept items lose: those that were accepted when the action started and are not now. */
function lostAccepts(w: Work): string[] {
  return [...w.start]
    .filter(([id, first]) => first.state.status === 'accepted' && w.byId.get(id)?.status !== 'accepted')
    .map(([id]) => id);
}

/** CascadeEntries of listed items whose status changed besides the decided ones. */
function cascadeEntries(w: Work, ids: readonly string[], decided: ReadonlySet<string>, shown: boolean): CascadeEntry[] {
  const hidden = hiddenIn(shown);
  const out: CascadeEntry[] = [];
  for (const id of ids) {
    if (decided.has(id)) continue;
    const r = w.byId.get(id) as ItemRecord;
    if (hidden(r) || w.start.get(id)?.state.status === r.status) continue;
    out.push({ item: id, to: r.status, why: w.why.get(id) ?? REVIEW_TEXTS.cascadeWhy(w.label(id)) });
  }
  return out;
}

/** The confirmation an action that takes Accepts away asks first (§3.6, D2-64), or undefined. */
function confirmation(w: Work, decided: ReadonlySet<string>, shown: boolean): ReviewOutcome | undefined {
  const hidden = hiddenIn(shown);
  const lost = lostAccepts(w).filter((id) => !hidden(w.byId.get(id) as ItemRecord));
  const others = lost.filter((id) => !decided.has(id));
  const ask = shown ? others.length > 0 : lost.length > 0;
  if (!ask) return undefined;
  return {
    ok: false,
    code: 'needs-confirmation',
    cascade: cascadeEntries(w, others, decided, shown),
    ...(shown ? {} : { hiddenResults: true as const }),
  };
}

/** The events of an action's own effects (never about a hidden item): its unconfirmed cascade and D2-23. */
function actionEvents(w: Work, ids: readonly string[], decided: ReadonlySet<string>, shown: boolean): Ok['events'] {
  const hidden = hiddenIn(shown);
  const listed = (id: string) => !hidden(w.byId.get(id) as ItemRecord);
  const grew = new Set(w.grew);
  const redone = ids.filter((id) => {
    if (decided.has(id) || grew.has(id) || !listed(id)) return false;
    const first = w.start.get(id)?.state;
    return first !== undefined && first.status !== 'accepted' && first.status !== 'to-be-redone' && w.byId.get(id)?.status === 'to-be-redone';
  });
  const events: Ok['events'] = [];
  if (redone.length > 0) events.push({ text: REVIEW_TEXTS.eventRedoneWith, items: redone });
  const returned = w.grew.filter(listed);
  if (returned.length > 0) events.push({ text: REVIEW_TEXTS.eventBadgesGrew, items: returned });
  return events;
}

/** The stack label of a decide action. */
function decideLabel(w: Work, decisions: readonly ItemDecision[], taken: readonly string[]): string {
  const kinds = new Set(decisions.filter((d) => taken.includes(d.item)).map((d) => d.to));
  const n = taken.length;
  const first = taken[0] ?? '';
  if (kinds.size === 1 && kinds.has('accepted')) {
    if (n !== 1) return REVIEW_TEXTS.undoAcceptN(n);
    const r = w.byId.get(first) as ItemRecord;
    const holdAs = r.accepted?.holdAs;
    if (r.kind === 'add-premise' && holdAs !== undefined) return REVIEW_TEXTS.undoAcceptPremise(premiseSentence(r), holdAs);
    return REVIEW_TEXTS.undoAccept(w.label(first));
  }
  if (kinds.size === 1 && kinds.has('declined')) {
    const options = new Set(taken.map((id) => w.byId.get(id)?.decline?.option ?? 'reject'));
    const option = options.size === 1 ? ([...options][0] as DeclineOption) : 'reject';
    return n === 1 ? REVIEW_TEXTS.undoDecline(w.label(first), option) : REVIEW_TEXTS.undoDeclineN(n, option);
  }
  if (kinds.size === 1 && kinds.has('in-review')) return n === 1 ? REVIEW_TEXTS.undoBackToReview(w.label(first)) : REVIEW_TEXTS.undoBackToReviewN(n);
  return REVIEW_TEXTS.undoDecideN(n);
}

function copyDecision(d: ItemDecision): ItemDecision {
  return {
    item: d.item,
    rev: d.rev,
    to: d.to,
    ...(d.option !== undefined ? { option: d.option } : {}),
    ...(d.note !== undefined ? { note: d.note } : {}),
    ...(d.holdAs !== undefined ? { holdAs: d.holdAs } : {}),
    ...(d.rationale !== undefined ? { rationale: d.rationale } : {}),
  };
}

/** The changes of an action: every item it touched, with its rev and state before and after. */
function changesOf(w: Work, ids: readonly string[]): Change[] {
  return ids.map((item) => {
    const first = w.start.get(item) as { rev: number; state: ItemState };
    return { item, rev: first.rev, before: first.state, after: itemStateOf(w.byId.get(item) as ItemRecord) };
  });
}

/** An ok outcome that changes nothing (a group Accept that took nothing, a no-op). */
function unchanged(state: ReviewState, left: Ok['left'] = []): ReviewOutcome {
  return {
    ok: true,
    items: state.items.map(cloneRecord),
    inferences: state.inferences.map((inf) => ({ ...inf, question: { ...inf.question, sources: [...inf.question.sources] }, steps: [...inf.steps] })),
    rejectedArrows: state.rejectedArrows.map((a) => ({ ...a })),
    forced: state.forced,
    stack: state.stack,
    nextAction: state.nextAction,
    label: '',
    taken: [],
    left,
    cascade: [],
    events: [],
    write: null,
  };
}

// ---------------------------------------------------------------------------------------------
// The actions

interface DecideRequest {
  decisions: readonly ItemDecision[];
  own: boolean;
  confirmed: boolean;
}

/** decide (§4.6): accept, decline, back to review, un-reject; `redo`: Redo's re-run, which keeps the rest of `undone`. */
function decide(state: ReviewState, request: DecideRequest, at: string, redo: { undone: readonly SessionAction[] } | undefined): ReviewOutcome {
  const w = new Work(state);
  const shown = w.reveal().shown;
  const hidden = hiddenIn(shown);
  // The decisions, once each, against the version the user saw. A hidden item's rev is never compared: whatever rev a
  // request carries, it is refused or left below as hidden, so no answer tells whether it changed (D2-64, V2A-S2).
  const decisions: ItemDecision[] = [];
  for (const d of request.decisions) {
    if (decisions.some((x) => x.item === d.item)) continue;
    const r = w.byId.get(d.item);
    if (r === undefined) return conflict(REVIEW_TEXTS.conflict(d.item), d.item);
    if (!hidden(r) && d.rev !== r.rev) {
      if (d.to === 'in-review' && r.versions.some((v) => v.rev === d.rev && v.rejected === true)) return refused(REVIEW_TEXTS.unrejectNewer, r.id);
      return conflict(REVIEW_TEXTS.conflictLabel(w.label(r.id)), r.id);
    }
    decisions.push(d);
  }
  const own = request.own && decisions.length === 1;
  const decided = new Set<string>();
  // Declines and backs to review first, in the order sent; then the Accepts, on what they left.
  for (const d of decisions) {
    if (d.to === 'accepted') continue;
    const refusal = d.to === 'declined' ? decline(w, d, shown, at) : backToReview(w, d, shown);
    if (refusal !== undefined) return refusal;
    decided.add(d.item);
  }
  // What the un-rejects' merges bring back goes where the statuses the request leaves say (carry-over R1-F1).
  settleMergedBack(w);
  const accepts = decisions.filter((d) => d.to === 'accepted');
  let left: Ok['left'] = [];
  if (own && accepts.length === 1) {
    const d = accepts[0] as ItemDecision;
    const r = w.byId.get(d.item) as ItemRecord;
    const refusal = ownAcceptRefusal(w, r, d, shown);
    if (refusal !== undefined) return refusal;
    accept(w, r, d, 'own', shown, at);
    decided.add(r.id);
  } else if (accepts.length > 0) {
    const items = w.items.map((r) => groupItemOf(w, r, shown));
    const plan = planGroupAccept(
      items,
      accepts.map((d) => d.item),
    );
    for (const id of plan.take) {
      const d = accepts.find((x) => x.item === id) as ItemDecision;
      accept(w, w.byId.get(id) as ItemRecord, d, 'group', shown, at);
      decided.add(id);
    }
    left = plan.left;
  }
  if (redo !== undefined && left.length > 0) {
    const first = left[0] as { item: string; reason: GroupLeftReason };
    const r = w.byId.get(first.item);
    return refused(leftText(w, first.item, first.reason, shown), r !== undefined && hidden(r) ? undefined : first.item);
  }

  if (!request.confirmed) {
    const ask = confirmation(w, decided, shown);
    if (ask !== undefined) return ask;
  }
  // Show results' force ends when a meaning item becomes undecided (§4.7); an action that shows them applies D2-23.
  const forced = w.forced;
  let endedForce: SessionForce | undefined;
  if (forced !== null && anyBecameUndecided(w, w.changed())) {
    endedForce = forced;
    w.forced = null;
  }
  const startedForce = !shown && w.reveal().shown ? showResults(w, at) : undefined;

  const ids = w.changed();
  if (ids.length === 0 && w.questions.length === 0 && w.arrowsAdded.length === 0 && w.arrowsRemoved.length === 0) return unchanged(state, left);
  const taken = [...decided].filter((id) => ids.includes(id));
  const id = state.nextAction;
  const label = decideLabel(w, decisions, taken.length > 0 ? taken : [...decided]);
  const action: SessionAction = {
    id,
    kind: 'decide',
    label,
    request: { decisions: request.decisions.map(copyDecision), own: request.own },
    changes: changesOf(w, ids),
    takenOut: [],
    rejectedArrows: { added: w.arrowsAdded, removed: w.arrowsRemoved },
    questions: w.questions,
    ...(endedForce !== undefined ? { endedForce } : {}),
    ...(startedForce !== undefined ? { startedForce } : {}),
    commits: [],
    at,
  };
  // The answer names only items listed both when the request came and after it (D2-64; builder 2b1a, carry-over
  // S-V2A-S2): a Result an action asked while the results were hidden changes silently, also when the action shows
  // them, and its change shows with the results.
  const listed = shown && w.reveal().shown;
  return {
    ok: true,
    items: w.items,
    inferences: w.inferences,
    rejectedArrows: w.rejectedArrows,
    forced: w.forced,
    stack: { done: [...state.stack.done, action], undone: redo !== undefined ? [...redo.undone] : [] },
    nextAction: id + 1,
    label,
    taken,
    left,
    cascade: cascadeEntries(w, ids, decided, listed),
    events: actionEvents(w, ids, decided, listed),
    write: writeOf(w, ids, id),
  };
}

/** Show results (RV-6, §4.7): every Result of the stage at once, noted as seen early; D2-23 with `classes`. */
function reveal(state: ReviewState, via: RevealAction['force']['via'], at: string, redo: { undone: readonly SessionAction[] } | undefined): ReviewOutcome {
  const w = new Work(state);
  const before = w.reveal();
  if (before.shown && redo === undefined) return unchanged(state);
  const force: SessionForce = { via, at };
  w.forced = force;
  if (before.waitingFor.length > 0) {
    for (const r of w.items) {
      if (r.kind !== 'result' || r.markers.includes('seen-early')) continue;
      w.touch(r.id);
      r.markers = [...r.markers, 'seen-early'];
    }
  }
  if (!before.shown) badgesGrew(w);
  const ids = w.changed();
  const id = state.nextAction;
  // V2A-S4: D2-23's returns are part of the action, so its Undo restores them; the seen-early markers stay (UN-4). A
  // written premise among them is taken out by the action's write, which records it in `takenOut` and its commit in
  // `commits`, as a decision's does, so Undo puts it back (builder 2b1a, carry-over R1-2).
  const returns = ids.filter((item) => w.start.get(item)?.state.status !== w.byId.get(item)?.status);
  const action: SessionAction = { id, kind: 'reveal', label: REVIEW_TEXTS.showResults, force, changes: changesOf(w, returns), takenOut: [], commits: [] };
  return {
    ok: true,
    items: w.items,
    inferences: w.inferences,
    rejectedArrows: w.rejectedArrows,
    forced: w.forced,
    stack: { done: [...state.stack.done, action], undone: redo !== undefined ? [...redo.undone] : [] },
    nextAction: id + 1,
    label: action.label,
    taken: [],
    left: [],
    cascade: cascadeEntries(w, ids, new Set(), true),
    events: actionEvents(w, ids, new Set(), true),
    write: writeOf(w, ids, id),
  };
}

/** A move on the Proposed view (D2-33): one stack step; the runner keeps the positions. */
function move(
  state: ReviewState,
  before: Readonly<Record<string, CanvasPosition | null>>,
  after: Readonly<Record<string, CanvasPosition>>,
  at: string,
  redo: { undone: readonly SessionAction[] } | undefined,
): ReviewOutcome {
  const cards = Object.keys(after).sort();
  const name = (card: string) => (state.labels !== undefined && Object.hasOwn(state.labels, card) ? (state.labels[card] ?? card) : card);
  const label = cards.length === 1 ? REVIEW_TEXTS.undoMove(name(cards[0] as string)) : REVIEW_TEXTS.undoMoveN(cards.length);
  const id = state.nextAction;
  const action: SessionAction = {
    id,
    kind: 'move',
    label,
    before: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v === null ? null : { ...v }])),
    after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, { ...v }])),
    at,
  };
  const out = unchanged(state) as Ok;
  return { ...out, stack: { done: [...state.stack.done, action], undone: redo !== undefined ? [...redo.undone] : [] }, nextAction: id + 1, label };
}

/**
 * A seal (UN-5): every queue of Claude steps after the session's first starts with exactly one (the first has none,
 * `SealBy`); Undo stops at it, and it clears Redo.
 */
function seal(state: ReviewState, by: SealBy, at: string): ReviewOutcome {
  const id = state.nextAction;
  const out = unchanged(state) as Ok;
  return { ...out, stack: { done: [...state.stack.done, { id, kind: 'seal', by, at }], undone: [] }, nextAction: id + 1 };
}

/** The markers an Undo leaves: what the action added taken away, what it removed put back; others' markers stay. */
function undoneMarkers(now: readonly string[], before: readonly string[], after: readonly string[]): ItemState['markers'] {
  const added = after.filter((m) => !before.includes(m));
  const removed = before.filter((m) => !after.includes(m));
  return [...new Set([...now.filter((m) => !added.includes(m)), ...removed])] as ItemState['markers'];
}

/**
 * Whether a hidden item's restored Accept stands now (AF13, ADV-4): the rules an Accept by hand would meet, with its
 * real dependencies (hidden ones included), so no accepted item rests on one that is not (RV-5).
 */
function hiddenAcceptStands(w: Work, r: ItemRecord, before: ItemState, shown: boolean): boolean {
  if (blockedBy(w, r, shown) !== undefined) return false;
  const cls = w.classOf(r, shown);
  if (before.accepted === undefined || badgesGrewFor(before.accepted, cls)) return false;
  if (before.accepted.how === 'group' && (cls.belief || cls.changesProved)) return false;
  return w.outside(r.id).every((d) => w.byId.get(d)?.status === 'accepted');
}

/**
 * A listed item's restored Accept: the rule's refusal, as an Accept by hand would get it now (AF13, ADV-4, D2-73), or
 * undefined. `now`: whether the results are shown when the Undo is asked; its dependencies are read as then, so one that
 * is hidden then waits for the results and is never named, whatever its state (D2-64; builder 2b1a, carry-over
 * S-V2A-S2). `after`: whether they are shown after the Undo. RV-7 (and "blocked") read the class in force both then and
 * after: `classes` only when the results are shown when the Undo is asked and stay shown, else `classesBeforeReveal`
 * (fixer 2b1a r1). `classes` counts every premise draft, a Result's part, so reading it for an Undo asked while the
 * results are hidden refused it, with the results still hidden, whenever a hidden draft reached the item. An Undo that
 * shows the results then applies D2-23 with `classes`, which returns such an item to review, as by hand.
 */
function listedAcceptRefusal(w: Work, r: ItemRecord, before: ItemState, now: boolean, after: boolean): ReviewOutcome | undefined {
  const label = w.label(r.id);
  const inForce = now && after;
  const blocked = blockedBy(w, r, inForce);
  if (blocked !== undefined) return refused(blocked, r.id);
  const gate = dependencyGate(w, r, now);
  if (gate.missing.length > 0) {
    return refused(
      REVIEW_TEXTS.acceptNeedsDependencies(
        label,
        gate.missing.map((id) => w.label(id)),
      ),
      r.id,
    );
  }
  if (gate.waits) return refused(REVIEW_TEXTS.acceptWaitsForResults(label), r.id);
  const cls = w.classOf(r, inForce);
  const grew = before.accepted === undefined || badgesGrewFor(before.accepted, cls);
  const ownNeeded = before.accepted?.how === 'group' && (cls.belief || cls.changesProved);
  if (grew || ownNeeded) {
    const belief = cls.belief && (ownNeeded || !before.accepted?.belief);
    return refused(belief ? REVIEW_TEXTS.leftOwnAccept(label) : REVIEW_TEXTS.leftOwnAcceptProved(label), r.id);
  }
  return undefined;
}

/** Undo (UN-4, D2-73): the inverse of the top action, through the rules. */
function undo(state: ReviewState, step: number, confirmed: boolean, at: string): ReviewOutcome {
  const done = state.stack.done;
  const top = done[done.length - 1];
  if (top === undefined || top.id !== step) return conflict(REVIEW_TEXTS.historyChanged);
  if (top.kind === 'seal') return refused(REVIEW_TEXTS.sealed);
  const stack = { done: done.slice(0, -1), undone: [...state.stack.undone, top] };
  if (top.kind === 'move') return { ...(unchanged(state) as Ok), stack, label: top.label };
  const w = new Work(state);
  const shown = w.reveal().shown;
  const hidden = hiddenIn(shown);
  // D2-8: the items the action decided may not be hidden now (Show results decided none). No item is named (D2-64).
  const decidedIds = top.kind === 'decide' ? decidedBy(top) : [];
  for (const id of decidedIds) {
    const r = w.byId.get(id);
    if (r !== undefined && hidden(r)) return refused(REVIEW_TEXTS.showResultsFirst);
  }
  // A listed item must still be as the action left it (D2-73). A hidden one that a judge changed since keeps that
  // change: telelean's change to a hidden item stands silently, and no answer tells of it (D2-64, V2A-S2).
  const skipped = new Set<string>();
  for (const c of top.changes) {
    const r = w.byId.get(c.item);
    if (r === undefined) return conflict(REVIEW_TEXTS.historyChanged);
    if (r.rev === c.rev && decisionKey(itemStateOf(r)) === decisionKey(c.after)) continue;
    if (hidden(r)) {
      skipped.add(r.id);
      continue;
    }
    return conflict(REVIEW_TEXTS.conflictLabel(w.label(r.id)), r.id);
  }
  // Restore what the action recorded. Show results' markers stay (UN-4); a decision's own markers go.
  for (const c of top.changes) {
    if (skipped.has(c.item)) continue;
    const r = w.touch(c.item);
    const markers = top.kind === 'reveal' ? r.markers : undoneMarkers(r.markers, c.before.markers, c.after.markers);
    applyItemState(r, { ...c.before, markers });
  }
  if (top.kind === 'decide') {
    for (const q of top.questions) {
      const inference = w.inferences.find((inf) => inf.target === q.target);
      if (inference !== undefined) inference.question = { sources: [...q.before.sources], fromNothing: q.before.fromNothing };
    }
    w.rejectedArrows = w.rejectedArrows.filter((a) => !top.rejectedArrows.added.some((x) => sameArrow(a, x)));
    for (const a of top.rejectedArrows.removed) if (!w.rejectedArrows.some((x) => sameArrow(a, x))) w.rejectedArrows.push({ ...a });
  }
  // RV-5's list, as by hand: accepted items that depend on an Accept the Undo takes away lose theirs too.
  const restored = top.changes.filter((c) => !skipped.has(c.item));
  for (const c of restored) {
    if (c.after.status === 'accepted' && c.before.status !== 'accepted') cascadeBack(w, c.item);
  }
  // The force: Show results' goes; the one a decision started goes and the one it ended comes back (§4.7, ADV-1); a
  // meaning item the Undo makes undecided ends it.
  if (top.kind === 'decide') {
    if (top.startedForce !== undefined && sameForce(w.forced, top.startedForce)) w.forced = null;
    if (top.endedForce !== undefined && w.forced === null) w.forced = top.endedForce;
  } else if (sameForce(w.forced, top.force)) w.forced = null;
  if (w.forced !== null && anyBecameUndecided(w, w.changed())) w.forced = null;
  // The restored Accepts must pass the rules now (AF13): a judge may have changed what they rest on since. RV-7's own
  // Accept is checked whatever its kind: badges that grew since need a new Accept (ADV-4). An item hidden when the Undo
  // is asked, or after it, that fails keeps the state it had, silently, until nothing restored rests on one that is not
  // accepted (V2A-S2); a listed one refuses the Undo with the text an Accept by hand would get now, its dependencies
  // read as they are shown now (builder 2b1a, carry-over S-V2A-S2: no answer depends on, or names, an item hidden now),
  // and its badges against the class in force both now and after (fixer 2b1a r1: never a hidden premise draft's).
  const shownAfter = w.reveal().shown;
  const hiddenAfter = hiddenIn(shownAfter);
  const quiet = (r: ItemRecord) => hidden(r) || hiddenAfter(r);
  const accepts = restored.filter((c) => c.before.status === 'accepted' && c.after.status !== 'accepted');
  for (let again = true; again; ) {
    again = false;
    for (const c of accepts) {
      const r = w.byId.get(c.item) as ItemRecord;
      if (r.status !== 'accepted' || !quiet(r) || hiddenAcceptStands(w, r, c.before, shownAfter)) continue;
      applyItemState(r, { ...(w.start.get(r.id) as { state: ItemState }).state, markers: r.markers });
      skipped.add(r.id);
      again = true;
    }
  }
  for (const c of accepts) {
    const r = w.byId.get(c.item) as ItemRecord;
    if (r.status !== 'accepted' || quiet(r)) continue;
    const refusal = listedAcceptRefusal(w, r, c.before, shown, shownAfter);
    if (refusal !== undefined) return refusal;
  }
  const decided = new Set(decidedIds.filter((id) => !skipped.has(id)));
  if (!confirmed) {
    const ask = confirmation(w, decided, shown);
    if (ask !== undefined) return ask;
  }
  if (!shown && w.reveal().shown) showResults(w, at);
  // The runner inverts the action's commits: what they took out comes back, and what must stay out (a hidden item
  // left as a judge made it) is taken out again (V2A-C2). The written premises its write took out get their card and
  // written key back (§3.8, V2A-S3); one that stays out is taken out again. Show results' write takes premises out too
  // (D2-23's returns), so its action records them and its commits as a decision's does (builder 2b1a, carry-over R1-2).
  for (const id of takenOutIn(w, top.changes)) {
    const r = w.byId.get(id) as ItemRecord;
    if (!inWorkingCopy(r.kind, r, r.card)) w.keepOut.add(id);
  }
  // A taken-out premise is written again only when this Undo restores it (its change, neither kept by a judge nor kept
  // silently) to a state that keeps it in ws/, read from the state the action changed it from: in review only when it
  // was in review then (a converted v1 ghost, written in review). Every other one stays as its record is, and the write
  // takes it out again after the inversion, which finds nothing when nothing of it came back (fixer 2b1a r1: a premise
  // kept in review, or one the Undo never restores, was written again with no Accept standing).
  for (const t of top.takenOut) {
    const r = w.byId.get(t.item);
    if (r === undefined) continue;
    const c = top.changes.find((x) => x.item === r.id);
    if (c !== undefined && !skipped.has(r.id) && inWorkingCopy(r.kind, r, t.card, c.before)) {
      r.card = t.card;
      r.fingerprint = t.fingerprint;
      w.premisesBack.add(r.id);
    } else w.premisesOut.add(r.id);
  }
  const ids = w.changed();
  // An Undo whose action made commits names it in its write even when no status changes ws/, so the runner inverts them.
  const inverts = top.commits.length > 0 || top.takenOut.length > 0;
  const write = writeOf(w, ids, top.id) ?? (inverts ? { action: top.id, revert: [], reapply: [], premises: { write: [], takeOut: [] } } : null);
  // The answer names only items listed both when the Undo was asked and after it (carry-over S-V2A-S2, as in `decide`).
  const listed = shown && w.reveal().shown;
  return {
    ok: true,
    items: w.items,
    inferences: w.inferences,
    rejectedArrows: w.rejectedArrows,
    forced: w.forced,
    stack,
    nextAction: state.nextAction,
    label: top.label,
    taken: [...decided],
    left: [],
    cascade: cascadeEntries(w, ids, decided, listed),
    events: actionEvents(w, ids, decided, listed),
    write,
  };
}

/** Redo (UN-4, AF13): the undone action's request again, through the rules, on the current state. */
function redoAction(state: ReviewState, step: number, confirmed: boolean, at: string): ReviewOutcome {
  const undone = state.stack.undone;
  const top = undone[undone.length - 1];
  if (top === undefined || top.id !== step || top.kind === 'seal') return conflict(REVIEW_TEXTS.historyChanged);
  const rest = { undone: undone.slice(0, -1) };
  const base: ReviewState = { ...state, stack: { done: state.stack.done, undone: rest.undone } };
  switch (top.kind) {
    case 'decide': {
      // The decisions the action carried out, sent again: what a group left then is not asked for now (AF13). Its own
      // Accept stays its own only if the request was one (`own` with one decision), never a group's survivor (ADV-8).
      const decided = new Set(decidedBy(top));
      const own = top.request.own && new Set(top.request.decisions.map((d) => d.item)).size === 1;
      return decide(base, { decisions: top.request.decisions.filter((d) => decided.has(d.item)), own, confirmed }, at, rest);
    }
    case 'reveal':
      return reveal(base, top.force.via, at, rest);
    case 'move':
      return move(base, top.before, top.after, at, rest);
  }
}

/** §4.6 (2a2): one review action on the records, with every effect it has (the types are in §2.9). */
export function reduceReview(state: ReviewState, action: ReviewAction, at: string): ReviewOutcome {
  switch (action.kind) {
    case 'decide':
      return decide(state, action, at, undefined);
    case 'reveal':
      return reveal(state, action.via, at, undefined);
    case 'move':
      return move(state, action.before, action.after, at, undefined);
    case 'undo':
      return undo(state, action.step, action.confirmed, at);
    case 'redo':
      return redoAction(state, action.step, action.confirmed, at);
    case 'seal':
      return seal(state, action.by, at);
  }
}

/** An Accept's gate: ok, or why it is refused (`missing`: the listed dependencies to accept first, for `depends`). */
export type AcceptGateResult = { ok: true } | { ok: false; reason: GroupLeftReason; text: string; missing: string[] };
/** A decline's or a back to review's gate: ok, or the refusal's text. */
export type ActionGateResult = { ok: true } | { ok: false; text: string };

/** `acceptGate` on one Work (builder 2c2: shared with `itemGates`, so both read the same rules). */
function acceptGateIn(w: Work, r: ItemRecord, own: boolean, shown: boolean): AcceptGateResult {
  const g = groupItemOf(w, r, shown);
  const gate = dependencyGate(w, r, shown);
  let reason: GroupLeftReason | undefined;
  if (g.hidden) reason = 'hidden-result';
  else if (r.status !== 'in-review') reason = 'not-in-review';
  else if (own) {
    if (blockedBy(w, r, shown) !== undefined) reason = 'blocked';
    else if (gate.missing.length > 0) reason = 'depends';
    else if (gate.waits) reason = 'blocked';
  } else if (g.ownAccept) reason = 'own-accept';
  else if (g.blocked) reason = 'blocked';
  else if (gate.missing.length > 0) reason = 'depends';
  if (reason === undefined) return { ok: true };
  return { ok: false, reason, text: leftText(w, r.id, reason, shown), missing: reason === 'depends' ? gate.missing : [] };
}

/**
 * An item's Accept gate for the view (2c2) and the host's early answers: why its Accept is refused now, or ok. `own`:
 * the item's own Accept (the detail's), checked in `reduceReview`'s order for it; else a group's, in `planGroupAccept`'s
 * order (V2A-N2). The same rules `reduceReview` applies.
 */
export function acceptGate(state: ReviewState, id: string, own: boolean): AcceptGateResult {
  const w = new Work(state);
  const shown = w.reveal().shown;
  const r = w.byId.get(id);
  if (r === undefined) return { ok: false, reason: 'not-in-review', text: REVIEW_TEXTS.conflict(id), missing: [] };
  return acceptGateIn(w, r, own, shown);
}

/**
 * Builder 2c2: the gates of every item at once, for the view (`buildSessionView`: ItemView `accept`, `decline` and
 * `review`), on one Work, so the view reads the rules `reduceReview` applies to one decision of the item, in its order,
 * without carrying it out:
 *  - `accept`: the item's own Accept, as `acceptGate(state, id, true)`;
 *  - `decline`: what refuses a decline whatever its option (a hidden Result or part, declined already, withdrawn). An
 *    option's own refusals (Transform until slice 4; the plain decline, the arrow items' only one) are the decline menu's;
 *  - `review`: back to review, un-reject included: a hidden Result or part; withdrawn; to be redone with its content
 *    taken out (D2-60); the un-reject of an item a mixed request declined (fixer 2b1b r1, S-F5). An item in review has
 *    nothing to go back to (the reducer leaves it as it is), so its gate is closed too;
 *  - `blocked` (builder 2h, carry-over F-V2G-FC-9): the item's GroupItem `blocked`, which a group Accept reads: its
 *    Accept is refused for a reason other than its listed dependencies ("did not pass", facts missing, a Result not
 *    judged, or a dependency on a hidden item). The own Accept's gate names the missing dependencies first, so the view
 *    cannot rebuild it from `accept` when an item both waits for the results and has dependencies in review.
 * A conflict with what the user saw (a stale rev) or a merge that conflicts is known only when the decision comes.
 */
export function itemGates(state: ReviewState): Map<string, { accept: AcceptGateResult; decline: ActionGateResult; review: ActionGateResult; blocked: boolean }> {
  const w = new Work(state);
  const shown = w.reveal().shown;
  const hidden = hiddenIn(shown);
  const refuse = (text: string | undefined): ActionGateResult => (text === undefined ? { ok: true } : { ok: false, text });
  const declineRefusal = (r: ItemRecord): string | undefined => {
    if (hidden(r)) return REVIEW_TEXTS.showResultsFirst;
    if (r.status === 'declined') return REVIEW_TEXTS.declinedAlready(w.label(r.id));
    if (r.status === 'withdrawn') return REVIEW_TEXTS.withdrawnStays(w.label(r.id));
    return undefined;
  };
  const reviewRefusal = (r: ItemRecord): string | undefined => {
    if (hidden(r)) return REVIEW_TEXTS.showResultsFirst;
    switch (r.status) {
      case 'in-review':
        return REVIEW_TEXTS.inReviewAlready(w.label(r.id));
      case 'withdrawn':
        return REVIEW_TEXTS.withdrawnStays(w.label(r.id));
      case 'to-be-redone':
        return isReverted(r) ? REVIEW_TEXTS.contentTakenOut : undefined;
      case 'accepted':
        return undefined;
      case 'declined':
        // An Add premise's un-reject merges nothing (AF2), so no mixed request can make it take anything out.
        if (!isDeclinedOut(r) || r.kind === 'add-premise') return undefined;
        return mergedBackBy(w, r)?.mixed === true ? REVIEW_TEXTS.unrejectMixed(w.label(r.id)) : undefined;
    }
  };
  const out = new Map<string, { accept: AcceptGateResult; decline: ActionGateResult; review: ActionGateResult; blocked: boolean }>();
  for (const r of w.items) {
    // Builder 2h (carry-over F-V2G-FC-9): the GroupItem's `blocked` that `reduceReview` plans a group Accept with.
    out.set(r.id, { accept: acceptGateIn(w, r, true, shown), decline: refuse(declineRefusal(r)), review: refuse(reviewRefusal(r)), blocked: groupItemOf(w, r, shown).blocked });
  }
  return out;
}
