/**
 * Git process helpers for telelean's private history refs (D-33, docs/m1-plan.md section 8).
 *
 * Every call runs `git` without a shell, with telelean's safe settings in front of the subcommand:
 *
 *   git -c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 -c core.fsmonitor=false <subcommand> …
 *
 * so no signing prompt appears, none of the user's hooks run, no automatic gc starts and no fsmonitor daemon is
 * spawned. The environment has `GIT_TERMINAL_PROMPT=0` and `LC_ALL=C` (stable messages), and never carries
 * variables that would point git at another repository, index or object store (the caller's own temporary
 * `GIT_INDEX_FILE` aside). Only plumbing is used by the history store; nothing here touches the user's index,
 * HEAD, branches, remotes or hooks.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** `-c` settings put in front of every git subcommand telelean runs. */
export const SAFE_GIT_CONFIG: readonly string[] = [
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'gc.auto=0',
  '-c',
  'core.fsmonitor=false',
];

/** Variables that would redirect git to another repository, index or object store; never inherited. */
const REDIRECTING_GIT_ENV: readonly string[] = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_QUARANTINE_PATH',
];

/** Largest output read from one git call (blob contents, listings). */
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export type GitErrorKind = 'missing' | 'failed';

export class GitError extends Error {
  constructor(
    message: string,
    /** `missing`: the git executable could not be started; `failed`: it exited non-zero. */
    readonly kind: GitErrorKind,
    readonly exitCode: number | null = null,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitRunOptions {
  /** Working directory (the model root). */
  cwd: string;
  /** Data for stdin (then closed); default: no stdin (git reads nothing). */
  input?: string | Buffer;
  /** Extra environment (author/committer identity, a temporary GIT_INDEX_FILE, dates). */
  env?: Readonly<Record<string, string>>;
  /** Exit codes that count as success (default `[0]`); the caller inspects `GitResult.code`. */
  okCodes?: readonly number[];
}

export interface GitResult {
  stdout: Buffer;
  stderr: string;
  code: number;
}

/** The environment for a git child: the host's, minus redirecting variables, plus telelean's fixed settings. */
export function gitEnvironment(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of REDIRECTING_GIT_ENV) delete env[name];
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['LC_ALL'] = 'C';
  return { ...env, ...extra };
}

/** Runs `git <SAFE_GIT_CONFIG> <args>`; rejects with GitError unless the exit code is in `okCodes`. */
export function runGit(gitPath: string, args: readonly string[], options: GitRunOptions): Promise<GitResult> {
  const argv = [...SAFE_GIT_CONFIG, ...args];
  const okCodes = options.okCodes ?? [0];
  return new Promise<GitResult>((resolve, reject) => {
    let child;
    try {
      // No stdin pipe unless there is input: writing to the pipe of a git that already exited raises SIGPIPE in VS Code's
      // extension host (it installs a SIGPIPE handler, which logs "Unexpected SIGPIPE").
      const stdin = options.input === undefined ? 'ignore' : 'pipe';
      child = spawn(gitPath, argv, { cwd: options.cwd, env: gitEnvironment(options.env), stdio: [stdin, 'pipe', 'pipe'] });
    } catch (error) {
      reject(new GitError(`cannot start ${gitPath}: ${(error as Error).message}`, 'missing'));
      return;
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let settled = false;
    const fail = (error: GitError): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        fail(new GitError(`git ${args[0] ?? ''}: output exceeds ${MAX_OUTPUT_BYTES} bytes`, 'failed'));
        return;
      }
      out.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
    child.stdin?.on('error', () => undefined); // git may exit before reading all input; its exit code tells why
    child.on('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'ENOENT' || error.code === 'EACCES'
          ? new GitError(`git executable not found (${gitPath})`, 'missing')
          : new GitError(`git ${args[0] ?? ''}: ${error.message}`, 'failed'),
      );
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      const stderr = Buffer.concat(err).toString('utf8');
      const exit = code ?? -1;
      if (!okCodes.includes(exit)) {
        const why = stderrSummary(stderr) || (signal ? `killed by ${signal}` : `exit code ${exit}`);
        fail(new GitError(`git ${args[0] ?? ''} failed: ${why}`, 'failed', code, stderr));
        return;
      }
      settled = true;
      resolve({ stdout: Buffer.concat(out), stderr, code: exit });
    });
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

/**
 * The useful part of git's stderr: its first `fatal:`/`error:` line (which names the file, e.g. a stale `*.lock` to
 * remove) and its last line (what to do), or the last three lines when there is no such line.
 */
export function stderrSummary(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) return '';
  const first = lines.find((l) => /^(fatal|error):/.test(l));
  if (first === undefined) return lines.slice(-3).join(' ');
  const last = lines[lines.length - 1] ?? first;
  return last === first ? first : `${first} … ${last}`;
}

/** `runGit`, returning stdout as UTF-8 text. */
export async function gitText(gitPath: string, args: readonly string[], options: GitRunOptions): Promise<string> {
  return (await runGit(gitPath, args, options)).stdout.toString('utf8');
}

/** Where a model root sits in its repository. */
export interface RepoInfo {
  /** Absolute path of the working tree's top level. */
  topLevel: string;
  /** The model root relative to the top level, POSIX, no trailing slash ('' at the top level). */
  prefix: string;
  /** Absolute path of the git directory (a linked worktree's own, e.g. `<repo>/.git/worktrees/<name>`). */
  gitDir: string;
  /** For a linked worktree (`git worktree add`): its git directory relative to the shared one, e.g. `worktrees/feature`. */
  worktree?: string;
  /** The ref namespace component for this root (docs/m1-plan.md section 8). */
  rootKey: string;
}

/**
 * Finds the repository holding `root`, or `'no-repo'` when it is in none. Throws GitError `missing` when git cannot
 * be started, and GitError `failed` for other git errors (e.g. a bare repository, unsafe ownership).
 */
export async function discoverRepository(gitPath: string, root: string): Promise<RepoInfo | 'no-repo'> {
  let lines: string[];
  try {
    lines = (await gitText(gitPath, ['rev-parse', '--show-toplevel', '--show-prefix', '--absolute-git-dir', '--git-common-dir'], { cwd: root })).split('\n');
  } catch (error) {
    if (error instanceof GitError && error.kind === 'failed' && /not a git repository/i.test(error.stderr)) return 'no-repo';
    throw error;
  }
  const [topLevel = '', prefixLine = '', gitDir = '', commonLine = ''] = lines;
  if (topLevel === '' || gitDir === '') throw new GitError(`unexpected git rev-parse output: ${JSON.stringify(lines.join('\n'))}`, 'failed');
  const prefix = prefixLine.replace(/\/+$/, '');
  // Refs are shared by all worktrees of a repository: a linked worktree gets its own chains (its rootKey says which).
  const commonDir = commonLine === '' ? gitDir : path.resolve(root, commonLine);
  const relative = path.relative(commonDir, gitDir).split(path.sep).join('/');
  const worktree = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : undefined;
  return { topLevel, prefix, gitDir, ...(worktree !== undefined ? { worktree } : {}), rootKey: rootKeyOf(prefix, worktree) };
}

/**
 * The ref component naming one model root: `root` at the repository top level, else the relative path with `/`
 * turned into `.`, other characters outside `[A-Za-z0-9._-]` into `_` (runs of dots and a leading dot too, which
 * ref names forbid), plus `-` and the first 8 hex digits of sha1(relative path). In a linked worktree (refs are shared
 * by every worktree of a repository) `-wt` and 8 hex digits of sha1(its git directory relative to the shared one)
 * follow, so each checkout keeps its own history; the main worktree keeps the plain key.
 */
export function rootKeyOf(prefix: string, worktree?: string): string {
  const hex = (text: string) => createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 8);
  let key: string;
  if (prefix === '') key = 'root';
  else {
    const readable = prefix
      .replaceAll('/', '.')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\./, '_');
    key = `${readable}-${hex(prefix)}`;
  }
  return worktree === undefined ? key : `${key}-wt${hex(worktree)}`;
}

/** `git check-ref-format <ref>`. */
export async function isValidRefName(gitPath: string, cwd: string, ref: string): Promise<boolean> {
  const result = await runGit(gitPath, ['check-ref-format', ref], { cwd, okCodes: [0, 1] });
  return result.code === 0;
}
