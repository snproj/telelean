/**
 * D-5 permitted axioms (docs/m2-plan.md section 3.2) and the freeze record the rules keep (`FrozenSnapshot`).
 *
 *   permitted(F) = STD ∪ signature ∪ selected ∪ presuppositions ∪ derivation footprints
 *   unusable     = selected premises contributing nothing: no `.holds`, a conditional or unchecked proof, a `.holds`
 *                  that does not state its statement, a proof resting on the target's own claimed `.holds` (circular),
 *                  or (given B) a proof that is not the user's own unchanged proof from B
 *
 * The target's `.holds` is never permitted (it is not selected and its sort is `Prop`; a circular derivation footprint
 * is dropped whole). Fixer round 1 (M2 verification): the signature is vocabulary of a signature kind only, never a
 * declaration bound to a card; and a derivation footprint counts only for a proof the user already had in B, never for
 * one Claude wrote or changed in the run (it would widen the very set it is judged against).
 */
import { ActionError } from '../actions.js';
import { holdsName, SORRY_AXIOM, STANDARD_AXIOM_NAMES } from '../facts.js';
import type { TlNode, VocabKind } from '../model.js';
import type { ProjectModel } from '../project/types.js';
import { compareLeanNames, normalizeWhitespace } from '../project/text.js';
import { declTables } from './decls.js';
import type { FrozenSnapshot, PermittedAxioms, Selection } from './types.js';

const sortNames = (names: Iterable<string>): string[] => [...new Set(names)].sort(compareLeanNames);

/** Vocabulary kinds whose axioms are signature (symbols), not beliefs. */
const SIGNATURE_KINDS: ReadonlySet<VocabKind> = new Set(['sort', 'predicate', 'function', 'constant']);

/**
 * The signature (D-3 rules 1 and 3): every axiom of the project whose type is not a Prop and that is vocabulary of a
 * signature kind (sorts `axiom T : Type`, predicates `… → Prop`, functions and constants). Never a declaration bound to
 * a card (a card's statement or `.holds` is not vocabulary, whatever its type: `axiom side_goal : Empty` directly
 * below a card's block is that card's "statement" and would prove anything), never vocabulary of another kind (`other`:
 * an axiom of a type telelean cannot classify, such as `Empty` or `PLift False`), never a Prop-valued axiom. An axiom
 * outside every subject's modules (the library root, which only the user writes) counts when Lean typed it as non-Prop.
 */
export function signatureAxioms(model: ProjectModel): string[] {
  const kinds = new Map(model.vocabulary.map((item) => [item.name, item.kind]));
  const subjectFiles = new Set(model.subjects.flatMap((s) => s.files));
  const out: string[] = [];
  for (const [name, facts] of model.declFacts) {
    if (facts.kind !== 'axiom' || model.ownerOfDecl.has(name)) continue;
    const sort = facts.typeSort === undefined ? undefined : normalizeWhitespace(facts.typeSort);
    if (sort === 'Prop') continue;
    const kind = kinds.get(name);
    if (kind !== undefined ? SIGNATURE_KINDS.has(kind) : sort !== undefined && !subjectFiles.has(facts.file)) out.push(name);
  }
  return out;
}

/** Why a selected card cannot be used, or undefined when it contributes axioms (and which). Exported for slice 2's B.1 (`review/permitted.ts`, 2b1b). */
export function contribution(node: TlNode, targetHolds: string | undefined): { selected?: string; footprint?: string[] } | undefined {
  const statement = node.lean.statement;
  if (statement === undefined || node.lean.justification === undefined || node.status.flags.includes('holds-mismatch')) return undefined;
  if (node.lean.justificationKind === 'axiom') return { selected: holdsName(statement) };
  const proof = node.status.proof;
  if (proof.kind !== 'proved' || node.lean.axioms === undefined) return undefined;
  const axioms = node.lean.axioms.filter((a) => a !== SORRY_AXIOM);
  if (targetHolds !== undefined && axioms.includes(targetHolds)) return undefined;
  return { footprint: axioms };
}

/**
 * A selected derivation's footprint, given B: only for the user's own proof, i.e. its statement is the same card's
 * statement in B and its `.holds` is a declaration of B with the same source text now (B's footprint when B has
 * facts, else the current one). A proof Claude added or changed in the run gives nothing (`undefined`: unusable as a
 * source of axioms; it can still be used as a lemma, whose own footprint must then be permitted). Exported for slice 2's
 * B.1 (`review/permitted.ts`, 2b1b: "own proof").
 */
export function footprintSinceBase(model: ProjectModel, base: ProjectModel, id: string, node: TlNode, targetHolds: string | undefined): string[] | undefined {
  const statement = node.lean.statement;
  const before = base.nodes.get(id)?.node;
  if (statement === undefined || before === undefined || before.lean.statement !== statement) return undefined;
  const holds = holdsName(statement);
  const now = declTables(model).byName.get(holds);
  const was = declTables(base).byName.get(holds);
  if (now === undefined || was === undefined || now.text !== was.text) return undefined;
  return contribution(base.facts !== undefined ? before : node, targetHolds)?.footprint;
}

/**
 * The permitted set. `strict`: unknown target or premise ids throw ActionError `invalid` (computePermittedAxioms);
 * otherwise they are skipped (evaluateRules never throws). `base` (B, the user's files): derivation footprints only
 * from the user's own unchanged proofs (see `footprintSinceBase`); without it every proved derivation of `model`
 * counts (callers that judge the user's own files).
 */
export function permittedAxioms(model: ProjectModel, selection: Selection, strict: boolean, base?: ProjectModel): PermittedAxioms {
  const nodeOf = (id: string, what: string): TlNode | undefined => {
    const entry = model.nodes.get(id);
    if (entry && entry.node.subject === selection.subject) return entry.node;
    if (strict) throw new ActionError('invalid', `${what} "${id}" is not a card of the subject ${selection.subject}.`);
    return undefined;
  };
  const target = nodeOf(selection.target, 'The target');
  const targetHolds = target?.lean.statement !== undefined ? holdsName(target.lean.statement) : undefined;
  const chosen = [...new Set([...selection.premises, ...selection.adoptedGhosts])].filter((id) => id !== selection.target);
  const selected: string[] = [];
  const presuppositions: string[] = [...(target?.lean.presupposes ?? [])];
  const derivationFootprints: string[] = [];
  const unusable: string[] = [];
  for (const id of chosen) {
    const node = nodeOf(id, 'The premise');
    if (!node) continue;
    presuppositions.push(...(node.lean.presupposes ?? []));
    const gives = contribution(node, targetHolds);
    if (gives === undefined) unusable.push(id);
    else if (gives.selected !== undefined) selected.push(gives.selected);
    else {
      const footprint = base === undefined ? gives.footprint : footprintSinceBase(model, base, id, node, targetHolds);
      if (footprint === undefined) unusable.push(id);
      else derivationFootprints.push(...footprint);
    }
  }
  const drop = (names: Iterable<string>) => sortNames([...names].filter((n) => n !== targetHolds && n !== SORRY_AXIOM));
  const summary = {
    standard: [...STANDARD_AXIOM_NAMES],
    signature: drop(signatureAxioms(model)),
    selected: drop(selected),
    presuppositions: drop(presuppositions),
    derivationFootprints: drop(derivationFootprints),
    unusable,
  };
  const all = [...new Set([...summary.standard, ...summary.signature, ...summary.selected, ...summary.presuppositions, ...summary.derivationFootprints])].sort();
  return { ...summary, all };
}

/** See `frozenSnapshot` in ./index.ts. */
export function snapshotOf(frozen: ProjectModel, selection: Selection, round: number, base?: ProjectModel): FrozenSnapshot {
  const permitted = permittedAxioms(frozen, selection, true, base);
  const target = frozen.nodes.get(selection.target)?.node;
  const targetStatement = target?.lean.statement;
  if (targetStatement === undefined) throw new ActionError('invalid', `The target "${selection.target}" has no Lean statement to freeze.`);
  const subjectFiles = new Set(frozen.subjects.find((s) => s.name === selection.subject)?.files ?? []);
  const declarations: FrozenSnapshot['declarations'] = {};
  for (const [name, facts] of frozen.declFacts) {
    // Statements, vocabulary and definitions; proofs (theorems) may be reworked after the freeze.
    if (!subjectFiles.has(facts.file) || facts.kind === 'theorem') continue;
    declarations[name] = {
      ...(facts.kind !== undefined ? { kind: facts.kind } : {}),
      ...(facts.type !== undefined ? { type: normalizeWhitespace(facts.type) } : {}),
      ...(facts.value !== undefined ? { value: normalizeWhitespace(facts.value) } : {}),
    };
  }
  const axioms = new Set<string>();
  for (const [name, facts] of frozen.declFacts) if (facts.kind === 'axiom') axioms.add(name);
  for (const file of frozen.files.values()) for (const decl of file.decls) if (decl.keyword === 'axiom' && decl.fullName !== undefined) axioms.add(decl.fullName);
  return { round, permitted, targetStatement, declarations, axioms: [...axioms].sort() };
}
