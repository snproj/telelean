/**
 * AT3.11 (docs/m2-plan.md sections 2 and 4.1): a refused start changes nothing. Preflight refusals (toolchain,
 * sandbox, memory, selection incl. an AXIOM target, busy) create no run directory and never call
 * workspace.perform or the backend factory; a rejecting factory refuses `not-yet` before anything is created; a base
 * check with Lean errors fails the run before any session starts. Slice 1e (spec v4.1 AR-4, ES-5): a run writes no
 * `premises:` at its start any more (the selected arrows are in the files already): its base is the user's files as
 * they are, whatever the selection. Slice 2b3a (docs/slice2-plan.md 2.1, AP30-2): a base whose isolated probe failed
 * refuses the start with the environment notice, before anything is sent to Claude. Slice 2d: every start is an edit
 * session; its Cancel is Cancel step (the stage opens), so a test that starts again first ends the session (Discard,
 * until 2f's Exit); the start's activity is in run.json (a session's RunView withholds it while a step runs).
 */
import { existsSync, readdirSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { baseProbeEnvironment } from '../../src/gate/index.js';
import { runPreflight } from '../../src/run/index.js';
import type { PreflightInput } from '../../src/run/types.js';
import { okReport } from './helpers/fakeEngine.js';
import { makeHarness, rawRun, round1, START, state, step, TrackingBackend, waitForRun, waitForStage, type Harness } from './helpers/harness.js';

let h: Harness | undefined;
afterEach(() => {
  h?.dispose();
  h = undefined;
});

function runDirs(harness: Harness): string[] {
  if (!existsSync(harness.runsDir)) return [];
  // 2k2 (D2-108): `<root>/.telelean/runs/<runId>/`, beside its .gitignore (and the extension's consent).
  return readdirSync(harness.runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Slice 2d: Cancel step, then the session ends (2h: Exit; Discard is retired), so the root has no active run any more. */
async function endSession(harness: Harness, runId: string): Promise<void> {
  await harness.manager.cancel(runId);
  await waitForStage(harness.manager);
  expect(await harness.manager.end(runId, 'exit')).toMatchObject({ ok: true });
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
    { name: 'an AXIOM target', setup: () => undefined, request: { target: 'cynder-dark-past', premises: ['new-spyro-pg'] }, message: /^An axiom is something you hold: draw arrows into it to make it a proposition first\.$/ },
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

describe('the backend, and no premises declaration (AT3.11; slice 1e)', () => {
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

  it('slice 1e: the run writes no premises at its start (the arrows are in the files already); the base is the user\'s files', async () => {
    const { harness, factory, log } = withFactory();
    h = harness;
    const before = harness.workspace.texts.get('Model/Spyro/Main.lean');
    const outcome = await harness.manager.start({ ...START, premises: ['cynder-dark-past', 'pg-no-dark-past'] });
    expect(outcome).toMatchObject({ ok: true });
    expect(log.slice(0, 2)).toEqual(['backend', 'createShadow']);
    expect(log.some((entry) => entry.startsWith('workspace.perform'))).toBe(false);
    expect(harness.workspace.performed).toEqual([]);
    // The target's `premises:` stays exactly as the user's files have it (the fixture declares all three).
    const base = await harness.shadow().baseFiles();
    expect(base.get('Model/Spyro/Main.lean')).toBe(before);
    expect(base.get('Model/Spyro/Main.lean')).toContain('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n');
    expect(harness.manager.current()?.premises).toEqual(['cynder-dark-past', 'pg-no-dark-past']);
    expect(rawRun(harness).view.activity.find((a) => a.text.startsWith('Started'))?.text).toBe('Started "Formalize for dependencies" for “Cynder would not be a good addition to the new Spyro game” from 2 premises.');
    // The factory runs once; a second start (after this run ends) reuses the backend.
    const runId = harness.manager.current()?.runId ?? '';
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await endSession(harness, runId);
    await harness.manager.start(START);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('closing round 1: the working copy builds from scratch (copyBuild false) unless telelean.run.reuseLeanBuild is on', async () => {
    const { harness } = withFactory();
    h = harness;
    expect(await harness.manager.start(START)).toMatchObject({ ok: true });
    expect(harness.shadowOptions.map((o) => o.copyBuild)).toEqual([false]);
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await endSession(harness, harness.manager.current()?.runId ?? '');
    harness.dispose();
    const opted = withFactory({ settings: { reuseLeanBuild: true } });
    h = opted.harness;
    expect(await opted.harness.manager.start(START)).toMatchObject({ ok: true });
    expect(opted.harness.shadowOptions.map((o) => o.copyBuild)).toEqual([true]);
  });

  it('slice 1e: no selection is declared (any order, a subset, none), and a workspace that would refuse an edit is never asked', async () => {
    const { harness, log } = withFactory();
    h = harness;
    harness.workspace.performOutcome = { ok: false, code: 'unsafe', error: 'The block of cynder-not-good cannot be edited safely.' };
    expect(await harness.manager.start({ ...START, premises: ['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg'] })).toMatchObject({ ok: true });
    expect(harness.workspace.performed).toEqual([]);
    const runId = harness.manager.current()?.runId ?? '';
    await waitForRun(harness.manager, state('waiting-for-answer'));
    await endSession(harness, runId);
    // An empty question: the target's "follows from nothing" mark (the host checks that the mark is there).
    expect(await harness.manager.start({ ...START, premises: [] })).toMatchObject({ ok: true });
    expect(harness.workspace.performed).toEqual([]);
    expect(harness.manager.current()?.premises).toEqual([]);
    expect(rawRun(harness).view.activity.find((a) => a.text.startsWith('Started'))?.text).toBe('Started "Follows from nothing?" for “Cynder would not be a good addition to the new Spyro game”: a proof from no premises at all.');
    expect(log.some((entry) => entry.startsWith('workspace.perform'))).toBe(false);
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

  it('slice 2b3a (AP30-2): a base whose probe failed refuses the start with the environment notice, and nothing is sent to Claude', async () => {
    const { harness, backend, factory } = withFactory();
    h = harness;
    const facts = {
      format: 'telelean-lean-facts' as const,
      version: 1 as const,
      toolchain: 'leanprover/lean4:v4.35.0',
      library: 'Model',
      startedAt: '',
      finishedAt: '',
      status: 'check-errors' as const,
      build: { status: 'ok' as const, durationMs: 0, messages: [], failedModules: [] },
      check: { status: 'ok' as const, durationMs: 0, probed: 16 },
      modules: [],
      decls: [],
      probe: { status: 'failed' as const, durationMs: 5, detail: '9:0: unknown constant Lean.Name.mkStr' },
    };
    // What the real engine's checkBase answers for such a base (engine.test.ts checks that half).
    const environment = baseProbeEnvironment(facts) as string;
    expect(environment).toBe("telelean could not read what the declarations of this state use in Lean: the probe failed: 9:0: unknown constant Lean.Name.mkStr. Claude's work on this model cannot be checked.");
    harness.engine.onCheckBase = () => okReport({ outcome: 'environment', environment });
    const outcome = await harness.manager.start(START);
    const error = `telelean could not run Lean on your files (${environment}); nothing was sent to Claude`;
    expect(outcome).toMatchObject({ ok: false, code: 'not-yet', error: `The run could not start: ${error}.` });
    const v = harness.manager.current();
    expect(v).toMatchObject({ state: 'failed', verdict: 'failed', error });
    expect(v?.notices.map((n) => n.text)).toContain(`${error}.`);
    // Not the notice for Lean errors in the person's files.
    expect(v?.error).not.toContain('your files have Lean errors');
    // No session, so no turn reached Claude (the backend object exists: the start reads its CLI version first).
    expect(factory).toHaveBeenCalledTimes(1);
    expect(backend.sessions).toHaveLength(0);
    expect(harness.engine.methods()).toEqual(['checkBase']);
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
