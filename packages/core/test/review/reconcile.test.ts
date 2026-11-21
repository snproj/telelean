/**
 * Slice 2a2 (docs/slice2-plan.md 3.5, 6.1): reconcile, a stage judgement applied to the records, on synthetic records
 * and judgements.
 */
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/review/classify.js';
import { itemDeps } from '../../src/review/deps.js';
import { computeItems, premiseDraftKey } from '../../src/review/items.js';
import { reconcile } from '../../src/review/reconcile.js';
import { reduceReview } from '../../src/review/reducer.js';
import { resultsState } from '../../src/review/reveal.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { ItemRecord, PremiseDraft, SessionRecords, StateJudgement } from '../../src/review/types.js';
import { normative, pinned } from '../gate/helpers/spyroRun.js';
import { AT, BELIEF, CHANGES, PLAIN, RUN, draft, idOf, inferenceJudgement, item, judgementOf, record, recordsOf, stateOf, statuses } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, created, modelOf } from './helpers/session.js';

const FORCE = { via: 'show-result' as const, at: AT };
const accepted = (extra: Partial<NonNullable<ItemRecord['accepted']>> = {}): NonNullable<ItemRecord['accepted']> => ({
  how: 'own',
  fingerprint: 'fp',
  belief: false,
  changesProved: false,
  at: AT,
  ...extra,
});
/** The steps of a session whose stage 1 ran s1 (formalize t), then a Submit queue with s2 (submit t). */
const SUBMITTED: SessionRecords['steps'] = [
  { id: 's1', kind: 'formalize', target: 't', stage: 0, state: 'passed', question: { sources: ['a'], fromNothing: false } },
  { id: 's2', kind: 'submit', target: 't', stage: 1, state: 'passed', question: { sources: ['a'], fromNothing: false } },
];
const run = (records: SessionRecords, judgement: StateJudgement, queueSteps?: string[]) =>
  reconcile({ runId: RUN, records, judgement, ...(queueSteps ? { queueSteps } : {}), at: AT });

describe('the records and the drafts (§3.5)', () => {
  it('new, unchanged, updated, accepted leaving with its dependents, withdrawn, and a problem for one that vanished', () => {
    const records = recordsOf(
      [
        record('card:a', 'formalize'),
        record('card:b', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('card:c', 'formalize', { status: 'accepted', accepted: accepted() }),
        record('decl:gone', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT } }),
        record('decl:lost', 'declaration'),
        record('decl:shaky', 'declaration', { status: 'declined', decline: { option: 'shaky', note: 'n', at: AT } }),
      ],
      { steps: SUBMITTED },
    );
    const judgement = judgementOf([draft('card:a', 'formalize'), draft('card:b', 'formalize', { contentKey: 'fp:new-b' }), draft('card:c', 'formalize'), draft('decl:new', 'declaration')], {
      deps: { 'card:c': ['card:b'], 'card:a': [], 'card:b': [], 'decl:new': [] },
    });
    const out = run(records, judgement, ['s2']);
    const by = (key: string) => item(out.records, key);
    expect(by('card:a')).toEqual(records.items[0]);
    expect(by('card:b')).toMatchObject({ status: 'in-review', rev: 2, fingerprint: 'fp:new-b', markers: ['updated'], versions: [{ rev: 1, stage: 1, fingerprint: 'fp:card:b', content: { decls: [] } }] });
    expect(by('card:b').accepted).toBeUndefined();
    expect(by('card:c')).toMatchObject({ status: 'in-review', rev: 1, markers: ['updated'] });
    expect(by('decl:gone').status).toBe('declined');
    expect(by('decl:lost').status).toBe('in-review');
    expect(by('decl:shaky').status).toBe('withdrawn');
    expect(by('decl:shaky').decline).toBeUndefined();
    expect(by('decl:new')).toMatchObject({ id: idOf('decl:new'), status: 'in-review', rev: 1, origin: { step: 's1', target: 't', phase: 'statements' } });
    expect(out.problems).toEqual([REVIEW_TEXTS.disappeared('Definition lost')]);
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventChanged, items: [idOf('card:b')] },
      { text: REVIEW_TEXTS.eventWithdrawn, items: [idOf('decl:shaky')] },
      { text: REVIEW_TEXTS.eventChangedWith, items: [idOf('card:c')] },
    ]);
    expect(out.reverts).toEqual([]);
  });

  it('a first step not proved gives its Result a record (F9); its parts are marked as such', () => {
    const out = run(recordsOf([]), judgementOf([draft('proof:t', 'result', { asInBase: true }), draft('arrow:x>t', 'add-arrow', { partOfResult: 't' })]), ['s1']);
    expect(item(out.records, 'proof:t')).toMatchObject({ id: idOf('proof:t'), kind: 'result', status: 'in-review', rev: 1, fingerprint: 'fp:proof:t' });
    expect(item(out.records, 'arrow:x>t').partOf).toBe('t');
  });

  it('a later Result version withdraws its target’s earlier premise drafts that are not accepted (D2-17)', () => {
    const p1 = { target: 't', step: 's1', naturalName: 'P one', leanName: 'p1', leanStatement: 'True', explicit: 'True', whyNeeded: '', proof: '', footprint: [], aloneEntails: false, facts: {} };
    const p2 = { ...p1, naturalName: 'P two', leanName: 'p2' };
    const records = recordsOf(
      [
        record('proof:t', 'result'),
        record('premise:t:p1', 'add-premise', { partOf: 't', content: { decls: [], premise: p1 } }),
        record('premise:t:p2', 'add-premise', { partOf: 't', content: { decls: [], premise: p2 }, status: 'accepted', accepted: accepted({ holdAs: 'axiom', belief: true }) }),
      ],
      { premises: [p1, p2] },
    );
    const judgement = judgementOf([
      draft('proof:t', 'result', { contentKey: 'fp:proved', origin: { step: 's2', target: 't', phase: 'proof' } }),
      draft('premise:t:p1', 'add-premise', { partOfResult: 't', content: { decls: [], premise: p1 } }),
      draft('premise:t:p2', 'add-premise', { partOfResult: 't', content: { decls: [], premise: p2 } }),
    ], { classes: { 'premise:t:p1': BELIEF, 'premise:t:p2': BELIEF, 'proof:t': PLAIN } });
    const out = run(records, judgement, ['s2']);
    expect(item(out.records, 'premise:t:p1').status).toBe('withdrawn');
    expect(item(out.records, 'premise:t:p2').status).toBe('accepted');
    expect(out.records.premises.map((p) => p.leanName)).toEqual(['p2']);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventWithdrawn, items: [idOf('premise:t:p1')] }]);
  });

  it('a written premise whose record holds the written key stays accepted; one taken out, holding the draft key again, is unchanged', () => {
    const written = record('premise:t:p', 'add-premise', { partOf: 't', card: 'pc', fingerprint: 'fp:written', status: 'accepted', accepted: accepted({ fingerprint: 'fp:written', holdAs: 'axiom', belief: true }) });
    const classes = { 'premise:t:p': BELIEF };
    const kept = run(recordsOf([written]), judgementOf([draft('premise:t:p', 'add-premise', { contentKey: 'fp:written', partOfResult: 't' })], { classes }));
    expect(item(kept.records, 'premise:t:p')).toEqual(written);
    const takenOut = record('premise:t:p', 'add-premise', { partOf: 't', fingerprint: 'fp:draft' });
    const same = run(recordsOf([takenOut]), judgementOf([draft('premise:t:p', 'add-premise', { contentKey: 'fp:draft', partOfResult: 't' })], { classes }));
    expect(item(same.records, 'premise:t:p')).toEqual(takenOut);
    // A rejected premise's draft stays in `premises` while its item exists: it is no new proposal.
    const rejected = { ...takenOut, status: 'declined' as const, decline: { option: 'reject' as const, at: AT }, rejectedFingerprints: ['fp:draft'] };
    expect(item(run(recordsOf([rejected]), judgementOf([draft('premise:t:p', 'add-premise', { contentKey: 'fp:draft', partOfResult: 't' })], { classes })).records, 'premise:t:p')).toEqual(rejected);
  });
});

describe('after a Submit step (F5)', () => {
  it('a Shaky set that came back unchanged returns to review, marked "no alternative found" when its finish said so; a reverted item re-added identically is no longer reverted', () => {
    const items = [
      record('decl:s1', 'declaration', { status: 'declined', decline: { option: 'shaky', note: 'n', at: AT } }),
      record('decl:s2', 'declaration', { status: 'to-be-redone', decline: { option: 'shaky', at: AT }, redo: { because: ['x'], reverted: true } }),
      record('card:r', 'formalize', { status: 'to-be-redone', redo: { because: ['x'], reverted: true } }),
    ];
    const drafts = [draft('decl:s1', 'declaration'), draft('decl:s2', 'declaration'), draft('card:r', 'formalize')];
    const noAlternative = recordsOf(items, { steps: SUBMITTED.map((s) => (s.id === 's2' ? { ...s, noAlternative: true } : s)) });
    const out = run(noAlternative, judgementOf(drafts), ['s2']);
    for (const key of ['decl:s1', 'decl:s2', 'card:r']) {
      const r = item(out.records, key);
      expect(r).toMatchObject({ status: 'in-review', rev: 1, markers: ['no-alternative-found'] });
      expect(r.decline).toBeUndefined();
      expect(r.redo).toBeUndefined();
    }
    expect(out.reverts).toEqual([]);
    // Without no_alternative, a reworked one comes back "updated", its old version kept.
    const reworked = run(recordsOf(items, { steps: SUBMITTED }), judgementOf([draft('decl:s1', 'declaration', { contentKey: 'fp:other' }), ...drafts.slice(1)]), ['s2']);
    expect(item(reworked.records, 'decl:s1')).toMatchObject({ status: 'in-review', rev: 2, markers: ['updated'] });
    expect(item(reworked.records, 'decl:s2').markers).toEqual([]);
    // F5 reads only the queue that just ended: at a decision's judge they stay (the reverted ones have no draft then:
    // their content is out of ws/).
    const judged = run(recordsOf(items, { steps: SUBMITTED }), judgementOf(drafts.slice(0, 1)));
    expect(judged.records.items).toEqual(items);
    expect(judged.problems).toEqual([]);
  });

  it('a record back in review after its Submit step carries its draft’s current content, also with its key unchanged (fixer 2a, V2A-C1; carry-over R1-3)', () => {
    const was = { decls: [{ name: 'Spyro.s', text: 'def s : Nat := 1' }] };
    const now = { decls: [{ name: 'Spyro.s', text: 'def s : Nat :=\n  1' }] };
    const items = [
      record('decl:s', 'declaration', { status: 'declined', decline: { option: 'shaky', note: 'n', at: AT }, content: was }),
      record('card:r', 'formalize', { status: 'to-be-redone', redo: { because: ['x'], reverted: true }, content: was }),
    ];
    const out = run(recordsOf(items, { steps: SUBMITTED }), judgementOf([draft('decl:s', 'declaration', { content: now }), draft('card:r', 'formalize', { content: now })]), ['s2']);
    for (const key of ['decl:s', 'card:r']) expect(item(out.records, key)).toMatchObject({ status: 'in-review', rev: 1, fingerprint: `fp:${key}`, content: now, versions: [], markers: [] });
  });
});

describe('B’s version is no new proposal (AF1)', () => {
  it('a rejected proved Result, judged again with B’s T.holds back, stays declined with its key and rev, and can still be un-rejected', () => {
    const rejected = record('proof:t', 'result', { status: 'declined', decline: { option: 'reject', at: AT }, fingerprint: 'fp:proved', rejectedFingerprints: ['fp:proved'] });
    const out = run(recordsOf([rejected]), judgementOf([draft('proof:t', 'result', { asInBase: true, contentKey: 'fp:base' })]));
    expect(item(out.records, 'proof:t')).toEqual(rejected);
    const state = stateOf({ items: out.records.items });
    const back = reduceReview(state, { kind: 'decide', decisions: [{ item: idOf('proof:t'), rev: 1, to: 'in-review' }], own: false, confirmed: false }, AT);
    expect(back.ok && item(back, 'proof:t')).toMatchObject({ status: 'in-review', rejectedFingerprints: [] });
  });

  it('a Result taken out to be redone stays so until its Submit step ends, then returns to review', () => {
    const redone = record('proof:t', 'result', { status: 'to-be-redone', redo: { because: [idOf('arrow:x>t')], reverted: true }, fingerprint: 'fp:proved' });
    const base = draft('proof:t', 'result', { asInBase: true, contentKey: 'fp:base' });
    expect(item(run(recordsOf([redone], { steps: SUBMITTED }), judgementOf([base])).records, 'proof:t')).toEqual(redone);
    const otherQueue = recordsOf([redone], { steps: [...SUBMITTED, { id: 's3', kind: 'formalize', target: 'u', stage: 1, state: 'passed', question: { sources: [], fromNothing: true } }] });
    expect(item(run(otherQueue, judgementOf([base]), ['s3']).records, 'proof:t')).toEqual(redone);
    const reworked = run(recordsOf([redone], { steps: SUBMITTED }), judgementOf([draft('proof:t', 'result', { contentKey: 'fp:new-proof' })]), ['s2']);
    expect(item(reworked.records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2, fingerprint: 'fp:new-proof', markers: ['updated'] });
    expect(item(reworked.records, 'proof:t').redo).toBeUndefined();
  });

  it('a reworded repeat of a rejected Result comes back in review, "updated", the rejected version superseded', () => {
    const rejected = record('proof:t', 'result', { status: 'declined', decline: { option: 'reject', at: AT }, fingerprint: 'fp:old', rejectedFingerprints: ['fp:old'] });
    const out = run(recordsOf([rejected]), judgementOf([draft('proof:t', 'result', { contentKey: 'fp:reworded' })]), ['s1']);
    expect(item(out.records, 'proof:t')).toMatchObject({
      status: 'in-review',
      rev: 2,
      fingerprint: 'fp:reworded',
      markers: ['updated'],
      rejectedFingerprints: ['fp:old'],
      versions: [{ rev: 1, stage: 1, fingerprint: 'fp:old', content: { decls: [] }, rejected: true }],
    });
    expect(item(out.records, 'proof:t').decline).toBeUndefined();
  });

  it('a Result reworked by a Submit step and rejected in the next stage stays rejected at the next judge (F5 reads only `queueSteps`)', () => {
    const rejected = record('proof:t', 'result', { rev: 2, status: 'declined', decline: { option: 'reject', at: AT }, fingerprint: 'fp:reworked', rejectedFingerprints: ['fp:reworked'] });
    const out = run(recordsOf([rejected], { steps: SUBMITTED, stage: 2 }), judgementOf([draft('proof:t', 'result', { asInBase: true, contentKey: 'fp:base' })]));
    expect(item(out.records, 'proof:t')).toEqual(rejected);
  });
});

describe('the judge’s reverts, premise re-checks, RV-3, RV-7 and RV-5', () => {
  it('items that no longer build, and Results whose inference fails, are taken out with what rests on them; a Shaky Result stays (D2-48)', () => {
    const records = recordsOf([
      record('card:a', 'formalize'),
      record('decl:d', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('proof:t', 'result'),
      record('proof:u', 'result', { status: 'declined', decline: { option: 'shaky', at: AT } }),
    ]);
    const judgement = judgementOf([draft('card:a', 'formalize'), draft('decl:d', 'declaration'), draft('proof:t', 'result'), draft('proof:u', 'result')], {
      deps: { 'decl:d': ['card:a'], 'card:a': [], 'proof:t': [], 'proof:u': [] },
      problems: [{ code: 'no-longer-builds', text: 'Spyro.a: error', keys: ['card:a'], declaration: 'Spyro.a' }],
      inferences: { t: inferenceJudgement('t', { passes: false }), u: inferenceJudgement('u', { passes: false }) },
    });
    const out = run(records, judgement);
    expect(item(out.records, 'card:a')).toMatchObject({ status: 'to-be-redone', redo: { because: [], reverted: true }, markers: ['no-longer-builds'] });
    expect(item(out.records, 'decl:d')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('card:a')], reverted: true } });
    expect(item(out.records, 'proof:t')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true } });
    expect(item(out.records, 'proof:u').status).toBe('declined');
    expect(out.reverts).toEqual(['card:a', 'decl:d', 'proof:t'].map(idOf));
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventNoLongerBuilds, items: [idOf('card:a')] },
      { text: REVIEW_TEXTS.eventNoLongerPasses, items: [idOf('proof:t')] },
      { text: REVIEW_TEXTS.eventRedoneWith, items: [idOf('decl:d')] },
    ]);
  });

  it('a premise draft that no longer closes the gap is to be redone, marked so, its facts replaced', () => {
    const p = { target: 't', step: 's1', naturalName: 'P', leanName: 'p', leanStatement: 'True', explicit: 'True', whyNeeded: '', proof: '', footprint: [], aloneEntails: false, facts: {} };
    const facts = { 'Spyro.p': { name: 'Spyro.p', module: 'Scratch', file: 'Scratch.lean', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, refs: [] } };
    const records = recordsOf([record('premise:t:p', 'add-premise', { partOf: 't', content: { decls: [], premise: p } })], { premises: [p] });
    const out = run(records, judgementOf([draft('premise:t:p', 'add-premise', { partOfResult: 't' })], { classes: { 'premise:t:p': BELIEF }, premiseChecks: { 'premise:t:p': { closesGap: false, facts } } }));
    expect(item(out.records, 'premise:t:p')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, markers: ['no-longer-closes-gap'] });
    expect(out.records.premises[0]?.facts).toEqual(facts);
  });

  it('RV-7 (D2-23) returns an accepted item whose badges grew; RV-5 one whose dependency is not accepted; a written premise returned is taken out', () => {
    const records = recordsOf([
      record('decl:e', 'declaration', { status: 'accepted', accepted: accepted({ how: 'group' }) }),
      record('decl:d', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('card:x', 'formalize', { status: 'to-be-redone', redo: { because: [], reverted: true } }),
      record('premise:t:p', 'add-premise', { partOf: 't', card: 'pc', status: 'accepted', accepted: accepted({ holdAs: 'axiom', belief: true }) }),
    ]);
    const drafts = [draft('decl:e', 'declaration'), draft('decl:d', 'declaration'), draft('premise:t:p', 'add-premise', { partOfResult: 't' })];
    const judgement = judgementOf(drafts, {
      classes: { 'decl:e': BELIEF, 'decl:d': PLAIN, 'premise:t:p': BELIEF },
      classesBeforeReveal: { 'decl:e': PLAIN, 'decl:d': PLAIN, 'premise:t:p': BELIEF },
      deps: { 'decl:d': ['card:x'], 'premise:t:p': ['decl:d'], 'decl:e': [] },
    });
    const out = run(records, judgement);
    expect(item(out.records, 'decl:e').status).toBe('in-review');
    expect(item(out.records, 'decl:d').status).toBe('in-review');
    expect(item(out.records, 'premise:t:p').status).toBe('in-review');
    expect(out.reverts).toEqual([idOf('premise:t:p')]);
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:e')] },
      { text: REVIEW_TEXTS.eventDependencyNotAccepted, items: [idOf('decl:d'), idOf('premise:t:p')] },
    ]);
  });
});

describe('the reveal (§3.5 step 3, §4.7)', () => {
  it('a statement that becomes undecided ends the force; so does a Result that RV-11 returns to review', () => {
    const changed = run(
      recordsOf([record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), record('proof:t', 'result')], { forced: FORCE }),
      judgementOf([draft('card:a', 'formalize', { contentKey: 'fp:new' }), draft('proof:t', 'result')]),
    );
    expect(changed.records.forced).toBeUndefined();
    const result = record('proof:t', 'result', { status: 'accepted', accepted: accepted({ result: { verdict: 'proved', restsOn: ['a'] } }), judged: { verdict: 'proved', restsOn: ['a'], deps: [] } });
    const verdict = run(
      recordsOf([record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), result, record('card:z', 'formalize')], { forced: FORCE }),
      judgementOf([draft('card:a', 'formalize'), draft('proof:t', 'result'), draft('card:z', 'formalize')], { inferences: { t: inferenceJudgement('t', { verdict: 'not-proved', restsOn: [] }) } }),
    );
    expect(item(verdict.records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2, markers: ['updated'] });
    expect(verdict.records.forced).toBeUndefined();
    // Unchanged verdict and Rests on: the force holds, and while a statement is undecided every Result is seen early.
    const holds = run(
      recordsOf([record('card:a', 'formalize', { status: 'accepted', accepted: accepted() }), result, record('card:z', 'formalize'), record('proof:u', 'result')], { forced: FORCE }),
      judgementOf([draft('card:a', 'formalize'), draft('proof:t', 'result'), draft('card:z', 'formalize'), draft('proof:u', 'result')], {
        inferences: { t: inferenceJudgement('t', { verdict: 'proved', restsOn: ['a'] }) },
      }),
    );
    expect(holds.records.forced).toEqual(FORCE);
    expect(item(holds.records, 'proof:t').markers).toEqual(['seen-early']);
    expect(item(holds.records, 'proof:u').markers).toEqual(['seen-early']);
    expect(item(holds.records, 'card:z').markers).toEqual([]);
  });

  it('fixer 2c2 r1 (C-V2C2-C1): every queue’s end ends the force, the user’s and telelean’s `decided` one, whatever changed; with no meaning item waiting the results stay shown', () => {
    // A re-ask that did not prove its target leaves its Result as it was, and the statement z is still in review: had
    // the force survived, the stage would stay shown here and be hidden in the proved outcome (the Result's new content
    // ends the force). Ended at every queue's end, both are hidden, and no Result is marked seen early.
    const result = record('proof:t', 'result', { judged: { verdict: 'proved', restsOn: ['a'], deps: [] } });
    const items = [record('card:z', 'formalize'), result];
    const judgement = judgementOf([draft('card:z', 'formalize'), draft('proof:t', 'result')], { inferences: { t: inferenceJudgement('t', { verdict: 'proved', restsOn: ['a'] }) } });
    for (const force of [FORCE, { via: 'decided' as const, at: AT }]) {
      const queueEnd = run(recordsOf(items, { forced: force }), judgement, ['s2']);
      expect(queueEnd.records.forced).toBeUndefined();
      expect(resultsState({ items: queueEnd.records.items, classesBeforeReveal: judgement.classesBeforeReveal, forced: null }).shown).toBe(false);
      expect(item(queueEnd.records, 'proof:t').markers).toEqual([]);
      // A judge a decision started (no `queueSteps`) keeps it while nothing became undecided (§4.7).
      expect(run(recordsOf(items, { forced: force }), judgement).records.forced).toEqual(force);
    }
    // Nothing waits: the results are shown without a force.
    const decided = [record('card:z', 'formalize', { status: 'accepted', accepted: accepted() }), result];
    const shown = run(recordsOf(decided, { forced: FORCE }), judgement, ['s2']);
    expect(shown.records.forced).toBeUndefined();
    expect(resultsState({ items: shown.records.items, classesBeforeReveal: judgement.classesBeforeReveal, forced: null }).shown).toBe(true);
  });
});

describe('ids and events (AF7)', () => {
  it('a new record’s id depends only on the run id and its key: the listed items get the same ids whether or not hidden parts came first', () => {
    const listed = [draft('card:a', 'formalize'), draft('card:b', 'formalize')];
    const one = run(recordsOf([]), judgementOf(listed), ['s1']);
    const two = run(recordsOf([]), judgementOf([draft('arrow:x>t', 'add-arrow', { partOfResult: 't' }), draft('decl:L', 'declaration', { partOfResult: 't' }), ...listed]), ['s1']);
    for (const key of ['card:a', 'card:b']) expect(item(two.records, key).id).toBe(item(one.records, key).id);
    expect(item(one.records, 'card:a').id).toBe(idOf('card:a'));
  });

  it('no event is made for a change that touches only hidden items', () => {
    const records = recordsOf([record('card:z', 'formalize'), record('arrow:x>t', 'add-arrow', { partOf: 't', status: 'accepted', accepted: accepted({ changesProved: true }) })]);
    const out = run(records, judgementOf([draft('card:z', 'formalize'), draft('arrow:x>t', 'add-arrow', { partOfResult: 't', contentKey: 'fp:new' })]));
    expect(item(out.records, 'arrow:x>t')).toMatchObject({ status: 'in-review', markers: ['updated'] });
    expect(out.events).toEqual([]);
  });
});

describe('RV-11 for every Result (fixer 2a, V2A-S1, V2A-S5)', () => {
  const judged = (over: Partial<NonNullable<ItemRecord['judged']>> = {}) => ({ verdict: 'proved' as const, restsOn: [], deps: [], ...over });

  it('a Result in review whose verdict or dependencies changed is a new version, "updated", and ends the force', () => {
    const records = recordsOf([record('card:z', 'formalize'), record('proof:t', 'result')], { forced: FORCE });
    const drafts = [draft('card:z', 'formalize'), draft('proof:t', 'result')];
    const verdict = run(records, judgementOf(drafts, { inferences: { t: inferenceJudgement('t', { verdict: 'not-proved' }) } }));
    expect(item(verdict.records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2, markers: ['updated'], judged: judged({ verdict: 'not-proved' }) });
    expect(item(verdict.records, 'proof:t').versions).toEqual([{ rev: 1, stage: 1, fingerprint: 'fp:proof:t', content: { decls: [] } }]);
    expect(verdict.records.forced).toBeUndefined();
    const deps = run(records, judgementOf(drafts, { deps: { 'card:z': [], 'proof:t': ['card:z'] } }));
    expect(item(deps.records, 'proof:t')).toMatchObject({ rev: 2, markers: ['updated'], judged: judged({ deps: ['card:z'] }) });
    expect(deps.records.forced).toBeUndefined();
    // Nothing changed: the force holds.
    const same = run(records, judgementOf(drafts));
    expect(same.records.forced).toEqual(FORCE);
    expect(item(same.records, 'proof:t')).toMatchObject({ rev: 1, judged: judged() });
  });

  it('an accepted Result whose Rests on alone changed leaves accepted with its dependents; one with nothing to compare counts as changed', () => {
    const records = recordsOf([
      record('proof:t', 'result', { status: 'accepted', accepted: accepted({ result: { verdict: 'proved', restsOn: ['a'] } }), judged: judged({ restsOn: ['a'] }) }),
      record('proof:u', 'result', {
        origin: { step: 's2', target: 'u', phase: 'proof' },
        status: 'accepted',
        accepted: accepted({ result: { verdict: 'proved', restsOn: [] } }),
        judged: judged({ deps: ['proof:t'] }),
      }),
    ]);
    const judgement = judgementOf([draft('proof:t', 'result'), draft('proof:u', 'result')], {
      deps: { 'proof:t': [], 'proof:u': ['proof:t'] },
      inferences: { t: inferenceJudgement('t', { restsOn: ['a', 'b'] }), u: inferenceJudgement('u') },
    });
    const out = run(records, judgement);
    expect(item(out.records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2, markers: ['updated'], judged: judged({ restsOn: ['a', 'b'] }) });
    expect(item(out.records, 'proof:u')).toMatchObject({ status: 'in-review', rev: 1, markers: ['updated'] });
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventResultChanged, items: [idOf('proof:t')] },
      { text: REVIEW_TEXTS.eventChangedWith, items: [idOf('proof:u')] },
    ]);
    // Fail closed: an Accept that recorded no verdict, or a Result with no `judged`, has nothing to compare.
    const bare = record('proof:t', 'result', { status: 'accepted', accepted: accepted() });
    expect(item(run(recordsOf([bare]), judgementOf([draft('proof:t', 'result')])).records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2 });
    const unjudged = record('proof:t', 'result', { status: 'accepted', accepted: accepted({ result: { verdict: 'proved', restsOn: [] } }), judged: undefined });
    expect(item(run(recordsOf([unjudged]), judgementOf([draft('proof:t', 'result')])).records, 'proof:t')).toMatchObject({ status: 'in-review', rev: 2, judged: judged() });
  });

  it('a Shaky Result keeps its status (D2-48), and records what it now rests on; a rejected one keeps what it recorded', () => {
    const shaky = record('proof:t', 'result', { status: 'declined', decline: { option: 'shaky', at: AT } });
    const notProved = judgementOf([draft('proof:t', 'result')], { inferences: { t: inferenceJudgement('t', { verdict: 'not-proved' }) } });
    expect(item(run(recordsOf([shaky]), notProved).records, 'proof:t')).toEqual({ ...shaky, judged: judged({ verdict: 'not-proved' }) });
    const rejected = record('proof:t', 'result', { status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: ['fp:proof:t'] });
    const base = judgementOf([draft('proof:t', 'result', { asInBase: true, contentKey: 'fp:base' })], { inferences: notProved.inferences });
    expect(item(run(recordsOf([rejected]), base).records, 'proof:t')).toEqual(rejected);
  });
});

describe('a premise the new step proposed again (fixer 2a, V2A-C1)', () => {
  const premise = (leanName: string, step: string): PremiseDraft => ({
    target: 't',
    step,
    naturalName: `P ${leanName}`,
    leanName,
    leanStatement: 'True',
    explicit: 'True',
    whyNeeded: '',
    proof: '',
    footprint: [],
    aloneEntails: false,
    facts: {},
  });

  it('stays in review with its new draft; only the earlier steps’ drafts are withdrawn', () => {
    const p1 = premise('p', 's1');
    const p3 = { ...p1, step: 's3', whyNeeded: 'still the gap' };
    const q1 = premise('q', 's1');
    const steps: SessionRecords['steps'] = [
      { id: 's1', kind: 'formalize', target: 't', stage: 0, state: 'passed', question: { sources: ['a'], fromNothing: false } },
      { id: 's3', kind: 'formalize', target: 't', stage: 1, state: 'passed', question: { sources: ['a', 'b'], fromNothing: false } },
    ];
    const records = recordsOf(
      [
        record('proof:t', 'result', { fingerprint: 'fp:old' }),
        record('premise:t:p', 'add-premise', { partOf: 't', fingerprint: premiseDraftKey(p1), content: { decls: [], premise: p1 } }),
        record('premise:t:q', 'add-premise', { partOf: 't', fingerprint: premiseDraftKey(q1), content: { decls: [], premise: q1 } }),
      ],
      { premises: [p1, q1, p3], steps, inferences: [{ target: 't', question: { sources: ['a', 'b'], fromNothing: false }, order: 0, steps: ['s1', 's3'] }] },
    );
    const judgement = judgementOf(
      [
        draft('proof:t', 'result', { contentKey: 'fp:new', origin: { step: 's3', target: 't', phase: 'proof' } }),
        draft('premise:t:p', 'add-premise', { contentKey: premiseDraftKey(p3), partOfResult: 't', origin: { step: 's3', target: 't', phase: 'proof' }, content: { decls: [], premise: p3 } }),
        draft('premise:t:q', 'add-premise', { contentKey: premiseDraftKey(q1), partOfResult: 't', content: { decls: [], premise: q1 } }),
      ],
      { classes: { 'premise:t:p': BELIEF, 'premise:t:q': BELIEF, 'proof:t': PLAIN } },
    );
    const out = run(records, judgement, ['s3']);
    expect(item(out.records, 'premise:t:p')).toMatchObject({ status: 'in-review', rev: 1, content: { premise: { step: 's3', whyNeeded: 'still the gap' } } });
    expect(item(out.records, 'premise:t:q').status).toBe('withdrawn');
    expect(out.records.premises.map((p) => `${p.leanName}@${p.step}`)).toEqual(['p@s1', 'p@s3']);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventWithdrawn, items: [idOf('premise:t:q')] }]);
  });
});

describe('content back in ws/ that no step proposed (fixer 2a, V2A-C2, ADV-2)', () => {
  it('at a decision’s judge, a rejected or taken-out record keeps its decision, and the write takes the content out again', () => {
    const rejected = record('decl:X', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: ['fp:decl:X'] });
    const reverted = record('decl:Y', 'declaration', { status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: true } });
    const out = run(recordsOf([rejected, reverted]), judgementOf([draft('decl:X', 'declaration'), draft('decl:Y', 'declaration')]));
    expect(out.records.items).toEqual([rejected, reverted]);
    expect(out.reverts).toEqual([idOf('decl:X'), idOf('decl:Y')]);
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventTakenOutAgain, items: [idOf('decl:X'), idOf('decl:Y')] }]);
    // A reworded version is no proposal either without a step.
    const reworded = run(recordsOf([rejected]), judgementOf([draft('decl:X', 'declaration', { contentKey: 'fp:other' })]));
    expect(item(reworded.records, 'decl:X')).toEqual(rejected);
    expect(reworded.reverts).toEqual([idOf('decl:X')]);
  });

  it('when a queue ends, a step’s proposal brings such a record back to review, with an event; a repeat of a rejected version never', () => {
    const reverted = record('decl:Y', 'declaration', { status: 'to-be-redone', redo: { because: ['x'], reverted: true } });
    const rejected = record('decl:X', 'declaration', { status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: ['fp:decl:X', 'fp:older'] });
    // A re-ask's step, no Submit step: F5 does not apply.
    const steps: SessionRecords['steps'] = [
      { id: 's1', kind: 'formalize', target: 't', stage: 0, state: 'passed', question: { sources: ['a'], fromNothing: false } },
      { id: 's3', kind: 'formalize', target: 't', stage: 1, state: 'passed', question: { sources: ['a', 'b'], fromNothing: false } },
    ];
    const out = run(recordsOf([reverted, rejected], { steps }), judgementOf([draft('decl:Y', 'declaration'), draft('decl:X', 'declaration', { contentKey: 'fp:older' })]), ['s3']);
    expect(item(out.records, 'decl:Y')).toMatchObject({ status: 'in-review', rev: 1, markers: [] });
    expect(item(out.records, 'decl:Y').redo).toBeUndefined();
    expect(item(out.records, 'decl:X')).toEqual(rejected);
    expect(out.reverts).toEqual([idOf('decl:X')]);
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventProposedAgain, items: [idOf('decl:Y')] },
      { text: REVIEW_TEXTS.eventTakenOutAgain, items: [idOf('decl:X')] },
    ]);
  });

  it('a record a step proposed again with its key unchanged carries its draft’s current content (carry-over R1-3)', () => {
    const now = { decls: [{ name: 'Spyro.y', text: 'def y : Nat := 2 -- again' }] };
    const reverted = record('decl:Y', 'declaration', { status: 'to-be-redone', redo: { because: ['x'], reverted: true }, content: { decls: [{ name: 'Spyro.y', text: 'def y : Nat := 2' }] } });
    const withdrawn = record('decl:W', 'declaration', { status: 'withdrawn', content: { decls: [{ name: 'Spyro.w', text: 'def w : Nat := 3' }] } });
    const steps: SessionRecords['steps'] = [
      { id: 's1', kind: 'formalize', target: 't', stage: 0, state: 'passed', question: { sources: ['a'], fromNothing: false } },
      { id: 's3', kind: 'formalize', target: 't', stage: 1, state: 'passed', question: { sources: ['a', 'b'], fromNothing: false } },
    ];
    const out = run(recordsOf([reverted, withdrawn], { steps }), judgementOf([draft('decl:Y', 'declaration', { content: now }), draft('decl:W', 'declaration', { content: now })]), ['s3']);
    for (const key of ['decl:Y', 'decl:W']) expect(item(out.records, key)).toMatchObject({ status: 'in-review', rev: 1, fingerprint: `fp:${key}`, content: now, markers: [] });
  });
});

describe('a judged state whose module did not build (fixer 2a, ADV-3)', () => {
  it('an accepted Formalize survives a judgement without its facts, and the next one with them, as accepted, rev 1, with no event', () => {
    const FORMALISED = pinned(normative(BASE));
    const LEDGER = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];
    const judge = (failed: boolean): StateJudgement => {
      const base = modelOf(BASE);
      const current = modelOf(FORMALISED, failed ? { moduleStates: { [MAIN]: 'failed' } } : {});
      const { drafts, problems } = computeItems({ base, current, ledger: LEDGER, premises: [], inferences: [INFERENCE], ended: [TARGET] });
      expect(problems).toEqual([]);
      const classesOf = (withDrafts: boolean) => classify({ base, current, drafts, premises: [], inferences: [INFERENCE], withDrafts });
      return judgementOf(drafts, {
        classes: classesOf(true),
        classesBeforeReveal: classesOf(false),
        deps: itemDeps({ base, current, drafts, inferences: {} }),
        inferences: { [TARGET]: inferenceJudgement(TARGET, failed ? { passes: false, verdict: 'not-proved' } : {}) },
      });
    };
    const good = judge(false);
    const bad = judge(true);
    const key = 'card:pg-no-dark-past';
    expect(bad.drafts.find((d) => d.key === key)).toMatchObject({ factsMissing: true });
    expect(bad.drafts.find((d) => d.key === key)?.contentKey).not.toBe(good.drafts.find((d) => d.key === key)?.contentKey);
    const created1 = run(recordsOf([]), good, ['s1']).records;
    // Its AXIOM card's Formalize is a belief (b2, b3): accepted by its own Accept.
    const records = { ...created1, items: created1.items.map((r) => (r.key === key ? { ...r, status: 'accepted' as const, accepted: accepted({ fingerprint: r.fingerprint, belief: true }) } : r)) };
    const failed = run(records, bad);
    expect(failed.records.items).toEqual(records.items);
    expect(failed.events).toEqual([]);
    expect(failed.reverts).toEqual([]);
    const again = run(failed.records, good);
    expect(again.records.items).toEqual(records.items);
    expect(again.events).toEqual([]);
  });

  it('while some draft lacks its facts, only the no-longer-builds reverts apply; with every fact each rule does', () => {
    const records = recordsOf([
      record('decl:a', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('decl:b', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('decl:c', 'declaration'),
      record('proof:t', 'result', { status: 'accepted', accepted: accepted({ result: { verdict: 'proved', restsOn: [] } }) }),
      record('card:m', 'formalize'),
      record('decl:x', 'declaration'),
    ]);
    const drafts = ['decl:a', 'decl:b', 'decl:c', 'decl:x'].map((k) => draft(k, 'declaration'));
    const judgement = (factsMissing: boolean) =>
      judgementOf([...drafts, draft('proof:t', 'result'), draft('card:m', 'formalize', factsMissing ? { contentKey: 'fp:no-facts', factsMissing: true } : {})], {
        classes: { 'decl:a': BELIEF, 'decl:b': PLAIN, 'decl:c': PLAIN, 'decl:x': PLAIN, 'proof:t': PLAIN, 'card:m': PLAIN },
        deps: { 'decl:b': ['decl:c'], 'decl:a': [], 'decl:c': [], 'decl:x': [], 'proof:t': [], 'card:m': [] },
        inferences: { t: inferenceJudgement('t', { passes: false, verdict: 'not-proved' }) },
        problems: [{ code: 'no-longer-builds', text: 'Spyro.x: error', keys: ['decl:x'], declaration: 'Spyro.x' }],
      });
    const partial = run(records, judgement(true));
    expect(statuses(partial.records)).toEqual({ 'decl:a': 'accepted', 'decl:b': 'accepted', 'decl:c': 'in-review', 'proof:t': 'accepted', 'card:m': 'in-review', 'decl:x': 'to-be-redone' });
    expect(item(partial.records, 'card:m').fingerprint).toBe('fp:card:m');
    expect(partial.reverts).toEqual([idOf('decl:x')]);
    const full = run(records, judgement(false));
    expect(statuses(full.records)).toMatchObject({ 'decl:a': 'in-review', 'decl:b': 'in-review', 'proof:t': 'to-be-redone', 'decl:x': 'to-be-redone' });
  });

  it('a Result first seen in a partial judgement records nothing judged, so it waits for a full one (carry-over R1-3)', () => {
    const judgement = (factsMissing: boolean) =>
      judgementOf([draft('proof:t', 'result'), draft('card:m', 'formalize', factsMissing ? { contentKey: 'fp:no-facts', factsMissing: true } : {})], {
        inferences: { t: inferenceJudgement('t', { restsOn: ['a'] }) },
      });
    const partial = run(recordsOf([]), judgement(true), ['s1']);
    expect(item(partial.records, 'proof:t').judged).toBeUndefined();
    // Its Accept is refused meanwhile (V2A-S5); the next full judgement records what it judged.
    const shown = stateOf({ items: partial.records.items, forced: FORCE });
    expect(reduceReview(shown, { kind: 'decide', decisions: [{ item: idOf('proof:t'), rev: 1, to: 'accepted' }], own: true, confirmed: false }, AT)).toMatchObject({
      ok: false,
      code: 'refused',
      error: REVIEW_TEXTS.resultNotJudged('Result “t”'),
    });
    const full = run(partial.records, judgement(false));
    expect(item(full.records, 'proof:t').judged).toEqual({ verdict: 'proved', restsOn: ['a'], deps: [] });
  });
});

describe('the force and D2-23 at a judge (fixer 2a, ADV-1)', () => {
  const scene = (extra: ItemRecord[] = [], deps: Record<string, string[]> = {}) => {
    const items = [
      record('decl:D', 'declaration', { status: 'accepted', accepted: accepted() }),
      record('decl:E', 'declaration', { status: 'accepted', accepted: accepted({ belief: true }) }),
      record('proof:t', 'result'),
      ...extra,
    ];
    const judgement = judgementOf(
      items.map((r) => draft(r.key, r.kind)),
      {
        classes: { 'decl:D': BELIEF, 'decl:E': BELIEF, 'proof:t': PLAIN, 'decl:c': PLAIN, 'card:z': PLAIN },
        classesBeforeReveal: { 'decl:D': PLAIN, 'decl:E': BELIEF, 'proof:t': PLAIN, 'decl:c': PLAIN, 'card:z': PLAIN },
        deps: { 'decl:E': ['decl:D'], 'decl:D': [], 'proof:t': [], ...deps },
      },
    );
    return { records: recordsOf(items), judgement };
  };

  it('a judge that returns a draft-only belief with the meaning item resting on it keeps the results shown, marking nothing seen early', () => {
    const { records, judgement } = scene();
    const out = run(records, judgement);
    expect(statuses(out.records)).toEqual({ 'decl:D': 'in-review', 'decl:E': 'in-review', 'proof:t': 'in-review' });
    expect(out.records.forced).toEqual({ via: 'decided', at: AT });
    expect(resultsState({ items: out.records.items, classesBeforeReveal: judgement.classesBeforeReveal, forced: out.records.forced ?? null }).shown).toBe(true);
    expect(item(out.records, 'proof:t').markers).toEqual([]);
    expect(out.events).toEqual([
      { text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:D')] },
      { text: REVIEW_TEXTS.eventChangedWith, items: [idOf('decl:E')] },
    ]);
    // Something else the judge returns makes a meaning item undecided as well: the results are hidden again.
    const other = scene([record('card:z', 'formalize', { status: 'accepted', accepted: accepted() }), record('decl:c', 'declaration')], { 'card:z': ['decl:c'], 'decl:c': [] });
    const hidden = run(other.records, other.judgement);
    expect(hidden.records.forced).toBeUndefined();
    expect(statuses(hidden.records)).toMatchObject({ 'decl:D': 'in-review', 'decl:E': 'in-review', 'card:z': 'in-review' });
  });

  it('a force whose meaning item the defensive RV-5 returns ends', () => {
    const records = recordsOf([record('card:z', 'formalize', { status: 'accepted', accepted: accepted() }), record('decl:c', 'declaration'), record('proof:t', 'result')], { forced: FORCE });
    const out = run(records, judgementOf([draft('card:z', 'formalize'), draft('decl:c', 'declaration'), draft('proof:t', 'result')], { deps: { 'card:z': ['decl:c'], 'decl:c': [], 'proof:t': [] } }));
    expect(item(out.records, 'card:z').status).toBe('in-review');
    expect(out.records.forced).toBeUndefined();
  });
});

describe('the other rules, each on its own (fixer 2a, ADV-7)', () => {
  it('RV-3 follows a chain: what rests on a new item that is to be redone at once, in review, is to be redone too', () => {
    // card:w was in review already; card:u, new, comes before card:s, new, which rests on the Shaky vocab:V.
    const records = recordsOf([record('vocab:V', 'vocabulary-term', { status: 'declined', decline: { option: 'shaky', at: AT } }), record('card:w', 'formalize')]);
    const judgement = judgementOf([draft('vocab:V', 'vocabulary-term'), draft('card:w', 'formalize'), draft('card:u', 'formalize'), draft('card:s', 'formalize')], {
      deps: { 'vocab:V': [], 'card:s': ['vocab:V'], 'card:u': ['card:s'], 'card:w': ['card:u'] },
    });
    const out = run(records, judgement, ['s1']);
    expect(item(out.records, 'card:s')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('vocab:V')], reverted: false } });
    expect(item(out.records, 'card:u')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('card:s')], reverted: false } });
    expect(item(out.records, 'card:w')).toMatchObject({ status: 'to-be-redone', redo: { because: [idOf('card:u')], reverted: false } });
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventRedoneAtOnce, items: ['card:s', 'card:u', 'card:w'].map(idOf) }]);
  });

  it('the judge’s revert takes a Shaky dependent out, which keeps its decline and note', () => {
    const records = recordsOf([record('decl:x', 'declaration'), record('decl:y', 'declaration', { status: 'declined', decline: { option: 'shaky', note: 'n', at: AT } })]);
    const out = run(
      records,
      judgementOf([draft('decl:x', 'declaration'), draft('decl:y', 'declaration')], {
        deps: { 'decl:x': [], 'decl:y': ['decl:x'] },
        problems: [{ code: 'no-longer-builds', text: 'Spyro.x: error', keys: ['decl:x'] }],
      }),
    );
    expect(item(out.records, 'decl:y')).toMatchObject({ status: 'to-be-redone', decline: { option: 'shaky', note: 'n' }, redo: { because: [idOf('decl:x')], reverted: true } });
    expect(out.reverts).toEqual([idOf('decl:x'), idOf('decl:y')]);
  });

  it('a premise re-check that fails leaves a declined premise declined', () => {
    const p = { target: 't', step: 's1', naturalName: 'P', leanName: 'p', leanStatement: 'True', explicit: 'True', whyNeeded: '', proof: '', footprint: [], aloneEntails: false, facts: {} };
    const declined = record('premise:t:p', 'add-premise', { partOf: 't', status: 'declined', decline: { option: 'reject', at: AT }, content: { decls: [], premise: p } });
    const out = run(
      recordsOf([declined], { premises: [p] }),
      judgementOf([draft('premise:t:p', 'add-premise', { partOfResult: 't' })], { classes: { 'premise:t:p': BELIEF }, premiseChecks: { 'premise:t:p': { closesGap: false, facts: {} } } }),
    );
    expect(item(out.records, 'premise:t:p')).toMatchObject({ status: 'declined', markers: [] });
  });

  it('an accepted item the judgement gave no class returns to review (fail closed)', () => {
    const out = run(recordsOf([record('decl:n', 'declaration', { status: 'accepted', accepted: accepted() })]), judgementOf([draft('decl:n', 'declaration')], { classes: {}, classesBeforeReveal: {} }));
    expect(item(out.records, 'decl:n').status).toBe('in-review');
    expect(out.events).toEqual([{ text: REVIEW_TEXTS.eventBadgesGrew, items: [idOf('decl:n')] }]);
    // With its class (CHANGES) and badges that cover it, it stays.
    const covered = record('decl:n', 'declaration', { status: 'accepted', accepted: accepted({ changesProved: true }) });
    expect(item(run(recordsOf([covered]), judgementOf([draft('decl:n', 'declaration')], { classes: { 'decl:n': CHANGES } })).records, 'decl:n').status).toBe('accepted');
  });
});
