/**
 * Which Lean facts the board may use (docs/m1-plan.md section 6.3, "Which facts"):
 *
 *  - a FRESH file (its module is `fresh` and its hash equals the facts' `sourceSha256`) uses its facts fully;
 *  - a STALE file (the hash differs, or the module went stale during the refresh) keeps a declaration's previous facts
 *    BY NAME while the declaration's current syntactic keyword agrees with the facts' kind (positions are not used);
 *  - an UNCHECKED file (failed / dependency-failed / not-built module, a file the facts do not know, or no facts at
 *    all) uses no facts: only the syntactic keyword counts.
 */
import type { DeclFacts, LeanDeclKind, LeanFacts, ModuleFacts } from '../facts.js';
import type { DeclInfo, DeclKeyword, ParsedFile } from '../markup/types.js';

export type FileFactsState = 'fresh' | 'stale' | 'unchecked';

export interface FileFactsInfo {
  state: FileFactsState;
  module?: ModuleFacts;
  /** The file's current hash differs from the hash the facts were computed from. */
  hashDiffers: boolean;
}

/** The fact kind a syntactic keyword corresponds to. */
export function keywordKind(keyword: DeclKeyword): LeanDeclKind {
  switch (keyword) {
    case 'axiom':
      return 'axiom';
    case 'theorem':
    case 'lemma':
      return 'theorem';
    case 'def':
    case 'abbrev':
      return 'def';
    case 'opaque':
      return 'opaque';
    case 'instance':
      return 'instance';
    case 'structure':
      return 'structure';
    case 'inductive':
    case 'coinductive':
      return 'inductive';
    case 'class':
    case 'class inductive':
    case 'class abbrev':
      return 'class';
    default:
      return 'other';
  }
}

/** A stale file keeps a declaration's facts while its current keyword still says the same kind of declaration. */
export function kindsAgree(keyword: DeclKeyword, kind: LeanDeclKind | undefined): boolean {
  if (kind === undefined) return true;
  const expected = keywordKind(keyword);
  if (expected === kind) return true;
  // Lean prints instances as theorems/defs and class abbrevs as defs; the semantic layer usually fixes instances up.
  if (keyword === 'instance') return kind === 'theorem' || kind === 'def';
  if (keyword === 'class abbrev') return kind === 'def';
  if (keyword === 'class' || keyword === 'class inductive') return kind === 'structure' || kind === 'inductive';
  return false;
}

export class FactsIndex {
  /** Per model file. */
  readonly files = new Map<string, FileFactsInfo>();
  /** Usable facts by fully-qualified name (fresh files fully, stale files by name). */
  readonly usable = new Map<string, DeclFacts>();
  /** Usable facts by `file` + syntactic declaration index (also covers anonymous instances matched by start line). */
  private readonly bySyntactic = new Map<string, DeclFacts>();
  /** Facts decls of fresh files that no syntactic declaration matched (e.g. constructors), per file. */
  readonly unmatched = new Map<string, DeclFacts[]>();

  constructor(
    files: readonly ParsedFile[],
    fileHashes: Readonly<Record<string, string>>,
    readonly facts: LeanFacts | undefined,
  ) {
    const modulesByFile = new Map<string, ModuleFacts>();
    for (const module of facts?.modules ?? []) if (!modulesByFile.has(module.file)) modulesByFile.set(module.file, module);
    for (const file of files) {
      const module = facts ? modulesByFile.get(file.path) : undefined;
      if (!module) {
        this.files.set(file.path, { state: 'unchecked', hashDiffers: false });
        continue;
      }
      const hashDiffers = fileHashes[file.path] !== module.sourceSha256;
      let state: FileFactsState;
      if (module.state === 'fresh') state = hashDiffers ? 'stale' : 'fresh';
      else if (module.state === 'stale') state = 'stale';
      else state = 'unchecked';
      this.files.set(file.path, { state, module, hashDiffers });
    }

    const factsByFile = new Map<string, DeclFacts[]>();
    for (const decl of facts?.decls ?? []) {
      const list = factsByFile.get(decl.file) ?? [];
      list.push(decl);
      factsByFile.set(decl.file, list);
    }
    for (const file of files) {
      const state = this.files.get(file.path)?.state ?? 'unchecked';
      const list = factsByFile.get(file.path) ?? [];
      if (state === 'unchecked' || list.length === 0) continue;
      const byName = new Map<string, DeclFacts>();
      for (const decl of list) if (!byName.has(decl.name)) byName.set(decl.name, decl);
      const matched = new Set<DeclFacts>();
      file.decls.forEach((decl, index) => {
        let found: DeclFacts | undefined;
        if (decl.fullName) found = byName.get(decl.fullName);
        else if (state === 'fresh' && decl.keyword === 'instance') {
          // Anonymous instances: Lean names them (`instNonemptyCharacter`); match by the declaration's start line.
          found = list.find((f) => !matched.has(f) && f.range.start.line === decl.range.start.line && (f.kind === undefined || kindsAgree('instance', f.kind)));
        }
        if (!found) return;
        if (state === 'stale' && !kindsAgree(decl.keyword, found.kind)) return;
        matched.add(found);
        this.bySyntactic.set(`${file.path}#${index}`, found);
        if (!this.usable.has(found.name)) this.usable.set(found.name, found);
      });
      if (state === 'fresh') {
        const rest: DeclFacts[] = [];
        for (const decl of list) {
          if (matched.has(decl)) continue;
          if (!this.usable.has(decl.name)) this.usable.set(decl.name, decl);
          rest.push(decl);
        }
        if (rest.length > 0) this.unmatched.set(file.path, rest);
      }
    }
  }

  stateOf(path: string): FileFactsState {
    return this.files.get(path)?.state ?? 'unchecked';
  }

  isFresh(path: string): boolean {
    return this.stateOf(path) === 'fresh';
  }

  /** Usable facts for a syntactic declaration of a file. */
  factsFor(file: ParsedFile, decl: DeclInfo): DeclFacts | undefined {
    const index = file.decls.indexOf(decl);
    return index < 0 ? undefined : this.bySyntactic.get(`${file.path}#${index}`);
  }

  /** Files whose facts can be trusted fully (fresh). */
  freshFiles(): Set<string> {
    const out = new Set<string>();
    for (const [path, info] of this.files) if (info.state === 'fresh') out.add(path);
    return out;
  }
}
