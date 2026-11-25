/**
 * AT4.6 inspectFolder / planInitialize / initGitRepository and AT4.8 findModelRoots (docs/m1-plan.md 7.1, 7.2).
 * The scaffold's Lean build runs under runLean in a scratch copy (skipped only below 12 GB MemAvailable, the RAM rule).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defaultProjectConfig, emptyLayout, serializeLayout, serializeProjectConfig, subjectScaffold, type FileChange } from '@telelean/core';

import { runLean } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { ensureRunsDir, runsDirOf } from '../../src/shadow/index.js';
import { isModelFile, isModelOrProjectFile, listModelFiles, listScopeFiles, scopesOf } from '../../src/workspace/files.js';
import { readLakefileToml } from '../../src/workspace/initialize.js';
import {
  DEFAULT_EXCLUDED_DIRS,
  findModelRoots,
  GITIGNORE_LINES,
  initGitRepository,
  inspectFolder,
  planInitialize,
  suggestSubjectName,
  type FolderInspection,
} from '../../src/workspace/index.js';
import { cleanup, exists, makeTempDir, SPYRO_FIXTURE, TEST_RUN_ID, userGit, waitForMemory, write } from './helpers.js';

const fixture = (rel: string): string => readFileSync(path.join(SPYRO_FIXTURE, rel), 'utf8');
const GITIGNORE = `${GITIGNORE_LINES.join('\n')}\n`;

function applyTo(root: string, changes: readonly FileChange[]): void {
  for (const change of changes) {
    if (change.after !== null) write(root, change.path, change.after);
  }
}

describe('AT4.6 inspectFolder', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempDir('inspect');
  });
  afterAll(() => cleanup(tmp));

  function folder(name: string, files: Record<string, string>, dirs: string[] = []): string {
    const root = path.join(tmp, name);
    mkdirSync(root, { recursive: true });
    for (const dir of dirs) mkdirSync(path.join(root, dir), { recursive: true });
    for (const [rel, text] of Object.entries(files)) write(root, rel, text);
    return root;
  }

  const LAKEFILE = 'name = "Notes"\ndefaultTargets = ["Notes"]\n\n[[lean_lib]]\nname = "Notes"  # the model library\n';
  const MANIFEST = '{"version": "1.3.0", "packagesDir": ".lake/packages", "packages": [], "name": "Notes", "lakeDir": ".lake"}\n';

  it('empty: nothing but hidden files and .git, with the current .gitignore', async () => {
    expect(await inspectFolder(folder('empty', {}))).toEqual({ kind: 'empty' });
    expect(await inspectFolder(folder('hidden', { '.gitignore': 'node_modules/\n', '.vscode/settings.json': '{}' }, ['.git']))).toEqual({ kind: 'empty', gitignore: 'node_modules/\n' });
  });

  it('model: already opted in', async () => {
    expect(await inspectFolder(folder('model', { '.telelean/config.json': '{"library":"Notes"}', 'random.txt': 'x' }))).toEqual({
      kind: 'model',
      config: { format: 'telelean-config', version: 1, library: 'Notes' },
    });
  });

  it('lake-project: lakefile.toml with [[lean_lib]], a manifest without packages, no [[require]] (any toolchain)', async () => {
    const root = folder('lake', {
      'lakefile.toml': LAKEFILE,
      'lake-manifest.json': MANIFEST,
      'lean-toolchain': 'leanprover/lean4:v4.20.0\n',
      '.gitignore': '/.lake\n',
      'Notes.lean': 'import Notes.Alpha.A\n',
      'Notes/Alpha/A.lean': '-- alpha\n',
      'Notes/Delta/Deep/D.lean': '-- delta\n',
      'Notes/beta/B.lean': '-- lower-case: not a subject name\n',
      'Notes/Gamma/readme.md': 'no Lean files here\n',
    });
    expect(await inspectFolder(root)).toEqual({ kind: 'lake-project', library: 'Notes', subjects: ['Alpha', 'Delta'], gitignore: '/.lake\n' });
  });

  it('unsupported: Lake dependencies ([[require]] or manifest packages), named, with the M4 opt-in note', async () => {
    const require = await inspectFolder(
      folder('require', { 'lakefile.toml': `${LAKEFILE}\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\n`, 'lake-manifest.json': MANIFEST }),
    );
    expect(require.kind).toBe('unsupported');
    expect(require.kind === 'unsupported' && require.reason).toMatch(/Lake dependencies \(mathlib\).*Mathlib needs an explicit opt-in \(M4\)/);
    const packages = await inspectFolder(
      folder('packages', {
        'lakefile.toml': LAKEFILE,
        'lake-manifest.json': '{"version": "1.3.0", "packages": [{"name": "batteries", "type": "git"}, {"name": "mathlib", "type": "git"}]}',
      }),
    );
    expect(packages.kind === 'unsupported' && packages.reason).toMatch(/Lake dependencies \(batteries, mathlib\)/);
  });

  it('unsupported: lakefile.lean only, both lakefiles, no [[lean_lib]], no manifest, a bad manifest, other files', async () => {
    const reasons: Array<[string, FolderInspection, RegExp]> = [
      ['lean-only', await inspectFolder(folder('lean-only', { 'lakefile.lean': 'import Lake\n' })), /lakefile\.lean.*lakefile\.toml/],
      ['both', await inspectFolder(folder('both', { 'lakefile.lean': 'import Lake\n', 'lakefile.toml': LAKEFILE, 'lake-manifest.json': MANIFEST })), /both lakefile\.lean and lakefile\.toml/],
      ['no-lib', await inspectFolder(folder('no-lib', { 'lakefile.toml': 'name = "X"\n[[lean_exe]]\nname = "x"\n', 'lake-manifest.json': MANIFEST })), /no \[\[lean_lib\]\]/],
      ['no-manifest', await inspectFolder(folder('no-manifest', { 'lakefile.toml': LAKEFILE })), /lake-manifest\.json is missing/],
      ['bad-manifest', await inspectFolder(folder('bad-manifest', { 'lakefile.toml': LAKEFILE, 'lake-manifest.json': '{oops' })), /not a valid Lake manifest/],
      ['files', await inspectFolder(folder('files', { 'notes.txt': 'hello\n' })), /no Lake project/],
      ['missing', await inspectFolder(path.join(tmp, 'does-not-exist')), /cannot be read/],
    ];
    for (const [name, inspection, reason] of reasons) {
      expect(inspection.kind, name).toBe('unsupported');
      expect(inspection.kind === 'unsupported' && inspection.reason, name).toMatch(reason);
    }
  });

  it('reads just enough TOML: comments, quoting, array tables, inline require', () => {
    expect(readLakefileToml('# c\n[[ lean_lib ]]\nname = \'A\' # x\n[[lean_lib]]\nname = "B#C"\n[[require]]\nname = "dep"\n')).toEqual({ leanLibs: ['A', 'B#C'], requires: ['dep'] });
    expect(readLakefileToml('require = [{ name = "x" }]\n[[lean_lib]]\nname = "M"\n')).toEqual({ leanLibs: ['M'], requires: ['?'] });
  });
});

describe('AT4.6 planInitialize', () => {
  it('empty folder: exactly the files of section 7.1, in order, all created', () => {
    const changes = planInitialize({ subject: 'Spyro', inspection: { kind: 'empty' } });
    const scaffold = subjectScaffold('Spyro', 'Model');
    expect(changes.map((c) => c.path)).toEqual([
      'lakefile.toml',
      'lean-toolchain',
      'lake-manifest.json',
      '.gitignore',
      'Model.lean',
      ...scaffold.map((f) => f.path),
      '.telelean/config.json',
      '.telelean/subjects/Spyro/layout.json',
    ]);
    expect(changes.every((c) => c.before === null)).toBe(true);
    const text = (rel: string): string | null | undefined => changes.find((c) => c.path === rel)?.after;
    expect(text('lakefile.toml')).toBe(fixture('lakefile.toml')); // byte-identical
    expect(text('lake-manifest.json')).toBe(fixture('lake-manifest.json'));
    expect(text('lean-toolchain')).toBe('leanprover/lean4:v4.35.0\n');
    expect(text('lean-toolchain')).toBe(fixture('lean-toolchain'));
    expect(text('.gitignore')).toBe('/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n/.telelean/runs/\n');
    expect(text('Model.lean')).toBe('import Model.Spyro\n');
    for (const file of scaffold) expect(text(file.path), file.path).toBe(file.text);
    expect(text('.telelean/config.json')).toBe(serializeProjectConfig(defaultProjectConfig()));
    expect(text('.telelean/subjects/Spyro/layout.json')).toBe(serializeLayout(emptyLayout()));
  });

  it('2k2 (D2-109): /.telelean/runs/ is one of the lines; a .gitignore of the lines before 2k2 gets just that one', () => {
    expect(GITIGNORE_LINES).toContain('/.telelean/runs/');
    const before2k2 = '/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n';
    const change = planInitialize({ subject: '', inspection: { kind: 'lake-project', library: 'Model', subjects: [], gitignore: before2k2 } }).find((c) => c.path === '.gitignore');
    expect(change?.after).toBe(`${before2k2}/.telelean/runs/\n`);
  });

  it('an existing .gitignore gets only the missing lines (before = its text)', () => {
    const existing = 'node_modules/\n/.lake\n';
    const change = planInitialize({ subject: 'Spyro', inspection: { kind: 'empty', gitignore: existing } }).find((c) => c.path === '.gitignore');
    expect(change).toEqual({ path: '.gitignore', before: existing, after: `${existing}/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n/.telelean/runs/\n` });
    const noNewline = planInitialize({ subject: 'Spyro', inspection: { kind: 'empty', gitignore: 'dist' } }).find((c) => c.path === '.gitignore');
    expect(noNewline?.after).toBe(`dist\n${GITIGNORE}`);
    const complete = planInitialize({ subject: 'Spyro', inspection: { kind: 'empty', gitignore: `# mine\n${GITIGNORE}` } });
    expect(complete.some((c) => c.path === '.gitignore')).toBe(false);
  });

  it('lake project: only .telelean/ files (config with its library, one layout per subject) and .gitignore lines', () => {
    const changes = planInitialize({ subject: '', inspection: { kind: 'lake-project', library: 'Notes', subjects: ['Delta', 'Alpha'], gitignore: '/.lake/\n' } });
    expect(changes).toEqual([
      { path: '.telelean/config.json', before: null, after: serializeProjectConfig({ format: 'telelean-config', version: 1, library: 'Notes' }) },
      { path: '.gitignore', before: '/.lake/\n', after: '/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n/.telelean/runs/\n' },
      { path: '.telelean/subjects/Alpha/layout.json', before: null, after: serializeLayout(emptyLayout()) },
      { path: '.telelean/subjects/Delta/layout.json', before: null, after: serializeLayout(emptyLayout()) },
    ]);
    const noGitignore = planInitialize({ subject: 'Ignored', inspection: { kind: 'lake-project', library: 'Notes', subjects: [] } });
    expect(noGitignore.map((c) => [c.path, c.before])).toEqual([
      ['.telelean/config.json', null],
      ['.gitignore', null],
    ]);
  });

  it('refuses model and unsupported folders and invalid subject names', () => {
    expect(() => planInitialize({ subject: 'Spyro', inspection: { kind: 'model', config: defaultProjectConfig() } })).toThrow(TypeError);
    expect(() => planInitialize({ subject: 'Spyro', inspection: { kind: 'unsupported', reason: 'x' } })).toThrow(TypeError);
    for (const bad of ['', 'spyro', 'Two words', 'Ünicode', '1st']) expect(() => planInitialize({ subject: bad, inspection: { kind: 'empty' } }), bad).toThrow(TypeError);
  });

  it('suggests a subject name from the folder name', () => {
    expect(suggestSubjectName('mental_model')).toBe('MentalModel');
    expect(suggestSubjectName('Spyro')).toBe('Spyro');
    expect(suggestSubjectName('my-model 2')).toBe('MyModel2');
    expect(suggestSubjectName('café notes')).toBe('CafNotes');
    expect(suggestSubjectName('2024')).toBe('Subject');
    expect(suggestSubjectName('---')).toBe('Subject');
  });

  it('initGitRepository refuses inside an existing repository', async () => {
    const tmp = makeTempDir('initgit');
    try {
      userGit(tmp, 'init', '-q');
      mkdirSync(path.join(tmp, 'model'));
      await expect(initGitRepository(path.join(tmp, 'model'))).rejects.toThrow(/already inside the git repository/);
      expect(exists(tmp, 'model/.git')).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  describe('Lean', () => {
    it('the empty-folder scaffold builds under runLean in a scratch copy', async (ctx) => {
      if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
      const tmp = makeTempDir('scaffold-build');
      try {
        const root = path.join(tmp, 'Fresh');
        mkdirSync(root);
        applyTo(root, planInitialize({ subject: suggestSubjectName('Fresh'), inspection: await inspectFolder(root) }));
        const result = await runLean({ shadowDir: root, argv: [toolchainExe(resolveToolchain(), 'lake'), 'build'], memoryMax: '4G', timeoutMs: 300_000, runId: TEST_RUN_ID });
        expect(result.status, `${result.detail ?? ''}\n${result.stdout}\n${result.stderr}`).toBe('ok');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Build completed successfully/);
      } finally {
        cleanup(tmp);
      }
    });
  });
});

describe('AT4.8 findModelRoots', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempDir('roots');
    const config = '{"format":"telelean-config","version":1,"library":"Model"}\n';
    for (const dir of [
      'a',
      'a/sub/b',
      'deep/1/2/3',
      'deeper/1/2/3/4',
      'node_modules/pkg',
      '.lake/x',
      '.git/x',
      'verbatim_prompt_log/bundle_1',
      'test-fixtures/spyro',
      '.hidden/model',
      'x/node_modules/y',
    ]) {
      write(tmp, `${dir}/.telelean/config.json`, config);
    }
    mkdirSync(path.join(tmp, 'not-a-root', '.telelean'), { recursive: true }); // no config.json
  });
  afterAll(() => cleanup(tmp));

  it('finds nested roots, skipping node_modules, .lake, .git, verbatim_prompt_log, test-fixtures and dot-dirs', async () => {
    expect(DEFAULT_EXCLUDED_DIRS).toEqual(['node_modules', '.lake', '.git', 'verbatim_prompt_log', 'test-fixtures']);
    expect(await findModelRoots(tmp)).toEqual(['a', 'a/sub/b', 'deep/1/2/3'].map((d) => path.join(tmp, d)));
  });

  it('honours maxDepth and custom excludes (dot-dirs stay skipped)', async () => {
    expect(await findModelRoots(tmp, { maxDepth: 5 })).toContain(path.join(tmp, 'deeper/1/2/3/4'));
    expect(await findModelRoots(tmp, { maxDepth: 1 })).toEqual([path.join(tmp, 'a')]);
    expect(await findModelRoots(tmp, { excludedDirs: [] })).toEqual(
      ['a', 'a/sub/b', 'deep/1/2/3', 'node_modules/pkg', 'test-fixtures/spyro', 'verbatim_prompt_log/bundle_1', 'x/node_modules/y'].map((d) => path.join(tmp, d)),
    );
    expect(await findModelRoots(path.join(tmp, 'a'))).toEqual([path.join(tmp, 'a'), path.join(tmp, 'a/sub/b')]);
    expect(await findModelRoots(path.join(tmp, 'missing'))).toEqual([]);
  });
});

describe("2k2 (docs/slice2-plan.md 2.10, D2-107 R1, R2): a model's runs folder is invisible to git, History and the scans", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = makeTempDir('runs2k2');
  });
  afterAll(() => cleanup(tmp));

  /** A run folder as a run leaves it: ws/ and build/ with model files, run.json, the transcript, the consent. */
  async function addRun(root: string): Promise<void> {
    await ensureRunsDir(runsDirOf(root));
    for (const rel of ['ws/Model.lean', 'ws/Model/Spyro/Main.lean', 'ws/lakefile.toml', 'build/Model/Spyro/Main.lean', 'build/.lake/build/x.olean', 'run.json', 'session/transcript.jsonl']) {
      write(root, `.telelean/runs/r1/${rel}`, 'x\n');
    }
    write(root, '.telelean/runs/consent.json', '{}\n');
  }

  it('git status lists nothing under .telelean/runs/, with or without the .gitignore line (the folder ignores itself)', async () => {
    for (const [name, gitignore] of [['with-line', `${GITIGNORE_LINES.join('\n')}\n`], ['without-line', '/.lake/\n']] as const) {
      const root = path.join(tmp, name);
      mkdirSync(root, { recursive: true });
      write(root, '.gitignore', gitignore);
      write(root, 'Model/Spyro/Main.lean', 'namespace Spyro\nend Spyro\n');
      await initGitRepository(root);
      await addRun(root);
      const status = userGit(root, 'status', '--porcelain', '--untracked-files=all', '--ignored=no');
      expect(status.split('\n').filter((l) => l.includes('.telelean/runs')), name).toEqual([]);
      expect(status).toContain('Model/Spyro/Main.lean'); // the model's own files are still seen
      expect(userGit(root, 'check-ignore', '.telelean/runs/r1/ws/Model.lean').trim(), name).toBe('.telelean/runs/r1/ws/Model.lean');
    }
  });

  it("History's scopes and listings, the model file rules, findModelRoots and inspectFolder never include a run's files", async () => {
    const root = path.join(tmp, 'model');
    write(root, '.telelean/config.json', '{"format":"telelean-config","version":1,"library":"Model"}\n');
    write(root, 'Model/Spyro/Main.lean', 'namespace Spyro\nend Spyro\n');
    write(root, 'lakefile.toml', 'name = "Model"\n');
    await addRun(root);
    // Even a run folder that looked like a model root (it never does: ws/ holds no dot-entry) is not found.
    write(root, '.telelean/runs/r1/ws/.telelean/config.json', '{"format":"telelean-config","version":1,"library":"Model"}\n');
    const runFiles = ['.telelean/runs/r1/ws/Model/Spyro/Main.lean', '.telelean/runs/r1/ws/Model.lean', '.telelean/runs/r1/run.json', '.telelean/runs/consent.json'];
    expect(scopesOf(runFiles, 'Model')).toEqual([]);
    expect(runFiles.some((rel) => isModelOrProjectFile(rel, 'Model') || isModelFile(rel, 'Model'))).toBe(false);
    const listed = [...(await listScopeFiles(root, { kind: 'subject', subject: 'Spyro' }, 'Model')), ...(await listScopeFiles(root, { kind: 'project' }, 'Model'))];
    expect(listed.filter((rel) => rel.includes('runs'))).toEqual([]);
    expect(listed).toContain('Model/Spyro/Main.lean');
    expect(await listModelFiles(root, 'Model')).toEqual(['Model/Spyro/Main.lean']);
    expect(await findModelRoots(tmp, { maxDepth: 10 })).toEqual([root]);
    // A folder that holds only a runs folder (its model files gone) is empty to Initialize.
    const left = path.join(tmp, 'left-over');
    await addRun(left);
    expect(await inspectFolder(left)).toMatchObject({ kind: 'empty' });
  });
});
