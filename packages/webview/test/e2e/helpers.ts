import { expect, type Locator, type Page } from '@playwright/test';
import type { ActionOutcome, HistoryListing, HostToWebviewMessage, ProposalView, RunView, TlGraph, WebviewToHostMessage, WorkspaceState } from '@telelean/core';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Theme = 'light' | 'dark' | 'hc';

/** Screenshots land in packages/webview/test-results/ (or in $TELELEAN_TEST_RESULTS, e.g. a scratch folder). */
export const shotPath = (name: string) =>
  process.env['TELELEAN_TEST_RESULTS'] ? join(process.env['TELELEAN_TEST_RESULTS'], name) : fileURLToPath(new URL(`../../test-results/${name}`, import.meta.url));

export interface HarnessConfig {
  graph: TlGraph;
  vars?: Record<string, string>;
  workspace?: WorkspaceState;
  history?: HistoryListing;
  autoReply?: boolean;
  /** M2: sent after the graph, as the extension does on `ready`. */
  run?: RunView;
  proposal?: ProposalView;
}

declare global {
  interface Window {
    __TL_HARNESS__?: HarnessConfig;
    __tlHarness: {
      posted: WebviewToHostMessage[];
      replies: Array<{ type: string; outcome: ActionOutcome }>;
      sendToWebview(message: unknown): void;
    };
    __tlCsp: string[];
    /** Set by watchAttribute(): selectors that ever carried the watched attribute. */
    __tlSeen?: Record<string, boolean>;
  }
}

export interface OpenedBoard {
  /** Console errors, page errors and CSP violations seen so far. */
  problems(): Promise<string[]>;
}

export interface OpenOptions {
  /** Extra CSS variables by full name (harness.js applies them after the theme's). */
  vars?: Record<string, string>;
  /** Sent after "ready", before the graph (as the extension does). */
  workspace?: WorkspaceState;
  /** The harness's answer to historyList. */
  history?: HistoryListing;
  /** false: the harness sends no actionResults (the test does). */
  autoReply?: boolean;
  /** Webview state before the page loads (e.g. { vocabCollapsed: false }). */
  state?: Record<string, unknown>;
  /** M2: the root's run and its proposal, sent after the graph (the `run` and `proposal` messages). */
  run?: RunView;
  proposal?: ProposalView;
  /**
   * M2: pins the page's clock (Date.now) to this time, so the run panel's agent clock (which runs on between host
   * updates) shows exactly the fixture's figures. Timers keep running.
   */
  clock?: string;
}

export async function openBoard(page: Page, graph: TlGraph, theme: Theme = 'dark', options: OpenOptions = {}): Promise<OpenedBoard> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  const config: HarnessConfig = {
    graph,
    vars: options.vars ?? {},
    ...(options.workspace ? { workspace: options.workspace } : {}),
    ...(options.history ? { history: options.history } : {}),
    ...(options.autoReply === false ? { autoReply: false } : {}),
    ...(options.run ? { run: options.run } : {}),
    ...(options.proposal ? { proposal: options.proposal } : {}),
  };
  if (options.clock) await page.clock.setFixedTime(new Date(options.clock));
  await page.addInitScript(
    ({ c, state }: { c: HarnessConfig; state: Record<string, unknown> | null }) => {
      window.__TL_HARNESS__ = c;
      window.__tlCsp = [];
      // Seed the webview state once per tab (a reload keeps whatever the board stored since).
      if (state && sessionStorage.getItem('tl-harness-seeded') === null) {
        sessionStorage.setItem('tl-harness-webview-state', JSON.stringify(state));
        sessionStorage.setItem('tl-harness-seeded', '1');
      }
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__tlCsp.push(`${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`);
      });
    },
    { c: config, state: options.state ?? null },
  );
  await page.goto(`/harness/index.html?theme=${theme}`);
  await expect(page.locator('[data-node-id]')).toHaveCount(graph.nodes.length);
  await settle(page);
  return {
    problems: async () => [...errors, ...(await page.evaluate(() => window.__tlCsp.map((v) => `csp: ${v}`)))],
  };
}

/** Delivers a host message to the board, as the extension would. */
export async function send(page: Page, message: HostToWebviewMessage): Promise<void> {
  await page.evaluate((m) => window.__tlHarness.sendToWebview(m), message);
  await settle(page);
}

/** Queues the harness's next answer to a message type (instead of "ok"). */
export async function replyNext(page: Page, type: WebviewToHostMessage['type'], outcome: ActionOutcome): Promise<void> {
  await page.evaluate(({ t, o }) => window.__tlHarness.replies.push({ type: t, outcome: o }), { t: type, o: outcome });
}

/** Two animation frames: React has committed and the edge engine has drawn. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function posted(page: Page): Promise<WebviewToHostMessage[]> {
  return page.evaluate(() => window.__tlHarness.posted);
}

export async function postedOfType<T extends WebviewToHostMessage['type']>(page: Page, type: T) {
  return (await posted(page)).filter((m): m is Extract<WebviewToHostMessage, { type: T }> => m.type === type);
}

/** The latest "rendered" diagnostic the board posted (waits for the first one). */
export async function renderedDiagnostic(page: Page) {
  const rendered = async () => (await postedOfType(page, 'diagnostic')).filter((m) => m.payload.code === 'rendered');
  await expect.poll(async () => (await rendered()).length).toBeGreaterThan(0);
  const last = (await rendered()).at(-1);
  if (!last) throw new Error('no rendered diagnostic');
  return last;
}

/** Starts recording whether any element matching `selector` ever carries `attribute` (read with seenAttribute). */
export async function watchAttribute(page: Page, selector: string, attribute: string): Promise<void> {
  await page.evaluate(
    ({ selector, attribute }) => {
      const key = `${selector}[${attribute}]`;
      const seen = (window.__tlSeen ??= {});
      seen[key] = document.querySelector(`${selector}[${attribute}]`) !== null;
      new MutationObserver(() => {
        if (document.querySelector(`${selector}[${attribute}]`)) seen[key] = true;
      }).observe(document.body, { attributes: true, subtree: true, attributeFilter: [attribute] });
    },
    { selector, attribute },
  );
}

export async function seenAttribute(page: Page, selector: string, attribute: string): Promise<boolean> {
  return page.evaluate((key) => window.__tlSeen?.[key] === true, `${selector}[${attribute}]`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The board's parts (spec v4 BD-1, slice 1c): the AXIOMS column (a scrolling list) and the PROPOSITIONS canvas (a
// viewport with one transformed layer); the Vocabulary and Definitions columns above them.

export type Kind = 'AXIOM' | 'PROPOSITION';

export function card(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"]`);
}

/** The cards of a kind: the AXIOMS column's list, or the canvas's layer. */
export function list(page: Page, kind: Kind) {
  return kind === 'AXIOM' ? page.locator('.tl-col__list[data-kind="AXIOM"]') : page.locator('.tl-canvas__layer');
}

/** The PROPOSITIONS canvas's viewport (it takes the keyboard focus; the view's transform is set on it). */
export function canvas(page: Page) {
  return page.locator('.tl-canvas');
}

/** The ids of the cards of a kind, in DOM order (the column's order; the canvas's reading order). */
export function order(page: Page, kind: Kind): Promise<string[]> {
  return list(page, kind)
    .locator('[data-node-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id') ?? '?'));
}

/** A point in the AXIOMS column's list: near its bottom (below the cards of a small board) unless given. */
export async function columnPoint(page: Page, fromBottom = 60): Promise<{ x: number; y: number }> {
  const box = await list(page, 'AXIOM').boundingBox();
  if (!box) throw new Error('no AXIOMS column');
  return { x: box.x + box.width / 2, y: box.y + box.height - fromBottom };
}

/** A point on the canvas: `fx`, `fy` are fractions of its width and height (default: its middle). */
export async function canvasPoint(page: Page, fx = 0.5, fy = 0.5): Promise<{ x: number; y: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** The canvas's view as the board wrote it on the viewport: the translation (px) and the scale. */
export async function canvasView(page: Page): Promise<{ x: number; y: number; s: number }> {
  return canvas(page).evaluate((el) => ({
    x: Number.parseFloat(el.style.getPropertyValue('--tl-tx') || '0'),
    y: Number.parseFloat(el.style.getPropertyValue('--tl-ty') || '0'),
    s: Number.parseFloat(el.style.getPropertyValue('--tl-s') || '1'),
  }));
}

/** The canvas point (layer coordinates) shown at a client point, by the view the board wrote. */
export async function canvasPointAt(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const view = await canvasView(page);
  const origin = await canvas(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft, y: r.top + el.clientTop };
  });
  return { x: (at.x - origin.x - view.x) / view.s, y: (at.y - origin.y - view.y) / view.s };
}

/** Waits until the canvas's view stops changing (reveals and Fit all ease over 180 ms). */
export async function viewSettled(page: Page): Promise<{ x: number; y: number; s: number }> {
  let last = await canvasView(page);
  for (let i = 0; i < 40; i++) {
    await settle(page);
    const next = await canvasView(page);
    if (Math.abs(next.x - last.x) < 0.01 && Math.abs(next.y - last.y) < 0.01 && Math.abs(next.s - last.s) < 0.0001) return next;
    last = next;
  }
  return last;
}

/**
 * Drags a card by its sentence (the face is the drag handle; presses on buttons, fields and the code never drag; the
 * arrow handle sits at the right edge, far from the press) to a point, with real mouse input. A column card is
 * dragged by pragmatic-drag-and-drop (the column's re-order, and its drop zones); a canvas card by the board's
 * pointer handlers (a move, or "Move to axioms" over the column).
 */
export async function dragCard(page: Page, id: string, to: { x: number; y: number }, beforeDrop?: () => Promise<void>): Promise<void> {
  const text = card(page, id).locator('.tl-card__text');
  if ((await card(page, id).getAttribute('data-place')) === 'column') await text.scrollIntoViewIfNeeded();
  const from = await text.boundingBox();
  if (!from) throw new Error(`card ${id} has no box`);
  const start = { x: from.x + Math.min(40, from.width / 2), y: from.y + Math.min(8, from.height / 2) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 10, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  if (beforeDrop) await beforeDrop();
  await page.mouse.up();
  await settle(page);
}

/** The arrow handle of a card (AR-1), shown while the card is hovered: its centre, after hovering the card. */
export async function handleOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  await card(page, id).locator('.tl-card__text').hover();
  const handle = card(page, id).locator(':scope > .tl-handle');
  await expect(handle).toHaveCSS('opacity', '1');
  const box = await handle.boundingBox();
  if (!box) throw new Error(`card ${id} has no handle`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Draws an arrow from card `source`'s handle to a point inside card `target` (its sentence), with real mouse input.
 * `beforeRelease` runs while the rubber band is over the target (the hint and the outline are there to check).
 */
export async function drawArrow(page: Page, source: string, target: string, beforeRelease?: () => Promise<void>): Promise<void> {
  const from = await handleOf(page, source);
  const into = await card(page, target).locator('.tl-card__text').boundingBox();
  if (!into) throw new Error(`card ${target} has no box`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 6, { steps: 3 });
  await page.mouse.move(into.x + Math.min(30, into.width / 2), into.y + into.height / 2, { steps: 12 });
  await settle(page);
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
  await settle(page);
}

/** A drawn arrow's visible path (`${source}->${target}`), and its wide hit path (what takes the pointer). */
export function arrowPath(page: Page, source: string, target: string) {
  return page.locator(`path[data-edge-id="${source}->${target}"]`);
}
export function arrowHit(page: Page, source: string, target: string) {
  return page.locator(`path.tl-edge-hit[data-hit-edge="${source}->${target}"]`);
}

/** A point on a drawn arrow, `at` of the way along it (client coordinates), inside the part that shows. */
export async function pointOnArrow(page: Page, source: string, target: string, at = 0.5): Promise<{ x: number; y: number }> {
  return arrowPath(page, source, target).evaluate((path, k) => {
    const p = path as SVGPathElement;
    const svg = p.ownerSVGElement;
    const origin = svg?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const point = p.getPointAtLength(p.getTotalLength() * k);
    return { x: origin.left + point.x, y: origin.top + point.y };
  }, at);
}

/**
 * Clicks a drawn arrow (Ctrl/Cmd adds to the selection when `additive`), with real mouse input, `at` of the way along it
 * (nearer its source by default, where arrows into one card are still apart).
 */
export async function clickArrow(page: Page, source: string, target: string, additive = false, at = 0.3): Promise<void> {
  const point = await pointOnArrow(page, source, target, at);
  if (additive) await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(point.x, point.y);
  if (additive) await page.keyboard.up('ControlOrMeta');
  await settle(page);
}

/** A right click without movement (CM-7) at a point: press and release the right button where the pointer is. */
export async function rightClick(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await settle(page);
}

/** A right-button drag (A21: it pans the canvas) from one point to another, with real mouse input. */
export async function rightDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await settle(page);
}

/** The board's right-click menu (CM-7), and one of its entries by `data-action`. */
export function boardMenu(page: Page) {
  return page.getByTestId('board-menu');
}
export function menuItem(page: Page, action: string): Locator {
  return boardMenu(page).locator(`[data-action="${action}"]`);
}

/** The Context Menu section of the toolbar (CM-1–CM-5). */
export function contextSection(page: Page) {
  return page.getByTestId('context-menu');
}

/** The centre of a card's sentence (a safe place to click or right-click it: no button, no handle). */
export async function cardPoint(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await card(page, id).locator('.tl-card__text').boundingBox();
  if (!box) throw new Error(`card ${id} has no box`);
  return { x: box.x + Math.min(30, box.width / 2), y: box.y + box.height / 2 };
}

/**
 * Pans the canvas with the arrow keys (the canvas focused) until `target`, inside a canvas card, lies inside the canvas's
 * viewport. The viewport clips (it never scrolls), so Playwright's own scrolling cannot bring an expanded card's lower
 * part into view.
 */
export async function panToShow(page: Page, target: Locator): Promise<void> {
  await canvas(page).focus();
  for (let i = 0; i < 40; i++) {
    const t = await target.boundingBox();
    const c = await canvas(page).boundingBox();
    if (!t || !c) throw new Error('no box');
    if (t.y + t.height > c.y + c.height - 8) await page.keyboard.press('ArrowDown');
    else if (t.y < c.y + 8) await page.keyboard.press('ArrowUp');
    else if (t.x + t.width > c.x + c.width - 8) await page.keyboard.press('ArrowRight');
    else if (t.x < c.x + 8) await page.keyboard.press('ArrowLeft');
    else return;
    await settle(page);
  }
  throw new Error('could not pan the target into view');
}

/** Whether an element lies fully inside the visible part of what scrolls or clips it (the column, a band column, the canvas). */
export async function inView(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const box = el.closest('.tl-col__list, .tl-vcol__list, .tl-canvas');
    if (!box || r.height === 0) return false;
    const v = box.getBoundingClientRect();
    return r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.left >= v.left - 1 && r.right <= v.right + 1;
  });
}

/** The AXIOMS column list's scroll position. */
export async function columnScroll(page: Page): Promise<number> {
  return list(page, 'AXIOM').evaluate((el) => el.scrollTop);
}

export interface ArrowReport {
  drawn: number;
  full: number;
  stubs: number;
  /** Geometry violations: ends off the card edges, full arrows to hidden cards, stubs between visible cards. */
  problems: string[];
  /** Pairs that should be drawn (both cards clearly visible: full arrow; one: cut at an edge) but are not drawn that way. */
  missing: string[];
}

/**
 * Checks every drawn arrow against the real card boxes (spec v4 BD-4, slices 1c–1d): each end of a full arrow lies on
 * the left or right edge of its card (within `tolerance` px) and inside the card's vertical extent; an arrow with an end
 * out of view (`data-stub`: which end shows) starts or ends on the visible card's left or right edge, and exists only
 * while the other card is out of view (scrolled out of the AXIOMS column, or outside the canvas's viewport).
 */
export async function checkArrows(page: Page, pairs: Array<{ source: string; target: string }>, tolerance = 2): Promise<ArrowReport> {
  // The engine redraws at most once per frame after a view change, a scroll or a resize: let it draw first.
  await settle(page);
  return page.evaluate(
    ({ pairs, tolerance }) => {
      const svg = document.querySelector('svg.tl-edges');
      if (!svg) return { drawn: 0, full: 0, stubs: 0, problems: ['no overlay svg'], missing: [] };
      const origin = svg.getBoundingClientRect();
      const column = document.querySelector('.tl-col__list[data-kind="AXIOM"]')?.getBoundingClientRect();
      const viewport = document.querySelector('.tl-canvas')?.getBoundingClientRect();
      const box = (id: string) => {
        const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
        if (!el) return null;
        const part = el.closest('.tl-col__list') ? 'column' : el.closest('.tl-canvas__layer') ? 'canvas' : null;
        const view = part === 'column' ? column : part === 'canvas' ? viewport : undefined;
        if (!part || !view) return null;
        const rect = el.getBoundingClientRect();
        const h = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
        const w = Math.min(rect.right, view.right) - Math.max(rect.left, view.left);
        // How much of it shows: its visible height (and, on the canvas, its visible width too).
        const visible = part === 'column' ? h : Math.min(h, w);
        return { rect, visible, part };
      };
      type Box = NonNullable<ReturnType<typeof box>>;
      type Pt = { x: number; y: number };
      const onEdge = (p: Pt, card: Box) => {
        const r = card.rect;
        const side = Math.abs(p.x - r.left) <= tolerance || Math.abs(p.x - r.right) <= tolerance;
        return side && p.y >= r.top - tolerance && p.y <= r.bottom + tolerance;
      };
      const fmt = (p: Pt) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
      const fmtRect = (r: DOMRect) => `[x ${r.left.toFixed(1)}..${r.right.toFixed(1)}, y ${r.top.toFixed(1)}..${r.bottom.toFixed(1)}]`;

      const problems: string[] = [];
      const drawn = new Map<string, 'full' | 'stub'>();
      let full = 0;
      let stubs = 0;
      const paths = [...document.querySelectorAll<SVGPathElement>('svg.tl-edges path[data-edge-id]')];
      for (const path of paths) {
        const id = path.dataset.edgeId ?? '?';
        const n = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
        if (n.length < 4) {
          problems.push(`${id}: bad path`);
          continue;
        }
        const start = { x: origin.left + (n[0] ?? 0), y: origin.top + (n[1] ?? 0) };
        const end = { x: origin.left + (n[n.length - 2] ?? 0), y: origin.top + (n[n.length - 1] ?? 0) };
        const s = box(path.dataset.source ?? '');
        const t = box(path.dataset.target ?? '');
        if (!s || !t) {
          problems.push(`${id}: card not on the board`);
          continue;
        }
        const stub = path.dataset.stub;
        if (!stub) {
          full++;
          drawn.set(`${path.dataset.source}->${path.dataset.target}`, 'full');
          if (!onEdge(start, s)) problems.push(`${id}: start ${fmt(start)} not on a side edge of the source ${fmtRect(s.rect)}`);
          if (!onEdge(end, t)) problems.push(`${id}: end ${fmt(end)} not on a side edge of the target ${fmtRect(t.rect)}`);
          if (s.visible < 4 || t.visible < 4) problems.push(`${id}: full arrow although a card is out of view`);
        } else {
          stubs++;
          drawn.set(`${path.dataset.source}->${path.dataset.target}`, 'stub');
          const visibleCard = stub === 'source' ? s : t;
          const awayCard = stub === 'source' ? t : s;
          const atCard = stub === 'source' ? start : end;
          if (!onEdge(atCard, visibleCard)) problems.push(`${id}: cut arrow ${fmt(atCard)} not on a side edge of the visible card ${fmtRect(visibleCard.rect)}`);
          if (awayCard.visible > 12) problems.push(`${id}: cut although the other card is in view (${awayCard.visible.toFixed(1)} px)`);
        }
      }
      const missing: string[] = [];
      for (const { source, target } of pairs) {
        const s = box(source);
        const t = box(target);
        if (!s || !t) continue;
        const key = `${source}->${target}`;
        const sOn = s.visible >= 12;
        const tOn = t.visible >= 12;
        const sOff = s.visible <= 4;
        const tOff = t.visible <= 4;
        if (sOn && tOn && drawn.get(key) !== 'full') missing.push(`${key}: expected a full arrow, got ${drawn.get(key) ?? 'nothing'}`);
        if (((sOn && tOff) || (sOff && tOn)) && drawn.get(key) !== 'stub') missing.push(`${key}: expected a cut arrow, got ${drawn.get(key) ?? 'nothing'}`);
        if (sOff && tOff && drawn.has(key)) missing.push(`${key}: both cards out of view but drawn`);
      }
      return { drawn: paths.length, full, stubs, problems, missing };
    },
    { pairs, tolerance },
  );
}

/** The (source, target) pairs the overlay should draw for a graph: declared and verified merged, into propositions only. */
export function edgePairs(graph: TlGraph): Array<{ source: string; target: string }> {
  const kinds = new Map(graph.nodes.map((n) => [n.id, n.type]));
  const seen = new Map<string, { source: string; target: string }>();
  for (const e of graph.edges) {
    // An old axiom's premises (declared before v4, A19) are not drawn.
    if (e.type === 'lean-ref' || (e.type === 'premise' && kinds.get(e.target) === 'AXIOM')) continue;
    seen.set(`${e.source}->${e.target}`, { source: e.source, target: e.target });
  }
  return [...seen.values()];
}

export interface BadgeReport {
  /** Visible "n linked" buttons, as `column:up|down` or `canvas:left|top|right|bottom`, with the count they show. */
  badges: Array<{ key: string; count: number }>;
  /** Hidden ends of the drawn cut arrows, per badge key (the AXIOMS column's: sorted top to bottom). */
  hiddenEnds: Record<string, string[]>;
  /** Buttons outside their place (the column's header or footer strip, or the canvas), or covering a visible card. */
  problems: string[];
}

/**
 * Checks the "n linked" buttons against the page (BD-4): the AXIOMS column's sit inside its header (▲) or footer (▼)
 * strip, the canvas's inside the canvas; none covers a visible part of a card; each counts the distinct hidden cards
 * that the drawn cut arrows lead to through its edge (`data-cut`).
 */
export async function badgeReport(page: Page): Promise<BadgeReport> {
  await settle(page); // as in checkArrows: the engine's last frame first
  return page.evaluate(() => {
    const problems: string[] = [];
    const hidden: Record<string, Set<string>> = {};
    for (const path of document.querySelectorAll<SVGPathElement>('svg.tl-edges path[data-edge-id][data-stub][data-cut]')) {
      const awayId = path.dataset.stub === 'source' ? path.dataset.target : path.dataset.source;
      const cut = path.dataset.cut ?? '?';
      if (!awayId) continue;
      const key = cut === 'up' || cut === 'down' ? `column:${cut}` : `canvas:${cut}`;
      (hidden[key] ??= new Set()).add(awayId);
    }
    const top = (id: string) => document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.getBoundingClientRect().top ?? 0;
    const hiddenEnds = Object.fromEntries(Object.entries(hidden).map(([key, ids]) => [key, [...ids].sort((a, b) => top(a) - top(b))]));

    const column = document.querySelector('.tl-col__list[data-kind="AXIOM"]')?.getBoundingClientRect();
    const viewport = document.querySelector('.tl-canvas')?.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>('[data-node-id]')].flatMap((el) => {
      const view = el.closest('.tl-col__list') ? column : el.closest('.tl-canvas__layer') ? viewport : undefined;
      if (!view) return [];
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, view.left);
      const right = Math.min(r.right, view.right);
      const top = Math.max(r.top, view.top);
      const bottom = Math.min(r.bottom, view.bottom);
      return right > left && bottom > top ? [{ id: el.dataset.nodeId ?? '?', left, right, top, bottom }] : [];
    });
    const badges: Array<{ key: string; count: number }> = [];
    for (const badge of document.querySelectorAll<HTMLElement>('.tl-badge:not([hidden])')) {
      const key = badge.dataset.part === 'column' ? `column:${badge.dataset.dir}` : `canvas:${badge.dataset.side}`;
      const b = badge.getBoundingClientRect();
      if (badge.dataset.part === 'column') {
        const strip = badge.closest('.tl-col')?.querySelector(badge.dataset.dir === 'up' ? '.tl-col__header' : '.tl-col__footer');
        const s = strip?.getBoundingClientRect();
        if (!s) problems.push(`${key}: not in the AXIOMS column`);
        else if (b.width === 0 || b.left < s.left - 0.5 || b.right > s.right + 0.5 || b.top < s.top - 0.5 || b.bottom > s.bottom + 0.5) {
          problems.push(`${key}: outside its ${badge.dataset.dir === 'up' ? 'header' : 'footer'} strip`);
        }
      } else if (!viewport || b.width === 0 || b.left < viewport.left - 0.5 || b.right > viewport.right + 0.5 || b.top < viewport.top - 0.5 || b.bottom > viewport.bottom + 0.5) {
        problems.push(`${key}: outside the canvas`);
      }
      // The column's buttons sit in its header and footer, never over a card (the canvas's sit over the canvas's edges).
      if (badge.dataset.part === 'column') {
        for (const c of cards) {
          if (b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top) problems.push(`${key}: covers card ${c.id}`);
        }
      }
      const count = Number(badge.textContent?.match(/\d+/)?.[0] ?? -1);
      badges.push({ key, count });
      if (count !== (hidden[key]?.size ?? 0)) problems.push(`${key}: shows ${count}, but ${hidden[key]?.size ?? 0} hidden cards are linked`);
    }
    for (const key of Object.keys(hidden)) if (!badges.some((b) => b.key === key)) problems.push(`${key}: hidden linked cards but no button`);
    return { badges, hiddenEnds, problems };
  });
}
