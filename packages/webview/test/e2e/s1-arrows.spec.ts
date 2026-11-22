/**
 * Spec v4 arrows as board edits (slices 1b, 1c2; AR-1, AR-3, AR-5–AR-8, CM-2, CM-7): drawing an arrow from a card's
 * handle (the rubber band, the hint before you let go, Esc), into an axiom (AR-6: the impact, then the confirmation;
 * the card moves to the canvas), "Draw arrows from the selection" in the target's right-click menu, clicking and
 * Ctrl-clicking arrows, Delete (A16's question when a proof uses one), "follows from nothing" and its ∅ mark, "Move to
 * axioms" (AR-7) from the menu, "Mark pending" (AR-8), and the selection rectangle. The harness answers every edit ok.
 */
import { expect, test } from '@playwright/test';
import { buildGraph, hostMessage, spyroGraph, spyroProvedGraph, type TlGraph } from '@telelean/core';
import { edgeKindsGraph, makeNode, mapNode, withStatus } from '../shared/graphs';
import {
  arrowHit,
  arrowPath,
  boardMenu,
  canvasPoint,
  card,
  cardPoint,
  checkArrows,
  clickArrow,
  columnPoint,
  contextSection,
  dragCard,
  drawArrow,
  edgePairs,
  handleOf,
  list,
  menuItem,
  openBoard,
  order,
  pointOnArrow,
  postedOfType,
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

const SIDE = 'side-claim';
const GOAL = 'cynder-not-good';

/** Spyro (or proved Spyro), plus a formalised, unproved proposition with no arrows, right of the goal. */
function arrowsGraph(version = 1, proved = false): TlGraph {
  const base = proved ? spyroProvedGraph(version) : spyroGraph(version);
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } });
  return { ...base, nodes: [...base.nodes, side], positions: { [SIDE]: { x: 760, y: 60 } } };
}

/**
 * What the host sends after the arrow SIDE -> new-spyro-pg on the proved board (AR-6): new-spyro-pg a proposition
 * resting on SIDE, pending proof (its axiom `.holds` stays), and the goal still proved but resting on pending.
 */
function afterArrowIntoAxiom(version: number): TlGraph {
  const base = arrowsGraph(version, true);
  const nodes = base.nodes.map((n) => {
    if (n.id === 'new-spyro-pg') return withStatus({ ...n, type: 'PROPOSITION' as const, premises: [SIDE] }, { proof: { kind: 'pending' } });
    if (n.id === GOAL) return withStatus(n, { flags: ['rests-on-pending'] });
    return n;
  });
  return { ...buildGraph({ subject: 'Spyro', version, nodes, vocabulary: base.vocabulary, semantic: base.semantic }), positions: base.positions ?? {} };
}

/** Spyro plus SIDE resting on the goal: two canvas cards joined by a drawn arrow that lies wholly on the canvas. */
function chainGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } }, { premises: [GOAL] });
  return { ...buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, side], vocabulary: base.vocabulary, semantic: base.semantic }), positions: { [SIDE]: { x: 760, y: 60 } } };
}

const hint = (page: import('@playwright/test').Page) => page.getByTestId('draw-hint');

test('drawing from a card’s handle: the rubber band and the hint, a release on a card posts addArrows; refused and cancelled draws send nothing (AR-1, AR-3)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'dark');
  await expect(arrowPath(page, 'pg-no-dark-past', SIDE)).toHaveCount(0);

  await drawArrow(page, 'pg-no-dark-past', SIDE, async () => {
    await expect(page.locator('.tl-board')).toHaveAttribute('data-drawing', 'true');
    await expect(card(page, SIDE)).toHaveAttribute('data-draw-target', 'ok');
    await expect(hint(page)).toBeVisible();
    await expect(hint(page).locator('.tl-draw-hint__text')).toHaveText('Arrow into “Spyro games avoid dark characters”');
    expect(await page.locator('path.tl-draft__arrow').getAttribute('d')).not.toBe('M0 0');
    await page.screenshot({ path: shotPath('s1-draw-arrow.png') });
  });
  expect((await postedOfType(page, 'addArrows')).map((m) => m.payload)).toEqual([{ target: SIDE, sources: ['pg-no-dark-past'], requestId: 'r1' }]);
  // Drawn at once (optimistic), dotted (declared), from the column into the canvas card's edge.
  await expect(arrowPath(page, 'pg-no-dark-past', SIDE)).toHaveAttribute('data-pattern', 'declared');
  await expect(page.locator('.tl-board')).not.toHaveAttribute('data-drawing', /.*/);
  await expect(hint(page)).toBeHidden();
  await expect(card(page, SIDE)).not.toHaveAttribute('data-draw-target', /.*/);
  await settle(page);
  const arrows = await checkArrows(page, [...edgePairs(arrowsGraph()), { source: 'pg-no-dark-past', target: SIDE }]);
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);

  // The same arrow again: refused before the release, and the release only says why.
  await drawArrow(page, 'pg-no-dark-past', SIDE, async () => {
    await expect(card(page, SIDE)).toHaveAttribute('data-draw-target', 'refused');
    await expect(hint(page)).toHaveAttribute('data-refused', 'true');
    await expect(hint(page).locator('.tl-draw-hint__text')).toHaveText('That arrow is drawn already.');
  });
  await expect(page.getByTestId('toast').filter({ hasText: 'That arrow is drawn already.' })).toHaveAttribute('data-level', 'info');

  // AR-3: an arrow that would close a cycle is refused, naming it.
  await drawArrow(page, SIDE, 'pg-no-dark-past', async () => {
    await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-draw-target', 'refused');
    await expect(hint(page).locator('.tl-draw-hint__text')).toContainText('This arrow would make a cycle: Spyro games avoid dark characters → PG games cannot');
  });

  // Escape cancels a draw under way; a release on empty canvas cancels too.
  const from = await handleOf(page, 'new-spyro-pg');
  const over = await cardPoint(page, SIDE);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(over.x, over.y, { steps: 10 });
  await expect(card(page, SIDE)).toHaveAttribute('data-draw-target', 'ok');
  await page.keyboard.press('Escape');
  await expect(hint(page)).toBeHidden();
  await expect(card(page, SIDE)).not.toHaveAttribute('data-draw-target', /.*/);
  await page.mouse.up();
  const from2 = await handleOf(page, 'new-spyro-pg');
  const empty = await canvasPoint(page, 0.5, 0.92);
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.mouse.move(empty.x, empty.y, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  expect(await postedOfType(page, 'addArrows')).toHaveLength(1);
});

test('drawing into an axiom states the impact before you let go, then asks; confirmed, it becomes a proposition on the canvas (AR-6)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(1, true), 'dark');
  // The proved goal glows green: it rests on new-spyro-pg.
  await expect(card(page, GOAL)).toHaveAttribute('data-glow', 'established');
  await expect(list(page, 'AXIOM').locator('[data-node-id="new-spyro-pg"]')).toHaveCount(1);

  await drawArrow(page, SIDE, 'new-spyro-pg', async () => {
    await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-draw-target', 'ok');
    await expect(hint(page).locator('.tl-draw-hint__text')).toHaveText('Arrow into “The new Spyro game is PG”');
    await expect(hint(page).locator('.tl-draw-hint__line')).toHaveText([
      'Becomes a proposition: pending proof until proved',
      'axiom new_spyro_pg.holds stays, marked pending proof, until a run proves it (theorem new_spyro_pg.holds : … := …). 1 card that rests on it will lose its green glow until it is proved.',
    ]);
    await page.screenshot({ path: shotPath('s1-draw-into-axiom.png') });
  });
  // The release asks first: the impact and the card that loses its glow; Cancel has the focus.
  const dialog = page.getByTestId('dialog-arrows');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Becomes a proposition: pending proof until proved');
  await expect(dialog.getByTestId('arrows-detail')).toHaveText(
    'Drawing this arrow into “The new Spyro game is PG” makes it a proposition. axiom new_spyro_pg.holds stays, marked pending proof, until a run proves it (theorem new_spyro_pg.holds : … := …). 1 card that rests on it will lose its green glow until it is proved.',
  );
  await expect(dialog.getByTestId('arrows-dependents')).toContainText('These lose their green glow until it is proved:');
  await expect(dialog.getByTestId('arrows-dependents').locator('li')).toHaveText(['PCynder would not be a good addition to the new Spyro game']);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(await postedOfType(page, 'addArrows')).toEqual([]);
  // Cancel: nothing changes.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'addArrows')).toEqual([]);
  await expect(list(page, 'AXIOM').locator('[data-node-id="new-spyro-pg"]')).toHaveCount(1);

  // Again, confirmed: the arrow is drawn and the axiom moves to the canvas, a proposition (optimistic: the board's own
  // move, before the host's graph).
  await drawArrow(page, SIDE, 'new-spyro-pg');
  await dialog.getByTestId('arrows-confirm').click();
  expect((await postedOfType(page, 'addArrows')).map((m) => m.payload)).toEqual([{ target: 'new-spyro-pg', sources: [SIDE], confirmed: true, requestId: 'r1' }]);
  await expect(list(page, 'PROPOSITION').locator('[data-node-id="new-spyro-pg"]')).toHaveCount(1);
  await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-kind', 'PROPOSITION');
  await expect(arrowPath(page, SIDE, 'new-spyro-pg')).toHaveCount(1);
  await expect(page.getByTestId('dialog-arrows')).toHaveCount(0);

  // The host's graph: its axiom .holds stays, so it is pending proof; the goal keeps its proof but rests on pending
  // now, so it loses the green glow, as the dialog said.
  await send(page, hostMessage('graph', { graph: afterArrowIntoAxiom(2) }));
  await expect(card(page, 'new-spyro-pg')).toHaveAttribute('data-kind', 'PROPOSITION');
  await expect(card(page, 'new-spyro-pg').locator('[data-chip="pending"]')).toHaveText('pending proof');
  await expect(card(page, GOAL)).toHaveAttribute('data-glow', 'formalized');
  await expect(card(page, GOAL).locator('[data-chip="rests-on-pending"]')).toHaveText('proved, but rests on pending: The new Spyro game is PG');
  await expect(arrowPath(page, SIDE, 'new-spyro-pg')).toHaveAttribute('data-pattern', 'declared');
});

test('"Draw arrows from the selection" in the target’s right-click menu draws one arrow from each selected card (AR-1, CM-7)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'light');
  await card(page, 'pg-no-dark-past').click();
  await card(page, 'new-spyro-pg').click({ modifiers: ['ControlOrMeta'] });
  await rightClick(page, await cardPoint(page, SIDE));
  await expect(menuItem(page, 'draw-from-selection')).toHaveText('Draw 2 arrows from the selection');
  await menuItem(page, 'draw-from-selection').click();
  await expect(boardMenu(page)).toHaveCount(0);
  expect((await postedOfType(page, 'addArrows')).map((m) => m.payload)).toEqual([{ target: SIDE, sources: ['pg-no-dark-past', 'new-spyro-pg'], requestId: 'r1' }]);
  await expect(arrowPath(page, 'pg-no-dark-past', SIDE)).toHaveCount(1);
  await expect(arrowPath(page, 'new-spyro-pg', SIDE)).toHaveCount(1);
  // The selection stays (CM-7); the target was never selected.
  await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-selected', 'true');
  await expect(card(page, SIDE)).not.toHaveAttribute('data-selected', /.*/);
});

test('a click selects an arrow, Ctrl+click adds one; Delete removes the selected arrows (no card dialog); A16 asks when a proof uses one', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  await expect(arrowHit(page, 'cynder-dark-past', GOAL)).toHaveAttribute('data-hit', 'drawn');
  await clickArrow(page, 'cynder-dark-past', GOAL);
  await expect(arrowPath(page, 'cynder-dark-past', GOAL)).toHaveClass(/tl-edge--selected/);
  await expect(page.getByTestId('context-summary')).toHaveText('1 arrow into “Cynder would not be a good addition to …”');
  await clickArrow(page, 'new-spyro-pg', GOAL, true);
  await expect(arrowPath(page, 'new-spyro-pg', GOAL)).toHaveClass(/tl-edge--selected/);
  await expect(page.getByTestId('context-summary')).toHaveText('2 arrows into “Cynder would not be a good addition to …”');
  await expect(arrowPath(page, 'pg-no-dark-past', GOAL)).not.toHaveClass(/tl-edge--selected/);
  await page.screenshot({ path: shotPath('s1-arrows-selected.png') });
  // Ctrl+click on a selected arrow takes it out again, and back.
  await clickArrow(page, 'new-spyro-pg', GOAL, true);
  await expect(arrowPath(page, 'new-spyro-pg', GOAL)).not.toHaveClass(/tl-edge--selected/);
  await clickArrow(page, 'new-spyro-pg', GOAL, true);
  // A plain click on another arrow replaces the selection; then select both again.
  await clickArrow(page, 'pg-no-dark-past', GOAL);
  await expect(page.getByTestId('context-summary')).toHaveText('1 arrow into “Cynder would not be a good addition to …”');
  await clickArrow(page, 'cynder-dark-past', GOAL, true);

  // Delete: one removeArrows with both arrows; no card is deleted and no card dialog opens (AR-1).
  await page.keyboard.press('Delete');
  expect((await postedOfType(page, 'removeArrows')).map((m) => m.payload)).toEqual([
    { arrows: [{ source: 'pg-no-dark-past', target: GOAL }, { source: 'cynder-dark-past', target: GOAL }], requestId: 'r1' },
  ]);
  await expect(page.getByTestId('dialog-delete')).toHaveCount(0);
  await expect(arrowPath(page, 'pg-no-dark-past', GOAL)).toHaveCount(0);
  await expect(arrowPath(page, 'cynder-dark-past', GOAL)).toHaveCount(0);
  await expect(arrowPath(page, 'new-spyro-pg', GOAL)).toHaveCount(1);
  expect(await postedOfType(page, 'deleteNode')).toEqual([]);

  // A16: on the proved board the arrows are solid (the proof uses them): Delete asks first.
  await send(page, hostMessage('graph', { graph: spyroProvedGraph(9) }));
  await expect(arrowPath(page, 'new-spyro-pg', GOAL)).toHaveAttribute('data-pattern', 'verified');
  await clickArrow(page, 'new-spyro-pg', GOAL);
  await page.keyboard.press('Delete');
  const dialog = page.getByTestId('dialog-arrows');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Remove an arrow that a proof uses?');
  await expect(dialog.getByTestId('arrows-dependents').locator('li')).toHaveText(['PCynder would not be a good addition to the new Spyro game']);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter'); // Cancel: nothing is sent
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'removeArrows')).toHaveLength(1);
  await page.keyboard.press('Delete');
  await dialog.getByTestId('arrows-confirm').click();
  expect((await postedOfType(page, 'removeArrows')).at(-1)?.payload).toEqual({ arrows: [{ source: 'new-spyro-pg', target: GOAL }], confirmed: true, requestId: 'r2' });
});

test('"Follows from nothing" draws the ∅ mark; a click selects it, Formalize asks from no premises, Delete removes the mark (AR-5)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'dark');
  await rightClick(page, await cardPoint(page, SIDE));
  await menuItem(page, 'from-nothing').click();
  expect((await postedOfType(page, 'setFromNothing')).map((m) => m.payload)).toEqual([{ id: SIDE, on: true, requestId: 'r1' }]);
  const mark = page.locator(`[data-mark-id="${SIDE}"]`);
  await expect(mark).toHaveCount(1);
  await expect(mark.locator('.tl-mark__label')).toHaveText('∅');
  await expect(mark.locator('title')).toHaveText('Follows from nothing');
  await expect(card(page, SIDE).locator('[data-chip="from-nothing"]')).toHaveText('follows from nothing');
  // Its stub is drawn into the card's left edge.
  const stub = await mark.locator('.tl-mark__hit').boundingBox();
  const face = await card(page, SIDE).boundingBox();
  if (!stub || !face) throw new Error('no boxes');
  expect(Math.abs(stub.x + stub.width - face.x)).toBeLessThan(8);

  // A click on the stub selects the mark: the Context Menu section offers Formalize from no premises.
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  await expect(mark).toHaveClass(/tl-mark--selected/);
  await expect(page.getByTestId('context-summary')).toHaveText('the "follows from nothing" mark of “Spyro games avoid dark characters”');
  await expect(page.getByTestId('formalize')).toBeEnabled();
  await expect(page.getByTestId('formalize')).toHaveAttribute('title', 'Ask Claude to prove “Spyro games avoid dark characters” from no premises at all (you marked it "follows from nothing")');
  await page.screenshot({ path: shotPath('s1-mark-selected.png') });
  await page.getByTestId('formalize').click();
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([{ inferences: [{ target: SIDE, premises: [] }], requestId: 'r2' }]);
  // While the start is on its way the board is read-only (slice 1f); the host's answer (here no run follows) ends that.
  await expect(page.getByTestId('formalize')).toBeEnabled();

  // Delete with the mark selected removes it: one removeArrows, no arrows, the mark.
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  await page.keyboard.press('Delete');
  expect((await postedOfType(page, 'removeArrows')).map((m) => m.payload)).toEqual([{ arrows: [], marks: [SIDE], requestId: 'r3' }]);
  await expect(mark).toHaveCount(0);
  await expect(page.getByTestId('dialog-delete')).toHaveCount(0);
});

test('"Move to axioms" from the right-click menu states the impact, then posts the kind change; the card goes to the AXIOMS column (AR-7)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'dark');
  await rightClick(page, await cardPoint(page, GOAL));
  await menuItem(page, 'move-to-axioms').click();
  const dialog = page.getByTestId('dialog-rationale');
  await expect(dialog.getByRole('heading')).toHaveText('Move to axioms');
  await expect(dialog.locator('.tl-dialog__detail')).toHaveText(
    'Adds axiom cynder_not_good.holds : cynder_not_good after the statement, so proofs may use it. Its 3 incoming arrows are removed.',
  );
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  await dialog.getByRole('textbox', { name: 'Why do you hold it?' }).fill('too dark for a PG game');
  await dialog.getByTestId('rationale-confirm').click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([
    { id: GOAL, from: 'PROPOSITION', to: 'AXIOM', beforeId: null, requestId: 'r1', rationale: 'too dark for a PG game' },
  ]);
  await expect(list(page, 'AXIOM').locator(`[data-node-id="${GOAL}"]`)).toHaveCount(1);
  await expect(card(page, GOAL)).toHaveAttribute('data-kind', 'AXIOM');
  // Its incoming arrows are gone with it.
  await expect(page.locator(`path[data-edge-id][data-target="${GOAL}"]`)).toHaveCount(0);
});

test('"Mark pending" posts claimPending; the host’s graph then shows "pending proof" (AR-8)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'light');
  await rightClick(page, await cardPoint(page, SIDE));
  await menuItem(page, 'mark-pending').click();
  expect((await postedOfType(page, 'claimPending')).map((m) => m.payload)).toEqual([{ id: SIDE, requestId: 'r1' }]);
  // Not optimistic: the status is the host's.
  await expect(card(page, SIDE).locator('[data-chip="pending"]')).toHaveCount(0);
  const pending = mapNode(arrowsGraph(2), SIDE, (n) =>
    withStatus({ ...n, lean: { ...n.lean, justification: 'Spyro.side_claim.holds', justificationKind: 'axiom' } }, { proof: { kind: 'pending' } }),
  );
  await send(page, hostMessage('graph', { graph: pending }));
  await expect(card(page, SIDE).locator('[data-chip="pending"]')).toHaveText('pending proof');
  // A pending card offers no "Mark pending" any more.
  await rightClick(page, await cardPoint(page, SIDE));
  await expect(boardMenu(page)).toBeVisible();
  await expect(menuItem(page, 'mark-pending')).toHaveCount(0);
});

test('a left drag on empty canvas draws the selection rectangle: it selects the cards and arrows wholly inside; Ctrl adds (CM-2)', async ({ page }) => {
  // The goal's arrows come from the AXIOMS column; SIDE rests on the goal (an arrow wholly on the canvas).
  board = await openBoard(page, chainGraph(), 'dark');
  await card(page, 'cynder-dark-past').click();
  const goal = await card(page, GOAL).boundingBox();
  const side = await card(page, SIDE).boundingBox();
  if (!goal || !side) throw new Error('no boxes');
  const selectedArrows = page.locator('path[data-edge-id].tl-edge--selected');
  // Around the goal only (from above-left of it to below-right of it): its arrows have an end outside.
  await page.mouse.move(goal.x - 14, goal.y - 14);
  await page.mouse.down();
  await page.mouse.move(goal.x + goal.width / 2, goal.y + goal.height / 2, { steps: 4 });
  await expect(page.locator('.tl-board')).toHaveAttribute('data-selecting', 'true');
  await page.mouse.move(goal.x + goal.width + 10, goal.y + goal.height + 10, { steps: 4 });
  await page.mouse.up();
  await settle(page);
  await expect(card(page, GOAL)).toHaveAttribute('data-selected', 'true');
  await expect(card(page, 'cynder-dark-past')).not.toHaveAttribute('data-selected', /.*/); // replaced
  await expect(card(page, SIDE)).not.toHaveAttribute('data-selected', /.*/);
  await expect(selectedArrows).toHaveCount(0);
  expect((await postedOfType(page, 'select')).at(-1)?.payload.ids).toEqual([GOAL]);
  // Ctrl: around the other card, added to the selection (the arrow between them is not inside either rectangle).
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.move(side.x - 10, side.y - 10);
  await page.mouse.down();
  await page.mouse.move(side.x + side.width + 10, side.y + side.height + 10, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('ControlOrMeta');
  await settle(page);
  await expect(card(page, GOAL)).toHaveAttribute('data-selected', 'true');
  await expect(card(page, SIDE)).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('context-summary')).toHaveText('2 cards');
  await expect(selectedArrows).toHaveCount(0);

  // Around both cards: the arrow from the goal into SIDE lies wholly inside, so it is selected with them; the arrows
  // from the column into the goal are only partly inside, so they are not.
  const left = Math.min(goal.x, side.x) - 14;
  const top = Math.min(goal.y, side.y) - 14;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 40, top + 30, { steps: 4 });
  await expect(page.locator('.tl-board')).toHaveAttribute('data-selecting', 'true');
  await page.mouse.move(Math.max(goal.x + goal.width, side.x + side.width) + 10, Math.max(goal.y + goal.height, side.y + side.height) + 10, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  await expect(arrowPath(page, GOAL, SIDE)).toHaveClass(/tl-edge--selected/);
  await expect(selectedArrows).toHaveCount(1);
  for (const source of ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']) await expect(arrowPath(page, source, GOAL)).not.toHaveClass(/tl-edge--selected/);
  await expect(card(page, GOAL)).toHaveAttribute('data-selected', 'true');
  await expect(card(page, SIDE)).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('context-summary')).toHaveText('1 arrow into “Spyro games avoid dark characters” · 2 cards');
  await page.screenshot({ path: shotPath('s1-rectangle-arrow.png') });
  // A plain click on empty canvas clears the selection.
  const empty = await canvasPoint(page, 0.6, 0.9);
  await page.mouse.click(empty.x, empty.y);
  await expect(contextSection(page)).toHaveAttribute('data-empty', 'true');
});

test('an arrow a proof uses without a declaration (TL107) is not selectable; its right-click menu offers "Draw this arrow" (AR-1, ES-2)', async ({ page }) => {
  board = await openBoard(page, edgeKindsGraph(), 'dark');
  await expect(arrowHit(page, 'cynder-dark-past', 'd-hyp')).toHaveAttribute('data-hit', 'undeclared');
  const at = await pointOnArrow(page, 'cynder-dark-past', 'd-hyp', 0.75);
  await page.mouse.click(at.x, at.y);
  await settle(page);
  await expect(contextSection(page)).toHaveAttribute('data-empty', 'true'); // a click selects nothing
  await rightClick(page, at);
  await expect(boardMenu(page)).toHaveAttribute('aria-label', /^Actions for the arrow the proof of “A PG game has no dark-past characters” uses from “Cynder is a character who has a dark pa…” \(not drawn\)$/);
  await expect(boardMenu(page).getByRole('menuitem')).toHaveText(['Draw this arrow', 'Show “Cynder is a character who has a dark pa…”', 'Show “A PG game has no dark-past characters”']);
  await menuItem(page, 'draw-this-arrow').click();
  expect((await postedOfType(page, 'addArrows')).map((m) => m.payload)).toEqual([{ target: 'd-hyp', sources: ['cynder-dark-past'], requestId: 'r1' }]);
  // Drawn now: a declared arrow the proof uses, so solid and selectable.
  await expect(arrowHit(page, 'cynder-dark-past', 'd-hyp')).toHaveAttribute('data-hit', 'drawn');
});

test('the AXIOMS column takes one proposition at a time; a single one lands where it is dropped among the axioms (AR-7)', async ({ page }) => {
  board = await openBoard(page, arrowsGraph(), 'dark');
  // Two propositions selected and moved together over the column: refused, saying why; nothing is sent.
  await card(page, GOAL).click();
  await card(page, SIDE).click({ modifiers: ['ControlOrMeta'] });
  await dragCard(page, GOAL, await columnPoint(page), async () => {
    await expect(page.locator('.tl-axioms')).toHaveAttribute('data-drop', 'refused');
    await expect(page.locator('.tl-axioms .tl-col__drop-label')).toHaveText('One card at a time');
    await expect(page.locator('.tl-dropzone[data-kind="AXIOM"] .tl-dropzone__summary')).toHaveText('Move one proposition at a time to the axioms');
  });
  await expect(page.getByTestId('toast').filter({ hasText: 'Move one proposition at a time to the axioms' })).toHaveAttribute('data-level', 'info');
  await expect(card(page, GOAL)).toHaveAttribute('data-place', 'canvas');
  expect(await postedOfType(page, 'kindChange')).toEqual([]);
  expect(await postedOfType(page, 'moveCards')).toEqual([]);

  // One proposition dropped onto the upper half of an axiom lands before it (beforeId), after the impact dialog.
  await page.keyboard.press('Escape');
  const before = await card(page, 'cynder-dark-past').boundingBox();
  if (!before) throw new Error('no box');
  await dragCard(page, SIDE, { x: before.x + before.width / 2, y: before.y + 6 });
  await page.getByTestId('dialog-rationale').getByRole('button', { name: 'Skip' }).click();
  expect((await postedOfType(page, 'kindChange')).map((m) => m.payload)).toEqual([{ id: SIDE, from: 'PROPOSITION', to: 'AXIOM', beforeId: 'cynder-dark-past', requestId: 'r1' }]);
  expect(await order(page, 'AXIOM')).toEqual(['pg-no-dark-past', SIDE, 'cynder-dark-past', 'new-spyro-pg']);
});

test('the ∅ mark’s right-click menu offers Formalize for dependencies first: the empty question (AR-5, CM-7)', async ({ page }) => {
  const marked = mapNode(arrowsGraph(), SIDE, (n) => ({ ...n, fromNothing: true }));
  board = await openBoard(page, marked, 'light');
  const stub = await page.locator(`[data-mark-id="${SIDE}"] .tl-mark__hit`).boundingBox();
  if (!stub) throw new Error('no ∅ stub');
  await rightClick(page, { x: stub.x + stub.width / 2, y: stub.y + stub.height / 2 });
  await expect(boardMenu(page)).toHaveAttribute('aria-label', 'Actions for the "follows from nothing" mark of “Spyro games avoid dark characters”');
  await expect(boardMenu(page).getByRole('menuitem')).toHaveText(['Formalize for dependencies', "Remove 'follows from nothing'", 'Show on board']);
  await expect(page.locator(`[data-mark-id="${SIDE}"]`)).toHaveClass(/tl-mark--selected/); // selected first
  await menuItem(page, 'formalize').click();
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([{ inferences: [{ target: SIDE, premises: [] }], requestId: 'r1' }]);
});
