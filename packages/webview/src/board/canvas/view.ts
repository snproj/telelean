/**
 * The PROPOSITIONS canvas's view (spec v4 BD-3, slice 1c): pure transform math, no DOM. A point `p` of the canvas
 * (the transformed layer's own coordinates, where card positions are stored) shows at viewport-local `t + s·p`
 * (`transform: translate(tx, ty) scale(s)`, origin 0 0). The board's pointer and keyboard handlers, the toolbar and
 * the reveals compute the next transform here; CanvasView applies it.
 */

export interface Point {
  x: number;
  y: number;
}

/** `x`, `y`: the translation (viewport px); `s`: the scale. */
export interface ViewTransform {
  x: number;
  y: number;
  s: number;
}

/** An axis-aligned box: `x`, `y` its top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** BD-3: the zoom range is fixed, about 10 %–400 %. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

export const IDENTITY: ViewTransform = { x: 0, y: 0, s: 1 };

/**
 * Wheel zoom: `s′ = s · exp(−Δ · k)`, Δ the wheel's vertical delta in pixels. A trackpad pinch arrives as Ctrl+wheel
 * with small deltas, so its `k` is larger (docs/slice1-plan.md §3). `lineHeight` converts line-mode deltas
 * (Firefox-style mice); one event never zooms by more than `maxStep` either way.
 */
export const WHEEL_ZOOM = { k: 0.0015, pinchK: 0.012, lineHeight: 16, maxStep: 2 } as const;

/** + and − (keyboard, toolbar) zoom by this factor about the viewport's centre. */
export const KEY_ZOOM = 1.25;

/** The arrow keys pan by this many px (Shift: four times as far). */
export const KEY_PAN = 60;

export function clampScale(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));
}

/**
 * Zooms by `factor` about the viewport point `c`, keeping the canvas point under it fixed:
 * `t′ = c − (c − t) · s′/s`, with `s′` clamped to the zoom range.
 */
export function zoomAbout(view: ViewTransform, c: Point, factor: number): ViewTransform {
  const s = clampScale(view.s * factor);
  const ratio = s / view.s;
  return { x: c.x - (c.x - view.x) * ratio, y: c.y - (c.y - view.y) * ratio, s };
}

/** The zoom factor of one wheel event: below 1 zooms out (wheel towards the user, Δ > 0), above 1 zooms in. */
export function wheelFactor(deltaY: number, deltaMode: number, ctrlKey: boolean, pageHeight = 800): number {
  const unit = deltaMode === 1 ? WHEEL_ZOOM.lineHeight : deltaMode === 2 ? pageHeight : 1;
  const delta = (Number.isFinite(deltaY) ? deltaY : 0) * unit;
  const factor = Math.exp(-delta * (ctrlKey ? WHEEL_ZOOM.pinchK : WHEEL_ZOOM.k));
  return Math.min(WHEEL_ZOOM.maxStep, Math.max(1 / WHEEL_ZOOM.maxStep, factor));
}

export function panBy(view: ViewTransform, dx: number, dy: number): ViewTransform {
  return { x: view.x + dx, y: view.y + dy, s: view.s };
}

/** The canvas point shown at viewport point `p`. */
export function toCanvas(view: ViewTransform, p: Point): Point {
  return { x: (p.x - view.x) / view.s, y: (p.y - view.y) / view.s };
}

/** The viewport point where canvas point `p` shows. */
export function toViewport(view: ViewTransform, p: Point): Point {
  return { x: view.x + view.s * p.x, y: view.y + view.s * p.y };
}

/** A canvas box as it shows in the viewport. */
export function boxOnScreen(view: ViewTransform, box: Box): Box {
  return { x: view.x + view.s * box.x, y: view.y + view.s * box.y, w: box.w * view.s, h: box.h * view.s };
}

/** The smallest box around `boxes`, or null for none. */
export function boundsOf(boxes: Iterable<Box>): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return Number.isFinite(left) ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

export interface FitOptions {
  /** Room kept around the box, in viewport px. */
  margin: number;
  /** Never zoom in beyond this (Fit all on a small board stays at 100 %). */
  maxScale: number;
  /**
   * Never zoom out below this. When the box does not fit at this scale, its top-left corner is shown (at `margin`)
   * instead of its centre, so the first cards are readable.
   */
  minScale: number;
}

export const FIT_ALL: FitOptions = { margin: 32, maxScale: 1, minScale: ZOOM_MIN };

/** The view that shows `box` whole, centred, in a viewport of `size` (see FitOptions). */
export function fitView(box: Box, size: Size, options: FitOptions = FIT_ALL): ViewTransform {
  const room = { w: Math.max(1, size.w - 2 * options.margin), h: Math.max(1, size.h - 2 * options.margin) };
  const fit = Math.min(room.w / Math.max(1, box.w), room.h / Math.max(1, box.h));
  const s = clampScale(Math.min(options.maxScale, Math.max(options.minScale, fit)));
  if (fit < options.minScale) {
    // Too big to fit at the smallest allowed scale: start at the top-left corner.
    return { x: options.margin - s * box.x, y: options.margin - s * box.y, s };
  }
  return { x: size.w / 2 - s * (box.x + box.w / 2), y: size.h / 2 - s * (box.y + box.h / 2), s };
}

/** The view, at scale `s`, that centres `box` in a viewport of `size`. */
export function centerOn(box: Box, size: Size, s: number): ViewTransform {
  const scale = clampScale(s);
  return { x: size.w / 2 - scale * (box.x + box.w / 2), y: size.h / 2 - scale * (box.y + box.h / 2), s: scale };
}

/** A reveal zooms in to this scale when the card would show smaller ("Show on board" and the other reveals). */
export const READABLE_SCALE = 0.75;

/**
 * BD-3 "Show on board and every other reveal pan and zoom the canvas to the card": null when `box` is already whole in
 * view (with `margin`) at a readable scale (nothing moves); otherwise the view that centres it, zoomed to 100 % when the
 * current scale is below READABLE_SCALE.
 */
export function revealView(view: ViewTransform, box: Box, size: Size, margin = 24): ViewTransform | null {
  const shown = boxOnScreen(view, box);
  const whole = shown.x >= margin && shown.y >= margin && shown.x + shown.w <= size.w - margin && shown.y + shown.h <= size.h - margin;
  // A card taller than the viewport is "in view" when its top is.
  const tallEnough = shown.h > size.h - 2 * margin && shown.x >= margin && shown.x + shown.w <= size.w - margin && shown.y >= margin && shown.y < size.h / 3;
  if ((whole || tallEnough) && view.s >= READABLE_SCALE) return null;
  return centerOn(box, size, view.s >= READABLE_SCALE ? view.s : 1);
}

/**
 * BD-3 "the canvas follows the focused card": the smallest pan that brings `box` into view (with `margin`), keeping
 * the zoom; null when it is in view already. A box larger than the viewport shows its top-left corner.
 */
export function followView(view: ViewTransform, box: Box, size: Size, margin = 24): ViewTransform | null {
  const shown = boxOnScreen(view, box);
  const shift = (start: number, length: number, room: number) => {
    if (length > room - 2 * margin) return margin - start; // larger than the viewport: its start at the margin
    if (start < margin) return margin - start;
    if (start + length > room - margin) return room - margin - (start + length);
    return 0;
  };
  const dx = shift(shown.x, shown.w, size.w);
  const dy = shift(shown.y, shown.h, size.h);
  return dx === 0 && dy === 0 ? null : panBy(view, dx, dy);
}

/** + / − / the toolbar's buttons: one zoom step about the viewport's centre. */
export function zoomStep(view: ViewTransform, size: Size, direction: 1 | -1): ViewTransform {
  return zoomAbout(view, { x: size.w / 2, y: size.h / 2 }, direction > 0 ? KEY_ZOOM : 1 / KEY_ZOOM);
}

/** Whether two transforms show the same (within a hundredth of a pixel or of a percent). */
export function sameView(a: ViewTransform, b: ViewTransform): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.s - b.s) < 0.0001;
}

/** A step of an animated view change (`k` from 0 to 1): the scale moves geometrically, the canvas point at the centre linearly. */
export function interpolateView(from: ViewTransform, to: ViewTransform, k: number, size: Size): ViewTransform {
  const t = Math.min(1, Math.max(0, k));
  const c = { x: size.w / 2, y: size.h / 2 };
  const a = toCanvas(from, c);
  const b = toCanvas(to, c);
  const s = from.s * Math.pow(to.s / from.s, t);
  const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return { x: c.x - s * p.x, y: c.y - s * p.y, s };
}
