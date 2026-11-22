/**
 * Slice 2h (docs/slice2-plan.md 5.10-5.12; drafted by builder 2h): the board during an edit session, fed the host's
 * `session` messages (test/shared/sessions.ts).
 *  - the Proposed view of a stage whose results are hidden: the neutral chip on the target, the card marks (glyph, word,
 *    status), no Claude arrow and no "Claude suggests" card; the legend's `proposed` entry;
 *  - once shown: Claude's arrow translucent with its "+" badge (a dashed outline in high contrast), a click shows its
 *    review item and never selects it, its menu Accepts it (own: true); accepted, it is an arrow like the person's; the
 *    "Claude suggests" card at the top of the AXIOMS column with "Review it";
 *  - Formalize mid-stage posts the run id and the stage; while the results are hidden it offers Show results; on the
 *    Current view it says to switch;
 *  - Undo is the session's in the Proposed view (and in the session's scope); on the Current view the board stack is
 *    locked, with its reason; a move is `moveProposed`, never `moveCards`;
 *  - the Context Menu section names the selection's review items and accepts them as a group (own: false);
 *  - while Claude's step runs (D2-62) nothing is decided, moved or asked.
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, REVIEW_TEXTS, spyroGraph, type RunView, type SessionView } from '@telelean/core';
import { markText } from '../../src/model/sessionBoard';
import { workspaceState } from '../shared/graphs';
import { hiddenStage, IDS, SESSION_RUN, sessionRun, shownStage, stepSession, TARGET } from '../shared/sessions';
import { arrowHit, arrowPath, boardMenu, canvasPoint, card, cardPoint, clickArrow, dragCard, menuItem, openBoard, panToShow, postedOfType, rightClick, send, settle, shotPath, type OpenedBoard, type Theme } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

const PG = 'new-spyro-pg';
const DARK = 'cynder-dark-past';
const RULE = 'pg-no-dark-past';

/** The Formalize item's mark on the rule, and (for the group tests) the vocabulary item's on Cynder's dark past. */
const MARKS: SessionView['board']['marks'] = {
  [RULE]: [{ item: IDS.formalize, kind: 'formalize', status: 'in-review' }],
  [DARK]: [{ item: IDS.vocab, kind: 'vocabulary-term', status: 'in-review' }],
};
const withMarks = (view: SessionView): SessionView => ({ ...view, board: { ...view.board, marks: MARKS } });

/** Opens the board with a wide run panel (the list and the detail side by side), then the session's run and view. */
async function openSession(page: Page, session: SessionView, theme: Theme = 'dark', run: RunView = sessionRun(session)) {
  board = await openBoard(page, spyroGraph(), theme, { workspace: workspaceState(), state: { runSplit: { wide: 0.55, narrow: null } } });
  await send(page, hostMessage('run', { run }));
  await send(page, hostMessage('session', { session }));
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'proposed');
}

test('the Proposed view of a hidden stage: the neutral chip, the card marks, no Claude arrow or "Claude suggests" card; the legend’s proposed entry', async ({ page }) => {
  await openSession(page, withMarks(hiddenStage()));
  await expect(card(page, TARGET).locator('[data-chip="result-hidden"]')).toHaveText(REVIEW_TEXTS.resultAfterReview);
  const mark = card(page, RULE).getByTestId('item-mark');
  await expect(mark).toHaveText(markText({ kind: 'formalize', status: 'in-review' }));
  await expect(mark).toHaveAttribute('data-mark', 'changed');
  await expect(page.locator('[data-badge-for]')).toHaveCount(0);
  await expect(page.locator('[data-hit="proposed"]')).toHaveCount(0);
  await expect(page.getByTestId('ghost-card')).toHaveCount(0);
  await expect(page.locator('[data-legend="proposed"]')).toHaveText(new RegExp(REVIEW_TEXTS.legendProposed.replace(/[+]/g, '\\+')));
  // A mark's click shows its item in the review panel.
  await mark.click();
  await expect(page.locator(`[data-testid="review-row"][data-item="${IDS.formalize}"]`)).toHaveAttribute('data-current', 'true');
  await page.screenshot({ path: shotPath('s2-board-hidden.png') });
});

test('once shown: Claude’s arrow translucent with "+", a click shows its item and never selects it; its menu Accepts it; the "Claude suggests" card', async ({ page }) => {
  await openSession(page, shownStage());
  const claude = arrowPath(page, PG, TARGET);
  await expect(claude).toHaveClass(/tl-edge--proposed/);
  await expect(claude).toHaveClass(/tl-edge--translucent/);
  expect(Number(await claude.evaluate((el) => getComputedStyle(el).opacity))).toBeCloseTo(0.45, 2);
  await expect(page.locator(`[data-badge-for="${PG}->${TARGET}"] .tl-arrow-badge__glyph`)).toHaveText('+');
  await expect(arrowHit(page, PG, TARGET)).toHaveAttribute('data-hit', 'proposed');
  await expect(arrowHit(page, PG, TARGET)).toHaveAttribute('data-hit-item', IDS.arrow);
  // A click focuses its review item; nothing is selected (D2-20).
  await clickArrow(page, PG, TARGET, false, 0.5);
  await expect(page.locator(`[data-testid="review-row"][data-item="${IDS.arrow}"]`)).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('context-menu')).toHaveAttribute('data-empty', 'true');
  // The "Claude suggests" card, at the top of the AXIOMS column, decided only in the list.
  const ghost = page.locator(`[data-ghost-id="${IDS.premise}"]`);
  await expect(ghost).toBeVisible();
  await expect(ghost.getByTestId('ghost-status')).toHaveText(markText({ kind: 'add-premise', status: 'in-review' }));
  const ghostBox = await ghost.boundingBox();
  const firstAxiom = await card(page, DARK).boundingBox();
  expect(ghostBox && firstAxiom && ghostBox.y < firstAxiom.y).toBe(true);
  await ghost.getByTestId('ghost-review').click();
  await expect(page.locator(`[data-testid="review-row"][data-item="${IDS.premise}"]`)).toHaveAttribute('data-current', 'true');
  await page.screenshot({ path: shotPath('s2-board-shown.png') });
  // Its right-click menu: Accept (its own Accept), Decline…, Show its review item, both ends.
  await rightClick(page, await (async () => {
    const at = await arrowPath(page, PG, TARGET).evaluate((p) => {
      const el = p as SVGPathElement;
      const origin = el.ownerSVGElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const point = el.getPointAtLength(el.getTotalLength() * 0.5);
      return { x: origin.left + point.x, y: origin.top + point.y };
    });
    return at;
  })());
  await expect(boardMenu(page).getByRole('menuitem')).toHaveText([REVIEW_TEXTS.accept, 'Decline…', REVIEW_TEXTS.showReviewItem, /^Show “The new Spyro game is PG”$/, /^Show “Cynder would not be/]);
  await menuItem(page, 'accept-item').click();
  expect((await postedOfType(page, 'decideItems')).map((m) => m.payload)).toEqual([
    { runId: SESSION_RUN, stage: 1, own: true, decisions: [{ item: IDS.arrow, rev: 1, to: 'accepted' }], requestId: expect.any(String) },
  ]);
  // Accepted: dotted with its badge, no longer translucent, and selectable like the person's arrows.
  await send(page, hostMessage('session', { session: shownStage({ arrow: 'accepted' }) }));
  await expect(claude).not.toHaveClass(/tl-edge--translucent/);
  await expect(claude).toHaveAttribute('data-pattern', 'declared');
  await expect(page.locator(`[data-badge-for="${PG}->${TARGET}"] .tl-arrow-badge__glyph`)).toHaveText('+');
  await clickArrow(page, PG, TARGET, false, 0.5);
  await expect(page.getByTestId('context-summary')).toContainText('1 arrow into');
});

test('high contrast: Claude’s arrow is not translucent but dashed, and keeps its badge', async ({ page }) => {
  await openSession(page, shownStage(), 'hc');
  const claude = arrowPath(page, PG, TARGET);
  expect(await claude.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await claude.evaluate((el) => getComputedStyle(el).strokeDasharray)).toMatch(/^7(px)?,? 4/);
  await expect(page.locator(`[data-badge-for="${PG}->${TARGET}"] .tl-arrow-badge__glyph`)).toHaveText('+');
  await page.screenshot({ path: shotPath('s2-board-hc.png') });
});

test('Formalize mid-stage: Show results while hidden; "switch to Proposed" on Current; posts the run id and the stage once shown', async ({ page }) => {
  await openSession(page, hiddenStage());
  const formalize = page.getByTestId('formalize');
  const reason = page.getByTestId('formalize-reason');
  await clickArrow(page, DARK, TARGET);
  await expect(formalize).toBeDisabled();
  await expect(reason).toHaveText(REVIEW_TEXTS.formalizeResultsHidden);
  await expect(page.getByTestId('formalize-show-results')).toHaveText(REVIEW_TEXTS.showResults);
  // The Current view during a session.
  await page.getByTestId('session-toggle').getByRole('radio', { name: 'Current' }).click();
  await clickArrow(page, DARK, TARGET);
  await expect(reason).toHaveText(REVIEW_TEXTS.formalizeCurrentView);
  // Shown, on Proposed: a mid-stage Formalize of stage 1.
  await page.getByTestId('session-toggle').getByRole('radio', { name: 'Proposed' }).click();
  await send(page, hostMessage('session', { session: shownStage() }));
  await clickArrow(page, DARK, TARGET);
  await expect(formalize).toBeEnabled();
  await formalize.click();
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([
    { inferences: [{ target: TARGET, premises: [DARK] }], runId: SESSION_RUN, stage: 1, requestId: expect.any(String) },
  ]);
});

test('Undo: the session’s in the Proposed view (Ctrl+Z posts its top step); on Current the board stack is locked and says why; moves are moveProposed', async ({ page }) => {
  await openSession(page, shownStage());
  const undo = page.getByTestId('undo');
  await expect(undo).toHaveAttribute('title', 'Undo: Show results (Ctrl+Z)');
  const empty = await canvasPoint(page, 0.9, 0.9);
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await postedOfType(page, 'sessionUndo')).map((m) => m.payload)).toEqual([{ runId: SESSION_RUN, step: 4, requestId: expect.any(String) }]);
  await send(page, hostMessage('session', { session: shownStage() }));
  // The Current view: the board stack, locked; Ctrl+Z posts nothing once the focus left the session bar.
  await page.getByTestId('session-toggle').getByRole('radio', { name: 'Current' }).click();
  await page.mouse.click(empty.x, empty.y);
  await settle(page);
  await expect(undo).toBeDisabled();
  await expect(undo).toHaveAttribute('title', REVIEW_TEXTS.boardUndoLocked);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await postedOfType(page, 'sessionUndo')).toHaveLength(1);
  expect(await postedOfType(page, 'undo')).toEqual([]);
  // A move on the Proposed view is a session step.
  await page.getByTestId('session-toggle').getByRole('radio', { name: 'Proposed' }).click();
  await panToShow(page, card(page, TARGET));
  const from = await cardPoint(page, TARGET);
  await dragCard(page, TARGET, { x: from.x + 80, y: from.y + 60 });
  expect(await postedOfType(page, 'moveProposed')).toHaveLength(1);
  expect(await postedOfType(page, 'moveCards')).toEqual([]);
});

test('fixer 2h r1 (F-F-V2H-FC-2): on the Current view with the focus in the session bar, a mouse click on the toolbar Undo does what it says: the session’s step', async ({ page }) => {
  await openSession(page, shownStage());
  const undo = page.getByTestId('undo');
  await page.getByTestId('session-toggle').getByRole('radio', { name: 'Current' }).click();
  await settle(page);
  // The focus is in the session bar: the button shows the session's top step, and the click must act on it. A press on
  // the button used to move the focus out of the scope first, so the click ran the (locked) board Undo and posted nothing.
  await expect(page.locator('[data-undo-stack]')).toHaveAttribute('data-undo-stack', 'session');
  await expect(undo).toHaveAttribute('title', 'Undo: Show results (Ctrl+Z)');
  await undo.click();
  expect((await postedOfType(page, 'sessionUndo')).map((m) => m.payload)).toEqual([{ runId: SESSION_RUN, step: 4, requestId: expect.any(String) }]);
  expect(await postedOfType(page, 'undo')).toEqual([]);
});

test('the Context Menu section names the selection’s review items and accepts them as a group (own: false), saying what it leaves', async ({ page }) => {
  await openSession(page, withMarks(shownStage()));
  await card(page, DARK).click();
  await card(page, RULE).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('context-summary')).toHaveText('2 cards · 2 review items');
  const accept = page.getByTestId('context-accept');
  await expect(accept).toHaveText(REVIEW_TEXTS.acceptKOfN(1, 2));
  await expect(accept).toHaveAttribute('title', new RegExp(REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”').replace(/[“”()]/g, '.')));
  await accept.click();
  expect((await postedOfType(page, 'decideItems')).map((m) => m.payload)).toEqual([
    {
      runId: SESSION_RUN,
      stage: 1,
      own: false,
      decisions: [
        { item: IDS.vocab, rev: 1, to: 'accepted' },
        { item: IDS.formalize, rev: 1, to: 'accepted' },
      ],
      requestId: expect.any(String),
    },
  ]);
});

test('while Claude’s step runs (D2-62) the Proposed view decides, moves and asks nothing', async ({ page }) => {
  await openSession(page, withMarks(stepSession()));
  await card(page, DARK).click();
  await expect(page.getByTestId('context-accept')).toBeDisabled();
  await expect(page.getByTestId('context-accept')).toHaveAttribute('title', REVIEW_TEXTS.stepRunning);
  await clickArrow(page, DARK, TARGET);
  await expect(page.getByTestId('formalize-reason')).toHaveText(REVIEW_TEXTS.formalizeStepRunning);
  await expect(page.getByTestId('undo')).toHaveAttribute('title', REVIEW_TEXTS.stepRunning);
  await panToShow(page, card(page, TARGET));
  const from = await cardPoint(page, TARGET);
  await dragCard(page, TARGET, { x: from.x + 80, y: from.y + 60 });
  expect(await postedOfType(page, 'moveProposed')).toEqual([]);
  expect(await postedOfType(page, 'decideItems')).toEqual([]);
});
