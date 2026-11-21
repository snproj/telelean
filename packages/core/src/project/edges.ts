/**
 * Edges of the project (D-13, docs/m1-plan.md section 6.3; spec v4.1 B.2 and B.5, slice 1d):
 *
 *  - `premise` (declared, dotted): one per entry of `premises:`;
 *  - `verified` (Lean, solid): FROM THE PROOF, not footprints. direct(v) = the cards whose `.holds` the proof of v
 *    uses: start at v's `.holds` and follow the constants of the elaborated values (`DeclFacts.valueConsts`, slice 1d)
 *    through declarations that belong to no card (untracked lemmas, definitions, instances), until a card's `.holds`
 *    or any other declaration bound to a card (an extra pinned name) is reached, which counts that card; another
 *    card's statement stops the walk without counting it (it says what the card states, not that it holds). Plus one
 *    `conditional` edge per card v takes as a hypothesis (`on`). A footprint lists only axioms, so it would miss every
 *    edge from a proved proposition. When a declaration the walk needs has no `valueConsts` (facts from before slice
 *    1d, or a failed probe), the walk runs over the `.ilean` references instead (`refs`, what the source text names),
 *    which miss what elaboration inserts (a `@[simp]` lemma, an instance): such a direct(v) is `from: 'source'`, and
 *    no band built on it gets its ✓ (BD-7);
 *  - `lean-ref`: v's statement mentions u's statement;
 *  - mismatch flags, only when v is proved or conditional: `declared-unused` (TL109, a hint: a premise not in the
 *    closure of what the proof uses; drawn plain dotted since slice 1d, BD-5) and `used-undeclared` (TL107, a warning:
 *    every card the proof uses with no arrow drawn from it, covered or not: spec v4.1 B.5 removed the old exemption
 *    for a use whose assumptions the premises cover).
 *
 * B.2's cross-check (slice 1d): every card whose `.holds` is in v's footprint must be in direct(v), or in the basis of
 * a card in direct(v) (what that card's proof rests on). A card that is not is `unseen`: the proof rests on it in a way
 * the arrows do not show (build.ts flags it `uses-unseen`, TL123, the band gets no ✓, and v is not established). It is
 * not judged on an `outdated` walk (out-of-date facts; the card is `stale` until the next check).
 */
import type { DeclFacts } from '../facts.js';
import { holdsName } from '../facts.js';
import { edgeId } from '../graph.js';
import type { BoardDiagnostic, TlEdge, TlNode } from '../model.js';

export interface EdgeInput {
  /** Every node of the project, in file order. */
  nodes: readonly TlNode[];
  ownerOfDecl: ReadonlyMap<string, string>;
  /** Usable facts by name (fresh files fully, stale files by name). */
  declFacts: ReadonlyMap<string, DeclFacts>;
  /**
   * Slice 1d: the files whose facts are fresh. A walk that passes through a declaration of any other file is
   * `outdated` (its facts may no longer describe the proof). Absent: every file counts as fresh.
   */
  freshFiles?: ReadonlySet<string>;
}

/** How direct(v) was found (slice 1d). */
export interface DirectWalk {
  /** direct(v), in the order the walk met the cards. */
  ids: string[];
  /** `proof`: from the elaborated values (`valueConsts`); `source`: from the `.ilean` references only (the fallback). */
  from: 'proof' | 'source';
  /**
   * A declaration the walk relied on (v's `.holds` included) may no longer be what Lean checked: its file is not fresh,
   * or (on the elaborated values) it has no facts any more. See `walkFrom`.
   */
  outdated: boolean;
  /** For each card in `ids`, the declarations bound to it that the walk reached (its `.holds`, or an extra pinned name). */
  reached: ReadonlyMap<string, readonly string[]>;
}

export interface EdgeResult {
  edges: TlEdge[];
  /** direct(v): nodes whose `.holds` v's proof uses (only for proved/conditional v). */
  direct: Map<string, string[]>;
  /** Slice 1d: how each direct(v) was found (only for proved/conditional v). */
  walks: Map<string, DirectWalk>;
  /** Slice 1d, B.2's cross-check: the cards in v's footprint that neither direct(v) nor its cards' bases explain (non-empty lists only). */
  unseen: Map<string, string[]>;
  diagnostics: BoardDiagnostic[];
}

function isProvedOrConditional(node: TlNode): boolean {
  return node.status.proof.kind === 'proved' || node.status.proof.kind === 'conditional';
}

function onOf(node: TlNode): string[] {
  return node.status.proof.kind === 'conditional' ? node.status.proof.on : [];
}

function footprintOf(node: TlNode): string[] {
  const proof = node.status.proof;
  return proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : [];
}

/** What the walks need besides the facts: who owns which declaration, whose `.holds` is which, and each card's statement. */
interface Owners {
  ownerOfDecl: ReadonlyMap<string, string>;
  holdsOwner: ReadonlyMap<string, string>;
  statementOf: ReadonlyMap<string, string>;
}

/**
 * One walk from v's `.holds`, following `next(facts)` through declarations that belong to no card (or to v itself,
 * apart from its statement). Returns undefined when `next` gives nothing for a declaration it must pass through.
 *
 * `outdated` (slice 1d, with the 1d fixer's additions): the walk relies on a declaration whose facts may no longer
 * describe it. That is every declaration it passes through, and every one it stops at that no card's own freshness
 * covers (another card's statement, or its extra pinned name; a card's `.holds` is covered by that card's own `stale`
 * and `not-checked` flags, which B.5 and the band check over direct(v)): one in a file that is not fresh, or, with
 * `strict` (the elaborated values, which list only declarations the facts had when Lean checked the proof), one that
 * has no facts any more (renamed, removed, or its kind changed since).
 */
function walkFrom(
  node: TlNode,
  start: { name: string; file?: string },
  first: readonly string[] | undefined,
  next: (facts: DeclFacts) => readonly string[] | undefined,
  declFacts: ReadonlyMap<string, DeclFacts>,
  owners: Owners,
  isFresh: (file: string) => boolean,
  strict: boolean,
): Omit<DirectWalk, 'from'> | undefined {
  const statement = node.lean.statement;
  if (first === undefined) return undefined;
  const ids: string[] = [];
  const reached = new Map<string, string[]>();
  const count = (id: string, name: string) => {
    if (!ids.includes(id)) ids.push(id);
    reached.set(id, [...(reached.get(id) ?? []), name]);
  };
  let outdated = start.file !== undefined && !isFresh(start.file);
  const visited = new Set<string>([start.name]);
  const queue = [...first];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (visited.has(name)) continue;
    visited.add(name);
    const user = owners.holdsOwner.get(name);
    if (user !== undefined) {
      if (user !== node.id) count(user, name);
      continue;
    }
    const owner = owners.ownerOfDecl.get(name);
    if (owner !== undefined && owner !== node.id) {
      // Another card's statement says what it states, not that it holds; any other declaration bound to it (an extra
      // pinned name) stands for the card (B.2). Neither is covered by that card's freshness as direct(v) checks it.
      if (name !== owners.statementOf.get(owner)) count(owner, name);
      const facts = declFacts.get(name);
      if (facts === undefined || !isFresh(facts.file)) outdated = true;
      continue;
    }
    if (owner === node.id && name === statement) continue;
    const facts = declFacts.get(name);
    if (!facts) {
      // Over the references: a name of Lean's own (or one without facts). Over the elaborated values: a declaration the
      // facts had when Lean checked the proof, gone since (its file changed): the walk cannot see past it.
      if (strict) outdated = true;
      continue;
    }
    const more = next(facts);
    if (more === undefined) return undefined;
    if (!isFresh(facts.file)) outdated = true;
    for (const n of more) if (!visited.has(n)) queue.push(n);
  }
  return { ids, outdated, reached };
}

/**
 * direct(v) with how it was found (slice 1d, B.2): over the elaborated values when every declaration the walk needs
 * has `valueConsts`, else over the `.ilean` references (`from: 'source'`).
 */
export function directWalk(
  node: TlNode,
  input: Pick<EdgeInput, 'ownerOfDecl' | 'declFacts' | 'freshFiles'>,
  holdsOwner: ReadonlyMap<string, string>,
  statementOf?: ReadonlyMap<string, string>,
): DirectWalk {
  const statement = node.lean.statement;
  const start = statement ? input.declFacts.get(holdsName(statement)) : undefined;
  if (!start) return { ids: [], from: 'source', outdated: false, reached: new Map() };
  const owners: Owners = { ownerOfDecl: input.ownerOfDecl, holdsOwner, statementOf: statementOf ?? statementsOf(holdsOwner) };
  const fresh = input.freshFiles;
  const isFresh = (file: string) => fresh === undefined || fresh.has(file);
  const values = (f: DeclFacts) => f.valueConsts;
  const fromValues = walkFrom(node, start, values(start), values, input.declFacts, owners, isFresh, true);
  if (fromValues) return { ...fromValues, from: 'proof' };
  const refs = (f: DeclFacts) => f.refs.map((r) => r.name);
  const fromRefs = walkFrom(node, start, refs(start), refs, input.declFacts, owners, isFresh, false) as Omit<DirectWalk, 'from'>;
  return { ...fromRefs, from: 'source' };
}

/**
 * B.2's cross-check helper: the cards that direct(v) (`uses`, with the declarations the walk `reached` for each) explains:
 * those cards, and what the declarations reached for them rest on (`#print axioms`), else, for a proved or conditional
 * card whose reached declarations have no axioms listed, its footprint.
 */
function explainedBy(
  uses: readonly string[],
  reached: ReadonlyMap<string, readonly string[]> | undefined,
  declFacts: ReadonlyMap<string, DeclFacts>,
  holdsOwner: ReadonlyMap<string, string>,
  byId: ReadonlyMap<string, TlNode>,
): Set<string> {
  const explained = new Set(uses);
  for (const u of uses) {
    let known = false;
    for (const decl of reached?.get(u) ?? []) {
      const axioms = declFacts.get(decl)?.axioms;
      if (axioms === undefined) continue;
      known = true;
      for (const axiom of axioms) {
        const owner = holdsOwner.get(axiom);
        if (owner !== undefined) explained.add(owner);
      }
    }
    const used = byId.get(u);
    if (!known && used && isProvedOrConditional(used)) for (const x of footprintOf(used)) explained.add(x);
  }
  return explained;
}

/** Which card owns which statement and `.holds` (only a card's own binding counts). */
function ownersOf(nodes: readonly TlNode[], ownerOfDecl: ReadonlyMap<string, string>): { holdsOwner: Map<string, string>; statementOf: Map<string, string>; statementOwner: Map<string, string> } {
  const statementOwner = new Map<string, string>();
  const holdsOwner = new Map<string, string>();
  const statementOf = new Map<string, string>();
  for (const node of nodes) {
    const statement = node.lean.statement;
    if (!statement || ownerOfDecl.get(statement) !== node.id) continue;
    statementOwner.set(statement, node.id);
    statementOf.set(node.id, statement);
    holdsOwner.set(holdsName(statement), node.id);
  }
  return { holdsOwner, statementOf, statementOwner };
}

/** direct() of a proof that is not in the facts (slice 1e: the "Claude suggests" scratch check, spec v4.1 RV-1). */
export interface ConstsWalk {
  /** The cards the proof uses directly, in the walk's order. */
  ids: string[];
  /** B.2's cross-check: the cards of `axioms` whose `.holds` neither `ids` nor what they rest on explains. */
  unseen: string[];
  /** A declaration the walk relied on may no longer be what Lean checked (see `walkFrom`). */
  outdated: boolean;
}

/**
 * Spec v4.1 B.2 for a proof telelean checks outside the files (slice 1e: the scratch theorem `<statement> → T` of a
 * "Claude suggests" premise, RV-1 "the check includes B.2"): direct() from the constants of its elaborated value
 * (`consts`, from the in-file value probe, which the ghost check still runs), with `directWalk`'s rules for `node`
 * (the target: its own `.holds` and statement are not uses), through the declarations of `input` that belong to no
 * card; and B.2's
 * cross-check against `axioms` (the scratch theorem's `#print axioms`). Undefined when a declaration the walk passes
 * through has no `valueConsts`: the caller refuses rather than guess (never the `.ilean` references).
 */
export function directWalkOfConsts(node: TlNode, consts: readonly string[], axioms: readonly string[], input: EdgeInput): ConstsWalk | undefined {
  const { holdsOwner, statementOf } = ownersOf(input.nodes, input.ownerOfDecl);
  const owners: Owners = { ownerOfDecl: input.ownerOfDecl, holdsOwner, statementOf };
  const fresh = input.freshFiles;
  const isFresh = (file: string) => fresh === undefined || fresh.has(file);
  const walk = walkFrom(node, { name: '' }, consts, (f) => f.valueConsts, input.declFacts, owners, isFresh, true);
  if (walk === undefined) return undefined;
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const explained = explainedBy(walk.ids, walk.reached, input.declFacts, holdsOwner, byId);
  const unseen = [
    ...new Set(axioms.map((axiom) => holdsOwner.get(axiom)).filter((id): id is string => id !== undefined && id !== node.id && !explained.has(id))),
  ];
  return { ids: walk.ids, unseen, outdated: walk.outdated };
}

/** The nodes whose `.holds` the proof of `node` uses, following untracked declarations (see `directWalk`). */
export function directUses(node: TlNode, input: Pick<EdgeInput, 'ownerOfDecl' | 'declFacts' | 'freshFiles'>, holdsOwner: ReadonlyMap<string, string>): string[] {
  return directWalk(node, input, holdsOwner).ids;
}

/** Each card's statement: the name whose `.holds` the card owns. */
function statementsOf(holdsOwner: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [holds, id] of holdsOwner) out.set(id, holds.slice(0, -'.holds'.length));
  return out;
}

export function computeEdges(input: EdgeInput): EdgeResult {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const { holdsOwner, statementOf, statementOwner } = ownersOf(input.nodes, input.ownerOfDecl);

  const direct = new Map<string, string[]>();
  const walks = new Map<string, DirectWalk>();
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const walk = directWalk(node, input, holdsOwner, statementOf);
    walks.set(node.id, walk);
    direct.set(node.id, walk.ids);
  }

  // B.2's cross-check: a card whose `.holds` is in the footprint is in direct(v), or in the basis of a card in it:
  // what the declarations the walk reached for that card rest on (`#print axioms`), else that card's footprint.
  const unseen = new Map<string, string[]>();
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const walk = walks.get(node.id);
    // On out-of-date facts the walk may have lost the trail (a lemma renamed since the check): no verdict until the next
    // check; the card is `stale` meanwhile (its last status, dimmed; 1d fixer).
    if (walk?.outdated) continue;
    const uses = direct.get(node.id) ?? [];
    const explained = explainedBy(uses, walk?.reached, input.declFacts, holdsOwner, byId);
    const missing = footprintOf(node).filter((x) => byId.has(x) && x !== node.id && !explained.has(x));
    if (missing.length > 0) unseen.set(node.id, missing);
  }

  const premiseEdges: TlEdge[] = [];
  const verifiedEdges: TlEdge[] = [];
  const refEdges: TlEdge[] = [];
  const seen = new Set<string>();
  const push = (list: TlEdge[], edge: TlEdge) => {
    if (seen.has(edge.id)) return;
    seen.add(edge.id);
    list.push(edge);
  };

  for (const node of input.nodes) {
    for (const premise of node.premises) {
      if (premise === node.id || !byId.has(premise)) continue;
      push(premiseEdges, { id: edgeId('premise', premise, node.id), type: 'premise', source: premise, target: node.id, origin: 'declared' });
    }
    const uses = direct.get(node.id) ?? [];
    for (const source of uses) {
      push(verifiedEdges, { id: edgeId('verified', source, node.id), type: 'verified', source, target: node.id, origin: 'lean', where: 'proof' });
    }
    for (const source of onOf(node)) {
      if (!byId.has(source) || source === node.id) continue;
      push(verifiedEdges, { id: edgeId('verified', source, node.id), type: 'verified', source, target: node.id, origin: 'lean', where: 'proof', conditional: true });
    }
    const statement = node.lean.statement;
    const facts = statement ? input.declFacts.get(statement) : undefined;
    if (facts && statement && statementOwner.get(statement) === node.id) {
      for (const ref of facts.refs) {
        const source = statementOwner.get(ref.name);
        if (source === undefined || source === node.id) continue;
        push(refEdges, { id: edgeId('lean-ref', source, node.id), type: 'lean-ref', source, target: node.id, origin: 'lean', where: 'statement' });
      }
    }
  }

  // D-13 mismatches: TL109 at the assumption level (a hint); TL107 for every use without an arrow (B.5).
  const closureMemo = new Map<string, Set<string>>();
  const closure = (id: string, stack: Set<string> = new Set()): Set<string> => {
    const memo = closureMemo.get(id);
    if (memo) return memo;
    const out = new Set<string>();
    if (stack.has(id)) return out;
    stack.add(id);
    const node = byId.get(id);
    for (const u of [...(direct.get(id) ?? []), ...(node ? onOf(node) : [])]) {
      if (!byId.has(u)) continue;
      out.add(u);
      for (const w of closure(u, stack)) out.add(w);
    }
    stack.delete(id);
    closureMemo.set(id, out);
    return out;
  };

  const diagnostics: BoardDiagnostic[] = [];
  const at = (node: TlNode) => (node.loc ? { file: node.loc.file, range: node.loc.range } : {});
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const premises = node.premises.filter((p) => byId.has(p) && p !== node.id);
    const used = closure(node.id);
    for (const edge of premiseEdges) {
      if (edge.target !== node.id || used.has(edge.source)) continue;
      edge.mismatch = 'declared-unused';
      diagnostics.push({ code: 'TL109', severity: 'hint', message: `Declared premise "${edge.source}" is not used by the proof.`, nodeId: node.id, ...at(node) });
    }
    for (const edge of verifiedEdges) {
      if (edge.target !== node.id || premises.includes(edge.source)) continue;
      edge.mismatch = 'used-undeclared';
      diagnostics.push({
        code: 'TL107',
        severity: 'warning',
        message: `The proof uses "${edge.source}", but no arrow is drawn from it.`,
        nodeId: node.id,
        ...at(node),
      });
    }
  }

  return { edges: [...premiseEdges, ...verifiedEdges, ...refEdges], direct, walks, unseen, diagnostics };
}
