/**
 * Slice 2b1b (docs/slice2-plan.md section 4.8): B.1 for one inference on one state.
 *
 *   permitted(T) = the standard axioms ∪ the signature axioms ∪ the presuppositions of T's and the sources' statements
 *                  ∪ ⋃ contrib(u), for u in sources(Q(T) ∪ E(T)), u ≠ T; T.holds and sorryAx excluded.
 *
 *  - Q(T)'s sources count only while their arrow exists in the state judged (D2-59): a source of the question with no
 *    arrow into T in `current` is no source here (so not in `contrib`, nor allowed by B.2).
 *  - E(T) (`extra`): the ledger's arrows into T whose item is not declined and that the judged state draws (the active
 *    step's own before its normalise writes them; fixer 2b1b r1, A-ADV-1: a cascade's revert takes an arrow out of
 *    ws/ but leaves its entry), plus T's written premises (the ledger's `premise` entries for T). So E(T) is what ws/
 *    holds (AF2, AF12).
 *  - contrib(u):
 *      claim         an axiom `.holds` without TL114, on an axiom card, or on a pending one (`pending`: the Result then
 *                    rests on pending);
 *      own-proof     the person's own unchanged proof from B (`footprintSinceBase`, as slice 1);
 *      session-proof u is a target of the session whose `.holds` here is a theorem that differs from B's, and u's
 *                    inference passes in this same state (`earlier`, judged sources first): its footprint, and u joins
 *                    `throughResults` (an RV-5 edge). The state decides, never the records (D2-48, D2-63);
 *      nothing       otherwise, with why: `no-holds`, `conditional`, `mismatch`, `circular`, `not-passing` (a session
 *                    proof whose inference does not pass, or was not judged before T), `unchecked` (no facts, or a
 *                    proof neither the person's own unchanged one nor a session target's).
 *
 * So no Claude proof widens the set it is judged against (M2's P2 fix, generalised): a footprint enters permitted(T)
 * only from the person's own unchanged proof, or from a session proof that passes its own inference in the same state.
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { holdsName, SORRY_AXIOM, STANDARD_AXIOM_NAMES } from '../facts.js';
import { declTables } from '../gate/decls.js';
import { footprintSinceBase, signatureAxioms } from '../gate/permitted.js';
import { meaningChanged } from '../gate/sessionRules.js';
import type { TlNode } from '../model.js';
import type { ProjectModel } from '../project/types.js';
import { compareLeanNames } from '../project/text.js';
import { arrowKey } from './keys.js';
import type { InferenceJudgement, ItemRecord, LedgerEntry, SessionInference } from './types.js';

type Contribution = InferenceJudgement['contrib'][string];

/**
 * E(T)'s sources (§4.8): the ledger's `arrow` entries into T whose item is not declined and whose arrow `current` draws
 * into T, then T's written premises (the ledger's `premise` entries for T), each once, in ledger order. `activeStep`:
 * the running step, whose own entries count before its normalise draws them (fixer 2b1b r1, A-ADV-1: an arrow a
 * cascade's revert took out of ws/ keeps its entry, and a proof could otherwise use its source with no arrow drawn).
 * `current`, the judged state, is required (fixer 2b1b r2, R1-2): the ledger and the records alone are not E(T).
 */
export function extraSources(target: string, ledger: readonly LedgerEntry[], items: readonly ItemRecord[], current: ProjectModel, activeStep?: string): string[] {
  const declined = new Set(items.filter((r) => r.status === 'declined').map((r) => r.key));
  const drawn = current.nodes.get(target)?.node.premises ?? [];
  const out: string[] = [];
  for (const entry of ledger) {
    if (entry.kind === 'arrow' && entry.target === target && !declined.has(arrowKey(entry.source, entry.target))) {
      if (entry.step !== activeStep && !drawn.includes(entry.source)) continue;
      out.push(entry.source);
    } else if (entry.kind === 'premise' && entry.target === target) out.push(entry.card);
  }
  return [...new Set(out)];
}

/** Q(T)'s sources that count in this state: those whose arrow into T exists in `current` (D2-59). */
export function questionSources(current: ProjectModel, target: string, question: SessionInference['question']): string[] {
  const premises = current.nodes.get(target)?.node.premises ?? [];
  return [...new Set(question.sources)].filter((s) => premises.includes(s));
}

/**
 * u's `.holds` in `current` is a theorem whose declaration B does not have as it is (a proof of this session): its text
 * differs, or (fixer 2b1b r1, A-ADV-4) its text is B's but its meaning is not (D2-41: printed type and value, value and
 * type constants), e.g. the person's proof elaborated through a `@[simp]` lemma a step added.
 */
export function isSessionProof(base: ProjectModel, current: ProjectModel, u: string): boolean {
  const node = current.nodes.get(u)?.node;
  const statement = node?.lean.statement;
  if (node === undefined || statement === undefined || node.lean.justificationKind !== 'theorem') return false;
  const holds = holdsName(statement);
  const now = declTables(current).byName.get(holds);
  if (now === undefined) return current.declFacts.has(holds) && !base.declFacts.has(holds);
  if (declTables(base).byName.get(holds)?.text !== now.text) return true;
  return meaningChanged(base, current, holds);
}

/**
 * §4.8 (2b1b): B.1 for one inference on one state. `earlier`: the judgements of the inferences judged before it,
 * sources first; `items` and `ledger` give E(T). judgeState calls it once per inference (AF8). `inferences` gives Q(T)
 * (the caller passes the active step's question for its target) and the session's targets.
 */
export function permittedFor(i: {
  base: ProjectModel;
  current: ProjectModel;
  target: string;
  inferences: readonly SessionInference[];
  ledger: readonly LedgerEntry[];
  items: readonly ItemRecord[];
  earlier: Readonly<Record<string, InferenceJudgement>>;
  /** The running step at step purposes: its own ledger arrows count in E(T) before its normalise draws them. */
  activeStep?: string;
}): Pick<InferenceJudgement, 'extra' | 'contrib' | 'permitted' | 'throughResults'> {
  const { base, current, target } = i;
  const node = current.nodes.get(target)?.node;
  const statement = node?.lean.statement ?? base.nodes.get(target)?.node.lean.statement;
  const targetHolds = statement !== undefined ? holdsName(statement) : undefined;
  const inference = i.inferences.find((inf) => inf.target === target);
  const extra = extraSources(target, i.ledger, i.items, current, i.activeStep);
  const sources = [...new Set([...(inference ? questionSources(current, target, inference.question) : []), ...extra])].filter((s) => s !== target);
  const targets = new Set(i.inferences.map((inf) => inf.target));

  const presuppositions: string[] = [...(node?.lean.presupposes ?? [])];
  const granted: string[] = [];
  const contrib: InferenceJudgement['contrib'] = {};
  const throughResults: string[] = [];

  /** What u gives, and the axioms it adds to the permitted set. */
  const contribOf = (u: string, n: TlNode): { c: Contribution; axioms: string[] } => {
    const nothing = (reason: NonNullable<Contribution['reason']>) => ({ c: { kind: 'nothing' as const, reason }, axioms: [] });
    const own = n.lean.statement;
    if (own === undefined || n.lean.justification === undefined) return nothing('no-holds');
    if (n.status.flags.includes('holds-mismatch')) return nothing('mismatch');
    if (n.lean.justificationKind === 'axiom') {
      return { c: { kind: 'claim', ...(n.type === 'PROPOSITION' ? { pending: true } : {}) }, axioms: [holdsName(own)] };
    }
    const proof = n.status.proof;
    if (proof.kind === 'conditional') return nothing('conditional');
    if (proof.kind !== 'proved' || n.lean.axioms === undefined) return nothing('unchecked');
    const axioms = n.lean.axioms.filter((a) => a !== SORRY_AXIOM);
    if (targetHolds !== undefined && axioms.includes(targetHolds)) return nothing('circular');
    const mine = footprintSinceBase(current, base, u, n, targetHolds);
    if (mine !== undefined) return { c: { kind: 'own-proof' }, axioms: mine };
    if (targets.has(u) && isSessionProof(base, current, u)) {
      const judged = Object.hasOwn(i.earlier, u) ? i.earlier[u] : undefined;
      if (judged?.passes !== true) return nothing('not-passing');
      throughResults.push(u);
      return { c: { kind: 'session-proof' }, axioms };
    }
    return nothing('unchecked');
  };

  for (const u of sources) {
    const n = current.nodes.get(u)?.node;
    if (n === undefined) {
      contrib[u] = { kind: 'nothing', reason: 'no-holds' };
      continue;
    }
    presuppositions.push(...(n.lean.presupposes ?? []));
    const { c, axioms } = contribOf(u, n);
    contrib[u] = c;
    granted.push(...axioms);
  }

  const permitted = [...new Set([...STANDARD_AXIOM_NAMES, ...signatureAxioms(current), ...presuppositions, ...granted])]
    .filter((a) => a !== targetHolds && a !== SORRY_AXIOM)
    .sort(compareLeanNames);
  return { extra, contrib, permitted, throughResults };
}
