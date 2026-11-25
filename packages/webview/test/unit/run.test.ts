import { DEFAULT_RUN_CAPS, REVIEW_TEXTS, spyroGraph, type QuestionView, type RunNotice, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  acceptChangedFiles,
  agentMsNow,
  answerChoiceText,
  draftAnswers,
  emptyDraft,
  ENDED_TEXT,
  endedOutcome,
  endedText,
  formatCost,
  formatDuration,
  formatTokens,
  isActiveRun,
  isRunOutcomeVerdict,
  newVocabularyCount,
  panelNotices,
  panelSession,
  placeNotices,
  rateLimitView,
  runBadgeText,
  runStateLabel,
  runStatusParts,
  statementBody,
  trayRunBlock,
  missingArrowHints,
} from '../../src/model/run';
import { RESULT_CHIP_KEYS } from '../../src/model/sessionBoard';
import { sessionView } from '../shared/sessions';
import { ACCEPTED_NOTICE, GENERIC_QUESTION, MODALITY_QUESTION, RECORDED_NOTICE, RUN_ID, runView, UPDATED } from '../shared/runs';

const NOW = Date.parse(UPDATED);

describe('formatting', () => {
  it('durations, tokens and the cost estimate', () => {
    expect([formatDuration(0), formatDuration(245_000), formatDuration(20 * 60_000), formatDuration(3_723_000), formatDuration(Number.NaN)]).toEqual(['0:00', '4:05', '20:00', '1:02:03', '0:00']);
    expect([formatTokens(950), formatTokens(12_345), formatTokens(450_000), formatTokens(1_234_567), formatTokens(-1)]).toEqual(['950', '12.3k', '450k', '1.2M', '?']);
    expect([formatCost(0), formatCost(0.42), formatCost(0.003), formatCost(12.5)]).toEqual(['$0.00', '$0.42', '$0.003', '$12.50']);
  });

  it('the rate limit: ok, close to it (warning), reached (error), unknown statuses as they are', () => {
    expect(rateLimitView(undefined)).toBeNull();
    expect(rateLimitView({ status: 'allowed' })).toMatchObject({ text: 'rate limit ok', tone: 'ok' });
    expect(rateLimitView({ status: 'allowed_warning' })).toMatchObject({ text: 'rate limit: close', tone: 'warn' });
    expect(rateLimitView({ status: 'rejected', detail: 'five-hour window' })).toMatchObject({ text: 'rate limited', tone: 'error' });
    expect(rateLimitView({ status: 'rejected', detail: 'five-hour window' })?.title).toContain('five-hour window');
    expect(rateLimitView({ status: 'queued' })).toMatchObject({ text: 'rate limit: queued', tone: 'warn' });
    expect(rateLimitView({ status: 'allowed_warning', resetsAt: '2026-11-01T15:00:00.000Z' })?.text).toMatch(/^rate limit: close \(resets (\d{2}:\d{2}|[A-Z][a-z]{2} \d{1,2} \d{2}:\d{2})\)$/);
  });
});

describe('the status line', () => {
  it('counters, usage with "estimate", rate limit', () => {
    const run = runView({ usage: { ...runView().usage, rateLimit: { status: 'allowed_warning' } } });
    expect(runStatusParts(run, NOW).map((p) => [p.key, p.text, p.tone])).toEqual([
      ['round', 'round 1', undefined],
      ['checks', 'checks 3/25', undefined],
      ['turns', 'turns 12/80', undefined],
      ['agent', 'agent 4:05 / 20:00', undefined],
      ['gate', 'check attempts 0/3', undefined],
      ['tokens', '12.3k in · 1.2k out', undefined],
      ['cost', '$0.42 estimate', undefined],
      ['rate', 'rate limit: close', 'warn'],
    ]);
    expect(runStatusParts(run, NOW).find((p) => p.key === 'cost')?.title).toBe('Estimate at API list prices; your subscription is not billed per token.');
  });

  it('the agent clock runs on between updates while Claude works, is paused while a question waits, and never passes the cap', () => {
    expect(agentMsNow(runView(), NOW + 10_000)).toBe(255_000);
    expect(agentMsNow(runView({ state: 'gate' }), NOW + 1_000)).toBe(246_000);
    expect(agentMsNow(runView({ state: 'waiting-for-answer' }), NOW + 60_000)).toBe(245_000);
    expect(agentMsNow(runView(), NOW - 5_000)).toBe(245_000);
    expect(agentMsNow(runView(), NOW + 3_600_000)).toBe(DEFAULT_RUN_CAPS.maxAgentMs);
    expect(runStatusParts(runView({ state: 'waiting-for-answer' }), NOW + 60_000).find((p) => p.key === 'agent')?.text).toBe('agent 4:05 / 20:00 (paused)');
  });

  it('state labels with the stage; the verdict only once revealed (D-19); the header badge', () => {
    expect(runStateLabel(runView())).toBe('Working · formalising');
    expect(runStateLabel(runView({ stage: 'prove' }))).toBe('Working · proving');
    expect(runStateLabel(runView({ state: 'review', verdict: 'proved' }), false)).toBe('Ready for review');
    expect(runStateLabel(runView({ state: 'review', verdict: 'insufficient' }), true)).toBe('Ready for review · not proved');
    expect(runStateLabel(runView({ state: 'review', verdict: 'inconsistent' }), true)).toBe('Ready for review · Claude reports a conflict (unverified until M3)');
    expect(runBadgeText(runView())).toBe('Claude: working on Spyro · 3/25 checks');
    expect(runBadgeText(runView({ state: 'waiting-for-answer' }))).toBe('Claude: a question for you · Spyro');
    expect(runBadgeText(runView({ state: 'cancelled' }))).toBe('Claude: cancelled · Spyro');
    // Slice 2h (fixer 2h r1, F-F-V2H-FC-4): no "proposal ready" (M2's review is retired): a run in review with no session
    // view yet is being opened, or (a failed conversion of an old run) could not be, and says so.
    expect(runBadgeText(runView({ state: 'review', verdict: 'proved' }))).toBe('Claude: opening the review · Spyro');
    expect(runBadgeText(runView({ state: 'review', error: 'This run was started by an older telelean and could not be converted (x): Stop it.' }))).toBe('Claude: could not open the review · Spyro');
  });

  it('how a round ended without a proof result (gave up, a limit, no finish) is said at once, before the review; proof results wait (D-19)', () => {
    expect(['gave-up', 'cap-reached', 'no-finish'].every((v) => isRunOutcomeVerdict(v as 'gave-up'))).toBe(true);
    expect(['proved', 'not-proved', 'insufficient', 'inconsistent', undefined].some((v) => isRunOutcomeVerdict(v as 'proved' | undefined))).toBe(false);
    expect(runStateLabel(runView({ state: 'review', verdict: 'gave-up' }), false)).toBe('Ready for review · Claude gave up');
    expect(runStateLabel(runView({ state: 'review', verdict: 'cap-reached' }), false)).toBe('Ready for review · stopped at a limit');
    expect(runStateLabel(runView({ state: 'review', verdict: 'no-finish' }), false)).toBe('Ready for review · ended without finishing');
    expect(runBadgeText(runView({ state: 'review', verdict: 'gave-up' }))).toBe('Claude: gave up · Spyro');
    expect(runBadgeText(runView({ state: 'review', verdict: 'cap-reached' }))).toBe('Claude: stopped at a limit · Spyro');
  });

  it('notices: all of them while Claude works; once the round ended, only how it ended comes before the review', () => {
    const notice = (id: string, kind: RunNotice['kind'], level: RunNotice['level'] = 'warning'): RunNotice => ({ id, at: UPDATED, kind, level, text: id });
    const notices = [notice('a1', 'gate-failed'), notice('i1', 'info', 'info'), notice('a2', 'gate-failed'), notice('g', 'gave-up', 'error'), notice('r', 'reverted')];
    const ids = (list: readonly RunNotice[]) => list.map((n) => n.id);
    const working = placeNotices(runView({ notices }));
    expect([ids(working.upfront), ids(working.later)]).toEqual([['a1', 'i1', 'a2', 'g', 'r'], []]);
    const gaveUp = placeNotices(runView({ state: 'review', verdict: 'gave-up', notices }));
    expect([ids(gaveUp.upfront), ids(gaveUp.later)]).toEqual([['g', 'r'], ['a1', 'i1', 'a2']]);
    // A later round that proved: the earlier round's giving up is history.
    const proved = placeNotices(runView({ state: 'review', verdict: 'proved', notices }));
    expect([ids(proved.upfront), ids(proved.later)]).toEqual([[], ['a1', 'i1', 'a2', 'g', 'r']]);
    // Only the latest revert and cap notice of the round that hit the limit.
    const capped = placeNotices(runView({ state: 'review', verdict: 'cap-reached', notices: [...notices, notice('c', 'cap'), notice('r2', 'reverted')] }));
    expect(ids(capped.upfront)).toEqual(['c', 'r2']);
    expect(ids(placeNotices(runView({ state: 'cancelled', notices })).upfront)).toEqual([]);
  });

  it('how an ended run ended: an Accept that changed no file is "Recorded", without the Undo hint; every board reads the runner’s record of the Accept (RunView.accepted), never the notice wording', () => {
    const notice = (id: string, text: string, kind: RunNotice['kind'] = 'info'): RunNotice => ({ id, at: UPDATED, kind, level: 'info', text });
    const accepted = runView({ state: 'accepted', notices: [notice('n1', 'Round 1: your feedback was sent to Claude.')] });
    // The runner's record decides, also on a board that did not send the Accept (e.g. one opened afterwards) ...
    expect(endedOutcome(runView({ state: 'accepted', accepted: { changedFiles: false } }), null)).toBe('recorded');
    expect(endedOutcome(runView({ state: 'accepted', accepted: { changedFiles: true } }), null)).toBe('accepted');
    expect(endedOutcome(runView({ state: 'accepted', accepted: { changedFiles: false } }), { runId: 'run_other', changedFiles: true })).toBe('recorded');
    // ... and over this board's own guess.
    expect(endedOutcome(runView({ state: 'accepted', accepted: { changedFiles: false } }), { runId: RUN_ID, changedFiles: true })).toBe('recorded');
    expect(acceptChangedFiles(runView({ state: 'accepted', accepted: { changedFiles: true } }), { runId: RUN_ID, changedFiles: false })).toBe(true);
    // The wording of the runner's notices is never read.
    expect(acceptChangedFiles(runView({ state: 'accepted', notices: [notice('n1', RECORDED_NOTICE)] }), null)).toBeNull();
    expect(endedOutcome(runView({ state: 'accepted', notices: [notice('n1', ACCEPTED_NOTICE)], accepted: { changedFiles: false } }), null)).toBe('recorded');
    expect(endedOutcome(runView({ state: 'accepted', notices: [notice('n1', RECORDED_NOTICE)], accepted: { changedFiles: true } }), null)).toBe('accepted');
    // Until the run's view carries the record: this board's own Accept (the proposal's `empty`, then the host's answer).
    expect(endedOutcome(accepted, { runId: RUN_ID, changedFiles: false })).toBe('recorded');
    expect(endedOutcome(accepted, { runId: RUN_ID, changedFiles: true })).toBe('accepted');
    // Another run's Accept says nothing about this one; nothing to tell from: the usual wording.
    expect(acceptChangedFiles(accepted, { runId: 'run_other', changedFiles: false })).toBeNull();
    expect(acceptChangedFiles(accepted, null)).toBeNull();
    expect(acceptChangedFiles(runView({ state: 'accepted' }), null)).toBeNull();
    expect(endedOutcome(accepted, null)).toBe('accepted');
    // Every other state as it is (null while the run has not ended).
    expect((['discarded', 'cancelled', 'failed'] as const).map((state) => endedOutcome(runView({ state }), { runId: RUN_ID, changedFiles: false }))).toEqual(['discarded', 'cancelled', 'failed']);
    expect(endedOutcome(runView({ state: 'review' }), { runId: RUN_ID, changedFiles: false })).toBeNull();
    expect(ENDED_TEXT.recorded).not.toMatch(/Undo|History/);
    expect(ENDED_TEXT.accepted).toMatch(/Undo \(Ctrl\+Z\) or History reverts them/);
  });

  it('2k1 (D2-100 D2): an ended run\'s line; an edit session\'s Exit and Apply in the session\'s words, "Recorded" for an Apply that changed no file, every other end as any run\'s', () => {
    const session = { stage: 1, phase: 'stage' as const };
    expect(endedText(runView({ state: 'discarded', session }))).toBe(REVIEW_TEXTS.exited);
    expect(endedText(runView({ state: 'accepted', session, accepted: { changedFiles: true } }))).toBe(REVIEW_TEXTS.applied);
    expect(endedText(runView({ state: 'accepted', session, accepted: { changedFiles: false } }))).toBe(ENDED_TEXT.recorded);
    expect(endedText(runView({ state: 'cancelled', session }))).toBe(ENDED_TEXT.cancelled);
    expect(endedText(runView({ state: 'failed', session }))).toBe(ENDED_TEXT.failed);
    // A run with no session (a v1 run that could not be converted) keeps the plain words.
    expect(endedText(runView({ state: 'discarded' }))).toBe(ENDED_TEXT.discarded);
    expect(endedText(runView({ state: 'accepted', accepted: { changedFiles: true } }))).toBe(ENDED_TEXT.accepted);
    // Not ended: no line.
    for (const state of ['starting', 'working', 'review', 'interrupted'] as const) expect(endedText(runView({ state, session }))).toBeNull();
    expect(REVIEW_TEXTS.exited).toBe("You exited the edit session: your files were not changed. Your answers to Claude's questions stay recorded.");
  });

  it('2k2 carry-over A-F1: the plain panel does not list the ended line again among its notices; other notices stay', () => {
    const session = { stage: 1, phase: 'stage' as const };
    const notice = (id: string, text: string): RunNotice => ({ id, at: UPDATED, level: 'info', kind: 'info', text });
    const other = notice('n1', 'Claude resumed the step.');
    const applied = runView({ state: 'accepted', session, accepted: { changedFiles: true }, notices: [other, notice('n2', REVIEW_TEXTS.applied)] });
    expect(placeNotices(applied).later.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(panelNotices(applied)).toEqual({ upfront: [], later: [other] });
    const exited = runView({ state: 'discarded', session, notices: [notice('n3', REVIEW_TEXTS.exited), other] });
    expect(panelNotices(exited).later).toEqual([other]);
    // A run that has not ended keeps every notice, the same text included.
    const working = runView({ state: 'working', session, notices: [notice('n4', REVIEW_TEXTS.exited)] });
    expect(panelNotices(working)).toEqual(placeNotices(working));
  });

  it('2k2 carry-over F-F1: the run panel draws a session view only for the board\'s run while it has not ended', () => {
    const view = sessionView();
    const run = runView({ runId: view.runId, subject: view.subject, state: 'review', session: { stage: 1, phase: 'stage' } });
    expect(panelSession({ run, session: view, subject: view.subject })).toBe(view);
    for (const state of ['accepted', 'discarded', 'cancelled', 'failed'] as const) {
      expect(panelSession({ run: { ...run, state }, session: view, subject: view.subject }), state).toBeNull();
    }
    expect(panelSession({ run: { ...run, runId: 'other' }, session: view, subject: view.subject })).toBeNull();
    expect(panelSession({ run, session: view, subject: 'Other' })).toBeNull();
    expect(panelSession({ run: null, session: view, subject: view.subject })).toBeNull();
    expect(panelSession({ run, session: null, subject: view.subject })).toBeNull();
  });

  it('a statement in the review is the proposition alone, without Lean’s #print header', () => {
    expect(statementBody('@[reducible] def Spyro.pg_no_dark_past : Prop :=\n∀ (g : Spyro.Game), Spyro.IsPG g')).toBe('∀ (g : Spyro.Game), Spyro.IsPG g');
    expect(statementBody('@[reducible, simp] noncomputable def Spyro.«pg rule» : Prop := True')).toBe('True');
    expect(statementBody('abbrev cynder_not_good : Prop :=\n  ¬GoodAddition cynder newSpyro')).toBe('¬GoodAddition cynder newSpyro');
    // Anything else is shown as it is: a bare proposition, a header that is not a Prop abbrev, a header with no body.
    expect(statementBody('∀ (g : Game), IsPG g')).toBe('∀ (g : Game), IsPG g');
    expect(statementBody('def Spyro.rating : Game → Nat :=\nfun _ => 0')).toBe('def Spyro.rating : Game → Nat :=\nfun _ => 0');
    expect(statementBody('@[reducible] def Spyro.x : Prop :=')).toBe('@[reducible] def Spyro.x : Prop :=');
  });

  it('the tray is blocked while a run of the root is active, naming another subject', () => {
    expect(isActiveRun(null)).toBe(false);
    expect(trayRunBlock(null, 'Spyro')).toBeNull();
    expect(trayRunBlock(runView({ state: 'accepted' }), 'Spyro')).toBeNull();
    expect(trayRunBlock(runView(), 'Spyro')).toBe('Claude is already working: wait for it to finish, or cancel it.');
    expect(trayRunBlock(runView({ subject: 'Bayonetta' }), 'Spyro')).toBe('Claude is already working on Bayonetta: wait for it to finish, or cancel it.');
    // Slice 2h: a run in review is an edit session (M2's Accept, Feedback and Discard are retired).
    expect(trayRunBlock(runView({ state: 'review' }), 'Spyro')).toBe('An edit session is waiting for your review: apply or exit it first.');
    expect(trayRunBlock(runView({ state: 'interrupted' }), 'Spyro')).toMatch(/interrupted: resume or stop it first/);
  });
});

describe('answers (D-20)', () => {
  const questions: QuestionView[] = [MODALITY_QUESTION, GENERIC_QUESTION];

  it('no answer is pre-selected; every question needs one; the scope defaults to the run', () => {
    expect(emptyDraft()).toEqual({ kind: null, option: null, text: '', scope: 'run' });
    expect(draftAnswers(questions, undefined)).toBeNull();
    expect(draftAnswers(questions, [{ ...emptyDraft(), kind: 'option', option: 1 }])).toBeNull();
    expect(
      draftAnswers(questions, [
        { ...emptyDraft(), kind: 'option', option: 1, scope: 'nodes' },
        { ...emptyDraft(), kind: 'free-text', text: '  every one\nreally  ', scope: 'subject' },
      ]),
    ).toEqual([
      { question: 0, choice: { kind: 'option', option: 1 }, scope: 'nodes' },
      { question: 1, choice: { kind: 'free-text', text: 'every one\nreally' }, scope: 'subject' },
    ]);
  });

  it('free text must not be blank; an option must exist; Leave it open and Decide for me are answers', () => {
    expect(draftAnswers([MODALITY_QUESTION], [{ ...emptyDraft(), kind: 'free-text', text: ' \n ' }])).toBeNull();
    expect(draftAnswers([MODALITY_QUESTION], [{ ...emptyDraft(), kind: 'option', option: 5 }])).toBeNull();
    expect(draftAnswers([MODALITY_QUESTION], [{ ...emptyDraft(), kind: 'leave-open' }])).toEqual([{ question: 0, choice: { kind: 'leave-open' }, scope: 'run' }]);
    expect(draftAnswers([MODALITY_QUESTION], [{ ...emptyDraft(), kind: 'decide-for-me' }])).toEqual([{ question: 0, choice: { kind: 'decide-for-me' }, scope: 'run' }]);
    expect(answerChoiceText({ kind: 'option', option: 1 }, MODALITY_QUESTION)).toBe('Impossible (literal)');
    expect(answerChoiceText({ kind: 'leave-open' }, MODALITY_QUESTION)).toBe('Leave it open');
    expect(answerChoiceText({ kind: 'decide-for-me' }, MODALITY_QUESTION)).toBe('Decide for me');
  });
});

describe('what the Proposed view shares with the run UI', () => {
  // Slice 2h deleted the M2 review's tests (its steps, Accept's definitions and tooltip, the banner's counts, the
  // suggestions, the proposal overlay and `resultSignature`): the review is the session's (review.test.ts) and the
  // Proposed view is built from the host's board (sessionBoard.test.ts).
  it('"+N new" vocabulary counts the added names; the result chips a hidden target leaves out', () => {
    expect(newVocabularyCount({ vocabulary: { 'Spyro.InGame': 'added', 'Spyro.Old': 'removed' } })).toBe(1);
    expect(newVocabularyCount({ vocabulary: {} })).toBe(0);
    for (const key of ['established', 'rests-on-pending', 'hidden-assumption', 'uses-unseen', 'conditional', 'pending', 'self-evident']) expect(RESULT_CHIP_KEYS.has(key), key).toBe(true);
  });
});

describe('spec v4.1 A10 (slice 1e): a card the proof needs but nobody selected, named in Claude\'s gap', () => {
  const graph = spyroGraph();
  const nodes = Object.fromEntries(graph.nodes.map((n) => [n.id, n])) as Record<string, TlNode>;
  const target = 'cynder-not-good';
  const report = (gap: string | undefined, verdict: 'not-proved' | 'proved' = 'not-proved') => ({ verdict, gap, target });

  it('a card with an arrow drawn but not selected: "Select ‹card› → ‹target› too"', () => {
    // The target declares all three premises; only one was selected.
    expect(missingArrowHints(report('The proof also needs `new-spyro-pg` (the game is PG).'), ['cynder-dark-past'], nodes)).toEqual([
      { id: 'new-spyro-pg', kind: 'select', text: 'Select “The new Spyro game is PG” → “Cynder would not be a good addition to …” too.' },
    ]);
  });

  it('a card with no arrow into the target: "Draw (or select) the arrow from ‹card› and run again"; also when named by its Lean name', () => {
    const undrawn = { ...nodes, [target]: { ...(nodes[target] as TlNode), premises: ['cynder-dark-past'] } };
    expect(missingArrowHints(report('It needs new_spyro_pg.holds, and pg-no-dark-past too.'), ['cynder-dark-past'], undrawn)).toEqual([
      { id: 'new-spyro-pg', kind: 'draw', text: 'Draw (or select) the arrow from “The new Spyro game is PG” and run again.' },
      { id: 'pg-no-dark-past', kind: 'draw', text: 'Draw (or select) the arrow from “PG games cannot have characters with da…” and run again.' },
    ]);
  });

  it('nothing for the target, the selected premises, words that only contain an id, a proved verdict or no gap', () => {
    expect(missingArrowHints(report('cynder-not-good needs cynder-dark-past.'), ['cynder-dark-past'], nodes)).toEqual([]);
    expect(missingArrowHints(report('the not-new-spyro-pg-ish thing'), [], nodes)).toEqual([]);
    expect(missingArrowHints(report('needs new-spyro-pg', 'proved'), [], nodes)).toEqual([]);
    expect(missingArrowHints(report(undefined), [], nodes)).toEqual([]);
  });
});
