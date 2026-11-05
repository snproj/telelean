/**
 * The M1 carry-overs on the board (docs/m2-plan.md section 1.3):
 *  (1) AT6.7 "Used by" and the delete dialog list the card's users outside the board (`LeanBinding.externalUsers`);
 *      "Nothing else refers to it." only when nothing on the board and nothing outside refers to it;
 *  (2) AT6.8 the dependents dialog's own words are singular for one dependent and plural for more (core's own
 *      singular texts are asserted in m1-drag.spec.ts and store.test.ts, gated on WP1);
 *  (3) AT6.9 a kind change posts the dependents the dialog listed (`confirmedDependents`); a host that finds more
 *      re-opens the dialog with its list.
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroProvedGraph } from '@telelean/core';
import { conditionalGraph } from '../shared/graphs';
import { externalUsersGraph, TARGET } from '../shared/runs';
import { card, columnPoint, dragCard, list, openBoard, postedOfType, replyNext, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.7 "Used by" lists users outside the board: a lemma in code font, another subject’s card by its sentence and subject', async ({ page }) => {
  board = await openBoard(page, externalUsersGraph(), 'dark');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  const usedBy = dark.getByTestId('used-by');
  await expect(usedBy.locator('.tl-rel__text')).toHaveText(['Cynder would not be a good addition to the new Spyro game']);
  const external = usedBy.getByTestId('external-user');
  await expect(external).toHaveCount(2);
  await expect(external.nth(0).locator('code')).toHaveText('Spyro.helper_lemma');
  await expect(external.nth(0)).toContainText('uses it in a proof');
  await expect(external.nth(1)).toHaveText('Bayonetta would not be a good addition either (subject Bayonetta)uses it in a proof');
  await expect(external.nth(1).locator('code')).toHaveCount(0);

  // The goal: no card of this board uses it, but a lemma mentions it, so it is not "Nothing uses it yet".
  const goal = card(page, TARGET);
  await goal.locator('.tl-card__chevron').click();
  await expect(goal.getByTestId('used-by')).not.toContainText('Nothing uses it yet.');
  await expect(goal.getByTestId('used-by').getByTestId('external-user')).toHaveText('Spyro.cynder_lemmamentions it in its statement');
  await page.screenshot({ path: shotPath('m2-used-by-external.png') });
});

test('AT6.7 the delete dialog lists users outside the board; "Nothing else refers to it." only when nothing does', async ({ page }) => {
  board = await openBoard(page, externalUsersGraph(), 'dark');
  const dialog = page.getByTestId('dialog-delete');
  const goal = card(page, TARGET);
  await goal.locator('.tl-card__chevron').click();
  await goal.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('Nothing else refers to it.');
  await expect(dialog.getByTestId('delete-external')).toContainText('Also used outside this board');
  await expect(dialog.getByTestId('delete-external').locator('code')).toHaveText(['Spyro.cynder_lemma']);
  await page.screenshot({ path: shotPath('m2-delete-external.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // An assumption used on the board and outside it: both are listed.
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await dark.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog.getByTestId('delete-proofs')).toContainText('Cynder would not be a good addition to the new Spyro game');
  await expect(dialog.getByTestId('delete-external').locator('li')).toHaveText([
    'Spyro.helper_lemmauses it in a proof',
    'Bayonetta would not be a good addition either (subject Bayonetta)uses it in a proof',
  ]);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Nothing on the board and nothing outside: only then "Nothing else refers to it."
  await send(page, hostMessage('graph', { graph: spyroProvedGraph(99) }));
  await card(page, TARGET).getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toContainText('Nothing else refers to it.');
  await expect(dialog.getByTestId('delete-external')).toHaveCount(0);
});

test('AT6.8 the dependents dialog speaks of one dependent in the singular and of several in the plural', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const dialog = page.getByTestId('dialog-dependents');
  // A->G with one proof using it.
  await dragCard(page, 'cynder-dark-past', await columnPoint(page, 'GOAL'));
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('This uses it:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite that proof to take it as a hypothesis', 'Keep that proof, marked broken', 'Cancel']);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // The host lists two: plural.
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: '2 proofs use new_spyro_pg.holds', dependents: [TARGET, 'Spyro.helper_lemma'] });
  const goal = card(page, TARGET);
  await goal.locator('.tl-card__chevron').click();
  await goal.getByRole('button', { name: 'Make Assumption' }).click();
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  await expect(dialog.getByRole('heading')).toHaveText('Make Assumption: 2 dependents need a rewrite');
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('These pass it arguments:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite them to use it directly', 'Keep them, marked broken', 'Cancel']);
  await page.screenshot({ path: shotPath('m2-dependents-plural.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('AT6.8 D->A with one dependent: "Rewrite that proof to use it directly", "Keep that proof, marked broken"', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'light');
  const d1 = card(page, 'd1');
  await d1.locator('.tl-card__chevron').click();
  await d1.getByRole('button', { name: 'Make Assumption' }).click();
  const dialog = page.getByTestId('dialog-dependents');
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('This passes it arguments:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite that proof to use it directly', 'Keep that proof, marked broken', 'Cancel']);
});

test('AT6.9 the choice names the dependents the dialog listed; a host that finds more re-opens the dialog with its list, which is posted with the next choice', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const dialog = page.getByTestId('dialog-dependents');
  await dragCard(page, 'cynder-dark-past', await columnPoint(page, 'GOAL'));
  await expect(dialog.getByTestId('dependents').locator('li')).toHaveText(['GCynder would not be a good addition to the new Spyro game']);
  // The host's facts know a lemma the board does not show: it refuses the choice and lists every dependent.
  await replyNext(page, 'kindChange', {
    ok: false,
    code: 'needs-confirmation',
    error: 'cynder_dark_past.holds will be removed, but 2 dependents use it: rewrite them to take it as a hypothesis, or keep them and let them show as broken.',
    dependents: [TARGET, 'Spyro.helper_lemma'],
  });
  await dialog.getByRole('button', { name: 'Rewrite that proof to take it as a hypothesis' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('dependents-relisted')).toContainText('found more that uses it than this dialog listed before');
  await expect(dialog.getByTestId('dependents').locator('li')).toHaveText(['GCynder would not be a good addition to the new Spyro game', 'Spyro.helper_lemma']);
  await expect(dialog.getByRole('heading')).toHaveText('Make Goal: 2 dependents need a hypothesis rewrite');
  await expect(list(page, 'ASSUMPTION').locator('[data-node-id="cynder-dark-past"]')).toHaveCount(1); // rolled back while it asks
  await page.screenshot({ path: shotPath('m2-dependents-relisted.png') });
  await dialog.getByRole('button', { name: 'Keep them, marked broken' }).click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: 'cynder-dark-past', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, requestId: 'r1', dependents: 'rewrite', confirmedDependents: [TARGET] },
    { id: 'cynder-dark-past', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, requestId: 'r2', dependents: 'mark-broken', confirmedDependents: [TARGET, 'Spyro.helper_lemma'] },
  ]);

  // Asked again about nothing new, the board does not loop: it says why instead. (The host's graph first puts the
  // card back where the files have it.)
  await send(page, hostMessage('graph', { graph: spyroProvedGraph(100) }));
  await expect(list(page, 'ASSUMPTION').locator('[data-node-id="cynder-dark-past"]')).toHaveCount(1);
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: 'Still refused: the files changed meanwhile.', dependents: [TARGET] });
  await dragCard(page, 'cynder-dark-past', await columnPoint(page, 'GOAL'));
  await dialog.getByRole('button', { name: 'Keep that proof, marked broken' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Still refused: the files changed meanwhile.' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
