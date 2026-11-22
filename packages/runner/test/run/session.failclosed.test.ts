/**
 * Slice 2d, fixer round 1 (A-F4; docs/slice2-plan.md 3.12, 4.7, D2-10, D2-65): a SessionView that cannot be built is
 * never replaced by the previous one, whose reveal state belongs to other records. Core's `buildSessionView` is made to
 * throw by a module mock, so this file stands alone. Then:
 *   - `session()` is null (nothing stale is shown);
 *   - the RunView withholds Claude's activity and notices, shows only telelean's notice that the list could not be
 *     built, and its inferences follow the question each step asked (which tells no outcome);
 *   - a mid-stage Formalize is refused with that notice's text (whether the results are shown is not known), and so is
 *     every review action (slice 2e);
 *   - once the view can be built again, it is shown, and the notice goes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as core from '@telelean/core';

import { SESSION_VIEW_FAILED } from '../../src/run/session.js';
import { cleanup } from './helpers/env.js';
import { makeHarness, rawRun, round1, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { chainModel, formalise, stepTurnScript } from './helpers/sessions.js';

const control = vi.hoisted(() => ({ throwNow: false, thrown: 0 }));
vi.mock('@telelean/core', async (original) => {
  const real = await original<typeof core>();
  return {
    ...real,
    buildSessionView: (input: Parameters<typeof real.buildSessionView>[0]) => {
      if (control.throwNow) {
        control.thrown += 1;
        throw new Error('the view could not be built (test)');
      }
      return real.buildSessionView(input);
    },
  };
});

const toDispose: Array<() => void> = [];
afterEach(() => {
  control.throwNow = false;
  control.thrown = 0;
  for (const d of toDispose.splice(0)) d();
});

describe('a SessionView that cannot be built (fixer 2d r1, A-F4: fail closed)', () => {
  it('no stale view: session() is null, the RunView withholds Claude\'s work and says why, a mid-stage Formalize is refused; a view built again is shown', async () => {
    const h = makeHarness({
      source: chainModel(),
      withFacts: false,
      script: [
        stepTurnScript(1, 1, 'link-one', [{ kind: 'sleep', ms: 60_000 }]),
        stepTurnScript(1, 1, 'link-one', [...formalise('link-one', true), step.text('SECRET-ASSISTANT-WORDS: proved with cynder_dark_past.holds'), step.finish('proved', 'SECRET-SUMMARY'), step.result()]),
      ],
    });
    toDispose.push(() => cleanup(h.dir));
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'link-one', premises: ['cynder-dark-past'] }] })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, state('working'));
    await h.manager.cancel(working.runId);
    await waitForStage(h.manager, 1);
    // The empty stage shows the results (nothing waits): a stale copy of this view would say "shown".
    expect(h.manager.session()?.results.shown).toBe(true);
    // From the retried step's gate on, no view can be built.
    h.engine.onGate = () => {
      control.throwNow = true;
      return undefined;
    };
    expect(await h.manager.retry(working.runId)).toMatchObject({ ok: true });
    await waitForRun(h.manager, (v) => v.session?.phase === 'stage' && rawRun(h).session?.judged?.commit === rawRun(h).session?.head);
    await new Promise((r) => setTimeout(r, 100));
    expect(control.thrown).toBeGreaterThan(0);
    // The records hide the results now: link-one's statement waits for a decision.
    const raw = rawRun(h);
    expect(raw.session?.items.map((r) => [r.kind, r.status])).toEqual([
      ['formalize', 'in-review'],
      ['result', 'in-review'],
    ]);
    expect(raw.view.activity.some((a) => a.text.includes('SECRET-ASSISTANT-WORDS'))).toBe(true);
    // Nothing stale, nothing of Claude's.
    expect(h.manager.session()).toBeNull();
    const run = h.manager.current();
    expect(JSON.stringify(run)).not.toContain('SECRET');
    expect(run?.activity).toEqual([]);
    expect(run?.notices).toEqual([expect.objectContaining({ level: 'error', kind: 'environment', text: SESSION_VIEW_FAILED })]);
    expect(run?.inferences).toEqual([{ target: 'link-one', premises: ['cynder-dark-past'] }]);
    expect(core.parseHostToWebview(JSON.parse(JSON.stringify(core.hostMessage('run', { run }))) as unknown)).toMatchObject({ ok: true });
    expect(
      await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'link-two', premises: ['link-one', 'new-spyro-pg'] }], runId: working.runId, stage: 1 }),
    ).toEqual({ ok: false, code: 'conflict', error: SESSION_VIEW_FAILED });
    expect(rawRun(h).session?.steps).toHaveLength(2);
    // Slice 2e: so is every review action (whether the results are shown is not known), and nothing changes.
    const formalizeItem = raw.session?.items[0];
    const refusal = { ok: false, code: 'conflict', error: SESSION_VIEW_FAILED };
    expect(await h.manager.decide(working.runId, 1, true, [{ item: formalizeItem?.id ?? '', rev: formalizeItem?.rev ?? 0, to: 'accepted' }], false)).toEqual(refusal);
    expect(await h.manager.reveal(working.runId, 1, 'show-result')).toEqual(refusal);
    expect(await h.manager.undoSession(working.runId, 1, false)).toEqual(refusal);
    expect(await h.manager.submit(working.runId, 1)).toEqual(refusal);
    expect(await h.manager.sessionDiff(working.runId, 1, true)).toEqual(refusal);
    expect(rawRun(h).session).toEqual(raw.session);
    // The view can be built again (a reload builds it): shown, hidden results and all, and the notice is gone.
    control.throwNow = false;
    await h.manager.dispose();
    const b: Harness = makeHarness({ reuse: { dir: h.dir, root: h.root, runsDir: h.runsDir, workspace: h.workspace } });
    toDispose.push(() => b.dispose());
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    expect(b.manager.session()?.results.shown).toBe(false);
    expect(b.manager.current()?.notices).toEqual([]);
    expect(JSON.stringify(b.manager.current())).not.toContain('SECRET');
  });

  it('with no view, the RunView\'s inferences, target and premises are the questions asked: the same whether a re-ask proved its target or not (AF5)', async () => {
    const goal = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const proof = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
    const reask = async (outcome: 'proved' | 'not_proved') => {
      control.throwNow = false;
      const h = makeHarness({
        newRunId: () => 'rnoview00001',
        script: [
          round1(step.freeze(), step.edit(goal, goal + proof), step.finish('proved'), step.result()),
          // The re-ask from fewer arrows: the proof stands either way; only the finish differs.
          { match: 'Step 1 of 1: formalize and prove “cynder-not-good”', steps: [step.freeze(), step.finish(outcome, 'SECRET-REASK'), step.result()] },
        ],
      });
      toDispose.push(() => h.dispose());
      expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] })).toMatchObject({ ok: true });
      const v = await waitForStage(h.manager, 1);
      expect(h.manager.session()?.results.shown).toBe(true);
      h.engine.onGate = () => {
        control.throwNow = true;
        return undefined;
      };
      expect(await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], runId: v.runId, stage: 1 })).toMatchObject({ ok: true });
      await waitForRun(h.manager, (x) => x.session?.phase === 'stage' && rawRun(h).session?.steps[1]?.state === 'passed' && rawRun(h).session?.judged?.commit === rawRun(h).session?.head);
      await new Promise((r) => setTimeout(r, 100));
      expect(h.manager.session()).toBeNull();
      const run = h.manager.current();
      return { h, pick: { inferences: run?.inferences, target: run?.target, premises: run?.premises } };
    };
    const proved = await reask('proved');
    const notProved = await reask('not_proved');
    // The records differ (a proof replaced the question; without one the old question stands, D2-46)...
    expect(rawRun(proved.h).session?.inferences[0]?.question.sources).toEqual(['cynder-dark-past']);
    expect(rawRun(notProved.h).session?.inferences[0]?.question.sources).toEqual(['cynder-dark-past', 'new-spyro-pg']);
    // ...the RunView does not: it shows the question the re-ask asked.
    expect(notProved.pick).toEqual(proved.pick);
    expect(proved.pick).toEqual({ inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past'] }], target: 'cynder-not-good', premises: ['cynder-dark-past'] });
  });
});
