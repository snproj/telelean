/**
 * Slice 2f (docs/slice2-plan.md 3.8, 6.1's 2f "Add premise" list): an Add premise item once accepted, with the
 * FakeBackend and the fake engine (its stage judge, premise write, completion and final check are core's rules on fake
 * facts): the premise write (the card in Claude's words, its arrow, the mark removal; the written key recorded as the
 * accepted one), the completion and its failure (Retry step), a meaning mismatch, a failed probe (AP30-4), due writes
 * after a crash (AF2), taking a written premise out (Undo, back to review, Reject and its Undo), the gates (AF3).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { premiseDraftKey, premiseKey, REVIEW_TEXTS, type ActionOutcome, type LedgerEntry, type StateJudgement } from '@telelean/core';

import { RunFiles } from '../../src/run/persist.js';
import { completionFailedEvent, completionFailedHeading, PREMISE_MEANING_EVENT } from '../../src/run/premises.js';
import type { PersistedSession } from '../../src/run/types.js';
import { fakeStageJudge, fakeWritePremise } from './helpers/fakeEngine.js';
import { makeHarness, rawRun, round1, START, step, waitForRun, waitForStage, type Harness } from './helpers/harness.js';
import { acceptPremise, premiseSteps, PREMISE_KEY, PREMISE_NAME, PREMISE_PROOF, premiseCardText, premiseRecord, premiseScript, premiseStage, proposePremise, scriptEnd } from './helpers/premises.js';
import { consistent, decision, main, PG, record, RESULT, session, settled, T } from './helpers/review.js';
import { makeTempDir, SPYRO_FIXTURE } from './helpers/env.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of toDispose.splice(0)) d();
});

const ok = (o: ActionOutcome) => expect(o).toMatchObject({ ok: true });
type Internals = {
  run: unknown;
  enqueueWrite<X>(run: unknown, job: () => Promise<X>): Promise<X>;
  sessionOf(run: unknown): PersistedSession;
  runtimeOf(run: unknown): { judgement: StateJudgement | null };
};
const internals = (h: Harness) => h.manager as unknown as Internals;

const premiseEntry = (h: Harness): Extract<LedgerEntry, { kind: 'premise' }> | undefined =>
  session(h).ledger.find((e): e is Extract<LedgerEntry, { kind: 'premise' }> => e.kind === 'premise' && e.item === PREMISE_KEY);
const ledgerKinds = (h: Harness, key = PREMISE_KEY): string[] => session(h).ledger.flatMap((e) => (e.kind !== 'arrow' && e.kind !== 'created' && e.item === key ? [e.kind] : []));
const commitKinds = async (h: Harness): Promise<string[]> => (await h.shadow().commits()).map((c) => c.kind);

describe('Accept of an Add premise writes it, then completes the target (§3.8)', () => {
  it('as an axiom: the card in Claude\'s words, its arrow into T, writePremise\'s key recorded as the accepted one (the draft\'s kept in versions, same rev), the completion passes, and T\'s Result is "updated"', async () => {
    const { h, runId } = await premiseStage(toDispose);
    const before = premiseRecord(h);
    expect(before).toMatchObject({ kind: 'add-premise', status: 'in-review', partOf: T });
    const draftKey = before.fingerprint;
    expect(draftKey).toBe(premiseDraftKey(session(h).premises[0] as NonNullable<PersistedSession['premises'][number]>));
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom', 'It is how games work.')], false));
    await settled(h);
    const entry = premiseEntry(h);
    expect(entry).toMatchObject({ kind: 'premise', target: T, holdAs: 'axiom', item: PREMISE_KEY });
    const card = entry?.card ?? '';
    const text = await main(h);
    const block = premiseCardText(text, card);
    // The card in Claude's words, as an AXIOM card with its Why, then its statement and its `.holds` axiom.
    expect(block).toContain('type: AXIOM');
    expect(block).toContain(`natural_name: ${before.content.premise?.naturalName}`);
    expect(block).toContain('rationale: It is how games work.');
    expect(block).toContain(`axiom ${PREMISE_NAME}.holds : ${PREMISE_NAME}`);
    // Its arrow into T (the adoption appends it to T's premises:), and the completion from the checked gap proof.
    expect(text).toMatch(new RegExp(`id: ${T}\\n[^]*?premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, ${card}\\n`, 'u'));
    expect(text).toContain(`theorem cynder_not_good.holds : cynder_not_good :=\n  (${PREMISE_PROOF}) Spyro.${PREMISE_NAME}.holds`);
    // The commits: the premise write's `adopt`, then the completion's `completion`, both after the stage's commits.
    expect((await commitKinds(h)).slice(-2)).toEqual(['adopt', 'completion']);
    const [adopt, completion] = (await h.shadow().commits()).slice(-2);
    expect(entry?.commit).toBe(adopt?.id);
    expect(session(h).ledger.find((e) => e.kind === 'completion')).toEqual({ kind: 'completion', target: T, item: PREMISE_KEY, commit: completion?.id });
    // The written key is the accepted one, and the record's; the draft's stays in `versions` with the same rev.
    const r = premiseRecord(h);
    expect(r.status).toBe('accepted');
    expect(r.card).toBe(card);
    expect(r.fingerprint).not.toBe(draftKey);
    expect(r.accepted?.fingerprint).toBe(r.fingerprint);
    expect(r.accepted).toMatchObject({ holdAs: 'axiom', rationale: 'It is how games work.' });
    expect(r.rev).toBe(before.rev);
    expect(r.versions).toEqual([expect.objectContaining({ rev: before.rev, fingerprint: draftKey })]);
    expect(r.markers).not.toContain('updated');
    // The judge that followed reconciled the completion: T's Result is back in review, "updated"; the premise stays.
    expect(record(h, RESULT)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    expect(session(h).judged).toMatchObject({ commit: session(h).head, ok: true });
    expect(session(h).head).toBe(completion?.id);
    await consistent(h);
    // The engine saw the write's ledger entries with the calls.
    expect(h.engine.methods().filter((m) => m === 'writePremise' || m === 'complete')).toEqual(['writePremise', 'complete']);
  });
});

/** The manager after a reload: same root, runs dir and workspace; the first manager is disposed first. */
async function reload(a: Harness, script: NonNullable<Parameters<typeof makeHarness>[0]>['script'] = []): Promise<Harness> {
  await a.manager.dispose();
  const b = makeHarness({ reuse: { dir: a.dir, root: a.root, runsDir: a.runsDir, workspace: a.workspace }, script });
  toDispose.unshift(() => b.dispose());
  scriptEnd(b);
  return b;
}

describe('the Accept of an Add premise (§3.8, AF12, AF13)', () => {
  it('as pending: a PROPOSITION card with `axiom P.holds` (A26), never an AXIOM card; its own Accept is required (a group Accept leaves it)', async () => {
    const { h, runId } = await premiseStage(toDispose);
    // RV-7: a belief item; a group Accept leaves it, saying why, and records nothing.
    expect(await h.manager.decide(runId, 1, false, [acceptPremise(h, 'pending')], false)).toMatchObject({ ok: true, review: { taken: [], left: [{ item: premiseRecord(h).id, reason: 'own-accept' }] } });
    expect(premiseRecord(h).status).toBe('in-review');
    // §3.8: the Accept says how it is held; without the choice it is refused (never defaulted).
    expect(await h.manager.decide(runId, 1, true, [decision(h, PREMISE_KEY, 'accepted')], false)).toMatchObject({ ok: false, code: 'refused' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'pending')], false));
    await settled(h);
    const card = premiseEntry(h)?.card ?? '';
    const block = premiseCardText(await main(h), card);
    expect(block).toContain('type: PROPOSITION');
    expect(block).not.toContain('type: AXIOM');
    expect(block).toContain(`axiom ${PREMISE_NAME}.holds : ${PREMISE_NAME}`);
    expect(premiseEntry(h)).toMatchObject({ holdAs: 'pending' });
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', accepted: { holdAs: 'pending' } });
  });

  it('while the results are hidden it is not listed, and its Accept is refused: show the results first (RV-6, D2-8)', async () => {
    const h = makeHarness({ script: [premiseScript()] });
    toDispose.push(() => h.dispose());
    scriptEnd(h);
    expect(await h.manager.start(START)).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    expect(h.manager.session()?.results.shown).toBe(false);
    const id = premiseRecord(h).id;
    expect(h.manager.session()?.items.some((i) => i.id === id)).toBe(false);
    expect(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false)).toMatchObject({ ok: false });
    expect(premiseRecord(h).status).toBe('in-review');
    expect(h.engine.methods()).not.toContain('writePremise');
  });

  it('a second premise for a proved T is written and marked "unused premise", and no completion follows', async () => {
    const { h, runId } = await premiseStage(toDispose, 'proved');
    // T is proved: its Result rests on PG's Formalize; accepting the premise needs nothing else.
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', markers: expect.arrayContaining(['unused-premise']) });
    expect(premiseRecord(h).card).toBeDefined();
    expect(h.engine.methods()).not.toContain('complete');
    expect(session(h).ledger.some((e) => e.kind === 'completion')).toBe(false);
    expect((await commitKinds(h)).at(-1)).toBe('adopt');
  });
});

describe('the completion (§3.8, D2-56, F15)', () => {
  it('a failed completion is taken back out (a `revert` commit holding the adopt commit\'s files), T\'s Result is marked "completion not checked" with Lean\'s message, and Retry step runs a `submit` step for T with its proof open', async () => {
    const { h, runId } = await premiseStage(toDispose, 'not-proved', {
      script: [premiseScript(), { match: `rework “${T}” after the review`, steps: [step.check(), step.edit('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n'), step.finish('not_proved', 'Still no proof.'), step.result()] }],
    });
    h.engine.onComplete = () => ({ ok: false, error: 'type mismatch (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    const commits = await h.shadow().commits();
    const [adopt, revert] = commits.slice(-2);
    expect([adopt?.kind, revert?.kind]).toEqual(['adopt', 'revert']);
    expect(await h.shadow().filesAt(revert?.id ?? '')).toEqual(await h.shadow().filesAt(adopt?.id ?? ''));
    expect(await main(h)).not.toContain('cynder_not_good.holds');
    // The premise stays accepted and written; no completion entry; T's Result never reads as proved.
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted' });
    expect(ledgerKinds(h)).toEqual(['premise']);
    expect(record(h, RESULT).markers).toContain('completion-not-checked');
    expect(session(h).events.at(-1)).toMatchObject({ text: completionFailedEvent(T, 'type mismatch (test)'), items: [record(h, RESULT).id] });
    expect(h.manager.session()?.heading).toMatchObject({ kind: 'failed', text: REVIEW_TEXTS.stepFailed(completionFailedHeading(T)), retry: { ok: true } });
    const retryId = session(h).retry[0] ?? '';
    expect(session(h).steps.find((x) => x.id === retryId)).toMatchObject({ kind: 'submit', target: T, state: 'not-run', scope: { openProof: true } });
    // No completion is due again while the marker stands (it waits for Retry step).
    expect(h.engine.methods().filter((m) => m === 'complete')).toHaveLength(1);
    await consistent(h);
    // Retry step: a `submit` step for T with its proof open, from the head the completion was taken back to.
    ok(await h.manager.retry(runId));
    await waitForStage(h.manager, 1);
    const retried = session(h).steps.at(-1);
    expect(retried).toMatchObject({ kind: 'submit', target: T, retryOf: retryId, scope: { openProof: true } });
    const startCommit = (await h.shadow().commits()).find((c) => c.id === retried?.startCommit);
    expect(startCommit?.kind).toBe('step-start');
    expect(await h.shadow().filesAt(startCommit?.id ?? '')).toEqual(await h.shadow().filesAt(revert?.id ?? ''));
  });

  it('a failed completion leaves the stage\'s heading as it is: under "did not pass" it stays so (the core view derives the Accept gate from it), and the marker and Retry step are still recorded (A-F2)', async () => {
    const { h, runId } = await premiseStage(toDispose, 'not-proved', {
      script: [premiseScript(), { match: `rework “${T}” after the review`, steps: [step.check(), step.finish('not_proved', 'Still no proof.'), step.result()] }],
    });
    const heading = { kind: 'did-not-pass' as const, text: 'Your decisions leave a working copy that does not pass its checks', firstStep: false, retry: { ok: true } };
    h.engine.onWritePremise = async (ctx, premise) => {
      // While the write runs, the stage comes to be under a "did not pass" heading (as a decision's judge sets it).
      const m = internals(h);
      (m.sessionOf(m.run) as { heading?: unknown }).heading = { ...heading };
      return fakeWritePremise(ctx, premise);
    };
    h.engine.onComplete = () => ({ ok: false, error: 'type mismatch (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(record(h, RESULT).markers).toContain('completion-not-checked');
    expect(session(h).retry).toHaveLength(1);
    expect(session(h).heading).toEqual(heading);
    expect(h.manager.session()?.heading).toMatchObject({ kind: 'did-not-pass', text: heading.text });
  });

  it('a meaning mismatch where it was written takes the write back out and returns the item to review, marked "meaning differs in place" (F11)', async () => {
    const { h, runId } = await premiseStage(toDispose);
    h.engine.onWritePremise = (ctx, premise) => fakeWritePremise(ctx, premise, true);
    const parent = session(h).head;
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['meaning-differs-in-place']) });
    expect(premiseRecord(h).accepted).toBeUndefined();
    expect(premiseRecord(h).card).toBeUndefined();
    expect(ledgerKinds(h)).toEqual([]);
    expect(await h.shadow().currentFiles()).toEqual(await h.shadow().filesAt(parent));
    expect((await commitKinds(h)).slice(-2)).toEqual(['adopt', 'revert']);
    expect(session(h).events.at(-1)).toMatchObject({ text: PREMISE_MEANING_EVENT, items: [premiseRecord(h).id] });
    expect(h.engine.methods()).not.toContain('complete');
    await consistent(h);
  });
});

describe('a premise write that could not be made (§3.8, AP30-4)', () => {
  const PROBE = 'telelean could not read what the statements rely on: the probe failed.';

  it('a judgement whose probe failed takes the write back out; the item stays accepted with its draft key; the stage problem names the cause; once the probe works, a reload\'s due write records the written key, with no "updated" item and no dependent back in review', async () => {
    const { h, runId } = await premiseStage(toDispose, 'proved');
    // T proved: its Result and PG accepted first, so the written premise's arrival could only send them back.
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    h.engine.onWritePremise = () => ({ ok: false, error: PROBE.replace(/\.$/u, ''), environment: PROBE });
    const parent = session(h).head;
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    const r = premiseRecord(h);
    const draftKey = premiseDraftKey(session(h).premises[0] as NonNullable<PersistedSession['premises'][number]>);
    expect(r).toMatchObject({ status: 'accepted', fingerprint: draftKey, accepted: { fingerprint: draftKey } });
    expect(r.card).toBeUndefined();
    expect(ledgerKinds(h)).toEqual([]);
    expect(await h.shadow().currentFiles()).toEqual(await h.shadow().filesAt(parent));
    expect(h.manager.session()?.problems).toEqual([{ text: expect.stringContaining(`was accepted, but telelean could not write it: ${PROBE.replace(/\.$/u, '')}. Reload the window to try again, or decline it.`) as string, items: [r.id] }]);
    const before = session(h).items.map((x) => ({ key: x.key, status: x.status, markers: x.markers }));
    // The probe works again: after a reload the due write runs.
    const b = await reload(h);
    await b.manager.recover();
    await settled(b);
    const written = premiseRecord(b);
    expect(written.card).toBeDefined();
    expect(written.fingerprint).not.toBe(draftKey);
    expect(written.accepted?.fingerprint).toBe(written.fingerprint);
    expect(session(b).items.filter((x) => x.markers.includes('updated'))).toEqual([]);
    expect(session(b).items.map((x) => ({ key: x.key, status: x.status }))).toEqual(before.map((x) => ({ key: x.key, status: x.status })));
    expect(b.manager.session()?.problems).toEqual([]);
  });

  it('a Lean environment failure is the same, and the write stays due: a later Accept\'s write does not retry it, a reload does', async () => {
    const { h, runId } = await premiseStage(toDispose);
    h.engine.onWritePremise = () => ({ ok: false, error: 'the Lean sandbox could not start (test)', environment: 'the Lean sandbox could not start (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted' });
    expect(premiseRecord(h).card).toBeUndefined();
    expect(h.manager.session()?.problems.map((p) => p.text)).toEqual([expect.stringContaining('could not write it: the Lean sandbox could not start (test). Reload the window')]);
    expect(h.engine.methods().filter((m) => m === 'writePremise')).toHaveLength(1);
    // A decline of the premise lifts the problem (its write is no longer due).
    ok(await h.manager.decide(runId, 1, true, [decision(h, PREMISE_KEY, 'declined', { option: 'reject' })], true));
    await settled(h);
    expect(h.manager.session()?.problems).toEqual([]);
  });
});

/** run.json writes whose `inFlight` is a write of `kind` fail (a crash right before that write's step 1 lands). */
function failStep1Of(kind: 'premise' | 'completion'): void {
  const real = RunFiles.prototype.writeStateChecked;
  const pattern = new RegExp(`"inFlight": \\{\\s*"action": \\{\\s*"kind": "${kind}"`, 'u');
  vi.spyOn(RunFiles.prototype, 'writeStateChecked').mockImplementation(async function (this: RunFiles, text: string) {
    if (pattern.test(text)) throw new Error('the window closed (test)');
    return real.call(this, text);
  });
}

describe('due writes and recovery (D2-71, AF2, §3.11)', () => {
  it('accepted as pending, with a crash before the premise write\'s step 1: after recovery the write gives a PROPOSITION card with `axiom P.holds`, and the Why the person gave', async () => {
    const { h, runId } = await premiseStage(toDispose);
    failStep1Of('premise');
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'pending', 'A rule of the house.')], false));
    await settled(h);
    vi.restoreAllMocks();
    // The Accept is on disk; the write is not (no entry, no card, ws/ untouched).
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', accepted: { holdAs: 'pending', rationale: 'A rule of the house.' } });
    expect(ledgerKinds(h)).toEqual([]);
    expect(await main(h)).not.toContain(`${PREMISE_NAME}.holds`);
    const b = await reload(h);
    await b.manager.recover();
    await settled(b);
    const card = premiseEntry(b)?.card ?? '';
    const block = premiseCardText(await main(b), card);
    expect(block).toContain('type: PROPOSITION');
    expect(block).toContain('rationale: A rule of the house.');
    expect(block).toContain(`axiom ${PREMISE_NAME}.holds : ${PREMISE_NAME}`);
    // ... and the completion after it, in the same recovery.
    expect(ledgerKinds(b)).toEqual(['premise', 'completion']);
    await consistent(b);
  });

  it('a crash after the premise write\'s step 4, before the completion\'s step 1: after recovery the completion runs', async () => {
    const { h, runId } = await premiseStage(toDispose);
    failStep1Of('completion');
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    vi.restoreAllMocks();
    expect(ledgerKinds(h)).toEqual(['premise']);
    expect((await commitKinds(h)).at(-1)).toBe('adopt');
    const b = await reload(h);
    await b.manager.recover();
    await settled(b);
    expect(ledgerKinds(b)).toEqual(['premise', 'completion']);
    expect((await commitKinds(b)).at(-1)).toBe('completion');
    expect(record(b, RESULT)).toMatchObject({ status: 'in-review', markers: expect.arrayContaining(['updated']) });
    // The premise write is not made twice.
    expect(b.engine.methods().filter((m) => m === 'writePremise')).toEqual([]);
    await consistent(b);
  });

  it('a crash in the middle of the premise write (inFlight recorded, files written, no commit): recovery puts ws/ back at the head and makes the write again, once', async () => {
    const { h, runId } = await premiseStage(toDispose);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let reached = false;
    h.engine.onWritePremise = async () => {
      reached = true;
      await held;
      return { ok: false, error: 'never answered (test)' };
    };
    const head = session(h).head;
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    for (let k = 0; k < 400 && !reached; k++) await new Promise((r) => setTimeout(r, 5));
    expect(reached).toBe(true);
    // The window closes now: run.json holds the write in flight, ws/ the card without a commit.
    expect(rawRun(h).session?.inFlight).toMatchObject({ action: { kind: 'premise' }, parent: head });
    expect(await main(h)).toContain(`${PREMISE_NAME}.holds`);
    const b = await reload(h);
    release();
    await b.manager.recover();
    await settled(b);
    expect(ledgerKinds(b)).toEqual(['premise', 'completion']);
    expect(b.engine.methods().filter((m) => m === 'writePremise')).toHaveLength(1);
    await consistent(b);
  });

  it('an Accept undone while its premise write still waits in the write queue writes nothing (its step 1 finds it no longer due)', async () => {
    const { h, runId } = await premiseStage(toDispose);
    const m = internals(h);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // A write already in the queue holds it: the Accept, then the Undo, wait behind it.
    void m.enqueueWrite(m.run, () => held);
    const id = session(h).nextAction;
    const accepting = h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false);
    const undoing = h.manager.undoSession(runId, id, false);
    release();
    ok(await accepting);
    ok(await undoing);
    await settled(h);
    expect(premiseRecord(h).status).toBe('in-review');
    expect(h.engine.methods()).not.toContain('writePremise');
    expect(ledgerKinds(h)).toEqual([]);
    expect(await commitKinds(h)).not.toContain('adopt');
  });
});

describe('taking a written premise out (§3.8, AF2, D2-71)', () => {
  async function written(): Promise<{ h: Harness; runId: string; draftKey: string; card: string }> {
    const { h, runId } = await premiseStage(toDispose);
    const draftKey = premiseRecord(h).fingerprint;
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(ledgerKinds(h)).toEqual(['premise', 'completion']);
    return { h, runId, draftKey, card: premiseEntry(h)?.card ?? '' };
  }
  const takenOut = async (h: Harness, card: string, draftKey: string) => {
    const text = await main(h);
    expect(text).not.toContain(`id: ${card}\n`);
    expect(text).not.toContain(`${PREMISE_NAME}.holds`);
    expect(text).not.toContain('cynder_not_good.holds');
    expect(text).toMatch(new RegExp(`id: ${T}\\n[^]*?premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\\n`, 'u'));
    expect(ledgerKinds(h)).toEqual([]);
    const r = premiseRecord(h);
    expect(r.card).toBeUndefined();
    expect(r.fingerprint).toBe(draftKey);
    // The judged state after it passes (B.3 expects no arrow the ledger does not hold).
    expect(session(h).judged).toMatchObject({ ok: true, commit: session(h).head });
    await consistent(h);
  };

  it('Undo of its Accept takes out the card, the arrow and the completion, drops their ledger entries, and leaves it in review with its draft key; Redo writes it again', async () => {
    const { h, runId, draftKey, card } = await written();
    const accept = session(h).stack.done.at(-1);
    ok(await h.manager.undoSession(runId, accept?.id ?? -1, true));
    await settled(h);
    expect(premiseRecord(h).status).toBe('in-review');
    await takenOut(h, card, draftKey);
    const undone = session(h).stack.undone.at(-1);
    ok(await h.manager.redoSession(runId, undone?.id ?? -1, true));
    await settled(h);
    expect(premiseRecord(h).status).toBe('accepted');
    expect(ledgerKinds(h)).toEqual(['premise', 'completion']);
    expect(h.engine.methods().filter((x) => x === 'writePremise')).toHaveLength(2);
    await consistent(h);
  });

  it('back to review after its Accept takes it out the same way', async () => {
    const { h, runId, draftKey, card } = await written();
    ok(await h.manager.decide(runId, 1, true, [decision(h, PREMISE_KEY, 'in-review')], true));
    await settled(h);
    expect(premiseRecord(h).status).toBe('in-review');
    await takenOut(h, card, draftKey);
  });

  it('declining it (Reject) takes everything out, and T\'s Result becomes to be redone; Undo of the Reject puts it back, ledger entries included', async () => {
    const { h, runId, draftKey, card } = await written();
    const ledgerBefore = session(h).ledger.filter((e) => e.kind === 'premise' || e.kind === 'completion');
    ok(await h.manager.decide(runId, 1, true, [decision(h, PREMISE_KEY, 'declined', { option: 'reject' })], true));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'declined', decline: { option: 'reject' } });
    expect(record(h, RESULT)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    await takenOut(h, card, draftKey);
    const reject = session(h).stack.done.at(-1);
    expect(reject?.kind === 'decide' ? reject.takenOut.map((t) => t.card) : []).toEqual([card]);
    ok(await h.manager.undoSession(runId, reject?.id ?? -1, true));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', card });
    expect(session(h).ledger.filter((e) => e.kind === 'premise' || e.kind === 'completion')).toEqual(ledgerBefore);
    expect(await main(h)).toContain(`id: ${card}\n`);
    expect(await main(h)).toContain('cynder_not_good.holds');
    await consistent(h);
  });

  it('a Reject of T\'s Result takes the completion\'s proof out and the premise stays written; after a reload the completion is not made again (its `completion` entry stays)', async () => {
    const { h, runId, card } = await written();
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'declined', { option: 'reject' })], true));
    await settled(h);
    expect(record(h, RESULT)).toMatchObject({ status: 'declined', decline: { option: 'reject' } });
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', card });
    expect(ledgerKinds(h)).toEqual(['premise', 'completion']);
    expect(await main(h)).not.toContain('theorem cynder_not_good.holds');
    const b = await reload(h);
    await b.manager.recover();
    await settled(b);
    expect(b.engine.methods()).not.toContain('complete');
    expect(b.engine.methods()).not.toContain('writePremise');
    expect(await main(b)).not.toContain('theorem cynder_not_good.holds');
    expect(await main(b)).toContain(`id: ${card}\n`);
    expect(record(b, RESULT).status).toBe('declined');
  });
});

/** A model folder whose target is marked "follows from nothing" (no arrows drawn into it): its question is the mark. */
function markedModel(): string {
  const dir = path.join(makeTempDir('marked'), 'source');
  mkdirSync(dir, { recursive: true });
  cpSync(SPYRO_FIXTURE, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.lake`) });
  const file = path.join(dir, 'Model/Spyro/Main.lean');
  const text = readFileSync(file, 'utf8');
  const marked = text.replace('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
  if (marked === text) throw new Error('the Spyro fixture changed');
  writeFileSync(file, marked);
  return dir;
}

describe('the mark "follows from nothing" (§3.8, AR-5, S18)', () => {
  it('accepting a premise of a target whose question is its mark removes the mark with the write (a ledger `mark-removed` entry); taking it out (Undo of the Accept) puts the mark back', async () => {
    const h = makeHarness({ source: markedModel(), script: [{ match: 'Run: "Follows from nothing?"', steps: [step.freeze(), proposePremise(), step.finish('not_proved', 'It needs a premise.'), step.result()] }] });
    toDispose.push(() => h.dispose());
    scriptEnd(h);
    // The question is the mark: freeze first (propose_assumption needs the statements fixed).
    expect(await h.manager.start({ subject: 'Spyro', target: T, premises: [] })).toMatchObject({ ok: true });
    const { runId } = await waitForStage(h.manager, 1);
    await settled(h);
    expect(h.manager.session()?.results.shown).toBe(true);
    expect(await main(h)).toContain(`id: ${T}\ntype: GOAL\nnatural_name: Cynder would not be a good addition to the new Spyro game\nfollows_from: nothing\n`);
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    const card = premiseEntry(h)?.card ?? '';
    expect(ledgerKinds(h)).toEqual(['premise', 'mark-removed', 'completion']);
    expect(session(h).ledger.find((e) => e.kind === 'mark-removed')).toMatchObject({ card: T, item: PREMISE_KEY, commit: premiseEntry(h)?.commit });
    const text = await main(h);
    expect(text).not.toContain('follows_from: nothing');
    expect(text).toMatch(new RegExp(`id: ${T}\\n[^]*?premises: ${card}\\n`, 'u'));
    ok(await h.manager.undoSession(runId, session(h).stack.done.at(-1)?.id ?? -1, true));
    await settled(h);
    expect(await main(h)).toContain('follows_from: nothing');
    expect(ledgerKinds(h)).toEqual([]);
    await consistent(h);
  });
});

describe('the gates wait for a premise write and its completion (AF3, D2-27, §2.6)', () => {
  it('Submit review waits while a premise write runs, then reads the state it left: the end confirmation\'s files are those of the write\'s last commit', async () => {
    const { h, runId } = await premiseStage(toDispose, 'proved');
    ok(await h.manager.decide(runId, 1, true, [decision(h, RESULT, 'accepted')], false));
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let entered = false;
    h.engine.onWritePremise = async (ctx, premise) => {
      entered = true;
      await held;
      return fakeWritePremise(ctx, premise);
    };
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    for (let k = 0; k < 400 && !entered; k++) await new Promise((r) => setTimeout(r, 5));
    expect(h.manager.session()?.judging).toBe(true);
    let submitted = false;
    const submitting = h.manager.submit(runId, 1).then((o) => {
      submitted = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(submitted).toBe(false);
    expect(session(h).phase).toBe('stage');
    release();
    ok(await submitting);
    expect(session(h).phase).toBe('confirming');
    const adopt = (await h.shadow().commits()).at(-1);
    expect(adopt?.kind).toBe('adopt');
    expect(session(h).head).toBe(adopt?.id);
    const files = await h.shadow().filesAt(adopt?.id ?? '');
    const { filesKey } = await import('../../src/gate/index.js');
    expect(session(h).confirmation?.filesKey).toBe(filesKey(files));
  });
});

describe('Exit while a premise write or its completion runs (§3.10 step 6, F-F1)', () => {
  /** Exit starts (the run is `stopping`, not yet ended) while `hold` waits; the held Lean job then fails, as a cancelled one does. */
  async function exitDuring(which: 'writePremise' | 'complete'): Promise<{ h: Harness; takeBack: ReturnType<typeof vi.fn>; problem: ReturnType<typeof vi.fn>; completionFailed: ReturnType<typeof vi.fn> }> {
    const { h, runId } = await premiseStage(toDispose);
    const m = h.manager as unknown as Record<string, (...a: unknown[]) => unknown>;
    const takeBack = vi.spyOn(m as never, 'takeBack' as never);
    const problem = vi.spyOn(m as never, 'writeProblem' as never);
    const completionFailed = vi.spyOn(m as never, 'completionFailed' as never);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let entered = false;
    const hold = async () => {
      entered = true;
      await held;
    };
    if (which === 'writePremise') h.engine.onWritePremise = async () => (await hold(), { ok: false, error: 'cancelled (test)' });
    else h.engine.onComplete = async () => (await hold(), { ok: false, error: 'cancelled (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    for (let k = 0; k < 400 && !entered; k++) await new Promise((r) => setTimeout(r, 5));
    expect(entered).toBe(true);
    const exiting = h.manager.end(runId, 'exit');
    const run = internals(h).run as { stopping: boolean; ended: boolean };
    for (let k = 0; k < 400 && !run.stopping; k++) await new Promise((r) => setTimeout(r, 1));
    expect(run.stopping).toBe(true);
    expect(run.ended).toBe(false);
    release();
    ok(await exiting);
    await new Promise((r) => setTimeout(r, 50));
    return { h, takeBack, problem, completionFailed };
  }

  it('a premise write whose Lean job was cancelled by the Exit records no write problem and takes nothing back out', async () => {
    const { takeBack, problem, h } = await exitDuring('writePremise');
    expect(problem).not.toHaveBeenCalled();
    expect(takeBack).not.toHaveBeenCalled();
    expect(await commitKinds(h)).not.toContain('revert');
  });

  it('a completion whose Lean job was cancelled by the Exit records no "completion not checked" marker, no Retry step and nothing taken back', async () => {
    const { takeBack, completionFailed, h } = await exitDuring('complete');
    expect(completionFailed).not.toHaveBeenCalled();
    expect(takeBack).not.toHaveBeenCalled();
    expect(await commitKinds(h)).not.toContain('revert');
  });
});

describe('Formalize and Retry step wait for a premise write too (AF3, D2-27, §2.6, F-F2)', () => {
  const SECOND = 'not_in_game_still_not_good';
  const SECOND_KEY = premiseKey(T, SECOND);
  const again = [step.check(), step.finish('not_proved', 'Still no proof.'), step.result()];
  const notProved = [
    { match: `rework “${T}” after the review`, steps: again },
    { match: `formalize and prove “${T}”`, steps: again },
  ];

  /** T not proved with two premises proposed: the first Accept's completion fails (a Retry step exists), the second Accept's write is held. */
  async function heldSecondWrite(): Promise<{ h: Harness; runId: string; release: () => void; entered: () => boolean }> {
    const { h, runId } = await premiseStage(toDispose, 'not-proved', {
      script: [round1(...premiseSteps('not-proved', [proposePremise(SECOND, 'A character who is not in a game is still not a good addition to it')])), ...notProved],
    });
    h.engine.onComplete = () => ({ ok: false, error: 'type mismatch (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(session(h).retry).toHaveLength(1);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let entered = false;
    h.engine.onWritePremise = async (ctx, premise) => {
      entered = true;
      await held;
      return fakeWritePremise(ctx, premise);
    };
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom', undefined, SECOND_KEY)], false));
    for (let k = 0; k < 400 && !entered; k++) await new Promise((r) => setTimeout(r, 5));
    expect(entered).toBe(true);
    return { h, runId, release, entered: () => entered };
  }

  it('Retry step stays unresolved while a premise write runs, then starts from the commit the write left (its step-start follows the adopt commit)', async () => {
    const { h, runId, release } = await heldSecondWrite();
    let resolved = false;
    const retrying = h.manager.retry(runId).then((o) => {
      resolved = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(false);
    expect(session(h).steps.filter((x) => x.state === 'queued' || x.state === 'running')).toEqual([]);
    release();
    ok(await retrying);
    await waitForStage(h.manager, 1);
    const adopt = (await h.shadow().commits()).filter((c) => c.kind === 'adopt').at(-1);
    const retried = session(h).steps.at(-1);
    const start = (await h.shadow().commits()).find((c) => c.id === retried?.startCommit);
    expect(start?.kind).toBe('step-start');
    expect(await h.shadow().filesAt(start?.id ?? '')).toEqual(await h.shadow().filesAt(adopt?.id ?? ''));
  });

  it('a mid-stage Formalize stays unresolved while a premise write runs, then its step starts from the commit the write left', async () => {
    const { h, runId, release } = await heldSecondWrite();
    let resolved = false;
    const asking = h.manager.formalize({ subject: 'Spyro', inferences: [{ target: T, premises: ['cynder-dark-past'] }], runId, stage: 1 }).then((o) => {
      resolved = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(false);
    release();
    ok(await asking);
    await waitForStage(h.manager, 1);
    const adopt = (await h.shadow().commits()).filter((c) => c.kind === 'adopt').at(-1);
    const asked = session(h).steps.at(-1);
    expect(asked).toMatchObject({ kind: 'formalize', target: T });
    const start = (await h.shadow().commits()).find((c) => c.id === asked?.startCommit);
    expect(start?.kind).toBe('step-start');
    expect(await h.shadow().filesAt(start?.id ?? '')).toEqual(await h.shadow().filesAt(adopt?.id ?? ''));
  });
});

describe('premise drafts checked again (RV-1, §3.8, C1)', () => {
  it('a draft that no longer closes the gap after a source\'s Formalize is rejected becomes to be redone, marked "no longer closes the gap", its facts replaced', async () => {
    const { h, runId } = await premiseStage(toDispose);
    // The judge's re-check (engine.judge's premiseChecks): the gap is no longer closed once pg-no-dark-past is not formalised.
    h.engine.onJudge = async (ctx) => {
      const r = await fakeStageJudge(ctx);
      const files = await ctx.shadow.filesAt((await ctx.shadow.commits()).at(-1)?.id ?? '');
      const formalised = (files.get('Model/Spyro/Main.lean') ?? '').includes('abbrev pg_no_dark_past');
      if (formalised) return r;
      const judgement = { ...r.judgement, premiseChecks: { [PREMISE_KEY]: { closesGap: false, facts: { 'Spyro.x': { name: 'Spyro.x', kind: 'def', module: 'Model.Spyro.Main', refs: [] } as never } } } };
      return { judgement, report: { ...r.report, judgement } };
    };
    ok(await h.manager.decide(runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], true));
    await settled(h);
    expect(record(h, PG).status).toBe('declined');
    expect(premiseRecord(h)).toMatchObject({ status: 'to-be-redone', markers: expect.arrayContaining(['no-longer-closes-gap']) });
    expect(Object.keys(session(h).premises[0]?.facts ?? {})).toEqual(['Spyro.x']);
    // A premise to be redone is never written.
    expect(h.engine.methods()).not.toContain('writePremise');
  });
});

describe('what the write records only from a whole judgement (AP30-4, §3.8)', () => {
  it('a written premise whose draft the judgement could not read whole (facts missing) is taken back out, never recorded with a partial key', async () => {
    const { h, runId } = await premiseStage(toDispose);
    h.engine.onWritePremise = async (ctx, premise) => {
      const r = await fakeWritePremise(ctx, premise);
      if (!r.ok) return r;
      const judgement = { ...r.judgement, drafts: r.judgement.drafts.map((d) => (d.key === premise.item ? { ...d, factsMissing: true as const } : d)) };
      return { ...r, judgement };
    };
    const parent = session(h).head;
    const draftKey = premiseRecord(h).fingerprint;
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(premiseRecord(h)).toMatchObject({ status: 'accepted', fingerprint: draftKey, accepted: { fingerprint: draftKey } });
    expect(premiseRecord(h).card).toBeUndefined();
    expect(ledgerKinds(h)).toEqual([]);
    expect(await h.shadow().currentFiles()).toEqual(await h.shadow().filesAt(parent));
    expect(h.manager.session()?.problems[0]?.text).toContain('could not write it: telelean could not read the written premise back.');
  });

  it('a failed completion is not tried again by itself: after a reload its marker keeps it waiting for Retry step', async () => {
    const { h, runId } = await premiseStage(toDispose);
    h.engine.onComplete = () => ({ ok: false, error: 'type mismatch (test)' });
    ok(await h.manager.decide(runId, 1, true, [acceptPremise(h, 'axiom')], false));
    await settled(h);
    expect(record(h, RESULT).markers).toContain('completion-not-checked');
    const b = await reload(h);
    await b.manager.recover();
    await settled(b);
    expect(b.engine.methods()).not.toContain('complete');
    expect(ledgerKinds(b)).toEqual(['premise']);
  });
});
