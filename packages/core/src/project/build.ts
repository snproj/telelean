/**
 * `buildProjectModel` (docs/m1-plan.md sections 6.1, 6.3-6.5): bind every block to its declarations, merge the usable
 * Lean facts, classify the vocabulary, compute each node's card data and status, the edges and the diagnostics.
 * Pure: no I/O, deterministic for a given input.
 */
import type { DeclFacts } from '../facts.js';
import { holdsName, SORRY_AXIOM, STANDARD_AXIOM_NAMES } from '../facts.js';
import { PRESUPPOSITION_PREFIX } from '../graph.js';
import type {
  BoardDiagnostic,
  DerivedStatus,
  FileRange,
  LeanBinding,
  LeanRef,
  NodeType,
  Position,
  ProofStatus,
  Range,
  Severity,
  StatusFlag,
  SubjectInfo,
  TlNode,
} from '../model.js';
import { deletionEdit } from '../markup/edits.js';
import { parseLeanFile } from '../markup/parser.js';
import { Lines } from '../markup/text.js';
import type { BlockBinding, DeclInfo, MarkupBlock, MarkupDiagnostic, ParsedFile, Span } from '../markup/types.js';
import { endorsementHash, isSubjectName, libraryRootFile, moduleOfPath, pathOfModule, subjectOfPath } from '../paths.js';
import { computeEdges, type EdgeResult } from './edges.js';
import { FactsIndex } from './factsIndex.js';
import type { ModelNode, ProjectInput, ProjectMask, ProjectModel } from './types.js';
import { blankComments, cutText, LineMap, normalizeWhitespace, namespaceTable, rangeContains, splitTopLevelArrows } from './text.js';
import { anonymousInstanceName, buildVocabulary, resolveName, shapeOf, signatureText, type VocabCandidate, type VocabularyResult } from './vocabulary.js';
import { autoImplicitDiagnostic } from './lakefile.js';
import { noRationaleMessage } from '../markup/values.js';

/** Canonical order of status flags (deterministic output). */
const FLAG_ORDER: readonly StatusFlag[] = [
  'no-rationale',
  'missing-holds',
  'provable-assumption',
  'uses-sorry',
  'holds-mismatch',
  'rests-on-pending',
  'uses-unseen',
  'established',
  'self-evident',
  'existence-commitment',
  'definitional-choice',
  'unselected-used',
  'broken',
  'depends-on-removed',
  'signoff-stale',
  'stale',
  'not-checked',
];

const SEVERITY_OF_LEAN: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', information: 'info' };

/** TL122 (spec v4 A19, slice 1b): an axiom block with a `premises:` list, written before v4. */
export const AXIOM_PREMISES_MESSAGE =
  'This axiom declares premises (`premises:`), written before v4, when axioms could have arrows: the board does not draw them. Make it a proposition (pending), or drop these arrows.';

interface Located {
  file: ParsedFile;
  decl: DeclInfo;
}

/** A piece of a card's code: a contiguous stretch of one file. */
interface CodePiece {
  file: ParsedFile;
  start: number;
  end: number;
  /** Which declarations' refs belong to it. */
  decls: string[];
}

interface Draft {
  id: string;
  file: ParsedFile;
  block: MarkupBlock;
  /** The block's `premises:` (slice 2, 2c1: without the arrows the base mask leaves out). */
  premises: string[];
  /** The block's "follows from nothing" mark (slice 2, 2c1: a mark the base mask restores included). */
  followsFrom: boolean;
  subject: string;
  type: NodeType;
  statement?: string;
  statementFound: boolean;
  /** TL113: bound to something that is not a Prop abbrev/def. */
  notProp: boolean;
  statementDecl?: Located;
  holds?: string;
  holdsDecl?: Located;
  holdsExists: boolean;
  statementFacts?: DeclFacts;
  holdsFacts?: DeclFacts;
  extraPinned: string[];
  leanError: boolean;
  diagnostics: BoardDiagnostic[];
  flags: Set<StatusFlag>;
  proof: ProofStatus;
  formal: DerivedStatus['formal'];
  lean: LeanBinding;
}

/** Internal results kept per model, so `subjectGraph` and `toGraphJson` need not recompute them. */
interface ModelInternals {
  edges: EdgeResult;
}

const internals = new WeakMap<ProjectModel, ModelInternals>();

/** The project's edges (computed once per model; recomputed from the model's public data for copies). */
export function edgesOf(model: ProjectModel): EdgeResult {
  const cached = internals.get(model);
  if (cached) return cached.edges;
  const edges = computeEdges({ nodes: [...model.nodes.values()].map((n) => n.node), ownerOfDecl: model.ownerOfDecl, declFacts: model.declFacts, freshFiles: model.freshFiles });
  internals.set(model, { edges });
  return edges;
}

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function sortFlags(flags: Iterable<StatusFlag>): StatusFlag[] {
  return [...new Set(flags)].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b));
}

function compareDiagnostics(a: BoardDiagnostic, b: BoardDiagnostic): number {
  const fa = a.file ?? '￿';
  const fb = b.file ?? '￿';
  if (fa !== fb) return fa < fb ? -1 : 1;
  const la = a.range?.start.line ?? -1;
  const lb = b.range?.start.line ?? -1;
  if (la !== lb) return la - lb;
  const ca = a.range?.start.character ?? -1;
  const cb = b.range?.start.character ?? -1;
  if (ca !== cb) return ca - cb;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

function dedupeDiagnostics(list: BoardDiagnostic[]): BoardDiagnostic[] {
  const seen = new Set<string>();
  const out: BoardDiagnostic[] = [];
  for (const d of list) {
    const key = JSON.stringify([d.code, d.file ?? null, d.range?.start ?? null, d.nodeId ?? null, d.vocab ?? null, d.message]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Is the statement a Prop abbrev/def (D-2(b))? From usable facts, else from the declaration text. */
function isPropStatement(draft: Draft): boolean {
  const facts = draft.statementFacts;
  if (facts && facts.type !== undefined) {
    const kindOk = facts.kind === undefined ? ['abbrev', 'def'].includes(draft.statementDecl?.decl.keyword ?? 'def') : facts.kind === 'def';
    return kindOk && normalizeWhitespace(facts.type) === 'Prop';
  }
  const located = draft.statementDecl;
  if (!located) return facts !== undefined && (facts.kind === undefined || facts.kind === 'def');
  if (located.decl.keyword !== 'abbrev' && located.decl.keyword !== 'def') return false;
  const signature = signatureText(located.file, located.decl);
  return signature !== undefined && signature.binders === '' && normalizeWhitespace(signature.type) === 'Prop';
}

/** `n.holds`'s kind as the board treats it: `other` (a def proving the statement, ...) counts like a theorem. */
function holdsKind(draft: Draft): 'axiom' | 'theorem' | 'other' | undefined {
  if (!draft.holdsExists) return undefined;
  const kind = draft.holdsFacts?.kind;
  if (kind === 'axiom') return 'axiom';
  if (kind === 'theorem') return 'theorem';
  if (kind !== undefined) return 'other';
  const keyword = draft.holdsDecl?.decl.keyword;
  if (keyword === 'axiom') return 'axiom';
  if (keyword === 'theorem' || keyword === 'lemma') return 'theorem';
  return keyword === undefined ? undefined : 'other';
}

/** Index of the first element of a list sorted by `span.start` whose start is at or after `offset` (binary search). */
function firstStartingAt(list: ReadonlyArray<{ span: { start: number } }>, offset: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid]?.span.start ?? Infinity) < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** True when an element of a list sorted by `span.start` starts in `[from, to)`. */
function startsBetween(list: ReadonlyArray<{ span: { start: number } }>, from: number, to: number): boolean {
  const first = list[firstStartingAt(list, from)];
  return first !== undefined && first.span.start < to;
}

/**
 * The text between a card's statement and its `.holds` when its code holds both as one stretch: the same file, the
 * `.holds` after the statement, and only blank lines and comments between (no other declaration or block starts there).
 * Undefined otherwise: two pieces. Slice 2 (2c1): the base mask reads B's (`ProjectMask.codeOverride.joined`).
 */
export function codeJoint(statement: Located, holds: Located): string | undefined {
  if (holds.file.path !== statement.file.path || holds.decl.span.start < statement.decl.span.end) return undefined;
  const from = statement.decl.span.end;
  const to = holds.decl.span.start;
  const quiet = !startsBetween(holds.file.decls, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(holds.file.text.slice(from, to)).trim() === '';
  return quiet ? holds.file.text.slice(from, to) : undefined;
}

function codePieces(draft: Draft): CodePiece[] {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement) return [];
  const stmtPiece: CodePiece = { file: statement.file, start: statement.decl.span.start, end: statement.decl.span.end, decls: [draft.statement] };
  if (!holds || !draft.holds) return [stmtPiece];
  const holdsPiece: CodePiece = { file: holds.file, start: holds.decl.span.start, end: holds.decl.span.end, decls: [draft.holds] };
  if (codeJoint(statement, holds) !== undefined) return [{ file: statement.file, start: statement.decl.span.start, end: holds.decl.span.end, decls: [draft.statement, draft.holds] }];
  return [stmtPiece, holdsPiece];
}

// ---------------------------------------------------------------------------------------------
// Slice 2 (docs/slice2-plan.md 4.7, 2c1): the base mask

/** What the build reads of a `ProjectMask`, with the masked files' left-out spans. */
interface Masking {
  mask: ProjectMask;
  /** The spans of the declarations, blocks and lines left out of each file, sorted. */
  hidden: Map<string, Span[]>;
  /** The spans of the declarations with a `codeOverride` (targets' `.holds`, B's text shown in their card), by file. */
  overridden: Map<string, Span[]>;
  /** By target: Claude's arrows' sources left out of its `premises:`. */
  arrows: Map<string, Set<string>>;
  dropNodes: Set<string>;
  restoreMarks: Set<string>;
}

/** An own entry of a record (never one of Object's own keys, `__proto__`, …). */
function ownEntry<T>(map: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** The parser's hints that read what follows a block (markup/parser.ts `bindBlock`). */
const FOLLOWING_HINTS: ReadonlySet<string> = new Set(['TL013', 'TL014']);

/**
 * Spans to delete from `text`, merged (fixer 2c1 r1, C-V2C1-C5): overlapping ones (a `mutual` and the declarations
 * inside it) and those apart by whitespace only become one, as planItemRevert's step 3 takes lines out, so each stretch
 * is deleted once, with spans of the text as it is, and the spacing stays tidy.
 */
function mergeSpans(text: string, spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (span.start <= last.end || text.slice(last.end, span.start).trim() === '')) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    else merged.push({ start: span.start, end: span.end });
  }
  return merged;
}

/** `text` with `spans` deleted as LeanOps' removal deletes a declaration (`deletionEdit`), merged, the last first. */
function withoutSpans(text: string, spans: readonly Span[]): string {
  let t = text;
  for (const span of mergeSpans(text, spans).reverse()) {
    const edit = deletionEdit(t, span, new Lines(t));
    t = t.slice(0, edit.span.start) + t.slice(edit.span.end);
  }
  return t;
}

/**
 * Fixer 2c1 r1 (S-V2C1-S1, C-V2C1-C1/C2, A-ADV-2/3): each kept block's binding and its TL013/TL014 hints as the parser
 * reads `file` without `spans` (`withoutSpans`, so the text the not-proved twin has): a pinned block stays pinned, a
 * block whose adjacent declaration is left out reads what follows it then, and no hint names or describes a left-out
 * declaration. `blocks`: the blocks the mask keeps, as written, in order. `decls`: the declarations the twin text keeps,
 * in order, each with its index among the masked file's declarations (`at`), to which the twin's indices are mapped
 * back. Fixer 2c1 r2 (R1-2): `spans` also holds every target's `.holds` with a `codeOverride`, which the masked file
 * keeps (its card shows B's text) but the twin text does not: the not-proved outcome has B's `.holds` beside its
 * statement, where no block reads it, so no block may read the `.holds` where the step put it either. Undefined when
 * that text does not read as the same blocks and declarations (the caller then fails safe).
 */
function twinBindings(
  file: ParsedFile,
  spans: readonly Span[],
  blocks: readonly MarkupBlock[],
  decls: ReadonlyArray<{ decl: DeclInfo; at: number }>,
): Array<{ binding: BlockBinding; hints: MarkupDiagnostic[] }> | undefined {
  const twin = parseLeanFile(file.path, withoutSpans(file.text, spans));
  if (twin.blocks.length !== blocks.length || twin.decls.length !== decls.length) return undefined;
  const textOf = (text: string, span: Span) => text.slice(span.start, span.end);
  if (twin.blocks.some((b, k) => textOf(twin.text, b.span) !== textOf(file.text, (blocks[k] as MarkupBlock).span))) return undefined;
  if (twin.decls.some((d, k) => d.keyword !== decls[k]?.decl.keyword || d.fullName !== decls[k]?.decl.fullName)) return undefined;
  const back = (j: number | undefined) => (j === undefined ? undefined : decls[j]?.at);
  return twin.blocks.map((b) => {
    const { adjacentDecl, gapDecl, ...rest } = b.binding;
    const adjacent = back(adjacentDecl);
    const gap = back(gapDecl);
    return {
      binding: { ...rest, ...(adjacent !== undefined ? { adjacentDecl: adjacent } : {}), ...(gap !== undefined ? { gapDecl: gap } : {}) },
      hints: twin.diagnostics.filter((d) => FOLLOWING_HINTS.has(d.code) && d.span.start === b.markerSpan.start),
    };
  });
}

/**
 * The files as the masked build reads them: the declarations named in `drop` or `absent` (an anonymous instance by the
 * name `anonymousInstanceName` gives it; a `mutual` whose named declarations all go, with them), the blocks of
 * `dropNodes` and the `lines` that go with them left out, with their markup diagnostics; a target's `.holds` with a
 * `codeOverride` read with B's keyword (S-V2C1-S2); the other blocks' bindings and their TL013/TL014 hints as the
 * parser reads the file without what is left out and without the overridden `.holds` (`twinBindings`; fixer 2c1 r2,
 * R1-2: also in a file where nothing else is left out), else, failing safe, re-indexed with every hint about a
 * left-out declaration or an overridden `.holds` dropped (either one adjacent leaves the block code-less, unless it is
 * pinned); a block in `derivedIds` read with B's derived id again, with its TL112. The texts stay the working copy's,
 * so every position the facts give holds.
 */
function maskFiles(files: readonly ParsedFile[], mask: ProjectMask): { files: ParsedFile[]; masking: Masking } {
  const names = new Set([...mask.drop, ...mask.absent]);
  const dropNodes = new Set(mask.dropNodes);
  const derived = new Map(Object.entries(mask.derivedIds));
  const hidden = new Map<string, Span[]>();
  const overridden = new Map<string, Span[]>();
  const out = files.map((file): ParsedFile => {
    const nameOf = (decl: DeclInfo) => decl.fullName ?? (decl.keyword === 'instance' ? anonymousInstanceName(file, decl) : undefined);
    const gone = file.decls.map((decl) => {
      const name = nameOf(decl);
      return name !== undefined && names.has(name);
    });
    // A `mutual` goes when every named declaration inside it goes (and one does).
    file.decls.forEach((decl, k) => {
      if (decl.keyword !== 'mutual') return;
      const inside = file.decls.map((d, j) => ({ d, j })).filter(({ d, j }) => j !== k && d.span.start >= decl.span.start && d.span.end <= decl.span.end && nameOf(d) !== undefined);
      if (inside.length > 0 && inside.every(({ j }) => gone[j])) gone[k] = true;
    });
    const spans: Span[] = [];
    /** Original index → index among the masked declarations. */
    const index = new Map<number, number>();
    /** The declarations kept, as written; `decls`: as the build reads them. */
    const kept: DeclInfo[] = [];
    const decls: DeclInfo[] = [];
    /** The kept targets' `.holds` with a `codeOverride` (their indices among `decls`, and their spans): fixer 2c1 r2, R1-2. */
    const overrideAt = new Set<number>();
    const overrides: Span[] = [];
    file.decls.forEach((decl, k) => {
      if (gone[k]) {
        spans.push(decl.span);
        return;
      }
      const override = decl.fullName !== undefined ? ownEntry(mask.codeOverride, decl.fullName) : undefined;
      if (override !== undefined) {
        overrideAt.add(decls.length);
        overrides.push(decl.span);
      }
      index.set(k, decls.length);
      kept.push(decl);
      decls.push(override !== undefined && override.keyword !== decl.keyword ? { ...decl, keyword: override.keyword } : decl);
    });
    if (overrides.length > 0) overridden.set(file.path, overrides);
    const keptBlocks: MarkupBlock[] = [];
    for (const block of file.blocks) {
      if (dropNodes.has(block.id)) spans.push(block.span);
      else keptBlocks.push(block);
    }
    spans.push(...(ownEntry(mask.lines, file.path) ?? []));
    spans.sort((a, b) => a.start - b.start);
    hidden.set(file.path, spans);
    const reread = spans.length > 0 || overrides.length > 0;
    const twinDecls = kept.flatMap((decl, at) => (overrideAt.has(at) ? [] : [{ decl, at }]));
    const twin = reread ? twinBindings(file, [...spans, ...overrides], keptBlocks, twinDecls) : undefined;
    const lines = new Lines(file.text);
    /** The blocks (by their marker's start) whose TL013/TL014 hints are re-read or dropped. */
    const rehinted = new Set<number>();
    const added: MarkupDiagnostic[] = [];
    const blocks = keptBlocks.map((block, k): MarkupBlock => {
      const derivedId = block.idWritten ? derived.get(block.id) : undefined;
      const id = derivedId ?? block.id;
      let binding: BlockBinding = { ...block.binding };
      const read = twin?.[k];
      if (read !== undefined) {
        binding = { ...read.binding };
        rehinted.add(block.markerSpan.start);
        for (const hint of read.hints) added.push({ ...hint, span: block.markerSpan, range: lines.range(block.markerSpan), nodeId: id });
      } else if (reread) {
        // Failing safe: indices of the masked declarations; a hint about a left-out declaration, or about an overridden
        // `.holds` (which the twin text does not hold, R1-2), goes.
        const keptAt = (j: number) => {
          const now = index.get(j);
          return now !== undefined && !overrideAt.has(now) ? now : undefined;
        };
        if (binding.adjacentDecl !== undefined) {
          const now = keptAt(binding.adjacentDecl);
          if (now !== undefined) binding.adjacentDecl = now;
          else {
            rehinted.add(block.markerSpan.start);
            if (binding.mode === 'adjacent') binding = { mode: 'none' };
            else delete binding.adjacentDecl;
          }
        }
        if (binding.gapDecl !== undefined) {
          const now = keptAt(binding.gapDecl);
          if (now !== undefined) binding.gapDecl = now;
          else {
            rehinted.add(block.markerSpan.start);
            delete binding.gapDecl;
          }
        }
      }
      if (derivedId === undefined) return { ...block, binding };
      // As the parser reports a block without `id:` (markup/parser.ts).
      added.push({
        code: 'TL112',
        severity: 'info',
        message: `This block has no \`id:\`; telelean uses \`${derivedId}\` and writes it into the block on its next edit.`,
        span: block.markerSpan,
        range: lines.range(block.markerSpan),
        nodeId: derivedId,
      });
      return { ...block, id: derivedId, idWritten: false, binding };
    });
    const inside = (offset: number) => spans.some((s) => s.start <= offset && offset < s.end);
    const diagnostics = [...file.diagnostics.filter((d) => !inside(d.span.start) && !(FOLLOWING_HINTS.has(d.code) && rehinted.has(d.span.start))), ...added];
    return { ...file, decls, blocks, diagnostics };
  });
  const arrows = new Map<string, Set<string>>();
  for (const { source, target } of mask.dropArrows) arrows.set(target, new Set([...(arrows.get(target) ?? []), source]));
  return { files: out, masking: { mask, hidden, overridden, arrows, dropNodes, restoreMarks: new Set(mask.restoreMarks) } };
}

/** `text` with the left-out spans inside `[from, to)` deleted as LeanOps' removal deletes a declaration (merged, C5), and the line breaks it took. */
function withoutHidden(text: string, from: number, to: number, spans: readonly Span[]): { text: string; lines: number } {
  let t = text;
  let end = to;
  let lines = 0;
  for (const span of mergeSpans(text, spans.filter((s) => s.start >= from && s.end <= to)).reverse()) {
    const edit = deletionEdit(t, span, new Lines(t));
    const start = Math.max(from, edit.span.start);
    const stop = Math.min(end, edit.span.end);
    if (stop <= start) continue;
    lines += (t.slice(start, stop).match(/\n/g) ?? []).length;
    t = t.slice(0, start) + t.slice(stop);
    end -= stop - start;
  }
  return { text: t.slice(from, end), lines };
}

/**
 * For each character of `text`, whether it lies inside a block comment (`/- … -/`, nested, its delimiters included);
 * a `--` line comment or a string never opens one (as `blankComments` reads them).
 */
function blockCommentMask(text: string): boolean[] {
  const inside = new Array<boolean>(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '-' && next === '-') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i++;
    } else if (c === '/' && next === '-') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '/' && text[j + 1] === '-') {
          depth++;
          j += 2;
        } else if (text[j] === '-' && text[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      for (let k = i; k < Math.min(j, text.length); k++) inside[k] = true;
      i = j;
    } else i++;
  }
  return inside;
}

/**
 * Fixer 2c1 r2 (R1-3): the text between a card's statement and its `.holds` (blank lines and comments only) without
 * its blank lines. What stays: the rest of the statement's last line, every line that holds a comment or lies inside a
 * block comment, and the `.holds`' own line up to it (its indentation), with their line breaks as written.
 */
function withoutBlankLines(gap: string): string {
  const parts = gap.split('\n');
  if (parts.length <= 2) return gap;
  const inBlock = blockCommentMask(gap);
  const out = [parts[0] as string];
  let at = (parts[0] as string).length + 1;
  for (let k = 1; k < parts.length - 1; k++) {
    const line = parts[k] as string;
    // `at + line.length` is this line's `\n`: inside a block comment, the line is the comment's.
    if (line.trim() !== '' || inBlock[at + line.length] === true) out.push(line);
    at += line.length + 1;
  }
  out.push(parts[parts.length - 1] as string);
  return out.join('\n');
}

/** One declaration of a card's masked code: whose refs, from where in its facts' positions, where in the code it starts. */
interface CodeDecl {
  name: string;
  from: Position;
  to: Position;
  /** The line of the code where it starts. */
  line: number;
  /** The column of the code where it starts: refs on its first line move from `from.character` to it (fixer 2c1 r1). */
  column: number;
}

/** The number of line breaks in `text`. */
const lineBreaks = (text: string) => (text.match(/\n/g) ?? []).length;
/** The length of the last line of `text`: the column right after it. */
const lastLineLength = (text: string) => text.length - (text.lastIndexOf('\n') + 1);

/**
 * A card's code under the base mask (else undefined: the usual pieces). A target's `.holds` with a `codeOverride` is
 * B's text, placed against B's range, joined to the statement as B joined them. Another card with a `codeLayout` (its
 * statement and `.holds` have B's texts) is composed as B composed it, from the working copy's texts and positions
 * (fixer 2c1 r1, C-V2C1-C3). Any other card (one the session formalised) whose statement and `.holds` are one stretch
 * once the declarations, blocks and lines left out between them, and a target's `.holds` the step put there, are taken
 * out, as LeanOps' removal leaves the text, is that stretch without its blank lines (comment lines kept), whether or not
 * anything was taken out (fixer 2c1 r2, R1-3): the text cannot tell which blank lines came with what was taken out, so
 * the hidden board shows the same code whatever the step wrote between them.
 */
function maskedCode(draft: Draft, masking: Masking, lines: (file: ParsedFile) => LineMap): { code: string; decls: CodeDecl[]; files: ParsedFile[]; loc: FileRange } | undefined {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement || !holds || !draft.holds) return undefined;
  const stmtText = statement.file.text.slice(statement.decl.span.start, statement.decl.span.end);
  const stmtMap = lines(statement.file);
  const stmtFrom = stmtMap.positionAt(statement.decl.span.start);
  const stmtTo = stmtMap.positionAt(statement.decl.span.end);
  const end = holds.file.path === statement.file.path ? holds.decl.span.end : statement.decl.span.end;
  const loc: FileRange = { file: statement.file.path, range: stmtMap.rangeOf(statement.decl.span.start, Math.max(end, statement.decl.span.end)) };
  const stmtDecl: CodeDecl = { name: draft.statement, from: stmtFrom, to: stmtTo, line: 0, column: 0 };
  const holdsKey = draft.holds;
  /** The statement, then `between` (B's text between them, or a blank line for two pieces), then the `.holds`. */
  const compose = (between: string, holdsText: string, from: Position, to: Position, files: ParsedFile[]) => {
    const head = `${stmtText}${between}`;
    return { code: `${head}${holdsText}`, decls: [stmtDecl, { name: holdsKey, from, to, line: lineBreaks(head), column: lastLineLength(head) }], files, loc };
  };
  const override = ownEntry(masking.mask.codeOverride, holdsKey);
  if (override !== undefined) return compose(override.joined ?? '\n\n', override.text, override.range.start, override.range.end, [statement.file, holds.file]);
  const holdsMap = lines(holds.file);
  const holdsFrom = holdsMap.positionAt(holds.decl.span.start);
  const holdsTo = holdsMap.positionAt(holds.decl.span.end);
  const holdsText = holds.file.text.slice(holds.decl.span.start, holds.decl.span.end);
  const layout = ownEntry(masking.mask.codeLayout, holdsKey);
  if (layout !== undefined) return compose(layout.joined ?? '\n\n', holdsText, holdsFrom, holdsTo, [statement.file, holds.file]);
  if (holds.file.path !== statement.file.path || holds.decl.span.start < statement.decl.span.end) return undefined;
  const from = statement.decl.span.end;
  const to = holds.decl.span.start;
  // What is left out, and a target's `.holds` the step put there, whose card shows B's text where B had it.
  const inGap = (s: Span) => s.start >= from && s.end <= to;
  const moved = (masking.overridden.get(holds.file.path) ?? []).filter(inGap);
  const spans = [...(masking.hidden.get(holds.file.path) ?? []).filter(inGap), ...moved];
  const gap = withoutHidden(holds.file.text, from, to, spans);
  const others = holds.file.decls.filter((d) => !moved.some((s) => s.start === d.span.start));
  const quiet = !startsBetween(others, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(gap.text).trim() === '';
  if (!quiet) return undefined;
  return compose(withoutBlankLines(gap.text), holdsText, holdsFrom, holdsTo, [statement.file]);
}

export function buildProject(input: ProjectInput): ProjectModel {
  const library = input.library;
  // Slice 2 (2c1): under the base mask the build reads the files without what the mask leaves out.
  const masked = input.mask !== undefined ? maskFiles(input.files, input.mask) : undefined;
  const masking = masked?.masking;
  const files = [...(masked?.files ?? input.files)].sort(byPath);
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const factsIndex = new FactsIndex(files, input.fileHashes, input.facts);
  const diagnostics: BoardDiagnostic[] = [];
  const lineMaps = new Map<string, LineMap>();
  const lines = (file: ParsedFile): LineMap => {
    let map = lineMaps.get(file.path);
    if (!map) {
      map = new LineMap(file.text);
      lineMaps.set(file.path, map);
    }
    return map;
  };

  // ---- subjects
  const subjectOfFile = new Map<string, string>();
  for (const file of files) {
    const subject = subjectOfPath(file.path, library);
    if (subject !== undefined && isSubjectName(subject)) subjectOfFile.set(file.path, subject);
  }
  const subjectNames = [...new Set(subjectOfFile.values())].sort();

  // ---- syntactic declarations by name, and every name Lean or the text knows
  const syntactic = new Map<string, Located>();
  for (const file of files) for (const decl of file.decls) if (decl.fullName && !syntactic.has(decl.fullName)) syntactic.set(decl.fullName, { file, decl });
  const known = (name: string) => syntactic.has(name) || factsIndex.usable.has(name);

  // ---- ids (written ids win; derived ids are suffixed on collisions, files in path order)
  const writtenIds = new Set<string>();
  for (const file of files) for (const block of file.blocks) if (block.idWritten && block.id) writtenIds.add(block.id);
  const assigned = new Map<string, { file: string; range: Range }>();
  const blockIds = new Map<MarkupBlock, string>();
  const drafts: Draft[] = [];
  for (const file of files) {
    for (const block of file.blocks) {
      if (!block.id || block.fields.type === undefined || block.fields.naturalName === undefined) continue;
      let id = block.id;
      if (block.idWritten) {
        const first = assigned.get(id);
        if (first) {
          diagnostics.push({
            code: 'TL006',
            severity: 'error',
            message: `Duplicate id "${id}": the block in ${first.file} (line ${first.range.start.line + 1}) keeps it. Give this block another id.`,
            file: file.path,
            range: block.range,
          });
          continue;
        }
      } else if (assigned.has(id) || writtenIds.has(id)) {
        let n = 2;
        while (assigned.has(`${block.id}-${n}`) || writtenIds.has(`${block.id}-${n}`)) n++;
        id = `${block.id}-${n}`;
      }
      assigned.set(id, { file: file.path, range: block.range });
      blockIds.set(block, id);
      const subject = subjectOfFile.get(file.path);
      if (subject === undefined) {
        diagnostics.push({
          code: 'TL120',
          severity: 'warning',
          message: `This block is outside any subject: move it into ${library}/<Subject>/ (a subject is a module subtree with its own namespace).`,
          file: file.path,
          range: block.range,
        });
        continue;
      }
      // Slice 2 (2c1): Claude's arrows and the written premise cards' arrows left out, and a mark they removed back.
      let premises = [...(block.fields.premises ?? [])];
      let followsFrom = block.fields.followsFrom === 'nothing';
      if (masking !== undefined) {
        const claude = masking.arrows.get(id);
        premises = premises.filter((source) => !masking.dropNodes.has(source) && !(claude?.has(source) ?? false));
        // Shown only when no arrow into it stays (the node rule below: the arrows win, TL023).
        if (masking.restoreMarks.has(id)) followsFrom = true;
      }
      drafts.push({
        id,
        file,
        block,
        premises,
        followsFrom,
        subject,
        type: block.fields.type,
        statementFound: false,
        notProp: false,
        holdsExists: false,
        extraPinned: [],
        leanError: false,
        diagnostics: [],
        flags: new Set(),
        proof: { kind: 'none' },
        formal: 'informal',
        lean: { binding: block.binding.mode },
      });
    }
  }

  // ---- binding
  // A block's namespace comes from the parser; files built by hand (tests) fall back to one scan per file.
  const namespaceTables = new Map<string, (offset: number) => string[]>();
  const namespaceOf = (file: ParsedFile, block: MarkupBlock): string[] => {
    if (block.namespace) return block.namespace;
    let table = namespaceTables.get(file.path);
    if (!table) namespaceTables.set(file.path, (table = namespaceTable(file.text)));
    return table(block.span.start);
  };
  for (const draft of drafts) {
    const binding = draft.block.binding;
    if (binding.mode === 'none') continue;
    let statement = binding.statement;
    if (binding.mode === 'adjacent') {
      const decl = binding.adjacentDecl !== undefined ? draft.file.decls[binding.adjacentDecl] : undefined;
      if (decl) {
        statement = decl.fullName;
        if (statement) draft.statementDecl = { file: draft.file, decl };
      }
    } else {
      const namespace = namespaceOf(draft.file, draft.block);
      const resolve = (name: string) => (known(name) ? name : (resolveName(name, namespace, known) ?? name));
      if (statement) statement = resolve(statement);
      draft.extraPinned = (binding.pinned ?? []).slice(1).map(resolve);
      if (statement) {
        const located = syntactic.get(statement);
        if (located) draft.statementDecl = located;
      }
    }
    if (!statement) {
      draft.notProp = binding.mode === 'adjacent';
      continue;
    }
    draft.statement = statement;
    draft.statementFound = known(statement);
    draft.holds = holdsName(statement);
    const holdsDecl = syntactic.get(draft.holds);
    if (holdsDecl) draft.holdsDecl = holdsDecl;
    const statementFacts = factsIndex.usable.get(statement);
    if (statementFacts) draft.statementFacts = statementFacts;
    const holdsFacts = factsIndex.usable.get(draft.holds);
    if (holdsFacts) draft.holdsFacts = holdsFacts;
    draft.holdsExists = Boolean(holdsDecl || holdsFacts);
  }

  // ---- ownership (statement and `.holds`), TL017
  const ownerOfDecl = new Map<string, string>();
  for (const draft of drafts) {
    if (!draft.statement || !draft.statementFound) continue;
    const owner = ownerOfDecl.get(draft.statement);
    if (owner !== undefined && owner !== draft.id) {
      draft.diagnostics.push({
        code: 'TL017',
        severity: 'error',
        message: `${draft.statement} is already bound to "${owner}": a declaration can belong to one card only.`,
        file: draft.file.path,
        range: draft.block.range,
        nodeId: draft.id,
      });
      continue;
    }
    ownerOfDecl.set(draft.statement, draft.id);
    if (draft.holds && draft.holdsExists && !ownerOfDecl.has(draft.holds)) ownerOfDecl.set(draft.holds, draft.id);
    for (const name of draft.extraPinned) if (known(name) && !ownerOfDecl.has(name)) ownerOfDecl.set(name, draft.id);
  }

  // ---- vocabulary
  const candidates: VocabCandidate[] = [];
  const folded = new Map<string, string>();
  for (const file of files) {
    const subject = subjectOfFile.get(file.path);
    if (subject === undefined) continue;
    const state = factsIndex.stateOf(file.path);
    const names = new Set<string>();
    for (const decl of file.decls) {
      if (decl.keyword === 'example' || decl.keyword === 'mutual') continue;
      const facts = factsIndex.factsFor(file, decl);
      const name = decl.fullName ?? facts?.name ?? (decl.keyword === 'instance' ? anonymousInstanceName(file, decl) : undefined);
      if (!name || names.has(name) || ownerOfDecl.has(name)) continue;
      names.add(name);
      if (facts?.parent) {
        folded.set(name, facts.parent);
        continue;
      }
      candidates.push({ shape: shapeOf(file, decl, facts, name, known), subject, file, decl, ...(facts ? { facts } : {}), stale: state === 'stale' });
    }
    for (const facts of factsIndex.unmatched.get(file.path) ?? []) {
      if (names.has(facts.name) || ownerOfDecl.has(facts.name)) continue;
      const parent = facts.parent ?? [...names].find((n) => facts.name.startsWith(`${n}.`));
      names.add(facts.name);
      if (parent !== undefined) {
        folded.set(facts.name, parent);
        continue;
      }
      candidates.push({ shape: shapeOf(file, undefined, facts, facts.name, known), subject, file, facts, stale: false });
    }
  }
  const vocab: VocabularyResult = buildVocabulary(candidates, subjectNames);
  for (let pass = 0; pass < 3; pass++) {
    for (const [name, parent] of folded) {
      const item = vocab.itemOfName.get(parent);
      if (item !== undefined && !vocab.itemOfName.has(name)) vocab.itemOfName.set(name, item);
    }
  }
  const isPresupposition = (name: string) => vocab.kindOf.get(name) === 'presupposition' && vocab.itemOfName.get(name) === name;
  // Slice 2 (D2-18, EN-3; 2c1): a definition the person endorsed at an Apply (its name and `endorsementHash` of its
  // source text, in its subject's endorsements) needs no endorsement any more.
  const endorsed = new Set<string>();
  for (const item of vocab.items) {
    if (item.kind !== 'definition' || item.code === undefined || input.endorsements === undefined) continue;
    const list = Object.prototype.hasOwnProperty.call(input.endorsements, item.subject) ? input.endorsements[item.subject] : undefined;
    if (list === undefined || list.length === 0) continue;
    const hash = endorsementHash(item.code);
    if (list.some((e) => e.name === item.name && e.textHash === hash)) endorsed.add(item.name);
  }
  const needsEndorsement = (name: string) => vocab.kindOf.get(name) === 'definition' && !endorsed.has(name);

  // ---- Lean messages (trusted positions only where the build saw the current text)
  const trustworthy = (path: string) => {
    const info = factsIndex.files.get(path);
    return info !== undefined && info.module !== undefined && !info.hashDiffers;
  };
  const containing = (path: string, range: Range | undefined): { nodeId?: string; vocab?: string } => {
    if (!range || !trustworthy(path)) return {};
    for (const draft of drafts) {
      for (const located of [draft.statementDecl, draft.holdsDecl]) {
        if (located && located.file.path === path && rangeContains(located.decl.range, range.start)) return { nodeId: draft.id };
      }
    }
    for (const item of vocab.items) if (item.loc && item.loc.file === path && rangeContains(item.loc.range, range.start)) return { vocab: item.name };
    return {};
  };
  for (const message of input.facts?.build.messages ?? []) {
    const severity = SEVERITY_OF_LEAN[message.severity] ?? 'info';
    const where = message.file ? containing(message.file, message.range) : {};
    diagnostics.push({
      code: 'LEAN',
      severity,
      message: message.text,
      ...(message.file ? { file: message.file } : {}),
      ...(message.range ? { range: message.range } : {}),
      ...where,
    });
    if (severity === 'error' && where.nodeId !== undefined) {
      const draft = drafts.find((d) => d.id === where.nodeId);
      if (draft) draft.leanError = true;
    }
  }

  // ---- per node: formal, card data, base proof status
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const ownerStatement = (id: string) => byId.get(id)?.statement;
  for (const draft of drafts) {
    const block = draft.block;
    const binding = block.binding.mode;
    const at = { file: draft.file.path, range: block.range, nodeId: draft.id };
    if (draft.type === 'AXIOM' && block.fields.rationale === undefined) {
      draft.flags.add('no-rationale');
      draft.diagnostics.push({ code: 'TL011', severity: 'info', message: noRationaleMessage(block.fields.stance), ...at });
    }
    if (binding === 'none') continue;

    // formal
    if (!draft.statement) {
      draft.formal = 'ill-formed';
      draft.diagnostics.push({ code: 'TL113', severity: 'error', message: 'This card is bound to a declaration without a name: bind it to `abbrev n : Prop := …` (with `axiom n.holds : n`).', ...at });
    } else if (!draft.statementFound) {
      draft.formal = 'ill-formed';
      draft.diagnostics.push({ code: 'TL101', severity: 'error', message: `Lean declaration ${draft.statement} not found.`, ...at });
    } else if (!isPropStatement(draft)) {
      draft.formal = 'ill-formed';
      draft.notProp = true;
      const short = draft.statement.split('.').pop() ?? draft.statement;
      draft.diagnostics.push({
        code: 'TL113',
        severity: 'error',
        message: `${draft.statement} is not a Prop abbrev/def: write \`abbrev ${short} : Prop := …\` and \`axiom ${short}.holds : ${short}\`.`,
        ...at,
      });
    } else draft.formal = draft.leanError ? 'ill-formed' : 'formalized';

    const statement = draft.statement;
    const lean: LeanBinding = { binding, ...(statement ? { statement } : {}) };
    const hk = draft.statementFound && !draft.notProp ? holdsKind(draft) : undefined;
    if (statement && draft.statementFound && draft.holdsExists && draft.holds) lean.justification = draft.holds;
    if (hk) lean.justificationKind = hk;

    // code and codeLoc (slice 2, 2c1: under the base mask, `maskedCode` when the mask touches the card)
    const composed = masking !== undefined && draft.statementFound ? maskedCode(draft, masking, lines) : undefined;
    const pieces = composed === undefined && draft.statementFound ? codePieces(draft) : [];
    if (composed !== undefined) {
      lean.code = composed.code;
      lean.codeLoc = composed.loc;
    } else if (pieces.length > 0) {
      lean.code = pieces.map((p) => p.file.text.slice(p.start, p.end)).join('\n\n');
      const first = pieces[0] as CodePiece;
      const last = pieces[pieces.length - 1] as CodePiece;
      const end = last.file.path === first.file.path ? last.end : first.end;
      const loc: FileRange = { file: first.file.path, range: lines(first.file).rangeOf(first.start, end) };
      lean.codeLoc = loc;
    }

    // uses (statement closure) and presupposes
    if (statement && draft.statementFacts) {
      const uses: string[] = [];
      const visited = new Set([statement]);
      const queue = [statement];
      while (queue.length > 0) {
        const name = queue.shift() as string;
        const facts = factsIndex.usable.get(name);
        if (!facts) continue;
        for (const ref of facts.refs) {
          const item = vocab.itemOfName.get(ref.name);
          if (item !== undefined && !uses.includes(item)) uses.push(item);
          const owner = ownerOfDecl.get(ref.name);
          const throughNode = owner !== undefined && ownerStatement(owner) === ref.name;
          const throughDefinition = item === ref.name && vocab.kindOf.get(item) === 'definition';
          if ((throughNode || throughDefinition) && !visited.has(ref.name)) {
            visited.add(ref.name);
            queue.push(ref.name);
          }
        }
      }
      lean.uses = uses;
      if (draft.statementFacts.axioms) lean.presupposes = draft.statementFacts.axioms.filter(isPresupposition);
    }
    if (draft.holdsFacts?.axioms) lean.axioms = [...draft.holdsFacts.axioms];

    // refs: code-relative, fresh files only
    const keepRef = (ref: { name: string }) => {
      const owner = ownerOfDecl.get(ref.name);
      const ownerStmt = owner !== undefined ? ownerStatement(owner) : undefined;
      const nodeRef = ownerStmt !== undefined && (ref.name === ownerStmt || ref.name === holdsName(ownerStmt));
      return nodeRef || vocab.itemOfName.has(ref.name) ? { nodeRef, owner } : undefined;
    };
    if (composed !== undefined && composed.files.every((f) => factsIndex.isFresh(f.path))) {
      // Each declaration's refs, placed from where its facts put it (B's range for a code override) at its line and
      // column in the code.
      const refs: LeanRef[] = [];
      for (const decl of composed.decls) {
        for (const ref of factsIndex.usable.get(decl.name)?.refs ?? []) {
          const kept = keepRef(ref);
          if (kept === undefined) continue;
          if (ref.range.start.line < decl.from.line || ref.range.end.line > decl.to.line) continue;
          const shift = (p: { line: number; character: number }) => ({
            line: p.line - decl.from.line + decl.line,
            character: p.line === decl.from.line ? p.character - decl.from.character + decl.column : p.character,
          });
          refs.push({ name: ref.name, range: { start: shift(ref.range.start), end: shift(ref.range.end) }, ...(kept.nodeRef && kept.owner !== undefined ? { nodeId: kept.owner } : {}) });
        }
      }
      lean.refs = refs;
    } else if (pieces.length > 0 && pieces.every((p) => factsIndex.isFresh(p.file.path))) {
      const refs: LeanRef[] = [];
      let lineOffset = 0;
      for (const piece of pieces) {
        const map = lines(piece.file);
        const start = map.positionAt(piece.start);
        const end = map.positionAt(piece.end);
        for (const declName of piece.decls) {
          const facts = factsIndex.usable.get(declName);
          for (const ref of facts?.refs ?? []) {
            const owner = ownerOfDecl.get(ref.name);
            const ownerStmt = owner !== undefined ? ownerStatement(owner) : undefined;
            const nodeRef = ownerStmt !== undefined && (ref.name === ownerStmt || ref.name === holdsName(ownerStmt));
            if (!nodeRef && !vocab.itemOfName.has(ref.name)) continue;
            if (ref.range.start.line < start.line || ref.range.end.line > end.line) continue;
            const shift = (p: { line: number; character: number }) => ({
              line: p.line - start.line + lineOffset,
              character: p.line === start.line ? p.character - start.character : p.character,
            });
            refs.push({ name: ref.name, range: { start: shift(ref.range.start), end: shift(ref.range.end) }, ...(nodeRef && owner !== undefined ? { nodeId: owner } : {}) });
          }
        }
        lineOffset += end.line - start.line + 2;
      }
      lean.refs = refs;
    }
    draft.lean = lean;

    // stale / not-checked
    const declFiles = [draft.statementDecl?.file.path ?? draft.statementFacts?.file, draft.holdsDecl?.file.path ?? draft.holdsFacts?.file].filter(
      (p): p is string => p !== undefined,
    );
    if (declFiles.some((p) => factsIndex.files.get(p)?.hashDiffers || factsIndex.stateOf(p) === 'stale')) draft.flags.add('stale');
    if (draft.statementFound && (draft.statementFacts === undefined || (draft.holdsExists && draft.holdsFacts === undefined))) draft.flags.add('not-checked');

    // proof (docs/m1-plan.md section 6.3 table)
    if (!draft.statementFound || draft.notProp || !statement) continue;
    const short = statement.split('.').pop() ?? statement;
    if (!draft.holdsExists) {
      if (draft.type === 'AXIOM') {
        draft.flags.add('missing-holds');
        draft.diagnostics.push({
          code: 'TL117',
          severity: 'warning',
          message: `This axiom has no \`axiom ${short}.holds : ${short}\`, so proofs cannot use it.`,
          ...at,
        });
      }
      continue;
    }
    const holdsFacts = draft.holdsFacts;
    if (hk === 'axiom') {
      // An axiom card's assumption; a proposition's `axiom n.holds` is a claim pending proof (spec v4 AR-6, A19).
      draft.proof = draft.type === 'AXIOM' ? { kind: 'assumed' } : { kind: 'pending' };
      if (holdsFacts?.type !== undefined && normalizeWhitespace(holdsFacts.type) !== statement) {
        draft.flags.add('holds-mismatch');
        draft.diagnostics.push({ code: 'TL114', severity: 'error', message: `${draft.holds} does not state ${statement} (its type is ${normalizeWhitespace(holdsFacts.type)}).`, ...at });
      }
      continue;
    }
    // theorem (or another kind, treated like a theorem): needs Lean's facts
    if (!holdsFacts || holdsFacts.type === undefined || holdsFacts.axioms === undefined) {
      draft.flags.add('not-checked');
      continue;
    }
    if (holdsFacts.usesSorry || holdsFacts.axioms.includes(SORRY_AXIOM)) {
      draft.flags.add('uses-sorry');
      draft.diagnostics.push({ code: 'TL115', severity: 'warning', message: 'The proof uses `sorry`.', ...at });
      continue;
    }
    const type = normalizeWhitespace(holdsFacts.type);
    let on: string[] | undefined;
    if (type === statement) on = [];
    else {
      const parts = splitTopLevelArrows(type);
      if (parts.length > 1 && parts[parts.length - 1] === statement) {
        const hyps: string[] = [];
        for (const part of parts.slice(0, -1)) {
          const owner = ownerOfDecl.get(part);
          if (owner === undefined || ownerStatement(owner) !== part) {
            hyps.length = 0;
            break;
          }
          if (!hyps.includes(owner)) hyps.push(owner);
        }
        if (hyps.length > 0) on = hyps;
      }
    }
    if (on === undefined) {
      draft.flags.add('holds-mismatch');
      draft.diagnostics.push({ code: 'TL114', severity: 'error', message: `${draft.holds} does not state ${statement} (its type is ${type}).`, ...at });
      continue;
    }
    // footprint
    const nodesIn: string[] = [];
    const presups: string[] = [];
    const others: string[] = [];
    for (const axiom of holdsFacts.axioms) {
      if (STANDARD_AXIOM_NAMES.includes(axiom)) continue;
      const owner = ownerOfDecl.get(axiom);
      const ownerStmt = owner !== undefined ? ownerStatement(owner) : undefined;
      if (owner !== undefined && ownerStmt !== undefined && axiom === holdsName(ownerStmt)) {
        if (!nodesIn.includes(owner)) nodesIn.push(owner);
        continue;
      }
      if (isPresupposition(axiom)) {
        presups.push(`${PRESUPPOSITION_PREFIX}${axiom}`);
        continue;
      }
      const item = vocab.itemOfName.get(axiom);
      const kind = item !== undefined ? vocab.kindOf.get(item) : undefined;
      const harmless = kind === 'sort' || kind === 'predicate' || ((kind === 'function' || kind === 'constant') && !vocab.declaredWithAxiom.has(item ?? ''));
      if (harmless) continue;
      others.push(`axiom:${axiom}`);
      draft.diagnostics.push({
        code: 'TL103',
        severity: 'warning',
        message: `The proof uses ${axiom}, which is neither an assumption (a card's \`.holds\`) nor vocabulary.`,
        ...at,
        ...(item !== undefined ? { vocab: item } : {}),
      });
    }
    const footprint = [...nodesIn, ...presups, ...others];
    draft.proof = on.length > 0 ? { kind: 'conditional', on, footprint } : { kind: 'proved', footprint };
    if (draft.type === 'AXIOM') {
      draft.flags.add('provable-assumption');
      draft.diagnostics.push({ code: 'TL106', severity: 'info', message: 'This axiom has a proof.', ...at });
    }
  }

  // ---- flags that depend on other nodes
  for (const draft of drafts) {
    const proof = draft.proof;
    if (proof.kind !== 'proved' && proof.kind !== 'conditional') continue;
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    const footprint = proof.kind === 'proved' ? proof.footprint : (proof.footprint ?? []);
    const footprintNodes = footprint.map((x) => byId.get(x)).filter((d): d is Draft => d !== undefined);
    const pending = footprintNodes.filter((d) => d.proof.kind === 'pending');
    if (pending.length > 0) {
      draft.flags.add('rests-on-pending');
      // Spec v4 B.5: TL102's "rests on a goal asserted as an axiom" became "rests on pending" (the integrator's decision
      // on 1a's open item, docs/slice1-plan.md section 8).
      draft.diagnostics.push({ code: 'TL102', severity: 'warning', message: `The proof rests on pending: ${pending.map((d) => d.id).join(', ')}.`, ...at });
    }
    // Self-evident = proved from no premise at all: no card, and no hidden assumption (`axiom:`, TL103) either.
    if (proof.kind === 'proved' && footprintNodes.length === 0 && !footprint.some((x) => x.startsWith('axiom:'))) draft.flags.add('self-evident');
    const onNodes = proof.kind === 'conditional' ? proof.on.map((x) => byId.get(x)).filter((d): d is Draft => d !== undefined) : [];
    const covered = new Set([...(draft.lean.presupposes ?? []), ...[...footprintNodes, ...onNodes].flatMap((d) => d.lean.presupposes ?? [])]);
    const uncovered = footprint.filter((x) => x.startsWith(PRESUPPOSITION_PREFIX) && !covered.has(x.slice(PRESUPPOSITION_PREFIX.length)));
    if (uncovered.length > 0) {
      draft.flags.add('existence-commitment');
      const names = uncovered.map((x) => x.slice(PRESUPPOSITION_PREFIX.length));
      draft.diagnostics.push({
        code: 'TL108',
        severity: 'info',
        message: `The proof needs ${names.join(', ')} (existence assumption${names.length === 1 ? '' : 's'}) that no statement it uses mentions.`,
        ...at,
      });
    }
    if (proof.kind === 'conditional') {
      draft.diagnostics.push({ code: 'TL102', severity: 'warning', message: `The proof is conditional on unproved cards: ${proof.on.join(', ')}.`, ...at });
    }
  }
  for (const draft of drafts) {
    if ((draft.lean.uses ?? []).some(needsEndorsement)) draft.flags.add('definitional-choice');
  }

  // ---- premises: TL122 an axiom's (before v4), TL007 dangling, TL121 other subject, TL015 cycles
  for (const draft of drafts) {
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    if (draft.type === 'AXIOM' && draft.premises.length > 0) {
      // Spec v4 A19 (slice 1b): only a proposition has arrows into it; the board does not draw these (subjectGraph).
      draft.diagnostics.push({ code: 'TL122', severity: 'info', message: AXIOM_PREMISES_MESSAGE, ...at });
    }
    for (const premise of draft.premises) {
      const target = byId.get(premise);
      if (!target) draft.diagnostics.push({ code: 'TL007', severity: 'warning', message: `Premise "${premise}" does not exist.`, ...at });
      else if (target.subject !== draft.subject) {
        draft.diagnostics.push({
          code: 'TL121',
          severity: 'warning',
          message: `Premise "${premise}" belongs to subject ${target.subject}: premises stay within one subject.`,
          ...at,
        });
      }
    }
  }
  const inCycle = new Set<string>();
  {
    const state = new Map<string, 'visiting' | 'done'>();
    const stack: string[] = [];
    /**
     * The arrows into a card, as the board draws them and the planner checks them (AR-3): an AXIOM's `premises:`,
     * written before v4, are no arrows (A19; TL122 reports them), so no cycle passes through them (slice 1f carry-over 1).
     */
    const arrowsInto = (id: string): readonly string[] => {
      const draft = byId.get(id);
      return draft === undefined || draft.type === 'AXIOM' ? [] : draft.premises;
    };
    const visit = (id: string) => {
      state.set(id, 'visiting');
      stack.push(id);
      for (const premise of arrowsInto(id)) {
        if (!byId.has(premise)) continue;
        const mark = state.get(premise);
        if (mark === 'visiting') for (const x of stack.slice(stack.indexOf(premise))) inCycle.add(x);
        else if (mark === undefined) visit(premise);
      }
      stack.pop();
      state.set(id, 'done');
    };
    for (const draft of drafts) if (!state.has(draft.id)) visit(draft.id);
  }
  for (const draft of drafts) {
    if (!inCycle.has(draft.id)) continue;
    draft.diagnostics.push({
      code: 'TL015',
      severity: 'warning',
      message: 'This card is part of a premise cycle: a card cannot (indirectly) support itself.',
      file: draft.file.path,
      range: draft.block.range,
      nodeId: draft.id,
    });
  }

  // ---- nodes
  const nodes = new Map<string, ModelNode>();
  for (const draft of drafts) {
    const block = draft.block;
    const fields = block.fields;
    const ext: Record<string, string> = {};
    for (const key of Object.keys(block.extensions).sort()) ext[key] = (block.extensions[key] ?? []).join('\n');
    const wordedBy = fields.wordedBy ?? 'user';
    const node: TlNode = {
      id: draft.id,
      type: draft.type,
      role: 'node',
      subject: draft.subject,
      naturalName: fields.naturalName ?? '',
      ...(fields.rationale !== undefined ? { rationale: fields.rationale } : {}),
      ...(block.body !== undefined ? { body: block.body } : {}),
      ...(fields.asserted !== undefined ? { asserted: fields.asserted } : {}),
      ...(fields.stance !== undefined ? { stance: fields.stance } : {}),
      ...(fields.source !== undefined ? { source: fields.source } : {}),
      premises: [...draft.premises],
      // AR-5: the parser drops the mark when premises are declared (TL023); a hand-built block is held to the same rule.
      ...(draft.followsFrom && draft.premises.length === 0 ? { fromNothing: true } : {}),
      ...(fields.supersedes !== undefined ? { supersedes: fields.supersedes } : {}),
      ...(fields.refines !== undefined ? { refines: fields.refines } : {}),
      provenance: {
        wordedBy,
        endorsed: wordedBy === 'user',
        origin: fields.origin ?? 'user',
        ...(fields.session !== undefined ? { session: fields.session } : {}),
      },
      ext,
      loc: { file: draft.file.path, range: block.range, markupVersion: block.version },
      lean: draft.lean,
      status: {
        formal: draft.formal,
        proof: draft.proof,
        certificates: { consistency: 'none', nonVacuity: 'none' },
        flags: sortFlags(draft.flags),
      },
    };
    nodes.set(draft.id, {
      node,
      file: draft.file.path,
      block,
      ...(draft.statementDecl ? { statementDecl: { file: draft.statementDecl.file.path, decl: draft.statementDecl.decl } } : {}),
      ...(draft.holdsDecl ? { holdsDecl: { file: draft.holdsDecl.file.path, decl: draft.holdsDecl.decl } } : {}),
    });
  }

  // ---- edges and mismatches
  const freshFiles = factsIndex.freshFiles();
  const edges = computeEdges({ nodes: [...nodes.values()].map((n) => n.node), ownerOfDecl, declFacts: factsIndex.usable, freshFiles });

  // ---- direct(v) on the card (spec v4.1 B.2, BD-7; slice 1d): how it was found, the cross-check, and out-of-date facts
  for (const draft of drafts) {
    const walk = edges.walks.get(draft.id);
    const entry = nodes.get(draft.id);
    if (!walk || !entry) continue;
    // A proof that passes through a declaration of a file that changed since the check (a lemma, an instance) was
    // checked against its old version: its facts are out of date too (BD-6: the last status, dimmed; no glow, no band).
    if (walk.outdated) draft.flags.add('stale');
    const unseen = edges.unseen.get(draft.id) ?? [];
    if (unseen.length > 0) {
      draft.flags.add('uses-unseen');
      draft.diagnostics.push({
        code: 'TL123',
        severity: 'warning',
        message: `The proof uses ${unseen.map((id) => `"${id}"`).join(', ')} in a way the arrows do not show: no card it uses directly rests on ${unseen.length === 1 ? 'it' : 'them'}.`,
        file: draft.file.path,
        range: draft.block.range,
        nodeId: draft.id,
      });
    }
    entry.node.status.direct = { ids: [...walk.ids], from: walk.from, ...(unseen.length > 0 ? { unseen: [...unseen] } : {}) };
  }

  // ---- established (spec v4 B.5, BD-6; docs/slice1-plan.md section 8: fresh facts and no TL114, S-3 and S-9)
  markEstablished(drafts, byId, edges.direct);
  for (const draft of drafts) {
    const entry = nodes.get(draft.id);
    if (entry) entry.node.status.flags = sortFlags(draft.flags);
  }

  // ---- vocabulary usedBy and definitional choices
  const itemsByName = new Map(vocab.items.map((item) => [item.name, item]));
  for (const { node } of nodes.values()) {
    for (const name of [...(node.lean.uses ?? []), ...(node.lean.presupposes ?? [])]) {
      const item = itemsByName.get(name);
      if (item && !item.usedBy.includes(node.id)) item.usedBy.push(node.id);
    }
    for (const name of node.lean.uses ?? []) {
      const item = itemsByName.get(name);
      if (item && needsEndorsement(item.name) && !item.flags.includes('definitional-choice')) item.flags.push('definitional-choice');
    }
  }

  // ---- markup diagnostics (with node ids), TL118, everything else
  const blockAt = (file: ParsedFile, offset: number) => {
    // The last block starting at or before `offset` (blocks never overlap), if it contains it.
    const block = file.blocks[firstStartingAt(file.blocks, offset + 1) - 1];
    return block !== undefined && offset >= block.span.start && offset < block.span.end ? block : undefined;
  };
  for (const file of files) {
    for (const d of file.diagnostics) {
      const block = blockAt(file, d.span.start);
      const resolved = block ? blockIds.get(block) : undefined;
      const nodeId = resolved !== undefined && nodes.has(resolved) ? resolved : d.nodeId !== undefined && nodes.has(d.nodeId) ? d.nodeId : undefined;
      diagnostics.push({ code: d.code, severity: d.severity, message: d.message, file: file.path, range: d.range, ...(nodeId !== undefined ? { nodeId } : {}) });
    }
  }
  const rootPath = libraryRootFile(library);
  const root = fileMap.get(rootPath);
  if (root) {
    const reached = new Set<string>([rootPath]);
    const queue = [root];
    while (queue.length > 0) {
      const file = queue.shift() as ParsedFile;
      for (const module of file.imports) {
        const path = pathOfModule(module);
        const target = fileMap.get(path);
        if (target && !reached.has(path)) {
          reached.add(path);
          queue.push(target);
        }
      }
    }
    for (const file of files) {
      if (reached.has(file.path) || moduleOfPath(file.path) === undefined) continue;
      diagnostics.push({
        code: 'TL118',
        severity: 'warning',
        message: `This file is not imported by ${rootPath}, so Lean never checks it.`,
        file: file.path,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      });
    }
  }
  if (input.lakefile) {
    const tl110 = autoImplicitDiagnostic(input.lakefile);
    if (tl110) diagnostics.push(tl110);
  }
  // Do not repeat TL011 when the markup layer already reported it for the block.
  const markupTl011 = new Set<MarkupBlock>();
  for (const file of files) {
    for (const d of file.diagnostics) {
      if (d.code !== 'TL011') continue;
      const block = blockAt(file, d.span.start);
      if (block) markupTl011.add(block);
    }
  }
  for (const draft of drafts) {
    for (const d of draft.diagnostics) if (!(d.code === 'TL011' && markupTl011.has(draft.block))) diagnostics.push(d);
  }
  diagnostics.push(...vocab.diagnostics, ...edges.diagnostics);

  // ---- subjects
  const subjects: SubjectInfo[] = subjectNames.map((name) => ({
    name,
    nodeCount: drafts.filter((d) => d.subject === name).length,
    files: files.filter((f) => subjectOfFile.get(f.path) === name).map((f) => f.path),
  }));

  const model: ProjectModel = {
    library,
    subjects,
    nodes,
    files: fileMap,
    ...(input.facts ? { facts: input.facts } : {}),
    freshFiles: factsIndex.freshFiles(),
    vocabulary: vocab.items,
    diagnostics: dedupeDiagnostics(diagnostics).sort(compareDiagnostics),
    declFacts: factsIndex.usable,
    ownerOfDecl,
  };
  internals.set(model, { edges });
  return model;
}

/**
 * The `established` flag (the green glow, spec v4 BD-6 and B.5): a PROPOSITION whose proof is `proved` (no hypotheses),
 * uses no `sorry` and no hidden axiom (no `axiom:` entry, TL103), and rests only on AXIOM cards whose `.holds` is an
 * axiom (`assumed`; presuppositions are allowed), never on a pending proposition. Following the spec review
 * (docs/slice1-plan.md section 8, S-3 and S-9), the facts must also be current and every `.holds` must state its
 * statement: neither the card, nor a card in its footprint, nor any card its proof reaches through verified edges
 * (direct(v), transitively) is stale, not checked, or flagged holds-mismatch (TL114). Nor `uses-unseen` (1d fixer):
 * B.2's cross-check has shown that card's direct(v) to be incomplete (the fallback over the references missed a use),
 * so these conditions cannot be confirmed over it.
 */
function markEstablished(drafts: readonly Draft[], byId: ReadonlyMap<string, Draft>, direct: ReadonlyMap<string, readonly string[]>): void {
  const unsure = (d: Draft) => d.flags.has('stale') || d.flags.has('not-checked') || d.flags.has('holds-mismatch') || d.flags.has('uses-unseen');
  for (const draft of drafts) {
    const proof = draft.proof;
    if (draft.type !== 'PROPOSITION' || proof.kind !== 'proved' || draft.flags.has('uses-sorry') || unsure(draft)) continue;
    if (proof.footprint.some((x) => x.startsWith('axiom:'))) continue;
    const rests = proof.footprint.filter((x) => !x.startsWith(PRESUPPOSITION_PREFIX)).map((x) => byId.get(x));
    if (rests.some((d) => d === undefined || d.type !== 'AXIOM' || d.proof.kind !== 'assumed' || unsure(d))) continue;
    const seen = new Set<string>([draft.id]);
    const queue = [...(direct.get(draft.id) ?? [])];
    let reachedUnsure = false;
    while (queue.length > 0 && !reachedUnsure) {
      const id = queue.shift() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const used = byId.get(id);
      if (used === undefined || unsure(used)) reachedUnsure = true;
      else queue.push(...(direct.get(id) ?? []));
    }
    if (!reachedUnsure) draft.flags.add('established');
  }
}

/** One line for the history and toasts (exported for the planner). */
export function sentenceLabel(text: string): string {
  return cutText(text, 60);
}
