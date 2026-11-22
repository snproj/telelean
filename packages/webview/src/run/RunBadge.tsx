/**
 * The run in the header (docs/m2-plan.md section 6.4): a badge ("Claude: working on Spyro · 3/25 checks") that opens
 * or hides the run panel, and, for a run of another subject (at most one run per model folder), a compact line under
 * the header with "Show", which switches the board to that subject.
 *
 * Slice 2g (docs/slice2-plan.md 5.8): during an edit session the badge never says a verdict ("Edit session: Claude
 * working · Spyro · 3/25 checks", "Edit session: review · Spyro"), and another subject's session reads "An edit session
 * is active on ‹subject›: the boards of this folder are read-only until it ends. [Show it]".
 */
import { REVIEW_TEXTS } from '@telelean/core';
import { runBadgeText, runNeedsUser, runStateLabel } from '../model/run';
import { sessionBadgeText } from '../model/sessionBar';
import { useBoard, useBoardActions } from '../state/context';

export function RunBadge() {
  const run = useBoard((s) => s.run);
  const subject = useBoard((s) => s.subject);
  const open = useBoard((s) => s.runPanelOpen);
  const session = useBoard((s) => (s.session && s.run && s.session.runId === s.run.runId ? s.session : null));
  const actions = useBoardActions();
  if (!run) return null;
  const here = run.subject === subject;
  // A session's run: never a verdict; the phase phrase from the session (or from the run while no view came yet).
  const text = session !== null ? sessionBadgeText(session, run) : run.session !== undefined ? sessionBadgeText({ subject: run.subject, phase: run.session.phase }, run) : runBadgeText(run);
  return (
    <button
      type="button"
      className="tl-run-badge"
      data-testid="run-badge"
      data-state={run.state}
      data-attention={runNeedsUser(run) || undefined}
      aria-expanded={here ? open : undefined}
      title={here ? (open ? 'Hide the run panel' : 'Show the run panel') : `Show ${run.subject}, where Claude is running`}
      onClick={() => (here ? actions.setRunPanelOpen(!open) : actions.selectSubject(run.subject))}
    >
      <span className={`codicon codicon-${runNeedsUser(run) ? 'bell-dot' : 'sparkle'}`} aria-hidden="true" />
      {text}
    </button>
  );
}

/** Another subject's run: one compact line, with "Show" (the board then switches to that subject). */
export function RunElsewhere() {
  const run = useBoard((s) => (s.run && s.subject !== '' && s.run.subject !== s.subject ? s.run : null));
  const actions = useBoardActions();
  if (!run) return null;
  if (run.session !== undefined) {
    return (
      <div className="tl-banner tl-run-elsewhere" data-testid="run-elsewhere" data-session="true" role="status">
        <span className="codicon codicon-lock" aria-hidden="true" />
        <span>{REVIEW_TEXTS.runElsewhere(run.subject)}</span>
        <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => actions.selectSubject(run.subject)}>
          {REVIEW_TEXTS.showIt}
        </button>
      </div>
    );
  }
  // Lower-case only its first letter: the label may name Claude ("Ready for review · Claude gave up").
  const label = runStateLabel(run, false);
  return (
    <div className="tl-banner tl-run-elsewhere" data-testid="run-elsewhere" role="status">
      <span className="codicon codicon-sparkle" aria-hidden="true" />
      <span>
        Claude’s run on <strong>{run.subject}</strong>: {label.charAt(0).toLowerCase() + label.slice(1)}.
      </span>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" onClick={() => actions.selectSubject(run.subject)}>
        Show
      </button>
    </div>
  );
}
