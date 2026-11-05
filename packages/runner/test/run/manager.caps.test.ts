/**
 * AT3.4: the per-round caps (docs/m2-plan.md sections 2 and 4.4), host-enforced: the 26th check gets a tool error;
 * the turn cap counts usage events and interrupts the session (cap-reached); the agent-active time cap runs on fake
 * timers and is paused while a question waits; a cap reached during a tool call takes effect when the call returns
 * (a passing gate is honoured); Feedback resets the counters.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FakeStep } from '../../src/llm/fake.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { FAKE_TIMERS } from './helpers/env.js';
import { makeHarness, round1, START, state, step, waitForRun, type Harness } from './helpers/harness.js';

const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

let h: Harness | undefined;
afterEach(() => {
  vi.useRealTimers();
  h?.dispose();
  h = undefined;
});

function toolResults(harness: Harness): Array<Extract<LlmEvent, { type: 'tool_result' }>> {
  return readFileSync(path.join(harness.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; event?: LlmEvent })
    .filter((e) => e.kind === 'event' && e.event?.type === 'tool_result')
    .map((e) => e.event as Extract<LlmEvent, { type: 'tool_result' }>);
}

describe('caps (AT3.4)', () => {
  it('refuses the 26th check with a tool error, without running Lean', async () => {
    const checks: FakeStep[] = Array.from({ length: 26 }, () => step.check());
    h = makeHarness({ script: [round1(...checks, step.result())] });
    await h.manager.start(START);
    await waitForRun(h.manager, state('review'));
    const results = toolResults(h).slice(0, 26);
    expect(results.slice(0, 25).every((r) => !r.isError)).toBe(true);
    expect(results[24]?.text).toContain('checks left: 0');
    expect(results[25]?.isError).toBe(true);
    expect(results[25]?.text).toContain('check budget used up (25 of 25): call finish');
    // 25 checks by Claude, then the uncounted re-check of the no-finish round.
    expect(h.engine.methods().filter((m) => m === 'check')).toHaveLength(26);
  });

  it('counts turns from usage events and interrupts the session at maxTurns: cap-reached, reverted, re-checked', async () => {
    h = makeHarness({
      caps: { maxTurns: 3 },
      script: [round1(step.usage('a'), step.check(), step.usage('b'), step.freeze(), step.usage('b'), step.usage('c'), step.check(), step.result())],
    });
    await h.manager.start(START);
    const review = await waitForRun(h.manager, state('review'));
    expect(h.backend?.configs[0]?.maxTurns).toBe(3); // belt and braces: the CLI's own per-user-turn cap
    expect(review.verdict).toBe('cap-reached');
    expect(review.counters.turns).toBe(3); // `b` twice counts once (deduplicated by message id)
    expect(review.usage.requests).toBe(3);
    expect(review.notices.map((n) => n.kind)).toEqual(['cap', 'reverted']);
    expect(review.notices[0]?.text).toBe("Claude reached this round's limit of 3 turns; telelean stopped it.");
    expect(h.backend?.interrupts.length).toBeGreaterThan(0);
    // The check after the cap never ran: one check by Claude, one freeze, then the uncounted re-check.
    expect(h.engine.methods()).toEqual(['checkBase', 'check', 'freeze', 'normalise', 'check']);
    expect(h.proposals.builds[0]?.input.verdict).toBe('cap-reached');
    // Feedback starts a fresh round with fresh counters.
    await h.manager.feedback(review.runId, 'Try again with fewer turns.');
    const r2 = await waitForRun(h.manager, (v) => v.round === 2);
    expect(r2.counters).toMatchObject({ turns: 0, checks: 0, gateAttempts: 0 });
    expect(r2.counters.agentMs).toBeLessThan(5_000); // reset for the round (the new round's clock has just started)
  });

  it('caps agent-active time on the clock, paused while a question waits', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    h = makeHarness({ caps: { maxAgentMs: 60_000 }, script: [round1(step.ask(), { kind: 'sleep', ms: 10 * 60_000 }, step.finish(), step.result())] });
    await h.manager.start(START);
    const waiting = await waitForRun(h.manager, state('waiting-for-answer'));
    await vi.advanceTimersByTimeAsync(30 * 60_000); // half an hour of the person thinking: not agent time
    expect(h.manager.current()?.state).toBe('waiting-for-answer');
    expect(h.manager.current()?.notices).toEqual([]);
    await h.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }]);
    await waitForRun(h.manager, state('working'));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.manager.current()?.notices.filter((n) => n.kind === 'cap')).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('cap-reached');
    expect(review.notices[0]?.text).toBe("Claude reached this round's limit of 1 minute of work; telelean stopped it.");
    expect(review.counters.agentMs).toBeGreaterThanOrEqual(60_000);
    expect(review.counters.agentMs).toBeLessThan(120_000);
    // The finish after the sleep never ran.
    expect(h.engine.methods()).not.toContain('gate');
  });

  it('a time cap reached while the gate runs takes effect when it returns: its pass is honoured', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    h = makeHarness({ caps: { maxAgentMs: 60_000 }, script: [round1(step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.text('more work'), step.check(), step.result())] });
    let release: () => void = () => undefined;
    const gateRunning = new Promise<void>((started) => {
      h!.engine.onGate = () =>
        new Promise((resolve) => {
          started();
          release = () => resolve(undefined);
        });
    });
    await h.manager.start(START);
    await gateRunning;
    await vi.advanceTimersByTimeAsync(90_000); // the Lean job is slow: the cap passes meanwhile
    expect(h.manager.current()?.state).toBe('gate');
    expect(h.backend?.interrupts).toEqual([]); // not while the gate runs
    release();
    const review = await waitForRun(h.manager, state('review'));
    expect(review.verdict).toBe('proved');
    expect(review.notices.map((n) => n.kind)).toEqual(['cap']);
    expect(h.backend?.interrupts.length).toBe(1);
    expect(h.engine.methods().filter((m) => m === 'check')).toHaveLength(0); // the check after the cap never ran
    expect(h.proposals.builds[0]?.input.verdict).toBe('proved');
  });
});
