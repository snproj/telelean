import type { FileChange, HistoryAvailability } from '@telelean/core';
import type { FolderInspection, InitializeOptions } from '@telelean/runner/workspace/index.js';
import { describe, expect, it } from 'vitest';

import { defaultSubjectName, runInitialize, subjectNameProblem, type InitializePorts } from '../../src/logic/initialize';

describe('first subject name (AT5.3)', () => {
  it('suggests the folder name as a capitalised identifier', () => {
    expect(defaultSubjectName('mental_model')).toBe('MentalModel');
    expect(defaultSubjectName('spyro notes')).toBe('SpyroNotes');
    expect(defaultSubjectName('Spyro')).toBe('Spyro');
    expect(defaultSubjectName('café-lore')).toBe('CafLore');
    expect(defaultSubjectName('2024')).toBe('Subject');
    expect(defaultSubjectName('ü')).toBe('Subject');
  });

  it('validates typed names like the protocol does (SUBJECT_NAME_PATTERN)', () => {
    expect(subjectNameProblem('Spyro')).toBeUndefined();
    expect(subjectNameProblem('Spyro_2')).toBeUndefined();
    expect(subjectNameProblem('')).toMatch(/Type a name/);
    expect(subjectNameProblem('spyro')).toMatch(/capital/);
    expect(subjectNameProblem('Spy ro')).toMatch(/letters, digits/);
    expect(subjectNameProblem(`S${'x'.repeat(64)}`)).toMatch(/64/);
  });
});

/** Ports that record what happened, with configurable answers. */
function ports(inspection: FolderInspection, options: { subject?: string; confirm?: boolean; history?: HistoryAvailability; gitAnswer?: boolean } = {}) {
  const log: string[] = [];
  let history = options.history ?? { state: 'no-repo' };
  const planned: InitializeOptions[] = [];
  const applied: FileChange[][] = [];
  const p: InitializePorts = {
    inspect: async () => inspection,
    askSubject: async (_folder, suggested) => {
      log.push(`ask ${suggested}`);
      return options.subject;
    },
    confirmLakeProject: async () => {
      log.push('confirm lake');
      return options.confirm ?? false;
    },
    plan: (o) => {
      planned.push(o);
      return [
        { path: 'lakefile.toml', before: null, after: 'name = "Model"\n' },
        { path: '.telelean/config.json', before: null, after: '{}\n' },
      ];
    },
    apply: async (_folder, changes) => {
      applied.push([...changes]);
    },
    historyStatus: async () => history,
    offerGitInit: async () => {
      log.push('offer git');
      return options.gitAnswer ?? false;
    },
    initGit: async () => {
      log.push('git init');
      history = { state: 'ready' };
      return history;
    },
    openBoard: async (folder) => {
      log.push(`open ${folder}`);
    },
    show: (level, message) => log.push(`${level}: ${message}`),
  };
  return { p, log, planned, applied };
}

describe('Initialize flow (AT5.3)', () => {
  it('empty folder: asks the subject (suggesting the folder name), writes the plan, offers git, opens the board', async () => {
    const t = ports({ kind: 'empty' }, { subject: 'Spyro', gitAnswer: true });
    const result = await runInitialize('/w/mental_model', t.p);
    expect(result).toEqual({ status: 'initialized', root: '/w/mental_model', files: ['lakefile.toml', '.telelean/config.json'], git: 'initialized', opened: true });
    expect(t.planned).toEqual([{ subject: 'Spyro', inspection: { kind: 'empty' } }]);
    expect(t.applied).toHaveLength(1);
    expect(t.log.filter((l) => !l.startsWith('info'))).toEqual(['ask MentalModel', 'offer git', 'git init', 'open /w/mental_model']);
  });

  it('declining git leaves history off; an existing repository is not offered git', async () => {
    const declined = ports({ kind: 'empty' }, { subject: 'Spyro', gitAnswer: false });
    expect(await runInitialize('/w/m', declined.p, { openBoard: false })).toMatchObject({ status: 'initialized', git: 'declined', opened: false });
    expect(declined.log).not.toContain('git init');
    const inRepo = ports({ kind: 'empty' }, { subject: 'Spyro', history: { state: 'ready' } });
    expect(await runInitialize('/w/m', inRepo.p)).toMatchObject({ git: 'ready' });
    expect(inRepo.log).not.toContain('offer git');
  });

  it('cancelled or invalid subject: writes nothing', async () => {
    const cancelled = ports({ kind: 'empty' });
    expect(await runInitialize('/w/m', cancelled.p)).toEqual({ status: 'cancelled', root: '/w/m' });
    const invalid = ports({ kind: 'empty' }, { subject: 'lower case' });
    expect(await runInitialize('/w/m', invalid.p)).toMatchObject({ status: 'failed' });
    expect(cancelled.applied).toEqual([]);
    expect(invalid.applied).toEqual([]);
  });

  it('Lake project: confirms, then plans with the inspection (no subject question)', async () => {
    const inspection: FolderInspection = { kind: 'lake-project', library: 'Model', subjects: ['Spyro'] };
    const t = ports(inspection, { confirm: true, history: { state: 'disabled' } });
    expect(await runInitialize('/w/lake', t.p)).toMatchObject({ status: 'initialized', git: 'unavailable', gitDetail: 'disabled' });
    expect(t.planned).toEqual([{ subject: 'Spyro', inspection }]);
    expect(t.log).not.toContain('ask Lake');
    const no = ports(inspection, { confirm: false });
    expect(await runInitialize('/w/lake', no.p)).toEqual({ status: 'cancelled', root: '/w/lake' });
  });

  it('already a model: opens its board; unsupported: explains and writes nothing', async () => {
    const model = ports({ kind: 'model', config: { format: 'telelean-config', version: 1, library: 'Model' } });
    expect(await runInitialize('/w/m', model.p)).toEqual({ status: 'already-model', root: '/w/m', opened: true });
    expect(model.log).toContain('open /w/m');
    const unsupported = ports({ kind: 'unsupported', reason: 'this project has Lake dependencies (mathlib)' });
    expect(await runInitialize('/w/m', unsupported.p)).toEqual({ status: 'unsupported', root: '/w/m', reason: 'this project has Lake dependencies (mathlib)' });
    expect(unsupported.applied).toEqual([]);
    expect(unsupported.log.some((l) => l.startsWith('error:') && l.includes('mathlib'))).toBe(true);
  });

  it('a failing write is reported, and nothing is offered afterwards', async () => {
    const t = ports({ kind: 'empty' }, { subject: 'Spyro' });
    t.p.apply = async () => {
      throw new Error('Model.lean changed since telelean planned "Initialize model"; nothing was applied.');
    };
    expect(await runInitialize('/w/m', t.p)).toMatchObject({ status: 'failed', error: expect.stringContaining('nothing was applied') });
    expect(t.log).not.toContain('offer git');
  });
});
