/**
 * Slice 2a1 (docs/slice2-plan.md section 4.1): elaborated closures over the facts' `typeConsts` and `valueConsts`.
 *
 *  - `constsOf(f, mode)`: one declaration's constants. `meaning` (statement closures): a theorem, a Prop-valued
 *    declaration, an axiom or an opaque gives its typeConsts; a def, abbrev, data instance or other gives typeConsts ∪
 *    valueConsts; an inductive, structure or class gives its typeConsts (constructors included, §2.1). `uses` (item
 *    dependencies, proofs): typeConsts ∪ valueConsts for every kind. Undefined when an array it needs is missing.
 *  - `reach(model, start, mode, stopAt?)`: a breadth-first walk from several sources, memoised per model.
 *  - `statementReach(model, drafts)`: R_stmt, the meaning closure of every card statement of every subject, plus the
 *    statements of the given Add premise drafts (from `PremiseDraft.facts`), with `by` (who reaches each name).
 *
 * A closure that meets a declaration without facts, or without an array its mode needs, is `complete: false` (D2-25:
 * classes then count belief, and Apply is refused; that is the readers' part).
 */
import type { DeclFacts } from '../facts.js';
import { declTables } from '../gate/decls.js';
import type { ProjectModel } from '../project/types.js';
import { normalizeWhitespace } from '../project/text.js';
import { premiseKey } from './keys.js';
import type { PremiseDraft } from './types.js';

export type ClosureMode = 'meaning' | 'uses';

/** What a walk reached. */
export interface Reach {
  /** Every declaration of the model the walk reached, its starts included. */
  names: ReadonlySet<string>;
  /** False when the walk met a declaration with no facts, or without the constants its mode needs. */
  complete: boolean;
  /** Those declarations, in the order the walk met them. */
  missing: string[];
}

/** R_stmt (§4.1). */
export interface StatementReach extends Reach {
  /** Which cards' statements (card ids) and which drafts (their item keys, `premise:<T>:<leanName>`) reach each name. */
  by: Record<string, string[]>;
}

const STRUCTURAL = new Set(['inductive', 'structure', 'class']);
const TYPE_ONLY = new Set(['theorem', 'axiom', 'opaque']);

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

/** Whether the declaration is a proof of a proposition (its type's sort is `Prop`). */
export function isPropValued(f: DeclFacts): boolean {
  return f.typeSort !== undefined && normalizeWhitespace(f.typeSort) === 'Prop';
}

/** §4.1: a declaration's constants for a closure; undefined when an array the mode needs is missing. */
export function constsOf(f: DeclFacts, mode: ClosureMode): string[] | undefined {
  const type = f.typeConsts;
  if (type === undefined) return undefined;
  if (mode === 'meaning') {
    if (f.kind !== undefined && STRUCTURAL.has(f.kind)) return [...new Set(type)];
    if ((f.kind !== undefined && TYPE_ONLY.has(f.kind)) || isPropValued(f)) return [...new Set(type)];
  }
  const value = f.valueConsts;
  if (value === undefined) return undefined;
  return union(type, value);
}

/**
 * A declaration's `uses` constants, or, when its facts lack an array (D2-25), the over-approximation `refs ∪
 * valueConsts` with `complete: false`.
 */
export function usesOrRefs(f: DeclFacts): { names: string[]; complete: boolean } {
  const uses = constsOf(f, 'uses');
  if (uses !== undefined) return { names: uses, complete: true };
  return { names: union(f.refs.map((r) => r.name), f.valueConsts ?? []), complete: false };
}

type Lookup = (name: string) => DeclFacts | undefined;

function walk(lookup: Lookup, start: Iterable<string>, mode: ClosureMode, record: (name: string) => boolean, stopAt?: (name: string) => boolean): Reach {
  const names = new Set<string>();
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue: Array<{ name: string; first: boolean }> = [];
  for (const name of start) {
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push({ name, first: true });
  }
  for (let k = 0; k < queue.length; k++) {
    const { name, first } = queue[k] as { name: string; first: boolean };
    if (record(name)) names.add(name);
    if (!first && stopAt?.(name) === true) continue;
    const facts = lookup(name);
    const next = facts === undefined ? undefined : constsOf(facts, mode);
    if (next === undefined) {
      missing.push(name);
      continue;
    }
    for (const c of next) {
      if (seen.has(c)) continue;
      seen.add(c);
      queue.push({ name: c, first: false });
    }
  }
  return { names, complete: missing.length === 0, missing };
}

interface Memo {
  meaning: Map<string, Reach>;
  uses: Map<string, Reach>;
}
const memos = new WeakMap<ProjectModel, Memo>();

function memoOf(model: ProjectModel): Memo {
  let memo = memos.get(model);
  if (!memo) {
    memo = { meaning: new Map(), uses: new Map() };
    memos.set(model, memo);
  }
  return memo;
}

const modelLookup = (model: ProjectModel): Lookup => (name) => model.declFacts.get(name);

/** The closure of one declaration (memoised per model and mode). */
function closureOf(model: ProjectModel, name: string, mode: ClosureMode): Reach {
  const memo = memoOf(model)[mode];
  let found = memo.get(name);
  if (!found) {
    found = walk(modelLookup(model), [name], mode, () => true);
    memo.set(name, found);
  }
  return found;
}

/**
 * §4.1: every declaration a breadth-first walk over `constsOf(·, mode)` reaches from `start` (the starts included).
 * `stopAt`: a declaration the walk reaches (never a start) that it records but does not walk through, e.g. one another
 * item owns (§4.5). Without `stopAt`, each start's closure is memoised per model.
 */
export function reach(model: ProjectModel, start: Iterable<string>, mode: ClosureMode, stopAt?: (name: string) => boolean): Reach {
  if (stopAt !== undefined) return walk(modelLookup(model), start, mode, () => true, stopAt);
  const names = new Set<string>();
  const missing: string[] = [];
  for (const name of start) {
    const one = closureOf(model, name, mode);
    for (const n of one.names) names.add(n);
    for (const m of one.missing) if (!missing.includes(m)) missing.push(m);
  }
  return { names, complete: missing.length === 0, missing };
}

/**
 * The meaning closure of one premise draft's statement alone: walked from its scratch facts (`PremiseDraft.facts`) into
 * the model. `names` holds the model's declarations only (the draft's own scratch names are not in ws/).
 * Fail closed (D2-25, fixer 2a1 F6): when the facts do not hold the draft's own statement (`leanName`, qualified or
 * not), e.g. before its first check or after a failed re-check, the walk cannot see what the statement reaches, so it
 * is `complete: false` with `leanName` first in `missing`.
 */
export function draftReach(model: ProjectModel, draft: PremiseDraft): Reach {
  const tables = declTables(model);
  const local = draft.facts;
  const starts = Object.keys(local).sort();
  const lookup: Lookup = (name) => model.declFacts.get(name) ?? (Object.hasOwn(local, name) ? local[name] : undefined);
  const reached = walk(lookup, starts, 'meaning', (name) => model.declFacts.has(name) || tables.byName.has(name));
  if (starts.some((name) => name === draft.leanName || name.endsWith(`.${draft.leanName}`))) return reached;
  return { names: reached.names, complete: false, missing: [draft.leanName, ...reached.missing.filter((m) => m !== draft.leanName)] };
}

/**
 * §4.1 R_stmt: the meaning closure of every card statement of every subject, through other statements, definitions,
 * lemma types and instances (a `.holds` counts by its type only: `constsOf`), plus the statements of `drafts`
 * (`draftReach`). `names` holds the model's declarations only. A card bound to a name no declaration has is skipped.
 */
export function statementReach(model: ProjectModel, drafts: readonly PremiseDraft[]): StatementReach {
  const tables = declTables(model);
  const inModel = (name: string) => model.declFacts.has(name) || tables.byName.has(name);
  const names = new Set<string>();
  const missing: string[] = [];
  const by = new Map<string, Set<string>>();
  const add = (reached: Reach, who: string) => {
    for (const name of reached.names) {
      if (!inModel(name)) continue;
      names.add(name);
      let list = by.get(name);
      if (!list) by.set(name, (list = new Set()));
      list.add(who);
    }
    for (const m of reached.missing) if (!missing.includes(m)) missing.push(m);
  };
  const ids = [...model.nodes.keys()].sort();
  for (const id of ids) {
    const statement = model.nodes.get(id)?.node.lean.statement;
    if (statement === undefined || !inModel(statement)) continue;
    add(closureOf(model, statement, 'meaning'), id);
  }
  for (const draft of drafts) add(draftReach(model, draft), premiseKey(draft.target, draft.leanName));
  const byRecord: Record<string, string[]> = {};
  for (const name of [...by.keys()].sort()) byRecord[name] = [...(by.get(name) ?? [])].sort();
  return { names, complete: missing.length === 0, missing, by: byRecord };
}
