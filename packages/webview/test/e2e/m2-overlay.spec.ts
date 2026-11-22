/**
 * The attempts history in the expanded card (AT6.6). Slice 2h retired M2's proposal overlay (AT6.5: the diff marks,
 * the proposal's "Claude suggests" cards with "I hold this" and "No", the high-contrast diff halo): an edit session's
 * Proposed view replaces it (test/e2e/s2-board.spec.ts).
 */
import { expect, test, type Locator } from '@playwright/test';
import { workspaceState } from '../shared/graphs';
import { attemptsGraph, TARGET } from '../shared/runs';
import { card, openBoard, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

const style = (locator: Locator, property: 'color' | 'boxShadow' | 'opacity' | 'borderTopStyle' | 'fontStyle') =>
  locator.evaluate((el, p) => getComputedStyle(el)[p], property);

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
