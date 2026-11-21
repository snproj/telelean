/**
 * Slice 2d (docs/slice2-plan.md 2.3, 2.5, 3.2, 3.12, 6.1's 2d list): what a session shows, and when its calls resolve,
 * with the FakeBackend and the fake engine:
 *   - while the results are hidden, the posted SessionView and RunView hold no Result's verdict, proof text, lemma name,
 *     arrow or premise item, or Claude's words; a session's RunView has no `frozen`, and its `activity` and `notices`
 *     are empty arrays that core's validator accepts (AF9, D2-68);
 *   - AF14: `retry` and `formalize` resolve once their queue's first step is working, so Claude's question in a Retry
 *     queue's step 2 and in a mid-stage Formalize's first step is answered;
 *   - a re-asked target (D2-46): a Cancel leaves ws/ at S₀ with the old question and the accepted Result standing; a
 *     give-up and a not-proved end keep the step's statement items and take the rest back to S₀; a proof replaces the
 *     question and gives the Result a new version; while the results are hidden the three ended cases show the same
 *     SessionView and the same RunView inferences (AF5); once shown, the old question, the Result and the note.
 */
import { writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { hostMessage, parseHostToWebview, REVIEW_TEXTS, type ItemRecord, type RunView, type SessionView } from '@telelean/core';

import type { FakeStep } from '../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import type { PersistedRun } from '../../src/run/types.js';
import { cleanup } from './helpers/env.js';
import { fakeModel, finding, okReport } from './helpers/fakeEngine.js';
import { makeHarness, rawRun, rawStep, readJson, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { CHAIN, chainModel, formalise, LINK_ONE_STATEMENT, MAIN, stepMatch, stepTurnScript } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

describe('nothing hidden reaches the views while the results are hidden (§4.7, D2-10, AF9, D2-68)', () => {
  it('no verdict, proof, lemma, arrow or premise item, nor Claude\'s words in the SessionView or the RunView; the RunView valid, without frozen', async () => {
    const lemma = 'theorem secret_lemma_xyz : HasDarkPast cynder := cynder_dark_past.holds\n';
    const proof = 'theorem link_one.holds : link_one := secret_lemma_xyz\n';
    const h = makeHarness({
      source: chainModel(),
      withFacts: false,
      script: [
        stepTurnScript(1, 1, 'link-one', [
          { kind: 'callTool', tool: 'propose_arrow', args: { source: 'new-spyro-pg', target: 'link-one', why: 'SECRET-WHY-WORDS' } },
          ...formalise('link-one'),
          step.propose(),
          step.edit(LINK_ONE_STATEMENT, LINK_ONE_STATEMENT + lemma + proof),
          step.text('SECRET-ASSISTANT-WORDS'),
          { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'SECRET-SUMMARY-WORDS', gap: 'SECRET-GAP-WORDS', assumed_without_asking: ['SECRET-ASSUMED-WORDS'] } },
          step.result(),
        ]),
      ],
    });
    toDispose.push(() => h.dispose());
    const posted: string[] = [];
    h.manager.onDidChange(() => {
      posted.push(JSON.stringify(h.manager.current()));
      posted.push(JSON.stringify(h.manager.session()));
    });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [CHAIN[0] as (typeof CHAIN)[number]] })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const session = h.manager.session() as SessionView;
    const run = h.manager.current() as RunView;
    expect(session.results.shown).toBe(false);
    // The records do hold all of it (the arrow item, the premise draft's item, the Result, Claude's words).
    const raw = rawRun(h);
    expect(raw.session?.items.map((r) => r.kind).sort()).toEqual(['add-arrow', 'add-premise', 'formalize', 'result']);
    expect(JSON.stringify(raw)).toContain('SECRET-SUMMARY-WORDS');
    // No view ever posted holds any of it.
    for (const text of [...posted, JSON.stringify(session), JSON.stringify(run)]) {
      for (const secret of ['secret_lemma_xyz', 'link_one.holds', 'SECRET-WHY-WORDS', 'SECRET-ASSISTANT-WORDS', 'SECRET-SUMMARY-WORDS', 'SECRET-GAP-WORDS', 'SECRET-ASSUMED-WORDS', 'A character who cannot be in a game', '"verdict"']) {
        expect(text).not.toContain(secret);
      }
    }
    expect(session.items.map((i) => [i.kind, i.status])).toEqual([
      ['formalize', 'in-review'],
      ['result', null],
    ]);
    expect(session.board.arrows).toEqual([]);
    expect(session.board.premises).toEqual([]);
    expect(session.board.graph.edges.some((e) => e.source === 'new-spyro-pg' && e.target === 'link-one')).toBe(false);
    // The RunView: no frozen (D2-68), empty activity and notices (AF9), no verdict or proposal; core's validator takes it.
    expect(run).not.toHaveProperty('frozen');
    expect(run.activity).toEqual([]);
    expect(run.notices).toEqual([]);
    expect(run.ghosts).toEqual([]);
    expect(run).not.toHaveProperty('proposalId');
    expect(run.session).toEqual({ stage: 1, phase: 'stage' });
    expect(run.inferences).toEqual([{ target: 'link-one', premises: ['cynder-dark-past'] }]);
    expect(parseHostToWebview(JSON.parse(JSON.stringify(hostMessage('run', { run }))) as unknown)).toMatchObject({ ok: true, value: { type: 'run' } });
    expect(parseHostToWebview(JSON.parse(JSON.stringify(hostMessage('session', { session }))) as unknown)).toMatchObject({ ok: true, value: { type: 'session' } });
  });
});

describe('when the calls resolve (§2.5, D2-74, AF14)', () => {
  it('Retry step resolves once its queue\'s first step works: Claude\'s question in its step 2 is answered', async () => {
    const h = makeHarness({
      source: chainModel(),
      withFacts: false,
      script: [
        stepTurnScript(1, 2, 'link-one', [{ kind: 'sleep', ms: 60_000 }]),
        stepTurnScript(1, 2, 'link-one', [...formalise('link-one', true), step.finish('proved'), step.result()]),
        stepTurnScript(2, 2, 'link-two', [step.ask(), step.finish('not_proved'), step.result()]),
      ],
    });
    toDispose.push(() => h.dispose());
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: CHAIN.slice(0, 2) })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, state('working'));
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    expect(await h.manager.retry(working.runId)).toMatchObject({ ok: true });
    // Resolved while the queue's first step works (never after the queue).
    expect(h.manager.current()?.session?.phase).toBe('step');
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    expect(waiting.step).toMatchObject({ index: 2, of: 2, target: 'link-two' });
    expect(await h.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }])).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawRun(h).session?.steps.map((s) => s.state)).toEqual(['cancelled', 'not-run', 'passed', 'passed']);
  });

  it('a mid-stage Formalize resolves once its first step works: Claude\'s question there is answered', async () => {
    const h = makeHarness({
      script: [
        round1(step.freeze(), step.edit('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n'), step.finish('proved'), step.result()),
        { match: stepMatch(1, 1, 'cynder-not-good'), steps: [step.ask(), step.finish('not_proved'), step.result()] },
      ],
    });
    toDispose.push(() => h.dispose());
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(true);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: v.runId, stage: 1 })).toMatchObject({ ok: true });
    expect(h.manager.current()?.session?.phase).toBe('step');
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    expect(await h.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }])).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's2')).toMatchObject({ state: 'passed', queue: 2 });
  });
});

describe('a re-asked target (D2-46, §3.2, §3.4)', () => {
  const GOAL = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
  const OLD_PROOF = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
  const NEW_PROOF = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => (pg_no_dark_past.holds).elim\n';
  const A3 = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
  const A3_LEAN = 'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n';
  const OLD_QUESTION = ['cynder-dark-past', 'new-spyro-pg'];
  const NEW_QUESTION = ['cynder-dark-past', 'pg-no-dark-past'];

  /** The re-ask's step: pg-no-dark-past formalised (a statement item), then the outcome. */
  const reaskStep = (outcome: 'proved' | 'not-proved' | 'gave-up' | 'cancel'): FakeScriptTurn => {
    const statements: FakeStep[] = [step.edit(A3, A3_LEAN), step.freeze()];
    const tail: Record<typeof outcome, FakeStep[]> = {
      proved: [step.edit(OLD_PROOF, NEW_PROOF), step.finish('proved', 'SECRET re-ask'), step.result()],
      'not-proved': [step.edit(OLD_PROOF, `theorem helper_lemma_q : True := trivial\n${NEW_PROOF}`), step.finish('not_proved', 'SECRET re-ask'), step.result()],
      'gave-up': [step.edit(OLD_PROOF, NEW_PROOF), step.finish('proved'), step.finish('proved'), step.finish('proved'), step.result()],
      cancel: [{ kind: 'sleep', ms: 60_000 }],
    };
    return { match: stepMatch(1, 1, 'cynder-not-good'), steps: [...statements, ...tail[outcome]] };
  };

  /** Stage 1 with T proved from OLD_QUESTION and its Result accepted (by hand: 2e builds decisions), shown. */
  async function acceptedStage(outcome: Parameters<typeof reaskStep>[0]): Promise<{ b: Harness; runId: string }> {
    // One clock for the three outcomes: the views compare times too (the seal's), which only the run's moment sets.
    const now = () => new Date('2026-11-20T00:00:00.000Z');
    const a = makeHarness({ now, newRunId: () => 'rreask000001', script: [round1(step.freeze(), step.edit(GOAL, GOAL + OLD_PROOF), step.finish('proved'), step.result())] });
    toDispose.push(() => cleanup(a.dir));
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: [{ target: START.target, premises: OLD_QUESTION }] })).toMatchObject({ ok: true });
    const v = await waitForStage(a.manager, 1);
    expect(a.manager.session()?.results.shown).toBe(true);
    await a.manager.dispose();
    const file = a.shadow().paths.stateFile;
    const p = readJson<PersistedRun>(file);
    const result = p.session?.items.find((r) => r.key === `proof:${START.target}`) as ItemRecord;
    result.status = 'accepted';
    result.accepted = { how: 'own', fingerprint: result.fingerprint, belief: false, changesProved: false, at: '2026-11-20T00:00:00.000Z', result: { verdict: result.judged?.verdict ?? 'proved', restsOn: result.judged?.restsOn ?? [] } };
    writeFileSync(file, JSON.stringify(p));
    const b = makeHarness({ now, reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, script: [reaskStep(outcome)] });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    expect(rawRun(b).session?.items.find((r) => r.key === `proof:${START.target}`)?.status).toBe('accepted');
    if (outcome === 'gave-up') b.engine.onGate = (ctx) => (ctx.status === 'proved' ? { findings: [finding('footprint', 'not permitted')] } : undefined);
    expect(await b.manager.formalize({ subject: 'Spyro', inferences: [{ target: START.target, premises: NEW_QUESTION }], runId: v.runId, stage: 1 })).toMatchObject({ ok: true });
    return { b, runId: v.runId };
  }

  /** Shows the results by hand (Show results is 2e's), through a reload. */
  async function showResults(b: Harness): Promise<Harness> {
    await b.manager.dispose();
    const file = b.shadow().paths.stateFile;
    const p = readJson<PersistedRun>(file);
    if (p.session !== undefined) p.session.forced = { via: 'show-result', at: '2026-11-20T00:00:01.000Z' };
    writeFileSync(file, JSON.stringify(p));
    const c = makeHarness({ reuse: { dir: b.dir, root: b.root, runsDir: b.runsDir, workspace: b.workspace } });
    toDispose.push(() => c.dispose());
    await c.manager.recover();
    await waitForStage(c.manager, 1);
    expect(c.manager.session()?.results.shown).toBe(true);
    return c;
  }

  const inferenceOf = (v: SessionView | null) => v?.inferences.map((i) => [i.target.id, i.question.map((q) => q.id)]);

  it('a re-ask that ends not proved, whose premise draft reaches a definition it wrote after the freeze: the definition goes back to S₀ with the rest, and nothing is left unowned (fixer 2d r1, A-F3)', async () => {
    const helper = 'def helper_xyz : Prop := HasDarkPast cynder\n';
    const h = makeHarness({
      script: [
        round1(step.freeze(), step.edit(GOAL, GOAL + OLD_PROOF), step.finish('proved'), step.result()),
        {
          match: stepMatch(1, 1, START.target),
          steps: [
            step.freeze(),
            step.edit(GOAL, GOAL + helper),
            step.propose({ lean_name: 'needed_premise', lean_statement: 'helper_xyz → ¬ GoodAddition cynder newSpyro', natural_name: 'If Cynder has a dark past she is no good addition' }),
            step.finish('not_proved', 'It needs the premise.'),
            step.result(),
          ],
        },
      ],
    });
    toDispose.push(() => h.dispose());
    // As the real engine: the gate's check carries a model with facts (the step's end reads reach from it), and the ghost
    // check gives the suggested statement's facts.
    h.engine.onGate = async (ctx) => ({ check: okReport({ model: fakeModel(await ctx.shadow.currentFiles()) }) });
    h.engine.onCheckGhost = async (ctx, ghost) => {
      const files = new Map(await ctx.shadow.currentFiles());
      const name = ghost.leanName ?? 'needed_premise';
      files.set(MAIN, (files.get(MAIN) ?? '').replace('end Spyro', `abbrev ${name} : Prop := ${ghost.leanStatement}\n\nend Spyro`));
      const facts = fakeModel(files).declFacts.get(`Spyro.${name}`);
      return { ok: true, footprint: [], aloneEntails: false, statement: ghost.leanStatement.replace(/\s+/g, ' ').trim(), explicit: 'x', ...(facts !== undefined ? { facts: { [`Spyro.${name}`]: facts } } : {}) };
    };
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: START.target, premises: OLD_QUESTION }] })).toMatchObject({ ok: true });
    const v = await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(true);
    const s0Files = async () => h.shadow().filesAt(rawStep(h, 's2').startCommit ?? '');
    // The re-ask, with fewer arrows: Claude defines a helper after the freeze, suggests a premise using it, and does
    // not prove the target.
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: START.target, premises: ['new-spyro-pg'] }], runId: v.runId, stage: 1 })).toMatchObject({ ok: true });
    await waitForRun(h.manager, (x) => x.session?.phase === 'stage' && rawRun(h).session?.steps.length === 2);
    await waitForStage(h.manager, 1);
    const raw = rawRun(h);
    expect(raw.session?.steps.map((s) => [s.id, s.state, s.lastFinish?.status])).toEqual([
      ['s1', 'passed', 'proved'],
      ['s2', 'passed', 'not_proved'],
    ]);
    // ws/ is back at the re-ask's S₀ (it formalised no statement), with the helper gone and nothing of the step owned.
    const main = (await h.shadow().currentFiles()).get(MAIN) ?? '';
    expect(main).not.toContain('helper_xyz');
    expect(main).toContain(OLD_PROOF);
    expect(await h.shadow().currentFiles()).toEqual(await s0Files());
    expect(raw.session?.ledger.filter((e) => e.kind === 'created' && e.step === 's2')).toEqual([]);
    expect(raw.session?.premises).toEqual([]);
    expect(raw.session?.judged?.problems).toEqual([]);
    expect(raw.session?.inferences[0]?.question.sources).toEqual(OLD_QUESTION);
  });

  it('Cancel: ws/ back at S₀, the old question and the accepted Result stand, shown', async () => {
    const { b, runId } = await acceptedStage('cancel');
    await waitForRun(b.manager, (v) => v.counters.checks === 1);
    const s0 = rawStep(b, 's2').startCommit ?? '';
    expect(await b.manager.cancel(runId)).toMatchObject({ ok: true });
    await waitForStage(b.manager, 1);
    expect(await b.shadow().currentFiles()).toEqual(await b.shadow().filesAt(s0));
    const s = rawRun(b).session;
    expect(s?.inferences[0]?.question.sources).toEqual(OLD_QUESTION);
    expect(s?.items.find((r) => r.key === `proof:${START.target}`)).toMatchObject({ status: 'accepted', rev: 1 });
    const view = b.manager.session();
    expect(view?.results.shown).toBe(true);
    expect(inferenceOf(view)).toEqual([[START.target, OLD_QUESTION]]);
    expect(view?.items.find((i) => i.kind === 'result')?.status).toBe('accepted');
  });

  it('a step that ends not proved, a give-up, and a proof: the same hidden view; then each outcome once shown', async () => {
    const ended: Record<string, { b: Harness; session: SessionView | null; run: RunView | null }> = {};
    for (const outcome of ['not-proved', 'gave-up', 'proved'] as const) {
      const { b } = await acceptedStage(outcome);
      await waitForRun(b.manager, (v) => v.session?.phase === 'stage' && rawRun(b).session?.steps.length === 2);
      await waitForStage(b.manager, 1);
      ended[outcome] = { b, session: b.manager.session(), run: b.manager.current() };
    }
    const np = ended['not-proved'] as (typeof ended)[string];
    const gu = ended['gave-up'] as (typeof ended)[string];
    const pr = ended['proved'] as (typeof ended)[string];
    expect(rawStep(np.b, 's2').state).toBe('passed');
    expect(rawStep(gu.b, 's2').state).toBe('gave-up');
    expect(rawStep(pr.b, 's2').state).toBe('passed');
    // Each keeps the re-ask's statement item (pg-no-dark-past formalised); without a proof the rest went back to S₀.
    for (const x of [np, gu, pr]) expect((await x.b.shadow().currentFiles()).get(MAIN)).toContain('abbrev pg_no_dark_past');
    for (const x of [np, gu]) {
      const main = (await x.b.shadow().currentFiles()).get(MAIN) ?? '';
      expect(main).toContain(OLD_PROOF);
      expect(main).not.toContain('helper_lemma_q');
      expect(rawRun(x.b).session?.inferences[0]?.question.sources).toEqual(OLD_QUESTION);
      expect(rawRun(x.b).session?.items.find((r) => r.key === `proof:${START.target}`)).toMatchObject({ status: 'accepted', rev: 1 });
    }
    expect((await pr.b.shadow().currentFiles()).get(MAIN)).toContain(NEW_PROOF);
    expect(rawRun(pr.b).session?.inferences[0]?.question.sources).toEqual(NEW_QUESTION);
    expect(rawRun(pr.b).session?.items.find((r) => r.key === `proof:${START.target}`)).toMatchObject({ status: 'in-review', rev: 2 });
    // While the results are hidden (pg-no-dark-past's Formalize waits): one view for the three outcomes, the question
    // asked, the Result a neutral row; the RunView's inferences, target and premises too (AF5).
    for (const x of [np, gu, pr]) expect(x.session?.results.shown).toBe(false);
    expect(inferenceOf(np.session)).toEqual([[START.target, NEW_QUESTION]]);
    expect(JSON.stringify(gu.session)).toBe(JSON.stringify(np.session));
    expect(JSON.stringify(pr.session)).toBe(JSON.stringify(np.session));
    const pick = (v: RunView | null) => ({ inferences: v?.inferences, target: v?.target, premises: v?.premises });
    expect(pick(gu.run)).toEqual(pick(np.run));
    expect(pick(pr.run)).toEqual(pick(np.run));
    expect(pick(np.run)).toEqual({ inferences: [{ target: START.target, premises: NEW_QUESTION }], target: START.target, premises: NEW_QUESTION });
    // Once shown: without a proof, the old question, the accepted Result and the note; with one, the new version.
    for (const x of [np, gu]) {
      const c = await showResults(x.b);
      const view = c.manager.session();
      expect(inferenceOf(view)).toEqual([[START.target, OLD_QUESTION]]);
      expect(view?.items.find((i) => i.kind === 'result')?.status).toBe('accepted');
      expect(view?.report.notes).toContain(REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game'));
    }
    const shown = (await showResults(pr.b)).manager.session();
    expect(inferenceOf(shown)).toEqual([[START.target, NEW_QUESTION]]);
    expect(shown?.items.find((i) => i.kind === 'result')).toMatchObject({ status: 'in-review', rev: 2, markers: expect.arrayContaining(['updated']) });
    expect(shown?.report.notes ?? []).not.toContain(REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game'));
  });
});
