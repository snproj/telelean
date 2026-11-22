/**
 * Slice 2f (docs/slice2-plan.md 6.1's 2f list): fixtures and helpers for the Add premise and end tests, with the
 * FakeBackend and the fake engine (its stage judge, final check, premise write and completion are core's rules on fake
 * facts: fakeEngine.ts). The Spyro question: the step formalises pg-no-dark-past (a Formalize item, a belief) and, for
 * the target cynder-not-good, proposes a missing premise (an Add premise item, part of T's Result) and finishes not
 * proved, or proves T and proposes one anyway (a second premise for a proved T: written, unused).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { premiseKey, type ItemDecision } from '@telelean/core';
import { expect } from 'vitest';

import type { FakeStep } from '../../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../../src/llm/fakeScripts.js';
import { fakeComplete, fakeFinalCheck, fakeWritePremise } from './fakeEngine.js';
import type { PersistedSession } from '../../../src/run/types.js';
import { makeHarness, rawRun, round1, START, step, waitForStage, type Harness } from './harness.js';
import { decision, GOAL_LINE, GOAL_PROOF, PG, PG_BLOCK_END, PG_FORMALISED, pgScript, record, settled, T } from './review.js';
import { chainModel, MAIN } from './sessions.js';

export const PREMISE_NAME = 'not_in_game_not_good';
export const PREMISE_KEY = premiseKey(T, PREMISE_NAME);
export const PREMISE_SENTENCE = 'A character who cannot be in a game would not be a good addition to it';
/** The gap proof: P → T (T is ¬ GoodAddition cynder newSpyro). */
export const PREMISE_PROOF = 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)';
export const PREMISE_STATEMENT = '∀ (c : Character) (g : Game), ¬ GoodAddition c g → ¬ GoodAddition c g';

/** propose_assumption for T (after the freeze), with the given Lean name. */
export function proposePremise(name = PREMISE_NAME, sentence = PREMISE_SENTENCE): FakeStep {
  return step.propose({ natural_name: sentence, lean_statement: PREMISE_STATEMENT, proof: PREMISE_PROOF, lean_name: name });
}

/**
 * The step's steps: pg-no-dark-past formalised and frozen, a premise proposed, then T not proved (`not-proved`) or
 * proved from pg-no-dark-past anyway (`proved`: the premise is a second, unused one).
 */
export function premiseSteps(outcome: 'not-proved' | 'proved' = 'not-proved', extra: FakeStep[] = []): FakeStep[] {
  const statements: FakeStep[] = [step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze()];
  const tail: FakeStep[] =
    outcome === 'proved' ? [proposePremise(), ...extra, step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved.'), step.result()] : [proposePremise(), ...extra, step.finish('not_proved', 'It needs a premise.'), step.result()];
  return [...statements, ...tail];
}

export const premiseScript = (outcome: 'not-proved' | 'proved' = 'not-proved', extra: FakeStep[] = []): FakeScriptTurn => round1(...premiseSteps(outcome, extra));

/** The fake engine's premise write, completion and final check (core's rules on fake facts). */
export function scriptEnd(h: Harness): void {
  h.engine.onWritePremise = (ctx, premise) => fakeWritePremise(ctx, premise);
  h.engine.onComplete = (ctx, premise) => fakeComplete(ctx, premise);
  h.engine.onFinalCheck = (ctx, reuse) => fakeFinalCheck(ctx, reuse);
}

/** Stage 1 of the premise question, with PG's Formalize accepted (its own Accept), so the results are shown. */
export async function premiseStage(
  dispose: Array<() => void>,
  outcome: 'not-proved' | 'proved' = 'not-proved',
  options: Parameters<typeof makeHarness>[0] = {},
): Promise<{ h: Harness; runId: string }> {
  const h = makeHarness({ script: [premiseScript(outcome)], ...options });
  dispose.push(() => h.dispose());
  scriptEnd(h);
  expect(await h.manager.start(START)).toMatchObject({ ok: true });
  const v = await waitForStage(h.manager, 1);
  await settled(h);
  expect(await h.manager.decide(v.runId, 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: true });
  await settled(h);
  expect(h.manager.session()?.results.shown).toBe(true);
  return { h, runId: v.runId };
}

/** The Accept of the Add premise (its own), as the detail sends it: how it is held, and an optional Why. */
export function acceptPremise(h: Pick<Harness, 'shadow'>, holdAs: 'axiom' | 'pending', rationale?: string, key = PREMISE_KEY): ItemDecision {
  return decision(h, key, 'accepted', { holdAs, ...(rationale !== undefined ? { rationale } : {}) });
}

/** The written premise card's block and declarations in the main file, from its `id:` line (empty when it is not there). */
export function premiseCardText(main: string, card: string, name = PREMISE_NAME): string {
  const at = main.indexOf(`id: ${card}\n`);
  if (at < 0) return '';
  const end = main.indexOf(`${name}.holds`, at);
  return end < 0 ? main.slice(at) : main.slice(at, main.indexOf('\n', end) + 1);
}

/** The premise record (by its key). */
export const premiseRecord = (h: Pick<Harness, 'shadow'>, key = PREMISE_KEY) => record(h, key);

/**
 * A model folder for Claude's arrows into T (G1's provenance): the chain model with three proved cards aux-one, aux-two
 * and aux-three (each from cynder-dark-past, with a `.holds` in B) before cynder-not-good, which rests on
 * cynder-dark-past and new-spyro-pg only, so Claude may propose an arrow from each of the three.
 */
export function auxModel(): string {
  const dir = chainModel();
  const file = path.join(dir, MAIN);
  const text = readFileSync(file, 'utf8');
  const goal = '/-\n@@ telelean v1\nid: cynder-not-good';
  if (!text.includes(goal)) throw new Error('the chain model changed');
  const aux = (id: string, name: string, sentence: string) =>
    `/-\n@@ telelean v1\nid: ${id}\ntype: PROPOSITION\nnatural_name: ${sentence}\npremises: cynder-dark-past\nasserted: 2026-11-01\n-/\n/-- ${sentence} -/\nabbrev ${name} : Prop := HasDarkPast cynder\ntheorem ${name}.holds : ${name} := cynder_dark_past.holds\n\n`;
  const blocks = aux('aux-one', 'aux_one', 'Cynder is marked') + aux('aux-two', 'aux_two', 'Cynder is known') + aux('aux-three', 'aux_three', 'Cynder is feared');
  writeFileSync(file, text.replace(goal, `${blocks}${goal}`).replace('premises: link-two\n', 'premises: cynder-dark-past, new-spyro-pg\n'));
  return dir;
}

/** propose_arrow from `source` into T. */
export const proposeArrow = (source: string, target = T): FakeStep => ({ kind: 'callTool', tool: 'propose_arrow', args: { source, target, why: 'The proof could use it.' } });

/** Until the end confirmation's check is no longer running, and nothing judges (run.json as written). */
export async function checked(h: Harness, timeoutMs = 10_000): Promise<NonNullable<PersistedSession['confirmation']>> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const c = rawRun(h).session?.confirmation;
    if (c !== undefined && c.state !== 'running' && h.manager.session()?.judging === false && h.manager.session()?.confirmation?.check.state !== 'running') return c;
    if (Date.now() > until) throw new Error(`the final check did not end: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * The proved Spyro question (pgScript('proved') unless `options.script`) with every item decided by `decide` (default:
 * PG's Formalize and T's Result accepted, each its own Accept), submitted: the end confirmation, its check run.
 */
export async function confirmedStage(
  dispose: Array<() => void>,
  options: Parameters<typeof makeHarness>[0] = {},
  decide?: (h: Harness, runId: string) => Promise<void>,
): Promise<{ h: Harness; runId: string; checkId: string }> {
  const h = makeHarness({ script: [pgScript('proved')], ...options });
  dispose.push(() => h.dispose());
  scriptEnd(h);
  expect(await h.manager.start(START)).toMatchObject({ ok: true });
  const { runId } = await waitForStage(h.manager, 1);
  await settled(h);
  if (decide !== undefined) await decide(h, runId);
  else {
    for (const key of [PG, `proof:${T}`]) {
      expect(await h.manager.decide(runId, 1, true, [decision(h, key, 'accepted')], false)).toMatchObject({ ok: true });
      await settled(h);
    }
  }
  expect(await h.manager.submit(runId, 1)).toMatchObject({ ok: true });
  const c = await checked(h);
  return { h, runId, checkId: c.checkId };
}
