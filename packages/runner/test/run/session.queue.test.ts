/**
 * Slice 2d (docs/slice2-plan.md 3.2-3.5, 6.1's 2d list): an edit session's queues and steps, with the FakeBackend and
 * the fake engine (its stage judge is core `judgeState` on fake facts):
 *   - a three-target chain: the order, one step each, each step turn's first line naming its target, the view read-only
 *     at the stage the queue found until the last step ends (D2-63), the stage then open with the steps' items;
 *   - A12: a source an earlier step of the queue did not prove makes the next step statements only (its turn, the tool
 *     refusals, its end), and its view equals the one in which the source was proved; cancelled, it goes to `retry`;
 *   - a give-up rolls back no further than S₀ and never undoes an earlier step;
 *   - Cancel step during step 2 of 3 (step 1's items kept, step 3 not run, the heading, Retry runs 2 and 3); Cancel of
 *     the first step (an empty stage with Retry); the caps per step;
 *   - while a step runs, every review action is refused with D2-62's text, but answering, Cancel step and Exit;
 *   - seals and queue numbers: the first queue none, each later queue exactly one, in its queue-start write.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { CLAUDE_SESSION_TEXTS, REVIEW_TEXTS, type RunView, type SessionView } from '@telelean/core';

import type { FakeStep } from '../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import { flushIo } from './helpers/env.js';
import { finding } from './helpers/fakeEngine.js';
import { makeHarness, phase, rawRun, rawStep, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import {
  CHAIN,
  chainModel,
  failLinkOne,
  formalise,
  GOAL_LINE,
  MAIN,
  proveGoal,
  proveLinkOne,
  proveLinkTwo,
  stepMatch,
  stepTurnScript,
} from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

function chainHarness(script: FakeScriptTurn[], extra: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness({ source: chainModel(), withFacts: false, script, ...extra });
  toDispose.push(() => h.dispose());
  return h;
}

const startChain = (h: Harness, inferences = CHAIN) => h.manager.formalize({ subject: 'Spyro', inferences });

/** The session views posted while the queue ran (the change events with `session`). */
function sessionViews(h: Harness): SessionView[] {
  const out: SessionView[] = [];
  h.manager.onDidChange((c) => {
    const v = c.session ? h.manager.session() : null;
    if (v !== null) out.push(v);
  });
  return out;
}

describe('a three-target chain (§3.2, §3.3, D2-63)', () => {
  it('sources first, one step each, each turn naming its target; the view keeps the stage the queue found until the last step ends', async () => {
    const h = chainHarness([proveLinkOne(), proveLinkTwo(), proveGoal()]);
    const views = sessionViews(h);
    // The request in another order: formalizeOrder puts sources first.
    expect(await startChain(h, [CHAIN[2], CHAIN[0], CHAIN[1]].filter((x) => x !== undefined))).toMatchObject({ ok: true });
    const stage = await waitForStage(h.manager, 1);
    const played = h.player?.played ?? [];
    expect(played.map((p) => p.scripted)).toEqual([0, 1, 2]);
    expect(played[0]?.turn.startsWith('Run: "Formalize for dependencies" for the subject Spyro')).toBe(true);
    expect(played[0]?.turn).toContain('FORMALIZE PLAN (one step per target, in this order; each step proves its target from its own question)\n1. link-one: "Cynder has a past that PG games exclude" ← from cynder-dark-past\n2. link-two: "The new Spyro game excludes Cynder" ← from link-one, new-spyro-pg\n3. cynder-not-good:');
    expect(played[0]?.turn).toContain(`\n${stepMatch(1, 3, 'link-one')}\n`);
    expect(played[1]?.turn.split('\n')[0]).toBe(stepMatch(2, 3, 'link-two'));
    expect(played[2]?.turn.split('\n')[0]).toBe(stepMatch(3, 3, 'cynder-not-good'));
    // One step each, in one queue, each its own round (fresh caps).
    const raw = rawRun(h);
    expect(raw.session?.steps.map((s) => [s.id, s.target, s.state, s.queue, s.round])).toEqual([
      ['s1', 'link-one', 'passed', 1, 1],
      ['s2', 'link-two', 'passed', 1, 2],
      ['s3', 'cynder-not-good', 'passed', 1, 3],
    ]);
    expect(raw.session?.inferences.map((i) => [i.target, i.order, i.steps])).toEqual([
      ['link-one', 0, ['s1']],
      ['link-two', 1, ['s2']],
      ['cynder-not-good', 2, ['s3']],
    ]);
    // Until the stage opened, every posted view showed stage 0 with no item, every action closed (D2-62, D2-63).
    const during = views.filter((v) => v.phase === 'step');
    expect(during.length).toBeGreaterThan(3);
    for (const v of during) {
      expect(v.stage).toBe(0);
      expect(v.items).toEqual([]);
      expect(v.formalize).toEqual({ ok: false, reason: REVIEW_TEXTS.formalizeStepRunning });
    }
    expect(stage.session).toEqual({ stage: 1, phase: 'stage' });
    // The stage: each step's items (two Formalize items, three Results, in the list's order by card), each step's
    // created declarations.
    const view = h.manager.session();
    expect(view?.items.map((i) => [i.kind, i.status, i.origin.target])).toEqual([
      ['formalize', 'in-review', 'link-one'],
      ['result', null, 'link-one'],
      ['formalize', 'in-review', 'link-two'],
      ['result', null, 'link-two'],
      ['result', null, 'cynder-not-good'],
    ]);
    expect(raw.session?.ledger.filter((e) => e.kind === 'created').map((e) => [e.kind === 'created' ? e.name : '', e.kind === 'created' ? e.phase : '', e.kind === 'created' ? e.step : ''])).toEqual(
      expect.arrayContaining([
        ['Spyro.link_one', 'statements', 's1'],
        ['Spyro.link_one.holds', 'proof', 's1'],
        ['Spyro.link_two', 'statements', 's2'],
        ['Spyro.cynder_not_good.holds', 'proof', 's3'],
      ]),
    );
    expect(h.engine.methods().filter((m) => m === 'judge')).toHaveLength(1);
  });
});

describe('A12, statements only (D2-4, §3.3)', () => {
  const statementsOnlyStep = (index: number, target: 'link-two'): FakeScriptTurn => ({
    match: `Step ${index} of 3: formalize the statements of “${target}” (no proof: “link-one” was not proved)`,
    steps: [
      { kind: 'callTool', tool: 'propose_arrow', args: { source: 'cynder-dark-past', target, why: 'needed' } },
      step.propose({ lean_name: 'x_premise' }),
      ...formalise(target),
      step.finish('not_proved', 'Statements only: link-one was not proved.'),
      step.result(),
    ],
  });

  it('a source an earlier step did not prove: the next step formalises only (its turn, the tool refusals, a not-proved end); its view equals the one where the source was proved', async () => {
    const run = async (first: FakeScriptTurn, second: FakeScriptTurn) => {
      // One run id and one clock for the twins: the views carry ids and times.
      const h = chainHarness([first, second], { newRunId: () => 'rtwin000001', now: () => new Date('2026-11-20T00:00:00.000Z') });
      expect(await startChain(h, CHAIN.slice(0, 2))).toMatchObject({ ok: true });
      await waitForStage(h.manager, 1);
      return h;
    };
    const proved = await run(proveLinkOne(1, 2), proveLinkTwo(2, 2));
    const notProved = await run(failLinkOne(1, 2), { ...statementsOnlyStep(2, 'link-two'), match: 'Step 2 of 2: formalize the statements of “link-two” (no proof: “link-one” was not proved)' });
    expect(notProved.player?.played[1]?.turn.split('\n')[0]).toBe('Step 2 of 2: formalize the statements of “link-two” (no proof: “link-one” was not proved)');
    expect(notProved.player?.played[1]?.turn).toContain('This step only formalises the statements');
    const s2 = rawStep(notProved, 's2');
    expect(s2.scope).toMatchObject({ statementsOnly: 'link-one', openProof: false, openArrows: false });
    expect(s2).toMatchObject({ state: 'passed', lastFinish: { status: 'not_proved' } });
    // propose_arrow and propose_assumption answer A12's refusal, uncounted.
    const transcript = (await import('node:fs')).readFileSync(`${notProved.shadow().paths.sessionDir}/transcript.jsonl`, 'utf8');
    expect(transcript.split(CLAUDE_SESSION_TEXTS.statementsOnly('link-one')).length - 1).toBeGreaterThanOrEqual(2);
    const results = transcript
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { kind: string; event?: { type: string; text?: string } })
      .filter((e) => e.kind === 'event' && e.event?.type === 'tool_result')
      .map((e) => e.event?.text ?? '');
    expect(results.filter((r) => r === `Arrow refused: ${CLAUDE_SESSION_TEXTS.statementsOnly('link-one')}`)).toHaveLength(1);
    expect(results.filter((r) => r === `Proposal rejected: ${CLAUDE_SESSION_TEXTS.statementsOnly('link-one')}`)).toHaveLength(1);
    expect(rawRun(notProved).session?.ledger.some((e) => e.kind === 'arrow')).toBe(false);
    expect(rawRun(notProved).session?.premises).toEqual([]);
    // While the results are hidden, the two sessions' views are the same, byte for byte (fixer 2d r1, F-V2D-FC-9), and
    // so are their RunViews apart from progress counts, usage and times.
    const shape = (v: SessionView | null) => v?.items.map((i) => [i.id, i.kind, i.status, i.label]);
    expect(proved.manager.session()?.results.shown).toBe(false);
    expect(shape(notProved.manager.session())).toEqual(shape(proved.manager.session()));
    expect(JSON.stringify(notProved.manager.session())).toBe(JSON.stringify(proved.manager.session()));
    const strip = (v: RunView | null) => {
      const x = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
      for (const k of ['counters', 'usage', 'updatedAt', 'startedAt', 'endedAt']) delete x[k];
      return JSON.stringify(x);
    };
    expect(strip(notProved.manager.current())).toBe(strip(proved.manager.current()));
  });

  it('a statements-only step that fails (a turn cap) goes to `retry` like any step (F3)', async () => {
    const h = chainHarness(
      [failLinkOne(1, 2), { match: 'Step 2 of 2: formalize the statements of “link-two”', steps: [step.usage('a'), step.usage('b'), step.usage('c'), step.check(), step.result()] }],
      { caps: { maxTurns: 2 } },
    );
    expect(await startChain(h, CHAIN.slice(0, 2))).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('passed');
    expect(rawStep(h, 's2')).toMatchObject({ state: 'failed', scope: { statementsOnly: 'link-one' } });
    expect(rawRun(h).session?.retry).toEqual(['s2']);
  });

  it('a statements-only step cancelled goes to `retry` like any step (F3)', async () => {
    const h = chainHarness([failLinkOne(1, 2), { match: 'Step 2 of 2: formalize the statements of “link-two”', steps: [{ kind: 'sleep', ms: 60_000 }] }]);
    expect(await startChain(h, CHAIN.slice(0, 2))).toMatchObject({ ok: true });
    await waitForRun(h.manager, (v) => v.step?.index === 2 && v.state === 'working');
    expect(await h.manager.cancel(h.manager.current()?.runId ?? '')).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's2')).toMatchObject({ state: 'cancelled', scope: { statementsOnly: 'link-one' } });
    expect(rawRun(h).session?.retry).toEqual(['s2']);
  });
});

describe('how a step ends (§3.4)', () => {
  it('a give-up rolls back no further than S₀, and never undoes an earlier step; with no freeze, all the step wrote goes', async () => {
    const h = chainHarness([
      proveLinkOne(1, 2),
      // Step 2 formalises link-two's statement without freezing it, then fails the gate three times.
      stepTurnScript(2, 2, 'link-two', [...formalise('link-two').slice(0, 1), step.finish('proved'), step.finish('proved'), step.finish('proved'), step.result()]),
    ]);
    h.engine.onGate = (ctx) => (ctx.selection.target === 'link-two' ? { findings: [finding('not-frozen', 'freeze first')] } : undefined);
    expect(await startChain(h, CHAIN.slice(0, 2))).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const s2 = rawStep(h, 's2');
    expect(s2.state).toBe('gave-up');
    const files = await h.shadow().currentFiles();
    // ws/ is step 2's S₀: step 1's statement and proof stay.
    expect(files).toEqual(await h.shadow().filesAt(s2.startCommit ?? ''));
    expect(files.get(MAIN)).toContain('theorem link_one.holds');
    expect(files.get(MAIN)).not.toContain('abbrev link_two'); // what step 2 wrote went with the rollback
    expect(rawStep(h, 's1').state).toBe('passed');
    // Both notices name the state the rollback went to: step 2's S₀, never step 1's passing state (fixer 2d r1,
    // F-V2D-FC-3; the fake core's gave-up text carries the label it is given).
    const notices = rawRun(h).view.notices.map((n) => [n.kind, n.text]);
    expect(notices).toContainEqual(['gave-up', 'FAKE gave up after 3: not-frozen; reverted to Step 2 of 2 starts: “link-two”']);
    expect(notices).toContainEqual(['reverted', 'telelean reverted Claude\'s working copy to “Step 2 of 2 starts: “link-two”” (the checks failed 3 times).']);
  });

  it('RV-13: a step that proposes nothing passes, and its report line is shown with the results; a step whose only proposal is a premise has none', async () => {
    const reason = 'REASON-NOTHING: the premises say nothing about it.';
    const nothing = makeHarness({ script: [round1(step.finish('not_proved', reason), step.result())] });
    toDispose.push(() => nothing.dispose());
    await nothing.manager.start(START);
    await waitForStage(nothing.manager, 1);
    // A passed step always ends on a new gate-pass commit: "nothing" is read from the files and the proposals.
    const s1 = rawStep(nothing, 's1');
    expect(s1).toMatchObject({ state: 'passed', proposedNothing: true });
    expect(s1.endCommit).not.toBe(s1.startCommit);
    const view = nothing.manager.session();
    expect(view?.results.shown).toBe(true);
    expect(view?.report.steps.map((x) => x.proposedNothing)).toEqual([REVIEW_TEXTS.proposedNothing(reason)]);
    // A premise draft is a proposal, though it changes no file in ws/.
    const premise = makeHarness({ script: [round1(step.freeze(), step.propose(), step.finish('not_proved', 'It needs a premise.'), step.result())] });
    toDispose.push(() => premise.dispose());
    await premise.manager.start(START);
    await waitForStage(premise.manager, 1);
    expect(rawStep(premise, 's1').state).toBe('passed');
    expect(rawStep(premise, 's1').proposedNothing).toBeUndefined();
    expect(await premise.shadow().filesAt(rawStep(premise, 's1').startCommit ?? '')).toEqual(await premise.shadow().currentFiles());
    expect(premise.manager.session()?.results.shown).toBe(true);
    expect(premise.manager.session()?.report.steps.map((x) => x.proposedNothing)).toEqual([undefined]);
    // (2d's review, R1-2) An ordinary passed step, one that wrote its proof (no arrow, no premise), proposed something:
    // its end files differ from S₀'s, so it has no `proposedNothing`, and its report line none once the results show.
    const proof = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
    const proved = makeHarness({ script: [round1(step.freeze(), step.edit(GOAL_LINE, GOAL_LINE + proof), step.finish('proved', 'Proved.'), step.result())] });
    toDispose.push(() => proved.dispose());
    await proved.manager.start(START);
    await waitForStage(proved.manager, 1);
    expect(rawStep(proved, 's1')).toMatchObject({ state: 'passed', lastFinish: { status: 'proved' } });
    expect(rawStep(proved, 's1').proposedNothing).toBeUndefined();
    expect((await proved.shadow().currentFiles()).get(MAIN)).toContain(proof);
    expect(proved.manager.session()?.results.shown).toBe(true);
    expect(proved.manager.session()?.report.steps.map((x) => x.proposedNothing)).toEqual([undefined]);
  });

  it('the caps apply per step: two steps of 3 turns each pass under a cap of 4 turns', async () => {
    const turns = (id: string): FakeStep[] => [step.usage(`${id}-a`), step.usage(`${id}-b`), step.usage(`${id}-c`)];
    const h = chainHarness(
      [
        stepTurnScript(1, 2, 'link-one', [...turns('one'), ...formalise('link-one', true), step.finish('proved'), step.result()]),
        stepTurnScript(2, 2, 'link-two', [...turns('two'), step.finish('not_proved'), step.result()]),
      ],
      { caps: { maxTurns: 4 } },
    );
    expect(await startChain(h, CHAIN.slice(0, 2))).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1')).toMatchObject({ state: 'passed', counters: { turns: 3 } });
    expect(rawStep(h, 's2')).toMatchObject({ state: 'passed', counters: { turns: 3 } });
    expect(rawRun(h).view.usage.requests).toBe(6);
  });
});

describe('Cancel step and Retry step (§3.4, D2-29, D2-44, D2-55)', () => {
  it('Cancel during step 2 of 3: step 1\'s items are kept, step 3 reads "not run", the heading shows; Retry runs steps 2 and 3', async () => {
    const h = chainHarness([proveLinkOne(), stepTurnScript(2, 3, 'link-two', [...formalise('link-two'), { kind: 'sleep', ms: 60_000 }]), proveLinkTwo(1, 2), proveGoal(2, 2)]);
    expect(await startChain(h)).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, (v) => v.step?.index === 2 && v.counters.checks === 1);
    const s2Start = rawStep(h, 's2').startCommit ?? '';
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true, label: 'Step cancelled' });
    await waitForStage(h.manager, 1);
    // ws/ is back at step 2's S₀; its freeze and statement are gone; step 1's work stays.
    expect(await h.shadow().currentFiles()).toEqual(await h.shadow().filesAt(s2Start));
    const raw = rawRun(h);
    expect(raw.session?.steps.map((s) => [s.id, s.state])).toEqual([
      ['s1', 'passed'],
      ['s2', 'cancelled'],
      ['s3', 'not-run'],
    ]);
    expect(raw.session?.retry).toEqual(['s2', 's3']);
    expect(raw.session?.heading).toMatchObject({ kind: 'cancelled', text: REVIEW_TEXTS.stepCancelled, firstStep: false });
    const view = h.manager.session();
    expect(view?.steps.map((s) => [s.id, s.state])).toEqual([
      ['s1', 'ended'],
      ['s2', 'cancelled'],
      ['s3', 'not-run'],
    ]);
    expect(view?.heading).toMatchObject({ kind: 'cancelled', retry: { ok: true } });
    // Step 1's items stand: link-one's Formalize and its Result; nothing of the cancelled step.
    const keys = raw.session?.items.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['card:link-one', 'proof:link-one']));
    expect(keys?.some((k) => k.includes('link-two') || k.includes('cynder-not-good'))).toBe(false);
    const ids = raw.session?.items.map((r) => r.id);
    // Retry step: the cancelled step and the one its queue dropped run again, as a new queue, with fresh caps.
    expect(await h.manager.retry(working.runId)).toEqual({ ok: true, label: 'Claude is working on “The new Spyro game excludes Cynder”', undoable: false });
    await waitForRun(h.manager, phase('stage'));
    await waitForStage(h.manager, 1);
    const after = rawRun(h);
    expect(after.session?.steps.map((s) => [s.id, s.state, s.queue, s.retryOf])).toEqual([
      ['s1', 'passed', 1, undefined],
      ['s2', 'cancelled', 1, undefined],
      ['s3', 'not-run', 1, undefined],
      ['s4', 'passed', 2, 's2'],
      ['s5', 'passed', 2, 's3'],
    ]);
    expect(after.session?.stage).toBe(1);
    expect(after.session?.retry).toEqual([]);
    expect(after.session?.heading).toBeUndefined();
    // Items stay stable across the queues: step 1's keep their ids; the retried steps' items join the stage.
    expect(after.session?.items.filter((r) => ids?.includes(r.id)).map((r) => r.id)).toEqual(ids);
    expect(after.session?.items.map((r) => r.key)).toEqual(expect.arrayContaining(['card:link-two', 'proof:link-two', 'proof:cynder-not-good']));
    expect(h.player?.played.map((p) => p.turn.split('\n')[0]).slice(-2)).toEqual([stepMatch(1, 2, 'link-two'), stepMatch(2, 2, 'cynder-not-good')]);
  });

  it('Cancel of the first step: an empty stage, with Retry step (and Exit)', async () => {
    const h = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const working = await waitForRun(h.manager, (v) => v.counters.checks === 1);
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
    const stage = await waitForStage(h.manager, 1);
    expect(stage.state).toBe('review');
    const view = h.manager.session();
    expect(view?.items).toEqual([]);
    expect(view?.heading).toMatchObject({ kind: 'cancelled', firstStep: true, retry: { ok: true } });
    expect(rawRun(h).session?.retry).toEqual(['s1']);
  });

  it('Retry is refused while a step runs (D2-62) and when nothing was cancelled', async () => {
    const h = makeHarness({ script: [round1(step.finish('not_proved'), step.result())] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const v = await waitForStage(h.manager, 1);
    expect(await h.manager.retry(v.runId)).toMatchObject({ ok: false, code: 'conflict', error: REVIEW_TEXTS.nothingToRetry });
  });

  it('Cancel step while Claude waits for an answer: the question goes with the step (none waits in run.json or the RunView)', async () => {
    const h = makeHarness({ script: [round1(step.ask(), step.finish('not_proved'), step.result())] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    expect(rawRun(h).pendingAsk).toBeDefined();
    expect(await h.manager.cancel(waiting.runId)).toMatchObject({ ok: true, label: 'Step cancelled' });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.pendingAsk).toBeUndefined();
    expect(raw.view.pendingQuestions).toBeUndefined();
    expect(h.manager.current()?.pendingQuestions).toBeUndefined();
    expect(raw.session?.steps.map((s) => s.state)).toEqual(['cancelled']);
  });

  it('a target whose only step was cancelled is asked as new by a mid-stage Formalize: its question is the new one, and the stage judges its proof with it (§3.2, fixer 2d r1, A-F1)', async () => {
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const h = makeHarness({
      script: [
        round1({ kind: 'sleep', ms: 60_000 }),
        { match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.freeze(), step.edit(goal, `${goal}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`), step.finish('proved'), step.result()] },
      ],
    });
    toDispose.push(() => h.dispose());
    // Q1: new-spyro-pg alone; the step is cancelled, so the target has no Result.
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['new-spyro-pg'] }] })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, state('working'));
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(true);
    // Q2: cynder-dark-past alone, which the new step's proof uses.
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: working.runId, stage: 1 })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.session?.steps.map((s) => [s.id, s.state, s.scope.question.sources])).toEqual([
      ['s1', 'cancelled', ['new-spyro-pg']],
      ['s2', 'passed', ['cynder-dark-past']],
    ]);
    expect(raw.session?.inferences.map((i) => [i.target, i.question])).toEqual([['cynder-not-good', { sources: ['cynder-dark-past'], fromNothing: false }]]);
    // Judged with the new question: the proof passes B.2, so its Result is in review, never taken out to be redone.
    const result = raw.session?.items.find((r) => r.key === 'proof:cynder-not-good');
    expect(result).toMatchObject({ status: 'in-review' });
    expect(result?.redo).toBeUndefined();
    const view = h.manager.session();
    expect(view?.results.shown).toBe(true);
    expect(view?.inferences.map((i) => [i.target.id, i.question.map((q) => q.id)])).toEqual([['cynder-not-good', ['cynder-dark-past']]]);
    expect(h.manager.current()?.premises).toEqual(['cynder-dark-past']);
  });

  it('a judge that cannot run at a later queue\'s end: the stage opens with no judgement, the earlier one neither kept nor persisted, and Submit closed (fixer 2d r1, A-F4)', async () => {
    const h = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 }), { match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.finish('not_proved', 'Nothing more.'), step.result()] }] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const working = await waitForRun(h.manager, (v) => v.counters.checks === 1);
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    expect(rawRun(h).session?.judged).toBeDefined();
    // The retried step's queue ends, and its judge cannot run.
    h.engine.onJudge = () => {
      throw new Error('the shadow history could not be read');
    };
    expect(await h.manager.retry(working.runId)).toMatchObject({ ok: true });
    await waitForRun(h.manager, (v) => v.session?.phase === 'stage' && rawRun(h).session?.steps[1]?.state === 'passed');
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.session?.judged).toBeUndefined();
    expect(raw.view.notices.map((n) => n.text)).toContainEqual('telelean could not check the working copy (the shadow history could not be read).');
    const view = h.manager.session();
    expect(view?.phase).toBe('stage');
    expect(view?.submit.gate.ok).toBe(false);
  });
});

describe('while a step runs, the session takes no action (D2-62, §2.5)', () => {
  it('every review action is refused with D2-62\'s text; answering, Cancel step and Exit are not', async () => {
    const h = makeHarness({ script: [round1(step.ask(), step.finish('not_proved'), step.result())] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    const runId = waiting.runId;
    const m = h.manager;
    const refused = { ok: false, code: 'refused', error: REVIEW_TEXTS.stepRunning };
    expect(await m.decide(runId, 0, true, [{ item: 'x', rev: 1, to: 'accepted' }], false)).toEqual(refused);
    // 2j2 (D2-92, D2-95): the note on an item to be redone, as every review action.
    expect(await m.note(runId, 0, 'x', 1, 'a note')).toEqual(refused);
    expect(await m.reveal(runId, 0, 'show-result')).toEqual(refused);
    expect(await m.undoSession(runId, 1, false)).toEqual(refused);
    expect(await m.redoSession(runId, 1, false)).toEqual(refused);
    expect(await m.moveProposed(runId, { 'cynder-not-good': { x: 1, y: 2 } })).toEqual(refused);
    expect(await m.submit(runId, 0)).toEqual(refused);
    expect(await m.retry(runId)).toEqual(refused);
    expect(await m.sessionDiff(runId, 0, true)).toEqual(refused);
    expect(await m.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['new-spyro-pg'] }], runId, stage: 0 })).toEqual(refused);
    expect(await m.end(runId, 'apply', 0, 'c')).toEqual(refused);
    expect(await m.end(runId, 'back', 0)).toEqual(refused);
    // Exit is never refused for a running step: it ends the session (2f; session.end.test.ts "Exit stops a running step").
    // Answering Claude's question goes through, and so does Cancel step.
    expect(await m.answer(runId, 'q1', [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }])).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    // In the stage the actions are no longer refused for a running step (2e builds them: an unknown item is `conflict`;
    // 2f the end and the moves: Back to review with no end confirmation is `conflict`, a card no view has `not-found`).
    expect(await m.decide(runId, 1, true, [{ item: 'x', rev: 1, to: 'accepted' }], false)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.conflict('x') });
    expect(await m.end(runId, 'back', 1)).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(await m.moveProposed(runId, { 'no-such-card': { x: 1, y: 2 } })).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('a mid-stage Formalize is refused while the results are hidden (D2-65) and for a stale stage', async () => {
    const h = chainHarness([proveLinkOne(1, 1)]);
    expect(await startChain(h, CHAIN.slice(0, 1))).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(false);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [CHAIN[1] as (typeof CHAIN)[number]], runId: v.runId, stage: 1 })).toEqual({
      ok: false,
      code: 'invalid',
      error: REVIEW_TEXTS.formalizeResultsHidden,
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [CHAIN[1] as (typeof CHAIN)[number]], runId: v.runId, stage: 2 })).toMatchObject({ ok: false, code: 'conflict' });
    expect(rawRun(h).session?.stack.done).toEqual([]);
  });
});

describe('a mid-stage Formalize (RV-9, D2-63) and the seals (§4.6, fixer 2b3a r1, C-V2B3A-C1)', () => {
  it('seals the stack once, numbers its queue, and its items join the stage when its queue ends; the first queue has no seal', async () => {
    // The first queue proves the goal from the two axioms, so its only item is a Result: the results are shown.
    const h = makeHarness({
      script: [
        round1(step.freeze(), step.edit(GOAL_LINE, `${GOAL_LINE}theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n`), step.finish('proved'), step.result()),
      ],
    });
    toDispose.push(() => h.dispose());
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    expect(rawRun(h).session?.stack.done).toEqual([]);
    expect(rawStep(h, 's1').queue).toBe(1);
    expect(h.manager.session()?.results.shown).toBe(true);
    const before = rawRun(h).session?.items.map((r) => [r.id, r.key]);
    // A new target in the stage: no consent, sources first, one seal, the next queue number.
    // (pg-no-dark-past is an axiom card: the start check refuses it as a target, so ask about cynder-not-good again.)
    expect(
      await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'pg-no-dark-past', premises: [] }], runId: v.runId, stage: 1 }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(rawRun(h).session?.stack.done).toEqual([]);
    const reask = await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: v.runId, stage: 1 });
    expect(reask).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.session?.stack.done.map((a) => [a.kind, a.kind === 'seal' ? a.by : ''])).toEqual([['seal', 'formalize']]);
    expect(raw.session?.steps.map((s) => [s.id, s.queue, s.scope.question.sources])).toEqual([
      ['s1', 1, ['cynder-dark-past', 'new-spyro-pg']],
      ['s2', 2, ['cynder-dark-past']],
    ]);
    expect(raw.session?.stage).toBe(1);
    // The earlier items keep their records.
    expect(raw.session?.items.filter((r) => before?.some((b) => b[0] === r.id)).map((r) => [r.id, r.key])).toEqual(before);
    // Seals number one less than the newest queue.
    const seals = raw.session?.stack.done.filter((a) => a.kind === 'seal').length ?? -1;
    expect(seals).toBe(Math.max(...(raw.session?.steps.map((s) => s.queue ?? 1) ?? [])) - 1);
  });
});

describe('queue numbers and seals after Retry (fixer 2b3a r1)', () => {
  it('a Retry queue writes exactly one seal and gives its steps the next number, in its queue-start write', async () => {
    const h = makeHarness({ script: [round1(step.check(), { kind: 'sleep', ms: 60_000 })] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const working = await waitForRun(h.manager, (v) => v.counters.checks === 1);
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    expect(await h.manager.retry(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    await flushIo();
    const raw = rawRun(h);
    expect(raw.session?.stack.done.map((a) => (a.kind === 'seal' ? a.by : a.kind))).toEqual(['retry']);
    expect(raw.session?.steps.map((s) => [s.id, s.queue])).toEqual([
      ['s1', 1],
      ['s2', 2],
    ]);
    // The queue-start commit is the retried step's S₀.
    expect(rawStep(h, 's2').startCommit).toBe((await h.shadow().commits()).filter((c) => c.kind === 'step-start').at(-1)?.id);
  });
});

