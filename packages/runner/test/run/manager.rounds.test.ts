/**
 * Later rounds (docs/m2-plan.md sections 4.8 and 4.9), with fakes:
 *   AT3.8 Feedback: round 2 in stage formalise; finish(proved) without a new freeze -> not-frozen; after a freeze it
 *         passes; the earlier round's proof is not "a proof before the freeze" (roundStartCommit)
 *   AT3.9 propose_assumption -> GhostView with the engine's checked statement; adoptGhost in review -> the adoption
 *         written (fake core planGhostAdoption), commit `adopt`, freeze with adoptedGhosts, round 2 in stage prove,
 *         the adoption turn naming the Lean name; a refused re-freeze reverts and stays in review
 * Slice 2d: every start is an edit session, which has no Feedback round and no ghost adoption (an Add premise item's
 * Accept and write, 2f): those tests moved (docs/slice2-plan.md 0); 2f rewrote AT3.9 for the premise write. Slice 2e: AT3.8 is a Shaky Result's Submit step
 * (Submit review's queue), with the same freeze rules. propose_assumption's refusals before the freeze and its rejected
 * check stay, in a session step (its draft, never a ghost).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { planGhostAdoption as corePlanGhostAdoption, type GhostAdoptionRequest } from '@telelean/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { LlmEvent } from '../../src/llm/types.js';
import type { CheckContext, FreezeOutcome } from '../../src/gate/types.js';
import type { PersistedRun } from '../../src/run/types.js';
import { fakeCore, makeHarness, rawRun, rawStep, readJson, round1, START, state, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { okReport } from './helpers/fakeEngine.js';
import { acceptPremise, PREMISE_KEY, premiseRecord, scriptEnd } from './helpers/premises.js';
import { decision, PG, PG_BLOCK_END, PG_FORMALISED, settled } from './helpers/review.js';

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

describe('Feedback (AT3.8), now Submit review\'s queue (slice 2e)', () => {
  it('a Shaky Result\'s Submit step is round 2, in stage formalise; finish(proved) needs a new freeze; the earlier proof, kept in its S₀, is not a proof before the freeze', async () => {
    const proof = 'theorem cynder_not_good.holds : cynder_not_good := fun _ => cynder_dark_past.holds.elim\n';
    h = makeHarness({
      script: [
        round1(step.check(), step.freeze(), step.edit(TARGET_LINE, TARGET_LINE + proof), step.finish(), step.result()),
        { match: 'Review submitted (stage 1)', steps: [step.finish('proved', 'Nothing to change.'), step.freeze(), step.finish('proved', 'Re-frozen and proved.'), step.result()] },
      ],
    });
    h.engine.onFreeze = proofBeforeFreeze;
    await h.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }] });
    const r1 = await waitForStage(h.manager, 1);
    expect(h.manager.session()?.results.shown).toBe(true);
    const result = rawRun(h).session?.items.find((r) => r.key === 'proof:cynder-not-good');
    expect(result).toMatchObject({ status: 'in-review' });
    const note = 'Use the same reading, but check it again.';
    expect(await h.manager.decide(r1.runId, 1, true, [{ item: result?.id ?? '', rev: result?.rev ?? 0, to: 'declined', option: 'shaky', note }], false)).toMatchObject({ ok: true });
    expect(await h.manager.submit(r1.runId, 1)).toMatchObject({ ok: true });
    const working = h.manager.current();
    expect(working).toMatchObject({ stage: 'formalise', round: 2 });
    expect(['working', 'gate']).toContain(working?.state);
    expect(working?.frozen).toBeUndefined();
    expect(working?.proposalId).toBeUndefined();

    const r2 = await waitForStage(h.manager, 2);
    expect(r2.session).toMatchObject({ stage: 2, phase: 'stage' });
    const s2 = rawStep(h, 's2');
    expect(s2).toMatchObject({ kind: 'submit', state: 'passed', round: 2, queue: 2, counters: { gateAttempts: 2 } });
    expect(s2.scope).toMatchObject({ openProof: true, openItems: ['proof:cynder-not-good'] });
    // The earlier proof is in S₀ (Shaky takes nothing out): round 2's freeze accepts it.
    expect((await h.shadow().filesAt(s2.startCommit ?? '')).get(MAIN)).toContain(proof);
    const gates = h.engine.calls.filter((c) => c.method === 'gate');
    expect(gates[1]).toMatchObject({ round: 2, stage: 'formalise', frozen: false, roundStartCommit: s2.startCommit });
    expect(gates[2]).toMatchObject({ round: 2, stage: 'prove', frozen: true, freezeRound: 2, roundStartCommit: s2.startCommit });
    const freezes = h.engine.calls.filter((c) => c.method === 'freeze');
    expect(freezes[1]).toMatchObject({ round: 2, frozen: false, roundStartCommit: s2.startCommit });
    const verdicts = toolResults(h).filter((r) => r.text.startsWith('Gate') || r.text.startsWith('Statements') || r.text.startsWith('Freeze'));
    expect(verdicts.map((r) => r.text.split('\n')[0])).toEqual([
      'Statements frozen (snapshot freeze-1). Now prove them unchanged.',
      'Gate passed. The run is complete; stop here.',
      'Gate failed (attempt 1 of 3):',
      'Statements frozen (snapshot freeze-2). Now prove them unchanged.',
      'Gate passed. The run is complete; stop here.',
    ]);
    expect(verdicts[2]?.text).toContain('- not_frozen: finish(proved) needs a successful freeze_statements in this round');
    expect(rawRun(h).view.notices.find((n) => n.kind === 'gate-failed')?.text).toBe('FAKE attempt 1: not-frozen');
    // The step's turn started with the feedback turn, which quotes the note under SHAKY.
    const turn = h.player?.played[1]?.turn ?? '';
    expect(turn.startsWith('Review submitted (stage 1)\n')).toBe(true);
    expect(turn).toContain(`The person's note: "${note}"`);
    // D2-11: no attempt is resolved before the session ends.
    expect(h.sidecars.resolutions).toEqual([]);
  });
});

describe('ghosts (AT3.9), in slice 2f an Add premise item\'s Accept and write', () => {
  it('a checked suggestion is a draft outside ws/ (never a ghost); accepting it writes it (core planGhostAdoption with the Accept\'s hold-as and Why), and telelean completes the target from it with no Claude round (F15)', async () => {
    const requests: GhostAdoptionRequest[] = [];
    h = makeHarness({
      core: { ...fakeCore(), planGhostAdoption: (model, request) => (requests.push(request), corePlanGhostAdoption(model, request)) },
      script: [round1(step.check(), step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), step.propose(), step.finish('not_proved', 'Under the literal reading the goal does not follow.'), step.result())],
    });
    scriptEnd(h);
    h.engine.onCheckGhost = (_ctx, ghost) => ({ ok: true, footprint: ['Spyro.pg_no_dark_past.holds', 'Spyro.InGame'], aloneEntails: false, statement: ghost.leanStatement.replace(/\s+/g, ' ').trim(), explicit: 'explicit' });
    await h.manager.start(START);
    const r1 = await waitForStage(h.manager, 1);
    expect(r1.ghosts).toEqual([]);
    const draft = rawRun(h).session?.premises[0];
    expect(draft).toMatchObject({ naturalName: 'A character who cannot be in a game would not be a good addition to it', leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g', leanName: 'not_in_game_not_good', whyNeeded: 'Nothing links being in a game to being a good addition to it.', aloneEntails: false, explicit: 'explicit' });
    expect(h.engine.calls.find((c) => c.method === 'checkGhost')?.ghost?.leanStatement).toBe('∀ (c : Character) (g : Game),\n   ¬ InGame c g → ¬ GoodAddition c g');
    expect((await h.shadow().currentFiles()).get(MAIN)).not.toContain('not_in_game_not_good');
    // The results are shown once PG's Formalize is decided; the premise's own Accept then writes it.
    expect(await h.manager.decide(r1.runId, 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: true });
    await settled(h);
    expect(await h.manager.decide(r1.runId, 1, true, [acceptPremise(h, 'axiom', 'it seems obvious to me')], false)).toMatchObject({ ok: true });
    await settled(h);
    expect(requests).toEqual([
      {
        subject: 'Spyro',
        target: 'cynder-not-good',
        naturalName: 'A character who cannot be in a game would not be a good addition to it',
        leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        leanName: 'not_in_game_not_good',
        rationale: 'it seems obvious to me',
        session: r1.runId,
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        holdAs: 'axiom',
      },
    ]);
    const shadow = h.shadow();
    expect(shadow.kinds().slice(-2)).toEqual(['adopt', 'completion']);
    const adoptCommit = (await shadow.commits()).find((c) => c.kind === 'adopt');
    expect((await shadow.filesAt(adoptCommit?.id ?? '')).get(MAIN)).toContain('natural_name: A character who cannot be in a game would not be a good addition to it');
    // No second Claude round: the completion is telelean's own write (F15), and no freeze or gate ran for it.
    expect(h.player?.played).toHaveLength(1);
    expect(h.engine.methods().filter((m) => m === 'freeze')).toHaveLength(1);
    expect(h.manager.current()?.round).toBe(1);
    expect(rawRun(h).session?.items.find((r) => r.key === 'proof:cynder-not-good')).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    // D2-11: no attempt is resolved before the session ends (the M2 round was "superseded" here).
    expect(h.sidecars.resolutions).toEqual([]);
  });

  it('a premise write the engine refuses takes the write back out and keeps the Accept, its write due (§3.8); declining it instead lifts the problem', async () => {
    h = makeHarness({ script: [round1(step.edit(PG_BLOCK_END, PG_FORMALISED), step.freeze(), step.propose(), step.finish('not_proved'), step.result())] });
    scriptEnd(h);
    h.engine.onWritePremise = () => ({ ok: false, error: 'vocabulary-shape: InGame is not a valid predicate' });
    await h.manager.start(START);
    const r1 = await waitForStage(h.manager, 1);
    expect(await h.manager.decide(r1.runId, 1, true, [decision(h, PG, 'accepted')], false)).toMatchObject({ ok: true });
    await settled(h);
    const before = await h.shadow().currentFiles();
    expect(await h.manager.decide(r1.runId, 1, true, [acceptPremise(h, 'axiom')], false)).toMatchObject({ ok: true });
    await settled(h);
    expect(await h.shadow().currentFiles()).toEqual(before);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted' });
    expect(h.manager.session()?.problems[0]?.text).toContain('could not write it: vocabulary-shape: InGame is not a valid predicate.');
    expect(h.sidecars.resolutions).toEqual([]);
    // Declining it instead.
    expect(await h.manager.decide(r1.runId, 1, true, [decision(h, PREMISE_KEY, 'declined', { option: 'reject' })], true)).toMatchObject({ ok: true });
    await settled(h);
    expect(premiseRecord(h).status).toBe('declined');
    expect(h.manager.session()?.problems).toEqual([]);
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
    // Slice 2d: in a session the check gets the draft's Lean name, and no draft is kept for the rejected suggestion.
    expect(h.engine.calls.find((c) => c.method === 'checkGhost')?.ghost).toMatchObject({ leanName: 'not_in_game_not_good' });
    expect(readJson<PersistedRun>(h.shadow().paths.stateFile).session?.premises).toEqual([]);
  });
});
