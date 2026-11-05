/**
 * The end-of-round review (D-19, M2 minimal; docs/m2-plan.md section 6.4), a stepper in the run panel:
 *   statements (one step each: the sentence beside its Lean, a "fully explicit" toggle, the statement closure)
 *   -> new vocabulary (auto-approved, revocable: revoking is prefilled Feedback)
 *   -> definition questions (yes / no; Accept needs every "yes", a "no" opens Feedback)
 *   -> the report card (shown once the statements are done, or on "Show result": meaning before proof status)
 *   -> lifecycle items (D-21: a proved goal becomes a Derivation only when ticked; recommended ones start ticked)
 * with Accept / Feedback / Discard / Raw Lean diff always at hand.
 */
import { LIMITS, type DefinitionQuestion, type ProposalView, type StatementReview, type TlNode, type VocabKind, type VocabularyReview } from '@telelean/core';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AgentText, UserText } from '../common/AgentText';
import { KIND_GLYPH, KIND_NOUN, VOCAB_KIND_NOUN } from '../labels';
import { acceptTitle, definitionsApproved, isRunOutcomeVerdict, reviewSteps, statementBody, STEP_TITLE, type ReviewStep } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import type { ReviewUi } from '../state/store';
import { ReportCard } from './ReportCard';
import { revealInPanel } from './reveal';

const shortName = (name: string) => name.split('.').at(-1) ?? name;

function stepLabel(step: ReviewStep): string {
  if (step.kind === 'statement') return step.count > 1 ? `Statement ${step.index + 1}` : 'Statement';
  return STEP_TITLE[step.kind];
}

function Sentence({ text, wordedBy }: { text: string; wordedBy: 'user' | 'agent' }) {
  return wordedBy === 'agent' ? <AgentText text={text} /> : <UserText text={text} />;
}

function StatementStep({ step, explicit }: { step: Extract<ReviewStep, { kind: 'statement' }>; explicit: boolean }) {
  const actions = useBoardActions();
  const item: StatementReview = step.item;
  return (
    <div className="tl-statement" data-testid="statement-review" data-statement-node={item.nodeId}>
      <p className="tl-review__lead">
        Does the Lean say what the sentence says? <span className="tl-review__tag">{item.change === 'new' ? 'new statement' : 'changed statement'}</span>
      </p>
      {/* The sentence above its Lean: the panel is too narrow for the two side by side. */}
      <div className="tl-statement__pair">
        <div className="tl-statement__side" data-testid="statement-sentence">
          <h4 className="tl-details__heading">Sentence</h4>
          <p className="tl-statement__sentence">
            <Sentence text={item.sentence} wordedBy={item.wordedBy} />
          </p>
        </div>
        <div className="tl-statement__side">
          <h4 className="tl-details__heading" title={item.leanName}>
            Lean statement <code>{shortName(item.leanName)}</code>
          </h4>
          {/* The proposition only: Lean's `#print` header ("@[reducible] def … : Prop :=") is not what the file says. */}
          <pre className="tl-lean" data-testid="statement-lean" data-form={explicit ? 'explicit' : 'pretty'}>
            {statementBody(explicit ? item.explicit : item.pretty)}
          </pre>
          <label className="tl-check" title="No notation, every argument and universe shown, no coercion arrows">
            <input type="checkbox" data-testid="explicit-toggle" checked={explicit} onChange={() => actions.toggleExplicit(item.nodeId)} />
            Fully explicit
          </label>
        </div>
      </div>
      <div className="tl-statement__closure" data-testid="statement-closure">
        <h4 className="tl-details__heading">It uses</h4>
        {item.closure.length === 0 ? (
          <p className="tl-details__none">No vocabulary.</p>
        ) : (
          <ul className="tl-details__list">
            {item.closure.map((entry) => (
              <li key={entry.name} className="tl-closure__item" data-closure={entry.name}>
                <code className="tl-closure__name">{shortName(entry.name)}</code>
                <span className="tl-closure__kind">{VOCAB_KIND_NOUN[entry.kind as VocabKind] ?? entry.kind}</span>
                {entry.type ? <code className="tl-closure__type">: {entry.type}</code> : null}
                {entry.gloss ? entry.glossBy === 'agent' ? <AgentText text={entry.gloss} /> : <UserText text={entry.gloss} className="tl-closure__gloss" /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="tl-icon-button" onClick={() => actions.showOnBoard(item.nodeId)}>
        <span className="codicon codicon-eye" aria-hidden="true" /> Show on the board
      </button>
    </div>
  );
}

/** Revoking a new vocabulary item is Feedback (D-19: auto-approved but revocable). */
export function revokeVocabularyText(item: VocabularyReview['items'][number]): string {
  return `Please don't add the vocabulary item \`${shortName(item.name)}\`${item.gloss ? ` (“${item.gloss}”)` : ''}: `;
}

function VocabularyStep({ item }: { item: VocabularyReview }) {
  const actions = useBoardActions();
  return (
    <div data-testid="vocabulary-review">
      <p className="tl-review__lead">
        Claude added this vocabulary. Plain types, predicates and constants pass the simple vocabulary rule, so they are approved unless you revoke one
        (revoking sends Feedback).
      </p>
      <ul className="tl-details__list">
        {item.items.map((entry) => (
          <li key={entry.name} className="tl-vocab-review" data-testid="vocabulary-item" data-vocab={entry.name}>
            <div className="tl-vocab-review__head">
              <code className="tl-closure__name">{shortName(entry.name)}</code>
              <span className="tl-closure__kind">{VOCAB_KIND_NOUN[entry.vocabKind as VocabKind] ?? entry.vocabKind}</span>
              {entry.type ? <code className="tl-closure__type">: {entry.type}</code> : null}
              <span className="tl-details__spacer" />
              <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="revoke-vocabulary" onClick={() => actions.openFeedback(revokeVocabularyText(entry))}>
                Revoke…
              </button>
            </div>
            {/* New vocabulary is Claude's: its gloss is in Claude's words. */}
            {entry.gloss ? <AgentText text={entry.gloss} /> : null}
            {entry.code ? <pre className="tl-lean">{entry.code}</pre> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DefinitionItem({ question, answer, nodes }: { question: DefinitionQuestion; answer: 'yes' | 'no' | undefined; nodes: Readonly<Record<string, TlNode>> }) {
  const actions = useBoardActions();
  const users = question.usedByStatementsOf.map((id) => nodes[id]).filter((n): n is TlNode => n !== undefined);
  return (
    <div className="tl-definition" data-testid="definition" data-definition-id={question.id} data-answer={answer}>
      <h4 className="tl-definition__title">
        <code>{question.name}</code> <span className="tl-closure__kind">{question.kind === 'presupposition' ? 'existence assumption' : 'definition'}</span>
      </h4>
      {question.gloss ? <AgentText text={question.gloss} block /> : null}
      <pre className="tl-lean">{question.code}</pre>
      {users.length > 0 ? (
        <p className="tl-definition__users">
          Your statements rely on it:{' '}
          {users.map((node, i) => (
            <span key={node.id}>
              {i > 0 ? ', ' : null}
              <span className="tl-glyph" data-kind={node.type} aria-hidden="true">
                {KIND_GLYPH[node.type]}
              </span>{' '}
              <Sentence text={node.naturalName} wordedBy={node.provenance.wordedBy} />
            </span>
          ))}
        </p>
      ) : null}
      <div className="tl-definition__answer" role="group" aria-label={`Do you endorse ${question.name}?`}>
        <button type="button" className="tl-choice" aria-pressed={answer === 'yes'} data-testid="definition-yes" onClick={() => actions.answerDefinition(question.id, 'yes')}>
          Yes, I endorse it
        </button>
        <button type="button" className="tl-choice" aria-pressed={answer === 'no'} data-testid="definition-no" onClick={() => actions.answerDefinition(question.id, 'no')}>
          No…
        </button>
      </div>
    </div>
  );
}

function DefinitionsStep({ proposal, review }: { proposal: ProposalView; review: ReviewUi }) {
  const nodes = useMemo(() => Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n])), [proposal.graph.nodes]);
  return (
    <div data-testid="definitions-review">
      <p className="tl-review__lead">
        Claude introduced {proposal.definitions.length === 1 ? 'this definition' : 'these definitions'}. A definition can quietly carry a belief, so Accept needs
        your yes for each; a no is Feedback for Claude.
      </p>
      {proposal.definitions.map((question) => (
        <DefinitionItem key={question.id} question={question} answer={review.definitions[question.id]} nodes={nodes} />
      ))}
    </div>
  );
}

function ResultStep({ proposal, review }: { proposal: ProposalView; review: ReviewUi }) {
  const actions = useBoardActions();
  if (!review.revealed) {
    return (
      <div className="tl-review__hidden" data-testid="result-hidden">
        <p>The result is shown after the statements, so that you judge what they mean before you see whether they were proved.</p>
        <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.revealResult()}>
          Show result
        </button>
      </div>
    );
  }
  return <ReportCard proposal={proposal} />;
}

function LifecycleStep({ proposal, review }: { proposal: ProposalView; review: ReviewUi }) {
  const actions = useBoardActions();
  const nodes = useMemo(() => Object.fromEntries(proposal.graph.nodes.map((n) => [n.id, n])), [proposal.graph.nodes]);
  return (
    <div data-testid="lifecycle-review">
      <p className="tl-review__lead">Changes to cards that Accept makes too, only when ticked:</p>
      <ul className="tl-details__list">
        {proposal.lifecycle.map((item) => {
          const node = nodes[item.nodeId];
          return (
            <li key={item.id}>
              <label className="tl-check tl-lifecycle" data-testid="lifecycle-item" data-lifecycle-id={item.id}>
                <input type="checkbox" checked={review.lifecycle[item.id] === true} onChange={(event) => actions.setLifecycleTick(item.id, event.target.checked)} />
                <span>
                  Make {node ? <>“<Sentence text={node.naturalName} wordedBy={node.provenance.wordedBy} />”</> : <code>{item.nodeId}</code>} a {KIND_NOUN[item.to]}{' '}
                  <span className="tl-run__hint">
                    ({item.reason}
                    {item.recommended ? '; recommended' : ''})
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeedbackComposer({ review }: { review: ReviewUi }) {
  const actions = useBoardActions();
  const sending = useBoard((s) => s.runBusy?.action === 'feedback');
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element || review.feedbackFocus === 0) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [review.feedbackFocus]);
  const text = review.feedback.trim();
  return (
    <div className="tl-feedback" data-testid="feedback-composer">
      <label className="tl-feedback__label" htmlFor="tl-feedback-text">
        Feedback for Claude: it continues the same session in a new round (statements may change)
      </label>
      <textarea
        id="tl-feedback-text"
        ref={field}
        className="tl-input tl-feedback__text"
        data-testid="feedback-text"
        rows={4}
        maxLength={LIMITS.textLength}
        value={review.feedback}
        onChange={(event) => actions.setFeedback(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            actions.sendFeedback();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            actions.closeFeedback();
          }
        }}
      />
      <div className="tl-feedback__buttons">
        <button type="button" className="tl-button" data-testid="send-feedback" disabled={text.length === 0 || sending} onClick={() => actions.sendFeedback()}>
          {sending ? 'Sending…' : 'Send feedback'}
        </button>
        <button type="button" className="tl-button tl-button--secondary" onClick={() => actions.closeFeedback()}>
          Close
        </button>
        <span className="tl-run__hint">Ctrl+Enter sends</span>
      </div>
    </div>
  );
}

/** Accept / Feedback / Discard / Raw Lean diff (the banner has the same buttons). */
export function ReviewActions({ proposal, review }: { proposal: ProposalView; review: ReviewUi }) {
  const actions = useBoardActions();
  const busy = useBoard((s) => s.runBusy);
  const approved = definitionsApproved(proposal, review.definitions);
  // A round that gave up (or hit a limit, or did not finish) proposes only what last passed: Accept is not the
  // obvious next step then, so it is not the primary button.
  const outcome = isRunOutcomeVerdict(proposal.report.verdict);
  return (
    <>
      <div className="tl-review__actions" data-testid="review-actions">
        <button
          type="button"
          className={outcome ? 'tl-button tl-button--secondary' : 'tl-button'}
          data-testid="accept"
          disabled={!approved || busy !== null}
          title={approved ? acceptTitle(proposal, review.lifecycle) : 'Answer every definition question with yes first (a no is Feedback)'}
          onClick={() => actions.acceptProposal()}
        >
          {busy?.action === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-testid="feedback" disabled={busy !== null} onClick={() => actions.openFeedback()}>
          Feedback…
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-testid="discard" disabled={busy !== null} title="End the run without changing your files" onClick={() => actions.discardProposal()}>
          {busy?.action === 'discard' ? 'Discarding…' : 'Discard'}
        </button>
        <button type="button" className="tl-button tl-button--secondary" data-testid="raw-diff" title="Open VS Code's diff of every file the proposal changes" onClick={() => actions.openProposalDiff()}>
          Raw Lean diff…
        </button>
      </div>
      {!approved ? (
        <p className="tl-run__hint" data-testid="accept-blocked">
          Accept needs your yes for every definition question.
        </p>
      ) : null}
      {review.feedbackOpen ? <FeedbackComposer review={review} /> : null}
    </>
  );
}

export function Review({ proposal }: { proposal: ProposalView }) {
  const review = useBoard((s) => s.review);
  const actions = useBoardActions();
  const steps = useMemo(() => reviewSteps(proposal), [proposal]);
  const section = useRef<HTMLElement>(null);
  const current = review && review.proposalId === proposal.proposalId && review.runId === proposal.runId ? Math.min(review.step, steps.length - 1) : null;
  // When the review appears, and at every step change, its top comes into view: the panel keeps its scroll position,
  // so it could otherwise show the answered questions below a short step, or the old content above.
  useLayoutEffect(() => {
    if (section.current && current !== null) revealInPanel(section.current);
  }, [proposal.proposalId, current]);
  if (!review || current === null) return null;
  const index = current;
  const step = steps[index];
  if (!step) return null;
  return (
    <section ref={section} className="tl-run__section tl-review" data-testid="review" aria-label="Review">
      <div className="tl-review__head">
        <h3 className="tl-run__heading">
          <span className="codicon codicon-checklist" aria-hidden="true" /> Review
        </h3>
        <span className="tl-review__progress" data-testid="review-progress">
          Step {index + 1} of {steps.length}: {stepLabel(step)}
        </span>
        <span className="tl-details__spacer" />
        {!review.revealed ? (
          <button type="button" className="tl-icon-button" data-testid="show-result" title="Show the proof result now" onClick={() => actions.revealResult()}>
            Show result
          </button>
        ) : null}
      </div>
      <ol className="tl-review__steps" aria-label="Review steps">
        {steps.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              className="tl-review__step"
              data-step-kind={s.kind}
              aria-current={i === index ? 'step' : undefined}
              data-locked={(s.kind === 'result' && !review.revealed) || undefined}
              onClick={() => actions.reviewGo(i)}
            >
              {stepLabel(s)}
              {s.kind === 'definitions' ? ` (${proposal.definitions.length})` : ''}
            </button>
          </li>
        ))}
      </ol>
      {proposal.baseChanged ? (
        <p className="tl-review__note" data-testid="review-base-changed">
          <span className="codicon codicon-info" aria-hidden="true" /> Your files changed since the run started: Accept re-checks Claude’s changes on top of them first.
        </p>
      ) : null}
      {proposal.empty ? (
        <p className="tl-review__note" data-testid="review-empty">
          <span className="codicon codicon-info" aria-hidden="true" />{' '}
          {proposal.lifecycle.length > 0
            ? 'This round changed no file: Accept records the outcome and makes only the card changes you tick.'
            : 'This round changed no file: Accept only records the outcome.'}
        </p>
      ) : null}
      <div className="tl-review__body" data-testid="review-step" data-step={step.kind}>
        {step.kind === 'statement' ? <StatementStep step={step} explicit={review.explicit[step.item.nodeId] === true} /> : null}
        {step.kind === 'vocabulary' ? <VocabularyStep item={step.item} /> : null}
        {step.kind === 'definitions' ? <DefinitionsStep proposal={proposal} review={review} /> : null}
        {step.kind === 'result' ? <ResultStep proposal={proposal} review={review} /> : null}
        {step.kind === 'lifecycle' ? <LifecycleStep proposal={proposal} review={review} /> : null}
      </div>
      <div className="tl-review__nav">
        <button type="button" className="tl-button tl-button--secondary tl-button--small" data-testid="review-back" disabled={index === 0} onClick={() => actions.reviewGo(index - 1)}>
          <span className="codicon codicon-chevron-left" aria-hidden="true" /> Back
        </button>
        <button type="button" className="tl-button tl-button--small" data-testid="review-next" disabled={index >= steps.length - 1} onClick={() => actions.reviewGo(index + 1)}>
          Next: {index < steps.length - 1 ? stepLabel(steps[index + 1] as ReviewStep) : 'done'} <span className="codicon codicon-chevron-right" aria-hidden="true" />
        </button>
      </div>
      <ReviewActions proposal={proposal} review={review} />
    </section>
  );
}
