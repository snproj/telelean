/**
 * Slice 2g (docs/slice2-plan.md 5.8; CM-6): the session bar above the board, in place of ProposalBanner during an
 * edit session. Left: "Edit session · Formalize for dependencies: “T”", "Stage N" and the phase text; the Current |
 * Proposed switch; right: Cancel step and Resume (while a step runs or is interrupted), Retry step (with a heading),
 * Raw Lean diff… (it asks first while the results are hidden), Submit review (the primary button; disabled, its reason
 * with "Go to the first one"), Exit session…, and "Review (N)" while the panel is hidden. Second lines: the ES-4
 * heading, ES-7 drift, "Re-checking the working copy…", and the stage's problems with links to their items. Its state is
 * `sessionBarState` (model/sessionBar.ts); the gates are the host's. 2j2 (D2-92, D2-98): when Submit review starts
 * Claude's steps, it opens Submit's panel under the first line: what Submit does, "Comment for Claude (optional)",
 * Submit and Cancel.
 */
import { LIMITS, REVIEW_TEXTS, type RunView, type SessionView } from '@telelean/core';
import { useLayoutEffect, useRef } from 'react';
import { sessionBarState } from '../model/sessionBar';
import { useBoard, useBoardActions } from '../state/context';
import { proposedOverlay } from '../state/store';
import { ItemLink, Label, Marked, usePhrases } from './review/parts';

/** The session on this board's subject, if any. */
function useSessionOnScreen() {
  return useBoard((s) => (s.session && s.session.subject === s.subject ? s.session : null));
}

export function SessionBar() {
  const session = useSessionOnScreen();
  const run = useBoard((s) => (s.run && s.session && s.run.runId === s.session.runId ? s.run : null));
  const open = useBoard((s) => s.runPanelOpen);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const sessionBusy = useBoard((s) => s.sessionBusy !== null);
  const runBusy = useBoard((s) => s.runBusy?.action ?? null);
  if (session === null) return null;
  return <Bar session={session} run={run} open={open} proposed={proposed} sessionBusy={sessionBusy} runBusy={runBusy} />;
}

function Bar({
  session,
  run,
  open,
  proposed,
  sessionBusy,
  runBusy,
}: {
  session: SessionView;
  run: RunView | null;
  open: boolean;
  proposed: boolean;
  sessionBusy: boolean;
  runBusy: string | null;
}) {
  const actions = useBoardActions();
  const phrases = usePhrases(session);
  const state = sessionBarState(session, run, open);
  const goTo = (id: string) => {
    actions.setRunPanelOpen(true);
    actions.focusItem(id);
  };
  return (
    <div className="tl-banner tl-session-bar" data-testid="session-bar" data-phase={session.phase} role="region" aria-label={REVIEW_TEXTS.panelLabel} data-undo-scope="session">
      <div className="tl-session-bar__main">
        <span className="codicon codicon-git-pull-request" aria-hidden="true" />
        <span className="tl-session-bar__title" data-testid="session-title">
          <Label parts={state.title} />
        </span>
        {state.stage !== null ? (
          <span className="tl-session-bar__stage" data-testid="session-stage">
            {state.stage}
          </span>
        ) : null}
        <span className="tl-session-bar__phase" data-testid="session-phase" role="status">
          <Label parts={state.phase} />
          {state.phaseNote !== null ? <span className="tl-run__hint"> {state.phaseNote}</span> : null}
        </span>
        <span className="tl-seg tl-seg--small" role="radiogroup" aria-label="Board shows" data-testid="session-toggle">
          <button type="button" role="radio" aria-checked={!proposed} tabIndex={proposed ? -1 : 0} onClick={() => actions.setProposedView(false)}>
            Current
          </button>
          <button type="button" role="radio" aria-checked={proposed} tabIndex={proposed ? 0 : -1} onClick={() => actions.setProposedView(true)}>
            Proposed
          </button>
        </span>
        <span className="tl-toolbar__spacer" />
        {state.cancelStep.shown ? (
          <button
            type="button"
            className="tl-button tl-button--secondary tl-button--small"
            data-testid="session-cancel-step"
            disabled={runBusy === 'cancel'}
            title={state.cancelStep.title}
            onClick={() => actions.cancelRun()}
          >
            {REVIEW_TEXTS.cancelStep}
          </button>
        ) : null}
        {state.resume.shown ? (
          <button type="button" className="tl-button tl-button--small" data-testid="session-resume" disabled={!state.resume.enabled || runBusy !== null} title={state.resume.title} onClick={() => actions.resumeRun()}>
            {REVIEW_TEXTS.resume}
          </button>
        ) : null}
        {state.retry.shown ? (
          <button
            type="button"
            className="tl-button tl-button--secondary tl-button--small"
            data-testid="session-retry"
            disabled={!state.retry.enabled || sessionBusy}
            title={state.retry.title}
            onClick={() => actions.retryStep()}
          >
            {REVIEW_TEXTS.retryStep}
          </button>
        ) : null}
        {state.rawDiff.shown ? (
          <button
            type="button"
            className="tl-button tl-button--secondary tl-button--small"
            data-testid="session-raw-diff"
            data-asks={state.rawDiff.asks || undefined}
            disabled={sessionBusy}
            title={state.rawDiff.title}
            onClick={() => actions.openSessionDiff()}
          >
            {REVIEW_TEXTS.rawDiff}
          </button>
        ) : null}
        {state.submit.shown ? (
          <button type="button" className="tl-button tl-button--small" data-testid="session-submit" disabled={!state.submit.enabled || sessionBusy} title={state.submit.title} onClick={() => actions.submitReview()}>
            {REVIEW_TEXTS.submitReview}
          </button>
        ) : null}
        {state.submit.reason !== null ? (
          <span className="tl-session-bar__reason" data-testid="session-submit-reason">
            <Marked text={state.submit.reason} phrases={phrases} />
          </span>
        ) : null}
        {state.submit.shown && !state.submit.enabled && state.submit.missing[0] !== undefined ? (
          <button type="button" className="tl-link tl-session-bar__go" data-testid="session-go-first" onClick={() => goTo(state.submit.missing[0] as string)}>
            {REVIEW_TEXTS.goToFirst}
          </button>
        ) : null}
        {state.exit.shown ? (
          <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="session-exit" onClick={() => actions.openExitSession()}>
            {REVIEW_TEXTS.exitSessionEllipsis}
          </button>
        ) : null}
        {state.review.shown ? (
          <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="session-review-n" onClick={() => actions.setRunPanelOpen(true)}>
            {state.review.text}
          </button>
        ) : null}
      </div>
      {state.submit.shown ? <SubmitPanel session={session} sessionBusy={sessionBusy} /> : null}
      {state.lines.map((line, i) => (
        <p key={`${line.kind}-${i}`} className="tl-session-bar__line" data-testid={`session-line-${line.kind}`} data-kind={line.kind}>
          <span className={`codicon codicon-${line.kind === 'judging' ? 'loading codicon-modifier-spin' : line.kind === 'drift' || line.kind === 'problem' ? 'warning' : 'info'}`} aria-hidden="true" />{' '}
          <Marked text={line.text} phrases={phrases} />
          {line.items.map((id) => (
            <span key={id}>
              {' '}
              <ItemLink id={id} session={session} onOpen={goTo} />
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

/** 2j2 (D2-92, D2-98): Submit's panel, while Submit review starts Claude's steps and the panel is open. */
function SubmitPanel({ session, sessionBusy }: { session: SessionView; sessionBusy: boolean }) {
  const panel = useBoard((s) => s.submitPanel);
  const actions = useBoardActions();
  const box = useRef<HTMLTextAreaElement>(null);
  const open = panel !== null;
  useLayoutEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  const work = session.submit.work;
  if (panel === null || session.submit.next !== 'claude-steps' || work === undefined) return null;
  return (
    <div
      className="tl-session-bar__submit"
      data-testid="session-submit-panel"
      role="group"
      aria-label={REVIEW_TEXTS.submitReview}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        actions.closeSubmitPanel();
      }}
    >
      <p className="tl-session-bar__submit-text" data-testid="session-submit-what">
        {REVIEW_TEXTS.submitSteps(work.shaky, work.redo)}
      </p>
      <label className="tl-decline__label" htmlFor="tl-submit-comment">
        {REVIEW_TEXTS.commentForClaude}
      </label>
      <textarea
        id="tl-submit-comment"
        ref={box}
        className="tl-input tl-decline__text"
        data-testid="session-submit-comment"
        rows={3}
        maxLength={LIMITS.textLength}
        value={panel.comment}
        onChange={(event) => actions.setSubmitComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            actions.confirmSubmit();
          }
        }}
      />
      <div className="tl-decline__buttons">
        <button type="button" className="tl-button tl-button--small" data-testid="session-submit-confirm" disabled={sessionBusy || !session.submit.gate.ok} onClick={() => actions.confirmSubmit()}>
          {REVIEW_TEXTS.submitPanelSubmit}
        </button>
        <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="session-submit-cancel" onClick={() => actions.closeSubmitPanel()}>
          {REVIEW_TEXTS.submitPanelCancel}
        </button>
      </div>
    </div>
  );
}
