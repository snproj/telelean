/**
 * M2 runs on the board (docs/m2-plan.md section 6.4): starting a run, now "Formalize for dependencies" in the Context
 * Menu section that replaced the tray (AT6.1; spec v4.1 ES-2, CM-3), the run panel's status line, notices, activity and
 * states (AT6.2), and another subject's run as one compact line (AT6.11).
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroGraph, type RunNotice, type TlGraph } from '@telelean/core';
import { makeNode, workspaceState } from '../shared/graphs';
import { ALL_PREMISES, RUN_ID, runView, TARGET, UPDATED, waitingRun } from '../shared/runs';
import { boardMenu, card, cardPoint, clickArrow, menuItem, openBoard, posted, postedOfType, rightClick, send, shotPath, type OpenedBoard } from './helpers';

/** Spyro plus a proposition marked "follows from nothing" (its ∅ mark is an empty question, AR-5). */
function markedGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const marked = makeNode('side-claim', 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } }, { fromNothing: true });
  return { ...base, nodes: [...base.nodes, marked], positions: { 'side-claim': { x: 760, y: 60 } } };
}

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** A2 notices with the core sentences of docs/m2-plan.md section 3.5. */
const NOTICES: RunNotice[] = [
  {
    id: 'n1',
    at: '2026-11-01T10:03:00.000Z',
    level: 'warning',
    kind: 'gate-failed',
    text: 'Attempt 1 didn’t pass: it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn’t select. Asking Claude to retry.',
    detail: 'footprint: Spyro.cynder_not_good.holds depends on Spyro.new_spyro_pg.holds, which is not among the permitted axioms.',
  },
  {
    id: 'n2',
    at: '2026-11-01T10:03:30.000Z',
    level: 'error',
    kind: 'gave-up',
    text: 'Claude’s attempts didn’t pass the checks 3 times: each time it used `new_spyro_pg.holds`, which you didn’t select. telelean reverted its working copy to “Statements frozen (round 1)”.',
  },
  { id: 'n3', at: '2026-11-01T10:03:31.000Z', level: 'info', kind: 'reverted', text: 'telelean reverted Claude’s working copy to “Statements frozen (round 1)”.' },
  { id: 'n4', at: '2026-11-01T10:03:40.000Z', level: 'warning', kind: 'cap', text: 'Claude reached this round’s limit of 25 Lean checks.' },
  { id: 'n5', at: '2026-11-01T10:03:50.000Z', level: 'error', kind: 'environment', text: 'telelean could not run Lean (low memory): not Claude’s fault, and not counted as an attempt.' },
];

test('AT6.1 Formalize for dependencies posts startRun for the selected arrows, or for a ∅ mark from no premises; disabled during a run, with the reason', async ({ page }) => {
  board = await openBoard(page, markedGraph(), 'dark', { workspace: workspaceState() });
  const formalize = page.getByTestId('formalize');
  // Two of the goal's arrows: exactly their sources.
  await clickArrow(page, 'cynder-dark-past', TARGET);
  await clickArrow(page, 'new-spyro-pg', TARGET, true);
  await formalize.click();
  await expect(formalize).toBeEnabled(); // the host answered the start (no run follows here)
  // All of its arrows ("Select incoming arrows" in its right-click menu).
  await rightClick(page, await cardPoint(page, TARGET));
  await menuItem(page, 'select-incoming').click();
  await expect(boardMenu(page)).toHaveCount(0);
  await formalize.click();
  await expect(formalize).toBeEnabled();
  // A "follows from nothing" mark: the empty question, from no premises at all (M2's "Self-evident?").
  const stub = await page.locator('[data-mark-id="side-claim"] .tl-mark__hit').boundingBox();
  if (!stub) throw new Error('no ∅ stub');
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  await expect(page.getByTestId('context-summary')).toHaveText('the "follows from nothing" mark of “Spyro games avoid dark characters”');
  await formalize.click();
  expect((await postedOfType(page, 'startRun')).map((m) => m.payload)).toEqual([
    { target: TARGET, premises: ['cynder-dark-past', 'new-spyro-pg'], requestId: 'r1' },
    { target: TARGET, premises: [...ALL_PREMISES], requestId: 'r2' },
    { target: 'side-claim', premises: [], requestId: 'r3' },
  ]);
  expect(await postedOfType(page, 'theseSuffice')).toEqual([]);

  // A run of this model folder is active (here: another subject's): Formalize is disabled, with the reason.
  await send(page, hostMessage('run', { run: runView({ subject: 'Bayonetta', target: 'bayo-not-good', premises: [] }) }));
  await expect(formalize).toBeDisabled();
  await expect(page.getByTestId('formalize-reason')).toHaveText('A run is active. Claude is already working on Bayonetta: wait for it to finish, or cancel it.');
  // A run of this subject waiting in review blocks too.
  await send(page, hostMessage('run', { run: runView({ state: 'review', proposalId: 'p1' }) }));
  await expect(page.getByTestId('formalize-reason')).toContainText('waiting for your review');
  await page.screenshot({ path: shotPath('m2-formalize-blocked.png') });

  // No run: arrows into two propositions are not one question (AP-9); the disabled button sends nothing.
  await send(page, hostMessage('run', { run: null }));
  await expect(formalize).toBeEnabled();
  await clickArrow(page, 'cynder-dark-past', TARGET);
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(stub.x + stub.width / 2, stub.y + stub.height / 2);
  await page.keyboard.up('ControlOrMeta');
  await expect(page.getByTestId('context-summary')).toHaveText('1 arrow into “Cynder would not be a good addition to …” · the "follows from nothing" mark of “Spyro games avoid dark characters”');
  await expect(formalize).toBeDisabled();
  await expect(page.getByTestId('formalize-reason')).toHaveText('Select arrows into one card: several targets come with the review list.');
  await formalize.click({ force: true });
  expect(await postedOfType(page, 'startRun')).toHaveLength(3);
});

test('AT6.2 the run panel: state and stage, counters, usage with "estimate", rate limit, notices, Claude’s words italic with a marker; Cancel posts cancelRun', async ({ page }) => {
  const run = runView({
    notices: NOTICES,
    usage: { ...runView().usage, rateLimit: { status: 'allowed_warning', resetsAt: '2026-11-01T15:00:00.000Z' } },
    activity: [
      { at: '2026-11-01T10:00:05.000Z', kind: 'system', text: 'Run started: Spyro, 3 premises' },
      { at: '2026-11-01T10:00:30.000Z', kind: 'claude-text', text: 'I will read Main.lean and formalise the rule first.' },
      { at: '2026-11-01T10:01:10.000Z', kind: 'check', text: 'check_lean: build ok, 0 violations', ok: true },
      { at: '2026-11-01T10:02:10.000Z', kind: 'check', text: 'check_lean: 1 violation (`proof-before-freeze`)', ok: false },
    ],
  });
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run, clock: UPDATED });
  const panel = page.getByTestId('run-panel');
  await expect(panel).toHaveAttribute('data-state', 'working');
  await expect(panel.getByTestId('run-state')).toHaveText('Working · formalising');
  const stat = (part: string) => panel.locator(`[data-part="${part}"]`);
  await expect(stat('round')).toHaveText('round 1');
  await expect(stat('checks')).toHaveText('checks 3/25');
  await expect(stat('turns')).toHaveText('turns 12/80');
  await expect(stat('agent')).toHaveText('agent 4:05 / 20:00');
  await expect(stat('gate')).toHaveText('check attempts 0/3');
  await expect(stat('tokens')).toHaveText('12.3k in · 1.2k out');
  await expect(stat('cost')).toHaveText('$0.42 estimate');
  await expect(stat('cost')).toHaveAttribute('title', 'Estimate at API list prices; your subscription is not billed per token.');
  await expect(stat('rate')).toContainText('rate limit: close');
  await expect(stat('rate')).toHaveAttribute('data-tone', 'warn');
  await expect(panel.getByTestId('run-target')).toContainText('“Cynder would not be a good addition to the new Spyro game” from 3 premises');
  // The header's badge.
  await expect(page.getByTestId('run-badge')).toHaveText('Claude: working on Spyro · 3/25 checks');

  // A2 notices, each with its kind; the exact failure as Claude received it is one click away.
  const notices = panel.getByTestId('run-notice');
  await expect(notices).toHaveCount(5);
  expect(await notices.evaluateAll((els) => els.map((el) => [el.getAttribute('data-kind'), el.getAttribute('data-level')]))).toEqual([
    ['gate-failed', 'warning'],
    ['gave-up', 'error'],
    ['reverted', 'info'],
    ['cap', 'warning'],
    ['environment', 'error'],
  ]);
  await expect(notices.first()).toContainText('Attempt 1 didn’t pass: it used “The new Spyro game is PG” (new_spyro_pg.holds), which you didn’t select. Asking Claude to retry.');
  await expect(notices.first().locator('code')).toHaveText(['new_spyro_pg.holds']);
  await notices.first().getByText('Details').click();
  await expect(notices.first().locator('pre')).toContainText('not among the permitted axioms');

  // Activity: Claude's text italic with its marker; telelean's lines plain.
  const claude = panel.locator('[data-testid="activity-item"][data-kind="claude-text"] .tl-agent');
  await expect(claude.locator('.tl-agent__marker')).toHaveText('Claude');
  expect(await claude.locator('.tl-agent__text').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
  const tool = panel.locator('[data-testid="activity-item"][data-kind="check"]').first();
  expect(await tool.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');
  await expect(panel.locator('[data-testid="activity-item"][data-ok="false"] .codicon-error')).toHaveCount(1);
  await page.screenshot({ path: shotPath('m2-run-panel.png') });

  await panel.getByTestId('cancel-run').click();
  expect((await postedOfType(page, 'cancelRun')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r1' }]);

  // Hiding the panel keeps the run; the badge shows it again.
  await panel.getByRole('button', { name: 'Hide the run panel' }).click();
  await expect(panel).toHaveCount(0);
  await page.getByTestId('run-badge').click();
  await expect(page.getByTestId('run-panel')).toBeVisible();
});

test('AT6.2 the run states: starting, proving, waiting (clock paused), checking, interrupted (Resume / Stop), failed (Dismiss)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState(), run: runView({ state: 'starting', stage: undefined }), clock: UPDATED });
  const panel = page.getByTestId('run-panel');
  await expect(panel.getByTestId('run-state')).toHaveText('Starting');
  await expect(panel.getByTestId('run-progress')).toContainText('starting Claude');

  await send(page, hostMessage('run', { run: runView({ stage: 'prove', counters: { turns: 30, checks: 9, agentMs: 600_000, gateAttempts: 1 } }) }));
  await expect(panel.getByTestId('run-state')).toHaveText('Working · proving');
  await expect(panel.locator('[data-part="gate"]')).toHaveText('check attempts 1/3');
  await expect(panel.locator('[data-part="agent"]')).toHaveText('agent 10:00 / 20:00');

  await send(page, hostMessage('run', { run: waitingRun() }));
  await expect(panel.getByTestId('run-state')).toHaveText('Waiting for your answer');
  await expect(panel.locator('[data-part="agent"]')).toHaveText('agent 4:05 / 20:00 (paused)');
  await expect(page.getByTestId('run-badge')).toHaveAttribute('data-attention', 'true');

  await send(page, hostMessage('run', { run: runView({ state: 'gate', stage: 'prove' }) }));
  await expect(panel.getByTestId('run-state')).toHaveText("Checking Claude's result");
  await expect(panel.getByTestId('run-progress')).toContainText('telelean checks the result');

  await send(page, hostMessage('run', { run: runView({ state: 'interrupted', canResume: true }) }));
  await expect(panel.getByTestId('cancel-run')).toHaveCount(0);
  await panel.getByTestId('resume-run').click();
  await send(page, hostMessage('run', { run: runView({ state: 'interrupted', canResume: true, updatedAt: '2026-11-01T10:05:00.000Z' }) }));
  await panel.getByTestId('stop-run').click();
  expect((await postedOfType(page, 'resumeRun')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r1' }]);
  expect((await postedOfType(page, 'discardProposal')).map((m) => m.payload)).toEqual([{ runId: RUN_ID, requestId: 'r2' }]);

  await send(page, hostMessage('run', { run: runView({ state: 'failed', verdict: 'failed', error: 'your files have Lean errors (Model/Spyro/Main.lean:12: unknown identifier `Gme`); fix or save them, then start again' }) }));
  await expect(panel.getByTestId('run-state')).toHaveText('Failed');
  await expect(panel.getByTestId('run-error')).toContainText('your files have Lean errors (Model/Spyro/Main.lean:12: unknown identifier Gme)');
  await expect(panel.getByTestId('run-error').locator('code')).toHaveText(['Gme']);
  await page.screenshot({ path: shotPath('m2-run-failed.png') });
  await panel.getByTestId('dismiss-run').click();
  expect((await postedOfType(page, 'dismissRun')).map((m) => m.payload)).toEqual([{ runId: RUN_ID }]);
  // The host answers with no run: the panel and the badge go away.
  await send(page, hostMessage('run', { run: null }));
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('run-badge')).toHaveCount(0);
});

test('on a narrow board the run panel goes below the board, which keeps a readable AXIOMS column and its canvas; toasts stay above the panel', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run: waitingRun(), clock: UPDATED });
  const panel = await page.getByTestId('run-panel').boundingBox();
  const area = await page.locator('.tl-board-area').boundingBox();
  if (!panel || !area) throw new Error('missing boxes');
  expect(panel.y).toBeGreaterThanOrEqual(area.y + area.height - 1);
  expect(panel.width).toBeGreaterThan(area.width - 2);
  expect((await page.locator('.tl-axioms').boundingBox())?.width).toBeGreaterThanOrEqual(219.5);
  expect((await page.locator('.tl-canvas').boundingBox())?.width).toBeGreaterThan(300);
  await send(page, hostMessage('notice', { id: 't1', level: 'info', text: 'A notice', undoable: false }));
  const toast = await page.getByTestId('toasts').boundingBox();
  if (!toast) throw new Error('no toasts');
  expect(toast.y + toast.height).toBeLessThanOrEqual(panel.y + 1);
  await page.screenshot({ path: shotPath('m2-run-narrow.png') });
});

test('AT6.11 another subject’s run shows one compact line with "Show" (it switches the board to that subject)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run: waitingRun(undefined, { subject: 'Bayonetta', target: 'bayo-not-good', premises: [] }) });
  const line = page.getByTestId('run-elsewhere');
  await expect(line).toHaveText(/Claude’s run on Bayonetta: waiting for your answer\.\s*Show/);
  await expect(page.getByTestId('run-panel')).toHaveCount(0);
  await expect(page.getByTestId('question-set')).toHaveCount(0);
  await expect(page.getByTestId('run-badge')).toHaveText('Claude: a question for you · Bayonetta');
  await page.screenshot({ path: shotPath('m2-run-elsewhere.png') });
  await line.getByRole('button', { name: 'Show' }).click();
  expect((await posted(page)).filter((m) => m.type === 'selectSubject').map((m) => m.payload)).toEqual([{ subject: 'Bayonetta' }]);
});
