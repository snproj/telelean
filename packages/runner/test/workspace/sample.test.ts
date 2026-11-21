/**
 * AT4.7: `mental_model/` is exactly the sample of docs/m1-plan.md section 7.4 (the user's Spyro walkthrough as
 * subject Spyro: three assumptions, one of them code-less, and one unproved goal). Only read here; parsing with the
 * real core and building under runLean use scratch copies.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultProjectConfig, emptyLayout, parseLayout, parseLeanFile, serializeLayout, serializeProjectConfig, subjectScaffold } from '@telelean/core';

import { runLean } from '../../src/lean/runLean.js';
import { resolveToolchain, toolchainExe } from '../../src/lean/toolchain.js';
import { findModelRoots, GITIGNORE_LINES, inspectFolder } from '../../src/workspace/index.js';
import { fakeParseLeanFile } from './fakeCore.js';
import { cleanup, copyMentalModel, exists, listFiles, makeTempDir, MENTAL_MODEL, read, REPO_ROOT, SPYRO_FIXTURE, TEST_RUN_ID, waitForMemory } from './helpers.js';

const bytes = (file: string): Buffer => readFileSync(file);
const SPYRO_FILES = ['Model/Spyro.lean', 'Model/Spyro/Inbox.lean', 'Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean'];
/** The empty layout as telelean wrote it before spec v4 (three columns). */
const PRE_V4_EMPTY_LAYOUT = `${JSON.stringify({ format: 'telelean-layout', version: 1, columns: { ASSUMPTION: [], DERIVATION: [], GOAL: [] } }, null, 2)}\n`;

describe('AT4.7 the sample mental_model/', () => {
  it('holds exactly the files of plan 7.4, and no .lake or .git', () => {
    expect(listFiles(MENTAL_MODEL)).toEqual([
      '.gitignore',
      '.telelean/config.json',
      '.telelean/subjects/Spyro/layout.json',
      'Model.lean',
      'Model/Spyro.lean',
      'Model/Spyro/Inbox.lean',
      'Model/Spyro/Main.lean',
      'Model/Spyro/Vocabulary.lean',
      'lake-manifest.json',
      'lakefile.toml',
      'lean-toolchain',
    ]);
    expect(exists(MENTAL_MODEL, '.lake')).toBe(false);
    expect(exists(MENTAL_MODEL, '.git')).toBe(false);
  });

  it('has the project files of 7.1, byte for byte', () => {
    for (const rel of ['lakefile.toml', 'lake-manifest.json', 'lean-toolchain']) {
      expect(bytes(path.join(MENTAL_MODEL, rel)).equals(bytes(path.join(SPYRO_FIXTURE, rel))), rel).toBe(true);
    }
    expect(read(MENTAL_MODEL, '.gitignore')).toBe(`${GITIGNORE_LINES.join('\n')}\n`);
    expect(read(MENTAL_MODEL, 'Model.lean')).toBe('import Model.Spyro\n');
    expect(read(MENTAL_MODEL, '.telelean/config.json')).toBe(serializeProjectConfig(defaultProjectConfig()));
    // Spec v4 (docs/slice1-plan.md 2.3): the sample was written with the column keys of before v4, which read as the
    // empty layout; telelean writes AXIOM and PROPOSITION from its next layout change on (mental_model/ is not
    // rewritten by slice 1a). Either form of the empty layout is the sample's.
    const layout = read(MENTAL_MODEL, '.telelean/subjects/Spyro/layout.json');
    expect(parseLayout(layout)).toEqual(emptyLayout());
    expect([serializeLayout(emptyLayout()), PRE_V4_EMPTY_LAYOUT]).toContain(layout);
  });

  it('has the scaffold root and Inbox, the fixture Vocabulary, and the fixture Main plus one import line', () => {
    const scaffold = new Map(subjectScaffold('Spyro', 'Model').map((f) => [f.path, f.text]));
    expect(read(MENTAL_MODEL, 'Model/Spyro.lean')).toBe(scaffold.get('Model/Spyro.lean'));
    expect(read(MENTAL_MODEL, 'Model/Spyro/Inbox.lean')).toBe(scaffold.get('Model/Spyro/Inbox.lean'));
    expect(bytes(path.join(MENTAL_MODEL, 'Model/Spyro/Vocabulary.lean')).equals(bytes(path.join(SPYRO_FIXTURE, 'Model/Spyro/Vocabulary.lean')))).toBe(true);
    const fixtureLines = read(SPYRO_FIXTURE, 'Model/Spyro/Main.lean').split('\n');
    const lines = read(MENTAL_MODEL, 'Model/Spyro/Main.lean').split('\n');
    expect(fixtureLines[0]).toBe('import Model.Spyro.Vocabulary');
    expect(lines).toEqual([fixtureLines[0], 'import Model.Spyro.Inbox', ...fixtureLines.slice(1)]);
  });

  it("is the walkthrough's starting state: three assumptions and one goal in Spyro", () => {
    const blocks = SPYRO_FILES.flatMap((rel) => fakeParseLeanFile(rel, read(MENTAL_MODEL, rel)).blocks);
    // The sample still says ASSUMPTION and GOAL: read as the aliases of AXIOM and PROPOSITION (spec v4).
    expect(blocks.map((b) => [b.id, b.fields.type])).toEqual([
      ['pg-no-dark-past', 'AXIOM'],
      ['cynder-dark-past', 'AXIOM'],
      ['new-spyro-pg', 'AXIOM'],
      ['cynder-not-good', 'PROPOSITION'],
    ]);
    expect(read(MENTAL_MODEL, 'Model/Spyro/Main.lean')).toContain('id: cynder-not-good\ntype: GOAL\n');
    const main = read(MENTAL_MODEL, 'Model/Spyro/Main.lean');
    expect(main).not.toMatch(/cynder_not_good\.holds/); // the goal is unproved
  });

  it('is a model root (Initialize sees it as opted in) and the only one in the repository', async () => {
    expect(await inspectFolder(MENTAL_MODEL)).toEqual({ kind: 'model', config: defaultProjectConfig() });
    expect(await findModelRoots(REPO_ROOT)).toEqual([MENTAL_MODEL]);
  });

  describe('parsed with the real core', () => {
    it('a scratch copy parses to the 4 Spyro nodes, pg-no-dark-past code-less, the others pinned', () => {
      const tmp = makeTempDir('sample-parse');
      try {
        const root = copyMentalModel(tmp);
        const blocks = SPYRO_FILES.flatMap((rel) => parseLeanFile(rel, read(root, rel)).blocks);
        expect(blocks.map((b) => b.id)).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'cynder-not-good']);
        expect(blocks.map((b) => b.binding.mode)).toEqual(['none', 'pinned', 'pinned', 'pinned']);
        expect(blocks.map((b) => b.fields.type)).toEqual(['AXIOM', 'AXIOM', 'AXIOM', 'PROPOSITION']);
      } finally {
        cleanup(tmp);
      }
    });
  });

  describe('built with Lean', () => {
    it('a scratch copy builds under runLean', async (ctx) => {
      if (!(await waitForMemory())) ctx.skip(); // RAM rule: never build below 12 GB available
      const tmp = makeTempDir('sample-build');
      try {
        const root = copyMentalModel(tmp);
        const result = await runLean({ shadowDir: root, argv: [toolchainExe(resolveToolchain(), 'lake'), 'build'], memoryMax: '4G', timeoutMs: 300_000, runId: TEST_RUN_ID });
        expect(result.status, `${result.detail ?? ''}\n${result.stdout}\n${result.stderr}`).toBe('ok');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/Build completed successfully/);
        expect(exists(MENTAL_MODEL, '.lake')).toBe(false); // the real folder stays untouched
      } finally {
        cleanup(tmp);
      }
    });
  });
});
