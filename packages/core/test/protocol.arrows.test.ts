/**
 * Spec v4 slice 1b (docs/slice1-plan.md 2.5): the arrow messages' hand-written validators (addArrows, removeArrows,
 * setFromNothing, claimPending, moveCards): what they accept, what they refuse, and that nothing extra survives. Slice
 * 1f: removeArrows takes the "follows from nothing" marks of the same Delete (`marks`).
 */
import { describe, expect, it } from 'vitest';
import { LIMITS, parseWebviewToHost, webviewMessage } from '../src/index.js';

const parse = (type: string, payload: unknown) => parseWebviewToHost({ v: 1, type, payload });

describe('arrow messages (webview -> host)', () => {
  it('accepts each message, with and without the optional fields, and returns it unchanged', () => {
    const messages = [
      webviewMessage('addArrows', { target: 'g', sources: ['a'] }),
      webviewMessage('addArrows', { target: 'g', sources: ['a', 'b'], confirmed: true, requestId: 'r1' }),
      webviewMessage('removeArrows', { arrows: [{ source: 'a', target: 'g' }] }),
      webviewMessage('removeArrows', { arrows: [{ source: 'a', target: 'g' }, { source: 'b', target: 'g' }, { source: 'a', target: 'h' }], confirmed: false, requestId: 'r2' }),
      // Slice 1f (carry-over 2): one Delete removes arrows and "follows from nothing" marks together; marks alone too.
      webviewMessage('removeArrows', { arrows: [{ source: 'a', target: 'g' }], marks: ['h'], confirmed: true, requestId: 'r6' }),
      webviewMessage('removeArrows', { arrows: [], marks: ['g', 'h'] }),
      webviewMessage('setFromNothing', { id: 'g', on: true }),
      webviewMessage('setFromNothing', { id: 'a', on: false, confirmed: true, requestId: 'r3' }),
      webviewMessage('claimPending', { id: 'g' }),
      webviewMessage('claimPending', { id: 'g', requestId: 'r4' }),
      webviewMessage('moveCards', { positions: { g: { x: 10.5, y: -3 } } }),
      webviewMessage('moveCards', { positions: { g: { x: LIMITS.coordinate, y: -LIMITS.coordinate }, h: { x: 0, y: 0 } }, requestId: 'r5' }),
    ];
    for (const message of messages) expect(parseWebviewToHost(JSON.parse(JSON.stringify(message)))).toEqual({ ok: true, value: message });
  });

  it('refuses malformed payloads', () => {
    const bad: Array<[string, unknown]> = [
      ['addArrows', { target: 'g', sources: [] }],
      ['addArrows', { target: 'g', sources: ['g'] }],
      ['addArrows', { target: 'g', sources: ['a', 'a'] }],
      ['addArrows', { target: '', sources: ['a'] }],
      ['addArrows', { target: 'g', sources: 'a' }],
      ['addArrows', { target: 'g', sources: [7] }],
      ['addArrows', { target: 'g', sources: ['x'.repeat(LIMITS.idLength + 1)] }],
      ['addArrows', { target: 'g', sources: Array.from({ length: LIMITS.listLength + 1 }, (_, i) => `n${i}`) }],
      ['addArrows', { target: 'g', sources: ['a'], confirmed: 'yes' }],
      ['addArrows', { target: 'g', sources: ['a'], requestId: 'not valid!' }],
      ['removeArrows', { arrows: [] }],
      ['removeArrows', { arrows: [{ source: 'a', target: 'a' }] }],
      ['removeArrows', { arrows: [{ source: 'a', target: 'g' }, { source: 'a', target: 'g' }] }],
      ['removeArrows', { arrows: [{ source: 'a' }] }],
      ['removeArrows', { arrows: [['a', 'g']] }],
      ['removeArrows', { arrows: Array.from({ length: LIMITS.listLength + 1 }, (_, i) => ({ source: `s${i}`, target: 'g' })) }],
      ['removeArrows', { arrows: [], marks: [] }],
      ['removeArrows', { marks: ['g'] }],
      ['removeArrows', { arrows: [], marks: 'g' }],
      ['removeArrows', { arrows: [], marks: [7] }],
      ['removeArrows', { arrows: [{ source: 'a', target: 'g' }], marks: ['h', 'h'] }],
      ['removeArrows', { arrows: [], marks: Array.from({ length: LIMITS.listLength + 1 }, (_, i) => `m${i}`) }],
      ['setFromNothing', { id: 'g' }],
      ['setFromNothing', { id: 'g', on: 'true' }],
      ['setFromNothing', { id: '', on: true }],
      ['claimPending', { id: 3 }],
      ['claimPending', {}],
      ['moveCards', { positions: {} }],
      ['moveCards', { positions: [] }],
      ['moveCards', { positions: { g: { x: 1 } } }],
      ['moveCards', { positions: { g: { x: '1', y: 2 } } }],
      ['moveCards', { positions: { g: { x: Number.POSITIVE_INFINITY, y: 2 } } }],
      ['moveCards', { positions: { g: { x: LIMITS.coordinate + 1, y: 2 } } }],
      ['moveCards', { positions: { g: [1, 2] } }],
      ['moveCards', { positions: JSON.parse('{"__proto__": {"x": 1, "y": 2}}') as unknown }],
      ['moveCards', { positions: { ['x'.repeat(LIMITS.idLength + 1)]: { x: 1, y: 2 } } }],
    ];
    for (const [type, payload] of bad) {
      const result = parse(type, payload);
      expect(result.ok, `${type} ${JSON.stringify(payload)}`).toBe(false);
    }
    // NaN does not survive JSON, but a structured clone keeps it.
    expect(parse('moveCards', { positions: { g: { x: Number.NaN, y: 2 } } }).ok).toBe(false);
  });

  it('drops unknown properties (in the payload, in each arrow and in each position)', () => {
    expect(parse('addArrows', { target: 'g', sources: ['a'], extra: 1 })).toEqual({ ok: true, value: webviewMessage('addArrows', { target: 'g', sources: ['a'] }) });
    expect(parse('removeArrows', { arrows: [{ source: 'a', target: 'g', kind: 'premise' }] })).toEqual({
      ok: true,
      value: webviewMessage('removeArrows', { arrows: [{ source: 'a', target: 'g' }] }),
    });
    expect(parse('moveCards', { positions: { g: { x: 1, y: 2, z: 3 } } })).toEqual({ ok: true, value: webviewMessage('moveCards', { positions: { g: { x: 1, y: 2 } } }) });
    expect(parse('claimPending', { id: 'g', on: true })).toEqual({ ok: true, value: webviewMessage('claimPending', { id: 'g' }) });
  });
});
