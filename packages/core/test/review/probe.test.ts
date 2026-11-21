/**
 * Slice 2b2 (docs/slice2-plan.md 2.1, 6.1; D2-75, AP30-5): the failed probe's core half. `probeFailure` for each status;
 * a judged state whose probe failed is partial at a stage (every draft with a declaration `factsMissing`, the `facts`
 * problem naming the cause, `ok` false), so reconcile keeps every record and reverts nothing but no-longer-builds; it is
 * not ok at the end; the reducer refuses the Accept of such an item with the cause and what to do. Facts without the
 * marker, and B's facts with a failed probe, refuse nothing and compare by printed type and value (D2-41).
 */
import { describe, expect, it } from 'vitest';
import { leanDurationMs, probeFailure, type LeanFacts, type ProbeRunFacts } from '../../src/facts.js';
import { reconcile } from '../../src/review/reconcile.js';
import { acceptGate, reduceReview } from '../../src/review/reducer.js';
import { depsById } from '../../src/review/records.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { ItemRecord, ReviewState, SessionRecords, StateJudgement } from '../../src/review/types.js';
import { FORMALISED, PROVED, freezeOf, judge, tags } from './helpers/judge.js';
import { AT, PLAIN, RUN, idOf, record, recordsOf, stateOf } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, append, created, modelOf } from './helpers/session.js';

const HONEST = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')];
const FAILED: ProbeRunFacts = { status: 'failed', durationMs: 120, detail: 'probe.lean:7:2: error: unknown module prefix\n  Model.Spyro' };
const CAUSE = 'telelean could not read what the declarations of this state use in Lean: the probe failed: probe.lean:7:2: error: unknown module prefix Model.Spyro.';
/** The same without the probe's detail: what shows while the results are hidden (fixer 2b2 r1, A-V2B2-ADV-7). */
const PLAIN_CAUSE = 'telelean could not read what the declarations of this state use in Lean: the probe failed.';
const facts = (probe?: ProbeRunFacts): LeanFacts => ({ ...(modelOf(BASE).facts as LeanFacts), ...(probe !== undefined ? { probe } : {}) });

describe('probeFailure (§2.1)', () => {
  it('a sentence for `cut` and `failed`, naming the cause; undefined for `ok`, the sandbox’s four statuses, no marker and no facts', () => {
    expect(probeFailure(facts({ status: 'cut', durationMs: 1 }))).toBe("telelean could not read what the declarations of this state use in Lean: Lean's answer was over 32 MB.");
    expect(probeFailure(facts(FAILED))).toBe(CAUSE);
    // The detail on one line, without a final period; none at all.
    expect(probeFailure(facts({ status: 'failed', durationMs: 1, detail: '  no line was printed.  \n' }))).toBe('telelean could not read what the declarations of this state use in Lean: the probe failed: no line was printed.');
    expect(probeFailure(facts({ status: 'failed', durationMs: 1 }))).toBe('telelean could not read what the declarations of this state use in Lean: the probe failed.');
    for (const status of ['ok', 'oom', 'timeout', 'cancelled', 'could-not-start'] as const) expect(probeFailure(facts({ status, durationMs: 1 })), status).toBeUndefined();
    // Fixer 2b2 r1 (A-V2B2-ADV-7): `detail: false` leaves Lean's error out (it can name hidden proof material); `cut` has none.
    expect(probeFailure(facts(FAILED), { detail: false })).toBe(PLAIN_CAUSE);
    expect(probeFailure(facts(FAILED), { detail: true })).toBe(CAUSE);
    expect(probeFailure(facts({ status: 'cut', durationMs: 1 }), { detail: false })).toBe(probeFailure(facts({ status: 'cut', durationMs: 1 })));
    expect(probeFailure(facts({ status: 'ok', durationMs: 1 }), { detail: false })).toBeUndefined();
    expect(probeFailure(facts())).toBeUndefined();
    expect(probeFailure(undefined)).toBeUndefined();
  });

  it('leanDurationMs (fixer 2b3a r1, C-V2B3A-C2): the build job\'s, the check job\'s and the probe job\'s time, whatever the probe gave; without a marker, the first two', () => {
    const timed = (probe?: ProbeRunFacts): LeanFacts => {
      const f = facts(probe);
      return { ...f, build: { ...f.build, durationMs: 100 }, check: { ...f.check, durationMs: 20 } };
    };
    for (const status of ['ok', 'cut', 'failed', 'oom', 'timeout', 'cancelled', 'could-not-start'] as const) expect(leanDurationMs(timed({ status, durationMs: 7 })), status).toBe(127);
    expect(leanDurationMs(timed())).toBe(120);
    expect(leanDurationMs(timed({ status: 'ok', durationMs: 0 }))).toBe(120);
  });

  it('fakeFacts’ `probe`: the marker; a failed one gives no declaration constants, the cause as a check problem', () => {
    const failed = modelOf(PROVED, { probe: FAILED }).facts as LeanFacts;
    expect(failed.probe).toEqual(FAILED);
    expect(failed.status).toBe('check-errors');
    expect(failed.detail).toBe(CAUSE);
    expect(failed.decls.some((d) => d.valueConsts !== undefined || d.typeConsts !== undefined)).toBe(false);
    const ok = modelOf(PROVED, { probe: 'ok' }).facts as LeanFacts;
    expect(ok.probe).toEqual({ status: 'ok', durationMs: 300 });
    expect(ok.decls.every((d) => d.valueConsts !== undefined && d.typeConsts !== undefined)).toBe(true);
  });
});

/** The records after the first queue ended on `PROVED` (every item in review), with a passing judgement. */
function firstStage(): { records: SessionRecords; judgement: StateJudgement } {
  const judgement = judge(PROVED, { purpose: 'stage', ledger: HONEST, ended: [TARGET], facts: { probe: 'ok' } });
  const records = recordsOf([], {
    inferences: [INFERENCE],
    steps: [{ id: 's1', kind: 'formalize', target: TARGET, stage: 0, state: 'passed', question: INFERENCE.question }],
    ledger: HONEST,
  });
  return { records: reconcile({ runId: RUN, records, judgement, queueSteps: ['s1'], at: AT }).records, judgement };
}

describe('a judged state whose probe failed (§2.1, D2-75)', () => {
  it('at a stage: every draft with a declaration lacks its facts, the `facts` problem names the cause and Apply, `ok` is false; each class says why', () => {
    for (const probe of [FAILED, { status: 'cut', durationMs: 1 } as ProbeRunFacts]) {
      const j = judge(PROVED, { purpose: 'stage', ledger: HONEST, ended: [TARGET], facts: { probe } });
      expect(j.drafts.map((d) => [d.key, d.factsMissing])).toEqual([
        ['card:pg-no-dark-past', true],
        [`proof:${TARGET}`, true],
      ]);
      const cause = probeFailure(modelOf(PROVED, { probe }).facts) as string;
      // Fixer 2b2 r1 (A-V2B2-ADV-7): the problem shows while the results may be hidden, so it leaves the detail out;
      // so does the class map in force while they are hidden. The classes in force once they are shown carry it.
      const plain = probeFailure(modelOf(PROVED, { probe }).facts, { detail: false }) as string;
      expect(j.problems.filter((p) => p.code === 'facts')).toEqual([
        { code: 'facts', text: `${plain} Apply stays disabled until telelean can read it.`, keys: ['card:pg-no-dark-past', `proof:${TARGET}`] },
      ]);
      expect(j.ok).toBe(false);
      for (const [map, sentence] of [
        [j.classes, cause],
        [j.classesBeforeReveal, plain],
      ] as const) {
        expect(map['card:pg-no-dark-past']).toMatchObject({ factsMissing: true, probeFailure: sentence });
        expect(map[`proof:${TARGET}`]).toMatchObject({ factsMissing: true, probeFailure: sentence });
      }
    }
  });

  it('a draft without a declaration (an arrow, a Result as in B) is no partial draft; the problem stands with no draft to key', () => {
    const j = judge(BASE, { purpose: 'stage', ended: [TARGET], facts: { probe: FAILED } });
    expect(j.drafts.map((d) => [d.key, d.asInBase, d.factsMissing])).toEqual([[`proof:${TARGET}`, true, undefined]]);
    expect(j.problems).toEqual([{ code: 'facts', text: `${PLAIN_CAUSE} Apply stays disabled until telelean can read it.` }]);
    expect(j.ok).toBe(false);
  });

  it('reconcile keeps every record as it was and reverts nothing: B.2’s `source-only` takes no proved Result out', () => {
    const { records } = firstStage();
    expect(records.items.map((r) => [r.key, r.status])).toEqual([
      ['card:pg-no-dark-past', 'in-review'],
      [`proof:${TARGET}`, 'in-review'],
    ]);
    const j = judge(PROVED, { purpose: 'stage', ledger: HONEST, ended: [TARGET], facts: { probe: FAILED } });
    // Without the constants B.2 cannot see what the proof uses: the inference fails, which a full judgement reverts.
    expect(tags(j.inferences[TARGET]?.findings ?? [])).toContain('undeclared-premise/source-only');
    const after = reconcile({ runId: RUN, records, judgement: j, at: AT });
    expect(after.records.items).toEqual(records.items);
    expect(after.reverts).toEqual([]);
    expect(after.events).toEqual([]);
    // The same at a queue's end.
    const atEnd = reconcile({ runId: RUN, records, judgement: j, queueSteps: ['s1'], at: AT });
    expect(atEnd.records.items).toEqual(records.items);
    expect(atEnd.reverts).toEqual([]);
  });

  it('…but no-longer-builds still takes out what does not build (the judge runs again once it is out)', () => {
    const lemma = 'theorem dark_pg : HasDarkPast cynder := cynder_dark_past.holds';
    const current = append(PROVED, MAIN, lemma);
    const ledger = [...HONEST, created('Spyro.dark_pg', 'proof')];
    const line = (current[MAIN] as string).split('\n').indexOf(lemma);
    const messages = [{ severity: 'error' as const, file: MAIN, range: { start: { line, character: 8 }, end: { line, character: 8 } }, text: 'unknown identifier' }];
    const ok = judge(current, { purpose: 'stage', ledger, ended: [TARGET], facts: { probe: 'ok' } });
    const records = reconcile({
      runId: RUN,
      records: recordsOf([], { inferences: [INFERENCE], steps: [{ id: 's1', kind: 'formalize', target: TARGET, stage: 0, state: 'passed', question: INFERENCE.question }], ledger }),
      judgement: ok,
      queueSteps: ['s1'],
      at: AT,
    }).records;
    const j = judge(current, { purpose: 'stage', ledger, ended: [TARGET], facts: { probe: FAILED, messages } });
    expect(j.problems.map((p) => p.code)).toEqual(['no-longer-builds', 'facts']);
    const after = reconcile({ runId: RUN, records, judgement: j, at: AT });
    expect(after.reverts).toEqual([idOf(`proof:${TARGET}`)]);
    expect(after.records.items.find((r) => r.key === `proof:${TARGET}`)).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, markers: ['no-longer-builds'] });
    expect(after.records.items.find((r) => r.key === 'card:pg-no-dark-past')?.status).toBe('in-review');
  });

  it('at the end: not ok, with the `facts` problem', () => {
    const j = judge(PROVED, { purpose: 'final', ledger: HONEST, ended: [TARGET], facts: { probe: FAILED } });
    expect(j.ok).toBe(false);
    expect(j.problems.map((p) => p.code)).toEqual(['facts']);
  });

  it('the reducer refuses the Accept of such an item with the cause and "Decline what caused it, or Exit." (`blocked` in a group); a module that did not build keeps ADV-3’s text (AP30-5)', () => {
    const { records } = firstStage();
    const j = judge(PROVED, { purpose: 'stage', ledger: HONEST, ended: [TARGET], facts: { probe: FAILED } });
    const state: ReviewState = {
      ...stateOf({ items: records.items, inferences: [INFERENCE] }),
      deps: depsById(records.items, j.deps),
      classes: j.classes,
      classesBeforeReveal: j.classesBeforeReveal,
    };
    const card = records.items.find((r) => r.key === 'card:pg-no-dark-past') as ItemRecord;
    // The results are hidden here (the card is an undecided belief item): the cause without the probe's detail
    // (fixer 2b2 r1, A-V2B2-ADV-7); once they are shown, with it.
    const hidden = `${PLAIN_CAUSE} Decline what caused it, or Exit.`;
    expect(reduceReview(state, { kind: 'decide', decisions: [{ item: card.id, rev: card.rev, to: 'accepted' }], own: true, confirmed: false }, AT)).toEqual({ ok: false, code: 'refused', error: hidden, item: card.id });
    expect(acceptGate(state, card.id, true)).toMatchObject({ ok: false, reason: 'blocked', text: hidden });
    const shownState: ReviewState = { ...state, forced: { via: 'show-result', at: AT } };
    const own = reduceReview(shownState, { kind: 'decide', decisions: [{ item: card.id, rev: card.rev, to: 'accepted' }], own: true, confirmed: false }, AT);
    const text = `${CAUSE} Decline what caused it, or Exit.`;
    expect(REVIEW_TEXTS.acceptProbeFailed(CAUSE)).toBe(text);
    expect(own).toEqual({ ok: false, code: 'refused', error: text, item: card.id });
    expect(acceptGate(shownState, card.id, true)).toMatchObject({ ok: false, reason: 'blocked', text });
    // In a group: an item that needs no own Accept (a plain term of that state) is left `blocked`, with the same text.
    const term = record('vocab:Spyro.V', 'vocabulary-term');
    const other = record('vocab:Spyro.W', 'vocabulary-term');
    const partialTerm = { ...PLAIN, factsMissing: true as const, probeFailure: CAUSE };
    const mixed: ReviewState = {
      ...state,
      items: [...state.items, term, other],
      classes: { ...state.classes, [term.key]: partialTerm, [other.key]: PLAIN },
      classesBeforeReveal: { ...state.classesBeforeReveal, [term.key]: partialTerm, [other.key]: PLAIN },
    };
    const group = reduceReview(mixed, { kind: 'decide', decisions: [term, other].map((r) => ({ item: r.id, rev: r.rev, to: 'accepted' as const })), own: false, confirmed: false }, AT);
    expect(group).toMatchObject({ ok: true, taken: [other.id], left: [{ item: term.id, reason: 'blocked' }] });
    expect(acceptGate(mixed, term.id, false)).toMatchObject({ ok: false, reason: 'blocked', text });
    // A module that did not build: ADV-3's text, which a later check lifts.
    const unbuilt: ReviewState = { ...state, classes: { ...state.classes, [card.key]: { ...PLAIN, factsMissing: true } }, classesBeforeReveal: { ...state.classesBeforeReveal, [card.key]: { ...PLAIN, factsMissing: true } } };
    expect(reduceReview(unbuilt, { kind: 'decide', decisions: [{ item: card.id, rev: card.rev, to: 'accepted' }], own: true, confirmed: false }, AT)).toMatchObject({
      ok: false,
      code: 'refused',
      error: REVIEW_TEXTS.acceptFactsMissing('Formalize “pg-no-dark-past”'),
    });
  });
});

describe('facts without the marker, and B’s facts with a failed probe, refuse nothing (§2.1, D2-25, D2-41)', () => {
  it('an old recording (no marker, no typeConsts): no partial draft and no `facts` problem at a stage; D2-25’s fallbacks', () => {
    const j = judge(PROVED, { purpose: 'stage', ledger: HONEST, ended: [TARGET], facts: { typeConsts: false } });
    expect(j.drafts.some((d) => d.factsMissing === true)).toBe(false);
    expect(j.problems).toEqual([]);
    expect(j.classes[`proof:${TARGET}`]?.probeFailure).toBeUndefined();
  });

  it('B’s (and S₀’s) facts with a failed probe: an honest first step passes, with no `facts` problem; a meaning change shows by printed value', () => {
    const o = { baseFacts: { probe: FAILED }, startFacts: { probe: FAILED }, freeze: freezeOf(FORMALISED) };
    const honest = judge(PROVED, { ...o, purpose: 'gate-proved' });
    expect(honest.stepFindings).toEqual([]);
    expect(honest.problems).toEqual([]);
    expect(honest.drafts.some((d) => d.factsMissing === true)).toBe(false);
    // The printed value of a declaration of S₀ changed with its text unchanged: still refused (D2-41's printed part).
    const changed = judge(PROVED, { ...o, purpose: 'check', stage: 'prove', facts: { overrides: { 'Spyro.cynder_dark_past': { value: 'Spyro.HasDarkPast Spyro.cynder ∨ True' } } } });
    expect(tags(changed.stepFindings)).toContain('existing-changed/meaning');
    expect(changed.stepFindings.find((f) => f.token === 'meaning')?.message).toContain('its value was `Spyro.HasDarkPast Spyro.cynder`, now `Spyro.HasDarkPast Spyro.cynder ∨ True`');
    // Only its constants changed: with S₀'s constants missing, compared approximately (no step-limit finding).
    const consts = judge(PROVED, { ...o, purpose: 'check', stage: 'prove', facts: { overrides: { 'Spyro.cynder_dark_past': { valueConsts: ['Spyro.HasDarkPast'] } } } });
    expect(tags(consts.stepFindings)).not.toContain('existing-changed/meaning');
    // With S₀'s constants, the same is refused (the check runs where both states have them).
    expect(tags(judge(PROVED, { freeze: freezeOf(FORMALISED), purpose: 'check', stage: 'prove', facts: { overrides: { 'Spyro.cynder_dark_past': { valueConsts: ['Spyro.HasDarkPast'] } } } }).stepFindings)).toContain(
      'existing-changed/meaning',
    );
  });
});
