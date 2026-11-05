/** The Lake log parser on recorded Lake 5.0 / Lean 4.35 logs (AT3.12), and what the refresh derives from it. */
import { describe, expect, it } from 'vitest';

import {
  computeModuleStates,
  lineStarts,
  mergeLakeLogs,
  messageFacts,
  parseLakeLog,
  rootRelativeFile,
  succeededCaptions,
  type ModuleSource,
} from '../../src/semantic/index.js';
import { overlayText, recorded } from './helpers.js';

const SPYRO_MODULES = [
  { name: 'Model.Spyro.Vocabulary', headerImports: [] },
  { name: 'Model.Spyro.Main', headerImports: ['Model.Spyro.Vocabulary'] },
  { name: 'Model', headerImports: ['Model.Spyro.Main'] },
];

function parseRecorded(base: string, streams: Array<'stdout' | 'stderr'>): ReturnType<typeof parseLakeLog> {
  return mergeLakeLogs(...streams.map((s) => parseLakeLog(recorded(`${base}.${s}.txt`))));
}

describe('parseLakeLog (recorded logs)', () => {
  it('reads a failed build: progress, trace ignored, a multi-line error, the failures list', () => {
    const log = parseRecorded('lake-build-error', ['stdout', 'stderr']);
    expect(log.progress.map((p) => [p.icon, p.verb, p.caption, p.failed, p.jobNo, p.totalJobs])).toEqual([
      ['✔', 'Built', 'Model.Spyro.Vocabulary', false, 2, 5],
      ['✖', 'Building', 'Model.Spyro.Main', true, 3, 5],
    ]);
    expect(log.messages).toEqual([
      {
        severity: 'error',
        file: 'Model/Spyro/Main.lean',
        line: 58,
        column: 51,
        text: 'Type mismatch\n  cynder_dark_past.holds\nhas type\n  cynder_dark_past\nbut is expected to have type\n  cynder_not_good',
      },
    ]);
    expect(log.failedTargets).toEqual(['Model.Spyro.Main']);
    expect(log.buildFailed).toBe(true);
    expect(log.completed).toBe(false);
    expect(log.otherLines).toEqual([]);
    expect([...succeededCaptions(log)]).toEqual(['Model.Spyro.Vocabulary']);
  });

  it('reads a successful build with a warning, first built and then replayed', () => {
    const built = parseLakeLog(recorded('lake-extras-built.stdout.txt'));
    expect(built.progress.map((p) => `${p.icon} ${p.verb} ${p.caption}`)).toEqual([
      '✔ Built Model.Spyro.Vocabulary',
      '⚠ Built Model.Spyro.Main',
      '✔ Built Model',
    ]);
    const replayed = parseLakeLog(recorded('lake-extras-replayed.stdout.txt'));
    expect(replayed.progress.map((p) => `${p.icon} ${p.verb} ${p.caption}`)).toEqual(['⚠ Replayed Model.Spyro.Main']);
    for (const log of [built, replayed]) {
      expect(log.messages).toEqual([{ severity: 'warning', file: 'Model/Spyro/Main.lean', line: 87, column: 8, text: 'declaration uses `sorry`' }]);
      expect(log.completed).toBe(true);
      expect(log.buildFailed).toBe(false);
      expect(log.failedTargets).toEqual([]);
    }
  });

  it('reads bad imports: job captions, file-only messages, continuation lines, four failures', () => {
    const log = parseRecorded('lake-missing-import', ['stdout', 'stderr']);
    expect(log.failedTargets).toEqual(['job computation', 'Model.Spyro.Missing', 'Model.Spyro.Main', 'Model']);
    expect(log.messages).toEqual([
      { severity: 'error', text: 'Model: some modules have bad imports or could not be read' },
      { severity: 'error', text: 'no such file or directory (error code: 2)\n  file: /work/model/Model/Spyro/Missing.lean' },
      { severity: 'error', file: 'Model/Spyro/Main.lean', text: "bad import 'Model.Spyro.Missing'" },
      { severity: 'error', file: 'Model.lean', text: "bad import 'Model.Spyro.Main'" },
    ]);
    expect(log.progress.filter((p) => p.failed).map((p) => p.caption)).toEqual(['job computation', 'Model.Spyro.Missing', 'Model.Spyro.Main', 'Model']);
    expect(log.buildFailed).toBe(true);
  });

  it('reads a lakefile error (stderr only)', () => {
    const log = parseRecorded('lake-lakefile-error', ['stderr']);
    expect(log.messages).toEqual([{ severity: 'error', file: 'lakefile.toml', line: 3, column: 0, text: "error: unexpected end of input; expected ']'" }]);
    expect(log.progress).toEqual([]);
    expect(log.failedTargets).toEqual([]);
  });

  it('strips ANSI colours and carriage returns, and keeps unknown lines aside', () => {
    const log = parseLakeLog(
      '\x1B[2K\r\x1B[32m✔ [1/2] Built A.B (1.2s)\x1B[0m\r\nsomething else\r\n\x1B[33mwarning:\x1B[0m A/B.lean:1:2: careful\r\n  more\r\nℹ [2/2] (Optional) Replayed A (12s)\n',
    );
    expect(log.progress.map((p) => `${p.icon} ${p.verb} ${p.caption}`)).toEqual(['✔ Built A.B', 'ℹ Replayed A']);
    expect(log.messages).toEqual([{ severity: 'warning', file: 'A/B.lean', line: 1, column: 2, text: 'careful\n  more' }]);
    expect(log.otherLines).toEqual(['something else']);
  });
});

describe('from the log to facts', () => {
  const sources = (overlay: string): Map<string, ModuleSource & { starts: number[] }> => {
    const text = overlayText(overlay, 'Model/Spyro/Main.lean');
    const main = { name: 'Model.Spyro.Main', file: 'Model/Spyro/Main.lean', text, sha256: '', headerImports: [], imports: [], starts: lineStarts(text) };
    return new Map([[main.file, main]]);
  };

  it('converts message positions to zero-width LSP ranges with modules (UTF-16 after a non-BMP character)', () => {
    const log = parseRecorded('lake-nonbmp-error', ['stdout', 'stderr']);
    const facts = messageFacts(log.messages, '/work/model', sources('nonbmp-error'));
    expect(facts).toEqual([
      {
        severity: 'error',
        file: 'Model/Spyro/Main.lean',
        module: 'Model.Spyro.Main',
        range: { start: { line: 55, character: 31 }, end: { line: 55, character: 31 } },
        text: 'Unknown identifier `undefinedThing`',
      },
    ]);
    const lakefile = messageFacts(parseLakeLog(recorded('lake-lakefile-error.stderr.txt')).messages, '/work/model', new Map());
    expect(lakefile).toEqual([
      { severity: 'error', file: 'lakefile.toml', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, text: "error: unexpected end of input; expected ']'" },
    ]);
  });

  it('makes printed paths root-relative', () => {
    expect(rootRelativeFile('Model/Spyro/Main.lean', '/work/model')).toBe('Model/Spyro/Main.lean');
    expect(rootRelativeFile('./././Model/Spyro/Main.lean', '/work/model')).toBe('Model/Spyro/Main.lean');
    expect(rootRelativeFile('/work/model/Model.lean', '/work/model')).toBe('Model.lean');
    expect(rootRelativeFile('/elsewhere/Init.lean', '/work/model')).toBeUndefined();
    expect(rootRelativeFile('../x.lean', '/work/model')).toBeUndefined();
  });

  it('derives module states from the recorded logs', () => {
    const states = (base: string, buildOk: boolean, streams: Array<'stdout' | 'stderr'>): Record<string, string> => {
      const log = parseRecorded(base, streams);
      return Object.fromEntries(
        computeModuleStates({ modules: SPYRO_MODULES, library: 'Model', failedTargets: new Set(log.failedTargets), buildOk, reportedOk: succeededCaptions(log) }),
      );
    };
    expect(states('lake-build-error', false, ['stdout', 'stderr'])).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'failed', Model: 'dependency-failed' });
    expect(states('lake-extras-replayed', true, ['stdout'])).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'fresh', Model: 'fresh' });
    expect(states('lake-missing-import', false, ['stdout', 'stderr'])).toEqual({ 'Model.Spyro.Vocabulary': 'fresh', 'Model.Spyro.Main': 'failed', Model: 'failed' });
    // Nothing named and nothing built: no module can be trusted to be fresh.
    expect(states('lake-lakefile-error', false, ['stderr'])).toEqual({ 'Model.Spyro.Vocabulary': 'not-built', 'Model.Spyro.Main': 'not-built', Model: 'not-built' });
  });

  it('computes not-built, missing imports and cycles', () => {
    const run = (modules: Array<{ name: string; headerImports: string[] }>, failed: string[] = []): Record<string, string> =>
      Object.fromEntries(computeModuleStates({ modules, library: 'Model', failedTargets: new Set(failed), buildOk: failed.length === 0, reportedOk: new Set() }));
    expect(
      run([
        { name: 'Model', headerImports: ['Model.A', 'Model.Cyc1'] },
        { name: 'Model.A', headerImports: ['Model.Missing'] },
        { name: 'Model.B', headerImports: [] },
        { name: 'Model.Cyc1', headerImports: ['Model.Cyc2'] },
        { name: 'Model.Cyc2', headerImports: ['Model.Cyc1', 'Init'] },
      ]),
    ).toEqual({ Model: 'dependency-failed', 'Model.A': 'dependency-failed', 'Model.B': 'not-built', 'Model.Cyc1': 'dependency-failed', 'Model.Cyc2': 'dependency-failed' });
    expect(run([{ name: 'Model.A', headerImports: [] }])).toEqual({ 'Model.A': 'not-built' }); // no root module
  });
});
