/**
 * Slice 2g (docs/slice2-plan.md 5.8, 5.9, 5.13): the session bar (CM-6; it replaces ProposalBanner during a session),
 * the run badge's and RunElsewhere's session texts, the Exit dialog's counts and the end confirmation, as pure state
 * read from the host's `SessionView` (and the session's RunView for a running step's progress). Every gate is the
 * host's (`submit.gate`, `heading.retry`, `confirmation.apply`); the bar only says why, and closes Apply also on its
 * own when the check has not passed or the files drift (EN-2, ES-7), whatever the gate says. Never a verdict.
 */
import { REVIEW_TEXTS, type EndConfirmationView, type FinalCheckRule, type RunView, type SessionView, type StepView } from '@telelean/core';
import { readOnlyReason, stepRunning, wordsIn, type LabelPart } from './review';

export { readOnlyReason, stepRunning };

/** Builder 2g: Cancel step's tooltip when no step is left after it (the run panel's Cancel said the same). */
export const CANCEL_STEP_TITLE = 'Stop Claude and its Lean jobs; your files are not changed';

export interface BarControl {
  shown: boolean;
  enabled: boolean;
  /** The tooltip, or why it is disabled. */
  title: string;
}

export interface BarLine {
  kind: 'heading' | 'drift' | 'judging' | 'problem';
  text: string;
  /** Items the line names (links). */
  items: string[];
}

export interface SessionBarState {
  title: LabelPart[];
  /** "Stage N"; null before the first stage opens (stage 0, the first queue). */
  stage: string | null;
  phase: LabelPart[];
  /** While a step runs: "The review waits until the last step ends." */
  phaseNote: string | null;
  cancelStep: BarControl;
  resume: BarControl;
  retry: BarControl;
  rawDiff: BarControl & { asks: boolean };
  submit: BarControl & { missing: string[] };
  exit: BarControl;
  /** "Review (N)" when the panel is hidden. */
  review: BarControl & { text: string };
  lines: BarLine[];
}

const hidden: BarControl = { shown: false, enabled: false, title: '' };

/** The step the bar speaks about: the running one, else the interrupted one, else the next queued, else the last. */
export function barStep(session: Pick<SessionView, 'steps'>): StepView | null {
  const steps = session.steps;
  return steps.find((s) => s.state === 'running') ?? steps.find((s) => s.state === 'interrupted') ?? steps.find((s) => s.state === 'queued') ?? steps.at(-1) ?? null;
}

/** The ES-4 heading's line (§5.8): "did not pass" gets the bar's tail; "Step cancelled" and "Step failed: …" as they are. */
export function headingLine(heading: NonNullable<SessionView['heading']>): string {
  if (heading.kind !== 'did-not-pass') return heading.text;
  const prefix = REVIEW_TEXTS.didNotPass('');
  if (heading.text.startsWith(prefix)) return REVIEW_TEXTS.didNotPassBar(heading.text.slice(prefix.length));
  // A decision's heading names no step (builder 2f's R1-1): the same tail, after its own text.
  const tail = REVIEW_TEXTS.didNotPassBar('').slice(prefix.length);
  return `${heading.text}${tail}`;
}

const targetName = (session: Pick<SessionView, 'inferences'>, id: string) => session.inferences.find((i) => i.target.id === id)?.target;

/** §5.8: the session bar, phase by phase (§5.13). `panelOpen`: whether the review panel is on screen. */
export function sessionBarState(
  session: SessionView,
  run: Pick<RunView, 'state' | 'stage' | 'canResume'> | null,
  panelOpen: boolean,
): SessionBarState {
  const targets = [...session.inferences].sort((a, b) => a.order - b.order).map((i) => i.target);
  const titleText = REVIEW_TEXTS.sessionTitle(targets.map((t) => t.sentence));
  const title = targets.length === 1 && targets[0] !== undefined ? wordsIn(titleText, targets[0].sentence, targets[0].wordedBy) : [{ kind: 'text' as const, text: titleText }];
  const running = stepRunning(session);
  let phase: LabelPart[];
  let phaseNote: string | null = null;
  switch (session.phase) {
    case 'step': {
      const step = barStep(session);
      const state =
        run?.state === 'waiting-for-answer' ? REVIEW_TEXTS.stepWaiting : run?.state === 'gate' ? REVIEW_TEXTS.stepChecking : REVIEW_TEXTS.stepWorking(run?.stage === 'prove' ? 'prove' : 'formalise');
      const target = step !== null ? targetName(session, step.target) : undefined;
      const name = target?.sentence ?? step?.target ?? '';
      const full = REVIEW_TEXTS.stepPhase(name, step?.index ?? 1, step?.of ?? 1, state);
      phase = wordsIn(full, name, target?.wordedBy ?? 'user');
      phaseNote = REVIEW_TEXTS.reviewWaits;
      break;
    }
    case 'interrupted':
      phase = [{ kind: 'text', text: REVIEW_TEXTS.interruptedPhase }];
      break;
    case 'stage':
      phase = [{ kind: 'text', text: REVIEW_TEXTS.reviewPhase(session.counts.inReview, session.counts.accepted, !session.results.shown) }];
      break;
    case 'confirming':
      phase = [{ kind: 'text', text: REVIEW_TEXTS.confirmingPhase }];
      break;
    case 'applying':
      phase = [{ kind: 'text', text: REVIEW_TEXTS.applyingNow }];
      break;
  }
  const step = running ? barStep(session) : null;
  const left = step !== null && step.of > step.index ? step.of - step.index : 0;
  const heading = session.heading;
  const submitGate = session.submit.gate;
  const submitTitle = submitGate.ok
    ? session.submit.next === 'confirm'
      ? REVIEW_TEXTS.submitToConfirm
      : session.submit.next === 'claude-steps' && session.submit.work !== undefined
        ? REVIEW_TEXTS.submitSteps(session.submit.work.shaky, session.submit.work.redo)
        : REVIEW_TEXTS.submitReview
    : submitGate.reason;
  const lines: BarLine[] = [];
  if (heading !== null) lines.push({ kind: 'heading', text: headingLine(heading), items: [] });
  if (session.drift !== null) lines.push({ kind: 'drift', text: REVIEW_TEXTS.drift(session.drift.files), items: [] });
  if (session.judging) lines.push({ kind: 'judging', text: REVIEW_TEXTS.judging, items: [] });
  for (const problem of session.problems) lines.push({ kind: 'problem', text: problem.text, items: [...problem.items] });
  return {
    title,
    stage: session.stage > 0 ? REVIEW_TEXTS.stage(session.stage) : null,
    phase,
    phaseNote,
    cancelStep: running ? { shown: true, enabled: true, title: left > 0 ? REVIEW_TEXTS.cancelStepRest(left) : CANCEL_STEP_TITLE } : hidden,
    resume: session.phase === 'interrupted' ? { shown: true, enabled: run?.canResume === true, title: REVIEW_TEXTS.resume } : hidden,
    retry:
      heading !== null && session.phase !== 'confirming' && session.phase !== 'applying'
        ? { shown: true, enabled: heading.retry.ok && !running, title: heading.retry.ok ? (running ? REVIEW_TEXTS.stepRunning : REVIEW_TEXTS.retryStep) : heading.retry.reason }
        : hidden,
    rawDiff: session.phase === 'stage' ? { shown: true, enabled: true, title: session.results.shown ? REVIEW_TEXTS.rawDiff : REVIEW_TEXTS.rawDiffReveals, asks: !session.results.shown } : { ...hidden, asks: false },
    submit:
      session.phase === 'stage' || running
        ? { shown: true, enabled: submitGate.ok && !running, title: running ? REVIEW_TEXTS.stepRunning : submitTitle, missing: submitGate.ok ? [] : [...(submitGate.missing ?? [])] }
        : { ...hidden, missing: [] },
    exit: session.phase !== 'applying' ? { shown: true, enabled: true, title: REVIEW_TEXTS.exitSessionEllipsis } : hidden,
    review: !panelOpen ? { shown: true, enabled: true, title: REVIEW_TEXTS.reviewN(session.counts.inReview), text: REVIEW_TEXTS.reviewN(session.counts.inReview) } : { ...hidden, text: '' },
    lines,
  };
}

/** Builder 2g r1's wording of the badge in the phases §5.8 does not word (same shape as core's two). */
export const badgeInterrupted = (subject: string) => `Edit session: interrupted · ${subject}`;
export const badgeConfirming = (subject: string) => `Edit session: confirming · ${subject}`;
export const badgeApplying = (subject: string) => `Edit session: applying · ${subject}`;

/** §5.8, the run badge during a session: never a verdict ("Edit session: Claude working · Spyro · 3/25 checks"). */
export function sessionBadgeText(session: Pick<SessionView, 'subject' | 'phase'>, run: Pick<RunView, 'counters' | 'caps'> | null): string {
  if (session.phase === 'step' && run !== null) return REVIEW_TEXTS.badgeWorking(session.subject, run.counters.checks, run.caps.maxChecks);
  // Builder 2g r1 (F-V2G-FC-3): the phases where no decision can be made say so (the plan words only working and review).
  if (session.phase === 'interrupted') return badgeInterrupted(session.subject);
  if (session.phase === 'confirming') return badgeConfirming(session.subject);
  if (session.phase === 'applying') return badgeApplying(session.subject);
  return REVIEW_TEXTS.badgeReview(session.subject);
}

/** §5.9: the Exit dialog's counts, listed items only (a hidden Result is never counted, §2.3). */
export function exitCounts(session: Pick<SessionView, 'counts' | 'phase'>): { accepted: number; inReview: number; stepRunning: boolean } {
  return { accepted: session.counts.accepted, inReview: session.counts.inReview, stepRunning: stepRunning(session) };
}

/** Builder 2g's labels of the final check's rules (§2.3 `FinalCheckRule`; the plan quotes none). */
export const FINAL_CHECK_RULE_LABEL: Readonly<Record<FinalCheckRule, string>> = {
  drift: 'Your files',
  facts: 'Facts',
  build: 'Build',
  rules: 'Checks',
  permitted: 'What the proofs may use',
  'no-hidden-edges': 'Hidden arrows',
  arrows: 'Arrows',
  kinds: 'Kinds',
  comparator: 'Statements',
  items: 'Items',
  backstop: 'Backstop',
};

export interface ConfirmationModel {
  check: { id: string; state: EndConfirmationView['check']['state']; text: string; reused: boolean };
  failures: Array<{ rule: string; text: string; items: string[]; declaration?: string }>;
  apply: { enabled: boolean; title: string };
}

/**
 * §5.9: the end confirmation's check and buttons. Apply is enabled only when the host's gate is open, the check
 * passed, no file drifts and no write is pending (EN-2, ES-7); it then sends the check's id.
 */
export function confirmationModel(session: Pick<SessionView, 'phase' | 'drift' | 'judging'>, confirmation: EndConfirmationView): ConfirmationModel {
  const check = confirmation.check;
  const text = check.state === 'running' ? REVIEW_TEXTS.finalCheckRunning : check.state === 'passed' ? REVIEW_TEXTS.finalCheckPassed : REVIEW_TEXTS.applyCheckFailed;
  const enabled = session.phase === 'confirming' && confirmation.apply.ok && check.state === 'passed' && session.drift === null && !session.judging;
  let title: string;
  if (!confirmation.apply.ok) title = confirmation.apply.reason;
  else if (check.state === 'running') title = REVIEW_TEXTS.applyWaitsForCheck;
  else if (check.state === 'failed') title = REVIEW_TEXTS.applyCheckFailed;
  else if (session.drift !== null) title = REVIEW_TEXTS.drift(session.drift.files);
  else if (session.phase !== 'confirming') title = REVIEW_TEXTS.applyingNow;
  else if (session.judging) title = REVIEW_TEXTS.judging;
  else title = confirmation.empty ? REVIEW_TEXTS.applyRecords : REVIEW_TEXTS.applyWrites;
  return {
    check: { id: check.id, state: check.state, text, reused: check.reusedFileChecks },
    failures: check.failures.map((f) => ({ rule: FINAL_CHECK_RULE_LABEL[f.rule], text: f.text, items: [...(f.items ?? [])], ...(f.declaration !== undefined ? { declaration: f.declaration } : {}) })),
    apply: { enabled, title },
  };
}
