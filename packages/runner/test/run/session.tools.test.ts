/**
 * Slice 2d (docs/slice2-plan.md 2.8, 3.4, 3.8, 6.1's 2d list): Claude's session tools, with the FakeBackend and the
 * fake engine:
 *   - propose_arrow (D2-1): an accepted proposal is a ledger `arrow` entry, written into the target's `premises:` at the
 *     step's next normalise (before the gate), never counted as a check; its refusals are core's texts; its entry goes
 *     with a give-up's rollback, a Cancel step and a failure, and the stage's judgement then passes B.3;
 *   - propose_assumption (§3.8): a draft outside ws/, with the engine's checked statement, explicit form and facts;
 *     dropped by a Cancel step, a cap or a failure (AF10), kept by a give-up (its Result's).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAUDE_SESSION_TEXTS, premiseKey, type LedgerEntry } from '@telelean/core';

import type { FakeStep } from '../../src/llm/fake.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { FAKE_TIMERS } from './helpers/env.js';
import { fakeStageJudge, finding } from './helpers/fakeEngine.js';
import { makeHarness, rawRun, rawStep, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { CHAIN, chainModel, formalise, LINK_ONE_STATEMENT, MAIN, stepTurnScript } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  vi.useRealTimers();
  for (const d of toDispose.splice(0)) d();
});

const ONE = [CHAIN[0] as (typeof CHAIN)[number]];
const arrow = (source: string, target = 'link-one'): FakeStep => ({ kind: 'callTool', tool: 'propose_arrow', args: { source, target, why: 'The proof needs it.' } });
const linkOne = (steps: FakeStep[]): FakeScriptTurn => stepTurnScript(1, 1, 'link-one', steps);

function harness(script: FakeScriptTurn[], extra: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness({ source: chainModel(), withFacts: false, script, ...extra });
  toDispose.push(() => h.dispose());
  return h;
}

function toolResults(h: Harness, tool: string): string[] {
  const lines = readFileSync(path.join(h.shadow().paths.sessionDir, 'transcript.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; tool?: string; event?: LlmEvent });
  const ids = new Set(lines.flatMap((e) => (e.kind === 'event' && e.event?.type === 'tool_use' && e.event.name === `mcp__telelean__${tool}` ? [e.event.id] : [])));
  return lines.flatMap((e) => (e.kind === 'event' && e.event?.type === 'tool_result' && ids.has(e.event.toolUseId) ? [e.event.text] : []));
}

const arrows = (h: Harness): LedgerEntry[] => rawRun(h).session?.ledger.filter((e) => e.kind === 'arrow') ?? [];
/** The `premises:` line of link-one's block in ws/. */
async function premisesLine(h: Harness): Promise<string | undefined> {
  const lines = (await h.shadow().currentFiles()).get(MAIN)?.split('\n') ?? [];
  const at = lines.indexOf('id: link-one');
  return lines.slice(at).find((l) => l.startsWith('premises:'));
}

describe('propose_arrow (D2-1, §2.8)', () => {
  it('an accepted arrow is recorded at once (not counted) and written into the target\'s premises: before the gate; the refusals are core\'s texts', async () => {
    const h = harness([
      linkOne([
        arrow('new-spyro-pg'),
        arrow('pg-no-dark-past'),
        arrow('new-spyro-pg', 'cynder-not-good'),
        arrow('cynder-dark-past'),
        ...formalise('link-one', true),
        step.finish('proved'),
        step.result(),
      ]),
    ]);
    const gatePremises: Array<string | undefined> = [];
    h.engine.onGate = async () => {
      gatePremises.push(await premisesLine(h));
      return undefined;
    };
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const results = toolResults(h, 'propose_arrow');
    expect(results[0]).toMatch(/^Arrow recorded: telelean writes new-spyro-pg into the premises of link-one before the checks/);
    expect(results[1]).toBe(`Arrow refused: ${CLAUDE_SESSION_TEXTS.arrowNoHolds('pg-no-dark-past')}`);
    expect(results[2]).toContain(CLAUDE_SESSION_TEXTS.arrowNotTarget('link-one'));
    expect(results[3]).toBe(`Arrow refused: ${CLAUDE_SESSION_TEXTS.arrowDrawn}`);
    // One ledger entry; written into `premises:` at the gate's normalise (the gate saw it), never by Claude.
    expect(arrows(h)).toEqual([expect.objectContaining({ kind: 'arrow', source: 'new-spyro-pg', target: 'link-one', step: 's1', why: 'The proof needs it.', written: expect.any(String) })]);
    expect(gatePremises).toEqual(['premises: cynder-dark-past, new-spyro-pg']);
    expect(await premisesLine(h)).toBe('premises: cynder-dark-past, new-spyro-pg');
    // Only the freeze counted as a check.
    expect(rawStep(h, 's1').counters.checks).toBe(1);
    // The stage: its arrow item, part of link-one's Result; the judgement passes B.3.
    expect(rawRun(h).session?.items.find((r) => r.key === 'arrow:new-spyro-pg>link-one')).toMatchObject({ kind: 'add-arrow', partOf: 'link-one', status: 'in-review' });
    expect(rawRun(h).session?.judged?.problems).toEqual([]);
  });

  it('its entry goes with a give-up\'s rollback, and the stage then passes B.3', async () => {
    const h = harness([linkOne([arrow('new-spyro-pg'), ...formalise('link-one', true), step.finish('proved'), step.finish('proved'), step.finish('proved'), step.result()])]);
    h.engine.onGate = () => ({ findings: [finding('footprint', 'not permitted')] });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('gave-up');
    // Back to the freeze commit: the arrow written at the gates' normalise is gone, and so is its entry.
    expect(await premisesLine(h)).toBe('premises: cynder-dark-past');
    expect(arrows(h)).toEqual([]);
    expect(rawRun(h).session?.items.some((r) => r.kind === 'add-arrow')).toBe(false);
    expect(rawRun(h).session?.judged?.problems.some((p) => p.includes('arrow'))).toBe(false);
  });

  it('its entry goes with a Cancel step', async () => {
    const h = harness([linkOne([arrow('new-spyro-pg'), ...formalise('link-one'), { kind: 'sleep', ms: 60_000 }])]);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, () => arrows(h).length === 1 && rawStep(h, 's1').freezeCommit !== undefined);
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(arrows(h)).toEqual([]);
    expect(await premisesLine(h)).toBe('premises: cynder-dark-past');
  });

  it('its entry goes with a failure (a turn cap)', async () => {
    const h = harness([linkOne([arrow('new-spyro-pg'), step.usage('a'), step.usage('b'), step.usage('c'), step.check(), step.result()])], { caps: { maxTurns: 2 } });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('failed');
    expect(arrows(h)).toEqual([]);
  });

  it('after a passing finish it is an error, and the ledger is unchanged: a passed step gets no arrow it did not draw (fixer 2d r1, A-F6)', async () => {
    const h = harness([linkOne([...formalise('link-one', true), step.finish('proved'), arrow('new-spyro-pg'), step.result()])]);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('passed');
    expect(toolResults(h, 'propose_arrow')).toEqual(['telelean propose_arrow failed: The run is complete; stop here.']);
    expect(arrows(h)).toEqual([]);
    expect(await premisesLine(h)).toBe('premises: cynder-dark-past');
    expect(rawRun(h).session?.judged?.problems).toEqual([]);
  });

  it('outside a session it is refused (a v1 run has no session)', async () => {
    // Every start is a session, so the refusal is reached only through the StepRunner's guard: a direct call.
    const h = harness([]);
    const host = (h.manager as unknown as { toolProposeArrow: (run: unknown, a: unknown) => Promise<unknown> }).toolProposeArrow;
    await expect(host.call(h.manager, { p: {} }, { source: 'x', target: 'y', why: 'z' })).rejects.toThrow('propose_arrow exists only in an edit session');
  });
});

describe('propose_assumption in a session (§3.8, AF10)', () => {
  const propose = step.propose();
  const key = premiseKey('link-one', 'not_in_game_not_good');

  it('a checked suggestion becomes a draft outside ws/ (the engine\'s statement, explicit form and facts); a give-up keeps it, and its item comes at the queue\'s end', async () => {
    const h = harness([linkOne([...formalise('link-one'), propose, step.finish('proved'), step.finish('proved'), step.finish('proved'), step.result()])]);
    h.engine.onCheckGhost = (_ctx, ghost) => ({ ok: true, footprint: ['Spyro.cynder_dark_past.holds'], aloneEntails: false, statement: 'S', explicit: `explicit ${ghost.leanName ?? ''}`, facts: { 'Spyro.not_in_game_not_good': { name: 'Spyro.not_in_game_not_good', kind: 'def', module: 'Model.Spyro.Main', refs: [] } as never } });
    h.engine.onGate = () => ({ findings: [finding('footprint', 'not permitted')] });
    // The queue's judge re-renders the draft (fixer 2d r1, F-V2D-FC-8): a draft's own explicit form is never replaced.
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      return { ...r, report: { ...r.report, premiseExplicit: { [key]: 'ANOTHER FORM' } } };
    };
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    const drafts = rawRun(h).session?.premises ?? [];
    expect(drafts).toEqual([
      expect.objectContaining({ target: 'link-one', step: 's1', leanName: 'not_in_game_not_good', leanStatement: 'S', explicit: 'explicit not_in_game_not_good', footprint: ['Spyro.cynder_dark_past.holds'], aloneEntails: false }),
    ]);
    expect(Object.keys(drafts[0]?.facts ?? {})).toEqual(['Spyro.not_in_game_not_good']);
    expect(toolResults(h, 'propose_assumption')[0]).toContain('the person reviews it as an item after the last step');
    // Never in ws/.
    expect((await h.shadow().currentFiles()).get(MAIN)).not.toContain('not_in_game_not_good');
    expect(rawStep(h, 's1').state).toBe('gave-up');
    expect(rawRun(h).session?.items.find((r) => r.key === key)).toMatchObject({ kind: 'add-premise', partOf: 'link-one', status: 'in-review' });
  });

  it('a Cancel step drops the step\'s draft in its rollback\'s write: no premise item', async () => {
    const h = harness([linkOne([...formalise('link-one'), propose, { kind: 'sleep', ms: 60_000 }])]);
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    const working = await waitForRun(h.manager, () => (rawRun(h).session?.premises.length ?? 0) === 1);
    expect(await h.manager.cancel(working.runId)).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawRun(h).session?.premises).toEqual([]);
    expect(rawRun(h).session?.items.some((r) => r.kind === 'add-premise')).toBe(false);
  });

  it('a cap drops it too', async () => {
    const h = harness([linkOne([...formalise('link-one'), propose, step.usage('a'), step.usage('b'), step.usage('c'), step.check(), step.result()])], { caps: { maxTurns: 2 } });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('failed');
    expect(rawRun(h).session?.premises).toEqual([]);
  });

  it('an injected failure (the gate could not run twice) drops it too', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const h = harness([linkOne([...formalise('link-one'), propose, step.finish('not_proved'), step.result()])]);
    h.engine.onGate = () => ({ environment: 'the sandbox could not start' });
    expect(await h.manager.formalize({ subject: 'Spyro', inferences: ONE })).toMatchObject({ ok: true });
    await waitForRun(h.manager, () => rawRun(h).view.notices.some((n) => n.kind === 'environment'));
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();
    await waitForStage(h.manager, 1);
    expect(rawStep(h, 's1').state).toBe('failed');
    expect(rawRun(h).session?.premises).toEqual([]);
    expect((await h.shadow().currentFiles()).get(MAIN)).not.toContain(LINK_ONE_STATEMENT);
  });
});
