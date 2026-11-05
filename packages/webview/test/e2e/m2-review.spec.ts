/**
 * M2 end-of-round review (D-19; AT6.4): statements first (the sentence beside its Lean, the explicit toggle, the
 * closure), then new vocabulary (revocable: prefilled Feedback), definition questions (Accept disabled until every
 * one is "yes"; "no" opens Feedback), the report card (revealed after the statements, or on "Show result"; each
 * assumption made without asking has "Ask me instead"), lifecycle ticks (recommended ones pre-ticked); Accept,
 * Feedback, Discard and Raw Lean diff post their messages.
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, type ProposalView, type RunNotice } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { ACCEPTED_NOTICE, definitionProposal, emptyProposal, normativeProposal, RECORDED_NOTICE, reviewRun, RUN_ID, runView, UPDATED } from '../shared/runs';
import { openBoard, postedOfType, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** Opens the current board, then delivers the run in review and its proposal (as the host does). */
async function openReview(page: Page, proposal: ProposalView, theme: 'dark' | 'light' = 'dark') {
  board = await openBoard(page, spyroGraph(), theme, { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  return page.getByTestId('review');
}

test('AT6.4 the review runs statements -> vocabulary -> definitions -> report card -> lifecycle; Accept waits for every definition', async ({ page }) => {
  const review = await openReview(page, definitionProposal());
  const step = review.getByTestId('review-step');
  await expect(review.getByTestId('review-progress')).toHaveText('Step 1 of 6: Statement 1');
  await expect(review.locator('.tl-review__step')).toHaveText(['Statement 1', 'Statement 2', 'New vocabulary', 'Definitions (2)', 'Result', 'Card changes']);
  await expect(review.locator('.tl-review__step[data-step-kind="result"]')).toHaveAttribute('data-locked', 'true');

  // 1. The statement: the user's sentence beside the Lean, the explicit form on request, the closure.
  await expect(step).toHaveAttribute('data-step', 'statement');
  await expect(step.getByTestId('statement-sentence')).toHaveText('SentencePG games cannot have characters with dark pasts');
  await expect(step.getByTestId('statement-sentence').locator('[data-provenance="user"]')).toHaveCount(1);
  const lean = step.getByTestId('statement-lean');
  await expect(lean).toHaveText('∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬InGame c g');
  await step.getByTestId('explicit-toggle').check();
  await expect(lean).toHaveText('∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.InGame c g)');
  await expect(step.getByTestId('statement-closure').locator('.tl-closure__name')).toHaveText(['Game', 'Character', 'IsPG', 'HasDarkPast', 'InGame']);
  // The result is not on screen yet: no report card, no verdict in the banner or the state line (D-19).
  await expect(page.getByTestId('report-card')).toHaveCount(0);
  await expect(page.getByTestId('proposal-banner')).not.toContainText('proved');
  await expect(page.getByTestId('run-state')).toHaveText('Ready for review');
  await page.screenshot({ path: shotPath('m2-review-statement.png') });

  // 2. The second statement is the adopted suggestion: Claude's wording.
  await review.getByTestId('review-next').click();
  await expect(review.getByTestId('review-progress')).toHaveText('Step 2 of 6: Statement 2');
  await expect(step.getByTestId('statement-sentence').locator('[data-provenance="agent"]')).toContainText('A character who cannot be in a game');
  await expect(step.getByTestId('statement-lean')).toHaveText('∀ (c : Character) (g : Game), ¬InGame c g → ¬GoodAddition c g'); // explicit is per statement

  // 3. New vocabulary (going past the statements reveals the result); revoking is prefilled Feedback.
  await review.getByTestId('review-next').click();
  await expect(step).toHaveAttribute('data-step', 'vocabulary');
  await expect(review.getByTestId('show-result')).toHaveCount(0);
  await expect(page.getByTestId('run-state')).toHaveText('Ready for review · proved');
  await expect(step.getByTestId('vocabulary-item')).toHaveCount(1);
  await step.getByTestId('revoke-vocabulary').click();
  const feedback = page.getByTestId('feedback-text');
  await expect(feedback).toHaveValue("Please don't add the vocabulary item `InGame` (“is in”): ");
  await expect(feedback).toBeFocused();

  // 4. Definition questions: Accept is disabled until each is "yes"; "no" opens Feedback, prefilled.
  await review.getByTestId('review-next').click();
  await expect(step).toHaveAttribute('data-step', 'definitions');
  const accept = review.getByTestId('accept');
  await expect(accept).toBeDisabled();
  await expect(page.getByTestId('banner-accept')).toBeDisabled();
  await expect(review.getByTestId('accept-blocked')).toBeVisible();
  const d1 = step.locator('[data-definition-id="d1"]');
  const d2 = step.locator('[data-definition-id="d2"]');
  await expect(d1.locator('pre')).toHaveText('/-- is in -/\ndef InGame (c : Character) (g : Game) : Prop := GoodAddition c g');
  await expect(d1).toContainText('Your statements rely on it:');
  await d1.getByTestId('definition-yes').click();
  await expect(accept).toBeDisabled();
  await d2.getByTestId('definition-no').click();
  // A prefill goes on its own line after what is already in the draft.
  await expect(feedback).toHaveValue("Please don't add the vocabulary item `InGame` (“is in”):\nI don't endorse the definition `Spyro.Rating.exists` (“there is at least one rating”): ");
  await expect(accept).toBeDisabled();
  await d2.getByTestId('definition-yes').click();
  await expect(accept).toBeEnabled();
  await expect(page.getByTestId('banner-accept')).toBeEnabled();
  await page.screenshot({ path: shotPath('m2-review-definitions.png') });

  // 5. The report card: verdict, footprint, Claude's words, gate attempts; "Ask me instead" per unasked choice.
  await review.getByTestId('review-next').click();
  const card = page.getByTestId('report-card');
  await expect(card.getByTestId('report-verdict')).toHaveText('proved: GCynder would not be a good addition to the new Spyro game');
  await expect(card.getByTestId('report-footprint').locator('li')).toHaveCount(6);
  await expect(card.getByTestId('report-footprint').locator('.tl-presup')).toHaveText(['assumes characters exist', 'assumes games exist']);
  await expect(card.getByTestId('report-consistency')).toContainText('Consistency unchecked');
  await expect(card.getByTestId('report-summary')).toContainText('Proved with the premise you adopted.');
  const assumed = card.getByTestId('assumed-item');
  await expect(assumed).toHaveCount(2);
  await feedback.fill('');
  await assumed.first().getByTestId('ask-me-instead').click();
  await expect(feedback).toHaveValue('You assumed this without asking: “"cannot have" read literally, as you answered”. Please ask me about it instead of assuming it.');
  await card.getByTestId('report-gate-attempts').locator(':scope > summary').click();
  await expect(card.getByTestId('report-gate-attempts')).toContainText('Attempt 1 (round 2): didn’t pass');
  await expect(card.getByTestId('report-gate-attempts')).toContainText('it left a gap (sorry) in cynder_not_good.holds');
  await page.screenshot({ path: shotPath('m2-review-report.png') });

  // 6. Lifecycle: the recommended item starts ticked, the other does not.
  await review.getByTestId('review-next').click();
  await expect(step).toHaveAttribute('data-step', 'lifecycle');
  await expect(step.locator('[data-lifecycle-id="l1"] input')).toBeChecked();
  await expect(step.locator('[data-lifecycle-id="l2"] input')).not.toBeChecked();
  await expect(step.locator('[data-lifecycle-id="l1"]')).toContainText('Make “Cynder would not be a good addition to the new Spyro game” a Derivation (Lean proved it from the selected premises; recommended)');
  await step.locator('[data-lifecycle-id="l2"] input').check();
  await expect(review.getByTestId('review-next')).toBeDisabled();

  await accept.click();
  expect((await postedOfType(page, 'acceptProposal')).map((m) => m.payload)).toEqual([
    { runId: RUN_ID, proposalId: 'p3', lifecycle: ['l1', 'l2'], definitions: ['d1', 'd2'], requestId: 'r1' },
  ]);
  expect(await postedOfType(page, 'feedback')).toEqual([]);
});

test('AT6.4 "Show result" reveals the report card early; Feedback, Discard and Raw Lean diff post their messages; an unticked item is left out', async ({ page }) => {
  const review = await openReview(page, normativeProposal(), 'light');
  await expect(review.getByTestId('review-progress')).toHaveText('Step 1 of 3: Statement');
  await review.getByTestId('show-result').click();
  await expect(review.getByTestId('show-result')).toHaveCount(0);
  await expect(review.getByTestId('review-step')).toHaveAttribute('data-step', 'statement'); // still on the statement
  await review.locator('.tl-review__step[data-step-kind="result"]').click();
  await expect(page.getByTestId('report-card').getByTestId('report-verdict')).toContainText('proved');
  await expect(page.getByTestId('report-card').getByTestId('assumed-without-asking')).toContainText('Nothing, according to Claude.');

  // Raw Lean diff: the whole proposal (review and banner) or one file.
  await review.getByTestId('raw-diff').click();
  await page.getByTestId('banner-raw-diff').click();
  await page.getByTestId('report-files').getByRole('button', { name: /diff/ }).click();
  expect((await postedOfType(page, 'openProposalDiff')).map((m) => m.payload)).toEqual([
    { runId: RUN_ID, proposalId: 'p1' },
    { runId: RUN_ID, proposalId: 'p1' },
    { runId: RUN_ID, proposalId: 'p1', file: 'Model/Spyro/Main.lean' },
  ]);

  // Feedback: a text field that keeps line breaks; Ctrl+Enter or the button sends it.
  await page.getByTestId('banner-feedback').click();
  const feedback = page.getByTestId('feedback-text');
  await expect(feedback).toBeFocused();
  await feedback.fill('Keep the rule general.\nAnd say why it applies to Cynder.');
  await page.getByTestId('send-feedback').click();
  expect((await postedOfType(page, 'feedback')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, text: 'Keep the rule general.\nAnd say why it applies to Cynder.', requestId: 'r1' }]);

  // Accept with the recommended item unticked sends no lifecycle id.
  await review.locator('.tl-review__step[data-step-kind="lifecycle"]').click();
  await review.locator('[data-lifecycle-id="l1"] input').uncheck();
  await page.getByTestId('banner-accept').click();
  await review.getByTestId('discard').click();
  expect((await postedOfType(page, 'acceptProposal')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, proposalId: 'p1', lifecycle: [], definitions: [], requestId: 'r2' }]);
  expect((await postedOfType(page, 'discardProposal')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r3' }]);

  // The host withdraws the proposal (e.g. after Feedback): the review and the banner go away.
  await send(page, hostMessage('proposal', { proposal: null }));
  await send(page, hostMessage('run', { run: reviewRun(normativeProposal(), { state: 'working', round: 2, proposalId: undefined }) }));
  await expect(page.getByTestId('review')).toHaveCount(0);
  await expect(page.getByTestId('proposal-banner')).toHaveCount(0);
});

/** The runner's notice of how Accept went (the last notice of an accepted run). */
const acceptNotice = (text: string): RunNotice => ({ id: 'n1', at: UPDATED, level: 'info', kind: 'info', text });

test('fixer round 2: an Accept of a round that changed no file says "Recorded" in the run panel, with no Undo hint, before and after the host’s answer', async ({ page }) => {
  const proposal = emptyProposal();
  // No automatic answers: the host's order is the test's (the run ends before the Accept's answer arrives).
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED, autoReply: false });
  await send(page, hostMessage('run', { run: reviewRun(proposal, { premises: [] }) }));
  await send(page, hostMessage('proposal', { proposal }));
  const review = page.getByTestId('review');
  await expect(page.getByTestId('run-target')).toContainText('Self-evident?');
  await expect(review.getByTestId('review-empty')).toHaveText('This round changed no file: Accept only records the outcome.');
  await expect(page.getByTestId('proposal-counts')).toHaveText('no file changes');
  for (const accept of [review.getByTestId('accept'), page.getByTestId('banner-accept')]) {
    await expect(accept).toHaveAttribute('title', 'Record the outcome: this round changed no file, so there is no Undo step and no history entry');
  }
  await review.getByTestId('accept').click();
  expect((await postedOfType(page, 'acceptProposal')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, proposalId: 'p1', lifecycle: [], definitions: [], requestId: 'r1' }]);

  // The host ends the run and withdraws the proposal (here without the runner's notice, so only the board's own
  // Accept tells the panel what it changed).
  await send(page, hostMessage('run', { run: runView({ state: 'accepted', premises: [], verdict: 'not-proved', endedAt: UPDATED }) }));
  await send(page, hostMessage('proposal', { proposal: null }));
  const ended = page.getByTestId('run-ended');
  await expect(ended).toHaveAttribute('data-outcome', 'recorded');
  await expect(ended.locator('p').first()).toHaveText('Recorded: nothing in your files changed; the outcome is in the card’s Attempts.');
  await expect(page.getByTestId('run-panel')).not.toContainText('Undo');
  await expect(page.getByTestId('run-state')).toHaveText('Accepted');

  // Then the Accept's answer and the host's toast: no Undo anywhere, and no contradicting sentence on the board.
  await send(page, hostMessage('actionResult', { requestId: 'r1', outcome: { ok: true, label: 'Recorded: Self-evident? → not proved (no file changed)', undoable: false } }));
  await send(page, hostMessage('notice', { id: 't1', level: 'info', text: 'Recorded: Self-evident? → not proved: Cynder would not be a good addition to the new Spyro game (no file changed)', undoable: false }));
  await send(page, hostMessage('run', { run: runView({ state: 'accepted', premises: [], verdict: 'not-proved', endedAt: UPDATED, notices: [acceptNotice(RECORDED_NOTICE)], accepted: { changedFiles: false } }) }));
  await expect(ended).toHaveAttribute('data-outcome', 'recorded');
  await expect(page.getByTestId('toast')).toHaveCount(1);
  await expect(page.getByTestId('toast').getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.getByTestId('run-panel')).not.toContainText('Claude’s changes are in your files');
  await page.screenshot({ path: shotPath('m2-review-empty-accept.png') });
});

test('fixer round 2: an Accept that changed files keeps the Undo hint; a board that did not send the Accept reads how it went from the run’s record (RunView.accepted, closing round 1), not from the notice wording', async ({ page }) => {
  const proposal = normativeProposal();
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), clock: UPDATED, autoReply: false });
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  await expect(page.getByTestId('banner-accept')).toHaveAttribute('title', 'Apply the proposal to your files (one Undo step; a history entry)');
  await page.getByTestId('banner-accept').click();
  expect((await postedOfType(page, 'acceptProposal')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, proposalId: 'p1', lifecycle: ['l1'], definitions: [], requestId: 'r1' }]);
  await send(page, hostMessage('run', { run: runView({ state: 'accepted', verdict: 'proved', endedAt: UPDATED, notices: [acceptNotice(ACCEPTED_NOTICE)], accepted: { changedFiles: true } }) }));
  await send(page, hostMessage('proposal', { proposal: null }));
  await send(page, hostMessage('actionResult', { requestId: 'r1', outcome: { ok: true, label: 'These suffice → proved: Cynder would not be a good addition to the new Spyro game', undoable: true } }));
  const ended = page.getByTestId('run-ended');
  await expect(ended).toHaveAttribute('data-outcome', 'accepted');
  await expect(ended.locator('p').first()).toHaveText('Accepted: Claude’s changes are in your files. Undo (Ctrl+Z) or History reverts them.');

  // Another run, accepted where this board did not see it (e.g. the board was opened afterwards): the runner's record
  // on the run says whether files changed. The notices deliberately say the opposite (a text starting with "Accepted",
  // then the "Recorded … (no file changed)" wording): their wording is not read.
  await send(page, hostMessage('run', { run: runView({ runId: 'run_20261101_2', state: 'accepted', premises: [], verdict: 'not-proved', endedAt: UPDATED, notices: [acceptNotice('Accepted: Self-evident? → not proved: Cynder would not be a good addition to the new Spyro game.')], accepted: { changedFiles: false } }) }));
  await expect(ended).toHaveAttribute('data-outcome', 'recorded');
  await expect(page.getByTestId('run-panel')).not.toContainText('Undo');
  await send(page, hostMessage('run', { run: runView({ runId: 'run_20261101_3', state: 'accepted', verdict: 'proved', endedAt: UPDATED, notices: [acceptNotice(RECORDED_NOTICE)], accepted: { changedFiles: true } }) }));
  await expect(ended).toHaveAttribute('data-outcome', 'accepted');
});

test('fixer round 2: a round that changed no file but proved the goal: the ticked Goal -> Derivation is what Accept writes, and the tooltip says so', async ({ page }) => {
  // The user's files already proved the goal: the round changed nothing, Lean proved it, G->D is proposed.
  const proposal = emptyProposal({ lifecycle: normativeProposal().lifecycle, report: normativeProposal().report });
  const review = await openReview(page, proposal);
  await expect(review.getByTestId('review-empty')).toHaveText('This round changed no file: Accept records the outcome and makes only the card changes you tick.');
  const accept = review.getByTestId('accept');
  await expect(accept).toHaveAttribute('title', 'Make the ticked card changes in your files (one Undo step; a history entry)');
  await review.locator('.tl-review__step[data-step-kind="lifecycle"]').click();
  await review.locator('[data-lifecycle-id="l1"] input').uncheck();
  await expect(accept).toHaveAttribute('title', 'Record the outcome: this round changed no file, so there is no Undo step and no history entry');
  await expect(page.getByTestId('banner-accept')).toHaveAttribute('title', 'Record the outcome: this round changed no file, so there is no Undo step and no history entry');
});
