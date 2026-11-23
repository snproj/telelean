/**
 * Slice 2a2 (docs/slice2-plan.md sections 3.1, 3.5, 4.6 and 4.7): what the status rules read of an item record, shared
 * by the reveal rule (`reveal.ts`), the reducer and reconcile. Later core sub-slices import it from here;
 * `review/index.ts` exports `depsById` and `fallbackLabel` for the host and the runner (fixer 2a, V2A-S6).
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { canonicalJson } from './hash.js';
import { parseItemKey } from './keys.js';
import { DECL_KIND_LABELS, ITEM_KIND_LABELS } from './texts.js';
import type { ItemKind, ItemRecord, ItemState } from './types.js';

type StatusPart = Pick<ItemRecord, 'status' | 'decline' | 'redo'>;

export const isArrowKind = (kind: ItemKind): boolean => kind === 'add-arrow' || kind === 'remove-arrow';

/** A cascade or the judge took the item's content out of ws/ (`redo.reverted`), whatever its status now. */
export const isReverted = (r: { redo?: ItemRecord['redo'] }): boolean => r.redo?.reverted === true;

/**
 * §4.7 (2j1, D2-76): undecided: in review. An item to be redone, its content kept or taken out, is finished for the
 * review (RV-3 as amended), so it keeps no result hidden and blocks no Submit (AF4's clause, which counted one with its
 * content in ws/, is superseded).
 */
export function isUndecided(r: StatusPart): boolean {
  return r.status === 'in-review';
}

/**
 * A record's `redo`, copied; `kind` only when set (a record saved before 2j1 has none, D2-77); `note` only when set
 * (2j2, D2-93: every rule that rebuilds `redo` from a copy keeps the person's note).
 */
export function copyRedo(redo: NonNullable<ItemRecord['redo']>): NonNullable<ItemRecord['redo']> {
  return {
    because: [...redo.because],
    reverted: redo.reverted,
    ...(redo.kind !== undefined ? { kind: redo.kind } : {}),
    ...(redo.note !== undefined ? { note: redo.note } : {}),
  };
}

/** 2j2 (D2-93): the note a rule that rebuilds `redo` keeps, as a spread (`{ ...keepNote(x.redo) }`). */
export function keepNote(redo: ItemRecord['redo']): { note?: string } {
  return redo?.note !== undefined ? { note: redo.note } : {};
}

/**
 * 2j2 (D2-93): an item's note for Claude lives only while it is to be redone. Every record that left that status (a
 * decline, an Accept, the automatic return, reconcile's new proposal; a declined one keeps `redo` when a cascade took its
 * content out first, D2-60) loses it, in place. Returns the ids it changed.
 */
export function dropStaleRedoNotes(items: readonly ItemRecord[], before?: (id: string) => void): string[] {
  const out: string[] = [];
  for (const r of items) {
    if (r.status === 'to-be-redone' || r.redo?.note === undefined) continue;
    before?.(r.id);
    delete r.redo.note;
    out.push(r.id);
  }
  return out;
}

/** Declined by Reject, a plain decline or Transform: the content is out of ws/ (§3.1). */
export const isDeclinedOut = (r: StatusPart): boolean => r.status === 'declined' && r.decline?.option !== 'shaky';

/** Shaky: declined Shaky, or to be redone keeping its Shaky decline (a Reject cascade or Submit's take-out, §3.7). */
export const isShaky = (r: StatusPart): boolean => r.decline?.option === 'shaky' && (r.status === 'declined' || r.status === 'to-be-redone');

/**
 * §3.1: whether the item's content is in ws/ under its status: in review, accepted, declined Shaky, or to be redone,
 * unless a cascade or the judge took it out (`redo.reverted`). An Add premise is in ws/ only once written (§3.8): here,
 * "in" means it stays written when it is: accepted, declined Shaky or to be redone without revert, or in review only
 * while it was written in review and never left it (a converted v1 ghost, whose record holds its `card`, §3.11). `from`:
 * the state it came from, for a transition: a written premise that comes back to review from any other status is
 * taken out (§3.8), although its record still holds its `card` until that take-out.
 */
export function inWorkingCopy(kind: ItemKind, r: StatusPart, card?: string, from?: StatusPart): boolean {
  if (isReverted(r)) return false;
  if (kind === 'add-premise') {
    if (r.status === 'in-review') return card !== undefined && (from === undefined || from.status === 'in-review');
    return r.status === 'accepted' || r.status === 'to-be-redone' || (r.status === 'declined' && r.decline?.option === 'shaky');
  }
  if (r.status === 'declined') return r.decline?.option === 'shaky';
  return r.status !== 'withdrawn';
}

/** A record's state as one action may change it (§2.2 `ItemState`), copied. */
export function itemStateOf(r: ItemRecord): ItemState {
  return {
    status: r.status,
    ...(r.decline !== undefined ? { decline: { ...r.decline } } : {}),
    ...(r.accepted !== undefined
      ? { accepted: { ...r.accepted, ...(r.accepted.result ? { result: { ...r.accepted.result, restsOn: [...r.accepted.result.restsOn] } } : {}) } }
      : {}),
    ...(r.redo !== undefined ? { redo: copyRedo(r.redo) } : {}),
    markers: [...r.markers],
    rejectedFingerprints: [...r.rejectedFingerprints],
    rejectedRevs: r.versions.filter((v) => v.rejected === true).map((v) => v.rev),
  };
}

/** Puts a state on a record (in place), the versions' rejected flags included. */
export function applyItemState(r: ItemRecord, s: ItemState): void {
  r.status = s.status;
  if (s.decline !== undefined) r.decline = { ...s.decline };
  else delete r.decline;
  if (s.accepted !== undefined) r.accepted = { ...s.accepted };
  else delete r.accepted;
  if (s.redo !== undefined) r.redo = copyRedo(s.redo);
  else delete r.redo;
  r.markers = [...s.markers];
  r.rejectedFingerprints = [...s.rejectedFingerprints];
  const rejected = new Set(s.rejectedRevs);
  r.versions = r.versions.map((v) => ({
    rev: v.rev,
    stage: v.stage,
    fingerprint: v.fingerprint,
    content: v.content,
    ...(rejected.has(v.rev) ? { rejected: true } : {}),
  }));
}

/**
 * The decision a state records, for comparing an item now with what an action left (Undo, D2-73): everything but the
 * markers and what telelean's writes add afterwards (the decision commit, a premise write's written key).
 */
export function decisionKey(s: ItemState): string {
  const accepted = s.accepted === undefined ? undefined : { ...s.accepted, fingerprint: undefined };
  const decline = s.decline === undefined ? undefined : { ...s.decline, commit: undefined };
  return canonicalJson({
    status: s.status,
    decline,
    accepted,
    redo: s.redo,
    rejectedFingerprints: [...s.rejectedFingerprints].sort(),
    rejectedRevs: [...s.rejectedRevs].sort((a, b) => a - b),
  });
}

/** Records are plain JSON: a deep copy. */
export function cloneRecord(r: ItemRecord): ItemRecord {
  return JSON.parse(JSON.stringify(r)) as ItemRecord;
}

/** The target of a Result (`proof:<T>`), or undefined. */
export function resultTargetOf(r: Pick<ItemRecord, 'key'>): string | undefined {
  const parsed = parseItemKey(r.key);
  return parsed?.kind === 'proof' ? parsed.node : undefined;
}

/** The inference an item belongs to (§3.7: a Result's target, else the target of the step that proposed it). */
export function inferenceOf(r: Pick<ItemRecord, 'key' | 'kind' | 'origin'>): string | undefined {
  if (r.kind === 'result') return resultTargetOf(r);
  return r.origin.target === '' ? undefined : r.origin.target;
}

/**
 * An item's label when the caller gives none (`ReviewState.labels`): its kind's label and the names of its key, e.g.
 * `Formalize “pg-no-dark-past”`, `Add arrow “s” → “t”`, `Definition Spyro.Evil`.
 */
export function fallbackLabel(r: Pick<ItemRecord, 'key' | 'kind' | 'declKind' | 'content'>): string {
  const kind = r.kind === 'declaration' && r.declKind !== undefined ? DECL_KIND_LABELS[r.declKind] : ITEM_KIND_LABELS[r.kind];
  const parsed = parseItemKey(r.key);
  let what = r.key;
  if (parsed?.kind === 'card' || parsed?.kind === 'proof') what = `“${parsed.node}”`;
  else if (parsed?.kind === 'premise') what = `“${r.content.premise?.naturalName ?? parsed.leanName}”`;
  else if (parsed?.kind === 'arrow' || parsed?.kind === 'unarrow') what = `“${parsed.arrow.source}” → “${parsed.arrow.target}”`;
  else if (parsed?.kind === 'vocab' || parsed?.kind === 'decl') what = parsed.name;
  return `${kind} ${what}`;
}

/** RV-5 edges by item id, from a judgement's edges by key (the reducer's `ReviewState.deps`). */
export function depsById(items: readonly Pick<ItemRecord, 'id' | 'key'>[], deps: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const idOf = new Map(items.map((r) => [r.key, r.id]));
  const out: Record<string, string[]> = {};
  for (const r of items) {
    const ids = (deps[r.key] ?? []).map((k) => idOf.get(k)).filter((id): id is string => id !== undefined && id !== r.id);
    out[r.id] = [...new Set(ids)].sort();
  }
  return out;
}
