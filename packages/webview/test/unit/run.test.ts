import { DEFAULT_RUN_CAPS, spyroGraph, type QuestionView, type RunNotice, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  acceptChangedFiles,
  acceptChangesFiles,
  acceptSelection,
  acceptTitle,
  agentMsNow,
  answerChoiceText,
  buildOverlay,
  definitionsApproved,
  diffCountsText,
  diffTitle,
  draftAnswers,
  emptyDraft,
  ENDED_TEXT,
  endedOutcome,
  formatCost,
  formatDuration,
  formatTokens,
  isActiveRun,
  isRunOutcomeVerdict,
  newVocabularyCount,
  pastStatements,
  placeNotices,
  rateLimitView,
  RESULT_CHIP_KEYS,
  resultSignature,
  reviewSteps,
  runBadgeText,
  runOutcomeText,
  runStateLabel,
  runStatusParts,
  statementBody,
  suggestedGhosts,
  trayRunBlock,
  missingArrowHints,
} from '../../src/model/run';
import {
  ACCEPTED_NOTICE,
  ADOPTED_ID,
  adoptedProposal,
  definitionProposal,
  emptyProposal,
  GENERIC_QUESTION,
  literalGhost,
  literalProposal,
  MODALITY_QUESTION,
  normativeProposal,
  RECORDED_NOTICE,
  reviewRun,
  RUN_ID,
  runView,
  TARGET,
  UPDATED,
} from '../shared/runs';
import { makeNode } from '../shared/graphs';

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
    expect(runBadgeText(runView({ state: 'review', verdict: 'proved' }))).toBe('Claude: proposal ready · Spyro');
  });

  it('how a round ended without a proof result (gave up, a limit, no finish) is said at once, before the review; proof results wait (D-19)', () => {
    expect(['gave-up', 'cap-reached', 'no-finish'].every((v) => isRunOutcomeVerdict(v as 'gave-up'))).toBe(true);
    expect(['proved', 'not-proved', 'insufficient', 'inconsistent', undefined].some((v) => isRunOutcomeVerdict(v as 'proved' | undefined))).toBe(false);
    expect(runStateLabel(runView({ state: 'review', verdict: 'gave-up' }), false)).toBe('Ready for review · Claude gave up');
    expect(runStateLabel(runView({ state: 'review', verdict: 'cap-reached' }), false)).toBe('Ready for review · stopped at a limit');
    expect(runStateLabel(runView({ state: 'review', verdict: 'no-finish' }), false)).toBe('Ready for review · ended without finishing');
    expect(runBadgeText(runView({ state: 'review', verdict: 'gave-up' }))).toBe('Claude: gave up · Spyro');
    expect(runBadgeText(runView({ state: 'review', verdict: 'cap-reached' }))).toBe('Claude: stopped at a limit · Spyro');
    expect(runOutcomeText('gave-up', 3, 'Statements frozen (round 1)')).toBe(
      'Claude gave up: its result didn’t pass the checks 3 times. This proposal holds only what last passed the checks (“Statements frozen (round 1)”).',
    );
    expect(runOutcomeText('no-finish', 3, undefined)).toBe('Claude ended without finishing. This proposal holds only what last passed the checks.');
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
    expect(trayRunBlock(runView({ state: 'review' }), 'Spyro')).toMatch(/waiting for your review/);
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

describe('the review (D-19)', () => {
  it('steps: statements first, then vocabulary, definitions, the result; empty ones are left out (no lifecycle step since spec v4)', () => {
    expect(reviewSteps(definitionProposal()).map((s) => s.kind)).toEqual(['statement', 'statement', 'vocabulary', 'definitions', 'result']);
    expect(reviewSteps(normativeProposal()).map((s) => s.kind)).toEqual(['statement', 'result']);
    expect(reviewSteps(literalProposal()).map((s) => s.kind)).toEqual(['statement', 'vocabulary', 'result']);
    expect(reviewSteps(normativeProposal({ review: [] })).map((s) => s.kind)).toEqual(['result']);
    const steps = reviewSteps(definitionProposal());
    expect([0, 1, 2, 4].map((i) => pastStatements(steps, i))).toEqual([false, false, true, true]);
    expect(pastStatements(reviewSteps(normativeProposal({ review: [] })), 0)).toBe(true);
  });

  it('Accept needs every definition approved; it sends the approved definitions in order', () => {
    const proposal = definitionProposal();
    expect(definitionsApproved(proposal, {})).toBe(false);
    expect(definitionsApproved(proposal, { d1: 'yes', d2: 'no' })).toBe(false);
    expect(definitionsApproved(proposal, { d2: 'yes', d1: 'yes' })).toBe(true);
    expect(definitionsApproved(normativeProposal(), {})).toBe(true);
    expect(acceptSelection(proposal, { definitions: { d2: 'yes', d1: 'yes' } })).toEqual({ definitions: ['d1', 'd2'] });
    expect(acceptSelection(proposal, { definitions: { d2: 'yes', d1: 'no' } })).toEqual({ definitions: ['d2'] });
  });

  it('Accept’s tooltip says what it does to the files: one Undo step, or only a record when it changes no file', () => {
    expect(acceptTitle(normativeProposal())).toBe('Apply the proposal to your files (one Undo step; a history entry)');
    expect(acceptTitle(normativeProposal({ report: { ...normativeProposal().report, verdict: 'gave-up' } }))).toBe('Apply what last passed the checks to your files (one Undo step; a history entry)');
    expect(acceptTitle(emptyProposal())).toBe('Record the outcome: this round changed no file, so there is no Undo step and no history entry');
    expect(acceptChangesFiles(emptyProposal())).toBe(false);
    expect(acceptChangesFiles(normativeProposal())).toBe(true);
    // A round that changed no file only records, even when it proved the target (no card change to tick since spec v4).
    const proved = emptyProposal({ report: normativeProposal().report });
    expect(acceptChangesFiles(proved)).toBe(false);
    expect(acceptTitle(proved)).toBe('Record the outcome: this round changed no file, so there is no Undo step and no history entry');
  });

  it('the banner counts; "+N new" vocabulary', () => {
    expect(diffCountsText(adoptedProposal())).toBe('1 new · 2 changed · +1 vocabulary');
    expect(diffCountsText(normativeProposal())).toBe('2 changed');
    expect(diffCountsText(normativeProposal({ diff: { ...normativeProposal().diff, counts: { added: 0, changed: 0, removed: 0, vocabularyAdded: 0 } }, empty: true }))).toBe('no file changes');
    expect(newVocabularyCount(literalProposal().diff)).toBe(1);
    expect(newVocabularyCount(normativeProposal().diff)).toBe(0);
  });

  it('suggestions waiting for a decision come from the live run, else from the proposal', () => {
    const proposal = literalProposal();
    expect(suggestedGhosts(null, proposal).map((g) => g.id)).toEqual(['ghost-1']);
    expect(suggestedGhosts(reviewRun(proposal, { ghosts: [literalGhost({ state: 'rejected' })] }), proposal)).toEqual([]);
    expect(suggestedGhosts(reviewRun(proposal, { runId: 'other' }), proposal).map((g) => g.id)).toEqual(['ghost-1']);
  });
});

describe('the proposal overlay', () => {
  it('shows the proposal’s graph; with the result hidden, the target and every card whose proof changed hide it, and verified arrows into them go', () => {
    const proposal = adoptedProposal();
    const current = spyroGraph();
    const hidden = buildOverlay(proposal, { nodes: Object.fromEntries(current.nodes.map((n) => [n.id, n])), vocabulary: current.vocabulary }, true);
    expect(Object.keys(hidden.nodes).sort()).toEqual([...current.nodes.map((n) => n.id), ADOPTED_ID].sort());
    expect(hidden.order.AXIOM).toContain(ADOPTED_ID);
    expect([...hidden.hidden].sort()).toEqual([ADOPTED_ID, TARGET].sort());
    expect(hidden.edges.some((e) => e.type === 'verified' && e.target === TARGET)).toBe(false);
    expect(hidden.edges.some((e) => e.type === 'premise' && e.target === TARGET)).toBe(true);
    expect(hidden.vocab.get('Spyro.InGame')?.glossBy).toBe('agent');
    const shown = buildOverlay(proposal, { nodes: {}, vocabulary: [] }, false);
    expect(shown.hidden.size).toBe(0);
    expect(shown.edges).toBe(proposal.graph.edges);
  });

  it('cards and vocabulary the proposal removes are shown from the current board', () => {
    const current = spyroGraph();
    const nodes = Object.fromEntries(current.nodes.map((n) => [n.id, n]));
    const proposal = normativeProposal({
      graph: { ...normativeProposal().graph, nodes: normativeProposal().graph.nodes.filter((n) => n.id !== 'new-spyro-pg'), vocabulary: normativeProposal().graph.vocabulary.filter((v) => v.name !== 'Spyro.IsPG') },
      diff: { ...normativeProposal().diff, nodes: { ...normativeProposal().diff.nodes, 'new-spyro-pg': { change: 'removed', fields: [] } }, vocabulary: { 'Spyro.IsPG': 'removed' } },
    });
    const overlay = buildOverlay(proposal, { nodes, vocabulary: current.vocabulary }, false);
    expect(overlay.nodes['new-spyro-pg']).toBe(nodes['new-spyro-pg']);
    expect(overlay.order.AXIOM.at(-1)).toBe('new-spyro-pg');
    expect(overlay.vocab.has('Spyro.IsPG')).toBe(true);
  });

  it('spec v4.1 RV-6 (slice 1d): a card downstream whose proof status the proposal changes hides its result too; drawn arrows into a hidden card say nothing of its proof', () => {
    const current = spyroGraph();
    const base = normativeProposal();
    const downstream = (flags: TlNode['status']['flags'], footprint: string[]) =>
      makeNode('downstream', 'PROPOSITION', 'Cynder stays out', { proof: { kind: 'proved', footprint }, flags, direct: { ids: [TARGET], from: 'proof' } }, { premises: [TARGET] });
    const same = makeNode('same', 'PROPOSITION', 'Unchanged', { proof: { kind: 'proved', footprint: ['cynder-dark-past'] }, flags: ['established'], direct: { ids: ['cynder-dark-past'], from: 'proof' } });
    const nodes = Object.fromEntries([...current.nodes, downstream(['rests-on-pending'], [TARGET]), same].map((n) => [n.id, n]));
    const unused = { id: `premise:new-spyro-pg->${TARGET}`, type: 'premise' as const, source: 'new-spyro-pg', target: TARGET, origin: 'declared' as const, mismatch: 'declared-unused' as const };
    const proposal = normativeProposal({
      graph: {
        ...base.graph,
        nodes: [...base.graph.nodes, downstream(['established'], ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']), same],
        edges: base.graph.edges.map((e) => (e.id === unused.id ? unused : e)),
      },
    });
    const hidden = buildOverlay(proposal, { nodes, vocabulary: current.vocabulary }, true);
    expect([...hidden.hidden].sort()).toEqual(['downstream', TARGET].sort());
    expect(hidden.edges.find((e) => e.id === unused.id)?.mismatch).toBeUndefined();
    const shown = buildOverlay(proposal, { nodes, vocabulary: current.vocabulary }, false);
    expect(shown.hidden.size).toBe(0);
    expect(shown.edges.find((e) => e.id === unused.id)?.mismatch).toBe('declared-unused');
    // What the card face hides meanwhile: the established, reason and band-telling chips too.
    for (const key of ['established', 'rests-on-pending', 'hidden-assumption', 'uses-unseen', 'conditional', 'pending', 'self-evident']) expect(RESULT_CHIP_KEYS.has(key), key).toBe(true);
    // An axiom card that only gets its `.holds` tells no result.
    expect(resultSignature(makeNode('a', 'AXIOM', 'a', { proof: { kind: 'none' } }))).toBe(resultSignature(makeNode('a', 'AXIOM', 'a', { proof: { kind: 'assumed' } })));
  });

  it('a diff mark’s tooltip leaves out the fields that would tell the result while it is hidden', () => {
    expect(diffTitle({ change: 'changed', fields: ['proof', 'status'] }, true)).toBe('Changed in the proposal');
    expect(diffTitle({ change: 'changed', fields: ['proof', 'status'] }, false)).toBe('Changed in the proposal: proof, status');
    expect(diffTitle({ change: 'changed', fields: ['statement', 'binding', 'status'] }, true)).toBe('Changed in the proposal: Lean statement, Lean binding');
    expect(diffTitle({ change: 'added', fields: [] }, true)).toBe('New in the proposal');
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
