/**
 * AT3.1 (docs/m2-plan.md section 9, WP3): the happy path with fakes (engine, proposals, sidecars, core) and the
 * FakeBackend: start -> working -> ask_user -> waiting-for-answer (clock paused) -> answer (decision recorded, guess
 * revealed) -> freeze -> finish -> gate pass -> review with a proposal; change events in order; run.json at every
 * step; usage summed from usage events; the cost estimate is the latest result's value (0.01, then 0.03 -> 0.03).
 * Slice 2d: the start is an edit session with one step; the step ends at the gate pass, the queue's judge runs, and the
 * stage opens with the step's items (no proposal; the step's outcome and attempt record on its own record, D2-11).
 * Feedback's second round is Submit review's queue now (manager.rounds.test.ts, slice 2e).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersistedRun } from '../../src/run/types.js';
import { ALL_PREMISES, makeHarness, rawRun, rawStep, readJson, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';

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
  it('runs a session\'s one step from start to its stage, records the answer and reveals the guess only afterwards', async () => {
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

    const review = await waitForStage(manager, 1);
    // A session's RunView carries no verdict and no freeze (D2-68): the step's outcome is on its record.
    expect(review.verdict).toBeUndefined();
    expect(review.round).toBe(1);
    expect(review.stage).toBe('prove');
    expect(review.frozen).toBeUndefined();
    expect(review.step).toEqual({ index: 1, of: 1, target: 'cynder-not-good', kind: 'formalize', statementsFixed: true });
    expect(review.session).toEqual({ stage: 1, phase: 'stage' });
    const s1 = rawStep(h, 's1');
    expect(s1).toMatchObject({ state: 'passed', queue: 1, stage: 1, round: 1, counters: { checks: 3, gateAttempts: 1, turns: 2 } });
    expect(s1.freezes.map((f) => f.round)).toEqual([1]);
    expect(s1.freezes[0]?.snapshot.permitted.selected).toEqual(['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds']);
    expect(review.counters).toMatchObject({ checks: 3, gateAttempts: 1, turns: 2 });
    expect(review.proposalId).toBeUndefined();
    // Claude's words and telelean's checks are in run.json; the RunView withholds them while the results are hidden.
    expect(review.activity).toEqual([]);
    const raw = rawRun(h);
    expect(raw.view.activity.some((a) => a.kind === 'claude-text' && a.text === 'Reading the subject first.')).toBe(true);
    expect(raw.view.activity.filter((a) => a.kind === 'check').length).toBe(2);

    // The engine saw the step's context: base check first, a freeze in round 1, normalise + gate(proved), then the
    // queue's judge and the renderings of the new statement items (§3.12, cached by content key).
    expect(engine.methods()).toEqual(['checkBase', 'check', 'freeze', 'check', 'normalise', 'gate', 'judge', 'renderStatements']);
    expect(engine.calls.at(-1)?.names).toEqual(['Spyro.pg_no_dark_past']);
    expect(engine.calls.find((c) => c.method === 'gate')).toMatchObject({ status: 'proved', frozen: true, freezeRound: 1, stage: 'prove', runId: review.runId, leanJobMs: 120_000 });
    expect(engine.calls.filter((c) => c.method === 'check')[1]?.files).toEqual(['Model/Spyro/Main.lean']);
    // No proposal: the stage's items come from the queue's judge (the formalised premise, and the Result, hidden).
    expect(proposals.builds).toEqual([]);
    expect(h.shadow().kinds()).toEqual(['base', 'step-start', 'freeze', 'checkpoint', 'gate-pass']);
    expect(manager.session()?.items.map((i) => [i.kind, i.status])).toEqual([
      ['formalize', 'in-review'],
      ['result', null],
    ]);

    // Usage: two API responses, summed; the cost estimate is the result's figure.
    expect(review.usage).toMatchObject({ requests: 2, inputTokens: 220, outputTokens: 30, cacheReadInputTokens: 2000, cacheCreationInputTokens: 100, costEstimateUsd: 0.01 });
    // D2-11: attempts.jsonl gets nothing while the session is open; the step keeps its record for the end.
    expect(sidecars.attempts).toEqual([]);
    expect(s1.attempt).toMatchObject({ id: `${review.runId}.1`, round: 1, verdict: 'proved', premises: ALL_PREMISES, gateAttempts: 1, model: 'claude-opus-5-5', summary: 'Proved from the three premises under the normative reading.' });

    // State changes, in order (and run.json said the same at each step).
    const states = runs(h.views.map((v) => v.state));
    expect(states).toEqual(['starting', 'working', 'waiting-for-answer', 'working', 'gate', 'working', 'review']);
    expect(runs(fileStates)).toEqual(states);
    // Only one session, one turn.
    expect(h.player?.played.map((p) => p.scripted)).toEqual([0]);
    expect(h.backend?.sessions).toHaveLength(1);

    // The transcript holds every user turn verbatim.
    const transcript = readFileSync(path.join(h.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8');
    expect(transcript).toContain('"kind":"turn"');
    expect(transcript).toContain('Run: \\"Formalize for dependencies\\" for the subject Spyro');
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
    expect(h.player?.played[0]?.turn.startsWith('Run: "Formalize for dependencies" for the subject Spyro (namespace Spyro;')).toBe(true);
  });
});
