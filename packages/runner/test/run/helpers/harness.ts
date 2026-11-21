/**
 * Wires a RunManager to the fakes (WP3 tests): FakeBackend (M0, extended) behind a tracking wrapper, FakeEngine,
 * FakeProposals, FakeSidecars, FakeWorkspace (Spyro fixture + recorded facts), FakeShadow, the real preflight with
 * sandbox/memory hooks, and fake core texts (WP1's functions are stubs until integration).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { DecisionsFile, GateFinding, RunCaps, RunView } from '@telelean/core';

import { FakeBackend, type FakeScript, type FakeStep } from '../../../src/llm/fake.js';
import { playFakeScript, validateFakeScriptFile, type FakeScriptFile, type FakeScriptPlayer, type FakeScriptTurn } from '../../../src/llm/fakeScripts.js';
import type { AskUserArgs, LlmBackend, LlmSession, SessionConfig } from '../../../src/llm/types.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, runPreflight } from '../../../src/run/index.js';
import type { PersistedRun, PersistedStep, PreflightInput, PreflightOutcome, RunCore, RunManager, RunServices, RunSettings } from '../../../src/run/types.js';
import type { CreateShadowOptions } from '../../../src/shadow/types.js';
import { cleanup, makeTempDir, realClearTimeout, realSetTimeout, WALKTHROUGH_FIXTURES } from './env.js';
import { FakeEngine } from './fakeEngine.js';
import { FakeProposals, FakeSidecars, FakeWorkspace } from './fakeServices.js';
import { createFakeShadow, openFakeShadow, type FakeShadow } from './fakeShadow.js';

export const TARGET = 'cynder-not-good';
export const ALL_PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];

/** A FakeBackend that records every session config and every close. */
export class TrackingBackend implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps;
  readonly configs: SessionConfig[] = [];
  readonly sessions: LlmSession[] = [];
  readonly closes: Array<{ force?: boolean }> = [];
  readonly interrupts: number[] = [];
  readonly inner: FakeBackend;

  constructor(script: FakeScript) {
    this.inner = new FakeBackend(script);
    this.caps = this.inner.caps;
  }

  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    this.configs.push(cfg);
    const session = await this.inner.startSession(cfg);
    const close = session.close.bind(session);
    const interrupt = session.interrupt.bind(session);
    session.close = async (opts?: { force?: boolean }) => {
      this.closes.push(opts ?? {});
      return close();
    };
    session.interrupt = async () => {
      this.interrupts.push(this.sessions.indexOf(session));
      return interrupt();
    };
    this.sessions.push(session);
    return session;
  }
}

/** Fake core texts (WP1's are stubs here): recognisable, and they record their calls. */
export function fakeCore(calls: string[] = []): Partial<RunCore> & { calls: string[] } {
  return {
    calls,
    attemptNotice: (findings: readonly GateFinding[], attempt: number, max: number, _ctx, revertedTo?: string) => {
      calls.push(`attemptNotice:${attempt}/${max}`);
      return attempt >= max ? `FAKE gave up after ${max}: ${findings[0]?.code ?? '-'}; reverted to ${revertedTo ?? '?'}` : `FAKE attempt ${attempt}: ${findings[0]?.code ?? '-'}`;
    },
    describeFinding: (f: GateFinding) => `described ${f.code}`,
    proposalLabel: () => 'FAKE label',
    decisionsInForce: (file: DecisionsFile, subject: string) => file.decisions.filter((d) => d.subject === subject && d.scope === 'subject'),
  };
}

export interface HarnessOptions {
  script?: FakeScript | FakeScriptTurn[];
  backend?: RunServices['backend'];
  caps?: Partial<RunCaps>;
  settings?: Partial<RunSettings>;
  now?: () => Date;
  core?: Partial<RunCore>;
  preflight?: (input: PreflightInput) => Promise<PreflightOutcome>;
  withFacts?: boolean;
  /** Share the root and runs dir of an earlier harness (recovery tests). */
  reuse?: { dir: string; root: string; runsDir: string; workspace?: FakeWorkspace };
  log?: string[];
  cancelLean?: (runId: string) => Promise<unknown>;
  /** Slice 2d: the model folder the workspace reads (default the Spyro fixture). */
  source?: string;
  /** Slice 2d: the run ids (item ids hash the run id: twin runs compare with the same one). */
  newRunId?: () => string;
}

export interface Harness {
  manager: RunManager;
  engine: FakeEngine;
  proposals: FakeProposals;
  sidecars: FakeSidecars;
  workspace: FakeWorkspace;
  backend: TrackingBackend | undefined;
  player: FakeScriptPlayer | undefined;
  dir: string;
  root: string;
  runsDir: string;
  log: string[];
  coreCalls: string[];
  cancelled: string[];
  /** Every `run` change, as `current()` returned it right then. */
  views: RunView[];
  shadows: FakeShadow[];
  /** The options of every createShadow call, in order (closing round 1: `copyBuild` comes from `reuseLeanBuild`). */
  shadowOptions: CreateShadowOptions[];
  shadow(): FakeShadow;
  dispose(): void;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const dir = options.reuse?.dir ?? makeTempDir('mgr');
  const root = options.reuse?.root ?? path.join(dir, 'model');
  const runsDir = options.reuse?.runsDir ?? path.join(dir, 'runs');
  mkdirSync(root, { recursive: true });
  const log = options.log ?? [];
  const workspace = options.reuse?.workspace ?? new FakeWorkspace(root, { withFacts: options.withFacts ?? true, log, ...(options.source !== undefined ? { source: options.source } : {}) });
  const engine = new FakeEngine();
  const proposals = new FakeProposals(log);
  const sidecars = new FakeSidecars();
  let player: FakeScriptPlayer | undefined;
  let backend: TrackingBackend | undefined;
  if (options.backend === undefined) {
    const script = options.script ?? [];
    let fakeScript: FakeScript;
    if (Array.isArray(script) && (script.length === 0 || !Array.isArray(script[0]))) {
      player = playFakeScript(script as FakeScriptTurn[]);
      fakeScript = player.script;
    } else fakeScript = script as FakeScript;
    backend = new TrackingBackend(fakeScript);
  }
  const shadows: FakeShadow[] = [];
  const shadowOptions: CreateShadowOptions[] = [];
  const coreCalls: string[] = [];
  const cancelled: string[] = [];
  const settings: RunSettings = {
    ...DEFAULT_RUN_SETTINGS,
    ...options.settings,
    caps: { ...DEFAULT_RUN_SETTINGS.caps, ...options.settings?.caps, ...options.caps },
  };
  const services: RunServices = {
    backend: options.backend ?? (backend as TrackingBackend),
    core: options.core ?? fakeCore(coreCalls),
    engine,
    proposals,
    sidecars,
    createShadow: async (o) => {
      log.push('createShadow');
      shadowOptions.push(o);
      const s = await createFakeShadow(o);
      shadows.push(s);
      return s;
    },
    openShadow: async (runDir, o) => {
      const s = await openFakeShadow(runDir, o);
      shadows.push(s);
      return s;
    },
    preflight:
      options.preflight ??
      ((input) => runPreflight({ ...input, checkSandbox: async () => undefined, readMemAvailable: () => 32 * 1024 ** 3 })),
    cancelLean:
      options.cancelLean ??
      (async (runId) => {
        cancelled.push(runId);
      }),
    log: () => undefined,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.newRunId !== undefined ? { newRunId: options.newRunId } : {}),
  };
  const manager = createRunManager({ root, runsDir, workspace, services, settings });
  const views: RunView[] = [];
  manager.onDidChange((c) => {
    if (c.run) {
      const v = manager.current();
      if (v !== null) views.push(v);
    }
  });
  return {
    manager,
    engine,
    proposals,
    sidecars,
    workspace,
    backend,
    player,
    dir,
    root,
    runsDir,
    log,
    coreCalls,
    cancelled,
    views,
    shadows,
    shadowOptions,
    shadow: () => {
      const s = shadows.at(-1);
      if (s === undefined) throw new Error('no shadow was created');
      return s;
    },
    dispose: () => {
      manager.dispose();
      if (options.reuse === undefined && process.env['TELELEAN_KEEP_TMP'] !== '1') cleanup(dir);
    },
  };
}

/** Resolves with the first view (now or after a change) that satisfies `predicate`; rejects after `timeoutMs` (real time). */
export function waitForRun(manager: RunManager, predicate: (view: RunView) => boolean, timeoutMs = 15_000, what = 'the run state'): Promise<RunView> {
  return new Promise((resolve, reject) => {
    const check = (): boolean => {
      const v = manager.current();
      if (v !== null && predicate(v)) {
        done();
        resolve(v);
        return true;
      }
      return false;
    };
    const sub = manager.onDidChange(() => void check());
    const timer = realSetTimeout(() => {
      sub.dispose();
      reject(new Error(`timed out waiting for ${what}; last view: ${JSON.stringify(manager.current()?.state)} ${JSON.stringify(manager.current()?.notices.map((n) => n.text))}`));
    }, timeoutMs);
    const done = (): void => {
      realClearTimeout(timer);
      sub.dispose();
    };
    check();
  });
}

export const state =
  (...states: RunView['state'][]) =>
  (v: RunView): boolean =>
    states.includes(v.state);

/** Slice 2d: the session's phase (`RunView.session.phase`). */
export const phase =
  (...phases: NonNullable<RunView['session']>['phase'][]) =>
  (v: RunView): boolean =>
    v.session !== undefined && phases.includes(v.session.phase);

/** Slice 2d: the stage is open, and no judge or write is pending (the session view says it is not judging). */
export function waitForStage(manager: RunManager, stage?: number, timeoutMs = 15_000): Promise<RunView> {
  return waitForRun(
    manager,
    (v) => v.session?.phase === 'stage' && (stage === undefined || v.session.stage === stage) && manager.session()?.judging === false,
    timeoutMs,
    `stage ${stage ?? 'any'}`,
  );
}

/** Slice 2d: run.json as written now (the raw view keeps the activity and notices a session's RunView withholds). */
export function rawRun(harness: Pick<Harness, 'shadow'>): PersistedRun {
  return readJson<PersistedRun>(harness.shadow().paths.stateFile);
}

/** Slice 2d: one step of the session as run.json holds it. */
export function rawStep(harness: Pick<Harness, 'shadow'>, id: string): PersistedStep {
  const s = rawRun(harness).session?.steps.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no step ${id}`);
  return s;
}

/** The reading-A question of docs/m2-plan.md section 10.2. */
export const ASK_MODALITY: AskUserArgs = {
  questions: [
    {
      phenomenon: 'modality',
      question: 'Does "cannot have" state a rule about what PG games should not include (normative), or that a PG game is unable to contain such a character (literal)?',
      options: [
        { label: 'A rule (normative)', consequence: 'A PG game with such a character breaks the rule; it says nothing about what the game contains.' },
        { label: 'Impossible (literal)', consequence: 'No PG game contains a character with a dark past at all.' },
      ],
      claudesGuess: { option: 0, note: 'rating rules are norms' },
      affectedNodes: ['pg-no-dark-past', 'no-such-card'],
    },
  ],
};

export const step = {
  usage: (messageId: string, inputTokens = 100, outputTokens = 10): FakeStep => ({ kind: 'usage', messageId, usage: { inputTokens, outputTokens, cacheReadInputTokens: 1000, cacheCreationInputTokens: 50 } }),
  ask: (args: AskUserArgs = ASK_MODALITY): FakeStep => ({ kind: 'callTool', tool: 'ask_user', args }),
  check: (files?: string[]): FakeStep => ({ kind: 'callTool', tool: 'check_lean', args: files === undefined ? {} : { files } }),
  freeze: (target = TARGET): FakeStep => ({ kind: 'callTool', tool: 'freeze_statements', args: { targets: [target] } }),
  finish: (status: 'proved' | 'not_proved' = 'proved', summary = 'Done.'): FakeStep => ({ kind: 'callTool', tool: 'finish', args: { status, summary, assumed_without_asking: [] } }),
  edit: (oldString: string, newString: string, file = 'Model/Spyro/Main.lean'): FakeStep => ({ kind: 'edit', path: file, oldString, newString }),
  text: (text: string): FakeStep => ({ kind: 'text', text }),
  result: (costEstimateUsd?: number): FakeStep => ({ kind: 'result', ...(costEstimateUsd !== undefined ? { costEstimateUsd } : {}) }),
  propose: (extra: Record<string, unknown> = {}): FakeStep => ({
    kind: 'callTool',
    tool: 'propose_assumption',
    args: {
      natural_name: 'A character who cannot be in a game would not be a good addition to it',
      lean_statement: '∀ (c : Character) (g : Game),\n   ¬ InGame c g → ¬ GoodAddition c g',
      why_needed: 'Nothing links being in a game to being a good addition to it.',
      proof: 'fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)',
      lean_name: 'not_in_game_not_good',
      ...extra,
    },
  }),
};

/** One turn matched to the round-1 context bundle. */
export function round1(...steps: FakeStep[]): FakeScriptTurn {
  return { match: 'Run: "Formalize for dependencies"', steps };
}

export function loadWalkthrough(name: string): FakeScriptFile & Record<string, unknown> {
  return validateFakeScriptFile(JSON.parse(readFileSync(path.join(WALKTHROUGH_FIXTURES, `${name}.json`), 'utf8'))) as FakeScriptFile & Record<string, unknown>;
}

export const START = { subject: 'Spyro', target: TARGET, premises: ALL_PREMISES };

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}
