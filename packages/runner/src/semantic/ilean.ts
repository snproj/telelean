/**
 * Reading Lean's `.ilean` index (version 5 on Lean 4.35; docs/m1-plan.md section 4 step 6). Verified shape:
 *
 *   { "version": 5, "module": "Model.Spyro.Main", "directImports": [...],
 *     "decls": { "Spyro.cynder_dark_past": [23, 0, 24, 52, 24, 7, 24, 23], ... },
 *     "references": { "{\"c\":{\"m\":\"Model.Spyro.Vocabulary\",\"n\":\"Spyro.HasDarkPast\"}}":
 *                       { "definition": null, "usages": [[24, 34, 24, 45, "Spyro.cynder_dark_past"]] }, ... } }
 *
 * - `decls[name]` = the full range (from the docstring) then the selection range (the name), 0-based LSP
 *   positions with UTF-16 characters. JSON object order is alphabetical, not source order.
 * - `references` are keyed by a JSON-encoded `RefIdent` (`{"c":{"m":module,"n":name}}` for constants; other
 *   kinds are ignored). `definition` is null for constants of other modules, else `[l, c, l, c]` or
 *   `[l, c, l, c, parent]`; each usage is `[l, c, l, c, parent]`, `parent` being the declaration that contains it.
 * - Auxiliary names have no `decls` entry but a `definition` whose parent is another declaration: a structure's
 *   field `Spyro.Rec.past` has `definition: [101, 2, 101, 6, "Spyro.Rec"]`.
 * - Unlisted declarations (verified on Lean 4.35, fresh-model work of turn 13): `decls` leaves out some top-level
 *   declarations whose source mentions no constant, e.g. `abbrev p : Prop := 2 + 2 = 4`,
 *   `theorem t : 2 + 2 = 4 := by decide` or `theorem mp : ∀ (p q : Prop), p → (p → q) → q := fun _ _ hp h => h hp`
 *   (`abbrev q : Prop := True` and `axiom P0 : Prop` are listed). Such a declaration still has a `references` entry
 *   for itself whose `definition` has no parent (`[l, c, l, c]`, the name's range): it is reported with
 *   `unlisted: true`, and `declDrafts` keeps it when the source declares that name, so the facts cover it (without
 *   them the gate could not check it and refused it as "Lean reported nothing about …"). An `example` is elaborated
 *   as `<namespace>._example` with such an entry too and is skipped (it has no name).
 * - Names starting with `_private.` (private declarations) are skipped.
 */
import type { Range } from '@telelean/core';

export const SUPPORTED_ILEAN_VERSION = 5;

export interface IleanDecl {
  readonly name: string;
  readonly range: Range;
  readonly selectionRange: Range;
  /** For auxiliary names (no `decls` entry): the declaration `.ilean` attributes the definition to. */
  readonly parent?: string;
  /** No `decls` entry: only the name's range is known (`range` = `selectionRange`). */
  readonly auxiliary: boolean;
  /**
   * A top-level declaration that `decls` does not list (see the module comment): only the name's range is known here
   * (`range` = `selectionRange`); `declDrafts` finds its full range in the source.
   */
  readonly unlisted?: true;
}

export interface IleanUsage {
  /** The referenced constant. */
  readonly name: string;
  /** Module that defines it. */
  readonly module: string;
  readonly range: Range;
  /** The declaration containing the occurrence. */
  readonly parent: string;
}

export interface IleanData {
  readonly module: string;
  /** Source order (by full range start, then name), auxiliary names included. */
  readonly decls: IleanDecl[];
  /** Usages whose parent is one of `decls`, in source order. */
  readonly usages: IleanUsage[];
}

export type IleanResult = { readonly ok: true; readonly data: IleanData } | { readonly ok: false; readonly error: string };

const isPrivate = (name: string): boolean => name.startsWith('_private.');
/** The name Lean elaborates an `example` under (`Spyro._example`): not a declaration of the module. */
const isExample = (name: string): boolean => name === '_example' || name.endsWith('._example');

function isNat(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function rangeOf(a: readonly unknown[], at: number): Range | undefined {
  const [l1, c1, l2, c2] = [a[at], a[at + 1], a[at + 2], a[at + 3]];
  if (!isNat(l1) || !isNat(c1) || !isNat(l2) || !isNat(c2)) return undefined;
  return { start: { line: l1, character: c1 }, end: { line: l2, character: c2 } };
}

export function comparePositions(a: Range['start'], b: Range['start']): number {
  return a.line - b.line || a.character - b.character;
}

/** Parses the JSON text of one `.ilean` file for module `expectedModule`. Never throws. */
export function parseIlean(text: string, expectedModule: string): IleanResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'not a JSON object' };
  const root = json as { version?: unknown; module?: unknown; decls?: unknown; references?: unknown };
  if (root.version !== SUPPORTED_ILEAN_VERSION) {
    return { ok: false, error: `unsupported .ilean version ${JSON.stringify(root.version)} (expected ${SUPPORTED_ILEAN_VERSION})` };
  }
  if (root.module !== expectedModule) {
    return { ok: false, error: `.ilean is for module ${JSON.stringify(root.module)}, expected ${expectedModule}` };
  }
  if (typeof root.decls !== 'object' || root.decls === null || typeof root.references !== 'object' || root.references === null) {
    return { ok: false, error: '.ilean lacks "decls" or "references"' };
  }

  const decls = new Map<string, IleanDecl>();
  for (const [name, value] of Object.entries(root.decls as Record<string, unknown>)) {
    if (isPrivate(name) || !Array.isArray(value)) continue;
    const range = rangeOf(value, 0);
    const selectionRange = rangeOf(value, 4);
    if (range === undefined || selectionRange === undefined) continue;
    decls.set(name, { name, range, selectionRange, auxiliary: false });
  }

  const parents = new Map<string, string>();
  const auxiliary: IleanDecl[] = [];
  const unlisted: IleanDecl[] = [];
  const usages: IleanUsage[] = [];
  const pendingUsages: Array<{ name: string; module: string; usage: readonly unknown[] }> = [];
  for (const [key, value] of Object.entries(root.references as Record<string, unknown>)) {
    let ident: unknown;
    try {
      ident = JSON.parse(key);
    } catch {
      continue;
    }
    const c = typeof ident === 'object' && ident !== null ? (ident as { c?: unknown }).c : undefined;
    if (typeof c !== 'object' || c === null) continue; // not a constant (e.g. a local variable)
    const { m, n } = c as { m?: unknown; n?: unknown };
    if (typeof m !== 'string' || typeof n !== 'string' || typeof value !== 'object' || value === null) continue;
    const info = value as { definition?: unknown; usages?: unknown };

    if (m === expectedModule && !isPrivate(n) && Array.isArray(info.definition) && info.definition.length >= 5) {
      const parent = info.definition[4];
      if (typeof parent === 'string' && parent !== n && !isPrivate(parent)) {
        if (decls.has(n)) parents.set(n, parent);
        else {
          const sel = rangeOf(info.definition, 0);
          if (sel !== undefined) auxiliary.push({ name: n, range: sel, selectionRange: sel, parent, auxiliary: true });
        }
      }
    } else if (m === expectedModule && !isPrivate(n) && !isExample(n) && Array.isArray(info.definition) && info.definition.length === 4) {
      const sel = rangeOf(info.definition, 0);
      if (sel !== undefined) unlisted.push({ name: n, range: sel, selectionRange: sel, auxiliary: false, unlisted: true });
    }
    if (Array.isArray(info.usages)) {
      for (const usage of info.usages) if (Array.isArray(usage)) pendingUsages.push({ name: n, module: m, usage });
    }
  }

  for (const d of unlisted) if (!decls.has(d.name)) decls.set(d.name, d);
  for (const aux of auxiliary) {
    // Keep auxiliary names only when their parent is a declaration we report.
    if (decls.has(aux.parent ?? '') && !decls.has(aux.name)) decls.set(aux.name, aux);
  }
  for (const [name, parent] of parents) {
    const d = decls.get(name);
    if (d !== undefined && decls.has(parent)) decls.set(name, { ...d, parent });
  }
  for (const { name, module, usage } of pendingUsages) {
    const range = rangeOf(usage, 0);
    const parent = usage[4];
    if (range === undefined || typeof parent !== 'string' || !decls.has(parent)) continue;
    usages.push({ name, module, range, parent });
  }

  const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const sortedDecls = [...decls.values()].sort((a, b) => comparePositions(a.range.start, b.range.start) || byName(a, b));
  usages.sort((a, b) => comparePositions(a.range.start, b.range.start) || comparePositions(a.range.end, b.range.end) || byName(a, b));
  return { ok: true, data: { module: expectedModule, decls: sortedDecls, usages } };
}
