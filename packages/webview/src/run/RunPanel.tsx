/**
 * The run panel (docs/m2-plan.md section 6.4): the board's own subject's Claude run, beside the board (below it on a
 * narrow board):
 *  - the status line: state and stage, round, checks n/25, turns n/80, agent time (paused while a question waits),
 *    check attempts k/3, tokens, the cost "estimate" and the rate limit (D-25), with Cancel;
 *  - the pending question cards (D-20);
 *  - A2's notices (an attempt that did not pass, giving up, the revert, a cap, an environment problem): while Claude
 *    works all of them; once the round ended, the ones that explain how it ended come before the review and the rest
 *    are folded below it (`placeNotices`);
 *  - the review stepper with the report card and Accept / Feedback / Discard (D-19, D-21);
 *  - Resume / Stop for an interrupted run, the outcome of an ended run with Dismiss;
 *  - the answered questions with Claude's guess revealed (D-20);
 *  - the activity feed, where Claude's own messages are italic with a marker (D-15).
 * Its edge towards the board is a handle that resizes it (RunSplitter). Closing the panel (or the board) never stops
 * the run; the header's run badge opens it again.
 */
import type { RunActivity, RunNotice, RunView } from '@telelean/core';
import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { AgentText, UserText } from '../common/AgentText';
import { InlineCode } from '../common/InlineCode';
import { useNow } from '../common/useNow';
import { NOTICE_ICON } from '../labels';
import { clockRuns, endedOutcome, ENDED_TEXT, formatClock, placeNotices, runStateLabel, runStatusParts } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { clampSplit, type RunPanelLayout } from '../state/store';
import { AnsweredQuestions, QuestionSet } from './Questions';
import { Review } from './Review';

/** The width below which board.css puts the run panel under the board (keep the two in sync). */
export const NARROW_QUERY = '(max-width: 1000px)';

function subscribeNarrow(onChange: () => void): () => void {
  const query = matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const narrowNow = () => matchMedia(NARROW_QUERY).matches;

/** Whether the board is narrow (the run panel is then below it). */
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowNow);
}

/**
 * Pixel limits of a dragged size (board.css repeats them as min/max sizes, which also hold after a window resize):
 * below the board the panel and the board keep a usable height; beside it, the panel a usable width and the board at
 * least about two columns.
 */
const SPLIT_PX: Readonly<Record<RunPanelLayout, { panelMin: number; boardMin: number }>> = {
  narrow: { panelMin: 120, boardMin: 140 },
  wide: { panelMin: 260, boardMin: 560 },
};

/** One arrow-key press changes the panel by this fraction of the workspace. */
const SPLIT_STEP = 0.05;

/** The panel's size and the workspace's along the layout's axis (null while not laid out). */
function measureSplit(panel: HTMLElement | null, layout: RunPanelLayout): { size: number; total: number } | null {
  const workspace = panel?.parentElement;
  if (!panel || !workspace) return null;
  const p = panel.getBoundingClientRect();
  const w = workspace.getBoundingClientRect();
  const total = layout === 'narrow' ? w.height : w.width;
  return total > 0 ? { size: layout === 'narrow' ? p.height : p.width, total } : null;
}

/** A panel size in px, kept within the limits, as a fraction of the workspace. */
function splitFraction(size: number, total: number, layout: RunPanelLayout): number {
  const { panelMin, boardMin } = SPLIT_PX[layout];
  const max = Math.max(panelMin, total - boardMin);
  return clampSplit(Math.min(max, Math.max(panelMin, size)) / total);
}

/** Shows `fraction` on the panel at once (through the CSSOM: the CSP allows no style attributes). */
function showSplit(panel: HTMLElement, fraction: number): void {
  panel.style.setProperty('--tl-run-size', `${(fraction * 100).toFixed(1)}%`);
  panel.dataset.sized = 'true';
}

/**
 * The handle on the panel's edge towards the board (its top edge below the board, its left edge beside it): drag it,
 * or focus it and use the arrow keys (Home/End: smallest/largest), to give the panel more or less room; a double click
 * or Enter goes back to the default size. The size is kept per layout in the webview state.
 */
function RunSplitter({ panel, layout }: { panel: RefObject<HTMLElement | null>; layout: RunPanelLayout }) {
  const actions = useBoardActions();
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; start: number; size: number; total: number; fraction: number | null } | null>(null);

  // The separator's value is the panel's share of the workspace, as laid out.
  useLayoutEffect(() => {
    const m = measureSplit(panel.current, layout);
    if (m) handle.current?.setAttribute('aria-valuenow', String(Math.round((m.size / m.total) * 100)));
  });

  const axis = (event: PointerEvent) => (layout === 'narrow' ? event.clientY : event.clientX);
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null;
    delete panel.current?.parentElement?.dataset.resizing;
    if (d.fraction !== null) actions.setRunSplit(layout, d.fraction);
  };
  const nudge = (fraction: number) => {
    const m = measureSplit(panel.current, layout);
    if (!m || !panel.current) return;
    const next = splitFraction(fraction * m.total, m.total, layout);
    showSplit(panel.current, next);
    actions.setRunSplit(layout, next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const m = measureSplit(panel.current, layout);
    if (!m) return;
    // From the size on screen (the CSS limits may hold the panel at another size than the stored one).
    const now = m.size / m.total;
    const grow = layout === 'narrow' ? 'ArrowUp' : 'ArrowLeft';
    const shrink = layout === 'narrow' ? 'ArrowDown' : 'ArrowRight';
    if (event.key === grow) nudge(now + SPLIT_STEP);
    else if (event.key === shrink) nudge(now - SPLIT_STEP);
    else if (event.key === 'Home') nudge(0);
    else if (event.key === 'End') nudge(1);
    else if (event.key === 'Enter') actions.setRunSplit(layout, null);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={handle}
      className="tl-run__resize"
      data-testid="run-resize"
      role="separator"
      tabIndex={0}
      aria-orientation={layout === 'narrow' ? 'horizontal' : 'vertical'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Resize the run panel"
      title={`Drag to give the run panel more or less room (or focus and use ${layout === 'narrow' ? '↑ ↓' : '← →'}); double-click for the default size`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const m = measureSplit(panel.current, layout);
        if (!m) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, start: axis(event), size: m.size, total: m.total, fraction: null };
        const workspace = panel.current?.parentElement;
        if (workspace) workspace.dataset.resizing = layout;
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.pointer !== event.pointerId || !panel.current) return;
        // The panel is below the handle (narrow) or right of it (wide): moving the pointer up or left makes it bigger.
        d.fraction = splitFraction(d.size - (axis(event) - d.start), d.total, layout);
        showSplit(panel.current, d.fraction);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => actions.setRunSplit(layout, null)}
      onKeyDown={onKeyDown}
    />
  );
}

function StatusLine({ run }: { run: RunView }) {
  const now = useNow(clockRuns(run));
  const parts = runStatusParts(run, now);
  return (
    <div className="tl-run__stats" data-testid="run-stats">
      {parts.map((part) => (
        <span key={part.key} className="tl-run__stat" data-part={part.key} data-tone={part.tone} title={part.title}>
          {part.text}
        </span>
      ))}
    </div>
  );
}

function Target({ run }: { run: RunView }) {
  const nodes = useBoard((s) => s.nodes);
  const target = nodes[run.target];
  const premises = run.premises.map((id) => nodes[id]?.naturalName ?? id);
  return (
    <p className="tl-run__target" data-testid="run-target">
      {/* Spec v4.1 ES-2, AR-5 (slice 1e): the action's name, or its "follows from nothing" question. */}
      <span className="tl-run__target-label">{run.premises.length === 0 ? 'Follows from nothing?' : 'Formalize for dependencies:'}</span> “
      <UserText text={target?.naturalName ?? run.target} />”{' '}
      <span className="tl-run__hint" title={premises.join('\n')}>
        {run.premises.length === 0 ? 'from no premises at all' : `from ${run.premises.length} premise${run.premises.length === 1 ? '' : 's'}`}
      </span>
    </p>
  );
}

function NoticeList({ notices }: { notices: readonly RunNotice[] }) {
  return (
    <ul className="tl-notices" aria-live="polite">
      {notices.map((notice) => (
        <li key={notice.id} className="tl-notice" data-testid="run-notice" data-kind={notice.kind} data-level={notice.level}>
          <span className={`codicon codicon-${NOTICE_ICON[notice.kind]}`} aria-hidden="true" />
          <div className="tl-notice__body">
            <span className="tl-notice__text">
              <InlineCode text={notice.text} />
            </span>
            {notice.detail ? (
              <details className="tl-notice__detail">
                <summary>Details</summary>
                <pre>{notice.detail}</pre>
              </details>
            ) : null}
          </div>
          <time className="tl-run__time" dateTime={notice.at}>
            {formatClock(notice.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** Notices before the review (`upfront`), or the earlier ones folded below it. */
function Notices({ notices, folded = false }: { notices: readonly RunNotice[]; folded?: boolean }) {
  if (notices.length === 0) return null;
  if (folded) {
    return (
      <details className="tl-run__section tl-run__more" data-testid="run-notices-earlier">
        <summary>Earlier notices ({notices.length})</summary>
        <NoticeList notices={notices} />
      </details>
    );
  }
  return (
    <section className="tl-run__section" data-testid="run-notices" aria-label="Notices">
      <NoticeList notices={notices} />
    </section>
  );
}

const ACTIVITY_ICON: Readonly<Record<RunActivity['kind'], string>> = {
  'claude-text': 'comment',
  tool: 'tools',
  check: 'beaker',
  freeze: 'lock',
  gate: 'shield',
  ghost: 'lightbulb-sparkle',
  question: 'question',
  answer: 'reply',
  system: 'info',
};

/** The progress feed, newest last; it follows new lines unless the user scrolled up to read. */
function Activity({ activity, open }: { activity: readonly RunActivity[]; open: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const atEnd = useRef(true);
  useLayoutEffect(() => {
    const element = list.current;
    if (element && atEnd.current) element.scrollTop = element.scrollHeight;
  }, [activity, open]);
  return (
    <details className="tl-run__section tl-activity" data-testid="run-activity" open={open || undefined}>
      <summary className="tl-run__heading">Activity ({activity.length})</summary>
      {activity.length === 0 ? (
        <p className="tl-run__hint">Nothing yet.</p>
      ) : (
        <ol
          ref={list}
          className="tl-activity__list"
          onScroll={(event) => {
            const el = event.currentTarget;
            atEnd.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
          }}
        >
          {activity.map((line, i) => (
            <li key={i} className="tl-activity__item" data-testid="activity-item" data-kind={line.kind} data-ok={line.ok === undefined ? undefined : String(line.ok)}>
              <time className="tl-run__time" dateTime={line.at}>
                {formatClock(line.at)}
              </time>
              {line.kind === 'claude-text' ? (
                <AgentText text={line.text} marker="prefix" className="tl-activity__claude" />
              ) : (
                <span className="tl-activity__text">
                  <span className={`codicon codicon-${line.ok === false ? 'error' : ACTIVITY_ICON[line.kind]}`} aria-hidden="true" /> <InlineCode text={line.text} />
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function Outcome({ run }: { run: RunView }) {
  const actions = useBoardActions();
  const busy = useBoard((s) => s.runBusy?.action ?? null);
  const accepted = useBoard((s) => s.accepted);
  // An Accept that changed no file is worded "Recorded", without the Undo hint (it left no Undo step).
  const ended = endedOutcome(run, accepted);
  switch (run.state) {
    case 'starting':
      return (
        <p className="tl-run__progress" data-testid="run-progress">
          <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Checking the setup, copying your model and starting Claude…
        </p>
      );
    case 'gate':
      return (
        <p className="tl-run__progress" data-testid="run-progress">
          <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Claude says it is done: telelean checks the result (build, what it
          rests on, the statement unchanged, your words untouched)…
        </p>
      );
    case 'interrupted':
      return (
        <div className="tl-run__outcome" data-testid="run-interrupted">
          <p>The session was interrupted (the editor reloaded) while Claude was working. Your files were not changed.</p>
          {!run.canResume ? <p className="tl-run__hint">It cannot be resumed: stop it, then start again.</p> : null}
          <div className="tl-run__buttons">
            {run.canResume ? (
              <button type="button" className="tl-button" data-testid="resume-run" disabled={busy !== null} onClick={() => actions.resumeRun()}>
                {busy === 'resume' ? 'Resuming…' : 'Resume'}
              </button>
            ) : null}
            <button type="button" className="tl-button tl-button--secondary" data-testid="stop-run" disabled={busy !== null} title="End the run (like Discard)" onClick={() => actions.stopRun()}>
              {busy === 'stop' ? 'Stopping…' : 'Stop'}
            </button>
          </div>
        </div>
      );
    case 'accepted':
    case 'discarded':
    case 'cancelled':
    case 'failed':
      return (
        <div className="tl-run__outcome" data-testid="run-ended" data-outcome={ended ?? run.state} data-tone={run.state === 'failed' ? 'error' : undefined}>
          <p>{ENDED_TEXT[ended ?? run.state]}</p>
          {run.error ? (
            <p className="tl-run__error" data-testid="run-error">
              <span className="codicon codicon-error" aria-hidden="true" /> <InlineCode text={run.error} />
            </p>
          ) : null}
          <div className="tl-run__buttons">
            <button type="button" className="tl-button tl-button--secondary" data-testid="dismiss-run" onClick={() => actions.dismissRun()}>
              Dismiss
            </button>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function RunPanel() {
  const run = useBoard((s) => (s.run && s.run.subject === s.subject ? s.run : null));
  const open = useBoard((s) => s.runPanelOpen);
  const proposal = useBoard((s) => (s.proposal && s.run && s.proposal.runId === s.run.runId ? s.proposal : null));
  const revealed = useBoard((s) => s.review?.revealed ?? true);
  const cancelling = useBoard((s) => s.runBusy?.action === 'cancel');
  const layout: RunPanelLayout = useNarrow() ? 'narrow' : 'wide';
  const split = useBoard((s) => s.runSplit[layout]);
  const actions = useBoardActions();
  const panel = useRef<HTMLElement>(null);
  const shown = run !== null && open;
  // The user's size for this layout (the default size comes from board.css).
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (split === null) element.style.removeProperty('--tl-run-size');
    else showSplit(element, split);
  }, [split, layout, shown]);
  if (!run || !open) return null;
  const ended = run.state === 'accepted' || run.state === 'discarded' || run.state === 'cancelled' || run.state === 'failed';
  const cancellable = !ended && run.state !== 'review' && run.state !== 'interrupted';
  const reviewing = run.state === 'review';
  const notices = placeNotices(run);
  return (
    <aside ref={panel} className="tl-run" data-testid="run-panel" data-state={run.state} data-stage={run.stage} data-sized={split !== null || undefined} aria-label="Claude run">
      <RunSplitter panel={panel} layout={layout} />
      <header className="tl-run__head">
        <span className="tl-run__title">
          <span className="codicon codicon-sparkle" aria-hidden="true" /> Claude
        </span>
        <span className="tl-run__state" data-testid="run-state" role="status">
          {runStateLabel(run, revealed)}
        </span>
        <span className="tl-details__spacer" />
        {cancellable ? (
          <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="cancel-run" disabled={cancelling} title="Stop Claude and its Lean jobs; your files are not changed" onClick={() => actions.cancelRun()}>
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        ) : null}
        <button type="button" className="tl-icon-button" aria-label="Hide the run panel" title="Hide (the run goes on; the Claude badge in the header shows it again)" onClick={() => actions.setRunPanelOpen(false)}>
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </header>
      <StatusLine run={run} />
      <div className="tl-run__body">
        <Target run={run} />
        <Outcome run={run} />
        {run.pendingQuestions ? <QuestionSet run={run} set={run.pendingQuestions} /> : null}
        {/* How the round ended (gave up, a limit, no finish, the revert) comes before the review, not after it. */}
        <Notices notices={notices.upfront} />
        {reviewing && proposal ? <Review proposal={proposal} /> : null}
        {reviewing && !proposal ? (
          <p className="tl-run__progress" data-testid="run-progress">
            <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Preparing the proposal…
          </p>
        ) : null}
        <Notices notices={notices.later} folded />
        <AnsweredQuestions answered={run.answered} />
        {/* In review the feed is folded away: the review comes first (D-19), the history is one click away. */}
        <Activity key={reviewing || ended ? 'folded' : 'open'} activity={run.activity} open={!reviewing && !ended} />
        <p className="tl-run__backend" data-testid="run-backend">
          {run.backend.model}
          {run.backend.effort ? ` · effort ${run.backend.effort}` : ''}
          {run.backend.cliVersion ? ` · Claude Code ${run.backend.cliVersion}` : ''}
        </p>
      </div>
    </aside>
  );
}
