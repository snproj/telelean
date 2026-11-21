/**
 * Claude's clarifying questions (ask_user, D-20), answered in place in the run panel (D-16; the board stays viewable
 * meanwhile, but not editable, spec v4 ES-9):
 *  - each question carries its phenomenon tag, Claude's options with their plain consequences, and the board's own
 *    choices: free text ("In my own words"), "Leave it open" (keep it uninterpreted; recorded) and "Decide for me"
 *    (an explicit delegation);
 *  - no answer is pre-selected, and Claude's guess is not on the board before the answer (the host never sends it:
 *    `QuestionView` has no guess); after the answer it is shown with the answered questions;
 *  - the scope of each answer: this run (default), these cards, or the whole subject.
 * One "Send" posts `answerQuestions` for the whole batch (every question exactly once).
 */
import { DECISION_SCOPES, LIMITS, type AnsweredQuestionView, type QuestionSetView, type QuestionView, type RunView } from '@telelean/core';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AgentText, UserText } from '../common/AgentText';
import { PHENOMENON_LABEL } from '../labels';
import { formatTime } from '../model/format';
import { answerChoiceText, draftAnswers, draftProblem, emptyDraft, SCOPE_LABEL, type AnswerDraft } from '../model/run';
import { useBoard, useBoardActions } from '../state/context';
import { revealInPanel } from './reveal';

function Phenomenon({ question }: { question: Pick<QuestionView, 'phenomenon'> }) {
  return (
    <span className="tl-phenomenon" data-testid="phenomenon" data-phenomenon={question.phenomenon} title="What kind of reading question this is (D-20)">
      {PHENOMENON_LABEL[question.phenomenon]}
    </span>
  );
}

/** The cards an answer affects, by their sentences (the user's words). */
function Affected({ ids }: { ids: readonly string[] }) {
  const nodes = useBoard((s) => s.nodes);
  const present = ids.filter((id) => nodes[id]);
  if (present.length === 0) return null;
  return (
    <p className="tl-question__about" data-testid="question-about">
      About{' '}
      {present.map((id, i) => (
        <span key={id}>
          {i > 0 ? ', ' : null}“<UserText text={nodes[id]?.naturalName ?? id} />”
        </span>
      ))}
    </p>
  );
}

function QuestionCard({ setId, question, index, draft, disabled }: { setId: string; question: QuestionView; index: number; draft: AnswerDraft; disabled: boolean }) {
  const actions = useBoardActions();
  const name = `tl-q-${setId}-${question.index}`;
  const choose = (patch: Partial<AnswerDraft>) => actions.setAnswerDraft(setId, index, patch);
  const own = (kind: 'free-text' | 'leave-open' | 'decide-for-me', label: string, note: string) => (
    <label className="tl-option tl-option--own" data-testid={`option-${kind}`} data-selected={draft.kind === kind || undefined}>
      <input type="radio" name={name} checked={draft.kind === kind} onChange={() => choose({ kind, option: null })} />
      <span className="tl-option__body">
        <span className="tl-option__label">{label}</span>
        <span className="tl-option__note">{note}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="tl-question" data-testid="question" data-index={question.index} disabled={disabled} data-agent-scope aria-labelledby={`${name}-text`}>
      <div className="tl-question__head">
        <Phenomenon question={question} />
        <AgentText id={`${name}-text`} text={question.question} marker="prefix" label="Claude asks" className="tl-question__text" testId="question-text" />
      </div>
      <Affected ids={question.affectedNodes} />
      <div className="tl-question__options" role="radiogroup" aria-label="Your answer">
        {question.options.map((option, i) => (
          <label key={i} className="tl-option" data-testid="option" data-selected={(draft.kind === 'option' && draft.option === i) || undefined}>
            <input type="radio" name={name} checked={draft.kind === 'option' && draft.option === i} onChange={() => choose({ kind: 'option', option: i })} />
            <span className="tl-option__body">
              <AgentText text={option.label} marker="none" className="tl-option__label" testId="option-label" />
              <AgentText text={option.consequence} marker="none" className="tl-option__consequence" testId="option-consequence" />
              {option.formalPreview ? <code className="tl-option__preview">{option.formalPreview}</code> : null}
            </span>
          </label>
        ))}
        {own('free-text', 'In my own words', 'write how you mean it')}
        {draft.kind === 'free-text' ? (
          <textarea
            className="tl-input tl-question__free"
            data-testid="free-text"
            aria-label="Your answer in your own words"
            placeholder="How do you mean it?"
            rows={3}
            maxLength={LIMITS.textLength}
            value={draft.text}
            onChange={(event) => choose({ text: event.target.value })}
          />
        ) : null}
        {own('leave-open', 'Leave it open', 'keep it uninterpreted (recorded as your choice)')}
        {own('decide-for-me', 'Decide for me', 'Claude chooses and lists its choice under “assumed without asking”')}
      </div>
      <div className="tl-question__scope" role="radiogroup" aria-label="Remember the answer for" data-testid="question-scope">
        <span className="tl-question__scope-label">Remember for:</span>
        {DECISION_SCOPES.map((scope) => (
          <label key={scope} className="tl-scope" data-scope={scope}>
            <input
              type="radio"
              name={`${name}-scope`}
              checked={draft.scope === scope}
              disabled={scope === 'nodes' && question.affectedNodes.length === 0}
              onChange={() => choose({ scope })}
            />
            {SCOPE_LABEL[scope]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The pending ask_user batch (1-3 questions). */
export function QuestionSet({ run, set }: { run: RunView; set: QuestionSetView }) {
  const stored = useBoard((s) => s.answerDrafts[set.id]);
  const sending = useBoard((s) => s.runBusy?.action === 'answer' && s.runBusy.key === set.id);
  const actions = useBoardActions();
  const section = useRef<HTMLElement>(null);
  const drafts = useMemo(() => set.questions.map((_, i) => stored?.[i] ?? emptyDraft()), [set.questions, stored]);
  const ready = draftAnswers(set.questions, drafts) !== null;
  const many = set.questions.length > 1;
  const problem = set.questions.map((q, i) => draftProblem(q, drafts[i])).find((p) => p !== null) ?? null;
  // A new batch comes into view (the panel keeps its scroll position, e.g. down in the activity feed).
  useLayoutEffect(() => {
    if (section.current) revealInPanel(section.current);
  }, [set.id]);
  return (
    <section ref={section} className="tl-run__section tl-questions" data-testid="question-set" data-set-id={set.id} aria-label="Claude's questions">
      <h3 className="tl-run__heading">
        <span className="codicon codicon-question" aria-hidden="true" /> {many ? `${set.questions.length} questions for you` : 'A question for you'}
        <span className="tl-run__time">{formatTime(set.askedAt)}</span>
      </h3>
      <p className="tl-run__hint">Claude waits for your answer; its working time is paused meanwhile.</p>
      {set.questions.map((question, i) => (
        <QuestionCard key={question.index} setId={set.id} question={question} index={i} draft={drafts[i] ?? emptyDraft()} disabled={sending || run.state !== 'waiting-for-answer'} />
      ))}
      <div className="tl-questions__actions">
        <button type="button" className="tl-button" data-testid="send-answers" disabled={!ready || sending || run.state !== 'waiting-for-answer'} onClick={() => actions.submitAnswers()}>
          {sending ? 'Sending…' : many ? 'Send answers' : 'Send answer'}
        </button>
        {!ready && problem ? <span className="tl-run__hint">{many ? 'Answer every question to send.' : problem}</span> : null}
      </div>
    </section>
  );
}

/** How an answer reads: Claude's option label (Claude's words), the user's free text (theirs), or the board's choice. */
function AnswerValue({ question }: { question: AnsweredQuestionView }) {
  const choice = question.answer.choice;
  if (choice.kind === 'free-text') return <UserText text={choice.text} className="tl-answered__free" />;
  if (choice.kind === 'option') return <AgentText text={answerChoiceText(choice, question)} marker="none" />;
  return <span>{answerChoiceText(choice, question)}</span>;
}

function AnsweredItem({ question }: { question: AnsweredQuestionView }) {
  const guess = question.claudesGuess;
  const guessLabel = guess?.option !== undefined ? question.options[guess.option]?.label : undefined;
  return (
    <div className="tl-answered" data-testid="answered-question" data-set-id={question.setId} data-index={question.index} data-agent-scope>
      <div className="tl-answered__head">
        <Phenomenon question={question} />
        <AgentText text={question.question} marker="prefix" label="Claude asked" />
      </div>
      <p className="tl-answered__line" data-testid="your-answer">
        <span className="tl-answered__label">Your answer:</span> <AnswerValue question={question} />{' '}
        <span className="tl-answered__scope">(for {SCOPE_LABEL[question.answer.scope]})</span>
      </p>
      <p className="tl-answered__line" data-testid="claudes-guess">
        <span className="tl-answered__label">Claude’s guess:</span>{' '}
        {guess && (guessLabel || guess.note) ? (
          <>
            {guessLabel ? <AgentText text={guessLabel} marker="none" /> : null}
            {guessLabel && guess.note ? ' · ' : null}
            {guess.note ? <AgentText text={guess.note} marker="none" /> : null}
          </>
        ) : (
          <span className="tl-run__hint">none given</span>
        )}
      </p>
    </div>
  );
}

/** Every answered question of the run, newest batch first (its guesses revealed, D-20). */
export function AnsweredQuestions({ answered }: { answered: readonly AnsweredQuestionView[] }) {
  const groups = useMemo(() => {
    const bySet = new Map<string, AnsweredQuestionView[]>();
    for (const question of answered) bySet.set(question.setId, [...(bySet.get(question.setId) ?? []), question]);
    return [...bySet.values()].reverse();
  }, [answered]);
  if (groups.length === 0) return null;
  const [latest, ...older] = groups;
  return (
    <section className="tl-run__section" data-testid="answered" aria-label="Your answers">
      <h3 className="tl-run__heading">Your answers</h3>
      {(latest ?? []).map((question) => (
        <AnsweredItem key={`${question.setId}-${question.index}`} question={question} />
      ))}
      {older.length > 0 ? (
        <details className="tl-run__more">
          <summary>Earlier answers ({older.reduce((n, g) => n + g.length, 0)})</summary>
          {older.flat().map((question) => (
            <AnsweredItem key={`${question.setId}-${question.index}`} question={question} />
          ))}
        </details>
      ) : null}
    </section>
  );
}
