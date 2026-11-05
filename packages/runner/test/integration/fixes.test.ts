/**
 * The M1 fixes, end to end with Lean 4.35 under runLean on a scratch copy of mental_model/ (real core, fs applier,
 * no git):
 *
 *   - a column-0 comment inside a proof or a multi-line statement no longer cuts the declaration: D->A and delete
 *     take the whole declaration, the attic gets the whole proof, and Lean still builds;
 *   - D-11 on a conditional proof: after "A->G (rewrite)" on an assumption a derivation uses, D->A on that derivation
 *     asks first and "rewrite" drops the arguments, D->G "rewrite" replaces the whole application by the new
 *     hypothesis; Lean builds after each;
 *   - delete with its Lean lists what would break (an untracked lemma, another subject's proof) before doing it.
 */
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TlNode } from '@telelean/core';

import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, listFiles, makeTempDir, read, waitForMemory, write } from '../workspace/helpers.js';

const MAIN = 'Model/Spyro/Main.lean';

const block = (id: string, type: string, name: string, lean: string, rationale?: string) =>
  ['/-', '@@ telelean v1', `id: ${id}`, `type: ${type}`, `natural_name: ${name}`, ...(rationale ? [`rationale: ${rationale}`] : []), `lean: ${lean}`, '-/'].join('\n');

const MAIN_TEXT = [
  'import Model.Spyro.Vocabulary',
  'import Model.Spyro.Inbox',
  '',
  'namespace Spyro',
  '',
  block('cynder-dark-past', 'ASSUMPTION', 'Cynder is a character who has a dark past', 'Spyro.cynder_dark_past', 'familiar with gaming lore'),
  '/-- Cynder is a character who has a dark past -/',
  'abbrev cynder_dark_past : Prop := HasDarkPast cynder',
  'axiom cynder_dark_past.holds : cynder_dark_past',
  '',
  block('new-spyro-pg', 'ASSUMPTION', 'The new Spyro game is PG', 'Spyro.new_spyro_pg', 'known from gaming news'),
  '/-- The new Spyro game is PG -/',
  'abbrev new_spyro_pg : Prop := IsPG newSpyro',
  'axiom new_spyro_pg.holds : new_spyro_pg',
  '',
  block('d1', 'DERIVATION', 'Both hold', 'Spyro.d1'),
  '/-- Both hold -/',
  'abbrev d1 : Prop := cynder_dark_past ∧ new_spyro_pg',
  'theorem d1.holds : d1 := ⟨cynder_dark_past.holds, new_spyro_pg.holds⟩',
  '',
  block('g1', 'GOAL', 'The game is PG, via both', 'Spyro.g1'),
  '/-- The game is PG, via both -/',
  'abbrev g1 : Prop := new_spyro_pg',
  'theorem g1.holds : g1 := d1.holds.2',
  '',
  block('d-col0', 'DERIVATION', 'The game is PG again', 'Spyro.d_col0'),
  '/-- The game is PG again -/',
  'abbrev d_col0 : Prop := IsPG newSpyro',
  'theorem d_col0.holds : d_col0 := by',
  '  unfold d_col0',
  '-- the key step: use the assumption',
  '  exact new_spyro_pg.holds',
  '',
  block('a-multi', 'ASSUMPTION', 'The game is PG, written on two lines', 'Spyro.a_multi', 'same news'),
  '/-- The game is PG, written on two lines -/',
  'abbrev a_multi : Prop :=',
  '-- the game is PG',
  '  IsPG newSpyro',
  'axiom a_multi.holds : a_multi',
  '',
  'end Spyro',
  '',
].join('\n');

describe('the M1 fixes with real Lean on a copy of mental_model/', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;
  const node = (id: string): TlNode | undefined => ws.graph('Spyro').nodes.find((n) => n.id === id);
  const fresh = async () => {
    const summary = await ws.refreshNow();
    const errors = ws
      .graph('Spyro')
      .diagnostics.filter((d) => d.code === 'LEAN' && d.severity === 'error')
      .map((d) => `${d.file}:${(d.range?.start.line ?? -1) + 1}: ${d.message}`);
    expect(summary.state, `${JSON.stringify(summary)}\n${errors.join('\n')}`).toBe('fresh');
  };

  beforeAll(async () => {
    tmp = makeTempDir('itg-fixes');
    root = copyMentalModel(tmp);
    write(root, MAIN, MAIN_TEXT);
    ws = createModelWorkspace({
      root,
      text: fsTextSource(root),
      applier: fsEditApplier(root),
      semantic: { enabled: true, debounceMs: 60_000 }, // refreshes only when the test asks (refreshNow)
      git: { enabled: false },
      generatorVersion: 'integration-test',
    });
    await ws.load();
  });

  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  it('loads; Lean: d1 and d-col0 proved, the cards show the whole proof and the whole multi-line statement', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
    await fresh();
    expect(node('d1')?.status.proof.kind).toBe('proved');
    expect(node('d-col0')?.status.proof.kind).toBe('proved');
    expect(node('d-col0')?.lean.code).toContain('-- the key step: use the assumption\n  exact new_spyro_pg.holds');
    expect(node('a-multi')?.lean.code).toBe('/-- The game is PG, written on two lines -/\nabbrev a_multi : Prop :=\n-- the game is PG\n  IsPG newSpyro\naxiom a_multi.holds : a_multi');
    expect(node('a-multi')?.lean.refs?.map((r) => r.name)).toEqual(expect.arrayContaining(['Spyro.IsPG', 'Spyro.newSpyro']));
  });

  it('D->A on a proof with a column-0 comment replaces the whole proof (attic: all of it); Lean builds', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const before = read(root, MAIN);
    const outcome = await ws.perform({ kind: 'change-kind', id: 'd-col0', to: 'ASSUMPTION', beforeId: null });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Make Assumption: The game is PG again' });
    const main = read(root, MAIN);
    expect(main).toContain('abbrev d_col0 : Prop := IsPG newSpyro\naxiom d_col0.holds : d_col0\n\n');
    expect(main).not.toContain('the key step');
    const attic = read(root, '.telelean/subjects/Spyro/attic/d-col0.lean');
    expect(attic).toContain('theorem d_col0.holds : d_col0 := by\n  unfold d_col0\n-- the key step: use the assumption\n  exact new_spyro_pg.holds\n');
    await fresh();
    expect(node('d-col0')).toMatchObject({ type: 'ASSUMPTION', status: { proof: { kind: 'assumed' } } });
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(before);
  });

  it('delete with Lean of a statement with a column-0 comment removes all of it; Lean builds', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const before = read(root, MAIN);
    const outcome = await ws.perform({ kind: 'delete-node', id: 'a-multi', keepLean: false });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Delete: The game is PG, written on two lines' });
    const main = read(root, MAIN);
    expect(main).not.toContain('a_multi');
    expect(main).not.toContain('-- the game is PG');
    expect(main).toContain('  exact new_spyro_pg.holds\n\nend Spyro\n');
    await fresh();
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(before);
  });

  it('A->G "rewrite" on an assumption d1 uses makes d1 and g1 conditional; D->A on d1 then asks, and "rewrite" drops the arguments', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    await fresh();
    const goal = await ws.perform({ kind: 'change-kind', id: 'cynder-dark-past', to: 'GOAL', beforeId: null, dependents: 'rewrite', confirmedDependents: ['d1', 'g1'] });
    expect(goal, JSON.stringify(goal)).toMatchObject({ ok: true, label: 'Make Goal: Cynder is a character who has a dark past (dependents rewritten)' });
    expect(read(root, MAIN)).toContain('theorem g1.holds (h_cynder_dark_past : cynder_dark_past) : g1 := (d1.holds h_cynder_dark_past).2');
    await fresh();
    expect(node('d1')?.status.proof).toMatchObject({ kind: 'conditional', on: ['cynder-dark-past'] });
    expect(node('g1')?.status.proof).toMatchObject({ kind: 'conditional', on: ['cynder-dark-past'] });
    const conditional = read(root, MAIN);

    // D->A on the conditional derivation: the axiom states d1 directly, so g1's `(d1.holds h)` must change.
    expect(await ws.perform({ kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null })).toMatchObject({ ok: false, code: 'needs-confirmation', dependents: ['g1'] });
    expect(read(root, MAIN)).toBe(conditional);
    const assumption = await ws.perform({ kind: 'change-kind', id: 'd1', to: 'ASSUMPTION', beforeId: null, dependents: 'rewrite', confirmedDependents: ['g1'] });
    expect(assumption, JSON.stringify(assumption)).toMatchObject({ ok: true, label: 'Make Assumption: Both hold (dependents rewritten)' });
    const main = read(root, MAIN);
    expect(main).toContain('axiom d1.holds : d1\n');
    expect(main).toContain('theorem g1.holds (h_cynder_dark_past : cynder_dark_past) : g1 := d1.holds.2');
    await fresh();
    expect(node('d1')).toMatchObject({ type: 'ASSUMPTION', status: { proof: { kind: 'assumed' } } });
    expect(node('g1')?.status.proof).toMatchObject({ kind: 'conditional', on: ['cynder-dark-past'] });
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(conditional);
  });

  it('D->G "rewrite" on the conditional derivation replaces `(d1.holds h)` by the hypothesis h_d1 : d1; Lean builds', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    await fresh();
    const outcome = await ws.perform({ kind: 'change-kind', id: 'd1', to: 'GOAL', beforeId: null, dependents: 'rewrite', confirmedDependents: ['g1'] });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Make Goal: Both hold (dependents rewritten)' });
    expect(read(root, MAIN)).toContain('theorem g1.holds (h_d1 : d1) (h_cynder_dark_past : cynder_dark_past) : g1 := h_d1.2');
    await fresh();
    expect(node('g1')?.status.proof).toMatchObject({ kind: 'conditional', on: ['d1', 'cynder-dark-past'] });
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true }); // back before A->G
    expect(read(root, MAIN)).toBe(MAIN_TEXT);
  });

  it('delete with its Lean lists an untracked lemma and another subject\'s proof first; confirmed, it deletes', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    expect(await ws.perform({ kind: 'create-subject', name: 'Other' })).toMatchObject({ ok: true });
    const otherMain = read(root, 'Model/Other/Main.lean').replace('import Model.Other.Inbox\n', 'import Model.Other.Inbox\nimport Model.Spyro.Main\n');
    const otherGoal = [
      block('other-goal', 'GOAL', "Cynder's past, seen from another subject", 'Other.other_goal'),
      "/-- Cynder's past, seen from another subject -/",
      'abbrev other_goal : Prop := Spyro.HasDarkPast Spyro.cynder',
      'theorem other_goal.holds : other_goal := Spyro.cynder_dark_past.holds',
      '',
    ].join('\n');
    write(root, 'Model/Other/Main.lean', otherMain.replace('end Other\n', `${otherGoal}\nend Other\n`));
    write(root, MAIN, read(root, MAIN).replace('\nend Spyro\n', '\ntheorem helper_lemma : HasDarkPast cynder := cynder_dark_past.holds\n\nend Spyro\n'));
    await ws.invalidate([MAIN, 'Model/Other/Main.lean']);
    await fresh();
    expect(ws.graph('Other').nodes.find((n) => n.id === 'other-goal')?.status.proof.kind).toBe('proved');

    const before = read(root, MAIN);
    const asked = await ws.perform({ kind: 'delete-node', id: 'cynder-dark-past', keepLean: false });
    expect(asked).toMatchObject({ ok: false, code: 'needs-confirmation' });
    if (asked.ok) throw new Error('expected a confirmation request');
    expect(asked.dependents).toEqual(expect.arrayContaining(['d1', 'other-goal', 'Spyro.helper_lemma']));
    expect(read(root, MAIN)).toBe(before);

    const deleted = await ws.perform({ kind: 'delete-node', id: 'cynder-dark-past', keepLean: false, confirmed: true });
    expect(deleted, JSON.stringify(deleted)).toMatchObject({ ok: true, label: 'Delete: Cynder is a character who has a dark past' });
    expect(read(root, MAIN)).not.toContain('abbrev cynder_dark_past');
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(before);
    expect(listFiles(root).some((rel) => rel === path.posix.join('Model', 'Other', 'Main.lean'))).toBe(true);
  });
});
