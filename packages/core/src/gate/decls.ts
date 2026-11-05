/**
 * Declaration tables the gate rules compare (docs/m2-plan.md section 3.3): every named declaration of a model's parsed
 * files with its source text (docstring and attributes included), the facts Lean reported for it, and what counts as
 * a proof. Cached per model (models are immutable).
 */
import type { DeclFacts } from '../facts.js';
import type { DeclInfo, ParsedFile } from '../markup/types.js';
import type { ProjectModel } from '../project/types.js';
import { normalizeWhitespace } from '../project/text.js';
import { anonymousInstanceName, signatureText } from '../project/vocabulary.js';

export interface DeclEntry {
  /** Fully-qualified name (Lean's automatic name for an anonymous instance, as the board computes it). */
  name: string;
  file: ParsedFile;
  decl: DeclInfo;
  /** The declaration's source text, from its docstring/attributes to its last line. */
  text: string;
}

export interface DeclTables {
  /** Named declarations, first occurrence wins, files in path order. */
  byName: Map<string, DeclEntry>;
  /** Source texts of the `example`s (they have no name), in file order. */
  examples: Array<{ file: ParsedFile; decl: DeclInfo; text: string }>;
  /** Every name the model knows: syntactic declarations and facts. */
  known: Set<string>;
  /** Names of the computed vocabulary items. */
  vocabulary: Set<string>;
}

const cache = new WeakMap<ProjectModel, DeclTables>();

const byPath = (a: ParsedFile, b: ParsedFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function declTables(model: ProjectModel): DeclTables {
  const cached = cache.get(model);
  if (cached) return cached;
  const byName = new Map<string, DeclEntry>();
  const examples: DeclTables['examples'] = [];
  for (const file of [...model.files.values()].sort(byPath)) {
    for (const decl of file.decls) {
      if (decl.keyword === 'mutual') continue;
      const text = file.text.slice(decl.span.start, decl.span.end);
      if (decl.keyword === 'example') {
        examples.push({ file, decl, text });
        continue;
      }
      const name = decl.fullName ?? (decl.keyword === 'instance' ? anonymousInstanceName(file, decl) : undefined);
      if (name === undefined || byName.has(name)) continue;
      byName.set(name, { name, file, decl, text });
    }
  }
  const known = new Set<string>([...byName.keys(), ...model.declFacts.keys()]);
  const tables: DeclTables = { byName, examples, known, vocabulary: new Set(model.vocabulary.map((item) => item.name)) };
  cache.set(model, tables);
  return tables;
}

/** Lean's facts for a declaration: by name, or for an anonymous instance by its file and start line. */
export function factsOf(model: ProjectModel, name: string, entry?: DeclEntry): DeclFacts | undefined {
  const direct = model.declFacts.get(name);
  if (direct || entry === undefined || entry.decl.keyword !== 'instance' || entry.decl.fullName !== undefined) return direct;
  for (const facts of model.declFacts.values()) {
    if (facts.file === entry.file.path && facts.range.start.line === entry.decl.range.start.line && (facts.kind === 'instance' || facts.kind === undefined)) return facts;
  }
  return undefined;
}

/** `instance : Nonempty T := T.exists`: the presupposition pattern (hidden from the vocabulary, never a proof to judge). */
export function isPresuppositionInstance(model: ProjectModel, entry: DeclEntry | undefined, facts: DeclFacts | undefined): boolean {
  const instance = facts?.kind === 'instance' || entry?.decl.keyword === 'instance';
  if (!instance) return false;
  const type = facts?.type !== undefined ? normalizeWhitespace(facts.type) : entry ? signatureText(entry.file, entry.decl)?.type : undefined;
  if (type === undefined || !/^Nonempty\s+\S+$/.test(normalizeWhitespace(type))) return false;
  const vocabulary = declTables(model).vocabulary;
  return !vocabulary.has(facts?.name ?? '') && !vocabulary.has(entry?.name ?? '');
}

/**
 * A proof (plan 3.3 `proof-before-freeze`): a declaration with a value whose type's sort is `Prop` (a theorem, a
 * Prop-valued def/abbrev/instance/opaque), except the presupposition instance; without facts, a `theorem`/`lemma`.
 */
export function isProof(model: ProjectModel, entry: DeclEntry | undefined, facts: DeclFacts | undefined): boolean {
  if (facts?.kind !== undefined) {
    if (facts.kind === 'axiom' || facts.kind === 'structure' || facts.kind === 'inductive' || facts.kind === 'class') return false;
    const propValued = facts.kind === 'theorem' || (facts.typeSort !== undefined && normalizeWhitespace(facts.typeSort) === 'Prop');
    return propValued && !isPresuppositionInstance(model, entry, facts);
  }
  const keyword = entry?.decl.keyword;
  return keyword === 'theorem' || keyword === 'lemma';
}

/** Is the declaration an axiom (facts kind, else the keyword)? */
export function isAxiom(entry: DeclEntry | undefined, facts: DeclFacts | undefined): boolean {
  if (facts?.kind !== undefined) return facts.kind === 'axiom';
  return entry?.decl.keyword === 'axiom';
}

/** Every axiom the model declares (facts, plus syntactic `axiom`s without facts), in a stable order. */
export function axiomNames(model: ProjectModel): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [name, entry] of declTables(model).byName) {
    if (isAxiom(entry, factsOf(model, name, entry)) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  for (const [name, facts] of model.declFacts) {
    if (facts.kind === 'axiom' && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
