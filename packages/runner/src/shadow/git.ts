/**
 * The shadow's own history (docs/m2-plan.md section 4.2): a bare repository in `<runDir>/git/`, written and read with
 * plumbing only, so no index, checkout, attribute, filter or hook of any kind is ever involved:
 *
 *   commit     `git fast-import` with the whole snapshot inline (`deleteall` + one `M` per file): the commit's tree is
 *              exactly the snapshot, byte for byte, in one process
 *   read       `git ls-tree -r -z` + `git cat-file --batch`
 *   history    `git log --reverse` of the one branch `refs/heads/shadow` (linear: every commit's parent is the tip)
 *
 * Isolation: every variable starting with `GIT_` is dropped from the environment, then `GIT_DIR=<git>`,
 * `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0` and `LC_ALL=C` are set, and every call
 * carries `-c commit.gpgsign=false -c core.hooksPath=/dev/null -c gc.auto=0 …` (no signing, no hooks, no automatic
 * maintenance, no excludes or attributes file). The repository is created with an empty template (no sample hooks).
 */
import { spawn } from 'node:child_process';

import { ShadowLayoutError } from './types.js';

/** The one branch of the shadow's history. */
export const SHADOW_REF = 'refs/heads/shadow';

/** `-c` settings put in front of every git subcommand the shadow runs. */
export const SHADOW_GIT_CONFIG: readonly string[] = [
  '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.excludesFile=/dev/null',
  '-c', 'core.attributesFile=/dev/null',
  '-c', 'core.autocrlf=false',
];

const COMMITTER = 'telelean <telelean@localhost>';
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export interface GitOutput {
  stdout: Buffer;
  stderr: string;
  code: number;
}

/** The environment of a shadow git child: the host's without any `GIT_*` variable, plus the isolation settings. */
export function shadowGitEnvironment(gitDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('GIT_') && value !== undefined) env[name] = value;
  }
  env['GIT_DIR'] = gitDir;
  env['GIT_CONFIG_GLOBAL'] = '/dev/null';
  env['GIT_CONFIG_NOSYSTEM'] = '1';
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['LC_ALL'] = 'C';
  return env;
}

/** A path as fast-import reads it: C-style quoted only when it must be (a leading `"`, a backslash, a control character). */
export function fastImportPath(path: string): string {
  if (!/^"|[\\\u0000-\u001f\u007f]/u.test(path)) return path;
  let out = '"';
  for (const ch of path) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/** One shadow repository. Every method throws ShadowLayoutError (`git`) when git fails. */
export class ShadowGit {
  constructor(
    readonly gitDir: string,
    /** Working directory of the git children (the run directory; never inside a user's repository). */
    readonly cwd: string,
    readonly gitPath: string = 'git',
  ) {}

  run(args: readonly string[], input?: Buffer | string, okCodes: readonly number[] = [0]): Promise<GitOutput> {
    const argv = [...SHADOW_GIT_CONFIG, ...args];
    return new Promise<GitOutput>((resolve, reject) => {
      let child;
      try {
        child = spawn(this.gitPath, argv, {
          cwd: this.cwd,
          env: shadowGitEnvironment(this.gitDir),
          stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(new ShadowLayoutError('git', `cannot start ${this.gitPath}: ${(error as Error).message}`));
        return;
      }
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      let settled = false;
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        reject(new ShadowLayoutError('git', message));
      };
      child.stdout?.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_OUTPUT_BYTES) {
          child.kill('SIGKILL');
          fail(`git ${args[0] ?? ''}: output exceeds ${MAX_OUTPUT_BYTES} bytes`);
          return;
        }
        out.push(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
      child.stdin?.on('error', () => undefined);
      child.on('error', (error: NodeJS.ErrnoException) => {
        fail(error.code === 'ENOENT' ? `git executable not found (${this.gitPath})` : `git ${args[0] ?? ''}: ${error.message}`);
      });
      child.on('close', (code, signal) => {
        if (settled) return;
        const stderr = Buffer.concat(err).toString('utf8');
        const exit = code ?? -1;
        if (!okCodes.includes(exit)) {
          const why = stderr.trim().split('\n').slice(-3).join(' ') || (signal !== null ? `killed by ${signal}` : `exit code ${exit}`);
          fail(`git ${args[0] ?? ''} failed: ${why}`);
          return;
        }
        settled = true;
        resolve({ stdout: Buffer.concat(out), stderr, code: exit });
      });
      if (input !== undefined) child.stdin?.end(input);
    });
  }

  /** `git init --bare` with an empty template (no sample hooks, no info/exclude). */
  async init(): Promise<void> {
    await this.run(['init', '-q', '--bare', '--template=', this.gitDir]);
  }

  /** The tip of the shadow's branch, or undefined before the first commit. */
  async head(): Promise<string | undefined> {
    const r = await this.run(['rev-parse', '-q', '--verify', `${SHADOW_REF}^{commit}`], undefined, [0, 1]);
    const id = r.stdout.toString('utf8').trim();
    return r.code === 0 && id !== '' ? id : undefined;
  }

  /**
   * Commits `files` (path -> text) as the complete tree, with `parent` as the only parent (none for the first commit),
   * and moves the branch there. Returns the commit id.
   */
  async commitSnapshot(files: ReadonlyMap<string, string>, parent: string | undefined, message: string, when: Date): Promise<string> {
    const seconds = Math.floor(when.getTime() / 1000);
    const chunks: Buffer[] = [];
    const text = (s: string): void => {
      chunks.push(Buffer.from(s, 'utf8'));
    };
    const data = (payload: string): void => {
      const bytes = Buffer.from(payload, 'utf8');
      text(`data ${bytes.length}\n`);
      chunks.push(bytes);
      text('\n');
    };
    text(`commit ${SHADOW_REF}\n`);
    text(`committer ${COMMITTER} ${seconds} +0000\n`);
    data(message);
    if (parent !== undefined) text(`from ${parent}\n`);
    text('deleteall\n');
    for (const path of [...files.keys()].sort()) {
      text(`M 100644 inline ${fastImportPath(path)}\n`);
      data(files.get(path) ?? '');
    }
    text('done\n');
    await this.run(['fast-import', '--quiet', '--done'], Buffer.concat(chunks));
    const id = await this.head();
    if (id === undefined) throw new ShadowLayoutError('git', 'git fast-import wrote no commit');
    return id;
  }

  /** The branch's commits, oldest first, with their full messages. */
  async log(): Promise<Array<{ id: string; message: string }>> {
    if ((await this.head()) === undefined) return [];
    const r = await this.run(['log', '--reverse', '--format=%H%x00%B%x1e', SHADOW_REF]);
    const out: Array<{ id: string; message: string }> = [];
    for (const record of r.stdout.toString('utf8').split('\x1e')) {
      const trimmed = record.replace(/^\n+/, '');
      if (trimmed === '') continue;
      const nul = trimmed.indexOf('\0');
      if (nul < 0) continue;
      out.push({ id: trimmed.slice(0, nul), message: trimmed.slice(nul + 1) });
    }
    return out;
  }

  /** Every file of a commit, path -> text (UTF-8). */
  async readTree(commit: string): Promise<Map<string, string>> {
    const listing = await this.run(['ls-tree', '-r', '-z', '--full-tree', commit]);
    const entries: Array<{ sha: string; path: string }> = [];
    for (const raw of listing.stdout.toString('utf8').split('\0')) {
      if (raw === '') continue;
      const tab = raw.indexOf('\t');
      const [mode, type, sha] = raw.slice(0, tab).split(' ');
      if (tab < 0 || type !== 'blob' || sha === undefined || mode === undefined) {
        throw new ShadowLayoutError('git', `unexpected tree entry in ${commit}: ${JSON.stringify(raw)}`);
      }
      entries.push({ sha, path: raw.slice(tab + 1) });
    }
    const files = new Map<string, string>();
    if (entries.length === 0) return files;
    const batch = await this.run(['cat-file', '--batch'], entries.map((e) => `${e.sha}\n`).join(''));
    const buf = batch.stdout;
    let offset = 0;
    for (const entry of entries) {
      const nl = buf.indexOf(0x0a, offset);
      if (nl < 0) throw new ShadowLayoutError('git', `truncated cat-file output for ${entry.path}`);
      const header = buf.subarray(offset, nl).toString('utf8').split(' ');
      const size = Number(header[2]);
      if (header[0] !== entry.sha || header[1] !== 'blob' || !Number.isInteger(size)) {
        throw new ShadowLayoutError('git', `unexpected cat-file header for ${entry.path}: ${header.join(' ')}`);
      }
      const start = nl + 1;
      files.set(entry.path, buf.subarray(start, start + size).toString('utf8'));
      offset = start + size + 1;
    }
    return files;
  }
}
