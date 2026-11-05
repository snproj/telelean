import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTextSource, readTextFile } from '../../src/logic/textSource';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(process.env.TELELEAN_TEST_TMP ?? tmpdir(), 'tl-textsource-'));
  await mkdir(path.join(root, 'Model', 'Spyro'), { recursive: true });
  await writeFile(path.join(root, 'Model', 'Spyro', 'Main.lean'), 'on disk\n');
  await writeFile(path.join(root, 'bom.lean'), '﻿with a byte-order mark\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('TextSource (AT5.7)', () => {
  it('prefers the open (possibly unsaved) document over the file on disk', async () => {
    const open = new Map([[path.join(root, 'Model', 'Spyro', 'Main.lean'), 'unsaved typing\n']]);
    const source = createTextSource(root, { openText: (abs) => open.get(abs), readFile: readTextFile });
    expect(await source.read('Model/Spyro/Main.lean')).toBe('unsaved typing\n');
    open.clear();
    expect(await source.read('Model/Spyro/Main.lean')).toBe('on disk\n');
  });

  it('gives null for missing files (also below a missing directory)', async () => {
    const source = createTextSource(root, { openText: () => undefined, readFile: readTextFile });
    expect(await source.read('Model/Spyro/Inbox.lean')).toBeNull();
    expect(await source.read('Model/Nope/Main.lean')).toBeNull();
    expect(await source.read('Model/Spyro/Main.lean/inner.lean')).toBeNull(); // ENOTDIR
  });

  it('drops a byte-order mark, as VS Code does for document text', async () => {
    expect(await readTextFile(path.join(root, 'bom.lean'))).toBe('with a byte-order mark\n');
  });

  it('refuses paths outside the root', async () => {
    const source = createTextSource(root, { openText: () => 'x', readFile: async () => 'x' });
    await expect(source.read('../outside.lean')).rejects.toThrow(/refused/);
    await expect(source.read('/etc/hostname')).rejects.toThrow(/refused/);
  });
});
