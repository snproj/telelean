/**
 * M1 edits from the board: the A|P box with stance, why and source (AT6.5; spec v4 BD-8), in-place edits (AT6.6), the
 * delete dialog (AT6.7), Undo/Redo keys and the Undo toast (AT6.10), and the question's presuppositions in the Context
 * Menu section, which replaced the tray (AT6.11; CM-5, D-3b).
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, spyroProvedGraph } from '@telelean/core';
import { mentionGraph, workspaceState } from '../shared/graphs';
import { card, clickArrow, list, openBoard, posted, postedOfType, replyNext, send, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** Dispatches a paste of `text` into the focused field (a real ClipboardEvent with a DataTransfer). */
async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await settle(page);
}

test('AT6.5 the A|P box: stance chips for an axiom, a why prompt per stance and kind, source chips; Enter posts addNode', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  const why = page.getByRole('textbox', { name: 'Why (optional)' });
  const stance = page.getByRole('group', { name: 'Stance' });
  const source = page.getByRole('group', { name: 'Source' });
  await expect(stance.getByRole('button')).toHaveText(['I believe it', "It's a rule or definition", 'Supposing, for argument']);
  await expect(source.getByRole('button')).toHaveText(['observed', 'reported', 'inferred', 'common knowledge']);
  await expect(why).toHaveAttribute('placeholder', 'Why do you believe it?');
  await stance.getByRole('button', { name: "It's a rule or definition" }).click();
  await expect(why).toHaveAttribute('placeholder', 'Where does the rule come from?');
  await stance.getByRole('button', { name: 'Supposing, for argument' }).click();
  await expect(why).toHaveAttribute('placeholder', 'What are you exploring?');
  // A proposition has no stance; spec v4 CF-2: both kinds have a source.
  await page.getByRole('radio', { name: 'Proposition' }).click();
  await expect(stance).toHaveCount(0);
  await expect(why).toHaveAttribute('placeholder', 'Why do you think it follows?');
  await expect(source.getByRole('button')).toHaveText(['observed', 'reported', 'inferred', 'common knowledge']);
  await page.getByRole('radio', { name: 'Axiom' }).click();

  // A sentence with inner spaces is kept verbatim (trimmed only); pasted line breaks become spaces.
  const input = page.getByRole('textbox', { name: 'New axiom' });
  await input.fill('  Spyro is   purple ');
  await input.press('End');
  await paste(page, '\nand\r\nbrave');
  await expect(input).toHaveValue('  Spyro is   purple  and brave');
  await stance.getByRole('button', { name: 'I believe it' }).click();
  await source.getByRole('button', { name: 'observed' }).click();
  await expect(source.getByRole('button', { name: 'observed' })).toHaveAttribute('aria-pressed', 'true');
  await why.fill('seen it in the game');
  await page.screenshot({ path: shotPath('m1-prompt-box.png') });
  // The host derives the final id itself (here a different one) and names it in the actionResult.
  await replyNext(page, 'addNode', { ok: true, label: 'Add axiom: Spyro is purple and brave', undoable: true, nodeId: 'spyro-is-purple' });
  await why.press('Enter');

  expect((await postedOfType(page, 'addNode')).map((m) => m.payload)).toEqual([
    {
      clientId: 'spyro-is-purple-and-brave',
      type: 'AXIOM',
      naturalName: 'Spyro is   purple  and brave',
      requestId: 'r1',
      rationale: 'seen it in the game',
      stance: 'believe',
      source: 'observed',
    },
  ]);
  // The optimistic card is there (provisional until the host's graph arrives); the box is reset.
  const added = card(page, 'spyro-is-purple-and-brave');
  await expect(added).toHaveAttribute('data-provisional', 'true');
  await expect(added.locator('.tl-card__because')).toHaveText('because: seen it in the game');
  await expect(input).toHaveValue('');
  await expect(why).toHaveValue('');
  await expect(stance.getByRole('button', { name: 'I believe it' })).toHaveAttribute('aria-pressed', 'false');

  // Enter in the sentence field posts too; without a stance or source nothing extra is sent (a proposition goes with
  // its place on the canvas, BD-8: here right of the card selected last).
  await page.getByRole('radio', { name: 'Proposition' }).click();
  await page.getByRole('textbox', { name: 'New proposition' }).fill('Cynder gets a spin-off');
  await page.getByRole('textbox', { name: 'New proposition' }).press('Enter');
  const proposition = (await postedOfType(page, 'addNode')).at(-1)?.payload;
  expect(proposition).toMatchObject({ clientId: 'cynder-gets-a-spin-off', type: 'PROPOSITION', naturalName: 'Cynder gets a spin-off', requestId: 'r2' });
  expect(Object.keys(proposition ?? {}).sort()).toEqual(['clientId', 'naturalName', 'position', 'requestId', 'type']);

  // The host's graph replaces the provisional card (under the id the host named) and keeps it selected.
  await added.click();
  const host = spyroGraph(9);
  const real = { ...host.nodes[1], id: 'spyro-is-purple', naturalName: 'Spyro is   purple  and brave', rationale: 'seen it in the game' } as (typeof host.nodes)[number];
  await send(page, hostMessage('graph', { graph: { ...host, nodes: [...host.nodes, real] } }));
  await expect(card(page, 'spyro-is-purple')).toHaveAttribute('data-selected', 'true');
  await expect(card(page, 'spyro-is-purple-and-brave')).toHaveCount(0);
});

test('AT6.6 in-place edits of the sentence, the reason, the stance and the source post editNode; Escape cancels', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();

  // Sentence: Edit, type, Enter.
  await dark.getByRole('button', { name: 'Edit', exact: true }).click();
  const sentence = dark.getByRole('textbox', { name: 'Edit the sentence' });
  await expect(sentence).toBeFocused();
  await expect(sentence).toHaveValue('Cynder is a character who has a dark past');
  await sentence.fill('Cynder has a very dark past ');
  await sentence.press('Enter');
  await expect(dark.locator('.tl-card__text')).toHaveText('Cynder has a very dark past');

  // Escape cancels (nothing posted, text unchanged); F2 on the focused card opens the editor too.
  await dark.focus();
  await page.keyboard.press('F2');
  await expect(sentence).toBeFocused();
  await sentence.fill('Something else entirely');
  await sentence.press('Escape');
  await expect(sentence).toHaveCount(0);
  await expect(dark.locator('.tl-card__text')).toHaveText('Cynder has a very dark past');

  // Reason: an empty reason removes it (posts null).
  await dark.getByRole('button', { name: 'Edit why' }).click();
  const reason = dark.getByRole('textbox', { name: 'Edit the reason' });
  await expect(reason).toHaveValue('familiar with gaming lore');
  await reason.fill('');
  await reason.press('Enter');
  await expect(dark.locator('.tl-card__because')).toHaveCount(0);
  await expect(dark.locator('[data-chip="no-rationale"]')).toHaveText('no reason yet');

  // The "no reason yet" chip opens the reason editor; Escape leaves it as it was.
  await dark.locator('[data-chip="no-rationale"]').click();
  await expect(reason).toBeFocused();
  await reason.press('Escape');

  // Stance and source chips toggle (choosing the active one again removes it).
  await dark.getByTestId('stance-chips').getByRole('button', { name: 'Supposing, for argument' }).click();
  await dark.getByTestId('source-chips').getByRole('button', { name: 'common knowledge' }).click(); // was "common": removes it
  await dark.getByTestId('source-chips').getByRole('button', { name: 'reported' }).click();

  expect((await postedOfType(page, 'editNode')).map((m) => m.payload)).toEqual([
    { id: 'cynder-dark-past', field: 'naturalName', value: 'Cynder has a very dark past', requestId: 'r1' },
    { id: 'cynder-dark-past', field: 'rationale', value: null, requestId: 'r2' },
    { id: 'cynder-dark-past', field: 'stance', value: 'supposing', requestId: 'r3' },
    { id: 'cynder-dark-past', field: 'source', value: null, requestId: 'r4' },
    { id: 'cynder-dark-past', field: 'source', value: 'reported', requestId: 'r5' },
  ]);
  expect(await postedOfType(page, 'select')).toEqual([]); // editing never selects the card
});

test('AT6.7 the delete dialog lists premise dependents, proof dependents and statement mentions, and posts deleteNode', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await dark.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByTestId('dialog-delete');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('delete-declared')).toContainText('Cynder would not be a good addition to the new Spyro game');
  await expect(dialog.getByTestId('delete-proofs')).toContainText('Cynder would not be a good addition to the new Spyro game');
  await expect(dialog.getByTestId('delete-mentions')).toHaveCount(0);
  await expect(dialog).toContainText('hidden assumption');
  await page.screenshot({ path: shotPath('m1-delete-dialog.png') });
  // Cancel posts nothing; Escape too.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await dark.focus();
  await page.keyboard.press('Delete'); // the keyboard route opens the same dialog
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'deleteNode')).toEqual([]);
  // Card only, keep Lean.
  await dark.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete card only, keep Lean' }).click();
  expect((await postedOfType(page, 'deleteNode')).map((m) => m.payload)).toEqual([{ id: 'cynder-dark-past', keepLean: true, requestId: 'r1' }]);
  await expect(dialog).toHaveCount(0);
});

test('AT6.7 statement mentions (lean-ref) are listed; Cancel has the focus, so Delete then Enter deletes nothing', async ({ page }) => {
  board = await openBoard(page, mentionGraph(), 'light');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await dark.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByTestId('dialog-delete');
  await expect(dialog.getByTestId('delete-mentions')).toContainText('Cynder would not be a good addition to the new Spyro game');
  await expect(dialog.getByTestId('delete-proofs')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'deleteNode')).toEqual([]);
  // The keyboard route too: Delete on the focused card, then Enter, deletes nothing.
  await dark.focus();
  await page.keyboard.press('Delete');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(dark).toBeFocused(); // the browser gives the focus back to the card
  expect(await postedOfType(page, 'deleteNode')).toEqual([]);
  await dark.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete card and its Lean code' }).click();
  expect((await postedOfType(page, 'deleteNode')).map((m) => m.payload)).toEqual([{ id: 'cynder-dark-past', keepLean: false, requestId: 'r1' }]);

  // A code-less card offers just "Delete card".
  await card(page, 'pg-no-dark-past').locator('.tl-card__chevron').click();
  await card(page, 'pg-no-dark-past').getByRole('button', { name: 'Delete' }).click();
  await expect(dialog.getByRole('button')).toHaveText(['Delete card', 'Cancel']);
});

test('AT6.7 when other declarations use its Lean code the host asks first: the dialog lists them; "Delete anyway" resends with confirmed', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  const dialog = page.getByTestId('dialog-delete');
  const refusal = (dependents: string[], dependentCards?: Record<string, { subject: string; type: 'PROPOSITION'; naturalName: string }>) => ({
    ok: false as const,
    code: 'needs-confirmation' as const,
    error: `Deleting its Lean code breaks ${dependents.length} declarations that use it: they stop compiling. Delete anyway, or keep its Lean.`,
    dependents,
    ...(dependentCards ? { dependentCards } : {}),
  });
  // The host's facts know a lemma without a card and another subject's card that use the axiom; the graph shows
  // only the goal. The host describes the cards among them (any subject).
  const otherGoal = { subject: 'Bayonetta', type: 'PROPOSITION' as const, naturalName: 'Bayonetta would be a good addition' };
  await replyNext(page, 'deleteNode', refusal(['cynder-not-good', 'other-goal', 'Spyro.helper_lemma'], { 'other-goal': otherGoal }));
  await dark.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete card and its Lean code' }).click();
  // The answer opens the dialog again with the host's list: cards by their sentence (another subject's with its
  // subject), the lemma by its Lean name.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Delete its Lean code too?');
  await expect(dialog.getByTestId('delete-breaks-explanation')).toHaveText('These 3 declarations use its Lean code. They stop compiling if the code is deleted:');
  await expect(dialog.getByTestId('delete-breaks').locator('li')).toHaveText([
    'PCynder would not be a good addition to the new Spyro game',
    'PBayonetta would be a good addition (subject Bayonetta)',
    'Spyro.helper_lemma',
  ]);
  await expect(dialog.getByTestId('delete-breaks').locator('code')).toHaveText(['Spyro.helper_lemma']);
  await expect(dialog.locator('[data-dependent="other-goal"] .tl-glyph')).toHaveAttribute('data-kind', 'PROPOSITION');
  await expect(dialog.locator('[data-dependent="other-goal"]')).toHaveAttribute('data-subject', 'Bayonetta');
  await expect(dialog.getByRole('button')).toHaveText(['Delete anyway', 'Delete card only, keep Lean', 'Cancel']);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(page.getByTestId('toast')).toHaveCount(0); // a question, not an error
  await page.screenshot({ path: shotPath('m1-delete-needs-confirmation.png') });
  await dialog.getByRole('button', { name: 'Delete anyway' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await postedOfType(page, 'deleteNode')).map((m) => m.payload)).toEqual([
    { id: 'cynder-dark-past', keepLean: false, requestId: 'r1' },
    { id: 'cynder-dark-past', keepLean: false, confirmed: true, requestId: 'r2' },
  ]);
  await settle(page);
  await expect(page.getByTestId('toast')).toHaveCount(0);

  // Asked again: Enter is Cancel (nothing is posted), and "card only" deletes the card and keeps the Lean.
  await replyNext(page, 'deleteNode', refusal(['Spyro.helper_lemma']));
  await dark.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete card and its Lean code' }).click();
  await expect(dialog.getByTestId('delete-breaks-explanation')).toHaveText('This declaration uses its Lean code. It stops compiling if the code is deleted:');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'deleteNode')).toHaveLength(3);
  await replyNext(page, 'deleteNode', refusal(['Spyro.helper_lemma']));
  await dark.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete card and its Lean code' }).click();
  await expect(dialog.getByTestId('delete-breaks')).toBeVisible(); // the second question (the first one has this button too)
  await dialog.getByRole('button', { name: 'Delete card only, keep Lean' }).click();
  expect((await postedOfType(page, 'deleteNode')).slice(3).map((m) => m.payload)).toEqual([
    { id: 'cynder-dark-past', keepLean: false, requestId: 'r4' },
    { id: 'cynder-dark-past', keepLean: true, requestId: 'r5' },
  ]);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('AT6.10 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y post undo/redo, but not while typing; an undoable notice shows Undo', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState({ redo: 'Delete: x' }) });
  await card(page, 'cynder-dark-past').click(); // the board has focus
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  const kinds = async () => (await posted(page)).filter((m) => m.type === 'undo' || m.type === 'redo').map((m) => [m.type, 'requestId' in m.payload ? m.payload.requestId : null]);
  expect(await kinds()).toEqual([
    ['undo', 'r1'],
    ['redo', 'r2'],
    ['redo', 'r3'],
  ]);
  // Typing in a field: the field's own undo, not the board's.
  await page.getByRole('textbox', { name: 'New axiom' }).fill('abc');
  await page.getByRole('textbox', { name: 'New axiom' }).press('Control+z');
  await page.getByRole('textbox', { name: 'Why (optional)' }).press('Control+Shift+z');
  expect(await kinds()).toHaveLength(3);
  // The header buttons name what they undo and redo.
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo: Add assumption: Cynder is a character who has a dark past (Ctrl+Z)');
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await kinds()).at(-1)).toEqual(['redo', 'r4']);

  // An undoable notice (the host's Undo toast) shows Undo once the host's Undo is that action (the host posts the
  // notice, then the workspace state), and Undo posts undo.
  await send(page, hostMessage('notice', { id: 'n1', level: 'info', text: 'Deleted: The new Spyro game is PG', undoable: true }));
  const toast = page.getByTestId('toast').filter({ hasText: 'Deleted: The new Spyro game is PG' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Undo' })).toHaveCount(0); // the host's Undo is still the add
  await send(page, hostMessage('workspace', { state: workspaceState({ undo: 'Deleted: The new Spyro game is PG' }) }));
  await page.screenshot({ path: shotPath('m1-undo-toast.png') });
  await toast.getByRole('button', { name: 'Undo' }).click();
  expect((await kinds()).at(-1)).toEqual(['undo', 'r5']);
  await expect(toast).toHaveCount(0);
  // A plain notice has no Undo.
  await send(page, hostMessage('notice', { id: 'n2', level: 'warning', text: 'Lean is checking…', undoable: false }));
  await expect(page.getByTestId('toast').filter({ hasText: 'Lean is checking…' }).getByRole('button', { name: 'Undo' })).toHaveCount(0);

  // Two actions in a row: Undo undoes the latest one, so only the newer toast offers it; after an Undo none does.
  for (const [id, text] of [['n3', 'Add assumption: Toast test one'], ['n4', 'Add assumption: Toast test two']] as const) {
    await send(page, hostMessage('notice', { id, level: 'info', text, undoable: true }));
    await send(page, hostMessage('workspace', { state: workspaceState({ undo: text }) }));
  }
  const one = page.getByTestId('toast').filter({ hasText: 'Toast test one' });
  const two = page.getByTestId('toast').filter({ hasText: 'Toast test two' });
  await expect(one).toBeVisible();
  await expect(one.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(two.getByRole('button', { name: 'Undo' })).toHaveCount(1);
  await card(page, 'cynder-dark-past').click();
  await page.keyboard.press('Control+z');
  await expect(two.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(one.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

test('AT6.11 the Context Menu section shows what the question’s statements presuppose; Formalize posts the selected arrows; no "follows from nothing" for a card with arrows', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  // A proposition alone: its presuppositions on the summary's hover (D-3b; the tray's "+ presupposes" chips before v4).
  await card(page, 'cynder-not-good').click();
  const summary = page.getByTestId('context-summary');
  await expect(summary).toHaveAttribute('title', /\+ presupposes: assumes characters exist, assumes games exist$/);
  // It has arrows into it: "follows from nothing" is not offered (AR-5: only for a card with no incoming arrows).
  await expect(page.getByTestId('context-actions').locator('[data-action="from-nothing"]')).toHaveCount(0);

  // Two of its three arrows: the question; its cards' presuppositions on hover; Formalize asks about exactly those.
  await clickArrow(page, 'cynder-dark-past', 'cynder-not-good');
  await clickArrow(page, 'new-spyro-pg', 'cynder-not-good', true);
  await expect(summary).toHaveText('2 arrows into “Cynder would not be a good addition to …”');
  await expect(summary).toHaveAttribute('title', /\+ presupposes: assumes characters exist, assumes games exist$/);
  await page.screenshot({ path: shotPath('m1-context-presupposes.png') });
  await page.getByTestId('formalize').click();
  expect((await postedOfType(page, 'startRun')).map((m) => m.payload)).toEqual([
    { target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg'], requestId: 'r1' },
  ]);
  expect(await postedOfType(page, 'theseSuffice')).toEqual([]);
  // The presuppositions themselves are in the Vocabulary band, above the board (no longer inside the column). A
  // presupposition chip of the card (its details) opens the band and highlights it there, as the tray's chips did.
  const vocabulary = page.getByTestId('vocabulary');
  await expect(vocabulary).toHaveAttribute('data-collapsed', 'true');
  const goal = card(page, 'cynder-not-good');
  await goal.locator('.tl-card__chevron').click();
  await expect(goal.getByTestId('presuppositions').locator('.tl-presup')).toHaveText(['assumes characters exist', 'assumes games exist']);
  await goal.getByTestId('presuppositions').locator('.tl-presup').first().click();
  await expect(vocabulary).not.toHaveAttribute('data-collapsed', /.*/);
  await expect(page.getByTestId('vocabulary-column').locator('.tl-presup')).toHaveText(['assumes characters exist', 'assumes games exist']);
  await expect(page.getByTestId('vocabulary-column').locator('.tl-presup[data-vocab="Spyro.Character.exists"]')).toHaveAttribute('data-highlight', 'true');
  await expect(list(page, 'AXIOM').getByTestId('vocabulary')).toHaveCount(0);
});
