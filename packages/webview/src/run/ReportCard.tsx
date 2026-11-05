/**
 * The report card of a round (03 section 7; revealed after the statements, D-19): the verdict for the target, what
 * the proof rests on (cards, presuppositions, anything else), unused premises and the self-evident flag (G6, never
 * failures), "consistency unchecked" (D-6, until M3), Claude's summary, gap, conflict and every interpretive choice it
 * made without asking, each with "Ask me instead" (D-20: prefilled Feedback), Claude's suggested premises, the check
 * attempts (A2's gate, in the user's words), the changed files with their raw diff, usage and durations.
 */
import { PRESUPPOSITION_PREFIX, type ProposalView, type TlNode } from '@telelean/core';
import { useMemo } from 'react';
import { AgentText, UserText } from '../common/AgentText';
import { InlineCode } from '../common/InlineCode';
import { KIND_GLYPH } from '../labels';
import { footprintEntries, presuppositionLabel, vocabIndex } from '../model/cardData';
import { CHECK_STEP, formatCost, formatDuration, formatTokens, suggestedGhosts, VERDICT_LABEL } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { GhostSuggestion } from './GhostSuggestion';

const VERDICT_ICON: Readonly<Record<ProposalView['report']['verdict'], string>> = {
  proved: 'pass',
  'not-proved': 'circle-slash',
  insufficient: 'circle-slash',
  inconsistent: 'warning',
  'gave-up': 'error',
  'cap-reached': 'watch',
  'no-finish': 'debug-stop',
  cancelled: 'circle-slash',
  failed: 'error',
};

/** A card of the proposal by its sentence (an adopted suggestion keeps Claude's wording style). */
function CardName({ node, id }: { node: TlNode | undefined; id: string }) {
  if (!node) return <code>{id}</code>;
  return (
    <span className="tl-report__card">
      <span className="tl-glyph" data-kind={node.type} aria-hidden="true">
        {KIND_GLYPH[node.type]}
      </span>
      {node.provenance.wordedBy === 'agent' ? <AgentText text={node.naturalName} /> : <UserText text={node.naturalName} />}
    </span>
  );
}

/** "Ask me instead" (D-20): Feedback prefilled with the assumption Claude made without asking. */
export function askInsteadText(item: string): string {
  return `You assumed this without asking: “${item}”. Please ask me about it instead of assuming it.`;
}

export function ReportCard({ proposal }: { proposal: ProposalView }) {
  const run = useBoard((s) => s.run);
  const subject = useBoard((s) => s.subject);
  const actions = useBoardActions();
  const report = proposal.report;
  const nodes = useMemo(() => Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n])), [proposal.graph.nodes]);
  const vocab = useMemo(() => vocabIndex(proposal.graph.vocabulary), [proposal.graph.vocabulary]);
  const footprint = useMemo(() => footprintEntries(report.footprint, nodes, subject, vocab), [report.footprint, nodes, subject, vocab]);
  const ghosts = useMemo(() => suggestedGhosts(run, proposal), [run, proposal]);
  const target = nodes[report.target];
  const proved = report.verdict === 'proved';

  return (
    <div className="tl-report" data-testid="report-card" data-verdict={report.verdict}>
      <p className="tl-report__verdict" data-testid="report-verdict" data-verdict={report.verdict}>
        <span className={`codicon codicon-${VERDICT_ICON[report.verdict]}`} aria-hidden="true" />
        <strong>{VERDICT_LABEL[report.verdict]}</strong>
        {target ? (
          <>
            {': '}
            <CardName node={target} id={report.target} />
          </>
        ) : null}
      </p>
      {report.reverted ? (
        <p className="tl-report__note" data-testid="report-reverted">
          <span className="codicon codicon-discard" aria-hidden="true" /> telelean reverted Claude’s working copy to “{report.reverted.label}”: <InlineCode text={report.reverted.reason} />
        </p>
      ) : null}

      {proved ? (
        <section className="tl-report__section" data-testid="report-footprint">
          <h4 className="tl-details__heading">Rests on</h4>
          {footprint.length === 0 ? <p className="tl-details__none">No assumptions at all.</p> : null}
          <ul className="tl-details__list">
            {footprint.map((entry, i) => (
              <li key={i}>
                {entry.kind === 'node' ? (
                  <CardName node={nodes[entry.id]} id={entry.id} />
                ) : entry.kind === 'presupposition' ? (
                  <span className="tl-presup" data-presup={entry.name} title={entry.name}>
                    {presuppositionLabel(entry.name, subject, vocab)}
                  </span>
                ) : entry.kind === 'axiom' ? (
                  <span className="tl-chip tl-chip--attention" title="An axiom that is neither one of your assumptions nor vocabulary">
                    axiom <code>{entry.name}</code>
                  </span>
                ) : (
                  <code>{entry.name.startsWith(PRESUPPOSITION_PREFIX) ? entry.name.slice(PRESUPPOSITION_PREFIX.length) : entry.name}</code>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.selfEvident ? (
        <p className="tl-report__flag" data-testid="report-self-evident">
          <span className="codicon codicon-info" aria-hidden="true" /> Self-evident: proved without any of your premises.
        </p>
      ) : null}
      {report.unusedPremises.length > 0 ? (
        <div className="tl-report__flag" data-testid="report-unused">
          <span className="codicon codicon-info" aria-hidden="true" /> Not used by the proof:{' '}
          {report.unusedPremises.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : null}
              <CardName node={nodes[id]} id={id} />
            </span>
          ))}
        </div>
      ) : null}
      {proved ? (
        <p className="tl-report__flag" data-testid="report-consistency">
          <span className="codicon codicon-question" aria-hidden="true" /> Consistency unchecked: telelean has not yet checked that these premises can all hold
          together (the model finder arrives in M3).
        </p>
      ) : null}

      {report.claudeSummary ? (
        <section className="tl-report__section">
          <h4 className="tl-details__heading">Claude’s summary</h4>
          <AgentText text={report.claudeSummary} marker="prefix" block testId="report-summary" />
        </section>
      ) : null}
      {report.gap ? (
        <section className="tl-report__section">
          <h4 className="tl-details__heading">What is missing, according to Claude</h4>
          <AgentText text={report.gap} marker="prefix" block testId="report-gap" />
        </section>
      ) : null}
      {report.conflict && report.conflict.length > 0 ? (
        <section className="tl-report__section">
          <h4 className="tl-details__heading">A conflict Claude reports (unverified until M3)</h4>
          <ul className="tl-details__list">
            {report.conflict.map((item, i) => (
              <li key={i}>
                <AgentText text={item} marker="prefix" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="tl-report__section" data-testid="assumed-without-asking">
        <h4 className="tl-details__heading">Assumed without asking</h4>
        {report.assumedWithoutAsking.length === 0 ? (
          <p className="tl-details__none">Nothing, according to Claude.</p>
        ) : (
          <ul className="tl-details__list">
            {report.assumedWithoutAsking.map((item, i) => (
              <li key={i} className="tl-report__assumed" data-testid="assumed-item">
                <AgentText text={item} marker="prefix" />
                <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="ask-me-instead" onClick={() => actions.openFeedback(askInsteadText(item))}>
                  Ask me instead
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ghosts.length > 0 ? (
        <section className="tl-report__section" data-testid="report-suggestions">
          <h4 className="tl-details__heading">Premises Claude suggests</h4>
          {ghosts.map((ghost) => (
            <GhostSuggestion key={ghost.id} ghost={ghost} variant="panel" />
          ))}
        </section>
      ) : null}

      {report.gateAttempts.length > 0 ? (
        <details className="tl-report__section tl-report__attempts" data-testid="report-gate-attempts">
          <summary title="Each time Claude said it was finished, telelean checked the result">
            Check attempts: {report.gateAttempts.filter((a) => a.passed).length} passed of {report.gateAttempts.length}
          </summary>
          <ol className="tl-details__list">
            {report.gateAttempts.map((attempt) => (
              <li key={`${attempt.round}-${attempt.attempt}`} className="tl-gate-attempt" data-passed={attempt.passed}>
                <strong>
                  Attempt {attempt.attempt}
                  {attempt.round > 1 ? ` (round ${attempt.round})` : ''}
                </strong>
                : {attempt.passed ? 'passed' : 'didn’t pass'}
                {attempt.failures.length > 0 ? (
                  <ul className="tl-gate-attempt__failures">
                    {attempt.failures.map((failure, i) => (
                      <li key={i}>
                        {/* Which check, in plain words; its name (G0…G5) only in the tooltip. */}
                        <span className="tl-check-step" data-step={failure.step} title={CHECK_STEP[failure.step]?.title ?? `Check ${failure.step}`}>
                          {CHECK_STEP[failure.step]?.label ?? 'check'}
                        </span>{' '}
                        <InlineCode text={failure.text} />
                        {failure.detail ? (
                          <details className="tl-notice__detail">
                            <summary>What Claude was told</summary>
                            <pre>{failure.detail}</pre>
                          </details>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {proposal.files.length > 0 ? (
        <section className="tl-report__section" data-testid="report-files">
          <h4 className="tl-details__heading">Files Accept would change</h4>
          <ul className="tl-details__list">
            {proposal.files.map((file) => (
              <li key={file.path} className="tl-report__file">
                <code>{file.path}</code>
                <span className="tl-report__counts">
                  {file.change === 'added' ? 'new, ' : file.change === 'deleted' ? 'deleted, ' : ''}+{file.additions} −{file.deletions}
                </span>
                <button type="button" className="tl-icon-button" title={`Open the raw diff of ${file.path}`} onClick={() => actions.openProposalDiff(file.path)}>
                  <span className="codicon codicon-diff" aria-hidden="true" /> diff
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="tl-report__usage" data-testid="report-usage">
        {report.usage.requests} requests · {formatTokens(report.usage.inputTokens)} in · {formatTokens(report.usage.outputTokens)} out ·{' '}
        <span title="Estimate at API list prices; your subscription is not billed per token.">{formatCost(report.usage.costEstimateUsd)} estimate</span> · took{' '}
        {formatDuration(report.durationMs)} (Claude working {formatDuration(report.agentMs)})
      </p>
    </div>
  );
}
