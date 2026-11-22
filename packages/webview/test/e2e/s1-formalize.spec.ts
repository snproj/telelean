/**
 * Spec v4.1 slice 1e: the Context Menu section (CM-1–CM-5, which replaced the tray) and Formalize for dependencies
 * (ES-2 with AP-9's one target, AR-8). The section reads "Select some items to see possible actions here." when nothing
 * is selected; otherwise it sums the selection up, offers the labelled "Formalize for dependencies" button (enabled for
 * arrows into propositions, or their ∅ marks; otherwise disabled, the reason on hover and beside it) and the other
 * actions as icons (a "…" menu on a narrow window). Formalize posts the selected arrows' sources (slice 2h: a
 * `formalize` with one inference per target, several at once, sources first); the right-click menu of a drawn arrow
 * offers it too. A source that is an unproved proposition is asked about first (AR-8): "Mark pending and continue"
 * (claimPending, then the start) or Cancel; without a Lean statement, Cancel only. A card the extension has not written
 * yet can be neither end of a selected arrow nor marked (fixer 1g). Slice 2h retired M2's report card, whose missing-
 * arrow hints (A10) the edit session's stage report carries now (s2-review, s2-board).
 */
import { expect, test, type Page } from '@playwright/test';
import { buildGraph, hostMessage, spyroGraph, type TlGraph } from '@telelean/core';
import { makeNode, workspaceState } from '../shared/graphs';
import { runView, TARGET } from '../shared/runs';
import { boardMenu, card, cardPoint, clickArrow, contextSection, drawArrow, menuItem, openBoard, postedOfType, rightClick, send, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

const GOAL_NAME = '“Cynder would not be a good addition to …”';
const SIDE = 'side-claim';

/** Spyro plus a proposition with one drawn arrow (from cynder-dark-past), so arrows can point into two cards. */
function twoTargetsGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } }, { premises: ['cynder-dark-past'] });
  return { ...buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, side], vocabulary: base.vocabulary, semantic: base.semantic }), positions: { [SIDE]: { x: 760, y: 60 } } };
}

/**
 * twoTargetsGraph with a cycle of drawn arrows written by hand in the files (TL015, as the host reports it): the goal
 * rests on `side-claim`, which rests on the goal.
 */
function cyclicGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } }, { premises: ['cynder-dark-past', TARGET] });
  const nodes = base.nodes.map((n) => (n.id === TARGET ? { ...n, premises: [...n.premises, SIDE] } : n));
  const message = 'This card is part of a premise cycle: a card cannot (indirectly) support itself.';
  const diagnostics = [TARGET, SIDE].map((nodeId) => ({ code: 'TL015', severity: 'warning' as const, message, nodeId }));
  return {
    ...buildGraph({ subject: 'Spyro', version, nodes: [...nodes, side], vocabulary: base.vocabulary, diagnostics, semantic: base.semantic }),
    positions: { [SIDE]: { x: 760, y: 60 } },
  };
}

/**
 * AR-8: the goal rests on an unproved proposition that has a Lean statement (`rating-claim`); `side-claim` rests on one
 * that has none (`bare-claim`, a comment-only card).
 */
function unprovedSourcesGraph(version = 1): TlGraph {
  const base = spyroGraph(version);
  const rating = makeNode('rating-claim', 'PROPOSITION', 'The new games are rated by an agency', { proof: { kind: 'none' } });
  const bare = makeNode('bare-claim', 'PROPOSITION', 'Dark characters scare young players', { formal: 'informal', proof: { kind: 'none' } }, { lean: { binding: 'none' } });
  const side = makeNode(SIDE, 'PROPOSITION', 'Spyro games avoid dark characters', { proof: { kind: 'none' } }, { premises: ['bare-claim'] });
  const nodes = base.nodes.map((n) => (n.id === TARGET ? { ...n, premises: ['cynder-dark-past', 'rating-claim'] } : n));
  return {
    ...buildGraph({ subject: 'Spyro', version, nodes: [...nodes, rating, bare, side], vocabulary: base.vocabulary, semantic: base.semantic }),
    positions: { 'rating-claim': { x: 360, y: 300 }, 'bare-claim': { x: 760, y: 300 }, [SIDE]: { x: 1160, y: 300 } },
  };
}

/** "Select incoming arrows" from the card's right-click menu (CM-2, CM-7). */
async function selectIncoming(page: Page, id: string) {
  await rightClick(page, await cardPoint(page, id));
  await menuItem(page, 'select-incoming').click();
  await expect(boardMenu(page)).toHaveCount(0);
  await settle(page);
}

/**
 * Formalize's reasons on the board (formalizeState): no arrow or mark selected, a run active (another subject's), a
 * start on its way, a cycle of arrows (slice 2h: several targets are one request now). Its fifth, a card the extension
 * has not written yet, never arises from the board's gestures: the next test shows why.
 */
test('the Context Menu section: empty text, the selection summed up, Formalize enabled (one target or several), or disabled with its reason (no arrow, a run active or starting, a cycle); a fixed height (CM-1–CM-5, AP-13)', async ({ page }) => {
  // The test answers the host's part itself (here: the start).
  board = await openBoard(page, twoTargetsGraph(), 'dark', { workspace: workspaceState(), autoReply: false });
  const section = contextSection(page);
  const formalize = page.getByTestId('formalize');
  const reason = page.getByTestId('formalize-reason');
  await expect(section.locator('.tl-context__label')).toHaveText('Context Menu');
  await expect(section).toHaveAttribute('data-empty', 'true');
  await expect(page.getByTestId('context-empty')).toHaveText('Select some items to see possible actions here.');
  const emptyHeight = (await section.boundingBox())?.height ?? 0;
  expect(emptyHeight).toBeGreaterThan(20);

  // A card alone is no question.
  await card(page, 'cynder-dark-past').click();
  await expect(page.getByTestId('context-summary')).toHaveText('“Cynder is a character who has a dark pa…”'); // cut near 40 characters
  await expect(formalize).toHaveText('Formalize for dependencies');
  await expect(formalize).toBeDisabled();
  await expect(reason).toHaveText("Select arrows, or a 'follows from nothing' mark.");
  await expect(formalize).toHaveAttribute('title', "Select arrows, or a 'follows from nothing' mark.");
  expect((await section.boundingBox())?.height).toBe(emptyHeight); // selecting never reflows the toolbar

  // The arrows into one proposition: enabled, the question on hover.
  await selectIncoming(page, TARGET);
  await expect(page.getByTestId('context-summary')).toHaveText(`3 arrows into ${GOAL_NAME}`);
  // Every arrow on hover, with what the question's statements presuppose (D-3b, the tray's "+ presupposes" before 1e).
  await expect(page.getByTestId('context-summary')).toHaveAttribute(
    'title',
    [
      `“Cynder is a character who has a dark pa…” → ${GOAL_NAME}`,
      `“The new Spyro game is PG” → ${GOAL_NAME}`,
      `“PG games cannot have characters with da…” → ${GOAL_NAME}`,
      '+ presupposes: assumes characters exist, assumes games exist',
    ].join('\n'),
  );
  await expect(formalize).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await expect(formalize).toHaveAttribute('title', `Ask Claude to formalise the 3 selected arrows and prove ${GOAL_NAME} from exactly their sources`);
  // Its Delete is an icon labelled with what it removes.
  await expect(page.getByTestId('context-actions').locator('[data-action="remove-selection"]')).toHaveAttribute('aria-label', 'Remove 3 arrows');
  await page.screenshot({ path: shotPath('s1-context-formalize.png') });

  // Arrows into two propositions: slice 2h asks for both in one request, one step each (§5.11).
  await clickArrow(page, 'cynder-dark-past', SIDE, true);
  await expect(page.getByTestId('context-summary')).toHaveText('4 arrows into 2 propositions');
  await expect(formalize).toBeEnabled();
  await expect(reason).toHaveCount(0);
  await expect(formalize).toHaveAttribute('title', 'Ask Claude to formalise the selected arrows and prove 2 targets, one step each, sources first');
  expect((await section.boundingBox())?.height).toBe(emptyHeight);

  // A run of the model folder is active (here another subject's): disabled, saying so.
  await clickArrow(page, 'cynder-dark-past', SIDE); // back to one target
  await expect(formalize).toBeEnabled();
  await send(page, hostMessage('run', { run: runView({ subject: 'Bayonetta', target: 'bayo-not-good', premises: [] }) }));
  await expect(formalize).toBeDisabled();
  await expect(reason).toHaveText('A run is active. Claude is already working on Bayonetta: wait for it to finish, or cancel it.');
  await send(page, hostMessage('run', { run: null }));
  await expect(formalize).toBeEnabled();
  expect(await postedOfType(page, 'formalize')).toEqual([]);

  // The start is on its way (the host has not answered yet): disabled, saying so; the host's answer ends that.
  await formalize.click();
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([{ inferences: [{ target: SIDE, premises: ['cynder-dark-past'] }], requestId: 'r1' }]);
  await expect(formalize).toBeDisabled();
  await expect(reason).toHaveText('A run is active. It is starting.');
  const declined = 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").';
  await send(page, hostMessage('actionResult', { requestId: 'r1', outcome: { ok: false, code: 'not-yet', error: declined } }));
  await expect(formalize).toBeEnabled();

  // A cycle of arrows in the files (a hand edit, TL015) through the question's target: disabled, naming the cycle
  // (AP-13); the longest reason does not reflow the section either.
  await send(page, hostMessage('graph', { graph: cyclicGraph(2) }));
  await expect(page.locator(`path[data-edge-id="${TARGET}->${SIDE}"]`)).toHaveCount(1);
  await clickArrow(page, 'cynder-dark-past', SIDE);
  await expect(page.getByTestId('context-summary')).toHaveText('1 arrow into “Spyro games avoid dark characters”');
  const cycle = 'This card is on a cycle of arrows (Spyro games avoid dark characters → Cynder would not be a good addition to … → Spyro games avoid dark characters): remove one arrow first.';
  await expect(formalize).toBeDisabled();
  await expect(reason).toHaveText(cycle);
  await expect(formalize).toHaveAttribute('title', cycle);
  expect((await section.boundingBox())?.height).toBe(emptyHeight);
  await page.screenshot({ path: shotPath('s1-context-cycle.png') });
  await formalize.click({ force: true });
  expect(await postedOfType(page, 'formalize')).toHaveLength(1);
});

test('a card the extension has not written yet is never part of a question: it has no handle, an arrow into it is refused, and "Follows from nothing" is off, each with the reason', async ({ page }) => {
  const waiting = 'Waiting for the extension to write this card.';
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await page.getByRole('radio', { name: 'Proposition' }).click();
  await page.getByRole('textbox', { name: 'New proposition' }).fill('Cynder gets a spin-off');
  await page.getByRole('textbox', { name: 'New proposition' }).press('Enter');
  const added = card(page, 'cynder-gets-a-spin-off');
  await expect(added).toHaveAttribute('data-provisional', 'true'); // until the host's graph has it
  await expect(added.locator(':scope > .tl-handle')).toHaveCount(0);
  await drawArrow(page, 'cynder-dark-past', 'cynder-gets-a-spin-off', async () => {
    await expect(added).toHaveAttribute('data-draw-target', 'refused');
    await expect(page.getByTestId('draw-hint').locator('.tl-draw-hint__text')).toHaveText(waiting);
  });
  expect(await postedOfType(page, 'addArrows')).toEqual([]);
  await rightClick(page, await cardPoint(page, 'cynder-gets-a-spin-off'));
  await expect(menuItem(page, 'from-nothing')).toBeDisabled();
  await expect(menuItem(page, 'from-nothing')).toHaveAttribute('title', waiting);
  await expect(menuItem(page, 'select-incoming')).toHaveCount(0); // no arrow into it to select
  await page.keyboard.press('Escape');
  await expect(boardMenu(page)).toHaveCount(0);
  expect(await postedOfType(page, 'setFromNothing')).toEqual([]);
});

test('one card selected: its actions as icons with their labels; several cards: listed, disabled, "Select one card for this action."; a narrow window puts the rest in "…"', async ({ page }) => {
  board = await openBoard(page, twoTargetsGraph(), 'light', { workspace: workspaceState() });
  const actions = page.getByTestId('context-actions');
  await card(page, TARGET).click();
  await expect(page.getByTestId('context-summary')).toHaveText(GOAL_NAME);
  await expect(actions.locator('button[data-action]')).toHaveCount(5);
  expect(await actions.locator('button[data-action]').evaluateAll((els) => els.map((el) => el.getAttribute('data-action')))).toEqual([
    'select-incoming',
    'mark-pending',
    'move-to-axioms',
    'show',
    'open',
  ]);
  await expect(actions.locator('[data-action="move-to-axioms"]')).toHaveAttribute('aria-label', 'Move to axioms');
  await expect(actions.locator('[data-action="move-to-axioms"]')).toBeEnabled();
  // An icon does what the right-click menu's entry does: Select incoming arrows.
  await actions.locator('[data-action="select-incoming"]').click();
  await expect(page.getByTestId('context-summary')).toHaveText(`3 arrows into ${GOAL_NAME}`);

  // Several cards: each of these acts on one card, so they are listed disabled, with the reason on hover (CM-3).
  await card(page, TARGET).click();
  await card(page, SIDE).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('context-summary')).toHaveText('2 cards');
  const move = actions.locator('[data-action="move-to-axioms"]');
  await expect(move).toBeDisabled();
  await expect(move).toHaveAttribute('title', 'Move to axioms: Select one card for this action.');

  // A narrow window: the icons that do not fit go into the "…" menu.
  await card(page, TARGET).click();
  await page.setViewportSize({ width: 560, height: 700 });
  await settle(page);
  const more = page.getByTestId('context-more');
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.getByTestId('context-more-menu');
  await expect(menu).toBeVisible();
  const inMenu = await menu.locator('[data-action]').evaluateAll((els) => els.map((el) => el.getAttribute('data-action')));
  const shown = await actions.locator('button[data-action]').evaluateAll((els) => els.map((el) => el.getAttribute('data-action')));
  expect([...shown, ...inMenu]).toEqual(['select-incoming', 'mark-pending', 'move-to-axioms', 'show', 'open']);
  expect(inMenu.length).toBeGreaterThan(0);
  await page.screenshot({ path: shotPath('s1-context-narrow.png') });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('Formalize posts `formalize` with the selected arrows’ sources; a drawn arrow’s right-click menu offers it on that arrow (CM-7)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState() });
  await selectIncoming(page, TARGET);
  await page.getByTestId('formalize').click();
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([
    { inferences: [{ target: TARGET, premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'] }], requestId: 'r1' },
  ]);
  expect(await postedOfType(page, 'theseSuffice')).toEqual([]);

  // The right-click on one arrow selects it (CM-7: it was not part of the selection) and offers Formalize first.
  await expect(page.getByTestId('formalize')).toBeEnabled(); // the host answered the start
  await page.keyboard.press('Escape'); // clears the selection
  const arrowPoint = await (async () => {
    const path = page.locator(`path[data-edge-id="new-spyro-pg->${TARGET}"]`);
    return path.evaluate((p) => {
      const el = p as SVGPathElement;
      const origin = el.ownerSVGElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const at = el.getPointAtLength(el.getTotalLength() * 0.3);
      return { x: origin.left + at.x, y: origin.top + at.y };
    });
  })();
  await rightClick(page, arrowPoint);
  const menu = boardMenu(page);
  await expect(menu).toHaveAttribute('aria-label', `Actions for the arrow from “The new Spyro game is PG” into ${GOAL_NAME}`);
  await expect(menu.getByRole('menuitem').first()).toHaveText('Formalize for dependencies');
  await expect(page.getByTestId('context-summary')).toHaveText(`1 arrow into ${GOAL_NAME}`);
  await menuItem(page, 'formalize').click();
  expect((await postedOfType(page, 'formalize')).at(-1)?.payload).toEqual({ inferences: [{ target: TARGET, premises: ['new-spyro-pg'] }], requestId: 'r2' });
});

test('AR-8: an unproved source with a Lean statement: "Mark pending and continue" marks it, then starts; Cancel sends nothing; without a statement, Cancel only', async ({ page }) => {
  board = await openBoard(page, unprovedSourcesGraph(), 'dark', { workspace: workspaceState() });
  await selectIncoming(page, TARGET);
  await expect(page.getByTestId('context-summary')).toHaveText(`2 arrows into ${GOAL_NAME}`);
  const formalize = page.getByTestId('formalize');
  await expect(formalize).toBeEnabled(); // an unproved source does not disable it: pressing it asks
  await formalize.click();
  const dialog = page.getByTestId('dialog-formalize');
  await expect(dialog.getByRole('heading')).toHaveText('Formalize for dependencies');
  await expect(dialog.getByTestId('formalize-question')).toHaveText('“The new games are rated by an agency” is not proved. Mark it pending (assumed until proved), or cancel?');
  await expect(dialog.getByTestId('formalize-cancel')).toBeFocused();
  await page.screenshot({ path: shotPath('s1-ar8-mark-pending.png') });
  await dialog.getByTestId('formalize-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'claimPending')).toEqual([]);
  expect(await postedOfType(page, 'formalize')).toEqual([]);

  // Again: mark it pending and continue. The mark is the user's own edit, sent first; the start follows its answer.
  await formalize.click();
  await dialog.getByTestId('formalize-mark-pending').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await postedOfType(page, 'formalize')).length).toBe(1);
  const sent = (await page.evaluate(() => window.__tlHarness.posted)).filter((m) => m.type === 'claimPending' || m.type === 'formalize').map((m) => m.type);
  expect(sent).toEqual(['claimPending', 'formalize']);
  expect((await postedOfType(page, 'claimPending')).map((m) => m.payload)).toEqual([{ id: 'rating-claim', requestId: 'r1' }]);
  expect((await postedOfType(page, 'formalize')).map((m) => m.payload)).toEqual([{ inferences: [{ target: TARGET, premises: ['cynder-dark-past', 'rating-claim'] }], requestId: 'r2' }]);

  // A source without a Lean statement must be formalised and proved first: Cancel only (AP-10).
  await selectIncoming(page, SIDE);
  await formalize.click();
  await expect(dialog.getByTestId('formalize-question')).toHaveText('“Dark characters scare young players” has no Lean statement and no proof yet: formalize and prove it first.');
  await expect(dialog.getByTestId('formalize-mark-pending')).toHaveCount(0);
  await expect(dialog.getByRole('button')).toHaveText(['Cancel']);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await postedOfType(page, 'formalize')).toHaveLength(1);
  // The cards themselves are not selected by any of this.
  await expect(card(page, 'rating-claim')).not.toHaveAttribute('data-selected', /.*/);
  await rightClick(page, await cardPoint(page, 'rating-claim'));
  await expect(boardMenu(page)).toBeVisible();
});
