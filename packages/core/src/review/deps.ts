/**
 * Slice 2a2 (docs/slice2-plan.md section 4.5): RV-5 item dependencies, edges I -> J on the judged state:
 *  1. mentions: a walk over `constsOf(·, 'uses')` from I's declarations, through declarations no item owns and through
 *     I's own, stopping at a declaration that J ≠ I owns (memoised per declaration, cycles included). Facts without
 *     the constants over-approximate with refs ∪ valueConsts (`usesOrRefs`, D2-25);
 *  2. Results: Result(T) -> Result(u) for every source u whose session proof the inference counts (B.1's
 *     `throughResults`), and Result(T) -> the Add arrow or Add premise item of every arrow s -> T with s in direct(T);
 *  3. an arrow item -> the item adding the card at either end (none in slice 2);
 *  4. A17: an Add arrow -> every Remove arrow whose arrow lies on a cycle through it (none in slice 2);
 *  5. mentioned before: a Change or Delete -> every J whose version in B mentions a name it changes or removes.
 *
 * Cycles are SCCs (D2-26): the reducer reads them (`scc.ts`). Which edges a listed item may show while the results are
 * hidden is the reader's concern (§4.5's "Hidden items": the reducer and the view).
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import type { ArrowEnds } from '../actions.js';
import { holdsName } from '../facts.js';
import { declTables, factsOf } from '../gate/decls.js';
import type { ProjectModel } from '../project/types.js';
import { normalizeWhitespace } from '../project/text.js';
import { usesOrRefs } from './closure.js';
import { parseItemKey, proofKey } from './keys.js';
import { stronglyConnected } from './scc.js';
import type { InferenceJudgement, ItemDraft } from './types.js';

/** A declaration's `uses` constants in a model (refs ∪ valueConsts without the arrays); [] without facts. */
function usesIn(model: ProjectModel): (name: string) => string[] {
  const memo = new Map<string, string[]>();
  return (name) => {
    let found = memo.get(name);
    if (found === undefined) {
      const entry = declTables(model).byName.get(name);
      const facts = model.declFacts.get(name) ?? factsOf(model, name, entry);
      found = facts === undefined ? [] : usesOrRefs(facts).names.filter((c) => c !== name);
      memo.set(name, found);
    }
    return found;
  };
}

/**
 * The items a walk from a constant meets first (rule 1): the constant's owner, or, through declarations no item owns,
 * the owners they reach. Memoised per declaration over SCCs, so a cycle of unowned declarations is walked once.
 */
function frontierWalker(model: ProjectModel, owner: ReadonlyMap<string, string>): (name: string) => ReadonlySet<string> {
  const uses = usesIn(model);
  const tables = declTables(model);
  const known = (name: string) => model.declFacts.has(name) || tables.byName.has(name);
  const memo = new Map<string, Set<string>>();
  const none: ReadonlySet<string> = new Set();
  return (start) => {
    const own = owner.get(start);
    if (own !== undefined) return new Set([own]);
    if (!known(start)) return none;
    const done = memo.get(start);
    if (done !== undefined) return done;
    const unowned = (name: string) => !owner.has(name) && known(name);
    const components = stronglyConnected([start], (name) => uses(name).filter((c) => unowned(c) && !memo.has(c)));
    for (const component of components) {
      const set = new Set<string>();
      const members = new Set(component);
      for (const name of component) {
        for (const c of uses(name)) {
          const o = owner.get(c);
          if (o !== undefined) set.add(o);
          else if (!members.has(c)) for (const k of memo.get(c) ?? []) set.add(k);
        }
      }
      for (const name of component) memo.set(name, set);
    }
    return memo.get(start) ?? none;
  };
}

/** Whether `to` is reachable from `from` over the arrows (`from` itself counts). */
function reaches(arrows: ReadonlyMap<string, readonly string[]>, from: string, to: string): boolean {
  const seen = new Set([from]);
  const queue = [from];
  for (let k = 0; k < queue.length; k++) {
    const at = queue[k] as string;
    if (at === to) return true;
    for (const next of arrows.get(at) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** §4.5 (2a2): RV-5 edges by item key: the keys each item depends on, sorted; every draft has an entry. */
export function itemDeps(i: {
  base: ProjectModel;
  current: ProjectModel;
  drafts: readonly ItemDraft[];
  inferences: Readonly<Record<string, InferenceJudgement>>;
}): Record<string, string[]> {
  const B = i.base;
  const W = i.current;
  const owner = new Map<string, string>();
  for (const d of i.drafts) for (const name of d.provides.decls) if (!owner.has(name)) owner.set(name, d.key);
  const edges = new Map<string, Set<string>>(i.drafts.map((d) => [d.key, new Set<string>()]));
  const add = (from: string, to: string) => {
    if (from !== to && edges.has(to)) edges.get(from)?.add(to);
  };

  // 1. mentions (a draft's `mentions` are its declarations' uses constants, its own names left out).
  const frontier = frontierWalker(W, owner);
  for (const d of i.drafts) for (const c of d.mentions) for (const k of frontier(c)) add(d.key, k);

  // 2. Results.
  const providers = (arrow: ArrowEnds) =>
    i.drafts.filter((e) => (e.kind === 'add-arrow' || e.kind === 'add-premise') && e.provides.arrows.some((a) => a.source === arrow.source && a.target === arrow.target));
  for (const d of i.drafts) {
    if (d.kind !== 'result') continue;
    const parsed = parseItemKey(d.key);
    if (parsed?.kind !== 'proof') continue;
    const target = parsed.node;
    const judged = Object.hasOwn(i.inferences, target) ? i.inferences[target] : undefined;
    if (judged === undefined) continue;
    for (const u of judged.throughResults) add(d.key, proofKey(u));
    for (const s of judged.direct) for (const e of providers({ source: s, target })) add(d.key, e.key);
  }

  // 3. An arrow item -> the item that adds the card at either of its ends.
  for (const d of i.drafts) {
    if (d.kind !== 'add-arrow' && d.kind !== 'remove-arrow') continue;
    const parsed = parseItemKey(d.key);
    const arrow = d.provides.arrows[0] ?? (parsed?.kind === 'arrow' || parsed?.kind === 'unarrow' ? parsed.arrow : undefined);
    if (arrow === undefined) continue;
    for (const e of i.drafts) {
      if (e.kind !== 'add' && e.kind !== 'add-premise') continue;
      if (e.provides.cards.includes(arrow.source) || e.provides.cards.includes(arrow.target)) add(d.key, e.key);
    }
  }

  // 4. A17: an Add arrow s -> t depends on a Remove arrow x -> y on a cycle through it (t ⇝ x -> y ⇝ s).
  const removes = i.drafts.filter((d) => d.kind === 'remove-arrow');
  if (removes.length > 0) {
    const arrows = new Map<string, string[]>();
    const draw = (source: string, target: string) => arrows.set(source, [...(arrows.get(source) ?? []), target]);
    for (const n of W.nodes.values()) for (const source of n.node.premises) draw(source, n.node.id);
    const removed = removes.map((r) => ({ key: r.key, arrow: parseItemKey(r.key) })).filter((r) => r.arrow?.kind === 'unarrow');
    for (const r of removed) if (r.arrow?.kind === 'unarrow') draw(r.arrow.arrow.source, r.arrow.arrow.target);
    for (const d of i.drafts) {
      if (d.kind !== 'add-arrow') continue;
      const added = d.provides.arrows[0];
      if (added === undefined) continue;
      for (const r of removed) {
        if (r.arrow?.kind !== 'unarrow') continue;
        const { source: x, target: y } = r.arrow.arrow;
        if (reaches(arrows, added.target, x) && reaches(arrows, y, added.source)) add(d.key, r.key);
      }
    }
  }

  // 5. Mentioned before: a Change or Delete -> every J whose version in B mentions a name it changes or removes.
  const boundIn = (model: ProjectModel, card: string) => [...model.ownerOfDecl].filter(([, id]) => id === card).map(([name]) => name);
  const usesB = usesIn(B);
  const textOf = (model: ProjectModel, name: string) => declTables(model).byName.get(name)?.text;
  const versionInB = (e: ItemDraft): string[] => {
    const parsed = parseItemKey(e.key);
    if (parsed?.kind === 'card') return boundIn(B, parsed.node);
    if (parsed?.kind === 'proof') {
      const statement = B.nodes.get(parsed.node)?.node.lean.statement;
      return statement === undefined ? [] : [holdsName(statement)];
    }
    if (parsed?.kind === 'vocab' || parsed?.kind === 'decl') return [parsed.name];
    return [];
  };
  for (const d of i.drafts) {
    if (d.kind !== 'change' && d.kind !== 'delete') continue;
    const parsed = parseItemKey(d.key);
    if (parsed?.kind !== 'card') continue;
    const touched = new Set(
      boundIn(B, parsed.node).filter((name) => {
        const after = textOf(W, name);
        return after === undefined || normalizeWhitespace(after) !== normalizeWhitespace(textOf(B, name) ?? '');
      }),
    );
    if (touched.size === 0) continue;
    for (const e of i.drafts) {
      if (e.key === d.key) continue;
      if (versionInB(e).some((name) => usesB(name).some((c) => touched.has(c)))) add(d.key, e.key);
    }
  }

  const out: Record<string, string[]> = {};
  for (const d of i.drafts) out[d.key] = [...(edges.get(d.key) ?? [])].sort();
  return out;
}
