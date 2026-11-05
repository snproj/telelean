/**
 * The M1 header: the subject picker (AT6.12), the history dropdown (AT6.13), the Lean badge, problems list and
 * banner (AT6.14).
 */
import { expect, test } from '@playwright/test';
import { hostMessage, spyroGraph, type SemanticSummary } from '@telelean/core';
import { historyListing, statusGallery, withSemantic, workspaceState } from '../shared/graphs';
import { card, openBoard, postedOfType, replyNext, send, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.12 the subject picker lists the subjects with counts, posts selectSubject, and validates "New subject…"', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await expect(page.locator('.tl-toolbar__root')).toHaveText('mental_model');
  const picker = page.getByTestId('subject-picker');
  await expect(picker).toHaveText('Spyro');
  await picker.click();
  const menu = page.getByTestId('subject-menu');
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Spyro4 cards', 'Bayonetta2 cards']);
  await expect(menu.getByRole('menuitemradio', { name: /Spyro/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: shotPath('m1-subject-picker.png') });
  await menu.getByRole('menuitemradio', { name: /Bayonetta/ }).click();
  await expect(menu).toHaveCount(0);
  expect((await postedOfType(page, 'selectSubject')).map((m) => m.payload)).toEqual([{ subject: 'Bayonetta' }]);

  // New subject: a capitalised Lean identifier, not taken.
  await picker.click();
  await menu.getByRole('button', { name: 'New subject…' }).click();
  const name = menu.getByRole('textbox', { name: 'New subject name' });
  await expect(name).toBeFocused();
  const create = menu.getByRole('button', { name: 'Create' });
  await name.fill('kingdom');
  await expect(menu.getByRole('alert')).toContainText('capitalised Lean identifier');
  await expect(create).toBeDisabled();
  await name.fill('Bayonetta');
  await expect(menu.getByRole('alert')).toContainText('already a subject called Bayonetta');
  await name.fill('Kingdom-Hearts');
  await expect(create).toBeDisabled();
  // The host refuses: the message is shown in place.
  await replyNext(page, 'createSubject', { ok: false, code: 'invalid', error: 'Model/Kingdom.lean already exists.' });
  await name.fill('Kingdom');
  await create.click();
  await expect(menu.getByRole('alert')).toContainText('Model/Kingdom.lean already exists.');
  // Accepted: the menu closes (the host then switches the board to the new subject).
  await name.fill('Kingdoms');
  await name.press('Enter');
  await expect(menu).toHaveCount(0);
  expect((await postedOfType(page, 'createSubject')).map((m) => m.payload)).toEqual([
    { name: 'Kingdom', requestId: 'r1' },
    { name: 'Kingdoms', requestId: 'r2' },
  ]);

  // The host switches the board: workspace and graph of the other subject.
  await send(page, hostMessage('workspace', { state: workspaceState({ subject: 'Bayonetta' }) }));
  await send(page, hostMessage('graph', { graph: { ...spyroGraph(20), subject: 'Bayonetta', nodes: [], edges: [], vocabulary: [] } }));
  await expect(picker).toHaveText('Bayonetta');
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('AT6.13 the history dropdown lists "time · action · label" with the storage counter; Preview, Revert, Keep last', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), history: historyListing() });
  await page.getByTestId('history-button').click();
  expect((await postedOfType(page, 'historyList')).map((m) => m.payload)).toEqual([{ subject: 'Spyro', limit: 50 }]);
  const menu = page.getByTestId('history-menu');
  await expect(menu.getByTestId('history-storage')).toHaveText('This subject: 12 KB · All subjects: 30 KB');
  const entries = menu.getByTestId('history-entry');
  await expect(entries).toHaveCount(3);
  const lines = await entries.locator('.tl-history__line').allTextContents();
  expect(lines[0]).toMatch(/^(\d{2}:\d{2}|[A-Z][a-z]{2} \d{1,2}( \d{4})? \d{2}:\d{2}) · premises · These suffice: Cynder would not be a good addition… ← 3 premises$/);
  expect(lines[1]).toMatch(/ · add · Add assumption: The new Spyro game is PG$/);
  expect(lines[2]).toMatch(/ · start · Initial state$/);
  await page.screenshot({ path: shotPath('m1-history.png') });

  await entries.nth(1).getByRole('button', { name: 'Preview' }).click();
  expect((await postedOfType(page, 'historyPreview')).map((m) => m.payload)).toEqual([{ subject: 'Spyro', entryId: 'b0ffee2', compare: 'parent' }]);

  // Revert asks first; Cancel posts nothing.
  await entries.nth(2).getByRole('button', { name: 'Revert to this' }).click();
  const confirm = page.getByTestId('dialog-revert');
  await expect(confirm).toContainText('Revert Spyro to this state?');
  await expect(confirm).toContainText('Initial state');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  expect(await postedOfType(page, 'historyRevert')).toEqual([]);
  await page.getByTestId('history-button').click();
  await page.getByTestId('history-menu').getByTestId('history-entry').nth(2).getByRole('button', { name: 'Revert to this' }).click();
  await confirm.getByRole('button', { name: 'Revert' }).click();
  expect((await postedOfType(page, 'historyRevert')).map((m) => m.payload)).toEqual([{ subject: 'Spyro', entryId: 'a0ffee3', requestId: 'r1' }]);

  // Keep last N: it drops snapshots for good, so it asks first and says how many go.
  await page.getByTestId('history-button').click();
  const historyMenu = page.getByTestId('history-menu');
  const keep = historyMenu.getByRole('spinbutton', { name: 'Keep the last N entries' });
  const keepButton = historyMenu.getByRole('button', { name: 'Keep last' });
  await expect(keepButton).toBeDisabled();
  await keep.fill('3');
  await expect(keepButton).toBeDisabled(); // three entries: nothing to drop
  await keep.fill('2');
  await keepButton.click();
  const confirmPrune = historyMenu.getByTestId('history-prune-confirm');
  await expect(confirmPrune).toHaveText(/Drop 1 older snapshot of Spyro\? This cannot be undone\./);
  expect(await postedOfType(page, 'historyPrune')).toEqual([]);
  await confirmPrune.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmPrune).toHaveCount(0);
  expect(await postedOfType(page, 'historyPrune')).toEqual([]);
  await keepButton.click();
  await historyMenu.getByTestId('history-prune-confirm').getByRole('button', { name: 'Drop them' }).click();
  expect((await postedOfType(page, 'historyPrune')).map((m) => m.payload)).toEqual([{ subject: 'Spyro', keepLast: 2, requestId: 'r2' }]);
});

test('AT6.13 without a repository the dropdown offers "Initialize git"; other states explain themselves', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'light', { workspace: workspaceState({ history: { state: 'no-repo' } }) });
  await page.getByTestId('history-button').click();
  const menu = page.getByTestId('history-menu');
  await expect(menu.getByTestId('history-unavailable')).toHaveAttribute('data-state', 'no-repo');
  expect(await postedOfType(page, 'historyList')).toEqual([]); // nothing to list
  await menu.getByRole('button', { name: 'Initialize git' }).click();
  expect((await postedOfType(page, 'initGit')).map((m) => m.payload)).toEqual([{ requestId: 'r1' }]);
  await page.screenshot({ path: shotPath('m1-history-no-repo.png') });
  // The host initialised git: the open dropdown asks for the listing at once (no need to reopen it).
  await send(page, hostMessage('workspace', { state: workspaceState({ history: { state: 'ready' } }) }));
  await expect.poll(async () => (await postedOfType(page, 'historyList')).map((m) => m.payload)).toEqual([{ subject: 'Spyro', limit: 50 }]);
  await expect(menu.getByTestId('history-storage')).toHaveText('This subject: 0 B · All subjects: 0 B');
  await expect(menu).toContainText('No snapshots of Spyro yet.');
  await page.keyboard.press('Escape');

  for (const [state, text] of [
    [{ state: 'git-missing' }, 'git is not installed'],
    [{ state: 'disabled' }, 'switched off'],
    [{ state: 'error', detail: 'refs/telelean is locked' }, 'History is unavailable: refs/telelean is locked'],
  ] as const) {
    await send(page, hostMessage('workspace', { state: workspaceState({ history: state }) }));
    await page.getByTestId('history-button').click();
    await expect(page.getByTestId('history-menu').getByTestId('history-unavailable')).toContainText(text);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('history-menu')).toHaveCount(0);
  }
});

test('AT6.14 the Lean badge covers every state and refreshes on click; problems open in the editor; banners', async ({ page }) => {
  const graph = statusGallery();
  board = await openBoard(page, graph, 'dark');
  const badge = page.getByTestId('lean-badge');
  await expect(badge).toHaveText('Lean: up to date');
  await badge.click();
  expect((await postedOfType(page, 'refresh')).map((m) => m.payload)).toEqual([{}]);

  const states: Array<[SemanticSummary, string]> = [
    [{ state: 'unavailable' }, 'Lean: not checked yet'],
    [{ state: 'checking' }, 'Lean: checking…'],
    [{ state: 'stale', staleFiles: ['Model/Spyro/Main.lean'] }, 'Lean: files changed'],
    [{ state: 'failed', errorCount: 3 }, 'Lean: 3 errors'],
    [{ state: 'paused-low-memory', detail: '1.4 GB available' }, 'Lean paused: low memory'],
    [{ state: 'unsupported-toolchain', toolchain: 'leanprover/lean4:v4.20.0' }, 'Lean: syntactic mode'],
    [{ state: 'disabled', detail: 'sandbox unavailable: bwrap is missing' }, 'Lean: off'],
    [{ state: 'fresh' }, 'Lean: up to date'],
  ];
  let version = 100;
  for (const [semantic, text] of states) {
    await send(page, hostMessage('graph', { graph: withSemantic(graph, semantic, version++) }));
    await expect(badge).toHaveText(text);
    await expect(badge).toHaveAttribute('data-state', semantic.state);
    if (semantic.state === 'unsupported-toolchain') {
      await expect(page.getByTestId('lean-banner')).toContainText('Syntactic mode.');
      await expect(page.getByTestId('lean-banner')).toContainText('leanprover/lean4:v4.20.0');
      await page.screenshot({ path: shotPath('m1-syntactic-banner.png') });
    } else if (semantic.state === 'disabled') {
      await expect(page.getByTestId('lean-banner')).toContainText('Lean checking is off. sandbox unavailable: bwrap is missing');
      await expect(badge).toHaveAttribute('title', /sandbox unavailable: bwrap is missing/);
    } else {
      await expect(page.getByTestId('lean-banner')).toHaveCount(0);
    }
    if (semantic.state === 'paused-low-memory') await expect(badge).toHaveAttribute('title', /1\.4 GB available/);
  }

  // The problems list: every diagnostic; file items open in the editor, node items reveal their card.
  await page.getByTestId('problems-button').click();
  const problems = page.getByTestId('problems-menu').getByTestId('problem');
  await expect(problems).toHaveCount(4);
  await expect(problems.first()).toContainText('TL115 declaration uses sorry');
  await page.screenshot({ path: shotPath('m1-problems.png') });
  await problems.first().getByTestId('problem-open').click();
  expect((await postedOfType(page, 'openInEditor')).map((m) => m.payload)).toEqual([
    { file: 'Model/Spyro/Main.lean', range: { start: { line: 60, character: 0 }, end: { line: 60, character: 0 } } },
  ]);
  await page.getByTestId('problems-button').click();
  await page.getByTestId('problems-menu').getByTestId('problem').nth(3).getByRole('button', { name: 'Show card' }).click();
  await expect(card(page, 'a-missing')).toHaveAttribute('data-highlight', 'true');
});
