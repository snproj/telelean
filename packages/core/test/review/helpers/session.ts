/**
 * Slice 2a1: Spyro states for the review model's tests, parsed with WP-markup's real parser, with facts derived by
 * `fakeFacts` (value and type constants on: slice 2's facts carry both, docs/slice2-plan.md 2.1).
 */
import type { LeanFacts } from '../../../src/facts.js';
import type { LedgerEntry, PremiseDraft, SessionInference } from '../../../src/review/types.js';
import { parseLeanFile } from '../../../src/markup/api.js';
import { buildProjectModel, type ProjectModel } from '../../../src/project/index.js';
import { fakeFacts, freshHashes, type FakeFactsOptions } from '../../project/helpers/fakeFacts.js';
import { BASE, MAIN, VOCAB, edit, type Texts } from '../../gate/helpers/spyroRun.js';

export { BASE, MAIN, VOCAB, edit, type Texts };

/** A model of `texts` with slice 2's facts (both constant arrays unless `options` turn one off). */
export function modelOf(texts: Texts, options: FakeFactsOptions = {}, mutate?: (facts: LeanFacts) => void): ProjectModel {
  const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
  const facts = fakeFacts(files, { valueConsts: true, typeConsts: true, ...options });
  mutate?.(facts);
  return buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model' });
}

/** Appends `code` right before the `end Spyro` that closes the given file. */
export function append(texts: Texts, path: string, code: string): Texts {
  return edit(texts, path, '\nend Spyro', `\n${code.trim()}\n\nend Spyro`);
}

export const TARGET = 'cynder-not-good';
export const TARGET_STATEMENT = 'Spyro.cynder_not_good';
export const TARGET_HOLDS = 'Spyro.cynder_not_good.holds';

/** The walkthrough's inference: the goal, from its three arrows, one step `s1`. */
export const INFERENCE: SessionInference = {
  target: TARGET,
  question: { sources: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], fromNothing: false },
  order: 0,
  steps: ['s1'],
};

/** A ledger `created` entry; `draft`: the premise draft of the step that reached it when the step ended (V2A1-C3). */
export const created = (name: string, phase: 'statements' | 'proof', step = 's1', draft?: string): LedgerEntry => ({
  kind: 'created',
  name,
  step,
  phase,
  ...(draft !== undefined ? { draft } : {}),
});

/** A premise draft for the target (its facts: one abbrev whose type and value constants are given). */
export function draftOf(over: Partial<PremiseDraft> & { consts?: string[] } = {}): PremiseDraft {
  const { consts, ...rest } = over;
  const leanName = rest.leanName ?? 'cynder_is_evil';
  const name = `Spyro.${leanName}`;
  return {
    target: TARGET,
    step: 's1',
    naturalName: 'Cynder is evil',
    leanName,
    leanStatement: 'HasDarkPast cynder',
    explicit: 'Spyro.HasDarkPast Spyro.cynder',
    whyNeeded: 'the gap',
    proof: 'h',
    footprint: [],
    aloneEntails: false,
    facts: {
      [name]: {
        name,
        module: 'Scratch',
        file: 'Scratch.lean',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        kind: 'def',
        type: 'Prop',
        refs: [],
        valueConsts: consts ?? ['Spyro.HasDarkPast', 'Spyro.cynder'],
        typeConsts: [],
      },
    },
    ...rest,
  };
}
