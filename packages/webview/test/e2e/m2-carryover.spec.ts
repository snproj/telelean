/**
 * The M1 carry-overs on the board (docs/m2-plan.md section 1.3):
 *  (1) AT6.7 "Used by" and the delete dialog list the card's users outside the board (`LeanBinding.externalUsers`);
 *      "Nothing else refers to it." only when nothing on the board and nothing outside refers to it;
 *  (2) AT6.8 the dependents dialog's own words are singular for one dependent and plural for more (core's own
 *      singular texts are asserted in m1-drag.spec.ts and store.test.ts, gated on WP1);
 *  (3) AT6.9 a kind change posts the dependents the dialog listed (`confirmedDependents`); a host that finds more
 *      re-opens the dialog with its list.
 * Spec v4: the only kind change with a dependents dialog left is "Move to axioms" (AR-7) of a proof that takes
 * hypotheses (its users stop passing it arguments); M2's assumption-to-goal rewrite is gone with the GOAL kind.
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroProvedGraph } from '@telelean/core';
import { conditionalGraph } from '../shared/graphs';
import { externalUsersGraph, TARGET } from '../shared/runs';
import { card, cardPoint, columnPoint, dragCard, list, menuItem, openBoard, panToShow, postedOfType, replyNext, rightClick, send, shotPath, type OpenedBoard } from './helpers';

/** The expanded card's Delete, panned into the canvas's view first when the card is a proposition. */
async function deleteButton(page: import('@playwright/test').Page, id: string) {
  const button = card(page, id).getByRole('button', { name: 'Delete' });
  if ((await card(page, id).getAttribute('data-place')) === 'canvas') await panToShow(page, button);
  return button;
}

/** "Move to axioms" from a card's right-click menu. */
async function moveToAxioms(page: import('@playwright/test').Page, id: string) {
  await rightClick(page, await cardPoint(page, id));
  await menuItem(page, 'move-to-axioms').click();
}

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
  await (await deleteButton(page, TARGET)).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('Nothing else refers to it.');
  await expect(dialog.getByTestId('delete-external')).toContainText('Also used outside this board');
  await expect(dialog.getByTestId('delete-external').locator('code')).toHaveText(['Spyro.cynder_lemma']);
  await page.screenshot({ path: shotPath('m2-delete-external.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // An axiom used on the board and outside it: both are listed.
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
  await (await deleteButton(page, TARGET)).click();
  await expect(dialog).toContainText('Nothing else refers to it.');
  await expect(dialog.getByTestId('delete-external')).toHaveCount(0);
});

test('AT6.8 the dependents dialog speaks of one dependent in the singular and of several in the plural', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'dark');
  const dialog = page.getByTestId('dialog-dependents');
  // "Move to axioms" of a proof that takes a hypothesis, which one proof uses.
  await moveToAxioms(page, 'd1');
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('This passes it arguments:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite that proof to use it directly', 'Keep that proof, marked broken', 'Cancel']);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // The host lists two: plural.
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: '2 proofs pass g1.holds arguments', dependents: [TARGET, 'Spyro.helper_lemma'] });
  await moveToAxioms(page, 'g1');
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  await expect(dialog.getByRole('heading')).toHaveText('Move to axioms: 2 dependents need a rewrite');
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('These pass it arguments:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite them to use it directly', 'Keep them, marked broken', 'Cancel']);
  await page.screenshot({ path: shotPath('m2-dependents-plural.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('AT6.8 "Move to axioms" with one dependent, from the expanded card: "Rewrite that proof to use it directly", "Keep that proof, marked broken"', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'light');
  const d1 = card(page, 'd1');
  await d1.locator('.tl-card__chevron').click();
  const move = d1.getByTestId('make-axiom');
  await panToShow(page, move);
  await move.click();
  const dialog = page.getByTestId('dialog-dependents');
  await expect(dialog.getByTestId('dependents-intro')).toHaveText('This passes it arguments:');
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite that proof to use it directly', 'Keep that proof, marked broken', 'Cancel']);
});

test('AT6.9 the choice names the dependents the dialog listed; a host that finds more re-opens the dialog with its list, which is posted with the next choice', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'dark');
  const dialog = page.getByTestId('dialog-dependents');
  await dragCard(page, 'd1', await columnPoint(page));
  await expect(dialog.getByTestId('dependents').locator('li')).toHaveText(['PCynder stays out of the game']);
  // The host's facts know a lemma the board does not show: it refuses the choice and lists every dependent.
  await replyNext(page, 'kindChange', {
    ok: false,
    code: 'needs-confirmation',
    error: 'theorem d1.holds takes a hypothesis, so the 2 dependents that pass it arguments must change: rewrite them to use it directly, or keep them and let them show as broken.',
    dependents: ['g1', 'Spyro.helper_lemma'],
  });
  await dialog.getByRole('button', { name: 'Rewrite that proof to use it directly' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('dependents-relisted')).toContainText('found more that uses it than this dialog listed before');
  await expect(dialog.getByTestId('dependents').locator('li')).toHaveText(['PCynder stays out of the game', 'Spyro.helper_lemma']);
  await expect(dialog.getByRole('heading')).toHaveText('Move to axioms: 2 dependents need a rewrite');
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="d1"]')).toHaveCount(1); // rolled back while it asks
  await page.screenshot({ path: shotPath('m2-dependents-relisted.png') });
  await dialog.getByRole('button', { name: 'Keep them, marked broken' }).click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', dependents: 'rewrite', confirmedDependents: ['g1'] },
    { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r2', dependents: 'mark-broken', confirmedDependents: ['g1', 'Spyro.helper_lemma'] },
  ]);

  // Asked again about nothing new, the board does not loop: it says why instead. (The host's graph first puts the
  // card back where the files have it.)
  await send(page, hostMessage('graph', { graph: conditionalGraph(100) }));
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="d1"]')).toHaveCount(1);
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: 'Still refused: the files changed meanwhile.', dependents: ['g1'] });
  await moveToAxioms(page, 'd1');
  await dialog.getByRole('button', { name: 'Keep that proof, marked broken' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Still refused: the files changed meanwhile.' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
