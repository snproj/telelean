/**
 * Integration of the real core, semantic layer and workspace (docs/m1-plan.md section 11.3), with Lean 4.35 under
 * runLean on scratch copies only:
 *
 *   1. WP2's hand-written facts fixtures against WP3's real facts: the Spyro fixture, the proved overlay and the
 *      derivation variant built by Lean give the same cards, statuses, edges and vocabulary as the hand-written facts
 *      (and the frozen samples spyroGraph() / spyroProvedGraph()); since slice 2b3a also every declaration's value and
 *      type constants, name for name, and the isolated probe's marker (UPDATE_SEMANTIC_RECORDINGS=1 writes Lean's type
 *      constants and the marker into the hand-written facts, leaving everything else as it is);
 *   2. a board session on a copy of mental_model/ with the proved Main.lean, inside a user's git repository:
 *      P->A on the proved proposition (spec v4: the theorem becomes the axiom, its arrows go, Lean agrees; undo is
 *      byte-exact; A->P is refused), a proposition used by a proof (verified edge), set-premises (a used-undeclared
 *      mismatch), reorder, delete (attic), the history (listing, storage counter, revert, undo of the revert),
 *      graph.json validated against the schema, and the user's branch, index and hooks untouched. (The change to Goal
 *      with its "rewrite"/"mark broken" choices went with the GOAL kind.)
 */
import { chmodSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildProjectModel, parseLeanFile, spyroGraph, spyroProvedGraph, subjectGraph, type LeanFacts, type TlGraph, type TlNode } from '@telelean/core';

import { graphJsonSchema } from '../../../core/src/export/schema.js';
import { refreshLeanFacts, runExclusive } from '../../src/semantic/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, listFiles, makeTempDir, read, REPO_ROOT, sha256, SPYRO_FIXTURE, userGit, waitForMemory, write } from '../workspace/helpers.js';

const RUN = `itg${process.pid}`;
const CORE_FIXTURES = path.join(REPO_ROOT, 'packages', 'core', 'test', 'fixtures', 'project');
const PROVED_MAIN = readFileSync(path.join(REPO_ROOT, 'test-fixtures', 'runner-lean', 'overlays', 'proved', 'Model', 'Spyro', 'Main.lean'), 'utf8');
const DERIVED_MAIN = readFileSync(path.join(CORE_FIXTURES, 'spyro-derived', 'Main.lean'), 'utf8');
const MAIN = 'Model/Spyro/Main.lean';
let runs = 0;

async function realFacts(root: string): Promise<LeanFacts> {
  return runExclusive(() => refreshLeanFacts({ root, library: 'Model', runId: `${RUN}_${++runs}` }));
}

const isModelFile = (rel: string) => rel === 'Model.lean' || (rel.startsWith('Model/') && rel.endsWith('.lean'));

/** The Spyro board core builds from the files under `root` with `facts` (and these hashes, default: the real ones). */
function boardOf(root: string, facts: LeanFacts, hashes?: Record<string, string>): TlGraph {
  const files = listFiles(root).filter(isModelFile);
  const fileHashes = hashes ?? Object.fromEntries(files.map((rel) => [rel, sha256(read(root, rel))]));
  const model = buildProjectModel({ files: files.map((rel) => parseLeanFile(rel, read(root, rel))), fileHashes, facts, library: 'Model' });
  return subjectGraph(model, 'Spyro', { version: 1, semantic: { state: 'fresh' } });
}

const comparable = (graph: TlGraph) => ({
  nodes: graph.nodes,
  edges: graph.edges.map((e) => e.id).sort(),
  mismatches: graph.edges.filter((e) => e.mismatch).map((e) => `${e.id}:${e.mismatch}`).sort(),
  vocabulary: graph.vocabulary.map((v) => ({ ...v, usedBy: [...v.usedBy].sort() })),
  diagnostics: graph.diagnostics.map((d) => [d.code, d.nodeId ?? d.vocab ?? null]).sort(),
});

/**
 * Slice 2b3a: Lean's type constants and the isolated probe's marker written into a hand-written facts file (each
 * declaration's `typeConsts` right after its `valueConsts`, the marker last), everything else left as it is.
 */
function writeHandConsts(file: string, real: LeanFacts): void {
  const hand = JSON.parse(readFileSync(file, 'utf8')) as LeanFacts & Record<string, unknown>;
  const decls = hand.decls.map((d) => {
    const typeConsts = real.decls.find((x) => x.name === d.name)?.typeConsts;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(d)) {
      if (key === 'typeConsts') continue;
      out[key] = value;
      if (key === 'valueConsts' && typeConsts !== undefined) out['typeConsts'] = typeConsts;
    }
    if (!('valueConsts' in d) && typeConsts !== undefined) out['typeConsts'] = typeConsts;
    return out;
  });
  const { probe: _old, ...rest } = hand;
  writeFileSync(file, `${JSON.stringify({ ...rest, decls, probe: { status: 'ok', durationMs: 600 } }, null, 2)}\n`);
}

/** The text with `import Model.Spyro.Inbox` after the Vocabulary import, as mental_model/ has it (plan 7.4). */
const withInboxImport = (text: string) => text.replace('import Model.Spyro.Vocabulary\n', 'import Model.Spyro.Vocabulary\nimport Model.Spyro.Inbox\n');

describe('WP2 hand-written facts vs WP3 real facts (plan 11.3)', () => {
  it('the fixture, the proved overlay and the derivation variant give the same boards from Lean as from the hand-written facts', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
    const tmp = makeTempDir('itg-facts');
    try {
      const root = path.join(tmp, 'spyro');
      cpSync(SPYRO_FIXTURE, root, { recursive: true, filter: (src) => !src.includes(`${path.sep}.lake`) && !src.includes(`${path.sep}Check`) });
      const cases = [
        { label: 'fixture', main: read(root, MAIN), facts: 'spyro-facts.json', mainHash: 'sha-main', sample: spyroGraph() },
        { label: 'proved overlay', main: PROVED_MAIN, facts: 'spyro-proved-facts.json', mainHash: 'sha-main-proved', sample: spyroProvedGraph() },
        { label: 'derivation variant', main: DERIVED_MAIN, facts: 'spyro-derived-facts.json', mainHash: 'sha-main-derived', sample: undefined },
      ];
      for (const c of cases) {
        write(root, MAIN, c.main);
        const facts = await realFacts(root);
        expect(facts.status, `${c.label}: ${facts.detail ?? ''}`).toBe('ok');
        const real = boardOf(root, facts);
        if (process.env['UPDATE_SEMANTIC_RECORDINGS'] === '1') writeHandConsts(path.join(CORE_FIXTURES, c.facts), facts);
        const handFacts = JSON.parse(readFileSync(path.join(CORE_FIXTURES, c.facts), 'utf8')) as LeanFacts;
        // Slice 2b3a: the isolated probe's constants, name for name, and its marker (the hand-written facts' time).
        expect(facts.probe?.status, c.label).toBe('ok');
        expect(handFacts.probe, c.label).toEqual({ status: 'ok', durationMs: 600 });
        expect(handFacts.decls.map((d) => [d.name, d.valueConsts, d.typeConsts]), c.label).toEqual(
          handFacts.decls.map((d) => {
            const lean = facts.decls.find((x) => x.name === d.name);
            return [d.name, lean?.valueConsts, lean?.typeConsts];
          }),
        );
        expect(handFacts.decls.map((d) => d.name).sort(), c.label).toEqual(facts.decls.map((d) => d.name).sort());
        const hand = boardOf(root, handFacts, { 'Model.lean': 'sha-model-root', [MAIN]: c.mainHash, 'Model/Spyro/Vocabulary.lean': 'sha-vocabulary' });
        expect(comparable(real), c.label).toEqual(comparable(hand));
        if (c.sample) {
          expect(real.nodes, c.label).toEqual(c.sample.nodes);
          expect(real.edges.map((e) => e.id).sort(), c.label).toEqual(c.sample.edges.map((e) => e.id).sort());
        }
      }
    } finally {
      cleanup(tmp);
    }
  });
});

describe('a board session with real Lean on a copy of mental_model/ (plan 11.3)', () => {
  let tmp: string;
  let root: string;
  let ws: ModelWorkspace;
  let userHead: string;
  let userIndex: string;
  const graph = () => ws.graph('Spyro');
  const node = (id: string): TlNode | undefined => graph().nodes.find((n) => n.id === id);
  const fresh = async () => {
    const summary = await ws.refreshNow();
    expect(summary.state, JSON.stringify(summary)).toBe('fresh');
  };

  beforeAll(async () => {
    tmp = makeTempDir('itg-session');
    root = copyMentalModel(tmp);
    write(root, MAIN, withInboxImport(PROVED_MAIN));
    // The user's own repository: one commit on a branch, plus hooks that would leave a marker if anything ran them.
    userGit(root, 'init', '-q', '-b', 'main');
    userGit(root, 'add', '-A');
    userGit(root, 'commit', '-q', '-m', 'user commit');
    for (const hook of ['pre-commit', 'post-commit', 'reference-transaction', 'post-index-change', 'post-checkout']) {
      write(root, `.git/hooks/${hook}`, `#!/bin/sh\ntouch "${path.join(tmp, `hook-ran-${hook}`)}"\n`);
      chmodSync(path.join(root, '.git', 'hooks', hook), 0o755);
    }
    userHead = userGit(root, 'rev-parse', 'HEAD').trim();
    userIndex = userGit(root, 'ls-files', '-s');
    ws = createModelWorkspace({
      root,
      text: fsTextSource(root),
      applier: fsEditApplier(root),
      semantic: { enabled: true, debounceMs: 60_000 }, // refreshes only when the test asks (refreshNow)
      git: { enabled: true },
      generatorVersion: 'integration-test',
    });
    await ws.load();
  });

  afterAll(() => {
    ws?.dispose();
    cleanup(tmp);
  });

  it('loads 4 cards; Lean: the proposition is proved from the three axioms (verified arrows), 9 vocabulary items', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    expect(ws.subjects().map((s) => [s.name, s.nodeCount])).toEqual([['Spyro', 4]]);
    await fresh();
    const g = graph();
    expect(g.nodes.map((n) => [n.id, n.type, n.status.proof.kind])).toEqual([
      ['pg-no-dark-past', 'AXIOM', 'assumed'],
      ['cynder-dark-past', 'AXIOM', 'assumed'],
      ['new-spyro-pg', 'AXIOM', 'assumed'],
      ['cynder-not-good', 'PROPOSITION', 'proved'],
    ]);
    expect(g.nodes.find((n) => n.id === 'cynder-not-good')?.status.flags).toContain('established');
    expect(g.edges.filter((e) => e.type === 'verified').map((e) => e.id).sort()).toEqual([
      'verified:cynder-dark-past->cynder-not-good',
      'verified:new-spyro-pg->cynder-not-good',
      'verified:pg-no-dark-past->cynder-not-good',
    ]);
    expect(g.vocabulary).toHaveLength(9);
    expect((await ws.listHistory('Spyro')).entries.map((e) => e.label)).toEqual(['Initial state']);
  });

  it('P->A on the proved proposition: the theorem becomes the axiom (archived), its arrows go, Lean agrees; undo is byte-exact; A->P is refused', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const before = read(root, MAIN);
    // AR-6: an axiom becomes a proposition by an arrow or "follows from nothing", never by a kind change.
    expect(await ws.perform({ kind: 'change-kind', id: 'cynder-dark-past', to: 'PROPOSITION', beforeId: null })).toMatchObject({ ok: false, code: 'invalid' });
    expect(read(root, MAIN)).toBe(before);
    const outcome = await ws.perform({ kind: 'change-kind', id: 'cynder-not-good', to: 'AXIOM', beforeId: null });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Move to axioms: Cynder would not be a good addition to the new Spyro game' });
    const main = read(root, MAIN);
    expect(main).toContain('id: cynder-not-good\ntype: AXIOM\nnatural_name: Cynder would not be a good addition to the new Spyro game\nasserted: 2026-11-01\n');
    expect(main).not.toContain('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past');
    expect(main).toContain('axiom cynder_not_good.holds : cynder_not_good');
    expect(main).not.toContain('theorem cynder_not_good.holds');
    await fresh();
    expect(node('cynder-not-good')).toMatchObject({ type: 'AXIOM', premises: [], status: { proof: { kind: 'assumed' } } });

    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(before);
    await fresh();
    expect(node('cynder-not-good')?.status.proof.kind).toBe('proved');
  });

  it('a proposition used by a proof (hand-written): the verified arrow comes from it; the outer proof is established', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    // The user types the derivation and a goal proved through it into Main.lean (as the derivation fixture has them).
    const extra = DERIVED_MAIN.slice(DERIVED_MAIN.indexOf('/-\n@@ telelean v1\nid: dark-and-pg'), DERIVED_MAIN.lastIndexOf('end Spyro'));
    write(root, MAIN, read(root, MAIN).replace('\nend Spyro\n', `\n${extra}end Spyro\n`));
    await ws.invalidate([MAIN]);
    await fresh();
    expect(node('dark-and-pg')).toMatchObject({ type: 'PROPOSITION', status: { proof: { kind: 'proved' } } });
    expect(node('pg-again')?.status.proof.kind).toBe('proved');
    expect(node('pg-again')?.status.flags).toContain('established');
    expect(graph().edges.filter((e) => e.target === 'pg-again').map((e) => e.id).sort()).toEqual(['premise:dark-and-pg->pg-again', 'verified:dark-and-pg->pg-again']);
  });

  it('set-premises declares support (a proof using an undeclared assumption is flagged), reorder changes only the layout', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const declared = await ws.perform({ kind: 'set-premises', target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'] });
    expect(declared, JSON.stringify(declared)).toMatchObject({ ok: true, label: 'These suffice: Cynder would not be a good addition to the new Spyro game ← 2 premises' });
    expect(read(root, MAIN)).toContain('premises: cynder-dark-past, new-spyro-pg\n');
    await fresh();
    expect(graph().edges.find((e) => e.id === 'verified:pg-no-dark-past->cynder-not-good')?.mismatch).toBe('used-undeclared');

    const mainBefore = read(root, MAIN);
    const moved = await ws.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'pg-no-dark-past' });
    expect(moved).toMatchObject({ ok: true, label: 'Move: The new Spyro game is PG' });
    expect(read(root, MAIN)).toBe(mainBefore);
    expect(graph().nodes.filter((n) => n.type === 'AXIOM').map((n) => n.id)).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past']);
    expect(JSON.parse(read(root, '.telelean/subjects/Spyro/layout.json')).columns.AXIOM[0]).toBe('new-spyro-pg');
  });

  it('delete removes the block and its declarations, keeping the proof in the attic; Lean is fresh again', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const outcome = await ws.perform({ kind: 'delete-node', id: 'pg-again', keepLean: false });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, label: 'Delete: The new Spyro game is PG, again' });
    expect(read(root, MAIN)).not.toContain('pg_again');
    const attic = listFiles(root).filter((rel) => rel.startsWith('.telelean/subjects/Spyro/attic/'));
    expect(attic.length).toBeGreaterThan(0);
    expect(attic.map((rel) => read(root, rel)).join('\n')).toContain('theorem pg_again.holds');
    await fresh();
    expect(node('pg-again')).toBeUndefined();
  });

  it('history: snapshots per action, a storage counter, revert to "Initial state" (byte-exact) and undo of the revert', async (ctx) => {
    if (!(await waitForMemory())) ctx.skip();
    const listing = await ws.listHistory('Spyro');
    const labels = listing.entries.map((e) => e.label);
    expect(labels.at(-1)).toBe('Initial state');
    for (const label of ['Move to axioms: Cynder would not be a good addition to the new Spyro game', 'Manual edits', 'Delete: The new Spyro game is PG, again']) {
      expect(labels, labels.join('\n')).toContain(label);
    }
    expect(listing.storage.subjectBytes).toBeGreaterThan(0);
    expect(listing.storage.totalBytes).toBeGreaterThanOrEqual(listing.storage.subjectBytes);

    const current = read(root, MAIN);
    const initial = listing.entries.at(-1);
    expect(initial).toBeDefined();
    const reverted = await ws.revert('Spyro', initial?.id ?? '');
    expect(reverted, JSON.stringify(reverted)).toMatchObject({ ok: true, undoable: true });
    expect(read(root, MAIN)).toBe(withInboxImport(PROVED_MAIN));
    expect(listFiles(root).filter((rel) => rel.startsWith('.telelean/subjects/Spyro/attic/'))).toEqual([]); // not in Initial state
    expect(await ws.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(root, MAIN)).toBe(current);
  });

  it('graph.json validates against the schema; the user branch, index and hooks are untouched', async () => {
    await ws.refreshNow();
    const json: unknown = JSON.parse(read(root, '.telelean/graph.json'));
    const parsed = graphJsonSchema.safeParse(json);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    expect((json as { nodes: Array<{ id: string }> }).nodes.map((n) => n.id).sort()).toEqual(['cynder-dark-past', 'cynder-not-good', 'dark-and-pg', 'new-spyro-pg', 'pg-no-dark-past']);

    expect(userGit(root, 'rev-parse', 'HEAD').trim()).toBe(userHead);
    expect(userGit(root, 'ls-files', '-s')).toBe(userIndex);
    expect(userGit(root, 'diff', '--cached', '--name-only')).toBe('');
    const refs = userGit(root, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean);
    expect(refs.filter((ref) => !ref.startsWith('refs/telelean/'))).toEqual(['refs/heads/main']);
    expect(refs.some((ref) => ref.endsWith('/subjects/Spyro'))).toBe(true);
    for (const hook of ['pre-commit', 'post-commit', 'reference-transaction', 'post-index-change', 'post-checkout']) {
      expect(existsSync(path.join(tmp, `hook-ran-${hook}`)), hook).toBe(false);
    }
  });
});
