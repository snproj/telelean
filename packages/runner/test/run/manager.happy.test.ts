/**
 * AT3.1 (docs/m2-plan.md section 9, WP3): the happy path with fakes (engine, proposals, sidecars, core) and the
 * FakeBackend: start -> working -> ask_user -> waiting-for-answer (clock paused) -> answer (decision recorded, guess
 * revealed) -> freeze -> finish -> gate pass -> review with a proposal; change events in order; run.json at every
 * step; usage summed from usage events; the cost estimate is the latest result's value (0.01, then 0.03 -> 0.03).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersistedRun } from '../../src/run/types.js';
import { ALL_PREMISES, makeHarness, readJson, round1, START, state, step, waitForRun, type Harness } from './helpers/harness.js';

const A3_OLD = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
const A3_NEW =
  'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n';
const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

let h: Harness | undefined;
afterEach(() => {
  h?.dispose();
  h = undefined;
});

/** Collapses consecutive repeats. */
function runs<T>(xs: readonly T[]): T[] {
  return xs.filter((x, i) => i === 0 || xs[i - 1] !== x);
}

describe('RunManager happy path (AT3.1)', () => {
  it('runs a round from start to review, records the answer and reveals the guess only afterwards', async () => {
    let clock = Date.parse('2026-11-01T10:00:00.000Z');
    const advance = (ms: number) => {
      clock += ms;
    };
    h = makeHarness({
      now: () => new Date(clock),
      script: [
        round1(
          step.usage('m1', 100, 10),
          step.text('Reading the subject first.'),
          { kind: 'read', path: 'Model/Spyro/Main.lean' },
          step.ask(),
          step.usage('m2', 120, 20),
          step.edit(A3_OLD, A3_NEW),
          step.check(),
          step.freeze(),
          step.edit(TARGET_LINE, TARGET_LINE + PROOF),
          step.check(['Model/Spyro/Main.lean']),
          step.finish('proved', 'Proved from the three premises under the normative reading.'),
          step.result(0.01),
        ),
        {
          match: 'Feedback from the person',
          steps: [step.usage('m3', 50, 5), step.freeze(), step.finish('proved', 'Re-proved after the feedback.'), step.result(0.03)],
        },
      ],
    });
    const { manager, sidecars, engine, proposals } = h;
    // run.json as it was at every change event (the file is written before the event fires).
    const fileStates: string[] = [];
    manager.onDidChange(() => {
      const v = manager.current();
      if (v === null) return;
      const stateFile = h?.shadows.at(-1)?.paths.stateFile;
      if (stateFile !== undefined && existsSync(stateFile)) fileStates.push(readJson<PersistedRun>(stateFile).view.state);
    });

    const started = await manager.start(START);
    expect(started).toMatchObject({ ok: true });
    expect(h.workspace.performed).toEqual([]); // the declared premises are already these three

    const waiting = await waitForRun(manager, state('waiting-for-answer'));
    // D-20: no guess before the answer, unknown affected nodes dropped.
    expect(JSON.stringify(waiting)).not.toContain('claudesGuess');
    expect(JSON.stringify(waiting)).not.toContain('rating rules are norms');
    expect(waiting.pendingQuestions?.questions[0]).toMatchObject({ index: 0, phenomenon: 'modality', affectedNodes: ['pg-no-dark-past'] });
    expect(waiting.pendingQuestions?.questions[0]?.options.map((o) => o.label)).toEqual(['A rule (normative)', 'Impossible (literal)']);
    const persisted = readJson<PersistedRun>(h.shadow().paths.stateFile);
    expect(persisted.view.state).toBe('waiting-for-answer');
    expect(persisted.pendingAsk?.args.questions[0]?.claudesGuess).toEqual({ option: 0, note: 'rating rules are norms' });
    expect(JSON.stringify(persisted.view)).not.toContain('claudesGuess');

    // The agent-active clock is paused while the question waits.
    const agentBefore = manager.current()?.counters.agentMs ?? -1;
    advance(10 * 60_000);
    expect(manager.current()?.counters.agentMs).toBe(agentBefore);

    const setId = waiting.pendingQuestions?.id ?? '';
    expect(setId).toBe('q1');
    const answered = await manager.answer(waiting.runId, setId, [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'subject' }]);
    expect(answered).toMatchObject({ ok: true });
    expect(sidecars.decisions).toHaveLength(1);
    expect(sidecars.decisions[0]).toMatchObject({
      id: `${waiting.runId}.q1.0`,
      run: waiting.runId,
      subject: 'Spyro',
      phenomenon: 'modality',
      answer: { kind: 'option', option: 0 },
      answerText: 'A rule (normative)',
      scope: 'subject',
      affectedNodes: ['pg-no-dark-past'],
      decidedBy: 'user',
      wordedBy: 'agent',
      claudesGuess: { option: 0, note: 'rating rules are norms' },
    });
    const afterAnswer = manager.current();
    expect(afterAnswer?.pendingQuestions).toBeUndefined();
    expect(afterAnswer?.answered[0]).toMatchObject({ setId: 'q1', claudesGuess: { option: 0, note: 'rating rules are norms' }, answer: { question: 0, scope: 'subject' } });

    const review = await waitForRun(manager, state('review'));
    expect(review.verdict).toBe('proved');
    expect(review.round).toBe(1);
    expect(review.stage).toBe('prove');
    expect(review.frozen?.round).toBe(1);
    expect(review.frozen?.permitted.selected).toEqual(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds']);
    expect(review.counters).toMatchObject({ checks: 3, gateAttempts: 1, turns: 2 });
    expect(review.proposalId).toBe('p1');
    expect(manager.proposal()).toMatchObject({ proposalId: 'p1', runId: review.runId, report: { verdict: 'proved' } });
    // Claude's words in the activity feed, telelean's checks too.
    expect(review.activity.some((a) => a.kind === 'claude-text' && a.text === 'Reading the subject first.')).toBe(true);
    expect(review.activity.filter((a) => a.kind === 'check').length).toBe(2);

    // The engine saw the run's context: base check first, a freeze in round 1, then normalise + gate(proved).
    expect(engine.methods()).toEqual(['checkBase', 'check', 'freeze', 'check', 'normalise', 'gate']);
    expect(engine.calls.find((c) => c.method === 'gate')).toMatchObject({ status: 'proved', frozen: true, freezeRound: 1, stage: 'prove', runId: review.runId, leanJobMs: 120_000 });
    expect(engine.calls.filter((c) => c.method === 'check')[1]?.files).toEqual(['Model/Spyro/Main.lean']);
    // The proposal was built from the gate-pass files (the formalisation and the proof).
    const built = proposals.builds[0];
    expect(built?.input.verdict).toBe('proved');
    expect(built?.files.get('Model/Spyro/Main.lean')).toContain('theorem cynder_not_good.holds');
    expect(built?.input.selection).toEqual({ subject: 'Spyro', target: 'cynder-not-good', premises: ALL_PREMISES, adoptedGhosts: [] });
    expect(h.shadow().kinds()).toEqual(['base', 'freeze', 'checkpoint', 'gate-pass']);

    // Usage: two API responses, summed; the cost estimate is the result's figure.
    expect(review.usage).toMatchObject({ requests: 2, inputTokens: 220, outputTokens: 30, cacheReadInputTokens: 2000, cacheCreationInputTokens: 100, costEstimateUsd: 0.01 });
    // attempts.jsonl got the round.
    expect(sidecars.attempts).toHaveLength(1);
    expect(sidecars.attempts[0]).toMatchObject({ id: `${review.runId}.1`, round: 1, verdict: 'proved', premises: ALL_PREMISES, gateAttempts: 1, model: 'claude-opus-5-5', summary: 'Proved from the three premises under the normative reading.' });
    expect(h.workspace.reloaded).toContain('Spyro');

    // State changes, in order (and run.json said the same at each step).
    const states = runs(h.views.map((v) => v.state));
    expect(states).toEqual(['starting', 'working', 'waiting-for-answer', 'working', 'gate', 'working', 'review']);
    expect(runs(fileStates)).toEqual(states);

    // Feedback: round 2 resets the counters; the cost estimate becomes the latest result's 0.03 (never a sum).
    const fb = await manager.feedback(review.runId, 'Please re-check with the same premises.');
    expect(fb).toMatchObject({ ok: true });
    const r2 = await waitForRun(manager, (v) => v.state === 'review' && v.round === 2);
    expect(r2.usage.costEstimateUsd).toBe(0.03);
    expect(r2.usage.requests).toBe(3);
    expect(r2.counters).toMatchObject({ turns: 1, checks: 1, gateAttempts: 1 });
    expect(r2.proposalId).toBe('p2');
    expect(sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'superseded' })]);
    expect(sidecars.attempts.map((a) => a.round)).toEqual([1, 2]);
    // The feedback reached Claude as a user turn, with the budget.
    expect(h.player?.played.map((p) => p.scripted)).toEqual([0, 1]);
    expect(h.player?.played[1]?.turn).toContain('Feedback from the person on your previous result:\n"Please re-check with the same premises."');
    expect(h.player?.played[1]?.turn).toContain('Budget for this round: 25 Lean checks, 80 turns, 20 minutes.');
    // Only one session: Feedback continues it.
    expect(h.backend?.sessions).toHaveLength(1);

    // The transcript holds every user turn verbatim.
    const transcript = readFileSync(path.join(h.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8');
    expect(transcript).toContain('"kind":"turn"');
    expect(transcript).toContain('Run: \\"These suffice\\" for the subject Spyro');
    expect(transcript).toContain('"kind":"tool-call","tool":"finish"');
  });

  it('sends the context bundle and the static system prompt to the session', async () => {
    h = makeHarness({ script: [round1(step.result())] });
    await h.manager.start(START);
    await waitForRun(h.manager, state('review'));
    const cfg = h.backend?.configs[0];
    expect(cfg?.systemPrompt.startsWith('You are the formalisation assistant of telelean.')).toBe(true);
    expect(cfg?.cwd).toBe(h.shadow().paths.ws);
    expect(cfg?.runDir).toBe(h.shadow().paths.sessionDir);
    expect(cfg?.maxTurns).toBe(80);
    expect(cfg?.model).toBe('claude-opus-5-5');
    expect(cfg?.effort).toBe('high');
    expect(cfg?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.player?.played[0]?.turn.startsWith('Run: "These suffice" for the subject Spyro (namespace Spyro;')).toBe(true);
  });
});
