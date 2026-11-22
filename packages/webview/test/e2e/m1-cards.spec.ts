/**
 * M1 board content, on the spec v4 board: the Vocabulary and Definitions band above the board (AT6.2, BD-1), card
 * faces with every status chip (AT6.3, BD-6), the "uses:" line (AT6.17, the user's request 2), "Depends on / Used by"
 * and the legend (AT6.21, BD-9).
 */
import { expect, test } from '@playwright/test';
import { spyroGraph, spyroProvedGraph } from '@telelean/core';
import { statusGallery } from '../shared/graphs';
import { card, inView, list, openBoard, panToShow, postedOfType, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  // AT6.20: no console errors, page errors or CSP violations in any test.
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

test('AT6.2 the band above the board lists the 9 Spyro vocabulary items by kind, with presupposition chips, and stays collapsed across a reload', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  const band = page.getByTestId('vocabulary');
  // Spec v4 BD-1: it sits above the board (the AXIOMS column and the canvas), collapsed to one line with its counts.
  await expect(page.locator('.tl-board-area > *').first()).toHaveAttribute('data-testid', 'vocabulary');
  await expect(band).toHaveAttribute('data-collapsed', 'true');
  await expect(band.locator('.tl-vocab__toggle')).toContainText('Vocabulary9');
  await expect(band.locator('.tl-vocab__toggle')).toContainText('Definitions0');
  await expect(band.locator('[data-vocab]')).toHaveCount(0);

  await band.locator('.tl-vocab__toggle').click();
  await expect(band).not.toHaveAttribute('data-collapsed', /.*/);
  const vocabulary = page.getByTestId('vocabulary-column');
  await expect(vocabulary.locator('[data-vocab]')).toHaveCount(9);
  await expect(page.getByTestId('definitions-column')).toContainText('None yet.');
  const sections = await vocabulary.locator('.tl-vocab__section').evaluateAll((els) =>
    els.map((el) => [el.querySelector('.tl-vocab__heading')?.textContent, [...el.querySelectorAll('[data-vocab]')].map((i) => i.getAttribute('data-vocab'))]),
  );
  expect(sections).toEqual([
    ['Types', ['Spyro.Character', 'Spyro.Game']],
    ['Predicates & relations', ['Spyro.HasDarkPast', 'Spyro.IsPG', 'Spyro.GoodAddition']],
    ['Constants', ['Spyro.cynder', 'Spyro.newSpyro']],
    ['Presuppositions', ['Spyro.Character.exists', 'Spyro.Game.exists']],
  ]);
  // Box-shaped items: short name, type (mono), gloss (the user's wording: plain, no marker).
  const item = band.locator('.tl-vocab__item[data-vocab="Spyro.GoodAddition"]');
  await expect(item.locator('.tl-vocab__name')).toHaveText('GoodAddition');
  await expect(item.locator('.tl-vocab__type')).toHaveText('Spyro.Character → Spyro.Game → Prop');
  await expect(item.locator('.tl-vocab__gloss')).toHaveText('would be a good addition to');
  expect(await item.locator('.tl-vocab__type').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Mono');
  expect(await item.locator('.tl-vocab__gloss').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');
  await expect(band.locator('.tl-presup')).toHaveText(['assumes characters exist', 'assumes games exist']);
  // An item shows its code and who uses it.
  await item.locator('.tl-card__chevron').click();
  await expect(item.locator('pre')).toContainText('axiom GoodAddition : Character → Game → Prop');
  await expect(item.locator('.tl-rel__text')).toHaveText(['Cynder would not be a good addition to the new Spyro game']);
  await page.screenshot({ path: shotPath('m1-vocabulary-open.png') });

  // Collapsing is remembered in the webview state (setState), not in a model file: it survives a reload.
  await band.locator('.tl-vocab__toggle').click();
  await expect(band).toHaveAttribute('data-collapsed', 'true');
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await expect(page.getByTestId('vocabulary')).toHaveAttribute('data-collapsed', 'true');
  await page.getByTestId('vocabulary').locator('.tl-vocab__toggle').click();
  await page.reload();
  await expect(page.locator('[data-node-id]')).toHaveCount(4);
  await expect(page.getByTestId('vocabulary-column').locator('[data-vocab]')).toHaveCount(9);
  // No message about it went to the host: it is not a model edit.
  expect((await postedOfType(page, 'editNode')).length + (await postedOfType(page, 'reorder')).length).toBe(0);
});

test('AT6.3 cards show their glow, a chip per proof status and flag, the attention badge and the "declared before v4" chip', async ({ page }) => {
  const graph = statusGallery();
  board = await openBoard(page, graph, 'dark');
  const chip = (id: string, key: string) => card(page, id).locator(`[data-chip="${key}"]`);

  // The blue aura marks formalised cards; the established proposition glows green instead (BD-6).
  for (const id of ['cynder-dark-past', 'd-pending', 'g-sorry']) {
    expect(await card(page, id).evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(55, 148, 255)');
  }
  await expect(card(page, 'cynder-not-good')).toHaveAttribute('data-glow', 'established');
  expect(await card(page, 'cynder-not-good').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(115, 201, 145)'); // the proved green's fallback
  await expect(chip('cynder-dark-past', 'lean')).toHaveText('λ Lean');
  await expect(chip('cynder-dark-past', 'proof')).toHaveText('assumed');
  await expect(chip('cynder-not-good', 'established')).toHaveText('✓ established');
  await expect(chip('d-pending', 'pending')).toHaveText('pending proof');
  await expect(chip('d-conditional', 'conditional')).toHaveText('proved, given: Cynder is not PG material');
  await expect(chip('g-sorry', 'uses-sorry')).toHaveText('uses sorry');
  await expect(chip('a-missing', 'missing-holds')).toHaveText('missing .holds');
  await expect(chip('g-unchecked', 'not-checked')).toHaveText('not checked by Lean');
  await expect(card(page, 'g-unchecked')).not.toContainText('✓');
  await expect(chip('a-stale', 'stale')).toHaveText('changed since last check'); // "checking…" only while Lean checks
  await expect(chip('a-stale', 'proof')).toHaveAttribute('data-dim', 'true');
  // An axiom whose premises: line was written before v4 (A19): its arrows are not drawn, the chip says what to do.
  await expect(chip('a-premised', 'declared-before-v4')).toHaveText('declared before v4: make it a proposition, or drop these arrows');
  // Slice 2i (audit G11): the chip's tooltip names the card the undrawn arrow comes from.
  await expect(chip('a-premised', 'declared-before-v4')).toHaveAttribute('title', /\(1 arrow into it, from “Cynder is a character who has a dark past”\)/);
  await expect(page.locator('path[data-edge-id="cynder-dark-past->a-premised"]')).toHaveCount(0);
  await expect(page.locator('path[data-edge-id][data-target="a-premised"]')).toHaveCount(0);
  await expect(card(page, 'cynder-dark-past').locator('[data-chip="declared-before-v4"]')).toHaveCount(0);

  // One "needs attention" badge counting the node's errors and warnings (infos do not count).
  await expect(card(page, 'g-sorry').getByTestId('attention')).toHaveText('2');
  await expect(card(page, 'a-missing').getByTestId('attention')).toHaveText('1');
  await expect(card(page, 'cynder-dark-past').getByTestId('attention')).toHaveCount(0);
  // The badge opens the card, which lists the problems.
  await card(page, 'g-sorry').getByTestId('attention').click();
  await expect(card(page, 'g-sorry').getByTestId('card-problems').locator('.tl-problem')).toHaveCount(2);
  expect(await postedOfType(page, 'select')).toEqual([]);
  await page.screenshot({ path: shotPath('m1-status-gallery.png') });

  // The "declared before v4" card's details name the cards first, then offer its two ways out; "Drop these arrows"
  // removes them (one edit). No other card has that line.
  const premised = card(page, 'a-premised');
  await premised.locator('.tl-card__chevron').click();
  await expect(premised.getByTestId('declared-before-v4')).toHaveText('Declared before v4 (not drawn): arrows from “Cynder is a character who has a dark past”.');
  await expect(premised.getByTestId('legacy-make-proposition')).toHaveText('Make it a proposition (pending)');
  await premised.getByTestId('legacy-drop-arrows').click();
  expect((await postedOfType(page, 'removeArrows')).map((m) => m.payload)).toEqual([{ arrows: [{ source: 'cynder-dark-past', target: 'a-premised' }], requestId: 'r1' }]);
  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await expect(dark.getByTestId('arrow-actions')).toBeVisible();
  await expect(dark.getByTestId('declared-before-v4')).toHaveCount(0);
});

test('AT6.17 the "uses:" line truncates after two names and its dropdown lists all, highlighting the item (request 2)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark');
  const goal = card(page, 'cynder-not-good');
  await expect(goal.getByTestId('uses').locator('.tl-uses__text')).toHaveText('uses: GoodAddition, cynder, …');
  await expect(goal.locator('.tl-uses__toggle')).toHaveText('▾ 3');
  const dark = card(page, 'cynder-dark-past');
  await expect(dark.getByTestId('uses').locator('.tl-uses__text')).toHaveText('uses: HasDarkPast, cynder');
  await expect(dark.locator('.tl-uses__toggle')).toHaveText('▾ 2');
  await expect(card(page, 'pg-no-dark-past').getByTestId('uses')).toHaveCount(0); // no lean.uses: no line

  await goal.locator('.tl-uses__toggle').click();
  const menu = page.getByTestId('uses-menu');
  await expect(menu.locator('.tl-uses__entry')).toHaveCount(3);
  const rows = await menu.locator('.tl-uses__entry').evaluateAll((els) =>
    els.map((el) => [el.querySelector('.tl-uses__name')?.textContent, el.querySelector('.tl-uses__kind')?.textContent, el.querySelector('.tl-uses__gloss')?.textContent]),
  );
  expect(rows).toEqual([
    ['GoodAddition', 'predicate', 'would be a good addition to'],
    ['cynder', 'constant', 'Cynder'],
    ['newSpyro', 'constant', 'the new Spyro game'],
  ]);
  // Clicking an entry closes the menu, opens the Vocabulary band, scrolls the item into view and flashes it.
  await menu.locator('[data-vocab="Spyro.newSpyro"]').click();
  await expect(menu).toHaveCount(0);
  const item = page.locator('.tl-vocab__item[data-vocab="Spyro.newSpyro"]');
  await expect(item).toHaveAttribute('data-highlight', 'true');
  expect(await inView(page, '.tl-vocab__item[data-vocab="Spyro.newSpyro"]')).toBe(true);
  await expect(item).not.toHaveAttribute('data-highlight', /.*/, { timeout: 4000 }); // ~2 s flash
  expect(await postedOfType(page, 'select')).toEqual([]); // the card was not selected by any of this

  // Escape closes the menu too.
  await dark.locator('.tl-uses__toggle').click();
  await expect(page.getByTestId('uses-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('uses-menu')).toHaveCount(0);
});

test('AT6.21 Depends on / Used by in the expanded cards (proved Spyro), each entry reveals its card; the legend', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  board = await openBoard(page, spyroProvedGraph(), 'dark');
  const goal = card(page, 'cynder-not-good');
  await goal.locator('.tl-card__chevron').click();
  await expect(goal.getByTestId('depends-on').locator('.tl-rel__text')).toHaveText([
    'PG games cannot have characters with dark pasts',
    'Cynder is a character who has a dark past',
    'The new Spyro game is PG',
  ]);
  await expect(goal.getByTestId('depends-on').locator('.tl-rel__why').first()).toHaveText('declared, used by the proof');
  await expect(goal.getByTestId('used-by')).toContainText('Nothing uses it yet.');
  // The footprint: the three axioms and the two presuppositions (not repeated as the statement's own).
  await expect(goal.getByTestId('footprint').locator('.tl-presup')).toHaveText(['assumes characters exist', 'assumes games exist']);
  await expect(goal.getByTestId('presuppositions')).toHaveCount(0);
  await expect(card(page, 'cynder-dark-past').getByTestId('presuppositions')).toHaveCount(0); // not expanded yet

  const dark = card(page, 'cynder-dark-past');
  await dark.locator('.tl-card__chevron').click();
  await expect(dark.getByTestId('presuppositions').locator('.tl-presup')).toHaveText(['assumes characters exist']); // an axiom: no footprint
  await expect(dark.getByTestId('used-by').locator('.tl-rel__text')).toHaveText(['Cynder would not be a good addition to the new Spyro game']);
  await expect(dark.getByTestId('depends-on')).toContainText('Nothing');

  // Each entry reveals and flashes its card: scrolling the AXIOMS column to an axiom, panning the canvas to a proposition.
  await list(page, 'AXIOM').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await settle(page);
  const entry = goal.getByTestId('depends-on').locator('.tl-rel[data-rel-id="pg-no-dark-past"]');
  await panToShow(page, entry);
  await entry.click();
  await expect(card(page, 'pg-no-dark-past')).toHaveAttribute('data-highlight', 'true');
  await expect.poll(() => inView(page, '[data-node-id="pg-no-dark-past"]')).toBe(true);
  await dark.getByTestId('used-by').locator('.tl-rel').scrollIntoViewIfNeeded();
  await dark.getByTestId('used-by').locator('.tl-rel').click();
  await expect(card(page, 'cynder-not-good')).toHaveAttribute('data-highlight', 'true');
  expect(await postedOfType(page, 'select')).toEqual([]);

  // The legend (BD-9): declared, verified, conditional and mismatch arrows, the two glows, the band, pending proof.
  const legend = page.locator('.tl-legend');
  expect(await legend.locator('[data-legend]').evaluateAll((els) => els.map((el) => el.getAttribute('data-legend')))).toEqual([
    'declared',
    'verified',
    'conditional',
    'mismatch',
    'formalised',
    'established',
    'band',
    'pending',
  ]);
  for (const label of ['declared', 'verified by Lean', 'conditional', 'mismatch', 'formalised', 'established', 'these suffice together', 'pending proof']) {
    await expect(legend).toContainText(label);
  }
  expect(await legend.locator('.tl-legend__line--declared').evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe('none');
  expect(await legend.locator('.tl-legend__line--verified').first().evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe('none');
  expect(await legend.locator('.tl-legend__head--hollow').evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(31, 31, 31)');
  expect(await legend.locator('.tl-legend__line--mismatch').evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(204, 167, 0)');
  await expect(legend.locator('.tl-legend__head--mismatch')).toHaveCount(1); // the notched head: never colour alone
  await expect(legend.locator('.tl-legend__aura')).toHaveText('λ');
  await expect(legend.locator('.tl-legend__glow')).toHaveText('✓');
  await expect(legend.locator('.tl-legend__pending')).toHaveText('⧗');
  await page.screenshot({ path: shotPath('m1-depends-used-by.png') });
});
