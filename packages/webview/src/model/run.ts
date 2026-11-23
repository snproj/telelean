/**
 * Pure helpers for the M2 run UI (no DOM, no React; unit-tested): what the status line, the header badge and the
 * question cards show, from core's RunView (docs/m2-plan.md section 6). The board never computes verdicts: it only
 * words what the host sent. Slice 2h retired M2's review stepper and proposal overlay (an edit session's Proposed view
 * is model/sessionBoard.ts's); `missingArrowHints` and `statementBody` stay for the session's review.
 */
import {
  isTerminalRunState,
  LIMITS,
  REVIEW_TEXTS,
  type AnswerChoiceView,
  type DecisionScope,
  type GateStepId,
  type NodeChangeKind,
  type ProposalView,
  type QuestionAnswer,
  type QuestionView,
  type RunNotice,
  type RunUsage,
  type RunVerdict,
  type RunView,
  type TlNode,
} from '@telelean/core';
import { formatTime } from './format';

// ---------------------------------------------------------------------------------------------------------------
// Run state

/** A run that still needs the user or Claude (not accepted, discarded, cancelled or failed). */
export function isActiveRun(run: RunView | null | undefined): run is RunView {
  return run !== null && run !== undefined && !isTerminalRunState(run.state);
}

/**
 * Why no run can start while a run of this model folder exists (at most one active run per root, docs/m2-plan.md
 * section 2), or null. `subject` is the board's subject: another subject's run is named. (The tray's run buttons used
 * it; since slice 1e, Formalize for dependencies does: board/contextActions.ts `formalizeRunBlock`.)
 */
export function trayRunBlock(run: RunView | null | undefined, subject: string): string | null {
  if (!isActiveRun(run)) return null;
  const where = run.subject !== subject ? ` on ${run.subject}` : '';
  switch (run.state) {
    case 'review':
      // Slice 2h: a run in review is an edit session (M2's Accept, Feedback and Discard are retired).
      return `An edit session${where} is waiting for your review: apply or exit it first.`;
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
      // Slice 2h: a run in review has an edit session (the badge then words the session's phase); with none, an error
      // says why (a v1 run that could not be converted offers only Stop), else the session is still being opened.
      if (isRunOutcomeVerdict(run.verdict)) return `Claude: ${OUTCOME_SHORT[run.verdict].replace(/^Claude /, '')} · ${run.subject}`;
      return run.error !== undefined ? `Claude: could not open the review · ${run.subject}` : `Claude: opening the review · ${run.subject}`;
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
 * The run panel's line for an ended run (null while it has not ended). Slice 2g and 2k1 (D2-100 D2, §5.9): an edit
 * session's Apply that changed files and its Exit in the session's words (core `REVIEW_TEXTS.applied`, `exited`); an
 * Apply that changed none is "Recorded" (`endedOutcome`), and every other end has its `ENDED_TEXT`, as for any run.
 */
export function endedText(run: Pick<RunView, 'runId' | 'state' | 'accepted' | 'session'>): string | null {
  const ended = endedOutcome(run, null);
  if (ended === null) return null;
  if (run.session !== undefined && ended === 'accepted') return REVIEW_TEXTS.applied;
  if (run.session !== undefined && ended === 'discarded') return REVIEW_TEXTS.exited;
  return ENDED_TEXT[ended];
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

/** Vocabulary items a Proposed view adds ("+N new"; slice 2h: an edit session's, model/sessionBoard.ts `sessionOverlay`). */
export function newVocabularyCount(diff: { vocabulary: Readonly<Record<string, NodeChangeKind>> }): number {
  return Object.values(diff.vocabulary).filter((change) => change === 'added').length;
}

/** Spec v4.1 A10 (slice 1e): what the report offers for a card the proof needs but nobody selected. */
export interface MissingArrowHint {
  /** The card the gap names. */
  id: string;
  /** `select`: an arrow from it into the target is drawn already, but was not selected; `draw`: there is none. */
  kind: 'draw' | 'select';
  text: string;
}

/** A card's sentence in a hint (cut near 40 characters, like the board's other two-card texts). */
function hintName(nodes: Readonly<Record<string, TlNode>>, id: string): string {
  const chars = Array.from((nodes[id]?.naturalName ?? id).replace(/\s+/g, ' ').trim());
  return `“${chars.length <= 40 ? chars.join('') : `${chars.slice(0, 39).join('')}…`}”`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `word` first occurs in `text` as a whole word (`inside`: the characters a word is made of), or -1. */
function wordAt(text: string, word: string, inside: string): number {
  const match = new RegExp(`(^|[^${inside}])${escapeRegExp(word)}($|[^${inside}])`, 'u').exec(text);
  return match === null ? -1 : match.index + (match[1]?.length ?? 0);
}

/**
 * Spec v4.1 A10 (slice 1e): Claude finished without a proof because the proof needs a card that nobody selected. The
 * prompts tell it to name that card by its id in `gap` (never to use it, never to propose it as a premise), so each
 * card of the subject the gap names (its id, or its statement's Lean name, as a whole word), other than the target and
 * the selected premises, gets "Draw (or select) the arrow from ‹card› and run again", or, when an arrow from it into the
 * target is drawn already but was not selected, "Select ‹card› → ‹target› too". In the order the gap names them;
 * nothing for a proved verdict.
 */
export function missingArrowHints(
  report: Pick<ProposalView['report'], 'verdict' | 'gap' | 'target'>,
  premises: readonly string[],
  nodes: Readonly<Record<string, TlNode>>,
): MissingArrowHint[] {
  const gap = report.gap;
  if (gap === undefined || gap.trim() === '' || report.verdict === 'proved') return [];
  const target = nodes[report.target];
  const found: Array<{ id: string; at: number }> = [];
  for (const node of Object.values(nodes)) {
    if (node.id === report.target || premises.includes(node.id) || node.subject !== target?.subject) continue;
    const byId = wordAt(gap, node.id, 'A-Za-z0-9_\\-');
    const statement = node.lean.statement;
    const short = statement?.slice(statement.lastIndexOf('.') + 1);
    const byName = [statement !== undefined ? wordAt(gap, statement, "A-Za-z0-9_'") : -1, short ? wordAt(gap, short, "A-Za-z0-9_'") : -1];
    const at = [byId, ...byName].filter((i) => i >= 0);
    if (at.length > 0) found.push({ id: node.id, at: Math.min(...at) });
  }
  found.sort((a, b) => a.at - b.at);
  const drawn = new Set(target?.premises ?? []);
  return found.map(({ id }) =>
    drawn.has(id)
      ? { id, kind: 'select' as const, text: `Select ${hintName(nodes, id)} → ${hintName(nodes, report.target)} too.` }
      : { id, kind: 'draw' as const, text: `Draw (or select) the arrow from ${hintName(nodes, id)} and run again.` },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Diff marks (03 section 7: colour + glyph + halo, never colour alone): the Vocabulary band's new items in a session's
// Proposed view. Slice 2h retired M2's proposal overlay (`buildOverlay`, `resultSignature`): the Proposed view is an edit
// session's (model/sessionBoard.ts), built from the host's board, and its cards carry review-item marks instead.

export const DIFF_GLYPH = { added: '+', changed: '~', removed: '−' } as const;
export const DIFF_WORD = { added: 'new', changed: 'changed', removed: 'removed' } as const;
