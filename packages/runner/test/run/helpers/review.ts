/**
 * Slice 2e (docs/slice2-plan.md 6.1's 2e list): fixtures and helpers for the review actions' tests, with the FakeBackend
 * and the fake engine (its stage judge is core `judgeState` on fake facts). The Spyro fixture's question: the target
 * cynder-not-good from its three axioms; the step formalises pg-no-dark-past (an AXIOM card with no Lean: a Formalize
 * item, a belief) and proves the target from it (a Result that depends on it), or does not.
 */
import type { ItemDecision, ItemRecord, ItemView, SessionView } from '@telelean/core';
import { expect } from 'vitest';

import type { FakeStep } from '../../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../../src/llm/fakeScripts.js';
import type { PersistedSession } from '../../../src/run/types.js';
import { rawRun, round1, START, step, type Harness } from './harness.js';

/** The end of pg-no-dark-past's block (its statement goes directly below it). */
export const PG_BLOCK_END = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
export const PG_STATEMENT =
  '/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n';
export const PG_FORMALISED = `stance: rule\nasserted: 2026-11-01\n-/\n${PG_STATEMENT}\n`;
export const GOAL_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
/** T's proof from pg-no-dark-past's statement (its Result depends on the Formalize item, RV-5). */
export const GOAL_PROOF = 'theorem cynder_not_good.holds : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
/** T's proof from the two axioms alone (its Result depends on no item). */
export const GOAL_PROOF_AXIOMS = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';

/** The step's steps: pg-no-dark-past formalised and frozen, then T proved from it (`proved`) or not. */
export function pgSteps(outcome: 'proved' | 'not-proved', summary = 'Done.'): FakeStep[] {
  const statements: FakeStep[] = [step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze()];
  if (outcome === 'proved') return [...statements, step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', summary), step.result()];
  return [...statements, step.finish('not_proved', summary), step.result()];
}

/** The start's turn with `pgSteps`. */
export const pgScript = (outcome: 'proved' | 'not-proved', summary?: string): FakeScriptTurn => round1(...pgSteps(outcome, summary));

/** The session's records as run.json holds them. */
export function session(h: Pick<Harness, 'shadow'>): PersistedSession {
  const s = rawRun(h).session;
  if (s === undefined) throw new Error('no session');
  return s;
}

/** A record by its key, as run.json holds it. */
export function record(h: Pick<Harness, 'shadow'>, key: string): ItemRecord {
  const r = session(h).items.find((x) => x.key === key);
  if (r === undefined) throw new Error(`no item ${key}`);
  return r;
}

/** The view's item for a key (by the record's id). */
export function viewItem(h: Pick<Harness, 'shadow' | 'manager'>, key: string): ItemView | undefined {
  const id = record(h, key).id;
  return h.manager.session()?.items.find((i) => i.id === id);
}

/** One decision on the item with `key`, at its current rev. */
export function decision(h: Pick<Harness, 'shadow'>, key: string, to: ItemDecision['to'], extra: Partial<ItemDecision> = {}): ItemDecision {
  const r = record(h, key);
  return { item: r.id, rev: r.rev, to, ...extra };
}

/** Waits until no judge runs or is due and the view is current (the session view says it is not judging). */
export async function settled(h: Pick<Harness, 'manager'>, timeoutMs = 10_000): Promise<SessionView> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = h.manager.session();
    if (v !== null && !v.judging && v.phase === 'stage') return v;
    if (Date.now() > until) throw new Error(`the session did not settle: ${JSON.stringify({ phase: v?.phase, judging: v?.judging })}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const T = START.target;
export const RESULT = `proof:${T}`;
export const PG = 'card:pg-no-dark-past';

/** The main file of ws/ now. */
export async function main(h: Pick<Harness, 'shadow'>): Promise<string> {
  return (await h.shadow().currentFiles()).get('Model/Spyro/Main.lean') ?? '';
}

/** run.json and ws/ agree: no write in flight, `head` the newest commit, ws/ its files. */
export async function consistent(h: Pick<Harness, 'shadow'>): Promise<void> {
  const s = session(h);
  const shadow = h.shadow();
  expect(s.inFlight).toBeUndefined();
  const newest = (await shadow.commits()).at(-1);
  expect(s.head).toBe(newest?.id);
  expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(newest?.id ?? ''));
}
