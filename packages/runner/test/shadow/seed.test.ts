/**
 * Seeding the build mirror from the user's .lake/build (closing round 1; decisions-log sections 30 and 31). Off by
 * default: a run's working copy builds from scratch. With `copyBuild` (the setting `telelean.run.reuseLeanBuild`), the
 * seed is what .lake/build held right after the board's last refresh, recorded inside the refresh's Lean job and
 * untouched since: anything Lake (or anyone) writes after the record or while the tree is copied seeds nothing, and
 * seeding never refuses a start. (What another program wrote while the refresh itself ran is part of the record; the
 * checks cannot tell it from the refresh's own output, and Lake's per-module check in the mirror rebuilds it.)
 *
 * Deterministic: no background writer. Changes happen at exact points (before the start, or from the copy's afterCopy
 * hook). `settle()` waits 30 ms after the fake build was written, longer than a file-system timestamp tick, so a later
 * change always gets a new ctime even on a kernel without fine-grained (multigrain) timestamps. Most cases need no Lean;
 * the last one builds the Spyro fixture with the board's real refresh.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LeanFacts, ModuleFacts } from '@telelean/core';

import { refreshLeanFacts, runExclusive } from '../../src/semantic/index.js';
import { createRunShadow } from '../../src/shadow/index.js';
import { artifactNewerThanTrace, noteRefreshOutput, seedFromRefreshOutput, STALE_TEMP_MS } from '../../src/shadow/seed.js';
import { cleanupTempRoot, makeTempRoot, spyroModelFiles, spyroRoot } from '../gate/helpers.js';

/** Regular files below `dir`, as sorted relative POSIX paths ([] when `dir` does not exist). */
function filesBelow(dir: string, rel = ''): string[] {
  if (!existsSync(path.join(dir, rel))) return [];
  const out: string[] = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...filesBelow(dir, childRel));
    else if (e.isFile()) out.push(childRel);
  }
  return out.sort();
}

const T0 = new Date('2026-10-01T10:00:00Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

/** Writes `<root>/.lake/build/<rel>` with the given modification time. */
function put(root: string, rel: string, text: string, mtime: Date): string {
  const file = path.join(root, '.lake', 'build', rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  utimesSync(file, mtime, mtime);
  return file;
}

const MODULES = ['Model/Spyro/Vocabulary', 'Model/Spyro/Main'];

/** A finished Lake 4.35 build of two modules: each module's artifacts, then its hashes, then its trace (verified order). */
function finishedBuild(root: string): string[] {
  for (const [i, m] of MODULES.entries()) {
    const t = i * 10;
    put(root, `ir/${m}.setup.json`, `{"m":"${m}"}`, at(t));
    put(root, `lib/lean/${m}.olean`, `olean ${m}`, at(t + 1));
    put(root, `lib/lean/${m}.ilean`, `ilean ${m}`, at(t + 2));
    put(root, `ir/${m}.c`, `c ${m}`, at(t + 3));
    put(root, `lib/lean/${m}.olean.hash`, '0f1532b7cb94125d', at(t + 4));
    put(root, `lib/lean/${m}.trace`, `{"trace":"${m}"}`, at(t + 5));
  }
  return filesBelow(path.join(root, '.lake', 'build'));
}

/** The facts of a refresh that built and checked both modules (what `noteRefreshOutput` needs of them). */
function okFacts(status: LeanFacts['status'] = 'ok', mainState: ModuleFacts['state'] = 'fresh'): Pick<LeanFacts, 'status' | 'modules'> {
  return {
    status,
    modules: MODULES.map((m, i) => ({
      name: m.split('/').join('.'),
      file: `${m}.lean`,
      sourceSha256: '0'.repeat(64),
      state: i === 1 ? mainState : 'fresh',
      imports: [],
    })),
  };
}

const seededFiles = (mirror: string): string[] => filesBelow(path.join(mirror, '.lake', 'build'));

describe('seeding the build mirror (closing round 1: off by default; only what the board\'s last refresh recorded, untouched since)', () => {
  let tmp: string;
  let n = 0;
  const runId = (): string => `seed_${++n}`;
  beforeAll(() => {
    tmp = makeTempRoot('shadow-seed');
  });
  afterAll(() => cleanupTempRoot(tmp));

  /** A Spyro root with a finished fake build that a refresh recorded (after `settle()`). */
  async function recordedRoot(name: string): Promise<{ root: string; files: string[] }> {
    const root = spyroRoot(tmp, name);
    const files = finishedBuild(root);
    await settle();
    expect(await noteRefreshOutput(root, okFacts())).toBeUndefined();
    return { root, files };
  }
  const start = (root: string, copyBuild?: boolean) =>
    createRunShadow({ root, runsDir: path.join(tmp, 'runs'), runId: runId(), library: 'Model', files: spyroModelFiles(), ...(copyBuild !== undefined ? { copyBuild } : {}) });

  it('by default nothing is seeded, even from a recorded refresh output: the run builds from scratch', async () => {
    const { root } = await recordedRoot('default');
    for (const shadow of [await start(root), await start(root, false)]) {
      expect(shadow.buildSeed).toEqual({ files: 0 });
      expect(existsSync(path.join(shadow.paths.build, '.lake'))).toBe(false);
      expect(filesBelow(shadow.paths.build)).toEqual([...spyroModelFiles().keys()].sort());
      expect((await shadow.commits()).map((c) => c.kind)).toEqual(['base']);
    }
  });

  it('with copyBuild, the recorded refresh output is seeded in full with its times; a stale temporary file of a crashed build is not copied', async () => {
    const root = spyroRoot(tmp, 'finished');
    const files = finishedBuild(root);
    const stale = put(root, 'lib/lean/Model/Spyro/Old.olean.tmp.4242', 'half an olean', at(-3600));
    expect(Date.now() - statSync(stale).mtimeMs).toBeGreaterThan(STALE_TEMP_MS);
    expect(await noteRefreshOutput(root, okFacts())).toBeUndefined();
    const shadow = await start(root, true);
    expect(shadow.buildSeed).toEqual({ files: files.length });
    expect(seededFiles(shadow.paths.build)).toEqual(files);
    const olean = path.join(shadow.paths.build, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean');
    expect(readFileSync(olean, 'utf8')).toBe('olean Model/Spyro/Main');
    expect(statSync(olean).mtimeMs).toBe(at(11).getTime());
    // The record stays valid for the next start while nothing writes the tree.
    expect((await start(root, true)).buildSeed).toEqual({ files: files.length });
  });

  it('with copyBuild but no recorded refresh output (none yet, or the last refresh did not succeed), nothing is seeded and the start goes on', async () => {
    const root = spyroRoot(tmp, 'unrecorded');
    finishedBuild(root);
    const none = await start(root, true);
    expect(none.buildSeed?.files).toBe(0);
    expect(none.buildSeed?.skipped).toMatch(/no finished Lean check of the board has been recorded/u);
    expect(existsSync(path.join(none.paths.build, '.lake'))).toBe(false);
    expect((await none.commits()).map((c) => c.kind)).toEqual(['base']);
    // A later refresh that failed, was cancelled or left a module stale forgets an earlier record.
    expect(await noteRefreshOutput(root, okFacts())).toBeUndefined();
    expect(await noteRefreshOutput(root, okFacts('build-errors'))).toBe('the refresh ended with build-errors');
    expect((await start(root, true)).buildSeed?.files).toBe(0);
    expect(await noteRefreshOutput(root, okFacts())).toBeUndefined();
    expect(await noteRefreshOutput(root, undefined)).toBe('the refresh did not finish');
    expect((await start(root, true)).buildSeed?.files).toBe(0);
    expect(await noteRefreshOutput(root, okFacts('ok', 'stale'))).toBe('Model/Spyro/Main.lean was stale after the refresh');
    expect(await noteRefreshOutput(root, okFacts('check-errors'))).toBe('the refresh ended with check-errors');
    expect((await start(root, true)).buildSeed?.files).toBe(0);
  });

  it('a tree that is not one complete build is never recorded (missing outputs, an artifact newer than its trace, a fresh temporary file, a lock, a symlink)', async () => {
    const cases: Array<[string, (root: string) => void, RegExp]> = [
      ['no-olean', (root) => rmSync(path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean')), /lib\/lean\/Model\/Spyro\/Main\.olean is missing \(Model\.Spyro\.Main is not completely built\)/u],
      ['no-trace', (root) => rmSync(path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Vocabulary.trace')), /Vocabulary\.trace is missing/u],
      ['newer-olean', (root) => put(root, 'lib/lean/Model/Spyro/Main.olean', 'olean of other sources', at(100)), /lib\/lean\/Model\/Spyro\/Main\.olean is newer than its trace \.lake\/build\/lib\/lean\/Model\/Spyro\/Main\.trace/u],
      ['newer-c', (root) => put(root, 'ir/Model/Spyro/Vocabulary.c', 'c of other sources', at(100)), /ir\/Model\/Spyro\/Vocabulary\.c is newer than its trace/u],
      ['own-trace', (root) => {
        put(root, 'ir/Model/Spyro/Main.c.o.export.trace', '{}', at(50));
        put(root, 'ir/Model/Spyro/Main.c.o.export', 'object', at(60));
      }, /Main\.c\.o\.export is newer than its trace/u],
      ['temp', (root) => put(root, 'lib/lean/Model/Spyro/Main.olean.tmp', '1234', new Date()), /\.lake\/build\/lib\/lean\/Model\/Spyro\/Main\.olean\.tmp is being written/u],
      ['temp-suffix', (root) => put(root, 'lib/lean/Model/Spyro/Main.olean.tmp.77', '1234', new Date()), /Main\.olean\.tmp\.77 is being written/u],
      ['lock', (root) => put(root, 'lake.lock', '1234', new Date()), /Lake's build lock \.lake\/build\/lake\.lock exists/u],
      ['symlink', (root) => symlinkSync('/etc/hostname', path.join(root, '.lake', 'build', 'lib', 'evil.olean')), /\.lake\/build\/lib\/evil\.olean is a symlink or special file \(never copied\)/u],
    ];
    for (const [name, mutate, reason] of cases) {
      const root = spyroRoot(tmp, `incomplete-${name}`);
      finishedBuild(root);
      mutate(root);
      expect(await noteRefreshOutput(root, okFacts()), name).toMatch(reason);
      const shadow = await start(root, true);
      expect(shadow.buildSeed?.files, name).toBe(0);
      expect(existsSync(path.join(shadow.paths.build, '.lake')), name).toBe(false);
      expect((await shadow.commits()).map((c) => c.kind), name).toEqual(['base']);
    }
    // Equal times are a finished build (coarse file system clocks); the artifacts and hashes are older than the trace.
    expect(artifactNewerThanTrace([{ rel: 'lib/lean/A.olean', st: { mtimeNs: 5n } }, { rel: 'lib/lean/A.trace', st: { mtimeNs: 5n } }])).toBeUndefined();
    expect(artifactNewerThanTrace([{ rel: 'lib/lean/A.olean.hash', st: { mtimeNs: 9n } }, { rel: 'lib/lean/A.trace', st: { mtimeNs: 5n } }])).toBeUndefined();
    expect(artifactNewerThanTrace([{ rel: 'lib/lean/A/B.ilean', st: { mtimeNs: 9n } }, { rel: 'lib/lean/A/B.trace', st: { mtimeNs: 5n } }])).toMatch(/A\/B\.ilean is newer/u);
    // A symlink in .lake/build refuses nothing: by default the tree is never looked at.
    const linked = spyroRoot(tmp, 'symlink-default');
    finishedBuild(linked);
    symlinkSync('/etc/hostname', path.join(linked, '.lake', 'build', 'lib', 'evil.olean'));
    expect((await start(linked)).buildSeed).toEqual({ files: 0 });
  });

  it('anything written after the record seeds nothing: a file rewritten in place (same size), added, removed or replaced, a directory created, a file created and removed again, a symlink', async () => {
    const victim = (root: string): string => path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.trace');
    const cases: Array<[string, (root: string) => void, RegExp]> = [
      ['rewritten', (root) => writeFileSync(victim(root), readFileSync(victim(root), 'utf8').toUpperCase()), /Main\.trace changed since the board's last Lean check/u],
      ['added', (root) => put(root, 'lib/lean/Model/Spyro/New.olean', 'new', at(0)), /New\.olean appeared since the board's last Lean check|Spyro changed since/u],
      ['removed', (root) => rmSync(victim(root)), /Main\.trace disappeared since|Spyro changed since/u],
      ['replaced', (root) => {
        writeFileSync(`${victim(root)}.new`, readFileSync(victim(root)));
        renameSync(`${victim(root)}.new`, victim(root));
      }, /Spyro changed since|Main\.trace changed since/u],
      ['directory', (root) => mkdirSync(path.join(root, '.lake', 'build', 'lib', 'lean', 'Other')), /Other appeared since|lib\/lean changed since/u],
      ['aba', (root) => {
        // Lake re-creating and deleting an output again: the listing's files are as recorded, the directory is not.
        writeFileSync(`${victim(root)}.x`, 'x');
        rmSync(`${victim(root)}.x`);
      }, /\.lake\/build\/lib\/lean\/Model\/Spyro changed since the board's last Lean check/u],
      ['symlink', (root) => symlinkSync('/etc/hostname', path.join(root, '.lake', 'build', 'evil.olean')), /evil\.olean is a symlink or special file/u],
    ];
    for (const [name, mutate, reason] of cases) {
      const { root } = await recordedRoot(`after-${name}`);
      mutate(root);
      const shadow = await start(root, true);
      expect(shadow.buildSeed?.files, name).toBe(0);
      expect(shadow.buildSeed?.skipped, name).toMatch(reason);
      expect(existsSync(path.join(shadow.paths.build, '.lake')), name).toBe(false);
      expect((await shadow.commits()).map((c) => c.kind), name).toEqual(['base']);
      // The record is forgotten: it can never match again.
      expect((await start(root, true)).buildSeed?.skipped, name).toMatch(/no finished Lean check of the board has been recorded/u);
    }
  });

  it('anything written while the tree is copied seeds nothing: a copied file rewritten, a file added, one created and removed again (the verifier\'s A-B-A), one replaced', async () => {
    const cases: Array<[string, (root: string, files: string[]) => void, RegExp]> = [
      ['rewritten', (root, files) => writeFileSync(path.join(root, '.lake', 'build', files[0] ?? ''), 'rewritten in place'), /changed while it was copied/u],
      ['appeared', (root) => put(root, 'lib/lean/Model/Spyro/New.olean', 'new', new Date()), /New\.olean appeared while it was copied|Spyro changed while it was copied/u],
      ['aba', (root) => {
        // aba.probe.ts: a file missing from both listings that Lake wrote and deleted in between.
        const v = path.join(root, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'victim.olean');
        writeFileSync(v, 'new');
        rmSync(v);
      }, /\.lake\/build\/lib\/lean\/Model\/Spyro changed while it was copied/u],
      ['replaced', (root, files) => {
        const f = path.join(root, '.lake', 'build', files.at(-1) ?? '');
        writeFileSync(`${f}.tmp`, readFileSync(f));
        renameSync(`${f}.tmp`, f);
      }, /changed while it was copied/u],
    ];
    for (const [name, mutate, reason] of cases) {
      const { root, files } = await recordedRoot(`during-${name}`);
      const mirror = path.join(tmp, `mirror-during-${name}`);
      mkdirSync(mirror);
      let done = false;
      const outcome = await seedFromRefreshOutput(root, mirror, {
        afterCopy: (rel) => {
          if (done || rel !== files[1]) return;
          done = true;
          mutate(root, files);
        },
      });
      expect(done, name).toBe(true);
      expect(outcome.files, name).toBe(0);
      expect(outcome.skipped, name).toMatch(reason);
      expect(existsSync(path.join(mirror, '.lake')), name).toBe(false);
    }
  });

  it('waits for the board\'s refresh (its Lean job) and seeds what that refresh recorded', async () => {
    const root = spyroRoot(tmp, 'refreshing');
    finishedBuild(root);
    const main = (rel: string) => path.join(root, '.lake', 'build', rel);
    let refreshDone = false;
    // A refresh rebuilding Main in place: its artifacts are deleted, rewritten after a while, its trace comes last; the
    // board records the result inside the same Lean job.
    const refresh = runExclusive(async () => {
      for (const rel of ['lib/lean/Model/Spyro/Main.olean', 'lib/lean/Model/Spyro/Main.ilean', 'ir/Model/Spyro/Main.c']) rmSync(main(rel));
      await new Promise((r) => setTimeout(r, 300));
      for (const rel of ['lib/lean/Model/Spyro/Main.olean', 'lib/lean/Model/Spyro/Main.ilean', 'ir/Model/Spyro/Main.c']) writeFileSync(main(rel), `rebuilt ${rel}`);
      writeFileSync(main('lib/lean/Model/Spyro/Main.trace'), '{"trace":"rebuilt"}');
      expect(await noteRefreshOutput(root, okFacts())).toBeUndefined();
      refreshDone = true;
    });
    const shadow = await start(root, true);
    await refresh;
    expect(refreshDone).toBe(true);
    expect(shadow.buildSeed).toEqual({ files: 12 });
    expect(readFileSync(path.join(shadow.paths.build, '.lake', 'build', 'lib', 'lean', 'Model', 'Spyro', 'Main.olean'), 'utf8')).toBe('rebuilt lib/lean/Model/Spyro/Main.olean');
  });

  it('a real refresh of the Spyro fixture (Lake 4.35) is recorded and seeded in full; by default the same start seeds nothing', async () => {
    const root = spyroRoot(tmp, 'real');
    let recorded: string | undefined = 'not called';
    const facts = await runExclusive(async () => {
      const f = await refreshLeanFacts({ root, runId: `seed${process.pid}` });
      recorded = await noteRefreshOutput(root, f);
      return f;
    });
    expect(facts.status).toBe('ok');
    expect(recorded).toBeUndefined();
    const built = filesBelow(path.join(root, '.lake', 'build')).filter((rel) => !/\.tmp(\.|$)/u.test(rel));
    expect(built).toContain('lib/lean/Model/Spyro/Main.olean');
    expect(built).toContain('lib/lean/Model/Spyro/Main.trace');
    const seeded = await start(root, true);
    expect(seeded.buildSeed).toEqual({ files: built.length });
    expect(seededFiles(seeded.paths.build)).toEqual(built);
    const plain = await start(root);
    expect(plain.buildSeed).toEqual({ files: 0 });
    expect(existsSync(path.join(plain.paths.build, '.lake'))).toBe(false);
  });
});
