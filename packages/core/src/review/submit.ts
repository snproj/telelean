/**
 * Slice 2b2 (docs/slice2-plan.md sections 3.7 and 2.9; D2-2, D2-54, D2-57): Submit review's plan. Submit is open only
 * while the results are shown, so the plan reads every item's real status and the stage judgement's RV-5 edges.
 *
 *  - `counts`: the Shaky items (declined Shaky, or to be redone keeping their Shaky decline) and the other items to be
 *    redone. With neither, `confirm`: the end confirmation, with no Claude step and no seal (D2-54).
 *  - Otherwise one `submit` step per affected inference: the inferences of the Shaky and to-be-redone items (a
 *    Result's target, else the target of the step that proposed the item), each the session's. Each step opens its
 *    inference's Shaky and to-be-redone items (`StepScope.openItems`).
 *  - `takeOut` (D2-57): every Shaky or to-be-redone item whose content is still in ws/ and that depends, directly or
 *    transitively (RV-5), on an item another step of the queue opens. That step may change what the item rests on while
 *    the item's own step keeps it fixed, so it would stop building there and count against Claude; it is taken out
 *    before the queue starts (to be redone, reverted; a Shaky one keeps its decline), and its own step proposes it again.
 *  - `steps` (D2-57): a step whose open items others depend on runs before those others (RV-5 over the open items);
 *    then sources first (a source of another affected inference's question runs before it), ties by the inferences'
 *    `order` (formalizeOrder's: sources first, then reading order). A cycle among them is broken by `order`.
 *  - `partlyAccepted` (builder 2b2, additive): the cycles of items (RV-5 SCCs of two or more) with an accepted member
 *    that are not wholly accepted, as item ids: Submit to the end confirmation is refused while one exists ("Accept or
 *    reject all of ‹items› together.", §3.7; §4.5: an SCC with an accepted member must be wholly accepted).
 * An item whose inference is no inference of the session (none recorded) counts, but no step can rework it.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { inferenceOf, inWorkingCopy, isShaky } from './records.js';
import { stronglyConnected } from './scc.js';
import type { ItemRecord, SessionRecords, StateJudgement, SubmitPlan } from './types.js';

/** §3.7 (2b2): the affected inferences, the content to take out first, and the order of the steps (D2-57). */
export function planSubmit(i: { records: SessionRecords; judgement: StateJudgement }): SubmitPlan {
  const { records, judgement } = i;
  const items = records.items;
  const shaky = items.filter((r) => isShaky(r));
  const redo = items.filter((r) => r.status === 'to-be-redone' && !isShaky(r));
  const counts = { shaky: shaky.length, redo: redo.length };
  const partlyAccepted = cyclesPartlyAccepted(items, judgement);
  if (shaky.length === 0 && redo.length === 0) return { confirm: true, steps: [], takeOut: [], counts, partlyAccepted };

  // The affected inferences and what each step opens (its inference's Shaky and to-be-redone items).
  const inferences = new Map(records.inferences.map((inf) => [inf.target, inf]));
  const openBy = new Map<string, string>();
  const affected = new Set<string>();
  for (const r of items) {
    if (!(isShaky(r) || r.status === 'to-be-redone')) continue;
    const target = inferenceOf(r);
    if (target === undefined || !inferences.has(target)) continue;
    openBy.set(r.key, target);
    affected.add(target);
  }

  /** The keys an item depends on, transitively (RV-5, the stage judgement's edges), itself left out. */
  const reached = new Map<string, Set<string>>();
  const reachOf = (key: string): Set<string> => {
    const known = reached.get(key);
    if (known !== undefined) return known;
    const seen = new Set<string>([key]);
    const queue = [key];
    for (let k = 0; k < queue.length; k++) {
      for (const next of judgement.deps[queue[k] as string] ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    seen.delete(key);
    reached.set(key, seen);
    return seen;
  };

  // D2-57: take out a kept Shaky or to-be-redone item that rests on what another step opens; the RV-5 order of steps.
  const takeOut: string[] = [];
  const after = new Map<string, Set<string>>([...affected].map((t) => [t, new Set<string>()]));
  for (const r of items) {
    const own = openBy.get(r.key);
    if (own === undefined) continue;
    let restsOnOther = false;
    for (const key of reachOf(r.key)) {
      const other = openBy.get(key);
      if (other === undefined || other === own) continue;
      restsOnOther = true;
      after.get(own)?.add(other);
    }
    if (restsOnOther && keptInWs(r)) takeOut.push(r.id);
  }

  // The order: RV-5 first, then sources first, ties (and any cycle) by `order`.
  const sourcesOf = (t: string) => new Set((inferences.get(t)?.question.sources ?? []).filter((s) => affected.has(s) && s !== t));
  const rank = (t: string) => inferences.get(t)?.order ?? Number.MAX_SAFE_INTEGER;
  const byRank = (a: string, b: string) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
  const remaining = [...affected];
  const steps: string[] = [];
  while (remaining.length > 0) {
    const ready = remaining.filter((t) => [...(after.get(t) ?? [])].every((u) => !remaining.includes(u)));
    const candidates = ready.length > 0 ? ready : remaining;
    const sourced = candidates.filter((t) => [...sourcesOf(t)].every((u) => !remaining.includes(u)));
    const next = (sourced.length > 0 ? sourced : candidates).sort(byRank)[0] as string;
    steps.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return { confirm: false, steps, takeOut, counts, partlyAccepted };
}

/** Its content is in ws/ now: declined Shaky, or to be redone without revert; an Add premise only once written. */
function keptInWs(r: ItemRecord): boolean {
  return inWorkingCopy(r.kind, r, r.card) && (r.kind !== 'add-premise' || r.card !== undefined);
}

/** §4.5: the RV-5 cycles (SCCs of two or more items) with an accepted member that are not wholly accepted, by item id. */
function cyclesPartlyAccepted(items: readonly ItemRecord[], judgement: StateJudgement): string[][] {
  const byKey = new Map(items.map((r) => [r.key, r]));
  const keys = items.map((r) => r.key).filter((k) => Object.hasOwn(judgement.deps, k));
  const out: string[][] = [];
  for (const component of stronglyConnected(keys, (k) => (judgement.deps[k] ?? []).filter((d) => byKey.has(d)))) {
    if (component.length < 2) continue;
    const members = component.map((k) => byKey.get(k) as ItemRecord);
    const accepted = members.filter((r) => r.status === 'accepted').length;
    if (accepted > 0 && accepted < members.length) out.push(items.filter((r) => component.includes(r.key)).map((r) => r.id));
  }
  return out;
}
