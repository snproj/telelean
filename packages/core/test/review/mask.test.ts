/**
 * Slice 2c1 (docs/slice2-plan.md 4.7, 6.1; D2-61, AF6): the RV-6 base mask. `baseMask` reads B and the ledger;
 * `maskFacts` masks the working copy's facts field by field; `maskedModel` builds the masked project with the build's
 * `mask` option (`projectMaskOf`). While the results are hidden the board shows every proof-derived datum as in B, with
 * statements and vocabulary from the working copy, and no hidden proof text, name, arrow, card or message reaches a graph.
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { probeFailure, type LeanFacts, type LeanMessageFact } from '../../src/facts.js';
import { planGhostAdoption } from '../../src/gate/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import type { TlGraph, TlNode } from '../../src/model.js';
import { endorsementHash } from '../../src/paths.js';
import { buildProjectModel, subjectGraph, type ProjectModel } from '../../src/project/index.js';
import type { ProjectInput, ProjectMask } from '../../src/project/types.js';
import { baseMask, maskedModel, maskFacts, projectMaskOf } from '../../src/review/mask.js';
import { computeItems } from '../../src/review/items.js';
import type { BaseMask, LedgerEntry, SessionInference } from '../../src/review/types.js';
import { HONEST_PROOF, TARGET_LINE, literal, normative, pinned } from '../gate/helpers/spyroRun.js';
import { fakeFacts, freshHashes, type FakeFactsOptions } from '../project/helpers/fakeFacts.js';
import { withChain } from './helpers/judge.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, VOCAB, append, created, edit, modelOf, type Texts } from './helpers/session.js';

// ---------------------------------------------------------------------------------------------
// Fixtures

/** B: the target pending (`axiom cynder_not_good.holds`), pg-no-dark-past still code-less. */
const PENDING = 'axiom cynder_not_good.holds : cynder_not_good\n';
const B1: Texts = edit(BASE, MAIN, TARGET_LINE, `${TARGET_LINE}${PENDING}`);
/** The step's statements: pg-no-dark-past formalised (and pinned); the target still pending (the not-proved outcome). */
const STATEMENTS: Texts = pinned(normative(B1));
/** …and the target proved (the proved outcome). */
const PROVED1: Texts = edit(STATEMENTS, MAIN, PENDING, HONEST_PROOF);
/** A proof through a lemma written between the target's statement and its `.holds`. */
const LEMMA = 'theorem dark_cynder : HasDarkPast cynder := cynder_dark_past.holds\n';
const VIA_LEMMA = `${LEMMA}theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds dark_cynder\n`;
const PROVED2: Texts = edit(STATEMENTS, MAIN, PENDING, VIA_LEMMA);
const STATEMENT_LEDGER: LedgerEntry[] = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];

/** The 0-based range of the first occurrence of `needle` in `text` (one line). */
function rangeIn(text: string, needle: string): LeanMessageFact['range'] {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`no ${JSON.stringify(needle)}`);
  const before = text.slice(0, at);
  const line = before.split('\n').length - 1;
  const character = at - (before.lastIndexOf('\n') + 1);
  return { start: { line, character }, end: { line, character: character + needle.length } };
}
/** A Lean message of `texts`' file `path`, at `needle`. */
const message = (texts: Texts, path: string, needle: string, text: string, severity: LeanMessageFact['severity'] = 'warning'): LeanMessageFact => ({
  severity,
  file: path,
  module: path.slice(0, -'.lean'.length).split('/').join('.'),
  range: rangeIn(texts[path] as string, needle),
  text,
});

const graphOf = (model: ProjectModel): TlGraph => subjectGraph(model, 'Spyro', { version: 7, semantic: { state: 'fresh' } });
/** The graph with source positions stripped, as buildSessionView strips them (§4.7). */
function strip(graph: TlGraph): unknown {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const { loc: _loc, ...rest } = n;
      void _loc;
      const { codeLoc: _codeLoc, ...lean } = n.lean;
      void _codeLoc;
      return { ...rest, lean };
    }),
    vocabulary: graph.vocabulary.map((v) => {
      const { loc: _loc, ...rest } = v;
      void _loc;
      return rest;
    }),
    diagnostics: graph.diagnostics.map((d) => {
      const { range: _range, ...rest } = d;
      void _range;
      return rest;
    }),
  };
}
const nodeIn = (graph: TlGraph, id: string): TlNode => {
  const node = graph.nodes.find((n) => n.id === id);
  if (node === undefined) throw new Error(`no node ${id}`);
  return node;
};

interface Session {
  base: Texts;
  current: Texts;
  inferences?: SessionInference[];
  ledger?: LedgerEntry[];
  baseFacts?: FakeFactsOptions;
  facts?: FakeFactsOptions;
  mutate?: (facts: LeanFacts) => void;
}
function masked(s: Session): { model: ProjectModel; mask: BaseMask; base: ProjectModel; current: ProjectModel } {
  const base = modelOf(s.base, s.baseFacts ?? {});
  const current = modelOf(s.current, s.facts ?? {}, s.mutate);
  const mask = baseMask({ base, inferences: s.inferences ?? [INFERENCE], ledger: s.ledger ?? [] });
  return { model: maskedModel({ current, base, mask }), mask, base, current };
}

// ---------------------------------------------------------------------------------------------

describe('baseMask: read off B and the ledger (§4.7, §2.9)', () => {
  it('empty: no target and no ledger mask nothing', () => {
    expect(baseMask({ base: modelOf(BASE), inferences: [], ledger: [] })).toEqual({ holds: {}, drop: [], dropArrows: [], dropNodes: [], restoreMarks: [] });
  });

  it('a target’s `.holds` as in B: B’s text, or absent when B has none; one per target, several targets', () => {
    expect(baseMask({ base: modelOf(B1), inferences: [INFERENCE], ledger: [] }).holds).toEqual({
      [TARGET]: { kind: 'base', name: TARGET_HOLDS, text: 'axiom cynder_not_good.holds : cynder_not_good' },
    });
    expect(baseMask({ base: modelOf(BASE), inferences: [INFERENCE], ledger: [] }).holds).toEqual({ [TARGET]: { kind: 'absent' } });
    // A target with no statement in B (a fuzzy card formalised in the session) is absent too.
    const fuzzy: SessionInference = { target: 'pg-no-dark-past', question: { sources: [], fromNothing: true }, order: 1, steps: ['s2'] };
    const chain = withChain(B1);
    const inferences: SessionInference[] = [INFERENCE, fuzzy, { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 2, steps: ['s3'] }];
    expect(baseMask({ base: modelOf(chain), inferences, ledger: [] }).holds).toEqual({
      [TARGET]: { kind: 'base', name: TARGET_HOLDS, text: 'axiom cynder_not_good.holds : cynder_not_good' },
      'pg-no-dark-past': { kind: 'absent' },
      t1: { kind: 'absent' },
    });
  });

  it('drop: every name whose first `created` entry is a proof phase’s, never one B has; sorted, once each', () => {
    const ledger: LedgerEntry[] = [
      created('Spyro.zeta', 'proof'),
      created('Spyro.alpha', 'proof', 's2'),
      created('Spyro.alpha', 'proof', 's3'),
      created('Spyro.first_statement', 'statements'),
      created('Spyro.first_statement', 'proof', 's2'),
      created('Spyro.cynder_dark_past.holds', 'proof'),
      created('Spyro.HasDarkPast', 'proof'),
    ];
    expect(baseMask({ base: modelOf(B1), inferences: [INFERENCE], ledger }).drop).toEqual(['Spyro.alpha', 'Spyro.zeta']);
  });

  it('dropArrows: every ledger arrow but one B draws, once each; dropNodes: written premise cards B lacks; restoreMarks: only marks B had', () => {
    const marked = edit(B1, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const ledger: LedgerEntry[] = [
      { kind: 'arrow', source: 'new-spyro-pg', target: 't2', step: 's1', why: 'needs it' },
      { kind: 'arrow', source: 'new-spyro-pg', target: 't2', step: 's2', why: 'again' },
      { kind: 'arrow', source: 'cynder-dark-past', target: 't1', step: 's1', why: 'drawn in B already' },
      { kind: 'arrow', source: 'cynder-dark-past', target: 't2', step: 's1', why: 'needs it' },
      { kind: 'premise', card: 'p-new', target: TARGET, holdAs: 'axiom', item: 'premise:x:p', commit: 'c1' },
      { kind: 'premise', card: 'p-new', target: TARGET, holdAs: 'axiom', item: 'premise:x:p', commit: 'c1' },
      { kind: 'premise', card: 'new-spyro-pg', target: TARGET, holdAs: 'axiom', item: 'premise:x:q', commit: 'c1' },
      { kind: 'mark-removed', card: TARGET, item: 'premise:x:p', commit: 'c1' },
      { kind: 'mark-removed', card: 'cynder-dark-past', item: 'premise:x:p', commit: 'c1' },
    ];
    const mask = baseMask({ base: modelOf(withChain(marked)), inferences: [INFERENCE], ledger });
    expect(mask.dropArrows).toEqual([
      { source: 'cynder-dark-past', target: 't2' },
      { source: 'new-spyro-pg', target: 't2' },
    ]);
    expect(mask.dropNodes).toEqual(['p-new']);
    expect(mask.restoreMarks).toEqual([TARGET]);
  });
});

describe('the masked board: every proof-derived datum as in B, statements from the working copy (§4.7)', () => {
  it('a proved pending target: the board is the not-proved one’s, the target pending with B’s code, pg-no-dark-past formalised (the working copy’s statement)', () => {
    const { model, base } = masked({ base: B1, current: PROVED1, ledger: STATEMENT_LEDGER });
    const graph = graphOf(model);
    // The proved outcome under the mask reads as the not-proved one, unmasked.
    expect(strip(graph)).toEqual(strip(graphOf(modelOf(STATEMENTS))));
    const target = nodeIn(graph, TARGET);
    expect(target.status.proof).toEqual({ kind: 'pending' });
    expect(nodeIn(graphOf(modelOf(PROVED1)), TARGET).status.proof.kind).toBe('proved');
    // Every card B has keeps B's derived data, but the one whose statement the session wrote.
    const before = graphOf(base);
    for (const id of ['cynder-dark-past', 'new-spyro-pg', TARGET]) expect(nodeIn(graph, id).status, id).toEqual(nodeIn(before, id).status);
    expect(nodeIn(before, 'pg-no-dark-past').status.formal).toBe('informal');
    expect(nodeIn(graph, 'pg-no-dark-past').status.formal).toBe('formalized');
    expect(nodeIn(graph, 'pg-no-dark-past').lean.statement).toBe('Spyro.pg_no_dark_past');
    expect(graph.edges.filter((e) => e.type === 'verified')).toEqual([]);
  });

  it('Used by of a source names neither the target nor a lemma; the target’s code holds B’s text (a lemma between its statement and `.holds` too), or none', () => {
    const ledger = [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')];
    const { model } = masked({ base: B1, current: PROVED2, ledger });
    const graph = graphOf(model);
    const open = graphOf(modelOf(PROVED2));
    // Unmasked, the proof uses cynder-dark-past through the lemma, which a card's Used by names.
    expect(open.edges.some((e) => e.type === 'verified' && e.source === 'cynder-dark-past' && e.target === TARGET)).toBe(true);
    expect(nodeIn(open, 'cynder-dark-past').lean.externalUsers?.map((u) => u.name)).toEqual(['Spyro.dark_cynder']);
    expect(open.vocabulary.some((v) => v.name === 'Spyro.dark_cynder')).toBe(true);
    // Masked: no edge into the target, no lemma anywhere, and the target's code is B's.
    expect(graph.edges.filter((e) => e.target === TARGET && e.type === 'verified')).toEqual([]);
    expect(nodeIn(graph, 'cynder-dark-past').lean.externalUsers).toBeUndefined();
    expect(graph.vocabulary.some((v) => v.name === 'Spyro.dark_cynder')).toBe(false);
    expect(JSON.stringify(graph)).not.toContain('dark_cynder');
    expect(nodeIn(graph, TARGET).lean.code).toBe(nodeIn(graphOf(modelOf(B1)), TARGET).lean.code);
    expect(nodeIn(graph, TARGET).lean.code).toContain(PENDING.trim());
    expect(strip(graph)).toEqual(strip(graphOf(modelOf(STATEMENTS))));
    // B with no `.holds` for the target: the working copy's proof is absent, the code the statement alone.
    const none = masked({ base: BASE, current: edit(pinned(normative(BASE)), MAIN, TARGET_LINE, `${TARGET_LINE}${VIA_LEMMA}`), ledger: [...ledger, created(TARGET_HOLDS, 'proof')] });
    const target = nodeIn(graphOf(none.model), TARGET);
    expect(none.mask.holds[TARGET]).toEqual({ kind: 'absent' });
    expect(target.status.proof).toEqual({ kind: 'none' });
    expect(target.lean.code).toBe(nodeIn(graphOf(modelOf(BASE)), TARGET).lean.code);
    expect(target.lean.code).not.toContain('.holds');
    expect(strip(graphOf(none.model))).toEqual(strip(graphOf(modelOf(pinned(normative(BASE))))));
  });

  it('Claude’s arrows, proof-phase definitions and proof-phase vocabulary are dropped; their diagnostics too', () => {
    const base = withChain(pinned(normative(BASE)));
    const t2 = 'natural_name: Cynder has a dark past, twice\npremises: t1\n';
    const current = append(
      edit(base, MAIN, t2, 'natural_name: Cynder has a dark past, twice\npremises: t1, new-spyro-pg\n'),
      VOCAB,
      '/-- shadows -/\naxiom Shadow : Type\n/-- a helper -/\ndef shadow_def : Prop := HasDarkPast cynder\naxiom loose_claim : HasDarkPast cynder',
    );
    const inferences: SessionInference[] = [{ target: 't2', question: { sources: ['t1'], fromNothing: false }, order: 0, steps: ['s1'] }];
    const ledger: LedgerEntry[] = [
      { kind: 'arrow', source: 'new-spyro-pg', target: 't2', step: 's1', why: 'needs it' },
      created('Spyro.Shadow', 'proof'),
      created('Spyro.shadow_def', 'proof'),
      created('Spyro.loose_claim', 'proof'),
    ];
    const open = graphOf(modelOf(current));
    expect(nodeIn(open, 't2').premises).toEqual(['t1', 'new-spyro-pg']);
    expect(open.vocabulary.map((v) => v.name)).toEqual(expect.arrayContaining(['Spyro.Shadow', 'Spyro.shadow_def', 'Spyro.loose_claim']));
    expect(open.diagnostics.some((d) => d.vocab === 'Spyro.loose_claim')).toBe(true);
    const { model } = masked({ base, current, inferences, ledger });
    const graph = graphOf(model);
    expect(nodeIn(graph, 't2').premises).toEqual(['t1']);
    expect(graph.edges.some((e) => e.source === 'new-spyro-pg' && e.target === 't2')).toBe(false);
    for (const name of ['Shadow', 'shadow_def', 'loose_claim']) expect(JSON.stringify(graph), name).not.toContain(name);
    expect(strip(graph)).toEqual(strip(graphOf(modelOf(base))));
  });

  it('a written premise card is dropped with its arrow and its declarations, and the mark it removed is back; a message inside its statement too', () => {
    const LITERAL = pinned(literal());
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const request = {
      subject: 'Spyro',
      target: TARGET,
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      leanName: 'not_in_game_not_good',
      session: 'rmabc123',
      today: '2026-11-02',
    };
    for (const holdAs of ['axiom', 'pending'] as const) {
      const plan = planGhostAdoption(modelOf(marked), { ...request, holdAs });
      const written: Texts = { ...marked, [MAIN]: plan.changes[0]?.after as string };
      const completed = edit(written, MAIN, TARGET_LINE, `${TARGET_LINE}theorem cynder_not_good.holds : cynder_not_good := (fun h => h) not_in_game_not_good.holds cynder newSpyro\n`);
      const key = `premise:${TARGET}:not_in_game_not_good`;
      const ledger: LedgerEntry[] = [
        { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs, item: key, commit: 'c-adopt' },
        { kind: 'mark-removed', card: TARGET, item: key, commit: 'c-adopt' },
        { kind: 'completion', target: TARGET, item: key, commit: 'c-complete' },
      ];
      const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] }];
      const messages = [message(completed, MAIN, 'abbrev not_in_game_not_good', 'a note inside the premise', 'information')];
      const open = graphOf(modelOf(completed, { messages }));
      expect(open.nodes.some((n) => n.id === plan.nodeId), holdAs).toBe(true);
      expect(nodeIn(open, TARGET).premises).toEqual([plan.nodeId]);
      expect(nodeIn(open, TARGET).fromNothing).toBeUndefined();
      const { model, mask } = masked({ base: marked, current: completed, inferences, ledger, facts: { messages } });
      expect(mask.dropNodes).toEqual([plan.nodeId]);
      expect(mask.restoreMarks).toEqual([TARGET]);
      const graph = graphOf(model);
      expect(graph.nodes.some((n) => n.id === plan.nodeId), holdAs).toBe(false);
      expect(nodeIn(graph, TARGET).premises).toEqual([]);
      expect(nodeIn(graph, TARGET).fromNothing).toBe(true);
      expect(JSON.stringify(graph), holdAs).not.toContain('not_in_game_not_good');
      expect(JSON.stringify(graph), holdAs).not.toContain('a note inside the premise');
      expect(strip(graph), holdAs).toEqual(strip(graphOf(modelOf(marked))));
    }
    // A written premise card that pins a second name (by hand): everything the card owns goes with it.
    const PREMISE = '/-\n@@ telelean v1\nid: two-pins\ntype: AXIOM\nnatural_name: Two pins\nrationale: by hand\nasserted: 2026-11-02\nlean: Spyro.two_pins, Spyro.two_pins_extra\n-/\n/-- Two pins -/\nabbrev two_pins : Prop := HasDarkPast cynder\naxiom two_pins.holds : two_pins\ntheorem two_pins_extra : True := trivial\n';
    const withCard = append(marked, MAIN, PREMISE);
    expect(modelOf(withCard).ownerOfDecl.get('Spyro.two_pins_extra')).toBe('two-pins');
    const ledger: LedgerEntry[] = [{ kind: 'premise', card: 'two-pins', target: TARGET, holdAs: 'axiom', item: `premise:${TARGET}:two_pins`, commit: 'c1' }];
    const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] }];
    const gone = graphOf(masked({ base: marked, current: withCard, inferences, ledger }).model);
    expect(JSON.stringify(gone)).not.toContain('two_pins');
    expect(strip(gone)).toEqual(strip(graphOf(modelOf(marked))));
  });

  it('without typeConsts (old facts in both states), every declaration unchanged since B still takes B’s proof-derived facts', () => {
    const base = withChain(PROVED_BY_PERSON);
    const current = append(base, MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
    const inferences: SessionInference[] = [{ target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] }];
    // A changed footprint of the person's own proof (which a hidden change could cause) must not show.
    const mutate = (facts: LeanFacts) => {
      const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
      if (holds === undefined) throw new Error('fixture');
      holds.axioms = [...(holds.axioms ?? []), 'sorryAx'];
      holds.usesSorry = true;
    };
    const s: Session = { base, current, inferences, ledger: [created('Spyro.t1.holds', 'proof')], baseFacts: { typeConsts: false }, facts: { typeConsts: false }, mutate };
    expect(nodeIn(graphOf(modelOf(current, { typeConsts: false }, mutate)), TARGET).status.flags).toContain('uses-sorry');
    const { model, base: baseModel, current: currentModel, mask } = masked(s);
    const facts = maskFacts({ current: currentModel, base: baseModel, mask });
    const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
    expect(holds?.axioms).toEqual(baseModel.declFacts.get(TARGET_HOLDS)?.axioms);
    expect(holds?.usesSorry).toBe(false);
    expect(holds?.typeConsts).toBeUndefined();
    // Positions and the rest stay the working copy's.
    expect(holds?.range).toEqual(currentModel.declFacts.get(TARGET_HOLDS)?.range);
    const target = nodeIn(graphOf(model), TARGET);
    expect(target.status.flags).not.toContain('uses-sorry');
    expect(target.status).toEqual(nodeIn(graphOf(baseModel), TARGET).status);
    // t1's proof (hidden) is B's: none.
    expect(nodeIn(graphOf(model), 't1').status.proof).toEqual({ kind: 'none' });
  });

  it('a Lean message inside a lemma or the working copy’s proof is dropped, and the target shows B’s messages, on its card', () => {
    const ledger = [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')];
    const baseMessages = [message(B1, MAIN, 'axiom cynder_not_good.holds', 'B: the claim is pending')];
    const messages = [
      message(PROVED2, MAIN, 'abbrev pg_no_dark_past', 'W: on the new statement'),
      message(PROVED2, MAIN, 'theorem dark_cynder', 'W: the lemma is long'),
      message(PROVED2, MAIN, 'pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds dark_cynder', 'W: the proof is long'),
      message(PROVED2, MAIN, 'end Spyro', 'W: outside every declaration'),
      { severity: 'error' as const, text: 'W: no position' },
    ];
    const open = graphOf(modelOf(PROVED2, { messages }));
    expect(open.diagnostics.filter((d) => d.code === 'LEAN').map((d) => d.message)).toEqual(expect.arrayContaining(['W: the lemma is long', 'W: the proof is long']));
    const { model } = masked({ base: B1, current: PROVED2, ledger, baseFacts: { messages: baseMessages }, facts: { messages } });
    const lean = graphOf(model).diagnostics.filter((d) => d.code === 'LEAN');
    // The working copy's message on new statement content stays, on its card.
    expect(lean.map((d) => [d.message, d.nodeId])).toEqual([
      ['W: on the new statement', 'pg-no-dark-past'],
      ['B: the claim is pending', TARGET],
    ]);
    expect(model.facts?.build.messages.map((m) => m.text)).toEqual(['W: on the new statement', 'B: the claim is pending']);
  });

  it('positions (AF6): hidden lemmas above a card with refs and a warning, and above an anonymous instance, change nothing once positions are stripped; the target’s refs are B’s; the module hashes stay the working copy’s', () => {
    const above = (texts: Texts) =>
      edit(edit(texts, MAIN, '/-\n@@ telelean v1\nid: cynder-dark-past', 'theorem early_lemma : True := trivial\n\n/-\n@@ telelean v1\nid: cynder-dark-past'), VOCAB, 'instance : Nonempty Character', 'theorem vocab_lemma : True := trivial\ninstance : Nonempty Character');
    const withLemmas = above(PROVED1);
    const ledger = [...STATEMENT_LEDGER, created('Spyro.early_lemma', 'proof'), created('Spyro.vocab_lemma', 'proof')];
    const warning = (texts: Texts) => [message(texts, MAIN, 'abbrev cynder_dark_past', 'a linter warning on the card')];
    const one = masked({ base: B1, current: withLemmas, ledger, baseFacts: { messages: warning(B1) }, facts: { messages: warning(withLemmas) } });
    const two = masked({ base: B1, current: PROVED1, ledger, baseFacts: { messages: warning(B1) }, facts: { messages: warning(PROVED1) } });
    const graph = graphOf(one.model);
    expect(strip(graph)).toEqual(strip(graphOf(two.model)));
    // The lemmas shifted everything below them: the facts kept those positions, so refs, the warning and the instance survive.
    const before = graphOf(one.base);
    expect(nodeIn(graph, 'cynder-dark-past').lean.refs).toEqual(nodeIn(before, 'cynder-dark-past').lean.refs);
    expect(nodeIn(graph, 'cynder-dark-past').lean.refs?.length).toBeGreaterThan(0);
    expect(graph.diagnostics.filter((d) => d.code === 'LEAN').map((d) => [d.message, d.nodeId])).toEqual([['a linter warning on the card', 'cynder-dark-past']]);
    // A message the working copy has on an unchanged declaration and B has not (a hidden lemma could cause one) does not show.
    const extra = [...warning(withLemmas), message(withLemmas, MAIN, 'axiom cynder_dark_past.holds', 'W: caused by something hidden')];
    const three = masked({ base: B1, current: withLemmas, ledger, baseFacts: { messages: warning(B1) }, facts: { messages: extra } });
    expect(graphOf(modelOf(withLemmas, { messages: extra })).diagnostics.some((d) => d.message === 'W: caused by something hidden')).toBe(true);
    expect(strip(graphOf(three.model))).toEqual(strip(graph));
    expect(one.model.declFacts.has('Spyro.instNonemptyCharacter')).toBe(true);
    expect(one.current.declFacts.get('Spyro.instNonemptyCharacter')?.range.start.line).toBe((one.base.declFacts.get('Spyro.instNonemptyCharacter')?.range.start.line ?? 0) + 1);
    // The target's overridden `.holds`: B's code and B's code-relative refs.
    expect(nodeIn(graph, TARGET).lean.code).toBe(nodeIn(before, TARGET).lean.code);
    expect(nodeIn(graph, TARGET).lean.refs).toEqual(nodeIn(before, TARGET).lean.refs);
    expect(nodeIn(graph, TARGET).lean.refs?.some((r) => r.nodeId === TARGET)).toBe(true);
    // The module hashes are the working copy's: no file reads stale.
    expect(one.model.facts?.modules).toEqual(one.current.facts?.modules);
    expect([...one.model.freshFiles].sort()).toEqual([...one.current.files.keys()].sort());
    expect(graph.nodes.filter((n) => n.status.flags.includes('stale') || n.status.flags.includes('not-checked')).map((n) => n.id)).toEqual(
      graphOf(one.base).nodes.filter((n) => n.status.flags.includes('stale') || n.status.flags.includes('not-checked')).map((n) => n.id),
    );
  });
});

/** B with the target proved by the person (their own proof), as the gate fixtures have it. */
const PROVED_BY_PERSON: Texts = edit(pinned(normative(BASE)), MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);

describe('a card’s code under the mask: composed without what the mask leaves out', () => {
  it('(fixer 2c1 r1, C-V2C1-C3, S-V2C1-S3, A-ADV-4) a hidden lemma between another card’s statement and its `.holds`, tight, spaced, with a comment above or below it or a namespace around it: B’s code and refs, the not-proved twin’s board', () => {
    const STMT = 'abbrev cynder_dark_past : Prop := HasDarkPast cynder\n';
    const variants = [
      ['tight', 'theorem between : True := trivial\n', 'Spyro.between'],
      ['spaced', '\ntheorem between : True := trivial\n\n', 'Spyro.between'],
      ['a comment above', '-- helper for the proof of cynder_not_good\ntheorem between : True := trivial\n', 'Spyro.between'],
      ['a comment below', 'theorem between : True := trivial\n-- used by the proof of cynder_not_good\n', 'Spyro.between'],
      ['a namespace around', '\nnamespace Aux\ntheorem between : True := trivial\nend Aux\n\n', 'Spyro.Aux.between'],
    ] as const;
    // The not-proved twin: no lemma, the target pending.
    const twin = graphOf(modelOf(STATEMENTS));
    const twinCard = nodeIn(twin, 'cynder-dark-past');
    expect(twinCard.lean.code).toBe(nodeIn(graphOf(modelOf(B1)), 'cynder-dark-past').lean.code);
    for (const [what, text, name] of variants) {
      const current = edit(PROVED1, MAIN, STMT, `${STMT}${text}`);
      // Unmasked, the lemma splits the card's code in two pieces.
      expect(nodeIn(graphOf(modelOf(current)), 'cynder-dark-past').lean.code, what).toContain('\n\n');
      const { model } = masked({ base: B1, current, ledger: [...STATEMENT_LEDGER, created(name, 'proof')] });
      const graph = graphOf(model);
      const card = nodeIn(graph, 'cynder-dark-past');
      expect(card.lean.code, what).toBe(twinCard.lean.code);
      expect(card.lean.refs, what).toEqual(twinCard.lean.refs);
      expect(strip(graph), what).toEqual(strip(twin));
      for (const word of ['between', 'helper for', 'used by', 'Aux']) expect(JSON.stringify(graph), `${what}: ${word}`).not.toContain(word);
    }
  });

  it('(fixer 2c1 r1, C-V2C1-C3) B’s layout is read only for a card whose statement and `.holds` both have B’s texts', () => {
    const changed = edit(PROVED1, MAIN, 'axiom cynder_dark_past.holds : cynder_dark_past', 'axiom cynder_dark_past.holds : HasDarkPast cynder');
    const { current, base, mask } = masked({ base: B1, current: changed, ledger: STATEMENT_LEDGER });
    const layout = projectMaskOf({ current, base, mask }).codeLayout;
    expect(Object.keys(layout).sort()).toEqual(['Spyro.new_spyro_pg.holds']);
    expect(layout['Spyro.new_spyro_pg.holds']).toEqual({ joined: '\n' });
  });

  it('(fixer 2c1 r1, C-V2C1-C3) a target’s `.holds` the step moved between another card’s statement and its `.holds`: both codes are B’s', () => {
    const LATER = '/-\n@@ telelean v1\nid: later-card\ntype: AXIOM\nnatural_name: Spyro is purple\nrationale: seen\nasserted: 2026-11-01\nlean: Spyro.later_card\n-/\n/-- Spyro is purple -/\nabbrev later_card : Prop := HasDarkPast cynder\naxiom later_card.holds : later_card\n';
    const base = append(B1, MAIN, LATER);
    const statements = pinned(normative(base));
    const moved = edit(edit(statements, MAIN, PENDING, ''), MAIN, 'abbrev later_card : Prop := HasDarkPast cynder\n', `abbrev later_card : Prop := HasDarkPast cynder\n${HONEST_PROOF}`);
    // Unmasked, the moved `.holds` splits the other card's code in two pieces.
    const open = graphOf(modelOf(moved));
    expect(nodeIn(open, 'later-card').lean.code).toContain('\n\n');
    expect(nodeIn(graphOf(modelOf(statements)), 'later-card').lean.code).not.toContain('\n\n');
    const graph = graphOf(masked({ base, current: moved, ledger: STATEMENT_LEDGER }).model);
    const before = graphOf(modelOf(base));
    for (const id of ['later-card', TARGET]) expect(nodeIn(graph, id).lean.code, id).toBe(nodeIn(before, id).lean.code);
    expect(strip(graph)).toEqual(strip(graphOf(modelOf(statements))));
  });

  it('(fixer 2c1 r1, C-V2C1-C3) a target’s `.holds` the step put, with its comment, between the statement and the `.holds` of a card formalised in the session: that card’s code is the twin’s', () => {
    const STMT = 'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\n';
    // (Lean's verdict plays no part here: the mask reads the texts and the facts.)
    const PROOF = '-- the proof of the goal\ntheorem cynder_not_good.holds : cynder_not_good :=\n  new_spyro_pg.holds.elim\n';
    const current = edit(edit(STATEMENTS, MAIN, PENDING, ''), MAIN, STMT, `${STMT}${PROOF}`);
    expect(nodeIn(graphOf(modelOf(current)), 'pg-no-dark-past').lean.code).toContain('\n\n');
    const graph = graphOf(masked({ base: B1, current, ledger: STATEMENT_LEDGER }).model);
    expect(nodeIn(graph, 'pg-no-dark-past').lean.code).toBe(nodeIn(graphOf(modelOf(STATEMENTS)), 'pg-no-dark-past').lean.code);
    expect(nodeIn(graph, TARGET).lean.code).toBe(nodeIn(graphOf(modelOf(B1)), TARGET).lean.code);
    expect(JSON.stringify(graph)).not.toContain('the proof of the goal');
    expect(strip(graph)).toEqual(strip(graphOf(modelOf(STATEMENTS))));
  });

  it('(fixer 2c1 r1, C-V2C1-C3/C5) a card formalised in the session: a hidden lemma between its statement and `.holds` goes with its comment; a hidden `mutual` goes once, keeping the note after it', () => {
    const STMT = 'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\n';
    const card = (graph: TlGraph) => nodeIn(graph, 'pg-no-dark-past');
    // The comment above the lemma goes with it (computeItems' attachment rule): the twin's code, tight.
    for (const between of ['\n', '\n\n']) {
      const commented = edit(PROVED1, MAIN, STMT, `${STMT}-- the proof of cynder_not_good uses this${between}theorem pg_helper : True := trivial\n`);
      const one = masked({ base: B1, current: commented, ledger: [...STATEMENT_LEDGER, created('Spyro.pg_helper', 'proof')] });
      expect(card(graphOf(one.model)).lean.code, JSON.stringify(between)).toBe(card(graphOf(modelOf(STATEMENTS))).lean.code);
      expect(JSON.stringify(graphOf(one.model)), JSON.stringify(between)).not.toContain('uses this');
      expect(strip(graphOf(one.model)), JSON.stringify(between)).toEqual(strip(graphOf(modelOf(STATEMENTS))));
    }
    // A note written with the statements, below a hidden `mutual`, goes with the `.holds` below it and stays (C5: the
    // `mutual` and the declarations inside it are one deletion, so nothing after them goes with them).
    const NOTE = '-- a note on the assumption\n';
    const noted = edit(STATEMENTS, MAIN, STMT, `${STMT}${NOTE}`);
    const withMutual = edit(edit(PROVED1, MAIN, STMT, `${STMT}${NOTE}`), MAIN, NOTE, `mutual\ntheorem even_pg : True := trivial\ntheorem odd_pg : True := trivial\nend\n${NOTE}`);
    const two = masked({ base: B1, current: withMutual, ledger: [...STATEMENT_LEDGER, created('Spyro.even_pg', 'proof'), created('Spyro.odd_pg', 'proof')] });
    expect(card(graphOf(modelOf(noted))).lean.code).toContain(NOTE.trim());
    expect(card(graphOf(two.model)).lean.code).toBe(card(graphOf(modelOf(noted))).lean.code);
    expect(card(graphOf(two.model)).lean.refs).toEqual(card(graphOf(modelOf(noted))).lean.refs);
    // The same around a card B has, with the person's own note in B: B's code, the note kept (C-V2C1-C5's case).
    const OWN = 'abbrev cynder_dark_past : Prop := HasDarkPast cynder\n';
    const NOTE_B = "-- the person's own note\n";
    const base = edit(B1, MAIN, OWN, `${OWN}${NOTE_B}`);
    const current = edit(edit(PROVED1, MAIN, OWN, `${OWN}${NOTE_B}`), MAIN, NOTE_B, `mutual\ntheorem even_x : True := trivial\ntheorem odd_x : True := trivial\nend\n${NOTE_B}`);
    const three = masked({ base, current, ledger: [...STATEMENT_LEDGER, created('Spyro.even_x', 'proof'), created('Spyro.odd_x', 'proof')] });
    const own = nodeIn(graphOf(three.model), 'cynder-dark-past').lean.code;
    expect(own).toBe(nodeIn(graphOf(modelOf(base)), 'cynder-dark-past').lean.code);
    expect(own).toContain(NOTE_B.trim());
  });

  it('a ref that lies outside its declaration (Lean attributing a use elsewhere) is left out of a composed card, as B’s own build leaves it out', () => {
    const stray = (facts: LeanFacts) => {
      const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
      const statement = facts.decls.find((d) => d.name === 'Spyro.cynder_not_good');
      if (holds === undefined || statement === undefined) throw new Error('fixture');
      const far = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
      holds.refs = [...holds.refs, { name: 'Spyro.cynder_not_good', module: 'Model.Spyro.Main', range: far }];
      statement.refs = [...statement.refs, { name: 'Spyro.HasDarkPast', module: 'Model.Spyro.Vocabulary', range: far }];
    };
    const base = modelOf(B1, {}, stray);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')] });
    const target = nodeIn(graphOf(maskedModel({ current: modelOf(PROVED2, {}, stray), base, mask })), TARGET);
    const before = nodeIn(graphOf(base), TARGET);
    expect(target.lean.refs).toEqual(before.lean.refs);
    expect(target.lean.refs?.length).toBe(nodeIn(graphOf(modelOf(B1)), TARGET).lean.refs?.length);
  });

  it('a target whose `.holds` B had apart from its statement (two pieces): B’s two pieces, whatever the working copy did', () => {
    const SPACER = 'abbrev spacer : Prop := True\n';
    const apart = edit(B1, MAIN, PENDING, `${SPACER}${PENDING}`);
    const statements = pinned(normative(apart));
    const proved = edit(statements, MAIN, `${SPACER}${PENDING}`, `${SPACER}${HONEST_PROOF}`);
    const adjacent = edit(statements, MAIN, `${TARGET_LINE}${SPACER}${PENDING}`, `${TARGET_LINE}${HONEST_PROOF}${SPACER}`);
    const { mask } = masked({ base: apart, current: proved, ledger: STATEMENT_LEDGER });
    const override = projectMaskOf({ current: modelOf(proved), base: modelOf(apart), mask }).codeOverride[TARGET_HOLDS];
    expect(override?.joined).toBeUndefined();
    expect(projectMaskOf({ current: modelOf(PROVED1), base: modelOf(B1), mask: baseMask({ base: modelOf(B1), inferences: [INFERENCE], ledger: [] }) }).codeOverride[TARGET_HOLDS]?.joined).toBe('\n');
    for (const current of [proved, adjacent]) {
      const target = nodeIn(graphOf(masked({ base: apart, current, ledger: STATEMENT_LEDGER }).model), TARGET);
      const before = nodeIn(graphOf(modelOf(apart)), TARGET);
      expect(before.lean.code).toContain(`\n\n${PENDING.trim()}`);
      expect(target.lean.code).toBe(before.lean.code);
      expect(target.lean.refs).toEqual(before.lean.refs);
      expect(target.status.proof).toEqual({ kind: 'pending' });
    }
  });
});

describe('the build’s mask: what else the working copy must not show', () => {
  it('a derived id telelean wrote back with Claude’s arrow reads as derived again, TL112 included; a card whose pin changed too keeps its written id', () => {
    const card = (pin: boolean) =>
      `/-\n@@ telelean v1\ntype: PROPOSITION\nnatural_name: Spyro is purple\npremises: cynder-dark-past\nasserted: 2026-11-01\n${pin ? 'lean: Spyro.purple\n' : ''}-/\n/-- Spyro is purple -/\nabbrev purple : Prop := HasDarkPast cynder\n`;
    const base = append(BASE, MAIN, card(true));
    const current = edit(base, MAIN, '@@ telelean v1\ntype: PROPOSITION\nnatural_name: Spyro is purple\npremises: cynder-dark-past\n', '@@ telelean v1\nid: spyro-is-purple\ntype: PROPOSITION\nnatural_name: Spyro is purple\npremises: cynder-dark-past, new-spyro-pg\n');
    const inferences: SessionInference[] = [{ target: 'spyro-is-purple', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] }];
    const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 'new-spyro-pg', target: 'spyro-is-purple', step: 's1', why: 'needs it' }];
    const tl112 = (graph: TlGraph) => graph.diagnostics.filter((d) => d.code === 'TL112').map((d) => d.nodeId);
    expect(tl112(graphOf(modelOf(base)))).toEqual(['spyro-is-purple']);
    expect(tl112(graphOf(modelOf(current)))).toEqual([]);
    const { model, mask, base: b, current: c } = masked({ base, current, inferences, ledger });
    expect(projectMaskOf({ current: c, base: b, mask }).derivedIds).toEqual({ 'spyro-is-purple': 'spyro-is-purple' });
    expect(tl112(graphOf(model))).toEqual(['spyro-is-purple']);
    expect(strip(graphOf(model))).toEqual(strip(graphOf(modelOf(base))));
    // A pin written in the session (a visible statement write) wrote the id too: it stays written.
    const unpinned = append(BASE, MAIN, card(false));
    const both = masked({ base: unpinned, current, inferences, ledger });
    expect(projectMaskOf({ current: both.current, base: both.base, mask: both.mask }).derivedIds).toEqual({});
    expect(tl112(graphOf(both.model))).toEqual([]);
  });

  it('a mark to restore on a card whose arrows stay is not shown: the arrows win (TL023), as for any block', () => {
    const base = modelOf(B1);
    const projectMask = { ...projectMaskOf({ current: base, base, mask: baseMask({ base, inferences: [], ledger: [] }) }), restoreMarks: [TARGET] };
    const files = Object.entries(B1).map(([path, text]) => parseLeanFile(path, text));
    const model = buildProjectModel({ files, fileHashes: freshHashes(files), facts: fakeFacts(files, { valueConsts: true, typeConsts: true }), library: 'Model', mask: projectMask });
    expect(nodeIn(graphOf(model), TARGET).premises).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(nodeIn(graphOf(model), TARGET).fromNothing).toBeUndefined();
  });

  it('a new file of hidden lemmas only is left out whole (no TL118); a hidden `mutual` pair goes with its `mutual`', () => {
    const SCRATCH = 'Model/Spyro/Scratch.lean';
    const current: Texts = { ...PROVED1, [SCRATCH]: 'namespace Spyro\n\n-- scratch\ntheorem scratch_one : True := trivial\n\nmutual\ntheorem even_one : True := trivial\ntheorem odd_one : True := trivial\nend\n\nend Spyro\n' };
    const ledger = [...STATEMENT_LEDGER, ...['scratch_one', 'even_one', 'odd_one'].map((n) => created(`Spyro.${n}`, 'proof'))];
    const open = graphOf(modelOf(current));
    expect(open.diagnostics.some((d) => d.code === 'TL118' && d.file === SCRATCH)).toBe(true);
    const { model } = masked({ base: B1, current, ledger });
    expect(model.files.has(SCRATCH)).toBe(false);
    expect(strip(graphOf(model))).toEqual(strip(graphOf(modelOf(STATEMENTS))));
    // Kept when it also holds visible content: only the hidden declarations (and the `mutual` around them) go.
    const mixed: Texts = { ...current, [SCRATCH]: `${current[SCRATCH]?.replace('end Spyro', 'axiom Seen : Type\n\nend Spyro')}` };
    const kept = masked({ base: B1, current: mixed, ledger: [...ledger, created('Spyro.Seen', 'statements')] }).model;
    expect(kept.files.get(SCRATCH)?.decls.map((d) => d.fullName ?? d.keyword)).toEqual(['Spyro.Seen']);
    expect(graphOf(kept).vocabulary.map((v) => v.name)).toContain('Spyro.Seen');
  });

  it('an empty mask changes nothing: the masked build of B itself is B’s build, byte for byte (each card composed in B’s layout, joined, apart or indented)', () => {
    const SPACER = 'abbrev spacer : Prop := True\n';
    const apart = edit(B1, MAIN, 'axiom cynder_dark_past.holds', `${SPACER}axiom cynder_dark_past.holds`);
    const indented = edit(B1, MAIN, 'axiom new_spyro_pg.holds', '  axiom new_spyro_pg.holds');
    for (const texts of [B1, PROVED_BY_PERSON, withChain(B1), apart, indented]) {
      const model = modelOf(texts, { messages: [message(texts, MAIN, 'abbrev cynder_dark_past', 'a warning')] });
      const mask = baseMask({ base: model, inferences: [], ledger: [] });
      const projectMask = projectMaskOf({ current: model, base: model, mask });
      expect({ ...projectMask, codeLayout: {} }).toEqual({ absent: [], codeOverride: {}, codeLayout: {}, lines: {}, drop: [], dropArrows: [], dropNodes: [], restoreMarks: [], derivedIds: {} });
      // Every card with a statement and a `.holds` is composed in B's layout: here the layout it has.
      const withHolds = ['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', TARGET_HOLDS, ...(texts === PROVED_BY_PERSON ? ['Spyro.pg_no_dark_past.holds'] : [])];
      expect(Object.keys(projectMask.codeLayout).sort()).toEqual(withHolds.sort());
      expect(projectMask.codeLayout['Spyro.cynder_dark_past.holds']).toEqual(texts === apart ? {} : { joined: '\n' });
      expect(projectMask.codeLayout['Spyro.new_spyro_pg.holds']).toEqual({ joined: texts === indented ? '\n  ' : '\n' });
      expect(graphOf(maskedModel({ current: model, base: model, mask }))).toEqual(graphOf(model));
      // With the target masked but the working copy as B, the same.
      const withTarget = baseMask({ base: model, inferences: [INFERENCE], ledger: [] });
      expect(graphOf(maskedModel({ current: model, base: model, mask: withTarget }))).toEqual(graphOf(model));
    }
  });
});

describe('maskFacts, field by field (§2.9)', () => {
  it('refuses a state without facts; maskedModel builds such a state without facts, masked', () => {
    const base = modelOf(B1);
    const files = Object.entries(PROVED2).map(([path, text]) => parseLeanFile(path, text));
    const bare = buildProjectModel({ files, fileHashes: freshHashes(files), library: 'Model' });
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')] });
    expect(() => maskFacts({ current: bare, base, mask })).toThrow(ActionError);
    const model = maskedModel({ current: bare, base, mask });
    expect(model.facts).toBeUndefined();
    const graph = graphOf(model);
    expect(JSON.stringify(graph)).not.toContain('dark_cynder');
    expect(nodeIn(graph, TARGET).lean.code).toBe(nodeIn(graphOf(modelOf(B1)), TARGET).lean.code);
  });

  it('B without facts: the target’s `.holds` has none (not checked, as in B), and an unchanged declaration loses `axioms` and `usesSorry`', () => {
    const files = Object.entries(B1).map(([path, text]) => parseLeanFile(path, text));
    const base = buildProjectModel({ files, fileHashes: freshHashes(files), library: 'Model' });
    const current = modelOf(PROVED1);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: STATEMENT_LEDGER });
    const facts = maskFacts({ current, base, mask });
    expect(facts.decls.some((d) => d.name === TARGET_HOLDS)).toBe(false);
    const unchanged = facts.decls.find((d) => d.name === 'Spyro.cynder_dark_past.holds');
    expect(unchanged).toBeDefined();
    expect(unchanged?.axioms).toBeUndefined();
    expect(unchanged?.usesSorry).toBeUndefined();
    expect(unchanged?.valueConsts).toEqual(current.declFacts.get('Spyro.cynder_dark_past.holds')?.valueConsts);
    // The working copy's envelope: modules, toolchain, status; `probed` counts the masked declarations.
    expect(facts.modules).toEqual(current.facts?.modules);
    expect(facts.check.probed).toBe(facts.decls.length);
  });

  it('the working copy’s order, the target’s `.holds` from B in place (B’s positions, the working copy’s file), the rest the working copy’s', () => {
    const base = modelOf(B1);
    const current = modelOf(PROVED2);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')] });
    const facts = maskFacts({ current, base, mask });
    expect(facts.decls.map((d) => d.name)).toEqual((current.facts?.decls ?? []).map((d) => d.name).filter((n) => n !== 'Spyro.dark_cynder'));
    const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
    expect(holds).toEqual({ ...base.declFacts.get(TARGET_HOLDS), file: MAIN, module: 'Model.Spyro.Main' });
    const statement = facts.decls.find((d) => d.name === 'Spyro.pg_no_dark_past');
    expect(statement).toEqual(current.declFacts.get('Spyro.pg_no_dark_past'));
  });

  it('a hand-made mask that also drops a target’s B `.holds`: B’s `.holds` still wins (the mask shows B, never less)', () => {
    const base = modelOf(B1);
    const current = modelOf(PROVED1);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: STATEMENT_LEDGER });
    const both: BaseMask = { ...mask, drop: [...mask.drop, TARGET_HOLDS] };
    expect(maskFacts({ current, base, mask: both }).decls.find((d) => d.name === TARGET_HOLDS)?.kind).toBe('axiom');
    expect(projectMaskOf({ current, base, mask: both }).drop).not.toContain(TARGET_HOLDS);
    expect(nodeIn(graphOf(maskedModel({ current, base, mask: both })), TARGET).status.proof).toEqual({ kind: 'pending' });
  });

  it('a name only Lean reports goes with its parent: by `parent`, by the declaration whose range holds it, by the longest name prefix', () => {
    const base = modelOf(B1);
    const add = (facts: LeanFacts) => {
      const lemma = facts.decls.find((d) => d.name === 'Spyro.dark_cynder');
      const kept = facts.decls.find((d) => d.name === 'Spyro.cynder_dark_past');
      if (lemma === undefined || kept === undefined) throw new Error('fixture');
      const child = (name: string, from: typeof lemma, over: Partial<typeof lemma> = {}) => ({ ...from, name, refs: [], ...over });
      const nowhere = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
      facts.decls.push(
        child('Spyro.by_parent', lemma, { parent: 'Spyro.dark_cynder', range: nowhere, selectionRange: nowhere }),
        child('Spyro.by_range_aux', lemma),
        child('Spyro.dark_cynder.eq_1', lemma, { range: nowhere, selectionRange: nowhere }),
        child('Spyro.cynder_dark_past.aux', kept, { parent: 'Spyro.cynder_dark_past' }),
      );
    };
    const current = modelOf(PROVED2, {}, add);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')] });
    const names = maskFacts({ current, base, mask }).decls.map((d) => d.name);
    for (const name of ['Spyro.dark_cynder', 'Spyro.by_parent', 'Spyro.by_range_aux', 'Spyro.dark_cynder.eq_1']) expect(names, name).not.toContain(name);
    expect(names).toContain('Spyro.cynder_dark_past.aux');
    expect(JSON.stringify(graphOf(maskedModel({ current, base, mask })))).not.toContain('by_parent');
  });

  it('a declaration B has with another text (a vocabulary change, visible) keeps the working copy’s facts and messages; B’s message for it goes', () => {
    const HELPER = 'def helper : Prop := HasDarkPast cynder';
    const CHANGED = 'def helper : Prop := HasDarkPast cynder ∧ True';
    const base = append(B1, VOCAB, HELPER);
    const current = append(PROVED1, VOCAB, CHANGED);
    const mutate = (facts: LeanFacts) => {
      const helper = facts.decls.find((d) => d.name === 'Spyro.helper');
      if (helper === undefined) throw new Error('fixture');
      helper.axioms = ['Spyro.HasDarkPast', 'propext'];
    };
    const s: Session = {
      base,
      current,
      ledger: STATEMENT_LEDGER,
      baseFacts: { messages: [message(base, VOCAB, 'def helper', 'B: on the old helper')] },
      facts: { messages: [message(current, VOCAB, 'def helper', 'W: on the new helper')] },
      mutate,
    };
    const { model, base: b, current: c, mask } = masked(s);
    expect(maskFacts({ current: c, base: b, mask }).decls.find((d) => d.name === 'Spyro.helper')?.axioms).toEqual(['Spyro.HasDarkPast', 'propext']);
    const lean = graphOf(model).diagnostics.filter((d) => d.code === 'LEAN');
    expect(lean.map((d) => [d.message, d.vocab])).toEqual([['W: on the new helper', 'Spyro.helper']]);
  });

  it('freshness is the working copy’s: a file stale there stays stale under the mask', () => {
    const staleVocab = (texts: Texts) => {
      const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
      const facts = fakeFacts(files, { valueConsts: true, typeConsts: true });
      return buildProjectModel({ files, fileHashes: { ...freshHashes(files), [VOCAB]: 'sha-edited-since' }, facts, library: 'Model' });
    };
    const current = staleVocab(PROVED1);
    expect(current.freshFiles.has(VOCAB)).toBe(false);
    const base = modelOf(B1);
    const model = maskedModel({ current, base, mask: baseMask({ base, inferences: [INFERENCE], ledger: STATEMENT_LEDGER }) });
    expect([...model.freshFiles].sort()).toEqual([...current.freshFiles].sort());
    // What reads stale is what the not-proved working copy, as stale, shows (the proof's walk through the vocabulary is hidden).
    const stale = (m: ProjectModel) => graphOf(m).nodes.filter((n) => n.status.flags.includes('stale')).map((n) => n.id);
    expect(stale(current)).toContain(TARGET);
    expect(stale(model)).toEqual(stale(staleVocab(STATEMENTS)));
    expect(strip(graphOf(model))).toEqual(strip(graphOf(staleVocab(STATEMENTS))));
  });
});

describe('the masked files: a block next to a left-out declaration', () => {
  const BLUE = '/-\n@@ telelean v1\nid: spyro-is-blue\ntype: PROPOSITION\nnatural_name: Spyro is blue\nasserted: 2026-11-01\n-/\n';
  /** The masked build of `texts` with a hand-made mask (the build's own form), the dropped names' facts left out. */
  const build = (texts: Texts, mask: ProjectMask): ProjectModel => {
    const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
    const facts = fakeFacts(files, { valueConsts: true, typeConsts: true });
    facts.decls = facts.decls.filter((d) => !mask.drop.includes(d.name));
    return buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model', mask });
  };
  const NONE: ProjectMask = { absent: [], codeOverride: {}, codeLayout: {}, lines: {}, drop: [], dropArrows: [], dropNodes: [], restoreMarks: [], derivedIds: {} };

  it('a block bound by adjacency to a left-out declaration reads what follows it without it: code-less, with B’s TL013 hint (fixer 2c1 r1)', () => {
    const base = append(B1, MAIN, `${BLUE}\nabbrev blue_gap : Prop := True`);
    const current = edit(base, MAIN, `${BLUE}\n`, `${BLUE}theorem blue_lemma : True := trivial\n\n`);
    expect(nodeIn(graphOf(modelOf(current)), 'spyro-is-blue').lean.statement).toBe('Spyro.blue_lemma');
    // A proof-phase declaration a card binds is that card's (A-ADV-1), so only a hand-made mask leaves it out (the
    // step limits refuse this binding anyway: `markup/formalised`).
    expect(projectMaskOf({ current: modelOf(current), base: modelOf(base), mask: baseMask({ base: modelOf(base), inferences: [], ledger: [created('Spyro.blue_lemma', 'proof')] }) }).drop).toEqual([]);
    const graph = graphOf(build(current, { ...NONE, drop: ['Spyro.blue_lemma'] }));
    const card = nodeIn(graph, 'spyro-is-blue');
    expect(card.lean.statement).toBeUndefined();
    expect(card.status.formal).toBe('informal');
    expect(JSON.stringify(graph)).not.toContain('blue_lemma');
    const hints = (g: TlGraph) => g.diagnostics.filter((d) => d.nodeId === 'spyro-is-blue').map((d) => [d.code, d.message]);
    expect(hints(graphOf(modelOf(base)))).toEqual([['TL013', 'This node is code-less, but `blue_gap` follows after a blank line: remove the blank line to attach it.']]);
    expect(hints(graph)).toEqual(hints(graphOf(modelOf(base))));
  });

  it('(fixer 2c1 r1, S-V2C1-S1, A-ADV-2) a hidden lemma or anonymous instance right below a pinned card’s block (the target, another card): the card stays pinned and formalised, nothing of it becomes vocabulary', () => {
    const cards = [
      ['the target', TARGET, 'lean: Spyro.cynder_not_good\n-/\n'],
      ['another card', 'cynder-dark-past', 'lean: Spyro.cynder_dark_past\n-/\n'],
    ] as const;
    const hidden = [
      ['a lemma', 'theorem secret_below_pin : True := trivial\n', 'Spyro.secret_below_pin'],
      ['an instance', 'instance : Inhabited Character := ⟨cynder⟩\n', 'Spyro.instInhabitedCharacter'],
    ] as const;
    const twin = graphOf(modelOf(STATEMENTS));
    for (const [what, id, anchor] of cards) {
      for (const [kind, text, name] of hidden) {
        const label = `${what}, ${kind}`;
        const current = edit(PROVED1, MAIN, anchor, `${anchor}${text}`);
        expect(nodeIn(graphOf(modelOf(current)), id).lean.binding, label).toBe('pinned');
        const graph = graphOf(masked({ base: B1, current, ledger: [...STATEMENT_LEDGER, created(name, 'proof')] }).model);
        const card = nodeIn(graph, id);
        expect(card.lean.binding, label).toBe('pinned');
        expect(card.status, label).toEqual(nodeIn(twin, id).status);
        expect(graph.vocabulary.map((v) => v.name), label).toEqual(twin.vocabulary.map((v) => v.name));
        expect(graph.diagnostics.map((d) => d.code), label).not.toContain('TL104');
        for (const word of ['secret_below_pin', 'Inhabited', 'pg_no_dark_past.holds newSpyro']) expect(JSON.stringify(graph), `${label}: ${word}`).not.toContain(word);
        expect(strip(graph), label).toEqual(strip(twin));
      }
    }
  });

  it('(fixer 2c1 r1, C-V2C1-C2, A-ADV-3) no TL013 or TL014 names or describes a hidden declaration below a code-less card, and B’s own hint comes back', () => {
    const SKY = '/-\n@@ telelean v1\nid: sky-blue\ntype: AXIOM\nnatural_name: The sky is blue\nrationale: seen\nasserted: 2026-11-01\n-/\n';
    const base = append(B1, MAIN, SKY);
    const plain = append(PROVED1, MAIN, SKY);
    const lemmaFree = graphOf(masked({ base, current: plain, ledger: STATEMENT_LEDGER }).model);
    expect(lemmaFree.diagnostics.filter((d) => d.nodeId === 'sky-blue' && (d.code === 'TL013' || d.code === 'TL014'))).toEqual([]);
    const variants = [
      ['a lemma after a blank line', '\ntheorem secret_gap : True := trivial\n', ['Spyro.secret_gap'], 'TL013'],
      ['an anonymous instance right below', 'instance : Inhabited Character := ⟨cynder⟩\n', ['Spyro.instInhabitedCharacter'], 'TL014'],
      ['a `mutual` right below', 'mutual\ntheorem even_sky : True := trivial\ntheorem odd_sky : True := trivial\nend\n', ['Spyro.even_sky', 'Spyro.odd_sky'], 'TL014'],
    ] as const;
    for (const [what, text, names, code] of variants) {
      const current = edit(plain, MAIN, SKY, `${SKY}${text}`);
      expect(graphOf(modelOf(current)).diagnostics.filter((d) => d.nodeId === 'sky-blue').map((d) => d.code), what).toContain(code);
      const graph = graphOf(masked({ base, current, ledger: [...STATEMENT_LEDGER, ...names.map((n) => created(n, 'proof'))] }).model);
      expect(strip(graph), what).toEqual(strip(lemmaFree));
      for (const word of ['secret_gap', 'Inhabited', 'mutual', 'even_sky']) expect(JSON.stringify(graph), `${what}: ${word}`).not.toContain(word);
    }
    // B's TL013 named a visible declaration; a hidden lemma written between the blank line and it: B's hint again.
    const gapBase = append(B1, MAIN, `${BLUE}\nabbrev blue_gap : Prop := True`);
    const gapCurrent = edit(edit(gapBase, MAIN, PENDING, HONEST_PROOF), MAIN, 'abbrev blue_gap', 'theorem secret_gap : True := trivial\nabbrev blue_gap');
    const tl013 = (g: TlGraph) => g.diagnostics.filter((d) => d.code === 'TL013').map((d) => [d.nodeId, d.message]);
    expect(tl013(graphOf(modelOf(gapCurrent)))).toEqual([['spyro-is-blue', 'This node is code-less, but `secret_gap` follows after a blank line: remove the blank line to attach it.']]);
    const gapGraph = graphOf(masked({ base: gapBase, current: gapCurrent, ledger: [created('Spyro.secret_gap', 'proof')] }).model);
    expect(JSON.stringify(gapGraph)).not.toContain('secret_gap');
    const masked013 = tl013(gapGraph);
    expect(masked013).toEqual(tl013(graphOf(modelOf(gapBase))));
    expect(masked013).toEqual([['spyro-is-blue', 'This node is code-less, but `blue_gap` follows after a blank line: remove the blank line to attach it.']]);
    // The same in a namespace of its own: its enclosing lines go with it (compareTexts' rule), so B's hint comes back.
    const enclosed = edit(edit(gapBase, MAIN, PENDING, HONEST_PROOF), MAIN, 'abbrev blue_gap', 'namespace Aux\ntheorem secret_gap : True := trivial\nend Aux\nabbrev blue_gap');
    expect(tl013(graphOf(modelOf(enclosed)))).toEqual([]);
    expect(tl013(graphOf(masked({ base: gapBase, current: enclosed, ledger: [created('Spyro.Aux.secret_gap', 'proof')] }).model))).toEqual(masked013);
  });

  it('(fixer 2c1 r1) failing safe, when the file without what is left out does not read as the same blocks: a pinned card stays pinned, a hint about a left-out declaration goes', () => {
    const SKY = '/-\n@@ telelean v1\nid: sky-blue\ntype: AXIOM\nnatural_name: The sky is blue\nrationale: seen\nasserted: 2026-11-01\n-/\n';
    const SKY_TWO = '/-\n@@ telelean v1\nid: sky-two\ntype: AXIOM\nnatural_name: The sky is blue again\nrationale: seen\nasserted: 2026-11-01\n-/\n';
    const base = append(B1, MAIN, `${SKY}\n${SKY_TWO}`);
    const PIN = 'lean: Spyro.cynder_dark_past\n-/\n';
    const written = append(B1, MAIN, `${SKY}\ntheorem secret_gap : True := trivial\n\n${SKY_TWO}instance : Inhabited Character := ⟨cynder⟩`);
    const current = edit(edit(written, MAIN, PIN, `${PIN}theorem secret_pin : True := trivial\n`), MAIN, PENDING, HONEST_PROOF);
    const hints = (g: TlGraph) => g.diagnostics.filter((d) => d.code === 'TL013' || d.code === 'TL014').map((d) => [d.code, d.nodeId]);
    expect(hints(graphOf(modelOf(current)))).toEqual([['TL013', 'sky-blue'], ['TL014', 'sky-two']]);
    const text = current[MAIN] as string;
    // A hand-made `lines` entry over another card's whole block: the twin text loses a block, so the build falls back.
    const blockStart = text.indexOf('/-\n@@ telelean v1\nid: new-spyro-pg');
    const blockEnd = text.indexOf('-/', blockStart) + 2;
    const drop = ['Spyro.secret_gap', 'Spyro.secret_pin', 'Spyro.instInhabitedCharacter'];
    const model = build(current, { ...NONE, drop, lines: { [MAIN]: [{ start: blockStart, end: blockEnd }] } });
    const graph = graphOf(model);
    expect(nodeIn(graph, 'cynder-dark-past').status.formal).toBe('formalized');
    expect(nodeIn(graph, 'cynder-dark-past').lean.binding).toBe('pinned');
    expect(nodeIn(graph, 'cynder-dark-past').status).toEqual(nodeIn(graphOf(modelOf(base)), 'cynder-dark-past').status);
    expect(hints(graph)).toEqual([]);
    for (const word of ['secret_gap', 'Inhabited', 'cannot be bound']) expect(JSON.stringify(graph), word).not.toContain(word);
  });

  it('a hidden lemma above a block: its binding’s declaration indices follow the masked declarations', () => {
    const base = append(B1, MAIN, `${BLUE}\nabbrev blue_gap : Prop := True`);
    const current = edit(base, MAIN, BLUE, `theorem pre_blue : True := trivial\n\n${BLUE}`);
    const { model } = masked({ base, current, ledger: [created('Spyro.pre_blue', 'proof')] });
    const file = model.files.get(MAIN);
    const block = file?.blocks.find((b) => b.id === 'spyro-is-blue');
    expect(block?.binding.gapDecl).toBeDefined();
    expect(file?.decls[block?.binding.gapDecl ?? -1]?.fullName).toBe('Spyro.blue_gap');
    expect(strip(graphOf(model))).toEqual(strip(graphOf(modelOf(base))));
  });
});

describe('an indented `.holds`: refs on its first line are shifted by its column, as B’s own build shifts them', () => {
  it('apart from the statement (its own piece) and joined to it', () => {
    const SPACER = 'abbrev spacer : Prop := True\n';
    const INDENTED = `  ${PENDING}`;
    for (const [what, layout] of [['apart', `${SPACER}${INDENTED}`], ['joined', INDENTED]] as const) {
      const base = edit(B1, MAIN, PENDING, layout);
      const proved = edit(pinned(normative(base)), MAIN, INDENTED, `  ${HONEST_PROOF}`);
      const { model } = masked({ base, current: proved, ledger: STATEMENT_LEDGER });
      const target = nodeIn(graphOf(model), TARGET);
      const before = nodeIn(graphOf(modelOf(base)), TARGET);
      expect(target.lean.code, what).toBe(before.lean.code);
      expect(target.lean.refs, what).toEqual(before.lean.refs);
      expect(before.lean.refs?.some((r) => r.nodeId === TARGET), what).toBe(true);
    }
  });
});

describe('fixer 2c1 r1: what else the hidden board must show as the not-proved twin does', () => {
  it('(A-ADV-1) a source and a code-less target formalised at a not-proved finish without a freeze (`created … proof`): their statements are their cards’, formalised as in the proved outcome', () => {
    // pg-no-dark-past, an AXIOM source formalised by the step: with no freeze its statement and `.holds` read `proof` (D2-43).
    const noFreeze = [created('Spyro.pg_no_dark_past', 'proof'), created('Spyro.pg_no_dark_past.holds', 'proof')];
    const notProved = masked({ base: B1, current: STATEMENTS, ledger: noFreeze });
    expect(notProved.mask.drop).toEqual(['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds']);
    expect(projectMaskOf({ current: notProved.current, base: notProved.base, mask: notProved.mask }).drop).toEqual([]);
    const graph = graphOf(notProved.model);
    expect(nodeIn(graph, 'pg-no-dark-past').status.formal).toBe('formalized');
    expect(nodeIn(graph, 'pg-no-dark-past').lean.statement).toBe('Spyro.pg_no_dark_past');
    expect(strip(graph)).toEqual(strip(graphOf(masked({ base: B1, current: STATEMENTS, ledger: STATEMENT_LEDGER }).model)));
    expect(strip(graph)).toEqual(strip(graphOf(masked({ base: B1, current: PROVED1, ledger: STATEMENT_LEDGER }).model)));
    // A code-less target formalised by its own step: proved (frozen statement) or not (no freeze), the same board.
    const BLOCK = (lean: string) => `/-\n@@ telelean v1\nid: fz\ntype: PROPOSITION\nnatural_name: Cynder is dark\npremises: cynder-dark-past\nasserted: 2026-11-01\n${lean}-/\n`;
    const base = append(BASE, MAIN, BLOCK(''));
    const stated = append(BASE, MAIN, `${BLOCK('lean: Spyro.fz\n')}/-- Cynder is dark -/\nabbrev fz : Prop := HasDarkPast cynder`);
    const provedFz = append(stated, MAIN, 'theorem fz.holds : fz := cynder_dark_past.holds');
    const inferences: SessionInference[] = [{ target: 'fz', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] }];
    const proved = masked({ base, current: provedFz, inferences, ledger: [created('Spyro.fz', 'statements'), created('Spyro.fz.holds', 'proof')] });
    const plain = masked({ base, current: stated, inferences, ledger: [created('Spyro.fz', 'proof')] });
    expect(nodeIn(graphOf(plain.model), 'fz').status.formal).toBe('formalized');
    expect(nodeIn(graphOf(proved.model), 'fz').status.proof).toEqual({ kind: 'none' });
    expect(JSON.stringify(graphOf(proved.model))).not.toContain('fz.holds');
    expect(strip(graphOf(plain.model))).toEqual(strip(graphOf(proved.model)));
    // A written premise card's declarations still go with it, whoever created them (the written-premise test above).
  });

  it('(S-V2C1-S2) where facts do not decide the target’s kind (no facts, B without facts, its module failed, its file stale), its `.holds` reads as B’s: pending, as the not-proved twin', () => {
    const files = (texts: Texts) => Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
    const bare = (texts: Texts) => {
      const parsed = files(texts);
      return buildProjectModel({ files: parsed, fileHashes: freshHashes(parsed), library: 'Model' });
    };
    const stale = (texts: Texts) => {
      const parsed = files(texts);
      return buildProjectModel({ files: parsed, fileHashes: { ...freshHashes(parsed), [MAIN]: 'sha-edited-since' }, facts: fakeFacts(parsed, { valueConsts: true, typeConsts: true }), library: 'Model' });
    };
    const ledger = [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')];
    const states: Array<[string, (texts: Texts) => ProjectModel, ProjectModel]> = [
      ['no facts', bare, modelOf(B1)],
      ['B without facts', (texts) => modelOf(texts), bare(B1)],
      ['its module failed', (texts) => modelOf(texts, { moduleStates: { [MAIN]: 'failed' } }), modelOf(B1)],
      ['its file stale', stale, modelOf(B1)],
    ];
    for (const [what, current, base] of states) {
      const view = (texts: Texts) => graphOf(maskedModel({ current: current(texts), base, mask: baseMask({ base, inferences: [INFERENCE], ledger }) }));
      const twin = view(STATEMENTS);
      expect(nodeIn(twin, TARGET).lean.justificationKind, what).toBe('axiom');
      expect(nodeIn(twin, TARGET).status.proof, what).toEqual({ kind: 'pending' });
      for (const proved of [PROVED1, PROVED2]) {
        const target = nodeIn(view(proved), TARGET);
        expect(target.lean.justificationKind, what).toBe('axiom');
        expect(target.status.proof, what).toEqual({ kind: 'pending' });
        expect(strip(view(proved)), what).toEqual(strip(twin));
      }
    }
  });

  it('(S-V2C1-S4) B’s messages for a target’s `.holds` go to the start of its statement: a `.holds` the step moved past another message keeps the twin’s order', () => {
    const LATER = 'def later_def : Prop := HasDarkPast cynder\n';
    const base = edit(B1, MAIN, PENDING, `${PENDING}${LATER}`);
    const statements = pinned(normative(base));
    const moved = edit(edit(statements, MAIN, PENDING, ''), MAIN, LATER, `${LATER}${HONEST_PROOF}`);
    const onLater = (texts: Texts) => message(texts, MAIN, 'def later_def', 'on the later definition');
    const baseFacts = { messages: [message(base, MAIN, 'axiom cynder_not_good.holds', 'B: the claim is pending'), onLater(base)] };
    const one = masked({ base, current: moved, ledger: STATEMENT_LEDGER, baseFacts, facts: { messages: [onLater(moved)] } });
    const two = masked({ base, current: statements, ledger: STATEMENT_LEDGER, baseFacts, facts: { messages: [onLater(statements)] } });
    const lean = (model: ProjectModel) => graphOf(model).diagnostics.filter((d) => d.code === 'LEAN').map((d) => [d.message, d.nodeId ?? d.vocab]);
    expect(lean(two.model)).toEqual([
      ['B: the claim is pending', TARGET],
      ['on the later definition', 'Spyro.later_def'],
    ]);
    expect(lean(one.model)).toEqual(lean(two.model));
    expect(strip(graphOf(one.model))).toEqual(strip(graphOf(two.model)));
  });

  it('(S-V2C1-S5) a derived id telelean wrote back reads as derived again whether a hidden write is still there or was taken out', () => {
    const card = '/-\n@@ telelean v1\ntype: PROPOSITION\nnatural_name: Spyro is purple\npremises: cynder-dark-past\nasserted: 2026-11-01\nlean: Spyro.purple\n-/\n/-- Spyro is purple -/\nabbrev purple : Prop := HasDarkPast cynder\n';
    const base = append(BASE, MAIN, card);
    // A premise written and taken out: only the written id is left (the revert restores the fields it wrote, not the id).
    const takenOut = edit(base, MAIN, '@@ telelean v1\ntype: PROPOSITION\nnatural_name: Spyro is purple\n', '@@ telelean v1\nid: spyro-is-purple\ntype: PROPOSITION\nnatural_name: Spyro is purple\n');
    // The other outcome: Claude's arrow into it as well.
    const withArrow = edit(takenOut, MAIN, 'premises: cynder-dark-past\nasserted', 'premises: cynder-dark-past, new-spyro-pg\nasserted');
    const inferences: SessionInference[] = [{ target: 'spyro-is-purple', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] }];
    const one = masked({ base, current: takenOut, inferences, ledger: [] });
    const two = masked({ base, current: withArrow, inferences, ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: 'spyro-is-purple', step: 's1', why: 'needs it' }] });
    expect(projectMaskOf({ current: one.current, base: one.base, mask: one.mask }).derivedIds).toEqual({ 'spyro-is-purple': 'spyro-is-purple' });
    const tl112 = (graph: TlGraph) => graph.diagnostics.filter((d) => d.code === 'TL112').map((d) => d.nodeId);
    expect(tl112(graphOf(one.model))).toEqual(['spyro-is-purple']);
    expect(strip(graphOf(one.model))).toEqual(strip(graphOf(two.model)));
    expect(strip(graphOf(one.model))).toEqual(strip(graphOf(modelOf(base))));
  });

  it('(S-V2C1-S6) the working copy’s endorsements and lakefile reach the masked build: an endorsed definition and its card stay unflagged, TL110 stays', () => {
    const DEF = '/-- dark -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
    const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder', 'abbrev cynder_dark_past : Prop := DarkChar cynder');
    const endorsements = { Spyro: [{ name: 'Spyro.DarkChar', textHash: endorsementHash(DEF) }] };
    const lakefile = { path: 'lakefile.toml', text: '[leanOptions]\nautoImplicit = true\n' };
    const build = (texts: Texts, extra: Partial<ProjectInput> = {}) => {
      const parsed = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
      return buildProjectModel({ files: parsed, fileHashes: freshHashes(parsed), facts: fakeFacts(parsed, { valueConsts: true, typeConsts: true }), library: 'Model', ...extra });
    };
    const base = build(withDef(B1), { endorsements, lakefile });
    const current = build(withDef(PROVED1), { endorsements, lakefile });
    const flags = (model: ProjectModel) => [model.vocabulary.find((v) => v.name === 'Spyro.DarkChar')?.flags, nodeIn(graphOf(model), 'cynder-dark-past').status.flags];
    expect(flags(build(withDef(PROVED1)))).toEqual([['definitional-choice'], ['definitional-choice']]);
    expect(flags(current)).toEqual([[], []]);
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: STATEMENT_LEDGER });
    const model = maskedModel({ current, base, mask, endorsements, lakefile });
    expect(flags(model)).toEqual(flags(current));
    expect(model.diagnostics.filter((d) => d.code === 'TL110')).toEqual(current.diagnostics.filter((d) => d.code === 'TL110'));
    expect(current.diagnostics.some((d) => d.code === 'TL110')).toBe(true);
  });

  it('(A-ADV-6) no `detail` reaches the masked facts: a failed probe’s error naming a hidden lemma does not, nor the build’s or the check’s', () => {
    const base = modelOf(B1);
    const mutate = (facts: LeanFacts) => {
      facts.detail = 'the check stopped at dark_cynder';
      facts.build.detail = 'the build stopped at dark_cynder';
      facts.check.detail = 'the probe stopped at dark_cynder';
    };
    const current = modelOf(PROVED2, { probe: { status: 'failed', durationMs: 300, detail: 'Main.lean:60: unknown constant Spyro.dark_cynder' } }, mutate);
    expect(JSON.stringify(current.facts)).toContain('unknown constant Spyro.dark_cynder');
    const mask = baseMask({ base, inferences: [INFERENCE], ledger: [...STATEMENT_LEDGER, created('Spyro.dark_cynder', 'proof')] });
    const facts = maskFacts({ current, base, mask });
    expect(JSON.stringify(facts)).not.toContain('dark_cynder');
    expect(facts.probe?.status).toBe('failed');
    expect(probeFailure(facts)).toBe(probeFailure(current.facts, { detail: false }));
  });
});

describe('fixer 2c1 r2: what else the hidden board must show as the not-proved twin does', () => {
  const SKY = '/-\n@@ telelean v1\nid: sky-blue\ntype: AXIOM\nnatural_name: The sky is blue\nrationale: seen\nasserted: 2026-11-01\n-/\n';
  const hints = (g: TlGraph) => g.diagnostics.filter((d) => d.code === 'TL013' || d.code === 'TL014').map((d) => [d.code, d.nodeId, d.message]);
  const follows = (name: string) => `This node is code-less, but \`${name}\` follows after a blank line: remove the blank line to attach it.`;

  it('(R1-2) a target’s `.holds` the step moved below a code-less card, after a blank line: no hint names it, as in the not-proved twin; B’s hint about what follows comes back', () => {
    const base = append(B1, MAIN, SKY);
    const statements = pinned(normative(base));
    const moved = append(edit(statements, MAIN, PENDING, ''), MAIN, `\n${HONEST_PROOF}`);
    expect(hints(graphOf(modelOf(moved)))).toEqual([['TL013', 'sky-blue', follows('cynder_not_good.holds')]]);
    const one = graphOf(masked({ base, current: moved, ledger: STATEMENT_LEDGER }).model);
    const two = graphOf(masked({ base, current: statements, ledger: STATEMENT_LEDGER }).model);
    expect(hints(two)).toEqual([]);
    expect(hints(one)).toEqual(hints(two));
    expect(JSON.stringify(one)).not.toContain('`cynder_not_good.holds` follows');
    expect(strip(one)).toEqual(strip(two));
    // B's hint named a visible declaration after the blank line; the step wrote its `.holds` between: B's hint again.
    const gapBase = append(B1, MAIN, `${SKY}\nabbrev sky_gap : Prop := True`);
    const gapStatements = pinned(normative(gapBase));
    const between = edit(edit(gapStatements, MAIN, PENDING, ''), MAIN, 'abbrev sky_gap', `${HONEST_PROOF}abbrev sky_gap`);
    expect(hints(graphOf(modelOf(between)))).toEqual([['TL013', 'sky-blue', follows('cynder_not_good.holds')]]);
    const three = graphOf(masked({ base: gapBase, current: between, ledger: STATEMENT_LEDGER }).model);
    const four = graphOf(masked({ base: gapBase, current: gapStatements, ledger: STATEMENT_LEDGER }).model);
    expect(hints(four)).toEqual([['TL013', 'sky-blue', follows('sky_gap')]]);
    expect(hints(three)).toEqual(hints(four));
    expect(strip(three)).toEqual(strip(four));
  });

  it('(R1-2) B had the target’s `.holds` below a code-less card: no hint reads it in either outcome, in place or moved, so the two boards agree', () => {
    const base = append(edit(B1, MAIN, PENDING, ''), MAIN, `${SKY}\n${PENDING}`);
    expect(hints(graphOf(modelOf(base)))).toEqual([['TL013', 'sky-blue', follows('cynder_not_good.holds')]]);
    const statements = pinned(normative(base));
    const inPlace = edit(statements, MAIN, PENDING, HONEST_PROOF);
    const movedUp = edit(edit(statements, MAIN, `\n${PENDING}`, ''), MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);
    const twin = graphOf(masked({ base, current: statements, ledger: STATEMENT_LEDGER }).model);
    expect(hints(twin)).toEqual([]);
    for (const [what, current] of [['in place', inPlace], ['moved next to its statement', movedUp]] as const) {
      const graph = graphOf(masked({ base, current, ledger: STATEMENT_LEDGER }).model);
      expect(hints(graph), what).toEqual([]);
      expect(strip(graph), what).toEqual(strip(twin));
    }
  });

  it('(R1-2) failing safe: a block whose gap or adjacent declaration is an overridden `.holds` loses its hint, as for a left-out declaration', () => {
    const base = append(B1, MAIN, `${SKY}\nabbrev sky_gap : Prop := True`);
    const current = edit(edit(pinned(normative(base)), MAIN, PENDING, ''), MAIN, 'abbrev sky_gap', `${HONEST_PROOF}\nabbrev sky_gap`);
    const files = Object.entries(current).map(([path, text]) => parseLeanFile(path, text));
    const facts = fakeFacts(files, { valueConsts: true, typeConsts: true });
    const text = current[MAIN] as string;
    // A hand-made `lines` entry over another card's whole block: the twin text loses a block, so the build falls back.
    const blockStart = text.indexOf('/-\n@@ telelean v1\nid: new-spyro-pg');
    const blockEnd = text.indexOf('-/', blockStart) + 2;
    const B = modelOf(base);
    const mask = projectMaskOf({ current: modelOf(current), base: B, mask: baseMask({ base: B, inferences: [INFERENCE], ledger: STATEMENT_LEDGER }) });
    expect(Object.keys(mask.codeOverride)).toEqual([TARGET_HOLDS]);
    const model = buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model', mask: { ...mask, lines: { [MAIN]: [{ start: blockStart, end: blockEnd }] } } });
    expect(hints(graphOf(modelOf(current)))).toEqual([['TL013', 'sky-blue', follows('cynder_not_good.holds')]]);
    expect(hints(graphOf(model))).toEqual([]);
    expect(JSON.stringify(graphOf(model))).not.toContain('`cynder_not_good.holds` follows');
  });

  it('(R1-3) a card formalised in the session, its statement and `.holds` tight or spaced, a hidden lemma between them tight or spaced: the same code, without blank lines, refs placed by it', () => {
    const STMT = 'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\n';
    const HOLDS = 'axiom pg_no_dark_past.holds : pg_no_dark_past\n';
    const LEMMA = 'theorem pg_helper : True := trivial\n';
    const ledger = [...STATEMENT_LEDGER, created('Spyro.pg_helper', 'proof')];
    const card = (graph: TlGraph) => nodeIn(graph, 'pg-no-dark-past');
    const tight = card(graphOf(modelOf(STATEMENTS)));
    expect(tight.lean.code?.endsWith(`¬ GoodAddition c g\n${HOLDS.trim()}`)).toBe(true);
    for (const [layout, gap] of [['tight', ''], ['spaced', '\n']] as const) {
      const stated = edit(STATEMENTS, MAIN, `${STMT}${HOLDS}`, `${STMT}${gap}${HOLDS}`);
      const twin = graphOf(masked({ base: B1, current: stated, ledger: STATEMENT_LEDGER }).model);
      expect(card(twin).lean.code, layout).toBe(tight.lean.code);
      expect(card(twin).lean.refs, layout).toEqual(tight.lean.refs);
      const variants = [
        ['a tight lemma', `${STMT}${gap}${LEMMA}${HOLDS}`],
        ['a spaced lemma', `${STMT}${gap}\n${LEMMA}\n${HOLDS}`],
        ['a spaced lemma, two blank lines', `${STMT}\n\n${LEMMA}\n\n${HOLDS}`],
      ] as const;
      for (const [what, text] of variants) {
        const proved = edit(edit(STATEMENTS, MAIN, `${STMT}${HOLDS}`, text), MAIN, PENDING, HONEST_PROOF);
        const graph = graphOf(masked({ base: B1, current: proved, ledger }).model);
        expect(card(graph).lean.code, `${layout}, ${what}`).toBe(tight.lean.code);
        expect(card(graph).lean.refs, `${layout}, ${what}`).toEqual(tight.lean.refs);
        expect(JSON.stringify(graph), `${layout}, ${what}`).not.toContain('pg_helper');
        expect(strip(graph), `${layout}, ${what}`).toEqual(strip(twin));
      }
    }
  });

  it('(R1-3) the blank lines go, comment lines stay (a block comment whole, blank lines inside it included), with CRLF too; a card B has keeps B’s layout', () => {
    const STMT = 'abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g\n';
    const HOLDS = 'axiom pg_no_dark_past.holds : pg_no_dark_past\n';
    const NOTE = '-- a note on the assumption\n';
    const BLOCK = '/- a note\n\n   in two paragraphs -/\n';
    const crlf = (t: Texts): Texts => Object.fromEntries(Object.entries(t).map(([p, s]) => [p, s.split('\n').join('\r\n')]));
    const card = (graph: TlGraph) => nodeIn(graph, 'pg-no-dark-past');
    for (const [what, gap, kept] of [
      ['a line comment', `\n${NOTE}\n`, NOTE],
      ['a block comment', `\n${BLOCK}\n`, BLOCK],
      ['a line comment holding `/-`', '\n-- see /- here\n\n', '-- see /- here\n'],
    ] as const) {
      const stated = edit(STATEMENTS, MAIN, `${STMT}${HOLDS}`, `${STMT}${gap}${HOLDS}`);
      for (const [eol, texts] of [['lf', stated], ['crlf', crlf(stated)]] as const) {
        const { model } = masked({ base: eol === 'lf' ? B1 : crlf(B1), current: texts, ledger: STATEMENT_LEDGER });
        const code = card(graphOf(model)).lean.code ?? '';
        const expected = `${STMT}${kept}${HOLDS.trim()}`;
        expect(code.slice(code.indexOf('abbrev pg_no_dark_past')), `${what}, ${eol}`).toBe(eol === 'lf' ? expected : expected.split('\n').join('\r\n'));
        // The proved outcome, with a spaced hidden lemma above the comment (which goes with the `.holds` below it, as in
        // the twin; one right above a lemma would go with that lemma, computeItems' attachment): the same code.
        const lf = (t: string) => (eol === 'lf' ? t : t.split('\n').join('\r\n'));
        const proved = edit(edit(texts, MAIN, lf(STMT), lf(`${STMT}\ntheorem pg_helper : True := trivial\n`)), MAIN, lf(PENDING), lf(HONEST_PROOF));
        const hidden = masked({ base: eol === 'lf' ? B1 : crlf(B1), current: proved, ledger: [...STATEMENT_LEDGER, created('Spyro.pg_helper', 'proof')] });
        expect(card(graphOf(hidden.model)).lean.code, `${what}, ${eol}, proved`).toBe(code);
        expect(card(graphOf(hidden.model)).lean.refs, `${what}, ${eol}, proved`).toEqual(card(graphOf(model)).lean.refs);
      }
    }
    // A card B has with B's texts keeps B's layout, blank line and all.
    const spacedB = edit(B1, MAIN, 'abbrev cynder_dark_past : Prop := HasDarkPast cynder\n', 'abbrev cynder_dark_past : Prop := HasDarkPast cynder\n\n');
    const own = nodeIn(graphOf(masked({ base: spacedB, current: pinned(normative(spacedB)), ledger: STATEMENT_LEDGER }).model), 'cynder-dark-past').lean.code;
    expect(own).toBe(nodeIn(graphOf(modelOf(spacedB)), 'cynder-dark-past').lean.code);
    expect(own).toContain('HasDarkPast cynder\n\naxiom cynder_dark_past.holds');
  });

  it('(R1-1) frozen, as the gate now asks, a step that formalised a card with a new definition records both as statements: the same items but the Result, and the same hidden board, proved or not', () => {
    const DEF = '/-- has a dark character -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
    const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'IsPG g → HasDarkPast c →', 'IsPG g → DarkChar c →');
    const stated = withDef(STATEMENTS);
    const proved = edit(stated, MAIN, PENDING, HONEST_PROOF);
    const frozen = [...STATEMENT_LEDGER, created('Spyro.DarkChar', 'statements')];
    const one = masked({ base: B1, current: proved, ledger: frozen });
    const two = masked({ base: B1, current: stated, ledger: frozen });
    const drafts = (m: { base: ProjectModel; current: ProjectModel }) =>
      computeItems({ base: m.base, current: m.current, ledger: frozen, premises: [], inferences: [INFERENCE], ended: [TARGET] })
        .drafts.filter((d) => d.kind !== 'result')
        .map((d) => [d.key, d.contentKey, d.partOfResult ?? null]);
    expect(drafts(one).map((d) => d[0])).toEqual(['card:pg-no-dark-past', 'decl:Spyro.DarkChar']);
    expect(drafts(one)).toEqual(drafts(two));
    const pg = nodeIn(graphOf(one.model), 'pg-no-dark-past');
    expect(pg.status.flags).toContain('definitional-choice');
    expect(pg.lean.uses).toContain('Spyro.DarkChar');
    expect(graphOf(one.model).vocabulary.map((v) => v.name)).toContain('Spyro.DarkChar');
    expect(strip(graphOf(one.model))).toEqual(strip(graphOf(two.model)));
  });
});
