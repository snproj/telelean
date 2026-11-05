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
  ProofStatus,
  Range,
  Severity,
  StatusFlag,
  SubjectInfo,
  TlNode,
} from '../model.js';
import type { DeclInfo, MarkupBlock, ParsedFile } from '../markup/types.js';
import { isSubjectName, libraryRootFile, moduleOfPath, pathOfModule, subjectOfPath } from '../paths.js';
import { computeEdges, type EdgeResult } from './edges.js';
import { FactsIndex } from './factsIndex.js';
import type { ModelNode, ProjectInput, ProjectModel } from './types.js';
import { blankComments, cutText, LineMap, normalizeWhitespace, namespaceTable, rangeContains, splitTopLevelArrows } from './text.js';
import { anonymousInstanceName, buildVocabulary, resolveName, shapeOf, signatureText, type VocabCandidate, type VocabularyResult } from './vocabulary.js';
import { autoImplicitDiagnostic } from './lakefile.js';
import { noRationaleMessage } from '../markup/values.js';

/** Canonical order of status flags (deterministic output). */
const FLAG_ORDER: readonly StatusFlag[] = [
  'no-rationale',
  'claimed',
  'missing-holds',
  'provable-assumption',
  'proved-goal',
  'uses-sorry',
  'holds-mismatch',
  'rests-on-claimed',
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
  const edges = computeEdges({ nodes: [...model.nodes.values()].map((n) => n.node), ownerOfDecl: model.ownerOfDecl, declFacts: model.declFacts });
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

function codePieces(draft: Draft): CodePiece[] {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement) return [];
  const stmtPiece: CodePiece = { file: statement.file, start: statement.decl.span.start, end: statement.decl.span.end, decls: [draft.statement] };
  if (!holds || !draft.holds) return [stmtPiece];
  const holdsPiece: CodePiece = { file: holds.file, start: holds.decl.span.start, end: holds.decl.span.end, decls: [draft.holds] };
  if (holds.file.path === statement.file.path && holds.decl.span.start >= statement.decl.span.end) {
    const from = statement.decl.span.end;
    const to = holds.decl.span.start;
    const quiet =
      !startsBetween(holds.file.decls, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(holds.file.text.slice(from, to)).trim() === '';
    if (quiet) return [{ file: statement.file, start: statement.decl.span.start, end: holds.decl.span.end, decls: [draft.statement, draft.holds] }];
  }
  return [stmtPiece, holdsPiece];
}

export function buildProject(input: ProjectInput): ProjectModel {
  const library = input.library;
  const files = [...input.files].sort(byPath);
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
      drafts.push({
        id,
        file,
        block,
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
    if (draft.type === 'ASSUMPTION' && block.fields.rationale === undefined) {
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

    // code and codeLoc
    const pieces = draft.statementFound ? codePieces(draft) : [];
    if (pieces.length > 0) {
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
    if (pieces.length > 0 && pieces.every((p) => factsIndex.isFresh(p.file.path))) {
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
      if (draft.type === 'ASSUMPTION') {
        draft.flags.add('missing-holds');
        draft.diagnostics.push({
          code: 'TL117',
          severity: 'warning',
          message: `This assumption has no \`axiom ${short}.holds : ${short}\`, so proofs cannot use it.`,
          ...at,
        });
      }
      continue;
    }
    const holdsFacts = draft.holdsFacts;
    if (hk === 'axiom') {
      if (draft.type === 'ASSUMPTION') draft.proof = { kind: 'assumed' };
      else if (draft.type === 'DERIVATION') {
        draft.proof = { kind: 'pending-promotion' };
        draft.flags.add('claimed');
      } else {
        draft.proof = { kind: 'assumed' };
        draft.diagnostics.push({ code: 'TL116', severity: 'warning', message: `This goal is asserted as an axiom (${draft.holds}): make it an Assumption?`, ...at });
      }
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
    if (draft.type === 'ASSUMPTION') {
      draft.flags.add('provable-assumption');
      draft.diagnostics.push({ code: 'TL106', severity: 'info', message: 'This assumption has a proof: make it a Derivation?', ...at });
    } else if (draft.type === 'GOAL') {
      draft.flags.add('proved-goal');
      draft.diagnostics.push({ code: 'TL105', severity: 'info', message: 'This goal is already proved: make it a Derivation?', ...at });
    }
  }

  // ---- flags that depend on other nodes
  for (const draft of drafts) {
    const proof = draft.proof;
    if (proof.kind !== 'proved' && proof.kind !== 'conditional') continue;
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    const footprint = proof.kind === 'proved' ? proof.footprint : (proof.footprint ?? []);
    const footprintNodes = footprint.map((x) => byId.get(x)).filter((d): d is Draft => d !== undefined);
    if (footprintNodes.some((d) => d.proof.kind === 'pending-promotion')) draft.flags.add('rests-on-claimed');
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
    const goals = footprintNodes.filter((d) => d.type === 'GOAL').map((d) => d.id);
    if (goals.length > 0) {
      draft.diagnostics.push({ code: 'TL102', severity: 'warning', message: `The proof rests on a goal asserted as an axiom: ${goals.join(', ')}.`, ...at });
    }
  }
  for (const draft of drafts) {
    if ((draft.lean.uses ?? []).some((name) => vocab.kindOf.get(name) === 'definition')) draft.flags.add('definitional-choice');
  }

  // ---- premises: TL007 dangling, TL121 other subject, TL015 cycles
  for (const draft of drafts) {
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    for (const premise of draft.block.fields.premises ?? []) {
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
    const visit = (id: string) => {
      state.set(id, 'visiting');
      stack.push(id);
      for (const premise of byId.get(id)?.block.fields.premises ?? []) {
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
      premises: [...(fields.premises ?? [])],
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
  const edges = computeEdges({ nodes: [...nodes.values()].map((n) => n.node), ownerOfDecl, declFacts: factsIndex.usable });

  // ---- vocabulary usedBy and definitional choices
  const itemsByName = new Map(vocab.items.map((item) => [item.name, item]));
  for (const { node } of nodes.values()) {
    for (const name of [...(node.lean.uses ?? []), ...(node.lean.presupposes ?? [])]) {
      const item = itemsByName.get(name);
      if (item && !item.usedBy.includes(node.id)) item.usedBy.push(node.id);
    }
    for (const name of node.lean.uses ?? []) {
      const item = itemsByName.get(name);
      if (item && item.kind === 'definition' && !item.flags.includes('definitional-choice')) item.flags.push('definitional-choice');
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

/** One line for the history and toasts (exported for the planner). */
export function sentenceLabel(text: string): string {
  return cutText(text, 60);
}
