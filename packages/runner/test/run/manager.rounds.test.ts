/**
 * Later rounds (docs/m2-plan.md sections 4.8 and 4.9), with fakes:
 *   AT3.8 Feedback: round 2 in stage formalise; finish(proved) without a new freeze -> not-frozen; after a freeze it
 *         passes; the earlier round's proof is not "a proof before the freeze" (roundStartCommit)
 *   AT3.9 propose_assumption -> GhostView with the engine's checked statement; adoptGhost in review -> the adoption
 *         written (fake core planGhostAdoption), commit `adopt`, freeze with adoptedGhosts, round 2 in stage prove,
 *         the adoption turn naming the Lean name; a refused re-freeze reverts and stays in review
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { GhostAdoptionRequest, ProjectModel } from '@telelean/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { LlmEvent } from '../../src/llm/types.js';
import type { CheckContext, FreezeOutcome } from '../../src/gate/types.js';
import { fakeCore, makeHarness, round1, START, state, step, waitForRun, type Harness } from './helpers/harness.js';
import { okReport } from './helpers/fakeEngine.js';

const MAIN = 'Model/Spyro/Main.lean';
const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

let h: Harness | undefined;
afterEach(() => {
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

/** A freeze that, like the real rule, refuses a proof added since the round's start (or the base). */
async function proofBeforeFreeze(ctx: CheckContext): Promise<FreezeOutcome | undefined> {
  const since = ctx.roundStartCommit !== undefined ? await ctx.shadow.filesAt(ctx.roundStartCommit) : await ctx.shadow.baseFiles();
  const now = await ctx.shadow.currentFiles();
  const had = since.get(MAIN)?.includes('theorem cynder_not_good.holds') ?? false;
  const has = now.get(MAIN)?.includes('theorem cynder_not_good.holds') ?? false;
  if (has && !had) return { ok: false, refusals: ['proof-before-freeze: cynder_not_good.holds was added before freeze_statements'], report: okReport({ outcome: 'problems' }) };
  return undefined;
}

describe('Feedback (AT3.8)', () => {
  it('starts round 2 in stage formalise; finish(proved) needs a new freeze; the old proof is not a proof before the freeze', async () => {
    h = makeHarness({
      script: [
        round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish(), step.result()),
        { match: 'Feedback from the person', steps: [step.finish('proved', 'Nothing to change.'), step.freeze(), step.finish('proved', 'Re-frozen and proved.'), step.result()] },
      ],
    });
    h.engine.onFreeze = proofBeforeFreeze;
    await h.manager.start(START);
    const r1 = await waitForRun(h.manager, state('review'));
    expect(r1.verdict).toBe('proved');
    const head = (await h.shadow().commits()).at(-1);

    expect(await h.manager.feedback(r1.runId, '   ')).toMatchObject({ ok: false, code: 'invalid' });
    expect(await h.manager.feedback(r1.runId, 'Use the same reading, but check it again.')).toMatchObject({ ok: true });
    const working = h.manager.current();
    expect(working).toMatchObject({ state: 'working', stage: 'formalise', round: 2 });
    expect(working?.frozen).toBeUndefined();
    expect(working?.proposalId).toBeUndefined();
    expect(h.manager.proposal()).toBeNull();

    const r2 = await waitForRun(h.manager, (v) => v.state === 'review' && v.round === 2);
    expect(r2.verdict).toBe('proved');
    expect(r2.counters.gateAttempts).toBe(2);
    const gates = h.engine.calls.filter((c) => c.method === 'gate');
    expect(gates[1]).toMatchObject({ round: 2, stage: 'formalise', frozen: false, roundStartCommit: head?.id });
    expect(gates[2]).toMatchObject({ round: 2, stage: 'prove', frozen: true, freezeRound: 2, roundStartCommit: head?.id });
    const freezes = h.engine.calls.filter((c) => c.method === 'freeze');
    expect(freezes[1]).toMatchObject({ round: 2, frozen: false, roundStartCommit: head?.id });
    const verdicts = toolResults(h).filter((r) => r.text.startsWith('Gate') || r.text.startsWith('Statements') || r.text.startsWith('Freeze'));
    expect(verdicts.map((r) => r.text.split('\n')[0])).toEqual([
      'Statements frozen (snapshot freeze-1). Now prove them unchanged.',
      'Gate passed. The run is complete; stop here.',
      'Gate failed (attempt 1 of 3):',
      'Statements frozen (snapshot freeze-2). Now prove them unchanged.',
      'Gate passed. The run is complete; stop here.',
    ]);
    expect(verdicts[2]?.text).toContain('- not_frozen: finish(proved) needs a successful freeze_statements in this round');
    expect(r2.notices.find((n) => n.kind === 'gate-failed')?.text).toBe('FAKE attempt 1: not-frozen');
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'superseded' })]);
  });
});

const GHOST_BLOCK =
  '/-\n@@ telelean v1\nid: a-character-who-cannot-be-in\ntype: ASSUMPTION\nnatural_name: A character who cannot be in a game would not be a good addition to it\nrationale: it seems obvious to me\nasserted: 2026-11-01\nlean: Spyro.not_in_game_not_good\norigin: agent\nworded_by: agent\n-/\n/-- A character who cannot be in a game would not be a good addition to it -/\nabbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g\naxiom not_in_game_not_good.holds : not_in_game_not_good\n\n';
const TARGET_BLOCK_START = '/-\n@@ telelean v1\nid: cynder-not-good';

function fakeAdoption(requests: GhostAdoptionRequest[]) {
  return (model: ProjectModel, request: GhostAdoptionRequest) => {
    requests.push(request);
    const text = model.files.get(MAIN)?.text ?? '';
    return {
      changes: [{ path: MAIN, before: text, after: text.replace(TARGET_BLOCK_START, GHOST_BLOCK + TARGET_BLOCK_START) }],
      nodeId: 'a-character-who-cannot-be-in',
      leanName: 'Spyro.not_in_game_not_good',
    };
  };
}

describe('ghosts (AT3.9)', () => {
  it('records a checked suggestion as a ghost; adopting it writes it, re-freezes with it selected and starts a proving round', async () => {
    const requests: GhostAdoptionRequest[] = [];
    h = makeHarness({
      core: { ...fakeCore(), planGhostAdoption: fakeAdoption(requests) },
      script: [
        round1(step.check(), step.freeze(), step.propose(), step.finish('not_proved', 'Under the literal reading the goal does not follow.'), step.result()),
        { match: 'The person adopted your suggestion', steps: [step.edit(TARGET_LINE, TARGET_LINE + PROOF), step.finish('proved', 'Proved with the adopted premise.'), step.result()] },
      ],
    });
    h.engine.onCheckGhost = (_ctx, ghost) => ({ ok: true, footprint: ['Spyro.pg_no_dark_past.holds', 'Spyro.InGame'], aloneEntails: false, statement: ghost.leanStatement.replace(/\s+/g, ' ').trim() });
    await h.manager.start(START);
    const r1 = await waitForRun(h.manager, state('review'));
    expect(r1.verdict).toBe('not-proved');
    expect(r1.counters.checks).toBe(3);
    expect(r1.ghosts).toEqual([
      {
        id: 'ghost-1',
        naturalName: 'A character who cannot be in a game would not be a good addition to it',
        leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        leanName: 'not_in_game_not_good',
        whyNeeded: 'Nothing links being in a game to being a good addition to it.',
        closesGap: true,
        aloneEntails: false,
        state: 'suggested',
        round: 1,
      },
    ]);
    expect(h.engine.calls.find((c) => c.method === 'checkGhost')?.ghost?.leanStatement).toBe('∀ (c : Character) (g : Game),\n   ¬ InGame c g → ¬ GoodAddition c g');
    expect(toolResults(h).find((r) => r.text.startsWith('Proposal recorded'))?.text).toContain('Proposal recorded as ghost-1');
    expect(h.manager.proposal()?.ghosts.map((g) => g.id)).toEqual(['ghost-1']);

    const adopted = await h.manager.adoptGhost(r1.runId, 'ghost-1', 'it seems obvious to me');
    expect(adopted).toMatchObject({ ok: true });
    expect(requests).toEqual([
      {
        subject: 'Spyro',
        target: 'cynder-not-good',
        naturalName: 'A character who cannot be in a game would not be a good addition to it',
        leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        leanName: 'not_in_game_not_good',
        rationale: 'it seems obvious to me',
        session: r1.runId,
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    ]);
    const shadow = h.shadow();
    expect(shadow.kinds().slice(-2)).toEqual(['adopt', 'freeze']);
    const adoptCommit = (await shadow.commits()).find((c) => c.kind === 'adopt');
    expect((await shadow.filesAt(adoptCommit?.id ?? '')).get(MAIN)).toContain('id: a-character-who-cannot-be-in');
    const refreeze = h.engine.calls.filter((c) => c.method === 'freeze').at(-1);
    expect(refreeze).toMatchObject({ round: 2, adoptedGhosts: ['a-character-who-cannot-be-in'], teleleanBlocks: ['a-character-who-cannot-be-in'], roundStartCommit: adoptCommit?.id, frozen: false });
    const now = h.manager.current();
    expect(now).toMatchObject({ round: 2, stage: 'prove', frozen: { round: 2 } });
    expect(now?.ghosts[0]).toMatchObject({ state: 'adopted', nodeId: 'a-character-who-cannot-be-in', leanName: 'not_in_game_not_good' });
    expect(h.sidecars.resolutions).toEqual([expect.objectContaining({ round: 1, resolution: 'superseded' })]);

    const r2 = await waitForRun(h.manager, (v) => v.state === 'review' && v.round === 2);
    expect(r2.verdict).toBe('proved');
    expect(h.player?.played[1]?.turn).toBe(
      'The person adopted your suggestion as an assumption:\n- a-character-who-cannot-be-in (ASSUMPTION, worded by you): "A character who cannot be in a game would not be a good addition to it"\n' +
        '  Lean: Spyro.not_in_game_not_good := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g; axiom Spyro.not_in_game_not_good.holds (telelean wrote it right before the target\'s block).\n' +
        'The statements are frozen again with it selected, so you may use Spyro.not_in_game_not_good.holds. Prove the target now and call finish. Budget for this round: 25 Lean checks, 80 turns, 20 minutes.',
    );
    const gate2 = h.engine.calls.filter((c) => c.method === 'gate').at(-1);
    expect(gate2).toMatchObject({ round: 2, stage: 'prove', frozen: true, adoptedGhosts: ['a-character-who-cannot-be-in'] });
    expect(h.proposals.builds[1]?.input.selection.adoptedGhosts).toEqual(['a-character-who-cannot-be-in']);
    expect(h.sidecars.attempts[1]).toMatchObject({ round: 2, verdict: 'proved', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'a-character-who-cannot-be-in'], ghosts: [{ id: 'ghost-1', adopted: true }] });
    // The same ghost cannot be adopted twice.
    expect(await h.manager.adoptGhost(r1.runId, 'ghost-1')).toMatchObject({ ok: false });
  });

  it('a refused re-freeze reverts the adoption and stays in review', async () => {
    h = makeHarness({
      core: { ...fakeCore(), planGhostAdoption: fakeAdoption([]) },
      script: [round1(step.freeze(), step.propose(), step.finish('not_proved'), step.result())],
    });
    await h.manager.start(START);
    const r1 = await waitForRun(h.manager, state('review'));
    const before = await h.shadow().currentFiles();
    h.engine.onFreeze = () => ({ ok: false, refusals: ['vocabulary-shape: InGame is not a valid predicate'], report: okReport({ outcome: 'problems' }) });
    const outcome = await h.manager.adoptGhost(r1.runId, 'ghost-1');
    expect(outcome).toMatchObject({ ok: false, code: 'conflict' });
    expect(outcome.ok ? '' : outcome.error).toContain('vocabulary-shape: InGame is not a valid predicate');
    expect(await h.shadow().currentFiles()).toEqual(before);
    const v = h.manager.current();
    expect(v).toMatchObject({ state: 'review', round: 1, proposalId: 'p1' });
    expect(v?.ghosts[0]?.state).toBe('suggested');
    expect(h.manager.proposal()).not.toBeNull();
    expect(h.sidecars.resolutions).toEqual([]);
    // Declining it instead.
    expect(await h.manager.rejectGhost(r1.runId, 'ghost-1')).toMatchObject({ ok: true });
    expect(h.manager.current()?.ghosts[0]?.state).toBe('rejected');
    expect(h.manager.proposal()?.ghosts[0]?.state).toBe('rejected');
  });

  it('propose_assumption before the freeze is a tool error; a rejected check is reported to Claude', async () => {
    h = makeHarness({ script: [round1(step.propose(), step.freeze(), step.propose(), step.finish('not_proved'), step.result())] });
    let n = 0;
    h.engine.onCheckGhost = () => (++n === 1 ? { ok: false, problems: ['the gap proof does not typecheck: unknown identifier InGame'] } : undefined);
    await h.manager.start(START);
    const r = await waitForRun(h.manager, state('review'));
    const results = toolResults(h);
    expect(results[0]).toMatchObject({ isError: true });
    expect(results[0]?.text).toContain('freeze first; the gap is judged against the frozen statements');
    expect(results[2]?.text).toBe('Proposal rejected: the gap proof does not typecheck: unknown identifier InGame');
    expect(r.ghosts).toEqual([]);
    expect(r.counters.checks).toBe(2);
  });
});
