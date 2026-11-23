/**
 * Slice 2j2 (docs/slice2-plan.md 1.1's and 6.1's 2j2 entries; D2-92, the user's decision of turn 25, and D2-93–D2-97):
 * notes for Claude in a session, with the FakeBackend and the fake engine:
 *   - the note on an item to be redone: one stack step, Undo and Redo, a stale stage refused, kept across a reload;
 *   - Submit review's comment: kept with the seal (with the stage it submitted), quoted right after the feedback turn's
 *     first line, shown in the next stage's report; the notes in REJECTED, SHAKY and TO BE REDONE;
 *   - a Submit that leads to the end confirmation keeps no comment;
 *   - N5: a run.json saved before 2j2 (no note on an item to be redone, no comment) loads unchanged.
 */
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { REVIEW_TEXTS, type ActionOutcome } from '@telelean/core';

import { RunFiles } from '../../src/run/persist.js';
import type { FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import { cleanup } from './helpers/env.js';
import { makeHarness, rawRun, START, step, waitForStage, type Harness } from './helpers/harness.js';
import { consistent, decision, PG, PG_FORMALISED, pgScript, record, RESULT, session, settled, stackKinds, T, viewItem } from './helpers/review.js';
import { chainModel, CHAIN, GOAL_LINE, GOAL_PROOF, LINK_TWO_PROOF, proveGoal, proveLinkOne, proveLinkTwo } from './helpers/sessions.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

function first(script: FakeScriptTurn[], extra: Parameters<typeof makeHarness>[0] = {}): Harness {
  const h = makeHarness({ script, ...extra });
  toDispose.push(() => cleanup(h.dir));
  return h;
}

/** The manager after the reload: same root, runs dir and workspace. */
function second(a: Harness, script: FakeScriptTurn[] = []): Harness {
  const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, script });
  toDispose.push(() => b.dispose());
  return b;
}

const ok = (o: ActionOutcome) => expect(o).toMatchObject({ ok: true });
const rework = (target: string) => `rework “${target}” after the review`;
/** pg-no-dark-past's statement reworded (the arguments in the other order), as session.submit.test.ts has it. */
const PG_REWORDED = PG_FORMALISED.replace('∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g', '∀ (c : Character) (g : Game), HasDarkPast c → IsPG g → ¬ GoodAddition c g');
const reworkPg = (): FakeScriptTurn => ({ match: rework(T), steps: [step.edit(PG_FORMALISED, PG_REWORDED), step.freeze(), step.finish('proved', 'Reworded.'), step.result()] });
const SHAKY_NOTE = 'Order the arguments as in the sentence.';
const REDO_NOTE = 'Prove it straight from the rule.\nNo detour.';
const COMMENT = 'Keep the names.\nPrefer the rule reading.';

/** Stage 1 of the proved Spyro question with pg declined as Shaky (its note given): the Result is to be redone. */
async function shakyStage(h: Harness): Promise<string> {
  expect(await h.manager.start(START)).toMatchObject({ ok: true });
  const { runId } = await waitForStage(h.manager, 1);
  await settled(h);
  ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'shaky', note: SHAKY_NOTE })], false));
  await settled(h);
  expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false, kind: 'cascade' } });
  return runId;
}

describe('2j2: the note on an item to be redone (D2-92, D2-95)', () => {
  it('is one stack step, undone and redone, refused for a stale stage or an item not to be redone, and kept across a reload', async () => {
    const a = first([pgScript('proved')]);
    const runId = await shakyStage(a);
    const r = record(a, RESULT);
    // A stale stage, an item not to be redone: refused, nothing stacked.
    expect(await a.manager.note(runId, 2, r.id, r.rev, 'x')).toMatchObject({ ok: false, code: 'conflict', error: REVIEW_TEXTS.historyChanged });
    expect(await a.manager.note(runId, 1, record(a, PG).id, record(a, PG).rev, 'x')).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.noteOnlyRedo });
    const kinds = stackKinds(a);
    const { head, judged } = structuredClone(session(a));
    ok(await a.manager.note(runId, 1, r.id, r.rev, REDO_NOTE));
    expect(record(a, RESULT).redo).toMatchObject({ kind: 'cascade', note: REDO_NOTE });
    expect(stackKinds(a)).toEqual([...kinds, 'note']);
    expect(viewItem(a, RESULT)?.redo?.note).toBe(REDO_NOTE);
    const label = a.manager.session()?.undo?.label ?? '';
    expect(label.startsWith('Note for Claude: ')).toBe(true);
    // A records-only write: no commit in ws/, and no judge ran or is queued (the judged state is the one before).
    expect(session(a).head).toBe(head);
    expect(session(a).judged).toEqual(judged);
    expect(a.manager.session()?.judging).toBe(false);
    await consistent(a);
    const saved = structuredClone(session(a));
    await a.manager.dispose();
    const b = second(a, [reworkPg()]);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    await settled(b);
    expect(session(b).items).toEqual(saved.items);
    expect(session(b).stack).toEqual(saved.stack);
    expect(viewItem(b, RESULT)?.redo?.note).toBe(REDO_NOTE);
    expect(b.manager.session()?.undo?.label).toBe(label);
    // Undo after the reload takes it away; Redo puts it back.
    ok(await b.manager.undoSession(runId, b.manager.session()?.undo?.step ?? -1, false));
    expect(record(b, RESULT).redo).not.toHaveProperty('note');
    ok(await b.manager.redoSession(runId, b.manager.session()?.redo?.step ?? -1, false));
    expect(record(b, RESULT).redo?.note).toBe(REDO_NOTE);
    // Submit with a comment: the seal keeps it with the stage; the feedback turn quotes the comment and both notes.
    ok(await b.manager.submit(runId, 1, COMMENT));
    await waitForStage(b.manager, 2);
    const seal = session(b).stack.done.find((x) => x.kind === 'seal');
    expect(seal).toMatchObject({ kind: 'seal', by: 'submit', comment: { text: COMMENT, stage: 1 } });
    const turn = b.player?.played[0]?.turn ?? '';
    expect(turn.startsWith(`Review submitted (stage 1)\nThe person's overall comment: "${COMMENT}"\n\nACCEPTED:`)).toBe(true);
    expect(turn).toContain(`  The person's note: "${SHAKY_NOTE}"\n`);
    expect(turn).toContain(`TO BE REDONE: propose them again; what each relied on:\n- Result “Cynder would not be a good addition to the new Spyro game”\n`);
    expect(turn).toContain(`  The person's note: "${REDO_NOTE}"\n`);
    // The next stage's report shows the comment.
    await settled(b);
    expect(b.manager.session()?.report.comment).toEqual({ stage: 1, text: COMMENT });
    // Claude proved it again, so it is back in review: the note went with the status (it was quoted above, once).
    expect(record(b, RESULT).status).toBe('in-review');
    expect(record(b, RESULT)).not.toHaveProperty('redo');
    expect(viewItem(b, RESULT)?.redo).toBeUndefined();
  });
});

describe('2j2: Submit review’s comment and the decline notes Claude receives (D2-92, D2-96)', () => {
  it('Submit’s take-out keeps the note of an item already to be redone: it is quoted under TO BE REDONE (D2-93)', async () => {
    const NEW_PROOF = 'theorem link_two.holds : link_two := And.intro link_one.holds new_spyro_pg.holds\n';
    const a = first(
      [
        proveLinkOne(),
        proveLinkTwo(),
        proveGoal(),
        { match: rework('link-two'), steps: [step.freeze('link-two'), step.edit(LINK_TWO_PROOF, NEW_PROOF), step.finish('proved', 'Reworked.'), step.result()] },
        { match: rework(T), steps: [step.freeze(T), step.edit(GOAL_LINE, GOAL_LINE + GOAL_PROOF), step.finish('proved', 'Proved again.'), step.result()] },
      ],
      { source: chainModel(), withFacts: false },
    );
    expect(await a.manager.formalize({ subject: 'Spyro', inferences: CHAIN })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(a.manager, 1);
    await settled(a);
    for (const key of ['card:link-one', 'card:link-two', 'proof:link-one']) ok(await a.manager.decide(runId, 1, true, [decision(a, key, 'accepted')], false));
    ok(await a.manager.decide(runId, 1, true, [decision(a, 'proof:link-two', 'declined', { option: 'shaky' })], false));
    await settled(a);
    expect(record(a, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: false } });
    ok(await a.manager.note(runId, 1, record(a, RESULT).id, record(a, RESULT).rev, REDO_NOTE));
    ok(await a.manager.submit(runId, 1, COMMENT));
    await waitForStage(a.manager, 2);
    const turn = a.player?.played[3]?.turn ?? '';
    // The goal's Result was taken out first (D2-57): its note went with it into the feedback turn.
    expect(turn).toContain(`TO BE REDONE: propose them again; what each relied on:\n- Result “Cynder would not be a good addition to the new Spyro game”\n    ${GOAL_PROOF.trim()}\n  The person's note: "${REDO_NOTE}"\n  It relied on: Result “The new Spyro game excludes Cynder”\n`);
    expect(turn.split('\n').slice(0, 2)).toEqual(['Review submitted (stage 1)', `The person's overall comment: "${COMMENT.split('\n')[0]}`]);
  });

  it('a Reject’s note is quoted under REJECTED; a blank comment adds no line and no comment on the seal', async () => {
    const a = first([pgScript('proved'), { match: rework(T), steps: [step.finish('not_proved', 'Nothing else to try.'), step.result()] }]);
    expect(await a.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(a.manager, 1);
    await settled(a);
    ok(await a.manager.decide(runId, 1, true, [decision(a, PG, 'declined', { option: 'reject', note: 'Too strong: not every PG game.' })], false));
    await settled(a);
    expect(record(a, PG).decline).toMatchObject({ option: 'reject', note: 'Too strong: not every PG game.' });
    expect(viewItem(a, PG)?.declined).toEqual({ option: 'reject', note: 'Too strong: not every PG game.' });
    expect(record(a, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    ok(await a.manager.submit(runId, 1, '   '));
    await waitForStage(a.manager, 2);
    const turn = a.player?.played[1]?.turn ?? '';
    expect(turn.startsWith('Review submitted (stage 1)\n\nACCEPTED:')).toBe(true);
    expect(turn).toContain('REJECTED: they were removed; never propose these exact versions again.\n- Formalize “PG games cannot have characters with dark pasts”\n');
    expect(turn).toContain(`  The person's note: "Too strong: not every PG game."\n`);
    expect(session(a).stack.done.find((x) => x.kind === 'seal')).not.toHaveProperty('comment');
    await settled(a);
    expect(a.manager.session()?.report).not.toHaveProperty('comment');
  });

  it('in the middle of Submit’s queue-start write (after its step 1): recover() seals it again with the comment and the stage (D2-96, fixer 2j2 r1, F-F3)', async () => {
    const a = first([pgScript('proved')]);
    const runId = await shakyStage(a);
    // Step 1 of the queue-start write (run.json with `inFlight`) lands, then the window closes.
    const real = RunFiles.prototype.writeStateChecked;
    vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
      await real.call(this, text);
      if (text.includes('"queue-start"')) {
        await a.manager.dispose();
        throw new Error('the window closed');
      }
    });
    expect(await a.manager.submit(runId, 1, COMMENT)).toMatchObject({ ok: false });
    vi.restoreAllMocks();
    expect(rawRun(a).session?.inFlight?.action).toMatchObject({ kind: 'queue-start', by: 'submit', comment: COMMENT });
    expect(session(a).stack.done.some((x) => x.kind === 'seal')).toBe(false);
    const b = second(a);
    await b.manager.recover();
    expect(session(b).inFlight).toBeUndefined();
    const seals = session(b).stack.done.filter((x) => x.kind === 'seal');
    expect(seals).toHaveLength(1);
    expect(seals[0]).toMatchObject({ kind: 'seal', by: 'submit', comment: { text: COMMENT, stage: 1 } });
  });

  it('a Submit that leads to the end confirmation keeps no comment (no Claude step reads it, no seal)', async () => {
    const a = first([pgScript('proved')]);
    expect(await a.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(a.manager, 1);
    await settled(a);
    ok(await a.manager.decide(runId, 1, true, [decision(a, PG, 'accepted')], false));
    ok(await a.manager.decide(runId, 1, true, [decision(a, RESULT, 'accepted')], false));
    await settled(a);
    expect(a.manager.session()?.submit).toMatchObject({ gate: { ok: true }, next: 'confirm' });
    ok(await a.manager.submit(runId, 1, 'Nobody reads this.'));
    expect(session(a).phase).toBe('confirming');
    expect(JSON.stringify(session(a))).not.toContain('Nobody reads this.');
    expect(stackKinds(a)).not.toContain('seal:submit');
  });

  it('N5: a run.json saved before 2j2 (a Shaky note only, no note on an item to be redone, no comment) loads unchanged, and its note still reaches Claude', async () => {
    const a = first([pgScript('proved')]);
    const runId = await shakyStage(a);
    await a.manager.dispose();
    const raw = readFileSync(a.shadow().paths.stateFile, 'utf8');
    expect(raw).not.toContain('"comment"');
    expect(JSON.parse(raw).session.items.some((r: { redo?: { note?: string } }) => r.redo?.note !== undefined)).toBe(false);
    const saved = structuredClone(session(a));
    const b = second(a, [reworkPg()]);
    await b.manager.recover();
    await waitForStage(b.manager, 1);
    await settled(b);
    expect(session(b).items).toEqual(saved.items);
    expect(viewItem(b, RESULT)?.redo).not.toHaveProperty('note');
    ok(await b.manager.submit(runId, 1));
    await waitForStage(b.manager, 2);
    expect(b.player?.played[0]?.turn ?? '').toContain(`  The person's note: "${SHAKY_NOTE}"\n`);
  });
});
