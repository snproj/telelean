import { ActionError, type FileChange } from '@telelean/core';
import type { TextSource } from '@telelean/runner/workspace/index.js';
import { describe, expect, it } from 'vitest';

import {
  applyTextReplacements,
  CheckedEditApplier,
  lineStarts,
  minimalTextEdits,
  planFileOperations,
  positionAt,
  type FileOperation,
  type WorkspaceEditPort,
} from '../../src/logic/editApplier';

const ROOT = '/models/spyro';

/** Applies edit operations with LSP ranges to a text (what VS Code would do with the WorkspaceEdit). */
function applyRanges(text: string, edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; text: string }>): string {
  const starts = lineStarts(text);
  const offset = (p: { line: number; character: number }) => (starts[p.line] ?? text.length) + p.character;
  return applyTextReplacements(
    text,
    edits.map((e) => ({ start: offset(e.range.start), end: offset(e.range.end), text: e.text })),
  );
}

/** A deterministic pseudo-random generator (no flaky tests). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('minimal text edits (FileChange -> WorkspaceEdit, AT5.7)', () => {
  it('replaces only the changed lines and leaves the rest untouched', () => {
    const before = 'import A\n\nnamespace S\n\nend S\n';
    const after = 'import A\n\nnamespace S\n/- block -/\n\nend S\n';
    const edits = minimalTextEdits(before, after);
    // One insertion right after "namespace S\n" (offset 22); nothing else is touched.
    expect(edits).toEqual([{ start: 22, end: 22, text: '/- block -/\n' }]);
    expect(before.slice(0, 22)).toBe('import A\n\nnamespace S\n');
    expect(applyTextReplacements(before, edits)).toBe(after);
  });

  it('is empty for equal texts and turns a delete-then-insert into one replacement', () => {
    expect(minimalTextEdits('a\nb\n', 'a\nb\n')).toEqual([]);
    const edits = minimalTextEdits('a\nold\nc\n', 'a\nnew\nc\n');
    expect(edits).toEqual([{ start: 2, end: 6, text: 'new\n' }]);
  });

  it('round-trips random edits, with CRLF and without a final newline', () => {
    const next = rng(7);
    const words = ['axiom', 'theorem', '/-', '-/', 'abbrev x : Prop := y', '', 'namespace S', 'end S', 'ε → ψ'];
    for (let round = 0; round < 300; round++) {
      const eol = next() < 0.3 ? '\r\n' : '\n';
      const lines = Array.from({ length: Math.floor(next() * 12) }, () => words[Math.floor(next() * words.length)] ?? '');
      const mutated = lines.flatMap((line) => {
        const r = next();
        if (r < 0.15) return [];
        if (r < 0.3) return [line, words[Math.floor(next() * words.length)] ?? ''];
        if (r < 0.4) return [`${line}!`];
        return [line];
      });
      const before = lines.join(eol) + (next() < 0.5 ? eol : '');
      const after = mutated.join(eol) + (next() < 0.5 ? eol : '');
      const edits = minimalTextEdits(before, after);
      expect(applyTextReplacements(before, edits), `round ${round}`).toBe(after);
      for (let i = 1; i < edits.length; i++) expect((edits[i]?.start ?? 0) >= (edits[i - 1]?.end ?? 0)).toBe(true);
    }
  });
});

describe('positions', () => {
  it('counts \\n, \\r\\n and a lone \\r as line ends (as VS Code does), characters in UTF-16 units', () => {
    const text = 'ab\r\ncd\nef\rgh𝔸x';
    const starts = lineStarts(text);
    expect(starts).toEqual([0, 4, 7, 10]);
    expect(positionAt(starts, 0)).toEqual({ line: 0, character: 0 });
    expect(positionAt(starts, 4)).toEqual({ line: 1, character: 0 });
    expect(positionAt(starts, 9)).toEqual({ line: 2, character: 2 });
    expect(positionAt(starts, text.length)).toEqual({ line: 3, character: 5 }); // "gh" + 2 units for 𝔸 + "x"
  });
});

describe('planFileOperations', () => {
  it('creates, deletes and edits; skips no-op changes', () => {
    const changes: FileChange[] = [
      { path: 'Model/Spyro/Inbox.lean', before: null, after: 'namespace Spyro\nend Spyro\n' },
      { path: '.telelean/subjects/Old/layout.json', before: '{}\n', after: null },
      { path: 'Model/Spyro/Main.lean', before: 'a\r\nb\r\nc\r\n', after: 'a\r\nB\r\nc\r\n' },
      { path: 'Model.lean', before: 'import Model.Spyro\n', after: 'import Model.Spyro\n' },
      { path: 'missing.lean', before: null, after: null },
    ];
    const operations = planFileOperations(ROOT, changes);
    expect(operations.map((o) => [o.kind, o.path, o.absPath])).toEqual([
      ['create', 'Model/Spyro/Inbox.lean', `${ROOT}/Model/Spyro/Inbox.lean`],
      ['delete', '.telelean/subjects/Old/layout.json', `${ROOT}/.telelean/subjects/Old/layout.json`],
      ['edit', 'Model/Spyro/Main.lean', `${ROOT}/Model/Spyro/Main.lean`],
    ]);
    const edit = operations[2] as Extract<FileOperation, { kind: 'edit' }>;
    expect(edit.edits).toEqual([{ range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } }, text: 'B\r\n' }]);
    expect(applyRanges('a\r\nb\r\nc\r\n', edit.edits)).toBe('a\r\nB\r\nc\r\n');
  });

  it('refuses paths outside the root', () => {
    expect(() => planFileOperations(ROOT, [{ path: '../elsewhere.lean', before: null, after: 'x' }])).toThrow(/refused/);
    expect(() => planFileOperations(ROOT, [{ path: '/etc/passwd', before: null, after: 'x' }])).toThrow(/refused/);
  });
});

/**
 * A text source over a map, and an editor port that applies operations to the same map. Like VS Code, a refused batch
 * may keep the operations done before the one that failed (`applyOnlyFirst`).
 */
function fakeEditor(files: Record<string, string>) {
  const texts = new Map(Object.entries(files));
  const events: string[] = [];
  const text: TextSource = {
    read: async (path) => {
      events.push(`read ${path}`);
      return texts.get(path) ?? null;
    },
  };
  const applied: FileOperation[][] = [];
  const saved: string[] = [];
  let refuse = false;
  let failSave = false;
  /** The next batch applies only its first n operations, then fails; batches after that are refused outright. */
  let partial: number | undefined;
  let refuseAfterPartial = false;
  const applyOp = (op: FileOperation) => {
    if (op.kind === 'create') texts.set(op.path, op.text);
    else if (op.kind === 'delete') texts.delete(op.path);
    else texts.set(op.path, applyRanges(texts.get(op.path) ?? '', op.edits));
  };
  const port: WorkspaceEditPort = {
    async prepare(absPaths) {
      events.push(...absPaths.map((p) => `prepare ${p}`));
    },
    async apply(operations) {
      if (refuse) return false;
      if (partial !== undefined) {
        operations.slice(0, partial).forEach(applyOp);
        partial = undefined;
        refuse = refuseAfterPartial;
        return false;
      }
      applied.push([...operations]);
      operations.forEach(applyOp);
      return true;
    },
    async save(absPath) {
      saved.push(absPath);
      return !failSave;
    },
  };
  return {
    texts,
    text,
    port,
    applied,
    saved,
    events,
    refuseNext: () => {
      refuse = true;
    },
    failSaves: () => {
      failSave = true;
    },
    applyOnlyFirst: (n: number, thenRefuseEverything = false) => {
      partial = n;
      refuseAfterPartial = thenRefuseEverything;
    },
  };
}

describe('CheckedEditApplier (AT5.7)', () => {
  it('applies whole-file changes as one batch and saves the files it edited in place', async () => {
    const editor = fakeEditor({ 'Model/Spyro/Inbox.lean': 'namespace Spyro\n\nend Spyro\n' });
    const writes: Array<{ absPath: string; text: string | null }> = [];
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port, onWillWrite: (w) => writes.push(...w) });
    await applier.apply(
      [
        { path: 'Model/Spyro/Inbox.lean', before: 'namespace Spyro\n\nend Spyro\n', after: 'namespace Spyro\n\n/- x -/\n\nend Spyro\n' },
        { path: '.telelean/subjects/Spyro/layout.json', before: null, after: '{}\n' },
      ],
      'Add axiom: x',
    );
    expect(editor.applied).toHaveLength(1);
    expect(editor.texts.get('Model/Spyro/Inbox.lean')).toBe('namespace Spyro\n\n/- x -/\n\nend Spyro\n');
    expect(editor.texts.get('.telelean/subjects/Spyro/layout.json')).toBe('{}\n');
    expect(editor.saved).toEqual([`${ROOT}/Model/Spyro/Inbox.lean`]); // created files are written, not saved
    expect(writes.map((w) => w.absPath)).toEqual([`${ROOT}/Model/Spyro/Inbox.lean`, `${ROOT}/.telelean/subjects/Spyro/layout.json`]);
  });

  it('refuses without applying anything when a file differs from `before` (open buffer or disk)', async () => {
    const editor = fakeEditor({ 'a.lean': 'typed by the user\n', 'b.lean': 'b\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    const attempt = applier.apply(
      [
        { path: 'b.lean', before: 'b\n', after: 'B\n' },
        { path: 'a.lean', before: 'original\n', after: 'changed\n' },
      ],
      'Edit sentence: x',
    );
    await expect(attempt).rejects.toBeInstanceOf(ActionError);
    await expect(attempt).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('a.lean changed since telelean planned') });
    expect(editor.applied).toEqual([]);
    expect(editor.texts.get('b.lean')).toBe('b\n');
  });

  it('refuses a create when the file already exists, and a change to a file that does not exist', async () => {
    const editor = fakeEditor({ 'exists.lean': 'x\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    await expect(applier.apply([{ path: 'exists.lean', before: null, after: 'y\n' }], 'create')).rejects.toMatchObject({ code: 'conflict' });
    await expect(applier.apply([{ path: 'gone.lean', before: 'x\n', after: 'y\n' }], 'edit')).rejects.toMatchObject({ code: 'conflict' });
    expect(editor.applied).toEqual([]);
  });

  it('rejects (nothing applied) when the editor refuses the batch', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    editor.refuseNext();
    await expect(applier.apply([{ path: 'a.lean', before: 'a\n', after: 'b\n' }], 'x')).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('nothing was applied'),
    });
    expect(editor.texts.get('a.lean')).toBe('a\n');
  });

  it('opens the documents it edits in place before checking them (VS Code then refuses an edit of a document that changed)', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n', 'b.lean': 'b\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    await applier.apply(
      [
        { path: 'a.lean', before: 'a\n', after: 'A\n' },
        { path: 'new.lean', before: null, after: 'n\n' },
        { path: 'b.lean', before: 'b\n', after: null },
      ],
      'x',
    );
    expect(editor.events.slice(0, 2)).toEqual([`prepare ${ROOT}/a.lean`, 'read a.lean']); // only the in-place edit, first
  });

  it('a save that fails leaves the change applied and recorded: apply resolves and the user is told to save', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n', 'b.lean': 'b\n' });
    editor.failSaves();
    const unsaved: Array<{ paths: readonly string[]; label: string }> = [];
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port, onUnsaved: (paths, label) => unsaved.push({ paths, label }) });
    await applier.apply(
      [
        { path: 'a.lean', before: 'a\n', after: 'A\n' },
        { path: 'b.lean', before: 'b\n', after: 'B\n' },
      ],
      'Edit sentence: x',
    );
    expect(editor.texts.get('a.lean')).toBe('A\n');
    expect(unsaved).toEqual([{ paths: ['a.lean', 'b.lean'], label: 'Edit sentence: x' }]);
  });

  it('a batch the editor applied only in part is changed back, so that nothing is applied', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n', 'gone.lean': 'g\n' });
    const writes: Array<{ absPath: string; text: string | null }> = [];
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port, onWillWrite: (w) => writes.push(...w) });
    editor.applyOnlyFirst(2); // the edit of a.lean and the create happen, the delete fails
    await expect(
      applier.apply(
        [
          { path: 'a.lean', before: 'a\n', after: 'A\n' },
          { path: 'new.lean', before: null, after: 'n\n' },
          { path: 'gone.lean', before: 'g\n', after: null },
        ],
        'Delete: x',
      ),
    ).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('telelean changed a.lean, new.lean back, so nothing was applied') });
    expect(Object.fromEntries(editor.texts)).toEqual({ 'a.lean': 'a\n', 'gone.lean': 'g\n' });
    // The watchers were told about the change back too (its echoes are telelean's own writes).
    expect(writes.slice(-2)).toEqual([
      { absPath: `${ROOT}/a.lean`, text: 'a\n' },
      { absPath: `${ROOT}/new.lean`, text: null },
    ]);
  });

  it('when changing back fails as well, it says exactly which files are left changed', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n', 'b.lean': 'b\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    editor.applyOnlyFirst(1, true);
    await expect(
      applier.apply(
        [
          { path: 'a.lean', before: 'a\n', after: 'A\n' },
          { path: 'b.lean', before: 'b\n', after: 'B\n' },
        ],
        'Edit sentence: x',
      ),
    ).rejects.toMatchObject({ code: 'internal', message: expect.stringMatching(/could not change a\.lean back\. Check that file/) });
    expect(editor.texts.get('a.lean')).toBe('A\n');
  });

  it('refuses paths outside the root and duplicate paths before reading anything', async () => {
    const editor = fakeEditor({});
    let reads = 0;
    const applier = new CheckedEditApplier({ root: ROOT, text: { read: async () => (reads++, null) }, port: editor.port });
    await expect(applier.apply([{ path: '../x.lean', before: null, after: 'x' }], 'x')).rejects.toMatchObject({ code: 'internal' });
    await expect(
      applier.apply(
        [
          { path: 'x.lean', before: null, after: 'x' },
          { path: 'x.lean', before: null, after: 'y' },
        ],
        'x',
      ),
    ).rejects.toMatchObject({ code: 'internal' });
    expect(reads).toBe(0);
    expect(editor.applied).toEqual([]);
  });

  it('does nothing (and calls nothing) for a batch of no-op changes', async () => {
    const editor = fakeEditor({ 'a.lean': 'a\n' });
    const applier = new CheckedEditApplier({ root: ROOT, text: editor.text, port: editor.port });
    await applier.apply([{ path: 'a.lean', before: 'a\n', after: 'a\n' }], 'nothing');
    expect(editor.applied).toEqual([]);
    expect(editor.saved).toEqual([]);
  });
});
