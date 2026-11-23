/**
 * Slice 2g (docs/slice2-plan.md 5.1-5.9, 5.13; drafted by builder 2g): the review panel and the session bar in the
 * browser, fed the host's `session` messages (test/shared/sessions.ts).
 *  - the session bar replaces the proposal banner: the session, the stage, the phase; Submit's reason with "Go to the
 *    first one"; Raw Lean diff… asks first while the results are hidden;
 *  - the panel ("Edit session"): Inferences with the step chip, the stage report, the list (a hidden Result is a
 *    neutral row), the detail; Accept posts one `decideItems`, `own: true`; Claude's words in Claude's style;
 *  - an Add premise asks how it is held; a cascade asks first;
 *  - read-only while a step runs (D2-62); the end confirmation; Exit's dialog;
 *  - the twin pair: the same panel and bar text whatever the hidden outcome;
 *  - 2k1 (D2-100): once the session's run has ended (Exit, Apply), the run panel of any ended run with its line and
 *    Dismiss, no session bar; a stale view of the ended run never brings the review back.
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, REVIEW_TEXTS, spyroGraph, type RunView, type SessionView } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { ENDED_TEXT } from '../../src/model/run';
import { AT, confirmingSession, hiddenPair, hiddenStage, IDS, OPEN, sessionRun, shownStage, stepSession } from '../shared/sessions';
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
  // 2j1 (D2-76 D5): the reason is text next to Submit, not only its title.
  await expect(bar.getByTestId('session-submit-reason')).toHaveText(REVIEW_TEXTS.submitInReview(3));
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

test('2j1 (D2-76): an item to be redone says why, in its detail and as its row’s tooltip, and offers core’s refusal instead of Back to review; Submit’s closed reason is text', async ({ page }) => {
  const why = [
    REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoDependsOn('Vocabulary term Spyro.InGame', 'declined Shaky')),
    REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoTookOut(REVIEW_TEXTS.redoReasonQueue)),
  ];
  const base = shownStage({ vocab: 'declined', definition: 'to-be-redone' });
  const session: SessionView = {
    ...base,
    items: base.items.map((i) => (i.id === IDS.definition ? { ...i, redo: { because: [IDS.vocab], why }, review: { ok: false, reason: REVIEW_TEXTS.redoneByClaude } } : i)),
  };
  const panel = await openSession(page, session);
  const row = panel.locator(`[data-testid="review-row"][data-item="${IDS.definition}"]`);
  await expect(row.getByTestId('item-status')).toHaveText('↻ to be redone');
  await expect(row).toHaveAttribute('title', why.join('\n'));
  // Rows not to be redone carry no such tooltip.
  await expect(panel.locator(`[data-testid="review-row"][data-item="${IDS.formalize}"]`)).not.toHaveAttribute('title', /.+/);
  await row.click();
  const detail = panel.getByTestId('item-detail');
  await expect(detail).toHaveAttribute('data-item', IDS.definition);
  await expect(detail.getByTestId('detail-redo-line')).toHaveText(why);
  await expect(detail.getByTestId('detail-redo-refusal')).toHaveText(REVIEW_TEXTS.redoneByClaude);
  await expect(detail.getByTestId('detail-back-to-review')).toHaveCount(0);
  await expect(detail.getByTestId('detail-decline')).toHaveCount(0);
  await expect(detail.getByTestId('detail-accept')).toHaveCount(0);
  await page.screenshot({ path: shotPath('s2-review-redo.png') });
  // A decided item keeps its Back to review link.
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.vocab}"]`).click();
  await expect(panel.getByTestId('item-detail').getByTestId('detail-back-to-review')).toHaveCount(1);
  // Submit's closed reason is text beside it, with "Go to the first one".
  const bar = page.getByTestId('session-bar');
  await expect(bar.getByTestId('session-submit-reason')).toHaveText(REVIEW_TEXTS.submitInReview(session.counts.inReview));
  await expect(bar.getByTestId('session-go-first')).toBeVisible();
  // An open Submit shows no reason.
  await send(page, hostMessage('session', { session: { ...session, submit: { gate: OPEN, next: 'claude-steps', work: { shaky: 0, redo: 1, steps: 1 } } } }));
  await expect(bar.getByTestId('session-submit')).toBeEnabled();
  await expect(bar.getByTestId('session-submit-reason')).toHaveCount(0);
});

test('2j2 (D2-92): every decline takes a note; an item to be redone takes a note in place; Submit asks first, with a comment; the report shows it', async ({ page }) => {
  const panel = await openSession(page, shownStage());
  // Reject shows the note field and its own button (D2-94); the note goes with it.
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.definition}"]`).click();
  await panel.getByTestId('detail-decline').click();
  await expect(panel.getByTestId('decline-note')).toHaveCount(0);
  await panel.getByTestId('decline-reject').click();
  await expect(panel.getByTestId('decline-note')).toBeFocused();
  await expect(panel.getByTestId('decline-confirm')).toHaveText('Decline (Reject)');
  await panel.getByTestId('decline-note').fill('Too strong.\nNot every game.');
  await panel.getByTestId('decline-confirm').click();
  expect((await postedOfType(page, 'decideItems'))[0]?.payload.decisions).toEqual([{ item: IDS.definition, rev: 1, to: 'declined', option: 'reject', note: 'Too strong.\nNot every game.' }]);
  await send(page, hostMessage('actionResult', { requestId: (await postedOfType(page, 'decideItems'))[0]?.payload.requestId ?? '', outcome: { ok: true, label: 'x', undoable: false } }));
  // An arrow item's menu opens with its one Decline chosen, the note field shown.
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.arrow}"]`).click();
  await panel.getByTestId('detail-decline').click();
  await expect(panel.getByTestId('decline-note')).toBeVisible();
  await expect(panel.getByTestId('decline-confirm')).toHaveText('Decline');
  await panel.getByTestId('decline-note').fill('Not this premise.');
  await panel.getByTestId('decline-confirm').click();
  expect((await postedOfType(page, 'decideItems'))[1]?.payload.decisions).toEqual([{ item: IDS.arrow, rev: 1, to: 'declined', option: 'plain', note: 'Not this premise.' }]);
  await send(page, hostMessage('actionResult', { requestId: (await postedOfType(page, 'decideItems'))[1]?.payload.requestId ?? '', outcome: { ok: true, label: 'x', undoable: false } }));

  // The host's next view: the definition declined with its note, the Formalize to be redone, Submit open for Claude's steps.
  const base = shownStage({ definition: 'declined', formalize: 'to-be-redone' });
  const why = [REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoDependsOn('Definition Spyro.IsEvil', 'rejected'))];
  const withNote = (note?: string): SessionView => ({
    ...base,
    items: base.items.map((i) =>
      i.id === IDS.definition
        ? { ...i, declined: { option: 'reject', note: 'Too strong.\nNot every game.' } }
        : i.id === IDS.formalize
          ? { ...i, redo: { because: [IDS.definition], why, ...(note !== undefined ? { note } : {}) }, review: { ok: false, reason: REVIEW_TEXTS.redoneByClaude } }
          : i,
    ),
    submit: { gate: OPEN, next: 'claude-steps', work: { shaky: 0, redo: 1, steps: 1 } },
  });
  await send(page, hostMessage('session', { session: withNote() }));
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.definition}"]`).click();
  await expect(panel.getByTestId('detail-decline-note')).toHaveText('Note for Claude: Too strong.\nNot every game.');
  await panel.locator(`[data-testid="review-row"][data-item="${IDS.formalize}"]`).click();
  const detail = panel.getByTestId('item-detail');
  await expect(detail.getByTestId('detail-redo-note-text')).toHaveCount(0);
  await detail.getByTestId('detail-redo-note-edit').click();
  await expect(detail.getByTestId('detail-redo-note-input')).toBeFocused();
  await detail.getByTestId('detail-redo-note-input').fill('Read it as a rule.');
  // Cancel sends nothing; Save sends `noteItem`.
  await detail.getByTestId('detail-redo-note-cancel').click();
  expect(await postedOfType(page, 'noteItem')).toHaveLength(0);
  await detail.getByTestId('detail-redo-note-edit').click();
  await detail.getByTestId('detail-redo-note-input').fill('Read it as a rule.');
  await detail.getByTestId('detail-redo-note-save').click();
  const notes = await postedOfType(page, 'noteItem');
  expect(notes.map((m) => ({ ...m.payload, requestId: undefined }))).toEqual([{ runId: base.runId, stage: 1, item: IDS.formalize, rev: 1, note: 'Read it as a rule.', requestId: undefined }]);
  await send(page, hostMessage('actionResult', { requestId: notes[0]?.payload.requestId ?? '', outcome: { ok: true, label: 'x', undoable: false } }));
  await send(page, hostMessage('session', { session: withNote('Read it as a rule.') }));
  await expect(detail.getByTestId('detail-redo-note-text')).toHaveText('Note for Claude: Read it as a rule.');
  await page.screenshot({ path: shotPath('s2-review-notes.png') });

  // Submit review asks first: what it does, the comment, Submit and Cancel.
  const bar = page.getByTestId('session-bar');
  await bar.getByTestId('session-submit').click();
  expect(await postedOfType(page, 'submitReview')).toHaveLength(0);
  const submitPanel = bar.getByTestId('session-submit-panel');
  await expect(submitPanel.getByTestId('session-submit-what')).toHaveText(REVIEW_TEXTS.submitSteps(0, 1));
  await expect(submitPanel.getByTestId('session-submit-comment')).toBeFocused();
  await submitPanel.getByTestId('session-submit-cancel').click();
  await expect(bar.getByTestId('session-submit-panel')).toHaveCount(0);
  await bar.getByTestId('session-submit').click();
  await bar.getByTestId('session-submit-comment').fill('Keep the names.\nPrefer the rule reading.');
  await page.screenshot({ path: shotPath('s2-review-submit-panel.png') });
  await bar.getByTestId('session-submit-confirm').click();
  const submitted = await postedOfType(page, 'submitReview');
  expect(submitted.map((m) => ({ ...m.payload, requestId: undefined }))).toEqual([{ runId: base.runId, stage: 1, comment: 'Keep the names.\nPrefer the rule reading.', requestId: undefined }]);
  await expect(bar.getByTestId('session-submit-panel')).toHaveCount(0);
  await send(page, hostMessage('actionResult', { requestId: submitted[0]?.payload.requestId ?? '', outcome: { ok: true, label: 'x', undoable: false } }));
  // The next stage's report shows the comment.
  const stage2 = shownStage({}, { stage: 2 });
  await send(page, hostMessage('session', { session: { ...stage2, report: { ...stage2.report, stage: 2, comment: { stage: 1, text: 'Keep the names.\nPrefer the rule reading.' } } } }));
  await expect(panel.getByTestId('report-comment')).toHaveText(`${REVIEW_TEXTS.reportComment(1)} Keep the names.\nPrefer the rule reading.`);
  // With nothing for Claude to do, Submit goes straight to the end confirmation: no panel.
  await send(page, hostMessage('session', { session: { ...stage2, submit: { gate: OPEN, next: 'confirm', work: { shaky: 0, redo: 0, steps: 0 } } } }));
  await bar.getByTestId('session-submit').click();
  await expect(bar.getByTestId('session-submit-panel')).toHaveCount(0);
  expect((await postedOfType(page, 'submitReview')).map((m) => ({ ...m.payload, requestId: undefined }))[1]).toEqual({ runId: base.runId, stage: 2, requestId: undefined });
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

test('2k1 (D2-100): Exit, confirmed, posts `endSession` exit; the host’s ended run and `session: null` leave the panel of an ended run, with the exited line and Dismiss; no session bar, no Exit, no review panel; Dismiss posts `dismissRun`', async ({ page }) => {
  const view = hiddenStage();
  const run = sessionRun(view);
  const panel = await openSession(page, view, run);
  await expect(panel).toHaveAttribute('aria-label', REVIEW_TEXTS.panelLabel);
  await page.getByTestId('session-exit').click();
  await expect(page.getByTestId('exit-text')).toHaveText(REVIEW_TEXTS.exitConfirm(0, 3, false));
  await page.getByTestId('exit-confirm').click();
  const exits = (await postedOfType(page, 'endSession')).filter((m) => m.payload.decision === 'exit');
  expect(exits.map((m) => ({ ...m.payload, requestId: undefined }))).toEqual([{ runId: view.runId, decision: 'exit', requestId: undefined }]);
  // The host (the harness answered the request): the run ended, then no session (D1).
  await send(page, hostMessage('run', { run: { ...run, state: 'discarded', endedAt: AT } }));
  await send(page, hostMessage('session', { session: null }));
  const ended = panel.getByTestId('run-ended');
  await expect(ended).toHaveAttribute('data-outcome', 'discarded');
  await expect(ended.getByTestId('run-ended-text')).toHaveText(REVIEW_TEXTS.exited);
  await expect(ended.getByTestId('dismiss-run')).toBeVisible();
  await expect(panel).toHaveAttribute('aria-label', 'Claude run');
  await expect(panel.getByTestId('review-list')).toHaveCount(0);
  await expect(page.getByTestId('session-bar')).toHaveCount(0);
  await expect(page.getByTestId('session-exit')).toHaveCount(0);
  await expect(page.getByTestId('session-submit')).toHaveCount(0);
  await expect(page.getByTestId('run-badge')).toHaveText('Claude: discarded · Spyro');
  // The board is the Current view again (no session, no Proposed view).
  await expect(page.locator('.tl-board[data-view="proposed"]')).toHaveCount(0);
  await page.screenshot({ path: shotPath('s2-review-exited.png') });
  // D4: Dismiss as for any run.
  await ended.getByTestId('dismiss-run').click();
  expect((await postedOfType(page, 'dismissRun')).map((m) => m.payload)).toEqual([{ runId: view.runId }]);
  await send(page, hostMessage('run', { run: null }));
  await expect(page.getByTestId('run-panel')).toHaveCount(0);
});

test('2k1 (D2-100): after Apply the panel shows the ended run’s line with Dismiss, "Applied: …" when it changed files and "Recorded: …" when it changed none; the end confirmation and the session bar are gone', async ({ page }) => {
  const view = confirmingSession();
  const run = sessionRun(view);
  const panel = await openSession(page, view, run);
  await panel.getByTestId('confirmation-apply').click();
  expect((await postedOfType(page, 'endSession'))[0]?.payload).toMatchObject({ decision: 'apply', stage: 1, check: 'chk-1' });
  await send(page, hostMessage('run', { run: { ...run, state: 'accepted', endedAt: AT, accepted: { changedFiles: true } } }));
  await send(page, hostMessage('session', { session: null }));
  const ended = panel.getByTestId('run-ended');
  await expect(ended).toHaveAttribute('data-outcome', 'accepted');
  await expect(ended.getByTestId('run-ended-text')).toHaveText(REVIEW_TEXTS.applied);
  await expect(ended.getByTestId('dismiss-run')).toBeVisible();
  await expect(panel.getByTestId('end-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('session-bar')).toHaveCount(0);
  await expect(page.getByTestId('run-badge')).toHaveText('Claude: accepted · Spyro');
  // An Apply that changed no file (every item rejected): the "Recorded" line, without the Undo hint.
  await send(page, hostMessage('run', { run: { ...run, state: 'accepted', endedAt: AT, accepted: { changedFiles: false } } }));
  await expect(ended).toHaveAttribute('data-outcome', 'recorded');
  await expect(ended.getByTestId('run-ended-text')).toHaveText(ENDED_TEXT.recorded);
});

test('2k1 (D2-100 D3): an ended run that arrives while the store holds its session view clears it, and a view of it arriving late is dropped: neither draws the review panel or the session bar', async ({ page }) => {
  const view = shownStage();
  const run = sessionRun(view);
  const panel = await openSession(page, view, run);
  await expect(page.getByTestId('session-bar')).toBeVisible();
  // The ended run arrives while the store still holds the session's view (no `session: null` yet): no Exit is offered.
  await send(page, hostMessage('run', { run: { ...run, state: 'discarded', endedAt: AT } }));
  await expect(page.getByTestId('session-exit')).toHaveCount(0);
  await expect(panel.getByTestId('run-ended')).toBeVisible();
  await expect(panel.getByTestId('review-list')).toHaveCount(0);
  await expect(page.getByTestId('session-bar')).toHaveCount(0);
  // The view again, late: still the ended run's panel.
  await send(page, hostMessage('session', { session: view }));
  await expect(panel.getByTestId('run-ended-text')).toHaveText(REVIEW_TEXTS.exited);
  await expect(panel).toHaveAttribute('aria-label', 'Claude run');
  await expect(panel.getByTestId('review-list')).toHaveCount(0);
  await expect(page.getByTestId('session-bar')).toHaveCount(0);
  await expect(page.getByTestId('session-exit')).toHaveCount(0);
  await expect(page.locator('.tl-board[data-view="proposed"]')).toHaveCount(0);
});

test('2k1 (D2-103): another subject’s session reads "An edit session is active…" while its run is active, and the line of any ended run once it has ended', async ({ page }) => {
  const view = hiddenStage({ subject: 'Bayonetta' });
  const run = sessionRun(view, { subject: 'Bayonetta' });
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await send(page, hostMessage('run', { run }));
  await send(page, hostMessage('session', { session: view }));
  const line = page.getByTestId('run-elsewhere');
  await expect(line).toHaveAttribute('data-session', 'true');
  await expect(line).toContainText(REVIEW_TEXTS.runElsewhere('Bayonetta'));
  await send(page, hostMessage('run', { run: { ...run, state: 'discarded', endedAt: AT } }));
  await send(page, hostMessage('session', { session: null }));
  await expect(line).not.toHaveAttribute('data-session', 'true');
  await expect(line).toHaveText(/Claude’s run on Bayonetta: discarded\.\s*Show/);
  await expect(page.getByTestId('run-badge')).toHaveText('Claude: discarded · Bayonetta');
});
