/**
 * The M1 fixes after the UX review, on the spec v4 board: a narrow board stays readable (the AXIOMS column keeps its
 * width, the canvas takes the rest; nothing scrolls sideways; the legend wraps inside the toolbar), toasts never cover
 * the A|P box (the tray they once had to avoid is gone: the Context Menu section sits above the board), keyboard basics
 * (dropdowns, inline edits, Alt+Up/Down in the AXIOMS column), the highlight keeps text readable, an arrow never
 * strikes through a card (the arrows run under the cards), backtick spans from core render as code, and an empty board
 * points to the A|P box.
 *
 * Removed with spec v4: "These suffice" naming the declared premises it would drop and offering "Add to its premises ▶"
 * (CM-4: the tray's controls are gone; the question is the arrows the user selects, nothing is replaced), and the
 * focused arrow routed through a gap of the Derivations column (there is no such column; 1c1's routing goes from side
 * to side, under the cards).
 */
import { expect, test, type Page } from '@playwright/test';
import { buildGraph, hostMessage, spyroGraph, type TlGraph } from '@telelean/core';
import { historyListing, makeNode, workspaceState } from '../shared/graphs';
import { card, checkArrows, edgePairs, openBoard, order, postedOfType, send, settle, shotPath, type OpenedBoard } from './helpers';

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

test('a narrow board keeps a readable AXIOMS column and gives the canvas the rest; nothing scrolls sideways; words are not broken; arrows stay on the cards; the legend wraps inside the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 });
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'light', { workspace: workspaceState() });
  const column = await page.locator('.tl-axioms').boundingBox();
  const viewport = await page.locator('.tl-canvas').boundingBox();
  if (!column || !viewport) throw new Error('missing boxes');
  expect(column.width).toBeGreaterThanOrEqual(219.5);
  expect(viewport.width).toBeGreaterThan(200);
  // Spec v4 BD-1: the board no longer scrolls sideways (the canvas pans instead).
  const area = page.locator('.tl-board-area');
  const [scrollWidth, clientWidth] = await area.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  expect(await brokenWords(page, '[data-node-id="cynder-not-good"] .tl-card__text')).toEqual([]);
  expect(await brokenWords(page, '[data-node-id="cynder-dark-past"] .tl-card__text')).toEqual([]);
  // The column title fits, and the "uses:" line is the short inline list, never cut further by CSS.
  for (const overflow of await page.locator('.tl-col__title').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth))) expect(overflow).toBeLessThanOrEqual(0);
  const uses = card(page, 'cynder-not-good').locator('.tl-uses__text');
  await expect(uses).toHaveText('uses: GoodAddition, cynder, …');
  expect(await uses.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const pairs = graph.edges.map((e) => ({ source: e.source, target: e.target }));
  expect((await checkArrows(page, pairs)).problems).toEqual([]);
  // The legend's eight entries wrap inside the toolbar (BD-9): none runs off it.
  const toolbar = await page.locator('header.tl-toolbar').boundingBox();
  if (!toolbar) throw new Error('no toolbar');
  const legend = await page.locator('.tl-legend [data-legend]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.getAttribute('data-legend') ?? '?', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  expect(legend).toHaveLength(8);
  for (const entry of legend) {
    const inside = entry.left >= toolbar.x - 0.5 && entry.right <= toolbar.x + toolbar.width + 0.5 && entry.top >= toolbar.y - 0.5 && entry.bottom <= toolbar.y + toolbar.height + 0.5;
    expect(inside, `legend entry ${entry.key} lies inside the toolbar`).toBe(true);
  }
  await page.screenshot({ path: shotPath('m1-fix-narrow-board.png') });
  // Panned (a right-drag on the canvas), the arrows still start and end on their cards.
  const from = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height - 40 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(from.x - 80, from.y - 30, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await settle(page);
  const after = await checkArrows(page, pairs);
  expect(after.problems).toEqual([]);
  await page.screenshot({ path: shotPath('m1-fix-narrow-board-panned.png') });
});

test('toasts sit above the A|P box, three at most, never covering it', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await card(page, 'cynder-dark-past').click();
  await card(page, 'cynder-not-good').click({ modifiers: ['ControlOrMeta'] });
  for (let i = 1; i <= 5; i++) await send(page, hostMessage('notice', { id: `t${i}`, level: 'info', text: `Notice number ${i}`, undoable: false }));
  await expect(page.getByTestId('toast')).toHaveCount(3);
  const toasts = await page.getByTestId('toasts').boundingBox();
  const prompt = await page.locator('.tl-prompt').boundingBox();
  if (!toasts || !prompt) throw new Error('missing boxes');
  expect(toasts.y + toasts.height).toBeLessThanOrEqual(prompt.y);
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

  const axioms = () => order(page, 'AXIOM');
  expect(await axioms()).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(axioms).toEqual(['pg-no-dark-past', 'new-spyro-pg', 'cynder-dark-past']);
  await expect(dark).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(axioms).toEqual(['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg']);
  await expect(dark).toBeFocused();
  expect((await postedOfType(page, 'reorder')).map((m) => [m.payload.id, m.payload.beforeId])).toEqual([
    ['cynder-dark-past', null],
    ['cynder-dark-past', 'new-spyro-pg'],
    ['cynder-dark-past', 'pg-no-dark-past'],
  ]);
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

/**
 * Spyro with a proposition stored between the AXIOMS column and the goal, level with it: the arrows from the column
 * into the goal pass behind it.
 */
function blockedGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const blocker = makeNode('blocker', 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } });
  return {
    ...buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, blocker], vocabulary: base.vocabulary, semantic: base.semantic }),
    positions: { blocker: { x: 360, y: 0 }, 'cynder-not-good': { x: 900, y: 0 } },
  };
}

test('an arrow never strikes through a card: arrows run under the cards, so a card in the way hides the part behind it', async ({ page }) => {
  const graph = blockedGraph();
  board = await openBoard(page, graph, 'dark', { workspace: workspaceState() });
  await card(page, 'cynder-not-good').hover();
  await expect(page.locator('svg.tl-edges path.tl-edge--focus').first()).toBeAttached();
  await settle(page);
  const report = await page.evaluate(() => {
    const blocker = document.querySelector('[data-node-id="blocker"]') as HTMLElement;
    const r = blocker.getBoundingClientRect();
    let behind = 0;
    let onTop = 0;
    for (const path of document.querySelectorAll<SVGPathElement>('svg.tl-edges path[data-edge-id][data-target="cynder-not-good"]')) {
      const origin = path.ownerSVGElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const length = path.getTotalLength();
      for (let i = 0; i <= 300; i++) {
        const p = path.getPointAtLength((length * i) / 300);
        const x = origin.left + p.x;
        const y = origin.top + p.y;
        if (x <= r.left + 2 || x >= r.right - 2 || y <= r.top + 2 || y >= r.bottom - 2) continue;
        behind++;
        // What the user sees (and clicks) there: the card, never the arrow's own (hit) path.
        const top = document.elementFromPoint(x, y);
        if (!top || !blocker.contains(top)) onTop++;
      }
    }
    return { behind, onTop };
  });
  expect(report.behind).toBeGreaterThan(0); // the situation the check is for
  expect(report.onTop).toBe(0);
  expect((await checkArrows(page, edgePairs(graph))).problems).toEqual([]);
  await page.screenshot({ path: shotPath('m1-fix-arrows-under-cards.png') });
});

test('backtick spans from core render as code in Problems; tooltips have none', async ({ page }) => {
  const graph = { ...spyroGraph(), diagnostics: [{ code: 'TL011', severity: 'info' as const, message: 'This axiom has no `rationale:` yet', nodeId: 'new-spyro-pg' }] };
  board = await openBoard(page, graph, 'dark', { workspace: workspaceState() });
  await page.getByTestId('problems-button').click();
  const problem = page.getByTestId('problems-menu').getByTestId('problem').first();
  await expect(problem).toContainText('TL011 This axiom has no rationale: yet');
  await expect(problem.locator('code').nth(1)).toHaveText('rationale:');
  expect(await problem.textContent()).not.toContain('`');
  await page.keyboard.press('Escape');
  await card(page, 'cynder-not-good').locator('.tl-card__chevron').click();
  const make = card(page, 'cynder-not-good').getByTestId('make-axiom');
  await expect(make).toHaveText('Move to axioms');
  expect(await make.getAttribute('title')).toContain('Move to axioms: adds axiom cynder_not_good.holds. Adds axiom cynder_not_good.holds : cynder_not_good');
  expect(await make.getAttribute('title')).not.toContain('`');
});

test('an empty board points to the A|P box', async ({ page }) => {
  const empty = { ...spyroGraph(), nodes: [], edges: [], vocabulary: [], diagnostics: [] };
  board = await openBoard(page, empty, 'light', { workspace: workspaceState({ subjects: [{ name: 'Spyro', nodeCount: 0 }] }) });
  // The Context Menu section (which replaced the tray) gives the first step.
  await expect(page.getByTestId('first-step')).toContainText('No cards yet: type something you believe in the box below and press Enter.');
  await expect(page.getByTestId('context-menu')).not.toContainText('Formalize');
  await expect(page.locator('.tl-axioms .tl-col__empty')).toHaveText('No axioms yet: type your first one in the box below');
  await expect(page.getByTestId('canvas-empty')).toHaveText(
    'No propositions yet: add one in the box below (choose Proposition), or right-click here and choose “New proposition here”.',
  );
  // No vocabulary at all: no band above the board.
  await expect(page.getByTestId('vocabulary')).toHaveCount(0);
  await page.screenshot({ path: shotPath('m1-fix-empty-board.png') });
});
