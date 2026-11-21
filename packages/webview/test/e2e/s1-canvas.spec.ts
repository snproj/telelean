/**
 * Spec v4 slice 1c: the PROPOSITIONS canvas (BD-3, BD-4, CM-7, A21). The wheel zooms about the cursor (Ctrl+wheel, a
 * trackpad pinch, faster) within 10 %–400 %; a right-drag pans and never selects or opens a menu; a right click
 * without movement opens the menu at the pointer for what is under it (the card, the empty canvas: "New proposition
 * here", Fit all, Tidy layout); with the canvas focused, + and − zoom about the centre, 0 is Fit all, the arrow keys
 * pan; Tab brings the focused card into view; the toolbar's zoom buttons, Fit all and Zoom to selection; a canvas
 * edge's "n linked" badge pans to the hidden card.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildGraph, spyroGraph, type TlGraph } from '@telelean/core';
import { makeNode } from '../shared/graphs';
import {
  badgeReport,
  boardMenu,
  canvas,
  canvasPoint,
  canvasPointAt,
  canvasView,
  card,
  cardPoint,
  checkArrows,
  edgePairs,
  inView,
  menuItem,
  openBoard,
  postedOfType,
  rightClick,
  rightDrag,
  settle,
  shotPath,
  viewSettled,
  type OpenedBoard,
} from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** The wheel's zoom per px of delta (canvas/view.ts WHEEL_ZOOM): k, and the larger pinch k for Ctrl+wheel. */
const K = 0.0015;
const PINCH_K = 0.012;

/**
 * Spyro, plus two propositions far apart on the canvas (stored positions): `near` close to the goal, `far` well out of
 * the first view, resting on `near` (a drawn arrow that leaves the view through an edge).
 */
function spreadGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const near = makeNode('near-claim', 'PROPOSITION', 'Cynder could appear in a spin-off instead', { proof: { kind: 'none' } });
  const far = makeNode('far-claim', 'PROPOSITION', 'A spin-off would sell well', { proof: { kind: 'none' } }, { premises: ['near-claim'] });
  const graph = buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, near, far], vocabulary: base.vocabulary, semantic: base.semantic });
  return { ...graph, positions: { 'near-claim': { x: 360, y: 260 }, 'far-claim': { x: 3600, y: 2400 } } };
}

async function expectSamePoint(page: Page, at: { x: number; y: number }, before: { x: number; y: number }) {
  const after = await canvasPointAt(page, at);
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
}

/**
 * Where a client point lies relative to a card as the browser rendered it, in fractions of the card's box (fixer 1g:
 * what the user sees, not only the view the board wrote, so the layer's `transform-origin` counts too).
 */
async function onRendered(page: Page, id: string, at: { x: number; y: number }) {
  const box = await card(page, id).boundingBox();
  if (!box) throw new Error(`card ${id} has no box`);
  return { fx: (at.x - box.x) / box.width, fy: (at.y - box.y) / box.height, w: box.width, h: box.height };
}

/** The same point of the card is still under `at` on screen: within half a pixel at the new size. */
async function expectSameRendered(page: Page, id: string, at: { x: number; y: number }, before: { fx: number; fy: number; w: number }) {
  const after = await onRendered(page, id, at);
  expect(after.w).not.toBeCloseTo(before.w, 1); // it did zoom
  expect(Math.abs(after.fx - before.fx) * after.w).toBeLessThan(0.5);
  expect(Math.abs(after.fy - before.fy) * after.h).toBeLessThan(0.5);
}

test('the wheel zooms about the cursor (the canvas point under it stays put); Ctrl+wheel, a pinch, zooms faster; 10 %–400 %', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  const zoom = page.getByTestId('zoom-level');
  const start = await canvasView(page);
  await expect(zoom).toHaveText(`${Math.round(start.s * 100)}%`);

  // Over empty canvas, right of the goal: zoom in by one wheel notch. The canvas point under the cursor stays put, by
  // the view the board wrote and on screen (measured on the goal's rendered box: the cursor keeps its place relative
  // to it, as it does to every card, under a zoom about the cursor).
  const at = await canvasPoint(page, 0.8, 0.3);
  await page.mouse.move(at.x, at.y);
  const under = await canvasPointAt(page, at);
  const goalBefore = await onRendered(page, 'cynder-not-good', at);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await canvasView(page)).s).not.toBe(start.s);
  const zoomed = await canvasView(page);
  expect(zoomed.s / start.s).toBeCloseTo(Math.exp(200 * K), 3);
  await expectSamePoint(page, at, under);
  await expectSameRendered(page, 'cynder-not-good', at, goalBefore);
  await expect(zoom).toHaveText(`${Math.round(zoomed.s * 100)}%`);

  // Over a card it zooms too (the wheel belongs to the canvas, not the card), about that point: the same spot of the
  // card stays under the cursor.
  const onCard = await cardPoint(page, 'cynder-not-good');
  await page.mouse.move(onCard.x, onCard.y);
  const underCard = await canvasPointAt(page, onCard);
  const cardBefore = await onRendered(page, 'cynder-not-good', onCard);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await canvasView(page)).s).not.toBe(zoomed.s);
  expect((await canvasView(page)).s / zoomed.s).toBeCloseTo(Math.exp(-120 * K), 3);
  await expectSamePoint(page, onCard, underCard);
  await expectSameRendered(page, 'cynder-not-good', onCard, cardBefore);

  // Ctrl+wheel (a trackpad pinch sends small deltas) zooms faster, about the cursor as well.
  const before = await canvasView(page);
  await page.mouse.move(at.x, at.y);
  const underPinch = await canvasPointAt(page, at);
  const pinchBefore = await onRendered(page, 'cynder-not-good', at);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 40);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await canvasView(page)).s).not.toBe(before.s);
  expect((await canvasView(page)).s / before.s).toBeCloseTo(Math.exp(-40 * PINCH_K), 3);
  await expectSamePoint(page, at, underPinch);
  await expectSameRendered(page, 'cynder-not-good', at, pinchBefore);

  // The range ends at 400 % and 10 %.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await canvasView(page)).s).toBe(4);
  await expect(zoom).toHaveText('400%');
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400);
  await expect.poll(async () => (await canvasView(page)).s).toBe(0.1);
  await expect(zoom).toHaveText('10%');

  // Wheel over the AXIOMS column scrolls the column (here nothing to scroll), never the canvas's zoom.
  const column = await card(page, 'cynder-dark-past').boundingBox();
  if (!column) throw new Error('no column card');
  await page.mouse.move(column.x + 20, column.y + 10);
  await page.mouse.wheel(0, -300);
  await settle(page);
  expect((await canvasView(page)).s).toBe(0.1);
  // Nothing was posted: the view is not part of the files.
  expect(await postedOfType(page, 'moveCards')).toEqual([]);
});

test('a right-drag pans and neither selects nor opens a menu; a right click without movement opens the menu at the pointer (CM-7, A21)', async ({ page }) => {
  board = await openBoard(page, spreadGraph(), 'dark');
  await card(page, 'cynder-dark-past').click();
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');

  // A right-drag on empty canvas pans by exactly the pointer's movement (here right and down: the cards stay in view).
  const start = await canvasView(page);
  const from = await canvasPoint(page, 0.6, 0.75);
  await rightDrag(page, from, { x: from.x + 120, y: from.y + 50 });
  const panned = await canvasView(page);
  expect(panned.x - start.x).toBeCloseTo(120, 1);
  expect(panned.y - start.y).toBeCloseTo(50, 1);
  expect(panned.s).toBe(start.s);
  await expect(boardMenu(page)).toHaveCount(0);
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');

  // A right-drag that starts on a card pans too: it selects nothing and opens nothing.
  const onCard = await cardPoint(page, 'cynder-not-good');
  await rightDrag(page, onCard, { x: onCard.x + 60, y: onCard.y + 30 });
  expect((await canvasView(page)).x - panned.x).toBeCloseTo(60, 1);
  await expect(boardMenu(page)).toHaveCount(0);
  await expect(card(page, 'cynder-not-good')).not.toHaveAttribute('data-selected', /.*/);
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');
  expect(await postedOfType(page, 'select')).toHaveLength(1); // only the first left click

  // A press and release less than 4 px apart is a click: the menu opens at the pointer for the card under it. With
  // another card selected, the selection stays and the clicked card is the target of "Draw arrows from the selection".
  const target = await cardPoint(page, 'cynder-not-good');
  await page.mouse.move(target.x, target.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(target.x + 2, target.y + 1);
  await page.mouse.up({ button: 'right' });
  const menu = boardMenu(page);
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-label', 'Actions for “Cynder would not be a good addition to …”');
  const menuBox = await menu.boundingBox();
  if (!menuBox) throw new Error('no menu box');
  expect(Math.abs(menuBox.x - (target.x + 2))).toBeLessThan(12);
  expect(Math.abs(menuBox.y - (target.y + 1))).toBeLessThan(12);
  await expect(menuItem(page, 'draw-from-selection')).toHaveText('Draw an arrow from the selection');
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');
  await expect(card(page, 'cynder-not-good')).not.toHaveAttribute('data-selected', /.*/);
  await page.screenshot({ path: shotPath('s1-menu-card.png') });
  // Escape closes it; nothing else happened.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Without a selection, a right click on a card selects it first.
  await page.keyboard.press('Escape'); // clears the selection
  await expect(card(page, 'cynder-dark-past')).not.toHaveAttribute('data-selected', /.*/);
  await rightClick(page, await cardPoint(page, 'near-claim'));
  await expect(card(page, 'near-claim')).toHaveAttribute('data-selected', 'true');
  await expect(menu.getByRole('menuitem')).toContainText(['Follows from nothing', 'Move to axioms', 'Show on board']);
  await page.keyboard.press('Escape');

  // On empty canvas: New proposition here, Fit all, Tidy layout (the selection stays).
  const empty = await canvasPoint(page, 0.3, 0.85);
  const expected = await canvasPointAt(page, empty);
  await rightClick(page, empty);
  await expect(menu).toHaveAttribute('aria-label', 'Canvas actions');
  await expect(menu.getByRole('menuitem')).toHaveText(['New proposition here', 'Fit all', 'Tidy layout (1 selected)']);
  await expect(card(page, 'near-claim')).toHaveAttribute('data-selected', 'true');
  await page.screenshot({ path: shotPath('s1-menu-canvas.png') });
  // "New proposition here": the A|P box switches to Proposition, takes the focus, and the card goes where clicked.
  await menuItem(page, 'new-here').click();
  await expect(page.getByRole('radio', { name: 'Proposition' })).toHaveAttribute('aria-checked', 'true');
  const input = page.getByRole('textbox', { name: 'New proposition' });
  await expect(input).toBeFocused();
  await expect(page.getByTestId('prompt-place')).toContainText('at the point you chose');
  await input.fill('A spin-off would star Cynder');
  await input.press('Enter');
  const added = (await postedOfType(page, 'addNode')).at(-1)?.payload;
  expect(added).toMatchObject({ type: 'PROPOSITION', naturalName: 'A spin-off would star Cynder' });
  expect(Math.abs((added?.position?.x ?? NaN) - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((added?.position?.y ?? NaN) - expected.y)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('prompt-place')).toHaveCount(0);
  await expect(card(page, 'a-spin-off-would-star-cynder')).toHaveAttribute('data-place', 'canvas');
});

test('with the canvas focused, + and − zoom about the centre, 0 is Fit all, the arrow keys pan; Tab brings the focused card into view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // Fit all and the reveals jump instead of easing
  board = await openBoard(page, spreadGraph(), 'light');
  // The far card is out of the first view; the arrow into it leaves the view through an edge.
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(false);
  const viewport = canvas(page);
  await viewport.focus();
  const size = await viewport.evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
  const centre = await viewport.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft + el.clientWidth / 2, y: r.top + el.clientTop + el.clientHeight / 2 };
  });
  expect(size.w).toBeGreaterThan(300);

  const start = await canvasView(page);
  const middle = await canvasPointAt(page, centre);
  await page.keyboard.press('+');
  expect((await canvasView(page)).s / start.s).toBeCloseTo(1.25, 4);
  await expectSamePoint(page, centre, middle);
  await page.keyboard.press('-');
  expect((await canvasView(page)).s).toBeCloseTo(start.s, 4);

  // The arrow keys pan 60 px (Shift: 240).
  let view = await canvasView(page);
  await page.keyboard.press('ArrowLeft');
  expect((await canvasView(page)).x - view.x).toBeCloseTo(60, 3);
  view = await canvasView(page);
  await page.keyboard.press('Shift+ArrowUp');
  expect((await canvasView(page)).y - view.y).toBeCloseTo(240, 3);
  view = await canvasView(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect((await canvasView(page)).x - view.x).toBeCloseTo(-60, 3);
  expect((await canvasView(page)).y - view.y).toBeCloseTo(-60, 3);

  // 0: Fit all, every card in view (at most 100 %).
  await page.keyboard.press('0');
  await viewSettled(page);
  for (const id of ['cynder-not-good', 'near-claim', 'far-claim']) expect(await inView(page, `[data-node-id="${id}"]`), id).toBe(true);
  expect((await canvasView(page)).s).toBeLessThanOrEqual(1);
  expect((await checkArrows(page, edgePairs(spreadGraph()))).problems).toEqual([]);

  // Zoom in on the near card (the toolbar), then Tab through the canvas: the far card, focused, comes into view.
  await card(page, 'near-claim').click();
  await page.getByTestId('zoom-selection').click();
  await viewSettled(page);
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(false);
  await card(page, 'near-claim').focus();
  for (let i = 0; i < 8; i++) {
    if (await card(page, 'far-claim').evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(card(page, 'far-claim')).toBeFocused();
  await viewSettled(page);
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(true);
  expect(await postedOfType(page, 'moveCards')).toEqual([]);
});

test('the toolbar zooms by steps, fits all, zooms to the selection; a canvas edge’s "n linked" badge pans to the hidden card (BD-4)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  board = await openBoard(page, spreadGraph(), 'dark');
  const zoomIn = page.getByTestId('zoom-in');
  const start = await canvasView(page);
  await zoomIn.click();
  expect((await canvasView(page)).s / start.s).toBeCloseTo(1.25, 4);
  await page.getByTestId('zoom-out').click();
  expect((await canvasView(page)).s).toBeCloseTo(start.s, 4);
  await expect(page.getByTestId('zoom-selection')).toBeDisabled(); // no proposition selected

  // The far card is out of view: the arrow into it is cut at the canvas edge it leaves through, with a badge there.
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(false);
  const report = await badgeReport(page);
  expect(report.problems).toEqual([]);
  const canvasBadge = report.badges.find((b) => b.key.startsWith('canvas:'));
  expect(canvasBadge?.count).toBe(1);
  const arrows = await checkArrows(page, edgePairs(spreadGraph()));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  expect(arrows.stubs).toBeGreaterThan(0);
  await page.screenshot({ path: shotPath('s1-canvas-badge.png') });
  await page.locator(`.tl-badge[data-part="canvas"][data-side="${canvasBadge?.key.split(':')[1]}"]`).click();
  await viewSettled(page);
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(true);
  expect((await canvasView(page)).s).toBeCloseTo(start.s, 4); // the badge pans; the zoom stays

  // Fit all shows every card; Zoom to selection fits the selected propositions (up to 150 %).
  await page.getByTestId('fit-all').click();
  await viewSettled(page);
  for (const id of ['cynder-not-good', 'near-claim', 'far-claim']) expect(await inView(page, `[data-node-id="${id}"]`), id).toBe(true);
  await card(page, 'cynder-not-good').click();
  await expect(page.getByTestId('zoom-selection')).toBeEnabled();
  await page.getByTestId('zoom-selection').click();
  await viewSettled(page);
  expect(await inView(page, '[data-node-id="cynder-not-good"]')).toBe(true);
  expect(await inView(page, '[data-node-id="far-claim"]')).toBe(false);
  expect((await canvasView(page)).s).toBeLessThanOrEqual(1.5);
  expect((await canvasView(page)).s).toBeGreaterThan(1);
});
