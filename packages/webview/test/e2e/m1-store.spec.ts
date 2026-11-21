/**
 * AT6.1 through the real message path (bridge -> store -> React): stale graphs are dropped, selection and expansion
 * survive a newer graph, refused optimistic changes roll back with an error toast. (The store's unit tests cover
 * the remaining cases: provisional ids, needs-confirmation, edits.)
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroGraph, spyroProvedGraph } from '@telelean/core';
import { card, columnPoint, dragCard, list, openBoard, postedOfType, replyNext, send, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.1 older graphs are dropped; selection and expansion survive; refused add and drag roll back with an error toast', async ({ page }) => {
  board = await openBoard(page, spyroGraph(5), 'dark');
  await card(page, 'cynder-dark-past').click();
  await card(page, 'cynder-not-good').locator('.tl-card__chevron').click();
  const goalChip = card(page, 'cynder-not-good').locator('[data-chip="proof"], [data-chip="established"]');
  await expect(goalChip).toHaveText('unproved');

  await send(page, hostMessage('graph', { graph: spyroProvedGraph(4) })); // older: dropped
  await expect(goalChip).toHaveText('unproved');
  await send(page, hostMessage('graph', { graph: spyroProvedGraph(6) }));
  await expect(goalChip).toHaveText('✓ established');
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');
  await expect(card(page, 'cynder-not-good').locator('.tl-card__chevron')).toHaveAttribute('aria-expanded', 'true');
  await send(page, hostMessage('graph', { graph: spyroProvedGraph(6) })); // the same version again: harmless
  await expect(goalChip).toHaveText('✓ established');
  await expect(page.locator('[data-node-id]')).toHaveCount(4);

  // A refused add: the optimistic card goes away and the host's reason is shown.
  await replyNext(page, 'addNode', { ok: false, code: 'invalid', error: 'Model/Spyro/Inbox.lean could not be written.' });
  await page.getByRole('radio', { name: 'Proposition' }).click();
  await page.getByRole('textbox', { name: 'New proposition' }).fill('Cynder gets a spin-off');
  await page.getByRole('textbox', { name: 'New proposition' }).press('Enter');
  await expect(page.getByTestId('toast').filter({ hasText: 'Model/Spyro/Inbox.lean could not be written.' })).toHaveAttribute('data-level', 'error');
  await expect(card(page, 'cynder-gets-a-spin-off')).toHaveCount(0);

  // A refused drag (the proposition dropped on the AXIOMS column: "Move to axioms"): the card returns to the canvas.
  await replyNext(page, 'kindChange', { ok: false, code: 'conflict', error: 'Model/Spyro/Main.lean changed since; try again.' });
  await dragCard(page, 'cynder-not-good', await columnPoint(page));
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Model/Spyro/Main.lean changed since; try again.' })).toBeVisible();
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="cynder-not-good"]')).toHaveCount(1);
  await expect(list(page, 'AXIOM').locator('[data-node-id]')).toHaveCount(3);
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload.requestId)).toEqual(['r2']);
});
