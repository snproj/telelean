/**
 * M2 carry-over 1 (docs/m2-plan.md section 9 WP1): `LeanBinding.externalUsers`, the users of a card's statement and
 * `.holds` that its board does not show as cards: declarations without a card (any subject) and other subjects' cards.
 * Found from Lean's references (`DeclFacts.refs`), followed through untracked declarations the way the verified
 * edges are (stopping at the first card), plus, while some file is not freshly checked, the same generous text scan
 * as D-11's `usersOf` (so a use typed since the last check still counts). One index per model, so a board with
 * thousands of cards stays linear.
 */
import { holdsName } from '../facts.js';
import type { ExternalUser, TlNode } from '../model.js';
import { candidatesOf, declBody, openedNamespaces } from './textRefs.js';
import { identifierTokens } from './text.js';
import type { ProjectModel } from './types.js';

interface UsersIndex {
  /** Card id -> the declarations it owns (statement, `.holds`, extra pinned names). */
  owned: Map<string, Set<string>>;
  /** name -> declarations whose facts refs name it. */
  facts: Map<string, Set<string>>;
  /** Text scan (only while some file is not fresh): name -> declarations whose text may mention it. */
  text?: Map<string, Set<string>>;
  /** Text scan: a dotted token (two components or more) -> declarations that write it. */
  dotted?: Map<string, Set<string>>;
}

const indexes = new WeakMap<ProjectModel, UsersIndex>();

const add = (map: Map<string, Set<string>>, key: string, value: string) => {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
};

function allFresh(model: ProjectModel): boolean {
  return model.facts !== undefined && [...model.files.keys()].every((p) => model.freshFiles.has(p));
}

function usersIndex(model: ProjectModel): UsersIndex {
  const cached = indexes.get(model);
  if (cached) return cached;
  const facts = new Map<string, Set<string>>();
  for (const [name, decl] of model.declFacts) for (const ref of decl.refs) if (ref.name !== name) add(facts, ref.name, name);
  const owned = new Map<string, Set<string>>();
  for (const [name, owner] of model.ownerOfDecl) add(owned, owner, name);
  const index: UsersIndex = { owned, facts };
  if (!allFresh(model)) {
    const text = new Map<string, Set<string>>();
    const dotted = new Map<string, Set<string>>();
    for (const file of model.files.values()) {
      const opensAt = openedNamespaces(file);
      for (const decl of file.decls) {
        const name = decl.fullName;
        if (name === undefined) continue;
        const opened = opensAt(decl.span.start);
        for (const token of identifierTokens(declBody(file, decl))) {
          let written = token.text;
          for (;;) {
            if (written.includes('.')) add(dotted, written.startsWith('_root_.') ? written.slice('_root_.'.length) : written, name);
            for (const candidate of candidatesOf(written, decl.namespace, opened)) add(text, candidate, name);
            const dot = written.lastIndexOf('.');
            if (dot < 0) break;
            written = written.slice(0, dot);
          }
        }
      }
    }
    index.text = text;
    index.dotted = dotted;
  }
  indexes.set(model, index);
  return index;
}

/** The declarations that may use `name` directly (facts, plus the text scan while stale). */
function directUsers(index: UsersIndex, name: string): string[] {
  const out = new Set<string>(index.facts.get(name) ?? []);
  for (const user of index.text?.get(name) ?? []) out.add(user);
  if (index.dotted) {
    const parts = name.split('.');
    for (let i = 0; i + 2 <= parts.length; i++) for (const user of index.dotted.get(parts.slice(i).join('.')) ?? []) out.add(user);
  }
  return [...out];
}

/** The external users of one card of `subject`'s board (empty when nothing outside the board uses it). */
export function externalUsersOf(model: ProjectModel, node: TlNode, subject: string): ExternalUser[] {
  const statement = node.lean.statement;
  if (statement === undefined) return [];
  const index = usersIndex(model);
  const holds = holdsName(statement);
  const own = new Set<string>([statement, holds, ...(index.owned.get(node.id) ?? [])]);
  const found = new Map<string, ExternalUser>();
  const visited = new Set<string>(own);
  // Proof users first (whatever rests on the `.holds`, also through untracked lemmas), then the remaining users of
  // the statement: a declaration that does both is listed once, as a proof use.
  for (const [start, where] of [
    [holds, 'proof'],
    [statement, 'statement'],
  ] as const) {
    const queue = [start];
    while (queue.length > 0) {
      const name = queue.shift() as string;
      for (const user of directUsers(index, name)) {
        if (visited.has(user)) continue;
        visited.add(user);
        const owner = model.ownerOfDecl.get(user);
        if (owner !== undefined) {
          const card = model.nodes.get(owner)?.node;
          // A card of this board is shown by the board's own edges; another subject's card is listed, and the search
          // stops at it (as the verified edges stop at the first card).
          if (card && card.subject !== subject) found.set(user, { name: user, nodeId: owner, subject: card.subject, naturalName: card.naturalName, where });
          continue;
        }
        found.set(user, { name: user, where });
        queue.push(user);
      }
    }
  }
  return [...found.values()];
}
