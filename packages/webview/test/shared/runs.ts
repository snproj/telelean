/**
 * M2 fixtures for the board's run UI, typed with core's run.ts types (docs/m2-plan.md section 6): runs in each state,
 * the ask_user batch of the walkthrough (section 10.2), and proposals for both readings of "PG games cannot have
 * characters with dark pasts" (normative: proved; literal: not proved with a suggested premise; after adopting it:
 * proved), plus a proposal with a definition question (the "belief tucked into a definition" case).
 */
import {
  DEFAULT_RUN_CAPS,
  edgeId,
  PRESUPPOSITION_PREFIX,
  spyroGraph,
  spyroProvedGraph,
  type AnsweredQuestionView,
  type AttemptSummary,
  type GhostView,
  type GraphDiff,
  type ProposalView,
  type QuestionSetView,
  type QuestionView,
  type ReportCard,
  type RunView,
  type StatementReview,
  type TlGraph,
  type TlNode,
  type VocabItem,
} from '@telelean/core';

export const RUN_ID = 'run_20261101_1';
export const STARTED = '2026-11-01T10:00:00.000Z';
/** The fixtures' `updatedAt`; tests pin the page clock here (openBoard's `clock`), so the agent clock reads 4:05. */
export const UPDATED = '2026-11-01T10:04:05.000Z';
export const TARGET = 'cynder-not-good';
export const ALL_PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];

export function runView(patch: Partial<RunView> = {}): RunView {
  return {
    runId: RUN_ID,
    subject: 'Spyro',
    target: TARGET,
    premises: [...ALL_PREMISES],
    state: 'working',
    stage: 'formalise',
    round: 1,
    startedAt: STARTED,
    updatedAt: UPDATED,
    backend: { id: 'claude-cli', model: 'claude-opus-5-5', effort: 'high', cliVersion: '2.1.314' },
    caps: { ...DEFAULT_RUN_CAPS },
    counters: { turns: 12, checks: 3, agentMs: 245_000, gateAttempts: 0 },
    usage: {
      requests: 12,
      inputTokens: 12_345,
      outputTokens: 1_234,
      cacheReadInputTokens: 450_000,
      cacheCreationInputTokens: 30_000,
      costEstimateUsd: 0.42,
    },
    answered: [],
    notices: [],
    activity: [],
    ghosts: [],
    ...patch,
  };
}

/** The walkthrough's first question (section 10.2): the modality of "cannot have". */
export const MODALITY_QUESTION: QuestionView = {
  index: 0,
  phenomenon: 'modality',
  question: 'Does "cannot have" state a rule about what PG games should not include (normative), or that a PG game is unable to contain such a character (literal)?',
  options: [
    { label: 'A rule (normative)', consequence: 'A PG game with such a character breaks the rule; it says nothing about what the game contains.' },
    { label: 'Impossible (literal)', consequence: 'No PG game contains a character with a dark past at all.' },
  ],
  affectedNodes: ['pg-no-dark-past'],
};

export const GENERIC_QUESTION: QuestionView = {
  index: 1,
  phenomenon: 'genericity',
  question: 'Is "characters with dark pasts" about every such character, or only the typical ones?',
  options: [
    { label: 'Every one', consequence: 'No exception: any character with a dark past is covered.' },
    { label: 'Typical ones', consequence: 'Exceptions are allowed; the rule gets an "unless something unusual applies" guard.', formalPreview: '∀ c, HasDarkPast c → ¬ Abnormal c → …' },
  ],
  affectedNodes: ['pg-no-dark-past'],
};

export function questionSet(questions: QuestionView[] = [MODALITY_QUESTION], id = 'q1'): QuestionSetView {
  return { id, askedAt: '2026-11-01T10:01:00.000Z', questions };
}

export function waitingRun(questions: QuestionView[] = [MODALITY_QUESTION], patch: Partial<RunView> = {}): RunView {
  return runView({ state: 'waiting-for-answer', stage: 'formalise', pendingQuestions: questionSet(questions), ...patch });
}

/** The modality question answered with option 0, with Claude's guess revealed (D-20). */
export function answeredModality(patch: Partial<AnsweredQuestionView> = {}): AnsweredQuestionView {
  return {
    ...MODALITY_QUESTION,
    setId: 'q1',
    answer: { question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' },
    answeredAt: '2026-11-01T10:02:00.000Z',
    claudesGuess: { option: 0, note: 'Ratings usually express rules about content.' },
    ...patch,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Proposals

const NORMATIVE_PRETTY = '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬GoodAddition c g';
const NORMATIVE_EXPLICIT = '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.GoodAddition c g)';
const LITERAL_PRETTY = '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬InGame c g';
const LITERAL_EXPLICIT = '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.InGame c g)';

function closure(names: Array<[string, string, string, string]>): StatementReview['closure'] {
  return names.map(([name, kind, type, gloss]) => ({ name, kind, type, gloss, glossBy: 'user' as const }));
}

const NORMATIVE_CLOSURE = closure([
  ['Spyro.Game', 'sort', 'Type', 'games'],
  ['Spyro.Character', 'sort', 'Type', 'characters'],
  ['Spyro.IsPG', 'predicate', 'Spyro.Game → Prop', 'is rated PG'],
  ['Spyro.HasDarkPast', 'predicate', 'Spyro.Character → Prop', 'has a dark past'],
  ['Spyro.GoodAddition', 'predicate', 'Spyro.Character → Spyro.Game → Prop', 'would be a good addition to'],
]);

function usage(): ReportCard['usage'] {
  return { requests: 14, inputTokens: 15_200, outputTokens: 2_100, cacheReadInputTokens: 520_000, cacheCreationInputTokens: 31_000, costEstimateUsd: 0.47 };
}

function diff(nodes: GraphDiff['nodes'], vocabulary: GraphDiff['vocabulary'] = {}, edgesAdded: string[] = []): GraphDiff {
  const values = Object.values(nodes);
  return {
    nodes,
    vocabulary,
    edges: { added: edgesAdded, removed: [] },
    counts: {
      added: values.filter((d) => d.change === 'added').length,
      changed: values.filter((d) => d.change === 'changed').length,
      removed: values.filter((d) => d.change === 'removed').length,
      vocabularyAdded: Object.values(vocabulary).filter((c) => c === 'added').length,
    },
  };
}

function verifiedEdges(target: string, sources: string[]): string[] {
  return sources.map((source) => edgeId('verified', source, target));
}

/** Normative reading (section 10.2 A): the goal proved from the three premises; G->D proposed (l1, recommended). */
export function normativeProposal(patch: Partial<ProposalView> = {}): ProposalView {
  const graph = spyroProvedGraph(30);
  return {
    runId: RUN_ID,
    proposalId: 'p1',
    round: 1,
    subject: 'Spyro',
    graph,
    diff: diff(
      { 'pg-no-dark-past': { change: 'changed', fields: ['statement', 'binding', 'status'] }, [TARGET]: { change: 'changed', fields: ['proof', 'status'] } },
      {},
      verifiedEdges(TARGET, ALL_PREMISES),
    ),
    files: [{ path: 'Model/Spyro/Main.lean', change: 'modified', additions: 6, deletions: 0 }],
    review: [
      {
        kind: 'statement',
        nodeId: 'pg-no-dark-past',
        sentence: 'PG games cannot have characters with dark pasts',
        wordedBy: 'user',
        leanName: 'Spyro.pg_no_dark_past',
        pretty: NORMATIVE_PRETTY,
        explicit: NORMATIVE_EXPLICIT,
        closure: NORMATIVE_CLOSURE,
        change: 'new',
      },
    ],
    definitions: [],
    ghosts: [],
    report: {
      verdict: 'proved',
      target: TARGET,
      footprint: [...ALL_PREMISES, `${PRESUPPOSITION_PREFIX}Spyro.Character.exists`, `${PRESUPPOSITION_PREFIX}Spyro.Game.exists`],
      unusedPremises: [],
      consistency: 'unchecked',
      selfEvident: false,
      claudeSummary: 'Proved from the three premises under the normative reading.',
      assumedWithoutAsking: [],
      gateAttempts: [{ attempt: 1, round: 1, at: '2026-11-01T10:05:00.000Z', passed: true, failures: [] }],
      usage: usage(),
      durationMs: 372_000,
      agentMs: 245_000,
    },
    baseChanged: false,
    empty: false,
    ...patch,
  };
}

const IN_GAME: VocabItem = {
  name: 'Spyro.InGame',
  shortName: 'InGame',
  subject: 'Spyro',
  kind: 'predicate',
  type: 'Spyro.Character → Spyro.Game → Prop',
  arity: 2,
  gloss: 'is in',
  glossBy: 'agent',
  loc: { file: 'Model/Spyro/Vocabulary.lean', range: { start: { line: 18, character: 0 }, end: { line: 19, character: 41 } } },
  code: '/-- is in -/\naxiom InGame : Character → Game → Prop',
  usedBy: ['pg-no-dark-past'],
  flags: ['new'],
};

/** pg-no-dark-past formalised under the literal reading, over the new predicate InGame. */
function literalNode(base: TlNode): TlNode {
  return {
    ...base,
    lean: {
      binding: 'pinned',
      statement: 'Spyro.pg_no_dark_past',
      justification: 'Spyro.pg_no_dark_past.holds',
      justificationKind: 'axiom',
      code: [
        '/-- PG games cannot have characters with dark pasts -/',
        'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g',
        'axiom pg_no_dark_past.holds : pg_no_dark_past',
      ].join('\n'),
      uses: ['Spyro.Game', 'Spyro.Character', 'Spyro.IsPG', 'Spyro.HasDarkPast', 'Spyro.InGame'],
      presupposes: [],
    },
    status: { ...base.status, formal: 'formalized', proof: { kind: 'assumed' }, flags: [] },
  };
}

/** The suggestion of section 10.2 B (ghost-1): closes the gap, does not alone give the goal. */
export function literalGhost(patch: Partial<GhostView> = {}): GhostView {
  return {
    id: 'ghost-1',
    naturalName: 'A character who cannot be in a game would not be a good addition to it',
    leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
    leanName: 'not_in_game_not_good',
    whyNeeded: 'The literal reading only says Cynder cannot be in the game; nothing links being in a game to being a good addition to it.',
    closesGap: true,
    aloneEntails: false,
    state: 'suggested',
    round: 1,
    ...patch,
  };
}

export function literalGraph(version = 40): TlGraph {
  const base = spyroGraph(version);
  return {
    ...base,
    nodes: base.nodes.map((n) => (n.id === 'pg-no-dark-past' ? literalNode(n) : n)),
    vocabulary: [...base.vocabulary.slice(0, 5), IN_GAME, ...base.vocabulary.slice(5)],
  };
}

/** Literal reading, round 1 (section 10.2 B): not proved; InGame added; one suggested premise. */
export function literalProposal(patch: Partial<ProposalView> = {}): ProposalView {
  return {
    runId: RUN_ID,
    proposalId: 'p1',
    round: 1,
    subject: 'Spyro',
    graph: literalGraph(),
    diff: diff({ 'pg-no-dark-past': { change: 'changed', fields: ['statement', 'binding', 'status'] } }, { 'Spyro.InGame': 'added' }),
    files: [
      { path: 'Model/Spyro/Main.lean', change: 'modified', additions: 3, deletions: 0 },
      { path: 'Model/Spyro/Vocabulary.lean', change: 'modified', additions: 2, deletions: 0 },
    ],
    review: [
      {
        kind: 'statement',
        nodeId: 'pg-no-dark-past',
        sentence: 'PG games cannot have characters with dark pasts',
        wordedBy: 'user',
        leanName: 'Spyro.pg_no_dark_past',
        pretty: LITERAL_PRETTY,
        explicit: LITERAL_EXPLICIT,
        closure: [...NORMATIVE_CLOSURE.slice(0, 4), { name: 'Spyro.InGame', kind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'is in', glossBy: 'agent' }],
        change: 'new',
      },
      { kind: 'vocabulary', items: [{ name: 'Spyro.InGame', vocabKind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'is in', code: IN_GAME.code ?? '' }] },
    ],
    definitions: [],
    ghosts: [literalGhost()],
    report: {
      verdict: 'not-proved',
      target: TARGET,
      footprint: [],
      unusedPremises: [],
      consistency: 'unchecked',
      selfEvident: false,
      claudeSummary: 'Under the literal reading the goal does not follow.',
      gap: 'Nothing connects being unable to appear in a game with being a good addition to it.',
      assumedWithoutAsking: [],
      gateAttempts: [{ attempt: 1, round: 1, at: '2026-11-01T10:06:00.000Z', passed: true, failures: [] }],
      usage: usage(),
      durationMs: 410_000,
      agentMs: 260_000,
    },
    baseChanged: false,
    empty: false,
    ...patch,
  };
}

export const ADOPTED_ID = 'a-character-who-cannot-be-in';

/** The adopted suggestion as a card (worded by Claude: italic with a marker). */
function adoptedNode(): TlNode {
  return {
    id: ADOPTED_ID,
    type: 'AXIOM',
    role: 'node',
    subject: 'Spyro',
    naturalName: 'A character who cannot be in a game would not be a good addition to it',
    rationale: 'it seems obvious to me',
    asserted: '2026-11-01',
    premises: [],
    provenance: { wordedBy: 'agent', endorsed: true, origin: 'agent', session: RUN_ID },
    ext: {},
    lean: {
      binding: 'pinned',
      statement: 'Spyro.not_in_game_not_good',
      justification: 'Spyro.not_in_game_not_good.holds',
      justificationKind: 'axiom',
      code: [
        '/-- A character who cannot be in a game would not be a good addition to it -/',
        'abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
        'axiom not_in_game_not_good.holds : not_in_game_not_good',
      ].join('\n'),
      uses: ['Spyro.Character', 'Spyro.Game', 'Spyro.InGame', 'Spyro.GoodAddition'],
    },
    status: { formal: 'formalized', proof: { kind: 'assumed' }, certificates: { consistency: 'none', nonVacuity: 'none' }, flags: [] },
  };
}

/** Literal reading, round 2 after "I hold this": proved with the adopted premise. */
export function adoptedProposal(patch: Partial<ProposalView> = {}): ProposalView {
  const literal = literalGraph(50);
  const proved = spyroProvedGraph(50).nodes.find((n) => n.id === TARGET) as TlNode;
  const footprint = [...ALL_PREMISES, ADOPTED_ID, `${PRESUPPOSITION_PREFIX}Spyro.Character.exists`, `${PRESUPPOSITION_PREFIX}Spyro.Game.exists`];
  const target: TlNode = { ...proved, status: { ...proved.status, proof: { kind: 'proved', footprint } } };
  const nodes = [...literal.nodes.filter((n) => n.type === 'AXIOM'), adoptedNode(), target];
  const graph: TlGraph = {
    ...literal,
    nodes,
    edges: [
      ...literal.edges.filter((e) => e.target !== TARGET || e.type === 'premise'),
      ...[...ALL_PREMISES, ADOPTED_ID].map((source) => ({ id: edgeId('verified', source, TARGET), type: 'verified' as const, source, target: TARGET, origin: 'lean' as const, where: 'proof' as const })),
    ],
  };
  const literalReview = literalProposal().review;
  const { gap: _gap, ...literalReport } = literalProposal().report;
  return {
    ...literalProposal(),
    proposalId: 'p2',
    round: 2,
    graph,
    diff: diff(
      {
        'pg-no-dark-past': { change: 'changed', fields: ['statement', 'binding', 'status'] },
        [ADOPTED_ID]: { change: 'added', fields: [] },
        [TARGET]: { change: 'changed', fields: ['proof', 'status'] },
      },
      { 'Spyro.InGame': 'added' },
      verifiedEdges(TARGET, [...ALL_PREMISES, ADOPTED_ID]),
    ),
    review: [
      literalReview[0] as StatementReview,
      {
        kind: 'statement',
        nodeId: ADOPTED_ID,
        sentence: 'A character who cannot be in a game would not be a good addition to it',
        wordedBy: 'agent',
        leanName: 'Spyro.not_in_game_not_good',
        pretty: '∀ (c : Character) (g : Game), ¬InGame c g → ¬GoodAddition c g',
        explicit: '∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.InGame c g) → Not (Spyro.GoodAddition c g)',
        closure: [
          { name: 'Spyro.Character', kind: 'sort', type: 'Type', gloss: 'characters', glossBy: 'user' },
          { name: 'Spyro.Game', kind: 'sort', type: 'Type', gloss: 'games', glossBy: 'user' },
          { name: 'Spyro.InGame', kind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'is in', glossBy: 'agent' },
          { name: 'Spyro.GoodAddition', kind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'would be a good addition to', glossBy: 'user' },
        ],
        change: 'new',
      },
      literalReview[1] as ProposalView['review'][number],
    ],
    ghosts: [literalGhost({ state: 'adopted', nodeId: ADOPTED_ID })],
    report: {
      ...literalReport,
      verdict: 'proved',
      footprint,
      claudeSummary: 'Proved with the premise you adopted.',
      assumedWithoutAsking: ['"cannot have" read literally, as you answered', '"the new Spyro game" is one particular game'],
      gateAttempts: [
        { attempt: 1, round: 2, at: '2026-11-01T10:12:00.000Z', passed: false, failures: [{ step: 'G3', text: 'it left a gap (`sorry`) in `cynder_not_good.holds`', detail: 'declaration uses sorry: Spyro.cynder_not_good.holds' }] },
        { attempt: 2, round: 2, at: '2026-11-01T10:13:00.000Z', passed: true, failures: [] },
      ],
    },
    ...patch,
  };
}

/** The "belief tucked into a definition" case: proved, with the definition `InGame` as a question (A2). */
export function definitionProposal(patch: Partial<ProposalView> = {}): ProposalView {
  const base = adoptedProposal();
  return {
    ...base,
    proposalId: 'p3',
    definitions: [
      {
        id: 'd1',
        name: 'Spyro.InGame',
        kind: 'definition',
        code: '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g',
        usedByStatementsOf: ['pg-no-dark-past'],
        gloss: 'is in',
      },
      {
        id: 'd2',
        name: 'Spyro.Rating.exists',
        kind: 'presupposition',
        code: '/-- there is at least one rating -/\naxiom Rating.exists : Nonempty Rating',
        usedByStatementsOf: [],
        gloss: 'there is at least one rating',
      },
    ],
    ...patch,
  };
}

/**
 * "Follows from nothing?" (no premises; M2's "Self-evident?") that Claude could not prove, in a round that changed no
 * file: the proposal is empty, so Accept only records the outcome (no Undo step, no history entry). Its run:
 * `reviewRun(p, { premises: [] })`.
 */
export function emptyProposal(patch: Partial<ProposalView> = {}): ProposalView {
  return {
    runId: RUN_ID,
    proposalId: 'p1',
    round: 1,
    subject: 'Spyro',
    graph: spyroGraph(30),
    diff: diff({}),
    files: [],
    review: [],
    definitions: [],
    ghosts: [],
    report: {
      verdict: 'not-proved',
      target: TARGET,
      footprint: [],
      unusedPremises: [],
      consistency: 'unchecked',
      selfEvident: false,
      claudeSummary: 'Nothing proves it from no premises at all.',
      gap: 'Whether Cynder would be a good addition depends on facts about the game and the character.',
      assumedWithoutAsking: [],
      gateAttempts: [{ attempt: 1, round: 1, at: '2026-11-01T10:03:00.000Z', passed: true, failures: [] }],
      usage: usage(),
      durationMs: 200_000,
      agentMs: 120_000,
    },
    baseChanged: false,
    empty: true,
    ...patch,
  };
}

/**
 * The runner's notices for an Accept: one that changed files, and one that applied nothing (fixer round 1 wording; the
 * action's name as core's proposalLabel words it since slice 1e: "Formalize", or "Follows from nothing?").
 */
export const ACCEPTED_NOTICE = 'Accepted: Formalize → proved: Cynder would not be a good addition to the new Spyro game. Undo reverts it.';
export const RECORDED_NOTICE = 'Recorded: Follows from nothing? → not proved: Cynder would not be a good addition to the new Spyro game (no file changed).';

/** The run in review with a proposal (state, verdict and proposal id agree). */
export function reviewRun(proposal: ProposalView, patch: Partial<RunView> = {}): RunView {
  return runView({
    state: 'review',
    stage: 'prove',
    round: proposal.round,
    proposalId: proposal.proposalId,
    verdict: proposal.report.verdict,
    counters: { turns: 21, checks: 6, agentMs: 245_000, gateAttempts: proposal.report.gateAttempts.length },
    ghosts: proposal.ghosts,
    ...patch,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Attempts history (D-18) and carry-over 1

export function attemptsGraph(version = 60): TlGraph {
  const record = (id: string, round: number, date: string, verdict: AttemptSummary['verdict'], premises: string[], summary: string, resolution?: AttemptSummary['resolution']): AttemptSummary => ({
    format: 'telelean-attempt',
    version: 1,
    id,
    run: id.split('.')[0] ?? id,
    round,
    date,
    subject: 'Spyro',
    target: TARGET,
    premises,
    verdict,
    summary,
    gateAttempts: verdict === 'gave-up' ? 3 : 1,
    model: 'claude-opus-5-5',
    effort: 'high',
    ...(resolution ? { resolution } : {}),
  });
  return {
    ...spyroGraph(version),
    attempts: [
      record('run_2.2', 2, '2026-11-01T11:00:00.000Z', 'proved', [...ALL_PREMISES, ADOPTED_ID], 'Proved with the premise you adopted.', 'accepted'),
      record('run_2.1', 1, '2026-11-01T10:40:00.000Z', 'not-proved', [...ALL_PREMISES], 'Under the literal reading the goal does not follow.', 'superseded'),
      record('run_1.1', 1, '2026-10-30T18:05:00.000Z', 'gave-up', ['cynder-dark-past'], 'The proof needs the rating of the game.', 'discarded'),
      { ...record('run_0.1', 1, '2026-10-29T09:00:00.000Z', 'not-proved', [], 'Nothing proves it from no premises.'), target: 'pg-no-dark-past' },
    ],
  };
}

/** spyroProvedGraph with users outside the board: a lemma without a card and another subject's card. */
export function externalUsersGraph(version = 70): TlGraph {
  const base = spyroProvedGraph(version);
  return {
    ...base,
    nodes: base.nodes.map((n) =>
      n.id === 'cynder-dark-past'
        ? {
            ...n,
            lean: {
              ...n.lean,
              externalUsers: [
                { name: 'Spyro.helper_lemma', where: 'proof' },
                { name: 'Bayonetta.bayo_not_good.holds', nodeId: 'bayo-not-good', subject: 'Bayonetta', naturalName: 'Bayonetta would not be a good addition either', where: 'proof' },
              ],
            },
          }
        : n.id === TARGET
          ? { ...n, lean: { ...n.lean, externalUsers: [{ name: 'Spyro.cynder_lemma', where: 'statement' }] } }
          : n,
    ),
  };
}
