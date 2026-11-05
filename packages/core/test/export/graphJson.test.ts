/**
 * AT2.10: toGraphJson covers every subject, is deterministic, and validates against the zod schema (the Spyro export
 * included); the committed JSON Schema check is in schema.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { GRAPH_JSON_FORMAT, GRAPH_JSON_VERSION, toGraphJson } from '../../src/export/index.js';
import { graphJsonSchema } from '../../src/export/schema.js';
import { buildProjectModel } from '../../src/project/index.js';
import { block, build, mainS, VOCAB_S } from '../project/helpers/build.js';
import { parseFixture } from '../project/helpers/parseFixture.js';
import { SPYRO_HASHES, SPYRO_PROVED_HASHES, spyroInput, spyroModel, spyroProvedModel } from '../project/helpers/spyro.js';

const OPTIONS = { generatorVersion: '0.1.0', generatedAt: '2026-11-01T03:00:00.000Z', fileHashes: SPYRO_HASHES };

describe('AT2.10 graph.json', () => {
  it('exports the Spyro walkthrough: every node, the vocabulary, the edges, the files with their hashes', () => {
    const json = toGraphJson(spyroModel(parseFixture), OPTIONS);
    expect(graphJsonSchema.parse(json)).toEqual(json);
    expect(json).toMatchObject({
      format: GRAPH_JSON_FORMAT,
      format_version: GRAPH_JSON_VERSION,
      generator: { name: 'telelean', version: '0.1.0' },
      position_encoding: 'utf-16',
      line_base: 0,
      generated_at: '2026-11-01T03:00:00.000Z',
      semantic: { available: true, stale: false, toolchain: 'leanprover/lean4:v4.35.0', checked_at: '2026-11-01T02:00:01.200Z', status: 'ok' },
      subjects: [{ name: 'Spyro', files: ['Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean'], node_count: 4 }],
      attempts: [],
      files: [
        { path: 'Model.lean', sha256: 'sha-model-root', node_count: 0 },
        { path: 'Model/Spyro/Main.lean', sha256: 'sha-main', node_count: 4 },
        { path: 'Model/Spyro/Vocabulary.lean', sha256: 'sha-vocabulary', node_count: 0 },
      ],
    });
    expect(json.nodes.map((n) => n.id)).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'cynder-not-good']);
    expect(json.nodes[1]).toEqual({
      id: 'cynder-dark-past',
      subject: 'Spyro',
      type: 'ASSUMPTION',
      natural_name: 'Cynder is a character who has a dark past',
      rationale: 'familiar with gaming lore',
      stance: null,
      source: 'common',
      asserted: '2026-11-01',
      premises: [],
      worded_by: 'user',
      location: { file: 'Model/Spyro/Main.lean', range: { start: { line: 13, character: 0 }, end: { line: 22, character: 2 } }, markup_version: 1 },
      lean: {
        binding: 'pinned',
        statement: 'Spyro.cynder_dark_past',
        justification: 'Spyro.cynder_dark_past.holds',
        justification_kind: 'axiom',
        uses: ['Spyro.HasDarkPast', 'Spyro.cynder'],
        presupposes: ['Spyro.Character.exists'],
        axioms: ['Classical.choice', 'Spyro.Character', 'Spyro.HasDarkPast', 'Spyro.Character.exists', 'Spyro.cynder_dark_past.holds'],
      },
      status: { formal: 'formalized', proof: 'assumed', footprint: [], conditional_on: [], flags: [] },
      extensions: {},
    });
    expect(json.vocabulary).toHaveLength(9);
    expect(json.edges.map((e) => [e.type, e.source, e.target, e.conditional, e.mismatch])).toEqual([
      ['premise', 'cynder-dark-past', 'cynder-not-good', false, null],
      ['premise', 'new-spyro-pg', 'cynder-not-good', false, null],
      ['premise', 'pg-no-dark-past', 'cynder-not-good', false, null],
    ]);
    expect(json.diagnostics).toEqual([
      {
        code: 'TL011',
        severity: 'info',
        message: 'This rule has no `rationale:` yet (no source yet: where does it come from?).',
        file: 'Model/Spyro/Main.lean',
        range: { start: { line: 4, character: 0 }, end: { line: 11, character: 2 } },
        node_id: 'pg-no-dark-past',
      },
    ]);
  });

  it('exports proofs: the footprint of a proved node, verified edges', () => {
    const json = toGraphJson(spyroProvedModel(parseFixture), { ...OPTIONS, fileHashes: SPYRO_PROVED_HASHES });
    graphJsonSchema.parse(json);
    expect(json.nodes.find((n) => n.id === 'cynder-not-good')?.status).toEqual({
      formal: 'formalized',
      proof: 'proved',
      footprint: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'],
      conditional_on: [],
      flags: ['proved-goal'],
    });
    expect(json.edges.filter((e) => e.type === 'verified')).toHaveLength(3);
  });

  it('semantic.stale means files changed since the facts (not a failed module)', () => {
    const input = spyroInput(parseFixture);
    const changed = { ...SPYRO_HASHES, 'Model/Spyro/Main.lean': 'sha-typed-since' };
    const stale = toGraphJson(buildProjectModel({ ...input, fileHashes: changed }), { ...OPTIONS, fileHashes: changed });
    expect(stale.semantic.stale).toBe(true);
    const facts = input.facts;
    if (!facts) throw new Error('fixture');
    const failed = { ...facts, status: 'build-errors' as const, modules: facts.modules.map((m) => (m.file === 'Model/Spyro/Main.lean' ? { ...m, state: 'failed' as const } : m)) };
    const json = toGraphJson(buildProjectModel({ ...input, facts: failed }), OPTIONS);
    expect(json.semantic).toMatchObject({ stale: false, status: 'build-errors' });
    expect(json.nodes.find((n) => n.id === 'cynder-dark-past')?.status.flags).toEqual(['not-checked']);
  });

  it('is deterministic: the same model gives the same document, whatever the order of the input files', () => {
    const input = spyroInput(parseFixture);
    const a = JSON.stringify(toGraphJson(buildProjectModel(input), OPTIONS));
    const b = JSON.stringify(toGraphJson(buildProjectModel({ ...input, files: [...input.files].reverse() }), OPTIONS));
    expect(a).toBe(b);
    expect(JSON.stringify(toGraphJson(buildProjectModel(input), OPTIONS))).toBe(a);
  });

  it('validates a project with every kind of field filled (conditional proofs, mismatches, diagnostics, no facts)', () => {
    const body = [
      block({ id: 'a', type: 'ASSUMPTION', name: 'A holds', lean: 'S.a' }),
      'abbrev a : Prop := Good t',
      '',
      block({ id: 'd', type: 'DERIVATION', name: 'D holds', lean: 'S.d' }),
      'abbrev d : Prop := Good t',
      'theorem d.holds (h : a) : d := h',
      '',
      '/-',
      '@@ telelean v1',
      'id: x',
      'type: GOAL',
      'natural_name: "quoted -\\/ sentence"',
      'premises: nope',
      'x.custom: kept',
      '-/',
    ].join('\n');
    for (const facts of [undefined, false] as const) {
      const { model, hashes } = build({ 'Model/S/Vocabulary.lean': VOCAB_S, 'Model/S/Main.lean': mainS(body) }, facts === false ? { facts: false } : {});
      const json = toGraphJson(model, { ...OPTIONS, fileHashes: hashes });
      expect(graphJsonSchema.parse(json)).toEqual(json);
      expect(json.nodes.find((n) => n.id === 'x')?.extensions).toEqual({ 'x.custom': 'kept' });
      if (facts === undefined) {
        // Format 1.1: the hypotheses in `conditional_on`, the real footprint (what the proof rests on) in `footprint`.
        expect(json.nodes.find((n) => n.id === 'd')?.status).toMatchObject({ proof: 'conditional', footprint: ['presup:S.T.exists'], conditional_on: ['a'] });
        expect(json.edges.find((e) => e.source === 'a' && e.target === 'd')).toMatchObject({ conditional: true, mismatch: 'used-undeclared' });
      } else {
        expect(json.semantic).toEqual({ available: false, stale: false, toolchain: null, checked_at: null, status: 'unavailable' });
      }
    }
  });

  it('rejects documents that break the format', () => {
    const json = toGraphJson(spyroModel(parseFixture), OPTIONS);
    expect(graphJsonSchema.safeParse({ ...json, format: 'other' }).success).toBe(false);
    expect(graphJsonSchema.safeParse({ ...json, format_version: '2.0' }).success).toBe(false);
    expect(graphJsonSchema.safeParse({ ...json, nodes: [{ ...json.nodes[0], type: 'LEMMA' }] }).success).toBe(false);
    expect(graphJsonSchema.safeParse({ ...json, future_field: { anything: 1 } }).success).toBe(true);
    // A format 1.0 document (no `conditional_on`) still validates.
    const v10 = { ...json, format_version: '1.0', nodes: json.nodes.map((n) => ({ ...n, status: { formal: n.status.formal, proof: n.status.proof, footprint: n.status.footprint, flags: n.status.flags } })) };
    expect(graphJsonSchema.safeParse(v10).success).toBe(true);
  });
});
