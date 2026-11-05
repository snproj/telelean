/**
 * Pure helpers for the M2 run UI (no DOM, no React; unit-tested): what the status line, the header badge, the
 * question cards, the review stepper and the proposal overlay show, from core's RunView and ProposalView
 * (docs/m2-plan.md section 6). The board never computes verdicts: it only words what the host sent.
 */
import {
  columnOrder,
  isTerminalRunState,
  LIMITS,
  type AnswerChoiceView,
  type DecisionScope,
  type GateStepId,
  type GhostView,
  type GraphDiff,
  type NodeChangeField,
  type NodeDiff,
  type NodeType,
  type ProposalView,
  type QuestionAnswer,
  type QuestionView,
  type RunNotice,
  type RunUsage,
  type RunVerdict,
  type RunView,
  type StatementReview,
  type TlEdge,
  type TlNode,
  type VocabItem,
  type VocabularyReview,
} from '@telelean/core';
import { formatTime } from './format';

// ---------------------------------------------------------------------------------------------------------------
// Run state

/** A run that still needs the user or Claude (not accepted, discarded, cancelled or failed). */
export function isActiveRun(run: RunView | null | undefined): run is RunView {
  return run !== null && run !== undefined && !isTerminalRunState(run.state);
}

/**
 * Why the tray's run buttons are disabled while a run of this model folder exists (at most one active run per
 * root, docs/m2-plan.md section 2), or null. `subject` is the board's subject: another subject's run is named.
 */
export function trayRunBlock(run: RunView | null | undefined, subject: string): string | null {
  if (!isActiveRun(run)) return null;
  const where = run.subject !== subject ? ` on ${run.subject}` : '';
  switch (run.state) {
    case 'review':
      return `Claude's proposal${where} is waiting for your review: accept, give feedback or discard it first.`;
    case 'waiting-for-answer':
      return `Claude${where} is waiting for your answer: answer it or cancel that run first.`;
    case 'interrupted':
      return `A run${where} was interrupted: resume or stop it first.`;
    default:
      return `Claude is already working${where}: wait for it to finish, or cancel it.`;
  }
}

/** "4:05", "1:02:03" (minutes and seconds; hours when needed). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/** Token counts: "950", "12.3k", "450k", "1.2M". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 100 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
}

/** The CLI's cost estimate in dollars: "$0.42", small amounts with three decimals ("$0.003"). */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '$?';
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** The tooltip of the cost (docs/m2-plan.md section 4.4). */
export const COST_TITLE = 'Estimate at API list prices; your subscription is not billed per token.';

/** A clock time "14:03:12" (local time; fixed format). */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type Tone = 'ok' | 'warn' | 'error';

/** The latest rate-limit event, worded (the CLI reports e.g. `allowed`, `allowed_warning`, `rejected`). */
export function rateLimitView(rate: RunUsage['rateLimit']): { text: string; title: string; tone: Tone } | null {
  if (!rate) return null;
  const resets = rate.resetsAt ? ` (resets ${formatTime(rate.resetsAt)})` : '';
  const detail = rate.detail ? ` ${rate.detail}` : '';
  switch (rate.status) {
    case 'allowed':
      return { text: 'rate limit ok', title: `Your plan's rate limit is fine.${detail}`, tone: 'ok' };
    case 'allowed_warning':
      return { text: `rate limit: close${resets}`, title: `Close to your plan's rate limit${resets}.${detail}`, tone: 'warn' };
    case 'rejected':
      return { text: `rate limited${resets}`, title: `Your plan's rate limit was reached${resets}.${detail}`, tone: 'error' };
    default:
      return { text: `rate limit: ${rate.status}${resets}`, title: `Rate limit status "${rate.status}"${resets}.${detail}`, tone: 'warn' };
  }
}

/** Whether the agent-active clock runs (it is paused while a question waits, in review and when interrupted). */
export function clockRuns(run: RunView): boolean {
  return run.state === 'working' || run.state === 'gate';
}

/**
 * The agent-active time now: the host's figure as of `updatedAt`, plus the time since while the clock runs (the host
 * posts on events, not every second), never more than the cap.
 */
export function agentMsNow(run: RunView, nowMs: number): number {
  const base = run.counters.agentMs;
  if (!clockRuns(run)) return base;
  const since = nowMs - Date.parse(run.updatedAt);
  const extra = Number.isFinite(since) && since > 0 ? since : 0;
  return Math.min(base + extra, Math.max(base, run.caps.maxAgentMs));
}

export interface StatusPart {
  /** Stable key, rendered as `data-part` (tests and styling). */
  key: 'round' | 'checks' | 'turns' | 'agent' | 'gate' | 'tokens' | 'cost' | 'rate';
  text: string;
  title: string;
  tone?: Tone;
}

/** The status line's counters (D-25: checks, turns, agent time, gate attempts; usage with the cost "estimate"). */
export function runStatusParts(run: RunView, nowMs: number): StatusPart[] {
  const { caps, counters, usage } = run;
  const paused = !clockRuns(run) && !isTerminalRunState(run.state) && run.state !== 'starting';
  const parts: StatusPart[] = [
    { key: 'round', text: `round ${run.round}`, title: 'Rounds: the first, plus one for every Feedback and every adopted suggestion. Each round gets the full budget.' },
    { key: 'checks', text: `checks ${counters.checks}/${caps.maxChecks}`, title: 'Lean checks Claude used this round (check, freeze and suggestion checks count one each)' },
    { key: 'turns', text: `turns ${counters.turns}/${caps.maxTurns}`, title: "Claude's model responses this round" },
    {
      key: 'agent',
      text: `agent ${formatDuration(agentMsNow(run, nowMs))} / ${formatDuration(caps.maxAgentMs)}${paused ? ' (paused)' : ''}`,
      title: paused ? "Claude's working time this round; the clock is paused while it waits for you" : "Claude's working time this round (waiting for your answers does not count)",
    },
    {
      key: 'gate',
      text: `check attempts ${counters.gateAttempts}/${caps.maxGateAttempts}`,
      title: `Times Claude said it was finished this round and telelean checked the result (after ${caps.maxGateAttempts} that do not pass, telelean stops and tells you)`,
    },
    {
      key: 'tokens',
      text: `${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out`,
      title: `Tokens for the whole run: ${usage.requests} requests, ${usage.inputTokens} input, ${usage.outputTokens} output, ${usage.cacheReadInputTokens} cache read, ${usage.cacheCreationInputTokens} cache write`,
    },
    { key: 'cost', text: `${formatCost(usage.costEstimateUsd)} estimate`, title: COST_TITLE },
  ];
  const rate = rateLimitView(usage.rateLimit);
  if (rate) parts.push({ key: 'rate', text: rate.text, title: rate.title, ...(rate.tone !== 'ok' ? { tone: rate.tone } : {}) });
  return parts;
}

/** D-6 / decision 15: how a round ended, in the board's words. */
export const VERDICT_LABEL: Readonly<Record<RunVerdict, string>> = {
  proved: 'proved',
  'not-proved': 'not proved',
  insufficient: 'not proved',
  inconsistent: 'Claude reports a conflict (unverified until M3)',
  'gave-up': "gave up: Claude's attempts kept failing the checks",
  'cap-reached': 'stopped at a limit',
  'no-finish': 'ended without finishing',
  cancelled: 'cancelled',
  failed: 'failed',
};

/**
 * How a round can end other than with a proof result: Claude gave up after the checks kept failing, a limit stopped
 * it, or it ended without finishing (telelean then reverts to the last passing state). These are not the proof
 * results that D-19 hides until the statements are reviewed, so the board says them at once.
 */
const RUN_OUTCOME_VERDICTS: ReadonlySet<RunVerdict> = new Set<RunVerdict>(['gave-up', 'cap-reached', 'no-finish']);

/** Whether `verdict` tells how the run ended rather than what was proved (shown before the review, see above). */
export function isRunOutcomeVerdict(verdict: RunVerdict | undefined): verdict is 'gave-up' | 'cap-reached' | 'no-finish' {
  return verdict !== undefined && RUN_OUTCOME_VERDICTS.has(verdict);
}

/** Short words for those outcomes (the header badge, the state line). */
const OUTCOME_SHORT: Readonly<Record<'gave-up' | 'cap-reached' | 'no-finish', string>> = {
  'gave-up': 'Claude gave up',
  'cap-reached': 'stopped at a limit',
  'no-finish': 'ended without finishing',
};

/**
 * The proposal banner's line for a round that ended without a proof result: what happened and what the proposal holds
 * (the last state that passed the checks, when telelean reverted to one).
 */
export function runOutcomeText(verdict: 'gave-up' | 'cap-reached' | 'no-finish', maxAttempts: number, revertedTo: string | undefined): string {
  const what =
    verdict === 'gave-up'
      ? `Claude gave up: its result didn’t pass the checks ${maxAttempts} times.`
      : verdict === 'cap-reached'
        ? 'Claude was stopped at a limit before it finished.'
        : 'Claude ended without finishing.';
  return revertedTo ? `${what} This proposal holds only what last passed the checks (“${revertedTo}”).` : `${what} This proposal holds only what last passed the checks.`;
}

/**
 * The run panel's state line ("Working · formalising"). A proof result shows only once the result is revealed
 * (D-19); how the run ended (gave up, a limit, no finish) shows at once.
 */
export function runStateLabel(run: RunView, revealed = true): string {
  switch (run.state) {
    case 'starting':
      return 'Starting';
    case 'working':
      return run.stage === 'prove' ? 'Working · proving' : run.stage === 'formalise' ? 'Working · formalising' : 'Working';
    case 'waiting-for-answer':
      return 'Waiting for your answer';
    case 'gate':
      return "Checking Claude's result";
    case 'review':
      if (isRunOutcomeVerdict(run.verdict)) return `Ready for review · ${OUTCOME_SHORT[run.verdict]}`;
      return revealed && run.verdict ? `Ready for review · ${VERDICT_LABEL[run.verdict]}` : 'Ready for review';
    case 'interrupted':
      return 'Interrupted';
    case 'accepted':
      return 'Accepted';
    case 'discarded':
      return 'Discarded';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
  }
}

/** The header's run badge ("Claude: working on Spyro · 3/25 checks"). */
export function runBadgeText(run: RunView): string {
  const checks = `${run.counters.checks}/${run.caps.maxChecks} checks`;
  switch (run.state) {
    case 'starting':
      return `Claude: starting on ${run.subject}`;
    case 'working':
      return `Claude: working on ${run.subject} · ${checks}`;
    case 'waiting-for-answer':
      return `Claude: a question for you · ${run.subject}`;
    case 'gate':
      return `Claude: checking the result · ${run.subject}`;
    case 'review':
      return isRunOutcomeVerdict(run.verdict) ? `Claude: ${OUTCOME_SHORT[run.verdict].replace(/^Claude /, '')} · ${run.subject}` : `Claude: proposal ready · ${run.subject}`;
    case 'interrupted':
      return `Claude: interrupted · ${run.subject}`;
    default:
      return `Claude: ${runStateLabel(run).toLowerCase()} · ${run.subject}`;
  }
}

/** Whether the run needs the user now (the badge gets the attention style). */
export function runNeedsUser(run: RunView): boolean {
  return run.state === 'waiting-for-answer' || run.state === 'review' || run.state === 'interrupted' || run.state === 'failed';
}

/** How an ended run ended, as the run panel words it: `recorded` is an Accept that changed no file. */
export type EndedOutcome = 'accepted' | 'recorded' | 'discarded' | 'cancelled' | 'failed';

/** The run panel's sentence per outcome. An Accept that changed no file left no Undo step, so none is offered. */
export const ENDED_TEXT: Readonly<Record<EndedOutcome, string>> = {
  accepted: 'Accepted: Claude’s changes are in your files. Undo (Ctrl+Z) or History reverts them.',
  recorded: 'Recorded: nothing in your files changed; the outcome is in the card’s Attempts.',
  discarded: 'Discarded: your files were not changed.',
  cancelled: 'Cancelled: your files were not changed. The run’s working copy and transcript are kept for the record.',
  failed: 'The run failed; your files were not changed.',
};

/**
 * Whether the Accept of an accepted run changed the user's files (null: the board cannot tell). An Accept of a round
 * that changed no file only records the outcome: no Undo step, no history entry. The runner's record comes first (core
 * `RunView.accepted`, set by Accept before the run ends and saved in run.json), so every board reads the same answer
 * whichever board sent the Accept, and no board depends on the wording of the runner's notices (closing round 1).
 * Until a view with that record arrives, this board's own Accept tells (`accepted`: the proposal's `empty`, then the
 * host's answer). A run accepted before the record existed: null.
 */
export function acceptChangedFiles(run: Pick<RunView, 'runId' | 'accepted'>, accepted: { runId: string; changedFiles: boolean } | null): boolean | null {
  if (run.accepted !== undefined) return run.accepted.changedFiles;
  if (accepted !== null && accepted.runId === run.runId) return accepted.changedFiles;
  return null;
}

/** How an ended run ended (null while it has not ended), for the run panel's outcome line. */
export function endedOutcome(run: Pick<RunView, 'runId' | 'state' | 'accepted'>, accepted: { runId: string; changedFiles: boolean } | null): EndedOutcome | null {
  switch (run.state) {
    case 'accepted':
      return acceptChangedFiles(run, accepted) === false ? 'recorded' : 'accepted';
    case 'discarded':
    case 'cancelled':
    case 'failed':
      return run.state;
    default:
      return null;
  }
}

/**
 * Whether Accept will change the user's files: the round changed some, or a ticked card change (lifecycle, e.g. Goal
 * -> Derivation) does. Otherwise Accept only records the outcome.
 */
export function acceptChangesFiles(proposal: Pick<ProposalView, 'empty' | 'lifecycle'>, ticks: Readonly<Record<string, boolean>>): boolean {
  return !proposal.empty || proposal.lifecycle.some((item) => ticks[item.id] === true);
}

/**
 * The Accept button's tooltip (review and proposal banner): what Accept does to the user's files (D-21), given the
 * ticked card changes. An Accept that changes no file only records the outcome (no Undo step, no history entry).
 */
export function acceptTitle(proposal: Pick<ProposalView, 'empty' | 'lifecycle' | 'report'>, ticks: Readonly<Record<string, boolean>>): string {
  if (!acceptChangesFiles(proposal, ticks)) return 'Record the outcome: this round changed no file, so there is no Undo step and no history entry';
  if (proposal.empty) return 'Make the ticked card changes in your files (one Undo step; a history entry)';
  return isRunOutcomeVerdict(proposal.report.verdict) ? 'Apply what last passed the checks to your files (one Undo step; a history entry)' : 'Apply the proposal to your files (one Undo step; a history entry)';
}

/** Where the run panel puts each notice (A2): above the questions and the review, or folded below the review. */
export interface NoticePlaces {
  upfront: RunNotice[];
  later: RunNotice[];
}

/**
 * The run's notices by place. While Claude works every notice is news and goes upfront. Once the round has ended (in
 * review, or an ended run), only what explains how this round ended stays upfront, before the review: for a round
 * that gave up, hit a limit or did not finish, the latest notice of that outcome and the latest revert ("telelean
 * reverted its working copy to …"). The rest is history (the attempt-by-attempt notices, which the report card's check
 * attempts sum up, earlier rounds, plain information) and goes below the review, folded.
 */
export function placeNotices(run: Pick<RunView, 'state' | 'verdict' | 'notices'>): NoticePlaces {
  const notices = run.notices;
  if (run.state !== 'review' && !isTerminalRunState(run.state)) return { upfront: [...notices], later: [] };
  const keep = new Set<string>();
  if (run.state === 'review' && isRunOutcomeVerdict(run.verdict)) {
    const kinds: RunNotice['kind'][] = run.verdict === 'gave-up' ? ['gave-up', 'reverted'] : run.verdict === 'cap-reached' ? ['cap', 'reverted'] : ['reverted'];
    for (const kind of kinds) {
      const latest = notices.findLast((notice) => notice.kind === kind);
      if (latest) keep.add(latest.id);
    }
  }
  return { upfront: notices.filter((n) => keep.has(n.id)), later: notices.filter((n) => !keep.has(n.id)) };
}

/** The checks' steps in plain words (the gate of docs/m2-plan.md section 3); the step's name stays in the tooltip. */
export const CHECK_STEP: Readonly<Record<GateStepId, { label: string; title: string }>> = {
  G0: { label: 'allowed Lean only', title: 'Check G0: no forbidden command or token, and files only where they belong (before Lean runs)' },
  G1: { label: 'build', title: 'Check G1: Lean builds the files' },
  G3: { label: 'what it rests on', title: 'Check G3: proofs rest only on the selected premises; statements and your declarations stay as they were; new vocabulary is simple' },
  G4: { label: 'statement unchanged', title: 'Check G4: Lean compares the proved statement with the one frozen before the proof' },
  G5: { label: 'your words untouched', title: "Check G5: your cards' sentences, reasons and settings are untouched" },
};

/** Lean `#print`'s header of a statement abbrev: `@[reducible] def Spyro.pg_no_dark_past : Prop :=` (an optional docstring first). */
const PRINT_HEADER = /^\s*(?:\/--[\s\S]*?-\/\s*)?(?:@\[[^\]\n]*\]\s*)*(?:(?:private|protected|noncomputable)\s+)*(?:def|abbrev|theorem|opaque)\s+(?:«[^»]*»|[^\s:«])+\s*:\s*Prop\s*:=\s*/u;

/**
 * A statement as the review shows it: the proposition alone. The host renders statements with Lean's `#print`, whose
 * header (`@[reducible] def Spyro.pg_no_dark_past : Prop :=`) is not what the user's file says (`abbrev … : Prop :=`)
 * and tells nothing about the meaning. It is dropped when it has exactly that shape; any other text is shown as is.
 */
export function statementBody(text: string): string {
  const match = PRINT_HEADER.exec(text);
  if (!match) return text;
  const body = text.slice(match[0].length).trim();
  return body.length > 0 ? body : text;
}

// ---------------------------------------------------------------------------------------------------------------
// Questions (ask_user, D-20)

/** The board's own choices besides Claude's options (D-20: "Leave it open" always; "Decide for me"; free text). */
export interface AnswerDraft {
  kind: AnswerChoiceView['kind'] | null;
  option: number | null;
  /** The free-text answer (the user's words; may span lines). */
  text: string;
  scope: DecisionScope;
}

/** No pre-selected answer (D-20); the scope defaults to this run. */
export function emptyDraft(): AnswerDraft {
  return { kind: null, option: null, text: '', scope: 'run' };
}

/** Why a draft cannot be sent yet, or null. */
export function draftProblem(question: QuestionView, draft: AnswerDraft | undefined): string | null {
  if (!draft || draft.kind === null) return 'Choose an answer.';
  if (draft.kind === 'option' && (draft.option === null || draft.option < 0 || draft.option >= question.options.length)) return 'Choose an answer.';
  if (draft.kind === 'free-text') {
    if (draft.text.trim().length === 0) return 'Write your answer, or choose another one.';
    if (draft.text.length > LIMITS.textLength) return `Your answer is longer than ${LIMITS.textLength} characters.`;
  }
  return null;
}

/** The `answerQuestions` answers for a batch, or null while any question lacks a valid answer. */
export function draftAnswers(questions: readonly QuestionView[], drafts: readonly AnswerDraft[] | undefined): QuestionAnswer[] | null {
  if (questions.length === 0 || questions.length > LIMITS.answersPerBatch) return null;
  const answers: QuestionAnswer[] = [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const draft = drafts?.[i];
    if (!question || !draft || draftProblem(question, draft) !== null) return null;
    let choice: AnswerChoiceView;
    switch (draft.kind) {
      case 'option':
        choice = { kind: 'option', option: draft.option ?? 0 };
        break;
      case 'free-text':
        choice = { kind: 'free-text', text: draft.text.trim() };
        break;
      case 'leave-open':
        choice = { kind: 'leave-open' };
        break;
      case 'decide-for-me':
        choice = { kind: 'decide-for-me' };
        break;
      default:
        return null;
    }
    answers.push({ question: question.index, choice, scope: draft.scope });
  }
  return answers;
}

/** An answer in words: the option's label (Claude's words), the user's free text, "Leave it open", "Decide for me". */
export function answerChoiceText(choice: AnswerChoiceView, question: Pick<QuestionView, 'options'>): string {
  switch (choice.kind) {
    case 'option':
      return question.options[choice.option]?.label ?? `option ${choice.option + 1}`;
    case 'free-text':
      return choice.text;
    case 'leave-open':
      return 'Leave it open';
    case 'decide-for-me':
      return 'Decide for me';
  }
}

export const SCOPE_LABEL: Readonly<Record<DecisionScope, string>> = {
  run: 'this run',
  nodes: 'these cards',
  subject: 'the whole subject',
};

// ---------------------------------------------------------------------------------------------------------------
// Review (D-19 M2: statements first, then vocabulary, definitions, the report card, lifecycle items)

export type ReviewStep =
  | { kind: 'statement'; index: number; count: number; item: StatementReview }
  | { kind: 'vocabulary'; item: VocabularyReview }
  | { kind: 'definitions' }
  | { kind: 'result' }
  | { kind: 'lifecycle' };

/** The stepper's steps, in order: one per new or changed statement, then the others that have something to show. */
export function reviewSteps(proposal: ProposalView): ReviewStep[] {
  const statements = proposal.review.filter((item): item is StatementReview => item.kind === 'statement');
  const steps: ReviewStep[] = statements.map((item, index) => ({ kind: 'statement', index, count: statements.length, item }));
  const vocabulary = proposal.review.filter((item): item is VocabularyReview => item.kind === 'vocabulary' && item.items.length > 0);
  for (const item of vocabulary) steps.push({ kind: 'vocabulary', item });
  if (proposal.definitions.length > 0) steps.push({ kind: 'definitions' });
  steps.push({ kind: 'result' });
  if (proposal.lifecycle.length > 0) steps.push({ kind: 'lifecycle' });
  return steps;
}

/** Whether reaching step `step` means the user has gone through every statement (the result is then revealed). */
export function pastStatements(steps: readonly ReviewStep[], step: number): boolean {
  const lastStatement = steps.reduce((last, s, i) => (s.kind === 'statement' ? i : last), -1);
  return step > lastStatement;
}

export const STEP_TITLE: Readonly<Record<ReviewStep['kind'], string>> = {
  statement: 'Statements',
  vocabulary: 'New vocabulary',
  definitions: 'Definitions',
  result: 'Result',
  lifecycle: 'Card changes',
};

/** Accept needs a "yes" for every definition question (A2, decision 17). */
export function definitionsApproved(proposal: Pick<ProposalView, 'definitions'>, answers: Readonly<Record<string, 'yes' | 'no'>>): boolean {
  return proposal.definitions.every((d) => answers[d.id] === 'yes');
}

/** What Accept sends: the ticked lifecycle items and the approved definitions, in the proposal's order. */
export function acceptSelection(
  proposal: Pick<ProposalView, 'definitions' | 'lifecycle'>,
  review: { definitions: Readonly<Record<string, 'yes' | 'no'>>; lifecycle: Readonly<Record<string, boolean>> },
): { lifecycle: string[]; definitions: string[] } {
  return {
    lifecycle: proposal.lifecycle.filter((item) => review.lifecycle[item.id] === true).map((item) => item.id).slice(0, LIMITS.reviewItems),
    definitions: proposal.definitions.filter((d) => review.definitions[d.id] === 'yes').map((d) => d.id).slice(0, LIMITS.reviewItems),
  };
}

/** Lifecycle ticks as the review starts: the recommended items pre-ticked. */
export function initialLifecycle(proposal: Pick<ProposalView, 'lifecycle'>): Record<string, boolean> {
  return Object.fromEntries(proposal.lifecycle.map((item) => [item.id, item.recommended]));
}

/** "1 new · 2 changed · +1 vocabulary" (the proposal banner). */
export function diffCountsText(proposal: Pick<ProposalView, 'diff' | 'empty'>): string {
  const { added, changed, removed, vocabularyAdded } = proposal.diff.counts;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} new`);
  if (changed > 0) parts.push(`${changed} changed`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (vocabularyAdded > 0) parts.push(`+${vocabularyAdded} vocabulary`);
  if (parts.length > 0) return parts.join(' · ');
  return proposal.empty ? 'no file changes' : 'no card changes';
}

/** Vocabulary items the proposal adds ("+N new" in the proposed view). */
export function newVocabularyCount(diff: Pick<GraphDiff, 'vocabulary'>): number {
  return Object.values(diff.vocabulary).filter((change) => change === 'added').length;
}

/** The suggestions waiting for a decision ("Claude suggests"): the run's live list, else the proposal's. */
export function suggestedGhosts(run: RunView | null, proposal: ProposalView | null): GhostView[] {
  const list = run && proposal && run.runId === proposal.runId ? run.ghosts : (proposal?.ghosts ?? run?.ghosts ?? []);
  return list.filter((ghost) => ghost.state === 'suggested');
}

// ---------------------------------------------------------------------------------------------------------------
// The proposal overlay on the board (03 section 7: diff marks are colour + glyph + halo, never colour alone)

export const DIFF_GLYPH = { added: '+', changed: '~', removed: '−' } as const;
export const DIFF_WORD = { added: 'new', changed: 'changed', removed: 'removed' } as const;

const FIELD_WORD: Readonly<Record<NodeChangeField, string>> = {
  sentence: 'sentence',
  type: 'kind',
  statement: 'Lean statement',
  proof: 'proof',
  premises: 'premises',
  status: 'status',
  binding: 'Lean binding',
  fields: 'other fields',
};

/** Fields that tell the proof result: hidden until the result is revealed (D-19, "meaning before proof status"). */
const RESULT_FIELDS: readonly NodeChangeField[] = ['proof', 'status'];

/** The diff badge's tooltip. While the result is hidden, the fields that would tell it are left out. */
export function diffTitle(diff: NodeDiff, hideResult: boolean): string {
  if (diff.change === 'added') return 'New in the proposal';
  if (diff.change === 'removed') return 'Removed by the proposal';
  const fields = diff.fields.filter((f) => !hideResult || !RESULT_FIELDS.includes(f)).map((f) => FIELD_WORD[f]);
  return fields.length > 0 ? `Changed in the proposal: ${fields.join(', ')}` : 'Changed in the proposal';
}

/** What the board's columns read: the current graph's data, or the proposal's (BoardState and Overlay both have it). */
export interface BoardViewData {
  nodes: Readonly<Record<string, TlNode>>;
  order: Readonly<Record<NodeType, readonly string[]>>;
  edges: readonly TlEdge[];
  vocabulary: readonly VocabItem[];
  vocab: ReadonlyMap<string, VocabItem>;
}

export interface Overlay extends BoardViewData {
  proposalId: string;
  subject: string;
  diff: GraphDiff;
  /**
   * Cards whose proof result is hidden until the user has gone through the statements or pressed "Show result"
   * (D-19): their proof chips and footprint are not shown, and Lean-verified arrows into them are not drawn.
   */
  hidden: ReadonlySet<string>;
}

/**
 * The board as the proposal would leave it: the proposal's graph, plus the current cards and vocabulary it removes
 * (shown with "−"). With `hideResult`, the target and every card whose proof changed keep their result hidden.
 */
export function buildOverlay(
  proposal: ProposalView,
  current: { nodes: Readonly<Record<string, TlNode>>; vocabulary: readonly VocabItem[] },
  hideResult: boolean,
): Overlay {
  const nodes: Record<string, TlNode> = {};
  for (const node of proposal.graph.nodes) nodes[node.id] = node;
  const removed: TlNode[] = [];
  for (const [id, diff] of Object.entries(proposal.diff.nodes)) {
    const node = current.nodes[id];
    if (diff.change === 'removed' && !nodes[id] && node) {
      nodes[id] = node;
      removed.push(node);
    }
  }
  const order = columnOrder([...proposal.graph.nodes, ...removed]);
  const vocabulary = [...proposal.graph.vocabulary];
  const names = new Set(vocabulary.map((item) => item.name));
  for (const item of current.vocabulary) if (proposal.diff.vocabulary[item.name] === 'removed' && !names.has(item.name)) vocabulary.push(item);
  const hidden = new Set<string>();
  if (hideResult) {
    if (nodes[proposal.report.target]) hidden.add(proposal.report.target);
    for (const [id, diff] of Object.entries(proposal.diff.nodes)) if (nodes[id] && (diff.change === 'added' || diff.fields.includes('proof'))) hidden.add(id);
  }
  const edges = hidden.size > 0 ? proposal.graph.edges.filter((edge) => !(edge.type === 'verified' && hidden.has(edge.target))) : proposal.graph.edges;
  return {
    proposalId: proposal.proposalId,
    subject: proposal.subject,
    diff: proposal.diff,
    nodes,
    order,
    edges,
    vocabulary,
    vocab: new Map(vocabulary.map((item) => [item.name, item])),
    hidden,
  };
}

/** Chip keys of a card face that tell its proof result (hidden while the overlay hides the result). */
export const RESULT_CHIP_KEYS: ReadonlySet<string> = new Set([
  'proof',
  'proved-goal',
  'conditional',
  'pending-promotion',
  'uses-sorry',
  'holds-mismatch',
  'self-evident',
  'rests-on-claimed',
  'existence-commitment',
  'provable-assumption',
]);
