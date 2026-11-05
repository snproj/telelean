/**
 * M2 layout and wording fixes from the round-1 UX review:
 *  - a narrow board (the run panel below it) during a run: the selection tray folds to one line and the A|D|G box to
 *    its first row, so the board and the panel get the room; the panel's edge resizes it (drag, arrow keys, double
 *    click for the default size), kept per layout in the webview state;
 *  - new content in the panel comes into view: a question set, the review, the next review step;
 *  - a proposal's diff mark sits on its own line, so the card's sentence keeps the card's width;
 *  - the review's statement step: the sentence above the proposition alone (no `#print` header), the Lean name as
 *    spelled;
 *  - a round that gave up says so at once (badge, state line, banner) and its notices come before the review;
 *  - declining the consent is an info toast.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, type ProposalView, type QuestionView, type RunNotice } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { answeredModality, GENERIC_QUESTION, MODALITY_QUESTION, normativeProposal, reviewRun, runView, TARGET, UPDATED, waitingRun } from '../shared/runs';
import { card, openBoard, replyNext, send, settle, shotPath, type OpenedBoard } from './helpers';

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

test('a narrow board during a run: the tray folds to one line, the A|D|G box to its first row, the panel gets the room', async ({ page }) => {
  await page.setViewportSize(NARROW);
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await selectAll(page);
  const tray = page.getByTestId('tray');
  await expect(tray.getByTestId('tray-target')).toBeVisible();
  const extra = page.locator('.tl-prompt__row--extra');
  await expect(extra).toBeVisible();

  await send(page, hostMessage('run', { run: waitingRun([MODALITY_QUESTION, GENERIC_QUESTION, SCOPE_QUESTION]) }));
  // The tray: one line with the selection summed up, the disabled button and the reason.
  await expect(tray).toHaveAttribute('data-folded', 'true');
  await expect(tray.getByTestId('tray-summary')).toHaveText('3 premises ⊢ “Cynder would not be a good addition to the new Spyro game”');
  await expect(tray.getByTestId('tray-these-suffice')).toBeDisabled();
  await expect(tray.getByTestId('tray-blocked')).toHaveText('Claude is waiting for your answer: answer it or cancel that run first.');
  expect((await box(tray)).height).toBeLessThanOrEqual(34);
  // The A|D|G box keeps working (D-16); its optional row shows once it has the focus.
  await expect(extra).toBeHidden();
  const input = page.getByRole('textbox', { name: 'New assumption' });
  await input.focus();
  await expect(extra).toBeVisible();
  await input.blur();
  await expect(extra).toBeHidden();

  // The panel gets most of the room (up to 60%), the board keeps the rest; the first question shows its options.
  const workspace = await box(page.locator('.tl-workspace'));
  const panel = await box(page.getByTestId('run-panel'));
  const columns = await box(page.locator('.tl-board-scroll'));
  expect(panel.height).toBeGreaterThan(workspace.height * 0.58);
  expect(columns.height).toBeGreaterThan(workspace.height * 0.38);
  expect(columns.height).toBeGreaterThan(250);
  const body = page.locator('.tl-run__body');
  const firstOptions = page.getByTestId('question').first().getByTestId('option');
  const last = await box(firstOptions.last());
  const view = await box(body);
  expect(last.y + last.height).toBeLessThanOrEqual(view.y + view.height + 1);
  await page.screenshot({ path: shotPath('m2-narrow-questions.png') });

  // The whole tray once more, for this run; and folded again.
  await tray.getByTestId('tray-unfold').click();
  await expect(tray.getByTestId('tray-target')).toBeVisible();
  await expect(tray).not.toHaveAttribute('data-folded', /.*/);
  await tray.getByTestId('tray-fold').click();
  await expect(tray).toHaveAttribute('data-folded', 'true');
  // No run: the whole tray and the whole box again.
  await send(page, hostMessage('run', { run: null }));
  await expect(tray.getByTestId('tray-target')).toBeVisible();
  await expect(extra).toBeVisible();
});

test('half an editor (the raw Lean diff open beside the board): the review’s statement step still shows in the panel', async ({ page }) => {
  await page.setViewportSize({ width: 545, height: 795 });
  const proposal = normativeProposal();
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await selectAll(page);
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  const body = await box(page.locator('.tl-run__body'));
  for (const testId of ['statement-sentence', 'statement-lean']) {
    const element = await box(page.getByTestId(testId));
    expect(element.y).toBeGreaterThanOrEqual(body.y);
    expect(element.y + element.height).toBeLessThanOrEqual(body.y + body.height);
  }
  expect(body.height).toBeGreaterThan(220);
  await page.screenshot({ path: shotPath('m2-half-editor-review.png') });
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

test('new content in the run panel comes into view: a question set, the review, the next review step', async ({ page }) => {
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

  // Answered, then the review arrives while the panel is scrolled down: the review's top comes into view.
  const proposal = normativeProposal();
  await send(page, hostMessage('run', { run: runView({ activity, answered }) }));
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await send(page, hostMessage('run', { run: reviewRun(proposal, { activity, answered }) }));
  await send(page, hostMessage('proposal', { proposal }));
  const review = page.getByTestId('review');
  await expect.poll(() => topInView(review, body)).toBe(true);

  // The long result step, its Next button at the bottom: the next (short) step shows from the review's top.
  await review.locator('.tl-review__step[data-step-kind="result"]').click();
  await expect(page.getByTestId('report-card')).toBeVisible();
  await review.getByTestId('review-next').click();
  await expect(review.getByTestId('review-step')).toHaveAttribute('data-step', 'lifecycle');
  await expect.poll(() => topInView(review, body)).toBe(true);
  await page.screenshot({ path: shotPath('m2-narrow-review-next.png') });
});

test('the statement step: the sentence above the proposition alone (no #print header); the Lean name keeps its spelling', async ({ page }) => {
  const base = normativeProposal();
  const statement = base.review[0];
  if (statement?.kind !== 'statement') throw new Error('fixture');
  const pretty = '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → ¬Spyro.GoodAddition c g';
  const explicit = '∀ (g : Spyro.Game) (c : Spyro.Character), Spyro.IsPG g → Spyro.HasDarkPast c → Not (Spyro.GoodAddition c g)';
  const proposal: ProposalView = {
    ...base,
    review: [{ ...statement, pretty: `@[reducible] def Spyro.pg_no_dark_past : Prop :=\n${pretty}`, explicit: `@[reducible] def Spyro.pg_no_dark_past : Prop :=\n${explicit}` }],
  };
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  const step = page.getByTestId('review-step');
  const lean = step.getByTestId('statement-lean');
  await expect(lean).toHaveText(pretty);
  await step.getByTestId('explicit-toggle').check();
  await expect(lean).toHaveText(explicit);
  // The heading's Lean name is not upper-cased like the heading.
  const name = step.locator('.tl-details__heading code');
  expect(await name.evaluate((el) => (el as HTMLElement).innerText)).toBe('pg_no_dark_past');
  // The sentence above the Lean, which has the step's whole width.
  const sentence = await box(step.getByTestId('statement-sentence'));
  const code = await box(lean);
  expect(sentence.y + sentence.height).toBeLessThanOrEqual(code.y);
  expect(code.width).toBeGreaterThan((await box(step)).width * 0.85);
  await page.screenshot({ path: shotPath('m2-review-statement-stacked.png') });
});

test('diff marks sit on their own line: the card’s sentence keeps the card’s width on a narrow board', async ({ page }) => {
  await page.setViewportSize(NARROW);
  const proposal = normativeProposal();
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  for (const id of ['pg-no-dark-past', TARGET]) {
    const target = card(page, id);
    const badge = await box(target.getByTestId('diff-badge'));
    const text = await box(target.locator('.tl-card__text'));
    expect(badge.y + badge.height).toBeLessThanOrEqual(text.y + 1);
    // The sentence wraps between words: no line of it is a few letters wide.
    expect(text.width).toBeGreaterThan(110);
  }
  await page.screenshot({ path: shotPath('m2-narrow-diff-marks.png') });
});

test('a round that gave up says so at once (badge, state, banner; Accept not primary) and its notices come before the review', async ({ page }) => {
  const notice = (id: string, kind: RunNotice['kind'], level: RunNotice['level'], text: string): RunNotice => ({ id, at: UPDATED, kind, level, text });
  const notices = [
    notice('n1', 'gate-failed', 'warning', 'Attempt 1 didn’t pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry.'),
    notice('n2', 'gate-failed', 'warning', 'Attempt 2 didn’t pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry.'),
    notice('n3', 'gave-up', 'error', 'Claude’s attempts didn’t pass the checks 3 times: each time it added an axiom (`shortcut`). telelean reverted its working copy to “Statements frozen (round 1)”.'),
    notice('n4', 'reverted', 'warning', 'telelean reverted Claude’s working copy to “Statements frozen (round 1)” (the checks failed 3 times).'),
  ];
  const failure = { step: 'G3' as const, text: 'it added an axiom (`shortcut`)' };
  const base = normativeProposal();
  const proposal: ProposalView = {
    ...base,
    lifecycle: [],
    report: {
      ...base.report,
      verdict: 'gave-up',
      footprint: [],
      reverted: { toCommit: 'abc123', label: 'Statements frozen (round 1)', reason: 'the checks failed 3 times' },
      gateAttempts: [1, 2, 3].map((attempt) => ({ attempt, round: 1, at: UPDATED, passed: false, failures: [failure] })),
    },
  };
  await page.setViewportSize({ width: 1400, height: 900 });
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: reviewRun(proposal, { notices }) }));
  await send(page, hostMessage('proposal', { proposal }));

  await expect(page.getByTestId('run-badge')).toHaveText('Claude: gave up · Spyro');
  await expect(page.getByTestId('run-state')).toHaveText('Ready for review · Claude gave up');
  const banner = page.getByTestId('proposal-banner');
  await expect(banner.getByTestId('proposal-outcome')).toHaveText(
    'Claude gave up: its result didn’t pass the checks 3 times. This proposal holds only what last passed the checks (“Statements frozen (round 1)”).',
  );
  await expect(banner.getByTestId('banner-accept')).toHaveClass(/tl-button--secondary/);
  await expect(page.getByTestId('review').getByTestId('accept')).toHaveClass(/tl-button--secondary/);
  // The review still starts with the statements (meaning first, D-19).
  await expect(page.getByTestId('review-step')).toHaveAttribute('data-step', 'statement');

  // Giving up and the revert come before the review; the attempt-by-attempt notices are folded below it.
  const upfront = page.getByTestId('run-notices');
  await expect(upfront.getByTestId('run-notice')).toHaveCount(2);
  expect(await upfront.getByTestId('run-notice').evaluateAll((els) => els.map((el) => el.getAttribute('data-kind')))).toEqual(['gave-up', 'reverted']);
  const noticesBox = await box(upfront);
  expect(noticesBox.y + noticesBox.height).toBeLessThanOrEqual((await box(page.getByTestId('review'))).y);
  await expect(upfront).toBeInViewport();
  const earlier = page.getByTestId('run-notices-earlier');
  await expect(earlier.locator(':scope > summary')).toHaveText('Earlier notices (2)');
  expect((await box(earlier)).y).toBeGreaterThan((await box(page.getByTestId('review'))).y);
  await page.screenshot({ path: shotPath('m2-gave-up.png') });

  // The report card's check attempts, in plain words (the check's name in the tooltip).
  await page.getByTestId('show-result').click();
  await page.getByTestId('review').locator('.tl-review__step[data-step-kind="result"]').click();
  const attempts = page.getByTestId('report-gate-attempts');
  await expect(attempts.locator(':scope > summary')).toHaveText('Check attempts: 0 passed of 3');
  await attempts.locator(':scope > summary').click();
  const chip = attempts.locator('.tl-check-step').first();
  await expect(chip).toHaveText('what it rests on');
  await expect(chip).toHaveAttribute('title', /^Check G3: /);

  // Seen from another subject's board: one line, Claude's name as spelled.
  await send(page, hostMessage('run', { run: reviewRun(proposal, { notices, subject: 'Bayonetta' }) }));
  await expect(page.getByTestId('run-elsewhere')).toContainText('Claude’s run on Bayonetta: ready for review · Claude gave up.');
});

test('declining the consent is an info toast (the user’s own choice), cleared by the next start', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await selectAll(page);
  const declined = 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").';
  await replyNext(page, 'startRun', { ok: false, code: 'not-yet', error: declined });
  await page.getByRole('button', { name: 'These suffice ▶' }).click();
  const toast = page.getByTestId('toast').filter({ hasText: 'Not started:' });
  await expect(toast).toHaveAttribute('data-level', 'info');
  await page.getByRole('button', { name: 'These suffice ▶' }).click();
  await expect(toast).toHaveCount(0);
});
