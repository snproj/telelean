/**
 * AT4.2: requestRefresh is debounced, coalesced and runs one refresh at a time ('checking' meanwhile); every
 * FactsStatus maps to the board's SemanticSummary per docs/m1-plan.md section 4 (unsupported-project -> disabled +
 * TL201); a failed refresh keeps the previous facts; onDidChange fires; graph.json is rewritten after a refresh and
 * after a perform. refreshFacts is always the fake hook here: no Lean runs.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { FactsStatus, GraphJson, LeanFacts, ProjectInput, SemanticSummary } from '@telelean/core';

import { runExclusive } from '../../src/semantic/index.js';
import type { RefreshRequest } from '../../src/semantic/types.js';
import { seedFromRefreshOutput } from '../../src/shadow/seed.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace, type ModelWorkspaceOptions, type WorkspaceChange } from '../../src/workspace/index.js';
import { summarize } from '../../src/workspace/semanticSummary.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, deferred, exists, type Deferred, fakeFacts, freshModules, makeTempDir, read, sleep, waitFor, waitForMemory, write } from './helpers.js';


const DEBOUNCE = 60;

describe('AT4.2 Lean refresh scheduling and states', () => {
  let tmp: string;
  let root: string;
  const open: ModelWorkspace[] = [];
  beforeAll(() => {
    tmp = makeTempDir('refresh');
    root = copyMentalModel(tmp);
  });
  afterEach(() => {
    for (const ws of open.splice(0)) ws.dispose();
  });
  afterAll(() => cleanup(tmp));

  async function workspace(refreshFacts: (r: RefreshRequest) => Promise<LeanFacts>, extra: Partial<ModelWorkspaceOptions> = {}): Promise<ModelWorkspace> {
    const ws = createModelWorkspace({
      root,
      text: fsTextSource(root),
      applier: fsEditApplier(root),
      core: fakeCore,
      git: { enabled: false },
      semantic: { debounceMs: DEBOUNCE },
      refreshFacts,
      ...extra,
    });
    open.push(ws);
    await ws.load();
    return ws;
  }

  it('debounces bursts, coalesces requests made while running into one follow-up, never runs two at once', async () => {
    const requests: RefreshRequest[] = [];
    const gates: Array<Deferred<LeanFacts>> = [];
    let running = 0;
    let maxRunning = 0;
    const ws = await workspace(async (request) => {
      requests.push(request);
      running++;
      maxRunning = Math.max(maxRunning, running);
      const gate = deferred<LeanFacts>();
      gates.push(gate);
      try {
        return await gate.promise;
      } finally {
        running--;
      }
    });
    const states: string[] = [];
    ws.onDidChange((c) => {
      if (c.semantic) states.push(ws.semantic().state);
    });

    for (let i = 0; i < 5; i++) ws.requestRefresh(`burst ${i}`);
    await sleep(DEBOUNCE / 3);
    expect(requests.length).toBe(0); // still debouncing
    await waitFor(() => requests.length === 1);
    expect(ws.semantic().state).toBe('checking');
    expect(requests[0]).toMatchObject({ root, library: 'Model', memoryMax: '4G', minAvailableBytes: 2 * 1024 ** 3 });
    expect(requests[0]?.runId).toMatch(/^[A-Za-z0-9_]{1,64}$/);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);

    // Requests while the first runs: one follow-up after it, not three.
    ws.requestRefresh('save 1');
    ws.requestRefresh('save 2');
    await sleep(DEBOUNCE * 2);
    ws.requestRefresh('save 3');
    await sleep(DEBOUNCE * 2);
    expect(requests.length).toBe(1);
    gates[0]?.resolve(fakeFacts('ok', { modules: freshModules(root) }));
    await waitFor(() => requests.length === 2);
    expect(ws.semantic().state).toBe('checking');
    gates[1]?.resolve(fakeFacts('ok', { modules: freshModules(root) }));
    await waitFor(() => ws.semantic().state === 'fresh');
    await sleep(DEBOUNCE * 2);
    expect(requests.length).toBe(2);
    expect(maxRunning).toBe(1);
    expect(states).toEqual(['checking', 'fresh', 'checking', 'fresh']);
  });

  it('refreshNow cancels the pending debounce, runs at once and resolves with the resulting state', async () => {
    let calls = 0;
    const ws = await workspace(async () => {
      calls++;
      return fakeFacts('ok', { modules: freshModules(root) });
    });
    ws.requestRefresh('pending');
    const summary = await ws.refreshNow();
    expect(summary.state).toBe('fresh');
    expect(summary.toolchain).toBe('leanprover/lean4:v4.35.0');
    expect(summary.checkedAt).toBe('2026-11-01T10:00:02.000Z');
    await sleep(DEBOUNCE * 2);
    expect(calls).toBe(1); // the debounced request was absorbed
  });

  it('reports phases while checking', async () => {
    const gate = deferred<LeanFacts>();
    let phase: RefreshRequest['onPhase'];
    const ws = await workspace(async (request) => {
      phase = request.onPhase;
      return gate.promise;
    });
    const done = ws.refreshNow();
    await waitFor(() => phase !== undefined);
    expect(ws.semantic()).toMatchObject({ state: 'checking', detail: 'Lean: starting…' });
    phase?.('build');
    expect(ws.semantic().detail).toBe('Lean: building the project…');
    phase?.('check');
    expect(ws.semantic().detail).toBe('Lean: checking declarations…');
    gate.resolve(fakeFacts('ok', { modules: freshModules(root) }));
    expect((await done).state).toBe('fresh');
  });

  it('maps every FactsStatus per plan section 4', async () => {
    const cases: Array<[FactsStatus, Partial<SemanticSummary>]> = [
      ['ok', { state: 'fresh' }],
      ['build-errors', { state: 'failed', errorCount: 2, detail: 'Model/Spyro/Main.lean failed' }],
      ['check-errors', { state: 'failed', detail: 'Model/Spyro/Main.lean failed' }],
      ['low-memory', { state: 'paused-low-memory', detail: 'Model/Spyro/Main.lean failed' }],
      ['unsupported-toolchain', { state: 'unsupported-toolchain', detail: 'Model/Spyro/Main.lean failed', toolchain: 'leanprover/lean4:v4.35.0' }],
      ['unsupported-project', { state: 'disabled', detail: 'Model/Spyro/Main.lean failed' }],
      ['could-not-start', { state: 'disabled', detail: 'sandbox unavailable: Model/Spyro/Main.lean failed' }],
      ['timeout', { state: 'failed', detail: 'Model/Spyro/Main.lean failed' }],
      ['oom', { state: 'failed', detail: 'Model/Spyro/Main.lean failed' }],
      ['cancelled', { state: 'failed', detail: 'Model/Spyro/Main.lean failed' }],
    ];
    for (const [status, expected] of cases) {
      const facts = fakeFacts(status, { modules: freshModules(root), detail: status === 'ok' ? undefined : 'Model/Spyro/Main.lean failed', buildErrors: status === 'build-errors' ? 2 : 0 });
      const ws = await workspace(async () => facts);
      const summary = await ws.refreshNow();
      expect(summary, status).toMatchObject(expected);
      const tl201 = ws.graph('Spyro').diagnostics.filter((d) => d.code === 'TL201');
      expect(tl201.length, `${status} TL201`).toBe(status === 'unsupported-project' ? 1 : 0);
      if (status === 'unsupported-project') expect(tl201[0]).toMatchObject({ severity: 'warning', message: 'Model/Spyro/Main.lean failed' });
      ws.dispose();
    }
    // Without any refresh, and when switched off.
    expect(summarize({ enabled: true, running: false, fileHashes: {} }).state).toBe('unavailable');
    expect(summarize({ enabled: false, running: false, fileHashes: {} }).state).toBe('disabled');
    // A refresh that throws.
    const ws = await workspace(async () => {
      throw new TypeError('bad root');
    });
    expect(await ws.refreshNow()).toMatchObject({ state: 'failed', detail: 'refresh failed: bad root' });
  });

  it('keeps the previous facts after failed refreshes and marks changed files stale', async () => {
    const results: LeanFacts[] = [
      fakeFacts('ok', { modules: freshModules(root), finishedAt: '2026-11-01T11:00:00.000Z' }),
      fakeFacts('timeout', { detail: 'build timed out' }),
      fakeFacts('low-memory', { detail: '1.2 GB available' }),
    ];
    const inputs: ProjectInput[] = [];
    const ws = await workspace(async () => results.shift() ?? fakeFacts('cancelled'), {
      core: {
        ...fakeCore,
        buildProjectModel: (input) => {
          inputs.push(input);
          return fakeCore.buildProjectModel(input);
        },
      },
    });
    expect((await ws.refreshNow()).state).toBe('fresh');
    ws.subjects();
    const okFacts = inputs.at(-1)?.facts;
    expect(okFacts?.status).toBe('ok');

    expect(await ws.refreshNow()).toMatchObject({ state: 'failed', detail: 'build timed out', checkedAt: '2026-11-01T11:00:00.000Z' });
    ws.subjects();
    expect(inputs.at(-1)?.facts).toBe(okFacts); // previous facts still in use
    expect(await ws.refreshNow()).toMatchObject({ state: 'paused-low-memory', detail: '1.2 GB available' });
    ws.subjects();
    expect(inputs.at(-1)?.facts).toBe(okFacts);

    // A file changed since the facts: stale (by hash), still the previous facts.
    const inbox = 'Model/Spyro/Inbox.lean';
    const original = read(root, inbox);
    write(root, inbox, `${original}-- typed\n`);
    await ws.invalidate([inbox]);
    expect(ws.semantic()).toMatchObject({ staleFiles: [inbox] });
    write(root, inbox, original);
    await ws.invalidate([inbox]);
    expect(ws.semantic().staleFiles).toBeUndefined();
  });

  it('another toolchain or an uncheckable project drops the previous facts (D-7 syntactic mode) and names the current pin', async () => {
    const results: LeanFacts[] = [
      fakeFacts('ok', { modules: freshModules(root), finishedAt: '2026-11-01T11:00:00.000Z' }),
      {
        ...fakeFacts('unsupported-toolchain', { detail: 'lean-toolchain pins "leanprover/lean4:v4.36.0"; telelean checks only leanprover/lean4:v4.35.0 (D-7), so the board stays syntactic' }),
        toolchain: 'leanprover/lean4:v4.36.0',
      },
      fakeFacts('ok', { modules: freshModules(root), finishedAt: '2026-11-01T12:00:00.000Z' }),
      fakeFacts('unsupported-project', { detail: 'this project has Lake dependencies (mathlib)' }),
    ];
    const inputs: ProjectInput[] = [];
    const ws = await workspace(async () => results.shift() ?? fakeFacts('cancelled'), {
      core: {
        ...fakeCore,
        buildProjectModel: (input) => {
          inputs.push(input);
          return fakeCore.buildProjectModel(input);
        },
      },
    });
    expect((await ws.refreshNow()).state).toBe('fresh');
    ws.subjects();
    expect(inputs.at(-1)?.facts?.status).toBe('ok');

    const syntactic = await ws.refreshNow();
    expect(syntactic).toMatchObject({ state: 'unsupported-toolchain', toolchain: 'leanprover/lean4:v4.36.0' });
    expect(syntactic.checkedAt).toBeUndefined();
    ws.subjects();
    expect(inputs.at(-1)?.facts).toBeUndefined(); // the board is built from the text alone

    expect((await ws.refreshNow()).state).toBe('fresh');
    expect(await ws.refreshNow()).toMatchObject({ state: 'disabled', detail: 'this project has Lake dependencies (mathlib)' });
    ws.subjects();
    expect(inputs.at(-1)?.facts).toBeUndefined();
    expect(JSON.parse(read(root, '.telelean/graph.json'))).toMatchObject({ semantic: { available: false } });
  });

  it('fires onDidChange when checking starts and when the result is in, and rewrites graph.json each time', async () => {
    const ws = await workspace(async () => fakeFacts('ok', { modules: freshModules(root) }), { generatorVersion: '9.9.9-test' });
    const changes: WorkspaceChange[] = [];
    ws.onDidChange((c) => changes.push(c));
    const graphJson = '.telelean/graph.json';
    if (exists(root, graphJson)) write(root, graphJson, 'stale');
    await ws.refreshNow();
    expect(changes).toEqual([
      { subjects: ['Spyro'], semantic: true, subjectsListChanged: false },
      { subjects: ['Spyro'], semantic: true, subjectsListChanged: false },
    ]);
    const json = JSON.parse(read(root, graphJson)) as GraphJson;
    expect(json).toMatchObject({ format: 'telelean-graph', generator: { name: 'telelean', version: '9.9.9-test' }, semantic: { status: 'ok' } });
    expect(json.files.map((f) => f.path)).toContain('Model/Spyro/Main.lean');
  });

  it('rewrites graph.json after a perform (fake core)', async () => {
    const ws = await workspace(async () => fakeFacts('ok', { modules: freshModules(root) }), { semantic: { enabled: false } });
    const graphJson = '.telelean/graph.json';
    write(root, graphJson, 'not json');
    const outcome = await ws.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'ASSUMPTION', beforeId: 'pg-no-dark-past' });
    expect(outcome).toMatchObject({ ok: true });
    const json = JSON.parse(read(root, graphJson)) as GraphJson;
    expect(json.format).toBe('telelean-graph');
    await ws.undo('Spyro');
  });

  it('does nothing while Lean checking is switched off', async () => {
    let calls = 0;
    const ws = await workspace(
      async () => {
        calls++;
        return fakeFacts('ok');
      },
      { semantic: { enabled: false, debounceMs: 10 } },
    );
    ws.requestRefresh('save');
    await sleep(50);
    expect(await ws.refreshNow()).toMatchObject({ state: 'disabled' });
    expect(calls).toBe(0);
  });

  it('dispose cancels a pending debounce and aborts a running refresh', async () => {
    let signal: AbortSignal | undefined;
    const gate = deferred<LeanFacts>();
    let calls = 0;
    const ws = await workspace(async (request) => {
      calls++;
      signal = request.signal;
      return gate.promise;
    });
    void ws.refreshNow();
    await waitFor(() => signal !== undefined);
    ws.requestRefresh('later');
    ws.dispose();
    expect(signal?.aborted).toBe(true);
    gate.resolve(fakeFacts('cancelled'));
    await sleep(DEBOUNCE * 2);
    expect(calls).toBe(1);
  });

  it('closing round 1: a refresh records what it left in .lake/build (the only tree a run may seed from); any other outcome forgets it', async () => {
    const scratch = makeTempDir('record-output');
    try {
      const copy = copyMentalModel(scratch);
      const modules = freshModules(copy);
      // What a finished build of those modules leaves (outputs first, the trace last).
      const writeBuild = (): void => {
        for (const m of modules) {
          const stem = path.join(copy, '.lake', 'build', 'lib', 'lean', m.file.slice(0, -'.lean'.length));
          mkdirSync(path.dirname(stem), { recursive: true });
          for (const ext of ['olean', 'ilean', 'trace']) writeFileSync(`${stem}.${ext}`, `${m.name} ${ext}`);
        }
      };
      let next = (): LeanFacts => fakeFacts('ok', { modules });
      const ws = createModelWorkspace({
        root: copy,
        text: fsTextSource(copy),
        applier: fsEditApplier(copy),
        core: fakeCore,
        git: { enabled: false },
        semantic: { debounceMs: DEBOUNCE },
        refreshFacts: async () => {
          writeBuild();
          return next();
        },
      });
      open.push(ws);
      await ws.load();
      let n = 0;
      const seed = () => {
        const mirror = path.join(scratch, `mirror-${++n}`);
        mkdirSync(mirror);
        return runExclusive(() => seedFromRefreshOutput(copy, mirror)).then((outcome) => ({ outcome, mirror }));
      };
      await ws.refreshNow();
      const first = await seed();
      expect(first.outcome).toEqual({ files: modules.length * 3 });
      expect(existsSync(path.join(first.mirror, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean'))).toBe(true);
      next = () => fakeFacts('build-errors', { modules });
      await ws.refreshNow();
      expect((await seed()).outcome.skipped).toMatch(/no finished Lean check of the board has been recorded/u);
      next = () => fakeFacts('ok', { modules });
      await ws.refreshNow();
      expect((await seed()).outcome.files).toBe(modules.length * 3);
      next = () => {
        throw new Error('the sandbox broke');
      };
      await ws.refreshNow();
      expect((await seed()).outcome.skipped).toMatch(/no finished Lean check of the board has been recorded/u);
    } finally {
      cleanup(scratch);
    }
  });

  describe('the real semantic layer', () => {
    it('refreshNow builds and checks a scratch copy in place and hands the facts to core', async (ctx) => {
      if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
      const scratch = makeTempDir('real-refresh');
      try {
        const copy = copyMentalModel(scratch);
        const inputs: ProjectInput[] = [];
        const ws = createModelWorkspace({
          root: copy,
          text: fsTextSource(copy),
          applier: fsEditApplier(copy),
          git: { enabled: false },
          core: {
            ...fakeCore,
            buildProjectModel: (input) => {
              inputs.push(input);
              return fakeCore.buildProjectModel(input);
            },
          },
        });
        open.push(ws);
        await ws.load();
        const summary = await ws.refreshNow();
        expect(summary, JSON.stringify(summary)).toMatchObject({ state: 'fresh', toolchain: 'leanprover/lean4:v4.35.0' });
        ws.subjects();
        const facts = inputs.at(-1)?.facts;
        expect(facts?.status).toBe('ok');
        expect(facts?.modules.map((m) => [m.file, m.state]).sort()).toEqual([
          ['Model.lean', 'fresh'],
          ['Model/Spyro.lean', 'fresh'],
          ['Model/Spyro/Inbox.lean', 'fresh'],
          ['Model/Spyro/Main.lean', 'fresh'],
          ['Model/Spyro/Vocabulary.lean', 'fresh'],
        ]);
        expect(facts?.decls.map((d) => d.name)).toContain('Spyro.cynder_dark_past.holds');
        expect(JSON.parse(read(copy, '.telelean/graph.json'))).toMatchObject({ format: 'telelean-graph' });
        // Closing round 1: the refresh recorded its output, so a run with telelean.run.reuseLeanBuild may seed from it.
        const mirror = path.join(scratch, 'mirror');
        mkdirSync(mirror);
        const seeded = await runExclusive(() => seedFromRefreshOutput(copy, mirror));
        expect(seeded.skipped).toBeUndefined();
        expect(seeded.files).toBeGreaterThan(0);
        expect(existsSync(path.join(mirror, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean'))).toBe(true);
      } finally {
        cleanup(scratch);
      }
    });
  });

  describe('graph.json with the real core', () => {
    it('is written after a perform and parses', async () => {
      const ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), git: { enabled: false }, semantic: { enabled: false } });
      open.push(ws);
      await ws.load();
      write(root, '.telelean/graph.json', 'old');
      const outcome = await ws.perform({ kind: 'reorder', id: 'new-spyro-pg', column: 'ASSUMPTION', beforeId: 'pg-no-dark-past' });
      expect(outcome.ok).toBe(true);
      const json = JSON.parse(read(root, '.telelean/graph.json')) as GraphJson;
      expect(json.format).toBe('telelean-graph');
      expect(json.nodes.map((n) => n.id).sort()).toEqual(['cynder-dark-past', 'cynder-not-good', 'new-spyro-pg', 'pg-no-dark-past']);
      await ws.undo('Spyro');
    });
  });
});
