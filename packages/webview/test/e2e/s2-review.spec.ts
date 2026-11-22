/**
 * Slice 2g (docs/slice2-plan.md 5.1-5.9, 5.13; drafted by builder 2g): the review panel and the session bar in the
 * browser, fed the host's `session` messages (test/shared/sessions.ts).
 *  - the session bar replaces the proposal banner: the session, the stage, the phase; Submit's reason with "Go to the
 *    first one"; Raw Lean diff… asks first while the results are hidden;
 *  - the panel ("Edit session"): Inferences with the step chip, the stage report, the list (a hidden Result is a
 *    neutral row), the detail; Accept posts one `decideItems`, `own: true`; Claude's words in Claude's style;
 *  - an Add premise asks how it is held; a cascade asks first;
 *  - read-only while a step runs (D2-62); the end confirmation; Exit's dialog;
 *  - the twin pair: the same panel and bar text whatever the hidden outcome.
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, REVIEW_TEXTS, spyroGraph, type RunView, type SessionView } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { confirmingSession, hiddenPair, hiddenStage, IDS, OPEN, sessionRun, shownStage, stepSession } from '../shared/sessions';
import { openBoard, postedOfType, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** Opens the board with a wide run panel (the list and the detail side by side), then the session's run and view. */
async function openSession(page: Page, session: SessionView, run: RunView = sessionRun(session), wide = true) {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), ...(wide ? { state: { runSplit: { wide: 0.55, narrow: null } } } : {}) });
  await send(page, hostMessage('run', { run }));
  await send(page, hostMessage('session', { session }));
  return page.getByTestId('run-panel');
}

test('the session bar and the panel of a stage whose results are hidden', async ({ page }) => {
  const panel = await openSession(page, hiddenStage());
  const bar = page.getByTestId('session-bar');
  await expect(page.getByTestId('proposal-banner')).toHaveCount(0);
  await expect(bar.getByTestId('session-title')).toHaveText(REVIEW_TEXTS.sessionTitle(['Cynder would not be a good addition to the new Spyro game']));
  await expect(bar.getByTestId('session-stage')).toHaveText('Stage 1');
  await expect(bar.getByTestId('session-phase')).toHaveText('Review: 3 in review · 0 accepted · results after the review');
  await expect(bar.getByTestId('session-submit')).toBeDisabled();
  await expect(bar.getByTestId('session-submit')).toHaveAttribute('title', REVIEW_TEXTS.submitInReview(3));
  await expect(page.getByTestId('run-badge')).toHaveText('Edit session: review · Spyro');
  await expect(panel).toHaveAttribute('aria-label', 'Edit session');
  await expect(panel.getByTestId('step-chip')).toHaveText('ended');
  await expect(panel.getByTestId('stage-report-summary')).toHaveText(REVIEW_TEXTS.reportSummaryHidden(1, 1, 2));
  await expect(panel.getByTestId('review-counts')).toHaveText('3 in review · 0 accepted · 0 declined');
  const rows = panel.getByTestId('review-row');
  await expect(rows).toHaveCount(4);
  const hidden = panel.locator(`[data-testid="review-row"][data-item="${IDS.result}"]`);
  await expect(hidden.getByTestId('item-status')).toHaveText('◌ result after the review');
  await expect(hidden.getByTestId('review-row-check')).toBeDisabled();
  // No verdict anywhere on the panel or the bar.
  await expect(panel).not.toContainText(/established|not proved/);
  await expect(bar).not.toContainText(/established|not proved/);
  // Claude's gloss and words are in Claude's style; the user's sentences in the user's.
  await expect(panel.locator('[data-provenance="agent"]').first()).toBeVisible();
  // The board shows the session's (masked) board, Proposed; the target with the neutral chip.
  await expect(bar.getByTestId('session-toggle').getByRole('radio', { name: 'Proposed' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: shotPath('s2-review-hidden.png') });
});

test('Raw Lean diff… and Show results ask first while the results are hidden; the answer carries `confirmed` or `via`', async ({ page }) => {
  await openSession(page, hiddenStage());
  await page.getByTestId('session-raw-diff').click();
  await expect(page.getByTestId('dialog-reveal')).toContainText(REVIEW_TEXTS.rawDiffReveals);
  expect(await postedOfType(page, 'openSessionDiff')).toHaveLength(0);
  await page.getByTestId('reveal-confirm').click();
  expect((await postedOfType(page, 'openSessionDiff'))[0]?.payload).toMatchObject({ stage: 1, confirmed: true });
  await page.getByTestId('report-show-results').click();
  await page.getByTestId('reveal-confirm').click();
  expect((await postedOfType(page, 'revealResult'))[0]?.payload).toMatchObject({ stage: 1, via: 'show-result' });
});

test('Accept from the detail posts one decideItems with own: true; Accept & next moves on; the group buttons send own: false', async ({ page }) => {
  const panel = await openSession(page, shownStage());
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.vocab}"]`).click();
  await expect(panel.getByTestId('item-detail')).toHaveAttribute('data-item', IDS.vocab);
  await panel.getByTestId('detail-accept-next').click();
  const sent = await postedOfType(page, 'decideItems');
  expect(sent).toHaveLength(1);
  expect(sent[0]?.payload).toMatchObject({ own: true, stage: 1, decisions: [{ item: IDS.vocab, rev: 1, to: 'accepted' }] });
  await expect(panel.getByTestId('item-detail')).toHaveAttribute('data-item', IDS.formalize);
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.vocab}"] [data-testid="review-row-check"]`).check();
  await panel.getByTestId('review-accept-group').click();
  expect((await postedOfType(page, 'decideItems'))[1]?.payload).toMatchObject({ own: false });
});

test('once shown: the report’s verdict and band, the Result’s detail; Ask me instead prefills a Shaky note', async ({ page }) => {
  const panel = await openSession(page, shownStage());
  await expect(panel.getByTestId('stage-report-summary')).toHaveText(REVIEW_TEXTS.reportSummaryShown(1, 1));
  await expect(panel.getByTestId('report-verdict')).toHaveText('✓ established');
  await expect(panel.getByTestId('report-band')).toContainText("Claude's arrow: ● in review");
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.result}"]`).click();
  await expect(panel.getByTestId('detail-verdict')).toHaveText('✓ established');
  await expect(panel.getByTestId('detail-seen-early')).toHaveText(REVIEW_TEXTS.seenEarly);
  await expect(panel.getByTestId('detail-accept-reason')).toContainText(REVIEW_TEXTS.selectThem);
  await page.screenshot({ path: shotPath('s2-review-shown.png') });
  await panel.getByTestId('ask-me-instead').click();
  await expect(panel.getByTestId('decline-note')).toHaveValue(REVIEW_TEXTS.askMeAbout('“cannot have” read as a rule'));
  await panel.getByTestId('decline-confirm').click();
  expect((await postedOfType(page, 'decideItems'))[0]?.payload.decisions).toEqual([
    { item: IDS.formalize, rev: 1, to: 'declined', option: 'shaky', note: 'Ask me about: “cannot have” read as a rule' },
  ]);
});

test('an Add premise asks how it is held before its Accept', async ({ page }) => {
  const s = shownStage();
  const panel = await openSession(page, { ...s, items: s.items.map((i) => (i.id === IDS.premise ? { ...i, accept: OPEN } : i)) });
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.premise}"]`).click();
  await panel.getByTestId('detail-accept').click();
  const dialog = page.getByTestId('dialog-hold-as');
  await expect(dialog).toContainText(REVIEW_TEXTS.holdAsQuestion('Cynder is evil (Claude)'));
  // The sentence is Claude's (D-15): it stays in Claude's style in the question (F-V2G-FC-1).
  await expect(dialog.locator('h2 [data-provenance="agent"]')).toContainText('Cynder is evil');
  await expect(dialog.getByTestId('hold-as-accept')).toBeDisabled();
  await dialog.getByTestId('hold-as-pending').check();
  await dialog.getByTestId('hold-as-why').fill('the game says so');
  await dialog.getByTestId('hold-as-accept').click();
  expect((await postedOfType(page, 'decideItems'))[0]?.payload.decisions).toEqual([{ item: IDS.premise, rev: 1, to: 'accepted', holdAs: 'pending', rationale: 'the game says so' }]);
});

test('while Claude’s step runs the list is read-only (D2-62): the detail says why, the keys that decide do nothing', async ({ page }) => {
  const panel = await openSession(page, stepSession());
  await page.screenshot({ path: shotPath('s2-review-step.png') });
  await expect(page.getByTestId('session-phase')).toContainText(REVIEW_TEXTS.stepPhase('Cynder would not be a good addition to the new Spyro game', 1, 2, REVIEW_TEXTS.stepWorking('prove')));
  await expect(page.getByTestId('session-cancel-step')).toHaveAttribute('title', REVIEW_TEXTS.cancelStepRest(1));
  await expect(panel.getByTestId('detail-footer')).toHaveText(REVIEW_TEXTS.stepRunning);
  await panel.getByTestId('review-list').focus();
  await page.keyboard.press('a');
  await page.keyboard.press('d');
  expect(await postedOfType(page, 'decideItems')).toHaveLength(0);
  await expect(page.getByTestId('review-accept-group')).toBeDisabled();
});

test('the end confirmation: Apply waits for the check, then sends its id; Exit asks first, counting listed items only', async ({ page }) => {
  const panel = await openSession(page, confirmingSession({ state: 'running' }));
  await expect(panel.getByTestId('end-confirmation')).toBeVisible();
  await expect(panel.getByTestId('review-list')).toHaveCount(0);
  await expect(panel.getByTestId('confirmation-apply')).toBeDisabled();
  await send(page, hostMessage('session', { session: confirmingSession() }));
  await page.screenshot({ path: shotPath('s2-review-confirmation.png') });
  await panel.getByTestId('confirmation-apply').click();
  expect((await postedOfType(page, 'endSession'))[0]?.payload).toMatchObject({ decision: 'apply', stage: 1, check: 'chk-1' });
  await page.getByTestId('session-exit').click();
  await expect(page.getByTestId('exit-text')).toHaveText(REVIEW_TEXTS.exitConfirm(6, 0, false));
  await page.getByTestId('exit-back').click();
  expect((await postedOfType(page, 'endSession')).filter((m) => m.payload.decision === 'exit')).toHaveLength(0);
});

test('a narrow panel: the detail replaces the list, "◀ All items" goes back', async ({ page }) => {
  const panel = await openSession(page, shownStage(), undefined, false);
  await expect(panel.getByTestId('review-area')).toHaveAttribute('data-mode', 'list');
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.definition}"]`).click();
  await expect(panel.getByTestId('review-area')).toHaveAttribute('data-mode', 'detail');
  await panel.getByTestId('detail-all-items').click();
  await expect(panel.getByTestId('review-area')).toHaveAttribute('data-mode', 'list');
});

/** AT6.10 for a session (D-15): every string Claude wrote carries this token; each text node with it must be Claude's. */
const C = '⟪claude⟫';

function markedSession(): SessionView {
  const s = shownStage();
  const sentence = `${C} Cynder is evil`;
  const premiseLabel = `Add premise “${sentence}”`;
  return {
    ...s,
    items: s.items.map((i) => {
      const d = i.detail;
      if (d.kind === 'add-premise')
        return { ...i, accept: { ok: false, reason: REVIEW_TEXTS.acceptNeedsDependencies(premiseLabel, ['Definition Spyro.IsEvil']), missing: [IDS.definition] }, detail: { ...d, sentence, whyNeeded: `${C} needed` } };
      if (d.kind === 'add-arrow') return { ...i, detail: { ...d, why: `${C} the rating` } };
      if (d.kind === 'vocabulary-term' || d.kind === 'declaration') return { ...i, detail: { ...d, gloss: `${C} gloss` } };
      if (d.kind === 'result' && d.revealed) return { ...i, detail: { ...d, summary: `${C} summary` } };
      return i;
    }),
    report: { ...s.report, steps: [{ step: 's1', target: 'cynder-not-good', revealed: true, summary: `${C} summary`, assumedWithoutAsking: [{ text: `${C} a rule`, items: [] }] }] },
    events: [{ id: 1, at: '2026-11-21T10:01:00.000Z', text: REVIEW_TEXTS.eventRedoneWith, items: [IDS.premise] }],
    problems: [{ text: REVIEW_TEXTS.disappeared(premiseLabel), items: [IDS.premise] }],
  };
}

/** Every text node with the token, and whether it sits inside Claude's provenance. */
async function tokenNodes(page: Page): Promise<Array<{ text: string; agent: boolean }>> {
  return page.evaluate((token) => {
    const out: Array<{ text: string; agent: boolean }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const value = n.nodeValue ?? '';
      if (!value.includes(token)) continue;
      const owner = n.parentElement?.closest('[data-provenance]');
      out.push({ text: value, agent: owner?.getAttribute('data-provenance') === 'agent' });
    }
    return out;
  }, C);
}

test('provenance (D-15): Claude’s words are Claude’s on every session screen, also inside the host’s texts that name its items', async ({ page }) => {
  const panel = await openSession(page, markedSession());
  for (const id of [IDS.premise, IDS.arrow, IDS.vocab, IDS.definition, IDS.result]) {
    await panel.locator(`[data-testid="review-row"][data-item="${id}"]`).click();
    const nodes = await tokenNodes(page);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.filter((n) => !n.agent)).toEqual([]);
  }
  // The hold-as dialog names the premise's sentence (F-V2G-FC-1): Claude's words there too.
  const s = markedSession();
  await send(page, hostMessage('session', { session: { ...s, items: s.items.map((i) => (i.id === IDS.premise ? { ...i, accept: OPEN } : i)) } }));
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.premise}"]`).click();
  await panel.getByTestId('detail-accept').click();
  await expect(page.getByTestId('dialog-hold-as')).toBeVisible();
  const dialogNodes = await tokenNodes(page);
  expect(dialogNodes.length).toBeGreaterThan(2);
  expect(dialogNodes.filter((n) => !n.agent)).toEqual([]);
});

test('"Select them" selects the items a closed Accept waits for; "Go to the first one" opens the first item Submit waits for', async ({ page }) => {
  const panel = await openSession(page, markedSession());
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.premise}"]`).click();
  await panel.getByTestId('detail-select-them').click();
  const checked = (id: string) => panel.locator(`[data-testid="review-row"][data-item="${id}"]`).getByTestId('review-row-check');
  await expect(checked(IDS.definition)).toBeChecked();
  await expect(checked(IDS.premise)).not.toBeChecked();
  // Submit waits for the items still in review; its link goes to the first of them.
  await send(page, hostMessage('session', { session: hiddenStage() }));
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.definition}"]`).click();
  await page.getByTestId('session-go-first').click();
  await expect(panel.locator(`[data-testid="review-row"][data-item="${IDS.vocab}"]`)).toHaveAttribute('data-current', 'true');
});

test('the events box shows what is newer than the last dismissal', async ({ page }) => {
  const panel = await openSession(page, markedSession());
  await expect(panel.getByTestId('session-event')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Dismiss' }).click();
  await expect(panel.getByTestId('session-events')).toHaveCount(0);
  const s = markedSession();
  await send(page, hostMessage('session', { session: { ...s, stage: 2, events: [...s.events, { id: 2, at: '2026-11-21T10:02:00.000Z', text: REVIEW_TEXTS.eventRedoneWith, items: [IDS.vocab] }] } }));
  await expect(panel.getByTestId('session-event')).toHaveCount(1);
});

test('the twin pair: the same panel and bar text whatever the hidden outcome (§6.1)', async ({ page }) => {
  const { proved, notProved } = hiddenPair();
  const panel = await openSession(page, proved.session, proved.run);
  // The status line holds §4.7's accepted residuals (progress counts, usage, times): left out.
  const text = async () => ({
    bar: await page.getByTestId('session-bar').innerText(),
    body: await panel.locator('.tl-run__body').innerText(),
    badge: await page.getByTestId('run-badge').innerText(),
  });
  const a = await text();
  const stats = await panel.getByTestId('run-stats').innerText();
  await send(page, hostMessage('run', { run: notProved.run }));
  await send(page, hostMessage('session', { session: notProved.session }));
  // The residuals do differ (the proved twin used more checks), and nothing else does.
  await expect(panel.getByTestId('run-stats')).not.toHaveText(stats);
  expect(await text()).toEqual(a);
});
