import { expect, test } from '@playwright/test';
import { largeGraph, spyroGraph, spyroProvedGraph } from '@telelean/core';
import { contributedColors, vscodeColorVariable } from '../shared/vscode-theme';
import {
  badgeReport,
  card,
  checkArrows,
  edgePairs,
  list,
  openBoard,
  posted,
  postedOfType,
  renderedDiagnostic,
  scrollTops,
  settle,
  shotPath,
  type OpenedBoard,
} from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  // Every test must finish without console errors, page errors or CSP violations.
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('renders the Spyro sample: sentence first, kind glyph, aura on formalised cards, dashed declared arrows', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');

  const ready = await postedOfType(page, 'ready');
  expect(ready).toEqual([{ v: 1, type: 'ready', payload: { lastVersion: null } }]);

  // Column membership and order.
  await expect(list(page, 'ASSUMPTION').locator('[data-node-id]')).toHaveCount(3);
  await expect(list(page, 'GOAL').locator('[data-node-id]')).toHaveCount(1);

  // The sentence is the first thing on the card; the kind glyph follows.
  const first = card(page, 'cynder-dark-past');
  const rowTexts = await first.locator('.tl-card__row > *').allTextContents();
  expect(rowTexts[0]).toBe('Cynder is a character who has a dark past');
  expect(rowTexts[1]).toBe('A');
  await expect(card(page, 'cynder-not-good').locator('.tl-glyph')).toHaveText('G');

  // Blue aura on formalised cards only.
  const shadow = (id: string) => card(page, id).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadow('cynder-dark-past')).not.toBe('none');
  expect(await shadow('cynder-dark-past')).toContain('rgb(55, 148, 255)'); // --vscode-charts-blue in the dark fixture
  expect(await shadow('cynder-not-good')).not.toBe('none');
  expect(await shadow('pg-no-dark-past')).toBe('none');
  await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-formal', 'informal');
  await expect(card(page, 'pg-no-dark-past').locator('.tl-chip--attention')).toHaveText('no source yet');

  // Three declared arrows into the goal: dashed, endpoints on the card edges.
  const paths = page.locator('path[data-edge-id]');
  await expect(paths).toHaveCount(3);
  for (const pattern of await paths.evaluateAll((els) => els.map((el) => el.getAttribute('data-pattern')))) expect(pattern).toBe('declared');
  const dash = await paths.first().evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect(dash).not.toBe('none');
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  expect(arrows.full).toBe(3);

  // The empty Derivations column shows an opaque placeholder (arrows that skip the column pass under it, as under a
  // card), centred in the column, away from the top where the arrows of a small graph run.
  const empty = list(page, 'DERIVATION').locator('.tl-col__empty');
  await expect(empty).toHaveText('No derivations yet');
  expect(await empty.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(31, 31, 31)'); // editor background
  const [emptyBox, dList] = [await empty.boundingBox(), await list(page, 'DERIVATION').boundingBox()];
  if (!emptyBox || !dList) throw new Error('missing boxes');
  expect(emptyBox.y).toBeGreaterThan(dList.y + dList.height / 3);

  // What the board reports to the host (the smoke test asserts the same fields inside VS Code).
  const rendered = await renderedDiagnostic(page);
  expect(rendered.payload.data).toMatchObject({ cards: 4, edges: 3, styled: true, aura: 'rgb(55, 148, 255)', kindA: 'rgb(177, 128, 215)' });
  expect((await postedOfType(page, 'diagnostic')).filter((m) => m.payload.level !== 'info')).toEqual([]);

  await page.screenshot({ path: shotPath('board-dark-spyro.png') });
});

test('"rendered" always describes the graph it names, and a graph replaced before it settled is not reported late', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  expect((await renderedDiagnostic(page)).payload.data).toMatchObject({ seq: 1, measuredSeq: 1, cards: 4 });

  // Two graphs back to back (#2 large, #3 Spyro proved). Whether #2 settles before #3 arrives depends on frame
  // timing; either way no report may mix them up, and none may arrive after the ~2 s give-up for a replaced graph.
  const nodes: Record<number, number> = { 1: 4, 2: largeGraph().nodes.length, 3: 4 };
  await page.evaluate(
    ([a, b]) => {
      window.__tlHarness.sendToWebview({ v: 1, type: 'graph', payload: { graph: a } });
      window.__tlHarness.sendToWebview({ v: 1, type: 'graph', payload: { graph: b } });
    },
    [largeGraph(), spyroProvedGraph()],
  );
  await expect.poll(async () => (await renderedDiagnostic(page)).payload.data?.seq).toBe(3);
  await page.waitForTimeout(2_500);
  const reports = (await postedOfType(page, 'diagnostic')).filter((m) => m.payload.code === 'rendered').map((m) => m.payload.data ?? {});
  for (const data of reports) {
    expect(data.measuredSeq, JSON.stringify(data)).toBe(data.seq);
    expect(data.cards, JSON.stringify(data)).toBe(nodes[Number(data.seq)]);
  }
  expect(new Set(reports.map((d) => d.seq)).size).toBe(reports.length); // at most one report per graph
  expect(reports.at(-1)).toMatchObject({ seq: 3, cards: 4, edges: 3 });
});

test('the colours the extension contributes reach the board under the variable names VS Code gives them', async ({ page }) => {
  // One distinctive colour per board colour id, set under the name VS Code 1.140 derives from the id. M1 adds
  // telelean.vocabulary and telelean.highlight (the extension's manifest may not contribute them yet: the board
  // reads them with fallbacks).
  const custom: Record<string, string> = {
    'telelean.formalizedAura': '#ff00ff',
    'telelean.kindAssumption': '#00ff00',
    'telelean.kindDerivation': '#00ffff',
    'telelean.kindGoal': '#ffff00',
    'telelean.vocabulary': '#ff8000',
    'telelean.highlight': '#123456',
  };
  const contributed = contributedColors().map((c) => c.id);
  expect(contributed).toEqual(expect.arrayContaining(['telelean.formalizedAura', 'telelean.kindAssumption', 'telelean.kindDerivation', 'telelean.kindGoal']));
  for (const id of contributed) expect(Object.keys(custom)).toContain(id);
  const vars = Object.fromEntries(Object.entries(custom).map(([id, colour]) => [vscodeColorVariable(id), colour]));
  board = await openBoard(page, spyroGraph(), 'dark', { vars, state: { vocabCollapsed: false } });
  // M1 colours: the Vocabulary group's accent, and the highlight flash (here from a card's "uses:" dropdown).
  expect(await page.locator('.tl-vocab__item').first().evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(255, 128, 0)');
  await card(page, 'cynder-dark-past').locator('.tl-uses__toggle').click();
  await page.getByTestId('uses-menu').locator('[data-vocab="Spyro.cynder"]').click();
  await expect(page.locator('.tl-vocab__item[data-vocab="Spyro.cynder"]')).toHaveAttribute('data-highlight', 'true');
  // The flash outlines the item in the highlight colour over a light tint of it (the item's text stays readable).
  const flashed = await page.locator('.tl-vocab__item[data-vocab="Spyro.cynder"]').evaluate((el) => ({ outline: getComputedStyle(el).outlineColor, tint: getComputedStyle(el).backgroundImage }));
  expect(flashed.outline).toBe('rgb(18, 52, 86)');
  expect(flashed.tint).toContain('color(srgb 0.0705882 0.203922 0.337255 / 0.16)'); // #123456 at 16 %

  expect(await card(page, 'cynder-dark-past').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(255, 0, 255)');
  expect(await page.locator('.tl-legend__aura').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(255, 0, 255)');
  const headerGlyph = (kind: string) =>
    page.locator(`.tl-col[data-kind="${kind}"] .tl-col__header .tl-glyph`).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await headerGlyph('ASSUMPTION')).toBe('rgb(0, 255, 0)');
  expect(await headerGlyph('DERIVATION')).toBe('rgb(0, 255, 255)');
  expect(await headerGlyph('GOAL')).toBe('rgb(255, 255, 0)');
  // The kind stripe on each card.
  expect(await card(page, 'cynder-dark-past').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(0, 255, 0)');
  expect(await card(page, 'cynder-not-good').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(255, 255, 0)');

  const rendered = await renderedDiagnostic(page);
  expect(rendered.payload.data).toMatchObject({
    aura: 'rgb(255, 0, 255)',
    kindA: 'rgb(0, 255, 0)',
    kindD: 'rgb(0, 255, 255)',
    kindG: 'rgb(255, 255, 0)',
    vocabulary: 'rgb(255, 128, 0)',
    highlight: 'rgb(18, 52, 86)',
  });
  expect(String(rendered.payload.data?.cardAura)).toContain('rgb(255, 0, 255)');
});

test('a stylesheet the CSP refuses while the page loads is reported through boot.js, and "rendered" says the board is unstyled', async ({ page }) => {
  // Negative control (no afterEach problem check: the violation is the point). blocked-style.html refuses webview.css
  // before the module bundle runs; only the classic boot script, loaded first, can see that.
  await page.addInitScript((g) => {
    window.__TL_HARNESS__ = { graph: g };
  }, spyroGraph());
  await page.goto('/harness/blocked-style.html');
  const rendered = await renderedDiagnostic(page);
  expect(rendered.payload.data).toMatchObject({ cards: 4, styled: false });
  const diagnostics = await postedOfType(page, 'diagnostic');
  const violations = diagnostics.filter((m) => m.payload.code === 'csp-violation');
  expect(violations).toHaveLength(1);
  expect(violations[0]?.payload).toMatchObject({ level: 'error', data: { directive: 'style-src-elem' } });
  expect(String(violations[0]?.payload.data?.blocked)).toMatch(/\/dist\/webview\.css$/);
  // It was buffered before the bundle ran and forwarded before "ready".
  const types = (await posted(page)).map((m) => (m.type === 'diagnostic' ? m.payload.code : m.type));
  expect(types.indexOf('csp-violation')).toBeLessThan(types.indexOf('ready'));
  expect(diagnostics.some((m) => m.payload.code === 'no-boot-script')).toBe(false);
});

test('the arrow checker used below is not vacuous: it reports an arrow moved 10 px off its card', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');
  expect((await checkArrows(page, edgePairs(graph))).problems).toEqual([]);
  // The engine only rewrites `d` when its own computed value changes, so this tampering stays in place.
  await page.locator('path[data-edge-id]').first().evaluate((path) => {
    const d = path.getAttribute('d') ?? '';
    path.setAttribute('d', d.replace(/^M(-?[\d.]+) /, (_, x: string) => `M${Number(x) + 10} `));
  });
  const report = await checkArrows(page, edgePairs(graph));
  expect(report.problems).toHaveLength(1);
  expect(report.problems[0]).toMatch(/start .* not on the source's right edge/);
});

test('verified dependencies are drawn solid', async ({ page }) => {
  const graph = spyroProvedGraph();
  board = await openBoard(page, graph, 'dark');
  const paths = page.locator('path[data-edge-id]');
  await expect(paths).toHaveCount(3);
  const styles = await paths.evaluateAll((els) => els.map((el) => [el.getAttribute('data-pattern'), getComputedStyle(el).strokeDasharray]));
  for (const [pattern, dash] of styles) {
    expect(pattern).toBe('verified');
    expect(dash).toBe('none');
  }
  await expect(card(page, 'cynder-not-good').locator('.tl-chip', { hasText: 'proved' })).toBeVisible();
});

test('scrolling one column leaves the other columns alone; arrows follow scrolling and resizing; off-screen ends become stubs', async ({ page }) => {
  const graph = largeGraph();
  const pairs = edgePairs(graph);
  board = await openBoard(page, graph, 'dark');

  const before = await scrollTops(page);
  expect(before).toEqual({ ASSUMPTION: 0, DERIVATION: 0, GOAL: 0 });
  let arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // Real wheel input over the Assumptions column: the overlay must not swallow it.
  const a = await list(page, 'ASSUMPTION').boundingBox();
  if (!a) throw new Error('no Assumptions column');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => (await scrollTops(page)).ASSUMPTION).toBeGreaterThan(300);
  await settle(page);
  let tops = await scrollTops(page);
  expect(tops.DERIVATION).toBe(0);
  expect(tops.GOAL).toBe(0);

  arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  expect(arrows.full).toBeGreaterThan(0);
  expect(arrows.stubs).toBeGreaterThan(0);
  const stubCount = await page.locator('path[data-edge-id][data-stub]').count();
  expect(stubCount).toBe(arrows.stubs);
  await expect(page.locator('.tl-badge:not([hidden])').first()).toBeVisible();

  // Scroll the Derivations column too: Assumptions keeps its position, Goals stays at the top.
  const d = await list(page, 'DERIVATION').boundingBox();
  if (!d) throw new Error('no Derivations column');
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(async () => (await scrollTops(page)).DERIVATION).toBeGreaterThan(200);
  await settle(page);
  const after = await scrollTops(page);
  expect(after.ASSUMPTION).toBe(tops.ASSUMPTION);
  expect(after.GOAL).toBe(0);
  arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  await page.screenshot({ path: shotPath('board-dark-large-scrolled.png') });

  // Resizing re-measures (ResizeObserver) and the arrows follow.
  await page.setViewportSize({ width: 980, height: 640 });
  await settle(page);
  await settle(page);
  arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  tops = await scrollTops(page);
  expect(tops.GOAL).toBe(0);
});

test('"n linked" buttons sit in the column header (▲) and footer (▼), cover no card, and scroll only their own column', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the button scrolls instantly instead of smoothly
  const graph = largeGraph();
  board = await openBoard(page, graph, 'dark');
  await list(page, 'ASSUMPTION').evaluate((el) => {
    el.scrollTop = 600;
  });
  await settle(page);
  await settle(page);

  const report = await badgeReport(page);
  expect(report.problems).toEqual([]);
  expect(report.badges.map((b) => b.key)).toEqual(expect.arrayContaining(['ASSUMPTION:up', 'ASSUMPTION:down', 'GOAL:down']));

  // ▼ in the Goals footer: Goals scrolls until the nearest hidden linked card is in view; the other columns stay.
  const target = report.hiddenEnds['GOAL:down']?.[0];
  if (!target) throw new Error('no hidden linked Goals card below the fold');
  const before = await scrollTops(page);
  await page.locator('.tl-col[data-kind="GOAL"] .tl-col__footer .tl-badge').click();
  await expect
    .poll(() =>
      card(page, target).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const v = (el.closest('.tl-col__list') as HTMLElement).getBoundingClientRect();
        return r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
      }),
    )
    .toBe(true);
  const after = await scrollTops(page);
  expect(after.GOAL).toBeGreaterThan(before.GOAL ?? 0);
  expect(after.ASSUMPTION).toBe(before.ASSUMPTION);
  expect(after.DERIVATION).toBe(before.DERIVATION);
  await settle(page);
  await settle(page);
  expect((await badgeReport(page)).problems).toEqual([]);
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // A narrow board shortens the column titles, not the buttons, and the buttons still cover nothing.
  await page.setViewportSize({ width: 700, height: 520 });
  await settle(page);
  await settle(page);
  const narrow = await badgeReport(page);
  expect(narrow.problems).toEqual([]);
  expect(narrow.badges.length).toBeGreaterThan(0);
});

test('dragging an Assumptions card onto Goals highlights the drop zone, moves the card and posts kindChange', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');

  const source = card(page, 'pg-no-dark-past');
  const from = await source.boundingBox();
  const goals = await list(page, 'GOAL').boundingBox();
  if (!from || !goals) throw new Error('missing boxes');

  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 30, from.y + 20, { steps: 4 });
  await page.mouse.move(goals.x + goals.width / 2, goals.y + goals.height - 60, { steps: 12 });
  // While dragging: the column under the pointer is the active drop zone, the other one is a labelled candidate.
  await expect(page.locator('.tl-col[data-kind="GOAL"]')).toHaveAttribute('data-drop', 'active');
  await expect(page.locator('.tl-col[data-kind="DERIVATION"]')).toHaveAttribute('data-drop', 'candidate');
  await expect(page.locator('.tl-col[data-kind="GOAL"] .tl-col__drop-label')).toHaveText('Drop to make Goal');
  await page.mouse.up();

  await expect(list(page, 'GOAL').locator('[data-node-id="pg-no-dark-past"]')).toHaveCount(1);
  await expect(list(page, 'ASSUMPTION').locator('[data-node-id="pg-no-dark-past"]')).toHaveCount(0);
  await expect(page.locator('.tl-col[data-drop]')).toHaveCount(0);
  const changes = await postedOfType(page, 'kindChange');
  // M1: every mutation carries a request id (the host answers with an actionResult).
  expect(changes).toEqual([{ v: 1, type: 'kindChange', payload: { id: 'pg-no-dark-past', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, requestId: 'r1' } }]);

  // The arrow into the goal is now a within-column arrow through the gutter, still attached to the card edges.
  await settle(page);
  await settle(page);
  let arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // Dropping onto the upper half of a card inserts above it (closest-edge hitbox) and says so in beforeId.
  const second = await card(page, 'new-spyro-pg').boundingBox();
  const over = await card(page, 'cynder-not-good').boundingBox();
  if (!second || !over) throw new Error('missing boxes');
  await page.mouse.move(second.x + second.width / 2, second.y + 12);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2 + 30, second.y + 20, { steps: 4 });
  await page.mouse.move(over.x + over.width / 2, over.y + 8, { steps: 12 });
  await expect(card(page, 'cynder-not-good')).toHaveAttribute('data-drop-edge', 'top');
  await page.mouse.up();
  await expect(list(page, 'GOAL').locator('[data-node-id]')).toHaveCount(3);
  const goalOrder = await list(page, 'GOAL').locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')));
  expect(goalOrder).toEqual(['new-spyro-pg', 'cynder-not-good', 'pg-no-dark-past']);
  expect((await postedOfType(page, 'kindChange')).at(-1)).toEqual({
    v: 1,
    type: 'kindChange',
    payload: { id: 'new-spyro-pg', from: 'ASSUMPTION', to: 'GOAL', beforeId: 'cynder-not-good', requestId: 'r2' },
  });
  await settle(page);
  await settle(page);
  arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
});

test('click selects, Ctrl/Cmd-click multi-selects, the tray counts and "These suffice" posts startRun with the selected ids', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'light');

  await card(page, 'cynder-dark-past').click();
  await expect(page.getByTestId('tray-count')).toHaveText('1 selected');
  await card(page, 'new-spyro-pg').click(); // plain click replaces the selection
  await expect(page.getByTestId('tray-count')).toHaveText('1 selected');
  await expect(card(page, 'cynder-dark-past')).not.toHaveAttribute('data-selected', /.*/);
  await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-selected', 'true');

  await card(page, 'cynder-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('tray-count')).toHaveText('3 selected');
  const suffice = page.getByRole('button', { name: /These suffice/ });
  await expect(suffice).toBeDisabled(); // no target yet
  await card(page, 'cynder-not-good').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('tray-count')).toHaveText('4 selected');
  await expect(page.locator('.tl-chipcard[data-role="premise"]')).toHaveCount(3);
  await expect(page.getByTestId('tray-target').locator('.tl-chipcard')).toHaveAttribute('data-id', 'cynder-not-good');

  // Ctrl/Cmd-click toggles a card off again, and back on.
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('tray-count')).toHaveText('3 selected');
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('tray-count')).toHaveText('4 selected');

  // The selection keeps click order, so the re-added card is now last.
  const selects = await postedOfType(page, 'select');
  expect(selects.at(-1)?.payload.ids).toEqual(['new-spyro-pg', 'cynder-dark-past', 'cynder-not-good', 'pg-no-dark-past']);

  // Selected cards' arrows are highlighted.
  await settle(page);
  expect(await page.locator('path.tl-edge--focus').count()).toBe(3);

  await card(page, 'cynder-dark-past').locator('.tl-card__chevron').click();
  await settle(page);
  await page.screenshot({ path: shotPath('board-light-spyro-selection.png') });

  await expect(suffice).toBeEnabled();
  await suffice.click();
  // M2: "These suffice ▶" asks Claude to prove the target from exactly these premises (the host declares them first).
  const sent = await postedOfType(page, 'startRun');
  expect(sent).toEqual([
    {
      v: 1,
      type: 'startRun',
      payload: { target: 'cynder-not-good', premises: ['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past'], requestId: 'r1' },
    },
  ]);
  expect(await postedOfType(page, 'theseSuffice')).toEqual([]);
});

test('the A|D|G box adds a card to the chosen column and posts addNode', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');
  const input = page.getByRole('textbox', { name: /New assumption/ });

  await page.getByRole('radio', { name: 'Goal' }).click();
  await expect(page.getByRole('radio', { name: 'Goal' })).toHaveAttribute('aria-checked', 'true');
  const goalInput = page.getByRole('textbox', { name: /New goal/ });
  await goalInput.fill('Cynder should get her own spin-off');
  await expect(page.getByRole('button', { name: 'Add goal' })).toBeEnabled();
  await goalInput.press('Enter');
  await expect(list(page, 'GOAL').locator('[data-node-id]')).toHaveCount(2);
  await expect(list(page, 'GOAL').locator('[data-node-id]').last()).toContainText('Cynder should get her own spin-off');
  await expect(goalInput).toHaveValue('');

  await page.getByRole('radio', { name: 'Derivation' }).click();
  await page.getByRole('textbox', { name: /New derivation/ }).fill('Cynder cannot appear in a PG game');
  await page.getByRole('textbox', { name: /New derivation/ }).press('Enter');
  await expect(list(page, 'DERIVATION').locator('[data-node-id]')).toHaveCount(1);

  const added = await postedOfType(page, 'addNode');
  expect(added).toEqual([
    { v: 1, type: 'addNode', payload: { clientId: 'cynder-should-get-her-own-spin', type: 'GOAL', naturalName: 'Cynder should get her own spin-off', requestId: 'r1' } },
    { v: 1, type: 'addNode', payload: { clientId: 'cynder-cannot-appear-in-a-pg', type: 'DERIVATION', naturalName: 'Cynder cannot appear in a PG game', requestId: 'r2' } },
  ]);
  // New cards are comment-only: no aura.
  await expect(card(page, 'cynder-should-get-her-own-spin')).toHaveAttribute('data-formal', 'informal');
  await expect(input).toHaveCount(0); // the box now names the derivation kind
});

test('the chevron expands a card to show its Lean code without selecting it', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');

  await card(page, 'cynder-dark-past').locator('.tl-card__chevron').click();
  const code = card(page, 'cynder-dark-past').getByTestId('lean-code');
  await expect(code).toBeVisible();
  await expect(code).toContainText('abbrev cynder_dark_past : Prop := HasDarkPast cynder');
  await expect(code).toContainText('axiom cynder_dark_past.holds : cynder_dark_past');
  await expect(card(page, 'cynder-dark-past').locator('.tl-card__chevron')).toHaveAttribute('aria-expanded', 'true');
  expect(await postedOfType(page, 'select')).toEqual([]);

  await card(page, 'pg-no-dark-past').locator('.tl-card__chevron').click();
  await expect(card(page, 'pg-no-dark-past').getByTestId('lean-code')).toContainText('No Lean code yet');

  // Expanding changed card heights: the arrows were re-measured.
  await settle(page);
  await settle(page);
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  await card(page, 'cynder-dark-past').locator('.tl-card__chevron').click();
  await expect(card(page, 'cynder-dark-past').getByTestId('lean-code')).toHaveCount(0);
});

test('high contrast replaces the aura glow with an outline', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'hc');
  const style = await card(page, 'cynder-dark-past').evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, outline: s.outlineStyle, outlineColor: s.outlineColor };
  });
  expect(style.shadow).toBe('none');
  expect(style.outline).toBe('solid');
  expect(style.outlineColor).toBe('rgb(55, 148, 255)');
  expect((await posted(page)).some((m) => m.type === 'ready')).toBe(true);
});
