import type { EdgeEngine, EdgeEngineStats } from './EdgeEngine';

let current: EdgeEngine | null = null;

/** The live engine, so main.tsx can include its counters in the "rendered" diagnostic. */
export function setCurrentEngine(engine: EdgeEngine | null): void {
  current = engine;
}

export function currentEngineStats(): EdgeEngineStats | null {
  return current ? { ...current.stats } : null;
}

/**
 * The colour a CSS colour expression such as `var(--tl-aura)` computes to on the board, as `rgb(...)`.
 * (A hidden probe element: setting its colour through the CSSOM is allowed by the CSP; style attributes are not.)
 */
export function resolveColor(expression: string): string {
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.color = expression;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/**
 * The board's theme colours as they resolved, including the ones the extension contributes (M0's four, plus M1's
 * `telelean.vocabulary` and `telelean.highlight`, which the VS Code smoke test checks end to end).
 */
export function themeColors(): { aura: string; kindA: string; kindD: string; kindG: string; vocabulary: string; highlight: string; cardAura: string } {
  const card = document.querySelector<HTMLElement>('.tl-card[data-formal="formalized"]');
  let cardAura = '';
  if (card) {
    const style = getComputedStyle(card);
    // High contrast draws the aura as an outline instead of a glow.
    cardAura = style.boxShadow !== 'none' ? style.boxShadow : `outline ${style.outlineColor}`;
  }
  return {
    aura: resolveColor('var(--tl-aura)'),
    kindA: resolveColor('var(--tl-kind-a)'),
    kindD: resolveColor('var(--tl-kind-d)'),
    kindG: resolveColor('var(--tl-kind-g)'),
    vocabulary: resolveColor('var(--tl-vocab)'),
    highlight: resolveColor('var(--tl-highlight)'),
    cardAura,
  };
}

/**
 * Whether webview.css was applied: a refused or missing stylesheet leaves the columns unstyled (no own scrolling,
 * unequal heights) while the cards and arrows still render, which a card count alone would not notice.
 */
export function stylesApplied(): boolean {
  const lists = [...document.querySelectorAll<HTMLElement>('.tl-col__list')];
  return (
    lists.length === 3 &&
    lists.every((list) => getComputedStyle(list).overflowY === 'auto') &&
    new Set(lists.map((list) => list.clientHeight)).size === 1
  );
}
