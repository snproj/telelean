/**
 * Slice 2a2 (docs/slice2-plan.md section 4.7, D2-61): the stage reveal rule. The results of a stage are shown or hidden
 * together: shown when no meaning item is undecided, or when Show results forced them; hidden otherwise.
 *
 * A meaning item is a statement item (Formalize, Change, Add) or a belief item that is neither a Result nor a Result's
 * part; its belief is always read from `classesBeforeReveal`, which no Result's part affects, so showing the results
 * never changes what they wait for (F1). It is undecided while it is in review (2j1, D2-76: one to be redone, its content
 * kept or not, is finished for the review). Results' statuses are never read, so the rule tells nothing about them.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { isUndecided } from './records.js';
import type { ItemClass, ItemRecord, SessionForce } from './types.js';

const STATEMENT_KINDS: ReadonlySet<string> = new Set(['formalize', 'change', 'add']);

/** A Result or a Result's part (`partOf`): hidden while the results are (§4.7). */
export const isResultOrPart = (r: Pick<ItemRecord, 'kind' | 'partOf'>): boolean => r.kind === 'result' || r.partOf !== undefined;

/**
 * §4.7: a statement or belief item that is neither a Result nor a Result's part. An item the judgement gave no class
 * counts as a belief (fail closed, D2-25).
 */
export function isMeaningItem(r: Pick<ItemRecord, 'kind' | 'partOf' | 'key'>, classesBeforeReveal: Readonly<Record<string, ItemClass>>): boolean {
  if (isResultOrPart(r)) return false;
  if (STATEMENT_KINDS.has(r.kind)) return true;
  const cls = Object.hasOwn(classesBeforeReveal, r.key) ? classesBeforeReveal[r.key] : undefined;
  return cls === undefined || cls.belief;
}

/**
 * §4.7 (2a2): the stage reveal. `meaning`: the statement and belief items that are not Results' parts (belief read
 * from `classesBeforeReveal`, by item key); `waitingFor`: those that are undecided, in review (2j1, D2-76). Both in
 * the records' order, by item id.
 */
export function resultsState(i: {
  items: readonly ItemRecord[];
  classesBeforeReveal: Readonly<Record<string, ItemClass>>;
  forced: SessionForce | null;
}): { shown: boolean; meaning: string[]; waitingFor: string[] } {
  const meaning: string[] = [];
  const waitingFor: string[] = [];
  for (const r of i.items) {
    if (!isMeaningItem(r, i.classesBeforeReveal)) continue;
    meaning.push(r.id);
    if (isUndecided(r)) waitingFor.push(r.id);
  }
  return { shown: waitingFor.length === 0 || i.forced !== null, meaning, waitingFor };
}
