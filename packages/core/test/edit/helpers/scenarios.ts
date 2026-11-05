/**
 * AT2.6-AT2.8 text scenarios: the plans' exact file texts, labels, layouts and archives. Registered twice: with the
 * reference fake of WP-markup's primitives (plans.fake.test.ts, runs now) and with the real ones
 * (plans.wp1.test.ts, skipped until WP-markup is implemented; the integrator removes the gate).
 */
import { describe, expect, it } from 'vitest';
import { ActionError, type EditPlan, type FileChange } from '../../../src/actions.js';
import { planAction, type PlanContext } from '../../../src/edit/index.js';
import { emptyLayout } from '../../../src/layout.js';
import { buildProjectModel, type ProjectModel } from '../../../src/project/index.js';
import { fakeFacts, freshHashes } from '../../project/helpers/fakeFacts.js';
import { SPYRO_TEXTS, spyroInput, spyroProvedInput, type Parser } from '../../project/helpers/spyro.js';

const CTX: PlanContext = { today: '2026-11-02', now: '2026-11-02T10:00:00.000Z', layouts: {} };

const change = (plan: EditPlan, path: string): FileChange | undefined => plan.changes.find((c) => c.path === path);
const after = (plan: EditPlan, path: string): string | null | undefined => change(plan, path)?.after;

const ZELDA_VOCAB = 'namespace Zelda\n\n/-- heroes -/\naxiom Hero : Type\n\nend Zelda\n';
const ZELDA_MAIN = [
  'import Model.Zelda.Vocabulary',
  '',
  'namespace Zelda',
  '',
  '/-',
  '@@ telelean v1',
  'id: spyro-is-purple',
  'type: GOAL',
  'natural_name: Somebody else wrote this id',
  '-/',
  '',
  'end Zelda',
  '',
].join('\n');

/** A small subject `S` with an adjacently bound, id-less assumption (D-8 pinning and derived ids). */
const ADJ_VOCAB = 'namespace S\n\n/-- things -/\naxiom T : Type\n/-- is good -/\naxiom Good : T → Prop\n\nend S\n';
const ADJ_MAIN = [
  'import Model.S.Vocabulary',
  '',
  'namespace S',
  '',
  '/-',
  '@@ telelean v1',
  'type: ASSUMPTION',
  'natural_name: Everything is good',
  'asserted: 2026-11-01',
  '-/',
  '/-- Everything is good -/',
  'abbrev all_good : Prop := ∀ x : T, Good x',
  'axiom all_good.holds : all_good',
  '',
  'end S',
  '',
].join('\n');

function project(parse: Parser, texts: Record<string, string>, facts = true): ProjectModel {
  const files = Object.entries(texts).map(([path, text]) => parse(path, text));
  return buildProjectModel({ files, fileHashes: freshHashes(files), ...(facts ? { facts: fakeFacts(files) } : {}), library: 'Model' });
}

function refusal(fn: () => unknown): ActionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
}

export function planScenarios(parse: Parser): void {
  const spyro = () => buildProjectModel(spyroInput(parse));
  const proved = () => buildProjectModel(spyroProvedInput(parse));

  describe('AT2.6 add-node', () => {
    it('creates a missing Inbox from the scaffold text, imports it from the library root (legacy layout), appends the card', () => {
      const plan = planAction(spyro(), { kind: 'add-node', subject: 'Spyro', type: 'ASSUMPTION', naturalName: '  Spyro is purple ', rationale: 'seen it', stance: 'believe' }, CTX);
      expect(plan).toMatchObject({ action: 'add-node', label: 'Add assumption: Spyro is purple', subject: 'Spyro', nodes: ['spyro-is-purple'], nodeId: 'spyro-is-purple' });
      expect(plan.changes.map((c) => [c.path, c.before === null])).toEqual([
        ['Model.lean', false],
        ['Model/Spyro/Inbox.lean', true],
      ]);
      expect(after(plan, 'Model.lean')).toBe('import Model.Spyro.Main\nimport Model.Spyro.Inbox\n');
      expect(after(plan, 'Model/Spyro/Inbox.lean')).toBe(
        [
          'import Model.Spyro.Vocabulary',
          '',
          '-- New cards typed on the telelean board are added here.',
          'namespace Spyro',
          '',
          '/-',
          '@@ telelean v1',
          'id: spyro-is-purple',
          'type: ASSUMPTION',
          'natural_name: Spyro is purple',
          'rationale: seen it',
          'stance: believe',
          'asserted: 2026-11-02',
          '-/',
          '',
          'end Spyro',
          '',
        ].join('\n'),
      );
      expect(plan.layout).toEqual({
        subject: 'Spyro',
        layout: { ...emptyLayout(), columns: { ASSUMPTION: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'spyro-is-purple'], DERIVATION: [], GOAL: ['cynder-not-good'] } },
      });
    });

    it('imports a created Inbox from the subject root when there is one; ids are unique across subjects', () => {
      const model = project(parse, {
        'Model.lean': 'import Model.Spyro\nimport Model.Zelda.Main\n',
        'Model/Spyro.lean': 'import Model.Spyro.Main\n',
        'Model/Spyro/Main.lean': SPYRO_TEXTS.main,
        'Model/Spyro/Vocabulary.lean': SPYRO_TEXTS.vocabulary,
        'Model/Zelda/Main.lean': ZELDA_MAIN,
        'Model/Zelda/Vocabulary.lean': ZELDA_VOCAB,
      });
      const plan = planAction(model, { kind: 'add-node', subject: 'Spyro', type: 'GOAL', naturalName: 'Spyro is purple' }, CTX);
      expect(plan.nodeId).toBe('spyro-is-purple-2');
      expect(plan.label).toBe('Add goal: Spyro is purple');
      expect(plan.changes.map((c) => c.path)).toEqual(['Model/Spyro.lean', 'Model/Spyro/Inbox.lean']);
      expect(after(plan, 'Model/Spyro.lean')).toBe('import Model.Spyro.Main\nimport Model.Spyro.Inbox\n');
    });

    it('adds to an existing Inbox at the end of its namespace, verbatim (trimmed) sentence, escaped when needed', () => {
      const inbox = 'import Model.S.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace S\n\nend S\n';
      const model = project(parse, { 'Model/S/Vocabulary.lean': ADJ_VOCAB, 'Model/S/Inbox.lean': inbox, 'Model/S/Main.lean': ADJ_MAIN });
      const plan = planAction(model, { kind: 'add-node', subject: 'S', type: 'DERIVATION', naturalName: 'It follows -/ really' }, CTX);
      expect(plan.changes.map((c) => c.path)).toEqual(['Model/S/Inbox.lean']);
      expect(after(plan, 'Model/S/Inbox.lean')).toBe(
        'import Model.S.Vocabulary\n\n-- New cards typed on the telelean board are added here.\nnamespace S\n\n/-\n@@ telelean v1\nid: it-follows-really\ntype: DERIVATION\nnatural_name: "It follows -\\/ really"\nasserted: 2026-11-02\n-/\n\nend S\n',
      );
      expect(plan.layout?.layout.columns.DERIVATION).toEqual(['it-follows-really']);
      expect(refusal(() => planAction(model, { kind: 'add-node', subject: 'S', type: 'GOAL', naturalName: '   ' }, CTX)).code).toBe('invalid');
      expect(refusal(() => planAction(model, { kind: 'add-node', subject: 'Nope', type: 'GOAL', naturalName: 'x' }, CTX)).code).toBe('not-found');
    });
  });

  describe('AT2.6 edit-node', () => {
    it('the docstring mirror follows when the docstring equals the old sentence', () => {
      const plan = planAction(spyro(), { kind: 'edit-node', id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a very dark past' }, CTX);
      expect(plan).toMatchObject({ action: 'edit-node', label: 'Edit sentence: Cynder has a very dark past', subject: 'Spyro', nodes: ['cynder-dark-past'] });
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(
        SPYRO_TEXTS.main
          .replace('natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder has a very dark past')
          .replace('/-- Cynder is a character who has a dark past -/', '/-- Cynder has a very dark past -/'),
      );
    });

    it('the docstring is left alone when it differs from the old sentence', () => {
      const plan = planAction(proved(), { kind: 'edit-node', id: 'pg-no-dark-past', field: 'naturalName', value: 'PG games avoid dark pasts' }, CTX);
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(SPYRO_TEXTS.provedMain.replace('natural_name: PG games cannot have characters with dark pasts', 'natural_name: PG games avoid dark pasts'));
    });

    it('an adjacent binding gets pinned (lean:) and a derived id written (id:)', () => {
      const model = project(parse, { 'Model/S/Vocabulary.lean': ADJ_VOCAB, 'Model/S/Main.lean': ADJ_MAIN });
      const plan = planAction(model, { kind: 'edit-node', id: 'everything-is-good', field: 'rationale', value: 'I looked' }, CTX);
      expect(plan.label).toBe('Edit why: Everything is good');
      expect(after(plan, 'Model/S/Main.lean')).toBe(
        ADJ_MAIN.replace(
          '@@ telelean v1\ntype: ASSUMPTION\nnatural_name: Everything is good\nasserted: 2026-11-01\n-/',
          '@@ telelean v1\nid: everything-is-good\ntype: ASSUMPTION\nnatural_name: Everything is good\nrationale: I looked\nasserted: 2026-11-01\nlean: S.all_good\n-/',
        ),
      );
    });

    it('a derived id suffixed for workspace uniqueness is the one written back', () => {
      const zelda = ZELDA_MAIN.replace('id: spyro-is-purple\ntype: GOAL\nnatural_name: Somebody else wrote this id', 'type: GOAL\nnatural_name: Cynder dark past');
      const model = project(parse, {
        'Model.lean': 'import Model.Spyro.Main\nimport Model.Zelda.Main\n',
        'Model/Spyro/Main.lean': SPYRO_TEXTS.main,
        'Model/Spyro/Vocabulary.lean': SPYRO_TEXTS.vocabulary,
        'Model/Zelda/Main.lean': zelda,
        'Model/Zelda/Vocabulary.lean': ZELDA_VOCAB,
      });
      expect(model.nodes.get('cynder-dark-past-2')?.file).toBe('Model/Zelda/Main.lean');
      const plan = planAction(model, { kind: 'edit-node', id: 'cynder-dark-past-2', field: 'rationale', value: 'lore' }, CTX);
      expect(after(plan, 'Model/Zelda/Main.lean')).toBe(
        zelda.replace('type: GOAL\nnatural_name: Cynder dark past', 'id: cynder-dark-past-2\ntype: GOAL\nnatural_name: Cynder dark past\nrationale: lore'),
      );
    });

    it('null removes rationale, stance or source (never the sentence); chips are validated', () => {
      const model = spyro();
      const plan = planAction(model, { kind: 'edit-node', id: 'new-spyro-pg', field: 'source', value: null }, CTX);
      expect(plan.label).toBe('Set source: none (The new Spyro game is PG)');
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(SPYRO_TEXTS.main.replace('source: reported\n', ''));
      const stance = planAction(model, { kind: 'edit-node', id: 'new-spyro-pg', field: 'stance', value: 'supposing' }, CTX);
      expect(stance.label).toBe('Set stance: supposing (The new Spyro game is PG)');
      expect(after(stance, 'Model/Spyro/Main.lean')).toBe(SPYRO_TEXTS.main.replace('rationale: known from gaming news\nsource: reported', 'rationale: known from gaming news\nstance: supposing\nsource: reported'));
      expect(refusal(() => planAction(model, { kind: 'edit-node', id: 'new-spyro-pg', field: 'naturalName', value: null }, CTX)).code).toBe('invalid');
      expect(refusal(() => planAction(model, { kind: 'edit-node', id: 'new-spyro-pg', field: 'stance', value: 'certain' }, CTX)).code).toBe('invalid');
      expect(refusal(() => planAction(model, { kind: 'edit-node', id: 'nope', field: 'rationale', value: 'x' }, CTX)).code).toBe('not-found');
    });
  });

  describe('AT2.6 set-premises and create-subject', () => {
    it('set-premises replaces premises:', () => {
      const plan = planAction(spyro(), { kind: 'set-premises', target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] }, CTX);
      expect(plan).toMatchObject({ action: 'set-premises', label: 'These suffice: Cynder would not be a good addition to the new Spyro game ← 2 premises', nodes: ['cynder-not-good', 'cynder-dark-past', 'new-spyro-pg'] });
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(SPYRO_TEXTS.main.replace('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg'));
    });

    it('create-subject writes the scaffold and imports the subject root after the last import of Model.lean', () => {
      const plan = planAction(spyro(), { kind: 'create-subject', name: 'Zelda' }, CTX);
      expect(plan).toMatchObject({ action: 'create-subject', label: 'New subject: Zelda', subject: 'Zelda', nodes: [], layout: { subject: 'Zelda', layout: emptyLayout() } });
      expect(plan.changes.map((c) => [c.path, c.before === null])).toEqual([
        ['Model.lean', false],
        ['Model/Zelda.lean', true],
        ['Model/Zelda/Inbox.lean', true],
        ['Model/Zelda/Main.lean', true],
        ['Model/Zelda/Vocabulary.lean', true],
      ]);
      expect(after(plan, 'Model.lean')).toBe('import Model.Spyro.Main\nimport Model.Zelda\n');
      expect(after(plan, 'Model/Zelda.lean')).toBe('import Model.Zelda.Vocabulary\nimport Model.Zelda.Inbox\nimport Model.Zelda.Main\n');
      expect(refusal(() => planAction(spyro(), { kind: 'create-subject', name: 'Spyro' }, CTX)).code).toBe('invalid');
      expect(refusal(() => planAction(spyro(), { kind: 'create-subject', name: 'zelda' }, CTX)).code).toBe('invalid');
    });
  });

  describe('AT2.7 delete-node', () => {
    it('removes the block, its statement and .holds, and the id from other premises', () => {
      const plan = planAction(spyro(), { kind: 'delete-node', id: 'cynder-dark-past', keepLean: false }, { ...CTX, layouts: { Spyro: emptyLayout() } });
      expect(plan).toMatchObject({ action: 'delete-node', label: 'Delete: Cynder is a character who has a dark past', nodes: ['cynder-dark-past', 'cynder-not-good'] });
      expect(plan.archive).toBeUndefined();
      const lines = SPYRO_TEXTS.main.split('\n');
      const expected = [...lines.slice(0, 13), ...lines.slice(27)].join('\n').replace('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: new-spyro-pg, pg-no-dark-past');
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(expected);
      expect(plan.layout).toEqual({ subject: 'Spyro', layout: emptyLayout() });
    });

    it('archives a theorem .holds; keepLean leaves the declarations', () => {
      const plan = planAction(proved(), { kind: 'delete-node', id: 'cynder-not-good', keepLean: false }, CTX);
      expect(plan.archive).toEqual([
        {
          subject: 'Spyro',
          nodeId: 'cynder-not-good',
          declName: 'Spyro.cynder_not_good.holds',
          text: 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds',
          reason: 'deleted',
        },
      ]);
      const keep = planAction(spyro(), { kind: 'delete-node', id: 'new-spyro-pg', keepLean: true }, CTX);
      const text = after(keep, 'Model/Spyro/Main.lean') ?? '';
      expect(text).toContain('abbrev new_spyro_pg : Prop := IsPG newSpyro\naxiom new_spyro_pg.holds : new_spyro_pg');
      expect(text).not.toContain('id: new-spyro-pg');
      expect(text).toContain('premises: cynder-dark-past, pg-no-dark-past');
    });
  });

  describe('AT2.8 change-kind', () => {
    it('G->A adds the axiom and the rationale; the card moves to the Assumptions column', () => {
      const plan = planAction(spyro(), { kind: 'change-kind', id: 'cynder-not-good', to: 'ASSUMPTION', beforeId: null, rationale: 'it follows from lore' }, CTX);
      expect(plan.label).toBe('Make Assumption: Cynder would not be a good addition to the new Spyro game');
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(
        SPYRO_TEXTS.main
          .replace(
            'type: GOAL\nnatural_name: Cynder would not be a good addition to the new Spyro game\n',
            'type: ASSUMPTION\nnatural_name: Cynder would not be a good addition to the new Spyro game\nrationale: it follows from lore\n',
          )
          .replace('abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\naxiom cynder_not_good.holds : cynder_not_good\n'),
      );
      expect(plan.layout?.layout.columns).toEqual({ ASSUMPTION: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'cynder-not-good'], DERIVATION: [], GOAL: [] });
    });

    it('G->A on a proved goal turns the theorem into the axiom and archives the proof', () => {
      const plan = planAction(proved(), { kind: 'change-kind', id: 'cynder-not-good', to: 'ASSUMPTION', beforeId: 'pg-no-dark-past' }, CTX);
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(
        SPYRO_TEXTS.provedMain
          .replace('type: GOAL', 'type: ASSUMPTION')
          .replace('theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds', 'axiom cynder_not_good.holds : cynder_not_good'),
      );
      expect(plan.archive).toMatchObject([{ declName: 'Spyro.cynder_not_good.holds', reason: 'Goal -> Assumption', nodeId: 'cynder-not-good' }]);
      expect(plan.layout?.layout.columns.ASSUMPTION).toEqual(['cynder-not-good', 'pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
    });

    it('A->G with rewrite: the dependent takes the hypothesis as its first binder and the result is conditional after re-parse', () => {
      const plan = planAction(proved(), { kind: 'change-kind', id: 'cynder-dark-past', to: 'GOAL', beforeId: null, dependents: 'rewrite', confirmedDependents: ['cynder-not-good'] }, CTX);
      expect(plan.label).toBe('Make Goal: Cynder is a character who has a dark past (dependents rewritten)');
      const text = after(plan, 'Model/Spyro/Main.lean') ?? '';
      expect(text).toBe(
        SPYRO_TEXTS.provedMain
          .replace('id: cynder-dark-past\ntype: ASSUMPTION', 'id: cynder-dark-past\ntype: GOAL')
          .replace('axiom cynder_dark_past.holds : cynder_dark_past\n', '')
          .replace(
            'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds',
            'theorem cynder_not_good.holds (h_cynder_dark_past : cynder_dark_past) : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds h_cynder_dark_past',
          ),
      );
      // Re-parse the result and let (stand-in) Lean check it: the goal is now conditional on cynder-dark-past.
      const files = [parse('Model.lean', SPYRO_TEXTS.root), parse('Model/Spyro/Main.lean', text), parse('Model/Spyro/Vocabulary.lean', SPYRO_TEXTS.vocabulary)];
      const model = buildProjectModel({ files, fileHashes: freshHashes(files), facts: fakeFacts(files), library: 'Model' });
      expect(model.nodes.get('cynder-not-good')?.node.status.proof).toMatchObject({ kind: 'conditional', on: ['cynder-dark-past'] });
      expect(model.nodes.get('cynder-dark-past')?.node.type).toBe('GOAL');
    });

    it('A->G with mark-broken removes the axiom and keeps the dependent as is', () => {
      const plan = planAction(proved(), { kind: 'change-kind', id: 'cynder-dark-past', to: 'GOAL', beforeId: null, dependents: 'mark-broken', confirmedDependents: ['cynder-not-good'] }, CTX);
      expect(plan.label).toBe('Make Goal: Cynder is a character who has a dark past (dependents marked broken)');
      expect(after(plan, 'Model/Spyro/Main.lean')).toBe(SPYRO_TEXTS.provedMain.replace('id: cynder-dark-past\ntype: ASSUMPTION', 'id: cynder-dark-past\ntype: GOAL').replace('axiom cynder_dark_past.holds : cynder_dark_past\n', ''));
    });

    it('A->D keeps the axiom (pending promotion): only type: changes', () => {
      const plan = planAction(spyro(), { kind: 'change-kind', id: 'new-spyro-pg', to: 'DERIVATION', beforeId: null }, CTX);
      expect(plan.changes).toEqual([{ path: 'Model/Spyro/Main.lean', before: SPYRO_TEXTS.main, after: SPYRO_TEXTS.main.replace('id: new-spyro-pg\ntype: ASSUMPTION', 'id: new-spyro-pg\ntype: DERIVATION') }]);
      expect(plan.label).toBe('Make Derivation: The new Spyro game is PG');
    });
  });
}
