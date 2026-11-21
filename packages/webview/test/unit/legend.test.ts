/** Spec v4 BD-9 (slice 1d): the legend's entries, each with a swatch that is not colour alone. */
import { describe, expect, it } from 'vitest';
import { LEGEND_ENTRIES } from '../../src/header/legend';

describe('the legend (BD-9)', () => {
  it('lists declared, verified by Lean, conditional, mismatch, formalised, established, the band and pending proof, in that order', () => {
    expect(LEGEND_ENTRIES.map((e) => [e.key, e.label])).toEqual([
      ['declared', 'declared'],
      ['verified', 'verified by Lean'],
      ['conditional', 'conditional'],
      ['mismatch', 'mismatch'],
      ['formalised', 'formalised'],
      ['established', 'established'],
      ['band', 'these suffice together'],
      ['pending', 'pending proof'],
    ]);
  });

  it('every swatch carries a line pattern or a glyph besides its colour, and every entry explains itself', () => {
    const patterns = new Set(['declared', 'verified', 'conditional', 'mismatch']);
    for (const entry of LEGEND_ENTRIES) {
      expect(patterns.has(entry.key) || (entry.glyph ?? '') !== '', entry.key).toBe(true);
      expect(entry.title.length, entry.key).toBeGreaterThan(20);
    }
    expect(LEGEND_ENTRIES.find((e) => e.key === 'established')?.glyph).toBe('✓');
    expect(LEGEND_ENTRIES.find((e) => e.key === 'band')?.title).toContain('consistency unchecked');
    // TL109 is not a mismatch any more: only a use nobody drew is (BD-5).
    expect(LEGEND_ENTRIES.find((e) => e.key === 'mismatch')?.title).toContain('TL107');
  });
});
