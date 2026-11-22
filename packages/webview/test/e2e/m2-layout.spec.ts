/**
 * M2 layout and wording fixes from the round-1 UX review (on the spec v4 board):
 *  - a narrow board (the run panel below it) during a run: the Context Menu section (which replaced the tray) keeps its
 *    one line, and the A|P box (read-only during a run, ES-9) folds to its first row, so the board and the panel get
 *    the room; the panel's edge resizes it (drag, arrow keys, double click for the default size), kept per layout in
 *    the webview state;
 *  - new content in the panel comes into view: a question set;
 *  - declining the consent is an info toast.
 * Slice 2h retired M2's review (its statement step, the report card, the proposal banner and the diff marks), so the
 * tests of its layout went with it: the edit session's panel and board are tested in s2-review and s2-board.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, type QuestionView } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { answeredModality, GENERIC_QUESTION, MODALITY_QUESTION, runView, TARGET, UPDATED, waitingRun } from '../shared/runs';
import { EDIT_SESSION_ACTIVE } from '@telelean/core';
import { boardMenu, card, cardPoint, menuItem, openBoard, replyNext, rightClick, send, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** A 1440 x 900 window with the Explorer open gives the board about this much (the UX review's narrow case). */
const NARROW = { width: 790, height: 795 };

const SCOPE_QUESTION: QuestionView = {
  index: 2,
  phenomenon: 'word-sense',
  question: 'Is "a good addition" about the quality of the game or about its audience?',
  options: [
    { label: 'The game’s quality', consequence: 'A character can make the game better or worse.' },
    { label: 'The audience', consequence: 'A character can suit the game’s audience or not.' },
  ],
  affectedNodes: [TARGET],
};

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}

/** Whether `element`'s top is in the visible part of `container` (not above it, not in its lower 40%). */
async function topInView(element: Locator, container: Locator): Promise<boolean> {
  const e = await box(element);
  const c = await box(container);
  return e.y >= c.y - 1 && e.y <= c.y + c.height * 0.6;
}

async function selectAll(page: Page) {
  for (const id of ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', TARGET]) await card(page, id).click({ modifiers: ['ControlOrMeta'] });
}

const webviewState = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('tl-harness-webview-state') ?? '{}') as Record<string, unknown>);

test('a narrow board during a run: the Context Menu section keeps its one line, the A|P box folds to its first row, the panel gets the room', async ({ page }) => {
  await page.setViewportSize(NARROW);
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await selectAll(page);
  const section = page.getByTestId('context-menu');
  await expect(page.getByTestId('context-summary')).toHaveText('4 cards');
  const extra = page.locator('.tl-prompt__row--extra');
  await expect(extra).toBeVisible();

  await send(page, hostMessage('run', { run: waitingRun([MODALITY_QUESTION, GENERIC_QUESTION, SCOPE_QUESTION]) }));
  // The Context Menu section: one line, the selection summed up, Formalize disabled with the run's reason.
  await expect(page.getByTestId('formalize')).toBeDisabled();
  await expect(page.getByTestId('formalize-reason')).toHaveText('A run is active. Claude is waiting for your answer: answer it or cancel that run first.');
  expect((await box(section)).height).toBeLessThanOrEqual(34);
  // The A|P box folds to its first row; it is read-only during the run (ES-9) and says why.
  await expect(extra).toBeHidden();
  const input = page.getByRole('textbox', { name: 'New axiom' });
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', EDIT_SESSION_ACTIVE);

  // The panel gets most of the room (up to 60%), the board keeps the rest; the first question shows its options.
  const workspace = await box(page.locator('.tl-workspace'));
  const panel = await box(page.getByTestId('run-panel'));
  const area = await box(page.locator('.tl-board-area'));
  expect(panel.height).toBeGreaterThan(workspace.height * 0.58);
  expect(area.height).toBeGreaterThan(workspace.height * 0.38);
  expect(area.height).toBeGreaterThan(250);
  const body = page.locator('.tl-run__body');
  const firstOptions = page.getByTestId('question').first().getByTestId('option');
  const last = await box(firstOptions.last());
  const view = await box(body);
  expect(last.y + last.height).toBeLessThanOrEqual(view.y + view.height + 1);
  await page.screenshot({ path: shotPath('m2-narrow-questions.png') });

  // No run: the whole box again, and it can be used.
  await send(page, hostMessage('run', { run: null }));
  await expect(extra).toBeVisible();
  await expect(input).toBeEnabled();
});

test('the run panel’s edge resizes it: drag, arrow keys, End, double click for the default; kept per layout in the webview state', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run: runView(), clock: UPDATED });
  const panel = page.getByTestId('run-panel');
  const handle = page.getByTestId('run-resize');
  await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
  const workspace = await box(page.locator('.tl-workspace'));
  const start = await box(panel);

  // Drag the top edge up by 150 px.
  const h = await box(handle);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 150, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  const dragged = await box(panel);
  expect(Math.abs(dragged.height - (start.height + 150))).toBeLessThan(3);
  await expect(panel).toHaveAttribute('data-sized', 'true');
  const stored = (await webviewState(page)).runSplit as { narrow: number; wide: number | null };
  expect(stored.wide).toBeNull();
  expect(Math.abs(stored.narrow - dragged.height / workspace.height)).toBeLessThan(0.005);

  // Keys: ↓ takes 5% of the workspace from the panel; End gives it everything but the board's minimum (140 px).
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await settle(page);
  expect(Math.abs((await box(panel)).height - (dragged.height - workspace.height * 0.05))).toBeLessThan(3);
  await page.keyboard.press('End');
  await settle(page);
  expect(Math.abs((await box(panel)).height - (workspace.height - 140))).toBeLessThan(3);
  await page.screenshot({ path: shotPath('m2-narrow-resized.png') });

  // A reload keeps the size.
  const kept = await box(panel);
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await expect(page.getByTestId('run-panel')).toHaveAttribute('data-sized', 'true');
  expect(Math.abs((await box(page.getByTestId('run-panel'))).height - kept.height)).toBeLessThan(3);

  // Double click: back to the default size (what the content needs, up to 60%).
  await page.getByTestId('run-resize').dblclick();
  await expect(page.getByTestId('run-panel')).not.toHaveAttribute('data-sized', /.*/);
  expect(Math.abs((await box(page.getByTestId('run-panel'))).height - start.height)).toBeLessThan(3);
  expect(((await webviewState(page)).runSplit as { narrow: number | null }).narrow).toBeNull();

  // Beside the board (a wide board) the left edge resizes the width, separately from the narrow size.
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(page.getByTestId('run-resize')).toHaveAttribute('aria-orientation', 'vertical');
  const wide = await box(page.getByTestId('run-panel'));
  const w = await box(page.getByTestId('run-resize'));
  await page.mouse.move(w.x + w.width / 2, w.y + 200);
  await page.mouse.down();
  await page.mouse.move(w.x + w.width / 2 - 100, w.y + 200, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  expect(Math.abs((await box(page.getByTestId('run-panel'))).width - (wide.width + 100))).toBeLessThan(3);
  expect(((await webviewState(page)).runSplit as { narrow: number | null; wide: number }).wide).toBeGreaterThan(0.3);
});

test('new content in the run panel comes into view: a question set', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const activity = Array.from({ length: 40 }, (_, i) => ({ at: UPDATED, kind: 'tool' as const, text: `tool call number ${i + 1}` }));
  const answered = [answeredModality()];
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), run: runView({ activity, answered }), clock: UPDATED });
  const body = page.locator('.tl-run__body');
  // Scrolled down to the activity feed when a question arrives: its set comes into view.
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await send(page, hostMessage('run', { run: waitingRun([GENERIC_QUESTION], { activity, answered }) }));
  await expect.poll(() => topInView(page.getByTestId('question-set'), body)).toBe(true);
});

test('declining the consent is an info toast (the user’s own choice), cleared by the next start', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  // The question: the arrows into the goal (its right-click menu's "Select incoming arrows").
  await rightClick(page, await cardPoint(page, TARGET));
  await menuItem(page, 'select-incoming').click();
  await expect(boardMenu(page)).toHaveCount(0);
  const declined = 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").';
  await replyNext(page, 'formalize', { ok: false, code: 'not-yet', error: declined });
  const formalize = page.getByTestId('formalize');
  await formalize.click();
  const toast = page.getByTestId('toast').filter({ hasText: 'Not started:' });
  await expect(toast).toHaveAttribute('data-level', 'info');
  await expect(formalize).toBeEnabled();
  await formalize.click();
  await expect(toast).toHaveCount(0);
});
