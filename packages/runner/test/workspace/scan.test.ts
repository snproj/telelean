/**
 * AT4.1 (scan, subjects, graphs, invalidate) and AT4.9 (graph versions). The workspace's own logic runs against a
 * fake core (./fakeCore.ts), plus checks with the real core.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ParsedFile, ProjectInput } from '@telelean/core';

import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace, type ModelWorkspaceOptions, type WorkspaceChange } from '../../src/workspace/index.js';
import { fakeCore } from './fakeCore.js';
import { cleanup, copyMentalModel, makeTempDir, overlayTextSource, read, sha256, waitFor, write } from './helpers.js';

const OTHER_MAIN = `import Model.Other.Vocabulary

namespace Other

/-
@@ telelean v1
id: other-claim
type: GOAL
natural_name: The other subject has one goal
-/

end Other
`;

/** A copy of mental_model/ plus a second subject `Other` (and files the scan must skip). */
function makeRoot(dir: string): string {
  const root = copyMentalModel(dir);
  write(root, 'Model.lean', `${read(root, 'Model.lean')}import Model.Other\n`);
  write(root, 'Model/Other.lean', 'import Model.Other.Vocabulary\nimport Model.Other.Main\n');
  write(root, 'Model/Other/Vocabulary.lean', 'namespace Other\n\nend Other\n');
  write(root, 'Model/Other/Main.lean', OTHER_MAIN);
  // Not model files: dot-dirs, node_modules, .lake, other folders, non-Lean files.
  write(root, 'Model/.hidden/Ghost.lean', '/-\n@@ telelean v1\nid: ghost\ntype: GOAL\nnatural_name: hidden\n-/\n');
  write(root, 'Model/node_modules/Dep.lean', '-- no\n');
  write(root, '.lake/build/Model/Junk.lean', '-- no\n');
  write(root, 'Check/Elsewhere.lean', '/-\n@@ telelean v1\nid: elsewhere\ntype: GOAL\nnatural_name: outside the library\n-/\n');
  write(root, 'Model/Spyro/notes.md', 'not Lean\n');
  return root;
}

function options(root: string, extra: Partial<ModelWorkspaceOptions> = {}): ModelWorkspaceOptions {
  return { root, text: fsTextSource(root), applier: fsEditApplier(root), core: fakeCore, semantic: { enabled: false }, git: { enabled: false }, ...extra };
}

describe('AT4.1 scanning a model root', () => {
  let tmp: string;
  let root: string;
  beforeAll(() => {
    tmp = makeTempDir('scan');
    root = makeRoot(tmp);
  });
  afterAll(() => cleanup(tmp));

  it('passes exactly the model files, hashed, to core and lists both subjects with node counts', async () => {
    const inputs: ProjectInput[] = [];
    const ws = createModelWorkspace(
      options(root, {
        core: {
          ...fakeCore,
          buildProjectModel: (input) => {
            inputs.push(input);
            return fakeCore.buildProjectModel(input);
          },
        },
      }),
    );
    await ws.load();
    expect(ws.subjects()).toEqual([
      { name: 'Other', nodeCount: 1, files: ['Model/Other.lean', 'Model/Other/Main.lean', 'Model/Other/Vocabulary.lean'] },
      { name: 'Spyro', nodeCount: 4, files: ['Model/Spyro.lean', 'Model/Spyro/Inbox.lean', 'Model/Spyro/Main.lean', 'Model/Spyro/Vocabulary.lean'] },
    ]);
    const input = inputs.at(-1);
    expect(input?.library).toBe('Model');
    expect(input?.facts).toBeUndefined();
    const paths = input?.files.map((f) => f.path) ?? [];
    expect(paths).toEqual([
      'Model.lean',
      'Model/Other.lean',
      'Model/Other/Main.lean',
      'Model/Other/Vocabulary.lean',
      'Model/Spyro.lean',
      'Model/Spyro/Inbox.lean',
      'Model/Spyro/Main.lean',
      'Model/Spyro/Vocabulary.lean',
    ]);
    for (const rel of paths) expect(input?.fileHashes[rel], rel).toBe(sha256(read(root, rel)));
    expect(Object.keys(input?.fileHashes ?? {}).sort()).toEqual(paths);

    const graph = ws.graph('Spyro');
    expect(graph.subject).toBe('Spyro');
    expect(graph.nodes.map((n) => n.id)).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg', 'cynder-not-good']);
    expect(ws.graph('Other').nodes.map((n) => n.id)).toEqual(['other-claim']);
    expect(() => ws.graph('Nope')).toThrow(/unknown subject "Nope"/);
    ws.dispose();
  });

  it('reads through the TextSource (unsaved buffers win) and parses each file once per content', async () => {
    const text = overlayTextSource(root);
    const extra = `/-\n@@ telelean v1\nid: unsaved-node\ntype: ASSUMPTION\nnatural_name: Typed but not saved\n-/\n`;
    text.overlay.set('Model/Spyro/Inbox.lean', read(root, 'Model/Spyro/Inbox.lean').replace('end Spyro', `${extra}\nend Spyro`));
    const parsed: string[] = [];
    const ws = createModelWorkspace(
      options(root, {
        text,
        core: {
          ...fakeCore,
          parseLeanFile: (p: string, t: string): ParsedFile => {
            parsed.push(p);
            return fakeCore.parseLeanFile(p, t);
          },
        },
      }),
    );
    await ws.load();
    expect(parsed).toEqual([]); // parsing is lazy
    expect(ws.subjects().find((s) => s.name === 'Spyro')?.nodeCount).toBe(5);
    expect(parsed.length).toBe(8);
    ws.graph('Spyro');
    ws.graph('Other');
    expect(parsed.length).toBe(8); // cached model

    text.overlay.set('Model/Spyro/Inbox.lean', read(root, 'Model/Spyro/Inbox.lean'));
    await ws.invalidate(['Model/Spyro/Inbox.lean', 'Model/Spyro/Main.lean']); // Main.lean unchanged: no re-parse
    expect(ws.subjects().find((s) => s.name === 'Spyro')?.nodeCount).toBe(4);
    expect(parsed.slice(8)).toEqual(['Model/Spyro/Inbox.lean']);
    ws.dispose();
  });

  it('invalidate adds new files, drops deleted ones and reports subject-list changes', async () => {
    const text = overlayTextSource(root);
    const ws = createModelWorkspace(options(root, { text }));
    await ws.load();
    const changes: WorkspaceChange[] = [];
    const sub = ws.onDidChange((c) => changes.push(c));

    text.overlay.set('Model/Third/Main.lean', 'namespace Third\n/-\n@@ telelean v1\nid: third-a\ntype: GOAL\nnatural_name: A third subject\n-/\nend Third\n');
    await ws.invalidate(['Model/Third/Main.lean']);
    expect(ws.subjects().map((s) => s.name)).toEqual(['Other', 'Spyro', 'Third']);
    expect(changes.at(-1)).toEqual({ subjects: ['Other', 'Spyro', 'Third'], semantic: false, subjectsListChanged: true });

    text.overlay.set('Model/Third/Main.lean', null);
    await ws.invalidate([`${root}/Model/Third/Main.lean`]); // absolute paths inside the root are accepted too
    expect(ws.subjects().map((s) => s.name)).toEqual(['Other', 'Spyro']);
    expect(changes.at(-1)?.subjectsListChanged).toBe(true);
    expect(() => ws.graph('Third')).toThrow(/unknown subject/);

    const count = changes.length;
    await ws.invalidate(['Model/Spyro/Main.lean', 'README.md', '../outside.lean', 'Model/Spyro/notes.md']); // nothing changed
    expect(changes.length).toBe(count);

    text.overlay.set('.telelean/subjects/Spyro/layout.json', '{"format":"telelean-layout","version":1,"columns":{"ASSUMPTION":[],"DERIVATION":[],"GOAL":[]},"collapsed":{"vocabulary":true}}\n');
    await ws.invalidate(['.telelean/subjects/Spyro/layout.json']);
    expect(changes.at(-1)).toEqual({ subjects: ['Spyro'], semantic: false, subjectsListChanged: false });
    sub.dispose();
    ws.dispose();
  });

  it('a read that finishes after a newer one does not overwrite it (latest read wins)', async () => {
    const inbox = 'Model/Spyro/Inbox.lean';
    const disk = fsTextSource(root);
    const original = read(root, inbox);
    let release: (() => void) | undefined;
    let inboxReads = 0;
    const text = {
      read: async (rel: string): Promise<string | null> => {
        if (rel !== inbox) return disk.read(rel);
        inboxReads++;
        if (inboxReads === 2) {
          await new Promise<void>((r) => (release = r)); // slow, and stale by the time it returns
          return original;
        }
        return inboxReads === 3 ? `${original}-- newer\n` : original;
      },
    };
    const parsedInbox: string[] = [];
    const core = {
      ...fakeCore,
      parseLeanFile: (p: string, t: string): ParsedFile => {
        if (p === inbox) parsedInbox.push(t);
        return fakeCore.parseLeanFile(p, t);
      },
    };
    const ws = createModelWorkspace(options(root, { text, core }));
    await ws.load(); // read 1
    const slow = ws.invalidate([inbox]); // read 2 (blocked)
    await waitFor(() => release !== undefined);
    await ws.invalidate([inbox]); // read 3 (newer)
    release?.();
    await slow;
    ws.subjects();
    expect(parsedInbox.at(-1)).toBe(`${original}-- newer\n`);
    ws.dispose();
  });

  describe('with the real core', () => {
    it("graph('Spyro') has the walkthrough's 4 nodes; subjects() lists both", async () => {
      const ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, git: { enabled: false } });
      await ws.load();
      expect(ws.subjects().map((s) => [s.name, s.nodeCount])).toEqual([
        ['Other', 1],
        ['Spyro', 4],
      ]);
      const graph = ws.graph('Spyro');
      expect(graph.nodes.map((n) => n.id).sort()).toEqual(['cynder-dark-past', 'cynder-not-good', 'new-spyro-pg', 'pg-no-dark-past']);
      expect(() => ws.graph('Nope')).toThrow();
      ws.dispose();
    });

    it('TL110: a lakefile without `autoImplicit = false` is a warning on every board, gone once fixed', async () => {
      const original = read(root, 'lakefile.toml');
      const ws = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { enabled: false }, git: { enabled: false } });
      await ws.load();
      expect(ws.graph('Spyro').diagnostics.some((d) => d.code === 'TL110')).toBe(false);
      try {
        write(root, 'lakefile.toml', original.replace('autoImplicit = false\n', ''));
        const changes: string[][] = [];
        ws.onDidChange((c) => changes.push(c.subjects));
        await ws.invalidate(['lakefile.toml']);
        expect(changes.at(-1)).toEqual(['Other', 'Spyro']);
        for (const subject of ['Spyro', 'Other']) {
          expect(ws.graph(subject).diagnostics.find((d) => d.code === 'TL110')).toMatchObject({ severity: 'warning', file: 'lakefile.toml' });
        }
      } finally {
        write(root, 'lakefile.toml', original);
      }
      await ws.invalidate(['lakefile.toml']);
      expect(ws.graph('Spyro').diagnostics.some((d) => d.code === 'TL110')).toBe(false);
      ws.dispose();
    });
  });
});

describe('AT4.9 graph versions', () => {
  let tmp: string;
  let root: string;
  beforeAll(() => {
    tmp = makeTempDir('versions');
    root = makeRoot(tmp);
  });
  afterAll(() => cleanup(tmp));

  it('strictly increase across subjects and across two workspaces created one after the other', async () => {
    const before = Date.now();
    const first: ModelWorkspace = createModelWorkspace(options(root));
    await first.load();
    const v1 = first.graph('Spyro').version;
    const v2 = first.graph('Other').version;
    const v3 = first.graph('Spyro').version;
    expect(v1).toBeGreaterThanOrEqual(before); // seeded from the clock
    expect(v2).toBeGreaterThan(v1);
    expect(v3).toBeGreaterThan(v2);
    first.dispose();

    const second = createModelWorkspace(options(root));
    await second.load();
    const v4 = second.graph('Spyro').version;
    const v5 = second.graph('Spyro').version;
    expect(v4).toBeGreaterThan(v3);
    expect(v5).toBeGreaterThan(v4);
    const burst = Array.from({ length: 200 }, () => second.graph('Other').version);
    for (let i = 1; i < burst.length; i++) expect(burst[i]).toBeGreaterThan(burst[i - 1] ?? 0);
    second.dispose();
  });
});
