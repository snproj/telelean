/**
 * Slice 2a2 (docs/slice2-plan.md section 3.5): a stage judgement applied to the records, when a queue ends and in every
 * `judge-apply` write (§2.6). The rules, in order:
 *  - a new key: a new record, in review, rev 1, its id from the run id and the key (AF7), `origin` and `partOf` from
 *    its draft, never changed later;
 *  - F5 (only when a queue ends, `queueSteps`, AF1): a Shaky or to-be-redone item with a draft, in an inference whose
 *    Submit step ended in that queue, is back in review, `redo` and its decline dropped, "updated" only when its content
 *    key changed, "no alternative found" when that step's finish said so;
 *  - ADV-3 (fixer 2a): a draft whose declarations have no facts (`factsMissing`: their module did not build) leaves its
 *    record as it was; while any draft lacks facts, no RV-11, inference-failure, RV-7 or RV-5 rule reads the judgement
 *    (its verdicts, classes and dependencies are partial), and only its no-longer-builds reverts apply;
 *  - AF1: a record declined by Reject or a plain decline, or to be redone with its content taken out, keeps its status,
 *    key and rev when its draft is B's version (`asInBase`). Any other draft is a new proposal only when a queue ends
 *    and the draft is not an exact repeat of a rejected version: back in review, "updated" when its key changed (DO-1's
 *    reworded repeat; a withdrawn item's later proposal), with an event. Otherwise its content came back without a step
 *    proposing it (fixer 2a, V2A-C2): the record keeps its status and the write takes the content out again (fail
 *    closed), with an event;
 *  - the same content key: unchanged, its content refreshed from the draft (fixer 2a, V2A-C1), but RV-11 (fixer 2a,
 *    V2A-S1): a Result in review or accepted whose verdict, Rests on or dependencies differ from its record's `judged`
 *    (or, accepted, from its Accept's) is treated as a changed key ("with its result hidden again"); an accepted one
 *    with nothing to compare counts as changed (fail closed). A Shaky Result, or one to be redone with its content
 *    kept, stays (D2-48);
 *  - a changed content key: the old version into `versions`, rev + 1, in review, "updated"; an accepted one leaves
 *    accepted with its accepted dependents (RV-5), each "updated", with no confirmation, reported as an event;
 *  - a record with no draft: expected when declined (Reject, plain) or to be redone with its content out; `withdrawn`
 *    when Shaky or to be redone and its inference's Submit step ended in the queue (D2-17); else the problem
 *    "“‹item›” disappeared, and no decision removed it" (Apply is disabled);
 *  - D2-17: when a later step for T ends with a new Result version, T's premise drafts of earlier steps that are not
 *    accepted are withdrawn, and their drafts leave `premises`; a draft the new step proposed again stays (its current
 *    draft's step, fixer 2a, V2A-C1);
 *  - the judge's reverts (§3.6): items owning declarations that no longer build ("no longer builds") and Results whose
 *    inference fails B.1, B.2 or its footprint (a Shaky Result, or one to be redone without revert, stays: D2-48) become
 *    to be redone, reverted, with every dependent their content takes down (D2-28);
 *  - premise re-checks (§3.8): their facts are replaced; one that no longer closes the gap is to be redone, marked so;
 *  - RV-3 (A1): a new or updated item in review that depends on a Shaky or to-be-redone item is to be redone at once,
 *    not reverted, as if that decision had just been made (its dependents in review follow);
 *  - RV-7 (D2-23): the classes in force (`classes` while the results are shown, else `classesBeforeReveal`); an accepted
 *    item whose badges grew returns to review, with its accepted dependents;
 *  - RV-5, defensively: an accepted item with a dependency outside its SCC that is not accepted returns to review;
 *  - the reveal (§4.7): a meaning item that became undecided, or a Result returned to review or given a new version,
 *    ends Show results' force, and so does every queue's end (`queueSteps`; fixer 2c2 r1, C-V2C2-C1); while the results
 *    are forced by the user and a meaning item is undecided, every Result is marked seen early. When the results were
 *    shown at the RV-7 step and only its returns (with their RV-5 dependents) would hide them again, a `decided` force
 *    keeps them shown (fixer 2a, ADV-1).
 *
 * Events name listed items only (never a Result or a Result's part while the results are hidden afterwards); the
 * runner numbers and times them. `problems` holds reconcile's own (the judgement's are the runner's to add). `reverts`:
 * the items whose content the write takes out (the judge's reverts and their cascades, and every written Add premise
 * whose status no longer keeps it in ws/).
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { reviewItemId } from './hash.js';
import { premiseKey, proofKey } from './keys.js';
import {
  cloneRecord,
  fallbackLabel,
  inferenceOf,
  inWorkingCopy,
  isDeclinedOut,
  isReverted,
  isShaky,
  isUndecided,
  itemStateOf,
  resultTargetOf,
} from './records.js';
import { isMeaningItem, isResultOrPart, resultsState } from './reveal.js';
import { componentOf } from './scc.js';
import { REVIEW_TEXTS } from './texts.js';
import type { ItemClass, ItemDraft, ItemMarker, ItemRecord, ItemState, SessionRecords, StateJudgement } from './types.js';

const UNKNOWN_CLASS: ItemClass = { belief: true, changesProved: true, reasons: [], complete: false };
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];
const sameSet = (a: readonly string[], b: readonly string[]) => [...new Set(a)].sort().join('\u0000') === [...new Set(b)].sort().join('\u0000');
const sorted = (a: readonly string[]) => [...new Set(a)].sort();

type Judged = NonNullable<ItemRecord['judged']>;
const sameJudged = (a: Judged, b: Judged) => a.verdict === b.verdict && sameSet(a.restsOn, b.restsOn) && sameSet(a.deps, b.deps);

function addMarker(r: ItemRecord, marker: ItemMarker): void {
  if (!r.markers.includes(marker)) r.markers = [...r.markers, marker];
}

function newRecord(runId: string, d: ItemDraft): ItemRecord {
  return {
    id: reviewItemId(runId, d.key),
    key: d.key,
    kind: d.kind,
    ...(d.declKind !== undefined ? { declKind: d.declKind } : {}),
    rev: 1,
    origin: { ...d.origin },
    ...(d.partOfResult !== undefined ? { partOf: d.partOfResult } : {}),
    status: 'in-review',
    markers: [],
    fingerprint: d.contentKey,
    content: d.content,
    versions: [],
    rejectedFingerprints: [],
  };
}

/**
 * §3.5 (2a2): a stage judgement applied to the records, when a queue ends and in every `judge-apply` write. `runId`
 * gives new records their ids (§2.2, AF7: `reviewItemId`). `queueSteps`: the steps of the queue this judgement ends,
 * absent at a judge that a decision started; F5's rule reads only these (§3.5, AF1).
 */
export function reconcile(i: { runId: string; records: SessionRecords; judgement: StateJudgement; queueSteps?: readonly string[]; at: string }): {
  records: SessionRecords;
  /** Never about a hidden item; the runner numbers and times them (AF7, AF9). */
  events: Array<{ text: string; items: string[] }>;
  problems: string[];
  /**
   * Items the judge makes to be redone and takes out (§3.6), and written premises it returned to review, which are
   * taken out too (§3.8): the write's ws/ part.
   */
  reverts: string[];
} {
  const { judgement } = i;
  const stage = i.records.stage;
  const items = i.records.items.map(cloneRecord);
  const byKey = new Map(items.map((r) => [r.key, r]));
  const byId = new Map(items.map((r) => [r.id, r]));
  let premises = i.records.premises.map((p) => ({ ...p, facts: { ...p.facts } }));
  let forced = i.records.forced;
  const start = new Map<string, ItemState>(items.map((r) => [r.id, itemStateOf(r)]));
  const drafts = new Map(judgement.drafts.map((d) => [d.key, d]));
  const problems: string[] = [];
  /**
   * ADV-3: a declaration of the judged state has no facts (its module did not build), so its verdicts, classes and
   * dependencies are partial: only the no-longer-builds reverts read them, and the judge runs again once they are out.
   */
  const partial = judgement.drafts.some((d) => d.factsMissing === true);

  /** Ids by what happened to them, for the events and the force. */
  const created = new Set<string>();
  /** A new version (rev + 1): a changed key, F5 with a changed key, a new proposal, RV-11. */
  const updated = new Set<string>();
  /** Their content key changed. */
  const newContent = new Set<string>();
  /** RV-11: Results back in review with the same content, their verdict, Rests on or dependencies changed (V2A-S1). */
  const rechecked = new Set<string>();
  const changedAccepted: string[] = [];
  const resultsChanged: string[] = [];
  const withDependents: string[] = [];
  const withdrawn: string[] = [];
  /** V2A-C2: declined, withdrawn or taken-out records a step of the queue proposed again. */
  const proposedAgain: string[] = [];
  /** V2A-C2: declined or taken-out records whose content came back with no step proposing it: taken out again. */
  const keptOut = new Set<string>();
  const noLongerBuilds: string[] = [];
  const noLongerPasses: string[] = [];
  const redoneWith: string[] = [];
  const gapNotClosed: string[] = [];
  const redoneAtOnce: string[] = [];
  const badgesGrew: string[] = [];
  const dependencyNotAccepted: string[] = [];

  // ---- the queue that ended: its Submit steps, by target (F5, D2-17)
  const queue = new Set(i.queueSteps ?? []);
  const reworkedTargets = new Map<string, { noAlternative: boolean }>();
  if (i.queueSteps !== undefined) {
    for (const step of i.records.steps) {
      if (!queue.has(step.id) || step.kind !== 'submit' || (step.state !== 'passed' && step.state !== 'gave-up')) continue;
      const known = reworkedTargets.get(step.target);
      reworkedTargets.set(step.target, { noAlternative: (known?.noAlternative ?? false) || step.noAlternative === true });
    }
  }
  const reworked = (r: ItemRecord) => {
    const target = inferenceOf(r);
    return target === undefined ? undefined : reworkedTargets.get(target);
  };

  /** RV-11 (V2A-S1): a Result's verdict, Rests on and RV-5 dependencies (keys) in this judgement, each sorted. */
  const judgedNow = (r: Pick<ItemRecord, 'key'>): Judged | undefined => {
    const target = resultTargetOf(r);
    const inference = target !== undefined && Object.hasOwn(judgement.inferences, target) ? judgement.inferences[target] : undefined;
    if (inference === undefined) return undefined;
    return { verdict: inference.verdict, restsOn: sorted(inference.restsOn), deps: sorted(judgement.deps[r.key] ?? []) };
  };
  /** A Result whose content is in ws/ under this judgement keeps what it judged, for the next RV-11 comparison. */
  const noteJudged = (r: ItemRecord) => {
    if (r.kind !== 'result' || partial) return;
    const now = judgedNow(r);
    if (now !== undefined) r.judged = now;
  };

  const newVersion = (r: ItemRecord, d: ItemDraft) => {
    r.versions = [
      ...r.versions,
      { rev: r.rev, stage, fingerprint: r.fingerprint, content: r.content, ...(r.rejectedFingerprints.includes(r.fingerprint) ? { rejected: true } : {}) },
    ];
    r.rev += 1;
    if (d.contentKey !== r.fingerprint) newContent.add(r.id);
    r.fingerprint = d.contentKey;
    r.content = d.content;
    updated.add(r.id);
  };
  const toReview = (r: ItemRecord) => {
    r.status = 'in-review';
    delete r.accepted;
    delete r.decline;
    delete r.redo;
  };

  // ---- RV-5 edges by id, their dependents and SCCs (the judgement's, by key)
  const depsOf = (id: string): string[] => {
    const r = byId.get(id);
    if (r === undefined) return [];
    return (judgement.deps[r.key] ?? []).map((k) => byKey.get(k)?.id).filter((x): x is string => x !== undefined && x !== id);
  };
  const dependentsOf = (id: string): string[] => {
    const seen = new Set([id]);
    const out: string[] = [];
    const queueIds = [id];
    for (let k = 0; k < queueIds.length; k++) {
      const at = queueIds[k] as string;
      for (const r of items) {
        if (seen.has(r.id) || !depsOf(r.id).includes(at)) continue;
        seen.add(r.id);
        out.push(r.id);
        queueIds.push(r.id);
      }
    }
    return out;
  };
  /** Accepted dependents return to review with it (RV-5); `marker`: "updated" for a changed key's. Returns them. */
  const acceptedDependentsBack = (from: string, marker?: ItemMarker): string[] => {
    const back: string[] = [];
    for (const id of dependentsOf(from)) {
      const x = byId.get(id) as ItemRecord;
      if (x.status !== 'accepted') continue;
      toReview(x);
      if (marker !== undefined) addMarker(x, marker);
      withDependents.push(id);
      back.push(id);
    }
    return back;
  };
  const changedKey = (r: ItemRecord, d: ItemDraft, list: string[] = changedAccepted) => {
    const wasAccepted = r.status === 'accepted';
    newVersion(r, d);
    toReview(r);
    addMarker(r, 'updated');
    if (wasAccepted) {
      list.push(r.id);
      acceptedDependentsBack(r.id, 'updated');
    }
  };

  // ---- 1. the records with a draft, and the new keys
  for (const d of judgement.drafts) {
    const r = byKey.get(d.key);
    if (r === undefined) {
      const fresh = newRecord(i.runId, d);
      items.push(fresh);
      byKey.set(fresh.key, fresh);
      byId.set(fresh.id, fresh);
      created.add(fresh.id);
      noteJudged(fresh);
      continue;
    }
    // ADV-3: without its facts the draft's key and mentions are partial: its record stays as it was.
    if (d.factsMissing === true) continue;
    const rework = reworked(r);
    if (rework !== undefined && (isShaky(r) || r.status === 'to-be-redone')) {
      // F5: its Submit step ended in the queue that just ended.
      const changed = d.contentKey !== r.fingerprint;
      if (changed) newVersion(r, d);
      else r.content = d.content;
      toReview(r);
      if (changed) addMarker(r, 'updated');
      if (rework.noAlternative) addMarker(r, 'no-alternative-found');
      noteJudged(r);
      continue;
    }
    if (isDeclinedOut(r) || isReverted(r) || r.status === 'withdrawn') {
      // AF1: B's version is no new proposal. An Add premise's draft stays in `premises` while its item exists, outside
      // ws/ (§3.5): the same draft is no new proposal either.
      if (d.asInBase === true && r.status !== 'withdrawn') continue;
      if (r.kind === 'add-premise' && r.status !== 'withdrawn' && d.contentKey === r.fingerprint) continue;
      // V2A-C2: only a step proposes again, and never an exact repeat of a rejected version (the gate refuses it). Any
      // other way back into ws/ (an inverse merge, a write that went wrong) leaves the decision as it was, and the
      // write takes the content out again (fail closed).
      const repeat = isDeclinedOut(r) && (d.contentKey === r.fingerprint || r.rejectedFingerprints.includes(d.contentKey));
      if (i.queueSteps === undefined || repeat) {
        keptOut.add(r.id);
        continue;
      }
      if (d.contentKey !== r.fingerprint) {
        newVersion(r, d);
        addMarker(r, 'updated');
      } else r.content = d.content;
      toReview(r);
      proposedAgain.push(r.id);
      noteJudged(r);
      continue;
    }
    if (d.contentKey !== r.fingerprint) {
      changedKey(r, d);
      noteJudged(r);
      continue;
    }
    // The same key: the record carries its current draft (a premise proposed again by a later step, V2A-C1).
    r.content = d.content;
    if (r.kind !== 'result' || partial) continue;
    // D2-48: a Shaky Result, or one to be redone with its content kept, stays: its Submit step reworks it.
    if (r.status !== 'in-review' && r.status !== 'accepted') {
      noteJudged(r);
      continue;
    }
    // RV-11 (V2A-S1): its verdict, Rests on or dependencies changed; an accepted one with nothing to compare counts as
    // changed (fail closed, V2A-S5).
    const now = judgedNow(r);
    let changed = now === undefined || r.judged === undefined ? r.status === 'accepted' : !sameJudged(r.judged, now);
    if (r.status === 'accepted') {
      const acceptedResult = r.accepted?.result;
      if (acceptedResult === undefined) changed = true;
      else if (now !== undefined && (acceptedResult.verdict !== now.verdict || !sameSet(acceptedResult.restsOn, now.restsOn))) changed = true;
    }
    if (changed) {
      changedKey(r, d, resultsChanged);
      rechecked.add(r.id);
    }
    if (now !== undefined) r.judged = now;
  }

  // ---- 2. the records with no draft
  for (const r of items) {
    if (created.has(r.id) || drafts.has(r.key)) continue;
    if (reworked(r) !== undefined && (isShaky(r) || r.status === 'to-be-redone')) {
      toReview(r);
      r.status = 'withdrawn';
      withdrawn.push(r.id);
      continue;
    }
    if (isDeclinedOut(r) || isReverted(r) || r.status === 'withdrawn') continue;
    problems.push(REVIEW_TEXTS.disappeared(fallbackLabel(r)));
  }

  // ---- 3. D2-17: a new Result version withdraws its target's earlier premise drafts that are not accepted
  if (i.queueSteps !== undefined) {
    for (const result of items) {
      if (result.kind !== 'result' || !newContent.has(result.id)) continue;
      const target = resultTargetOf(result);
      const step = drafts.get(result.key)?.origin.step;
      if (target === undefined || step === undefined) continue;
      for (const p of items) {
        if (p.kind !== 'add-premise' || p.partOf !== target || p.status === 'accepted' || p.status === 'withdrawn') continue;
        // The step of its current draft (V2A-C1): a premise the new step proposed again is not an earlier step's.
        const pStep = drafts.get(p.key)?.content.premise?.step ?? p.content.premise?.step;
        if (pStep === undefined || pStep === step) continue;
        toReview(p);
        p.status = 'withdrawn';
        withdrawn.push(p.id);
        premises = premises.filter((x) => premiseKey(x.target, x.leanName) !== p.key || x.step === step);
      }
    }
  }

  // ---- 4. the judge's reverts (§3.6), with the content they take down (D2-28)
  const takeOut = (r: ItemRecord, list: string[], marker?: ItemMarker) => {
    r.status = 'to-be-redone';
    delete r.accepted;
    if (r.decline?.option !== 'shaky') delete r.decline;
    r.redo = { because: r.redo?.because ?? [], reverted: true };
    if (marker !== undefined) addMarker(r, marker);
    list.push(r.id);
    for (const id of dependentsOf(r.id)) {
      const x = byId.get(id) as ItemRecord;
      const goes = x.status === 'in-review' || x.status === 'accepted' || x.status === 'to-be-redone' || (x.status === 'declined' && x.decline?.option === 'shaky');
      if (!goes || isReverted(x)) continue;
      x.status = 'to-be-redone';
      delete x.accepted;
      if (x.decline?.option !== 'shaky') delete x.decline;
      x.redo = { because: union(x.redo?.because ?? [], [r.id]), reverted: true };
      redoneWith.push(id);
    }
  };
  for (const problem of judgement.problems) {
    if (problem.code !== 'no-longer-builds') continue;
    for (const key of problem.keys ?? []) {
      const r = byKey.get(key);
      if (r !== undefined && inWorkingCopy(r.kind, r, r.card)) takeOut(r, noLongerBuilds, 'no-longer-builds');
    }
  }
  for (const [target, judged] of Object.entries(judgement.inferences)) {
    // ADV-3: an inference judged on a state that did not build says nothing about its proof; the judge runs again.
    if (judged.passes || partial) continue;
    const r = byKey.get(proofKey(target));
    // A Shaky Result, or one to be redone with its content kept, stays: its Submit step reworks it (D2-48).
    if (r === undefined || (r.status !== 'in-review' && r.status !== 'accepted') || !inWorkingCopy(r.kind, r)) continue;
    takeOut(r, noLongerPasses);
  }

  // ---- 5. premise re-checks (§3.8)
  for (const [key, check] of Object.entries(judgement.premiseChecks ?? {})) {
    premises = premises.map((p) => (premiseKey(p.target, p.leanName) === key ? { ...p, facts: { ...check.facts } } : p));
    const r = byKey.get(key);
    if (check.closesGap || r === undefined) continue;
    if (r.status !== 'in-review' && r.status !== 'accepted' && !(r.status === 'to-be-redone' && !isReverted(r))) continue;
    r.status = 'to-be-redone';
    delete r.accepted;
    delete r.decline;
    r.redo = { because: [], reverted: true };
    addMarker(r, 'no-longer-closes-gap');
    gapNotClosed.push(r.id);
  }

  // ---- 6. RV-3 (A1): new, updated or proposed-again items in review that depend on Shaky or to-be-redone ones
  const blockers = (id: string) =>
    depsOf(id).filter((d) => {
      const x = byId.get(d);
      return x !== undefined && (x.status === 'to-be-redone' || isShaky(x));
    });
  const again = new Set(proposedAgain);
  const fresh = items.filter((r) => (created.has(r.id) || updated.has(r.id) || again.has(r.id)) && r.status === 'in-review');
  const marked = new Set<string>();
  const mark = (r: ItemRecord, because: string[]) => {
    if (marked.has(r.id)) return;
    marked.add(r.id);
    r.status = 'to-be-redone';
    r.redo = { because, reverted: false };
    redoneAtOnce.push(r.id);
    for (const id of dependentsOf(r.id)) {
      const x = byId.get(id) as ItemRecord;
      if (x.status === 'in-review' && !marked.has(id)) mark(x, [r.id]);
    }
  };
  for (const r of fresh) {
    const because = blockers(r.id);
    if (because.length > 0) mark(r, because);
  }

  // ---- the reveal's force (§4.7): ends when a meaning item became undecided, or a Result is back, new or re-checked
  const endsForce = () =>
    items.some((r) => {
      const was = start.get(r.id);
      if (r.kind === 'result') return newContent.has(r.id) || rechecked.has(r.id) || (was !== undefined && was.status !== 'in-review' && r.status === 'in-review');
      if (!isMeaningItem(r, judgement.classesBeforeReveal) || !isUndecided(r)) return false;
      return was === undefined || !isUndecided(was);
    });
  // Fixer 2c2 r1 (C-V2C2-C1, A-V2C2-ADV-3; builder 2c2's F1): every force, the user's and telelean's `decided` one, ends
  // when a queue ends. Whether it survived the queue would depend on the queue's outcomes: a re-ask that proves its
  // target gives the Result new content, which ends it, and one that does not leaves it, so the stage would be hidden
  // in one outcome and shown in the other while a meaning item is undecided (RV-6, D2-61). Now both outcomes are hidden
  // then, and shown when no meaning item waits (ADV-1's `decided` rule below still applies).
  if (forced !== undefined && (i.queueSteps !== undefined || endsForce())) forced = undefined;

  // ---- 7. RV-7 (D2-23): the classes in force (none while the judgement is partial, ADV-3)
  const shownNow = resultsState({ items, classesBeforeReveal: judgement.classesBeforeReveal, forced: forced ?? null }).shown;
  /** The items RV-7 returned, with their accepted dependents (ADV-1). */
  const returned = new Set<string>();
  if (!partial) {
    const inForce = shownNow ? judgement.classes : judgement.classesBeforeReveal;
    for (const r of items) {
      if (r.status !== 'accepted' || r.accepted === undefined) continue;
      const cls = (Object.hasOwn(inForce, r.key) ? inForce[r.key] : undefined) ?? UNKNOWN_CLASS;
      if (!((cls.belief && !r.accepted.belief) || (cls.changesProved && !r.accepted.changesProved))) continue;
      toReview(r);
      badgesGrew.push(r.id);
      returned.add(r.id);
      for (const id of acceptedDependentsBack(r.id)) returned.add(id);
    }
  }

  // ---- 8. RV-5, defensively: an accepted item with a dependency outside its SCC that is not accepted
  if (!partial) {
    const component = componentOf(
      items.map((r) => r.id),
      depsOf,
    );
    for (let more = true; more; ) {
      more = false;
      for (const r of items) {
        if (r.status !== 'accepted') continue;
        const own = component.get(r.id);
        const open = depsOf(r.id).some((d) => component.get(d) !== own && byId.get(d)?.status !== 'accepted');
        if (!open) continue;
        toReview(r);
        dependencyNotAccepted.push(r.id);
        more = true;
      }
    }
  }

  // ---- the force again (D2-23 and RV-5 may have made a meaning item undecided), and seen early
  if (forced !== undefined && endsForce()) forced = undefined;
  // ADV-1: the results were shown, and only D2-23's returns (with their RV-5 dependents) would hide them again: they
  // stay shown, under telelean's `decided` force, which marks nothing seen early.
  if (forced === undefined && shownNow && returned.size > 0) {
    const after = resultsState({ items, classesBeforeReveal: judgement.classesBeforeReveal, forced: null });
    if (!after.shown && after.waitingFor.every((id) => returned.has(id))) forced = { via: 'decided', at: i.at };
  }
  const final = resultsState({ items, classesBeforeReveal: judgement.classesBeforeReveal, forced: forced ?? null });
  if (forced !== undefined && forced.via !== 'decided' && final.waitingFor.length > 0) for (const r of items) if (r.kind === 'result') addMarker(r, 'seen-early');

  // ---- the write's ws/ part: content the judge takes out, written premises no status keeps in ws/, and content that
  // came back with no step proposing it (V2A-C2)
  const reverts: string[] = [];
  for (const r of items) {
    if (keptOut.has(r.id)) {
      reverts.push(r.id);
      continue;
    }
    if (r.status === 'withdrawn' && r.kind !== 'add-premise') continue;
    const was = start.get(r.id);
    const before = was === undefined ? r.kind !== 'add-premise' : inWorkingCopy(r.kind, was, r.card);
    if (before && !inWorkingCopy(r.kind, r, r.card, was)) reverts.push(r.id);
  }

  // ---- events: listed items only, as the results are after this judgement
  const listed = (id: string) => {
    const r = byId.get(id);
    return r !== undefined && (final.shown || !isResultOrPart(r));
  };
  const events: Array<{ text: string; items: string[] }> = [];
  const event = (text: string, ids: readonly string[]) => {
    const shown = [...new Set(ids)].filter(listed);
    if (shown.length > 0) events.push({ text, items: shown });
  };
  event(REVIEW_TEXTS.eventChanged, changedAccepted);
  event(REVIEW_TEXTS.eventResultChanged, resultsChanged);
  event(
    REVIEW_TEXTS.eventProposedAgain,
    proposedAgain.filter((id) => byId.get(id)?.status === 'in-review'),
  );
  event(REVIEW_TEXTS.eventTakenOutAgain, [...keptOut]);
  event(REVIEW_TEXTS.eventWithdrawn, withdrawn);
  event(REVIEW_TEXTS.eventNoLongerBuilds, noLongerBuilds);
  event(REVIEW_TEXTS.eventNoLongerPasses, noLongerPasses);
  event(
    REVIEW_TEXTS.eventRedoneWith,
    redoneWith.filter((id) => !noLongerBuilds.includes(id) && !noLongerPasses.includes(id)),
  );
  event(REVIEW_TEXTS.eventNoLongerClosesGap, gapNotClosed);
  event(REVIEW_TEXTS.eventRedoneAtOnce, redoneAtOnce);
  event(REVIEW_TEXTS.eventBadgesGrew, badgesGrew);
  event(
    REVIEW_TEXTS.eventChangedWith,
    withDependents.filter((id) => byId.get(id)?.status === 'in-review'),
  );
  event(REVIEW_TEXTS.eventDependencyNotAccepted, dependencyNotAccepted);

  const records: SessionRecords = { ...i.records, items, premises };
  if (forced !== undefined) records.forced = forced;
  else delete records.forced;
  return { records, events, problems, reverts };
}
