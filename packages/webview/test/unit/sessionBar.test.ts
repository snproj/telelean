/**
 * Slice 2g (docs/slice2-plan.md 5.8, 5.9, 5.13, 6.1): the session bar's state for every phase and heading, the Submit
 * texts, Cancel step's tooltip, drift, judging and the stage's problems; the badge (never a verdict); the Exit dialog's
 * counts (listed items only); the end confirmation's Apply (closed while the check runs, after it fails, and on drift).
 */
import { REVIEW_TEXTS, type SessionView } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import { partsText } from '../../src/model/review';
import { CANCEL_STEP_TITLE, confirmationModel, exitCounts, FINAL_CHECK_RULE_LABEL, headingLine, sessionBadgeText, sessionBarState } from '../../src/model/sessionBar';
import { allAcceptedStage, AT, closed, confirmation, confirmingSession, firstQueue, hiddenPair, hiddenStage, IDS, OPEN, sessionRun, shownStage, stepSession } from '../shared/sessions';

const T = 'Cynder would not be a good addition to the new Spyro game';
const bar = (session: SessionView, run = sessionRun(session), panelOpen = true) => sessionBarState(session, run, panelOpen);

describe('the session bar, phase by phase (§5.8, §5.13)', () => {
  it('the left side: the session, the stage, the phase text; the target in its author’s style', () => {
    const state = bar(hiddenStage());
    expect(partsText(state.title)).toBe(REVIEW_TEXTS.sessionTitle([T]));
    expect(state.title.find((p) => p.kind === 'words')).toEqual({ kind: 'words', text: T, by: 'user' });
    expect(state.stage).toBe('Stage 1');
    expect(partsText(state.phase)).toBe('Review: 3 in review · 0 accepted · results after the review');
    expect(partsText(bar(shownStage()).phase)).toBe('Review: 6 in review · 0 accepted');
    expect(partsText(bar(shownStage({ vocab: 'accepted', formalize: 'accepted' })).phase)).toBe('Review: 4 in review · 2 accepted');
    const several = hiddenStage({ inferences: [...hiddenStage().inferences, { ...hiddenStage().inferences[0]!, target: { id: 'x', type: 'PROPOSITION', sentence: 'X', wordedBy: 'user' }, order: 1 }] });
    expect(partsText(bar(several).title)).toBe('Edit session · Formalize for dependencies · 2 targets');
    // Before the first stage opens there is no stage to name.
    expect(bar(firstQueue()).stage).toBeNull();
  });

  it('step: "Claude’s step for “T” (1 of 2): working · proving" (or formalising, waiting, checking), the review waits; Cancel step with the steps left', () => {
    const session = stepSession();
    const state = bar(session);
    expect(partsText(state.phase)).toBe(REVIEW_TEXTS.stepPhase(T, 1, 2, REVIEW_TEXTS.stepWorking('prove')));
    expect(state.phaseNote).toBe(REVIEW_TEXTS.reviewWaits);
    expect(partsText(bar(session, sessionRun(session, { stage: 'formalise' })).phase)).toContain('working · formalising');
    expect(partsText(bar(session, sessionRun(session, { state: 'waiting-for-answer' })).phase)).toContain(REVIEW_TEXTS.stepWaiting);
    expect(partsText(bar(session, sessionRun(session, { state: 'gate' })).phase)).toContain(REVIEW_TEXTS.stepChecking);
    expect(state.cancelStep).toEqual({ shown: true, enabled: true, title: REVIEW_TEXTS.cancelStepRest(1) });
    const last = stepSession({ steps: [{ id: 's2', index: 2, of: 2, kind: 'submit', target: 'cynder-not-good', state: 'running', activity: 'withheld' }] });
    expect(bar(last).cancelStep.title).toBe(CANCEL_STEP_TITLE);
    // Submit is off while a step runs (D2-62), even with a gate the host left open; no Raw diff, no Resume.
    expect(state.submit).toMatchObject({ shown: true, enabled: false, title: REVIEW_TEXTS.stepRunning });
    expect(bar(stepSession({ submit: { gate: OPEN, next: 'confirm' } })).submit).toMatchObject({ enabled: false, title: REVIEW_TEXTS.stepRunning });
    expect(state.rawDiff.shown).toBe(false);
    expect(state.resume.shown).toBe(false);
    expect(state.exit.shown).toBe(true);
  });

  it('interrupted: its text, Cancel step and Resume (enabled only when the run can resume), Exit', () => {
    const session = stepSession({ phase: 'interrupted' });
    const state = bar(session, sessionRun(session, { canResume: true }));
    expect(partsText(state.phase)).toBe(REVIEW_TEXTS.interruptedPhase);
    expect(state.cancelStep.shown).toBe(true);
    expect(state.resume).toMatchObject({ shown: true, enabled: true });
    expect(bar(session, sessionRun(session, { canResume: false })).resume.enabled).toBe(false);
  });

  it('stage: Raw Lean diff… asks first while the results are hidden; Submit says why it is closed, with the items to go to', () => {
    const hidden = bar(hiddenStage());
    expect(hidden.rawDiff).toEqual({ shown: true, enabled: true, title: REVIEW_TEXTS.rawDiffReveals, asks: true });
    expect(bar(shownStage()).rawDiff).toMatchObject({ asks: false, title: REVIEW_TEXTS.rawDiff });
    expect(hidden.submit).toEqual({ shown: true, enabled: false, title: REVIEW_TEXTS.submitInReview(3), missing: [IDS.vocab, IDS.formalize, IDS.definition] });
    expect(hidden.cancelStep.shown).toBe(false);
  });

  it('the Submit texts: to the end confirmation (no Claude step), or Claude’s next steps for N Shaky and M to be redone', () => {
    expect(bar(allAcceptedStage()).submit).toEqual({ shown: true, enabled: true, title: REVIEW_TEXTS.submitToConfirm, missing: [] });
    const steps = shownStage({}, { submit: { gate: OPEN, next: 'claude-steps', work: { shaky: 2, redo: 1, steps: 1 } } });
    expect(bar(steps).submit.title).toBe(REVIEW_TEXTS.submitSteps(2, 1));
    expect(bar(steps).submit.title).toBe("Starts Claude's next steps for 2 Shaky items and 1 to be redone; accepted items carry over");
  });

  it('confirming and applying: their texts; no Submit or Raw diff; no Exit while Apply runs', () => {
    const confirming = bar(confirmingSession());
    expect(partsText(confirming.phase)).toBe(REVIEW_TEXTS.confirmingPhase);
    expect(confirming.submit.shown).toBe(false);
    expect(confirming.rawDiff.shown).toBe(false);
    expect(confirming.exit.shown).toBe(true);
    const applying = bar(confirmingSession({}, { phase: 'applying' }));
    expect(partsText(applying.phase)).toBe(REVIEW_TEXTS.applyingNow);
    expect(applying.exit.shown).toBe(false);
  });

  it('the ES-4 headings with Retry step: a step that did not pass, a decision’s heading, cancelled, failed; Retry’s gate', () => {
    const reason = 'the arrow is not used';
    const step = { kind: 'did-not-pass' as const, text: REVIEW_TEXTS.didNotPass(reason), firstStep: false, retry: OPEN };
    expect(headingLine(step)).toBe(REVIEW_TEXTS.didNotPassBar(reason));
    const decided = { ...step, text: 'Your decisions leave a working copy that does not pass its checks' };
    expect(headingLine(decided)).toBe(
      'Your decisions leave a working copy that does not pass its checks. You can decline, formalize again or exit; nothing can be accepted until a later step passes.',
    );
    expect(headingLine({ ...step, kind: 'cancelled', text: REVIEW_TEXTS.stepCancelled })).toBe('Step cancelled');
    expect(headingLine({ ...step, kind: 'failed', text: REVIEW_TEXTS.stepFailed('the cap') })).toBe('Step failed: the cap');
    const state = bar(shownStage({}, { heading: { ...step, kind: 'cancelled', text: REVIEW_TEXTS.stepCancelled } }));
    expect(state.lines).toEqual([{ kind: 'heading', text: 'Step cancelled', items: [] }]);
    expect(state.retry).toEqual({ shown: true, enabled: true, title: REVIEW_TEXTS.retryStep });
    const closedRetry = bar(shownStage({}, { heading: { ...step, retry: closed(REVIEW_TEXTS.nothingToRetry) } }));
    expect(closedRetry.retry).toEqual({ shown: true, enabled: false, title: REVIEW_TEXTS.nothingToRetry });
    expect(bar(shownStage()).retry.shown).toBe(false);
  });

  it('second lines: drift (ES-7), judging, the stage’s problems with their items; "Review (N)" when the panel is hidden', () => {
    const session = shownStage({}, { drift: { files: ['Model/Spyro/Main.lean'], at: AT }, judging: true, problems: [{ text: 'gone', items: [IDS.formalize] }] });
    expect(bar(session).lines).toEqual([
      { kind: 'drift', text: REVIEW_TEXTS.drift(['Model/Spyro/Main.lean']), items: [] },
      { kind: 'judging', text: REVIEW_TEXTS.judging, items: [] },
      { kind: 'problem', text: 'gone', items: [IDS.formalize] },
    ]);
    expect(bar(session, sessionRun(session), false).review).toMatchObject({ shown: true, text: 'Review (6)' });
    expect(bar(session).review.shown).toBe(false);
  });
});

describe('the badge, the Exit dialog, the end confirmation', () => {
  it('the badge never says proved or not proved in a session: "Edit session: Claude working · Spyro · 3/25 checks", "Edit session: review · Spyro"', () => {
    const step = stepSession();
    expect(sessionBadgeText(step, sessionRun(step))).toBe(REVIEW_TEXTS.badgeWorking('Spyro', 3, 25));
    expect(sessionBadgeText(hiddenStage(), sessionRun(hiddenStage()))).toBe('Edit session: review · Spyro');
    const sessions = [hiddenStage(), shownStage(), allAcceptedStage(), step, stepSession({ phase: 'interrupted' }), firstQueue(), confirmingSession(), confirmingSession({ state: 'failed' })];
    for (const s of sessions) for (const verdict of ['proved', 'gave-up', 'cap-reached'] as const) expect(sessionBadgeText(s, sessionRun(s, { verdict }))).not.toMatch(/proved|established|gave up/i);
  });

  it('the badge says so in the phases where nothing can be decided: interrupted, confirming, applying (F-V2G-FC-3)', () => {
    const interrupted = stepSession({ phase: 'interrupted' });
    expect(sessionBadgeText(interrupted, sessionRun(interrupted))).toBe('Edit session: interrupted · Spyro');
    expect(sessionBadgeText(confirmingSession(), sessionRun(confirmingSession()))).toBe('Edit session: confirming · Spyro');
    const applying = confirmingSession({}, { phase: 'applying' });
    expect(sessionBadgeText(applying, sessionRun(applying))).toBe('Edit session: applying · Spyro');
    expect(sessionBadgeText(hiddenStage(), null)).toBe('Edit session: review · Spyro');
    expect(sessionBadgeText(shownStage(), null)).toBe('Edit session: review · Spyro');
  });

  it('the Exit dialog counts listed items only (a hidden Result is not one), and says when a step runs', () => {
    expect(exitCounts(hiddenStage())).toEqual({ accepted: 0, inReview: 3, stepRunning: false });
    expect(exitCounts(allAcceptedStage())).toEqual({ accepted: 6, inReview: 0, stepRunning: false });
    expect(exitCounts(stepSession())).toMatchObject({ stepRunning: true });
    expect(REVIEW_TEXTS.exitConfirm(0, 3, false)).toBe(
      "Exit the edit session? This discards 0 accepted items and 3 items in review. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone.",
    );
  });

  it('Apply: enabled only on a passed check with no drift; disabled while the check runs, after it fails, on drift (even when the gate says open), while judging', () => {
    const passed = confirmingSession();
    expect(confirmationModel(passed, passed.confirmation!)).toEqual({
      check: { id: 'chk-1', state: 'passed', text: REVIEW_TEXTS.finalCheckPassed, reused: true },
      failures: [],
      apply: { enabled: true, title: REVIEW_TEXTS.applyWrites },
    });
    const empty = confirmation({}, { empty: true });
    expect(confirmationModel(passed, empty).apply).toEqual({ enabled: true, title: REVIEW_TEXTS.applyRecords });
    const running = confirmingSession({ state: 'running' });
    expect(confirmationModel(running, running.confirmation!)).toMatchObject({ check: { text: REVIEW_TEXTS.finalCheckRunning }, apply: { enabled: false, title: REVIEW_TEXTS.applyWaitsForCheck } });
    const failed = confirmingSession({ state: 'failed', failures: [{ rule: 'backstop', text: 'unowned', items: [IDS.definition], declaration: 'Spyro.IsEvil' }] });
    expect(confirmationModel(failed, failed.confirmation!)).toMatchObject({
      apply: { enabled: false, title: REVIEW_TEXTS.applyCheckFailed },
      failures: [{ rule: FINAL_CHECK_RULE_LABEL.backstop, text: 'unowned', items: [IDS.definition], declaration: 'Spyro.IsEvil' }],
    });
    // The host's gate open, but the check running or failed: closed anyway (EN-2).
    expect(confirmationModel(running, { ...running.confirmation!, apply: OPEN }).apply).toEqual({ enabled: false, title: REVIEW_TEXTS.applyWaitsForCheck });
    expect(confirmationModel(failed, { ...failed.confirmation!, apply: OPEN }).apply).toEqual({ enabled: false, title: REVIEW_TEXTS.applyCheckFailed });
    // The host's gate open, but the files drift: closed anyway (ES-7).
    const drift = confirmingSession({}, { drift: { files: ['Model.lean'], at: AT } });
    expect(confirmationModel(drift, drift.confirmation!).apply).toEqual({ enabled: false, title: REVIEW_TEXTS.drift(['Model.lean']) });
    // The host's gate closed (drift, as it says): its reason.
    const gate = confirmation({}, { apply: closed('Your files changed') });
    expect(confirmationModel(passed, gate).apply).toEqual({ enabled: false, title: 'Your files changed' });
    expect(confirmationModel({ ...passed, judging: true }, passed.confirmation!).apply).toEqual({ enabled: false, title: REVIEW_TEXTS.judging });
    expect(confirmationModel({ ...passed, phase: 'applying' }, passed.confirmation!).apply.enabled).toBe(false);
  });
});

describe('the fixture pair (§6.1): proved and not proved, results hidden', () => {
  it('the host sends the same view; the runs differ only in the accepted residuals; the bar and the badge read the same', () => {
    const { proved, notProved } = hiddenPair();
    expect(JSON.stringify(proved.session)).toBe(JSON.stringify(notProved.session));
    expect(proved.run.counters).not.toEqual(notProved.run.counters);
    expect(JSON.stringify(sessionBarState(proved.session, proved.run, true))).toBe(JSON.stringify(sessionBarState(notProved.session, notProved.run, true)));
    expect(JSON.stringify(sessionBarState(proved.session, proved.run, false))).toBe(JSON.stringify(sessionBarState(notProved.session, notProved.run, false)));
    expect(sessionBadgeText(proved.session, proved.run)).toBe(sessionBadgeText(notProved.session, notProved.run));
  });
});
