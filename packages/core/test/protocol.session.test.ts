/**
 * Slice 2c1 (docs/slice2-plan.md 2.4, 6.1): the edit session's messages. The host -> webview `session` message and
 * its light check; the ten webview -> host messages, each in RUN_MESSAGE_TYPES, with a hand-written validator that
 * returns a fresh object without unknown fields, and the new LIMITS.
 */
import { describe, expect, it } from 'vitest';
import { hostMessage, LIMITS, parseHostToWebview, parseWebviewToHost, RUN_MESSAGE_TYPES, SESSION_MESSAGE_TYPES, webviewMessage } from '../src/index.js';

const ok = (m: unknown) => expect(parseWebviewToHost(JSON.parse(JSON.stringify(m)))).toEqual({ ok: true, value: m });
const bad = (m: unknown, part: string) => {
  const r = parseWebviewToHost(m);
  expect(r.ok, JSON.stringify(m)).toBe(false);
  if (!r.ok) expect(r.error, JSON.stringify(m)).toContain(part);
};
const raw = (type: string, payload: Record<string, unknown>) => ({ v: 1, type, payload });
const parsed = (type: string, payload: Record<string, unknown>) => {
  const r = parseWebviewToHost(raw(type, payload));
  if (!r.ok) throw new Error(r.error);
  return r.value.payload;
};

const ITEM = 'it0123456789abcdef';
const decide = (decisions: unknown[], extra: Record<string, unknown> = {}) => raw('decideItems', { runId: 'r1', stage: 1, own: false, decisions, ...extra });

describe('the session messages: types and limits', () => {
  it('every one is a run message (the ES-9 lock never refuses it), after M2’s, and every one parses', () => {
    expect([...SESSION_MESSAGE_TYPES]).toEqual(['formalize', 'decideItems', 'revealResult', 'sessionUndo', 'sessionRedo', 'submitReview', 'endSession', 'retryStep', 'openSessionDiff', 'moveProposed']);
    expect(RUN_MESSAGE_TYPES.slice(-SESSION_MESSAGE_TYPES.length)).toEqual([...SESSION_MESSAGE_TYPES]);
    for (const type of SESSION_MESSAGE_TYPES) {
      const r = parseWebviewToHost(raw(type, {}));
      expect(r.ok, type).toBe(false);
      if (!r.ok) expect(r.error, type).not.toContain('unknown message type');
    }
  });

  it('the new LIMITS', () => {
    expect([LIMITS.inferences, LIMITS.decisions, LIMITS.stages, LIMITS.revision]).toEqual([50, 500, 10_000, 1_000_000]);
  });
});

describe('webview -> host: every message round-trips in canonical form', () => {
  it('formalize: a start (no run) and a mid-stage Formalize (runId and stage), one target or a chain', () => {
    ok(webviewMessage('formalize', { inferences: [{ target: 'g', premises: ['a', 'b'] }], requestId: 'f1' }));
    ok(webviewMessage('formalize', { inferences: [{ target: 'g', premises: [] }] }));
    ok(webviewMessage('formalize', { inferences: [{ target: 'l', premises: ['x'] }, { target: 'g', premises: ['l', 'y'] }], runId: 'r_1', stage: 3, requestId: 'f2' }));
    ok(webviewMessage('formalize', { inferences: [{ target: 'g', premises: ['a'] }], runId: 'r1', stage: 0 }));
  });

  it('decideItems: each decision kind with its own fields', () => {
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 1, to: 'accepted' }], requestId: 'd1' }));
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 2, to: 'accepted', holdAs: 'pending', rationale: 'I hold it' }] }));
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 2, to: 'accepted', holdAs: 'axiom' }] }));
    ok(
      webviewMessage('decideItems', {
        runId: 'r1',
        stage: 2,
        own: false,
        confirmed: true,
        decisions: [
          { item: 'ita', rev: 0, to: 'declined', option: 'reject' },
          { item: 'itb', rev: 1, to: 'declined', option: 'shaky', note: 'Ask me about: the rating.\nNot the game.' },
          { item: 'itc', rev: 3, to: 'declined', option: 'plain' },
          { item: 'itd', rev: 4, to: 'declined', option: 'transform' },
          { item: 'ite', rev: 5, to: 'in-review' },
          { item: 'itf', rev: 6, to: 'accepted' },
        ],
      }),
    );
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 1, own: false, confirmed: false, decisions: [{ item: ITEM, rev: 1, to: 'accepted' }] }));
  });

  it('revealResult, sessionUndo, sessionRedo, submitReview, endSession, retryStep, openSessionDiff, moveProposed', () => {
    ok(webviewMessage('revealResult', { runId: 'r1', stage: 1, via: 'show-result', requestId: 'v1' }));
    ok(webviewMessage('revealResult', { runId: 'r1', stage: 1, via: 'activity' }));
    ok(webviewMessage('sessionUndo', { runId: 'r1', step: 0 }));
    ok(webviewMessage('sessionUndo', { runId: 'r1', step: 12, confirmed: true, requestId: 'u1' }));
    ok(webviewMessage('sessionRedo', { runId: 'r1', step: 13, confirmed: false, requestId: 'u2' }));
    ok(webviewMessage('submitReview', { runId: 'r1', stage: 2, requestId: 's1' }));
    ok(webviewMessage('endSession', { runId: 'r1', decision: 'apply', stage: 2, check: 'chk-1', requestId: 'e1' }));
    ok(webviewMessage('endSession', { runId: 'r1', decision: 'back', stage: 2 }));
    ok(webviewMessage('endSession', { runId: 'r1', decision: 'exit', requestId: 'e2' }));
    ok(webviewMessage('retryStep', { runId: 'r1', requestId: 't1' }));
    ok(webviewMessage('openSessionDiff', { runId: 'r1', stage: 1 }));
    ok(webviewMessage('openSessionDiff', { runId: 'r1', stage: 1, confirmed: true, file: 'Model/Spyro/Main.lean', requestId: 'o1' }));
    ok(webviewMessage('moveProposed', { runId: 'r1', positions: { a: { x: 0, y: -12.5 }, 'cynder-not-good': { x: 1e6, y: -1e6 } }, requestId: 'm1' }));
  });

  it('the boundaries: 50 targets, 2000 premises in all, 500 decisions, stage 0 and 10 000, rev and step 0 and 1 000 000', () => {
    const fifty = Array.from({ length: 50 }, (_, k) => ({ target: `t${k}`, premises: [] }));
    ok(webviewMessage('formalize', { inferences: fifty }));
    const premises = (n: number, p: string) => Array.from({ length: n }, (_, k) => `${p}${k}`);
    ok(webviewMessage('formalize', { inferences: [{ target: 'g', premises: premises(1000, 'a') }, { target: 'h', premises: premises(1000, 'b') }] }));
    const decisions = Array.from({ length: 500 }, (_, k) => ({ item: `it${k}`, rev: k, to: 'accepted' as const }));
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 0, own: false, decisions }));
    ok(webviewMessage('decideItems', { runId: 'r1', stage: 10_000, own: true, decisions: [{ item: ITEM, rev: 1_000_000, to: 'accepted' }] }));
    ok(webviewMessage('sessionUndo', { runId: 'r1', step: 1_000_000 }));
    ok(webviewMessage('submitReview', { runId: 'r1', stage: 10_000 }));
  });
});

describe('webview -> host: each malformed case of §2.4 is refused', () => {
  it('formalize', () => {
    bad(raw('formalize', { inferences: [] }), '1 to 50 targets');
    bad(raw('formalize', { inferences: Array.from({ length: 51 }, (_, k) => ({ target: `t${k}`, premises: [] })) }), '1 to 50 targets');
    bad(raw('formalize', { inferences: 'g' }), 'must be an array');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }, { target: 'g', premises: ['a'] }] }), 'more than once');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: ['a', 'g'] }] }), 'must not also be one of its premises');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: ['a', 'a'] }] }), 'more than once');
    bad(raw('formalize', { inferences: [{ target: 'g' }] }), 'premises');
    bad(raw('formalize', { inferences: [{ target: '', premises: [] }] }), 'target');
    const many = (p: string) => Array.from({ length: 1001 }, (_, k) => `${p}${k}`);
    bad(raw('formalize', { inferences: [{ target: 'g', premises: many('a') }, { target: 'h', premises: many('b') }] }), 'more than 2000 premises in all');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], runId: 'r1' }), 'go together');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], stage: 1 }), 'go together');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], runId: 'r1', stage: 10_001 }), 'payload.stage');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], runId: 'r1', stage: -1 }), 'payload.stage');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], runId: 'r1', stage: 1.5 }), 'payload.stage');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], runId: 'bad id', stage: 1 }), 'payload.runId');
    bad(raw('formalize', { inferences: [{ target: 'g', premises: [] }], requestId: 'bad id' }), 'requestId');
  });

  it('decideItems: the counts, `own`, and each field only where it belongs', () => {
    bad(decide([]), '1 to 500 decisions');
    bad(decide(Array.from({ length: 501 }, (_, k) => ({ item: `it${k}`, rev: 0, to: 'accepted' }))), '1 to 500 decisions');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted' }, { item: ITEM, rev: 1, to: 'in-review' }]), 'more than once');
    bad(decide([{ item: 'ita', rev: 0, to: 'accepted' }, { item: 'itb', rev: 0, to: 'accepted' }], { own: true }), 'exactly one decision');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted' }], { own: 'yes' }), 'payload.own');
    bad(raw('decideItems', { runId: 'r1', stage: 1, decisions: [{ item: ITEM, rev: 0, to: 'accepted' }] }), 'payload.own');
    bad(decide([{ item: ITEM, rev: 0, to: 'declined' }]), 'a decline needs one');
    bad(decide([{ item: ITEM, rev: 0, to: 'declined', option: 'maybe' }]), 'option');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', option: 'reject' }]), 'only for a decline');
    bad(decide([{ item: ITEM, rev: 0, to: 'in-review', option: 'plain' }]), 'only for a decline');
    bad(decide([{ item: ITEM, rev: 0, to: 'declined', option: 'reject', note: 'why' }]), 'only for a Shaky decline');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', note: 'why' }]), 'only for a Shaky decline');
    bad(decide([{ item: ITEM, rev: 0, to: 'declined', option: 'shaky', note: 'x'.repeat(LIMITS.textLength + 1) }]), 'longer than');
    bad(decide([{ item: ITEM, rev: 0, to: 'declined', option: 'shaky', holdAs: 'axiom' }]), 'only for an Accept');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'lemma' }]), 'holdAs');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', rationale: 'why' }]), 'only for an Accept with holdAs');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'axiom', rationale: 'two\nlines' }]), 'single line');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'axiom', rationale: 'x'.repeat(LIMITS.textLength + 1) }]), 'longer than');
    for (const rev of [-1, 1_000_001, 1.5, '1', undefined]) bad(decide([{ item: ITEM, rev, to: 'accepted' }]), 'rev');
    bad(decide([{ item: 'it 1', rev: 0, to: 'accepted' }]), 'item');
    bad(decide([{ item: ITEM, rev: 0, to: 'rejected' }]), 'accepted, declined or in-review');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted' }], { confirmed: 'yes' }), 'payload.confirmed');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted' }], { stage: 10_001 }), 'payload.stage');
    bad(decide([{ item: ITEM, rev: 0, to: 'accepted' }], { runId: '' }), 'payload.runId');
  });

  it('decideItems: a blank note or rationale is dropped; a note may span lines', () => {
    expect(parsed('decideItems', { runId: 'r1', stage: 1, own: false, decisions: [{ item: ITEM, rev: 0, to: 'declined', option: 'shaky', note: '  \n ' }] })).toEqual({
      runId: 'r1',
      stage: 1,
      own: false,
      decisions: [{ item: ITEM, rev: 0, to: 'declined', option: 'shaky' }],
    });
    expect(parsed('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'axiom', rationale: '   ' }] })).toEqual({
      runId: 'r1',
      stage: 1,
      own: true,
      decisions: [{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'axiom' }],
    });
    expect((parsed('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 0, to: 'accepted', holdAs: 'pending', rationale: '  mine  ' }] }) as { decisions: unknown }).decisions).toEqual([
      { item: ITEM, rev: 0, to: 'accepted', holdAs: 'pending', rationale: 'mine' },
    ]);
  });

  it('revealResult, sessionUndo, sessionRedo, submitReview, retryStep', () => {
    bad(raw('revealResult', { runId: 'r1', stage: 1, via: 'raw-diff' }), 'payload.via');
    bad(raw('revealResult', { runId: 'r1', stage: 1 }), 'payload.via');
    bad(raw('revealResult', { runId: 'r1', via: 'activity' }), 'payload.stage');
    for (const type of ['sessionUndo', 'sessionRedo']) {
      bad(raw(type, { runId: 'r1' }), 'payload.step');
      bad(raw(type, { runId: 'r1', step: -1 }), 'payload.step');
      bad(raw(type, { runId: 'r1', step: 1_000_001 }), 'payload.step');
      bad(raw(type, { runId: 'r1', step: 1, confirmed: 1 }), 'payload.confirmed');
      bad(raw(type, { step: 1 }), 'payload.runId');
    }
    bad(raw('submitReview', { runId: 'r1' }), 'payload.stage');
    bad(raw('submitReview', { runId: 'r!', stage: 1 }), 'payload.runId');
    bad(raw('retryStep', {}), 'payload.runId');
  });

  it('endSession: apply needs stage and check, back needs stage, exit neither', () => {
    bad(raw('endSession', { runId: 'r1', decision: 'cancel' }), 'payload.decision');
    bad(raw('endSession', { runId: 'r1', decision: 'apply', stage: 1 }), 'payload.check');
    bad(raw('endSession', { runId: 'r1', decision: 'apply', check: 'c1' }), 'payload.stage');
    bad(raw('endSession', { runId: 'r1', decision: 'apply', stage: 1, check: 'c 1' }), 'payload.check');
    bad(raw('endSession', { runId: 'r1', decision: 'back' }), 'payload.stage');
    bad(raw('endSession', { runId: 'r1', decision: 'back', stage: 1, check: 'c1' }), 'only for apply');
    bad(raw('endSession', { runId: 'r1', decision: 'exit', stage: 1 }), 'not for an exit');
    bad(raw('endSession', { runId: 'r1', decision: 'exit', check: 'c1' }), 'not for an exit');
    bad(raw('endSession', { decision: 'exit' }), 'payload.runId');
  });

  it('openSessionDiff and moveProposed', () => {
    bad(raw('openSessionDiff', { runId: 'r1' }), 'payload.stage');
    bad(raw('openSessionDiff', { runId: 'r1', stage: 1, confirmed: 'yes' }), 'payload.confirmed');
    bad(raw('openSessionDiff', { runId: 'r1', stage: 1, file: '../x.lean' }), 'payload.file');
    bad(raw('openSessionDiff', { runId: 'r1', stage: 1, file: '/abs.lean' }), 'payload.file');
    bad(raw('moveProposed', { runId: 'r1', positions: {} }), 'must not be empty');
    bad(raw('moveProposed', { runId: 'r1', positions: JSON.parse('{"__proto__": {"x": 1, "y": 2}}') }), '__proto__');
    bad(raw('moveProposed', { runId: 'r1', positions: { a: { x: Number.POSITIVE_INFINITY, y: 0 } } }), 'finite number');
    bad(raw('moveProposed', { runId: 'r1', positions: { a: { x: 2e6, y: 0 } } }), 'finite number');
    bad(raw('moveProposed', { positions: { a: { x: 0, y: 0 } } }), 'payload.runId');
  });
});

describe('webview -> host: no unknown field survives', () => {
  it('at the payload and inside inferences, decisions and positions', () => {
    expect(parsed('formalize', { inferences: [{ target: 'g', premises: ['a'], extra: 1 }], runId: 'r1', stage: 1, other: true })).toEqual({ inferences: [{ target: 'g', premises: ['a'] }], runId: 'r1', stage: 1 });
    expect(parsed('decideItems', { runId: 'r1', stage: 1, own: true, decisions: [{ item: ITEM, rev: 1, to: 'accepted', sneaky: 'x', hidden: true }], extra: [1] })).toEqual({
      runId: 'r1',
      stage: 1,
      own: true,
      decisions: [{ item: ITEM, rev: 1, to: 'accepted' }],
    });
    expect(parsed('revealResult', { runId: 'r1', stage: 1, via: 'activity', items: ['x'] })).toEqual({ runId: 'r1', stage: 1, via: 'activity' });
    expect(parsed('sessionUndo', { runId: 'r1', step: 3, depth: 1 })).toEqual({ runId: 'r1', step: 3 });
    expect(parsed('sessionRedo', { runId: 'r1', step: 3, state: {} })).toEqual({ runId: 'r1', step: 3 });
    expect(parsed('submitReview', { runId: 'r1', stage: 1, force: true })).toEqual({ runId: 'r1', stage: 1 });
    expect(parsed('endSession', { runId: 'r1', decision: 'exit', keep: true })).toEqual({ runId: 'r1', decision: 'exit' });
    expect(parsed('retryStep', { runId: 'r1', steps: ['s2'] })).toEqual({ runId: 'r1' });
    expect(parsed('openSessionDiff', { runId: 'r1', stage: 1, reveal: ['x'] })).toEqual({ runId: 'r1', stage: 1 });
    expect(parsed('moveProposed', { runId: 'r1', positions: { a: { x: 1, y: 2, z: 3 } }, extra: 1 })).toEqual({ runId: 'r1', positions: { a: { x: 1, y: 2 } } });
  });
});

describe('host -> webview: the `session` light check', () => {
  const view = { runId: 'r1', stage: 1, phase: 'stage', items: [], inferences: [], steps: [], board: { graph: { nodes: [], edges: [] } } };
  it('passes a session through, and null clears it', () => {
    expect(parseHostToWebview(hostMessage('session', { session: null }))).toEqual({ ok: true, value: hostMessage('session', { session: null }) });
    expect(parseHostToWebview({ v: 1, type: 'session', payload: { session: view } })).toEqual({ ok: true, value: { v: 1, type: 'session', payload: { session: view } } });
  });

  it('refuses one without runId, stage or phase, without its arrays, or without a board graph', () => {
    const without = (path: string[], value?: unknown) => {
      const copy = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
      let at = copy;
      for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
      const last = path[path.length - 1] as string;
      if (value === undefined) delete at[last];
      else at[last] = value;
      return { v: 1, type: 'session', payload: { session: copy } };
    };
    const cases: Array<[string[], unknown, string]> = [
      [['runId'], undefined, 'runId, stage and phase'],
      [['stage'], '1', 'runId, stage and phase'],
      [['phase'], undefined, 'runId, stage and phase'],
      [['items'], {}, 'items, inferences and steps'],
      [['inferences'], undefined, 'items, inferences and steps'],
      [['steps'], null, 'items, inferences and steps'],
      [['board'], undefined, 'payload.session.board'],
      [['board', 'graph'], undefined, 'payload.session.board.graph'],
      [['board', 'graph', 'nodes'], {}, 'nodes and edges'],
      [['board', 'graph', 'edges'], undefined, 'nodes and edges'],
    ];
    for (const [path, value, part] of cases) {
      const r = parseHostToWebview(without(path, value));
      expect(r.ok, path.join('.')).toBe(false);
      if (!r.ok) expect(r.error, path.join('.')).toContain(part);
    }
    expect(parseHostToWebview({ v: 1, type: 'session', payload: { session: 'r1' } }).ok).toBe(false);
    expect(parseHostToWebview({ v: 1, type: 'session', payload: {} }).ok).toBe(false);
  });
});
