/**
 * Shared helpers for the WP2 tests (shadow and Lean check engine): the Spyro fixture's model files, the gate edit
 * scripts of test-fixtures/gate/, engine contexts, and simple fakes of WP1's core functions for the tests that run
 * while WP1's rules are still stubs (the [gated] tests use the real ones and skip themselves until they exist).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { FrozenSnapshot, GateFinding, PermittedAxioms, RuleInput, RuleReport, Selection } from '@telelean/core';

import type { CheckContext, EngineCore, FreezeRecord, LeanJobSettings } from '../../src/gate/index.js';
import type { ShadowWorkspace } from '../../src/shadow/index.js';
import { REPO_ROOT, SPYRO } from '../lean/helpers.js';

export { cleanupTempRoot, knownProjectsLines, makeTempRoot, MiB, processesMatching, REPO_ROOT, SPYRO } from '../lean/helpers.js';

export const GATE_FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'gate');
export const GiB = 1024 ** 3;

const PROJECT_FILES = ['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json'];

function walkFiles(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkFiles(dir, childRel));
    else if (entry.isFile()) out.push(childRel);
  }
  return out;
}

/** The Spyro fixture's model and project files (what ModelWorkspace.readText gives; `Check/` is not a model file). */
export function spyroModelFiles(overlay?: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const rel of walkFiles(SPYRO)) {
    if (PROJECT_FILES.includes(rel) || rel === 'Model.lean' || (rel.startsWith('Model/') && rel.endsWith('.lean'))) {
      files.set(rel, readFileSync(path.join(SPYRO, rel), 'utf8'));
    }
  }
  if (overlay !== undefined) {
    const dir = path.join(GATE_FIXTURES, 'overlays', overlay);
    for (const rel of walkFiles(dir)) files.set(rel, readFileSync(path.join(dir, rel), 'utf8'));
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** A model root on disk: a scratch copy of the Spyro fixture (Check/ included, as a user's folder may hold other files) + overlay. */
export function spyroRoot(tmp: string, name: string, overlay?: string): string {
  const root = path.join(tmp, name);
  if (existsSync(root)) throw new Error(`${root} exists`);
  for (const rel of walkFiles(SPYRO)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    copyFileSync(path.join(SPYRO, rel), path.join(root, rel));
  }
  if (overlay !== undefined) {
    const dir = path.join(GATE_FIXTURES, 'overlays', overlay);
    for (const rel of walkFiles(dir)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      copyFileSync(path.join(dir, rel), path.join(root, rel));
    }
  }
  return root;
}

export interface EditStep {
  path: string;
  oldString: string | null;
  newString?: string;
  newStringFile?: string;
}

let editCache: Record<string, EditStep[]> | undefined;

/** The named edit script of test-fixtures/gate/edits.json. */
export function editScript(name: string): EditStep[] {
  editCache ??= JSON.parse(readFileSync(path.join(GATE_FIXTURES, 'edits.json'), 'utf8')) as Record<string, EditStep[]>;
  const steps = editCache[name];
  if (steps === undefined || name.startsWith('_')) throw new Error(`no edit script ${name}`);
  return steps;
}

function replacement(step: EditStep): string {
  if (step.newStringFile !== undefined) return readFileSync(path.join(GATE_FIXTURES, step.newStringFile), 'utf8');
  if (step.newString === undefined) throw new Error(`edit of ${step.path} has no new text`);
  return step.newString;
}

/** Applies edit scripts to a path -> text map (a copy). */
export function applyEdits(files: ReadonlyMap<string, string>, ...names: string[]): Map<string, string> {
  const out = new Map(files);
  for (const name of names) {
    for (const step of editScript(name)) {
      const current = out.get(step.path);
      if (step.oldString === null) {
        if (current !== undefined) throw new Error(`${name}: ${step.path} exists`);
        out.set(step.path, replacement(step));
        continue;
      }
      if (current === undefined) throw new Error(`${name}: ${step.path} is missing`);
      const count = current.split(step.oldString).length - 1;
      if (count !== 1) throw new Error(`${name}: the old text occurs ${count} times in ${step.path}`);
      out.set(step.path, current.replace(step.oldString, () => replacement(step)));
    }
  }
  return out;
}

/** Plays Claude: applies edit scripts to the files of ws/ directly (as its Edit and Write tools would). */
export function editWs(shadow: ShadowWorkspace, ...names: string[]): void {
  const touched = new Set(names.flatMap((n) => editScript(n).map((s) => s.path)));
  const before = new Map<string, string>();
  for (const rel of touched) {
    const file = path.join(shadow.paths.ws, rel);
    if (existsSync(file)) before.set(rel, readFileSync(file, 'utf8'));
  }
  const after = applyEdits(before, ...names);
  for (const [rel, text] of after) {
    mkdirSync(path.dirname(path.join(shadow.paths.ws, rel)), { recursive: true });
    writeFileSync(path.join(shadow.paths.ws, rel), text);
  }
}

/** Removes a file from ws/ (playing Claude). */
export function removeFromWs(shadow: ShadowWorkspace, rel: string): void {
  rmSync(path.join(shadow.paths.ws, rel));
}

export const SUBJECT = 'Spyro';
export const TARGET = 'cynder-not-good';
export const ALL_PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];

export function selection(premises: readonly string[] = ALL_PREMISES, adoptedGhosts: readonly string[] = []): Selection {
  return { subject: SUBJECT, target: TARGET, premises, adoptedGhosts };
}

/** Job settings for a test run (real memory guard at 2 GiB unless overridden). */
export function jobFor(runId: string, extra: Partial<LeanJobSettings> = {}): LeanJobSettings {
  return { runId, memoryMax: '4G', minAvailableBytes: 2 * GiB, leanJobMs: 120_000, ...extra };
}

export function contextFor(shadow: ShadowWorkspace, runId: string, over: Partial<CheckContext> = {}): CheckContext {
  return {
    shadow,
    selection: selection(),
    stage: 'formalise',
    round: 1,
    job: jobFor(runId),
    teleleanBlocks: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------- the D-5 sets (plan 3.2)

export const STD = ['Classical.choice', 'Quot.sound', 'propext'];
export const SIGNATURE = ['Spyro.Character', 'Spyro.Game', 'Spyro.GoodAddition', 'Spyro.HasDarkPast', 'Spyro.IsPG'];
export const PRESUPPOSITIONS = ['Spyro.Character.exists', 'Spyro.Game.exists'];
export const SELECTED_ALL = ['Spyro.cynder_dark_past.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds'];
/** Spyro, normative reading, all three selected: the 13 names of plan section 3.2 (= M0's permitted(ALL_SELECTED)). */
export const PERMITTED_NORMATIVE = [...STD, ...SIGNATURE, ...PRESUPPOSITIONS, ...SELECTED_ALL].sort();

export function permittedAxioms(parts: { signature?: string[]; selected?: string[]; presuppositions?: string[] } = {}): PermittedAxioms {
  const signature = parts.signature ?? SIGNATURE;
  const selected = parts.selected ?? SELECTED_ALL;
  const presuppositions = parts.presuppositions ?? PRESUPPOSITIONS;
  return {
    standard: [...STD],
    signature: [...signature],
    selected: [...selected],
    presuppositions: [...presuppositions],
    derivationFootprints: [],
    unusable: [],
    all: [...new Set([...STD, ...signature, ...selected, ...presuppositions])].sort(),
  };
}

// ---------------------------------------------------------------------------------------------- fakes of WP1's functions

/** A naive G0: non-model added paths are `bad-path`; a `sorry` or `#eval` Claude added to a .lean file is reported. */
export function fakeCheckFileChanges(base: ReadonlyMap<string, string>, current: ReadonlyMap<string, string>): GateFinding[] {
  const findings: GateFinding[] = [];
  for (const [p, text] of current) {
    const before = base.get(p);
    if (before === text) continue;
    if (!/^Model(\/[A-Za-z_][A-Za-z0-9_]*)*\.lean$/u.test(p) && !PROJECT_FILES.includes(p)) {
      findings.push({ step: 'G0', code: 'bad-path', message: `${p} is not a module of the subject`, file: p, token: p });
      continue;
    }
    for (const token of ['sorry', '#eval']) {
      if (text.includes(token) && !(before ?? '').includes(token)) {
        findings.push({ step: 'G0', code: token === 'sorry' ? 'sorry' : 'hash-command', message: `${p}: forbidden \`${token}\``, file: p, token });
      }
    }
  }
  return findings;
}

/** Every rule holds; footprints are the facts' axioms of the theorems. */
export function passingRules(input: RuleInput): RuleReport {
  const footprints: Record<string, string[]> = {};
  for (const d of input.current.facts?.decls ?? []) if (d.kind === 'theorem' && d.axioms !== undefined) footprints[d.name] = d.axioms;
  return { findings: [], flaggedDefinitions: [], footprints, formalisedThisRun: [], declarations: { added: [], changed: [], removed: [] } };
}

/** A fake frozen snapshot of the Spyro target with the given permitted set. */
export function fakeFreezeCore(permitted: PermittedAxioms, targetStatement = 'Spyro.cynder_not_good'): Pick<EngineCore, 'computePermittedAxioms' | 'frozenSnapshot'> {
  return {
    computePermittedAxioms: () => permitted,
    frozenSnapshot: (_model, _selection, round): FrozenSnapshot => ({ round, permitted, targetStatement, declarations: {}, axioms: [] }),
  };
}

/** Core fakes for engine-mechanics tests: G0 as above, every rule passing, the given permitted set. */
export function fakeCore(permitted: PermittedAxioms = permittedAxioms(), over: Partial<EngineCore> = {}): Partial<EngineCore> {
  return {
    checkFileChanges: fakeCheckFileChanges,
    ghostTextProblems: () => [],
    evaluateRules: passingRules,
    normalisationChanges: () => [],
    ...fakeFreezeCore(permitted),
    ...over,
  };
}

/** A freeze record for tests that fake the freeze itself (no export behind it). */
export function fakeFreezeRecord(shadowCommit: FreezeRecord['commit'], permitted: PermittedAxioms, sel: Selection = selection()): FreezeRecord {
  return {
    round: 1,
    commit: shadowCommit,
    at: new Date(0).toISOString(),
    selection: sel,
    snapshot: { round: 1, permitted, targetStatement: 'Spyro.cynder_not_good', declarations: {}, axioms: [] },
    freeze: { exportPath: '/nonexistent/frozen.ndjson', challengeModule: 'Model.TeleleanChallenge', theoremNames: ['Spyro.cynder_not_good.holds'], permittedAxioms: permitted.all, definitionNames: [] },
  };
}
