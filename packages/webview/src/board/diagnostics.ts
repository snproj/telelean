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

/** A card's glow as it computed: its box-shadow, or in high contrast (no shadow) its outline colour; '' without a card. */
function glowOf(card: HTMLElement | null): string {
  if (!card) return '';
  const style = getComputedStyle(card);
  return style.boxShadow !== 'none' ? style.boxShadow : `outline ${style.outlineColor}`;
}

/**
 * The board's theme colours as they resolved, including the ones the extension contributes (the formalised aura, the
 * kind stripes `telelean.kindAxiom` and `telelean.kindProposition` and spec v4's `telelean.proved` green, plus M1's
 * `telelean.vocabulary` and `telelean.highlight`), which the VS Code smoke test checks end to end. `cardAura` is the
 * blue glow of the first formalised card that shows it at full strength (slice 1d: an established card glows green
 * instead, `cardEstablished`, and out-of-date facts dim the blue one).
 */
export function themeColors(): {
  aura: string;
  kindA: string;
  kindP: string;
  proved: string;
  vocabulary: string;
  highlight: string;
  cardAura: string;
  cardEstablished: string;
} {
  return {
    aura: resolveColor('var(--tl-aura)'),
    kindA: resolveColor('var(--tl-kind-a)'),
    kindP: resolveColor('var(--tl-kind-p)'),
    proved: resolveColor('var(--tl-proved)'),
    vocabulary: resolveColor('var(--tl-vocab)'),
    highlight: resolveColor('var(--tl-highlight)'),
    cardAura: glowOf(document.querySelector<HTMLElement>('.tl-card[data-glow="formalized"]:not([data-glow-dim])')),
    cardEstablished: glowOf(document.querySelector<HTMLElement>('.tl-card[data-glow="established"]')),
  };
}

/**
 * Whether webview.css was applied: a refused or missing stylesheet leaves the board unstyled (the AXIOMS column does
 * not scroll on its own, the canvas does not clip, its layer is not positioned) while the cards and arrows still
 * render, which a card count alone would not notice. Spec v4 slice 1c: the AXIOMS column and the PROPOSITIONS canvas.
 */
export function stylesApplied(): boolean {
  const list = document.querySelector<HTMLElement>('.tl-col__list[data-kind="AXIOM"]');
  const canvas = document.querySelector<HTMLElement>('.tl-canvas');
  const layer = canvas?.querySelector<HTMLElement>('.tl-canvas__layer');
  if (!list || !canvas || !layer) return false;
  const clip = getComputedStyle(canvas).overflowX;
  return getComputedStyle(list).overflowY === 'auto' && (clip === 'clip' || clip === 'hidden') && getComputedStyle(layer).position === 'absolute' && canvas.clientHeight > 0;
}

/** The heights of the board's two scrolling parts (the AXIOMS list, the canvas), for the "rendered" diagnostic. */
export function partHeights(): string {
  const list = document.querySelector<HTMLElement>('.tl-col__list[data-kind="AXIOM"]');
  const canvas = document.querySelector<HTMLElement>('.tl-canvas');
  return [list?.clientHeight ?? 0, canvas?.clientHeight ?? 0].join(',');
}
