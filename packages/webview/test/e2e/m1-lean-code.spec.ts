/**
 * The expanded Lean code (the user's turn-9 requests): text selection instead of dragging (AT6.16, request 1), the
 * Copy button (AT6.18, request 3), identifier glosses and click-to-highlight (AT6.19, request 4).
 */
import { expect, test } from '@playwright/test';
import { SPYRO_LEAN, spyroGraph, spyroProvedGraph } from '@telelean/core';
import { card, dragCard, inView, list, openBoard, order, panToShow, posted, postedOfType, seenAttribute, settle, shotPath, watchAttribute, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.16 a mouse drag across the expanded code selects text and never drags the card (request 1)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  // Something is selected first, to show that nothing in the code changes the selection.
  await card(page, 'new-spyro-pg').click();
  const summary = page.getByTestId('context-summary');
  await expect(summary).toHaveText('“The new Spyro game is PG”');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  const code = dark.getByTestId('lean-code');
  await expect(code).toContainText('abbrev cynder_dark_past');
  await code.scrollIntoViewIfNeeded();
  await watchAttribute(page, '[data-node-id]', 'data-dragging');
  await watchAttribute(page, '.tl-board', 'data-dragging');
  await watchAttribute(page, '.tl-col', 'data-drop');
  await watchAttribute(page, '.tl-canvas', 'data-drop');
  const before = await posted(page);

  // Press near the start of the second line, drag to the end of the code, release.
  const box = await code.boundingBox();
  if (!box) throw new Error('no code box');
  await page.mouse.move(box.x + 10, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 5 });
  await page.mouse.move(box.x + box.width - 12, box.y + box.height - 10, { steps: 10 });
  await page.mouse.up();
  await settle(page);

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selected.length).toBeGreaterThan(10);
  expect(selected).toContain('cynder_dark_past.holds');
  expect(SPYRO_LEAN.cynderDarkPast.replace(/\s+/g, ' ')).toContain(selected.replace(/\s+/g, ' ').trim());
  // No drag happened: no data-dragging on a card or the board, no drop zones, nothing posted.
  expect(await seenAttribute(page, '[data-node-id]', 'data-dragging')).toBe(false);
  expect(await seenAttribute(page, '.tl-board', 'data-dragging')).toBe(false);
  expect(await seenAttribute(page, '.tl-col', 'data-drop')).toBe(false);
  expect(await seenAttribute(page, '.tl-canvas', 'data-drop')).toBe(false);
  const after = await posted(page);
  expect(after.slice(before.length).filter((m) => m.type !== 'diagnostic')).toEqual([]);
  // The selection (the Context Menu section) is unchanged and the card is still where it was, expanded.
  await expect(summary).toHaveText('“The new Spyro game is PG”');
  await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-selected', 'true');
  await expect(dark).not.toHaveAttribute('data-selected', /.*/);
  await expect(list(page, 'AXIOM').locator('[data-node-id="cynder-dark-past"]')).toHaveCount(1);
  await expect(dark.locator('.tl-card__chevron')).toHaveAttribute('aria-expanded', 'true');
  await expect(dark).toHaveAttribute('draggable', 'true'); // restored at pointerup
  await page.screenshot({ path: shotPath('m1-code-selection.png') });

  // A plain click in the code (not on an identifier) changes nothing either.
  const keyword = await page.evaluate(() => {
    const pre = document.querySelector('[data-node-id="cynder-dark-past"] pre.tl-lean');
    const walker = document.createTreeWalker(pre as Node, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf('abbrev') ?? -1;
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 6);
        const r = range.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (!keyword) throw new Error('no "abbrev" in the code');
  const count = (await posted(page)).length;
  await page.mouse.click(keyword.x, keyword.y);
  await settle(page);
  expect((await posted(page)).slice(count).filter((m) => m.type !== 'diagnostic')).toEqual([]);
  await expect(summary).toHaveText('“The new Spyro game is PG”');
  await expect(dark.locator('.tl-card__chevron')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-highlight]')).toHaveCount(0);

  // Dragging the card by its face still works afterwards (draggable was restored): a re-order within the column.
  const first = await card(page, 'pg-no-dark-past').boundingBox();
  if (!first) throw new Error('no box');
  await dragCard(page, 'cynder-dark-past', { x: first.x + first.width / 2, y: first.y + 6 });
  expect(await order(page, 'AXIOM')).toEqual(['cynder-dark-past', 'pg-no-dark-past', 'new-spyro-pg']);
  expect((await postedOfType(page, 'reorder')).map((m) => m.payload)).toEqual([{ id: 'cynder-dark-past', column: 'AXIOM', beforeId: 'pg-no-dark-past', requestId: 'r1' }]);
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
});

test('AT6.18 the Copy button posts exactly lean.code and the "Copied" notice shows (request 3)', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'light');
  const goal = card(page, 'cynder-not-good');
  await goal.locator('.tl-card__chevron').click();
  await goal.getByRole('button', { name: 'Copy the Lean code' }).click();
  const copies = await postedOfType(page, 'copyText');
  const expected = spyroProvedGraph().nodes.find((n) => n.id === 'cynder-not-good')?.lean.code;
  expect(copies).toEqual([{ v: 1, type: 'copyText', payload: { text: expected } }]);
  expect(expected).toBe(`${SPYRO_LEAN.cynderNotGood}\n${SPYRO_LEAN.cynderNotGoodProof}`);
  await expect(goal.getByRole('button', { name: 'Copy the Lean code' })).toContainText('Copied');
  await expect(page.getByTestId('toast')).toContainText('Copied');
  expect(await postedOfType(page, 'select')).toEqual([]);

  // "Open in editor" opens where the code starts.
  await goal.getByRole('button', { name: 'Open in editor' }).click();
  expect((await postedOfType(page, 'openInEditor')).at(-1)?.payload).toEqual({
    file: 'Model/Spyro/Main.lean',
    range: { start: { line: 54, character: 0 }, end: { line: 57, character: 81 } },
  });
});

test('AT6.19 hovering an identifier shows its gloss; clicking highlights it in the Vocabulary band; Ctrl+click does nothing (request 4)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  board = await openBoard(page, spyroGraph(), 'dark');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  const ref = dark.locator('.tl-ref[data-ref="Spyro.HasDarkPast"]');
  await expect(ref).toHaveText('HasDarkPast');

  // Hover: the gloss, with kind and type.
  await ref.hover();
  const tip = page.getByTestId('ref-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('has a dark past');
  await expect(tip).toContainText('predicate · HasDarkPast : Spyro.Character → Prop');
  await page.screenshot({ path: shotPath('m1-code-hover.png') });
  // A node's own name shows its sentence.
  await dark.locator('.tl-ref[data-ref="Spyro.cynder_dark_past"]').hover();
  await expect(tip).toContainText('Cynder is a character who has a dark past');
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);

  // Ctrl+click is reserved: nothing happens.
  await expect(page.getByTestId('vocabulary')).toHaveAttribute('data-collapsed', 'true');
  const count = (await posted(page)).length;
  await ref.click({ modifiers: ['Control'] });
  await settle(page);
  await expect(page.getByTestId('vocabulary')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.locator('[data-highlight]')).toHaveCount(0);
  expect((await posted(page)).slice(count).filter((m) => m.type !== 'diagnostic')).toEqual([]);

  // A plain click opens the band above the board, scrolls the item into view in its column and flashes it.
  await ref.click();
  const item = page.locator('.tl-vocab__item[data-vocab="Spyro.HasDarkPast"]');
  await expect(page.getByTestId('vocabulary')).not.toHaveAttribute('data-collapsed', /.*/);
  await expect(item).toHaveAttribute('data-highlight', 'true');
  await expect.poll(() => inView(page, '.tl-vocab__item[data-vocab="Spyro.HasDarkPast"]')).toBe(true);
  expect(await postedOfType(page, 'select')).toEqual([]); // the card was not selected
  await expect(dark.locator('.tl-card__chevron')).toHaveAttribute('aria-expanded', 'true');
});

test('AT6.19 clicking a node name in a proof reveals and flashes that card (proved Spyro)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const goal = card(page, 'cynder-not-good');
  await goal.locator('.tl-card__chevron').click();
  const ref = goal.locator('.tl-ref[data-ref="Spyro.pg_no_dark_past.holds"]');
  await expect(ref).toHaveText('pg_no_dark_past.holds');
  await expect(ref).toHaveAttribute('data-ref-node', 'pg-no-dark-past');
  // The expanded card opens over the canvas, which clips it: pan its proof into view first.
  await panToShow(page, ref);
  await ref.hover();
  await expect(page.getByTestId('ref-tooltip')).toContainText('PG games cannot have characters with dark pasts');
  // Make the AXIOMS column long (expand its other cards) and scroll it away from the card first: the click must bring
  // the card back into view.
  await card(page, 'new-spyro-pg').locator('.tl-card__chevron').click();
  await card(page, 'cynder-dark-past').locator('.tl-card__chevron').click();
  await list(page, 'AXIOM').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await settle(page);
  expect(await inView(page, '[data-node-id="pg-no-dark-past"]')).toBe(false);
  await panToShow(page, ref);
  await ref.click();
  await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-highlight', 'true');
  await expect.poll(() => inView(page, '[data-node-id="pg-no-dark-past"]')).toBe(true);
  expect(await postedOfType(page, 'select')).toEqual([]);
});
