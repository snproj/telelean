/**
 * M2 proposal overlay (AT6.5): the Current | Proposed toggle; diff marks with a glyph, a word, a colour and a halo
 * (never colour alone); "+N new" vocabulary opened in the proposed view; the result hidden until the review reveals it
 * (D-19); translucent "Claude suggests" cards with "I hold this" (optional why) and "No". And the attempts history in
 * the expanded card (AT6.6).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, type ProposalView } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { ADOPTED_ID, adoptedProposal, attemptsGraph, literalGhost, literalProposal, reviewRun, RUN_ID, TARGET, UPDATED } from '../shared/runs';
import { card, list, openBoard, postedOfType, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** The harness's fallbacks for VS Code's git colours (board.css: --tl-diff-*). */
const ADDED = 'rgb(129, 184, 139)';
const CHANGED = 'rgb(226, 192, 141)';

async function openProposal(page: Page, proposal: ProposalView) {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
}

const style = (locator: Locator, property: 'color' | 'boxShadow' | 'opacity' | 'borderTopStyle' | 'fontStyle') =>
  locator.evaluate((el, p) => getComputedStyle(el)[p], property);

test('AT6.5 the overlay: Current | Proposed; diff marks with glyph, word, colour and halo; "+N new" vocabulary open; the result hidden until revealed', async ({ page }) => {
  await openProposal(page, adoptedProposal());
  const toggle = page.getByTestId('proposal-toggle');
  // A new proposal switches the board to it.
  await expect(toggle.getByRole('radio', { name: 'Proposed' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'proposed');
  await expect(page.getByTestId('proposal-counts')).toHaveText('1 new · 2 changed · +1 vocabulary');
  await expect(page.locator('[data-node-id]')).toHaveCount(5);

  // Diff marks: glyph + word + colour + halo.
  const adopted = card(page, ADOPTED_ID);
  await expect(adopted).toHaveAttribute('data-diff', 'added');
  await expect(adopted.getByTestId('diff-badge')).toHaveText('+new');
  expect(await style(adopted.getByTestId('diff-badge'), 'color')).toBe(ADDED);
  expect(await style(adopted, 'boxShadow')).toContain(ADDED);
  const rule = card(page, 'pg-no-dark-past');
  await expect(rule.getByTestId('diff-badge')).toHaveText('~changed');
  // Its formalisation (not a proof result) is shown even while the result is hidden.
  await expect(rule.getByTestId('diff-badge')).toHaveAttribute('title', 'Changed in the proposal: Lean statement, Lean binding, status');
  expect(await style(rule.getByTestId('diff-badge'), 'color')).toBe(CHANGED);
  expect(await style(rule, 'boxShadow')).toContain(CHANGED);
  await expect(card(page, 'cynder-dark-past')).not.toHaveAttribute('data-diff', /.*/);
  // The adopted card keeps Claude's wording style.
  expect(await style(adopted.locator('.tl-card__text'), 'fontStyle')).toBe('italic');
  await expect(adopted.locator('.tl-card__agent-marker')).toHaveText(" (Claude's wording)");

  // D-19: the target's result stays hidden (no proof chip, no verified arrows into it) until the review reveals it.
  const goal = card(page, TARGET);
  await expect(goal.locator('[data-chip="result-hidden"]')).toHaveText('result after the review');
  await expect(goal.locator('[data-chip="established"]')).toHaveCount(0);
  await expect(goal).not.toHaveAttribute('data-glow', 'established'); // RV-6: no green glow before the reveal either
  await expect(goal.getByTestId('diff-badge')).toHaveAttribute('title', 'Changed in the proposal');
  await expect(page.locator(`path[data-target="${TARGET}"][data-pattern="verified"]`)).toHaveCount(0);

  // "+1 new": the Vocabulary band is open in the proposed view and marks the new item.
  const vocabulary = page.getByTestId('vocabulary');
  await expect(vocabulary).not.toHaveAttribute('data-collapsed', /.*/);
  await expect(vocabulary.getByTestId('vocab-new')).toHaveText('+1 new');
  const inGame = page.locator('.tl-vocab__item[data-vocab="Spyro.InGame"]');
  await expect(inGame).toHaveAttribute('data-diff', 'added');
  await expect(inGame.getByTestId('diff-badge')).toHaveText('+new');
  await expect(inGame.locator('.tl-vocab__gloss')).toHaveAttribute('data-provenance', 'agent');
  await page.screenshot({ path: shotPath('m2-overlay-proposed.png') });

  // Read-only: a click selects nothing; the expanded card offers no edits.
  await rule.click();
  expect(await postedOfType(page, 'select')).toEqual([]);
  await rule.locator('.tl-card__chevron').click();
  await expect(rule.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(rule).toContainText('This is Claude’s proposal (read-only)');

  // Current: the user's files as they are (no marks, the user's own collapsed vocabulary).
  await toggle.getByRole('radio', { name: 'Current' }).click();
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'current');
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await expect(page.locator('[data-diff]')).toHaveCount(0);
  await expect(vocabulary).toHaveAttribute('data-collapsed', 'true');
  await expect(card(page, ADOPTED_ID)).toHaveCount(0);

  // Revealing the result (the review's "Show result") shows the target's proof in the proposed view.
  await page.getByTestId('show-result').click();
  await toggle.getByRole('radio', { name: 'Proposed' }).click();
  await expect(goal.locator('[data-chip="established"]')).toHaveText('✓ established');
  await expect(goal.locator('[data-chip="result-hidden"]')).toHaveCount(0);
  await expect(page.locator(`path[data-target="${TARGET}"][data-pattern="verified"]`)).not.toHaveCount(0);
  await page.screenshot({ path: shotPath('m2-overlay-revealed.png') });
});

test('AT6.5 "Claude suggests": translucent ghost cards, "I hold this" with an optional reason posts adoptGhost, "No" posts rejectGhost', async ({ page }) => {
  const alone = literalGhost({ id: 'ghost-2', naturalName: 'Cynder would not be a good addition to it', leanStatement: '¬ GoodAddition cynder newSpyro', leanName: 'cynder_not_good_2', aloneEntails: true });
  await openProposal(page, literalProposal({ ghosts: [literalGhost(), alone] }));
  await send(page, hostMessage('run', { run: reviewRun(literalProposal(), { ghosts: [literalGhost(), alone] }) }));
  const column = list(page, 'AXIOM');
  const ghost = column.locator('[data-ghost-id="ghost-1"]');
  await expect(ghost).toBeVisible();
  await expect(ghost.locator('.tl-ghost__marker')).toHaveText('Claude suggests');
  expect(Number(await style(ghost, 'opacity'))).toBeLessThan(1);
  expect(await style(ghost, 'borderTopStyle')).toBe('solid'); // dashing is reserved for declared support
  expect(await style(ghost.getByTestId('ghost-sentence'), 'fontStyle')).toBe('italic');
  await expect(ghost.getByTestId('ghost-lean')).toHaveText('∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g');
  await expect(ghost.locator('[data-chip="closes-gap"]')).toHaveText('closes the gap (checked)');
  await expect(ghost.locator('[data-chip="alone-entails"]')).toHaveCount(0);
  await expect(column.locator('[data-ghost-id="ghost-2"] [data-chip="alone-entails"]')).toContainText('gives the goal on its own');
  // Ghost cards are not cards of the model: no data-node-id, so no arrows attach to them.
  await expect(ghost.locator('[data-node-id]')).toHaveCount(0);
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await page.screenshot({ path: shotPath('m2-ghosts.png') });

  // I hold this -> the optional reason -> Adopt.
  await ghost.getByRole('button', { name: 'I hold this' }).click();
  const why = ghost.getByRole('textbox', { name: 'Why do you hold it? (optional)' });
  await expect(why).toBeFocused();
  await why.fill('it seems obvious to me');
  await why.press('Enter');
  // Without a reason, from the report card's copy of the suggestion.
  await page.getByTestId('show-result').click();
  await page.getByTestId('review').locator('.tl-review__step[data-step-kind="result"]').click();
  const inReport = page.getByTestId('report-suggestions').locator('[data-ghost-id="ghost-2"]');
  await inReport.getByRole('button', { name: 'I hold this' }).click();
  await inReport.getByRole('button', { name: 'Adopt' }).click();
  expect((await postedOfType(page, 'adoptGhost')).map((m) => m.payload)).toEqual([
    { runId: RUN_ID, ghostId: 'ghost-1', rationale: 'it seems obvious to me', requestId: 'r1' },
    { runId: RUN_ID, ghostId: 'ghost-2', requestId: 'r2' },
  ]);

  await ghost.getByRole('button', { name: 'No' }).click();
  expect((await postedOfType(page, 'rejectGhost')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, ghostId: 'ghost-1', requestId: 'r3' }]);
  // The host marks it rejected: its card goes.
  await send(page, hostMessage('run', { run: reviewRun(literalProposal(), { ghosts: [literalGhost({ state: 'rejected' }), alone] }) }));
  await expect(column.locator('[data-ghost-id="ghost-1"]')).toHaveCount(0);
  await expect(column.locator('[data-ghost-id="ghost-2"]')).toHaveCount(1);
  // In the Current view there are no suggestions on the board.
  await page.getByTestId('proposal-toggle').getByRole('radio', { name: 'Current' }).click();
  await expect(column.locator('[data-ghost-id]')).toHaveCount(0);
});

test('high contrast: the diff halo becomes an outline (glyph and word stay)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'hc', { workspace: workspaceState(), clock: UPDATED });
  const proposal = adoptedProposal();
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  const adopted = card(page, ADOPTED_ID);
  await expect(adopted.getByTestId('diff-badge')).toHaveText('+new');
  expect(await style(adopted, 'boxShadow')).toBe('none');
  expect(await adopted.evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineColor}`)).toBe(`solid ${ADDED}`);
  await page.screenshot({ path: shotPath('m2-overlay-hc.png') });
});

test('AT6.6 the expanded card lists its attempts: date, verdict, premises, resolution, Claude’s summary in italics', async ({ page }) => {
  board = await openBoard(page, attemptsGraph(), 'dark', { workspace: workspaceState(), clock: '2026-11-01T12:00:00.000Z' });
  const goal = card(page, TARGET);
  await goal.locator('.tl-card__chevron').click();
  const attempts = goal.getByTestId('attempt');
  await expect(attempts).toHaveCount(3);
  await expect(attempts.getByTestId('attempt-verdict')).toHaveText(['proved', 'not proved', "gave up: Claude's attempts kept failing the checks"]);
  await expect(attempts.getByTestId('attempt-resolution')).toHaveText(['accepted', 'continued in a later round', 'discarded']);
  const dates = await attempts.getByTestId('attempt-date').allTextContents();
  expect(dates[0]).toMatch(/^\d{2}:\d{2}$/); // today
  expect(dates[2]).toMatch(/^Oct 3[01] \d{2}:\d{2}$/);
  await expect(attempts.nth(1).getByTestId('attempt-premises')).toHaveText(
    'from “Cynder is a character who has a dark past”, “The new Spyro game is PG”, “PG games cannot have characters with dark pasts”',
  );
  await expect(attempts.nth(2).getByTestId('attempt-premises')).toHaveText('from “Cynder is a character who has a dark past”');
  const summary = attempts.first().getByTestId('attempt-summary');
  await expect(summary).toContainText('Proved with the premise you adopted.');
  await expect(summary).toHaveAttribute('data-provenance', 'agent');
  expect(await style(summary.locator('.tl-agent__text'), 'fontStyle')).toBe('italic');
  await expect(summary.locator('.tl-agent__marker')).toHaveText(" (Claude's words)");
  await page.screenshot({ path: shotPath('m2-attempts.png') });
  // Another card lists only its own attempts.
  const rule = card(page, 'pg-no-dark-past');
  await rule.locator('.tl-card__chevron').click();
  await expect(rule.getByTestId('attempt')).toHaveCount(1);
  await expect(rule.getByTestId('attempt-premises')).toHaveText('from no premises (follows from nothing?)');
  await expect(card(page, 'new-spyro-pg').getByTestId('attempts')).toHaveCount(0);
});
