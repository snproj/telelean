/**
 * The proposal banner (03 section 7, docs/m2-plan.md section 6.4): what Claude's proposal changes ("1 new · 2 changed
 * · +1 vocabulary"), the Current | Proposed toggle of the board, and Review… · Accept · Feedback · Discard · Raw Lean
 * diff…. Accept follows the same rule as in the review (every definition question answered yes). A proof result is not named here: the review shows meaning before proof status (D-19). How the round ended
 * when it ended without one (Claude gave up, a limit, no finish: A2 says the board tells the user) is not a proof
 * result, so the banner says it at once, and Accept is then not the primary button.
 */
import { acceptTitle, definitionsApproved, diffCountsText, isRunOutcomeVerdict, runOutcomeText } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { proposedOverlay } from '../state/store';

export function ProposalBanner() {
  // The proposal of this subject's run in review (or one that arrived before its run: the host posts both on `ready`).
  const proposal = useBoard((s) =>
    s.proposal && s.proposal.subject === s.subject && (s.run === null || (s.run.state === 'review' && s.run.runId === s.proposal.runId)) ? s.proposal : null,
  );
  const review = useBoard((s) => s.review);
  const proposed = useBoard((s) => proposedOverlay(s) !== null);
  const busy = useBoard((s) => s.runBusy !== null);
  const maxAttempts = useBoard((s) => s.run?.caps.maxGateAttempts ?? 3);
  const actions = useBoardActions();
  if (!proposal || !review) return null;
  const approved = definitionsApproved(proposal, review.definitions);
  const verdict = proposal.report.verdict;
  // How many times this round's result did not pass (the report lists the attempts; the cap when it lists none).
  const failed = proposal.report.gateAttempts.filter((attempt) => attempt.round === proposal.round && !attempt.passed).length;
  const outcome = isRunOutcomeVerdict(verdict) ? runOutcomeText(verdict, failed > 0 ? failed : maxAttempts, proposal.report.reverted?.label) : null;
  return (
    <div className="tl-banner tl-proposal-banner" data-testid="proposal-banner" data-outcome={outcome ? verdict : undefined} role="region" aria-label="Claude's proposal">
      <span className="codicon codicon-git-pull-request" aria-hidden="true" />
      <span className="tl-proposal-banner__title">
        <strong>Claude’s proposal</strong> <span data-testid="proposal-counts">{diffCountsText(proposal)}</span>
      </span>
      <span className="tl-seg tl-seg--small" role="radiogroup" aria-label="Board shows" data-testid="proposal-toggle">
        <button type="button" role="radio" aria-checked={!proposed} tabIndex={proposed ? -1 : 0} onClick={() => actions.setProposedView(false)}>
          Current
        </button>
        <button type="button" role="radio" aria-checked={proposed} tabIndex={proposed ? 0 : -1} onClick={() => actions.setProposedView(true)}>
          Proposed
        </button>
      </span>
      <span className="tl-toolbar__spacer" />
      <button
        type="button"
        className="tl-button tl-button--secondary tl-button--small"
        data-testid="banner-review"
        onClick={() => {
          actions.setRunPanelOpen(true);
          actions.setProposedView(true);
        }}
      >
        Review…
      </button>
      <button
        type="button"
        className={outcome ? 'tl-button tl-button--secondary tl-button--small' : 'tl-button tl-button--small'}
        data-testid="banner-accept"
        disabled={!approved || busy}
        title={approved ? acceptTitle(proposal) : 'Answer every definition question with yes first (in the review)'}
        onClick={() => actions.acceptProposal()}
      >
        Accept
      </button>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="banner-feedback" disabled={busy} onClick={() => actions.openFeedback()}>
        Feedback…
      </button>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="banner-discard" disabled={busy} onClick={() => actions.discardProposal()}>
        Discard
      </button>
      <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="banner-raw-diff" onClick={() => actions.openProposalDiff()}>
        Raw Lean diff…
      </button>
      {outcome ? (
        <p className="tl-proposal-banner__outcome" data-testid="proposal-outcome" role="status">
          <span className={`codicon codicon-${verdict === 'gave-up' ? 'error' : 'warning'}`} aria-hidden="true" /> {outcome}
        </p>
      ) : null}
    </div>
  );
}
