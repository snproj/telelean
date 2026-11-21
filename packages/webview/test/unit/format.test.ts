import type { SemanticSummary } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { semanticBadge, whyPlaceholder } from '../../src/labels';
import { codeSpans, formatBytes, formatTime, oneLine, pastedLine, plainText, selectionKeyFor, sentences, shortcutFor } from '../../src/model/format';

describe('formatters', () => {
  it('formats history times: HH:MM today, "Mon D HH:MM" otherwise', () => {
    const now = new Date(2026, 10, 1, 15, 0);
    expect(formatTime(new Date(2026, 10, 1, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatTime(new Date(2026, 9, 31, 18, 5).toISOString(), now)).toBe('Oct 31 18:05');
    expect(formatTime(new Date(2025, 0, 2, 7, 0).toISOString(), now)).toBe('Jan 2 2025 07:00');
    expect(formatTime('not a time', now)).toBe('not a time');
  });

  it('formats storage sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024)).toBe('12 KB');
    expect(formatBytes(30 * 1024)).toBe('30 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
    expect(formatBytes(-1)).toBe('?');
  });

  it('keeps the user’s sentence verbatim on one line: trims, turns line breaks into spaces, nothing else', () => {
    expect(oneLine('  Cynder   is\r\nwild \n')).toBe('Cynder   is wild');
    expect(pastedLine('a\nb\r\nc\rd')).toBe('a b c d');
  });

  it('maps Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or Ctrl+Y to redo', () => {
    const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
      key: k,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...mods,
    });
    expect(shortcutFor(key('z', { ctrlKey: true }))).toBe('undo');
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key('z', { metaKey: true }))).toBe('undo');
    expect(shortcutFor(key('y', { ctrlKey: true }))).toBe('redo');
    expect(shortcutFor(key('z'))).toBeNull();
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
    // Spec v4 slice 1b: Escape clears the selection, Delete removes selected arrows; never with a modifier.
    expect(selectionKeyFor(key('Escape'))).toBe('clear');
    expect(selectionKeyFor(key('Delete'))).toBe('delete');
    expect(selectionKeyFor(key('Delete', { shiftKey: true }))).toBeNull();
    expect(selectionKeyFor(key('Escape', { ctrlKey: true }))).toBeNull();
    expect(selectionKeyFor(key('Backspace'))).toBeNull();
    expect(selectionKeyFor(key('z', { ctrlKey: true }))).toBeNull();
  });
});

describe('labels', () => {
  it('the why placeholder follows the stance and kind (D-14)', () => {
    expect(whyPlaceholder('AXIOM', undefined)).toBe('Why do you believe it?');
    expect(whyPlaceholder('AXIOM', 'believe')).toBe('Why do you believe it?');
    expect(whyPlaceholder('AXIOM', 'rule')).toBe('Where does the rule come from?');
    expect(whyPlaceholder('AXIOM', 'supposing')).toBe('What are you exploring?');
    expect(whyPlaceholder('PROPOSITION', 'rule')).toBe('Why do you think it follows?');
    expect(whyPlaceholder('PROPOSITION', undefined)).toBe('Why do you think it follows?');
  });

  it('the Lean badge has a text for every SemanticSummary state', () => {
    const states: Array<[SemanticSummary, string]> = [
      [{ state: 'unavailable' }, 'Lean: not checked yet'],
      [{ state: 'checking' }, 'Lean: checking…'],
      [{ state: 'fresh' }, 'Lean: up to date'],
      [{ state: 'stale', staleFiles: ['Model/Spyro/Main.lean'] }, 'Lean: files changed'],
      [{ state: 'failed', errorCount: 2 }, 'Lean: 2 errors'],
      [{ state: 'failed', detail: 'timeout' }, 'Lean: check failed'],
      [{ state: 'paused-low-memory', detail: '1.2 GB available' }, 'Lean paused: low memory'],
      [{ state: 'unsupported-toolchain', toolchain: 'leanprover/lean4:v4.20.0' }, 'Lean: syntactic mode'],
      [{ state: 'disabled', detail: 'sandbox unavailable: bwrap missing' }, 'Lean: off'],
    ];
    for (const [summary, text] of states) expect(semanticBadge(summary).text).toBe(text);
    expect(semanticBadge({ state: 'disabled', detail: 'sandbox unavailable' }).title).toContain('sandbox unavailable');
  });

  it('the badge tooltip is separate sentences, without backticks', () => {
    expect(semanticBadge({ state: 'paused-low-memory', detail: 'MemAvailable is 35.7 GiB, below the 60.0 GiB threshold' }).title).toBe(
      'Lean checks are paused while little memory is available. MemAvailable is 35.7 GiB, below the 60.0 GiB threshold. Click to check again.',
    );
    expect(semanticBadge({ state: 'failed', detail: 'lake build timed out.' }).title).toBe('The last Lean check did not complete. lake build timed out. Click to check again.');
    expect(semanticBadge({ state: 'disabled', detail: 'add `lake-manifest.json`' }).title).toBe('Lean checking is off. add lake-manifest.json. Click to check again.');
  });
});

describe('messages from core', () => {
  it('splits backtick spans into code; an unmatched backtick stays text', () => {
    expect(codeSpans('TL011 This assumption has no `rationale:` yet')).toEqual([
      { text: 'TL011 This assumption has no ', code: false },
      { text: 'rationale:', code: true },
      { text: ' yet', code: false },
    ]);
    expect(codeSpans('`a` and `b`')).toEqual([
      { text: 'a', code: true },
      { text: ' and ', code: false },
      { text: 'b', code: true },
    ]);
    expect(codeSpans('one ` alone')).toEqual([{ text: 'one ` alone', code: false }]);
    expect(codeSpans('')).toEqual([]);
  });

  it('plain text for tooltips drops the backticks; sentences get their periods', () => {
    expect(plainText('`axiom new_spyro_pg.holds` stays, marked claimed, until you replace it (`theorem new_spyro_pg.holds : … := …`)')).toBe(
      'axiom new_spyro_pg.holds stays, marked claimed, until you replace it (theorem new_spyro_pg.holds : … := …)',
    );
    expect(sentences('A', undefined, 'B.', '  ', 'Done?')).toBe('A. B. Done?');
  });
});
