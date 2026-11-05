/**
 * AT1.5 — `renderBlock` writes the opener, the `@@ telelean v1` marker, the fields in FIELD_ORDER, then `---` and
 * the escaped body, then the closer, with no trailing newline; CRLF when asked; and what it writes parses back.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_ORDER, parseLeanFile, renderBlock, type NewBlock } from '../../src/index.js';

const FULL: NewBlock = {
  id: 'cynder-not-good',
  type: 'GOAL',
  naturalName: 'Cynder would not be a good addition to the new Spyro game',
  rationale: 'why I care: -/ and /- inside',
  stance: 'believe',
  source: 'inferred',
  premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
  asserted: '2026-11-01',
  lean: ['Spyro.cynder_not_good'],
  extra: [
    ['mytool.prio', '3'],
    ['worded_by', 'user'],
    ['origin', 'user'],
    ['tags', 'lore, games'],
  ],
  body: 'Notes with -/ and /- in them.\n\nSecond paragraph.',
};

describe('AT1.5 renderBlock', () => {
  it('writes the marker, the fields in FIELD_ORDER, then the escaped body, then the closer', () => {
    expect(renderBlock(FULL)).toBe(
      [
        '/-',
        '@@ telelean v1',
        'id: cynder-not-good',
        'type: GOAL',
        'natural_name: Cynder would not be a good addition to the new Spyro game',
        'rationale: "why I care: -\\/ and \\u002f- inside"',
        'stance: believe',
        'source: inferred',
        'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past',
        'asserted: 2026-11-01',
        'lean: Spyro.cynder_not_good',
        'tags: lore, games',
        'origin: user',
        'worded_by: user',
        'mytool.prio: 3',
        '---',
        'Notes with -\\/ and /\\- in them.',
        '',
        'Second paragraph.',
        '-/',
      ].join('\n'),
    );
  });

  it('known keys appear in FIELD_ORDER, extensions after them', () => {
    const keys = renderBlock(FULL)
      .split('\n')
      .slice(2)
      .map((line) => /^([a-z_.]+):/.exec(line)?.[1])
      .filter((key): key is string => key !== undefined);
    const known = keys.filter((key) => (FIELD_ORDER as readonly string[]).includes(key));
    expect(known).toEqual([...known].sort((a, b) => FIELD_ORDER.indexOf(a as never) - FIELD_ORDER.indexOf(b as never)));
    expect(keys[keys.length - 1]).toBe('mytool.prio');
  });

  it('writes only what is given: minimal block, empty lists omitted, no body without text', () => {
    expect(renderBlock({ id: 'a', type: 'ASSUMPTION', naturalName: 'x', premises: [], lean: [], body: '  \n ' })).toBe(
      '/-\n@@ telelean v1\nid: a\ntype: ASSUMPTION\nnatural_name: x\n-/',
    );
  });

  it('uses CRLF throughout when eol is CRLF, and no trailing newline', () => {
    const text = renderBlock(FULL, '\r\n');
    expect(text.endsWith('-/')).toBe(true);
    expect(text.split('\r\n')).toEqual(renderBlock(FULL).split('\n'));
    expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    const body = renderBlock({ id: 'a', type: 'GOAL', naturalName: 'x', body: 'one\r\ntwo\nthree' }, '\r\n');
    expect(body).toBe('/-\r\n@@ telelean v1\r\nid: a\r\ntype: GOAL\r\nnatural_name: x\r\n---\r\none\r\ntwo\r\nthree\r\n-/');
  });

  it('parses back to the same fields (LF and CRLF)', () => {
    for (const eol of ['\n', '\r\n'] as const) {
      const file = parseLeanFile('X.lean', `${renderBlock(FULL, eol)}${eol}`);
      expect(file.eol).toBe(eol);
      const block = file.blocks[0];
      expect(block?.fields).toEqual({
        type: 'GOAL',
        naturalName: FULL.naturalName,
        rationale: FULL.rationale,
        stance: 'believe',
        source: 'inferred',
        premises: FULL.premises,
        asserted: '2026-11-01',
        lean: ['Spyro.cynder_not_good'],
        tags: ['lore', 'games'],
        origin: 'user',
        wordedBy: 'user',
      });
      expect(block?.id).toBe('cynder-not-good');
      expect(block?.extensions).toEqual({ 'mytool.prio': ['3'] });
      expect(block?.body).toBe('Notes with -\\/ and /\\- in them.\n\nSecond paragraph.');
      expect(file.diagnostics).toEqual([]);
    }
  });

  it('a NewBlock field wins over the same key in extra; `kind` in extra is dropped; a bad key throws', () => {
    const text = renderBlock({ id: 'a', type: 'GOAL', naturalName: 'x', extra: [['type', 'ASSUMPTION'], ['kind', 'ASSUMPTION'], ['natural_name', 'y']] });
    expect(text).toBe('/-\n@@ telelean v1\nid: a\ntype: GOAL\nnatural_name: x\n-/');
    expect(() => renderBlock({ id: 'a', type: 'GOAL', naturalName: 'x', extra: [['Bad Key', 'v']] })).toThrow(/invalid field key/);
  });
});
