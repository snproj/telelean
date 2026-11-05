/**
 * AT4.1-AT4.3 ProposalService.build from REAL Lean facts: M1's sandboxed refresh of a scratch copy of mental_model/
 * in the base state and in three run states of docs/m2-plan.md section 10 (reading A proved, reading B not proved,
 * the definition cheat). The shadow is an in-memory stand-in (WP2's is built in parallel); WP1's diffGraphs is faked
 * here, and the parts that need WP1's real diffGraphs / lifecycleChanges run with WP1's code (gated while the builders
 * worked in parallel; the integrator removed the gates).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  diffGraphs,
  lifecycleChanges,
  type FlaggedDefinition,
  type GhostView,
  type LeanFacts,
  type ProposalView,
  type StatementReview,
  type TlGraph,
  type VocabularyReview,
} from '@telelean/core';

import type { CheckReport } from '../../src/gate/types.js';
import { createProposalService, PROPOSAL_FACTS_FILE, type ProposalBuildInput, type ProposalCore } from '../../src/proposal/index.js';
import { knownProjectsLines } from '../lean/helpers.js';
import { unitsOfRun } from '../semantic/helpers.js';
import { cleanup, copyMentalModel, makeTempDir, waitForMemory, write } from '../workspace/helpers.js';
import {
  adoptedState,
  boardOf,
  definitionCheatState,
  edit,
  fakeDiff,
  fakeShadow,
  GHOST_NODE,
  literalState,
  MAIN,
  normativeState,
  realFacts,
  realReader,
  SELECTION_ALL,
  shadowFilesOnDisk,
  USAGE,
  VOCABULARY,
} from './helpers.js';

const RUN = `wp4b${process.pid}`;

const RENDERED_NORMATIVE = {
  name: 'Spyro.pg_no_dark_past',
  pretty: '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.GoodAddition c g',
  explicit: '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.GoodAddition c g)',
};
const RENDERED_LITERAL = {
  name: 'Spyro.pg_no_dark_past',
  pretty: '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.InGame c g',
  explicit: '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.InGame c g)',
};
const GHOST: GhostView = {
  id: 'ghost-1',
  naturalName: 'A character who cannot be in a game would not be a good addition to it',
  leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
  leanName: 'not_in_game_not_good',
  whyNeeded: 'The literal reading only says Cynder cannot be in the game; nothing links being in a game to being a good addition to it.',
  closesGap: true,
  aloneEntails: false,
  state: 'suggested',
  round: 1,
};

function check(facts: LeanFacts | undefined): CheckReport {
  return { outcome: 'ok', g0: [], findings: [], diagnostics: [], ...(facts ? { facts } : {}), durationMs: 1 };
}

describe('AT4.1-AT4.3 build from real Lean facts', () => {
  let tmp = '';
  let root = '';
  let lean = false;
  let knownBefore: number | undefined;
  let base = new Map<string, string>();
  const states: Record<'base' | 'normative' | 'literal' | 'adopted' | 'cheat', { files: Map<string, string>; facts?: LeanFacts }> = {
    base: { files: new Map() },
    normative: { files: new Map() },
    literal: { files: new Map() },
    adopted: { files: new Map() },
    cheat: { files: new Map() },
  };
  let currentGraph: TlGraph;

  /** Writes a state's files into the scratch copy (it plays the build mirror) and refreshes it with real Lean. */
  async function factsOf(files: Map<string, string>): Promise<LeanFacts> {
    for (const [rel, text] of files) write(root, rel, text);
    const facts = await realFacts(root, RUN);
    expect(facts.status, facts.detail ?? '').toBe('ok');
    return facts;
  }

  beforeAll(async () => {
    if (!(await waitForMemory())) return; // RAM rule: no Lean below 12 GB available (the tests then skip)
    knownBefore = knownProjectsLines();
    tmp = makeTempDir('proposal-build');
    root = copyMentalModel(tmp);
    base = shadowFilesOnDisk(root);
    states.base = { files: base, facts: await factsOf(base) };
    for (const [name, make] of [
      ['normative', normativeState],
      ['literal', literalState],
      ['adopted', adoptedState],
      ['cheat', definitionCheatState],
    ] as const) {
      const files = make(base);
      states[name] = { files, facts: await factsOf(files) };
    }
    currentGraph = boardOf(base, states.base.facts);
    lean = true;
  });

  afterAll(async () => {
    cleanup(tmp);
    if (lean) {
      expect(await unitsOfRun(`${RUN}*`)).toEqual([]);
      expect(knownProjectsLines()).toBe(knownBefore);
    }
  });

  function buildInput(state: keyof typeof states, overrides: Partial<ProposalBuildInput> = {}): ProposalBuildInput {
    const { files, facts } = states[state];
    return {
      runId: 'r1',
      round: 1,
      proposalId: 'p1',
      selection: { ...SELECTION_ALL, premises: [...SELECTION_ALL.premises], adoptedGhosts: [] },
      shadow: fakeShadow({ runDir: path.join(tmp, 'runs', state), root, base, current: files }),
      check: check(facts),
      rendered: [RENDERED_NORMATIVE],
      currentGraph,
      verdict: 'proved',
      finish: { status: 'proved', summary: 'Proved from the three premises under the normative reading.', assumed_without_asking: [] },
      ghosts: [],
      gateAttempts: [{ attempt: 1, round: 1, at: '2026-11-01T10:05:00.000Z', passed: true, failures: [] }],
      flaggedDefinitions: [],
      usage: USAGE,
      durationMs: 120_000,
      agentMs: 90_000,
      drift: [],
      graphVersion: 4242,
      ...overrides,
    };
  }

  const fakeCore: Partial<ProposalCore> = { diffGraphs: () => fakeDiff() };
  const statementsOf = (p: ProposalView): StatementReview[] => p.review.filter((r): r is StatementReview => r.kind === 'statement');
  const vocabularyOf = (p: ProposalView): VocabularyReview | undefined => p.review.find((r): r is VocabularyReview => r.kind === 'vocabulary');

  it('AT4.1 reading A proved: target proved, files summary, one statement review, G->D recommended, footprint, report', async (ctx) => {
    if (!lean) ctx.skip();
    const diffCalls: Array<[TlGraph, TlGraph]> = [];
    const service = createProposalService({ core: { diffGraphs: (a, b) => (diffCalls.push([a, b]), fakeDiff()) } });
    const input = buildInput('normative');
    const proposal = await service.build(input);

    expect(proposal).toMatchObject({ runId: 'r1', proposalId: 'p1', round: 1, subject: 'Spyro', baseChanged: false, empty: false });
    // The proposed board: the files of the shown state with the mirror's facts; the target is proved.
    expect(proposal.graph.version).toBe(4242);
    expect(proposal.graph.nodes.map((n) => [n.id, n.type, n.status.proof.kind])).toEqual([
      ['pg-no-dark-past', 'ASSUMPTION', 'assumed'],
      ['cynder-dark-past', 'ASSUMPTION', 'assumed'],
      ['new-spyro-pg', 'ASSUMPTION', 'assumed'],
      ['cynder-not-good', 'GOAL', 'proved'],
    ]);
    expect(proposal.graph.semantic.state).toBe('fresh');
    // The diff is core's (faked here), between the current board and the proposed one.
    expect(proposal.diff).toEqual(fakeDiff());
    expect(diffCalls).toHaveLength(1);
    expect(diffCalls[0]?.[0]).toBe(currentGraph);
    expect(diffCalls[0]?.[1]).toBe(proposal.graph);

    // Files: base -> shown, with line counts (A.3: 3 lines, the pin: 1, A.6: 2).
    expect(proposal.files).toEqual([{ path: MAIN, change: 'modified', additions: 6, deletions: 0 }]);

    // One statement review: pg-no-dark-past is new (the target's statement existed in B).
    const statements = statementsOf(proposal);
    expect(statements).toHaveLength(1);
    const review = statements[0];
    expect(review).toMatchObject({
      kind: 'statement',
      nodeId: 'pg-no-dark-past',
      sentence: 'PG games cannot have characters with dark pasts',
      wordedBy: 'user',
      leanName: 'Spyro.pg_no_dark_past',
      pretty: RENDERED_NORMATIVE.pretty,
      explicit: RENDERED_NORMATIVE.explicit,
      change: 'new',
    });
    const closure = Object.fromEntries((review?.closure ?? []).map((c) => [c.name, c]));
    expect(Object.keys(closure).sort()).toEqual(['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.HasDarkPast', 'Spyro.IsPG']);
    expect(closure['Spyro.Game']).toMatchObject({ kind: 'sort', gloss: 'games' });
    expect(closure['Spyro.Character']).toMatchObject({ kind: 'sort', gloss: 'characters' });
    expect(closure['Spyro.IsPG']).toMatchObject({ kind: 'predicate', gloss: 'is rated PG' });
    expect(closure['Spyro.HasDarkPast']).toMatchObject({ kind: 'predicate', gloss: 'has a dark past' });
    expect(closure['Spyro.GoodAddition']).toMatchObject({ kind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'would be a good addition to' });
    expect(vocabularyOf(proposal)).toBeUndefined(); // no new vocabulary in reading A
    expect(proposal.definitions).toEqual([]);

    // Lifecycle: the proved GOAL -> DERIVATION, recommended.
    expect(proposal.lifecycle).toEqual([
      { id: 'l1', kind: 'change-kind', nodeId: 'cynder-not-good', from: 'GOAL', to: 'DERIVATION', recommended: true, reason: 'Lean proved it from the selected premises' },
    ]);

    // Report card: footprint = the three cards + the two presuppositions; consistency unchecked.
    expect(proposal.report).toMatchObject({
      verdict: 'proved',
      target: 'cynder-not-good',
      unusedPremises: [],
      consistency: 'unchecked',
      selfEvident: false,
      claudeSummary: 'Proved from the three premises under the normative reading.',
      assumedWithoutAsking: [],
      gateAttempts: input.gateAttempts,
      usage: USAGE,
      durationMs: 120_000,
      agentMs: 90_000,
    });
    expect([...proposal.report.footprint].sort()).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists']);
    expect(proposal.report.gap).toBeUndefined();
    expect(proposal.report.reverted).toBeUndefined();
    expect(proposal.ghosts).toEqual([]);
    // The proposal is JSON (it is persisted in run.json and posted to the webview).
    expect(JSON.parse(JSON.stringify(proposal))).toEqual(proposal);
    // The facts are kept for Accept (also after a window reload).
    const kept = JSON.parse(readFileSync(path.join(input.shadow.paths.runDir, PROPOSAL_FACTS_FILE), 'utf8')) as { proposalId: string; facts: LeanFacts };
    expect(kept.proposalId).toBe('p1');
    expect(kept.facts).toEqual(states.normative.facts);
  });

  it('AT4.1 statements fall back to their source text when Lean could not print them; drift; an unused selected card', async (ctx) => {
    if (!lean) ctx.skip();
    const service = createProposalService({ core: fakeCore });
    const proposal = await service.build(
      buildInput('normative', {
        rendered: [{ name: 'Spyro.pg_no_dark_past', pretty: '', explicit: '', error: 'unknown constant' }],
        drift: ['Model/Spyro/Inbox.lean'],
      }),
    );
    const review = statementsOf(proposal)[0];
    const source = 'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g';
    expect(review?.pretty).toBe(source);
    expect(review?.explicit).toBe(source);
    expect(proposal.baseChanged).toBe(true);

    // A selected card the proof does not use (here an adopted card the proof ignores) is listed (G6 flag, never a failure).
    const unused = await service.build(buildInput('normative', { selection: { ...SELECTION_ALL, premises: [...SELECTION_ALL.premises], adoptedGhosts: ['some-adopted-card'] } }));
    expect(unused.report.unusedPremises).toEqual(['some-adopted-card']);
    expect(unused.report.selfEvident).toBe(false);
  });

  it('AT4.2 reading B not proved: the new vocabulary (InGame), the ghost, verdict not-proved, no lifecycle item', async (ctx) => {
    if (!lean) ctx.skip();
    const service = createProposalService({ core: fakeCore });
    const proposal = await service.build(
      buildInput('literal', {
        rendered: [RENDERED_LITERAL],
        verdict: 'not-proved',
        finish: {
          status: 'not_proved',
          summary: 'Under the literal reading the goal does not follow.',
          gap: 'Nothing connects being unable to appear in a game with being a good addition to it.',
          assumed_without_asking: [],
        },
        ghosts: [GHOST],
      }),
    );
    expect(proposal.graph.nodes.find((n) => n.id === 'cynder-not-good')?.status.proof.kind).toBe('none');
    expect(proposal.files).toEqual([
      { path: MAIN, change: 'modified', additions: 4, deletions: 0 },
      { path: VOCABULARY, change: 'modified', additions: 2, deletions: 0 },
    ]);
    expect(statementsOf(proposal).map((s) => [s.nodeId, s.change, s.pretty])).toEqual([['pg-no-dark-past', 'new', RENDERED_LITERAL.pretty]]);
    expect(statementsOf(proposal)[0]?.closure.map((c) => c.name)).toContain('Spyro.InGame');
    const vocabulary = vocabularyOf(proposal);
    expect(vocabulary?.items).toHaveLength(1);
    expect(vocabulary?.items[0]).toMatchObject({ name: 'Spyro.InGame', vocabKind: 'predicate', type: 'Spyro.Character → Spyro.Game → Prop', gloss: 'is in' });
    expect(vocabulary?.items[0]?.code).toContain('axiom InGame : Character → Game → Prop');
    expect(proposal.review.at(-1)?.kind).toBe('vocabulary'); // statements first, then the vocabulary
    expect(proposal.ghosts).toEqual([GHOST]);
    expect(proposal.lifecycle).toEqual([]);
    expect(proposal.definitions).toEqual([]);
    expect(proposal.report).toMatchObject({
      verdict: 'not-proved',
      footprint: [],
      unusedPremises: [],
      selfEvident: false,
      claudeSummary: 'Under the literal reading the goal does not follow.',
      gap: 'Nothing connects being unable to appear in a game with being a good addition to it.',
    });
  });

  it("reading B after adopting the ghost: Claude's card is reviewed as Claude's words, it is in the footprint, G->D offered", async (ctx) => {
    if (!lean) ctx.skip();
    const service = createProposalService({ core: fakeCore });
    const proposal = await service.build(
      buildInput('adopted', {
        round: 2,
        proposalId: 'p2',
        selection: { ...SELECTION_ALL, premises: [...SELECTION_ALL.premises], adoptedGhosts: [GHOST_NODE] },
        rendered: [RENDERED_LITERAL],
        ghosts: [{ ...GHOST, state: 'adopted', nodeId: GHOST_NODE }],
      }),
    );
    expect(proposal.graph.nodes.map((n) => [n.id, n.status.proof.kind, n.provenance.wordedBy])).toEqual([
      ['pg-no-dark-past', 'assumed', 'user'],
      ['cynder-dark-past', 'assumed', 'user'],
      ['new-spyro-pg', 'assumed', 'user'],
      [GHOST_NODE, 'assumed', 'agent'],
      ['cynder-not-good', 'proved', 'user'],
    ]);
    expect(statementsOf(proposal).map((s) => [s.nodeId, s.wordedBy, s.change, s.leanName])).toEqual([
      ['pg-no-dark-past', 'user', 'new', 'Spyro.pg_no_dark_past'],
      [GHOST_NODE, 'agent', 'new', 'Spyro.not_in_game_not_good'],
    ]);
    const ghostReview = statementsOf(proposal)[1];
    expect(ghostReview?.sentence).toBe('A character who cannot be in a game would not be a good addition to it');
    expect(ghostReview?.pretty).toBe('abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g');
    expect(vocabularyOf(proposal)?.items.map((i) => i.name)).toEqual(['Spyro.InGame']);
    expect(proposal.report.footprint).toContain(GHOST_NODE);
    expect([...proposal.report.footprint].sort()).toEqual([GHOST_NODE, 'cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'].sort());
    expect(proposal.report.unusedPremises).toEqual([]);
    expect(proposal.lifecycle.map((l) => [l.id, l.nodeId, l.from, l.to])).toEqual([['l1', 'cynder-not-good', 'GOAL', 'DERIVATION']]);
    expect(proposal.ghosts).toEqual([{ ...GHOST, state: 'adopted', nodeId: GHOST_NODE }]);
  });

  it('AT4.3 the definition cheat: the flagged definition becomes question d1 with its code, gloss and statements', async (ctx) => {
    if (!lean) ctx.skip();
    const service = createProposalService({ core: fakeCore });
    const flagged: FlaggedDefinition[] = [{ name: 'Spyro.InGame', kind: 'definition', usedByStatementsOf: ['pg-no-dark-past'] }];
    const proposal = await service.build(buildInput('cheat', { rendered: [RENDERED_LITERAL], flaggedDefinitions: flagged }));
    expect(proposal.definitions).toEqual([
      {
        id: 'd1',
        name: 'Spyro.InGame',
        kind: 'definition',
        code: '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g',
        usedByStatementsOf: ['pg-no-dark-past'],
        gloss: 'is in',
      },
    ]);
    // A definition is a question, never auto-approved vocabulary.
    expect(vocabularyOf(proposal)).toBeUndefined();
    // The gate passed (proved by unfolding the definition): the lifecycle item is still offered; Accept needs the "yes".
    expect(proposal.graph.nodes.find((n) => n.id === 'cynder-not-good')?.status.proof.kind).toBe('proved');
    expect(proposal.lifecycle.map((l) => l.id)).toEqual(['l1']);
    // A flagged definition that already carries its code and gloss keeps them; ids follow the input order.
    const given = await service.build(
      buildInput('cheat', {
        flaggedDefinitions: [
          { name: 'Spyro.Other', kind: 'presupposition', code: 'axiom Other.exists : Nonempty Other', gloss: 'there is another', usedByStatementsOf: [] },
          ...flagged,
        ],
      }),
    );
    expect(given.definitions.map((d) => [d.id, d.name, d.kind, d.code.split('\n')[0], d.gloss])).toEqual([
      ['d1', 'Spyro.Other', 'presupposition', 'axiom Other.exists : Nonempty Other', 'there is another'],
      ['d2', 'Spyro.InGame', 'definition', '/-- is in -/', 'is in'],
    ]);
  });

  it('a check without facts gives the syntactic board, source-text reviews and no lifecycle item', async (ctx) => {
    if (!lean) ctx.skip();
    const service = createProposalService({ core: fakeCore });
    const proposal = await service.build(buildInput('normative', { check: check(undefined), rendered: [] }));
    expect(proposal.graph.semantic.state).toBe('unavailable');
    expect(proposal.graph.nodes.find((n) => n.id === 'cynder-not-good')?.status.proof.kind).toBe('none');
    expect(proposal.lifecycle).toEqual([]);
    expect(statementsOf(proposal).map((s) => s.nodeId)).toEqual(['pg-no-dark-past']);
    expect(statementsOf(proposal)[0]?.closure).toEqual([]);
    expect(existsSync(path.join(tmp, 'runs', 'normative', PROPOSAL_FACTS_FILE))).toBe(true); // from the earlier build
  });

  describe("WP1's diffGraphs", () => {
    it('AT4.1 the diff marks pg-no-dark-past changed (statement, binding) and the target changed (proof, status)', async (ctx) => {
      if (!lean) ctx.skip();
      const proposal = await createProposalService().build(buildInput('normative'));
      expect(proposal.diff.nodes['pg-no-dark-past']).toMatchObject({ change: 'changed', fields: expect.arrayContaining(['statement', 'binding']) });
      expect(proposal.diff.nodes['cynder-not-good']).toMatchObject({ change: 'changed', fields: expect.arrayContaining(['proof', 'status']) });
    });
  });

  describe("WP1's lifecycleChanges", () => {
    it('AT4.5 no drift with l1 ticked: after = the shown files with `type: DERIVATION`, before = the real files', async (ctx) => {
      if (!lean) ctx.skip();
      const labelled: Partial<ProposalCore> = { ...fakeCore, proposalLabel: () => 'These suffice → proved (+ Make Derivation)' };
      const service = createProposalService({ core: labelled });
      const input = buildInput('normative');
      const proposal = await service.build(input);
      const plan = await service.planAccept({
        proposal,
        shadow: input.shadow,
        lifecycle: ['l1'],
        readReal: realReader(new Map(base)),
        today: '2026-11-01',
        realFiles: [...base.keys()],
      });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      const shown = states.normative.files.get(MAIN) ?? '';
      expect(plan.changes).toEqual([{ path: MAIN, before: base.get(MAIN), after: edit(shown, 'id: cynder-not-good\ntype: GOAL\n', 'id: cynder-not-good\ntype: DERIVATION\n') }]);
      expect(plan.shadowState.get(MAIN)).toBe(shown); // without the lifecycle change
      // After a window reload (a new service): the facts come back from the run directory.
      const reloaded = await createProposalService({ core: labelled }).planAccept({
        proposal,
        shadow: input.shadow,
        lifecycle: ['l1'],
        readReal: realReader(new Map(base)),
        today: '2026-11-01',
        realFiles: [...base.keys()],
      });
      expect(reloaded).toEqual(plan);
    });
  });
});
