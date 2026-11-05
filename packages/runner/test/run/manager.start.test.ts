/**
 * AT3.11 (docs/m2-plan.md sections 2 and 4.1): a refused start changes nothing. Preflight refusals (toolchain,
 * sandbox, memory, selection incl. an ASSUMPTION target, busy) create no run directory and never call
 * workspace.perform or the backend factory; a rejecting factory refuses `not-yet` before anything is declared; new
 * premises are declared after the backend and before the shadow (the base holds the declaration); unchanged premises
 * are not re-declared; a refused declaration refuses the start; a base check with Lean errors fails the run before
 * any session starts.
 */
import { existsSync, readdirSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPreflight } from '../../src/run/index.js';
import type { PreflightInput } from '../../src/run/types.js';
import { okReport } from './helpers/fakeEngine.js';
import { makeHarness, round1, START, state, step, TrackingBackend, waitForRun, type Harness } from './helpers/harness.js';

let h: Harness | undefined;
afterEach(() => {
  h?.dispose();
  h = undefined;
});

function runDirs(harness: Harness): string[] {
  if (!existsSync(harness.runsDir)) return [];
  return readdirSync(harness.runsDir).flatMap((key) => readdirSync(`${harness.runsDir}/${key}`));
}

function withFactory(overrides: Parameters<typeof makeHarness>[0] = {}) {
  const log: string[] = [];
  const backend = new TrackingBackend([[step.ask()]]);
  const factory = vi.fn(async () => {
    log.push('backend');
    return backend;
  });
  const harness = makeHarness({ backend: factory, log, ...overrides });
  return { harness, factory, backend, log };
}

const hooks = (extra: Partial<PreflightInput> = {}) => (input: PreflightInput) =>
  runPreflight({ ...input, checkSandbox: async () => undefined, readMemAvailable: () => 32 * 1024 ** 3, ...extra });

describe('preflight refusals change nothing (AT3.11)', () => {
  const cases: Array<{ name: string; setup: (harness: Harness) => void; preflight?: ReturnType<typeof hooks>; request?: Partial<typeof START>; message: RegExp }> = [
    {
      name: 'toolchain',
      setup: (harness) => harness.workspace.texts.set('lean-toolchain', 'leanprover/lean4:v4.34.0\n'),
      message: /lean-toolchain pins "leanprover\/lean4:v4\.34\.0"; telelean runs Claude only on leanprover\/lean4:v4\.35\.0/,
    },
    {
      name: 'Lake dependencies',
      setup: (harness) => harness.workspace.texts.set('lake-manifest.json', JSON.stringify({ version: '1.3.0', packages: [{ name: 'mathlib' }] })),
      message: /Lake dependencies \(mathlib\)/,
    },
    { name: 'sandbox', setup: () => undefined, preflight: hooks({ checkSandbox: async () => 'bwrap not found or not executable at /usr/bin/bwrap' }), message: /sandbox is not available.*bwrap not found/ },
    { name: 'memory', setup: () => undefined, preflight: hooks({ readMemAvailable: () => 1024 ** 3 }), message: /Only 1\.0 GB of memory is available \(telelean needs 2\.0 GB/ },
    { name: 'an ASSUMPTION target', setup: () => undefined, request: { target: 'cynder-dark-past', premises: ['new-spyro-pg'] }, message: /is an Assumption, something you hold: make it a Derivation first \(D-11\), then prove it/ },
    { name: 'an unknown premise', setup: () => undefined, request: { premises: ['no-such-card'] }, message: /The premise "no-such-card" is not a card of Spyro/ },
    { name: 'the target among its premises', setup: () => undefined, request: { premises: ['cynder-not-good', 'new-spyro-pg'] }, message: /cannot also be one of its own premises/ },
    { name: 'an unknown target', setup: () => undefined, request: { target: 'nope' }, message: /The target "nope" is not a card of Spyro/ },
  ];
  for (const c of cases) {
    it(`refuses on ${c.name}`, async () => {
      const { harness, factory, log } = withFactory(c.preflight !== undefined ? { preflight: c.preflight } : {});
      h = harness;
      c.setup(harness);
      const outcome = await harness.manager.start({ ...START, ...c.request, premises: c.request?.premises ?? ['cynder-dark-past', 'pg-no-dark-past'] });
      expect(outcome).toMatchObject({ ok: false, code: 'not-yet' });
      expect(outcome.ok ? '' : outcome.error).toMatch(c.message);
      expect(factory).not.toHaveBeenCalled();
      expect(harness.workspace.performed).toEqual([]);
      expect(log).toEqual([]);
      expect(runDirs(harness)).toEqual([]);
      expect(harness.manager.current()).toBeNull();
    });
  }

  it('refuses `busy` (conflict) while another run of the root is active', async () => {
    const { harness, factory } = withFactory();
    h = harness;
    expect(await harness.manager.start(START)).toMatchObject({ ok: true });
    await waitForRun(harness.manager, state('waiting-for-answer'));
    const second = await harness.manager.start({ ...START, premises: ['cynder-dark-past'] });
    expect(second).toMatchObject({ ok: false, code: 'conflict' });
    expect(second.ok ? '' : second.error).toMatch(/Another Claude run of this model folder is still active/);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(harness.workspace.performed).toEqual([]);
    expect(runDirs(harness)).toHaveLength(1);
  });
});

describe('the backend and the premises declaration (AT3.11)', () => {
  it('a rejecting backend factory refuses not-yet with its message; nothing is created or declared', async () => {
    const log: string[] = [];
    const factory = vi.fn(async () => {
      throw new Error('No usable Claude Code binary (need 2.1.295 or newer). Tried: /x/claude: version 2.1.250 is older than 2.1.295');
    });
    h = makeHarness({ backend: factory, log });
    const outcome = await h.manager.start({ ...START, premises: ['cynder-dark-past', 'pg-no-dark-past'] });
    expect(outcome).toEqual({ ok: false, code: 'not-yet', error: 'Claude could not be started: No usable Claude Code binary (need 2.1.295 or newer). Tried: /x/claude: version 2.1.250 is older than 2.1.295' });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(h.workspace.performed).toEqual([]);
    expect(runDirs(h)).toEqual([]);
    // The factory is retried at the next start (a binary may have been installed meanwhile).
    await h.manager.start(START);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('declares new premises after the backend and before the shadow, so the base holds the declaration', async () => {
    const { harness, factory, log } = withFactory();
    h = harness;
    const outcome = await harness.manager.start({ ...START, premises: ['cynder-dark-past', 'pg-no-dark-past'] });
    expect(outcome).toMatchObject({ ok: true });
    expect(log.slice(0, 3)).toEqual(['backend', 'workspace.perform:set-premises', 'createShadow']);
    expect(harness.workspace.performed).toEqual([{ kind: 'set-premises', target: 'cynder-not-good', premises: ['cynder-dark-past', 'pg-no-dark-past'] }]);
    const base = await harness.shadow().baseFiles();
    expect(base.get('Model/Spyro/Main.lean')).toContain('premises: cynder-dark-past, pg-no-dark-past\n');
    expect(harness.manager.current()?.premises).toEqual(['cynder-dark-past', 'pg-no-dark-past']);
    // The factory runs once; a second start (after this run ends) reuses the backend.
    const runId = harness.manager.current()?.runId ?? '';
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await harness.manager.cancel(runId);
    await harness.manager.start(START);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('closing round 1: the working copy builds from scratch (copyBuild false) unless telelean.run.reuseLeanBuild is on', async () => {
    const { harness } = withFactory();
    h = harness;
    expect(await harness.manager.start(START)).toMatchObject({ ok: true });
    expect(harness.shadowOptions.map((o) => o.copyBuild)).toEqual([false]);
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await harness.manager.cancel(harness.manager.current()?.runId ?? '');
    harness.dispose();
    const opted = withFactory({ settings: { reuseLeanBuild: true } });
    h = opted.harness;
    expect(await opted.harness.manager.start(START)).toMatchObject({ ok: true });
    expect(opted.harness.shadowOptions.map((o) => o.copyBuild)).toEqual([true]);
  });

  it('does not re-declare unchanged premises (order does not matter), nor an empty selection', async () => {
    const { harness } = withFactory();
    h = harness;
    await harness.manager.start({ ...START, premises: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg'] });
    expect(harness.workspace.performed).toEqual([]);
    const runId = harness.manager.current()?.runId ?? '';
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await harness.manager.cancel(runId);
    await harness.manager.start({ ...START, premises: [] });
    expect(harness.workspace.performed).toEqual([]);
    expect(harness.manager.current()?.premises).toEqual([]);
  });

  it('a refused declaration refuses the start; nothing is created', async () => {
    const { harness, log } = withFactory();
    h = harness;
    harness.workspace.performOutcome = { ok: false, code: 'unsafe', error: 'The block of cynder-not-good cannot be edited safely.' };
    const outcome = await harness.manager.start({ ...START, premises: ['cynder-dark-past'] });
    expect(outcome).toEqual({ ok: false, code: 'unsafe', error: 'The block of cynder-not-good cannot be edited safely.' });
    expect(log).toEqual(['backend', 'workspace.perform:set-premises']);
    expect(runDirs(harness)).toEqual([]);
    expect(harness.manager.current()).toBeNull();
  });

  it('a base check with Lean errors fails the run before any session starts', async () => {
    const { harness, backend } = withFactory();
    h = harness;
    harness.engine.onCheckBase = () =>
      okReport({
        outcome: 'problems',
        diagnostics: [{ file: 'Model/Other/Main.lean', line: 7, column: 2, severity: 'error', message: "unknown identifier 'foo'\nwhile elaborating" }],
      });
    const outcome = await harness.manager.start(START);
    expect(outcome).toMatchObject({ ok: false, code: 'not-yet' });
    const v = harness.manager.current();
    expect(v).toMatchObject({ state: 'failed', verdict: 'failed' });
    expect(v?.error).toBe("your files have Lean errors (Model/Other/Main.lean:7: unknown identifier 'foo' while elaborating); fix or save them, then start again");
    expect(backend.sessions).toHaveLength(0);
    expect(harness.engine.methods()).toEqual(['checkBase']);
    // The shadow is kept for the record; nothing was sent, so no attempt is recorded.
    expect(runDirs(harness)).toHaveLength(1);
    expect(harness.sidecars.attempts).toEqual([]);
  });

  it('a session refused at start (auth, guard) fails the run with the refusal sentence', async () => {
    h = makeHarness({ script: [round1(step.result())] });
    const backend = h.backend as TrackingBackend;
    backend.startSession = async () => {
      throw new Error('Refusing to run: the Claude CLI is not on a claude.ai subscription login (verdict=api-key).');
    };
    const outcome = await h.manager.start(START);
    expect(outcome).toMatchObject({ ok: false, code: 'not-yet' });
    expect(h.manager.current()).toMatchObject({ state: 'failed', error: 'Refusing to run: the Claude CLI is not on a claude.ai subscription login (verdict=api-key).' });
  });
});
