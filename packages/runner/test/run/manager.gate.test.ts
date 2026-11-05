/**
 * The gate loop (A2; docs/m2-plan.md sections 2, 3.6 and 3.7), with fakes:
 *   AT3.2  failures at attempts 1 and 2, then a pass; three failures -> give up, revert to the freeze, normalise,
 *          re-check, proposal `gave-up` [the real attemptNotice sentences: core's own]
 *   AT3.2b edits made after finish returned accept are discarded at the turn's end
 *   AT3.3  an environment outcome in the gate is retried once after 30 s (fake timers), never counted
 *   AT3.5  a turn without finish gets one nudge, then the round ends `no-finish` (revert, normalise, re-check)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LlmEvent } from '../../src/llm/types.js';
import { NUDGE_TURN } from '../../src/run/index.js';
import { FAKE_TIMERS } from './helpers/env.js';
import { finding } from './helpers/fakeEngine.js';
import { makeHarness, round1, START, state, step, waitForRun, type Harness } from './helpers/harness.js';

const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';
const EXACT = 'Spyro.cynder_not_good.holds rests on Spyro.new_spyro_pg.holds, which is not in the permitted set (Model/Spyro/Main.lean:52:0); remove the use or finish not_proved';

let h: Harness | undefined;
afterEach(() => {
  vi.useRealTimers();
  h?.dispose();
  h = undefined;
});

function toolResults(harness: Harness): Array<Extract<LlmEvent, { type: 'tool_result' }>> {
  const text = readFileSync(path.join(harness.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8');
  return text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; event?: LlmEvent })
    .filter((e) => e.kind === 'event' && e.event?.type === 'tool_result')
    .map((e) => e.event as Extract<LlmEvent, { type: 'tool_result' }>);
}

const footprintFinding = () => finding('footprint', EXACT, { names: ['Spyro.new_spyro_pg.holds'], nodeId: 'cynder-not-good', file: 'Model/Spyro/Main.lean' });

describe('the gate loop (AT3.2)', () => {
  it('retries with the exact failures, posts a notice per failed attempt, and accepts the third attempt', async () => {
    h = makeHarness({
      script: [round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.finish(), step.finish(), step.result())],
    });
    h.engine.onGate = (_ctx, call) => (call <= 2 ? { findings: [footprintFinding()] } : undefined);
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('proved');
    expect(review.counters.gateAttempts).toBe(3);
    const failed = review.notices.filter((n) => n.kind === 'gate-failed');
    expect(failed.map((n) => n.text)).toEqual(['FAKE attempt 1: footprint', 'FAKE attempt 2: footprint']);
    expect(failed[0]?.detail).toBe(`- footprint: ${EXACT}`);
    // Claude got the exact failures back as the tool results of finish.
    const finishes = toolResults(h).filter((r) => r.text.startsWith('Gate'));
    expect(finishes.map((r) => r.text.split('\n')[0])).toEqual(['Gate failed (attempt 1 of 3):', 'Gate failed (attempt 2 of 3):', 'Gate passed. The run is complete; stop here.']);
    expect(finishes[0]?.text).toContain(`- footprint: ${EXACT}`);
    expect(finishes[0]?.text).toContain('Fix these and call finish again.');
    // The board's attempt list describes each failure in one plain sentence (core describeFinding).
    const report = h.manager.proposal()?.report;
    expect(report?.gateAttempts.map((g) => g.passed)).toEqual([false, false, true]);
    expect(report?.gateAttempts[0]?.failures).toEqual([{ step: 'G3', text: 'described footprint', detail: EXACT }]);
    expect(h.shadow().kinds().filter((k) => k === 'gate-pass')).toHaveLength(1);
  });

  it('gives up after three failures: reverts to the freeze commit, normalises, re-checks and proposes "gave-up"', async () => {
    h = makeHarness({
      script: [round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.finish(), step.finish(), step.result())],
    });
    h.engine.onGate = () => ({ findings: [footprintFinding()] });
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('gave-up');
    expect(review.notices.map((n) => n.kind)).toEqual(['gate-failed', 'gate-failed', 'gave-up', 'reverted']);
    expect(review.notices[2]?.text).toBe('FAKE gave up after 3: footprint; reverted to Statements frozen (round 1)');
    expect(review.notices[3]?.text).toContain('Statements frozen (round 1)');
    const last = toolResults(h).filter((r) => r.text.startsWith('Gate')).at(-1);
    expect(last?.text).toContain('the attempt limit (3) is reached');
    // ws/ is the freeze commit again: the formalisation stays, the proof is gone.
    const shadow = h.shadow();
    const freeze = (await shadow.commits()).find((c) => c.kind === 'freeze');
    expect(freeze).toBeDefined();
    expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(freeze?.id ?? ''));
    expect((await shadow.currentFiles()).get('Model/Spyro/Main.lean')).not.toContain('theorem cynder_not_good.holds');
    expect(shadow.kinds()).toContain('revert');
    // After the give-up: normalise, then one re-check (not counted), then the proposal from that check.
    expect(h.engine.methods().slice(-2)).toEqual(['normalise', 'check']);
    expect(review.counters.checks).toBe(2);
    const built = h.proposals.builds[0];
    expect(built?.input.verdict).toBe('gave-up');
    expect(built?.input.reverted).toMatchObject({ toCommit: freeze?.id, label: 'Statements frozen (round 1)' });
    expect(h.sidecars.attempts[0]).toMatchObject({ verdict: 'gave-up', gateAttempts: 3 });
    // No gate-pass was ever committed.
    expect(shadow.kinds()).not.toContain('gate-pass');
  });

  describe("with WP1's real attemptNotice", () => {
    it('posts the sentences of docs/m2-plan.md section 3.5', async () => {
      h = makeHarness({
        core: {},
        script: [round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.finish(), step.finish(), step.result())],
      });
      h.engine.onGate = () => ({ findings: [footprintFinding()] });
      await h.manager.start({ ...START, premises: ['cynder-dark-past', 'pg-no-dark-past'] });
      const review = await waitForRun(h.manager, state('review'));
      const texts = review.notices.map((n) => n.text);
      expect(texts[0]).toBe("Attempt 1 didn't pass: it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn't select. Asking Claude to retry.");
      expect(texts[2]).toBe(
        "Claude's attempts didn't pass the checks 3 times: each time it used `new_spyro_pg.holds`, which you didn't select. telelean reverted its working copy to “Statements frozen (round 1)”.",
      );
    });
  });
});

describe('what the proposal shows is a judged state (AT3.2b)', () => {
  it('discards edits made after finish returned accept, with an info notice, and builds the proposal from the gate-pass files', async () => {
    h = makeHarness({
      script: [
        round1(
          step.check(),
          step.freeze(),
          step.edit(TARGET_LINE, TARGET_LINE + PROOF),
          step.finish(),
          // After "Gate passed. The run is complete; stop here." Claude edits anyway, and tries another check.
          step.edit('end Spyro', '-- a late edit\nend Spyro'),
          step.check(),
          step.result(),
        ),
      ],
    });
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    const shadow = h.shadow();
    const gatePass = (await shadow.commits()).find((c) => c.kind === 'gate-pass');
    expect(gatePass).toBeDefined();
    const gateFiles = await shadow.filesAt(gatePass?.id ?? '');
    expect(gateFiles.get('Model/Spyro/Main.lean')).toContain('theorem cynder_not_good.holds');
    expect(gateFiles.get('Model/Spyro/Main.lean')).not.toContain('a late edit');
    expect(await shadow.currentFiles()).toEqual(gateFiles);
    expect(review.notices.find((n) => n.kind === 'info')?.text).toBe('Changes made after finish were discarded: the proposal shows exactly the files the checks passed.');
    expect(h.proposals.builds[0]?.files).toEqual(gateFiles);
    // The late check_lean was refused without running Lean.
    expect(toolResults(h).at(-1)?.text).toContain('The run is complete; stop here.');
    expect(h.engine.methods().filter((m) => m === 'check')).toHaveLength(1);
  });
});

describe('environment outcomes in the gate (AT3.3)', () => {
  it('retries once after 30 s without counting it; a pass then ends in review, proved', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    h = makeHarness({ script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result())] });
    h.engine.onGate = (_ctx, call) => (call === 1 ? { environment: 'MemAvailable is below the guard' } : undefined);
    await h.manager.start(START);
    const env = await waitForRun(h.manager, (v) => v.notices.some((n) => n.kind === 'environment'));
    expect(env.state).toBe('gate');
    expect(h.engine.gateCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(h.engine.gateCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    const review = await waitForRun(h.manager, state('review'));
    expect(h.engine.gateCalls).toBe(2);
    expect(review.verdict).toBe('proved');
    expect(review.counters.gateAttempts).toBe(1);
    expect(review.notices.map((n) => n.kind)).toEqual(['environment']);
    expect(review.notices[0]?.text).toContain("not Claude's fault");
  });

  it('a second environment outcome fails the run with the reason; Claude is told it is not its fault', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    h = makeHarness({ script: [round1(step.freeze(), step.finish(), step.result())] });
    h.engine.onGate = () => ({ environment: 'the sandbox could not start (bwrap: No permissions to create new namespace)' });
    await h.manager.start(START);
    await waitForRun(h.manager, (v) => v.notices.some((n) => n.kind === 'environment'));
    await vi.advanceTimersByTimeAsync(30_000);
    const failed = await waitForRun(h.manager, state('failed'));
    expect(h.engine.gateCalls).toBe(2);
    expect(failed.verdict).toBe('failed');
    expect(failed.error).toContain('the sandbox could not start');
    expect(failed.counters.gateAttempts).toBe(0);
    expect(failed.notices.map((n) => [n.kind, n.level])).toEqual([
      ['environment', 'warning'],
      ['environment', 'error'],
    ]);
    const verdict = toolResults(h).find((r) => r.text.startsWith('telelean could not run the checks'));
    expect(verdict?.text).toContain('This is not your fault and was not counted as an attempt.');
    expect(h.backend?.closes.length).toBeGreaterThan(0);
    expect(h.sidecars.attempts[0]).toMatchObject({ verdict: 'failed' });
  });
});

describe('a turn that ends without finish (AT3.5)', () => {
  it('nudges once, then ends the round as no-finish: revert, normalise, re-check, proposal', async () => {
    h = makeHarness({ script: [round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.result())] });
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('no-finish');
    expect(h.player?.played.map((p) => p.turn)).toEqual([expect.stringContaining('Run: "These suffice"'), NUDGE_TURN]);
    const shadow = h.shadow();
    const freeze = (await shadow.commits()).find((c) => c.kind === 'freeze');
    expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(freeze?.id ?? ''));
    expect(h.engine.methods().slice(-2)).toEqual(['normalise', 'check']);
    expect(review.notices.map((n) => n.kind)).toEqual(['reverted']);
    expect(h.proposals.builds[0]?.input.verdict).toBe('no-finish');
  });

  it('a finish in the nudge turn ends the round normally', async () => {
    h = makeHarness({
      script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.result()), { match: 'You ended your turn without calling finish', steps: [step.finish(), step.result()] }],
    });
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('proved');
    expect(h.player?.played).toHaveLength(2);
  });
});
