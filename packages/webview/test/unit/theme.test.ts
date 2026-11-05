import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contributedColors, vscodeColorVariable } from '../shared/vscode-theme';

// Declarations only: a name mentioned in a comment must not satisfy the checks.
const css = readFileSync(new URL('../../src/styles/board.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const colors = contributedColors();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The colours of the M0 board. */
const M0_COLOURS = ['telelean.formalizedAura', 'telelean.kindAssumption', 'telelean.kindDerivation', 'telelean.kindGoal'];
/**
 * The colours M1 adds (docs/m1-plan.md 13.1 #19: the extension contributes them; WP5 owns the manifest). The board
 * reads them with fallbacks, so it also works with a manifest that does not contribute them yet.
 */
const M1_COLOURS = ['telelean.vocabulary', 'telelean.highlight'];

describe('contributed theme colours (packages/extension/package.json) and board.css', () => {
  it('the extension contributes the four M0 board colours, and nothing the board does not know', () => {
    const ids = colors.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(M0_COLOURS));
    for (const id of ids) expect([...M0_COLOURS, ...M1_COLOURS]).toContain(id);
  });

  it.each(colors.map((c) => [c.id, c] as const))(
    '%s has exactly one dot, and board.css reads it under the name VS Code gives it, with a fallback',
    (id, color) => {
      // One dot: VS Code replaces only the first dot, so any further dot would stay in the variable name.
      expect(id.split('.')).toHaveLength(2);
      expect(css).toMatch(new RegExp(`var\\(${escapeRe(vscodeColorVariable(id))}, \\S`));
      // A default that is one theme token in every theme (M0 style) is also the harness fallback; explicit
      // per-theme defaults (M1 style: no charts.* tokens) need no particular fallback.
      const defaults = new Set(Object.values(color.defaults));
      const token = color.defaults.dark;
      if (defaults.size === 1 && /^[A-Za-z][\w.]*$/.test(token)) {
        expect(css).toContain(`var(${vscodeColorVariable(id)}, var(${vscodeColorVariable(token)}`);
      }
    },
  );

  it('board.css reads the M1 colours (vocabulary, highlight) with theme-token fallbacks', () => {
    for (const id of M1_COLOURS) expect(css).toMatch(new RegExp(`var\\(${escapeRe(vscodeColorVariable(id))}, var\\(--vscode-[\\w-]+, `));
  });

  it('board.css reads no telelean colour variable that is neither contributed nor an M1 colour', () => {
    const known = new Set([...colors.map((c) => c.id), ...M1_COLOURS].map(vscodeColorVariable));
    const used = new Set(css.match(/--vscode-telelean[\w.\\-]*/g) ?? []);
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(known, name).toContain(name);
  });
});
