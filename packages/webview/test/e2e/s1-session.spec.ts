/**
 * Spec v4 ES-9, UN-3 (slice 1f): while a run (in slice 1, the edit session) of the model folder is active, the Current
 * board cannot be edited at all: the A|P box, the arrow handles, the card's and the menus' edit actions (Draw arrows
 * from the selection included), Delete, moving cards, Undo and Redo, History's "Revert to this" and "New subject…" are
 * disabled (each with the reason on hover, or an info toast when a key asks), while selecting, expanding, panning,
 * zooming and the History list still work. In the Proposed view the arrow handles and actions are disabled with their
 * own reason (slice 2h: an edit session's Proposed view, which selects). When the run ends, the board is editable again.
 */
import { expect, test } from '@playwright/test';
import { EDIT_SESSION_ACTIVE, hostMessage, spyroGraph, type TlGraph } from '@telelean/core';
import { historyListing, makeNode, workspaceState } from '../shared/graphs';
import { runView, TARGET, UPDATED } from '../shared/runs';
import { sessionRun, shownStage } from '../shared/sessions';
import {
  boardMenu,
  canvasView,
  card,
  cardPoint,
  dragCard,
  menuItem,
  openBoard,
  posted,
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
const PROPOSED_ARROWS = 'Arrows change only through review items and transforms.';

function sessionGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } });
  return { ...base, nodes: [...base.nodes, side], positions: { [SIDE]: { x: 760, y: 60 } } };
}

/** Every message the board posted that changes something (not the diagnostics, the selection or the history listing). */
async function edits(page: import('@playwright/test').Page) {
  const viewing = new Set(['diagnostic', 'ready', 'select', 'historyList', 'copyText', 'openInEditor']);
  return (await posted(page)).filter((m) => !viewing.has(m.type)).map((m) => m.type);
}

test('during a run the Current board is read-only: the A|P box, handles, edit actions, Delete, moves, Undo and Redo, History’s revert and New subject are off, with the reason; viewing works (ES-9, UN-3)', async ({ page }) => {
  board = await openBoard(page, sessionGraph(), 'dark', { workspace: workspaceState({ redo: 'Delete: x' }), history: historyListing(), run: runView(), clock: UPDATED });
  await expect(page.getByTestId('run-panel')).toBeVisible();

  // The A|P box: disabled, its placeholder says why.
  const input = page.getByRole('textbox', { name: 'New axiom' });
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', EDIT_SESSION_ACTIVE);
  await expect(page.getByTestId('prompt-add')).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Proposition' })).toBeDisabled();

  // Undo and Redo: disabled with the reason; the keys post nothing.
  for (const name of ['Undo', 'Redo']) {
    const button = page.locator(`button.tl-icon-button--toolbar[aria-label="${name}"]`);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  }
  await card(page, 'cynder-dark-past').click(); // selecting works
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');

  // The arrow handles are shown disabled, with the reason; dragging one draws nothing.
  await expect(page.locator('.tl-handle[data-handle]')).toHaveCount(0);
  await expect(card(page, 'pg-no-dark-past').locator(':scope > .tl-handle')).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  await card(page, 'pg-no-dark-past').locator('.tl-card__text').hover();
  const handle = await card(page, 'pg-no-dark-past').locator(':scope > .tl-handle').boundingBox();
  const into = await cardPoint(page, SIDE);
  if (!handle) throw new Error('no handle');
  await page.mouse.move(handle.x + 4, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(into.x, into.y, { steps: 10 });
  await expect(page.locator('.tl-board')).not.toHaveAttribute('data-drawing', /.*/);
  await page.mouse.up();

  // The card's details: the reason above its controls; Edit, Add why, Delete and the arrow actions disabled.
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await expect(dark.getByTestId('board-locked')).toHaveText(EDIT_SESSION_ACTIVE);
  for (const id of ['edit-sentence', 'edit-why', 'delete-card', 'from-nothing']) {
    await expect(dark.getByTestId(id)).toBeDisabled();
    await expect(dark.getByTestId(id)).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  }
  await page.screenshot({ path: shotPath('s1-session-locked.png') });

  // The right-click menu lists every edit, disabled with the reason; viewing and selecting entries stay enabled. With
  // another card selected, it offers AR-1's second way to draw, "Draw an arrow from the selection": off too (CM-4).
  await expect(card(page, 'cynder-dark-past')).toHaveAttribute('data-selected', 'true');
  await rightClick(page, await cardPoint(page, TARGET));
  await expect(boardMenu(page)).toBeVisible();
  await expect(menuItem(page, 'draw-from-selection')).toHaveText('Draw an arrow from the selection');
  for (const action of ['draw-from-selection', 'mark-pending', 'move-to-axioms', 'edit', 'why', 'delete']) {
    await expect(menuItem(page, action)).toBeDisabled();
    await expect(menuItem(page, action)).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  }
  await expect(menuItem(page, 'show')).toBeEnabled();
  await expect(menuItem(page, 'select-incoming')).toBeEnabled();
  await menuItem(page, 'select-incoming').click();

  // The arrows are selected (selecting is viewing), but Formalize and Delete are off; the Delete key says why.
  await expect(page.getByTestId('context-summary')).toHaveText('3 arrows into “Cynder would not be a good addition to …”');
  await expect(page.getByTestId('formalize')).toBeDisabled();
  await expect(page.getByTestId('formalize-reason')).toHaveText('A run is active. Claude is already working: wait for it to finish, or cancel it.');
  await expect(page.getByTestId('context-actions').locator('[data-action="remove-selection"]')).toBeDisabled();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('toast').filter({ hasText: EDIT_SESSION_ACTIVE })).toHaveAttribute('data-level', 'info');

  // A canvas card does not move.
  const before = await card(page, SIDE).boundingBox();
  const target = await cardPoint(page, TARGET);
  await dragCard(page, SIDE, { x: target.x + 40, y: target.y + 160 });
  const after = await card(page, SIDE).boundingBox();
  expect(after?.x).toBeCloseTo(before?.x ?? NaN, 0);
  expect(after?.y).toBeCloseTo(before?.y ?? NaN, 0);

  // Viewing works: the wheel zooms.
  const view = await canvasView(page);
  const at = await cardPoint(page, SIDE);
  await page.mouse.move(at.x, at.y + 120);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await canvasView(page)).s).toBeGreaterThan(view.s);

  // History lists the entries (viewing), but "Revert to this" writes the files: disabled, with the reason (ES-9); so is
  // the subject picker's "New subject…" (it changes Model.lean).
  await page.getByTestId('history-button').click();
  const revert = page.getByTestId('history-menu').getByTestId('history-revert');
  await expect(revert).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(revert.nth(i)).toBeDisabled();
    await expect(revert.nth(i)).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  }
  await revert.first().click({ force: true });
  await expect(page.getByTestId('dialog-revert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('history-menu')).toHaveCount(0);
  await page.getByTestId('subject-picker').click();
  const newSubject = page.getByTestId('subject-menu').getByTestId('new-subject');
  await expect(newSubject).toBeDisabled();
  await expect(newSubject).toHaveAttribute('title', EDIT_SESSION_ACTIVE);
  await newSubject.click({ force: true });
  await expect(page.getByTestId('subject-menu').getByRole('textbox', { name: 'New subject name' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('subject-menu')).toHaveCount(0);

  // Nothing that edits was posted during all of this (no historyRevert, no createSubject either).
  expect(await edits(page)).toEqual([]);

  // The run ends: the board can be edited again.
  await send(page, hostMessage('run', { run: runView({ state: 'cancelled', endedAt: UPDATED }) }));
  await expect(input).toBeEnabled();
  await expect(page.locator('.tl-handle[data-handle]').first()).toBeAttached();
  await expect(dark.getByTestId('board-locked')).toHaveCount(0);
  await expect(dark.getByTestId('edit-sentence')).toBeEnabled();
  await page.getByTestId('history-button').click();
  await expect(revert.first()).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('in the Proposed view the handles and the arrow actions are disabled with "Arrows change only through review items and transforms." (slice 2h: a session’s, which selects)', async ({ page }) => {
  board = await openBoard(page, sessionGraph(), 'dark', { workspace: workspaceState(), clock: UPDATED });
  const session = shownStage();
  await send(page, hostMessage('run', { run: sessionRun(session) }));
  await send(page, hostMessage('session', { session }));
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'proposed');
  await expect(page.locator('.tl-handle[data-handle]')).toHaveCount(0);
  await expect(card(page, TARGET).locator(':scope > .tl-handle')).toHaveAttribute('title', PROPOSED_ARROWS);
  // The right-click selects the card (slice 2h: the session's view selects, §5.10) and offers the arrow actions disabled.
  await rightClick(page, await cardPoint(page, TARGET));
  await expect(menuItem(page, 'move-to-axioms')).toBeDisabled();
  await expect(menuItem(page, 'move-to-axioms')).toHaveAttribute('title', PROPOSED_ARROWS);
  await expect(menuItem(page, 'show')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(card(page, TARGET)).toHaveAttribute('data-selected', /.*/);
  expect((await postedOfType(page, 'select')).map((m) => m.payload)).toEqual([{ ids: [TARGET] }]);
  // Its expanded card shows the same, disabled.
  await card(page, TARGET).locator('.tl-card__chevron').click();
  await expect(card(page, TARGET).getByTestId('proposal-readonly')).toContainText("This is the edit session's Proposed view");
  await expect(card(page, TARGET).getByTestId('arrow-actions').getByTestId('make-axiom')).toBeDisabled();
  await expect(card(page, TARGET).getByTestId('arrow-actions').getByTestId('make-axiom')).toHaveAttribute('title', PROPOSED_ARROWS);
  await settle(page);
  // Nothing that changes the board was posted (the selection is viewing).
  expect((await edits(page)).filter((t) => t !== 'moveProposed')).toEqual([]);
});

test('in the Proposed view an old axiom is named only in its chip tooltip: its details have no "declared before v4" line (slice 2i round 1, F-F3)', async ({ page }) => {
  // pg-no-dark-past (an axiom) was written before v4 with `premises: [cynder-dark-past]`, in the board and in the session's board.
  const OLD = 'pg-no-dark-past';
  const base = spyroGraph(11);
  const withOld = (g: TlGraph): TlGraph => ({ ...g, nodes: g.nodes.map((n) => (n.id === OLD ? { ...n, premises: ['cynder-dark-past'] } : n)) });
  board = await openBoard(page, withOld(base), 'dark', { workspace: workspaceState(), clock: UPDATED });
  const chip = card(page, OLD).locator('[data-chip="declared-before-v4"]');
  // The Current view: the line (and the two choices) are in the details.
  await card(page, OLD).locator('.tl-card__chevron').click();
  await expect(card(page, OLD).getByTestId('declared-before-v4')).toHaveText('Declared before v4 (not drawn): arrows from “Cynder is a character who has a dark past”.');
  await card(page, OLD).locator('.tl-card__chevron').click();
  const shown = shownStage();
  const session = { ...shown, board: { ...shown.board, graph: withOld(shown.board.graph) } };
  await send(page, hostMessage('run', { run: sessionRun(session) }));
  await send(page, hostMessage('session', { session }));
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'proposed');
  await expect(chip).toHaveAttribute('title', /from “Cynder is a character who has a dark past”/);
  await card(page, OLD).locator('.tl-card__chevron').click();
  await expect(card(page, OLD).getByTestId('proposal-readonly')).toBeVisible();
  await expect(card(page, OLD).getByTestId('declared-before-v4')).toHaveCount(0);
  await expect(card(page, OLD).getByTestId('legacy-drop-arrows')).toHaveCount(0);
});
