/**
 * AT6.10 provenance (D-15, 03 section 7: "A test asserts that agent text never renders in user styling"). Every string
 * Claude wrote carries a token in these fixtures: its messages in the activity feed, its questions, options and
 * consequences, Claude's guess, its suggested premises, its summary, gap, conflict and unasked choices, the glosses
 * of the vocabulary it added, the definitions it introduced, an adopted card's sentence and the attempts' summaries.
 * On every screen of a run, each text node with the token must sit inside `data-provenance="agent"`, render italic and
 * have Claude's marker (its own, or its card's), and no element in the user's style may contain it. Slice 2h retired
 * M2's proposal (its review, report card and ghosts): an edit session's board is checked instead (its review panel in
 * s2-review).
 */
import { expect, test, type Page } from '@playwright/test';
import { hostMessage, spyroGraph, type AttemptSummary, type QuestionView, type SessionView, type TlGraph } from '@telelean/core';
import { workspaceState } from '../shared/graphs';
import { answeredModality, attemptsGraph, GENERIC_QUESTION, MODALITY_QUESTION, runView, TARGET, UPDATED, waitingRun } from '../shared/runs';
import { IDS, sessionRun, shownStage } from '../shared/sessions';
import { card, openBoard, send, type OpenedBoard } from './helpers';

let board: OpenedBoard | undefined;

test.afterEach(async () => {
  if (board) expect(await board.problems()).toEqual([]);
  board = undefined;
});

/** The token every one of Claude's strings carries here (never in the user's words). */
const C = '⟪claude⟫';
const mark = (text: string) => `${C} ${text}`;

function markedQuestion(question: QuestionView): QuestionView {
  return { ...question, question: mark(question.question), options: question.options.map((o) => ({ ...o, label: mark(o.label), consequence: mark(o.consequence) })) };
}

/** Slice 2h: an edit session's stage with Claude's strings on the board marked: a card it worded, its glosses, its premise suggestion. */
function markedSession(): SessionView {
  const base = shownStage();
  const graph = base.board.graph;
  const marked: TlGraph = {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === 'new-spyro-pg' ? { ...n, naturalName: mark(n.naturalName), provenance: { ...n.provenance, wordedBy: 'agent' as const } } : n)),
    vocabulary: graph.vocabulary.map((v) => (v.glossBy === 'agent' && v.gloss ? { ...v, gloss: mark(v.gloss) } : v)),
  };
  return { ...base, board: { ...base.board, graph: marked, premises: base.board.premises.map((p) => ({ ...p, sentence: mark(p.sentence) })) } };
}

/** Every text node with Claude's token: inside agent provenance, italic, with a marker; never in the user's style. */
async function provenance(page: Page): Promise<{ checked: number; problems: string[] }> {
  return page.evaluate((token) => {
    const problems: string[] = [];
    let checked = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (!text.includes(token)) continue;
      const element = node.parentElement;
      if (!element) continue;
      checked++;
      const shown = text.trim().slice(0, 70);
      const agent = element.closest('[data-provenance="agent"]');
      if (!agent) {
        problems.push(`not marked as Claude's: "${shown}"`);
        continue;
      }
      if (getComputedStyle(element).fontStyle !== 'italic') problems.push(`not italic: "${shown}"`);
      const user = element.closest('[data-provenance="user"]');
      if (user && agent.contains(user)) problems.push(`in the user's style: "${shown}"`);
      const marker = agent.querySelector('.tl-agent__marker') ?? agent.closest('[data-agent-scope]')?.querySelector('.tl-agent__marker');
      if (!marker) problems.push(`without Claude's marker: "${shown}"`);
    }
    for (const element of document.querySelectorAll('[data-provenance="user"]')) {
      if (element.textContent?.includes(token)) problems.push(`the user's style shows Claude's words: "${element.textContent.trim().slice(0, 70)}"`);
    }
    return { checked, problems };
  }, C);
}

async function expectClean(page: Page, minimum: number): Promise<void> {
  const report = await provenance(page);
  expect(report.problems).toEqual([]);
  expect(report.checked).toBeGreaterThanOrEqual(minimum);
}

test('AT6.10 a run’s questions, answers, guesses and activity: Claude’s words never in the user’s style', async ({ page }) => {
  const run = waitingRun([markedQuestion(MODALITY_QUESTION)], {
    answered: [
      { ...answeredModality(), ...markedQuestion(MODALITY_QUESTION), setId: 'q0', claudesGuess: { option: 0, note: mark('Ratings usually express rules.') } },
      {
        ...markedQuestion(GENERIC_QUESTION),
        setId: 'q0',
        answer: { question: 1, choice: { kind: 'free-text', text: 'every one, in my own words' }, scope: 'run' },
        answeredAt: '2026-11-01T10:00:50.000Z',
        claudesGuess: { option: 1 },
      },
    ],
    activity: [
      { at: '2026-11-01T10:00:05.000Z', kind: 'system', text: 'Run started' },
      { at: '2026-11-01T10:00:30.000Z', kind: 'claude-text', text: mark('I will formalise the rule first.') },
      { at: '2026-11-01T10:00:40.000Z', kind: 'claude-text', text: mark('Two readings matter here,\nso I ask.') },
    ],
  });
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), run, clock: UPDATED });
  await expect(page.getByTestId('question-set')).toBeVisible();
  // question + 2 labels + 2 consequences (pending), 2 asked questions with their options' labels and the guesses,
  // and 2 activity lines.
  await expectClean(page, 9);
  // The user's free-text answer is in the user's style.
  await expect(page.getByTestId('answered-question').nth(1).getByTestId('your-answer').locator('[data-provenance="user"]')).toHaveText('every one, in my own words');
});

test('AT6.10 an edit session’s board (slice 2h): a card Claude worded and its "Claude suggests" card keep Claude’s words in Claude’s style', async ({ page }) => {
  const session = markedSession();
  board = await openBoard(page, spyroGraph(), 'dark', { workspace: workspaceState(), clock: UPDATED });
  await send(page, hostMessage('run', { run: sessionRun(session) }));
  await send(page, hostMessage('session', { session }));
  // The board (Proposed view): the card's sentence and the suggestion's.
  await expect(page.locator(`[data-ghost-id="${IDS.premise}"]`)).toBeVisible();
  await expectClean(page, 2);
  // The user's own sentences stay in the user's style.
  await expect(card(page, TARGET).locator('.tl-card__text')).toHaveAttribute('data-provenance', 'user');
});

test('AT6.10 the attempts history: Claude’s summaries in Claude’s style', async ({ page }) => {
  const graph = attemptsGraph();
  const marked: TlGraph = { ...graph, attempts: (graph.attempts ?? []).map((a): AttemptSummary => ({ ...a, ...(a.summary ? { summary: mark(a.summary) } : {}) })) };
  board = await openBoard(page, marked, 'light', { workspace: workspaceState() });
  await card(page, TARGET).locator('.tl-card__chevron').click();
  await card(page, 'pg-no-dark-past').locator('.tl-card__chevron').click();
  await expectClean(page, 4);
  await send(page, hostMessage('run', { run: runView({ activity: [{ at: '2026-11-01T10:00:30.000Z', kind: 'claude-text', text: mark('Working on it.') }] }) }));
  await expectClean(page, 5);
});
