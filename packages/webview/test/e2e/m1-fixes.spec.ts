/**
 * The M1 fixes after the UX review: a narrow board stays readable (columns keep their width and the board scrolls
 * sideways), toasts never cover the tray, keyboard basics (dropdowns, inline edits, Alt+Up/Down), "These suffice"
 * says which premises it replaces, the highlight keeps text readable, a focused arrow is routed around the
 * Derivation cards instead of striking through them, backtick spans from core render as code, and an empty board
 * points to the A|D|G box.
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, spyroGraph } from '@telelean/core';
import { historyListing, statusGallery, workspaceState } from '../shared/graphs';
import { card, checkArrows, list, openBoard, postedOfType, send, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** Words of the element's text that the browser broke across two lines. */
async function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    const text = element?.firstChild;
    if (!element || !text || text.nodeType !== Node.TEXT_NODE) return ['(no text node)'];
    const value = text.textContent ?? '';
    const broken: string[] = [];
    for (const match of value.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      if (lines.size > 1) broken.push(match[0]);
    }
    return broken;
  }, selector);
}

const focusedLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${el.getAttribute('aria-label') ?? el.dataset.nodeId ?? el.textContent?.trim().slice(0, 40)}` : '';
  });

test('a narrow board keeps readable columns and scrolls sideways; words are not broken; arrows stay on the cards', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 });
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'light', { workspace: workspaceState() });
  const widths = await page.locator('.tl-col').evaluateAll((cols) => cols.map((c) => c.getBoundingClientRect().width));
  for (const width of widths) expect(width).toBeGreaterThanOrEqual(219.5);
  const scroller = page.locator('.tl-board-scroll');
  const [scrollWidth, clientWidth] = await scroller.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  expect(await brokenWords(page, '[data-node-id="cynder-not-good"] .tl-card__text')).toEqual([]);
  expect(await brokenWords(page, '[data-node-id="cynder-dark-past"] .tl-card__text')).toEqual([]);
  // Column titles fit, and the "uses:" line is the short inline list, never cut further by CSS.
  for (const overflow of await page.locator('.tl-col__title').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth))) expect(overflow).toBeLessThanOrEqual(0);
  const uses = card(page, 'cynder-not-good').locator('.tl-uses__text');
  await expect(uses).toHaveText('uses: GoodAddition, cynder, …');
  expect(await uses.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const pairs = graph.edges.map((e) => ({ source: e.source, target: e.target }));
  expect((await checkArrows(page, pairs)).problems).toEqual([]);
  await page.screenshot({ path: shotPath('m1-fix-narrow-board.png') });
  // Scrolled sideways, the arrows still start and end on their cards (the overlay scrolls with the columns).
  await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await settle(page);
  const after = await checkArrows(page, pairs);
  expect(after.problems).toEqual([]);
  await page.screenshot({ path: shotPath('m1-fix-narrow-board-scrolled.png') });
});

test('toasts sit above the tray and the A|D|G box, three at most, never covering them', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await card(page, 'cynder-dark-past').click();
  await card(page, 'cynder-not-good').click({ modifiers: ['ControlOrMeta'] });
  for (let i = 1; i <= 5; i++) await send(page, hostMessage('notice', { id: `t${i}`, level: 'info', text: `Notice number ${i}`, undoable: false }));
  await expect(page.getByTestId('toast')).toHaveCount(3);
  const toasts = await page.getByTestId('toasts').boundingBox();
  const tray = await page.getByTestId('tray').boundingBox();
  if (!toasts || !tray) throw new Error('missing boxes');
  expect(toasts.y + toasts.height).toBeLessThanOrEqual(tray.y);
  await page.screenshot({ path: shotPath('m1-fix-toasts.png') });
});

test('dropdowns: the focus moves in, arrows move between items, Escape and choosing give it back to the button', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), history: historyListing() });
  const picker = page.getByTestId('subject-picker');
  await picker.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('subject-menu');
  await expect(menu.getByRole('menuitemradio', { name: /Spyro/ })).toBeFocused(); // the current subject
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: /Bayonetta/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button', { name: 'New subject…' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitemradio', { name: /Spyro/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(picker).toBeFocused();

  // The uses dropdown: Enter on an item highlights it in the Vocabulary group, and the focus returns to "▾ 3".
  const toggle = card(page, 'cynder-not-good').locator('.tl-uses__toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const uses = page.getByTestId('uses-menu');
  await expect(uses.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(uses.locator('[data-vocab="Spyro.cynder"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(uses).toHaveCount(0);
  await expect(page.locator('.tl-vocab__item[data-vocab="Spyro.cynder"]')).toHaveAttribute('data-highlight', 'true');
  await expect(toggle).toBeFocused();

  // History: Tab past its last field leaves it for the control after the History button (Undo).
  await page.getByTestId('history-button').focus();
  await page.keyboard.press('Enter');
  const history = page.getByTestId('history-menu');
  await expect(history.getByTestId('history-entry')).toHaveCount(3);
  await page.keyboard.press('ArrowDown');
  await expect(history.getByTestId('history-entry').first().getByRole('button', { name: 'Preview' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(history.getByRole('spinbutton', { name: 'Keep the last N entries' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(history).toHaveCount(0);
  expect(await focusedLabel(page)).toBe('button:Undo');
});

test('inline edits give the focus back to the card; Alt+Up/Down re-orders the focused card', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  const dark = card(page, 'cynder-dark-past');
  await dark.focus();
  await page.keyboard.press('F2');
  const sentence = dark.getByRole('textbox', { name: 'Edit the sentence' });
  await expect(sentence).toBeFocused();
  await sentence.fill('Cynder has a very dark past');
  await page.keyboard.press('Enter');
  await expect(dark).toBeFocused();
  await page.keyboard.press('F2');
  await page.keyboard.press('Escape');
  await expect(dark).toBeFocused();
  expect((await postedOfType(page, 'editNode')).map((m) => m.payload.value)).toEqual(['Cynder has a very dark past']);

  const order = () => list(page, 'ASSUMPTION').locator('[data-node-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id')));
  expect(await order()).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(order).toEqual(['pg-no-dark-past', 'new-spyro-pg', 'cynder-dark-past']);
  await expect(dark).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(order).toEqual(['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg']);
  await expect(dark).toBeFocused();
  expect((await postedOfType(page, 'reorder')).map((m) => [m.payload.id, m.payload.beforeId])).toEqual([
    ['cynder-dark-past', null],
    ['cynder-dark-past', 'new-spyro-pg'],
    ['cynder-dark-past', 'pg-no-dark-past'],
  ]);
});

test('"These suffice" names the declared premises it would drop and offers "Add to its premises ▶" (M2: it starts a run with them all)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState() });
  await card(page, 'cynder-dark-past').click();
  await card(page, 'cynder-not-good').click({ modifiers: ['ControlOrMeta'] });
  const note = page.getByTestId('tray-replaces');
  await expect(note).toContainText('replaces the target’s declared premises and drops');
  await expect(note).toContainText('“The new Spyro game is PG”');
  await expect(note).toContainText('“PG games cannot have characters with…”');
  await page.screenshot({ path: shotPath('m1-fix-tray-replaces.png') });
  await page.getByRole('button', { name: 'Add to its premises ▶' }).click();
  expect((await postedOfType(page, 'startRun')).map((m) => m.payload)).toEqual([
    { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], requestId: 'r1' },
  ]);
  // Selecting every declared premise: nothing is dropped, nothing to say.
  await card(page, 'new-spyro-pg').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(note).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to its premises' })).toHaveCount(0);
});

test('the highlight outlines the item and keeps its own text colours', async ({ page }) => {
  // The dark theme's contributed default for telelean.highlight (packages/extension/package.json).
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), state: { vocabCollapsed: false }, vars: { '--vscode-telelean-highlight': '#E5C07B' } });
  const item = page.locator('.tl-vocab__item[data-vocab="Spyro.HasDarkPast"]');
  const before = await item.evaluate((el) => getComputedStyle(el.querySelector('.tl-vocab__name') as Element).color);
  await card(page, 'cynder-dark-past').locator('.tl-uses__toggle').click();
  await page.getByTestId('uses-menu').locator('[data-vocab="Spyro.HasDarkPast"]').click();
  await expect(item).toHaveAttribute('data-highlight', 'true');
  const style = await item.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: `${s.outlineStyle} ${s.outlineWidth}`, image: s.backgroundImage };
  });
  expect(style.outline).toBe('solid 2px');
  expect(style.image).toMatch(/0\.16\)/); // a light tint over the item, not the solid highlight colour
  expect(await item.evaluate((el) => getComputedStyle(el.querySelector('.tl-vocab__name') as Element).color)).toBe(before);
  await page.screenshot({ path: shotPath('m1-fix-highlight-dark.png') });
});

test('a focused arrow that skips the Derivations column is routed through a gap, never across a Derivation card', async ({ page }) => {
  const graph = statusGallery();
  board = await openBoard(page, graph, 'dark', { workspace: workspaceState() });
  await card(page, 'cynder-not-good').hover();
  await expect(page.locator('svg.tl-edges--over path.tl-edge--focus').first()).toBeVisible();
  await settle(page);
  const report = await page.evaluate(() => {
    const svg = document.querySelector('svg.tl-edges--over');
    if (!svg) return { checked: 0, routedHits: -1, straightHits: -1 };
    const origin = svg.getBoundingClientRect();
    const dCards = [...document.querySelectorAll('.tl-col__list[data-kind="DERIVATION"] [data-node-id]')].map((e) => e.getBoundingClientRect());
    const kind = (id: string | undefined) => (id ? document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.closest<HTMLElement>('.tl-col__list')?.dataset.kind : undefined);
    const inside = (x: number, y: number) => dCards.some((r) => x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1);
    let checked = 0;
    let routedHits = 0;
    let straightHits = 0;
    for (const path of document.querySelectorAll<SVGPathElement>('svg.tl-edges--over path.tl-edge--focus')) {
      const kinds = [kind(path.dataset.source), kind(path.dataset.target)].sort().join('-');
      if (kinds !== 'ASSUMPTION-GOAL') continue;
      checked++;
      const length = path.getTotalLength();
      for (let i = 0; i <= 300; i++) {
        const p = path.getPointAtLength((length * i) / 300);
        if (inside(origin.left + p.x, origin.top + p.y)) routedHits++;
      }
      // The unrouted curve between the same ends (what was drawn before): it would cross a Derivation card.
      const s = path.getPointAtLength(0);
      const t = path.getPointAtLength(length);
      const dx = Math.min(160, Math.max(30, Math.abs(t.x - s.x) * 0.45));
      for (let i = 0; i <= 300; i++) {
        const u = i / 300;
        const bez = (a: number, b: number, c: number, d: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u ** 2 * c + u ** 3 * d;
        if (inside(origin.left + bez(s.x, s.x + dx, t.x - dx, t.x), origin.top + bez(s.y, s.y, t.y, t.y))) straightHits++;
      }
    }
    return { checked, routedHits, straightHits };
  });
  expect(report.checked).toBeGreaterThan(0);
  expect(report.straightHits).toBeGreaterThan(0); // the situation the fix is for
  expect(report.routedHits).toBe(0);
  await page.screenshot({ path: shotPath('m1-fix-routed-arrow.png') });
});

test('backtick spans from core render as code in Problems; tooltips have none', async ({ page }) => {
  const graph = { ...spyroGraph(), diagnostics: [{ code: 'TL011', severity: 'info' as const, message: 'This assumption has no `rationale:` yet', nodeId: 'new-spyro-pg' }] };
  board = await openBoard(page, graph, 'dark', { workspace: workspaceState() });
  await page.getByTestId('problems-button').click();
  const problem = page.getByTestId('problems-menu').getByTestId('problem').first();
  await expect(problem).toContainText('TL011 This assumption has no rationale: yet');
  await expect(problem.locator('code').nth(1)).toHaveText('rationale:');
  expect(await problem.textContent()).not.toContain('`');
  await page.keyboard.press('Escape');
  await card(page, 'cynder-not-good').locator('.tl-card__chevron').click();
  const make = card(page, 'cynder-not-good').locator('.tl-details__actions').getByRole('button', { name: 'Make Assumption' });
  expect(await make.getAttribute('title')).not.toContain('`');
});

test('an empty board points to the A|D|G box', async ({ page }) => {
  const empty = { ...spyroGraph(), nodes: [], edges: [], vocabulary: [], diagnostics: [] };
  board = await openBoard(page, empty, 'light', { workspace: workspaceState({ subjects: [{ name: 'Spyro', nodeCount: 0 }] }) });
  await expect(page.getByTestId('first-step')).toContainText('No cards yet: type something you believe in the box below and press Enter.');
  await expect(page.locator('.tl-tray__hint')).not.toContainText('These suffice');
  await expect(list(page, 'ASSUMPTION').locator('.tl-col__empty')).toHaveText('No assumptions yet: type your first one in the box below');
  await expect(list(page, 'GOAL').locator('.tl-col__empty')).toHaveText('No goals yet');
  await page.screenshot({ path: shotPath('m1-fix-empty-board.png') });
});
