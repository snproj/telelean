/**
 * End to end (integration, docs/m1-plan.md section 11): the real extension, runner workspace, core, Lean refresh
 * (runLean sandbox), git history and the real board webview, on a fresh COPY of mental_model/ that
 * scripts/smoke.mjs placed at $TELELEAN_E2E_ROOT (outside the window's workspace folder, so the other suites never
 * see it). Every board gesture goes through the webview UI as trusted input over the DevTools protocol (cdp.ts);
 * files are checked on disk, statuses in the graphs the host posts.
 *
 *   open the board -> the graph from the files, with Lean statuses -> "Initialize git" in the History dropdown ->
 *   add an axiom with stance and why in the A|P box -> edit a sentence (docstring mirror) -> "Move to axioms" on the
 *   goal (spec v4 AR-7: the D-11 impact text, the "why" dialog, axiom added, its arrows removed; Lean says assumed) ->
 *   Undo x3 restores the files
 *   byte-exactly, Redo x3 -> History lists the snapshots; revert to "Initial state" (byte-exact) and undo the revert
 *   -> "New subject…": a second subject in the picker -> the "uses:" line and its dropdown -> Copy writes the
 *   clipboard -> hovering an identifier shows its gloss, clicking it highlights the Vocabulary item -> a mouse drag
 *   inside the expanded Lean code selects text and never moves the card -> deleting a card with its Lean code while
 *   other declarations use it (a proposition card and a lemma without a card, saved in the editor): the host asks, the
 *   delete dialog lists them, "Delete anyway" deletes exactly what core plans, Undo restores the files byte-exactly.
 *
 * VS Code's own notification toasts sit over the board's bottom-right corner (the A|P box's Add button) and take
 * its clicks, so they are cleared first: the startup one about `--disable-extensions` once it has appeared, and any
 * other before each test.
 */
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as vscode from 'vscode';

import type { TlGraph, TlNode, WebviewToHostMessage, WorkspaceState } from '@telelean/core';
import type { Frame, Locator } from 'playwright-core';

import type { OpenBoardResult, TeleleanApi } from '../../src/api';
import { boardFrame, clearWorkbenchToasts, connectWorkbench, settleStartupToasts, type Workbench } from './cdp';
import { closeAllEditors, getApi, isRendered, nextBoardMessage, settleEditors, sleep, waitFor } from './helpers';

const LEAN_TIMEOUT_MS = 240_000;
const UI_TIMEOUT_MS = 30_000;
const E2E_ROOT = process.env.TELELEAN_E2E_ROOT;
const CDP_PORT = process.env.TELELEAN_CDP_PORT;

const FILES = {
  main: 'Model/Spyro/Main.lean',
  inbox: 'Model/Spyro/Inbox.lean',
  layout: '.telelean/subjects/Spyro/layout.json',
  library: 'Model.lean',
} as const;
type FileKey = keyof typeof FILES;
type Snapshot = Record<FileKey, string>;

function git(root: string, args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return { status: result.status, stdout: result.stdout ?? '' };
}

/** The text of one markup block (from its marker to its closing `-/`), by id. */
function blockOf(text: string, id: string): string {
  const match = new RegExp(`/-\\n@@ telelean v1\\nid: ${id}\\n[\\s\\S]*?-/`).exec(text);
  assert.ok(match, `no block "${id}" in:\n${text}`);
  return match[0];
}

suite('end to end on a copy of mental_model (real workspace, Lean, git, the board UI through CDP)', () => {
  let api: TeleleanApi;
  let root: string;
  let wb: Workbench | undefined;
  let latest: TlGraph | undefined;
  let latestState: WorkspaceState | undefined;
  let pristine: Snapshot;
  const subscriptions: vscode.Disposable[] = [];

  const read = (key: FileKey) => readFileSync(path.join(root, FILES[key]), 'utf8');
  const snapshot = (): Snapshot => ({ main: read('main'), inbox: read('inbox'), layout: read('layout'), library: read('library') });
  const node = (id: string): TlNode | undefined => (latest?.subject === 'Spyro' ? latest.nodes.find((n) => n.id === id) : undefined);
  const frame = (): Promise<Frame> => {
    assert.ok(wb, 'not connected to the test instance');
    return boardFrame(wb.page, 'e2e_model');
  };
  const card = async (id: string): Promise<Locator> => (await frame()).locator(`[data-node-id="${id}"]`);
  /** The header's Undo / Redo (the toasts have Undo buttons too). */
  const undoButton = async () => (await frame()).locator('button.tl-icon-button--toolbar[aria-label="Undo"]');
  const redoButton = async () => (await frame()).locator('button.tl-icon-button--toolbar[aria-label="Redo"]');
  /** Fresh Lean facts for the current files (summarize() reports `stale` while any file differs from the facts). */
  const fresh = () => latest?.subject === 'Spyro' && latest.semantic.state === 'fresh';
  const expand = async (id: string) => {
    const chevron = (await card(id)).locator('.tl-card__chevron');
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await (await card(id)).locator('.tl-details').waitFor({ timeout: UI_TIMEOUT_MS });
  };
  const waitFiles = async (expected: Partial<Snapshot>, label: string) => {
    await waitFor(() => Object.entries(expected).every(([key, text]) => read(key as FileKey) === text), UI_TIMEOUT_MS, label, 100);
  };

  suiteSetup(async function () {
    this.timeout(90_000); // connecting (at most 30 s) and VS Code's startup toast (at most 20 s + 10 s)
    assert.ok(E2E_ROOT && CDP_PORT, 'TELELEAN_E2E_ROOT and TELELEAN_CDP_PORT are set by scripts/smoke.mjs (run `npm run test:smoke`)');
    root = E2E_ROOT;
    assert.ok(existsSync(path.join(root, '.telelean', 'config.json')), `${root} is not a copy of mental_model/`);
    assert.ok(!existsSync(path.join(root, '.git')), 'the copy must start without a repository');
    pristine = snapshot();
    api = await getApi();
    assert.ok(api.testing, 'the test API (extension mode Test)');
    await api.testing.reset(); // one model board at a time in this suite
    await settleEditors();
    subscriptions.push(
      api.onDidPostToBoard((event) => {
        if (event.root !== root) return;
        if (event.message.type === 'graph') latest = event.message.payload.graph;
        if (event.message.type === 'workspace') latestState = event.message.payload.state;
      }),
    );
    wb = await connectWorkbench(CDP_PORT);
    const seen = await settleStartupToasts(wb.page);
    console.log(`      [e2e] VS Code's startup toast about --disable-extensions ${seen ? 'appeared and was cleared' : 'did not appear within 20 s'}`);
  });

  setup(async () => {
    if (wb) await clearWorkbenchToasts(wb.page);
  });

  suiteTeardown(async () => {
    for (const subscription of subscriptions) subscription.dispose();
    await wb?.browser.close().catch(() => undefined); // disconnects only (connectOverCDP)
    api?.testing?.answerPrompts({ initGit: undefined });
    await api?.testing?.reset();
    await closeAllEditors();
  });

  test('Open Board: the graph comes from the files, with Lean statuses', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 60_000);
    const rendered = nextBoardMessage(api, root, isRendered, 60_000, 'the "rendered" diagnostic');
    const result = await vscode.commands.executeCommand<OpenBoardResult>('telelean.openBoard', { root });
    assert.deepEqual(result, { root, asked: false });
    await rendered;
    await waitFor(fresh, LEAN_TIMEOUT_MS, `fresh Lean facts (now ${latest?.semantic.state}: ${latest?.semantic.detail ?? ''})`, 250);
    assert.ok(latest);
    assert.deepEqual(
      latest.nodes.map((n) => [n.id, n.type, n.status.formal, n.status.proof.kind]),
      [
        ['pg-no-dark-past', 'AXIOM', 'informal', 'none'],
        ['cynder-dark-past', 'AXIOM', 'formalized', 'assumed'],
        ['new-spyro-pg', 'AXIOM', 'formalized', 'assumed'],
        // The files say GOAL (spec v4 reads ASSUMPTION, DERIVATION and GOAL as aliases of the two kinds).
        ['cynder-not-good', 'PROPOSITION', 'formalized', 'none'],
      ],
    );
    assert.equal(node('pg-no-dark-past')?.stance, 'rule');
    assert.equal(latest.vocabulary.length, 9, JSON.stringify(latest.vocabulary.map((v) => v.name)));
    assert.deepEqual(latest.edges.filter((e) => e.type === 'premise').map((e) => e.id).sort(), [
      'premise:cynder-dark-past->cynder-not-good',
      'premise:new-spyro-pg->cynder-not-good',
      'premise:pg-no-dark-past->cynder-not-good',
    ]);

    // The same on screen: the four cards and their Lean status chips.
    const f = await frame();
    await waitFor(async () => (await f.locator('[data-chip="proof"]').count()) >= 3, UI_TIMEOUT_MS, 'the status chips');
    assert.deepEqual(await f.locator('[data-node-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id'))), [
      'pg-no-dark-past',
      'cynder-dark-past',
      'new-spyro-pg',
      'cynder-not-good',
    ]);
    assert.equal(await (await card('cynder-dark-past')).locator('[data-chip="proof"]').textContent(), 'assumed');
    assert.equal(await (await card('cynder-not-good')).locator('[data-chip="proof"]').textContent(), 'unproved');
    assert.equal(await (await card('pg-no-dark-past')).locator('[data-chip="lean"]').textContent(), 'no Lean yet');
    assert.equal(await (await card('pg-no-dark-past')).getAttribute('data-formal'), 'informal');
  });

  test('History dropdown: "Initialize git" creates the repository and starts the history', async function () {
    this.timeout(60_000);
    assert.ok(api.testing);
    api.testing.answerPrompts({ initGit: true }); // the modal question ("Initialize a git repository …?")
    const f = await frame();
    await f.getByTestId('history-button').click();
    await f.getByTestId('history-unavailable').getByRole('button', { name: 'Initialize git' }).click();
    await waitFor(() => latestState?.history.state === 'ready', UI_TIMEOUT_MS, `history ready (now ${JSON.stringify(latestState?.history)})`);
    api.testing.answerPrompts({ initGit: undefined });
    assert.ok(existsSync(path.join(root, '.git')));
    await wb?.page.keyboard.press('Escape');
    const refs = git(root, ['for-each-ref', '--format=%(refname)']).stdout.split('\n').filter(Boolean);
    assert.ok(refs.some((ref) => ref.endsWith('/subjects/Spyro')), `refs: ${refs.join(', ')}`);
  });

  test('the A|P box adds an axiom with stance and why: the block is written to the Inbox', async function () {
    this.timeout(60_000);
    const f = await frame();
    await f.getByRole('radio', { name: 'Axiom' }).click();
    await f.getByLabel('New axiom').fill('Cynder can breathe fire');
    await f.getByRole('group', { name: 'Stance' }).getByRole('button', { name: 'I believe it' }).click();
    await f.getByLabel('Why (optional)').fill('seen in the games');
    await f.getByRole('button', { name: 'Add axiom' }).click();
    await waitFor(() => read('inbox').includes('natural_name: Cynder can breathe fire'), UI_TIMEOUT_MS, 'the block in Inbox.lean');
    const block = blockOf(read('inbox'), 'cynder-can-breathe-fire');
    // Spec v4: telelean writes AXIOM or PROPOSITION whenever it writes a type: line.
    assert.match(block, /\ntype: AXIOM\nnatural_name: Cynder can breathe fire\n/);
    assert.match(block, /\nrationale: seen in the games\n/);
    assert.match(block, /\nstance: believe\n/);
    assert.match(block, /\nasserted: \d{4}-\d{2}-\d{2}\n/);
    assert.equal(read('main'), pristine.main);
    await waitFor(() => node('cynder-can-breathe-fire')?.stance === 'believe', UI_TIMEOUT_MS, 'the new card in the graph');
    await (await card('cynder-can-breathe-fire')).waitFor({ timeout: UI_TIMEOUT_MS });
    assert.equal(await (await card('cynder-can-breathe-fire')).getAttribute('data-provisional'), null);
  });

  test("editing a card's sentence rewrites natural_name and the docstring that mirrors it (D-9)", async function () {
    this.timeout(60_000);
    await expand('cynder-dark-past');
    const c = await card('cynder-dark-past');
    await c.locator('.tl-details__actions').getByRole('button', { name: 'Edit', exact: true }).click();
    const input = c.getByLabel('Edit the sentence');
    await input.fill('Cynder has a dark past');
    await input.press('Enter');
    await waitFor(() => read('main').includes('natural_name: Cynder has a dark past'), UI_TIMEOUT_MS, 'the new natural_name in Main.lean');
    const main = read('main');
    assert.match(main, /\/-- Cynder has a dark past -\/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\n/);
    assert.doesNotMatch(main, /Cynder is a character who has a dark past/);
    await waitFor(() => node('cynder-dark-past')?.naturalName === 'Cynder has a dark past', UI_TIMEOUT_MS, 'the edited card in the graph');
  });

  let beforeKindChange: Snapshot;
  test('"Move to axioms" on the goal: the D-11 impact, the "why" dialog, the axiom, its arrows removed; Lean then says assumed', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 60_000);
    beforeKindChange = snapshot();
    await expand('cynder-not-good');
    const make = (await card('cynder-not-good')).getByTestId('make-axiom');
    assert.equal(await make.textContent(), 'Move to axioms');
    assert.equal(
      await make.getAttribute('title'),
      // (a tooltip shows no markup: core's backtick spans arrive as plain text; spec v4 AR-7: the arrows it loses)
      'Move to axioms: adds axiom cynder_not_good.holds. Adds axiom cynder_not_good.holds : cynder_not_good after the statement, so proofs may use it. Its 3 incoming arrows are removed.',
    );
    // The same action from the goal's right-click menu (a right click without movement, CM-7): the canvas clips an
    // expanded card, so its details' button may be out of reach.
    await (await card('cynder-not-good')).locator('.tl-card__text').click({ button: 'right' });
    const menu = (await frame()).getByTestId('board-menu');
    await menu.waitFor({ timeout: UI_TIMEOUT_MS });
    await menu.locator('[data-action="move-to-axioms"]').click();
    const dialog = (await frame()).getByTestId('dialog-rationale');
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.match((await dialog.locator('.tl-dialog__detail').textContent()) ?? '', /Adds axiom cynder_not_good\.holds : cynder_not_good after the statement/);
    await dialog.getByLabel('Why do you hold it?').fill('too dark for a PG game');
    await dialog.getByTestId('rationale-confirm').click();
    await waitFor(() => /\naxiom cynder_not_good\.holds : cynder_not_good\n/.test(read('main')), UI_TIMEOUT_MS, 'the axiom in Main.lean');
    const block = blockOf(read('main'), 'cynder-not-good');
    assert.match(block, /\ntype: AXIOM\n/);
    assert.match(block, /\nrationale: too dark for a PG game\n/);
    assert.doesNotMatch(block, /\npremises:/, 'AR-7: its incoming arrows are removed');
    await waitFor(
      () => fresh() && node('cynder-not-good')?.type === 'AXIOM' && node('cynder-not-good')?.status.proof.kind === 'assumed',
      LEAN_TIMEOUT_MS,
      `cynder-not-good assumed after the refresh (now ${node('cynder-not-good')?.type} ${node('cynder-not-good')?.status.proof.kind}, ${latest?.semantic.state})`,
      250,
    );
    await waitFor(async () => (await (await card('cynder-not-good')).getAttribute('data-kind')) === 'AXIOM', UI_TIMEOUT_MS, 'the card in the AXIOMS column');
  });

  let afterRedo: Snapshot;
  test('Undo restores the files byte-exactly (three steps back to the copy as it was); Redo brings them back', async function () {
    this.timeout(90_000);
    const afterKindChange = snapshot();
    await (await undoButton()).click();
    await waitFiles(beforeKindChange, 'Undo of Move to axioms: the files as before it, byte for byte');
    await (await undoButton()).click();
    await waitFiles({ main: pristine.main }, 'Undo of the edit: Main.lean as in the copy');
    await (await undoButton()).click();
    await waitFiles(pristine, 'Undo of the add: every file as in the copy');
    for (let i = 0; i < 3; i++) {
      await (await redoButton()).click();
      await sleep(300);
    }
    await waitFiles(afterKindChange, 'Redo x3: the files as after Move to axioms');
    afterRedo = snapshot();
  });

  test('History lists the snapshots; "Revert to this" restores Initial state byte-exactly, and the revert can be undone', async function () {
    this.timeout(90_000);
    const f = await frame();
    await f.getByTestId('history-button').click();
    const entries = f.getByTestId('history-entry');
    await waitFor(async () => (await entries.count()) >= 8, UI_TIMEOUT_MS, 'the history entries');
    const lines = await entries.locator('.tl-history__line').allTextContents();
    for (const label of ['Initial state', 'Add axiom: Cynder can breathe fire', 'Edit sentence: Cynder has a dark past', 'Move to axioms: Cynder would not be a good addition', 'Undo: ', 'Redo: ']) {
      assert.ok(lines.some((line) => line.includes(label)), `no "${label}" entry in:\n${lines.join('\n')}`);
    }
    assert.match((await f.getByTestId('history-storage').textContent()) ?? '', /^This subject: .+ · All subjects: .+/);

    await entries.filter({ hasText: 'Initial state' }).last().getByRole('button', { name: 'Revert to this' }).click();
    const dialog = f.getByTestId('dialog-revert');
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    await dialog.getByRole('button', { name: 'Revert', exact: true }).click();
    await waitFiles({ main: pristine.main, inbox: pristine.inbox, layout: pristine.layout }, 'the revert: the subject as in the copy, byte for byte');

    await (await undoButton()).click();
    await waitFiles(afterRedo, 'Undo of the revert: the files as before it, byte for byte');

    // Only telelean's private refs: no branch commit, the index untouched.
    const refs = git(root, ['for-each-ref', '--format=%(refname)']).stdout.split('\n').filter(Boolean);
    assert.ok(refs.length > 0 && refs.every((ref) => ref.startsWith('refs/telelean/')), `refs: ${refs.join(', ')}`);
    assert.notEqual(git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).status, 0, 'no commit may land on a branch');
    assert.equal(git(root, ['ls-files']).stdout, '', 'the index must stay empty');
  });

  test('"New subject…" in the picker: a second subject appears there, and the board can switch back', async function () {
    this.timeout(60_000);
    const f = await frame();
    await f.getByTestId('subject-picker').click();
    const menu = f.getByTestId('subject-menu');
    await menu.getByRole('button', { name: /New subject/ }).click();
    await menu.getByLabel('New subject name').fill('Bayonetta');
    await menu.getByRole('button', { name: 'Create' }).click();
    await waitFor(() => latest?.subject === 'Bayonetta', UI_TIMEOUT_MS, 'the board on subject Bayonetta');
    assert.ok(existsSync(path.join(root, 'Model', 'Bayonetta', 'Main.lean')));
    assert.equal(read('library'), 'import Model.Spyro\nimport Model.Bayonetta\n');
    await waitFor(async () => (await f.getByTestId('subject-picker').getByTestId('subject').textContent()) === 'Bayonetta', UI_TIMEOUT_MS, 'the picker showing Bayonetta');

    await f.getByTestId('subject-picker').click();
    const items = f.getByTestId('subject-menu').locator('[data-subject]');
    assert.deepEqual(await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-subject'))), ['Bayonetta', 'Spyro']);
    await f.getByTestId('subject-menu').locator('[data-subject="Spyro"]').click();
    await waitFor(() => latest?.subject === 'Spyro', UI_TIMEOUT_MS, 'the board back on Spyro');
  });

  test('the card shows the "uses:" vocabulary from Lean, truncated inline, with the full list in its dropdown', async function () {
    this.timeout(LEAN_TIMEOUT_MS + 30_000);
    await waitFor(() => fresh() && (node('cynder-not-good')?.lean.uses?.length ?? 0) > 0, LEAN_TIMEOUT_MS, 'fresh facts with "uses"', 250);
    assert.deepEqual(node('cynder-dark-past')?.lean.uses, ['Spyro.HasDarkPast', 'Spyro.cynder']);
    assert.deepEqual(node('cynder-not-good')?.lean.uses, ['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    const dark = await card('cynder-dark-past');
    await waitFor(async () => (await dark.locator('.tl-uses__text').count()) > 0, UI_TIMEOUT_MS, 'the uses line');
    assert.equal(await dark.locator('.tl-uses__text').textContent(), 'uses: HasDarkPast, cynder');
    const goal = await card('cynder-not-good');
    assert.equal(await goal.locator('.tl-uses__text').textContent(), 'uses: GoodAddition, cynder, …');
    assert.equal(await goal.locator('.tl-uses__toggle').textContent(), '▾ 3');
    await goal.locator('.tl-uses__toggle').click();
    const menu = (await frame()).getByTestId('uses-menu');
    await menu.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.deepEqual(await menu.locator('[data-vocab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-vocab'))), ['Spyro.GoodAddition', 'Spyro.cynder', 'Spyro.newSpyro']);
    assert.match((await menu.locator('[data-vocab="Spyro.cynder"]').textContent()) ?? '', /Cynder/); // its gloss
    await wb?.page.keyboard.press('Escape');
  });

  test("the expanded card's Copy button puts exactly its Lean code on the clipboard", async function () {
    this.timeout(60_000);
    await expand('cynder-dark-past');
    const code = node('cynder-dark-past')?.lean.code;
    assert.ok(code && /abbrev cynder_dark_past : Prop := HasDarkPast cynder/.test(code), String(code));
    await vscode.env.clipboard.writeText('(the clipboard before Copy)');
    await (await card('cynder-dark-past')).getByRole('button', { name: 'Copy the Lean code' }).click();
    await waitFor(async () => (await vscode.env.clipboard.readText()) === code, UI_TIMEOUT_MS, 'the Lean code on the clipboard');
  });

  test('hovering an identifier in the expanded code shows its gloss; clicking it highlights it in the Vocabulary group (request 4)', async function () {
    this.timeout(60_000);
    assert.ok(wb);
    await expand('cynder-dark-past');
    const ref = (await card('cynder-dark-past')).locator('.tl-lean .tl-ref[data-ref="Spyro.HasDarkPast"]');
    await ref.scrollIntoViewIfNeeded();
    await ref.hover();
    const tip = (await frame()).getByTestId('ref-tooltip');
    await tip.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.match((await tip.textContent()) ?? '', /has a dark past/);
    await ref.click();
    const item = (await frame()).locator('.tl-vocab__item[data-vocab="Spyro.HasDarkPast"]');
    await waitFor(async () => (await item.getAttribute('data-highlight')) === 'true', UI_TIMEOUT_MS, 'the highlighted vocabulary item');
    assert.equal(node('cynder-dark-past')?.type, 'AXIOM'); // the click selected nothing and moved nothing
    await wb.page.mouse.move(0, 0);
  });

  test('a mouse drag inside the expanded Lean code selects text and never drags the card (request 1)', async function () {
    this.timeout(60_000);
    assert.ok(wb);
    await expand('cynder-dark-past');
    const f = await frame();
    const code = (await card('cynder-dark-past')).locator('.tl-lean');
    await code.scrollIntoViewIfNeeded();
    const box = await code.boundingBox();
    assert.ok(box && box.width > 20 && box.height > 10, JSON.stringify(box));
    const column = f.locator('.tl-col[data-kind="AXIOM"] [data-node-id]');
    const orderBefore = await column.evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id')));
    await f.evaluate('window.getSelection()?.removeAllRanges()'); // (a string: this file has no DOM typings)
    const sent: WebviewToHostMessage[] = [];
    const listening = api.onDidReceiveBoardEvent((event) => {
      if (event.root === root) sent.push(event.message);
    });
    try {
      await wb.page.mouse.move(box.x + 4, box.y + 6);
      await wb.page.mouse.down();
      await wb.page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
      await wb.page.mouse.move(box.x + box.width - 6, box.y + box.height - 4, { steps: 8 });
      assert.equal(await (await card('cynder-dark-past')).getAttribute('data-dragging'), null, 'the card is being dragged');
      await wb.page.mouse.up();
      await sleep(500);
    } finally {
      listening.dispose();
    }
    const selected = String(await f.evaluate("window.getSelection()?.toString() ?? ''"));
    assert.ok(selected.length > 0, 'no text was selected');
    assert.ok(node('cynder-dark-past')?.lean.code?.includes(selected), `the selection is not code text: ${JSON.stringify(selected)}`);
    const moves = sent.filter((m) => m.type === 'reorder' || m.type === 'kindChange');
    assert.deepEqual(moves, [], 'the drag posted a move');
    assert.deepEqual(await column.evaluateAll((els) => els.map((e) => e.getAttribute('data-node-id'))), orderBefore);
    assert.equal(node('cynder-dark-past')?.type, 'AXIOM');
    assert.equal(await f.locator('.tl-board').getAttribute('data-dragging'), null);
  });

  test('deleting a card with its Lean code while others use it: the dialog lists them, "Delete anyway" deletes what core plans, Undo restores it (D-18)', async function () {
    this.timeout(3 * LEAN_TIMEOUT_MS + 60_000);
    assert.ok(wb);
    // In the editor: a proposition card whose proof uses cynder_dark_past.holds, and a lemma without a card using it.
    const extra = [
      '',
      '/-',
      '@@ telelean v1',
      'id: dark-lemma',
      'type: PROPOSITION',
      "natural_name: Cynder's dark past is on record",
      'lean: Spyro.dark_lemma',
      '-/',
      'abbrev dark_lemma : Prop := HasDarkPast cynder',
      'theorem dark_lemma.holds : dark_lemma := cynder_dark_past.holds',
      '',
      'theorem helper_lemma : cynder_dark_past := cynder_dark_past.holds',
      '',
    ].join('\n');
    const doc = await vscode.workspace.openTextDocument(path.join(root, FILES.main));
    const text = doc.getText();
    assert.match(text, /\nend Spyro\n$/);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), text.replace(/\nend Spyro\n$/, `${extra}\nend Spyro\n`));
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.ok(await doc.save());
    const verified = (source: string, target: string) => latest?.edges.some((e) => e.type === 'verified' && e.source === source && e.target === target) === true;
    await waitFor(
      () => fresh() && node('dark-lemma')?.status.proof.kind === 'proved' && verified('cynder-dark-past', 'dark-lemma'),
      LEAN_TIMEOUT_MS,
      `dark-lemma proved from cynder-dark-past (now ${node('dark-lemma')?.status.proof.kind}, ${latest?.semantic.state})`,
      250,
    );
    const beforeDelete = snapshot();

    // The first question shows what the board knows (its arrows); the host's facts also know the lemma.
    await expand('cynder-dark-past');
    await (await card('cynder-dark-past')).locator('.tl-details__actions').getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = (await frame()).getByTestId('dialog-delete');
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.match((await dialog.getByTestId('delete-proofs').textContent()) ?? '', /Cynder's dark past is on record/);
    await dialog.getByRole('button', { name: 'Delete card and its Lean code' }).click();
    const breaks = dialog.getByTestId('delete-breaks');
    await breaks.waitFor({ timeout: UI_TIMEOUT_MS });
    assert.deepEqual(await breaks.locator('li').allTextContents(), ["PCynder's dark past is on record", 'Spyro.helper_lemma']);
    assert.deepEqual(await breaks.locator('code').allTextContents(), ['Spyro.helper_lemma']);
    assert.equal(await dialog.getByTestId('delete-breaks-explanation').textContent(), 'These 2 declarations use its Lean code. They stop compiling if the code is deleted:');
    assert.equal(await (await frame()).getByTestId('toast').filter({ hasText: 'stop compiling' }).count(), 0, 'the question is not an error toast');
    assert.equal(snapshot().main, beforeDelete.main, 'nothing is deleted before the answer');

    await dialog.getByRole('button', { name: 'Delete anyway' }).click();
    await waitFor(() => !read('main').includes('id: cynder-dark-past'), UI_TIMEOUT_MS, 'the delete in Main.lean', 100);
    // Exactly what core plans: the block, its docstring, abbrev and axiom go in one piece with the blank line after
    // them; the goal's premises (if it still has them) lose the id; the layout loses the card; the users stay (now
    // broken); nothing else. (Spec v4 AR-7: "Move to axioms" above removed the goal's premises: line with its arrows,
    // so after the earlier tests there is none; when they did not run, the line is there and loses the id.)
    const blockStart = beforeDelete.main.indexOf('/-\n@@ telelean v1\nid: cynder-dark-past\n');
    const axiomLine = 'axiom cynder_dark_past.holds : cynder_dark_past\n';
    const blockEnd = beforeDelete.main.indexOf(axiomLine, blockStart) + axiomLine.length;
    assert.ok(blockStart > 0 && blockEnd > blockStart && beforeDelete.main[blockEnd] === '\n', 'the block of cynder-dark-past, as written');
    const premises = 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n';
    const expectedMain = (beforeDelete.main.slice(0, blockStart) + beforeDelete.main.slice(blockEnd + 1)).replace(premises, 'premises: new-spyro-pg, pg-no-dark-past\n');
    // The layout loses the card wherever it lists it. (It does after the earlier tests' moves; built from the layout
    // as it was, the expectation also holds when they did not run, and then the layout must stay as it is.)
    type LayoutFile = { columns: Record<string, string[]> };
    const layoutBefore = JSON.parse(beforeDelete.layout) as LayoutFile;
    const expectedLayout: LayoutFile = { ...layoutBefore, columns: Object.fromEntries(Object.entries(layoutBefore.columns).map(([k, ids]) => [k, ids.filter((id) => id !== 'cynder-dark-past')])) };
    const layoutNow = (): unknown => {
      try {
        return JSON.parse(read('layout'));
      } catch {
        return undefined; // caught mid-write
      }
    };
    // The applier saves Main.lean first and layout.json a little later: wait for both before reading the files (on a
    // timeout the asserts below show the difference).
    await waitFor(() => read('main') === expectedMain && isDeepStrictEqual(layoutNow(), expectedLayout), UI_TIMEOUT_MS, 'Main.lean and layout.json as core plans the delete', 100).catch(() => undefined);
    const after = snapshot();
    assert.equal(after.main, expectedMain, 'Main.lean as core plans the delete');
    assert.ok(after.main.includes('theorem dark_lemma.holds : dark_lemma := cynder_dark_past.holds\n') && after.main.includes('theorem helper_lemma : cynder_dark_past := cynder_dark_past.holds\n'));
    assert.deepEqual(JSON.parse(after.layout), expectedLayout, 'layout.json without the card');
    assert.equal(after.inbox, beforeDelete.inbox);
    assert.equal(after.library, beforeDelete.library);
    assert.ok(!existsSync(path.join(root, '.telelean', 'subjects', 'Spyro', 'attic', 'cynder-dark-past.lean')), 'an axiom has no proof to archive');
    await waitFor(() => latest?.subject === 'Spyro' && !node('cynder-dark-past'), UI_TIMEOUT_MS, 'the card gone from the graph');
    await waitFor(async () => (await (await card('cynder-dark-past')).count()) === 0, UI_TIMEOUT_MS, 'the card gone from the board');

    await (await undoButton()).click();
    await waitFiles(beforeDelete, 'Undo of the delete: every file as before it, byte for byte');
    await waitFor(() => node('cynder-dark-past') !== undefined, UI_TIMEOUT_MS, 'the card back in the graph');
    await waitFor(
      () => fresh() && node('dark-lemma')?.status.proof.kind === 'proved',
      LEAN_TIMEOUT_MS,
      `fresh facts after the undo, dark-lemma proved again (now ${node('dark-lemma')?.status.proof.kind}, ${latest?.semantic.state})`,
      250,
    );
  });
});
