/**
 * Slice 2g fixtures (docs/slice2-plan.md 2.3, 5): edit sessions as the host posts them (`SessionView`, the shape core
 * `buildSessionView` builds), typed with core's types, on the Spyro board. One inference: “Cynder would not be a good
 * addition…” from two arrows (cynder-dark-past, pg-no-dark-past); Claude formalised pg-no-dark-past with a new
 * predicate `Spyro.InGame` and a definition `Spyro.IsEvil` (a belief), proposed the arrow new-spyro-pg → target and an
 * Add premise “Cynder is evil”.
 *  - `hiddenStage`: stage 1 with the results hidden (the host's masked view: the Result a neutral row, its parts left
 *    out of the list, no verdict, no words). `hiddenPair` gives the two outcomes of that stage (proved, not proved):
 *    the same view, as the host guarantees (2c2's non-interference pairs), with RunViews that differ only in what §4.7
 *    accepts as residual (progress counts, usage, times).
 *  - `shownStage`: the same stage once the results are shown: the Result, its arrow and its premise listed.
 *  - `stepSession`: a Submit queue's step running (read-only, D2-62); `firstQueue`: the session's first queue.
 *  - `confirmingSession`: the end confirmation, its check running, passed or failed.
 */
import {
  DEFAULT_RUN_CAPS,
  ITEM_KIND_LABELS,
  REVIEW_TEXTS,
  spyroGraph,
  type CardRef,
  type DeclineOption,
  type EndConfirmationView,
  type Gate,
  type ItemDetailView,
  type ItemView,
  type LeanStatementView,
  type RunView,
  type SessionView,
  type StepView,
  type TlGraph,
} from '@telelean/core';
import { runView, STARTED } from './runs';

export const SESSION_RUN = 'run_20261121_1';
export const TARGET = 'cynder-not-good';
export const SOURCES = ['cynder-dark-past', 'pg-no-dark-past'];
export const AT = '2026-11-21T10:00:00.000Z';

export const OPEN: Gate = { ok: true };
export const closed = (reason: string, missing?: string[]): Gate => (missing !== undefined ? { ok: false, reason, missing } : { ok: false, reason });

const graph: TlGraph = spyroGraph(11);

/** A card of the Spyro board, as the view names it. */
export function cardRef(id: string, wordedBy: 'user' | 'agent' = 'user'): CardRef {
  const node = graph.nodes.find((n) => n.id === id);
  if (node === undefined) throw new Error(`no card ${id}`);
  return { id, type: node.type, sentence: node.naturalName, wordedBy };
}

/** Item ids, as the host makes them (opaque). */
export const IDS = {
  vocab: 'it00000000000000a1',
  definition: 'it00000000000000a2',
  formalize: 'it00000000000000a3',
  result: 'it00000000000000a4',
  arrow: 'it00000000000000a5',
  premise: 'it00000000000000a6',
} as const;

const statement = (name: string, pretty: string, explicit: string): LeanStatementView => ({
  name,
  pretty,
  explicit,
  closure: [{ name: 'Spyro.InGame', kind: 'predicate', type: 'Character → Game → Prop', gloss: 'is in', glossBy: 'agent' }],
});

const DECLINE_OPTIONS: Record<'arrow' | 'result' | 'other', Array<{ option: DeclineOption; disabled?: string }>> = {
  arrow: [{ option: 'plain' }],
  result: [{ option: 'reject' }, { option: 'shaky' }],
  other: [{ option: 'reject' }, { option: 'shaky' }, { option: 'transform', disabled: REVIEW_TEXTS.transformLater }],
};

/** An ItemView with the host's defaults: in review, plain class, every gate open but back to review (in review already). */
export function itemView(patch: Partial<ItemView> & Pick<ItemView, 'id' | 'kind' | 'detail'>): ItemView {
  const kind = patch.kind;
  const options = kind === 'add-arrow' || kind === 'remove-arrow' ? DECLINE_OPTIONS.arrow : kind === 'result' ? DECLINE_OPTIONS.result : DECLINE_OPTIONS.other;
  const cards = patch.cards ?? [];
  const status = patch.status === undefined ? 'in-review' : patch.status;
  const label = patch.label ?? ITEM_KIND_LABELS[kind];
  const group: ItemView['group'] =
    patch.group ?? (kind === 'vocabulary-term' ? { kind: 'vocabulary' } : kind === 'declaration' ? { kind: 'definitions' } : { kind: 'card', card: cards[0] ?? cardRef(TARGET) });
  return {
    rev: 1,
    label,
    group,
    cards,
    status,
    classes: { belief: false, changesProved: false, reasons: [] },
    markers: [],
    dependsOn: [],
    dependents: [],
    accept: OPEN,
    decline: { ok: true, options },
    review: status === 'in-review' ? closed(REVIEW_TEXTS.inReviewAlready(label)) : OPEN,
    origin: { step: 's1', target: TARGET },
    ...patch,
  };
}

const vocabDetail: ItemDetailView = { kind: 'vocabulary-term', name: 'Spyro.InGame', vocabKind: 'predicate', type: 'Character → Game → Prop', gloss: 'is in', glossBy: 'agent', code: 'axiom InGame : Character → Game → Prop' };
const definitionDetail: ItemDetailView = {
  kind: 'declaration',
  declKind: 'definition',
  name: 'Spyro.IsEvil',
  code: 'def IsEvil (c : Character) : Prop := HasDarkPast c',
  gloss: 'is evil',
  glossBy: 'agent',
  usedByStatementsOf: [cardRef('pg-no-dark-past')],
};
const formalizeDetail: ItemDetailView = {
  kind: 'formalize',
  card: cardRef('pg-no-dark-past'),
  statement: statement(
    'Spyro.pg_no_dark_past',
    '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬InGame c g',
    '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.InGame c g)',
  ),
};
const hiddenResultDetail: ItemDetailView = { kind: 'result', target: cardRef(TARGET), question: SOURCES.map((id) => cardRef(id)), fromNothing: false, revealed: false, seenEarly: false };

/** The items of the stage, in the host's list order (§5.5): sources, Vocabulary, Definitions, the target. */
function stageItems(shown: boolean, statuses: Partial<Record<keyof typeof IDS, ItemView['status']>> = {}): ItemView[] {
  const st = (k: keyof typeof IDS, fallback: ItemView['status']) => (k in statuses ? (statuses[k] as ItemView['status']) : fallback);
  const vocab = itemView({ id: IDS.vocab, kind: 'vocabulary-term', label: 'Vocabulary term', detail: vocabDetail, status: st('vocab', 'in-review') });
  const definition = itemView({
    id: IDS.definition,
    kind: 'declaration',
    declKind: 'definition',
    label: 'Definition',
    detail: definitionDetail,
    status: st('definition', 'in-review'),
    classes: { belief: true, changesProved: false, reasons: ['belief: a statement relies on Spyro.IsEvil'] },
  });
  const formalize = itemView({
    id: IDS.formalize,
    kind: 'formalize',
    cards: [cardRef('pg-no-dark-past')],
    detail: formalizeDetail,
    status: st('formalize', 'in-review'),
    dependsOn: [IDS.vocab],
    classes: { belief: true, changesProved: false, reasons: ['belief: it formalises or changes an axiom card'] },
    accept: st('vocab', 'in-review') === 'accepted' ? OPEN : closed(REVIEW_TEXTS.acceptNeedsDependencies('Formalize “PG games cannot have characters with dark pasts”', ['Vocabulary term Spyro.InGame']), [IDS.vocab]),
  });
  if (!shown) {
    const result = itemView({
      id: IDS.result,
      rev: 0,
      kind: 'result',
      cards: [cardRef(TARGET)],
      detail: hiddenResultDetail,
      status: null,
      classes: null,
      accept: closed(REVIEW_TEXTS.showResultsFirst),
      decline: { ...closed(REVIEW_TEXTS.showResultsFirst), options: DECLINE_OPTIONS.result },
      review: closed(REVIEW_TEXTS.showResultsFirst),
    });
    // Sources (pg-no-dark-past's Formalize) come after the vocabulary term they use (the host hoists it).
    return [vocab, formalize, definition, result];
  }
  const arrow = itemView({
    id: IDS.arrow,
    kind: 'add-arrow',
    cards: [cardRef('new-spyro-pg'), cardRef(TARGET)],
    group: { kind: 'card', card: cardRef(TARGET) },
    detail: { kind: 'add-arrow', source: cardRef('new-spyro-pg'), target: cardRef(TARGET), why: 'The proof needs that the game is PG.', addsNoNewBasis: false },
    status: st('arrow', 'in-review'),
    classes: { belief: false, changesProved: true, reasons: ['changes what is proved: it adds an arrow into a proposition'] },
  });
  const premise = itemView({
    id: IDS.premise,
    kind: 'add-premise',
    cards: [cardRef(TARGET)],
    group: { kind: 'card', card: cardRef(TARGET) },
    detail: {
      kind: 'add-premise',
      sentence: 'Cynder is evil',
      leanName: 'cynder_is_evil',
      target: cardRef(TARGET),
      statement: statement('Spyro.cynder_is_evil', 'IsEvil cynder', 'Spyro.IsEvil Spyro.cynder'),
      whyNeeded: 'Without it the proof does not go through.',
      mayRestate: false,
      replacesFromNothing: false,
    },
    status: st('premise', 'in-review'),
    dependsOn: [IDS.definition],
    classes: { belief: true, changesProved: false, reasons: ['belief: it adds an axiom card or a premise'] },
  });
  const result = itemView({
    id: IDS.result,
    rev: 2,
    kind: 'result',
    cards: [cardRef(TARGET)],
    status: st('result', 'in-review'),
    dependsOn: [IDS.formalize, IDS.arrow],
    classes: { belief: false, changesProved: true, reasons: ['changes what is proved: it proves a statement changed in this session'] },
    markers: ['seen-early'],
    accept: closed(REVIEW_TEXTS.acceptNeedsDependencies('Result “Cynder would not be a good addition to the new Spyro game”', ['Add arrow']), [IDS.arrow]),
    detail: {
      kind: 'result',
      target: cardRef(TARGET),
      question: SOURCES.map((id) => cardRef(id)),
      fromNothing: false,
      revealed: true,
      seenEarly: true,
      verdict: 'established',
      flags: ['proves-changed-statement'],
      proof: { name: 'Spyro.cynder_not_good.holds', code: 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds' },
      band: { used: ['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg'], notNeeded: [], complete: true, open: [] },
      restsOn: ['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg'],
      throughResults: [],
      basisChanged: [],
      missingArrows: [],
      arrowItems: [IDS.arrow],
      premiseItems: [IDS.premise],
      summary: 'Proved from the arrows and the PG rating.',
    },
  });
  return [vocab, formalize, definition, arrow, premise, result];
}

function counts(items: readonly ItemView[]): SessionView['counts'] {
  const n = (s: ItemView['status']) => items.filter((i) => i.status === s).length;
  return { inReview: n('in-review'), accepted: n('accepted'), declined: n('declined'), toBeRedone: n('to-be-redone') };
}

function steps(over: Array<Partial<StepView>> = [{}]): StepView[] {
  return over.map((o, i) => ({ id: `s${i + 1}`, index: 1, of: 1, kind: 'formalize', target: TARGET, state: 'ended', activity: 'withheld', ...o }));
}

/** A SessionView with the host's defaults (stage 1, the results hidden). */
export function sessionView(patch: Partial<SessionView> = {}): SessionView {
  const items = patch.items ?? stageItems(false);
  const shown = patch.results?.shown ?? false;
  return {
    runId: SESSION_RUN,
    subject: 'Spyro',
    stage: 1,
    phase: 'stage',
    results: { shown: false, forced: false, waitingFor: [IDS.formalize, IDS.definition] },
    inferences: [{ target: cardRef(TARGET), question: SOURCES.map((id) => cardRef(id)), fromNothing: false, order: 0, result: IDS.result }],
    steps: steps(),
    heading: null,
    items,
    counts: counts(items),
    report: {
      stage: patch.stage ?? 1,
      targets: [{ target: TARGET, revealed: shown }],
      steps: [{ step: 's1', target: TARGET, revealed: shown }],
      notes: [],
      consistency: 'unchecked',
      withdrawn: [],
    },
    rejected: [],
    board: { graph, hiddenTargets: shown ? [] : [TARGET], marks: {}, arrows: [], premises: [], removedNodes: [] },
    undo: null,
    redo: null,
    sealed: null,
    drift: null,
    judging: false,
    submit: { gate: closed(REVIEW_TEXTS.submitInReview(3), [IDS.vocab, IDS.formalize, IDS.definition]) },
    formalize: closed(REVIEW_TEXTS.formalizeResultsHidden),
    events: [],
    problems: [],
    ...patch,
  };
}

/** Stage 1, results hidden: the Result a neutral row, its arrow and premise left out (§4.7). */
export function hiddenStage(patch: Partial<SessionView> = {}): SessionView {
  return sessionView(patch);
}

/**
 * The two outcomes of `hiddenStage` (a proof, or none), as the host posts them while the results are hidden: the same
 * SessionView (core's non-interference pairs, 2c2), and RunViews that differ only in §4.7's accepted residuals.
 */
export function hiddenPair(): { proved: { session: SessionView; run: RunView }; notProved: { session: SessionView; run: RunView } } {
  return {
    proved: { session: hiddenStage(), run: sessionRun(hiddenStage(), { counters: { turns: 31, checks: 9, agentMs: 512_000, gateAttempts: 2 }, updatedAt: '2026-11-21T10:08:30.000Z' }) },
    notProved: { session: hiddenStage(), run: sessionRun(hiddenStage(), { counters: { turns: 18, checks: 4, agentMs: 301_000, gateAttempts: 0 }, updatedAt: '2026-11-21T10:05:10.000Z' }) },
  };
}

/** The same stage once the results are shown (forced by Show results: every Result marked seen early). */
export function shownStage(statuses: Partial<Record<keyof typeof IDS, ItemView['status']>> = {}, patch: Partial<SessionView> = {}): SessionView {
  const items = stageItems(true, statuses);
  return sessionView({
    results: { shown: true, forced: true, waitingFor: [] },
    items,
    counts: counts(items),
    report: {
      stage: 1,
      targets: [
        {
          target: TARGET,
          revealed: true,
          verdict: 'established',
          band: { used: ['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg'], complete: true, open: [] },
          restsOn: ['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg'],
          throughResults: [],
          notNeeded: [],
          missing: [],
        },
      ],
      steps: [
        {
          step: 's1',
          target: TARGET,
          revealed: true,
          summary: 'Proved from the arrows and the PG rating.',
          assumedWithoutAsking: [{ text: '“cannot have” read as a rule', items: [] }],
        },
      ],
      notes: [],
      consistency: 'unchecked',
      withdrawn: [],
    },
    board: {
      graph,
      hiddenTargets: [],
      marks: {},
      arrows: [{ item: IDS.arrow, change: 'add', source: 'new-spyro-pg', target: TARGET, status: items.find((i) => i.id === IDS.arrow)?.status ?? 'in-review', used: true }],
      premises: [{ item: IDS.premise, target: TARGET, sentence: 'Cynder is evil', status: 'in-review' }],
      removedNodes: [],
    },
    steps: steps([{ activity: 'shown', outcome: REVIEW_TEXTS.stepPassed }]),
    undo: { step: 4, label: 'Show results' },
    submit: { gate: closed(REVIEW_TEXTS.submitInReview(counts(items).inReview), items.filter((i) => i.status === 'in-review').map((i) => i.id)) },
    formalize: OPEN,
    ...patch,
  });
}

/** Every listed item accepted: Submit leads to the end confirmation (no Claude step). */
export function allAcceptedStage(): SessionView {
  return shownStage(
    { vocab: 'accepted', definition: 'accepted', formalize: 'accepted', arrow: 'accepted', premise: 'accepted', result: 'accepted' },
    { submit: { gate: OPEN, next: 'confirm', work: { shaky: 0, redo: 0, steps: 0 } } },
  );
}

/** A Submit queue running (D2-62: every gate closed with "Claude's step is running…"); step 1 of 2. */
export function stepSession(patch: Partial<SessionView> = {}): SessionView {
  const running = REVIEW_TEXTS.stepRunning;
  const items = stageItems(true, { vocab: 'accepted', formalize: 'accepted', definition: 'declined' }).map((i) => ({
    ...i,
    accept: closed(running),
    decline: { ...closed(running), options: i.decline.options },
    review: closed(running),
  }));
  return shownStage(
    {},
    {
      phase: 'step',
      items,
      counts: counts(items),
      steps: steps([
        { activity: 'withheld' },
        { id: 's2', kind: 'submit', index: 1, of: 2, state: 'running', activity: 'withheld' },
        { id: 's3', kind: 'submit', index: 2, of: 2, state: 'queued', target: TARGET, activity: 'withheld' },
      ]),
      // D2-10: no word of Claude's while a step runs (the report's steps are withheld).
      report: { ...shownStage().report, steps: [{ step: 's1', target: TARGET, revealed: false }] },
      undo: null,
      sealed: { by: 'submit', at: AT },
      submit: { gate: closed(running) },
      formalize: closed("Claude's step is running: Formalize again when it ends."),
      ...patch,
    },
  );
}

/** The session's first queue: stage 0, no item yet. */
export function firstQueue(patch: Partial<SessionView> = {}): SessionView {
  return sessionView({
    stage: 0,
    phase: 'step',
    items: [],
    counts: { inReview: 0, accepted: 0, declined: 0, toBeRedone: 0 },
    results: { shown: true, forced: false, waitingFor: [] },
    steps: steps([{ state: 'running' }]),
    report: { stage: 0, targets: [{ target: TARGET, revealed: false }], steps: [], notes: [], consistency: 'unchecked', withdrawn: [] },
    submit: { gate: closed(REVIEW_TEXTS.stepRunning) },
    ...patch,
  });
}

export function confirmation(patch: Partial<EndConfirmationView['check']> = {}, over: Partial<EndConfirmationView> = {}): EndConfirmationView {
  const check: EndConfirmationView['check'] = { id: 'chk-1', state: 'passed', reusedFileChecks: true, failures: [], ...patch };
  const apply: Gate =
    check.state === 'running' ? closed(REVIEW_TEXTS.applyWaitsForCheck) : check.state === 'failed' ? closed(REVIEW_TEXTS.applyCheckFailed) : OPEN;
  return {
    changes: [
      { item: IDS.formalize, label: 'Formalize “PG games cannot have characters with dark pasts”' },
      { item: IDS.result, label: 'Result “Cynder would not be a good addition to the new Spyro game”' },
    ],
    rejected: [],
    notRun: [],
    endorsed: [{ name: 'Spyro.IsEvil', declKind: 'definition' }],
    check,
    empty: false,
    apply,
    ...over,
  };
}

export function confirmingSession(check: Partial<EndConfirmationView['check']> = {}, patch: Partial<SessionView> = {}): SessionView {
  const base = allAcceptedStage();
  return {
    ...base,
    phase: 'confirming',
    submit: { gate: closed(REVIEW_TEXTS.applyingNow) },
    undo: null,
    confirmation: confirmation(check),
    ...patch,
  };
}

/** The session's RunView (§3.12): `session`, `inferences` and `step`; no verdict, no activity while hidden. */
export function sessionRun(session: SessionView, patch: Partial<RunView> = {}): RunView {
  const running = session.phase === 'step';
  const step = session.steps.find((s) => s.state === 'running') ?? session.steps.at(-1);
  return runView({
    runId: session.runId,
    subject: session.subject,
    target: TARGET,
    premises: [...SOURCES],
    state: session.phase === 'interrupted' ? 'interrupted' : running ? 'working' : 'review',
    stage: 'prove',
    startedAt: STARTED,
    caps: { ...DEFAULT_RUN_CAPS },
    session: { stage: session.stage, phase: session.phase },
    inferences: session.inferences.map((i) => ({ target: i.target.id, premises: i.question.map((c) => c.id) })),
    ...(step !== undefined ? { step: { index: step.index, of: step.of, target: step.target, kind: step.kind, statementsFixed: true } } : {}),
    notices: [],
    activity: [],
    ghosts: [],
    ...patch,
  });
}
