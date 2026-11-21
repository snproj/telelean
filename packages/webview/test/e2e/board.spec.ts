import { expect, test } from '@playwright/test';
import { AXIOM_DROP_REFUSAL, AXIOM_TO_PROPOSITION_REFUSAL, largeGraph, spyroGraph, spyroProvedGraph } from '@telelean/core';
import { contributedColors, vscodeColorVariable } from '../shared/vscode-theme';
import {
  badgeReport,
  boardMenu,
  canvas,
  canvasPoint,
  canvasView,
  card,
  cardPoint,
  checkArrows,
  columnPoint,
  columnScroll,
  dragCard,
  edgePairs,
  inView,
  list,
  menuItem,
  openBoard,
  order,
  posted,
  postedOfType,
  renderedDiagnostic,
  rightClick,
  settle,
  shotPath,
  viewSettled,
  type OpenedBoard,
} from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  // Every test must finish without console errors, page errors or CSP violations.
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('renders the Spyro sample: the AXIOMS column and the canvas, sentence first, kind glyph, aura on formalised cards, dotted declared arrows', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');

  const ready = await postedOfType(page, 'ready');
  expect(ready).toEqual([{ v: 1, type: 'ready', payload: { lastVersion: null } }]);

  // Spec v4 BD-1: the axioms in the AXIOMS column (in the files' order), the proposition on the canvas.
  expect(await order(page, 'AXIOM')).toEqual(['pg-no-dark-past', 'cynder-dark-past', 'new-spyro-pg']);
  expect(await order(page, 'PROPOSITION')).toEqual(['cynder-not-good']);
  await expect(page.locator('.tl-axioms .tl-col__title')).toHaveText('Axioms');
  await expect(page.locator('.tl-axioms .tl-col__count')).toHaveText('3');
  // The column's header also counts what is assumed outside it (BD-1): here the two existence presuppositions.
  await expect(page.locator('.tl-axioms')).toContainText(/also assumed:\s*2 existence assumptions/);

  // The sentence is the first thing on the card; the kind glyph follows (A, P).
  const first = card(page, 'cynder-dark-past');
  const rowTexts = await first.locator('.tl-card__row > *').allTextContents();
  expect(rowTexts[0]).toBe('Cynder is a character who has a dark past');
  expect(rowTexts[1]).toBe('A');
  await expect(card(page, 'cynder-not-good').locator('.tl-glyph')).toHaveText('P');
  await expect(card(page, 'cynder-not-good')).toHaveAttribute('data-place', 'canvas');

  // Blue aura on formalised cards only.
  const shadow = (id: string) => card(page, id).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadow('cynder-dark-past')).not.toBe('none');
  expect(await shadow('cynder-dark-past')).toContain('rgb(55, 148, 255)'); // --vscode-charts-blue in the dark fixture
  expect(await shadow('cynder-not-good')).not.toBe('none');
  expect(await shadow('pg-no-dark-past')).toBe('none');
  await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-formal', 'informal');
  await expect(card(page, 'pg-no-dark-past').locator('.tl-chip--attention')).toHaveText('no source yet');

  // Three declared arrows into the proposition: dotted (round dots), the ends on the card edges.
  const paths = page.locator('path[data-edge-id]');
  await expect(paths).toHaveCount(3);
  for (const pattern of await paths.evaluateAll((els) => els.map((el) => el.getAttribute('data-pattern')))) expect(pattern).toBe('declared');
  const line = await paths.first().evaluate((el) => ({ dash: getComputedStyle(el).strokeDasharray, cap: getComputedStyle(el).strokeLinecap }));
  expect(line.dash).not.toBe('none');
  expect(line.cap).toBe('round');
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  expect(arrows.full).toBe(3);

  // What the board reports to the host (the smoke test asserts the same fields inside VS Code).
  const rendered = await renderedDiagnostic(page);
  expect(rendered.payload.data).toMatchObject({ cards: 4, edges: 3, styled: true, aura: 'rgb(55, 148, 255)', kindA: 'rgb(177, 128, 215)', kindP: 'rgb(209, 134, 22)' });
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
  // One distinctive colour per board colour id, set under the name VS Code 1.140 derives from the id (spec v4: the two
  // kinds' stripes and telelean.proved, the green of the established glow and the band).
  const custom: Record<string, string> = {
    'telelean.formalizedAura': '#ff00ff',
    'telelean.kindAxiom': '#00ff00',
    'telelean.kindProposition': '#ffff00',
    'telelean.proved': '#00ffff',
    'telelean.vocabulary': '#ff8000',
    'telelean.highlight': '#123456',
  };
  const contributed = contributedColors().map((c) => c.id);
  expect(contributed).toEqual(expect.arrayContaining(Object.keys(custom)));
  for (const id of contributed) expect(Object.keys(custom)).toContain(id);
  const vars = Object.fromEntries(Object.entries(custom).map(([id, colour]) => [vscodeColorVariable(id), colour]));
  board = await openBoard(page, spyroProvedGraph(), 'dark', { vars, state: { vocabCollapsed: false } });
  // M1 colours: the Vocabulary items' accent, and the highlight flash (here from a card's "uses:" dropdown).
  expect(await page.locator('.tl-vocab__item').first().evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe('rgb(255, 128, 0)');
  await card(page, 'cynder-dark-past').locator('.tl-uses__toggle').click();
  await page.getByTestId('uses-menu').locator('[data-vocab="Spyro.cynder"]').click();
  await expect(page.locator('.tl-vocab__item[data-vocab="Spyro.cynder"]')).toHaveAttribute('data-highlight', 'true');
  // The flash outlines the item in the highlight colour over a light tint of it (the item's text stays readable).
  const flashed = await page.locator('.tl-vocab__item[data-vocab="Spyro.cynder"]').evaluate((el) => ({ outline: getComputedStyle(el).outlineColor, tint: getComputedStyle(el).backgroundImage }));
  expect(flashed.outline).toBe('rgb(18, 52, 86)');
  expect(flashed.tint).toContain('color(srgb 0.0705882 0.203922 0.337255 / 0.16)'); // #123456 at 16 %

  // The blue aura on a formalised axiom, the green glow on the established proposition, and the legend's swatches.
  expect(await card(page, 'cynder-dark-past').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(255, 0, 255)');
  expect(await card(page, 'cynder-not-good').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(0, 255, 255)');
  expect(await page.locator('.tl-legend__aura').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(255, 0, 255)');
  expect(await page.locator('.tl-legend__glow').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(0, 255, 255)');
  expect(await page.locator('.tl-axioms .tl-col__header .tl-glyph').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 255, 0)');
  // The kind stripe and glyph on each card.
  expect(await card(page, 'cynder-dark-past').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(0, 255, 0)');
  expect(await card(page, 'cynder-not-good').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(255, 255, 0)');
  expect(await card(page, 'cynder-not-good').locator('.tl-glyph').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 0)');

  const rendered = await renderedDiagnostic(page);
  expect(rendered.payload.data).toMatchObject({
    aura: 'rgb(255, 0, 255)',
    kindA: 'rgb(0, 255, 0)',
    kindP: 'rgb(255, 255, 0)',
    proved: 'rgb(0, 255, 255)',
    vocabulary: 'rgb(255, 128, 0)',
    highlight: 'rgb(18, 52, 86)',
  });
  expect(String(rendered.payload.data?.cardAura)).toContain('rgb(255, 0, 255)');
  expect(String(rendered.payload.data?.cardEstablished)).toContain('rgb(0, 255, 255)');
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
  expect(report.problems[0]).toMatch(/start .* not on a side edge of the source/);
});

test('verified dependencies are drawn solid; the established proposition says so', async ({ page }) => {
  const graph = spyroProvedGraph();
  board = await openBoard(page, graph, 'dark');
  const paths = page.locator('path[data-edge-id]');
  await expect(paths).toHaveCount(3);
  const styles = await paths.evaluateAll((els) => els.map((el) => [el.getAttribute('data-pattern'), getComputedStyle(el).strokeDasharray]));
  for (const [pattern, dash] of styles) {
    expect(pattern).toBe('verified');
    expect(dash).toBe('none');
  }
  await expect(card(page, 'cynder-not-good').locator('[data-chip="established"]')).toHaveText('✓ established');
  expect((await checkArrows(page, edgePairs(graph))).problems).toEqual([]);
});

test('scrolling the AXIOMS column leaves the canvas alone, the wheel over the canvas zooms it; arrows follow scrolling, zooming and resizing; ends out of view are cut', async ({ page }) => {
  const graph = largeGraph();
  const pairs = edgePairs(graph);
  board = await openBoard(page, graph, 'dark');

  expect(await columnScroll(page)).toBe(0);
  const view = await canvasView(page);
  let arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // Real wheel input over the AXIOMS column scrolls it (the overlay must not swallow it); the canvas does not move.
  const a = await list(page, 'AXIOM').boundingBox();
  if (!a) throw new Error('no AXIOMS column');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => columnScroll(page)).toBeGreaterThan(300);
  await settle(page);
  expect(await canvasView(page)).toEqual(view);

  arrows = await checkArrows(page, pairs);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  expect(arrows.full).toBeGreaterThan(0);
  expect(arrows.stubs).toBeGreaterThan(0);
  const stubCount = await page.locator('path[data-edge-id][data-stub]').count();
  expect(stubCount).toBe(arrows.stubs);
  await expect(page.locator('.tl-badge:not([hidden])').first()).toBeVisible();

  // The wheel over the canvas zooms it: the column keeps its scroll position; the arrows follow.
  const scrolled = await columnScroll(page);
  const at = await canvasPoint(page, 0.5, 0.5);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await canvasView(page)).s).toBeLessThan(view.s);
  await settle(page);
  expect(await columnScroll(page)).toBe(scrolled);
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
});

test('"n linked" buttons: the column’s in its header (▲) and footer (▼), covering no card, scrolling only the column; the canvas’s at its edges (BD-4)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the button scrolls instantly instead of smoothly
  const graph = largeGraph();
  board = await openBoard(page, graph, 'dark');
  await list(page, 'AXIOM').evaluate((el) => {
    el.scrollTop = 600;
  });
  await settle(page);
  await settle(page);

  const report = await badgeReport(page);
  expect(report.problems).toEqual([]);
  expect(report.badges.map((b) => b.key)).toEqual(expect.arrayContaining(['column:up', 'column:down']));

  // ▼ in the column's footer: the column scrolls until the nearest hidden linked card is in view; the canvas stays.
  const target = report.hiddenEnds['column:down']?.[0];
  if (!target) throw new Error('no hidden linked axiom below the fold');
  const before = await columnScroll(page);
  const view = await canvasView(page);
  await page.locator('.tl-axioms .tl-col__footer .tl-badge').click();
  await expect.poll(() => inView(page, `[data-node-id="${target}"]`)).toBe(true);
  expect(await columnScroll(page)).toBeGreaterThan(before);
  expect(await canvasView(page)).toEqual(view);
  await settle(page);
  await settle(page);
  expect((await badgeReport(page)).problems).toEqual([]);
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // Zoomed in on the canvas, cards leave the view: their arrows are cut at the canvas edges, which get their buttons.
  await canvas(page).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await settle(page);
  await settle(page);
  const zoomed = await badgeReport(page);
  expect(zoomed.problems).toEqual([]);
  expect(zoomed.badges.some((b) => b.key.startsWith('canvas:'))).toBe(true);

  // A narrow board shortens the column title, not the buttons, and the buttons still cover nothing.
  await page.setViewportSize({ width: 700, height: 520 });
  await settle(page);
  await settle(page);
  const narrow = await badgeReport(page);
  expect(narrow.problems).toEqual([]);
  expect(narrow.badges.length).toBeGreaterThan(0);
});

test('drags: a proposition dropped on the AXIOMS column runs "Move to axioms"; an axiom dropped on the canvas is refused; within the column a drop re-orders (AR-6, AR-7, D-17)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');

  // A proposition moved over the column: the column is the drop zone and states the impact; the release asks first.
  await dragCard(page, 'cynder-not-good', await columnPoint(page), async () => {
    await expect(page.locator('.tl-axioms')).toHaveAttribute('data-drop', /.+/);
    await expect(page.locator('.tl-axioms .tl-col__drop-label')).toHaveText('Drop to move to axioms');
    await expect(page.locator('.tl-dropzone[data-kind="AXIOM"] .tl-dropzone__summary')).toHaveText('Move to axioms: adds axiom cynder_not_good.holds');
    await expect(page.locator('.tl-dropzone[data-kind="AXIOM"] .tl-dropzone__detail')).toContainText('Its 3 incoming arrows are removed.');
  });
  await expect(page.locator('.tl-dropzone')).toHaveCount(0);
  const dialog = page.getByTestId('dialog-rationale');
  await expect(dialog).toBeVisible();
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  await dialog.getByRole('button', { name: 'Skip' }).click();
  // M1: every mutation carries a request id (the host answers with an actionResult).
  expect(await postedOfType(page, 'kindChange')).toEqual([{ v: 1, type: 'kindChange', payload: { id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1' } }]);
  await expect(list(page, 'AXIOM').locator('[data-node-id="cynder-not-good"]')).toHaveCount(1);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id]')).toHaveCount(0);
  // Its arrows went with its premises (AR-7); nothing else is drawn.
  await expect(page.locator('path[data-edge-id]')).toHaveCount(0);

  // An axiom dragged onto the canvas: the canvas refuses it and says how to make it a proposition; nothing is posted.
  await dragCard(page, 'pg-no-dark-past', await canvasPoint(page, 0.5, 0.6), async () => {
    await expect(page.locator('.tl-canvas')).toHaveAttribute('data-drop', 'active');
    const zone = page.locator('.tl-dropzone[data-kind="PROPOSITION"]');
    await expect(zone).toHaveAttribute('data-refused', 'true');
    await expect(zone.locator('.tl-dropzone__summary')).toHaveText(AXIOM_DROP_REFUSAL);
    await expect(zone.locator('.tl-dropzone__detail')).toHaveText(AXIOM_TO_PROPOSITION_REFUSAL);
  });
  await expect(page.getByTestId('toast').filter({ hasText: AXIOM_TO_PROPOSITION_REFUSAL })).toHaveAttribute('data-level', 'info');
  expect(await postedOfType(page, 'kindChange')).toHaveLength(1);
  await expect(list(page, 'AXIOM').locator('[data-node-id="pg-no-dark-past"]')).toHaveCount(1);

  // Within the column, dropping onto the upper half of a card inserts above it (closest-edge hitbox): beforeId.
  const over = await card(page, 'cynder-dark-past').boundingBox();
  if (!over) throw new Error('no box');
  await dragCard(page, 'new-spyro-pg', { x: over.x + over.width / 2, y: over.y + 8 }, async () => {
    await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-drop-edge', 'top');
  });
  expect(await order(page, 'AXIOM')).toEqual(['pg-no-dark-past', 'new-spyro-pg', 'cynder-dark-past', 'cynder-not-good']);
  expect((await postedOfType(page, 'reorder')).map((m) => m.payload)).toEqual([{ id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'cynder-dark-past', requestId: 'r2' }]);
});

test('click selects, Ctrl/Cmd-click multi-selects, the Context Menu section counts; the selected cards’ arrows are highlighted; Formalize posts startRun with the selected arrows', async ({ page }) => {
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'light');
  const summary = page.getByTestId('context-summary');

  await card(page, 'cynder-dark-past').click();
  await expect(summary).toHaveText('“Cynder is a character who has a dark pa…”');
  await card(page, 'new-spyro-pg').click(); // plain click replaces the selection
  await expect(summary).toHaveText('“The new Spyro game is PG”');
  await expect(card(page, 'cynder-dark-past')).not.toHaveAttribute('data-selected', /.*/);
  await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-selected', 'true');

  await card(page, 'cynder-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(summary).toHaveText('3 cards');
  await card(page, 'cynder-not-good').click({ modifiers: ['ControlOrMeta'] });
  await expect(summary).toHaveText('4 cards');

  // Ctrl/Cmd-click toggles a card off again, and back on.
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(summary).toHaveText('3 cards');
  await card(page, 'pg-no-dark-past').click({ modifiers: ['ControlOrMeta'] });
  await expect(summary).toHaveText('4 cards');

  // The selection keeps click order, so the re-added card is now last.
  const selects = await postedOfType(page, 'select');
  expect(selects.at(-1)?.payload.ids).toEqual(['new-spyro-pg', 'cynder-dark-past', 'cynder-not-good', 'pg-no-dark-past']);

  // Selected cards' arrows are highlighted.
  await settle(page);
  expect(await page.locator('path.tl-edge--focus').count()).toBe(3);

  await card(page, 'cynder-dark-past').locator('.tl-card__chevron').click();
  await settle(page);
  await page.screenshot({ path: shotPath('board-light-spyro-selection.png') });

  // Cards are no question (spec v4.1 ES-2): Formalize asks about the arrows. The proposition's right-click menu
  // selects its incoming arrows; Formalize then asks Claude to prove it from exactly their sources.
  const formalize = page.getByTestId('formalize');
  await expect(formalize).toBeDisabled();
  await rightClick(page, await cardPoint(page, 'cynder-not-good'));
  await menuItem(page, 'select-incoming').click();
  await expect(boardMenu(page)).toHaveCount(0);
  await expect(summary).toHaveText('3 arrows into “Cynder would not be a good addition to …”');
  await expect(formalize).toBeEnabled();
  await formalize.click();
  const sent = await postedOfType(page, 'startRun');
  expect(sent).toEqual([
    {
      v: 1,
      type: 'startRun',
      payload: { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], requestId: 'r1' },
    },
  ]);
  expect(await postedOfType(page, 'theseSuffice')).toEqual([]);
});

test('the A|P box adds a proposition to the canvas (in view) and an axiom to the column, and posts addNode', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const graph = spyroGraph();
  board = await openBoard(page, graph, 'dark');
  const input = page.getByRole('textbox', { name: /New axiom/ });

  await page.getByRole('radio', { name: 'Proposition' }).click();
  await expect(page.getByRole('radio', { name: 'Proposition' })).toHaveAttribute('aria-checked', 'true');
  const propositionInput = page.getByRole('textbox', { name: /New proposition/ });
  await propositionInput.fill('Cynder should get her own spin-off');
  await expect(page.getByRole('button', { name: 'Add proposition' })).toBeEnabled();
  await propositionInput.press('Enter');
  await expect(list(page, 'PROPOSITION').locator('[data-node-id]')).toHaveCount(2);
  await expect(card(page, 'cynder-should-get-her-own-spin')).toContainText('Cynder should get her own spin-off');
  await expect(card(page, 'cynder-should-get-her-own-spin')).toHaveAttribute('data-place', 'canvas');
  await expect(propositionInput).toHaveValue('');
  await viewSettled(page);
  expect(await inView(page, '[data-node-id="cynder-should-get-her-own-spin"]')).toBe(true); // BD-8: placed in view

  await page.getByRole('radio', { name: 'Axiom' }).click();
  await page.getByRole('textbox', { name: /New axiom/ }).fill('Cynder cannot appear in a PG game');
  await page.getByRole('textbox', { name: /New axiom/ }).press('Enter');
  await expect(list(page, 'AXIOM').locator('[data-node-id]')).toHaveCount(4);
  await expect(list(page, 'AXIOM').locator('[data-node-id]').last()).toContainText('Cynder cannot appear in a PG game');

  const added = (await postedOfType(page, 'addNode')).map((m) => m.payload);
  expect(added).toHaveLength(2);
  // A proposition is stored with its place on the canvas (one Undo step, BD-8); an axiom has none.
  expect(added[0]).toMatchObject({ clientId: 'cynder-should-get-her-own-spin', type: 'PROPOSITION', naturalName: 'Cynder should get her own spin-off', requestId: 'r1' });
  expect(Number.isInteger(added[0]?.position?.x) && Number.isInteger(added[0]?.position?.y)).toBe(true);
  expect(added[1]).toEqual({ clientId: 'cynder-cannot-appear-in-a-pg', type: 'AXIOM', naturalName: 'Cynder cannot appear in a PG game', requestId: 'r2' });
  // New cards are comment-only: no aura.
  await expect(card(page, 'cynder-should-get-her-own-spin')).toHaveAttribute('data-formal', 'informal');
  await expect(input).toHaveCount(1); // the box names the axiom kind again
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
