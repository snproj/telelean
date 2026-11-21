/**
 * Slice 2b1b: JudgeInput builders for `judgeState`'s tests, on the Spyro sample (parsed with the real parser, facts from
 * `fakeFacts` with value and type constants), with a step's scope, S₀ and freeze when a step purpose is judged.
 */
import type { LeanFacts } from '../../../src/facts.js';
import { frozenSnapshot, type FrozenSnapshot, type GateFinding } from '../../../src/gate/index.js';
import { judgeState } from '../../../src/review/judge.js';
import type { ItemRecord, JudgeInput, LedgerEntry, PremiseDraft, SessionInference, StateJudgement, StepScope } from '../../../src/review/types.js';
import type { FakeFactsOptions } from '../../project/helpers/fakeFacts.js';
import { normative, pinned, proved } from '../../gate/helpers/spyroRun.js';
import { BASE, INFERENCE, MAIN, TARGET, append, modelOf, type Texts } from './session.js';

export { BASE, INFERENCE, MAIN, TARGET };

/** pg-no-dark-past formalised and pinned (the walkthrough's normative reading, as normalisation leaves it). */
export const FORMALISED: Texts = pinned(normative(BASE));
/** …and the target proved honestly from its three premises. */
export const PROVED: Texts = proved(FORMALISED);

/** The walkthrough's step: its target from the three arrows, pg-no-dark-past's empty statement fuzzy. */
export const SCOPE: StepScope = {
  step: 's1',
  target: TARGET,
  question: INFERENCE.question,
  fuzzyStatements: ['pg-no-dark-past'],
  openProof: true,
  openArrows: true,
  openItems: [],
};

/** The freeze of `texts` for the target (round 1), against B. */
export function freezeOf(texts: Texts, target = TARGET, premises: readonly string[] = INFERENCE.question.sources, base: Texts = BASE): FrozenSnapshot {
  return frozenSnapshot(modelOf(texts), { subject: 'Spyro', target, premises, adoptedGhosts: [] }, 1, modelOf(base));
}

export interface JudgeOptions {
  purpose?: JudgeInput['purpose'];
  stage?: JudgeInput['stage'];
  base?: Texts;
  /** S₀: default B for a step purpose. */
  stepStart?: Texts;
  /** Default SCOPE for a step purpose; `null` for none. */
  scope?: StepScope | null;
  freeze?: FrozenSnapshot;
  inferences?: SessionInference[];
  ledger?: LedgerEntry[];
  items?: ItemRecord[];
  premises?: PremiseDraft[];
  ended?: string[];
  rejectedArrows?: JudgeInput['rejectedArrows'];
  noAlternative?: boolean;
  /** The facts of the judged state (`fakeFacts` options), and a last change to them. */
  facts?: FakeFactsOptions;
  mutate?: (facts: LeanFacts) => void;
  baseFacts?: FakeFactsOptions;
  startFacts?: FakeFactsOptions;
}

const STEP: ReadonlySet<string> = new Set(['check', 'freeze', 'gate-proved', 'gate-other']);

/** judgeState of `current` (Spyro texts) with the walkthrough's session unless `o` says otherwise. */
export function judge(current: Texts, o: JudgeOptions = {}): StateJudgement {
  const purpose = o.purpose ?? 'gate-proved';
  const step = STEP.has(purpose) && o.scope !== null;
  const base = o.base ?? BASE;
  const input: JudgeInput = {
    purpose,
    stage: o.stage ?? 'prove',
    commit: 'c-judged',
    filesKey: 'files-judged',
    base: modelOf(base, o.baseFacts ?? {}),
    current: modelOf(current, o.facts ?? {}, o.mutate),
    ...(step ? { stepStart: modelOf(o.stepStart ?? base, o.startFacts ?? {}), scope: o.scope ?? SCOPE } : {}),
    ...(o.freeze !== undefined ? { freeze: o.freeze } : {}),
    inferences: o.inferences ?? [INFERENCE],
    ledger: o.ledger ?? [],
    items: o.items ?? [],
    premises: o.premises ?? [],
    ended: o.ended ?? (step ? [] : [TARGET]),
    rejectedArrows: o.rejectedArrows ?? [],
    ...(o.noAlternative !== undefined ? { noAlternative: o.noAlternative } : {}),
  };
  return judgeState(input);
}

/** `code` or `code/token` of each finding. */
export const tags = (findings: readonly GateFinding[]): string[] => findings.map((f) => (f.token !== undefined ? `${f.code}/${f.token}` : f.code));
export const withCode = (findings: readonly GateFinding[], code: string): GateFinding[] => findings.filter((f) => f.code === code);

/**
 * Three chained targets after cynder-dark-past: t1 from cynder-dark-past, t2 from t1, t3 from t2 (each a proposition
 * with its statement, unproved in B).
 */
export function withChain(texts: Texts): Texts {
  const card = (id: string, sentence: string, premise: string) =>
    `/-\n@@ telelean v1\nid: ${id}\ntype: PROPOSITION\nnatural_name: ${sentence}\npremises: ${premise}\nasserted: 2026-11-01\nlean: Spyro.${id}\n-/\n/-- ${sentence} -/\nabbrev ${id} : Prop := HasDarkPast cynder\n`;
  return append(texts, MAIN, [card('t1', 'Cynder has a dark past, once', 'cynder-dark-past'), card('t2', 'Cynder has a dark past, twice', 't1'), card('t3', 'Cynder has a dark past, thrice', 't2')].join('\n'));
}

export const CHAIN_INFERENCES: SessionInference[] = [
  { target: 't3', question: { sources: ['t2'], fromNothing: false }, order: 2, steps: ['s3'] },
  { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] },
  { target: 't2', question: { sources: ['t1'], fromNothing: false }, order: 1, steps: ['s2'] },
];

/** The chain's proofs: t1 from cynder_dark_past.holds, t2 from t1.holds, t3 from t2.holds. */
export function chainProved(texts: Texts, which: ReadonlyArray<'t1' | 't2' | 't3'> = ['t1', 't2', 't3']): Texts {
  const proofs = { t1: 'theorem t1.holds : t1 := cynder_dark_past.holds', t2: 'theorem t2.holds : t2 := t1.holds', t3: 'theorem t3.holds : t3 := t2.holds' };
  return append(texts, MAIN, which.map((t) => proofs[t]).join('\n'));
}
