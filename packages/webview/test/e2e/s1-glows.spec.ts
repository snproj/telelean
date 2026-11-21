/**
 * Spec v4.1 glows and bands (slice 1d; BD-6, BD-7, BD-9): the green glow of an established card replaces the blue one
 * (a 2 px outline in high contrast), with its "✓ established" chip; a proved card that rests on a pending claim keeps
 * the blue glow and says why; the band binds the drawn arrows a checked proof uses, with its ✓ and "Together these
 * suffice" only when it is complete, and drawn open (dashed, no ✓) naming what lies outside it otherwise; a proof from
 * nothing puts its band on the ∅ stub; the Proposed view hides a band until the review reveals the result.
 */
import { expect, test, type Page } from '@playwright/test';
import { buildGraph, hostMessage, spyroGraph, spyroProvedGraph, type TlGraph } from '@telelean/core';
import { makeNode, mapNode, withStatus, workspaceState } from '../shared/graphs';
import { normativeProposal, reviewRun, TARGET, UPDATED } from '../shared/runs';
import { card, checkArrows, edgePairs, openBoard, send, settle, shotPath, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** A distinctive proved colour (telelean.proved) and its computed value. */
const PROVED = { '--vscode-telelean-proved': '#00c853' };
const PROVED_RGB = 'rgb(0, 200, 83)';
const AURA_RGB = 'rgb(55, 148, 255)'; // --vscode-charts-blue in the dark fixture

const band = (page: Page, id: string) => page.locator(`g.tl-band[data-band-for="${id}"]`);

/** The band's state as drawn: complete or open, its seal shown or not, its tooltip, its bar's dashes. */
async function bandOf(page: Page, id: string) {
  return band(page, id).evaluate((g) => ({
    complete: g.getAttribute('data-complete'),
    classes: g.getAttribute('class'),
    seal: g.querySelector('.tl-band__seal')?.getAttribute('display') !== 'none',
    check: g.querySelector('.tl-band__check')?.textContent ?? '',
    title: g.querySelector('title')?.textContent ?? '',
    dash: getComputedStyle(g.querySelector('.tl-band__bar') as Element).strokeDasharray,
    stroke: getComputedStyle(g.querySelector('.tl-band__bar') as Element).stroke,
  }));
}

/**
 * The proved Spyro board with the arrow from new-spyro-pg not drawn, as the host sends it: no declared edge from it, and
 * the proof's use of it is TL107 (used-undeclared: its verified edge in the warning colour, with the warning).
 */
function openBandGraph(version = 3): TlGraph {
  const base = spyroProvedGraph(version);
  const nodes = base.nodes.map((n) => (n.id === TARGET ? { ...n, premises: n.premises.filter((p) => p !== 'new-spyro-pg') } : n));
  const graph = buildGraph({
    subject: base.subject,
    version,
    nodes,
    vocabulary: base.vocabulary,
    diagnostics: [{ code: 'TL107', severity: 'warning', message: 'The proof uses "new-spyro-pg", but no arrow is drawn from it.', nodeId: TARGET }],
    semantic: base.semantic,
  });
  const undeclared = `verified:new-spyro-pg->${TARGET}`;
  if (!graph.edges.some((e) => e.id === undeclared)) throw new Error(`no ${undeclared} edge`);
  return { ...graph, edges: graph.edges.map((e) => (e.id === undeclared ? { ...e, mismatch: 'used-undeclared' as const } : e)) };
}

/** Where each arrow into `id` ends (client coordinates), by its source. */
async function arrowEnds(page: Page, id: string) {
  return page.locator(`path[data-edge-id][data-target="${id}"]`).evaluateAll((paths) =>
    paths.map((p) => {
      const path = p as SVGPathElement;
      const origin = path.ownerSVGElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const end = path.getPointAtLength(path.getTotalLength());
      return { source: path.dataset.source ?? '?', x: origin.left + end.x, y: origin.top + end.y };
    }),
  );
}

/** A proposition marked "follows from nothing" and proved from nothing (no card in its footprint). */
function fromNothingGraph(version = 4): TlGraph {
  const base = spyroProvedGraph(version);
  const arith = makeNode(
    'two-plus-two',
    'PROPOSITION',
    'Two plus two is four',
    { proof: { kind: 'proved', footprint: [] }, flags: ['established'], direct: { ids: [], from: 'proof' } },
    { fromNothing: true },
  );
  return { ...buildGraph({ subject: 'Spyro', version, nodes: [...base.nodes, arith], vocabulary: base.vocabulary, semantic: base.semantic }), positions: { 'two-plus-two': { x: 760, y: 40 } } };
}

test('the green glow replaces the blue one on an established card; a proved card resting on a pending claim keeps the blue one and says why (BD-6)', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark', { vars: PROVED });
  const goal = card(page, TARGET);
  await expect(goal).toHaveAttribute('data-glow', 'established');
  await expect(goal.locator('[data-chip="established"]')).toHaveText('✓ established');
  const glow = await goal.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(glow).toContain(PROVED_RGB);
  expect(glow).not.toContain(AURA_RGB);
  // The axioms keep the blue glow: axioms never glow green.
  for (const id of ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']) {
    await expect(card(page, id)).toHaveAttribute('data-glow', 'formalized');
    expect(await card(page, id).evaluate((el) => getComputedStyle(el).boxShadow)).toContain(AURA_RGB);
  }

  // new-spyro-pg becomes a pending proposition: the goal is proved but rests on pending, so the blue glow, and the chip.
  const pending = mapNode(
    mapNode(spyroProvedGraph(5), 'new-spyro-pg', (n) => withStatus({ ...n, type: 'PROPOSITION' }, { proof: { kind: 'pending' } })),
    TARGET,
    (n) => withStatus(n, { flags: ['rests-on-pending'] }),
  );
  await send(page, hostMessage('graph', { graph: pending }));
  await expect(goal).toHaveAttribute('data-glow', 'formalized');
  await expect(goal.locator('[data-chip="established"]')).toHaveCount(0);
  await expect(goal.locator('[data-chip="rests-on-pending"]')).toHaveText('proved, but rests on pending: The new Spyro game is PG');
  await expect(card(page, 'new-spyro-pg').locator('[data-chip="pending"]')).toHaveText('pending proof');
  expect(await goal.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(AURA_RGB);
  await page.screenshot({ path: shotPath('s1-glow-rests-on-pending.png') });

  // Out-of-date facts dim the blue glow, never the green one.
  const stale = mapNode(spyroProvedGraph(6), TARGET, (n) => withStatus(n, { flags: ['stale'] }));
  await send(page, hostMessage('graph', { graph: stale }));
  await expect(goal).toHaveAttribute('data-glow', 'formalized');
  await expect(goal).toHaveAttribute('data-glow-dim', 'true');
});

test('high contrast: the green glow is a 2 px outline in the proved colour, the band an outlined bracket with its ✓', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'hc', { vars: PROVED });
  const goal = card(page, TARGET);
  const style = await goal.evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` };
  });
  expect(style.shadow).toBe('none');
  expect(style.outline).toBe(`solid 2px ${PROVED_RGB}`);
  await expect(goal.locator('[data-chip="established"]')).toHaveText('✓ established');
  const drawn = await bandOf(page, TARGET);
  expect(drawn.complete).toBe('true');
  expect(drawn.check).toBe('✓');
  expect(await band(page, TARGET).locator('.tl-band__seal').evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(0, 0, 0)'); // outlined, not filled
  await page.screenshot({ path: shotPath('s1-glow-hc.png') });
});

test('a complete band binds the arrows the proof uses with its ✓; an open one (an arrow missing) is dashed, without ✓, and says what is outside it (BD-7)', async ({ page }) => {
  board = await openBoard(page, spyroProvedGraph(), 'dark', { vars: PROVED });
  await expect(band(page, TARGET)).toHaveCount(1);
  const complete = await bandOf(page, TARGET);
  expect(complete.complete).toBe('true');
  expect(complete.classes).toContain('tl-band--complete');
  expect(complete.seal).toBe(true);
  expect(complete.check).toBe('✓');
  expect(complete.title).toBe('Together these suffice (checked by Lean) · consistency unchecked\nalso presupposes: Character.exists, Game.exists');
  expect(complete.dash).toBe('none');
  expect(complete.stroke).toBe(PROVED_RGB);
  // The bracket sits just left of the card, across the three arrows' ends.
  const bracket = await band(page, TARGET).locator('.tl-band__bar').boundingBox();
  const face = await card(page, TARGET).boundingBox();
  if (!bracket || !face) throw new Error('no boxes');
  expect(face.x - (bracket.x + bracket.width)).toBeGreaterThanOrEqual(0);
  expect(face.x - (bracket.x + bracket.width)).toBeLessThan(20);
  const ends = (await arrowEnds(page, TARGET)).map((e) => e.y);
  expect(ends).toHaveLength(3);
  for (const y of ends) {
    expect(y).toBeGreaterThanOrEqual(bracket.y - 1);
    expect(y).toBeLessThanOrEqual(bracket.y + bracket.height + 1);
  }
  await page.screenshot({ path: shotPath('s1-band-complete.png') });

  // The arrow from new-spyro-pg is not drawn, but the proof uses it: the band is open, without ✓; the proof's use of it
  // is drawn in the warning colour (TL107), outside the band, whose bracket spans only the two drawn arrows.
  await send(page, hostMessage('graph', { graph: openBandGraph() }));
  await settle(page);
  const open = await bandOf(page, TARGET);
  expect(open.complete).toBe('false');
  expect(open.classes).toContain('tl-band--open');
  expect(open.seal).toBe(false);
  expect(open.title).toBe('Open band (no ✓): also uses “The new Spyro game is PG” (no arrow) · consistency unchecked\nalso presupposes: Character.exists, Game.exists');
  expect(open.dash).not.toBe('none');
  const undeclared = page.locator(`path[data-edge-id="new-spyro-pg->${TARGET}"]`);
  await expect(undeclared).toHaveAttribute('data-mismatch', 'used-undeclared');
  await expect(undeclared).toHaveClass(/tl-edge--mismatch/);
  const openBar = await band(page, TARGET).locator('.tl-band__bar').boundingBox();
  if (!openBar) throw new Error('no open band bar');
  const openEnds = await arrowEnds(page, TARGET);
  expect(openEnds.map((e) => e.source).sort()).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
  for (const end of openEnds) {
    const inside = end.y >= openBar.y - 0.5 && end.y <= openBar.y + openBar.height + 0.5;
    expect(inside, `${end.source}'s arrow ${inside ? 'inside' : 'outside'} the band (${end.y.toFixed(1)} vs ${openBar.y.toFixed(1)}..${(openBar.y + openBar.height).toFixed(1)})`).toBe(end.source !== 'new-spyro-pg');
  }
  await page.screenshot({ path: shotPath('s1-band-open.png') });

  // Facts out of date: no band at all.
  await send(page, hostMessage('graph', { graph: mapNode(spyroProvedGraph(7), TARGET, (n) => withStatus(n, { flags: ['stale'] })) }));
  await expect(band(page, TARGET)).toHaveCount(0);
});

test('a proof from nothing puts its band on the card’s ∅ stub', async ({ page }) => {
  board = await openBoard(page, fromNothingGraph(), 'dark', { vars: PROVED });
  await expect(page.locator('[data-mark-id="two-plus-two"]')).toHaveCount(1);
  const onMark = await bandOf(page, 'two-plus-two');
  expect(onMark.classes).toContain('tl-band--mark');
  expect(onMark.complete).toBe('true');
  expect(onMark.check).toBe('✓');
  expect(onMark.title).toBe('Together these suffice (checked by Lean) · consistency unchecked');
  await expect(card(page, 'two-plus-two')).toHaveAttribute('data-glow', 'established');
  // "proved from nothing" is the band's to say here, not a chip (the card is marked).
  await expect(card(page, 'two-plus-two').locator('[data-chip="self-evident"]')).toHaveCount(0);
  await page.screenshot({ path: shotPath('s1-band-on-mark.png') });
});

test('the Proposed view hides the band and the green glow of a new result until the review reveals it (RV-6, D-19)', async ({ page }) => {
  board = await openBoard(page, spyroGraph(), 'dark', { vars: PROVED, workspace: workspaceState(), clock: UPDATED });
  await expect(band(page, TARGET)).toHaveCount(0); // not proved on the Current board
  const proposal = normativeProposal();
  await send(page, hostMessage('run', { run: reviewRun(proposal) }));
  await send(page, hostMessage('proposal', { proposal }));
  await expect(page.locator('.tl-board')).toHaveAttribute('data-view', 'proposed');
  await expect(card(page, TARGET).locator('[data-chip="result-hidden"]')).toHaveText('result after the review');
  await expect(band(page, TARGET)).toHaveCount(0);
  await expect(card(page, TARGET)).not.toHaveAttribute('data-glow', 'established');
  await page.getByTestId('show-result').click();
  await expect(band(page, TARGET)).toHaveCount(1);
  expect((await bandOf(page, TARGET)).complete).toBe('true');
  await expect(card(page, TARGET)).toHaveAttribute('data-glow', 'established');
  await expect(card(page, TARGET).locator('[data-chip="established"]')).toHaveText('✓ established');
});

/**
 * The goal's proof also uses `lemma`, a proposition stored right of and above the goal, with a drawn arrow into it: a
 * band's arrow from the right must still enter the goal's left edge (slice 1d fixer: round the card, into the left edge).
 */
function bandFromRightGraph(version = 8): TlGraph {
  const base = spyroProvedGraph(version);
  const lemma = makeNode(
    'lemma',
    'PROPOSITION',
    'Cynder does not fit a PG game',
    { proof: { kind: 'proved', footprint: ['cynder-dark-past'] }, flags: ['established'], direct: { ids: ['cynder-dark-past'], from: 'proof' } },
    { premises: ['cynder-dark-past'] },
  );
  const nodes = base.nodes.map((n) => {
    if (n.id !== TARGET || n.status.proof.kind !== 'proved') return n;
    return { ...n, premises: [...n.premises, 'lemma'], status: { ...n.status, direct: { ids: [...(n.status.direct?.ids ?? []), 'lemma'], from: 'proof' as const } } };
  });
  return {
    ...buildGraph({ subject: 'Spyro', version, nodes: [...nodes, lemma], vocabulary: base.vocabulary, semantic: base.semantic }),
    positions: { [TARGET]: { x: 360, y: 240 }, lemma: { x: 900, y: 40 } },
  };
}

test('a band arrow from a card right of the target still enters its left edge, and the bracket with its ✓ binds all four (slice 1d)', async ({ page }) => {
  const graph = bandFromRightGraph();
  board = await openBoard(page, graph, 'dark', { vars: PROVED });
  const drawn = await bandOf(page, TARGET);
  expect(drawn.complete).toBe('true');
  expect(drawn.check).toBe('✓');
  const face = await card(page, TARGET).boundingBox();
  const lemma = await card(page, 'lemma').boundingBox();
  const bracket = await band(page, TARGET).locator('.tl-band__bar').boundingBox();
  if (!face || !lemma || !bracket) throw new Error('no boxes');
  expect(lemma.x).toBeGreaterThan(face.x + face.width); // the source lies to the right
  const ends = await page.locator(`path[data-edge-id][data-target="${TARGET}"]`).evaluateAll((paths) =>
    paths.map((p) => {
      const path = p as SVGPathElement;
      const origin = path.ownerSVGElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const end = path.getPointAtLength(path.getTotalLength());
      return { source: path.dataset.source, x: origin.left + end.x, y: origin.top + end.y };
    }),
  );
  expect(ends.map((e) => e.source).sort()).toEqual(['cynder-dark-past', 'lemma', 'new-spyro-pg', 'pg-no-dark-past']);
  for (const end of ends) {
    expect(Math.abs(end.x - face.x), `${end.source} ends on the left edge`).toBeLessThan(2.5);
    expect(end.y).toBeGreaterThanOrEqual(bracket.y - 1);
    expect(end.y).toBeLessThanOrEqual(bracket.y + bracket.height + 1);
  }
  const arrows = await checkArrows(page, edgePairs(graph));
  expect(arrows.problems).toEqual([]);
  expect(arrows.missing).toEqual([]);
  await page.screenshot({ path: shotPath('s1-band-from-right.png') });
});
