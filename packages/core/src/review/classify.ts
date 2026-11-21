/**
 * Slice 2a2 (docs/slice2-plan.md section 4.4): RV-7 classes, the items that need their own Accept.
 *
 * belief, if any of:
 *  - b1: an Add of an AXIOM card; any Add premise;
 *  - b2: a Formalize or Change of an AXIOM card (its sentence, statement or `.holds`);
 *  - b3: a Lean axiom that is new or changed (presuppositions, pending claims, axiom `.holds`, unmarked axioms), except
 *    a shape-passing sort, predicate, constant or function;
 *  - b4: a new or changed definition, instance, coercion, structure, inductive, class, opaque or abbrev in R_stmt (the
 *    judged state's, and also B's for an existing name), except the cards' statement abbrevs (their docstring mirrors
 *    are part of their text); any change to existing vocabulary in either R_stmt;
 *  - (b5 is slice 3's "meaning changed" item.)
 * changes what is proved, if any of:
 *  - c1: a card statement or a `.holds` theorem of B is changed or removed (Change, Delete, a Result that replaces your
 *    proof; `axiom T.holds` becoming a theorem is not c1: pending counts as no proof); builder 2a2: also an existing
 *    theorem bound to no card that a vocabulary change changes (RV-7: "changes a Lean ... proof that existed when the
 *    session started");
 *  - c2: a Result whose target's statement exists in B and differs ("proves a statement changed in this session"):
 *    builder 2a2, only when W's T.holds is a theorem, since a Result with no proof proves nothing;
 *  - c3: a changed sentence on a card with Lean;
 *  - c4: every Add arrow, marked "adds no new basis" when basis(source) ⊆ ⋃ basis(Q's sources) (AF8).
 *
 * A closure that cannot see what a statement reaches (`complete: false`, D2-25) makes every new or changed definition
 * and instance a belief, with `complete: false`.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import type { DeclFacts } from '../facts.js';
import { holdsName, probeFailure, SORRY_AXIOM } from '../facts.js';
import { declTables, factsOf, isAxiom, type DeclEntry } from '../gate/decls.js';
import { keywordKind } from '../project/factsIndex.js';
import { normalizeWhitespace } from '../project/text.js';
import type { ProjectModel } from '../project/types.js';
import { isPropValued, statementReach } from './closure.js';
import { parseItemKey } from './keys.js';
import type { ClassReason, ItemClass, ItemDraft, PremiseDraft, SessionInference } from './types.js';

/** b4's kinds (an abbrev is a `def` in the facts). */
const B4_KINDS: ReadonlySet<string> = new Set(['def', 'opaque', 'instance', 'structure', 'inductive', 'class']);
/** Vocabulary kinds of a shape-passing term. */
const TERM_KINDS: ReadonlySet<string> = new Set(['sort', 'predicate', 'constant', 'function']);

interface Decl {
  entry?: DeclEntry;
  facts?: DeclFacts;
}

function declOf(model: ProjectModel, name: string): Decl | undefined {
  const entry = declTables(model).byName.get(name);
  const facts = factsOf(model, name, entry) ?? model.declFacts.get(name);
  if (entry === undefined && facts === undefined) return undefined;
  return { ...(entry ? { entry } : {}), ...(facts ? { facts } : {}) };
}

function kindOf(d: Decl): string | undefined {
  if (d.facts?.kind !== undefined) return d.facts.kind;
  const keyword = d.entry?.decl.keyword;
  return keyword === undefined ? undefined : keyword === 'instance' ? 'instance' : keywordKind(keyword);
}

/** The facts agree where both have them (the fields computeItems compares, D2-41). */
function factsAgree(a: DeclFacts | undefined, b: DeclFacts | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  const set = (x: readonly string[] | undefined) => (x === undefined ? undefined : [...new Set(x)].sort().join('\u0000'));
  const both = (x: string | undefined, y: string | undefined) => x === undefined || y === undefined || x === y;
  const norm = (x: string | undefined) => (x === undefined ? undefined : normalizeWhitespace(x));
  return (
    both(a.kind, b.kind) &&
    both(norm(a.type), norm(b.type)) &&
    both(norm(a.value), norm(b.value)) &&
    both(set(a.valueConsts), set(b.valueConsts)) &&
    both(set(a.typeConsts), set(b.typeConsts))
  );
}

/** The declaration differs between B and W: new, removed, or another text or facts. */
function differs(b: Decl | undefined, w: Decl | undefined): boolean {
  if (b === undefined || w === undefined) return b !== w;
  return b.entry?.text !== w.entry?.text || !factsAgree(b.facts, w.facts);
}

/** A shape-passing vocabulary term of the model (a sort, predicate, constant or function with no shape problem). */
function isTerm(model: ProjectModel, name: string): boolean {
  const item = model.vocabulary.find((v) => v.name === name);
  return item !== undefined && TERM_KINDS.has(item.kind) && !item.flags.includes('shape-violation');
}

/** The standard axioms and Lean's own: never a card, a presupposition or an assumption of the model. */
function basisOfFootprint(model: ProjectModel, axioms: readonly string[], cardOfHolds: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>();
  for (const a of axioms) {
    const card = cardOfHolds.get(a);
    if (card !== undefined) {
      out.add(card);
      continue;
    }
    // Presuppositions and any other assumption of the model (an unmarked Prop axiom); vocabulary is no basis.
    const f = model.declFacts.get(a);
    if (f !== undefined && f.kind === 'axiom' && isPropValued(f)) out.add(a);
  }
  return out;
}

/**
 * §4.4 (2a2). `withDrafts`: every premise draft's statement in R_stmt (`classes`), or none (`classesBeforeReveal`).
 * `inferences` give Q's sources for c4's "adds no new basis", which it sets on the arrow item's class (AF8).
 */
export function classify(i: {
  base: ProjectModel;
  current: ProjectModel;
  drafts: readonly ItemDraft[];
  premises: readonly PremiseDraft[];
  inferences: readonly SessionInference[];
  withDrafts: boolean;
}): Record<string, ItemClass> {
  const B = i.base;
  const W = i.current;
  /**
   * 2b2 (§2.1, AP30-5): the cause when the judged state's probe failed; such a class's Accept says it. Without the
   * probe's detail in `classesBeforeReveal`, the map in force while the results are hidden (fixer 2b2 r1,
   * A-V2B2-ADV-7: Lean's error can name hidden proof material, §4.7).
   */
  const failedProbe = probeFailure(W.facts, { detail: i.withDrafts });
  const reachW = statementReach(W, i.withDrafts ? i.premises : []);
  const reachB = statementReach(B, []);
  /** The cards' statement abbrevs (b4's exception), in either state. */
  const statements = new Set<string>();
  for (const model of [B, W]) for (const n of model.nodes.values()) if (n.node.lean.statement !== undefined) statements.add(n.node.lean.statement);
  const cardOfHolds = new Map<string, string>();
  for (const n of W.nodes.values()) if (n.node.lean.statement !== undefined) cardOfHolds.set(holdsName(n.node.lean.statement), n.node.id);
  const typeOf = (card: string) => W.nodes.get(card)?.node.type ?? B.nodes.get(card)?.node.type;

  /**
   * basis(u) (§4.4): {u} for an axiom or pending card, else u's footprint cards and presuppositions; undefined when
   * unknown. A proof that uses `sorry` proves nothing: its basis is {u}, as a pending card's (fixer 2a, ADV-9).
   */
  const basis = (u: string): Set<string> | undefined => {
    const node = W.nodes.get(u)?.node;
    if (node === undefined || node.type === 'AXIOM' || node.lean.statement === undefined) return new Set([u]);
    const holds = W.declFacts.get(holdsName(node.lean.statement));
    if (holds === undefined || holds.kind === 'axiom') return new Set([u]);
    if (holds.usesSorry === true || (holds.axioms ?? []).includes(SORRY_AXIOM)) return new Set([u]);
    if (holds.axioms === undefined) return undefined;
    return basisOfFootprint(W, holds.axioms, cardOfHolds);
  };
  const addsNoNewBasis = (source: string, target: string): boolean => {
    const own = basis(source);
    if (own === undefined) return false;
    const covered = new Set<string>();
    const question = i.inferences.find((inf) => inf.target === target)?.question.sources ?? [];
    for (const q of question) for (const x of basis(q) ?? new Set([q])) covered.add(x);
    return [...own].every((x) => covered.has(x));
  };

  const out: Record<string, ItemClass> = {};
  for (const draft of i.drafts) {
    const reasons: ClassReason[] = [];
    let complete = true;
    let noNewBasis: boolean | undefined;
    const parsed = parseItemKey(draft.key);
    const card = parsed?.kind === 'card' || parsed?.kind === 'proof' ? parsed.node : undefined;

    // b1, b2: what the item adds or formalises.
    if (draft.kind === 'add-premise') reasons.push({ code: 'b1', ...(draft.provides.cards.length > 0 ? { cards: [...draft.provides.cards] } : {}) });
    if (draft.kind === 'add') {
      const added = draft.provides.cards.filter((c) => W.nodes.get(c)?.node.type === 'AXIOM');
      if (added.length > 0) reasons.push({ code: 'b1', cards: added });
    }
    if ((draft.kind === 'formalize' || draft.kind === 'change') && card !== undefined && typeOf(card) === 'AXIOM') reasons.push({ code: 'b2', cards: [card] });

    // b3, b4: its declarations, new or changed.
    for (const name of draft.provides.decls) {
      const before = declOf(B, name);
      const after = declOf(W, name);
      if (after === undefined || !differs(before, after)) continue;
      const term = isTerm(W, name);
      if (isAxiom(after.entry, after.facts) && !term) {
        reasons.push({ code: 'b3', name });
        continue;
      }
      const vocabularyChange = draft.declKind === 'vocabulary-change';
      if (!vocabularyChange && (term || statements.has(name) || !B4_KINDS.has(kindOf(after) ?? ''))) continue;
      if (reachW.names.has(name) || (before !== undefined && reachB.names.has(name))) reasons.push({ code: 'b4', name });
      else if (!reachW.complete || (before !== undefined && !reachB.complete)) {
        // D2-25: R_stmt could not see what the statements reach, so the definition may lie in it.
        reasons.push({ code: 'b4', name });
        complete = false;
      }
    }

    // c1-c3: statements and proofs that existed.
    if ((draft.kind === 'change' || draft.kind === 'delete') && card !== undefined) reasons.push({ code: 'c1', cards: [card] });
    if (draft.kind === 'declaration' && draft.declKind === 'vocabulary-change') {
      for (const name of draft.provides.decls) {
        const before = declOf(B, name);
        if (before !== undefined && kindOf(before) === 'theorem' && differs(before, declOf(W, name))) reasons.push({ code: 'c1', name });
      }
    }
    if (draft.kind === 'result' && card !== undefined) {
      const statementB = B.nodes.get(card)?.node.lean.statement;
      const statementW = W.nodes.get(card)?.node.lean.statement;
      if (statementB !== undefined) {
        const holds = holdsName(statementB);
        const holdsB = declOf(B, holds);
        // c1: B's proof replaced or removed (a pending `axiom T.holds` is no proof).
        if (holdsB !== undefined && kindOf(holdsB) === 'theorem') {
          const holdsW = statementW === undefined ? undefined : declOf(W, holdsName(statementW));
          if (statementW === undefined || holdsName(statementW) !== holds || differs(holdsB, holdsW)) reasons.push({ code: 'c1', name: holds, cards: [card] });
        }
        // c2: a proof of a statement of B that changed; one first written in this session is not changed, and a Result
        // with no proof proves nothing.
        const before = declOf(B, statementB);
        const proof = statementW === undefined ? undefined : declOf(W, holdsName(statementW));
        const proves = proof !== undefined && kindOf(proof) === 'theorem';
        if (proves && before !== undefined && (statementW !== statementB || differs(before, declOf(W, statementB)))) reasons.push({ code: 'c2', name: statementB, cards: [card] });
      }
    }
    if ((draft.kind === 'formalize' || draft.kind === 'change') && card !== undefined) {
      const before = B.nodes.get(card)?.node;
      const after = W.nodes.get(card)?.node;
      if (before !== undefined && after !== undefined && after.lean.statement !== undefined && normalizeWhitespace(before.naturalName) !== normalizeWhitespace(after.naturalName))
        reasons.push({ code: 'c3', cards: [card] });
    }

    // c4: every Add arrow.
    if (draft.kind === 'add-arrow') {
      const arrow = draft.provides.arrows[0] ?? (parsed?.kind === 'arrow' ? parsed.arrow : undefined);
      if (arrow !== undefined) {
        reasons.push({ code: 'c4', arrow: { ...arrow } });
        noNewBasis = addsNoNewBasis(arrow.source, arrow.target);
      }
    }

    const belief = !complete || reasons.some((r) => r.code.startsWith('b'));
    const changesProved = reasons.some((r) => r.code.startsWith('c'));
    out[draft.key] = {
      belief,
      changesProved,
      reasons,
      complete,
      ...(noNewBasis !== undefined ? { addsNoNewBasis: noNewBasis } : {}),
      // ADV-3: its declarations have no facts (their module did not build): the class is not known.
      ...(draft.factsMissing === true ? { factsMissing: true as const } : {}),
      // 2b2 (AP30-5): when the state's probe failed, the cause, which no later check lifts (the reducer's Accept says it).
      ...(draft.factsMissing === true && failedProbe !== undefined ? { probeFailure: failedProbe } : {}),
    };
  }
  return out;
}
