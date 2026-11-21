/**
 * M1 drags and arrows on the spec v4 board: re-ordering within the AXIOMS column (AT6.8, BD-2), a proposition dropped
 * on the AXIOMS column with the D-11 drop zone and dialogs and their menu equivalents (AT6.9; AR-7 "Move to axioms",
 * the only kind change left), and the arrow kinds (AT6.4, BD-5).
 */
import { expect, test } from '@playwright/test';
import { buildGraph, hostMessage, spyroGraph, type TlGraph } from '@telelean/core';
import { conditionalGraph, edgeKindsGraph, makeNode, withSemantic } from '../shared/graphs';
import {
  card,
  cardPoint,
  checkArrows,
  columnPoint,
  dragCard,
  edgePairs,
  list,
  menuItem,
  openBoard,
  order,
  postedOfType,
  replyNext,
  rightClick,
  send,
  settle,
  shotPath,
  type OpenedBoard,
} from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** Spyro plus a second proposition with no arrows (the host may know dependents of it the board does not show). */
function twoPropositions(version = 1): TlGraph {
  const base = spyroGraph(version);
  const side = makeNode('side-claim', 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } });
  return { ...buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, side], vocabulary: base.vocabulary, semantic: base.semantic }), positions: { 'side-claim': { x: 760, y: 60 } } };
}

/** "Move to axioms" from a card's right-click menu (the canvas clips an expanded card, so the menu is the sure way). */
async function moveToAxiomsFromMenu(page: import('@playwright/test').Page, id: string) {
  await rightClick(page, await cardPoint(page, id));
  await menuItem(page, 'move-to-axioms').click();
}

test('AT6.8 dragging within the AXIOMS column re-orders and posts reorder with the right beforeId', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  // Onto the upper half of the first card: above it.
  const first = await card(page, 'pg-no-dark-past').boundingBox();
  if (!first) throw new Error('no box');
  await dragCard(page, 'new-spyro-pg', { x: first.x + first.width / 2, y: first.y + 6 });
  expect(await order(page, 'AXIOM')).toEqual(['new-spyro-pg', 'pg-no-dark-past', 'cynder-dark-past']);
  // Below the last card (the empty end of the column): beforeId null.
  await dragCard(page, 'pg-no-dark-past', await columnPoint(page, 30));
  expect(await order(page, 'AXIOM')).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
  // Dropped where it already is (onto itself): nothing is posted.
  const self = await card(page, 'cynder-dark-past').boundingBox();
  if (!self) throw new Error('no box');
  await dragCard(page, 'cynder-dark-past', { x: self.x + self.width / 2, y: self.y + self.height / 2 });
  expect((await postedOfType(page, 'reorder')).map((m) => m.payload)).toEqual([
    { id: 'new-spyro-pg', column: 'AXIOM', beforeId: 'pg-no-dark-past', requestId: 'r1' },
    { id: 'pg-no-dark-past', column: 'AXIOM', beforeId: null, requestId: 'r2' },
  ]);
  expect(await postedOfType(page, 'kindChange')).toEqual([]);

  // A refused re-order rolls back, with an error toast.
  await replyNext(page, 'reorder', { ok: false, code: 'conflict', error: 'layout.json changed since; try again.' });
  await dragCard(page, 'pg-no-dark-past', { x: first.x + first.width / 2, y: first.y + 6 });
  await expect(page.getByTestId('toast').filter({ hasText: 'layout.json changed since; try again.' })).toBeVisible();
  expect(await order(page, 'AXIOM')).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
});

test('AT6.9 the AXIOMS column’s drop zone states the D-11 impact; a proof that takes hypotheses, used by another, opens the dependents dialog', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'dark');
  await dragCard(page, 'd1', await columnPoint(page), async () => {
    const zone = page.locator('.tl-dropzone[data-kind="AXIOM"]');
    await expect(zone.locator('.tl-dropzone__summary')).toHaveText('Move to axioms: 1 dependent needs a rewrite');
    await expect(zone).toHaveAttribute('data-confirm', 'true');
    await expect(page.locator('.tl-axioms .tl-col__drop-label')).toHaveText('Drop to move to axioms');
    await expect(page.locator('.tl-dropzone[data-kind="PROPOSITION"]')).toHaveCount(0); // its own part: a move
    await page.screenshot({ path: shotPath('m1-drop-zones.png') });
  });
  await expect(page.locator('.tl-dropzone')).toHaveCount(0);
  const dialog = page.getByTestId('dialog-dependents');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('dependents')).toHaveText(['PCynder stays out of the game']);
  // core's explanation (code spans as code), then the list; the dialog's own words for one dependent are singular.
  await expect(dialog.getByTestId('dependents-detail')).toHaveText(
    'theorem d1.holds takes a hypothesis; as an axiom it becomes axiom d1.holds : d1 (the proof is kept in the attic), so the 1 proof that passes it arguments must change. Either rewrite that proof to use it directly (mechanical, undoable), or keep that proof and let it show as broken.',
  );
  await expect(dialog).toContainText('This passes it arguments:');
  await expect(dialog.getByRole('button', { name: 'Rewrite that proof to use it directly' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Keep that proof, marked broken' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.screenshot({ path: shotPath('m1-dependents-dialog.png') });
  // Nothing moved or was posted before the answer.
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="d1"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Rewrite that proof to use it directly' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(list(page, 'AXIOM').locator('[data-node-id="d1"]')).toHaveCount(1);
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', dependents: 'rewrite', confirmedDependents: ['g1'] },
  ]);
});

test('AT6.9 with stale facts the rewrite is disabled; "Keep that proof, marked broken" posts; Cancel posts nothing', async ({ page }) => {
  board = await openBoard(page, withSemantic(conditionalGraph(), { state: 'stale', staleFiles: ['Model/Spyro/Main.lean'] }), 'light');
  await moveToAxiomsFromMenu(page, 'd1');
  const dialog = page.getByTestId('dialog-dependents');
  await expect(dialog.getByRole('button', { name: 'Rewrite that proof to use it directly' })).toBeDisabled();
  await expect(dialog).toContainText('refresh Lean first');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="d1"]')).toHaveCount(1);

  await moveToAxiomsFromMenu(page, 'd1');
  await dialog.getByRole('button', { name: 'Keep that proof, marked broken' }).click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', dependents: 'mark-broken', confirmedDependents: ['g1'] },
  ]);
});

test('AT6.9 a drop on the column asks the optional reason (Skip allowed); a host needs-confirmation opens the dependents dialog with its list', async ({ page }) => {
  board = await openBoard(page, twoPropositions(), 'dark');
  await dragCard(page, 'cynder-not-good', await columnPoint(page, 20), async () => {
    await expect(page.locator('.tl-dropzone[data-kind="AXIOM"] .tl-dropzone__summary')).toHaveText('Move to axioms: adds axiom cynder_not_good.holds');
  });
  const dialog = page.getByTestId('dialog-rationale');
  await expect(dialog).toBeVisible();
  const why = dialog.getByRole('textbox', { name: 'Why do you hold it?' });
  await expect(why).toBeFocused();
  await why.fill('a friend who plays it said so');
  await why.press('Enter');
  expect((await postedOfType(page, 'kindChange')).at(-1)?.payload).toEqual({
    id: 'cynder-not-good',
    from: 'PROPOSITION',
    to: 'AXIOM',
    beforeId: null,
    requestId: 'r1',
    rationale: 'a friend who plays it said so',
  });
  await expect(list(page, 'AXIOM').locator('[data-node-id="cynder-not-good"]')).toHaveCount(1);

  // The host's facts may know dependents the graph did not show: it answers needs-confirmation, the card goes back,
  // and the dialog lists what the host listed (an untracked declaration by its Lean name).
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: '2 proofs use side_claim.holds', dependents: ['cynder-not-good', 'Spyro.helper_lemma'] });
  await moveToAxiomsFromMenu(page, 'side-claim');
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  const dependents = page.getByTestId('dialog-dependents');
  await expect(dependents).toBeVisible();
  await expect(dependents.getByRole('heading')).toHaveText('Move to axioms: 2 dependents need a rewrite');
  await expect(dependents.getByTestId('dependents').locator('li')).toHaveText(['ACynder would not be a good addition to the new Spyro game', 'Spyro.helper_lemma']);
  await expect(dependents.getByTestId('dependents').locator('code')).toHaveText(['Spyro.helper_lemma']);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="side-claim"]')).toHaveCount(1); // rolled back while it asks
  await dependents.getByRole('button', { name: 'Keep them, marked broken' }).click();
  expect((await postedOfType(page, 'kindChange')).at(-1)?.payload).toMatchObject({
    id: 'side-claim',
    to: 'AXIOM',
    dependents: 'mark-broken',
    confirmedDependents: ['cynder-not-good', 'Spyro.helper_lemma'],
  });
});

test('AT6.9 "Move to axioms" of a proof that takes hypotheses: core’s explanation and "Rewrite that proof to use it directly"; a confirmation only the host asks for shows its words', async ({ page }) => {
  board = await openBoard(page, conditionalGraph(), 'dark');
  await moveToAxiomsFromMenu(page, 'd1');
  const dialog = page.getByTestId('dialog-dependents');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Move to axioms: 1 dependent needs a rewrite');
  await expect(dialog.getByTestId('dependents-detail').locator('code')).toHaveText(['theorem d1.holds', 'axiom d1.holds : d1']);
  await expect(dialog).toContainText('This passes it arguments:');
  await expect(dialog).not.toContainText('not taken as given');
  await expect(dialog.getByTestId('dependents')).toHaveText(['PCynder stays out of the game']);
  // M2 carry-over 2: the dialog's own words for one dependent are singular.
  await expect(dialog.getByRole('button')).toHaveText(['Rewrite that proof to use it directly', 'Keep that proof, marked broken', 'Cancel']);
  await page.screenshot({ path: shotPath('m1-dependents-to-axiom.png') });
  await dialog.getByRole('button', { name: 'Rewrite that proof to use it directly' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: 'd1', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', dependents: 'rewrite', confirmedDependents: ['g1'] },
  ]);

  // Where only the host knows that the proof takes a hypothesis a lemma passes (the graph says "its proof becomes an
  // axiom"): after the optional reason the host asks; the dialog shows the host's explanation and list, not the graph's.
  const hostSays =
    'g1.holds takes a hypothesis, but as an axiom it becomes `axiom g1.holds : g1`, so 1 dependent that passes it arguments must change: rewrite that dependent to use it directly, or keep it and let it show as broken.';
  await replyNext(page, 'kindChange', { ok: false, code: 'needs-confirmation', error: hostSays, dependents: ['Spyro.helper_lemma'] });
  await moveToAxiomsFromMenu(page, 'g1');
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Move to axioms: 1 dependent needs a rewrite');
  await expect(dialog.getByTestId('dependents-detail')).toHaveText(hostSays.replace(/`/g, ''));
  await expect(dialog.getByTestId('dependents').locator('code')).toHaveText(['Spyro.helper_lemma']);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="g1"]')).toHaveCount(1); // rolled back while it asks
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'kindChange')).toHaveLength(2);
});

test('AT6.9 the menus and the card’s details offer "Move to axioms" on propositions only; it states the impact first', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  // An axiom offers no kind change of its own (an arrow into it, or "follows from nothing", makes it a proposition).
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await expect(dark.getByTestId('make-axiom')).toHaveCount(0);
  await expect(dark.getByTestId('from-nothing')).toHaveText('Follows from nothing');
  await rightClick(page, await cardPoint(page, 'new-spyro-pg'));
  await expect(menuItem(page, 'move-to-axioms')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A proposition: "Move to axioms", its tooltip the impact; the rationale dialog shows it again before anything changes.
  await rightClick(page, await cardPoint(page, 'cynder-not-good'));
  await menuItem(page, 'move-to-axioms').click();
  const dialog = page.getByTestId('dialog-rationale');
  await expect(dialog.locator('.tl-dialog__detail')).toContainText('Its 3 incoming arrows are removed.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  await rightClick(page, await cardPoint(page, 'cynder-not-good'));
  await menuItem(page, 'move-to-axioms').click();
  await dialog.getByRole('button', { name: 'Skip' }).click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([{ id: 'cynder-not-good', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1' }]);
});

test('AT6.4 arrows: declared dotted, verified solid, conditional hollow, an undeclared use in the warning colour with a notched head, an unused one plain dotted, lean-ref only with focus', async ({ page }) => {
  const graph = edgeKindsGraph();
  board = await openBoard(page, graph, 'dark');
  const path = (id: string) => page.locator(`path[data-edge-id="${id}"]`);
  const style = (id: string) =>
    path(id).evaluate((el) => {
      const s = getComputedStyle(el);
      return { dash: s.strokeDasharray, stroke: s.stroke, marker: el.getAttribute('marker-end'), title: el.querySelector('title')?.textContent ?? null };
    });
  // Declared only, and not used by the conditional proof (TL109): plain dotted in the arrow colour, never the warning
  // colour (BD-5), the declared head, and the tooltip.
  const unused = await style('new-spyro-pg->d-hyp');
  expect(unused.dash).not.toBe('none');
  expect(unused.stroke).not.toBe('rgb(204, 167, 0)');
  expect(unused.marker).toBe('url(#tl-arrow-declared)');
  expect(unused.title).toBe('Not used by the current proof');
  await expect(path('new-spyro-pg->d-hyp')).not.toHaveAttribute('data-mismatch', /.*/);
  // Verified: solid, the verified head, no tooltip.
  expect(await style('cynder-dark-past->cynder-not-good')).toMatchObject({ dash: 'none', marker: 'url(#tl-arrow-verified)', title: null });
  // Conditional: solid with the hollow head and "taken as a hypothesis".
  const conditional = await style('pg-no-dark-past->d-hyp');
  expect(conditional).toMatchObject({ dash: 'none', marker: 'url(#tl-arrow-conditional)' });
  expect(conditional.title).toMatch(/Taken as a hypothesis/);
  await expect(path('pg-no-dark-past->d-hyp')).toHaveAttribute('data-conditional', 'true');
  // Used but not declared (TL107): solid, the warning colour, a notched head (never colour alone).
  expect(await style('cynder-dark-past->d-hyp')).toMatchObject({ dash: 'none', stroke: 'rgb(204, 167, 0)', marker: 'url(#tl-arrow-mismatch)' });
  await expect(path('cynder-dark-past->d-hyp')).toHaveAttribute('data-mismatch', 'used-undeclared');
  expect((await style('cynder-dark-past->d-hyp')).title).toBe('The proof uses it, but no arrow is drawn from it (TL107)');
  // lean-ref: not drawn until one end is hovered or selected.
  await expect(page.locator('path[data-pattern="reference"]')).toHaveCount(0);
  await card(page, 'cynder-not-good').hover();
  await expect(path('ref:d-hyp->cynder-not-good')).toHaveCount(1);
  expect(await path('ref:d-hyp->cynder-not-good').evaluate((el) => Number.parseFloat(getComputedStyle(el).strokeWidth))).toBeLessThan(1.5);
  await page.mouse.move(640, 790);
  await expect(page.locator('path[data-pattern="reference"]')).toHaveCount(0);
  await card(page, 'd-hyp').click();
  await page.mouse.move(640, 790);
  await expect(path('ref:d-hyp->cynder-not-good')).toHaveCount(1);
  // A focused TL107 arrow keeps its notched head (in the focus colour).
  await expect(path('cynder-dark-past->d-hyp')).toHaveAttribute('marker-end', 'url(#tl-arrow-mismatch-focus)');
  await page.screenshot({ path: shotPath('m1-arrow-kinds.png') });
  // Every drawn arrow is attached to its cards' edges.
  await settle(page);
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  await send(page, hostMessage('graph', { graph: spyroGraph(99) }));
  await expect(page.locator('path[data-edge-id]')).toHaveCount(3);
});
