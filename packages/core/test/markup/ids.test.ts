/**
 * AT1.8 — `deriveId`: transliterated slugs of at most 6 words, uniqueness suffixes, a deterministic `n-<6 hex>`
 * (FNV-1a 32 over the UTF-8 bytes of the trimmed sentence) for text without Latin letters, every result matching
 * ID_PATTERN; and id-less blocks in one file get distinct derived ids, each with TL112.
 */
import { describe, expect, it } from 'vitest';
import { deriveId, ID_PATTERN, parseLeanFile } from '../../src/index.js';

const none = () => false;

describe('AT1.8 deriveId', () => {
  it('slugs Latin text, at most 6 words', () => {
    expect(deriveId('Cynder is a character who has a dark past', none)).toBe('cynder-is-a-character-who-has');
    expect(deriveId('PG games cannot have characters with dark pasts', none)).toBe('pg-games-cannot-have-characters-with');
    expect(deriveId('The new Spyro game is PG', none)).toBe('the-new-spyro-game-is-pg');
    expect(deriveId('  42 is -- the answer!  ', none)).toBe('42-is-the-answer');
  });

  it('transliterates accents and undecomposable Latin letters', () => {
    expect(deriveId('Ça déjà vu: Ærø Straße', none)).toBe('ca-deja-vu-aero-strasse');
    expect(deriveId('Ｆｕｌｌ width İstanbul', none)).toBe('full-width-istanbul');
    expect(deriveId('Cynder 是 dragon', none)).toBe('cynder-dragon');
  });

  it('suffixes -2, -3, … until the id is free', () => {
    const taken = new Set(['dark-past', 'dark-past-2']);
    expect(deriveId('Dark past', (id) => taken.has(id))).toBe('dark-past-3');
    expect(deriveId('Dark past', (id) => id === 'dark-past')).toBe('dark-past-2');
  });

  it('falls back to n-<6 hex> of FNV-1a 32 for text with no Latin letters or digits (deterministic)', () => {
    // Reference values computed independently (Python, FNV-1a 32 over UTF-8): 猫は黒い -> 83afc8ea,
    // Ελληνικά -> 36ac4791, the empty string -> 811c9dc5.
    expect(deriveId('猫は黒い', none)).toBe('n-83afc8');
    expect(deriveId('  猫は黒い  ', none)).toBe('n-83afc8');
    expect(deriveId('Ελληνικά', none)).toBe('n-36ac47');
    expect(deriveId('', none)).toBe('n-811c9d');
    expect(deriveId('猫は黒い', (id) => id === 'n-83afc8')).toBe('n-83afc8-2');
    expect(deriveId('!!!', none)).toMatch(/^n-[0-9a-f]{6}$/);
  });

  it('always matches ID_PATTERN', () => {
    const pieces = ['a', 'Z', '9', ' ', '-', '_', '.', 'é', 'ß', '猫', 'λ', '!', '/', '\n', 'Æ', '𝓝', '  '];
    let seed = 99;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i++) {
      let sentence = '';
      for (let j = Math.floor(random() * 12); j > 0; j--) sentence += pieces[Math.floor(random() * pieces.length)] ?? '';
      const id = deriveId(sentence, (candidate) => random() < 0.3 && candidate.length < 40);
      expect(id, JSON.stringify(sentence)).toMatch(ID_PATTERN);
    }
  });
});

describe('AT1.8 derived ids in a file', () => {
  const block = (sentence: string, id?: string) => `/-\n@@ telelean v1\n${id ? `id: ${id}\n` : ''}type: GOAL\nnatural_name: ${sentence}\n-/\n\n`;

  it('two id-less blocks with the same sentence get distinct derived ids, each with TL112', () => {
    const file = parseLeanFile('X.lean', block('Same sentence') + block('Same sentence'));
    expect(file.blocks.map((b) => [b.id, b.idWritten])).toEqual([
      ['same-sentence', false],
      ['same-sentence-2', false],
    ]);
    expect(file.diagnostics.map((d) => [d.code, d.severity, d.nodeId])).toEqual([
      ['TL112', 'info', 'same-sentence'],
      ['TL112', 'info', 'same-sentence-2'],
    ]);
  });

  it('a derived id avoids ids written anywhere in the file', () => {
    const file = parseLeanFile('X.lean', block('Same sentence') + block('Other', 'same-sentence') + block('Same sentence'));
    expect(file.blocks.map((b) => b.id)).toEqual(['same-sentence-2', 'same-sentence', 'same-sentence-3']);
  });
});
