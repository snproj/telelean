/**
 * The computed Vocabulary group (D-3, docs/m1-plan.md section 6.4): every declaration of a subject's modules that is
 * bound to no node, classified by the simple shape check, from Lean's facts where usable and from the declaration
 * text otherwise (syntactic mode).
 */
import type { DeclFacts, LeanDeclKind } from '../facts.js';
import type { BoardDiagnostic, VocabFlag, VocabItem, VocabKind } from '../model.js';
import type { DeclInfo, DeclKeyword, ParsedFile } from '../markup/types.js';
import { keywordKind, type FactsIndex } from './factsIndex.js';
import {
  blankComments,
  identifierTokens,
  LineMap,
  normalizeWhitespace,
  parseBinders,
  resolutionCandidates,
  splitTopLevelArrows,
  topLevelColon,
} from './text.js';

/** Display order of the Vocabulary group. */
export const VOCAB_KIND_ORDER: readonly VocabKind[] = ['sort', 'predicate', 'function', 'constant', 'presupposition', 'definition', 'lemma', 'unmarked-axiom', 'other'];

/** What the classifier needs to know about one declaration. */
export interface DeclShape {
  /** Fully-qualified name. */
  name: string;
  kind: LeanDeclKind;
  /** The syntactic keyword, when the declaration is in the current text. */
  keyword?: DeclKeyword;
  /** Fully-qualified type (facts `#check`, or the qualified declaration text). */
  type?: string;
  /** Top-level arrow parts of the type, binders included. */
  parts: string[];
  /** The signature has implicit or instance binders (never a simple vocabulary shape). */
  implicitBinders: boolean;
  /** `#check type_of%` sort (facts) or inferred from the text. */
  typeSort?: string;
  /** Names the declaration refers to (facts refs, or resolved identifiers of the text). */
  mentions: string[];
  docstring?: string;
}

export interface VocabCandidate {
  shape: DeclShape;
  subject: string;
  file: ParsedFile;
  decl?: DeclInfo;
  facts?: DeclFacts;
  stale: boolean;
}

export interface VocabularyResult {
  /** Every subject's items, in subject order then display order. */
  items: VocabItem[];
  /** Fully-qualified name of every declaration that belongs to an item (the item itself and folded auxiliaries) -> item name. */
  itemOfName: Map<string, string>;
  /** Item kind by item name. */
  kindOf: Map<string, VocabKind>;
  /** Declarations that only re-export a presupposition (not listed). */
  hidden: Set<string>;
  /** Items declared with `axiom` (constants/functions declared with axiom assert existence: footprint `axiom:`). */
  declaredWithAxiom: Set<string>;
  diagnostics: BoardDiagnostic[];
}

/** Resolves a name written inside `namespace` against the known declaration names. */
export function resolveName(name: string, namespace: readonly string[], known: (fq: string) => boolean): string | undefined {
  for (const candidate of resolutionCandidates(name, namespace)) if (known(candidate)) return candidate;
  return undefined;
}

/** The signature text of a syntactic declaration: binders and type between the name and the value. */
export function signatureText(file: ParsedFile, decl: DeclInfo): { binders: string; type: string } | undefined {
  const start = decl.nameSpan?.end ?? decl.keywordSpan.end;
  const end = decl.valueStart ?? decl.span.end;
  if (end <= start) return undefined;
  const text = blankComments(file.text.slice(start, end));
  const colon = topLevelColon(text);
  if (colon < 0) return { binders: text.trim(), type: '' };
  return { binders: text.slice(0, colon).trim(), type: text.slice(colon + 1).trim() };
}

/** Replaces identifiers that resolve to known declarations by their fully-qualified names. */
export function qualifyText(text: string, namespace: readonly string[], known: (fq: string) => boolean): string {
  const tokens = identifierTokens(text);
  let out = '';
  let last = 0;
  for (const token of tokens) {
    const resolved = resolveName(token.text, namespace, known);
    out += text.slice(last, token.start) + (resolved ?? token.text);
    last = token.start + token.text.length;
  }
  return normalizeWhitespace(out + text.slice(last));
}

/** The shape of a declaration, from usable facts when present, else from its text. */
export function shapeOf(
  file: ParsedFile,
  decl: DeclInfo | undefined,
  facts: DeclFacts | undefined,
  name: string,
  known: (fq: string) => boolean,
): DeclShape {
  const keyword = decl?.keyword;
  const docstring = facts?.docstring ?? decl?.docstring;
  if (facts && facts.type !== undefined) {
    const type = normalizeWhitespace(facts.type);
    return {
      name,
      kind: keyword === 'instance' ? 'instance' : (facts.kind ?? (keyword ? keywordKind(keyword) : 'other')),
      ...(keyword ? { keyword } : {}),
      type,
      parts: splitTopLevelArrows(type),
      implicitBinders: /^∀\s*[{[⦃]/.test(type),
      ...(facts.typeSort !== undefined ? { typeSort: normalizeWhitespace(facts.typeSort) } : {}),
      mentions: facts.refs.map((r) => r.name),
      ...(docstring !== undefined ? { docstring } : {}),
    };
  }
  const kind: LeanDeclKind = keyword === 'instance' ? 'instance' : (facts?.kind ?? (keyword ? keywordKind(keyword) : 'other'));
  const namespace = decl?.namespace ?? [];
  const signature = decl ? signatureText(file, decl) : undefined;
  let parts: string[] = [];
  let implicitBinders = false;
  let type: string | undefined;
  if (signature) {
    const binders = signature.binders ? parseBinders(signature.binders) : [];
    const typeParts = signature.type ? splitTopLevelArrows(qualifyText(signature.type, namespace, known)) : [];
    if (binders === undefined) {
      implicitBinders = true;
      parts = typeParts;
    } else {
      for (const binder of binders) {
        if (!binder.explicit) implicitBinders = true;
        const binderType = qualifyText(binder.type, namespace, known);
        for (let i = 0; i < Math.max(1, binder.names.length); i++) parts.push(binderType);
      }
      parts.push(...typeParts);
    }
    if (parts.length > 0) type = parts.join(' → ');
  }
  const mentions: string[] = [];
  if (decl) {
    const body = blankComments(file.text.slice(decl.nameSpan?.end ?? decl.keywordSpan.end, decl.span.end));
    for (const token of identifierTokens(body)) {
      const resolved = resolveName(token.text, namespace, known);
      if (resolved && resolved !== name) mentions.push(resolved);
    }
  }
  return {
    name,
    kind,
    ...(keyword ? { keyword } : {}),
    ...(type !== undefined ? { type } : {}),
    parts,
    implicitBinders,
    mentions,
    ...(docstring !== undefined ? { docstring } : {}),
  };
}

const LOGICAL = /(^|[\s(])(∀|∃|¬|∧|∨|↔|=|≠|True|False)($|[\s)])/;

/** Syntactic guess of `typeSort` when Lean's is unavailable. */
function inferTypeSort(shape: DeclShape, sorts: ReadonlySet<string>, propHeads: ReadonlySet<string>): string | undefined {
  const type = shape.type;
  if (type === undefined) return undefined;
  if (type === 'Type') return 'Type 1';
  if (/^(Type|Sort)\b/.test(type)) return undefined;
  const last = shape.parts[shape.parts.length - 1] ?? '';
  if (last === 'Prop') return 'Type';
  if (shape.parts.every((p) => sorts.has(p))) return 'Type';
  if (/^Nonempty\b/.test(type)) return 'Prop';
  if (LOGICAL.test(type)) return 'Prop';
  const head = /^[^\s()]+/.exec(last)?.[0];
  if (head && propHeads.has(head)) return 'Prop';
  return undefined;
}

/** Lean's automatic name of an anonymous instance, e.g. `instNonemptyCharacter` for `Nonempty Character`. */
export function anonymousInstanceName(file: ParsedFile, decl: DeclInfo): string {
  const signature = signatureText(file, decl);
  const words = identifierTokens(signature?.type ?? '').map((t) => {
    const last = t.text.split('.').pop() ?? t.text;
    return last.charAt(0).toUpperCase() + last.slice(1);
  });
  const short = `inst${words.join('')}`;
  return decl.namespace.length > 0 ? `${decl.namespace.join('.')}.${short}` : short;
}

interface Classified {
  kind: VocabKind | 'hidden';
  arity?: number;
  presupposes?: string;
  flags: VocabFlag[];
  problem?: string;
}

function classify(
  candidate: VocabCandidate,
  sorts: ReadonlyMap<string, string | undefined>,
  propHeads: ReadonlySet<string>,
): Classified {
  const shape = candidate.shape;
  const sortNames = new Set(sorts.keys());
  const type = shape.type;
  const last = shape.parts[shape.parts.length - 1] ?? '';
  const args = shape.parts.slice(0, -1);
  const declaredWith = shape.kind === 'axiom' ? 'axiom' : 'opaque';
  const nonSort = args.filter((a) => !sortNames.has(a));

  const symbolShape = (): Classified | undefined => {
    if (last === 'Prop') {
      const flags: VocabFlag[] = [];
      let problem: string | undefined;
      if (nonSort.length > 0 || shape.implicitBinders) {
        flags.push('shape-violation');
        problem = `${shape.name} is a predicate over ${nonSort.length > 0 ? nonSort.join(', ') : 'implicit arguments'}, which ${nonSort.length === 1 ? 'is not a sort' : 'are not sorts'}: predicates take sorts (\`axiom T : Type\`) as arguments.`;
      }
      return { kind: 'predicate', arity: args.length, flags, ...(problem ? { problem } : {}) };
    }
    if (shape.parts.length > 0 && !shape.implicitBinders && shape.parts.every((p) => sortNames.has(p))) {
      const kind: VocabKind = shape.parts.length === 1 ? 'constant' : 'function';
      if (declaredWith === 'axiom') {
        return {
          kind,
          ...(kind === 'function' ? { arity: args.length } : {}),
          flags: ['shape-violation'],
          problem: `${shape.name} is declared with \`axiom\`, which asserts that such a ${kind === 'constant' ? 'thing' : 'function'} exists without showing it: declare it \`noncomputable opaque\` so its existence presupposition shows.`,
        };
      }
      return { kind, ...(kind === 'function' ? { arity: args.length } : {}), flags: [] };
    }
    return undefined;
  };

  switch (shape.kind) {
    case 'axiom': {
      if (type === 'Type') return { kind: 'sort', flags: [] };
      const nonempty = type ? /^Nonempty\s+(\S+)$/.exec(type) : null;
      if (nonempty && sortNames.has(nonempty[1] ?? '')) return { kind: 'presupposition', presupposes: nonempty[1] ?? '', flags: [] };
      if (shape.typeSort === 'Prop') return { kind: 'unmarked-axiom', flags: ['unmarked-assumption'] };
      const symbol = symbolShape();
      if (symbol) return symbol;
      if (shape.typeSort === undefined && inferTypeSort(shape, sortNames, propHeads) === 'Prop') return { kind: 'unmarked-axiom', flags: ['unmarked-assumption'] };
      return {
        kind: 'other',
        flags: ['shape-violation'],
        problem: `${shape.name} is an axiom of type ${type ?? '(unknown)'}: vocabulary axioms are sorts (\`axiom T : Type\`) or predicates ending in \`Prop\`.`,
      };
    }
    case 'opaque': {
      const symbol = symbolShape();
      if (symbol) return symbol;
      return {
        kind: 'other',
        flags: ['shape-violation'],
        problem: `${shape.name} has type ${type ?? '(unknown)'}: constants and functions range over the subject's sorts (\`axiom T : Type\`).`,
      };
    }
    case 'theorem':
      return { kind: 'lemma', flags: [] };
    case 'instance': {
      const nonempty = type ? /^Nonempty\s+(\S+)$/.exec(type) : null;
      const sort = nonempty?.[1];
      const presupposition = sort !== undefined ? sorts.get(sort) : undefined;
      if (presupposition !== undefined && shape.mentions.includes(presupposition)) return { kind: 'hidden', flags: [] };
      return { kind: 'definition', flags: [] };
    }
    case 'def':
    case 'structure':
    case 'inductive':
    case 'class':
      return { kind: 'definition', flags: [] };
    default:
      return { kind: 'other', flags: [] };
  }
}

/**
 * Classifies the candidates (all subjects at once, so a sort imported from another subject still counts as a sort)
 * and builds the items in display order.
 */
export function buildVocabulary(candidates: readonly VocabCandidate[], subjects: readonly string[]): VocabularyResult {
  const sorts = new Map<string, string | undefined>();
  for (const c of candidates) if (c.shape.kind === 'axiom' && c.shape.type === 'Type') sorts.set(c.shape.name, undefined);
  for (const c of candidates) {
    if (c.shape.kind !== 'axiom') continue;
    const m = c.shape.type ? /^Nonempty\s+(\S+)$/.exec(c.shape.type) : null;
    const sort = m?.[1];
    if (sort !== undefined && sorts.has(sort) && sorts.get(sort) === undefined) sorts.set(sort, c.shape.name);
  }
  // Heads that make an application a proposition (syntactic mode): predicates and Prop-valued definitions.
  const propHeads = new Set<string>();
  for (const c of candidates) {
    const last = c.shape.parts[c.shape.parts.length - 1];
    if (last === 'Prop') propHeads.add(c.shape.name);
  }

  const itemOfName = new Map<string, string>();
  const kindOf = new Map<string, VocabKind>();
  const hidden = new Set<string>();
  const declaredWithAxiom = new Set<string>();
  const diagnostics: BoardDiagnostic[] = [];
  const bySubject = new Map<string, VocabItem[]>();

  for (const c of candidates) {
    const result = classify(c, sorts, propHeads);
    if (result.kind === 'hidden') {
      hidden.add(c.shape.name);
      continue;
    }
    const kind = result.kind;
    const flags: VocabFlag[] = [...result.flags];
    if (c.stale) flags.push('stale');
    const lines = new LineMap(c.file.text);
    const range = c.decl ? c.decl.range : c.facts?.range;
    const code = c.decl
      ? c.file.text.slice(c.decl.span.start, c.decl.span.end)
      : c.facts
        ? c.file.text.slice(lines.offsetAt(c.facts.range.start), lines.offsetAt(c.facts.range.end))
        : undefined;
    const prefix = `${c.subject}.`;
    const gloss = c.shape.docstring?.trim();
    const item: VocabItem = {
      name: c.shape.name,
      shortName: c.shape.name.startsWith(prefix) && c.shape.name.length > prefix.length ? c.shape.name.slice(prefix.length) : c.shape.name,
      subject: c.subject,
      kind,
      ...(c.shape.type !== undefined ? { type: c.shape.type } : {}),
      ...(result.arity !== undefined ? { arity: result.arity } : {}),
      ...(gloss ? { gloss, glossBy: 'user' as const } : {}),
      ...(result.presupposes !== undefined ? { presupposes: result.presupposes } : {}),
      ...(kind === 'sort' && sorts.get(c.shape.name) !== undefined ? { presupposition: sorts.get(c.shape.name) as string } : {}),
      ...(range ? { loc: { file: c.file.path, range } } : {}),
      ...(code !== undefined ? { code } : {}),
      usedBy: [],
      flags,
    };
    itemOfName.set(item.name, item.name);
    kindOf.set(item.name, kind);
    if (c.shape.kind === 'axiom') declaredWithAxiom.add(item.name);
    const list = bySubject.get(c.subject) ?? [];
    list.push(item);
    bySubject.set(c.subject, list);
    if (kind === 'unmarked-axiom') {
      diagnostics.push({
        code: 'TL104',
        severity: 'warning',
        message: `${item.name} is a Prop-valued axiom without a card: a hidden assumption. Give it a block (an Axiom) or remove it.`,
        file: c.file.path,
        ...(range ? { range } : {}),
        vocab: item.name,
      });
    }
    if (result.problem) {
      diagnostics.push({ code: 'TL111', severity: 'warning', message: result.problem, file: c.file.path, ...(range ? { range } : {}), vocab: item.name });
    }
  }

  const items: VocabItem[] = [];
  for (const subject of subjects) {
    const list = bySubject.get(subject) ?? [];
    // Stable sort: display kind first, then the candidates' file/source order.
    const ranked = list.map((item, index) => ({ item, index }));
    ranked.sort((a, b) => VOCAB_KIND_ORDER.indexOf(a.item.kind) - VOCAB_KIND_ORDER.indexOf(b.item.kind) || a.index - b.index);
    items.push(...ranked.map((r) => r.item));
  }
  return { items, itemOfName, kindOf, hidden, declaredWithAxiom, diagnostics };
}
