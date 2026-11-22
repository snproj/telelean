/**
 * Slice 2e (docs/slice2-plan.md 6.1's 2e list): fixtures and helpers for the review actions' tests, with the FakeBackend
 * and the fake engine (its stage judge is core `judgeState` on fake facts). The Spyro fixture's question: the target
 * cynder-not-good from its three axioms; the step formalises pg-no-dark-past (an AXIOM card with no Lean: a Formalize
 * item, a belief) and proves the target from it (a Result that depends on it), or does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { judgeState, type GateFinding, type ItemDecision, type ItemRecord, type ItemView, type SessionView } from '@telelean/core';
import { expect } from 'vitest';

import { filesKey } from '../../../src/gate/engine.js';
import type { FakeStep } from '../../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../../src/llm/fakeScripts.js';
import type { PersistedSession } from '../../../src/run/types.js';
import { fakeModel } from './fakeEngine.js';
import { rawRun, round1, START, step, type Harness } from './harness.js';
import { chainModel } from './sessions.js';

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

/**
 * A gate that runs core's own step rules of the given codes (judgeState at the step's purpose, on fake facts, with the
 * session's records, S₀ and StepScope as the runner passes them) and reports only their findings, else the fake
 * engine's default verdict (`not-frozen` for finish(proved) without a freeze). Each gate call's findings are kept.
 */
export function rulesGate(h: Pick<Harness, 'engine'>, codes: ReadonlyArray<GateFinding['code']>): GateFinding[][] {
  const seen: GateFinding[][] = [];
  h.engine.onGate = async (ctx) => {
    const s = ctx.session;
    if (s?.scope === undefined || s.stepStartCommit === undefined) return undefined;
    const shadow = ctx.shadow;
    const base = (await shadow.commits()).find((c) => c.kind === 'base');
    const files = await shadow.currentFiles();
    const judgement = judgeState({
      purpose: ctx.status === 'proved' ? 'gate-proved' : 'gate-other',
      stage: ctx.stage,
      commit: 'gate',
      filesKey: filesKey(files),
      base: fakeModel(await shadow.filesAt(base?.id ?? ''), shadow.library),
      current: fakeModel(files, shadow.library),
      stepStart: fakeModel(await shadow.filesAt(s.stepStartCommit), shadow.library),
      scope: s.scope,
      inferences: s.inferences,
      ledger: s.ledger,
      items: s.items,
      premises: s.premises,
      ended: s.ended,
      rejectedArrows: s.rejectedArrows,
      ...(s.noAlternative === true ? { noAlternative: true } : {}),
    });
    const findings = judgement.stepFindings.filter((f) => codes.includes(f.code));
    seen.push(findings);
    return findings.length > 0 ? { findings } : undefined;
  };
  return seen;
}

/** finish with `no_alternative` (DO-3). */
export const finishNoAlternative = (status: 'proved' | 'not_proved' = 'proved', summary = 'No other arrangement.'): FakeStep => ({
  kind: 'callTool',
  tool: 'finish',
  args: { status, summary, assumed_without_asking: [], no_alternative: true },
});

/** The review action ids on the done stack, as `kind` (a seal as `seal:<by>`). */
export function stackKinds(h: Pick<Harness, 'shadow'>): string[] {
  return session(h).stack.done.map((a) => (a.kind === 'seal' ? `seal:${a.by}` : a.kind));
}

/**
 * A model folder in which two targets share a code-less source: the Spyro fixture with link-one resting on
 * pg-no-dark-past (an AXIOM card with no Lean), and cynder-not-good resting on pg-no-dark-past alone.
 */
export function sharedModel(): string {
  const dir = chainModel();
  const file = path.join(dir, 'Model/Spyro/Main.lean');
  const text = readFileSync(file, 'utf8');
  const rewired = text.replace('id: link-one\ntype: PROPOSITION\nnatural_name: Cynder has a past that PG games exclude\npremises: cynder-dark-past\n', 'id: link-one\ntype: PROPOSITION\nnatural_name: Cynder has a past that PG games exclude\npremises: pg-no-dark-past\n');
  const goal = rewired.replace('premises: link-two\n', 'premises: pg-no-dark-past\n');
  if (goal === text || goal === rewired) throw new Error('the chain model changed');
  writeFileSync(file, goal);
  return dir;
}

/**
 * A model folder for Claude's arrow from a proved card (D2-20, D2-50): the Spyro fixture with x-rule (an AXIOM card with
 * no Lean) and cynder-excluded (L: a PROPOSITION proved in B from cynder-dark-past, with x-rule also drawn into it),
 * before cynder-not-good (T).
 */
export const L_PROOF_B = 'theorem cynder_excluded.holds : cynder_excluded := cynder_dark_past.holds\n';
export const X_BLOCK_END = 'natural_name: Characters with dark pasts are excluded from PG games\nrationale: house rule\nasserted: 2026-11-01\n-/\n';
export function arrowModel(): string {
  const dir = chainModel();
  const file = path.join(dir, 'Model/Spyro/Main.lean');
  const text = readFileSync(file, 'utf8');
  const goal = '/-\n@@ telelean v1\nid: cynder-not-good';
  const blocks =
    `/-\n@@ telelean v1\nid: x-rule\ntype: AXIOM\n${X_BLOCK_END}\n` +
    '/-\n@@ telelean v1\nid: cynder-excluded\ntype: PROPOSITION\nnatural_name: Cynder is excluded\npremises: cynder-dark-past, x-rule\nasserted: 2026-11-01\n-/\n' +
    `/-- Cynder is excluded -/\nabbrev cynder_excluded : Prop := HasDarkPast cynder\n${L_PROOF_B}\n`;
  if (!text.includes(goal)) throw new Error('the chain model changed');
  writeFileSync(file, text.replace(goal, `${blocks}${goal}`).replace('premises: link-two\n', 'premises: cynder-dark-past, new-spyro-pg\n'));
  return dir;
}
