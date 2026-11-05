/**
 * M2 question cards (ask_user, D-20; AT6.3): phenomenon tag, Claude's options with their consequences, free text,
 * "Leave it open", "Decide for me", the scope of each answer (default: this run); "Send" posts answerQuestions; no
 * guess on the board before the answer, Claude's guess shown after the run update.
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroGraph } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { answeredModality, GENERIC_QUESTION, MODALITY_QUESTION, RUN_ID, runView, UPDATED, waitingRun } from '../shared/runs';
import { openBoard, postedOfType, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.3 the question card: tag, options with consequences, own words, Leave it open, Decide for me, scope; Send posts answerQuestions; the guess only afterwards', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run: waitingRun([MODALITY_QUESTION, GENERIC_QUESTION]), clock: UPDATED });
  const set = page.getByTestId('question-set');
  const questions = set.getByTestId('question');
  await expect(questions).toHaveCount(2);
  const [q0, q1] = [questions.nth(0), questions.nth(1)];
  await expect(q0.getByTestId('phenomenon')).toHaveText('modality');
  await expect(q1.getByTestId('phenomenon')).toHaveText('genericity');
  await expect(q0.getByTestId('question-text')).toContainText('Does "cannot have" state a rule about what PG games should not include');
  await expect(q0.getByTestId('option-label')).toHaveText(['A rule (normative)', 'Impossible (literal)']);
  await expect(q0.getByTestId('option-consequence')).toHaveText([
    'A PG game with such a character breaks the rule; it says nothing about what the game contains.',
    'No PG game contains a character with a dark past at all.',
  ]);
  await expect(q1.locator('.tl-option__preview')).toHaveText('∀ c, HasDarkPast c → ¬ Abnormal c → …');
  await expect(q0.getByTestId('option-free-text')).toContainText('In my own words');
  await expect(q0.getByTestId('option-leave-open')).toContainText('Leave it open');
  await expect(q0.getByTestId('option-decide-for-me')).toContainText('Decide for me');
  await expect(q0.getByTestId('question-about')).toHaveText('About “PG games cannot have characters with dark pasts”');
  // No pre-selected answer (D-20): only the scope radios start checked, at "this run".
  for (const q of [q0, q1]) {
    await expect(q.locator('.tl-question__options input[type="radio"]:checked')).toHaveCount(0);
    await expect(q.getByTestId('question-scope').getByRole('radio', { name: 'this run' })).toBeChecked();
  }
  // No guess anywhere before the answer.
  await expect(page.getByTestId('claudes-guess')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('guess');
  await page.screenshot({ path: shotPath('m2-questions.png') });

  const sendButton = set.getByTestId('send-answers');
  await expect(sendButton).toHaveText('Send answers');
  await expect(sendButton).toBeDisabled();
  await q0.getByTestId('option').first().click();
  await expect(sendButton).toBeDisabled(); // the second question is not answered yet
  // In my own words: a blank text does not count.
  await q1.getByTestId('option-free-text').click();
  await q1.getByTestId('free-text').fill('   ');
  await expect(sendButton).toBeDisabled();
  await q1.getByTestId('free-text').fill('Every one, but only\nfor games rated PG.');
  await q1.getByTestId('question-scope').getByRole('radio', { name: 'the whole subject' }).check();
  await q0.getByTestId('question-scope').getByRole('radio', { name: 'these cards' }).check();
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  expect((await postedOfType(page, 'answerQuestions')).map((m) => m.payload)).toEqual([
    {
      runId: RUN_ID,
      setId: 'q1',
      answers: [
        { question: 0, choice: { kind: 'option', option: 0 }, scope: 'nodes' },
        { question: 1, choice: { kind: 'free-text', text: 'Every one, but only\nfor games rated PG.' }, scope: 'subject' },
      ],
      requestId: 'r1',
    },
  ]);

  // The host's update: the batch is answered; Claude's guess is revealed beside each answer.
  const generic = { ...GENERIC_QUESTION, setId: 'q1', answer: { question: 1, choice: { kind: 'free-text' as const, text: 'Every one, but only\nfor games rated PG.' }, scope: 'subject' as const }, answeredAt: '2026-11-01T10:02:00.000Z', claudesGuess: { option: 1 } };
  await send(page, hostMessage('run', { run: runView({ answered: [answeredModality({ answer: { question: 0, choice: { kind: 'option', option: 0 }, scope: 'nodes' } }), generic] }) }));
  await expect(page.getByTestId('question-set')).toHaveCount(0);
  const answered = page.getByTestId('answered-question');
  await expect(answered).toHaveCount(2);
  await expect(answered.nth(0).getByTestId('your-answer')).toHaveText('Your answer: A rule (normative) (for these cards)');
  await expect(answered.nth(0).getByTestId('claudes-guess')).toHaveText('Claude’s guess: A rule (normative) · Ratings usually express rules about content.');
  await expect(answered.nth(1).getByTestId('your-answer')).toContainText('Every one, but only');
  await expect(answered.nth(1).getByTestId('your-answer').locator('[data-provenance="user"]')).toHaveCount(1);
  await expect(answered.nth(1).getByTestId('claudes-guess')).toHaveText('Claude’s guess: Typical ones');
  await page.screenshot({ path: shotPath('m2-questions-answered.png') });
});

test('AT6.3 "Leave it open" and "Decide for me" are answers too; the card is disabled while the answer is sent', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), run: waitingRun([MODALITY_QUESTION]), clock: UPDATED, autoReply: false });
  const set = page.getByTestId('question-set');
  await expect(set.getByTestId('send-answers')).toHaveText('Send answer');
  await set.getByTestId('option-leave-open').click();
  await set.getByTestId('send-answers').click();
  // Until the host answers, the card cannot be sent twice.
  await expect(set.getByTestId('send-answers')).toHaveText('Sending…');
  await expect(set.getByTestId('send-answers')).toBeDisabled();
  await expect(set.getByTestId('question').locator('input').first()).toBeDisabled();
  await send(page, hostMessage('actionResult', { requestId: 'r1', outcome: { ok: false, code: 'conflict', error: 'The run is no longer waiting for this answer.' } }));
  await expect(page.getByTestId('toast').filter({ hasText: 'The run is no longer waiting for this answer.' })).toBeVisible();
  await expect(set.getByTestId('send-answers')).toBeEnabled();
  await set.getByTestId('option-decide-for-me').click();
  await set.getByTestId('send-answers').click();
  expect((await postedOfType(page, 'answerQuestions')).map((m) => m.payload.answers)).toEqual([
    [{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }],
    [{ question: 0, choice: { kind: 'decide-for-me' }, scope: 'run' }],
  ]);
});
