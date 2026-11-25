/**
 * The run's shadow workspace (03 section 8.4 "Shadow", D-24, m0-report lesson 4; docs/m2-plan.md section 4.2).
 *
 *   <runsDir>/<runId>/   (2k2, docs/slice2-plan.md 2.10: runsDir = `<model root>/.telelean/runs`, git-ignored)
 *     ws/          the agent's root (Claude's cwd and the path guard's root). ONLY model files, all regular files:
 *                  lakefile.toml | lakefile.lean, lean-toolchain, lake-manifest.json, <library>.lean,
 *                  <library>/**.lean. No dot-entry at any depth (no .lake, .telelean, .git, .gitignore), so the guard
 *                  allows Grep and Glob on the whole root.
 *     build/       the Lean mirror: the same model files, synced from ws/ before every Lean job (content compare),
 *                  plus .lake/ (the run's own Lean build, from scratch; seeded from the user's .lake/build only with
 *                  `copyBuild`, see ./seed.ts). Only sandboxed Lean processes (runLean, sources read-only, .lake
 *                  writable) and telelean's own code read it. Lean facts are root-relative, so a path in build/ is the
 *                  same path in ws/.
 *     git/         the shadow's own history: GIT_DIR=git, work tree ws/, isolated config (GIT_CONFIG_GLOBAL=/dev/null,
 *                  GIT_CONFIG_NOSYSTEM=1, -c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0).
 *     session/     the CLI's run directory (generated settings, guard policy and log, MCP config with the bearer token,
 *                  system prompt) and transcript.jsonl. Never inside ws/ (confinement.ts refuses that).
 *     frozen/<n>/  freeze copies and their frozen.ndjson exports (n = freeze counter).
 *     gate/<n>/    comparator work directories (n = gate counter).
 *     scratch/     telelean's scratch Lean projects (ghost checks, statement rendering) — never agent-visible.
 *     run.json     the persisted run state (runner/src/run/types.ts PersistedRun).
 *     base-facts.json      the Lean facts of the user's files at the run's start (WP2 `checkBase`, B's facts).
 *     (proposal-facts.json, the facts Accept's lifecycle items needed, went with them in spec v4: a run directory
 *     written before may still hold one; nothing reads it.)
 *
 * FROZEN CONTRACT (M2). Owner: WP2. Additive optional members / new exports only (docs/m2-plan.md section 14).
 */
import type { FileChange } from '@telelean/core';

export interface ShadowPaths {
  /** `<runsDir>/<runId>` (2k2: `<root>/.telelean/runs/<runId>`) */
  runDir: string;
  ws: string;
  build: string;
  gitDir: string;
  sessionDir: string;
  frozenDir: string;
  gateDir: string;
  scratchDir: string;
  stateFile: string;
}

/**
 * Kinds of shadow commits. "The last state that passed" (A2) = the newest commit of kind `gate-pass`, `freeze` or
 * `base` (an adoption is always followed by its freeze).
 */
export type ShadowCommitKind =
  | 'base'
  /** freeze_statements succeeded (G0/G1/G3-readiness/G5 passed). */
  | 'freeze'
  /** A ghost was written into ws/ by telelean ("I hold this"). */
  | 'adopt'
  /** telelean's normalisation (pins, docstrings) before a gate. */
  | 'normalise'
  /** The gate passed. */
  | 'gate-pass'
  /** ws/ restored to an earlier commit (give up, caps). */
  | 'revert'
  /** Accept rebased the proposal onto the user's current files. */
  | 'rebase'
  /**
   * Reviewer addition: the user's real model files at Accept, written into ws/ right before the `rebase` commit when
   * they drifted; it is B for the re-check (CheckContext.baseCommit), so the user's own edits are never judged.
   */
  | 'accept-base'
  /** Any other snapshot telelean wants to keep (e.g. the state at a gate failure, for the transcript). */
  | 'checkpoint'
  /**
   * Slice 2 (docs/slice2-plan.md 2.6, 2b3b): the start S₀ of a step of an edit session (its StepScope is recorded on
   * it). A step's rollback never goes behind it (`lastCommitSince`).
   */
  | 'step-start'
  /** Slice 2: telelean carried out the person's decision in ws/ (a decline, a take-out, an un-reject's merge). */
  | 'decision'
  /** Slice 2: telelean's completion of a target from an accepted premise (`engine.complete`, §3.8). */
  | 'completion';

export const PASSING_COMMIT_KINDS: readonly ShadowCommitKind[] = ['gate-pass', 'freeze', 'base'];

export interface ShadowCommit {
  /** Commit id (hex). */
  id: string;
  kind: ShadowCommitKind;
  label: string;
  round: number;
  at: string;
}

export interface CreateShadowOptions {
  /** Absolute path of the model root (holds `.telelean/config.json`). */
  root: string;
  /**
   * The runs folder the run directory goes in: the RunManager passes the root's own, `runsDirOf(root)` (2k2, D2-108);
   * the shadow's own tests may pass a scratch dir. Created if missing, with its `.gitignore` (`ensureRunsDir`).
   */
  runsDir: string;
  /** `[A-Za-z0-9_]{1,64}`. */
  runId: string;
  /** The Lake library (`.telelean/config.json`), e.g. `Model`. */
  library: string;
  /**
   * The base texts by root-relative POSIX path: what the board shows (TextSource: open buffers first) for every model
   * file (`<library>.lean`, `<library>/**.lean`) and the project files (lakefile, toolchain, manifest). Nothing else
   * enters ws/.
   */
  files: ReadonlyMap<string, string>;
  /**
   * Seed `build/.lake/build` from the user's `<root>/.lake/build`. Default false (closing round 1): the run's first Lean
   * job builds the model from scratch. The RunManager sets it from `telelean.run.reuseLeanBuild`. When set, the tree is
   * copied as one of telelean's Lean jobs (`semantic.runExclusive`) and only when it is exactly what the board's last
   * refresh recorded, untouched since (./seed.ts `noteRefreshOutput`: what `.lake/build` held right after that refresh,
   * another program's writes during it included); otherwise nothing is seeded, the start is never refused, and
   * `ShadowWorkspace.buildSeed.skipped` says why.
   */
  copyBuild?: boolean;
  /** The git executable (default `git`). */
  gitPath?: string;
  /** Commit time source (tests). */
  now?: () => Date;
}

export type ShadowErrorCode =
  /** A path outside the model-file set, absolute, with `..`, or a dot-segment. */
  | 'bad-path'
  /** ws/ or the user's model tree holds a symlink or a non-regular entry where a model file is expected (a symlink in the user's .lake/build only means no seed, closing round 1). */
  | 'not-regular'
  /** A dot-entry appeared in ws/ (e.g. the agent wrote `.foo`): refused, never synced. */
  | 'hidden-entry'
  | 'git'
  | 'io';

export class ShadowLayoutError extends Error {
  readonly code: ShadowErrorCode;
  readonly paths: readonly string[];
  constructor(code: ShadowErrorCode, message: string, paths: readonly string[] = []) {
    super(message);
    this.name = 'ShadowLayoutError';
    this.code = code;
    this.paths = paths;
  }
}

/**
 * What seeding the build mirror from the user's `.lake/build` did (fixer round 3; closing round 1). Without
 * `copyBuild` nothing is seeded (`{ files: 0 }`). With it, a tree that is not exactly what the board's last refresh
 * recorded (./seed.ts), untouched since, seeds nothing: the run's first Lean job is then a full build, never a refusal.
 */
export interface BuildSeedOutcome {
  /** Files copied into `build/.lake/build` (0: nothing seeded). */
  files: number;
  /** Why nothing was seeded although `copyBuild` asked for it (plain words, for the log); absent otherwise. */
  skipped?: string;
}

export interface ShadowWorkspace {
  readonly runId: string;
  readonly root: string;
  readonly library: string;
  readonly paths: ShadowPaths;
  /** How `createRunShadow` seeded the build mirror (`{ files: 0 }` without `copyBuild`; absent on a shadow re-opened by `openRunShadow`). */
  readonly buildSeed?: BuildSeedOutcome;
  /** The base texts (the base commit), path -> text. */
  baseFiles(): Promise<Map<string, string>>;
  /**
   * EVERY regular file in ws/ now (any name or extension), path -> text. Reviewer clarification: a stray file Claude
   * wrote (e.g. `Model/Spyro/notes.md`) is returned, and G0 reports it (`bad-path` / `outside-subject`, counted
   * against the attempt); only what cannot be a file Claude wrote with its confined tools throws ShadowLayoutError
   * (`not-regular`, `hidden-entry`), listing every symlink, special file or dot-entry anywhere in ws/ (fail closed:
   * nothing is synced or diffed; an `environment` outcome).
   */
  currentFiles(): Promise<Map<string, string>>;
  /** Whole-file changes from a commit (default: the base) to ws/ now, sorted by path. */
  changes(from?: string): Promise<FileChange[]>;
  /**
   * Makes build/ hold exactly ws/'s MODEL files (`<library>.lean`, `<library>/**.lean`, the project files; other
   * files never reach Lean): copies changed ones by content compare, deletes model files gone from ws/, keeps mtimes
   * of unchanged files so Lake's rebuild stays incremental. Throws like `currentFiles`.
   * Slice 2b3b (additive): with `files` (path -> text, e.g. a commit's `filesAt`), build/ holds exactly those files'
   * model files instead of ws/'s, which is not read: the session's judge builds the head commit whatever a write in
   * progress has put into ws/ meanwhile (docs/slice2-plan.md 2.6).
   */
  syncMirror(files?: ReadonlyMap<string, string>): Promise<{ copied: string[]; removed: string[] }>;
  /**
   * telelean's own writes into ws/ (normalisation, ghost adoption, rebase): each change's `before` must equal the
   * current text (else ShadowLayoutError `io` and nothing is written); paths must be model files.
   */
  writeFiles(changes: readonly FileChange[]): Promise<void>;
  commit(kind: ShadowCommitKind, label: string, round: number): Promise<ShadowCommit>;
  commits(): Promise<ShadowCommit[]>;
  /** The newest commit of one of `kinds` (default PASSING_COMMIT_KINDS). */
  lastCommit(kinds?: readonly ShadowCommitKind[]): Promise<ShadowCommit | undefined>;
  /**
   * Slice 2 (docs/slice2-plan.md 2.6, 2b3b): the newest commit of one of `kinds` that is `since` itself or newer than
   * it, never an older one: a step's rollback target is `lastCommitSince(step.startCommit, ['gate-pass', 'freeze',
   * 'step-start'])`, so a rollback never goes behind the step's start. Undefined when `since` is not a commit of the
   * shadow, or when neither it nor a newer commit is of one of `kinds` (fail closed: the caller rolls back to nothing).
   */
  lastCommitSince(since: string, kinds: readonly ShadowCommitKind[]): Promise<ShadowCommit | undefined>;
  filesAt(commitId: string): Promise<Map<string, string>>;
  /**
   * Restores ws/ to a commit (files not in it are deleted), commits it as `revert`, returns the changes it made.
   * A no-op (no commit, `[]`) when ws/ already equals that commit.
   */
  revertTo(commitId: string, label: string, round: number): Promise<FileChange[]>;
}

/** One run directory of a root, for recovery and pruning. */
export interface RunDirInfo {
  runId: string;
  runDir: string;
  /** From run.json (undefined when missing or unreadable). */
  state?: string;
  updatedAt?: string;
}
