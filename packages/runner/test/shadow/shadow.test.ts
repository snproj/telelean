/**
 * The run's shadow workspace (M2 WP2, docs/m2-plan.md section 4.2), without Lean:
 * AT2.1 layout and refusals, AT2.2 path-guard compatibility, AT2.3 (sync without a build), AT2.4 history and writes,
 * AT2.5 run directories. Git runs only inside the shadows' own git/ directories, with an isolated configuration.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decide } from '../../bin/telelean-path-guard.mjs';
import { buildGuardPolicy } from '../../src/llm/confinement.js';
import {
  BASE_COMMIT_LABEL,
  createRunShadow,
  isModelPath,
  listRunDirs,
  openRunShadow,
  PASSING_COMMIT_KINDS,
  pruneRunDirs,
  rootKeyOf,
  ShadowLayoutError,
  type ShadowWorkspace,
} from '../../src/shadow/index.js';
import { cleanupTempRoot, makeTempRoot, spyroModelFiles, spyroRoot } from '../gate/helpers.js';

/** Every entry below `dir` (files and directories), as sorted relative POSIX paths. */
function entries(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
    out.push(childRel);
    if (e.isDirectory() && !e.isSymbolicLink()) out.push(...entries(dir, childRel));
  }
  return out.sort();
}
const filesBelow = (dir: string): string[] => entries(dir).filter((p) => lstatSync(path.join(dir, p)).isFile());
const isInside = (p: string, dir: string): boolean => p === dir || p.startsWith(dir + path.sep);

async function expectLayoutError(promise: Promise<unknown>, code: string): Promise<ShadowLayoutError> {
  let error: unknown;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ShadowLayoutError);
  expect((error as ShadowLayoutError).code).toBe(code);
  return error as ShadowLayoutError;
}

describe('createRunShadow: layout and refusals (AT2.1)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('shadow-layout');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('ws/ holds exactly the model and project files (no dot-entry at any depth), build/ mirrors them without the user\'s .lake/build (closing round 1), one base commit, run and session dirs outside ws/', async () => {
    const root = spyroRoot(tmp, 'root');
    // What a user's folder also holds: telelean's sidecars, a .gitignore, a Lake build tree.
    mkdirSync(path.join(root, '.telelean', 'subjects', 'Spyro'), { recursive: true });
    writeFileSync(path.join(root, '.telelean', 'config.json'), '{}\n');
    writeFileSync(path.join(root, '.gitignore'), '.lake\n');
    const olean = path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean');
    mkdirSync(path.dirname(olean), { recursive: true });
    writeFileSync(olean, 'not really an olean');
    const past = new Date('2026-01-02T03:04:05Z');
    utimesSync(olean, past, past);
    const mainOnDisk = path.join(root, 'Model', 'Spyro', 'Main.lean');
    utimesSync(mainOnDisk, past, past);

    const files = spyroModelFiles();
    const runsDir = path.join(tmp, 'runs');
    const shadow = await createRunShadow({ root, runsDir, runId: 'r_layout', library: 'Model', files });

    expect(shadow.runId).toBe('r_layout');
    expect(shadow.paths.runDir).toBe(path.join(runsDir, rootKeyOf(root), 'r_layout'));
    // ws/: exactly the given files, nothing hidden anywhere (so the guard allows Grep/Glob on the whole root).
    expect(filesBelow(shadow.paths.ws)).toEqual([...files.keys()].sort());
    expect(entries(shadow.paths.ws).filter((p) => p.split('/').some((s) => s.startsWith('.')))).toEqual([]);
    expect([...files.keys()]).not.toContain('Check/Normative.lean');
    for (const [rel, text] of files) expect(readFileSync(path.join(shadow.paths.ws, rel), 'utf8')).toBe(text);
    // build/: exactly the same model files; the user's .lake/build is not copied by default (the run builds from scratch).
    expect(filesBelow(shadow.paths.build)).toEqual([...files.keys()].sort());
    expect(existsSync(path.join(shadow.paths.build, '.lake'))).toBe(false);
    expect(shadow.buildSeed).toEqual({ files: 0 });
    expect(readFileSync(olean, 'utf8')).toBe('not really an olean'); // the user's build is untouched
    // The mirror keeps the user's mtime of a source whose text is what is on disk.
    expect(statSync(path.join(shadow.paths.build, 'Model', 'Spyro', 'Main.lean')).mtimeMs).toBe(past.getTime());
    // One base commit holding exactly the files.
    const commits = await shadow.commits();
    expect(commits.map((c) => [c.kind, c.label, c.round])).toEqual([['base', BASE_COMMIT_LABEL, 1]]);
    expect(commits[0]?.id).toMatch(/^[0-9a-f]{40}$/u);
    expect(await shadow.baseFiles()).toEqual(files);
    expect(await shadow.currentFiles()).toEqual(files);
    // Everything else lives beside ws/, never inside it.
    for (const p of [shadow.paths.runDir, shadow.paths.build, shadow.paths.gitDir, shadow.paths.sessionDir, shadow.paths.frozenDir, shadow.paths.gateDir, shadow.paths.scratchDir, shadow.paths.stateFile]) {
      expect(isInside(p, shadow.paths.ws)).toBe(false);
    }
    for (const dir of [shadow.paths.sessionDir, shadow.paths.frozenDir, shadow.paths.gateDir, shadow.paths.scratchDir]) expect(statSync(dir).isDirectory()).toBe(true);
    // The user's folder is untouched (no .git appeared there).
    expect(existsSync(path.join(root, '.git'))).toBe(false);
    // Re-opening finds the same history.
    const again = await openRunShadow(shadow.paths.runDir, { root, library: 'Model' });
    expect((await again.commits()).map((c) => c.id)).toEqual(commits.map((c) => c.id));
  });

  it('copyBuild: false seeds nothing; copyBuild: true seeds only telelean\'s own recorded refresh output (test/shadow/seed.test.ts), so here nothing', async () => {
    const root = spyroRoot(tmp, 'nobuild');
    mkdirSync(path.join(root, '.lake', 'build'), { recursive: true });
    writeFileSync(path.join(root, '.lake', 'build', 'x'), 'x');
    const shadow = await createRunShadow({ root, runsDir: path.join(tmp, 'runs'), runId: 'r_nobuild', library: 'Model', files: spyroModelFiles(), copyBuild: false });
    expect(existsSync(path.join(shadow.paths.build, '.lake', 'build', 'x'))).toBe(false);
    expect(shadow.buildSeed).toEqual({ files: 0 });
    const asked = await createRunShadow({ root, runsDir: path.join(tmp, 'runs'), runId: 'r_nobuild2', library: 'Model', files: spyroModelFiles(), copyBuild: true });
    expect(existsSync(path.join(asked.paths.build, '.lake'))).toBe(false);
    expect(asked.buildSeed?.files).toBe(0);
    expect(asked.buildSeed?.skipped).toMatch(/no finished Lean check of the board has been recorded/u);
  });

  it('refuses a symlink in the model tree and a symlinked model file, leaving nothing behind; a symlink in .lake/build refuses nothing (it is never copied)', async () => {
    const runsDir = path.join(tmp, 'runs-refused');
    // A symlink anywhere in the library tree.
    const linked = spyroRoot(tmp, 'linked');
    writeFileSync(path.join(tmp, 'outside.lean'), '-- outside the model\n');
    symlinkSync(path.join(tmp, 'outside.lean'), path.join(linked, 'Model', 'Spyro', 'Secret.lean'));
    const e1 = await expectLayoutError(createRunShadow({ root: linked, runsDir, runId: 'r_link', library: 'Model', files: spyroModelFiles() }), 'not-regular');
    expect(e1.paths).toEqual(['Model/Spyro/Secret.lean']);
    // A symlinked project file.
    const project = spyroRoot(tmp, 'linked-project');
    const toolchain = path.join(project, 'lean-toolchain');
    writeFileSync(path.join(tmp, 'toolchain-elsewhere'), readFileSync(toolchain));
    rmSync(toolchain);
    symlinkSync(path.join(tmp, 'toolchain-elsewhere'), toolchain);
    await expectLayoutError(createRunShadow({ root: project, runsDir, runId: 'r_link2', library: 'Model', files: spyroModelFiles() }), 'not-regular');
    // Nothing was created for either of them.
    expect(existsSync(runsDir)).toBe(false);
    // A symlink inside .lake/build: the run builds from scratch and nothing of .lake/build reaches it, with or without copyBuild.
    const lake = spyroRoot(tmp, 'linked-build');
    mkdirSync(path.join(lake, '.lake', 'build', 'lib'), { recursive: true });
    writeFileSync(path.join(lake, '.lake', 'build', 'lib', 'ok.olean'), 'x');
    symlinkSync('/etc/hostname', path.join(lake, '.lake', 'build', 'lib', 'evil.olean'));
    for (const copyBuild of [false, true]) {
      const shadow = await createRunShadow({ root: lake, runsDir: path.join(tmp, 'runs-linked-build'), runId: `r_link3_${String(copyBuild)}`, library: 'Model', files: spyroModelFiles(), copyBuild });
      expect(existsSync(path.join(shadow.paths.build, '.lake'))).toBe(false);
      expect(shadow.buildSeed?.files).toBe(0);
    }
  });

  it('refuses paths that are not model or project files, before creating anything', async () => {
    const root = spyroRoot(tmp, 'badpaths');
    const runsDir = path.join(tmp, 'runs-bad');
    for (const bad of ['Check/Normative.lean', '.gitignore', 'Model/.hidden.lean', 'Model/../x.lean', '/abs.lean', 'Model/Spyro/notes.md', 'Model//Main.lean']) {
      const files = new Map(spyroModelFiles());
      files.set(bad, 'x');
      const e = await expectLayoutError(createRunShadow({ root, runsDir, runId: 'r_bad', library: 'Model', files }), 'bad-path');
      expect(e.paths).toEqual([bad]);
    }
    expect(existsSync(runsDir)).toBe(false);
    expect(isModelPath('Model/Spyro/Main.lean', 'Model')).toBe(true);
    expect(isModelPath('lake-manifest.json', 'Model')).toBe(true);
    expect(isModelPath('Model.lean', 'Model')).toBe(true);
    expect(isModelPath('Other.lean', 'Model')).toBe(false);
  });

  it('refuses an existing run directory and invalid arguments', async () => {
    const root = spyroRoot(tmp, 'twice');
    const runsDir = path.join(tmp, 'runs-twice');
    await createRunShadow({ root, runsDir, runId: 'r_twice', library: 'Model', files: spyroModelFiles() });
    await expectLayoutError(createRunShadow({ root, runsDir, runId: 'r_twice', library: 'Model', files: spyroModelFiles() }), 'io');
    await expect(createRunShadow({ root, runsDir, runId: 'bad-id!', library: 'Model', files: spyroModelFiles() })).rejects.toThrow(TypeError);
    await expect(createRunShadow({ root: 'relative', runsDir, runId: 'r_x', library: 'Model', files: spyroModelFiles() })).rejects.toThrow(TypeError);
  });
});

describe('path guard compatibility (AT2.2)', () => {
  let tmp: string;
  let shadow: ShadowWorkspace;
  beforeAll(async () => {
    tmp = makeTempRoot('shadow-guard');
    shadow = await createRunShadow({ root: spyroRoot(tmp, 'root'), runsDir: path.join(tmp, 'runs'), runId: 'r_guard', library: 'Model', files: spyroModelFiles() });
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('lets Grep and Glob search the whole ws/ root and denies reading build/ and git/', () => {
    const ws = realpathSync(shadow.paths.ws);
    const policy = buildGuardPolicy(ws, path.join(shadow.paths.sessionDir, 'guard-log.jsonl'));
    const call = (tool: string, input: Record<string, unknown>) => decide({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: ws }, policy);
    expect(call('Grep', { pattern: 'theorem', path: ws }).kind).toBe('pass');
    expect(call('Grep', { pattern: 'theorem' }).kind).toBe('pass');
    expect(call('Glob', { pattern: '**/*', path: ws }).kind).toBe('pass');
    expect(call('Glob', { pattern: '**/*.lean' }).kind).toBe('pass');
    expect(call('Read', { file_path: path.join(ws, 'Model', 'Spyro', 'Main.lean') }).kind).toBe('pass');
    const runDir = realpathSync(shadow.paths.runDir);
    for (const outside of [path.join(runDir, 'build', 'Model', 'Spyro', 'Main.lean'), path.join(runDir, 'git', 'config'), path.join(runDir, 'run.json')]) {
      const d = call('Read', { file_path: outside });
      expect(d.kind).toBe('deny');
      expect(d.reason).toMatch(/outside the workspace copy|'\.\.'/u);
    }
    expect(call('Grep', { pattern: 'x', path: path.join(runDir, 'build') }).kind).toBe('deny');
    expect(call('Glob', { pattern: '**/*', path: path.join(runDir, 'git') }).kind).toBe('deny');
  });
});

describe('currentFiles and syncMirror without a build (AT2.3)', () => {
  let tmp: string;
  let shadow: ShadowWorkspace;
  beforeAll(async () => {
    tmp = makeTempRoot('shadow-sync');
    shadow = await createRunShadow({ root: spyroRoot(tmp, 'root'), runsDir: path.join(tmp, 'runs'), runId: 'r_sync', library: 'Model', files: spyroModelFiles() });
  });
  afterAll(() => cleanupTempRoot(tmp));

  const ws = (rel: string): string => path.join(shadow.paths.ws, rel);
  const mirror = (rel: string): string => path.join(shadow.paths.build, rel);

  it('copies changed model files only, keeps the mtime of unchanged ones, mirrors deletions, never copies a stray notes.md', async () => {
    expect(await shadow.syncMirror()).toEqual({ copied: [], removed: [] });
    const past = new Date('2026-02-03T04:05:06Z');
    utimesSync(mirror('Model/Spyro/Vocabulary.lean'), past, past);
    writeFileSync(ws('Model/Spyro/Main.lean'), `${readFileSync(ws('Model/Spyro/Main.lean'), 'utf8')}-- edited\n`);
    writeFileSync(ws('Model/Spyro/Extra.lean'), 'namespace Spyro\nend Spyro\n');
    writeFileSync(ws('Model/Spyro/notes.md'), 'notes\n');
    expect((await shadow.currentFiles()).get('Model/Spyro/notes.md')).toBe('notes\n');
    expect(await shadow.syncMirror()).toEqual({ copied: ['Model/Spyro/Extra.lean', 'Model/Spyro/Main.lean'], removed: [] });
    expect(readFileSync(mirror('Model/Spyro/Main.lean'), 'utf8')).toBe(readFileSync(ws('Model/Spyro/Main.lean'), 'utf8'));
    expect(statSync(mirror('Model/Spyro/Vocabulary.lean')).mtimeMs).toBe(past.getTime());
    expect(existsSync(mirror('Model/Spyro/notes.md'))).toBe(false);
    rmSync(ws('Model/Spyro/Extra.lean'));
    expect(await shadow.syncMirror()).toEqual({ copied: [], removed: ['Model/Spyro/Extra.lean'] });
    expect(existsSync(mirror('Model/Spyro/Extra.lean'))).toBe(false);
    expect(statSync(mirror('Model/Spyro/Vocabulary.lean')).mtimeMs).toBe(past.getTime());
    rmSync(ws('Model/Spyro/notes.md'));
  });

  it('refuses (and syncs nothing) when ws/ holds a symlink or a hidden entry', async () => {
    const before = readFileSync(mirror('Model/Spyro/Main.lean'), 'utf8');
    writeFileSync(ws('Model/Spyro/Main.lean'), `${readFileSync(ws('Model/Spyro/Main.lean'), 'utf8')}-- again\n`);
    symlinkSync('/etc/hostname', ws('Model/Spyro/Link.lean'));
    let e = await expectLayoutError(shadow.syncMirror(), 'not-regular');
    expect(e.paths).toEqual(['Model/Spyro/Link.lean']);
    await expectLayoutError(shadow.currentFiles(), 'not-regular');
    expect(readFileSync(mirror('Model/Spyro/Main.lean'), 'utf8')).toBe(before);
    rmSync(ws('Model/Spyro/Link.lean'));
    writeFileSync(ws('Model/.hidden'), 'x');
    e = await expectLayoutError(shadow.syncMirror(), 'hidden-entry');
    expect(e.paths).toEqual(['Model/.hidden']);
    expect(readFileSync(mirror('Model/Spyro/Main.lean'), 'utf8')).toBe(before);
    rmSync(ws('Model/.hidden'));
    mkdirSync(ws('.lake'));
    await expectLayoutError(shadow.currentFiles(), 'hidden-entry');
    rmSync(ws('.lake'), { recursive: true });
    expect((await shadow.syncMirror()).copied).toEqual(['Model/Spyro/Main.lean']);
  });
});

describe('history and telelean writes (AT2.4)', () => {
  let tmp: string;
  let shadow: ShadowWorkspace;
  let tick = 0;
  beforeAll(async () => {
    tmp = makeTempRoot('shadow-git');
    shadow = await createRunShadow({
      root: spyroRoot(tmp, 'root'),
      runsDir: path.join(tmp, 'runs'),
      runId: 'r_git',
      library: 'Model',
      files: spyroModelFiles(),
      now: () => new Date(Date.UTC(2026, 10, 1, 12, 0, tick++)),
    });
  });
  afterAll(() => cleanupTempRoot(tmp));

  const ws = (rel: string): string => path.join(shadow.paths.ws, rel);
  const main = 'Model/Spyro/Main.lean';

  it('commits, lists, finds the last passing commit, reads files at a commit and diffs against it', async () => {
    const base = await shadow.baseFiles();
    writeFileSync(ws(main), `${base.get(main) ?? ''}-- formalised\n`);
    expect(await shadow.changes()).toEqual([{ path: main, before: base.get(main), after: `${base.get(main) ?? ''}-- formalised\n` }]);
    const freeze = await shadow.commit('freeze', 'Statements frozen (round 1)', 1);
    expect(freeze).toMatchObject({ kind: 'freeze', label: 'Statements frozen (round 1)', round: 1, at: '2026-11-01T12:00:01.000Z' });
    writeFileSync(ws('Model/Spyro/Lemmas.lean'), 'namespace Spyro\nend Spyro\n');
    const checkpoint = await shadow.commit('checkpoint', 'State judged by the gate (round 1)', 1);
    const acceptBase = await shadow.commit('accept-base', 'Your files at Accept\nwith a second line', 2);
    expect(acceptBase.label).toBe('Your files at Accept with a second line');
    expect((await shadow.commits()).map((c) => c.kind)).toEqual(['base', 'freeze', 'checkpoint', 'accept-base']);
    // accept-base is not a passing kind: the last passing commit is still the freeze.
    expect(PASSING_COMMIT_KINDS).not.toContain('accept-base');
    expect((await shadow.lastCommit())?.id).toBe(freeze.id);
    expect((await shadow.lastCommit(['checkpoint']))?.id).toBe(checkpoint.id);
    expect(await shadow.lastCommit(['gate-pass'])).toBeUndefined();
    expect((await shadow.filesAt(freeze.id)).has('Model/Spyro/Lemmas.lean')).toBe(false);
    expect((await shadow.filesAt(checkpoint.id)).get('Model/Spyro/Lemmas.lean')).toBe('namespace Spyro\nend Spyro\n');
    expect(await shadow.changes(checkpoint.id)).toEqual([]);
    expect((await shadow.changes(freeze.id)).map((c) => [c.path, c.before, c.after])).toEqual([['Model/Spyro/Lemmas.lean', null, 'namespace Spyro\nend Spyro\n']]);
    await expectLayoutError(shadow.filesAt('HEAD'), 'git');
  });

  it('revertTo restores a commit (deleting stray files and hidden entries), commits `revert`, and is a no-op when ws/ already equals it', async () => {
    const freeze = await shadow.lastCommit(['freeze']);
    if (freeze === undefined) throw new Error('no freeze commit');
    writeFileSync(ws('Model/Spyro/notes.md'), 'stray\n');
    writeFileSync(ws(main), 'garbage\n');
    const count = (await shadow.commits()).length;
    const changes = await shadow.revertTo(freeze.id, 'Reverted to “Statements frozen (round 1)”', 1);
    expect(changes.map((c) => [c.path, c.after === null ? 'deleted' : 'written'])).toEqual([
      ['Model/Spyro/Lemmas.lean', 'deleted'],
      [main, 'written'],
      ['Model/Spyro/notes.md', 'deleted'],
    ]);
    expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(freeze.id));
    const commits = await shadow.commits();
    expect(commits).toHaveLength(count + 1);
    expect(commits.at(-1)?.kind).toBe('revert');
    expect(await shadow.revertTo(freeze.id, 'again', 1)).toEqual([]);
    expect(await shadow.commits()).toHaveLength(count + 1);
    mkdirSync(ws('.hidden-dir'));
    writeFileSync(ws('.hidden-dir/x'), 'x');
    await shadow.revertTo(freeze.id, 'clean up', 1);
    expect(existsSync(ws('.hidden-dir'))).toBe(false);
    expect(await shadow.currentFiles()).toEqual(await shadow.filesAt(freeze.id));
  });

  it('writeFiles checks `before` (nothing written on a mismatch), creates and deletes, and refuses non-model paths', async () => {
    const current = readFileSync(ws(main), 'utf8');
    await expectLayoutError(shadow.writeFiles([{ path: main, before: 'stale text', after: 'x' }]), 'io');
    await expectLayoutError(
      shadow.writeFiles([
        { path: 'Model/Spyro/New.lean', before: null, after: 'new\n' },
        { path: main, before: 'stale', after: 'x' },
      ]),
      'io',
    );
    expect(existsSync(ws('Model/Spyro/New.lean'))).toBe(false);
    expect(readFileSync(ws(main), 'utf8')).toBe(current);
    await expectLayoutError(shadow.writeFiles([{ path: 'Model/Spyro/notes.md', before: null, after: 'x' }]), 'bad-path');
    await shadow.writeFiles([
      { path: main, before: current, after: `${current}-- normalised\n` },
      { path: 'Model/Spyro/New.lean', before: null, after: 'new\n' },
    ]);
    expect(readFileSync(ws(main), 'utf8')).toBe(`${current}-- normalised\n`);
    await shadow.writeFiles([{ path: 'Model/Spyro/New.lean', before: 'new\n', after: null }]);
    expect(existsSync(ws('Model/Spyro/New.lean'))).toBe(false);
  });
});

describe('slice 2 (docs/slice2-plan.md 2.6; 2b3b): the session\'s commit kinds, lastCommitSince, and syncMirror from given files', () => {
  let tmp: string;
  let shadow: ShadowWorkspace;
  let tick = 0;
  beforeAll(async () => {
    tmp = makeTempRoot('shadow-session');
    shadow = await createRunShadow({
      root: spyroRoot(tmp, 'root'),
      runsDir: path.join(tmp, 'runs'),
      runId: 'r_session',
      library: 'Model',
      files: spyroModelFiles(),
      now: () => new Date(Date.UTC(2026, 10, 20, 12, 0, tick++)),
    });
  });
  afterAll(() => cleanupTempRoot(tmp));

  const ws = (rel: string): string => path.join(shadow.paths.ws, rel);
  const main = 'Model/Spyro/Main.lean';
  const edit = (line: string): void => writeFileSync(ws(main), `${readFileSync(ws(main), 'utf8')}${line}\n`);

  it('step-start, decision and completion are commit kinds, read back from the history (also by a shadow opened again)', async () => {
    edit('-- a decision');
    const decision = await shadow.commit('decision', 'Reject “x”', 2);
    const start = await shadow.commit('step-start', 'Step 1 of 2 starts', 2);
    edit('-- a completion');
    const completion = await shadow.commit('completion', 'Completed “t”', 2);
    expect((await shadow.commits()).map((c) => c.kind)).toEqual(['base', 'decision', 'step-start', 'completion']);
    const reopened = await openRunShadow(shadow.paths.runDir, { root: shadow.root, library: 'Model' });
    expect((await reopened.commits()).map((c) => [c.id, c.kind])).toEqual([
      [(await shadow.commits())[0]?.id, 'base'],
      [decision.id, 'decision'],
      [start.id, 'step-start'],
      [completion.id, 'completion'],
    ]);
    // None of them is a passing kind of slice 1 (a run's "last state that passed" is unchanged).
    for (const kind of ['step-start', 'decision', 'completion'] as const) expect(PASSING_COMMIT_KINDS).not.toContain(kind);
  });

  it('lastCommitSince: the newest commit of the kinds at or after `since`, never an older one; the step-start itself when nothing newer is; undefined for an unknown commit', async () => {
    const kinds = ['gate-pass', 'freeze', 'step-start'] as const;
    const before = await shadow.commit('gate-pass', 'An earlier step passed', 2);
    const start = await shadow.commit('step-start', 'Step 2 of 2 starts', 2);
    // Nothing newer: the step's start itself, never the earlier step's gate-pass.
    expect((await shadow.lastCommitSince(start.id, kinds))?.id).toBe(start.id);
    edit('-- checked');
    await shadow.commit('checkpoint', 'State judged by the gate', 2);
    expect((await shadow.lastCommitSince(start.id, kinds))?.id).toBe(start.id);
    const freeze = await shadow.commit('freeze', 'Statements frozen', 2);
    edit('-- proved');
    await shadow.commit('normalise', 'Normalised', 2);
    expect((await shadow.lastCommitSince(start.id, kinds))?.id).toBe(freeze.id);
    const pass = await shadow.commit('gate-pass', 'The gate passed', 2);
    await shadow.commit('revert', 'Rolled back', 2);
    expect((await shadow.lastCommitSince(start.id, kinds))?.id).toBe(pass.id);
    // Kinds that occur only before `since` give nothing: the earlier gate-pass is behind the step's start.
    expect(await shadow.lastCommitSince(start.id, ['decision'])).toBeUndefined();
    expect((await shadow.lastCommitSince(before.id, ['gate-pass']))?.id).toBe(pass.id);
    expect(await shadow.lastCommitSince('0'.repeat(40), kinds)).toBeUndefined();
    expect(await shadow.lastCommitSince(start.id, [])).toBeUndefined();
  });

  it('syncMirror(files) makes build/ hold exactly those files\' model files, never reading ws/ (which may hold a write in progress)', async () => {
    const head = (await shadow.commits()).at(-1);
    if (head === undefined) throw new Error('no commit');
    const files = await shadow.filesAt(head.id);
    await shadow.syncMirror();
    // ws/ moves on (a write in progress), with an entry that would refuse a sync of ws/.
    writeFileSync(ws(main), 'half written\n');
    writeFileSync(ws('Model/Spyro/Extra.lean'), 'namespace Spyro\nend Spyro\n');
    symlinkSync('/etc/hostname', ws('Model/Spyro/Link.lean'));
    const synced = await shadow.syncMirror(files);
    expect(synced).toEqual({ copied: [], removed: [] });
    expect(readFileSync(path.join(shadow.paths.build, main), 'utf8')).toBe(files.get(main));
    // A file the given state lacks is removed from build/, one it holds is written; non-model files never reach it.
    const without = new Map(files);
    without.delete('Model/Spyro/Vocabulary.lean');
    without.set('Model/Spyro/Other.lean', 'namespace Spyro\nend Spyro\n');
    without.set('Model/Spyro/notes.md', 'notes\n');
    expect(await shadow.syncMirror(without)).toEqual({ copied: ['Model/Spyro/Other.lean'], removed: ['Model/Spyro/Vocabulary.lean'] });
    expect(existsSync(path.join(shadow.paths.build, 'Model/Spyro/notes.md'))).toBe(false);
    expect(await shadow.syncMirror(new Map())).toMatchObject({ copied: [] });
    expect(existsSync(path.join(shadow.paths.build, main))).toBe(false);
    rmSync(ws('Model/Spyro/Link.lean'));
    rmSync(ws('Model/Spyro/Extra.lean'));
    await shadow.revertTo(head.id, 'back', 2);
    expect((await shadow.syncMirror()).copied).toContain(main);
  });
});

describe('run directories (AT2.5)', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempRoot('shadow-runs');
  });
  afterAll(() => cleanupTempRoot(tmp));

  it('lists newest first and prunes to the newest 10, never deleting non-terminal or protected runs', async () => {
    const runsDir = path.join(tmp, 'runs');
    const root = path.join(tmp, 'model');
    const dir = path.join(runsDir, rootKeyOf(root));
    // 15 runs, r00 oldest .. r14 newest. Older than the newest 10: r00..r04.
    const states: Record<string, string | undefined> = {
      r00: 'accepted',
      r01: 'working', // non-terminal: kept
      r02: 'failed', // protected: kept
      r03: undefined, // unreadable run.json: deleted
      r04: 'discarded',
    };
    for (let i = 0; i < 15; i++) {
      const id = `r${String(i).padStart(2, '0')}`;
      mkdirSync(path.join(dir, id, 'ws'), { recursive: true });
      const state = i < 5 ? states[id] : i % 2 === 0 ? 'review' : 'cancelled';
      const updatedAt = new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString();
      if (id === 'r03') writeFileSync(path.join(dir, id, 'run.json'), '{ not json');
      else writeFileSync(path.join(dir, id, 'run.json'), JSON.stringify({ format: 'telelean-run', version: 1, view: { state, updatedAt } }));
    }
    // r03 has no readable updatedAt: its directory mtime decides (oldest).
    utimesSync(path.join(dir, 'r03'), new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
    mkdirSync(path.join(dir, 'not a run id'), { recursive: true });
    const other = path.join(runsDir, rootKeyOf(path.join(tmp, 'other-model')), 'r99');
    mkdirSync(other, { recursive: true });

    const listed = await listRunDirs(runsDir, root);
    expect(listed.map((r) => r.runId)).toEqual(['r14', 'r13', 'r12', 'r11', 'r10', 'r09', 'r08', 'r07', 'r06', 'r05', 'r04', 'r02', 'r01', 'r00', 'r03']);
    expect(listed[0]).toMatchObject({ runId: 'r14', state: 'review', updatedAt: '2026-11-01T00:14:00.000Z', runDir: path.join(dir, 'r14') });
    expect(listed.find((r) => r.runId === 'r03')?.state).toBeUndefined();

    const deleted = await pruneRunDirs(runsDir, root, 10, ['r02']);
    expect(deleted.sort()).toEqual(['r00', 'r03', 'r04']);
    expect((await listRunDirs(runsDir, root)).map((r) => r.runId)).toEqual(['r14', 'r13', 'r12', 'r11', 'r10', 'r09', 'r08', 'r07', 'r06', 'r05', 'r02', 'r01']);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(path.join(dir, 'not a run id'))).toBe(true);
    expect(await pruneRunDirs(runsDir, root, 10, ['r02'])).toEqual([]);
    expect(await listRunDirs(path.join(tmp, 'nothing-here'), root)).toEqual([]);
  });
});
