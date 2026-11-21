/**
 * Slice 2b3b (docs/slice2-plan.md 2.9, 3.3, 3.8, 3.10): the engine's pure helpers for an edit session. Nothing here runs
 * Lean or reads files.
 *
 *   sessionPermitted     a session freeze's permitted set: B.1's (`InferenceJudgement.permitted`, with E(T)) as `all`,
 *                        sorted into slice 1's categories (D2-19 compares it with the gated state's)
 *   sameNames            two name lists as sets (D2-19's "differs", EN-2's "the same permitted set")
 *   explicitBody         the value of a statement's `#print` (its header `… : Prop :=` cut), whitespace collapsed: what
 *                        `writePremise` compares with the draft's `explicit` (§3.8, F11)
 *   withG0               a judgement of files G0 refused, its findings first in `global` (AP30-1 r2)
 *   finalCheckFailures   a final judgement's failures by FinalCheckRule, and the backstop's (§3.10)
 *   completionScope      the limits of telelean's completion of a target (§3.8): its proof open, nothing else
 *   statementFactsOf     a premise draft's scratch facts (its statement abbrev and `.holds`), by Lean name
 *   relianceKey          what a premise draft's gap check relies on in a state (§3.8: what its footprint, its gap proof's
 *                        constants, its statement and the target's statement reach, and B.1's permitted set and sources)
 *   sessionProofTargets  the inferences whose `.holds` in F is a proof of this session (the final comparator's)
 *   sessionContextKey    the session's records as one key (the ghost check reuses a clean check's judgement only under it)
 */
import { createHash } from 'node:crypto';

import {
  draftReach,
  holdsName,
  reach,
  STANDARD_AXIOM_NAMES,
  type BackstopRefusal,
  type DeclFacts,
  type FinalCheckRule,
  type GateFinding,
  type InferenceJudgement,
  type ItemRecord,
  type PermittedAxioms,
  type PremiseDraft,
  type ProjectModel,
  type SessionInference,
  type StateJudgement,
  type StepScope,
} from '@telelean/core';

import type { FinalCheckReport, SessionCheckContext } from './types.js';

const collapse = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/** Two name lists as sets. */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((n) => y.has(n));
}

/**
 * A session freeze's permitted set (§3.3 step 5, D2-19): `all` is B.1's permitted(T) on the frozen (or gated) state,
 * with E(T); the categories come from slice 1's computation over the same sources (`categories`), and every name of
 * B.1's set that none of them holds (a session proof's footprint, B.1's own) is a derivation footprint. `unusable`: the
 * sources that contribute nothing in B.1.
 */
export function sessionPermitted(categories: PermittedAxioms, b1: Pick<InferenceJudgement, 'permitted' | 'contrib'>): PermittedAxioms {
  const all = [...new Set(b1.permitted)].sort();
  const allowed = new Set(all);
  const keep = (names: readonly string[]) => names.filter((n) => allowed.has(n));
  const standard = keep(STANDARD_AXIOM_NAMES);
  const signature = keep(categories.signature);
  const selected = keep(categories.selected);
  const presuppositions = keep(categories.presuppositions);
  const known = new Set([...standard, ...signature, ...selected, ...presuppositions]);
  const derivationFootprints = all.filter((n) => !known.has(n));
  const unusable = Object.entries(b1.contrib)
    .filter(([, c]) => c.kind === 'nothing')
    .map(([u]) => u)
    .sort();
  return { standard, signature, selected, presuppositions, derivationFootprints, unusable, all };
}

/**
 * The value of a statement abbrev's `#print`: the text after its header `… : Prop :=`, whitespace collapsed (the
 * name differs between the ghost check's `telelean_ghost_stmt` and the written premise, the value does not). A text
 * without such a header is returned collapsed as it is.
 */
export function explicitBody(printed: string): string {
  const header = /^[\s\S]*?:\s*Prop\s*:=/u.exec(printed);
  return collapse(header === null ? printed : printed.slice(header[0].length));
}

/**
 * A judgement of files G0 refused (AP30-1 r2): judged without facts, G0's findings first in `global` (and so in
 * `stepFindings`, which is `global` at a stage and at the end), so `ok` is false.
 */
export function withG0(judgement: StateJudgement, g0: readonly GateFinding[]): StateJudgement {
  return { ...judgement, ok: false, global: [...g0, ...judgement.global], stepFindings: [...g0, ...judgement.stepFindings] };
}

/** Which FinalCheckRule a gate finding fails (§3.10). */
export function finalRuleOf(f: GateFinding): FinalCheckRule {
  if (f.step === 'G0') return 'rules';
  if (f.code === 'build' || f.code === 'budget') return 'build';
  if (f.code === 'footprint') return 'permitted';
  if (f.code === 'undeclared-premise') return 'no-hidden-edges';
  if (f.code === 'arrow') return 'arrows';
  if (f.code === 'holds-kind') return 'kinds';
  if (f.code.startsWith('comparator-')) return 'comparator';
  return 'rules';
}

type Failure = FinalCheckReport['failures'][number];

function failureOf(rule: FinalCheckRule, text: string, items: readonly string[], declaration: string | undefined): Failure {
  return { rule, text, ...(items.length > 0 ? { items: [...items] } : {}), ...(declaration !== undefined ? { declaration } : {}) };
}

/**
 * The failures of a final judgement (§3.10 step 2), item keys mapped to the records' ids: its `facts` problems
 * (`facts`), its unowned differences (`items`), every global finding, and every inference's findings (each naming its
 * Result's item when the record exists); `no-longer-builds` problems are left out (the build's findings name the same
 * errors). Then the backstop's refusals (`backstop`). Identical failures are listed once.
 */
export function finalCheckFailures(judgement: StateJudgement, items: readonly ItemRecord[], backstop: readonly BackstopRefusal[] = []): Failure[] {
  const idOf = new Map(items.map((r) => [r.key, r.id]));
  const ids = (keys: readonly string[] | undefined) => (keys ?? []).flatMap((k) => (idOf.has(k) ? [idOf.get(k) as string] : []));
  const out: Failure[] = [];
  for (const p of judgement.problems) {
    if (p.code === 'facts') out.push(failureOf('facts', p.text, ids(p.keys), p.declaration));
    else if (p.code === 'unowned' || p.code === 'scc') out.push(failureOf('items', p.text, ids(p.keys), p.declaration));
  }
  for (const f of judgement.global) out.push(failureOf(finalRuleOf(f), f.message, [], f.names?.[0]));
  for (const inference of Object.values(judgement.inferences)) {
    const result = ids([`proof:${inference.target}`]);
    for (const f of inference.findings) out.push(failureOf(finalRuleOf(f), f.message, result, f.names?.[0]));
  }
  for (const r of backstop) out.push(failureOf('backstop', r.text, r.item !== undefined ? [r.item] : [], r.name));
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.rule}\u0000${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The limits of telelean's completion of `target` (§3.8): a step of telelean's own (`step`, never one of Claude's),
 * whose question is the inference's on record, with the target's proof open and nothing else (no arrows, no fuzzy
 * statement, no opened item): the completion only writes `theorem T.holds`.
 */
export function completionScope(step: string, inference: Pick<SessionInference, 'target' | 'question'>): StepScope {
  return {
    step,
    target: inference.target,
    question: { sources: [...inference.question.sources], fromNothing: inference.question.fromNothing },
    fuzzyStatements: [],
    openProof: true,
    openArrows: false,
    openItems: [],
  };
}

const ZERO = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

/**
 * A premise draft's scratch facts (`PremiseDraft.facts`, §3.8), by Lean name: the statement abbrev `<ns>.<leanName>`
 * with the constants the ghost check's second probe read for its pinned statement, and its `.holds` (an axiom of that
 * type), as adoption would write them. Positions and modules are empty: they are in no file yet.
 */
export function statementFactsOf(i: { namespace: string; leanName: string; statement: string; valueConsts: readonly string[]; typeConsts: readonly string[] }): Record<string, DeclFacts> {
  const name = `${i.namespace}.${i.leanName}`;
  const holds = holdsName(name);
  return {
    [name]: {
      name,
      module: '',
      file: '',
      range: ZERO,
      selectionRange: ZERO,
      kind: 'def',
      attributes: ['reducible'],
      type: 'Prop',
      typeSort: 'Type',
      value: collapse(i.statement),
      refs: [],
      valueConsts: [...i.valueConsts],
      typeConsts: [...i.typeConsts],
    },
    [holds]: {
      name: holds,
      module: '',
      file: '',
      range: ZERO,
      selectionRange: ZERO,
      kind: 'axiom',
      type: name,
      typeSort: 'Prop',
      refs: [],
      valueConsts: [],
      typeConsts: [name],
    },
  };
}

/**
 * The parts of a declaration's facts its meaning shows in (D2-41: kind, printed type and value, value and type
 * constants), and, `withAxioms`, its `#print axioms` (a reliance key's: a premise's gap check rests on them).
 */
function meaningOf(model: ProjectModel, name: string, withAxioms: boolean): unknown {
  const f = model.declFacts.get(name);
  if (f === undefined) return null;
  const sorted = (xs: readonly string[] | undefined) => (xs === undefined ? null : [...new Set(xs)].sort());
  const meaning = [f.kind ?? null, f.type !== undefined ? collapse(f.type) : null, f.value !== undefined ? collapse(f.value) : null, sorted(f.valueConsts), sorted(f.typeConsts)];
  return withAxioms ? [...meaning, sorted(f.axioms)] : meaning;
}

/**
 * What a premise draft's gap check relies on in a state (§3.8, RV-1: it "re-checks whenever something it relies on
 * changes": "its footprint, its statement's closure or T's statement"), as one hash: the draft itself (its statement
 * and proof), the target's statement name, B.1's permitted set and sources for the target (E(T) and B.2 included), and
 * the meaning (D2-41's parts, with its `#print axioms`) of every declaration the `uses` closure reaches from the draft's
 * footprint, its statement's closure (`draftReach`), the target's statement and `proofConsts`. The engine checks the
 * draft again when the hash differs from the one of its last check.
 *
 * `proofConsts` (fixer 2b3b r1, A-V2B3B-ADV-1): the constants the draft's gap proof used at its last check (the check
 * theorem's value and type constants), which a footprint alone misses. With them, and with every name the closure
 * reaches (not only the starting ones), the key changes when a source's statement is reworded under the same constants
 * (its `.holds` is in the footprint, its statement only behind it), when a lemma of the proof is taken out or changed
 * (a theorem is never in `#print axioms`), and when a definition only the target's statement reaches changes. The
 * `uses` closure walks into lemmas' proofs too, which B.2's walk of the gap proof reads.
 */
export function relianceKey(
  draft: PremiseDraft,
  model: ProjectModel,
  targetStatement: string | undefined,
  b1: Pick<InferenceJudgement, 'permitted' | 'contrib'>,
  proofConsts: readonly string[] = [],
): string {
  const statement = draftReach(model, draft);
  const starts = [...new Set([...draft.footprint, ...statement.names, ...(targetStatement !== undefined ? [targetStatement] : []), ...proofConsts])];
  const reached = reach(model, starts, 'uses');
  const names = [...new Set([...starts, ...reached.names])].sort();
  const sources = Object.entries(b1.contrib)
    .map(([u, c]) => [u, c.kind, c.reason ?? null, c.pending === true])
    .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  const content = {
    draft: [draft.target, draft.leanName, collapse(draft.leanStatement), draft.proof],
    target: targetStatement ?? null,
    permitted: [...new Set(b1.permitted)].sort(),
    sources,
    complete: [statement.complete, reached.complete],
    meaning: names.map((n) => [n, meaningOf(model, n, true)]),
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/**
 * The session's records as one key (fixer 2b3b r1, F-FC-3): what judgeState's B.1 reads besides the files (E(T) counts
 * the active step's own ledger arrows before its normalise draws them, so a propose_arrow changes B.1 with no file
 * changed), and the step it judges for. The engine reuses a clean check's judgement for the ghost check only under the
 * same key.
 */
export function sessionContextKey(s: SessionCheckContext): string {
  const parts = [s.inferences, s.ledger, s.items, s.premises, s.ended, s.rejectedArrows, s.scope ?? null, s.stepStartCommit ?? null, s.noAlternative ?? null];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** The source text of a declaration of the model, by fully-qualified name (the first in file order). */
function declText(model: ProjectModel, name: string): string | undefined {
  for (const file of model.files.values()) {
    const decl = file.decls.find((d) => d.fullName === name);
    if (decl !== undefined) return file.text.slice(decl.span.start, decl.span.end);
  }
  return undefined;
}

/**
 * The inferences whose `.holds` in `final` is a proof of this session (§3.10's comparator): a theorem whose text
 * differs from B's (or B has none), or whose elaborated value differs from B's (D2-41: printed value, value
 * constants). The person's own unchanged proof is not Claude's work, and its question need not cover it.
 */
export function sessionProofTargets(base: ProjectModel, final: ProjectModel, judgement: StateJudgement): string[] {
  const out: string[] = [];
  for (const [target, inference] of Object.entries(judgement.inferences)) {
    if (inference.verdict === 'not-proved') continue;
    const node = final.nodes.get(target)?.node;
    const statement = node?.lean.statement;
    if (node === undefined || statement === undefined || node.lean.justificationKind !== 'theorem') continue;
    const holds = holdsName(statement);
    const now = declText(final, holds);
    const was = declText(base, holds);
    const nf = final.declFacts.get(holds);
    const bf = base.declFacts.get(holds);
    const meaning = nf !== undefined && bf !== undefined && JSON.stringify(meaningOf(final, holds, false)) !== JSON.stringify(meaningOf(base, holds, false));
    if (now !== was || meaning) out.push(target);
  }
  return out;
}
