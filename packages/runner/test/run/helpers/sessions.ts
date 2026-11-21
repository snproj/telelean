/**
 * Slice 2d (docs/slice2-plan.md 6.1's 2d list): fixtures and script pieces for an edit session's tests, with the
 * FakeBackend and the fake engine (no Lean). The chain model is the Spyro fixture with two more propositions, so a
 * Formalize can have a three-target chain link-one → link-two → cynder-not-good (sources first):
 *
 *   link-one         ← cynder-dark-past
 *   link-two         ← link-one, new-spyro-pg
 *   cynder-not-good  ← link-two                 (its statement is written; the other two are code-less)
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { FakeStep } from '../../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../../src/llm/fakeScripts.js';
import { makeTempDir, SPYRO_FIXTURE } from './env.js';
import { step } from './harness.js';

export const MAIN = 'Model/Spyro/Main.lean';

const LINK_ONE_BLOCK = `/-
@@ telelean v1
id: link-one
type: PROPOSITION
natural_name: Cynder has a past that PG games exclude
premises: cynder-dark-past
asserted: 2026-11-01
-/
`;
const LINK_TWO_BLOCK = `/-
@@ telelean v1
id: link-two
type: PROPOSITION
natural_name: The new Spyro game excludes Cynder
premises: link-one, new-spyro-pg
asserted: 2026-11-01
-/
`;

/** A model folder: the Spyro fixture with link-one and link-two, and cynder-not-good resting on link-two only. */
export function chainModel(): string {
  const dir = path.join(makeTempDir('chain'), 'source');
  mkdirSync(dir, { recursive: true });
  cpSync(SPYRO_FIXTURE, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.lake`) });
  const file = path.join(dir, MAIN);
  const main = readFileSync(file, 'utf8');
  const goal = '/-\n@@ telelean v1\nid: cynder-not-good';
  if (!main.includes(goal)) throw new Error('the Spyro fixture changed');
  const rewired = main
    .replace('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'premises: link-two\n')
    .replace(goal, `${LINK_ONE_BLOCK}\n${LINK_TWO_BLOCK}\n${goal}`);
  writeFileSync(file, rewired);
  return dir;
}

export const CHAIN = [
  { target: 'link-one', premises: ['cynder-dark-past'] },
  { target: 'link-two', premises: ['link-one', 'new-spyro-pg'] },
  { target: 'cynder-not-good', premises: ['link-two'] },
];

/** The statement of link-one (directly below its block) and its proof. */
export const LINK_ONE_STATEMENT = '/-- Cynder has a past that PG games exclude -/\nabbrev link_one : Prop := HasDarkPast cynder\n';
export const LINK_ONE_PROOF = 'theorem link_one.holds : link_one := cynder_dark_past.holds\n';
export const LINK_TWO_STATEMENT = '/-- The new Spyro game excludes Cynder -/\nabbrev link_two : Prop := HasDarkPast cynder ∧ IsPG newSpyro\n';
export const LINK_TWO_PROOF = 'theorem link_two.holds : link_two := ⟨link_one.holds, new_spyro_pg.holds⟩\n';
export const GOAL_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
export const GOAL_PROOF = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => link_two.holds.1.elim\n';

const blockEnd = (block: string): string => block.slice(block.indexOf('natural_name'));

/** Formalises a code-less card of the chain: its statement directly below its block. */
export function formalise(card: 'link-one' | 'link-two', proof = false): FakeStep[] {
  const block = card === 'link-one' ? LINK_ONE_BLOCK : LINK_TWO_BLOCK;
  const statement = card === 'link-one' ? LINK_ONE_STATEMENT : LINK_TWO_STATEMENT;
  const holds = card === 'link-one' ? LINK_ONE_PROOF : LINK_TWO_PROOF;
  const steps: FakeStep[] = [step.edit(blockEnd(block), blockEnd(block) + statement), step.freeze(card)];
  if (proof) steps.push(step.edit(statement, statement + holds));
  return steps;
}

/** The turn of step `index` of `of` for `target` (a `formalize and prove` step). */
export const stepMatch = (index: number, of: number, target: string): string => `Step ${index} of ${of}: formalize and prove “${target}”`;

/** One scripted turn for a step. */
export function stepTurnScript(index: number, of: number, target: string, steps: FakeStep[]): FakeScriptTurn {
  return { match: stepMatch(index, of, target), steps };
}

/** A step proving link-one (formalised, frozen, proved). */
export const proveLinkOne = (index = 1, of = 3): FakeScriptTurn => stepTurnScript(index, of, 'link-one', [...formalise('link-one', true), step.finish('proved', 'link-one proved.'), step.result()]);
/** A step for link-one that formalises it and finishes not proved. */
export const failLinkOne = (index = 1, of = 3): FakeScriptTurn => stepTurnScript(index, of, 'link-one', [...formalise('link-one'), step.finish('not_proved', 'link-one does not follow.'), step.result()]);
/** A step proving link-two. */
export const proveLinkTwo = (index = 2, of = 3): FakeScriptTurn => stepTurnScript(index, of, 'link-two', [...formalise('link-two', true), step.finish('proved', 'link-two proved.'), step.result()]);
/** A step proving the goal from link-two. */
export const proveGoal = (index = 3, of = 3): FakeScriptTurn =>
  stepTurnScript(index, of, 'cynder-not-good', [step.freeze('cynder-not-good'), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'The goal is proved.'), step.result()]);
