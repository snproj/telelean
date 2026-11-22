/**
 * Slice 2c2 (docs/slice2-plan.md 2.3, 4.7, 6.1): `buildSessionView`, the one builder of the session's view. While the
 * results of a stage are hidden, each Result is a neutral row and Results' parts are left out, the board is the base
 * mask's with no source position, and Claude's words are withheld; twin working copies that differ only in Results'
 * outcomes give byte-identical views (non-interference), and so does every sequence of decisions on listed items.
 */
import { describe, expect, it } from 'vitest';
import type { LeanFacts, LeanMessageFact } from '../../src/facts.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { endorsementHash } from '../../src/paths.js';
import { buildProjectModel, subjectGraph, type ProjectInput, type ProjectModel } from '../../src/project/index.js';
import { judgeState } from '../../src/review/judge.js';
import { premiseKey } from '../../src/review/keys.js';
import { reconcile } from '../../src/review/reconcile.js';
import { acceptGate, itemGates, reduceReview } from '../../src/review/reducer.js';
import { planSubmit } from '../../src/review/submit.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type {
  ItemClass,
  ItemDecision,
  ItemRecord,
  LedgerEntry,
  PremiseDraft,
  ReviewAction,
  ReviewOutcome,
  SessionAction,
  SessionInference,
  SessionRecords,
  SessionViewInput,
  StateJudgement,
} from '../../src/review/types.js';
import { buildSessionView, itemLabel, reviewStateOf, sessionLabels, type ItemView, type SessionView } from '../../src/review/view.js';
import { fakeFacts, freshHashes, type FakeFactsOptions } from '../project/helpers/fakeFacts.js';
import { HONEST_PROOF, TARGET_LINE, normative, pinned } from '../gate/helpers/spyroRun.js';
import { BELIEF, PLAIN, RUN, inferenceJudgement, record } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, VOCAB, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';

const AT = '2026-11-20T10:00:00.000Z';
const SOURCES = INFERENCE.question.sources;

type Step = SessionRecords['steps'][number];
const stepOf = (id: string, target: string, over: Partial<Step> = {}): Step => ({
  id,
  kind: 'formalize',
  target,
  stage: 0,
  state: 'passed',
  question: INFERENCE.question,
  ...over,
});

const models = new Map<string, ProjectModel>();
/** A model of `texts` (cached for the default facts). */
function model(texts: Texts, facts?: FakeFactsOptions, mutate?: (f: LeanFacts) => void): ProjectModel {
  if (facts !== undefined || mutate !== undefined) return modelOf(texts, facts ?? {}, mutate);
  const key = JSON.stringify(texts);
  const known = models.get(key);
  if (known !== undefined) return known;
  const built = modelOf(texts);
  models.set(key, built);
  return built;
}

const json = (view: SessionView) => JSON.stringify(view);
const byLabel = (view: SessionView, label: string, card?: string): ItemView => {
  const found = view.items.find((i) => i.label === label && (card === undefined || i.cards.some((c) => c.id === card)));
  if (found === undefined) throw new Error(`no ${label} item${card !== undefined ? ` of ${card}` : ''}`);
  return found;
};

// ---------------------------------------------------------------------------------------------
// The pipeline: a queue's end judged and reconciled (as 2d does), then the view

interface StageOptions {
  base?: Texts;
  current: Texts;
  inferences?: SessionInference[];
  steps?: Step[];
  ledger?: LedgerEntry[];
  premises?: PremiseDraft[];
  facts?: FakeFactsOptions;
  mutate?: (facts: LeanFacts) => void;
  words?: SessionViewInput['words'];
  records?: Partial<SessionRecords>;
}

/** The stage a queue opens: judged and reconciled at its end, as the runner does (2d). */
function firstStage(o: StageOptions): SessionViewInput {
  const base = model(o.base ?? BASE);
  const current = model(o.current, o.facts, o.mutate);
  const inferences = o.inferences ?? [INFERENCE];
  const steps = o.steps ?? [stepOf('s1', TARGET)];
  const ledger = o.ledger ?? [];
  const premises = o.premises ?? [];
  const ended = [...new Set(steps.filter((s) => s.state === 'passed' || s.state === 'gave-up').map((s) => s.target))];
  const judgement = judgeState({
    purpose: 'stage',
    stage: 'prove',
    commit: 'c-stage',
    filesKey: 'files-stage',
    base,
    current,
    inferences,
    ledger,
    items: [],
    premises,
    ended,
    rejectedArrows: [],
  });
  const empty: SessionRecords = {
    stage: 0,
    phase: 'step',
    inferences,
    steps,
    queue: [],
    retry: [],
    items: [],
    premises,
    ledger,
    rejectedArrows: [],
    stack: { done: [], undone: [] },
    nextAction: 1,
    events: [],
  };
  const reconciled = reconcile({ runId: RUN, records: empty, judgement, queueSteps: steps.map((s) => s.id), at: AT });
  const records: SessionRecords = { ...reconciled.records, stage: 1, phase: 'stage', ...o.records };
  return { runId: RUN, subject: 'Spyro', records, judgement, base, current, renderings: {}, words: o.words ?? {}, judging: false, viewVersion: 7 };
}

/** The walkthrough's statements: pg-no-dark-past formalised and pinned; the target unproved (B has no `.holds`). */
const STATEMENTS: Texts = pinned(normative(BASE));
const PROVED: Texts = edit(STATEMENTS, MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);
const STATEMENT_LEDGER: LedgerEntry[] = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];
const PROOF_LEDGER: LedgerEntry[] = [...STATEMENT_LEDGER, created('Spyro.cynder_not_good.holds', 'proof')];
const WORDS: SessionViewInput['words'] = {
  s1: { summary: 'Proved from the three arrows.', gap: 'nothing missing', assumedWithoutAsking: [{ text: '“cannot” read as a rule', items: [] }] },
};

/** The walkthrough's pair: proved, and not proved; the Formalize of pg-no-dark-past in review keeps the results hidden. */
const provedStage = (over: Partial<StageOptions> = {}) => firstStage({ current: PROVED, ledger: PROOF_LEDGER, words: WORDS, ...over });
const openStage = (over: Partial<StageOptions> = {}) => firstStage({ current: STATEMENTS, ledger: STATEMENT_LEDGER, words: { s1: { summary: 'Not proved.', gap: 'new-spyro-pg is not enough' } }, ...over });

// ---------------------------------------------------------------------------------------------
// Synthetic records on the Spyro boards, for the rules one by one

const T = TARGET;
const F_KEY = 'card:pg-no-dark-past';
const R_KEY = `proof:${T}`;
const PREMISE_KEY = premiseKey(T, 'cynder_is_evil');

interface Synth {
  items: ItemRecord[];
  /** By key; absent: PLAIN. `before` gives classesBeforeReveal (default the same). */
  classes?: Record<string, ItemClass>;
  before?: Record<string, ItemClass>;
  /** RV-5 edges by key. */
  deps?: Record<string, string[]>;
  verdict?: Partial<StateJudgement['inferences'][string]>;
  reach?: Record<string, string[]>;
  records?: Partial<SessionRecords>;
  base?: Texts;
  current?: Texts;
  noJudgement?: boolean;
  words?: SessionViewInput['words'];
  judging?: boolean;
  renderings?: SessionViewInput['renderings'];
  viewVersion?: number;
}

function synth(s: Synth): SessionViewInput {
  const classes = Object.fromEntries(s.items.map((r) => [r.key, s.classes?.[r.key] ?? PLAIN]));
  const before = Object.fromEntries(s.items.map((r) => [r.key, s.before?.[r.key] ?? (classes[r.key] as ItemClass)]));
  const judgement: StateJudgement = {
    commit: 'c1',
    filesKey: 'k1',
    purpose: 'stage',
    ok: true,
    global: [],
    stepFindings: [],
    inferences: { [T]: inferenceJudgement(T, { verdict: 'not-proved', ...s.verdict }) },
    // A draft for every record (as after reconcile), so none reads as disappeared (§3.5).
    drafts: s.items.map((r) => ({ key: r.key, kind: r.kind, origin: r.origin, provides: { decls: [], arrows: [], cards: [] }, mentions: [], contentKey: r.fingerprint, content: r.content })),
    classes,
    classesBeforeReveal: before,
    deps: Object.fromEntries(s.items.map((r) => [r.key, s.deps?.[r.key] ?? []])),
    reach: s.reach ?? {},
    problems: [],
  };
  const records: SessionRecords = {
    stage: 1,
    phase: 'stage',
    inferences: [INFERENCE],
    steps: [stepOf('s1', T)],
    queue: [],
    retry: [],
    items: s.items,
    premises: [],
    ledger: [],
    rejectedArrows: [],
    stack: { done: [], undone: [] },
    nextAction: 1,
    events: [],
    ...s.records,
  };
  return {
    runId: RUN,
    subject: 'Spyro',
    records,
    judgement: s.noJudgement === true ? null : judgement,
    base: model(s.base ?? BASE),
    current: model(s.current ?? STATEMENTS),
    renderings: s.renderings ?? {},
    words: s.words ?? {},
    judging: s.judging ?? false,
    viewVersion: s.viewVersion ?? 3,
  };
}

const formalize = (over: Partial<ItemRecord> = {}) => record(F_KEY, 'formalize', { origin: { step: 's1', target: T, phase: 'statements' }, ...over });
const result = (over: Partial<ItemRecord> = {}) => record(R_KEY, 'result', { origin: { step: 's1', target: T, phase: 'proof' }, ...over });
const SHOW: SessionRecords['forced'] = { via: 'show-result', at: AT };
const withItems = (input: SessionViewInput, items: ItemRecord[], over: Partial<SessionRecords> = {}): SessionViewInput => ({
  ...input,
  records: { ...input.records, items, ...over },
});

// =============================================================================================

describe('while the results are hidden (§4.7, §6.1)', () => {
  it('each Result is a neutral row: rev 0, no status, no class, only the seen-early marker, no dependency, every gate closed', () => {
    const items = [
      formalize(),
      result({ rev: 3, status: 'accepted', markers: ['updated', 'seen-early', 'completion-not-checked'], accepted: { how: 'own', fingerprint: 'fp', belief: false, changesProved: true, at: AT } }),
    ];
    const view = buildSessionView(synth({ items, deps: { [R_KEY]: [F_KEY] }, classes: { [R_KEY]: BELIEF } }));
    expect(view.results).toEqual({ shown: false, forced: false, waitingFor: [items[0]?.id] });
    const row = view.items.find((i) => i.kind === 'result') as ItemView;
    expect(row).toMatchObject({ id: items[1]?.id, rev: 0, status: null, classes: null, markers: ['seen-early'], dependsOn: [], dependents: [], label: 'Result' });
    expect(row.declined).toBeUndefined();
    expect(row.redo).toBeUndefined();
    expect(row.previous).toBeUndefined();
    const hidden = { ok: false, reason: REVIEW_TEXTS.showResultsFirst };
    expect(row.accept).toEqual(hidden);
    expect(row.review).toEqual(hidden);
    expect(row.decline).toEqual({ ...hidden, options: [{ option: 'reject' }, { option: 'shaky' }] });
    expect(row.detail).toEqual({
      kind: 'result',
      target: { id: T, type: 'PROPOSITION', sentence: 'Cynder would not be a good addition to the new Spyro game', wordedBy: 'user' },
      question: SOURCES.map((id) => expect.objectContaining({ id })),
      fromNothing: false,
      revealed: false,
      seenEarly: true,
    });
    // No status, verdict or proof anywhere in the row.
    expect(JSON.stringify(row)).not.toMatch(/accepted|verdict|proved|updated|completion/);
    // The Formalize it depends on lists no dependent: an accepted hidden Result is never named.
    expect(view.items[0]?.dependents).toEqual([]);
    // Not counted, not on the board's marks.
    expect(view.counts).toEqual({ inReview: 1, accepted: 0, declined: 0, toBeRedone: 0 });
    expect(view.board.marks[T]).toBeUndefined();
    expect(view.board.hiddenTargets).toEqual([T]);
  });

  it('builder 2h (carry-over F-V2G-FC-9): a listed item carries the host\'s GroupItem `blocked` (`ItemView.blocked`), also when its own Accept names a dependency first', () => {
    const items = [
      formalize(),
      result(),
      record('decl:Spyro.Helper', 'declaration', { declKind: 'definition', partOf: T }),
      record('vocab:Spyro.InReview', 'vocabulary-term'),
      // Waits for the results (a hidden part) and depends on an item in review: its own Accept says "depends".
      record('vocab:Spyro.Both', 'vocabulary-term'),
      // Waits only: its own Accept says "waits for the results".
      record('vocab:Spyro.Waits', 'vocabulary-term'),
      // Depends only on an item in review: no `blocked`.
      record('vocab:Spyro.Depends', 'vocabulary-term'),
    ];
    const [, , D, V, B, W, P] = items as [ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord];
    const input = synth({ items, deps: { [B.key]: [D.key, V.key], [W.key]: [D.key], [P.key]: [V.key] } });
    const view = buildSessionView(input);
    const of = (r: ItemRecord) => view.items.find((i) => i.id === r.id) as ItemView;
    expect(of(B).accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptNeedsDependencies('Vocabulary term Spyro.Both', ['Vocabulary term Spyro.InReview']), missing: [V.id] });
    expect(of(B).blocked).toBe(true);
    expect(of(W).accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptWaitsForResults('Vocabulary term Spyro.Waits') });
    expect(of(W).blocked).toBe(true);
    expect(of(P).blocked).toBeUndefined();
    expect(of(V).blocked).toBeUndefined();
    // Exactly what the host's planner reads (itemGates' `blocked`, from the reducer's GroupItem).
    const gates = itemGates(reviewStateOf(input.records, input.judgement));
    expect([B, W, P, V].map((r) => gates.get(r.id)?.blocked)).toEqual([true, true, false, false]);
    // A hidden Result never carries it (its class, judged state and dependencies are hidden), whatever the host's says.
    expect(view.items.find((i) => i.kind === 'result')).not.toHaveProperty('blocked');
    // Shown: nothing is hidden, so nothing waits; the dependency is named as before.
    const shown = buildSessionView(withItems(input, items, { forced: SHOW }));
    expect(shown.items.find((i) => i.id === B.id)?.blocked).toBeUndefined();
    // While a step runs every gate is closed by the phase: no item carries it (D2-62).
    const step = buildSessionView({ ...input, records: { ...input.records, phase: 'step' } });
    expect(step.items.some((i) => i.blocked !== undefined)).toBe(false);
  });

  it('Results’ parts are left out of the list, the counts, the board, "Rejected in this session" and the withdrawn list (F10); no listed item names one', () => {
    const items = [
      formalize(),
      result(),
      record(`arrow:new-spyro-pg>${T}`, 'add-arrow', { partOf: T, status: 'declined', decline: { option: 'plain', at: AT } }),
      record(PREMISE_KEY, 'add-premise', { partOf: T, status: 'withdrawn', content: { decls: [], premise: draftOf() } }),
      record('decl:Spyro.Helper', 'declaration', { declKind: 'definition', partOf: T }),
      record('vocab:Spyro.Shadow', 'vocabulary-term', { status: 'withdrawn' }),
      record('decl:Spyro.Other', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } }),
      record('vocab:Spyro.Waits', 'vocabulary-term'),
      record('vocab:Spyro.Redone', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [record('decl:Spyro.Helper', 'declaration').id, record('decl:Spyro.Other', 'declaration').id], reverted: false } }),
    ];
    const [F, R, A, P, D, V, X, W, Z] = items as [ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord, ItemRecord];
    const input = synth({ items, deps: { [R.key]: [F.key, A.key, P.key, D.key], [W.key]: [D.key] } });
    const view = buildSessionView(input);
    expect(view.items.map((i) => i.id)).toEqual([F.id, V.id, W.id, Z.id, X.id, R.id]);
    expect(view.counts).toEqual({ inReview: 2, accepted: 0, declined: 1, toBeRedone: 1 });
    expect(view.rejected.map((r) => r.item)).toEqual([X.id]);
    expect(view.report.withdrawn.map((w) => w.label)).toEqual(['Vocabulary term Spyro.Shadow']);
    expect(view.board.arrows).toEqual([]);
    expect(view.board.premises).toEqual([]);
    expect(Object.keys(view.board.marks)).toEqual(['pg-no-dark-past']);
    // A listed item that rests on a hidden part names none: it waits for the results (§4.5).
    const waits = view.items.find((i) => i.id === W.id) as ItemView;
    expect(waits.dependsOn).toEqual([]);
    expect(waits.accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptWaitsForResults('Vocabulary term Spyro.Waits') });
    expect((view.items.find((i) => i.id === Z.id) as ItemView).redo).toEqual({ because: [X.id] });
    for (const hiddenId of [A.id, P.id, D.id]) expect(json(view)).not.toContain(hiddenId);
    expect(json(view)).not.toContain('Helper');
    expect(json(view)).not.toContain('cynder_is_evil');

    // Shown: every item is listed, with its real status, and the parts are where they belong.
    const shown = buildSessionView(withItems(input, items, { forced: SHOW }));
    expect(shown.results).toEqual({ shown: true, forced: true, waitingFor: [F.id] });
    // W rests on D: D comes first now that it is listed (§5.5's dependency order).
    expect(shown.items.map((i) => i.id)).toEqual([F.id, V.id, D.id, W.id, Z.id, X.id, A.id, P.id, R.id]);
    expect(shown.rejected.map((r) => r.item)).toEqual([X.id, A.id]);
    expect(shown.report.withdrawn.map((w) => w.label)).toEqual(['Vocabulary term Spyro.Shadow', 'Add premise “Cynder is evil”']);
    expect(shown.counts).toEqual({ inReview: 4, accepted: 0, declined: 2, toBeRedone: 1 });
    expect(shown.board.hiddenTargets).toEqual([]);
    expect(shown.board.marks[T]).toEqual([{ item: R.id, kind: 'result', status: 'in-review' }]);
    expect(shown.board.arrows).toEqual([{ item: A.id, change: 'add', source: 'new-spyro-pg', target: T, status: 'declined', used: false }]);
    expect((shown.items.find((i) => i.id === W.id) as ItemView).dependsOn).toEqual([D.id]);
    expect((shown.items.find((i) => i.id === Z.id) as ItemView).redo).toEqual({ because: [D.id, X.id] });
  });

  it('each InferenceView asks its latest ended step’s question while the results are hidden, the record’s once shown; `result` once a step ended', () => {
    const narrow = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const steps = [stepOf('s1', T), stepOf('s2', T, { question: narrow, state: 'gave-up' }), stepOf('s3', T, { question: { sources: ['new-spyro-pg'], fromNothing: false }, state: 'cancelled' })];
    const second: SessionInference = { target: 'new-spyro-pg', question: { sources: [], fromNothing: true }, order: 1, steps: ['s4'] };
    const records = { steps: [...steps, stepOf('s4', 'new-spyro-pg', { state: 'not-run', question: second.question })], inferences: [INFERENCE, second] };
    const items = [formalize(), result()];
    const hidden = buildSessionView(synth({ items, records }));
    expect(hidden.inferences.map((i) => [i.target.id, i.question.map((q) => q.id), i.fromNothing, i.result])).toEqual([
      [T, narrow.sources, false, items[1]?.id],
      ['new-spyro-pg', [], true, undefined],
    ]);
    expect((hidden.items.find((i) => i.kind === 'result')?.detail as { question: Array<{ id: string }> }).question.map((q) => q.id)).toEqual(narrow.sources);
    const shown = buildSessionView(synth({ items, records: { ...records, forced: SHOW } }));
    expect(shown.inferences[0]?.question.map((q) => q.id)).toEqual(SOURCES);
    // The note on a re-ask that was not proved, once shown (§3.2).
    expect(shown.report.notes).toEqual([REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game')]);
    expect(hidden.report.notes).toEqual([]);
  });

  it('Claude’s words, the step outcomes, the reason chips and the activity are withheld (D2-10); shown, they are there', () => {
    const steps = [stepOf('s1', T), stepOf('s2', T, { state: 'gave-up' })];
    const words = {
      s1: { summary: 'first try', gap: 'needed more' },
      s2: { summary: 'second try', gap: 'still needed more', proposedNothing: 'the question was enough', assumedWithoutAsking: [{ text: '“cannot” as a rule', items: [record(F_KEY, 'formalize').id, record('decl:Spyro.Helper', 'declaration').id] }] },
    };
    const items = [formalize(), result(), record('decl:Spyro.Helper', 'declaration', { declKind: 'definition', partOf: T })];
    const hidden = buildSessionView(synth({ items, records: { steps }, words }));
    expect(hidden.report.steps).toEqual([
      { step: 's1', target: T, revealed: false },
      { step: 's2', target: T, revealed: false },
    ]);
    expect(hidden.steps.map((s) => [s.state, s.outcome, s.activity])).toEqual([
      ['ended', undefined, 'withheld'],
      ['ended', undefined, 'withheld'],
    ]);
    expect(json(hidden)).not.toMatch(/first try|second try|needed more|the question was enough|“cannot” as a rule|did not finish/);
    expect(hidden.report.targets).toEqual([{ target: T, revealed: false }]);

    const shown = buildSessionView(synth({ items, records: { steps, forced: SHOW }, words }));
    expect(shown.report.steps).toEqual([
      { step: 's1', target: T, revealed: true, summary: 'first try' },
      {
        step: 's2',
        target: T,
        revealed: true,
        summary: 'second try',
        proposedNothing: REVIEW_TEXTS.proposedNothing('the question was enough'),
        assumedWithoutAsking: [{ text: '“cannot” as a rule', items: [items[0]?.id, items[2]?.id] }],
      },
    ]);
    expect(shown.steps.map((s) => [s.outcome, s.activity])).toEqual([
      [REVIEW_TEXTS.stepPassed, 'shown'],
      [REVIEW_TEXTS.stepDidNotFinish, 'shown'],
    ]);
    // A step whose gate passed may have proved nothing: its outcome reads as no verdict (fixer 2c2 r1, A-V2C2-ADV-9).
    expect(shown.steps[0]?.outcome).toBe("Claude's step finished");
    const detail = shown.items.find((i) => i.kind === 'result')?.detail;
    expect(detail).toMatchObject({ revealed: true, verdict: 'not-proved', reasonChip: REVIEW_TEXTS.stepDidNotFinish, summary: 'second try', gap: 'still needed more' });
    expect(shown.report.targets[0]).toMatchObject({ target: T, revealed: true, verdict: 'not-proved', reasonChip: REVIEW_TEXTS.stepDidNotFinish });
  });

  it('the class in force: classesBeforeReveal while hidden (no premise draft counted), `classes` once shown (§4.1, D2-42); `dependents` the accepted listed items', () => {
    const D = record('decl:Spyro.Def', 'declaration', { declKind: 'definition' });
    const V = record('vocab:Spyro.Shadow', 'vocabulary-term', { status: 'accepted', accepted: { how: 'group', fingerprint: 'fp', belief: false, changesProved: false, at: AT } });
    const items = [formalize(), D, V, result()];
    const draftReached: ItemClass = { belief: true, changesProved: false, reasons: [{ code: 'b4', name: 'Spyro.Def', cards: [T] }], complete: true };
    const deps = { [V.key]: [D.key], [R_KEY]: [D.key] };
    const hidden = buildSessionView(synth({ items, deps, classes: { [D.key]: draftReached }, before: { [D.key]: PLAIN } }));
    const shown = buildSessionView(synth({ items, deps, classes: { [D.key]: draftReached }, before: { [D.key]: PLAIN }, records: { forced: SHOW } }));
    const of = (view: SessionView, id: string) => view.items.find((i) => i.id === id) as ItemView;
    expect(of(hidden, D.id).classes).toEqual({ belief: false, changesProved: false, reasons: [] });
    expect(of(shown, D.id).classes).toEqual({ belief: true, changesProved: false, reasons: ['belief: a statement relies on Spyro.Def'] });
    // The view's Accept is the item's own (the detail's, `own: true`): open for a belief, which a group would leave.
    expect(of(shown, D.id).accept).toEqual({ ok: true });
    const shownInput = synth({ items, deps, classes: { [D.key]: draftReached }, before: { [D.key]: PLAIN }, records: { forced: SHOW } });
    expect(acceptGate(reviewStateOf(shownInput.records, shownInput.judgement), D.id, false)).toMatchObject({ ok: false, reason: 'own-accept' });
    // The accepted listed item that rests on it is its dependent; the hidden Result is not, while hidden.
    expect(of(hidden, D.id).dependents).toEqual([V.id]);
    expect(of(shown, D.id).dependents).toEqual([V.id]); // the Result rests on D too, but is in review
    const accepted = buildSessionView(synth({ items: items.map((r) => (r.kind === 'result' ? { ...r, status: 'accepted' as const } : r)), deps, records: { forced: SHOW } }));
    expect(of(accepted, D.id).dependents).toEqual([V.id, items[3]?.id]);
    // An incomplete class (D2-25) says so, and a class the judgement did not give counts as every badge (fail closed).
    const incomplete = buildSessionView(synth({ items: [D], classes: { [D.key]: { belief: true, changesProved: false, reasons: [], complete: false } } }));
    expect(incomplete.items[0]?.classes).toEqual({ belief: true, changesProved: false, reasons: [REVIEW_TEXTS.classIncomplete] });
    const input = synth({ items: [D] });
    const unknown = buildSessionView({ ...input, judgement: { ...(input.judgement as StateJudgement), classes: {}, classesBeforeReveal: {} } });
    expect(unknown.items[0]?.classes).toEqual({ belief: true, changesProved: true, reasons: [REVIEW_TEXTS.classIncomplete] });
  });

  it('a card is named as the board shows it, else as B has it, never by the working copy alone while hidden (a written premise card is dropped)', () => {
    const premiseCard = '/-\n@@ telelean v1\nid: cynder-is-evil\ntype: AXIOM\nnatural_name: Cynder is evil\nasserted: 2026-11-20\n-/';
    const current = append(STATEMENTS, MAIN, premiseCard);
    const question = { sources: [...SOURCES, 'cynder-is-evil'], fromNothing: false };
    const ledger: LedgerEntry[] = [{ kind: 'premise', card: 'cynder-is-evil', target: T, holdAs: 'axiom', item: PREMISE_KEY, commit: 'c3' }];
    const records = { inferences: [{ ...INFERENCE, question }], steps: [stepOf('s1', T, { question })], ledger };
    const hidden = buildSessionView(synth({ items: [formalize(), result()], current, records }));
    expect(hidden.board.graph.nodes.some((n) => n.id === 'cynder-is-evil')).toBe(false);
    expect(hidden.inferences[0]?.question.at(-1)).toEqual({ id: 'cynder-is-evil', type: 'PROPOSITION', sentence: 'cynder-is-evil', wordedBy: 'agent' });
    expect(json(hidden)).not.toContain('Cynder is evil');
    const shown = buildSessionView(synth({ items: [formalize(), result()], current, records: { ...records, forced: SHOW } }));
    expect(shown.inferences[0]?.question.at(-1)).toEqual({ id: 'cynder-is-evil', type: 'AXIOM', sentence: 'Cynder is evil', wordedBy: 'user' });
  });

  it('AF4: a statement to be redone with its content kept keeps the results hidden, and Submit’s gate names it', () => {
    const items = [formalize({ status: 'to-be-redone', redo: { because: [], reverted: false } }), result()];
    const view = buildSessionView(synth({ items }));
    expect(view.results).toEqual({ shown: false, forced: false, waitingFor: [items[0]?.id] });
    expect(view.submit).toEqual({ gate: { ok: false, reason: REVIEW_TEXTS.submitResultsHidden, missing: [items[0]?.id] } });
    // Taken out (reverted), it no longer waits: the results are shown and Submit's plan is read.
    const out = buildSessionView(synth({ items: [formalize({ status: 'to-be-redone', redo: { because: [], reverted: true } }), result({ status: 'accepted' })] }));
    expect(out.results.shown).toBe(true);
    expect(out.submit.gate).toEqual({ ok: true });
    expect(out.submit.next).toBe('claude-steps');
  });

  it('the hidden board has no source position, no time, duration, detail or stale files; its version is viewVersion and its error count the masked one (F17)', () => {
    const lemma = 'theorem dark_lemma : HasDarkPast cynder := cynder_dark_past.holds\n';
    const current = edit(PROVED, MAIN, TARGET_LINE, `${TARGET_LINE}${lemma}`);
    const messages = (texts: Texts): LeanMessageFact[] => {
      const text = texts[MAIN] as string;
      const line = (needle: string) => text.slice(0, text.indexOf(needle)).split('\n').length - 1;
      return [
        { severity: 'error', file: MAIN, module: 'Model.Spyro.Main', range: { start: { line: line('theorem dark_lemma'), character: 0 }, end: { line: line('theorem dark_lemma'), character: 5 } }, text: 'unknown identifier in dark_lemma' },
        { severity: 'warning', file: MAIN, module: 'Model.Spyro.Main', range: { start: { line: line('abbrev pg_no_dark_past'), character: 0 }, end: { line: line('abbrev pg_no_dark_past'), character: 3 } }, text: 'a visible warning' },
      ];
    };
    const facts: FakeFactsOptions = { messages: messages(current), status: 'build-errors' };
    const input = firstStage({ current, ledger: [...PROOF_LEDGER, created('Spyro.dark_lemma', 'proof')], facts, mutate: (f) => (f.detail = 'Lean said: dark_lemma failed') });
    const view = buildSessionView({ ...input, viewVersion: 41 });
    expect(view.results.shown).toBe(false);
    const graph = view.board.graph;
    expect(graph.version).toBe(41);
    expect(graph.semantic).toEqual({ state: 'fresh', toolchain: expect.any(String) });
    for (const node of graph.nodes) {
      expect(node.loc).toBeUndefined();
      expect(node.lean.codeLoc).toBeUndefined();
    }
    for (const v of graph.vocabulary) expect(v.loc).toBeUndefined();
    expect(graph.diagnostics.length).toBeGreaterThan(0);
    for (const d of graph.diagnostics) expect(d.range).toBeUndefined();
    expect(graph.diagnostics.some((d) => d.message === 'a visible warning')).toBe(true);
    expect(JSON.stringify(graph)).not.toMatch(/dark_lemma|checkedAt|durationMs|staleFiles/);
    // A visible error counts: the summary fails, with the masked count.
    const at = (STATEMENTS[MAIN] as string).split('\n').findIndex((l) => l.startsWith('abbrev pg_no_dark_past'));
    const visible = firstStage({ current: STATEMENTS, ledger: STATEMENT_LEDGER, facts: { messages: [{ ...(messages(current)[1] as LeanMessageFact), severity: 'error', range: { start: { line: at, character: 0 }, end: { line: at, character: 3 } } }], status: 'build-errors' } });
    expect(buildSessionView(visible).board.graph.semantic).toMatchObject({ state: 'failed', errorCount: 1 });
    expect(buildSessionView(visible).board.graph.semantic).not.toHaveProperty('detail');
    // Once shown, the board is the working copy's, unmasked: the proof, its time, its detail (positions still stripped).
    const shown = buildSessionView({ ...input, records: { ...input.records, forced: SHOW } });
    expect(shown.board.graph.semantic).toMatchObject({ state: 'failed', errorCount: 1, detail: 'Lean said: dark_lemma failed', checkedAt: expect.any(String), durationMs: expect.any(Number) });
    expect(shown.board.graph.nodes.find((n) => n.id === T)?.status.proof.kind).toBe('proved');
    for (const node of shown.board.graph.nodes) expect(node.loc).toBeUndefined();
  });

  it('fixer 2b3a r1 (C-V2B3A-C2): once shown, the board\'s Lean time is the build\'s, the check\'s and the isolated probe job\'s (fake facts: 1000, 200 and the probe\'s)', () => {
    const shownTime = (facts: FakeFactsOptions) => {
      const input = firstStage({ current: PROVED, ledger: PROOF_LEDGER, facts });
      return buildSessionView({ ...input, records: { ...input.records, forced: SHOW } }).board.graph.semantic.durationMs;
    };
    expect(shownTime({ probe: { status: 'ok', durationMs: 7 } })).toBe(1207);
    expect(shownTime({ probe: 'ok' })).toBe(1500);
    // Facts from before 2b3a (no marker): the build's and the check's.
    expect(shownTime({})).toBe(1200);
  });
});

// =============================================================================================

describe('once the results are shown (§6.1)', () => {
  it('the Results with their real statuses and classes, the unmasked board, the report’s verdicts and Claude’s words', () => {
    const input = provedStage();
    const hidden = buildSessionView(input);
    expect(hidden.results.shown).toBe(false);
    expect(hidden.board.graph.nodes.find((n) => n.id === T)?.status.proof.kind).toBe('none');
    const view = buildSessionView({ ...input, records: { ...input.records, forced: SHOW } });
    expect(view.results).toMatchObject({ shown: true, forced: true });
    const R = byLabel(view, 'Result');
    expect(R).toMatchObject({ rev: 1, status: 'in-review', classes: { belief: false, changesProved: false } });
    expect(R.detail).toMatchObject({ kind: 'result', revealed: true, verdict: 'established', flags: [], summary: WORDS.s1?.summary, gap: WORDS.s1?.gap });
    expect((R.detail as { proof?: { name: string; code: string } }).proof).toEqual({ name: 'Spyro.cynder_not_good.holds', code: HONEST_PROOF.trim() });
    expect(R.dependsOn).toEqual([byLabel(view, 'Formalize').id]);
    expect(view.board.graph.nodes.find((n) => n.id === T)?.status.proof.kind).toBe('proved');
    expect(view.report.targets).toEqual([
      expect.objectContaining({ target: T, revealed: true, verdict: 'established', restsOn: expect.any(Array), notNeeded: [], missing: [] }),
    ]);
    expect(view.report.steps).toEqual([{ step: 's1', target: T, revealed: true, summary: WORDS.s1?.summary, assumedWithoutAsking: WORDS.s1?.assumedWithoutAsking }]);
    expect(view.board.marks[T]).toEqual([{ item: R.id, kind: 'result', status: 'in-review' }]);
    // The `decided` force is telelean's: the results are shown, but `forced` is the user's only (fixer 2a's "For 2c2").
    const decided = buildSessionView({ ...input, records: { ...input.records, forced: { via: 'decided', at: AT } } });
    expect(decided.results).toMatchObject({ shown: true, forced: false });
  });

  it('`submit.work` and `next` come from planSubmit; a cycle partly accepted closes Submit with its text', () => {
    const items = [
      formalize({ status: 'accepted', accepted: { how: 'own', fingerprint: 'fp', belief: false, changesProved: false, at: AT } }),
      result({ status: 'declined', decline: { option: 'shaky', at: AT } }),
      record('vocab:Spyro.Shadow', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: true }, origin: { step: 's1', target: T, phase: 'statements' } }),
    ];
    const input = synth({ items });
    const view = buildSessionView(input);
    const plan = planSubmit({ records: input.records, judgement: input.judgement as StateJudgement });
    expect(view.submit).toEqual({ gate: { ok: true }, next: 'claude-steps', work: { shaky: plan.counts.shaky, redo: plan.counts.redo, steps: plan.steps.length } });
    expect(view.submit.work).toEqual({ shaky: 1, redo: 1, steps: 1 });
    // Every item accepted or rejected: the end confirmation, no Claude step.
    const confirm = buildSessionView(synth({ items: [items[0] as ItemRecord, result({ status: 'declined', decline: { option: 'reject', at: AT } })] }));
    expect(confirm.submit).toEqual({ gate: { ok: true }, next: 'confirm', work: { shaky: 0, redo: 0, steps: 0 } });
    // An RV-5 cycle with an accepted member that is not wholly accepted (§3.7, §4.5).
    const A = record('decl:Spyro.A', 'declaration', { declKind: 'definition', status: 'accepted', accepted: { how: 'own', fingerprint: 'fp', belief: false, changesProved: false, at: AT } });
    const B = record('decl:Spyro.B', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } });
    const cyc = buildSessionView(synth({ items: [A, B], deps: { [A.key]: [B.key], [B.key]: [A.key] } }));
    expect(cyc.submit).toEqual({
      gate: { ok: false, reason: REVIEW_TEXTS.acceptOrRejectTogether(['Definition Spyro.B', 'Definition Spyro.A']), missing: [B.id] },
      next: 'confirm',
      work: { shaky: 0, redo: 0, steps: 0 },
    });
    // While the results are hidden there is no plan at all (it would read the hidden Results' statuses).
    const hidden = buildSessionView(synth({ items: [formalize(), result({ status: 'declined', decline: { option: 'shaky', at: AT } })] }));
    expect(hidden.submit).toEqual({ gate: { ok: false, reason: REVIEW_TEXTS.submitInReview(1), missing: [hidden.items[0]?.id] } });
  });
});

// =============================================================================================

describe('every gate text (§2.3, §5.13; D2-62, D2-65, D2-27)', () => {
  const items = [formalize(), result(), record('vocab:Spyro.Shadow', 'vocabulary-term')];

  it('while a step runs (phases step and interrupted): every action closed with D2-62’s text, no Undo or Redo, nothing outcome-like', () => {
    // Every outcome-like datum exists in the records (fixer 2c2 r1, C-V2C2-C2): the results were shown when the queue
    // started; T's first step gave up (a reason chip) and its words are there; the user declined Claude's arrow from
    // new-spyro-pg, which T's question selected (D2-59's note); the running queue re-asked T with another question and
    // that step gave up too (a re-ask note, and its words), while the queue's next step runs.
    const narrowed = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const asked = { sources: ['cynder-dark-past'], fromNothing: false };
    const U: SessionInference = { target: 'new-spyro-pg', question: { sources: [], fromNothing: true }, order: 1, steps: ['s3'] };
    const left: SessionAction = { id: 3, kind: 'decide', label: 'Decline: x', request: { decisions: [], own: true }, changes: [], takenOut: [], rejectedArrows: { added: [{ source: 'new-spyro-pg', target: T }], removed: [] }, questions: [{ target: T, before: INFERENCE.question, after: narrowed }], commits: ['c4'], at: AT };
    const decide: SessionAction = { id: 4, kind: 'decide', label: 'Accept: x', request: { decisions: [], own: false }, changes: [], takenOut: [], rejectedArrows: { added: [], removed: [] }, questions: [], commits: [], at: AT };
    const steps = [
      stepOf('s1', T, { state: 'gave-up', queue: 1 }),
      stepOf('s2', T, { stage: 1, state: 'gave-up', question: asked, queue: 2 }),
      stepOf('s3', U.target, { stage: 1, state: 'running', question: U.question, queue: 2 }),
    ];
    const words = {
      s1: { summary: 'first try', gap: 'needed more', proposedNothing: 'nothing to add', assumedWithoutAsking: [{ text: '“cannot” as a rule', items: [] }] },
      s2: { summary: 'second try', gap: 'still needed more' },
    };
    const gone = record('decl:Spyro.Gone', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } });
    for (const phase of ['step', 'interrupted'] as const) {
      const records: Partial<SessionRecords> = {
        phase,
        forced: SHOW,
        retry: ['s1'],
        heading: { kind: 'cancelled', text: REVIEW_TEXTS.stepCancelled, firstStep: false, retry: { ok: true } },
        inferences: [{ ...INFERENCE, question: narrowed, steps: ['s1', 's2'] }, U],
        steps,
        stack: { done: [left, decide], undone: [{ ...decide, id: 5 }] },
      };
      const view = buildSessionView(synth({ items: [...items, gone], words, records }));
      const running = { ok: false, reason: REVIEW_TEXTS.stepRunning };
      for (const item of view.items) {
        expect(item.accept, phase).toEqual(running);
        expect(item.review).toEqual(running);
        expect(item.decline).toMatchObject(running);
      }
      // Un-reject in "Rejected in this session" too (A-V2C2-ADV-8).
      expect(view.rejected).toEqual([{ item: gone.id, label: 'Definition Spyro.Gone', rev: 1, at: AT, unreject: running, superseded: false }]);
      expect(view.submit).toEqual({ gate: running });
      expect(view.formalize).toEqual({ ok: false, reason: REVIEW_TEXTS.formalizeStepRunning });
      expect(view.heading?.retry).toEqual(running);
      expect(view.undo).toBeNull();
      expect(view.redo).toBeNull();
      expect(view.steps.every((s) => s.activity === 'withheld' && s.outcome === undefined)).toBe(true);
      expect(view.report.steps).toEqual([
        { step: 's1', target: T, revealed: false },
        { step: 's2', target: T, revealed: false },
      ]);
      expect(view.report.notes).toEqual([]);
      // The stage as the queue found it: shown (forced before the queue), its verdicts there, but no reason chip and no
      // words of Claude's (D2-10: withheld while a step runs).
      expect(view.results.shown).toBe(true);
      expect(view.report.targets[0]).toMatchObject({ revealed: true, verdict: 'not-proved' });
      expect(view.report.targets[0]?.reasonChip).toBeUndefined();
      const detail = view.items.find((i) => i.kind === 'result')?.detail;
      expect(detail).toMatchObject({ revealed: true, verdict: 'not-proved' });
      for (const key of ['reasonChip', 'summary', 'gap']) expect(detail, key).not.toHaveProperty(key);
      expect(json(view)).not.toMatch(/first try|second try|needed more|nothing to add|“cannot” as a rule|did not finish|left the question|was not proved/);
    }
    // The same stage once the queue ended (no step runs): every one of them shows.
    const ended = buildSessionView(
      synth({ items: [...items, gone], words, records: { forced: SHOW, inferences: [{ ...INFERENCE, question: narrowed, steps: ['s1', 's2'] }, U], steps: steps.slice(0, 2), stack: { done: [left, decide], undone: [] } } }),
    );
    expect(ended.report.notes).toEqual([
      REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game'),
      REVIEW_TEXTS.leftQuestion('The new Spyro game is PG', 'Cynder would not be a good addition to the new Spyro game'),
    ]);
    expect(ended.items.find((i) => i.kind === 'result')?.detail).toMatchObject({ reasonChip: REVIEW_TEXTS.stepDidNotFinish, summary: 'first try', gap: 'needed more' });
    expect(ended.report.steps.map((s) => s.summary)).toEqual(['first try', 'second try']);
    expect(ended.steps.map((s) => s.outcome)).toEqual([REVIEW_TEXTS.stepDidNotFinish, REVIEW_TEXTS.stepDidNotFinish]);
  });

  it('in a stage: the reducer’s own gates (the rules reduceReview applies), and Undo, Redo and the seal from the stack', () => {
    const decide: SessionAction = { id: 4, kind: 'decide', label: 'Accept: Vocabulary term Spyro.Shadow', request: { decisions: [], own: false }, changes: [], takenOut: [], rejectedArrows: { added: [], removed: [] }, questions: [], commits: [], at: AT };
    const view = buildSessionView(synth({ items, records: { stack: { done: [decide], undone: [{ ...decide, id: 5, label: 'Decline: x (Reject)' }] }, nextAction: 6 } }));
    expect(view.undo).toEqual({ step: 4, label: 'Accept: Vocabulary term Spyro.Shadow' });
    expect(view.redo).toEqual({ step: 5, label: 'Decline: x (Reject)' });
    expect(view.sealed).toBeNull();
    const F = view.items[0] as ItemView;
    expect(F.accept).toEqual({ ok: true });
    expect(F.review).toEqual({ ok: false, reason: REVIEW_TEXTS.inReviewAlready('Formalize “PG games cannot have characters with dark pasts”') });
    expect(F.decline).toMatchObject({ ok: true });
    // A seal on top stops Undo (UN-5), and is shown.
    const sealed = buildSessionView(synth({ items, records: { stack: { done: [decide, { id: 6, kind: 'seal', by: 'formalize', at: AT }], undone: [] } } }));
    expect(sealed.undo).toBeNull();
    expect(sealed.sealed).toEqual({ by: 'formalize', at: AT });
  });

  it('decline and back to review: declined already, withdrawn, taken out (D2-60), an un-reject after a mixed request (S-F5), a superseded rejected version', () => {
    const declined = record('decl:Spyro.Gone', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT }, rev: 2, versions: [{ rev: 1, stage: 1, fingerprint: 'fp-old', content: { decls: [] }, rejected: true }] });
    const withdrawn = record('vocab:Spyro.Shadow', 'vocabulary-term', { status: 'withdrawn' });
    const takenOut = record('vocab:Spyro.Out', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: true } });
    const kept = record('vocab:Spyro.Kept', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: false } });
    const other = record('vocab:Spyro.Other', 'vocabulary-term');
    const mixed: SessionAction = {
      id: 2,
      kind: 'decide',
      label: 'Decide 2 items',
      request: { decisions: [], own: false },
      changes: [
        { item: declined.id, rev: 2, before: { status: 'in-review', markers: [], rejectedFingerprints: [], rejectedRevs: [] }, after: { status: 'declined', decline: { option: 'reject', at: AT }, markers: [], rejectedFingerprints: [], rejectedRevs: [] } },
        { item: other.id, rev: 1, before: { status: 'declined', decline: { option: 'reject', at: AT }, markers: [], rejectedFingerprints: [], rejectedRevs: [] }, after: { status: 'in-review', markers: [], rejectedFingerprints: [], rejectedRevs: [] } },
      ],
      takenOut: [],
      rejectedArrows: { added: [], removed: [] },
      questions: [],
      commits: ['c-mixed'],
      at: AT,
    };
    const view = buildSessionView(synth({ items: [declined, withdrawn, takenOut, kept, other], records: { stack: { done: [mixed], undone: [] } } }));
    const of = (id: string) => view.items.find((i) => i.id === id) as ItemView;
    expect(of(declined.id).decline).toMatchObject({ ok: false, reason: REVIEW_TEXTS.declinedAlready('Definition Spyro.Gone') });
    expect(of(declined.id).review).toEqual({ ok: false, reason: REVIEW_TEXTS.unrejectMixed('Definition Spyro.Gone') });
    expect(of(declined.id).declined).toEqual({ option: 'reject' });
    expect(of(withdrawn.id).decline).toMatchObject({ ok: false, reason: REVIEW_TEXTS.withdrawnStays('Vocabulary term Spyro.Shadow') });
    expect(of(withdrawn.id).review).toEqual({ ok: false, reason: REVIEW_TEXTS.withdrawnStays('Vocabulary term Spyro.Shadow') });
    expect(of(takenOut.id).review).toEqual({ ok: false, reason: REVIEW_TEXTS.contentTakenOut });
    expect(of(takenOut.id).decline).toMatchObject({ ok: true });
    expect(of(kept.id).review).toEqual({ ok: true });
    expect(view.rejected).toEqual([
      { item: declined.id, label: 'Definition Spyro.Gone', rev: 2, at: AT, unreject: { ok: false, reason: REVIEW_TEXTS.unrejectMixed('Definition Spyro.Gone') }, superseded: false },
      { item: declined.id, label: 'Definition Spyro.Gone', rev: 1, at: '', unreject: { ok: false, reason: REVIEW_TEXTS.unrejectNewer }, superseded: true },
    ]);
    // Without the mixed request, the un-reject is open.
    const plain = buildSessionView(synth({ items: [declined] }));
    expect(plain.rejected[0]?.unreject).toEqual({ ok: true });
    expect(plain.items[0]?.review).toEqual({ ok: true });
  });

  it('Accept: its dependencies (with `missing`), the "did not pass" heading, missing facts, a failed probe, a Result not judged yet', () => {
    const vocab = record('vocab:Spyro.Shadow', 'vocabulary-term');
    const F = formalize();
    const deps = { [F.key]: [vocab.key] };
    const view = buildSessionView(synth({ items: [F, vocab], deps }));
    expect(view.items.map((i) => i.id)).toEqual([vocab.id, F.id]); // its dependency first (§5.5)
    expect(view.items[1]?.accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptNeedsDependencies('Formalize “PG games cannot have characters with dark pasts”', ['Vocabulary term Spyro.Shadow']), missing: [vocab.id] });
    expect(view.items[1]?.dependsOn).toEqual([vocab.id]);
    const notPassed = buildSessionView(synth({ items: [F, vocab], records: { heading: { kind: 'did-not-pass', text: REVIEW_TEXTS.didNotPass('x'), firstStep: false, retry: { ok: true } } } }));
    expect(notPassed.items.map((i) => i.accept)).toEqual([
      { ok: false, reason: REVIEW_TEXTS.acceptDidNotPass },
      { ok: false, reason: REVIEW_TEXTS.acceptDidNotPass },
    ]);
    expect(notPassed.items.map((i) => i.decline.ok)).toEqual([true, true]); // Decline stays (ES-4)
    const facts = buildSessionView(synth({ items: [vocab], classes: { [vocab.key]: { ...PLAIN, factsMissing: true } } }));
    expect(facts.items[0]?.accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptFactsMissing('Vocabulary term Spyro.Shadow') });
    const probe = buildSessionView(synth({ items: [vocab], classes: { [vocab.key]: { ...PLAIN, factsMissing: true, probeFailure: 'telelean could not read it: the probe failed.' } } }));
    expect(probe.items[0]?.accept).toEqual({ ok: false, reason: REVIEW_TEXTS.acceptProbeFailed('telelean could not read it: the probe failed.') });
    const unjudged = buildSessionView(synth({ items: [result({ judged: undefined })] }));
    expect(unjudged.items[0]?.accept).toEqual({ ok: false, reason: REVIEW_TEXTS.resultNotJudged('Result “Cynder would not be a good addition to the new Spyro game”') });
    // The gates are exactly the reducer's own Accept gate, item by item.
    const input = synth({ items: [F, vocab, result()], deps });
    const state = reviewStateOf(input.records, input.judgement, sessionLabels(buildSessionView(input)));
    for (const [id, gate] of itemGates(state)) expect(gate.accept).toEqual(acceptGate(state, id, true));
  });

  it('Submit, Formalize and Retry: in review, hidden (D2-65), judging (D2-27: Accept stays), nothing to retry; confirming and applying', () => {
    const view = buildSessionView(synth({ items, records: { retry: [] } }));
    expect(view.submit).toEqual({ gate: { ok: false, reason: REVIEW_TEXTS.submitInReview(2), missing: [view.items[0]?.id, view.items[1]?.id] } });
    expect(view.formalize).toEqual({ ok: false, reason: REVIEW_TEXTS.formalizeResultsHidden });
    const heading = { kind: 'failed' as const, text: REVIEW_TEXTS.stepFailed('the turn cap'), firstStep: true, retry: { ok: false as const, reason: 'stale' } };
    const none = buildSessionView(synth({ items, records: { heading, retry: [] } }));
    expect(none.heading).toEqual({ kind: 'failed', text: REVIEW_TEXTS.stepFailed('the turn cap'), firstStep: true, retry: { ok: false, reason: REVIEW_TEXTS.nothingToRetry } });
    const retry = buildSessionView(synth({ items, records: { heading, retry: ['s1'] } }));
    expect(retry.heading?.retry).toEqual({ ok: true });
    const judging = buildSessionView(synth({ items: [items[2] as ItemRecord], judging: true, records: { heading, retry: ['s1'] } }));
    expect(judging.judging).toBe(true);
    expect(judging.items[0]?.accept).toEqual({ ok: true });
    expect(judging.formalize).toEqual({ ok: false, reason: REVIEW_TEXTS.judging });
    expect(judging.heading?.retry).toEqual({ ok: false, reason: REVIEW_TEXTS.judging });
    const decided = buildSessionView(synth({ items: [result({ status: 'accepted' })], judging: true }));
    expect(decided.submit.gate).toEqual({ ok: false, reason: REVIEW_TEXTS.judging });
    const open = buildSessionView(synth({ items: [items[2] as ItemRecord, result({ status: 'accepted' })], records: { heading, retry: ['s1'] } }));
    expect(open.formalize).toEqual({ ok: true });
    const gone = record('decl:Spyro.Gone', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } });
    for (const phase of ['confirming', 'applying'] as const) {
      const ending = buildSessionView(synth({ items: [result({ status: 'accepted' }), gone], records: { phase, heading, retry: ['s1'] } }));
      const reason = phase === 'confirming' ? REVIEW_TEXTS.formalizeConfirming : REVIEW_TEXTS.applyingNow;
      expect(ending.items.find((i) => i.kind === 'result')?.review, phase).toEqual({ ok: false, reason });
      expect(ending.submit.gate).toEqual({ ok: false, reason });
      expect(ending.formalize).toEqual({ ok: false, reason });
      expect(ending.heading?.retry).toEqual({ ok: false, reason });
      expect(ending.undo).toBeNull();
      // Un-reject in "Rejected in this session" waits for the stage too (A-V2C2-ADV-8).
      expect(ending.rejected.map((r) => [r.item, r.unreject])).toEqual([[gone.id, { ok: false, reason }]]);
    }
    expect(buildSessionView(synth({ items: [result({ status: 'accepted' }), gone] })).rejected[0]?.unreject).toEqual({ ok: true });
  });
});

// =============================================================================================

describe('the end confirmation (§3.10, §5.9)', () => {
  const accepted = { how: 'own' as const, fingerprint: 'fp', belief: true, changesProved: false, at: AT };
  const items = [
    formalize({ status: 'accepted', accepted }),
    record('decl:Spyro.Def', 'declaration', { declKind: 'definition', status: 'accepted', accepted }),
    record('decl:Spyro.Sort.exists', 'declaration', { declKind: 'presupposition', status: 'accepted', accepted }),
    record('decl:Spyro.inst', 'declaration', { declKind: 'instance', status: 'accepted', accepted }),
    record('decl:Spyro.Changed', 'declaration', { declKind: 'vocabulary-change', status: 'accepted', accepted }),
    record('decl:Spyro.No', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } }),
    result({ status: 'declined', decline: { option: 'reject', at: AT } }),
  ];
  const ending = (confirmation: NonNullable<SessionRecords['confirmation']>, over: Partial<SessionRecords> = {}, judging = false) =>
    buildSessionView(synth({ items, judging, records: { phase: 'confirming', confirmation, inferences: [INFERENCE, { target: 'new-spyro-pg', question: { sources: [], fromNothing: true }, order: 1, steps: ['s2'] }], ...over } }));

  it('changes, rejected, not run, the endorsements, the check; Apply only once it passed and with no drift', () => {
    const passed = ending({ checkId: 'chk1', filesKey: 'k', state: 'passed', failures: [], reusedFileChecks: true });
    expect(passed.confirmation).toEqual({
      changes: [
        { item: items[0]?.id, label: 'Formalize “PG games cannot have characters with dark pasts”' },
        { item: items[1]?.id, label: 'Definition Spyro.Def' },
        { item: items[2]?.id, label: 'Presupposition Spyro.Sort.exists' },
        { item: items[3]?.id, label: 'Instance Spyro.inst' },
        { item: items[4]?.id, label: 'Vocabulary change Spyro.Changed' },
      ],
      rejected: [
        { item: items[5]?.id, label: 'Definition Spyro.No' },
        { item: items[6]?.id, label: 'Result “Cynder would not be a good addition to the new Spyro game”' },
      ],
      notRun: ['new-spyro-pg'],
      endorsed: [
        { name: 'Spyro.Def', declKind: 'definition' },
        { name: 'Spyro.Sort.exists', declKind: 'presupposition' },
        { name: 'Spyro.inst', declKind: 'instance' },
      ],
      check: { id: 'chk1', state: 'passed', reusedFileChecks: true, failures: [] },
      empty: false,
      apply: { ok: true },
    });
    expect(ending({ checkId: 'chk1', filesKey: 'k', state: 'running', failures: [] }).confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.applyWaitsForCheck });
    const failures = [{ rule: 'backstop' as const, text: 'Spyro.Def changed after you accepted it.', items: [items[1]?.id as string], declaration: 'Spyro.Def' }];
    const failed = ending({ checkId: 'chk1', filesKey: 'k', state: 'failed', failures });
    expect(failed.confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.applyCheckFailed });
    expect(failed.confirmation?.check).toEqual({ id: 'chk1', state: 'failed', reusedFileChecks: false, failures });
    const drift = { files: ['Model/Spyro/Main.lean'], at: AT };
    const drifted = ending({ checkId: 'chk1', filesKey: 'k', state: 'passed', failures: [] }, { drift });
    expect(drifted.confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.drift(drift.files) });
    expect(drifted.drift).toEqual(drift);
    expect(ending({ checkId: 'chk1', filesKey: 'k', state: 'passed', failures: [] }, {}, true).confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.judging });
    expect(ending({ checkId: 'chk1', filesKey: 'k', state: 'passed', failures: [] }, { phase: 'applying' }).confirmation?.apply).toEqual({ ok: false, reason: REVIEW_TEXTS.applyingNow });
    // Nothing accepted: Apply only records (D2-39). No confirmation outside confirming and applying.
    const empty = buildSessionView(synth({ items: [items[5] as ItemRecord], records: { phase: 'confirming', confirmation: { checkId: 'c', filesKey: 'k', state: 'passed', failures: [] } } }));
    expect(empty.confirmation?.empty).toBe(true);
    expect(buildSessionView(synth({ items, records: { confirmation: { checkId: 'c', filesKey: 'k', state: 'passed', failures: [] } } })).confirmation).toBeUndefined();
  });
});

// =============================================================================================

describe('the list order (§5.5) and the step numbers', () => {
  it('sources that are not targets, Vocabulary, Definitions, the targets in inference order, other cards, cards off the board; within a card fields, arrows and premises, Result', () => {
    const second: SessionInference = { target: 'new-spyro-pg', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s0'] };
    const first: SessionInference = { ...INFERENCE, order: 1 };
    const items = [
      result(),
      record(PREMISE_KEY, 'add-premise', { partOf: T, content: { decls: [], premise: draftOf() } }),
      record('decl:Spyro.Def', 'declaration', { declKind: 'definition' }),
      record(`arrow:cynder-dark-past>${T}`, 'add-arrow', { partOf: T }),
      formalize(),
      record('card:ghost-card', 'formalize'),
      record('vocab:Spyro.B', 'vocabulary-term'),
      record('vocab:Spyro.A', 'vocabulary-term'),
      record(`card:${T}`, 'formalize'),
      record('proof:new-spyro-pg', 'result'),
      record('card:cynder-dark-past', 'formalize'),
    ];
    const view = buildSessionView(synth({ items, records: { inferences: [first, second], forced: SHOW } }));
    const keys = view.items.map((i) => items.find((r) => r.id === i.id)?.key);
    expect(view.board.graph.nodes.map((n) => n.id)).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', T]);
    expect(keys).toEqual([
      F_KEY, // the sources that are no target, in board order: pg-no-dark-past (a source of the target's question)
      'card:cynder-dark-past', // …then cynder-dark-past (a source of both questions)
      'vocab:Spyro.B', // Vocabulary, in the records' order
      'vocab:Spyro.A',
      'decl:Spyro.Def',
      'proof:new-spyro-pg', // the targets in inference order: new-spyro-pg first (order 0)
      `card:${T}`, // within a card: its fields, its arrows, its premises, its Result
      `arrow:cynder-dark-past>${T}`,
      PREMISE_KEY,
      R_KEY,
      'card:ghost-card', // a card not on the board
    ]);
    expect(view.items.map((i) => i.group.kind === 'card' ? i.group.card.id : i.group.kind)).toEqual([
      'pg-no-dark-past',
      'cynder-dark-past',
      'vocabulary',
      'vocabulary',
      'definitions',
      'new-spyro-pg',
      T,
      T,
      T,
      T,
      'ghost-card',
    ]);
    expect(view.items.find((i) => i.kind === 'add-arrow')?.cards.map((c) => c.id)).toEqual(['cynder-dark-past', T]);
    expect(view.items.find((i) => i.id === items[5]?.id)?.cards).toEqual([{ id: 'ghost-card', type: 'PROPOSITION', sentence: 'ghost-card', wordedBy: 'agent' }]);
  });

  it('every item’s listed dependencies come before it: hoisted from a later group, in their own order; a cycle as the walk meets it; empty and single', () => {
    const V1 = record('vocab:Spyro.V1', 'vocabulary-term');
    const V2 = record('vocab:Spyro.V2', 'vocabulary-term');
    const D = record('decl:Spyro.D', 'declaration', { declKind: 'definition' });
    const F = formalize();
    const C1 = record('decl:Spyro.C1', 'declaration', { declKind: 'definition' });
    const C2 = record('decl:Spyro.C2', 'declaration', { declKind: 'definition' });
    const items = [F, V1, V2, D, C1, C2];
    const deps = { [F.key]: [D.key, V2.key], [D.key]: [V2.key], [C1.key]: [C2.key], [C2.key]: [C1.key] };
    const view = buildSessionView(synth({ items, deps, records: { forced: SHOW } }));
    expect(view.items.map((i) => i.id)).toEqual([V2.id, D.id, F.id, V1.id, C2.id, C1.id]);
    const at = new Map(view.items.map((i, k) => [i.id, k]));
    for (const item of view.items) {
      for (const d of item.dependsOn) if (!(item.id === C1.id || item.id === C2.id)) expect(at.get(d) as number).toBeLessThan(at.get(item.id) as number);
    }
    expect(buildSessionView(synth({ items: [] })).items).toEqual([]);
    expect(buildSessionView(synth({ items: [V1] })).items.map((i) => i.id)).toEqual([V1.id]);
  });

  it('a step is numbered within its queue (2d’s `queue`), else within its run of steps of one stage and kind', () => {
    const steps = [
      stepOf('a', T, { stage: 0 }),
      stepOf('b', 'new-spyro-pg', { stage: 0 }),
      stepOf('c', T, { stage: 1 }),
      stepOf('d', T, { stage: 1, kind: 'submit' }),
      stepOf('e', T, { stage: 1, kind: 'submit' }),
    ];
    const plain = buildSessionView(synth({ items: [], records: { steps } }));
    expect(plain.steps.map((s) => [s.id, s.index, s.of])).toEqual([
      ['a', 1, 2],
      ['b', 2, 2],
      ['c', 1, 1],
      ['d', 1, 2],
      ['e', 2, 2],
    ]);
    const queued = buildSessionView(synth({ items: [], records: { steps: steps.map((s, k) => ({ ...s, queue: [1, 1, 2, 3, 4][k] as number })) } }));
    expect(queued.steps.map((s) => [s.id, s.index, s.of])).toEqual([
      ['a', 1, 2],
      ['b', 2, 2],
      ['c', 1, 1],
      ['d', 1, 1],
      ['e', 1, 1],
    ]);
    expect(buildSessionView(synth({ items: [], records: { steps: [] } })).steps).toEqual([]);
    expect(queued.steps.map((s) => s.state)).toEqual(['ended', 'ended', 'ended', 'ended', 'ended']);
    const states = buildSessionView(synth({ items: [], records: { steps: (['queued', 'running', 'cancelled', 'failed', 'interrupted', 'not-run'] as const).map((state, k) => stepOf(`x${k}`, T, { state })) } }));
    expect(states.steps.map((s) => s.state)).toEqual(['queued', 'running', 'cancelled', 'failed', 'interrupted', 'not-run']);
  });
});

// =============================================================================================

describe('details and labels', () => {
  it('itemLabel gives the labels the view itself uses, for every kind; sessionLabels names every listed item and every card', () => {
    const items = [
      formalize({ status: 'declined', decline: { option: 'reject', at: AT } }),
      result({ status: 'declined', decline: { option: 'reject', at: AT } }),
      record(`arrow:new-spyro-pg>${T}`, 'add-arrow', { partOf: T, status: 'declined', decline: { option: 'plain', at: AT } }),
      record(PREMISE_KEY, 'add-premise', { partOf: T, status: 'declined', decline: { option: 'reject', at: AT }, content: { decls: [], premise: draftOf() } }),
      record('vocab:Spyro.Shadow', 'vocabulary-term', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('decl:Spyro.Inst', 'declaration', { declKind: 'instance', status: 'declined', decline: { option: 'reject', at: AT } }),
      record('card:cynder-dark-past', 'change', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('card:new-spyro-pg', 'delete', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('proof:new-spyro-pg', 'proof-broken', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record(`card:${T}`, 'add', { status: 'declined', decline: { option: 'reject', at: AT } }),
    ];
    const view = buildSessionView(synth({ items, records: { forced: SHOW } }));
    const labels = sessionLabels(view);
    for (const r of view.rejected) expect(itemLabel(view.items.find((i) => i.id === r.item) as ItemView)).toBe(r.label);
    expect(view.rejected.map((r) => r.label)).toEqual([
      'Formalize “PG games cannot have characters with dark pasts”',
      'Change “Cynder is a character who has a dark past”',
      'Delete “The new Spyro game is PG”',
      'Proof broken “The new Spyro game is PG”',
      'Vocabulary term Spyro.Shadow',
      'Instance Spyro.Inst',
      'Add “Cynder would not be a good addition to the new Spyro game”',
      'Add arrow “The new Spyro game is PG” → “Cynder would not be a good addition to the new Spyro game”',
      'Add premise “Cynder is evil”',
      'Result “Cynder would not be a good addition to the new Spyro game”',
    ]);
    expect(labels[T]).toBe('“Cynder would not be a good addition to the new Spyro game”');
    // A key that does not parse (never made by computeItems): the view's own label and itemLabel still agree.
    const odd = [record('odd-key', 'formalize', { status: 'declined', decline: { option: 'reject', at: AT } }), record('odd:premise', 'add-premise', { status: 'declined', decline: { option: 'reject', at: AT } })];
    const oddView = buildSessionView(synth({ items: odd, records: { forced: SHOW } }));
    expect(oddView.rejected.map((r) => r.label)).toEqual(oddView.rejected.map((r) => itemLabel(oddView.items.find((i) => i.id === r.item) as ItemView)));
    expect(oddView.rejected.map((r) => r.label).sort()).toEqual(['Add premise “”', 'Formalize']);
    expect(Object.keys(labels)).toEqual(expect.arrayContaining([...items.map((r) => r.id), T, 'pg-no-dark-past']));
  });

  it('the detail of each kind slice 2 makes: Formalize (renderings by content key), Add premise, Add arrow, Vocabulary term, Definition, a shown Result; previous for "updated"', () => {
    const premise = draftOf({ consts: ['Spyro.HasDarkPast', 'Spyro.cynder'] });
    const accepted = { how: 'own' as const, fingerprint: 'fp', belief: true, changesProved: false, at: AT, holdAs: 'pending' as const };
    const items = [
      formalize({ rev: 2, markers: ['updated'], fingerprint: 'fp-f2', versions: [{ rev: 1, stage: 1, fingerprint: 'fp-f1', content: { decls: [{ name: 'Spyro.pg_no_dark_past', text: 'abbrev pg_no_dark_past : Prop := True' }] } }] }),
      record(PREMISE_KEY, 'add-premise', { partOf: T, status: 'accepted', accepted, content: { decls: [], premise } }),
      record(`arrow:new-spyro-pg>${T}`, 'add-arrow', { partOf: T }),
      record('vocab:Spyro.HasDarkPast', 'vocabulary-term'),
      record('decl:Spyro.IsPG', 'declaration', { declKind: 'vocabulary-change', content: { decls: [{ name: 'Spyro.IsPG', text: 'axiom IsPG : Game → Prop' }] } }),
      result({ markers: ['completion-not-checked'], content: { decls: [{ name: 'Spyro.cynder_not_good.holds', text: 'theorem cynder_not_good.holds : cynder_not_good := x', kind: 'theorem' }] } }),
    ];
    const renderings = { 'fp-f2': { pretty: 'PG → ¬ dark', explicit: '∀ g c, Spyro.IsPG g → …' }, 'fp-f1': { pretty: 'True', explicit: 'True' } };
    const input = synth({
      items,
      renderings,
      classes: { [items[2]?.key as string]: { belief: false, changesProved: true, reasons: [{ code: 'c4', arrow: { source: 'new-spyro-pg', target: T } }], complete: true, addsNoNewBasis: true } },
      records: { forced: SHOW, ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: T, step: 's1', why: 'the proof needs it' }] },
      verdict: { verdict: 'proved', direct: ['new-spyro-pg'], missing: [{ source: 'cynder-dark-past', drawn: true }], band: { used: ['new-spyro-pg'], notNeeded: ['pg-no-dark-past'], complete: false, open: [] } },
      current: PROVED,
    });
    const view = buildSessionView(input);
    const of = (k: number) => view.items.find((i) => i.id === items[k]?.id) as ItemView;
    expect(of(0).detail).toMatchObject({ kind: 'formalize', statement: { name: 'Spyro.pg_no_dark_past', pretty: 'PG → ¬ dark', explicit: '∀ g c, Spyro.IsPG g → …' } });
    expect(of(0).previous).toEqual({ kind: 'formalize', card: of(0).cards[0], statement: { name: 'Spyro.pg_no_dark_past', pretty: 'True', explicit: 'True', closure: [] } });
    expect(of(1).detail).toEqual({
      kind: 'add-premise',
      sentence: 'Cynder is evil',
      leanName: 'cynder_is_evil',
      target: of(1).cards[0],
      statement: { name: 'Spyro.cynder_is_evil', pretty: premise.leanStatement, explicit: premise.explicit, closure: [expect.objectContaining({ name: 'Spyro.HasDarkPast', kind: 'predicate' }), expect.objectContaining({ name: 'Spyro.cynder', kind: 'constant' })] },
      whyNeeded: 'the gap',
      mayRestate: false,
      replacesFromNothing: false,
      heldAs: 'pending',
    });
    expect(of(2).detail).toEqual({ kind: 'add-arrow', source: expect.objectContaining({ id: 'new-spyro-pg' }), target: expect.objectContaining({ id: T }), why: 'the proof needs it', addsNoNewBasis: true });
    expect(of(2).markers).toEqual(['adds-no-new-basis']);
    expect(of(2).classes).toEqual({ belief: false, changesProved: true, reasons: ['changes what is proved: it adds an arrow into a proposition'] });
    expect(of(3).detail).toEqual({ kind: 'vocabulary-term', name: 'Spyro.HasDarkPast', vocabKind: 'predicate', type: 'Spyro.Character → Prop', gloss: 'has a dark past', glossBy: 'user', code: expect.stringContaining('axiom HasDarkPast') });
    expect(of(4).detail).toMatchObject({ kind: 'declaration', declKind: 'vocabulary-change', name: 'Spyro.IsPG', code: 'axiom IsPG : Game → Prop', before: expect.stringContaining('axiom IsPG : Game → Prop'), gloss: 'is rated PG' });
    expect((of(4).detail as { usedByStatementsOf: Array<{ id: string }> }).usedByStatementsOf.map((c) => c.id)).toEqual(expect.arrayContaining(['new-spyro-pg', 'pg-no-dark-past']));
    expect(of(5).detail).toMatchObject({
      kind: 'result',
      revealed: true,
      verdict: 'proved',
      proof: { name: 'Spyro.cynder_not_good.holds', code: 'theorem cynder_not_good.holds : cynder_not_good := x' },
      band: { used: ['new-spyro-pg'], notNeeded: ['pg-no-dark-past'], complete: false, open: [] },
      missingArrows: [{ source: 'cynder-dark-past', drawn: true }],
      arrowItems: [items[2]?.id],
      premiseItems: [items[1]?.id],
      completion: 'not-checked',
    });
    expect(view.report.targets[0]?.missing).toEqual([
      { text: REVIEW_TEXTS.selectTooHint('“Cynder is a character who has a dark past”', '“Cynder would not be a good addition to the new Spyro game”'), select: { source: 'cynder-dark-past', target: T } },
    ]);
    expect(view.board.premises).toEqual([{ item: items[1]?.id, target: T, sentence: 'Cynder is evil', status: 'accepted' }]);
    expect(view.board.arrows).toEqual([{ item: items[2]?.id, change: 'add', source: 'new-spyro-pg', target: T, status: 'in-review', used: true }]);
  });
});

describe('details of the kinds no slice-2 step makes, and previous proposals', () => {
  it('Change (field by field, Mentioned by), Add (every field), Delete (its arrows, Mentioned by), Proof broken (its error)', () => {
    // The working copy changes cynder-dark-past's sentence and why (a Change, slice 3) and drops new-spyro-pg's block.
    const changed = edit(edit(STATEMENTS, MAIN, 'natural_name: Cynder is a character who has a dark past\nrationale: familiar with gaming lore', 'natural_name: Cynder has a dark past\nrationale: from the games'), MAIN, 'source: reported\n', 'source: reported\nstance: rule\n');
    const items = [
      record('card:cynder-dark-past', 'change'),
      record(`card:${T}`, 'add'),
      record('card:new-spyro-pg', 'delete'),
      record('proof:new-spyro-pg', 'proof-broken'),
    ];
    const view = buildSessionView(synth({ items, current: changed, records: { forced: SHOW } }));
    const of = (k: number) => view.items.find((i) => i.id === items[k]?.id) as ItemView;
    expect(of(0).detail).toEqual({
      kind: 'change',
      card: expect.objectContaining({ id: 'cynder-dark-past', sentence: 'Cynder has a dark past' }),
      fields: [
        { field: 'sentence', before: 'Cynder is a character who has a dark past', after: 'Cynder has a dark past' },
        { field: 'why', before: 'familiar with gaming lore', after: 'from the games' },
      ],
      mentionedBy: [],
    });
    expect(of(1).detail).toEqual({
      kind: 'add',
      card: expect.objectContaining({ id: T }),
      statement: expect.objectContaining({ name: 'Spyro.cynder_not_good' }),
      fields: [
        { field: 'sentence', value: 'Cynder would not be a good addition to the new Spyro game', by: 'user' },
        { field: 'dependencies', value: SOURCES.join(', '), by: 'user' },
      ],
    });
    expect(of(2).detail).toEqual({ kind: 'delete', card: expect.objectContaining({ id: 'new-spyro-pg' }), arrows: [{ source: 'new-spyro-pg', target: T }], mentionedBy: [] });
    expect(of(3).detail).toEqual({ kind: 'proof-broken', card: expect.objectContaining({ id: 'new-spyro-pg' }), error: '' });
    const stance = buildSessionView(synth({ items: [items[0] as ItemRecord], current: edit(STATEMENTS, MAIN, 'source: common\n', 'source: common\nstance: rule\n'), records: { forced: SHOW } }));
    expect((stance.items[0]?.detail as { fields: unknown[] }).fields).toEqual([{ field: 'stance', after: 'rule' }]);
  });

  it('previous proposals of a vocabulary term, a definition and an Add premise; none for an item never updated', () => {
    const old = draftOf({ naturalName: 'Cynder was evil', leanStatement: 'HasDarkPast cynder ∧ True' });
    const items = [
      record('vocab:Spyro.HasDarkPast', 'vocabulary-term', { versions: [{ rev: 1, stage: 1, fingerprint: 'v1', content: { decls: [{ name: 'Spyro.HasDarkPast', text: 'axiom HasDarkPast : Prop' }] } }], rev: 2 }),
      record('decl:Spyro.IsPG', 'declaration', { declKind: 'definition', versions: [{ rev: 1, stage: 1, fingerprint: 'd1', content: { decls: [{ name: 'Spyro.IsPG', text: 'def IsPG (g : Game) : Prop := True' }] } }], rev: 2 }),
      record(PREMISE_KEY, 'add-premise', { partOf: T, content: { decls: [], premise: draftOf() }, versions: [{ rev: 1, stage: 1, fingerprint: 'p1', content: { decls: [], premise: old } }], rev: 2 }),
      record('vocab:Spyro.Fresh', 'vocabulary-term'),
    ];
    const view = buildSessionView(synth({ items, records: { forced: SHOW } }));
    const of = (k: number) => view.items.find((i) => i.id === items[k]?.id) as ItemView;
    expect(of(0).previous).toEqual({ kind: 'vocabulary-term', name: 'Spyro.HasDarkPast', vocabKind: 'predicate', code: 'axiom HasDarkPast : Prop' });
    expect(of(1).previous).toEqual({ kind: 'declaration', declKind: 'definition', name: 'Spyro.IsPG', code: 'def IsPG (g : Game) : Prop := True', usedByStatementsOf: [] });
    expect(of(2).previous).toEqual({
      kind: 'add-premise',
      sentence: 'Cynder was evil',
      leanName: 'cynder_is_evil',
      target: expect.objectContaining({ id: T }),
      statement: { name: 'Spyro.cynder_is_evil', pretty: 'HasDarkPast cynder ∧ True', explicit: old.explicit, closure: [] },
      whyNeeded: 'the gap',
      mayRestate: false,
      replacesFromNothing: false,
    });
    expect(of(3).previous).toBeUndefined();
    // A written premise in review (a converted v1 ghost) is written in review; its target's "follows from nothing" is replaced.
    const marked = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const ghost = buildSessionView(synth({ items: [record(PREMISE_KEY, 'add-premise', { partOf: T, card: 'cynder-is-evil', content: { decls: [], premise: draftOf({ aloneEntails: true }) } })], base: marked, records: { forced: SHOW } }));
    expect(ghost.items[0]?.detail).toMatchObject({ kind: 'add-premise', writtenInReview: true, replacesFromNothing: true, mayRestate: true });
    expect(ghost.items[0]?.detail).not.toHaveProperty('heldAs');
    expect(ghost.items[0]?.cards.map((c) => c.id)).toEqual([T, 'cynder-is-evil']);
    expect(ghost.board.premises).toEqual([]);
  });
});

describe('notes on questions, the questions’ arrows, the build inputs of the masked board', () => {
  it('D2-59: a source that left a question is noted once shown, and is no re-ask; a re-ask that was not proved is', () => {
    const narrowed = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const declined: SessionAction = {
      id: 3,
      kind: 'decide',
      label: 'Decline: x',
      request: { decisions: [], own: true },
      changes: [],
      takenOut: [],
      rejectedArrows: { added: [{ source: 'new-spyro-pg', target: T }], removed: [] },
      questions: [{ target: T, before: INFERENCE.question, after: narrowed }],
      commits: ['c4'],
      at: AT,
    };
    const records = { inferences: [{ ...INFERENCE, question: narrowed }], stack: { done: [declined], undone: [] } };
    const items = [formalize(), result()];
    const left = REVIEW_TEXTS.leftQuestion('The new Spyro game is PG', 'Cynder would not be a good addition to the new Spyro game');
    expect(buildSessionView(synth({ items, records: { ...records, forced: SHOW } })).report.notes).toEqual([left]);
    expect(buildSessionView(synth({ items, records })).report.notes).toEqual([]);
    // A later step asked another question and did not prove it: both notes.
    const reask = { sources: ['cynder-dark-past'], fromNothing: false };
    const both = buildSessionView(synth({ items, records: { ...records, steps: [stepOf('s1', T), stepOf('s2', T, { question: reask })], forced: SHOW } }));
    expect(both.report.notes).toEqual([REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game'), left]);
  });

  it('reviewStateOf: the Add arrow items each question selected (D2-20, D2-59), the edges by id, "did not pass" from the heading', () => {
    const A = record(`arrow:new-spyro-pg>${T}`, 'add-arrow', { partOf: T });
    const B2 = record(`arrow:cynder-dark-past>${T}`, 'add-arrow', { partOf: T });
    const R = result();
    const input = synth({ items: [A, B2, R], deps: { [R.key]: [A.key] }, records: { inferences: [{ ...INFERENCE, question: { sources: ['new-spyro-pg'], fromNothing: false } }], heading: { kind: 'did-not-pass', text: 'x', firstStep: false, retry: { ok: true } } } });
    const state = reviewStateOf(input.records, input.judgement, { [R.id]: 'the Result' });
    expect(state.questionArrows).toEqual({ [R.id]: [A.id] });
    expect(state.deps[R.id]).toEqual([A.id]);
    expect(state.didNotPass).toBe(true);
    expect(state.labels).toEqual({ [R.id]: 'the Result' });
    expect(reviewStateOf(input.records, null)).toMatchObject({ classes: {}, classesBeforeReveal: {}, deps: { [A.id]: [], [B2.id]: [], [R.id]: [] } });
    expect(reviewStateOf(input.records, null)).not.toHaveProperty('labels');
  });

  it('the working copy’s endorsements and lakefile reach the masked board (§2.9’s note): an endorsed definition stays unflagged, TL110 stays', () => {
    const DEF = '/-- dark -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
    const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := DarkChar cynder');
    const endorsements = { Spyro: [{ name: 'Spyro.DarkChar', textHash: endorsementHash(DEF) }] };
    const lakefile = { path: 'lakefile.toml', text: '[leanOptions]\nautoImplicit = true\n' };
    const build = (texts: Texts, extra: Partial<ProjectInput> = {}) => {
      const parsed = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
      return buildProjectModel({ files: parsed, fileHashes: freshHashes(parsed), facts: fakeFacts(parsed, { valueConsts: true, typeConsts: true }), library: 'Model', ...extra });
    };
    const input = synth({ items: [formalize(), result()] });
    const base = build(withDef(BASE), { endorsements, lakefile });
    const current = build(withDef(PROVED), { endorsements, lakefile });
    const flags = (view: SessionView) => [view.board.graph.vocabulary.find((v) => v.name === 'Spyro.DarkChar')?.flags, view.board.graph.nodes.find((n) => n.id === 'cynder-dark-past')?.status.flags];
    const hidden = buildSessionView({ ...input, base, current, endorsements, lakefile });
    expect(hidden.results.shown).toBe(false);
    expect(flags(hidden)).toEqual([[], []]);
    expect(hidden.board.graph.diagnostics.some((d) => d.code === 'TL110')).toBe(true);
    const without = buildSessionView({ ...input, base, current });
    expect(flags(without)).toEqual([['definitional-choice'], ['definitional-choice']]);
    expect(without.board.graph.diagnostics.some((d) => d.code === 'TL110')).toBe(false);
  });
});

describe('what is shown only with the results, whatever the records hold', () => {
  it('the board’s arrows and premise suggestions only while shown (§2.3), also for items no Result holds as a part', () => {
    // A Remove arrow item (slice 3) is no Result's part, and an Add premise record without `partOf` is malformed: both
    // are listed while hidden, but neither reaches the board then.
    const unarrow = record(`unarrow:new-spyro-pg>${T}`, 'remove-arrow');
    const premise = record(PREMISE_KEY, 'add-premise', { content: { decls: [], premise: draftOf() } });
    const items = [formalize(), unarrow, premise, result()];
    const hidden = buildSessionView(synth({ items }));
    expect(hidden.results.shown).toBe(false);
    expect(hidden.items.map((i) => i.id)).toEqual(expect.arrayContaining([unarrow.id, premise.id]));
    expect(hidden.board.arrows).toEqual([]);
    expect(hidden.board.premises).toEqual([]);
    const shown = buildSessionView(synth({ items, records: { forced: SHOW } }));
    expect(shown.board.arrows).toEqual([{ item: unarrow.id, change: 'remove', source: 'new-spyro-pg', target: T, status: 'in-review', used: false }]);
    expect(shown.board.premises).toEqual([{ item: premise.id, target: T, sentence: 'Cynder is evil', status: 'in-review' }]);
  });

  it('a reason chip only for a not-proved verdict: a re-ask that gave up while the earlier proof stands reads proved, with no chip', () => {
    const steps = [stepOf('s1', T), stepOf('s2', T, { state: 'gave-up' })];
    const items = [result({ status: 'accepted' })];
    const proved = buildSessionView(synth({ items, records: { steps }, verdict: { verdict: 'proved' } }));
    expect(proved.results.shown).toBe(true);
    expect(proved.items[0]?.detail).toMatchObject({ verdict: 'proved' });
    expect(proved.items[0]?.detail).not.toHaveProperty('reasonChip');
    expect(proved.report.targets[0]).not.toHaveProperty('reasonChip');
    const open = buildSessionView(synth({ items, records: { steps } }));
    expect(open.report.targets[0]?.reasonChip).toBe(REVIEW_TEXTS.stepDidNotFinish);
  });

  it('a Result declined (rejected) shows the version its record holds: its verdict and Rests on from `judged`, its proof, no band', () => {
    const rejected = result({
      status: 'declined',
      decline: { option: 'reject', at: AT },
      judged: { verdict: 'established', restsOn: ['cynder-dark-past'], deps: [] },
      content: { decls: [{ name: 'Spyro.cynder_not_good.holds', text: 'theorem cynder_not_good.holds : cynder_not_good := x', kind: 'theorem' }] },
    });
    // The stage judgement judged B's version, back in ws/: not proved.
    const view = buildSessionView(synth({ items: [rejected], verdict: { verdict: 'not-proved', band: { used: ['x'], notNeeded: [], complete: true, open: [] }, restsOn: ['y'], flags: ['replaces-your-proof'] } }));
    expect(view.items[0]?.detail).toMatchObject({
      verdict: 'established',
      restsOn: ['cynder-dark-past'],
      flags: [],
      band: { used: [], notNeeded: [], complete: false, open: [] },
      proof: { name: 'Spyro.cynder_not_good.holds', code: 'theorem cynder_not_good.holds : cynder_not_good := x' },
    });
    // The report describes the stage's working copy: B's version, not proved.
    expect(view.report.targets[0]).toMatchObject({ verdict: 'not-proved' });
  });

  it('held as: only once accepted (a record that kept an Accept while in review is malformed, and shows none)', () => {
    const accepted = { how: 'own' as const, fingerprint: 'fp', belief: true, changesProved: false, at: AT, holdAs: 'axiom' as const };
    const inReview = record(PREMISE_KEY, 'add-premise', { partOf: T, accepted, content: { decls: [], premise: draftOf() } });
    const view = buildSessionView(synth({ items: [inReview], records: { forced: SHOW } }));
    expect(view.items[0]?.detail).not.toHaveProperty('heldAs');
    const done = buildSessionView(synth({ items: [{ ...inReview, status: 'accepted' }], records: { forced: SHOW } }));
    expect(done.items[0]?.detail).toMatchObject({ heldAs: 'axiom' });
  });
});

describe('itemGates (reducer, builder 2c2): every item’s gates on one Work, as reduceReview reads one decision', () => {
  it('per status: accept is acceptGate’s own Accept; decline closed when declined or withdrawn; back to review closed in review, withdrawn, taken out', () => {
    const accepted = { how: 'own' as const, fingerprint: 'fp', belief: false, changesProved: false, at: AT };
    const items = [
      record('vocab:Spyro.A', 'vocabulary-term'),
      record('vocab:Spyro.B', 'vocabulary-term', { status: 'accepted', accepted }),
      record('vocab:Spyro.C', 'vocabulary-term', { status: 'declined', decline: { option: 'shaky', at: AT } }),
      record('vocab:Spyro.D', 'vocabulary-term', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('vocab:Spyro.E', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: false } }),
      record('vocab:Spyro.F', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: true } }),
      record('vocab:Spyro.G', 'vocabulary-term', { status: 'withdrawn' }),
      record(PREMISE_KEY, 'add-premise', { status: 'declined', decline: { option: 'reject', at: AT }, content: { decls: [], premise: draftOf() } }),
    ];
    const input = synth({ items });
    const state = reviewStateOf(input.records, input.judgement);
    const gates = itemGates(state);
    expect(gates.size).toBe(items.length);
    const text = (g: { ok: boolean; text?: string }) => (g.ok ? 'ok' : g.text);
    const label = (k: number) => `Vocabulary term Spyro.${'ABCDEFG'[k]}`;
    expect(items.map((r) => text(gates.get(r.id)?.decline as { ok: boolean; text?: string }))).toEqual([
      'ok',
      'ok',
      REVIEW_TEXTS.declinedAlready(label(2)),
      REVIEW_TEXTS.declinedAlready(label(3)),
      'ok',
      'ok',
      REVIEW_TEXTS.withdrawnStays(label(6)),
      REVIEW_TEXTS.declinedAlready('Add premise “Cynder is evil”'),
    ]);
    expect(items.map((r) => text(gates.get(r.id)?.review as { ok: boolean; text?: string }))).toEqual([
      REVIEW_TEXTS.inReviewAlready(label(0)),
      'ok',
      'ok',
      'ok',
      'ok',
      REVIEW_TEXTS.contentTakenOut,
      REVIEW_TEXTS.withdrawnStays(label(6)),
      'ok',
    ]);
    for (const r of items) expect(gates.get(r.id)?.accept).toEqual(acceptGate(state, r.id, true));
    expect(items.map((r) => gates.get(r.id)?.accept.ok)).toEqual([true, false, false, false, false, false, false, false]);
    // Every refused decision of a single item is refused by reduceReview with the same text (the gates read its rules).
    for (const r of items) {
      const g = gates.get(r.id);
      if (g !== undefined && !g.review.ok) {
        const out = reduceReview(state, { kind: 'decide', decisions: [{ item: r.id, rev: r.rev, to: 'in-review' }], own: true, confirmed: true }, AT);
        if (r.status === 'in-review') expect(out).toMatchObject({ ok: true, label: '' }); // nothing to go back to: a no-op
        else expect(out).toEqual({ ok: false, code: 'refused', error: g.review.text, item: r.id });
      }
      if (g !== undefined && !g.decline.ok) {
        const out = reduceReview(state, { kind: 'decide', decisions: [{ item: r.id, rev: r.rev, to: 'declined', option: 'reject' }], own: true, confirmed: true }, AT);
        expect(out).toEqual({ ok: false, code: 'refused', error: g.decline.text, item: r.id });
      }
    }
    expect(itemGates(reviewStateOf({ ...input.records, items: [] }, input.judgement)).size).toBe(0);
    // A mixed request (it un-rejected B and declined two others): un-reject of a declaration it declined is refused
    // (S-F5), of an Add premise it declined not (its un-reject merges nothing, AF2).
    const premise = items[7] as ItemRecord;
    const declaration = record('decl:Spyro.H', 'declaration', { declKind: 'definition', status: 'declined', decline: { option: 'reject', at: AT } });
    const state0 = { status: 'in-review' as const, markers: [], rejectedFingerprints: [], rejectedRevs: [] };
    const out = { status: 'declined' as const, decline: { option: 'reject' as const, at: AT }, markers: [], rejectedFingerprints: [], rejectedRevs: [] };
    const mixed: SessionAction = {
      id: 9,
      kind: 'decide',
      label: 'Decide 3 items',
      request: { decisions: [], own: false },
      changes: [
        { item: premise.id, rev: 1, before: state0, after: out },
        { item: declaration.id, rev: 1, before: state0, after: out },
        { item: items[1]?.id as string, rev: 1, before: out, after: state0 },
      ],
      takenOut: [],
      rejectedArrows: { added: [], removed: [] },
      questions: [],
      commits: ['c-mixed'],
      at: AT,
    };
    const mixedInput = synth({ items: [...items, declaration], records: { stack: { done: [mixed], undone: [] } } });
    const mixedGates = itemGates(reviewStateOf(mixedInput.records, mixedInput.judgement));
    expect(mixedGates.get(premise.id)?.review).toEqual({ ok: true });
    expect(mixedGates.get(declaration.id)?.review).toEqual({ ok: false, text: REVIEW_TEXTS.unrejectMixed('Definition Spyro.H') });
  });
});

// =============================================================================================

describe('edges: no judgement yet, events, moves', () => {
  it('a session whose first queue runs: stage 0, no judgement, no item; the board is B whatever working copy is passed, nothing revealed, every gate closed', () => {
    const input = synth({ items: [], noJudgement: true, records: { stage: 0, phase: 'step', steps: [stepOf('s1', T, { state: 'running' })] }, current: BASE });
    const view = buildSessionView(input);
    expect(view.stage).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.counts).toEqual({ inReview: 0, accepted: 0, declined: 0, toBeRedone: 0 });
    expect(view.inferences[0]?.result).toBeUndefined();
    expect(view.steps).toEqual([{ id: 's1', index: 1, of: 1, kind: 'formalize', target: T, state: 'running', activity: 'withheld' }]);
    expect(view.submit.gate).toEqual({ ok: false, reason: REVIEW_TEXTS.stepRunning });
    // Nothing was judged, so nothing is revealed (fixer 2c2 r1, A-V2C2-ADV-4).
    expect(view.report).toEqual({ stage: 0, targets: [{ target: T, revealed: false }], steps: [], notes: [], consistency: 'unchecked', withdrawn: [] });
    expect(view.problems).toEqual([]);
    expect(view.board.graph.nodes.map((n) => n.id)).toEqual(subjectGraph(model(BASE), 'Spyro', { version: 1, semantic: { state: 'fresh' } }).nodes.map((n) => n.id));
    // Fail closed (C-V2C2-C6): a working copy other than B (here with the first step's proof, ended mid-queue, and a card
    // B lacks that the question names) shows as B, and that card is never named from it.
    const premiseCard = '/-\n@@ telelean v1\nid: cynder-is-evil\ntype: AXIOM\nnatural_name: Cynder is evil\nasserted: 2026-11-20\n-/';
    const question = { sources: [...SOURCES, 'cynder-is-evil'], fromNothing: false };
    const midQueue = { ...input.records, inferences: [{ ...INFERENCE, question }], steps: [stepOf('s1', T, { question }), stepOf('s2', 'new-spyro-pg', { state: 'running' })] };
    const proved = buildSessionView({ ...input, current: model(append(PROVED, MAIN, premiseCard)), records: midQueue });
    expect(json(proved)).toBe(json(buildSessionView({ ...input, records: midQueue })));
    expect(proved.board.graph.nodes.find((n) => n.id === T)?.status.proof.kind).toBe('none');
    expect(json(proved)).not.toMatch(/cynder_not_good\.holds|Cynder is evil/);
    // Many inferences and steps.
    const many = buildSessionView(synth({ items: [], noJudgement: true, records: { stage: 0, phase: 'step', inferences: [INFERENCE, { target: 'new-spyro-pg', question: { sources: [], fromNothing: true }, order: 1, steps: [] }], steps: [stepOf('s1', T, { state: 'running' }), stepOf('s2', 'new-spyro-pg', { state: 'queued' })] } }));
    expect(many.steps.map((s) => [s.index, s.of, s.state])).toEqual([
      [1, 2, 'running'],
      [2, 2, 'queued'],
    ]);
  });

  it('pure: the same input gives the same view, and so do the records as run.json persists them (a reload, D2-72)', () => {
    for (const input of [provedStage(), openStage(), synth({ items: [formalize(), result()], records: { forced: SHOW } })]) {
      const once = json(buildSessionView(input));
      expect(json(buildSessionView(input))).toBe(once);
      const reloaded = { ...input, records: JSON.parse(JSON.stringify(input.records)) as SessionRecords, judgement: JSON.parse(JSON.stringify(input.judgement)) as StateJudgement };
      expect(json(buildSessionView(reloaded))).toBe(once);
    }
  });

  it('events pass through, but never name a hidden item: an event naming only hidden items is left out (defence in depth)', () => {
    const items = [formalize(), result(), record('decl:Spyro.Helper', 'declaration', { declKind: 'definition', partOf: T })];
    const events = [
      { id: 1, at: AT, text: REVIEW_TEXTS.eventRedoneWith, items: [items[0]?.id as string, items[1]?.id as string] },
      { id: 2, at: AT, text: REVIEW_TEXTS.eventNoLongerBuilds, items: [items[2]?.id as string] },
      { id: 3, at: AT, text: 'telelean’s note', items: [] },
    ];
    const hidden = buildSessionView(synth({ items, records: { events } }));
    expect(hidden.events).toEqual([
      { id: 1, at: AT, text: REVIEW_TEXTS.eventRedoneWith, items: [items[0]?.id] },
      { id: 3, at: AT, text: 'telelean’s note', items: [] },
    ]);
    expect(buildSessionView(synth({ items, records: { events, forced: SHOW } })).events).toEqual(events);
  });

  it('moves (D2-33), drift, judging and removed cards pass through', () => {
    const positions = { [T]: { x: 10, y: 20 } };
    const view = buildSessionView(synth({ items: [], judging: true, records: { positions, drift: { files: ['a.lean'], at: AT } } }));
    expect(view.board.positions).toEqual(positions);
    expect(view.drift).toEqual({ files: ['a.lean'], at: AT });
    expect(view.judging).toBe(true);
    expect(view.board.removedNodes).toEqual([]);
    // A card B has that the working copy lacks is listed as removed, without its positions.
    const without = edit(STATEMENTS, MAIN, '/-\n@@ telelean v1\nid: new-spyro-pg', '/-\n@@ telelean v1\nid: new-spyro-pg-renamed');
    const removed = buildSessionView(synth({ items: [], current: without, records: { forced: SHOW } }));
    expect(removed.board.removedNodes.map((n) => [n.id, n.loc, n.lean.codeLoc])).toEqual([['new-spyro-pg', undefined, undefined]]);
  });
});

// =============================================================================================
// Fixer 2c2 r1: the review's findings, one rule each

describe('fixer 2c2 r1: what a Result, a question, Undo and the problems show', () => {
  const accept = (r: ItemRecord): ItemRecord => ({ ...r, status: 'accepted', accepted: { how: 'own', fingerprint: r.fingerprint, belief: false, changesProved: false, at: AT } });

  it('a rejected Result is left out of "Rejected in this session" while the results are hidden, its rejected versions too (F10; C-V2C2-C3)', () => {
    const R = result({ rev: 2, status: 'declined', decline: { option: 'reject', at: AT }, rejectedFingerprints: ['fp-r1'], versions: [{ rev: 1, stage: 1, fingerprint: 'fp-r1', content: { decls: [] }, rejected: true }] });
    const items = [formalize(), R];
    const hidden = buildSessionView(synth({ items }));
    expect(hidden.results.shown).toBe(false);
    expect(hidden.rejected).toEqual([]);
    expect(hidden.items.find((i) => i.id === R.id)).toMatchObject({ rev: 0, status: null });
    expect(hidden.counts.declined).toBe(0);
    const shown = buildSessionView(synth({ items, records: { forced: SHOW } }));
    expect(shown.rejected.map((r) => [r.item, r.rev, r.superseded])).toEqual([
      [R.id, 2, false],
      [R.id, 1, true],
    ]);
  });

  it('Undo and Redo of a decision on an item hidden now are not offered (D2-8: the reducer refuses them), so no label names it (C-V2C2-C4)', () => {
    const F = formalize();
    const R = accept(result());
    const V = record('vocab:Spyro.Shadow', 'vocabulary-term');
    const before = { status: 'in-review' as const, markers: [], rejectedFingerprints: [], rejectedRevs: [] };
    const acceptOf = (r: ItemRecord, id: number, label: string): SessionAction => ({
      id,
      kind: 'decide',
      label,
      request: { decisions: [{ item: r.id, rev: 1, to: 'accepted' }], own: true },
      changes: [{ item: r.id, rev: 1, before, after: { ...before, status: 'accepted', accepted: { how: 'own', fingerprint: r.fingerprint, belief: false, changesProved: false, at: AT } } }],
      takenOut: [],
      rejectedArrows: { added: [], removed: [] },
      questions: [],
      commits: [],
      at: AT,
    });
    const label = 'Accept: Result “Cynder would not be a good addition to the new Spyro game”';
    const records = { stack: { done: [acceptOf(R, 3, label)], undone: [acceptOf(R, 4, label)] }, nextAction: 5 };
    const input = synth({ items: [F, R, V], records });
    const hidden = buildSessionView(input);
    expect(hidden.results.shown).toBe(false);
    expect(hidden.undo).toBeNull();
    expect(hidden.redo).toBeNull();
    expect(json(hidden)).not.toContain('Accept: Result');
    const state = reviewStateOf(input.records, input.judgement, sessionLabels(hidden));
    expect(reduceReview(state, { kind: 'undo', step: 3, confirmed: true }, AT)).toEqual({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst });
    expect(reduceReview(state, { kind: 'redo', step: 4, confirmed: true }, AT)).toMatchObject({ ok: false, code: 'refused', error: REVIEW_TEXTS.showResultsFirst });
    // Shown, both are offered with their labels.
    const shown = buildSessionView(synth({ items: [F, R, V], records: { ...records, forced: SHOW } }));
    expect([shown.undo, shown.redo]).toEqual([
      { step: 3, label },
      { step: 4, label },
    ]);
    // A decision on a listed item stays offered while hidden.
    const listed = buildSessionView(synth({ items: [F, R, accept(V)], records: { stack: { done: [acceptOf(V, 3, 'Accept: Vocabulary term Spyro.Shadow')], undone: [] }, nextAction: 4 } }));
    expect(listed.results.shown).toBe(false);
    expect(listed.undo).toEqual({ step: 3, label: 'Accept: Vocabulary term Spyro.Shadow' });
  });

  it('previous: an earlier rev only, never the draft key a premise write keeps beside the written key at the same rev (§3.8; C-V2C2-C5)', () => {
    const draft = draftOf();
    const written = record(PREMISE_KEY, 'add-premise', {
      partOf: T,
      status: 'accepted',
      accepted: { how: 'own', fingerprint: 'written-key', belief: true, changesProved: false, at: AT, holdAs: 'axiom' },
      card: 'cynder-is-evil',
      fingerprint: 'written-key',
      content: { decls: [], premise: draft },
      versions: [{ rev: 1, stage: 1, fingerprint: 'draft-key', content: { decls: [], premise: draft } }],
    });
    const view = buildSessionView(synth({ items: [written], records: { forced: SHOW } }));
    expect(view.items[0]?.previous).toBeUndefined();
    // Updated since, then written: the newest earlier version, not the same-rev draft key.
    const older = draftOf({ naturalName: 'Cynder was evil' });
    const updated: ItemRecord = {
      ...written,
      rev: 2,
      markers: ['updated'],
      versions: [
        { rev: 1, stage: 1, fingerprint: 'old', content: { decls: [], premise: older } },
        { rev: 2, stage: 2, fingerprint: 'draft-key-2', content: { decls: [], premise: draft } },
      ],
    };
    expect(buildSessionView(synth({ items: [updated], records: { forced: SHOW } })).items[0]?.previous).toMatchObject({ kind: 'add-premise', sentence: 'Cynder was evil' });
  });

  it('while a step runs with the results shown, a target whose step ended in the running queue shows the question that step asked, proved or not (A-V2C2-ADV-1); another target its record’s, as when the queue started', () => {
    const s1 = openStage();
    const asked = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const U: SessionInference = { target: 'new-spyro-pg', question: { sources: [], fromNothing: true }, order: 1, steps: ['s3'] };
    const steps = [stepOf('s1', T, { queue: 1 }), stepOf('s2', T, { stage: 1, question: asked, queue: 2 }), stepOf('s3', U.target, { stage: 1, state: 'running', question: U.question, queue: 2 })];
    // D2-46: a proved re-ask puts its question on the record when it ends (mid-queue); one that is not proved leaves it.
    const twin = (proved: boolean): SessionViewInput => ({
      ...s1,
      records: { ...s1.records, phase: 'step', forced: SHOW, steps, inferences: [{ ...INFERENCE, steps: ['s1', 's2'], question: proved ? asked : INFERENCE.question }, U] },
    });
    const a = buildSessionView(twin(true));
    expect(a.results.shown).toBe(true);
    expect(json(a)).toBe(json(buildSessionView(twin(false))));
    expect(a.inferences[0]?.question.map((c) => c.id)).toEqual(asked.sources);
    // T's latest ended step belongs to an earlier queue (a re-ask not proved, with its note): its record's question,
    // which the stage showed when this queue started.
    const later = [stepOf('s1', T, { queue: 1 }), stepOf('s2', T, { stage: 1, question: asked, queue: 2 }), stepOf('s3', U.target, { stage: 1, state: 'running', question: U.question, queue: 3 })];
    const inferences = [{ ...INFERENCE, steps: ['s1', 's2'] }, U];
    const running = buildSessionView({ ...s1, records: { ...s1.records, phase: 'step', forced: SHOW, steps: later, inferences } });
    const before = buildSessionView({ ...s1, records: { ...s1.records, forced: SHOW, steps: later.slice(0, 2), inferences } });
    expect(before.report.notes).toEqual([REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game')]);
    expect(before.inferences[0]?.question.map((c) => c.id)).toEqual(SOURCES);
    expect(running.inferences[0]?.question.map((c) => c.id)).toEqual(SOURCES);
  });

  it('while hidden, a question asked is shown less the sources the user’s declines took out of it (D2-59; A-V2C2-ADV-6)', () => {
    const narrowed = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const declined: SessionAction = { id: 3, kind: 'decide', label: 'Decline: x', request: { decisions: [], own: true }, changes: [], takenOut: [], rejectedArrows: { added: [{ source: 'new-spyro-pg', target: T }], removed: [] }, questions: [{ target: T, before: INFERENCE.question, after: narrowed }], commits: ['c4'], at: AT };
    const view = buildSessionView(synth({ items: [formalize(), result()], records: { inferences: [{ ...INFERENCE, question: narrowed }], stack: { done: [declined], undone: [] } } }));
    expect(view.results.shown).toBe(false);
    expect(view.inferences[0]?.question.map((c) => c.id)).toEqual(narrowed.sources);
    expect((byLabel(view, 'Result').detail as { question: Array<{ id: string }> }).question.map((c) => c.id)).toEqual(narrowed.sources);
  });

  it('a Result telelean took out reads what the working copy holds now, with no proof, never the verdict of the judgement that took it out (A-V2C2-ADV-2)', () => {
    const input = provedStage();
    const judgement = input.judgement as StateJudgement;
    // Every listed item decided, so the results are shown; the Result in review. A judge (after some decision) finds T's
    // inference failing on the same proof: reconcile records that judgement on it and takes it out to be redone.
    const items = input.records.items.map((r) => (r.kind === 'result' ? r : accept(r)));
    const failing: StateJudgement = { ...judgement, inferences: { [T]: { ...(judgement.inferences[T] as StateJudgement['inferences'][string]), passes: false } } };
    const out = reconcile({ runId: RUN, records: { ...input.records, items }, judgement: failing, at: AT });
    expect(out.records.items.find((r) => r.kind === 'result')).toMatchObject({ status: 'to-be-redone', redo: { reverted: true }, judged: { verdict: 'established' } });
    // The judge runs again on the head with the proof taken out (B's version back): the stage judgement the view reads.
    const again = judgeState({ purpose: 'stage', stage: 'prove', commit: 'c-3', filesKey: 'files-3', base: input.base, current: model(STATEMENTS), inferences: input.records.inferences, ledger: STATEMENT_LEDGER, items: out.records.items, premises: [], ended: [T], rejectedArrows: [] });
    const records = reconcile({ runId: RUN, records: { ...out.records, ledger: STATEMENT_LEDGER }, judgement: again, at: AT }).records;
    const view = buildSessionView({ ...input, judgement: again, current: model(STATEMENTS), records: { ...records, events: out.events.map((e, k) => ({ id: k + 1, at: AT, ...e })) } });
    expect(view.results.shown).toBe(true);
    expect(view.events[0]?.text).toBe(REVIEW_TEXTS.eventNoLongerPasses);
    const row = byLabel(view, 'Result');
    expect(row.status).toBe('to-be-redone');
    expect(row.detail).toMatchObject({ revealed: true, verdict: 'not-proved', restsOn: [], band: { used: [], complete: false } });
    expect(row.detail).not.toHaveProperty('proof');
    // Nor Claude's words on the version taken out (builder 2b3a, carry-over R1-5): its summary read "Proved from the three
    // arrows." beside B's "not proved". The stage report keeps them, as what that step said.
    for (const key of ['summary', 'gap']) expect(row.detail, key).not.toHaveProperty(key);
    expect(view.report.steps[0]?.summary).toBe('Proved from the three arrows.');
    expect(view.report.targets[0]?.verdict).toBe('not-proved');
    // Declined after it was taken out (its record keeps `redo`, D2-60): the same. Declined with its content in, the
    // version the person declined (see "a Result declined (rejected) shows the version its record holds").
    const declinedAfter = records.items.map((r) => (r.kind === 'result' ? { ...r, status: 'declined' as const, decline: { option: 'reject' as const, at: AT } } : r));
    const declinedView = buildSessionView({ ...input, judgement: again, current: model(STATEMENTS), records: { ...records, items: declinedAfter } });
    expect(byLabel(declinedView, 'Result').detail).toMatchObject({ verdict: 'not-proved', restsOn: [] });
    expect(byLabel(declinedView, 'Result').detail).not.toHaveProperty('proof');
    for (const key of ['summary', 'gap']) expect(byLabel(declinedView, 'Result').detail, key).not.toHaveProperty(key);
    // Before the take-out (its content in ws/), and declined with its content in: the words of the version shown.
    expect(byLabel(buildSessionView({ ...input, records: { ...input.records, items } }), 'Result').detail).toMatchObject({ summary: 'Proved from the three arrows.', gap: 'nothing missing' });
    const declinedIn = items.map((r) => (r.kind === 'result' ? { ...r, status: 'declined' as const, decline: { option: 'reject' as const, at: AT }, judged: { verdict: 'established' as const, restsOn: [], deps: [] } } : r));
    expect(byLabel(buildSessionView({ ...input, records: { ...input.records, items: declinedIn } }), 'Result').detail).toMatchObject({ verdict: 'established', summary: 'Proved from the three arrows.' });
  });

  it('a Result’s reason chip and Claude’s words come from the step whose version stands, never a later re-ask that left it standing (A-V2C2-ADV-5)', () => {
    const input = openStage();
    const items = input.records.items.map((r) => (r.kind === 'result' ? r : accept(r)));
    const narrow = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const words = { s1: { summary: 'honest: not enough', gap: 'new-spyro-pg is not enough' }, s2: { summary: 'gave up', gap: 'ran out' } };
    const at = (steps: Step[]) => buildSessionView({ ...input, words, records: { ...input.records, items, steps, inferences: [{ ...INFERENCE, steps: steps.map((s) => s.id) }] } });
    // s1 (the record's question) finished not proved; the re-ask s2 (another question) gave up: s1's version stands.
    const view = at([stepOf('s1', T), stepOf('s2', T, { stage: 1, state: 'gave-up', question: narrow })]);
    expect(view.results.shown).toBe(true);
    const detail = byLabel(view, 'Result').detail;
    expect(detail).toMatchObject({ verdict: 'not-proved', summary: 'honest: not enough', gap: 'new-spyro-pg is not enough' });
    expect(detail).not.toHaveProperty('reasonChip');
    expect(view.report.targets[0]).not.toHaveProperty('reasonChip');
    expect(view.report.notes).toEqual([REVIEW_TEXTS.reaskNotProved('Cynder would not be a good addition to the new Spyro game')]);
    // The other way round: s1 gave up, a re-ask with another question finished: s1's chip and words.
    const other = at([stepOf('s1', T, { state: 'gave-up' }), stepOf('s2', T, { stage: 1, question: narrow })]);
    expect(byLabel(other, 'Result').detail).toMatchObject({ reasonChip: REVIEW_TEXTS.stepDidNotFinish, summary: 'honest: not enough' });
  });

  it('the shown board names stale files; the hidden one never (§4.7; S-STALEFILES-VACUOUS)', () => {
    const input = openStage({ facts: { moduleStates: { [VOCAB]: 'stale' } } });
    const hidden = buildSessionView(input);
    expect(hidden.results.shown).toBe(false);
    expect(hidden.board.graph.semantic).not.toHaveProperty('staleFiles');
    expect(hidden.board.graph.semantic?.state).toBe('fresh');
    const shown = buildSessionView({ ...input, records: { ...input.records, forced: SHOW } });
    expect(shown.board.graph.semantic).toMatchObject({ state: 'stale', staleFiles: [VOCAB] });
  });

  it('the stage’s problems: the judgement’s facts and unowned ones, an item that disappeared (not while judging), the runner’s; never about a hidden item (S-STAGE-PROBLEMS-NO-PATH)', () => {
    const F = formalize();
    const R = result();
    const D = record('decl:Spyro.Helper', 'declaration', { declKind: 'definition', partOf: T });
    const V = record('vocab:Spyro.Shadow', 'vocabulary-term');
    const P = record(PREMISE_KEY, 'add-premise', { partOf: T, status: 'accepted', accepted: { how: 'own', fingerprint: 'fp', belief: true, changesProved: false, at: AT, holdAs: 'axiom' }, content: { decls: [], premise: draftOf() } });
    // No draft is expected for content a decision or a take-out removed, nor for a withdrawn item (§3.5).
    const out = [
      record('vocab:Spyro.Rejected', 'vocabulary-term', { status: 'declined', decline: { option: 'reject', at: AT } }),
      record('vocab:Spyro.TakenOut', 'vocabulary-term', { status: 'to-be-redone', redo: { because: [], reverted: true } }),
      record('vocab:Spyro.Withdrawn', 'vocabulary-term', { status: 'withdrawn' }),
    ];
    // A hidden part with no draft disappeared too, but is named only once the results are shown.
    const A = record(`arrow:new-spyro-pg>${T}`, 'add-arrow', { partOf: T });
    const input = synth({ items: [F, R, D, V, P, A, ...out] });
    const judgement = input.judgement as StateJudgement;
    const unowned = REVIEW_TEXTS.unowned('Spyro.stray');
    const facts = REVIEW_TEXTS.factsProbeFailed('telelean could not read the statements: the probe failed.');
    const withProblems = (over: Partial<SessionViewInput>, shown: boolean): SessionViewInput => ({
      ...input,
      judgement: {
        ...judgement,
        // Every record has its draft but V's, which disappeared.
        drafts: [F, R, D, P].map((r) => ({ key: r.key, kind: r.kind, origin: r.origin, provides: { decls: [], arrows: [], cards: [] }, mentions: [], contentKey: r.fingerprint, content: r.content })),
        problems: [
          { code: 'unowned', text: unowned, declaration: 'Spyro.stray' },
          { code: 'facts', text: facts, keys: [F.key, D.key] },
          { code: 'facts', text: REVIEW_TEXTS.factsMissing, keys: [D.key] },
          { code: 'no-longer-builds', text: 'Model/Spyro/Main.lean:12:3: error: unknown identifier in Helper', keys: [D.key], declaration: 'Spyro.Helper' },
        ],
      },
      problems: [{ text: REVIEW_TEXTS.premiseWriteFailed('Cynder is evil', 'the probe failed'), items: [P.id] }],
      records: { ...input.records, ...(shown ? { forced: SHOW } : {}) },
      ...over,
    });
    const hidden = buildSessionView(withProblems({}, false));
    expect(hidden.results.shown).toBe(false);
    expect(hidden.problems).toEqual([
      { text: unowned, items: [] },
      { text: facts, items: [F.id] },
      { text: REVIEW_TEXTS.disappeared('Vocabulary term Spyro.Shadow'), items: [V.id] },
    ]);
    expect(json(hidden)).not.toMatch(/Helper|could not write/);
    const shown = buildSessionView(withProblems({}, true));
    expect(shown.problems).toEqual([
      { text: unowned, items: [] },
      { text: facts, items: [F.id, D.id] },
      { text: REVIEW_TEXTS.factsMissing, items: [D.id] },
      { text: REVIEW_TEXTS.disappeared('Vocabulary term Spyro.Shadow'), items: [V.id] },
      { text: REVIEW_TEXTS.disappeared('Add arrow “The new Spyro game is PG” → “Cynder would not be a good addition to the new Spyro game”'), items: [A.id] },
      { text: REVIEW_TEXTS.premiseWriteFailed('Cynder is evil', 'the probe failed'), items: [P.id] },
    ]);
    // While judging, the records may be ahead of the judgement (an un-reject's merge): no item is said to have
    // disappeared then.
    expect(buildSessionView(withProblems({ judging: true }, true)).problems.map((p) => p.text)).not.toContain(REVIEW_TEXTS.disappeared('Vocabulary term Spyro.Shadow'));
    // The view's rule is reconcile's (§3.5 step 2): it reports the same items (reconcile names them by their fallbacks).
    const reconciled = reconcile({ runId: RUN, records: input.records, judgement: (withProblems({}, true).judgement as StateJudgement), at: AT });
    expect(reconciled.problems).toEqual([REVIEW_TEXTS.disappeared('Vocabulary term Spyro.Shadow'), REVIEW_TEXTS.disappeared('Add arrow “new-spyro-pg” → “cynder-not-good”')]);
    expect(buildSessionView(synth({ items: [F, R] })).problems).toEqual([]);
  });
});

describe('builder 2b3a: the carry-overs of the 2c2 review (R1-1, R1-2, R1-4)', () => {
  const NSP = 'new-spyro-pg';
  const T_SENTENCE = 'Cynder would not be a good addition to the new Spyro game';
  const decision = (id: number, over: Partial<Extract<SessionAction, { kind: 'decide' }>> = {}): SessionAction => ({
    id,
    kind: 'decide',
    label: `Decision ${id}`,
    request: { decisions: [], own: true },
    changes: [],
    takenOut: [],
    rejectedArrows: { added: [], removed: [] },
    questions: [],
    commits: [],
    at: AT,
    ...over,
  });
  const sealAction = (id: number): SessionAction => ({ id, kind: 'seal', by: 'formalize', at: AT });

  it('R1-1: a source declined out of a question, un-rejected, accepted and asked again by a later re-ask: the re-ask’s question shown whole while hidden; once shown, the “not proved” note only when it was not proved, and the earlier step’s words', () => {
    const narrow = Q_TWO.question;
    const whole = INFERENCE.question;
    // s1 asked T from two arrows. A mid-stage Formalize (the first seal) re-asked it with Claude's accepted arrow from
    // new-spyro-pg, and s2 proved it, so T's question became `whole`. The user declined that arrow (DO-0: new-spyro-pg left
    // the question, D2-59), un-rejected it and accepted it again; a second mid-stage Formalize (the second seal) re-asked
    // T with `whole` once more: s3, proved, or not (it gave up, and T's question and Result from s2 stand, D2-46).
    const done = [
      sealAction(3),
      decision(4, { rejectedArrows: { added: [{ source: NSP, target: T }], removed: [] }, questions: [{ target: T, before: whole, after: narrow }], commits: ['c4'] }),
      decision(5, { rejectedArrows: { added: [], removed: [{ source: NSP, target: T }] }, commits: ['c5'] }),
      decision(6),
      sealAction(7),
    ];
    const words = { s1: { summary: 'from two arrows' }, s2: { summary: 'the first re-ask', gap: 'none' }, s3: { summary: 'the second re-ask', gap: 'ran out' } };
    const twin = (proved: boolean, shown: boolean): SessionViewInput =>
      synth({
        items: [formalize(), result()],
        words,
        ...(proved ? { verdict: { verdict: 'proved' } } : {}),
        records: {
          inferences: [{ ...INFERENCE, question: proved ? whole : narrow, steps: ['s1', 's2', 's3'] }],
          steps: [stepOf('s1', T, { question: narrow, queue: 1 }), stepOf('s2', T, { stage: 1, question: whole, queue: 2 }), stepOf('s3', T, { stage: 1, question: whole, queue: 3, state: proved ? 'passed' : 'gave-up' })],
          stack: { done, undone: [] },
          nextAction: 8,
          ...(shown ? { forced: SHOW } : {}),
        },
      });
    // Hidden: byte-identical, each showing the question s3 asked, new-spyro-pg included (it was declined before s3's
    // queue started, so the decline takes nothing out of s3's question).
    const a = buildSessionView(twin(true, false));
    expect(a.results.shown).toBe(false);
    expect(json(a)).toBe(json(buildSessionView(twin(false, false))));
    expect(a.inferences[0]?.question.map((c) => c.id)).toEqual(whole.sources);
    expect((byLabel(a, 'Result').detail as { question: Array<{ id: string }> }).question.map((c) => c.id)).toEqual(whole.sources);
    // Shown, not proved: s3's question differs from the one on record (s2's, less the decline), so the re-ask note, and
    // the decline's note (new-spyro-pg is still out of the question on record); s2's version stands, with its words and
    // no chip (s3's "did not finish" is not the standing step's).
    const open = buildSessionView(twin(false, true));
    expect(open.report.notes).toEqual([REVIEW_TEXTS.reaskNotProved(T_SENTENCE), REVIEW_TEXTS.leftQuestion('The new Spyro game is PG', T_SENTENCE)]);
    expect(open.inferences[0]?.question.map((c) => c.id)).toEqual(narrow.sources);
    const openDetail = byLabel(open, 'Result').detail;
    expect(openDetail).toMatchObject({ summary: 'the first re-ask', gap: 'none' });
    expect(openDetail).not.toHaveProperty('reasonChip');
    // Shown, proved: no note at all (new-spyro-pg is back in the question on record), s3's words.
    const proved = buildSessionView(twin(true, true));
    expect(proved.report.notes).toEqual([]);
    expect(proved.inferences[0]?.question.map((c) => c.id)).toEqual(whole.sources);
    expect(byLabel(proved, 'Result').detail).toMatchObject({ verdict: 'proved', summary: 'the second re-ask' });
    // A decline made after a step's queue started still counts against that step: with the decline after the second
    // seal, s3's question loses new-spyro-pg again, and the note stays while it is out of the record's question.
    const late = buildSessionView(synth({ items: [formalize(), result()], records: { ...twin(false, false).records, stack: { done: [sealAction(3), sealAction(7), done[1] as SessionAction], undone: [] } } }));
    expect(late.inferences[0]?.question.map((c) => c.id)).toEqual(narrow.sources);
    // Empty and single: no decline (the question asked, whole), and one decline with no seal (queue 1 only).
    const none = buildSessionView(synth({ items: [formalize(), result()], records: { ...twin(false, false).records, stack: { done: [], undone: [] } } }));
    expect(none.inferences[0]?.question.map((c) => c.id)).toEqual(whole.sources);
    const first = buildSessionView(
      synth({ items: [formalize(), result()], records: { inferences: [{ ...INFERENCE, question: narrow }], steps: [stepOf('s1', T, { queue: 1 })], stack: { done: [done[1] as SessionAction], undone: [] } } }),
    );
    expect(first.inferences[0]?.question.map((c) => c.id)).toEqual(narrow.sources);
  });

  it('R1-1: a source that left a question is noted once, however many declines took it out', () => {
    const narrow = Q_TWO.question;
    const out = decision(4, { questions: [{ target: T, before: INFERENCE.question, after: narrow }], commits: ['c4'] });
    const view = buildSessionView(
      synth({ items: [formalize(), result()], records: { inferences: [{ ...INFERENCE, question: narrow }], stack: { done: [out, sealAction(5), { ...out, id: 6 }], undone: [] }, forced: SHOW } }),
    );
    expect(view.report.notes).toEqual([REVIEW_TEXTS.leftQuestion('The new Spyro game is PG', T_SENTENCE)]);
  });

  it('R1-2: while a step runs, an arrow item’s reason is the ledger’s when the queue started, never one a step of the running queue wrote (D2-10, D2-63)', () => {
    // Claude's arrow new-spyro-pg → T from s1, taken out to be redone (so not declined); the running queue's re-ask s2
    // proposed it again with another reason, an entry that stays only if s2 passed; s3 runs.
    const A = record(`arrow:${NSP}>${T}`, 'add-arrow', { partOf: T, status: 'to-be-redone', redo: { because: [], reverted: true } });
    const first: LedgerEntry = { kind: 'arrow', source: NSP, target: T, step: 's1', why: 'the first step’s reason', written: 'c2' };
    const again: LedgerEntry = { kind: 'arrow', source: NSP, target: T, step: 's2', why: 'the re-ask’s reason', written: 'c6' };
    const U: SessionInference = { target: 'cynder-dark-past', question: { sources: [], fromNothing: true }, order: 1, steps: ['s3'] };
    const twin = (passed: boolean, phase: SessionRecords['phase'] = 'step', ledger?: LedgerEntry[]): SessionViewInput =>
      synth({
        items: [formalize(), result(), A],
        records: {
          phase,
          forced: SHOW,
          inferences: [{ ...INFERENCE, steps: ['s1', 's2'] }, U],
          steps: [
            stepOf('s1', T, { queue: 1 }),
            stepOf('s2', T, { stage: 1, queue: 2, state: passed ? 'passed' : 'gave-up' }),
            stepOf('s3', U.target, { stage: 1, state: phase === 'stage' ? 'passed' : 'running', question: U.question, queue: 2 }),
          ],
          ledger: ledger ?? (passed ? [first, again] : [first]),
        },
      });
    const whyIn = (view: SessionView) => view.items.find((i) => i.id === A.id)?.detail;
    for (const phase of ['step', 'interrupted'] as const) {
      const a = buildSessionView(twin(true, phase));
      expect(a.results.shown).toBe(true);
      expect(json(a)).toBe(json(buildSessionView(twin(false, phase))));
      expect(whyIn(a)).toMatchObject({ kind: 'add-arrow', why: 'the first step’s reason' });
    }
    // Once the queue ended, the newest entry.
    expect(whyIn(buildSessionView(twin(true, 'stage')))).toMatchObject({ why: 'the re-ask’s reason' });
    // An entry naming no recorded step counts as the running queue's (fail closed: withheld while a step runs).
    const stray = { ...first, step: 'gone' };
    expect(whyIn(buildSessionView(twin(false, 'step', [stray])))).not.toHaveProperty('why');
    expect(whyIn(buildSessionView(twin(false, 'stage', [stray])))).toMatchObject({ why: 'the first step’s reason' });
    // A completion entry names no step and is never written or dropped during a queue (D2-62): it stays while a step runs.
    const completion: LedgerEntry = { kind: 'completion', target: T, item: PREMISE_KEY, commit: 'c3' };
    for (const phase of ['step', 'stage'] as const) {
      expect(buildSessionView(twin(false, phase, [first, completion])).items.find((i) => i.kind === 'result')?.detail, phase).toMatchObject({ completion: 'checked' });
    }
  });

  it('R1-4: steps with no queue number all count as in the running queue (fail closed): a re-ask proved or not shows the question it asked while a step runs', () => {
    // As A-V2C2-ADV-1's twin, but 2d gave no step its queue number: D2-46 puts the proved re-ask's question on the record.
    const s1 = openStage();
    const asked = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const U: SessionInference = { target: 'cynder-dark-past', question: { sources: [], fromNothing: true }, order: 1, steps: ['s3'] };
    const steps = [stepOf('s1', T), stepOf('s2', T, { stage: 1, question: asked }), stepOf('s3', U.target, { stage: 1, state: 'running', question: U.question })];
    const twin = (proved: boolean): SessionViewInput => ({
      ...s1,
      records: { ...s1.records, phase: 'step', forced: SHOW, steps, inferences: [{ ...INFERENCE, steps: ['s1', 's2'], question: proved ? asked : INFERENCE.question }, U] },
    });
    const a = buildSessionView(twin(true));
    expect(a.results.shown).toBe(true);
    expect(json(a)).toBe(json(buildSessionView(twin(false))));
    expect(a.inferences[0]?.question.map((c) => c.id)).toEqual(asked.sources);
    expect((byLabel(a, 'Result').detail as { question: Array<{ id: string }> }).question.map((c) => c.id)).toEqual(asked.sources);
  });
});

// =============================================================================================
// Non-interference (§4.7, §6.1): fixed pairs that differ only in Results' outcomes

/** The walkthrough's B with the target questioned from two of its arrows only (new-spyro-pg drawn by Claude). */
const TWO_ARROWS = 'premises: cynder-dark-past, pg-no-dark-past\n';
const B_TWO = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', TWO_ARROWS);
const Q_TWO: SessionInference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };

describe('non-interference: byte-identical views while the results are hidden', () => {
  const same = (a: SessionViewInput, b: SessionViewInput) => {
    const va = buildSessionView(a);
    const vb = buildSessionView(b);
    expect(va.results.shown).toBe(false);
    expect(vb.results.shown).toBe(false);
    expect(json(va)).toBe(json(vb));
    return va;
  };

  it('a proof or none', () => {
    const view = same(provedStage(), openStage());
    expect(view.items.map((i) => i.label)).toEqual(['Formalize', 'Result']);
  });

  it('a premise draft reaching a proof-phase definition (not proved), or a proof', () => {
    const DEF = '/-- a helper -/\ndef dark_helper : Prop := HasDarkPast cynder';
    const withDef = append(STATEMENTS, MAIN, DEF);
    const draft = draftOf({ leanName: 'helper_premise', naturalName: 'The helper holds', leanStatement: 'dark_helper', consts: ['Spyro.dark_helper'] });
    const ledger = [...STATEMENT_LEDGER, created('Spyro.dark_helper', 'proof', 's1', premiseKey(T, 'helper_premise'))];
    const open = openStage({ current: withDef, ledger, premises: [draft] });
    expect(open.records.items.map((r) => [r.key, r.partOf ?? null])).toEqual(
      expect.arrayContaining([
        ['decl:Spyro.dark_helper', T],
        [premiseKey(T, 'helper_premise'), T],
      ]),
    );
    const view = same(provedStage(), open);
    expect(json(view)).not.toMatch(/helper/);
  });

  it('Claude’s arrow the proof uses, or none', () => {
    const proved = edit(edit(pinned(normative(B_TWO)), MAIN, TWO_ARROWS, 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg\n'), MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);
    const arrow: LedgerEntry = { kind: 'arrow', source: 'new-spyro-pg', target: T, step: 's1', why: 'the proof needs the game to be PG', written: 'c2' };
    const a = firstStage({ base: B_TWO, current: proved, inferences: [Q_TWO], steps: [stepOf('s1', T, { question: Q_TWO.question })], ledger: [...PROOF_LEDGER, arrow], words: WORDS });
    const b = firstStage({ base: B_TWO, current: pinned(normative(B_TWO)), inferences: [Q_TWO], steps: [stepOf('s1', T, { question: Q_TWO.question })], ledger: STATEMENT_LEDGER });
    expect(a.records.items.some((r) => r.kind === 'add-arrow' && r.partOf === T)).toBe(true);
    const view = same(a, b);
    expect(view.board.graph.nodes.find((n) => n.id === T)?.premises).toEqual(['cynder-dark-past', 'pg-no-dark-past']);
    expect(json(view)).not.toMatch(/needs the game/);
  });

  it('a lemma placed before the other cards, with a linter warning in it', () => {
    const lemma = '/-- a lemma -/\ntheorem dark_lemma : HasDarkPast cynder := cynder_dark_past.holds\n\n';
    const viaLemma = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds dark_lemma\n';
    const current = edit(edit(STATEMENTS, MAIN, 'namespace Spyro\n\n', `namespace Spyro\n\n${lemma}`), MAIN, TARGET_LINE, `${TARGET_LINE}${viaLemma}`);
    const line = (current[MAIN] as string).split('\n').findIndex((l) => l.startsWith('theorem dark_lemma'));
    const warning: LeanMessageFact = { severity: 'warning', file: MAIN, module: 'Model.Spyro.Main', range: { start: { line, character: 8 }, end: { line, character: 18 } }, text: 'unused variable in dark_lemma [linter.unusedVariables]' };
    const a = provedStage({ current, ledger: [...PROOF_LEDGER, created('Spyro.dark_lemma', 'proof')], facts: { messages: [warning] } });
    const view = same(a, openStage());
    expect(json(view)).not.toMatch(/dark_lemma|linter/);
  });

  it('a re-ask proved or not, after the user showed the results with the Formalize still in review: both hidden at the queue’s end (the builder’s F1; fixer 2c2 r1, C-V2C2-C1, S-TEST-REASK-PAIR)', () => {
    // Built as 2d builds it: stage 1 judged and reconciled; Show results (the user's force) and the mid-stage
    // Formalize's seal through reduceReview; each twin's own working copy judged (its record's question: the new one when
    // the re-ask proved T, the old one when not, D2-46) and reconciled at the queue's end (`queueSteps`).
    const narrow = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const first = firstStage({ current: STATEMENTS, ledger: STATEMENT_LEDGER, inferences: [{ ...INFERENCE, question: narrow }], steps: [stepOf('s1', T, { question: narrow, queue: 1 })] });
    const firstView = buildSessionView(first);
    expect(firstView.results.shown).toBe(false);
    const shownOut = reduceReview(reviewStateOf(first.records, first.judgement, sessionLabels(firstView)), { kind: 'reveal', via: 'show-result' }, AT);
    if (!shownOut.ok) throw new Error('Show results refused');
    const forcedRecords: SessionRecords = { ...first.records, items: shownOut.items, stack: { done: [...shownOut.stack.done], undone: [...shownOut.stack.undone] }, nextAction: shownOut.nextAction, ...(shownOut.forced !== null ? { forced: shownOut.forced } : {}) };
    expect(buildSessionView({ ...first, records: forcedRecords }).results).toMatchObject({ shown: true, forced: true });
    const sealOut = reduceReview(reviewStateOf(forcedRecords, first.judgement), { kind: 'seal', by: 'formalize' }, AT);
    if (!sealOut.ok) throw new Error('seal refused');
    const sealed: SessionRecords = { ...forcedRecords, stack: { done: [...sealOut.stack.done], undone: [...sealOut.stack.undone] }, nextAction: sealOut.nextAction };
    const steps = [stepOf('s1', T, { question: narrow, queue: 1 }), stepOf('s2', T, { stage: 1, question: INFERENCE.question, queue: 2 })];
    // `helper`: the re-ask also wrote a definition before fixing its statements, statement content that stays whatever
    // the outcome (§3.2), listed in both.
    const HELPER = '/-- a helper of the re-ask -/\ndef reask_helper : Prop := True';
    const twin = (proved: boolean, helper = false): SessionViewInput => {
      const inferences = [{ ...INFERENCE, question: proved ? INFERENCE.question : narrow, steps: ['s1', 's2'] }];
      const statements = [...STATEMENT_LEDGER, ...(helper ? [created('Spyro.reask_helper', 'statements', 's2')] : [])];
      const ledger = proved ? [...statements, created('Spyro.cynder_not_good.holds', 'proof', 's2')] : statements;
      const texts = proved ? PROVED : STATEMENTS;
      const current = model(helper ? append(texts, MAIN, HELPER) : texts);
      const judgement = judgeState({ purpose: 'stage', stage: 'prove', commit: 'c-2', filesKey: 'files-2', base: model(BASE), current, inferences, ledger, items: sealed.items, premises: [], ended: [T], rejectedArrows: [] });
      const out = reconcile({ runId: RUN, records: { ...sealed, phase: 'step', inferences, steps, ledger }, judgement, queueSteps: ['s2'], at: AT });
      const records: SessionRecords = { ...out.records, phase: 'stage', events: out.events.map((e, k) => ({ id: k + 1, at: AT, ...e })) };
      return { ...first, current, judgement, records };
    };
    const a = twin(true);
    const b = twin(false);
    // The two outcomes differ on the record: a new Result version, or the old one standing.
    expect(a.records.items.find((r) => r.kind === 'result')).toMatchObject({ rev: 2, markers: expect.arrayContaining(['updated']) });
    expect(b.records.items.find((r) => r.kind === 'result')).toMatchObject({ rev: 1 });
    expect([a.records.forced, b.records.forced]).toEqual([undefined, undefined]);
    const view = same(a, b);
    expect(view.results).toEqual({ shown: false, forced: false, waitingFor: [byLabel(view, 'Formalize').id] });
    expect(view.inferences[0]?.question.map((c) => c.id)).toEqual(INFERENCE.question.sources);
    expect(byLabel(view, 'Result')).toMatchObject({ rev: 0, status: null, markers: ['seen-early'] });
    expect(view.sealed).toEqual({ by: 'formalize', at: AT });
    // With the re-ask's own statement content: the same, that definition listed in both.
    const withHelper = same(twin(true, true), twin(false, true));
    expect(withHelper.items.map((i) => i.label)).toEqual(['Formalize', 'Definition', 'Result']);
    expect(byLabel(withHelper, 'Definition').detail).toMatchObject({ kind: 'declaration', name: 'Spyro.reask_helper' });
  });

  it('a re-ask proved or not, the record-level rule: the question asked and a neutral Result whatever the record holds (hand-made records of the two outcomes)', () => {
    const asked = { sources: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], fromNothing: false };
    const old = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const base = provedStage();
    const steps = [stepOf('s1', T, { question: old }), stepOf('s2', T, { stage: 1, question: asked, queue: 2 })];
    const twin = (proved: boolean): SessionViewInput => {
      const items = base.records.items.map((r) => {
        if (r.kind !== 'result') return r;
        return proved
          ? { ...r, rev: 2, markers: ['updated' as const], fingerprint: 'fp-new', versions: [{ rev: 1, stage: 1, fingerprint: r.fingerprint, content: r.content }], judged: { verdict: 'established' as const, restsOn: [], deps: [] } }
          : { ...r, status: 'accepted' as const, accepted: { how: 'own' as const, fingerprint: r.fingerprint, belief: false, changesProved: false, at: AT, result: { verdict: 'not-proved' as const, restsOn: [] } } };
      });
      const inferences = [{ ...INFERENCE, question: proved ? asked : old, steps: ['s1', 's2'] }];
      return { ...base, current: model(proved ? PROVED : STATEMENTS), records: { ...base.records, stage: 2, items, inferences, steps } };
    };
    const view = same(twin(true), twin(false));
    expect(view.inferences[0]?.question.map((c) => c.id)).toEqual(asked.sources);
    expect(view.items.find((i) => i.kind === 'result')).toMatchObject({ rev: 0, status: null });
  });

  /** A chain X → L → T after B: L formalised and unproved in B, T a code-less proposition its step formalises. */
  const chainCard = (id: string, sentence: string, premise: string, lean: boolean) =>
    `/-\n@@ telelean v1\nid: ${id}\ntype: PROPOSITION\nnatural_name: ${sentence}\npremises: ${premise}\nasserted: 2026-11-01\n${lean ? `lean: Spyro.${id.replace(/-/g, '_')}\n` : ''}-/\n${lean ? `/-- ${sentence} -/\nabbrev ${id.replace(/-/g, '_')} : Prop := HasDarkPast cynder\n` : ''}`;
  const CHAIN_B = append(BASE, MAIN, `${chainCard('l-card', 'Cynder had a dark past once', 'cynder-dark-past', true)}\n${chainCard('t-card', 'Cynder had a dark past twice', 'l-card', false)}`);
  /** T's statement formalised by its step (both outcomes). */
  const CHAIN_STATED = edit(CHAIN_B, MAIN, 'asserted: 2026-11-01\n-/\n\nend Spyro', 'asserted: 2026-11-01\nlean: Spyro.t_card\n-/\n/-- Cynder had a dark past twice -/\nabbrev t_card : Prop := HasDarkPast cynder\n\nend Spyro');
  const L: SessionInference = { target: 'l-card', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] };
  const TT: SessionInference = { target: 't-card', question: { sources: ['l-card'], fromNothing: false }, order: 1, steps: ['s2'] };
  const T_STATED = [created('Spyro.t_card', 'statements', 's2')];

  it('a chain X → L → T, L proved or not (T’s step statements only)', () => {
    const provedTexts = append(CHAIN_STATED, MAIN, 'theorem l_card.holds : l_card := cynder_dark_past.holds\ntheorem t_card.holds : t_card := l_card.holds');
    const a = firstStage({
      base: CHAIN_B,
      current: provedTexts,
      inferences: [L, TT],
      steps: [stepOf('s1', 'l-card', { question: L.question }), stepOf('s2', 't-card', { question: TT.question })],
      ledger: [...T_STATED, created('Spyro.l_card.holds', 'proof', 's1'), created('Spyro.t_card.holds', 'proof', 's2')],
      words: { s1: { summary: 'L from X' }, s2: { summary: 'T from L' } },
    });
    const b = firstStage({
      base: CHAIN_B,
      current: CHAIN_STATED,
      inferences: [L, TT],
      steps: [stepOf('s1', 'l-card', { question: L.question }), stepOf('s2', 't-card', { question: TT.question, statementsOnly: 'l-card' })],
      ledger: T_STATED,
      words: { s1: { gap: 'X is not enough' }, s2: { gap: 'l-card was not proved' } },
    });
    const view = same(a, b);
    expect(view.items.map((i) => [i.label, i.group.kind === 'card' ? i.group.card.id : '']).sort()).toEqual([
      ['Formalize', 't-card'],
      ['Result', 'l-card'],
      ['Result', 't-card'],
    ]);
    // Once shown, the statements-only step's Result reads "“L” was not proved" (§3.4), and so does its step's outcome.
    const shownB = buildSessionView({ ...b, records: { ...b.records, forced: SHOW } });
    expect(shownB.report.targets.find((t) => t.target === 't-card')?.reasonChip).toBe(REVIEW_TEXTS.sourceNotProved('Cynder had a dark past once'));
    expect(shownB.steps.find((s) => s.id === 's2')?.outcome).toBe(REVIEW_TEXTS.stepStatementsOnlyOutcome('Cynder had a dark past once'));
    const shownA = buildSessionView({ ...a, records: { ...a.records, forced: SHOW } });
    expect(shownA.report.targets.map((t) => [t.target, t.verdict])).toEqual([
      ['l-card', 'established'],
      ['t-card', 'established'],
    ]);
  });

  it('a Retry queue run while the results are hidden, after an earlier step proved its target or not, with an arrow item and a premise draft when it did: the same item ids (AF7)', () => {
    const LL: SessionInference = { ...L, steps: ['s1'] };
    const T2: SessionInference = { ...TT, steps: ['s2', 's3'] };
    const steps = (statementsOnly: boolean) => [
      stepOf('s1', 'l-card', { question: L.question, queue: 1 }),
      stepOf('s2', 't-card', { question: TT.question, state: 'cancelled', queue: 1 }),
      stepOf('s3', 't-card', { question: TT.question, retryOf: 's2', queue: 2, ...(statementsOnly ? { statementsOnly: 'l-card' } : {}) }),
    ];
    // Step 1 proved L through Claude's arrow from new-spyro-pg, and proposed a premise too; or it proved nothing.
    const provedTexts = append(
      edit(CHAIN_STATED, MAIN, 'premises: cynder-dark-past\nasserted: 2026-11-01\nlean: Spyro.l_card', 'premises: cynder-dark-past, new-spyro-pg\nasserted: 2026-11-01\nlean: Spyro.l_card'),
      MAIN,
      'theorem l_card.holds : l_card := cynder_dark_past.holds',
    );
    const arrow: LedgerEntry = { kind: 'arrow', source: 'new-spyro-pg', target: 'l-card', step: 's1', why: 'needed', written: 'c2' };
    const draft = draftOf({ target: 'l-card', leanName: 'spare_premise', naturalName: 'A spare premise' });
    const s3 = (ledger: LedgerEntry[]) => ledger.map((e) => (e.kind === 'created' ? { ...e, step: 's3' } : e));
    const a = firstStage({ base: CHAIN_B, current: provedTexts, inferences: [LL, T2], steps: steps(false), ledger: [...s3(T_STATED), created('Spyro.l_card.holds', 'proof', 's1'), arrow], premises: [draft] });
    const b = firstStage({ base: CHAIN_B, current: CHAIN_STATED, inferences: [LL, T2], steps: steps(true), ledger: s3(T_STATED) });
    expect(a.records.items.map((r) => r.kind).sort()).toEqual(['add-arrow', 'add-premise', 'formalize', 'result', 'result']);
    expect(b.records.items.map((r) => r.kind).sort()).toEqual(['formalize', 'result', 'result']);
    const view = same(a, b);
    // The listed ids are the same in both: they hash the run id and the key, never a count (AF7).
    expect(view.items.map((i) => i.id).sort()).toEqual(b.records.items.map((r) => r.id).sort());
    for (const item of view.items) expect(a.records.items.some((r) => r.id === item.id)).toBe(true);
  });

  it('sequences of Accept, Reject, Shaky and Undo on listed items: the same answers and the same views while hidden', () => {
    // Two meaning items, so the results stay hidden through the sequence: pg-no-dark-past's statement uses a
    // statement-phase definition (a belief, b4).
    const DEF = '/-- has a dark character -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
    const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'IsPG g → HasDarkPast c →', 'IsPG g → DarkChar c →');
    const ledger = [...STATEMENT_LEDGER, created('Spyro.DarkChar', 'statements')];
    const twins = [
      provedStage({ current: withDef(PROVED), ledger: [...ledger, created('Spyro.cynder_not_good.holds', 'proof')] }),
      openStage({ current: withDef(STATEMENTS), ledger }),
    ];
    const answer = (o: ReviewOutcome) =>
      o.ok
        ? { ok: true, label: o.label, taken: o.taken, left: o.left, cascade: o.cascade, events: o.events, forced: o.forced }
        : { ...o };
    const views = twins.map((t) => buildSessionView(t));
    expect(json(views[0] as SessionView)).toBe(json(views[1] as SessionView));
    const F = byLabel(views[0] as SessionView, 'Formalize');
    const D = byLabel(views[0] as SessionView, 'Definition');
    const decision = (item: ItemView, to: ItemDecision['to'], option?: ItemDecision['option']): ItemDecision => ({ item: item.id, rev: item.rev, to, ...(option !== undefined ? { option } : {}) });
    const actions: Array<ReviewAction | 'undo'> = [
      { kind: 'decide', decisions: [decision(F, 'accepted')], own: true, confirmed: false },
      { kind: 'decide', decisions: [decision(D, 'accepted')], own: true, confirmed: false },
      'undo',
      { kind: 'decide', decisions: [decision(D, 'declined', 'shaky')], own: true, confirmed: false },
      'undo',
      { kind: 'decide', decisions: [decision(D, 'accepted'), decision(F, 'accepted')], own: false, confirmed: false },
      { kind: 'decide', decisions: [decision(D, 'declined', 'reject')], own: true, confirmed: false },
    ];
    let inputs = twins;
    for (const action of actions) {
      const outcomes = inputs.map((input) => {
        const view = buildSessionView(input);
        const state = reviewStateOf(input.records, input.judgement, sessionLabels(view));
        const top = input.records.stack.done[input.records.stack.done.length - 1];
        const act: ReviewAction = action === 'undo' ? { kind: 'undo', step: top?.id ?? 0, confirmed: true } : action;
        return reduceReview(state, act, AT);
      });
      expect(answer(outcomes[0] as ReviewOutcome)).toEqual(answer(outcomes[1] as ReviewOutcome));
      inputs = inputs.map((input, k) => {
        const o = outcomes[k] as ReviewOutcome;
        if (!o.ok) return input;
        const records: SessionRecords = { ...input.records, items: o.items, inferences: o.inferences, rejectedArrows: o.rejectedArrows, stack: { done: [...o.stack.done], undone: [...o.stack.undone] }, nextAction: o.nextAction };
        if (o.forced !== null) records.forced = o.forced;
        else delete records.forced;
        return { ...input, records };
      });
      const next = inputs.map((t) => buildSessionView(t));
      if (!(next[0] as SessionView).results.shown || !(next[1] as SessionView).results.shown) expect(json(next[0] as SessionView)).toBe(json(next[1] as SessionView));
    }
    // The last Reject took the statement out with D (to be redone, reverted): no meaning item waits, so both show.
    const last = inputs.map((t) => buildSessionView(t));
    expect(last.map((v) => v.results.shown)).toEqual([true, true]);
  });

  it('seeded random sequences on listed items, three pairs (own and group Accept, Reject, Shaky with a note, back to review and un-reject, Undo and Redo, with and without `confirmed`): the same answers, and the same views while either is hidden (A-V2C2-ADV-7)', () => {
    const DEF = '/-- has a dark character -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
    const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'IsPG g → HasDarkPast c →', 'IsPG g → DarkChar c →');
    const defLedger = [...STATEMENT_LEDGER, created('Spyro.DarkChar', 'statements')];
    const arrow: LedgerEntry = { kind: 'arrow', source: 'new-spyro-pg', target: T, step: 's1', why: 'the proof needs the game to be PG', written: 'c2' };
    const arrowProved = edit(edit(pinned(normative(B_TWO)), MAIN, TWO_ARROWS, 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg\n'), MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);
    const arrowSteps = [stepOf('s1', T, { question: Q_TWO.question })];
    const LL: SessionInference = { ...L, steps: ['s1'] };
    const T2: SessionInference = { ...TT, steps: ['s2', 's3'] };
    const retrySteps = (statementsOnly: boolean) => [
      stepOf('s1', 'l-card', { question: L.question, queue: 1 }),
      stepOf('s2', 't-card', { question: TT.question, state: 'cancelled', queue: 1 }),
      stepOf('s3', 't-card', { question: TT.question, retryOf: 's2', queue: 2, ...(statementsOnly ? { statementsOnly: 'l-card' } : {}) }),
    ];
    const s3 = (ledger: LedgerEntry[]) => ledger.map((e) => (e.kind === 'created' ? { ...e, step: 's3' } : e));
    const lProved = append(CHAIN_STATED, MAIN, 'theorem l_card.holds : l_card := cynder_dark_past.holds');
    const pairs: Array<[string, SessionViewInput, SessionViewInput]> = [
      ['a proof or none, with a statement-phase definition', provedStage({ current: withDef(PROVED), ledger: [...defLedger, created('Spyro.cynder_not_good.holds', 'proof')] }), openStage({ current: withDef(STATEMENTS), ledger: defLedger })],
      [
        'Claude’s arrow, with a statement-phase definition',
        firstStage({ base: B_TWO, current: withDef(arrowProved), inferences: [Q_TWO], steps: arrowSteps, ledger: [...defLedger, created('Spyro.cynder_not_good.holds', 'proof'), arrow], words: WORDS }),
        firstStage({ base: B_TWO, current: withDef(pinned(normative(B_TWO))), inferences: [Q_TWO], steps: arrowSteps, ledger: defLedger }),
      ],
      [
        'a Retry queue',
        firstStage({ base: CHAIN_B, current: lProved, inferences: [LL, T2], steps: retrySteps(false), ledger: [...s3(T_STATED), created('Spyro.l_card.holds', 'proof', 's1')] }),
        firstStage({ base: CHAIN_B, current: CHAIN_STATED, inferences: [LL, T2], steps: retrySteps(true), ledger: s3(T_STATED) }),
      ],
    ];
    /** mulberry32: a small seeded generator, so every sequence can be replayed from its seed. */
    const generator = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const answer = (o: ReviewOutcome) => (o.ok ? { ok: true, label: o.label, taken: o.taken, left: o.left, cascade: o.cascade, events: o.events, forced: o.forced } : { ...o });
    const nextInput = (input: SessionViewInput, o: ReviewOutcome): SessionViewInput => {
      if (!o.ok) return input;
      const records: SessionRecords = { ...input.records, items: o.items, inferences: o.inferences, rejectedArrows: o.rejectedArrows, stack: { done: [...o.stack.done], undone: [...o.stack.undone] }, nextAction: o.nextAction };
      if (o.forced !== null) records.forced = o.forced;
      else delete records.forced;
      return { ...input, records };
    };
    const randomAction = (rand: () => number, view: SessionView, records: SessionRecords): ReviewAction | undefined => {
      const listed = view.items.filter((i) => i.status !== null);
      const one = () => listed[Math.floor(rand() * listed.length)] as ItemView;
      const confirmed = rand() < 0.5;
      const decision = (i: ItemView, to: ItemDecision['to'], extra: Partial<ItemDecision> = {}): ItemDecision => ({ item: i.id, rev: i.rev, to, ...extra });
      const kinds = ['accept', 'group', 'reject', 'shaky', 'review', 'undo', 'redo'] as const;
      const kind = listed.length === 0 ? 'undo' : kinds[Math.floor(rand() * kinds.length)];
      switch (kind) {
        case 'undo':
          return { kind: 'undo', step: records.stack.done[records.stack.done.length - 1]?.id ?? 0, confirmed };
        case 'redo':
          return { kind: 'redo', step: records.stack.undone[records.stack.undone.length - 1]?.id ?? 0, confirmed };
        case 'group': {
          const chosen = listed.filter(() => rand() < 0.6);
          return { kind: 'decide', decisions: (chosen.length > 0 ? chosen : [one()]).map((i) => decision(i, 'accepted')), own: false, confirmed };
        }
        case 'accept':
          return { kind: 'decide', decisions: [decision(one(), 'accepted')], own: true, confirmed };
        case 'reject':
          return { kind: 'decide', decisions: [decision(one(), 'declined', { option: 'reject' })], own: true, confirmed };
        case 'shaky':
          return { kind: 'decide', decisions: [decision(one(), 'declined', { option: 'shaky', note: 'try another reading' })], own: true, confirmed };
        case 'review':
          return { kind: 'decide', decisions: [decision(one(), 'in-review')], own: true, confirmed };
      }
    };
    let compared = 0;
    const seen = new Map<string, number>();
    const note = (action: ReviewAction, o: ReviewOutcome) => {
      const what = `${action.kind === 'decide' ? (action.decisions[0]?.option ?? action.decisions[0]?.to) : action.kind}:${o.ok ? (o.taken.length > 0 || o.label !== '' ? 'ok' : 'no-op') : o.code}`;
      seen.set(what, (seen.get(what) ?? 0) + 1);
    };
    for (const [name, a, b] of pairs) {
      expect(buildSessionView(a).results.shown, name).toBe(false);
      for (let seed = 1; seed <= 40; seed++) {
        const rand = generator(seed);
        let inputs: [SessionViewInput, SessionViewInput] = [a, b];
        for (let k = 0; k <= 12; k++) {
          const views = inputs.map((input) => buildSessionView(input)) as [SessionView, SessionView];
          if (views[0].results.shown && views[1].results.shown) break;
          expect(json(views[0]), `${name}, seed ${seed}, after ${k} actions`).toBe(json(views[1]));
          compared += 1;
          if (k === 12) break;
          const action = randomAction(rand, views[0], inputs[0].records);
          if (action === undefined) throw new Error('no action');
          const outcomes = inputs.map((input, i) => reduceReview(reviewStateOf(input.records, input.judgement, sessionLabels(views[i] as SessionView)), action, AT)) as [ReviewOutcome, ReviewOutcome];
          expect(answer(outcomes[1]), `${name}, seed ${seed}, action ${k}: ${JSON.stringify(action)}`).toEqual(answer(outcomes[0]));
          note(action, outcomes[0]);
          inputs = [nextInput(inputs[0], outcomes[0]), nextInput(inputs[1], outcomes[1])];
        }
      }
    }
    expect(compared).toBeGreaterThan(300);
    // The sequences reach every kind of answer: each action carried out, and others refused, stale or asked to confirm.
    for (const what of ['accepted:ok', 'reject:ok', 'shaky:ok', 'in-review:ok', 'undo:ok', 'redo:ok']) expect(seen.get(what) ?? 0, what).toBeGreaterThan(0);
    for (const code of ['needs-confirmation', 'refused', 'conflict']) expect([...seen].some(([what, n]) => what.endsWith(`:${code}`) && n > 0), code).toBe(true);
  });
});
