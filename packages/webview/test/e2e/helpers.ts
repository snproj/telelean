import { expect, type Page } from '@playwright/test';
import type { ActionOutcome, HistoryListing, HostToWebviewMessage, ProposalView, RunView, TlGraph, WebviewToHostMessage, WorkspaceState } from '@telelean/core';
import { fileURLToPath } from 'node:url';

export type Theme = 'light' | 'dark' | 'hc';

/** Screenshots land in packages/webview/test-results/. */
export const shotPath = (name: string) => fileURLToPath(new URL(`../../test-results/${name}`, import.meta.url));

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

/**
 * Drags a card by its sentence (the face is the drag handle; presses on buttons, fields and the code never drag)
 * to a point, with real mouse input. The card is scrolled into its column's view first.
 */
export async function dragCard(page: Page, id: string, to: { x: number; y: number }, beforeDrop?: () => Promise<void>): Promise<void> {
  const text = card(page, id).locator('.tl-card__text');
  await text.scrollIntoViewIfNeeded();
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

/** A point in a column list: near its bottom (below the cards of a small board) unless given. */
export async function columnPoint(page: Page, kind: 'ASSUMPTION' | 'DERIVATION' | 'GOAL', fromBottom = 60): Promise<{ x: number; y: number }> {
  const box = await list(page, kind).boundingBox();
  if (!box) throw new Error(`no ${kind} column`);
  return { x: box.x + box.width / 2, y: box.y + box.height - fromBottom };
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

/** Whether an element lies fully inside its column list's visible band. */
export async function inColumnView(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const v = (el.closest('.tl-col__list') as HTMLElement).getBoundingClientRect();
    return r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.height > 0;
  });
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

export function card(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"]`);
}

export function list(page: Page, kind: 'ASSUMPTION' | 'DERIVATION' | 'GOAL') {
  return page.locator(`.tl-col__list[data-kind="${kind}"]`);
}

export async function scrollTops(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll<HTMLElement>('.tl-col__list')].map((l) => [l.dataset.kind ?? '?', l.scrollTop])),
  );
}

export interface ArrowReport {
  drawn: number;
  full: number;
  stubs: number;
  /** Geometry violations: endpoints off the card edges, full arrows to hidden cards, stubs between visible cards. */
  problems: string[];
  /** Pairs that should be drawn (both cards clearly visible: full arrow; one: stub) but are not drawn that way. */
  missing: string[];
}

/**
 * Checks every drawn arrow against the real card boxes: each end of a full arrow must lie on a left or right edge
 * of its card (within `tolerance` px) and inside the card's vertical extent; a stub must start on the visible
 * card's edge, stay short, and exist only when the other card is scrolled out of its column.
 */
export async function checkArrows(page: Page, pairs: Array<{ source: string; target: string }>, tolerance = 2): Promise<ArrowReport> {
  return page.evaluate(
    ({ pairs, tolerance }) => {
      const svg = document.querySelector('svg.tl-edges--over');
      if (!svg) return { drawn: 0, full: 0, stubs: 0, problems: ['no overlay svg'], missing: [] };
      const origin = svg.getBoundingClientRect();
      const views: Record<string, DOMRect> = {};
      for (const l of document.querySelectorAll<HTMLElement>('.tl-col__list')) views[l.dataset.kind ?? '?'] = l.getBoundingClientRect();
      const column: Record<string, number> = { ASSUMPTION: 0, DERIVATION: 1, GOAL: 2 };
      const box = (id: string) => {
        const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
        const kind = el?.closest<HTMLElement>('.tl-col__list')?.dataset.kind;
        if (!el || !kind) return null;
        const rect = el.getBoundingClientRect();
        const view = views[kind];
        const visible = view ? Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top) : 0;
        return { rect, visible, col: column[kind] ?? -1, kind };
      };
      type Box = NonNullable<ReturnType<typeof box>>;
      type Pt = { x: number; y: number };
      /** The edge an arrow must use on `card`: the side facing `other`, or the gutter side within one column. */
      const facing = (card: Box, other: Box): 'left' | 'right' =>
        card.col === other.col ? (card.kind === 'GOAL' ? 'left' : 'right') : card.col < other.col ? 'right' : 'left';
      const onSide = (p: Pt, card: Box, other: Box) => {
        const r = card.rect;
        const x = facing(card, other) === 'right' ? r.right : r.left;
        return Math.abs(p.x - x) <= tolerance && p.y >= r.top - tolerance && p.y <= r.bottom + tolerance;
      };
      const fmt = (p: Pt) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
      const fmtRect = (r: DOMRect) => `[x ${r.left.toFixed(1)}..${r.right.toFixed(1)}, y ${r.top.toFixed(1)}..${r.bottom.toFixed(1)}]`;

      const problems: string[] = [];
      const drawn = new Map<string, 'full' | 'stub'>();
      let full = 0;
      let stubs = 0;
      const paths = [...document.querySelectorAll<SVGPathElement>('path[data-edge-id]')];
      for (const path of paths) {
        const id = path.dataset.edgeId ?? '?';
        const n = (path.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
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
          if (!onSide(start, s, t)) problems.push(`${id}: start ${fmt(start)} not on the source's ${facing(s, t)} edge ${fmtRect(s.rect)}`);
          if (!onSide(end, t, s)) problems.push(`${id}: end ${fmt(end)} not on the target's ${facing(t, s)} edge ${fmtRect(t.rect)}`);
          if (s.visible < 4 || t.visible < 4) problems.push(`${id}: full arrow although a card is scrolled away`);
        } else {
          stubs++;
          drawn.set(`${path.dataset.source}->${path.dataset.target}`, 'stub');
          const visibleCard = stub === 'source' ? s : t;
          const awayCard = stub === 'source' ? t : s;
          const atCard = stub === 'source' ? start : end;
          const tip = stub === 'source' ? end : start;
          if (!onSide(atCard, visibleCard, awayCard)) {
            problems.push(`${id}: stub ${fmt(atCard)} not on the visible card's ${facing(visibleCard, awayCard)} edge ${fmtRect(visibleCard.rect)}`);
          }
          if (awayCard.visible > 12) problems.push(`${id}: stub although the other card is visible (${awayCard.visible.toFixed(1)} px)`);
          if (Math.abs(tip.x - atCard.x) > 30 || Math.abs(tip.y - atCard.y) > 30) problems.push(`${id}: stub longer than 30 px`);
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
        if (((sOn && tOff) || (sOff && tOn)) && drawn.get(key) !== 'stub') missing.push(`${key}: expected a stub, got ${drawn.get(key) ?? 'nothing'}`);
        if (sOff && tOff && drawn.has(key)) missing.push(`${key}: both cards scrolled away but drawn`);
      }
      return { drawn: paths.length, full, stubs, problems, missing };
    },
    { pairs, tolerance },
  );
}

/** The (source, target) pairs the overlay should draw for a graph (declared and verified merged). */
export function edgePairs(graph: TlGraph): Array<{ source: string; target: string }> {
  const seen = new Map<string, { source: string; target: string }>();
  for (const e of graph.edges) if (e.type !== 'lean-ref') seen.set(`${e.source}->${e.target}`, { source: e.source, target: e.target });
  return [...seen.values()];
}

export interface BadgeReport {
  /** Visible "n linked" buttons, as `${kind}:${dir}` with the count they show. */
  badges: Array<{ key: string; count: number }>;
  /** Hidden ends of the drawn stubs per `${kind}:${dir}`, sorted top to bottom (what each button should count). */
  hiddenEnds: Record<string, string[]>;
  /** Buttons outside their column's header (up) or footer (down) strip, or covering a visible part of a card. */
  problems: string[];
}

/**
 * Checks the "n linked" buttons against the page: each sits inside its own column's header (▲) or footer (▼) strip,
 * covers no visible part of any card, and counts the distinct hidden cards that the drawn stubs point to in that
 * column and direction. (A card with less than 8 px in view counts as hidden, as in the edge engine.)
 */
export async function badgeReport(page: Page): Promise<BadgeReport> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const views: Record<string, DOMRect> = {};
    for (const l of document.querySelectorAll<HTMLElement>('.tl-col__list')) views[l.dataset.kind ?? '?'] = l.getBoundingClientRect();
    const visiblePart = (el: Element) => {
      const kind = el.closest<HTMLElement>('.tl-col__list')?.dataset.kind ?? '?';
      const rect = el.getBoundingClientRect();
      const view = views[kind];
      const top = Math.max(rect.top, view?.top ?? 0);
      const bottom = Math.min(rect.bottom, view?.bottom ?? 0);
      return { kind, rect, top, bottom, height: bottom - top, view };
    };

    const hidden: Record<string, Set<string>> = {};
    for (const path of document.querySelectorAll<SVGPathElement>('path[data-edge-id][data-stub]')) {
      const awayId = path.dataset.stub === 'source' ? path.dataset.target : path.dataset.source;
      const away = awayId ? document.querySelector(`[data-node-id="${CSS.escape(awayId)}"]`) : null;
      if (!awayId || !away) continue;
      const part = visiblePart(away);
      if (part.height >= 8 || !part.view) {
        problems.push(`stub ${path.dataset.edgeId}: its far end ${awayId} is in view`);
        continue;
      }
      const above = part.rect.top + part.rect.height / 2 < (part.view.top + part.view.bottom) / 2;
      (hidden[`${part.kind}:${above ? 'up' : 'down'}`] ??= new Set()).add(awayId);
    }
    const tops = (ids: Set<string>) =>
      [...ids].sort(
        (a, b) =>
          (document.querySelector(`[data-node-id="${CSS.escape(a)}"]`)?.getBoundingClientRect().top ?? 0) -
          (document.querySelector(`[data-node-id="${CSS.escape(b)}"]`)?.getBoundingClientRect().top ?? 0),
      );
    const hiddenEnds = Object.fromEntries(Object.entries(hidden).map(([key, ids]) => [key, tops(ids)]));

    const badges: Array<{ key: string; count: number }> = [];
    const cards = [...document.querySelectorAll<HTMLElement>('[data-node-id]')]
      .map((el) => ({ id: el.dataset.nodeId ?? '?', ...visiblePart(el) }))
      .filter((c) => c.height > 0);
    for (const badge of document.querySelectorAll<HTMLElement>('.tl-badge:not([hidden])')) {
      const key = `${badge.dataset.kind}:${badge.dataset.dir}`;
      const b = badge.getBoundingClientRect();
      const column = badge.closest<HTMLElement>('.tl-col');
      const strip = column?.querySelector(badge.dataset.dir === 'up' ? '.tl-col__header' : '.tl-col__footer');
      if (!column || column.dataset.kind !== badge.dataset.kind || !strip) problems.push(`${key}: not in its own column`);
      else {
        const s = strip.getBoundingClientRect();
        if (b.width === 0 || b.left < s.left - 0.5 || b.right > s.right + 0.5 || b.top < s.top - 0.5 || b.bottom > s.bottom + 0.5) {
          problems.push(`${key}: outside its ${badge.dataset.dir === 'up' ? 'header' : 'footer'} strip`);
        }
      }
      for (const c of cards) {
        if (b.left < c.rect.right && b.right > c.rect.left && b.top < c.bottom && b.bottom > c.top) {
          problems.push(`${key}: covers card ${c.id}`);
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
