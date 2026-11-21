/**
 * Slice 2a1 (docs/slice2-plan.md sections 4.2 and 4.3): ownership and content keys.
 *
 * `computeItems` is one total, deterministic map from every difference between B and a judged state W to one item
 * key, or to a problem (`unowned`). A declaration counts as changed when its text differs, its facts' kind, type,
 * value, valueConsts or typeConsts differ (each fact compared only where both states have it), or it moved: to another
 * file, or out of its place among the declarations, blocks and lines of its file (`compareTexts`). Names that only
 * Lean reports (fields, constructors) follow their parent; a `.holds` is always a declaration of its own.
 *
 * Text outside declarations is compared line by line, in order, comments included (blank lines and whitespace inside
 * a line are no difference). A line of B that W lacks or moved is unowned. A line W adds is unowned (a command, an
 * `open … in` line, an `example`), except (§4.2, D2-52, F13; fixer 2a1):
 *  - the `namespace`/`section`/`mutual` and `end` lines that enclose only new declarations, owned jointly;
 *  - a comment line, which goes with the item of the new or changed declaration directly below it (only blank lines
 *    and comments in between), else directly above it; with no such declaration it is unowned.
 *
 * The rules, in the order they apply (§4.2):
 *  - a card's statement (its abbrev, its docstring mirror, its `lean:` pin, an AXIOM card's `.holds`, any other
 *    declaration bound to it, and the binding itself) -> `card:<c>`, Formalize when B had no statement, Change
 *    otherwise. The id write-back of a derived id goes with that item when it has another change, and is no difference
 *    on its own (telelean writes it with any field of such a block);
 *  - a PROPOSITION's `.holds`: a theorem -> `proof:<c>` when c is an inference's target; anything else -> unowned;
 *  - block fields: `premises:` additions -> `arrow:<s>><t>` (ledger `arrow`) or the `premise:` item (ledger `premise`);
 *    a `follows_from:` removal -> the premise item (ledger `mark-removed`); any other change of a block's lines, its
 *    written keys and their order included -> unowned;
 *  - a new block -> the `premise:` item that wrote it (ledger `premise`), with every declaration bound to it; any other
 *    new, removed or moved block -> unowned;
 *  - a new declaration that no card owns: its owner is fixed by the ledger's `created` entry (or, for the active step,
 *    by the step itself), never by later reach (F7). An axiom that is neither a shape-passing term nor a presupposition
 *    (a Prop axiom bound to no card, D2-40) -> unowned, in either phase. Created in a statement phase: a shape-passing
 *    sort, predicate, constant or function -> `vocab:<name>`; a presupposition with its helper instance -> `decl:<name>`;
 *    any other definition, instance, coercion or opaque -> `decl:<name>`. Created in a proof phase, and every theorem:
 *    proof material of `proof:<T>`, except a definition that a premise draft of the same step reached when the step
 *    ended (the `created` entry's `draft`; for the active step, its drafts now): a `decl:` item that is part of T's
 *    Result (D2-42). No owner: unowned;
 *  - a changed existing declaration bound to no card -> `decl:<name>` (vocabulary change); a removed one -> unowned;
 *  - a Result for every inference whose step ended (F9), `asInBase` when T.holds is B's (the same declaration, or
 *    absent in both) and it has no proof material (AF1); premise items for the drafts of those inferences only (AF10),
 *    from the draft while no ledger `premise` entry names its key, and from ws/ once one does.
 *
 * Content keys (§4.3): the sha256 of canonical JSON of the owned names (sorted; each with its text, whitespace
 * collapsed, its kind, its normalised type and value, its sorted valueConsts and typeConsts, its children's facts and
 * the comment lines attached to it; a name the state does not have is `absent`), the owned field entries (a new block's
 * every field; in an existing block, only the entries the item adds or removes) and the arrows. Positions never count.
 * A premise draft's key, while it is outside ws/, is the sha256 of its sentence, its whitespace-collapsed Lean
 * statement and its target. A draft with a declaration whose module did not build (no facts for its file) is marked
 * `factsMissing` (fixer 2a, ADV-3): its key and `mentions` lack the facts' part, so reconcile keeps its record. So is
 * every draft with a declaration in a state whose probe failed (`probeFailure` of its facts, 2b2; §2.1, D2-75): none of
 * its declarations has constants. B's facts never decide this.
 */
import type { ArrowEnds } from '../actions.js';
import type { DeclFacts } from '../facts.js';
import { holdsName, probeFailure, statementOfHolds } from '../facts.js';
import { declTables, factsOf, type DeclEntry, type DeclTables } from '../gate/decls.js';
import type { FrozenSnapshot } from '../gate/types.js';
import type { MarkupBlock, ParsedFile, Span } from '../markup/types.js';
import { splitList } from '../markup/values.js';
import type { VocabItem } from '../model.js';
import { keywordKind } from '../project/factsIndex.js';
import type { ProjectModel } from '../project/types.js';
import { blankComments, cutText, normalizeWhitespace, rangeContains } from '../project/text.js';
import { anonymousInstanceName, signatureText } from '../project/vocabulary.js';
import { draftReach, usesOrRefs } from './closure.js';
import { hashOf } from './hash.js';
import { arrowKey, cardKey, declKey, premiseKey, proofKey, vocabKey } from './keys.js';
import { REVIEW_TEXTS } from './texts.js';
import type { DeclKind, ItemContent, ItemDraft, ItemKind, LedgerEntry, PremiseDraft, SessionInference, StateJudgement } from './types.js';

type Problem = StateJudgement['problems'][number];
type Origin = ItemDraft['origin'];

/** computeItems' input (§2.9). */
export interface ComputeItemsInput {
  base: ProjectModel;
  current: ProjectModel;
  ledger: readonly LedgerEntry[];
  premises: readonly PremiseDraft[];
  inferences: readonly SessionInference[];
  ended: readonly string[];
  active?: { step: string; target: string; stepStart: ProjectModel; freeze?: FrozenSnapshot };
}

// ---------------------------------------------------------------------------------------------
// Content keys

/** §4.3: a premise draft's key while it is outside ws/ (also DO-1's key for a rejected premise). */
export function premiseDraftKey(draft: Pick<PremiseDraft, 'naturalName' | 'leanStatement' | 'target'>): string {
  return hashOf({ sentence: draft.naturalName.trim(), statement: normalizeWhitespace(draft.leanStatement), target: draft.target });
}

const sortedSet = (list: readonly string[] | undefined) => (list === undefined ? undefined : [...new Set(list)].sort());
const norm = (text: string | undefined) => (text === undefined ? undefined : normalizeWhitespace(text));

function factsMaterial(f: DeclFacts | undefined) {
  if (f === undefined) return {};
  return { kind: f.kind, type: norm(f.type), value: norm(f.value), valueConsts: sortedSet(f.valueConsts), typeConsts: sortedSet(f.typeConsts) };
}

// ---------------------------------------------------------------------------------------------
// Comparing two sequences in order

/** At most this many insertions and deletions in the middle of one comparison; beyond it the middle counts as changed. */
const MAX_EDITS = 2000;

/**
 * Which elements of `a` and of `b` a longest common subsequence keeps in place (Myers' O(ND) diff, after the common
 * start and end). An element that is not kept was removed, added or moved. Beyond `MAX_EDITS` differences the middle
 * counts as changed in full (fail closed).
 */
export function commonSubsequence(a: readonly string[], b: readonly string[]): { keptA: boolean[]; keptB: boolean[] } {
  const keptA = a.map(() => false);
  const keptB = b.map(() => false);
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    keptA[lo] = true;
    keptB[lo] = true;
    lo++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > lo && endB > lo && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    keptA[endA] = true;
    keptB[endB] = true;
  }
  const n = endA - lo;
  const m = endB - lo;
  if (n === 0 || m === 0) return { keptA, keptB };
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const get = (array: Int32Array, index: number) => array[index] ?? 0;
  /** `trace[d]`: v before round d, for k in [-d-1, d+1] (index k + d + 1). */
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && get(v, offset + k - 1) < get(v, offset + k + 1)) ? get(v, offset + k + 1) : get(v, offset + k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[lo + x] === b[lo + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return { keptA, keptB };
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const snap = trace[d] as Int32Array;
    const at = (k: number) => get(snap, k + d + 1);
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      keptA[lo + x] = true;
      keptB[lo + y] = true;
    }
    x = prevX;
    y = prevY;
  }
  return { keptA, keptB };
}

// ---------------------------------------------------------------------------------------------
// A file's text, unit by unit: its declarations, blocks and the lines outside them, in order (fixer 2a1: F1, V2A1-C4, C5)

/** One unit of a file's text. */
export interface TextUnit {
  /**
   * `decl`: a named declaration (an anonymous instance by Lean's automatic name, as the board computes it); `card`: a
   * card's block; `block`: any other telelean block; `line`: a non-blank line outside declarations and blocks (a
   * command, a comment, an `example`, a `mutual` or scope line, a declaration the scanner did not read).
   */
  kind: 'decl' | 'card' | 'block' | 'line';
  /** What the comparison matches: the name, the card id, the block's text or the line, whitespace collapsed. */
  key: string;
  name?: string;
  card?: string;
  /** `line`: the line as written, whitespace collapsed, comments included. */
  text?: string;
  /** `line`: the same with comments and strings blanked; '' for a line that holds only comments. */
  code?: string;
  /** The unit's span in its file's text (a line's from its first to its last non-blank character). */
  span: Span;
}

/** A unit that W has and B does not have at that place. */
export interface AddedTextUnit extends TextUnit {
  /** A `namespace`/`section`/`mutual` or `end` line that, with its partner, encloses only new declarations (F13). */
  enclosing?: true;
  /** (fixer 2b1b r1; additive) An enclosing line's declarations: the names of those its pair encloses, in order. */
  encloses?: string[];
  /** A comment line: the new or changed declaration it goes with, directly below it, else directly above it. */
  attachedTo?: string;
}

export interface FileTextChanges {
  path: string;
  /** B's units that W does not keep in place: removed or moved. */
  removed: TextUnit[];
  /** W's units that B does not have in place: new or moved. */
  added: AddedTextUnit[];
}

/** B against W, file by file (only the files whose text differs). */
export interface TextChanges {
  files: FileTextChanges[];
  /** Declarations of both states that moved: to another file, or out of their place in their file (V2A1-C4). */
  moved: ReadonlySet<string>;
  /** Cards of both states whose block moved. */
  movedCards: ReadonlySet<string>;
}

const OPENER = /^(?:namespace \S+|(?:noncomputable )?section(?: \S+)?|mutual)$/;
const CLOSER = /^end(?: \S+)?$/;

function unitsOf(file: ParsedFile, cards: ReadonlyMap<MarkupBlock, string>): TextUnit[] {
  const chars = file.text.split('');
  const mask = (span: Span) => {
    for (let k = span.start; k < span.end && k < chars.length; k++) if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ';
  };
  const units: TextUnit[] = [];
  for (const decl of file.decls) {
    if (decl.keyword === 'mutual' || decl.keyword === 'example') continue;
    const name = decl.fullName ?? (decl.keyword === 'instance' ? anonymousInstanceName(file, decl) : undefined);
    if (name === undefined) continue;
    mask(decl.span);
    units.push({ kind: 'decl', key: `decl\u0000${name}`, name, span: decl.span });
  }
  for (const block of file.blocks) {
    mask(block.span);
    const card = cards.get(block);
    units.push(
      card !== undefined
        ? { kind: 'card', key: `card\u0000${card}`, card, span: block.span }
        : { kind: 'block', key: `block\u0000${normalizeWhitespace(file.text.slice(block.span.start, block.span.end))}`, span: block.span },
    );
  }
  const outside = chars.join('');
  const code = blankComments(outside);
  let start = 0;
  for (let k = 0; k <= outside.length; k++) {
    if (k < outside.length && outside[k] !== '\n') continue;
    const line = outside.slice(start, k);
    const text = normalizeWhitespace(line);
    if (text !== '') {
      const first = start + (line.length - line.trimStart().length);
      units.push({ kind: 'line', key: `line\u0000${text}`, text, code: normalizeWhitespace(code.slice(start, k)), span: { start: first, end: start + line.trimEnd().length } });
    }
    start = k + 1;
  }
  return units.sort((x, y) => x.span.start - y.span.start);
}

const isComment = (unit: TextUnit | undefined) => unit?.kind === 'line' && unit.code === '';

/**
 * Every file whose text differs, as an ordered comparison of its units (§4.2, fixer 2a1): what B's text loses or moves
 * and what W adds. computeItems reports from it, and 2b2's revert and backstop read the same: an added comment goes
 * with the declaration it is `attachedTo`, and enclosing lines with the declarations they enclose (§4.11).
 * `alsoTouched` (fixer 2b1b r2, R1-1; additive): declarations an added comment may attach to although `base` has them
 * as they are (the step limits' opened content, whose comment a step may reword: §4.9's stray-command rule).
 */
export function compareTexts(base: ProjectModel, current: ProjectModel, alsoTouched?: (name: string) => boolean): TextChanges {
  const tablesB = declTables(base);
  const tablesW = declTables(current);
  const cardB = cardsOf(base);
  const cardW = cardsOf(current);
  const moved = new Set<string>();
  const movedCards = new Set<string>();
  const compared: Array<{ path: string; unitsB: TextUnit[]; unitsW: TextUnit[]; keptB: boolean[]; keptW: boolean[] }> = [];
  for (const path of [...new Set([...base.files.keys(), ...current.files.keys()])].sort()) {
    const fileB = base.files.get(path);
    const fileW = current.files.get(path);
    if (fileB !== undefined && fileW !== undefined && fileB.text === fileW.text) continue;
    const unitsB = fileB ? unitsOf(fileB, cardB) : [];
    const unitsW = fileW ? unitsOf(fileW, cardW) : [];
    const { keptA: keptB, keptB: keptW } = commonSubsequence(
      unitsB.map((u) => u.key),
      unitsW.map((u) => u.key),
    );
    unitsB.forEach((u, k) => {
      if (keptB[k] === true) return;
      if (u.name !== undefined && tablesW.byName.has(u.name)) moved.add(u.name);
      if (u.card !== undefined && current.nodes.has(u.card)) movedCards.add(u.card);
    });
    unitsW.forEach((u, k) => {
      if (keptW[k] === true) return;
      if (u.name !== undefined && tablesB.byName.has(u.name)) moved.add(u.name);
      if (u.card !== undefined && base.nodes.has(u.card)) movedCards.add(u.card);
    });
    compared.push({ path, unitsB, unitsW, keptB, keptW });
  }
  const isNew = (name: string) => !tablesB.byName.has(name) && !base.declFacts.has(name);
  const touched = (name: string) => isNew(name) || moved.has(name) || tablesB.byName.get(name)?.text !== tablesW.byName.get(name)?.text || alsoTouched?.(name) === true;
  const files = compared.map(({ path, unitsB, unitsW, keptB, keptW }): FileTextChanges => {
    const added = new Map<number, AddedTextUnit>();
    unitsW.forEach((u, k) => {
      if (keptW[k] !== true) added.set(k, { ...u });
    });
    // Enclosing lines (D2-52, F13): an added opener and its added `end`, around added units only, new declarations among them.
    const open: number[] = [];
    unitsW.forEach((u, k) => {
      if (u.kind !== 'line') return;
      if (OPENER.test(u.code ?? '')) {
        open.push(k);
        return;
      }
      if (!CLOSER.test(u.code ?? '')) return;
      const from = open.pop();
      if (from === undefined) return;
      const opener = added.get(from);
      const closer = added.get(k);
      if (opener === undefined || closer === undefined) return;
      const inner = unitsW.slice(from + 1, k);
      const onlyNew = inner.every(
        (x, j) => added.has(from + 1 + j) && (x.name === undefined || isNew(x.name)) && (x.card === undefined || !base.nodes.has(x.card)),
      );
      if (onlyNew && inner.some((x) => x.kind === 'decl')) {
        const names = inner.flatMap((x) => (x.kind === 'decl' && x.name !== undefined ? [x.name] : []));
        opener.enclosing = true;
        closer.enclosing = true;
        opener.encloses = names;
        closer.encloses = [...names];
      }
    });
    // Comments W adds go with the new or changed declaration directly below them, else directly above them (C5).
    for (const [k, u] of added) {
      if (!isComment(u)) continue;
      let j = k + 1;
      while (isComment(unitsW[j])) j++;
      const below = unitsW[j];
      if (below?.name !== undefined && touched(below.name)) {
        u.attachedTo = below.name;
        continue;
      }
      j = k - 1;
      while (j >= 0 && isComment(unitsW[j])) j--;
      const above = unitsW[j];
      if (above?.name !== undefined && touched(above.name)) u.attachedTo = above.name;
    }
    return { path, removed: unitsB.filter((_, k) => keptB[k] !== true), added: [...added.values()] };
  });
  return { files, moved, movedCards };
}

/** Each block's card id in a model (the units' keys). */
function cardsOf(model: ProjectModel): Map<MarkupBlock, string> {
  return new Map<MarkupBlock, string>([...model.nodes.values()].map((n) => [n.block, n.node.id]));
}

/**
 * (Fixer 2b2 r1, S-V2B2-S1, C-V2B2-C1, A-V2B2-ADV-2; additive, for planItemRevert.) Where B's text of B's declaration
 * `name` goes back in `current`, so that it stands in B's place again: in B's file, right after the nearest unit before
 * it that the comparison of that file (compareTexts' units and common subsequence) keeps in place (`side: 'after'`,
 * `offset` that unit's end in `current`'s text), else right before the nearest kept unit after it (`side: 'before'`,
 * `offset` its start). `text` is the declaration's text in B with B's whitespace right before and right after it: it
 * replaces the whitespace `current` has there (after `offset`, else before it), so the lines around it read as in B.
 * Undefined when `current` lacks B's file or keeps none of its units there (the caller refuses: fail closed).
 */
export function baseDeclPlace(base: ProjectModel, current: ProjectModel, name: string): { path: string; offset: number; side: 'after' | 'before'; text: string } | undefined {
  const entry = declTables(base).byName.get(name);
  if (entry === undefined) return undefined;
  const path = entry.file.path;
  const fileW = current.files.get(path);
  if (fileW === undefined) return undefined;
  const fileB = entry.file;
  const unitsB = unitsOf(fileB, cardsOf(base));
  const unitsW = unitsOf(fileW, cardsOf(current));
  const at = unitsB.findIndex((u) => u.kind === 'decl' && u.span.start === entry.decl.span.start);
  if (at < 0) return undefined;
  const { keptA, keptB } = commonSubsequence(
    unitsB.map((u) => u.key),
    unitsW.map((u) => u.key),
  );
  // The kept units of the two files pair up in order.
  const pair: number[] = unitsB.map(() => -1);
  for (let b = 0, w = 0; b < unitsB.length; b++) {
    if (keptA[b] !== true) continue;
    while (w < unitsW.length && keptB[w] !== true) w++;
    pair[b] = w++;
  }
  const decl = unitsB[at] as TextUnit;
  const lead = /\s*$/.exec(fileB.text.slice(at > 0 ? (unitsB[at - 1] as TextUnit).span.end : 0, decl.span.start))?.[0] ?? '';
  const trail = /^\s*/.exec(fileB.text.slice(decl.span.end, at + 1 < unitsB.length ? (unitsB[at + 1] as TextUnit).span.start : fileB.text.length))?.[0] ?? '';
  const text = `${lead}${fileB.text.slice(decl.span.start, decl.span.end)}${trail}`;
  for (let b = at - 1; b >= 0; b--) {
    const w = pair[b] ?? -1;
    if (w >= 0) return { path, offset: (unitsW[w] as TextUnit).span.end, side: 'after', text };
  }
  for (let b = at + 1; b < unitsB.length; b++) {
    const w = pair[b] ?? -1;
    if (w >= 0) return { path, offset: (unitsW[w] as TextUnit).span.start, side: 'before', text };
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// One state: declarations, the names only Lean reports, blocks

/** A declaration of one state, as computeItems compares it. */
interface DeclSnap {
  name: string;
  /** The source text (docstring and attributes included); absent for a name only Lean reports. */
  text?: string;
  entry?: DeclEntry;
  facts?: DeclFacts;
  /** Names only Lean reports that follow it (fields, constructors …), sorted by name. */
  children: Array<{ name: string; facts: DeclFacts }>;
}

interface Side {
  model: ProjectModel;
  tables: DeclTables;
  /** Facts-only names with no parent declaration, by name. */
  orphans: Map<string, DeclFacts>;
  /** Facts-only names by their parent's name. */
  children: Map<string, Array<{ name: string; facts: DeclFacts }>>;
  /** Declaration names bound to each card. */
  bound: Map<string, string[]>;
  vocabulary: Map<string, VocabItem>;
  /** Files that have facts (a module that did not build has none, F5). */
  factsFiles: Set<string>;
}

function sideOf(model: ProjectModel): Side {
  const tables = declTables(model);
  const claimed = new Map<string, string>();
  const byFile = new Map<string, DeclEntry[]>();
  for (const [name, entry] of tables.byName) {
    claimed.set(name, name);
    const f = factsOf(model, name, entry);
    if (f !== undefined && f.name !== name) claimed.set(f.name, name);
    const list = byFile.get(entry.file.path) ?? [];
    list.push(entry);
    byFile.set(entry.file.path, list);
  }
  const orphans = new Map<string, DeclFacts>();
  const children = new Map<string, Array<{ name: string; facts: DeclFacts }>>();
  const names = [...model.declFacts.keys()].sort();
  for (const name of names) {
    if (claimed.has(name)) continue;
    const f = model.declFacts.get(name) as DeclFacts;
    let parent: string | undefined;
    if (f.parent !== undefined && claimed.has(f.parent)) parent = claimed.get(f.parent);
    // A `.holds` is its statement's justification, a declaration of its own: never a part by place or by name (F4).
    const holds = statementOfHolds(name) !== undefined;
    if (parent === undefined && !holds) parent = (byFile.get(f.file) ?? []).find((e) => rangeContains(e.decl.range, f.selectionRange.start))?.name;
    if (parent === undefined && !holds) {
      let best: string | undefined;
      for (const candidate of tables.byName.keys()) if (name.startsWith(`${candidate}.`) && (best === undefined || candidate.length > best.length)) best = candidate;
      parent = best;
    }
    if (parent === undefined) {
      orphans.set(name, f);
      continue;
    }
    const list = children.get(parent) ?? [];
    list.push({ name, facts: f });
    children.set(parent, list);
  }
  const bound = new Map<string, string[]>();
  for (const [name, id] of model.ownerOfDecl) {
    const list = bound.get(id) ?? [];
    list.push(name);
    bound.set(id, list);
  }
  return {
    model,
    tables,
    orphans,
    children,
    bound,
    vocabulary: new Map(model.vocabulary.map((item) => [item.name, item])),
    factsFiles: new Set([...model.declFacts.values()].map((f) => f.file)),
  };
}

function snapOf(side: Side, name: string): DeclSnap | undefined {
  const entry = side.tables.byName.get(name);
  if (entry !== undefined) {
    const facts = factsOf(side.model, name, entry);
    return { name, text: entry.text, entry, ...(facts ? { facts } : {}), children: side.children.get(name) ?? [] };
  }
  const orphan = side.orphans.get(name);
  if (orphan !== undefined) return { name, facts: orphan, children: [] };
  return undefined;
}

/** The state has the name: a declaration in its text, or a name in its facts (F4). */
const present = (side: Side, name: string) => side.tables.byName.has(name) || side.model.declFacts.has(name);

/** Facts agree where both states have them (D2-41's fields: kind, type, value, valueConsts, typeConsts). */
function factsAgree(a: DeclFacts | undefined, b: DeclFacts | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  const both = <T>(x: T | undefined, y: T | undefined, eq: (x: T, y: T) => boolean) => x === undefined || y === undefined || eq(x, y);
  const same = (x: string, y: string) => x === y;
  const sameNorm = (x: string, y: string) => normalizeWhitespace(x) === normalizeWhitespace(y);
  const sameSet = (x: readonly string[], y: readonly string[]) => (sortedSet(x) ?? []).join('\u0000') === (sortedSet(y) ?? []).join('\u0000');
  return (
    both(a.kind, b.kind, same) &&
    both(a.type, b.type, sameNorm) &&
    both(a.value, b.value, sameNorm) &&
    both(a.valueConsts, b.valueConsts, sameSet) &&
    both(a.typeConsts, b.typeConsts, sameSet)
  );
}

function sameDecl(a: DeclSnap | undefined, b: DeclSnap | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.text !== b.text || !factsAgree(a.facts, b.facts)) return false;
  // The children come from the facts: compared only where both states have the parent's facts (F5).
  if (a.facts === undefined || b.facts === undefined) return true;
  if (a.children.length !== b.children.length) return false;
  return a.children.every((c, i) => {
    const d = b.children[i];
    return d !== undefined && d.name === c.name && factsAgree(c.facts, d.facts);
  });
}

function kindOfSnap(snap: DeclSnap): string | undefined {
  if (snap.facts?.kind !== undefined) return snap.facts.kind;
  const keyword = snap.entry?.decl.keyword;
  return keyword === undefined ? undefined : keyword === 'instance' ? 'instance' : keywordKind(keyword);
}

/** §4.3's material of one owned name in a state, with the comment lines W adds that go with it. */
function declMaterial(name: string, snap: DeclSnap | undefined, comments: readonly TextUnit[]) {
  if (snap === undefined) return { name, absent: true };
  return {
    name,
    text: norm(snap.text),
    ...factsMaterial(snap.facts),
    kind: kindOfSnap(snap),
    children: snap.children.length === 0 ? undefined : snap.children.map((c) => ({ name: c.name, ...factsMaterial(c.facts) })),
    comments: comments.length === 0 ? undefined : comments.map((c) => c.text),
  };
}

/** A block's fields as entries per key: list fields split into their items, others whitespace-collapsed; the body as `---`. */
function fieldEntries(block: MarkupBlock): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of block.lines) {
    const list = out.get(line.key) ?? [];
    if (line.key === 'premises' || line.key === 'lean' || line.key === 'tags') list.push(...splitList(line.raw).items);
    else list.push(normalizeWhitespace(line.raw));
    out.set(line.key, list);
  }
  if (block.body !== undefined) out.set('---', [normalizeWhitespace(block.body)]);
  return out;
}

/** The fields telelean writes into existing blocks in a session (normalisation, arrows, premises, write-backs). */
const TELELEAN_FIELDS: ReadonlySet<string> = new Set(['premises', 'lean', 'id', 'follows_from']);

/**
 * A block's other lines (F1): every non-blank line of its comment except the lines of `TELELEAN_FIELDS`, as written
 * (whitespace collapsed, written keys included), in order, each with the field it belongs to (`notes` from `---` on).
 * Exported for the session's G5 (fixer 2b1b r1, A-ADV-3), which compares them as computeItems does.
 */
export function otherBlockLines(text: string, block: MarkupBlock): Array<{ text: string; field: string }> {
  const at = (offset: number) => offset - block.span.start;
  const chars = text.slice(block.span.start, block.span.end).split('');
  const fieldAt = new Map<number, string>();
  for (const line of block.lines) {
    if (!TELELEAN_FIELDS.has(line.key)) {
      fieldAt.set(at(line.span.start), line.key);
      continue;
    }
    for (let k = at(line.span.start); k < at(line.span.end) && k < chars.length; k++) if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ';
  }
  const notes = block.bodySpan !== undefined ? at(block.bodySpan.start) : Number.POSITIVE_INFINITY;
  const masked = chars.join('');
  const out: Array<{ text: string; field: string }> = [];
  let start = 0;
  for (let k = 0; k <= masked.length; k++) {
    if (k < masked.length && masked[k] !== '\n') continue;
    const line = normalizeWhitespace(masked.slice(start, k));
    if (line !== '') out.push({ text: line, field: fieldAt.get(start) ?? (start >= notes ? 'notes' : '') });
    start = k + 1;
  }
  return out;
}

/** A block's fields as written (the display content of a new block), repeated keys joined by line breaks. */
function rawFields(block: MarkupBlock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.lines) out[line.key] = Object.hasOwn(out, line.key) ? `${out[line.key]}\n${line.raw}` : line.raw;
  if (block.body !== undefined) out['---'] = block.body;
  return out;
}

/** The multiset difference `a - b`. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

/** The order of drafts that `reachingDraft` and computeItems try: by item key. */
const byDraftKey = (premises: readonly PremiseDraft[]) =>
  [...premises].sort((x, y) => {
    const kx = premiseKey(x.target, x.leanName);
    const ky = premiseKey(y.target, y.leanName);
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  });

/**
 * D2-42 (fixer 2a1, V2A1-C3): the key of the first premise draft of `step` (by key) whose statement reaches `name`
 * (`draftReach`), on `model`. When a step ends, 2d records it as the `created` entry's `draft` of each definition the
 * step created in its proof phase, so the definition stays its own `decl:` item, part of the target's Result, whatever
 * later happens to the draft. computeItems asks it only for the running step, which has no `created` entries yet.
 */
export function reachingDraft(model: ProjectModel, premises: readonly PremiseDraft[], step: string, name: string): string | undefined {
  for (const draft of byDraftKey(premises)) {
    if (draft.step === step && draftReach(model, draft).names.has(name)) return premiseKey(draft.target, draft.leanName);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// computeItems

interface Acc {
  key: string;
  kind: ItemKind;
  declKind?: DeclKind;
  origin?: Origin;
  partOfResult?: string;
  /** Owned declaration names (both states). */
  names: Set<string>;
  fields: Array<{ card: string; key: string; added: string[]; removed: string[] }>;
  /** New blocks it writes (card ids). */
  blocks: Set<string>;
  arrows: ArrowEnds[];
  /** The comment lines W adds that go with its declarations, by declaration (C5). */
  comments: Map<string, TextUnit[]>;
  /** The card whose fields it shows (`content.fields`). */
  card?: string;
  premise?: PremiseDraft;
}

const COERCION_CLASS = /^(?:[A-Za-z_][\w.]*\.)?Coe[A-Za-z]*$/;
/** Vocabulary kinds of a shape-passing term (with no `shape-violation` flag). */
const TERM_KINDS: ReadonlySet<string> = new Set(['sort', 'predicate', 'constant', 'function']);

/**
 * §4.2 (2a1). `ended`: the inferences whose step ended; each gets its Result draft, with or without a difference (F9),
 * marked `asInBase` when it is B's version (AF1), and premise items come only for these (AF10).
 * `active` (step purposes): the running step, whose declarations new since S₀ have no `created` entry yet; they are
 * its own, `statements` when its freeze holds them and `proof` otherwise, as its end will record (§3.4).
 */
export function computeItems(i: ComputeItemsInput): { drafts: ItemDraft[]; problems: StateJudgement['problems'] } {
  const B = sideOf(i.base);
  const W = sideOf(i.current);
  const texts = compareTexts(i.base, i.current);
  /** 2b2 (§2.1, D2-75): the judged state's probe failed; B's facts never decide this (a failed probe on B refuses nothing). */
  const probeFailed = probeFailure(i.current.facts) !== undefined;
  const problems: Problem[] = [];
  const accs = new Map<string, Acc>();
  /** The item that owns each declaration name (the first to claim it). */
  const ownerKey = new Map<string, string>();
  /** Result keys whose draft is B's version (AF1), and premise keys made from their unwritten draft. */
  const asInBase = new Set<string>();
  const unwrittenDrafts = new Set<string>();
  const acc = (key: string, kind: ItemKind, extra: Partial<Pick<Acc, 'declKind' | 'partOfResult' | 'card'>> = {}): Acc => {
    let found = accs.get(key);
    if (!found) {
      found = { key, kind, names: new Set(), fields: [], blocks: new Set(), arrows: [], comments: new Map() };
      accs.set(key, found);
    }
    if (found.declKind === undefined && extra.declKind !== undefined) found.declKind = extra.declKind;
    if (found.partOfResult === undefined && extra.partOfResult !== undefined) found.partOfResult = extra.partOfResult;
    if (found.card === undefined && extra.card !== undefined) found.card = extra.card;
    return found;
  };
  const own = (a: Acc, name: string) => {
    a.names.add(name);
    if (!ownerKey.has(name)) ownerKey.set(name, a.key);
  };
  /** The declaration is as in B: the same text and facts, in the same place (`compareTexts`). */
  const unchanged = (name: string) => !texts.moved.has(name) && sameDecl(snapOf(B, name), snapOf(W, name));
  const sentence = (id: string) => cutText(i.current.nodes.get(id)?.node.naturalName ?? i.base.nodes.get(id)?.node.naturalName ?? id, 60);
  const unowned = (what: string, declaration?: string) =>
    problems.push({ code: 'unowned', text: REVIEW_TEXTS.unowned(what), ...(declaration !== undefined ? { declaration } : {}) });

  // ---- the ledger and the inferences
  const stepTarget = new Map<string, string>();
  for (const inference of i.inferences) for (const step of inference.steps) stepTarget.set(step, inference.target);
  if (i.active) stepTarget.set(i.active.step, i.active.target);
  const targets = new Set<string>([...i.inferences.map((inf) => inf.target), ...(i.active ? [i.active.target] : [])]);
  const created = new Map<string, Extract<LedgerEntry, { kind: 'created' }>>();
  const premiseByCard = new Map<string, Extract<LedgerEntry, { kind: 'premise' }>>();
  const premiseByItem = new Map<string, Extract<LedgerEntry, { kind: 'premise' }>>();
  const markRemoved = new Map<string, Extract<LedgerEntry, { kind: 'mark-removed' }>>();
  const arrowEntries = new Map<string, Extract<LedgerEntry, { kind: 'arrow' }>>();
  for (const entry of i.ledger) {
    if (entry.kind === 'created' && !created.has(entry.name)) created.set(entry.name, entry);
    else if (entry.kind === 'premise') {
      premiseByCard.set(entry.card, entry);
      premiseByItem.set(entry.item, entry);
    } else if (entry.kind === 'mark-removed') markRemoved.set(entry.card, entry);
    else if (entry.kind === 'arrow') arrowEntries.set(`${entry.source}>${entry.target}`, entry);
  }
  /** The premise drafts by key, the newest of each key (§3.5: a key's later draft is its newer proposal). */
  const draftByKey = new Map<string, PremiseDraft>();
  for (const draft of i.premises) draftByKey.set(premiseKey(draft.target, draft.leanName), draft);

  const stepStart = i.active ? declTables(i.active.stepStart) : undefined;
  /**
   * The owner fixed when a declaration was created (D2-43), or the active step's own new declaration; `draft`: the
   * premise draft of that step that reached it (the ledger's, never later reach, V2A1-C3); `active`: the running step's.
   */
  const ownerOf = (name: string): { origin: Origin; draft?: string; active: boolean } | undefined => {
    const entry = created.get(name);
    if (entry !== undefined) {
      const target = stepTarget.get(entry.step);
      if (target === undefined) return undefined;
      return { origin: { step: entry.step, target, phase: entry.phase }, ...(entry.draft !== undefined ? { draft: entry.draft } : {}), active: false };
    }
    const active = i.active;
    if (active === undefined || stepStart === undefined) return undefined;
    if (stepStart.byName.has(name) || active.stepStart.declFacts.has(name)) return undefined;
    return { origin: { step: active.step, target: active.target, phase: active.freeze?.declarations[name] !== undefined ? 'statements' : 'proof' }, active: true };
  };
  const setOrigin = (a: Acc, origin: Origin | undefined) => {
    if (a.origin === undefined && origin !== undefined) a.origin = origin;
  };

  const handled = new Set<string>();

  // ---- cards: their statements, their `.holds`, their blocks
  const cardIds = [...new Set([...i.base.nodes.keys(), ...i.current.nodes.keys()])].sort();
  for (const id of cardIds) {
    const inB = i.base.nodes.get(id);
    const inW = i.current.nodes.get(id);
    const names = [...new Set([...(B.bound.get(id) ?? []), ...(W.bound.get(id) ?? [])])].sort();
    for (const name of names) handled.add(name);
    if (inW !== undefined && inB === undefined) {
      const entry = premiseByCard.get(id);
      if (entry === undefined) {
        unowned(REVIEW_TEXTS.unownedCard(sentence(id)));
        for (const name of names) if (!unchanged(name)) unowned(name, name);
        continue;
      }
      const a = acc(entry.item, 'add-premise', { partOfResult: entry.target, card: id });
      a.blocks.add(id);
      for (const name of names) own(a, name);
      continue;
    }
    if (inW === undefined && inB !== undefined) {
      unowned(REVIEW_TEXTS.unownedCard(sentence(id)));
      for (const name of names) if (!unchanged(name)) unowned(name, name);
      continue;
    }
    if (inW === undefined || inB === undefined) continue;
    if (texts.movedCards.has(id)) unowned(REVIEW_TEXTS.unownedCard(sentence(id)));
    const axiom = inW.node.type === 'AXIOM';
    const statements = [inB.node.lean.statement, inW.node.lean.statement].filter((s): s is string => s !== undefined);
    const holds = new Set(statements.map(holdsName));
    const statementish = names.filter((name) => axiom || !holds.has(name));
    // A statement bound or unbound (a blank line added or removed below the block, F3) changes the card's statement.
    let changed =
      inB.node.lean.statement !== inW.node.lean.statement ||
      inB.node.lean.binding !== inW.node.lean.binding ||
      statementish.some((name) => !unchanged(name));
    // A PROPOSITION's `.holds`.
    for (const name of names) {
      if (axiom || !holds.has(name) || unchanged(name)) continue;
      const after = snapOf(W, name);
      if (after !== undefined && kindOfSnap(after) === 'theorem' && targets.has(id)) own(acc(proofKey(id), 'result'), name);
      else unowned(name, name);
    }
    // The fields telelean writes, as entries.
    const fieldsB = fieldEntries(inB.block);
    const fieldsW = fieldEntries(inW.block);
    const cardFields: Acc['fields'] = [];
    let writeBack: Acc['fields'][number] | undefined;
    for (const key of [...new Set([...fieldsB.keys(), ...fieldsW.keys()])].sort()) {
      if (!TELELEAN_FIELDS.has(key)) continue;
      const was = fieldsB.get(key) ?? [];
      const now = fieldsW.get(key) ?? [];
      const added = minus(now, was);
      const removed = minus(was, now);
      const reordered = added.length === 0 && removed.length === 0 && was.join('\u0000') !== now.join('\u0000');
      if (added.length === 0 && removed.length === 0 && !(reordered && key === 'lean')) continue;
      if (key === 'lean') {
        cardFields.push({ card: id, key, added, removed });
        continue;
      }
      if (key === 'id') {
        // The write-back of a derived id (TL112): telelean writes it with any field of such a block (V2A1-C1).
        const derived = !inB.block.idWritten && removed.length === 0 && added.length === 1 && (added[0] === id || added[0] === inB.block.id);
        if (derived) writeBack = { card: id, key, added, removed };
        else unowned(REVIEW_TEXTS.unownedField(key, sentence(id)));
        continue;
      }
      if (key === 'premises') {
        for (const source of added) {
          const premise = premiseByCard.get(source);
          if (premise !== undefined && premise.target === id) {
            const a = acc(premise.item, 'add-premise', { partOfResult: premise.target, card: source });
            a.arrows.push({ source, target: id });
            a.fields.push({ card: id, key, added: [source], removed: [] });
            continue;
          }
          const entry = arrowEntries.get(`${source}>${id}`);
          if (entry === undefined) {
            unowned(REVIEW_TEXTS.unownedArrow(sentence(source), sentence(id)));
            continue;
          }
          const a = acc(arrowKey(source, id), 'add-arrow', { partOfResult: id });
          a.arrows.push({ source, target: id });
          a.fields.push({ card: id, key, added: [source], removed: [] });
          setOrigin(a, { step: entry.step, target: entry.target, phase: 'proof' });
        }
        for (const source of removed) unowned(REVIEW_TEXTS.unownedArrow(sentence(source), sentence(id)));
        continue;
      }
      if (key === 'follows_from' && added.length === 0 && removed.length === 1 && removed[0] === 'nothing' && !fieldsW.has(key)) {
        const entry = markRemoved.get(id);
        if (entry !== undefined) {
          acc(entry.item, 'add-premise').fields.push({ card: id, key, added: [], removed });
          continue;
        }
      }
      unowned(REVIEW_TEXTS.unownedField(key, sentence(id)));
    }
    // Every other line of the block, as written and in order (F1): no item changes them.
    const textB = i.base.files.get(inB.file)?.text ?? '';
    const textW = i.current.files.get(inW.file)?.text ?? '';
    if (textB.slice(inB.block.span.start, inB.block.span.end) !== textW.slice(inW.block.span.start, inW.block.span.end)) {
      const linesB = otherBlockLines(textB, inB.block);
      const linesW = otherBlockLines(textW, inW.block);
      const { keptA, keptB } = commonSubsequence(
        linesB.map((l) => l.text),
        linesW.map((l) => l.text),
      );
      const differ = new Set<string>([...linesB.filter((_, k) => keptA[k] !== true), ...linesW.filter((_, k) => keptB[k] !== true)].map((l) => l.field));
      for (const field of [...differ].sort()) unowned(field === '' ? REVIEW_TEXTS.unownedCard(sentence(id)) : REVIEW_TEXTS.unownedField(field, sentence(id)));
    }
    if (cardFields.length > 0) changed = true;
    if (changed) {
      const hadStatement = inB.node.lean.statement !== undefined && snapOf(B, inB.node.lean.statement) !== undefined;
      const a = acc(cardKey(id), hadStatement ? 'change' : 'formalize', { card: id });
      for (const name of statementish) own(a, name);
      a.fields.push(...cardFields, ...(writeBack !== undefined ? [writeBack] : []));
      for (const name of statementish) if (!snapOf(B, name)) setOrigin(a, ownerOf(name)?.origin);
    }
  }

  // ---- declarations no card owns
  /** What each premise draft's own statement reaches (D2-42), by draft; card statements never count here (F7). */
  const reachOfDraft = new Map<PremiseDraft, ReadonlySet<string>>();
  const drafts = byDraftKey(i.premises);
  const reachedNow = (name: string, step: string): string | undefined => {
    for (const draft of drafts) {
      if (draft.step !== step) continue;
      let names = reachOfDraft.get(draft);
      if (!names) reachOfDraft.set(draft, (names = draftReach(i.current, draft).names));
      if (names.has(name)) return premiseKey(draft.target, draft.leanName);
    }
    return undefined;
  };
  const proofMaterial = new Map<string, Set<string>>();
  const presuppositionOf = (snap: DeclSnap): string | undefined => {
    if (kindOfSnap(snap) !== 'instance') return undefined;
    const type = snap.facts?.type ?? (snap.entry ? signatureText(snap.entry.file, snap.entry.decl)?.type : undefined);
    const sort = type === undefined ? undefined : /^Nonempty\s+(\S+)$/.exec(normalizeWhitespace(type))?.[1];
    if (sort === undefined) return undefined;
    const mentions = new Set([...(snap.facts?.valueConsts ?? []), ...(snap.facts?.refs.map((r) => r.name) ?? [])]);
    for (const item of W.vocabulary.values()) {
      if (item.kind !== 'presupposition' || !mentions.has(item.name)) continue;
      if (item.presupposes === sort || item.presupposes?.endsWith(`.${sort}`) === true) return item.name;
    }
    return undefined;
  };
  const declKindOf = (snap: DeclSnap): DeclKind => {
    if (kindOfSnap(snap) === 'instance') {
      const type = normalizeWhitespace(snap.facts?.type ?? (snap.entry ? (signatureText(snap.entry.file, snap.entry.decl)?.type ?? '') : ''));
      const head = /^(?:∀[^,]*,\s*)*([^\s()]+)/.exec(type)?.[1];
      return head !== undefined && COERCION_CLASS.test(head) ? 'coercion' : 'instance';
    }
    const attributes = [...(snap.entry?.decl.attributes ?? []), ...(snap.facts?.attributes ?? [])];
    return attributes.some((a) => /(^|[\s[,])coe([\s\],]|$)/.test(a)) ? 'coercion' : 'definition';
  };
  const all = [...new Set([...B.tables.byName.keys(), ...W.tables.byName.keys(), ...B.orphans.keys(), ...W.orphans.keys()])].sort();
  for (const name of all) {
    if (handled.has(name)) continue;
    // A name only Lean reports, with no parent, is compared only where both states have facts for its file (F5).
    const orphanFile = B.orphans.get(name)?.file ?? W.orphans.get(name)?.file;
    if (orphanFile !== undefined && (!B.factsFiles.has(orphanFile) || !W.factsFiles.has(orphanFile))) continue;
    if (unchanged(name)) continue;
    const before = snapOf(B, name);
    const after = snapOf(W, name);
    if (after === undefined) {
      unowned(name, name);
      continue;
    }
    if (before !== undefined) {
      own(acc(declKey(name), 'declaration', { declKind: 'vocabulary-change' }), name);
      continue;
    }
    const owner = ownerOf(name);
    if (owner === undefined) {
      unowned(name, name);
      continue;
    }
    const kind = kindOfSnap(after);
    const vocab = W.vocabulary.get(name);
    const term = vocab !== undefined && TERM_KINDS.has(vocab.kind) && !vocab.flags.includes('shape-violation');
    if (kind === 'axiom' && !term && vocab?.kind !== 'presupposition') {
      // A Prop axiom bound to no card (D2-40), or an axiom that fails the vocabulary shape rule: in either phase (F2).
      unowned(name, name);
      continue;
    }
    if (kind === 'theorem' || owner.origin.phase === 'proof') {
      const draft = kind === 'theorem' || kind === 'axiom' ? undefined : owner.active ? reachedNow(name, owner.origin.step) : owner.draft;
      if (draft !== undefined) {
        const a = acc(declKey(name), 'declaration', { declKind: declKindOf(after), partOfResult: owner.origin.target });
        own(a, name);
        setOrigin(a, owner.origin);
        continue;
      }
      own(acc(proofKey(owner.origin.target), 'result'), name);
      let set = proofMaterial.get(owner.origin.target);
      if (!set) proofMaterial.set(owner.origin.target, (set = new Set()));
      set.add(name);
      continue;
    }
    const presupposition = presuppositionOf(after);
    if (presupposition !== undefined) {
      const a = acc(declKey(presupposition), 'declaration', { declKind: 'presupposition' });
      own(a, name);
      setOrigin(a, owner.origin);
      continue;
    }
    let a: Acc;
    if (term) a = acc(vocabKey(name), 'vocabulary-term');
    else if (vocab?.kind === 'presupposition') a = acc(declKey(name), 'declaration', { declKind: 'presupposition' });
    else a = acc(declKey(name), 'declaration', { declKind: declKindOf(after) });
    own(a, name);
    setOrigin(a, owner.origin);
  }

  // ---- Results: one per inference whose step ended (F9), and one for any target that owns content (an active step)
  const resultTargets = [...new Set([...i.ended, ...[...accs.values()].filter((a) => a.kind === 'result').map((a) => a.key.slice('proof:'.length))])].sort();
  for (const target of resultTargets) {
    const a = acc(proofKey(target), 'result');
    const statements = [i.base.nodes.get(target)?.node.lean.statement, i.current.nodes.get(target)?.node.lean.statement].filter(
      (s): s is string => s !== undefined,
    );
    const holds = [...new Set(statements.map(holdsName))];
    for (const name of holds) own(a, name);
    const material = proofMaterial.get(target);
    // T.holds as in B: absent from both states, or in both and unchanged. Facts alone count as present (F4).
    const sameHolds = holds.every((name) => (present(B, name) || present(W, name) ? present(B, name) && present(W, name) && unchanged(name) : true));
    if (sameHolds && (material === undefined || material.size === 0)) asInBase.add(a.key);
    const steps = i.inferences.find((inf) => inf.target === target)?.steps ?? [];
    const step = steps[steps.length - 1] ?? (i.active?.target === target ? i.active.step : '');
    setOrigin(a, { step, target, phase: 'proof' });
  }

  // ---- premise items: from the draft while unwritten (inferences whose step ended only, AF10), else from ws/
  for (const [key, draft] of draftByKey) {
    const written = premiseByItem.get(key);
    const a = accs.get(key);
    if (written !== undefined) {
      if (a === undefined) continue;
      a.premise = draft;
      a.origin = { step: draft.step, target: draft.target, phase: 'proof' };
      continue;
    }
    if (!i.ended.includes(draft.target)) continue;
    const item = acc(key, 'add-premise', { partOfResult: draft.target });
    item.premise = draft;
    item.origin = { step: draft.step, target: draft.target, phase: 'proof' };
    unwrittenDrafts.add(key);
  }

  // ---- text outside declarations, and blocks that are no card (§4.2, F1): what W lacks or adds, in order
  for (const file of texts.files) {
    for (const unit of file.removed) {
      if (unit.kind === 'line') unowned(REVIEW_TEXTS.unownedText(unit.text ?? '', file.path));
      else if (unit.kind === 'block') unowned(REVIEW_TEXTS.unownedBlock(file.path));
    }
    for (const unit of file.added) {
      if (unit.kind === 'block') unowned(REVIEW_TEXTS.unownedBlock(file.path));
      if (unit.kind !== 'line' || unit.enclosing === true) continue;
      const key = unit.attachedTo !== undefined ? ownerKey.get(unit.attachedTo) : undefined;
      const owner = key !== undefined ? accs.get(key) : undefined;
      if (owner !== undefined && unit.attachedTo !== undefined) {
        const list = owner.comments.get(unit.attachedTo) ?? [];
        list.push(unit);
        owner.comments.set(unit.attachedTo, list);
        continue;
      }
      unowned(REVIEW_TEXTS.unownedText(unit.text ?? '', file.path));
    }
  }

  const out: ItemDraft[] = [];
  for (const key of [...accs.keys()].sort()) {
    const a = accs.get(key) as Acc;
    out.push(unwrittenDrafts.has(key) ? draftOfPremise(a) : draftOf(a));
  }
  return { drafts: out, problems };

  // ---- drafts

  function draftOf(a: Acc): ItemDraft {
    const names = [...a.names].sort();
    const inW = names.filter((n) => snapOf(W, n) !== undefined);
    const provided = new Set<string>();
    for (const n of inW) {
      provided.add(n);
      for (const c of snapOf(W, n)?.children ?? []) provided.add(c.name);
    }
    const mentions = new Set<string>();
    for (const n of provided) {
      const f = W.model.declFacts.get(n) ?? snapOf(W, n)?.facts;
      if (f) for (const c of usesOrRefs(f).names) mentions.add(c);
    }
    for (const n of provided) mentions.delete(n);
    const arrows = [...new Map(a.arrows.map((x) => [`${x.source}>${x.target}`, x])).values()].sort((x, y) =>
      `${x.source}>${x.target}` < `${y.source}>${y.target}` ? -1 : 1,
    );
    const fields = [...a.fields].sort((x, y) => (`${x.card}\u0000${x.key}` < `${y.card}\u0000${y.key}` ? -1 : 1));
    const blocks = [...a.blocks].sort().map((card) => {
      const block = i.current.nodes.get(card)?.block;
      return { card, fields: block ? [...fieldEntries(block)].sort(([x], [y]) => (x < y ? -1 : 1)) : [] };
    });
    const commentsOf = (n: string) => [...(a.comments.get(n) ?? [])].sort((x, y) => x.span.start - y.span.start);
    const contentKey = hashOf({
      decls: names.map((n) => declMaterial(n, snapOf(W, n), commentsOf(n))),
      fields: fields.map((f) => ({ card: f.card, key: f.key, added: [...f.added].sort(), removed: [...f.removed].sort() })),
      blocks,
      arrows,
    });
    const decls: ItemContent['decls'] = [];
    for (const n of inW) {
      const snap = snapOf(W, n) as DeclSnap;
      if (snap.text === undefined) continue;
      const kind = kindOfSnap(snap);
      // The text from its first attached comment to its last line, or to its last attached comment (C5).
      const comments = commentsOf(n);
      let text = snap.text;
      if (comments.length > 0 && snap.entry !== undefined) {
        const start = Math.min(snap.entry.decl.span.start, ...comments.map((c) => c.span.start));
        const end = Math.max(snap.entry.decl.span.end, ...comments.map((c) => c.span.end));
        text = snap.entry.file.text.slice(start, end);
      }
      decls.push({ name: n, text, ...(kind !== undefined ? { kind } : {}) });
    }
    const content: ItemContent = { decls };
    const cardBlock = a.card !== undefined ? i.current.nodes.get(a.card)?.block : undefined;
    if (cardBlock !== undefined) {
      if (a.blocks.has(a.card as string)) content.fields = rawFields(cardBlock);
      else {
        const ownFields = fields.filter((f) => f.card === a.card);
        if (ownFields.length > 0) {
          const raw = rawFields(cardBlock);
          content.fields = Object.fromEntries(ownFields.map((f) => [f.key, raw[f.key] ?? '']));
        }
      }
    }
    const arrow = arrows[0];
    if (arrow !== undefined) content.arrow = arrow;
    if (a.premise !== undefined) content.premise = a.premise;
    // ADV-3: a declaration whose module did not build has no facts (F5), so the key and `mentions` lack what they give.
    // 2b2 (§2.1, D2-75): so does every declaration of a state whose probe failed (no declaration of it has constants).
    const factsMissing =
      (probeFailed && inW.length > 0) ||
      inW.some((n) => {
        const snap = snapOf(W, n);
        return snap?.entry !== undefined && snap.facts === undefined && !W.factsFiles.has(snap.entry.file.path);
      });
    return {
      key: a.key,
      kind: a.kind,
      ...(a.declKind !== undefined ? { declKind: a.declKind } : {}),
      origin: a.origin ?? { step: '', target: '', phase: 'statements' },
      provides: { decls: [...provided].sort(), arrows, cards: [...(a.card !== undefined ? [a.card] : []), ...a.blocks].filter((x, k, l) => l.indexOf(x) === k).sort() },
      mentions: [...mentions].sort(),
      ...(a.partOfResult !== undefined ? { partOfResult: a.partOfResult } : {}),
      contentKey,
      content,
      ...(asInBase.has(a.key) ? { asInBase: true as const } : {}),
      ...(factsMissing ? { factsMissing: true as const } : {}),
    };
  }

  function draftOfPremise(a: Acc): ItemDraft {
    const draft = a.premise as PremiseDraft;
    const local = new Set(Object.keys(draft.facts));
    const mentions = new Set<string>();
    for (const name of [...local].sort()) for (const c of usesOrRefs(draft.facts[name] as DeclFacts).names) if (!local.has(c)) mentions.add(c);
    return {
      key: a.key,
      kind: 'add-premise',
      origin: a.origin ?? { step: draft.step, target: draft.target, phase: 'proof' },
      provides: { decls: [], arrows: [], cards: [] },
      mentions: [...mentions].sort(),
      partOfResult: draft.target,
      contentKey: premiseDraftKey(draft),
      content: { decls: [{ name: draft.leanName, text: draft.leanStatement }], premise: draft },
    };
  }
}
