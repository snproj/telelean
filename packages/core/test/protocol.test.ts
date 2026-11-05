import { describe, expect, it } from 'vitest';
import { parseHostToWebview, parseWebviewToHost, spyroGraph, webviewMessage, hostMessage, LIMITS } from '../src/index.js';
import { createUserNode, slugId, validateGraph, buildGraph } from '../src/index.js';

describe('parseWebviewToHost', () => {
  it('accepts every message type the webview sends', () => {
    const messages = [
      webviewMessage('ready', { lastVersion: null }),
      webviewMessage('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null }),
      webviewMessage('kindChange', { id: 'a', from: 'DERIVATION', to: 'GOAL', beforeId: 'b', requestId: 'r-1', dependents: 'rewrite' }),
      webviewMessage('kindChange', { id: 'a', from: 'GOAL', to: 'ASSUMPTION', beforeId: null, rationale: 'known from the news' }),
      webviewMessage('addNode', { clientId: 'x', type: 'DERIVATION', naturalName: 'Something follows' }),
      webviewMessage('addNode', { clientId: 'y', type: 'ASSUMPTION', naturalName: 'Cats purr', requestId: 'r2', rationale: 'heard it', stance: 'believe', source: 'observed' }),
      webviewMessage('select', { ids: ['a', 'b'] }),
      webviewMessage('theseSuffice', { premises: ['a', 'b'], target: 'g' }),
      webviewMessage('theseSuffice', { premises: [], target: 'g', requestId: 'r3' }),
      webviewMessage('diagnostic', { level: 'info', code: 'rendered', message: '', data: { cards: 4, ok: true } }),
      webviewMessage('editNode', { id: 'a', field: 'naturalName', value: 'A new sentence' }),
      webviewMessage('editNode', { id: 'a', field: 'rationale', value: null, requestId: 'r4' }),
      webviewMessage('editNode', { id: 'a', field: 'stance', value: 'supposing' }),
      webviewMessage('editNode', { id: 'a', field: 'source', value: null }),
      webviewMessage('deleteNode', { id: 'a', keepLean: false }),
      webviewMessage('deleteNode', { id: 'a', keepLean: false, confirmed: true, requestId: 'r7' }),
      webviewMessage('reorder', { id: 'a', column: 'ASSUMPTION', beforeId: 'b' }),
      webviewMessage('undo', {}),
      webviewMessage('redo', { requestId: 'r5' }),
      webviewMessage('selectSubject', { subject: 'Spyro' }),
      webviewMessage('createSubject', { name: 'Bayonetta', requestId: 'r6' }),
      webviewMessage('historyList', { subject: 'Spyro', limit: 50 }),
      webviewMessage('historyPreview', { subject: 'Spyro', entryId: 'abc1234', compare: 'parent' }),
      webviewMessage('historyRevert', { subject: 'Spyro', entryId: 'a'.repeat(40) }),
      webviewMessage('historyPrune', { subject: 'Spyro', keepLast: 20 }),
      webviewMessage('initGit', {}),
      webviewMessage('copyText', { text: 'abbrev x : Prop := True' }),
      webviewMessage('openInEditor', { file: 'Model/Spyro/Main.lean', range: { start: { line: 1, character: 0 }, end: { line: 2, character: 3 } } }),
      webviewMessage('openInEditor', { file: 'Model/Spyro/Main.lean' }),
      webviewMessage('refresh', {}),
    ];
    for (const message of messages) {
      expect(parseWebviewToHost(JSON.parse(JSON.stringify(message)))).toEqual({ ok: true, value: message });
    }
  });

  it('rejects wrong versions, unknown types and malformed payloads', () => {
    const bad: unknown[] = [
      null,
      { v: 2, type: 'ready', payload: { lastVersion: null } },
      { v: 1, type: 'launchMissiles', payload: {} },
      { v: 1, type: 'kindChange', payload: { id: 'a', from: 'ASSUMPTION', to: 'LEMMA', beforeId: null } },
      { v: 1, type: 'kindChange', payload: { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, dependents: 'delete-them' } },
      { v: 1, type: 'select', payload: { ids: 'a' } },
      { v: 1, type: 'theseSuffice', payload: { premises: ['g'], target: 'g' } },
      { v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: 'x'.repeat(LIMITS.textLength + 1) } },
      { v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: 'two\nlines' } },
      { v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: '   ' } },
      { v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: 'x', stance: 'certain' } },
      { v: 1, type: 'diagnostic', payload: { level: 'fatal', code: 'x', message: '' } },
      { v: 1, type: 'editNode', payload: { id: 'a', field: 'premises', value: 'b' } },
      { v: 1, type: 'editNode', payload: { id: 'a', field: 'naturalName', value: null } },
      { v: 1, type: 'editNode', payload: { id: 'a', field: 'source', value: 'rumour' } },
      { v: 1, type: 'deleteNode', payload: { id: 'a', keepLean: 'yes' } },
      { v: 1, type: 'deleteNode', payload: { id: 'a', keepLean: false, confirmed: 'yes' } },
      { v: 1, type: 'reorder', payload: { id: 'a', column: 'ASSUMPTION', beforeId: 'a' } },
      { v: 1, type: 'undo', payload: { requestId: 'has spaces' } },
      { v: 1, type: 'selectSubject', payload: { subject: 'spyro' } },
      { v: 1, type: 'createSubject', payload: { name: '../Evil' } },
      { v: 1, type: 'historyList', payload: { subject: 'Spyro', limit: 0 } },
      { v: 1, type: 'historyPreview', payload: { subject: 'Spyro', entryId: 'HEAD', compare: 'parent' } },
      { v: 1, type: 'historyPreview', payload: { subject: 'Spyro', entryId: 'abc1234', compare: 'yesterday' } },
      { v: 1, type: 'historyPrune', payload: { subject: 'Spyro', keepLast: -1 } },
      { v: 1, type: 'copyText', payload: { text: 'x'.repeat(LIMITS.copyLength + 1) } },
      { v: 1, type: 'openInEditor', payload: { file: '/etc/passwd' } },
      { v: 1, type: 'openInEditor', payload: { file: 'Model/../../secret.lean' } },
      { v: 1, type: 'openInEditor', payload: { file: 'Model\\Spyro.lean' } },
      { v: 1, type: 'openInEditor', payload: { file: 'Model/Spyro.lean', range: { start: { line: -1, character: 0 }, end: { line: 0, character: 0 } } } },
    ];
    for (const raw of bad) {
      const result = parseWebviewToHost(raw);
      expect(result.ok, JSON.stringify(raw)?.slice(0, 120)).toBe(false);
    }
  });

  it('rejects messages the host must not act on: no-op kind changes, repeated ids, reserved data keys', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ v: 1, type: 'kindChange', payload: { id: 'a', from: 'GOAL', to: 'GOAL', beforeId: null } }, /must differ from payload\.from/],
      [{ v: 1, type: 'kindChange', payload: { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: 'a' } }, /must not be the moved card/],
      [{ v: 1, type: 'theseSuffice', payload: { premises: ['a', 'b', 'a'], target: 'g' } }, /lists "a" more than once/],
      [{ v: 1, type: 'select', payload: { ids: ['a', 'a'] } }, /lists "a" more than once/],
      // JSON.parse makes "__proto__" an own key (as the webview channel's structured clone does).
      [JSON.parse('{"v":1,"type":"diagnostic","payload":{"level":"info","code":"x","message":"","data":{"__proto__":"x"}}}'), /"__proto__"/],
      [{ v: 1, type: 'diagnostic', payload: { level: 'info', code: 'x', message: '', data: { ['k'.repeat(65)]: 1 } } }, /keys must be 1 to 64/],
    ];
    for (const [raw, error] of cases) {
      const result = parseWebviewToHost(raw);
      expect(result.ok, JSON.stringify(raw)).toBe(false);
      if (!result.ok) expect(result.error).toMatch(error);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops unknown extra properties and normalises optional text', () => {
    const result = parseWebviewToHost({ v: 1, type: 'select', payload: { ids: ['a'], evil: true }, extra: 1 });
    expect(result).toEqual({ ok: true, value: { v: 1, type: 'select', payload: { ids: ['a'] } } });
    // A blank rationale is no rationale; a whitespace-only rationale edit removes the field.
    expect(parseWebviewToHost({ v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: 'G', rationale: '  ' } })).toEqual({
      ok: true,
      value: { v: 1, type: 'addNode', payload: { clientId: 'x', type: 'GOAL', naturalName: 'G' } },
    });
    expect(parseWebviewToHost({ v: 1, type: 'editNode', payload: { id: 'a', field: 'rationale', value: ' ' } })).toEqual({
      ok: true,
      value: { v: 1, type: 'editNode', payload: { id: 'a', field: 'rationale', value: null } },
    });
  });
});

describe('parseHostToWebview', () => {
  it('accepts a graph message and rejects junk', () => {
    const message = hostMessage('graph', { graph: spyroGraph() });
    expect(parseHostToWebview(JSON.parse(JSON.stringify(message))).ok).toBe(true);
    expect(parseHostToWebview({ v: 1, type: 'graph', payload: { graph: { nodes: [] } } }).ok).toBe(false);
  });

  it('fills the M1 graph fields an older host leaves out', () => {
    const result = parseHostToWebview({ v: 1, type: 'graph', payload: { graph: { version: 1, subject: 'S', nodes: [], edges: [] } } });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'graph') {
      expect(result.value.payload.graph.vocabulary).toEqual([]);
      expect(result.value.payload.graph.diagnostics).toEqual([]);
      expect(result.value.payload.graph.semantic).toEqual({ state: 'unavailable' });
    }
  });

  it('accepts the other host messages', () => {
    const messages = [
      hostMessage('workspace', {
        state: { rootName: 'mental_model', subjects: [{ name: 'Spyro', nodeCount: 4 }], subject: 'Spyro', undo: 'Add assumption: x', redo: null, history: { state: 'no-repo' } },
      }),
      hostMessage('history', {
        listing: {
          subject: 'Spyro',
          entries: [{ id: 'abc1234', time: '2026-11-01T10:00:00Z', action: 'delete-node', label: 'Delete: x', subject: 'Spyro', nodes: ['x'] }],
          storage: { subjectBytes: 1200, totalBytes: 3400, perSubject: { Spyro: 1200 } },
          more: false,
        },
      }),
      hostMessage('actionResult', { requestId: 'r1', outcome: { ok: true, label: 'Delete: x', undoable: true } }),
      hostMessage('actionResult', { requestId: 'r2', outcome: { ok: false, code: 'needs-confirmation', error: 'two proofs use it', dependents: ['a', 'b'] } }),
      hostMessage('notice', { id: 'n1', level: 'info', text: 'Copied', undoable: false }),
    ];
    for (const message of messages) {
      expect(parseHostToWebview(JSON.parse(JSON.stringify(message)))).toEqual({ ok: true, value: message });
    }
    expect(parseHostToWebview({ v: 1, type: 'notice', payload: { id: 'n', level: 'loud', text: '' } }).ok).toBe(false);
    expect(parseHostToWebview({ v: 1, type: 'actionResult', payload: { requestId: 'r', outcome: {} } }).ok).toBe(false);
  });
});

describe('graph helpers', () => {
  it('slugId makes markup-safe unique ids', () => {
    expect(slugId('Spyro would enjoy Cynder!', new Set())).toBe('spyro-would-enjoy-cynder');
    expect(slugId('Spyro would enjoy Cynder!', new Set(['spyro-would-enjoy-cynder']))).toBe('spyro-would-enjoy-cynder-2');
    expect(slugId('???', new Set())).toBe('node');
  });

  it('createUserNode builds a comment-only, informal node', () => {
    const node = createUserNode({ id: 'x', type: 'GOAL', naturalName: 'X', subject: 'S' });
    expect(node.status.formal).toBe('informal');
    expect(node.lean.binding).toBe('none');
    expect(node.provenance.wordedBy).toBe('user');
  });

  it('validateGraph finds dangling premises and cycles', () => {
    const a = { ...createUserNode({ id: 'a', type: 'DERIVATION', naturalName: 'A', subject: 'S' }), premises: ['b'] };
    const b = { ...createUserNode({ id: 'b', type: 'DERIVATION', naturalName: 'B', subject: 'S' }), premises: ['a', 'zzz'] };
    const codes = validateGraph(buildGraph({ subject: 'S', version: 1, nodes: [a, b] })).map((p) => p.code);
    expect(codes).toContain('dangling-premise');
    expect(codes).toContain('premise-cycle');
  });
});
