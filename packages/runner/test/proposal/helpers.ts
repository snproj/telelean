/**
 * Shared helpers for the WP4 proposal tests: an in-memory ShadowWorkspace (WP2 builds the real one in parallel), fake
 * core functions standing in for WP1's stubs, the Spyro run states of docs/m2-plan.md section 10.2 (the exact edits),
 * and real Lean facts of a scratch copy (M1's semantic layer, sandboxed under runLean, one job at a time).
 * Importing this module also sets the scratch git environment of ../workspace/helpers.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  buildProjectModel,
  parseLeanFile,
  subjectGraph,
  type AttemptLine,
  type AttemptSummary,
  type DecisionRecord,
  type DecisionsFile,
  type FileChange,
  type GraphDiff,
  type LeanFacts,
  type ProjectModel,
  type RunUsage,
  type TlGraph,
} from '@telelean/core';

import { refreshLeanFacts, runExclusive } from '../../src/semantic/index.js';
import { PASSING_COMMIT_KINDS, type ShadowCommit, type ShadowCommitKind, type ShadowWorkspace } from '../../src/shadow/types.js';
import { isModelOrProjectFile } from '../../src/workspace/files.js';
import { sha256 } from '../workspace/helpers.js';

export const LIBRARY = 'Model';
export const MAIN = 'Model/Spyro/Main.lean';
export const VOCABULARY = 'Model/Spyro/Vocabulary.lean';
export const INBOX = 'Model/Spyro/Inbox.lean';

// ------------------------------------------------------------------------------------------- an in-memory shadow

export interface FakeShadow extends ShadowWorkspace {
  /** ws/ now (tests change it directly). */
  readonly current: Map<string, string>;
}

/** Every file under `root` that a shadow would hold (model and project files), as path -> text. */
export function shadowFilesOnDisk(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) walk(child);
      } else if (entry.isFile() && isModelOrProjectFile(child, LIBRARY)) {
        out.set(child, readFileSync(path.join(root, child), 'utf8'));
      }
    }
  };
  walk('');
  return out;
}

export function fakeShadow(options: {
  runDir: string;
  /** The real model root (the shadow's `root`). */
  root: string;
  base: ReadonlyMap<string, string>;
  current?: ReadonlyMap<string, string>;
  runId?: string;
}): FakeShadow {
  const runDir = options.runDir;
  const current = new Map(options.current ?? options.base);
  const snapshots = new Map<string, Map<string, string>>([['c0', new Map(options.base)]]);
  const commits: ShadowCommit[] = [{ id: 'c0', kind: 'base', label: 'Base', round: 1, at: '2026-11-01T10:00:00.000Z' }];
  const diff = (from: ReadonlyMap<string, string>, to: ReadonlyMap<string, string>): FileChange[] =>
    [...new Set([...from.keys(), ...to.keys()])]
      .sort()
      .map((rel) => ({ path: rel, before: from.get(rel) ?? null, after: to.get(rel) ?? null }))
      .filter((c) => c.before !== c.after);
  const snapshot = (id: string): Map<string, string> => {
    const files = snapshots.get(id);
    if (!files) throw new Error(`no such shadow commit ${id}`);
    return new Map(files);
  };
  const shadow: FakeShadow = {
    runId: options.runId ?? 'r1',
    root: options.root,
    library: LIBRARY,
    current,
    paths: {
      runDir,
      ws: path.join(runDir, 'ws'),
      build: path.join(runDir, 'build'),
      gitDir: path.join(runDir, 'git'),
      sessionDir: path.join(runDir, 'session'),
      frozenDir: path.join(runDir, 'frozen'),
      gateDir: path.join(runDir, 'gate'),
      scratchDir: path.join(runDir, 'scratch'),
      stateFile: path.join(runDir, 'run.json'),
    },
    baseFiles: async () => snapshot('c0'),
    currentFiles: async () => new Map(current),
    changes: async (from) => diff(snapshot(from ?? 'c0'), current),
    syncMirror: async () => ({ copied: [], removed: [] }),
    async writeFiles(changes) {
      for (const change of changes) if ((current.get(change.path) ?? null) !== change.before) throw new Error(`${change.path} changed`);
      for (const change of changes) {
        if (change.after === null) current.delete(change.path);
        else current.set(change.path, change.after);
      }
    },
    async commit(kind: ShadowCommitKind, label: string, round: number) {
      const commit: ShadowCommit = { id: `c${commits.length}`, kind, label, round, at: '2026-11-01T10:00:00.000Z' };
      snapshots.set(commit.id, new Map(current));
      commits.push(commit);
      return commit;
    },
    commits: async () => [...commits],
    lastCommit: async (kinds = PASSING_COMMIT_KINDS) => [...commits].reverse().find((c) => kinds.includes(c.kind)),
    filesAt: async (id) => snapshot(id),
    async revertTo(id, label, round) {
      const target = snapshot(id);
      const changes = diff(current, target);
      if (changes.length === 0) return [];
      current.clear();
      for (const [rel, text] of target) current.set(rel, text);
      await shadow.commit('revert', label, round);
      return changes;
    },
  };
  return shadow;
}

/** A ReadRealText over a map (null or absent = the file does not exist), recording what was read. */
export function realReader(files: Map<string, string | null>): ((rel: string) => Promise<string | null>) & { reads: string[] } {
  const reads: string[] = [];
  const read = async (rel: string): Promise<string | null> => {
    reads.push(rel);
    return files.get(rel) ?? null;
  };
  return Object.assign(read, { reads });
}

// ------------------------------------------------------------------------------------------- edits and run states

/** Replaces the single occurrence of `oldString` (throws when it occurs zero or several times). */
export function edit(text: string, oldString: string, newString: string): string {
  const at = text.indexOf(oldString);
  if (at < 0 || text.indexOf(oldString, at + 1) >= 0) throw new Error(`expected exactly one occurrence of ${JSON.stringify(oldString)}`);
  return `${text.slice(0, at)}${newString}${text.slice(at + oldString.length)}`;
}

const PG_BLOCK_END = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
const statementOf = (consequent: string): string =>
  'stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\n' +
  `abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ${consequent}\n` +
  'axiom pg_no_dark_past.holds : pg_no_dark_past\n\n';
/** What telelean's normalisation adds after the agent formalised pg-no-dark-past (plan section 3.4: the D-8 pin). */
const PIN = (text: string): string => edit(text, 'asserted: 2026-11-01\n-/\n/-- PG games', 'asserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/\n/-- PG games');
const TARGET_ABBREV = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
const PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

/** Reading A (normative) after round 1: steps A.3 and A.6 of plan section 10.2, normalised. */
export function normativeState(base: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(base);
  const main = edit(PIN(edit(base.get(MAIN) ?? '', PG_BLOCK_END, statementOf('¬ GoodAddition c g'))), TARGET_ABBREV, `${TARGET_ABBREV}${PROOF}`);
  out.set(MAIN, main);
  return out;
}

/** Reading B (literal) after round 1: steps B.3 and B.4, normalised; no proof. */
export function literalState(base: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(base);
  out.set(VOCABULARY, edit(base.get(VOCABULARY) ?? '', '/-- Cynder -/', '/-- is in -/\naxiom InGame : Character → Game → Prop\n/-- Cynder -/'));
  out.set(MAIN, PIN(edit(base.get(MAIN) ?? '', PG_BLOCK_END, statementOf('¬ InGame c g'))));
  return out;
}

/** The adopted ghost's id (deriveId of its sentence, plan section 10.2). */
export const GHOST_NODE = 'a-character-who-cannot-be-in';

/**
 * Reading B after the adoption round: the ghost written before the target's block as core's planGhostAdoption
 * documents it (worded_by/origin agent, session, the user's rationale, pinned, docstring = sentence, the checked
 * statement), and the proof of step B.9.
 */
export function adoptedState(base: ReadonlyMap<string, string>): Map<string, string> {
  const out = literalState(base);
  const block =
    '/-\n@@ telelean v1\n' +
    `id: ${GHOST_NODE}\ntype: ASSUMPTION\nnatural_name: A character who cannot be in a game would not be a good addition to it\n` +
    'rationale: it seems obvious to me\nasserted: 2026-11-01\nlean: Spyro.not_in_game_not_good\norigin: agent\nsession: r1\nworded_by: agent\n-/\n' +
    '/-- A character who cannot be in a game would not be a good addition to it -/\n' +
    'abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g\n' +
    'axiom not_in_game_not_good.holds : not_in_game_not_good\n\n';
  const main = edit(out.get(MAIN) ?? '', '/-\n@@ telelean v1\nid: cynder-not-good\n', `${block}/-\n@@ telelean v1\nid: cynder-not-good\n`);
  const proof =
    'theorem cynder_not_good.holds : cynder_not_good :=\n' +
    '  not_in_game_not_good.holds cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)\n';
  out.set(MAIN, edit(main, TARGET_ABBREV, `${TARGET_ABBREV}${proof}`));
  return out;
}

/** The `definition-belief` cheat of plan section 10.3: `def InGame … := GoodAddition c g`, the literal statement over it, a proof. */
export function definitionCheatState(base: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map(base);
  out.set(VOCABULARY, edit(base.get(VOCABULARY) ?? '', '/-- Cynder -/', '/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g\n/-- Cynder -/'));
  out.set(MAIN, edit(PIN(edit(base.get(MAIN) ?? '', PG_BLOCK_END, statementOf('¬ InGame c g'))), TARGET_ABBREV, `${TARGET_ABBREV}${PROOF}`));
  return out;
}

export const SELECTION_ALL = {
  subject: 'Spyro',
  target: 'cynder-not-good',
  premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
  adoptedGhosts: [],
} as const;

export const USAGE: RunUsage = {
  requests: 12,
  inputTokens: 3000,
  outputTokens: 800,
  cacheReadInputTokens: 90_000,
  cacheCreationInputTokens: 12_000,
  costEstimateUsd: 0.42,
};

// ------------------------------------------------------------------------------------------- real Lean facts

let refreshes = 0;

/** M1's refresh of a scratch model root (sandboxed, in place, one job at a time), with this test file's run id. */
export async function realFacts(root: string, runIdBase: string): Promise<LeanFacts> {
  return runExclusive(() => refreshLeanFacts({ root, library: LIBRARY, runId: `${runIdBase}_${++refreshes}` }));
}

/** core's project model of `files` (model files parsed with the real core) with optional facts. */
export function modelOf(files: ReadonlyMap<string, string>, facts?: LeanFacts): ProjectModel {
  const paths = [...files.keys()].filter((rel) => rel === 'Model.lean' || (rel.startsWith('Model/') && rel.endsWith('.lean'))).sort();
  return buildProjectModel({
    files: paths.map((rel) => parseLeanFile(rel, files.get(rel) ?? '')),
    fileHashes: Object.fromEntries(paths.map((rel) => [rel, sha256(files.get(rel) ?? '')])),
    library: LIBRARY,
    ...(facts ? { facts } : {}),
  });
}

/** The Spyro board of `files` with `facts` (what the workspace shows), version 1. */
export function boardOf(files: ReadonlyMap<string, string>, facts?: LeanFacts): TlGraph {
  return subjectGraph(modelOf(files, facts), 'Spyro', { version: 1, semantic: facts ? { state: 'fresh' } : { state: 'unavailable' } });
}

export function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------- fake core codecs

/** A GraphDiff stand-in (WP1's diffGraphs is a stub until integration). */
export function fakeDiff(): GraphDiff {
  return { nodes: { 'fake-node': { change: 'changed', fields: ['statement'] } }, vocabulary: {}, edges: { added: [], removed: [] }, counts: { added: 0, changed: 1, removed: 0, vocabularyAdded: 0 } };
}

/** Simple codecs with the documented behaviour (WP1's real ones are stubs until integration). */
export const fakeCodecs = {
  parseAttemptLines(text: string): AttemptLine[] {
    const out: AttemptLine[] = [];
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const value = JSON.parse(line) as AttemptLine;
        if (value.format === 'telelean-attempt' || value.format === 'telelean-attempt-resolution') out.push(value);
      } catch {
        // skipped, as documented
      }
    }
    return out;
  },
  serializeAttemptLine: (line: AttemptLine): string => JSON.stringify(line),
  summariseAttempts(lines: readonly AttemptLine[]): AttemptSummary[] {
    const records: AttemptSummary[] = [];
    for (const line of lines) {
      if (line.format === 'telelean-attempt') records.push({ ...line });
      else for (const r of records) if (r.run === line.run && r.round === line.round) r.resolution = line.resolution;
    }
    return records.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date === b.r.date ? b.i - a.i : a.r.date < b.r.date ? 1 : -1)).map(({ r }) => r);
  },
  parseDecisionsFile(json: string | null): DecisionsFile {
    try {
      const raw = JSON.parse(json ?? '') as DecisionsFile;
      return { format: 'telelean-decisions', version: 1, decisions: Array.isArray(raw.decisions) ? raw.decisions : [] };
    } catch {
      return { format: 'telelean-decisions', version: 1, decisions: [] };
    }
  },
  serializeDecisionsFile: (file: DecisionsFile): string => `${JSON.stringify(file, null, 2)}\n`,
  addDecisions(file: DecisionsFile, records: readonly DecisionRecord[]): DecisionsFile {
    const decisions = file.decisions.filter((d) => !records.some((r) => r.id === d.id));
    return { ...file, decisions: [...decisions, ...records] };
  },
};
