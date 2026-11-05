/**
 * Who uses a declaration (D-11 kind changes, D-18 deletes): from Lean's references (`DeclFacts.refs`, transitively),
 * plus, while some file is not freshly checked, a syntactic scan for the name in the declarations' text (so a use
 * typed since the last check still counts as a dependent and nothing that others use is removed silently).
 */
import type { DeclInfo, ParsedFile } from '../markup/types.js';
import type { ProjectModel } from '../project/types.js';
import { identifierTokens } from '../project/text.js';
import { candidatesOf, declBody, openedNamespaces } from '../project/textRefs.js';
import { resolveName } from '../project/vocabulary.js';

export interface UsersOptions {
  /** Also the users of the users, and so on (default true). */
  transitive?: boolean;
}

/** Declarations whose facts refs name one of `targets` (closed under "uses a member" unless not transitive; BFS order). */
export function factUsers(model: ProjectModel, targets: readonly string[], exclude: ReadonlySet<string>, options: UsersOptions = {}): string[] {
  const transitive = options.transitive ?? true;
  const users = new Map<string, string[]>();
  for (const [name, facts] of model.declFacts) {
    for (const ref of facts.refs) {
      const list = users.get(ref.name) ?? [];
      if (!list.includes(name)) list.push(name);
      users.set(ref.name, list);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>([...targets, ...exclude]);
  const queue = [...targets];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    for (const user of users.get(name) ?? []) {
      if (seen.has(user)) continue;
      seen.add(user);
      out.push(user);
      if (transitive) queue.push(user);
    }
  }
  return out;
}

/**
 * Declarations whose text mentions one of `targets`, transitively unless not `transitive`. A token counts when it
 * resolves to a target through the declaration's namespaces or the namespaces `open`ed before it, or when it has at
 * least two components and a target ends with it (e.g. `cynder_dark_past.holds`, however it was brought into scope).
 */
export function textUsers(model: ProjectModel, targets: readonly string[], exclude: ReadonlySet<string>, options: UsersOptions = {}): string[] {
  const transitive = options.transitive ?? true;
  const decls: Array<{ name: string; file: ParsedFile; decl: DeclInfo; opened: string[] }> = [];
  for (const file of model.files.values()) {
    const opensAt = openedNamespaces(file);
    for (const decl of file.decls) if (decl.fullName) decls.push({ name: decl.fullName, file, decl, opened: opensAt(decl.span.start) });
  }
  const out: string[] = [];
  const found = new Set<string>(targets);
  /** Dotted suffixes (two components or more) of the found names. */
  const suffixes = new Set<string>();
  const addSuffixes = (name: string) => {
    const parts = name.split('.');
    for (let i = 0; i + 2 <= parts.length; i++) suffixes.add(parts.slice(i).join('.'));
  };
  for (const target of targets) addSuffixes(target);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { name, file, decl, opened } of decls) {
      if (found.has(name) || exclude.has(name)) continue;
      const mentions = identifierTokens(declBody(file, decl)).some((t) => {
        let text = t.text;
        for (;;) {
          if (text.includes('.') && suffixes.has(text.startsWith('_root_.') ? text.slice('_root_.'.length) : text)) return true;
          if (candidatesOf(text, decl.namespace, opened).some((c) => found.has(c))) return true;
          if (resolveName(text, decl.namespace, (n) => found.has(n))) return true;
          const dot = text.lastIndexOf('.');
          if (dot < 0) return false;
          text = text.slice(0, dot);
        }
      });
      if (mentions) {
        out.push(name);
        if (transitive) {
          found.add(name);
          addSuffixes(name);
          grew = true;
        }
      }
    }
    if (!transitive) break;
  }
  return out;
}

/** True when every model file is freshly checked (the facts see every use). */
export function allFresh(model: ProjectModel): boolean {
  return model.facts !== undefined && [...model.files.keys()].every((p) => model.freshFiles.has(p));
}

/** Users of `targets` (facts first, then text-only finds while the facts are not fresh everywhere). */
export function usersOf(model: ProjectModel, targets: readonly string[], exclude: ReadonlySet<string>, options: UsersOptions = {}): { all: string[]; fromFacts: string[] } {
  const fromFacts = factUsers(model, targets, exclude, options);
  if (allFresh(model)) return { all: fromFacts, fromFacts };
  const all = [...fromFacts];
  const transitive = options.transitive ?? true;
  for (const name of textUsers(model, transitive ? [...targets, ...fromFacts] : targets, exclude, options)) if (!all.includes(name)) all.push(name);
  return { all, fromFacts };
}

/**
 * Declarations whose `#print axioms` lists the axiom `holds` although no reference chain reaches it (e.g. a use
 * through notation): removing the axiom breaks them too.
 */
export function axiomListUsers(model: ProjectModel, holds: string, known: readonly string[], exclude: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const facts of model.declFacts.values()) {
    if (facts.name === holds || exclude.has(facts.name) || known.includes(facts.name)) continue;
    if ((facts.axioms ?? []).includes(holds)) out.push(facts.name);
  }
  return out;
}

/** Where a declaration is (syntactic first, else its facts). */
export function locateDecl(model: ProjectModel, name: string): { file: string; decl?: DeclInfo } | undefined {
  for (const file of model.files.values()) {
    const decl = file.decls.find((d) => d.fullName === name);
    if (decl) return { file: file.path, decl };
  }
  const facts = model.declFacts.get(name);
  return facts ? { file: facts.file } : undefined;
}
