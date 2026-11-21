/**
 * M2: a Claude run ("These suffice", D-19 one-shot with an explicit freeze, amendment A2's gate loop) as the board
 * sees it, the proposal it leaves for Accept / Feedback / Discard, and the sidecar records it writes
 * (`.telelean/subjects/<S>/attempts.jsonl`, `.telelean/subjects/<S>/decisions.json`).
 *
 * FROZEN CONTRACT (M2, docs/m2-plan.md section 6). Owner after the freeze: the integrator. Builders may only add
 * OPTIONAL fields or new exports, recorded in the plan's change log (section 14).
 *
 * Who produces what:
 *   RunView       the runner's RunManager (WP3), posted by the extension (WP5) as the `run` message
 *   ProposalView  the runner's ProposalService (WP4), posted as the `proposal` message
 *   AttemptLine / DecisionsFile   written by WP4's sidecar store, read back into `TlGraph.attempts` (WP4)
 * The webview (WP6) renders them; it never computes verdicts itself.
 *
 * Provenance (D-15): every string marked "Claude's words" is shown in italics with a marker, never in the user's style.
 */
import { parseNodeType, type BoardDiagnostic, type StatusFlag, type TlGraph, type TlNode } from './model.js';
import type { SessionPhase, StepView } from './review/view.js';

// ---------------------------------------------------------------------------------------------
// Questions (ask_user, D-20)

/**
 * D-20 phenomenon tags. Same list, same order as `PHENOMENA` in runner/src/llm/types.ts (the tool schema the model
 * sees); the runner asserts the two agree at compile time.
 */
export const PHENOMENA = [
  'enthymeme',
  'genericity',
  'modality',
  'negation',
  'presupposition',
  'scalar',
  'vagueness',
  'evaluative-standard',
  'indexical',
  'word-sense',
  'tense',
  'granularity',
  'closed-world',
  'other',
] as const;
export type Phenomenon = (typeof PHENOMENA)[number];

export interface QuestionOptionView {
  /** Claude's words. */
  label: string;
  /** What choosing it means, in plain words (Claude's words). */
  consequence: string;
  /** Optional Lean rendering of what the option would formalise to. */
  formalPreview?: string;
}

/**
 * One question of a pending ask_user batch. Deliberately WITHOUT Claude's guess: D-20 reveals it only after the user
 * answered, so the host never sends it before (it arrives in `AnsweredQuestionView.claudesGuess`).
 */
export interface QuestionView {
  /** Index in its batch (0-2). */
  index: number;
  phenomenon: Phenomenon;
  /** Claude's words. */
  question: string;
  /** 2-4 options. The board always adds "Leave it open", free text and "Decide for me". */
  options: QuestionOptionView[];
  /** Node ids the answer affects (cards of this subject; unknown ids are dropped by the host). */
  affectedNodes: string[];
}

/** One ask_user call waiting for the user (1-3 questions). */
export interface QuestionSetView {
  /** Host-generated (`q1`, `q2`, …; `[A-Za-z0-9_.-]{1,64}`), unique within the run. */
  id: string;
  askedAt: string;
  questions: QuestionView[];
}

export type AnswerChoiceView =
  | { kind: 'option'; option: number }
  | { kind: 'free-text'; text: string }
  /** "Leave it open": keep it uninterpreted (recorded, D-20). */
  | { kind: 'leave-open' }
  /** "Decide for me": an explicit delegation; Claude lists its choice under assumed_without_asking. */
  | { kind: 'decide-for-me' };

/** D-20 scope of an answer: this run only, the affected nodes, or the whole subject. */
export type DecisionScope = 'run' | 'nodes' | 'subject';
export const DECISION_SCOPES: readonly DecisionScope[] = ['run', 'nodes', 'subject'];

/** The user's answer to one question of a batch. */
export interface QuestionAnswer {
  question: number;
  choice: AnswerChoiceView;
  scope: DecisionScope;
}

export interface AnsweredQuestionView extends QuestionView {
  setId: string;
  answer: QuestionAnswer;
  answeredAt: string;
  /** Revealed only now (D-20): Claude's own guess, as Claude worded it. */
  claudesGuess?: { option?: number; note?: string };
}

// ---------------------------------------------------------------------------------------------
// Run state

/** Where a run is. Terminal states: accepted, discarded, cancelled, failed (TERMINAL_RUN_STATES). */
export type RunState =
  /** Preflight (binary and version, sandbox, toolchain, memory), shadow creation, CLI start with its auth and hook checks. */
  | 'starting'
  /** Claude is working on a turn (see `stage`). */
  | 'working'
  /** An ask_user call waits for the user; the agent-active clock is paused. */
  | 'waiting-for-answer'
  /** Claude called finish; telelean runs the gate (G0-G5). */
  | 'gate'
  /** The turn ended: the proposal (or a "not proved" outcome) waits for Accept / Feedback / Discard. */
  | 'review'
  /** A window reload or crash ended the Claude process mid-turn; the board offers Resume / Stop. */
  | 'interrupted'
  | 'accepted'
  | 'discarded'
  | 'cancelled'
  | 'failed';

export const TERMINAL_RUN_STATES: readonly RunState[] = ['accepted', 'discarded', 'cancelled', 'failed'];

export function isTerminalRunState(state: RunState): boolean {
  return TERMINAL_RUN_STATES.includes(state);
}

/**
 * Spec v4 ES-7, ES-9, UN-3 (slice 1f; docs/slice1-plan.md 2.7 and 2.8). In slice 1 an edit session is a run: from its
 * start until Accept, Discard or an end that stops it. While a run of the model folder is active, its base (the
 * user's files when it started) must not change, so no board of that folder can be edited: no field edit, arrow, kind
 * change, add, delete, move, new subject, Undo, Redo or History revert. The extension host refuses each such message
 * with this text (`conflict`), and the board shows it on every control it disables.
 */
export const EDIT_SESSION_ACTIVE = "An edit session is active: the board can't be edited until you accept or discard it.";

/** Whether `run` locks the boards of its model folder (ES-9): it exists and has not ended. */
export function runLocksBoard(run: Pick<RunView, 'state'> | null | undefined): boolean {
  return run !== null && run !== undefined && !isTerminalRunState(run.state);
}

/** D-19: before freeze_statements Claude formalises (proof bodies are rejected); after it, it proves the frozen statements. */
export type RunStage = 'formalise' | 'prove';

/** How a round ended (the report card, attempts.jsonl). */
export type RunVerdict =
  /** The gate passed with finish status `proved`. */
  | 'proved'
  /** The gate passed with finish status `not_proved` or `lean_errors`: nothing is claimed proved. */
  | 'not-proved'
  /** Claude claims the premises are insufficient. M2 shows it as "not proved": countermodels arrive in M3 (D-6). */
  | 'insufficient'
  /** Claude claims the premises conflict. Unverified in M2 (model finder: M3). */
  | 'inconsistent'
  /** The gate failed `maxGateAttempts` times; the shadow was reverted to the last state that passed (A2). */
  | 'gave-up'
  /** The turn or agent-active-time cap was reached; the shadow was reverted to the last state that passed. */
  | 'cap-reached'
  /** The turn ended twice without a finish call; the shadow was reverted to the last state that passed. */
  | 'no-finish'
  | 'cancelled'
  /** Preflight, sandbox or backend failure (see `RunView.error`). */
  | 'failed';

/** Caps (D-25, 03 section 8.6). Each round (the first, every Feedback, every ghost adoption) gets the full budget. */
export interface RunCaps {
  /** Model responses per round, enforced by the host (the CLI's --max-turns counts per user turn only). */
  maxTurns: number;
  /** Lean checks per round (check_lean, freeze_statements and propose_assumption each count one). */
  maxChecks: number;
  /** Agent-active time per round in ms; paused while a question waits for the user. */
  maxAgentMs: number;
  /** Wall-clock limit of each Lean job (build, check file, comparator, export) in ms. */
  leanJobMs: number;
  /** Gate attempts per round before giving up (A2, setting). */
  maxGateAttempts: number;
}

export const DEFAULT_RUN_CAPS: RunCaps = {
  maxTurns: 80,
  maxChecks: 25,
  maxAgentMs: 20 * 60_000,
  leanJobMs: 120_000,
  maxGateAttempts: 3,
};

/** What the current round has used of its caps. */
export interface RunCounters {
  turns: number;
  checks: number;
  agentMs: number;
  gateAttempts: number;
}

/** Tokens and the CLI's cost estimate for the whole run (all rounds). */
export interface RunUsage {
  /** API responses (one per model request, deduplicated by message id). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** The CLI's client-side estimate at API list prices. A subscription is not billed per token (shown as "estimate"). */
  costEstimateUsd: number;
  /** The latest rate-limit event, condensed (e.g. status "allowed_warning", resetsAt ISO time). */
  rateLimit?: { status: string; resetsAt?: string; detail?: string };
}

export type RunNoticeKind =
  /** A2: "Attempt 1 didn't pass: it used new_spyro_pg, which you didn't select. Asking Claude to retry." */
  | 'gate-failed'
  /** A2: the attempts ran out; says what kept failing. */
  | 'gave-up'
  /** The shadow was reverted to the last state that passed (gave up, cap, no finish). */
  | 'reverted'
  | 'cap'
  | 'interrupted'
  | 'resumed'
  /** telelean could not run Lean (sandbox, low memory): not Claude's fault and not counted as an attempt. */
  | 'environment'
  | 'info';

/** A small notice on the board (A2), kept in the run's history of notices. */
export interface RunNotice {
  id: string;
  at: string;
  level: 'info' | 'warning' | 'error';
  kind: RunNoticeKind;
  /** One plain sentence (telelean's words). */
  text: string;
  /** Optional longer detail (the exact failure as Claude received it). */
  detail?: string;
}

/** One line of the run's progress feed (newest last; the host keeps the last 200). */
export interface RunActivity {
  at: string;
  kind: 'claude-text' | 'tool' | 'check' | 'freeze' | 'gate' | 'ghost' | 'question' | 'answer' | 'system';
  /** `claude-text`: Claude's words (italic). Otherwise telelean's summary, e.g. "check_lean: build ok, 1 violation". */
  text: string;
  ok?: boolean;
}

/** A premise Claude suggests (D-6 ghost assumption, M2 minimal adoption). */
export interface GhostView {
  /** Host-generated `ghost-<n>` (`[A-Za-z0-9_.-]{1,64}`), unique within the run. */
  id: string;
  /** Claude's words: the sentence the card would carry (italic, "Claude suggests"). */
  naturalName: string;
  /** The Lean proposition (Claude's), whitespace runs collapsed to one space: exactly the text the ghost check elaborated and adoption writes. */
  leanStatement: string;
  /** The statement name it gets when adopted (Claude's `lean_name` when valid and free, else derived). */
  leanName: string;
  /** Claude's words. */
  whyNeeded: string;
  /** The gate checked that selected premises + this suggestion prove the target (always true for a listed ghost). */
  closesGap: boolean;
  /** D-6: the proof that it closes the gap uses none of the selected premises: it alone gives the target (flagged). */
  aloneEntails: boolean;
  state: 'suggested' | 'adopted' | 'rejected';
  /** The new AXIOM card's id once adopted. */
  nodeId?: string;
  round: number;
}

/** D-5 permitted axioms of the current freeze, by category (the report card and the agent's freeze reply). */
export interface PermittedSummary {
  standard: string[];
  signature: string[];
  /** `.holds` axioms of the selected premises (and adopted ghosts). */
  selected: string[];
  presuppositions: string[];
  /** Axioms of the footprints of selected proved derivations (fixer round 1: only proofs the user had before the run). */
  derivationFootprints: string[];
  /**
   * Selected premises that contribute no axioms: no `.holds` (an unproved goal or derivation, a code-less card left
   * informal), a conditional proof, one resting on the target's own claim, or (fixer round 1) one proved only in this
   * run (usable as a lemma, but its own footprint must be permitted).
   */
  unusable: string[];
}

/** One run, as the board shows it (`run` message). */
export interface RunView {
  /** `[A-Za-z0-9_]{1,64}` (also the runLean scope group: `telelean-<runId>-<n>`). */
  runId: string;
  subject: string;
  /** Target node id. */
  target: string;
  /** Selected premise ids: the sources of the selected arrows (may be empty: a "follows from nothing" mark, slice 1e). */
  premises: string[];
  state: RunState;
  /** While working: formalising or proving. */
  stage?: RunStage;
  /** 1 for the first round; +1 for every Feedback and every ghost adoption. */
  round: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  backend: { id: string; model: string; effort?: string; cliVersion?: string };
  caps: RunCaps;
  counters: RunCounters;
  usage: RunUsage;
  /** The ask_user batch waiting for the user, if any. */
  pendingQuestions?: QuestionSetView;
  /** Every question answered in this run, oldest first. */
  answered: AnsweredQuestionView[];
  notices: RunNotice[];
  activity: RunActivity[];
  ghosts: GhostView[];
  /** The current round's freeze, once freeze_statements succeeded. */
  frozen?: { round: number; at: string; permitted: PermittedSummary };
  /** Set while a proposal exists (state `review`). */
  proposalId?: string;
  /** How the last round ended. */
  verdict?: RunVerdict;
  /** `interrupted`: the session can be resumed (`resumeRun`). */
  canResume?: boolean;
  /** User-facing reason for `failed` (and for a refused start). */
  error?: string;
  /**
   * Fixer round 3: set by Accept, before the run ends (state `accepted`): whether that Accept changed the user's files.
   * `changedFiles: false` is a round that changed no file, so the Accept only recorded the outcome (no history entry,
   * no Undo step). A board that did not send the Accept reads it here instead of parsing the runner's notice text.
   * Absent on runs accepted before this field existed.
   */
  accepted?: { changedFiles: boolean };
  /**
   * Slice 2 (docs/slice2-plan.md 2.3 and 3.12, additive): present when the run is an edit session. In a session the
   * runner never sets `verdict` to a proof outcome, sends `activity` and `notices` as empty arrays while a step runs
   * and while the results are hidden, leaves `frozen` out (D2-68), keeps `ghosts` empty and `proposalId` absent.
   */
  session?: { stage: number; phase: SessionPhase };
  /**
   * Slice 2: every inference of the session (`target` and `premises` above are the first one's, for old readers). While
   * the results are hidden, a target's premises are the sources of the question its latest ended step asked (AF5).
   */
  inferences?: Array<{ target: string; premises: string[] }>;
  /** Slice 2: the step that runs or ran last; `statementsFixed` tells the panel what M2's `frozen` told it (D2-68). */
  step?: { index: number; of: number; target: string; kind: StepView['kind']; statementsFixed: boolean };
}

// ---------------------------------------------------------------------------------------------
// Proposal (the end-of-round review, D-19 M2 minimal; overlay, raw diff, report card)

export type FileChangeKind = 'added' | 'modified' | 'deleted';

/** One changed model file of a proposal (the raw diff opens VS Code's multi-file diff on these). */
export interface ProposalFile {
  path: string;
  change: FileChangeKind;
  additions: number;
  deletions: number;
}

export type NodeChangeKind = 'added' | 'changed' | 'removed';
export type NodeChangeField = 'sentence' | 'type' | 'statement' | 'proof' | 'premises' | 'status' | 'binding' | 'fields';

export interface NodeDiff {
  change: NodeChangeKind;
  /** For `changed`: what differs. */
  fields: NodeChangeField[];
}

/** The proposed board vs the current one (diff marks: colour + glyph + halo, 03 section 7). */
export interface GraphDiff {
  nodes: Record<string, NodeDiff>;
  vocabulary: Record<string, NodeChangeKind>;
  /** Edge ids (`TlEdge.id`). */
  edges: { added: string[]; removed: string[] };
  counts: { added: number; changed: number; removed: number; vocabularyAdded: number };
}

/** D-19 M2: one new or changed statement, the user's sentence beside the Lean (meaning before proof status). */
export interface StatementReview {
  kind: 'statement';
  nodeId: string;
  /** The card's sentence: the user's words, or Claude's for an adopted ghost (`wordedBy: 'agent'`). */
  sentence: string;
  wordedBy: 'user' | 'agent';
  /** Fully-qualified statement name. */
  leanName: string;
  /** `#print` of the statement abbrev (default notation). */
  pretty: string;
  /** The fully explicit form: `pp.explicit`, no notation, universes shown, no coercion arrows. */
  explicit: string;
  /** Vocabulary and definitions in the statement closure (`LeanBinding.uses`), with glosses. */
  closure: Array<{ name: string; kind: string; type?: string; gloss?: string; glossBy?: 'user' | 'agent' }>;
  change: 'new' | 'changed';
}

/** New pure-signature vocabulary (D-3 rules 1-3): auto-approved but revocable (revoking = Feedback). */
export interface VocabularyReview {
  kind: 'vocabulary';
  items: Array<{ name: string; vocabKind: string; type?: string; gloss?: string; code?: string }>;
}

export type ReviewItem = StatementReview | VocabularyReview;

/**
 * A2 / D-4 / D-3: a question for the user, not a retry: a definition Claude introduced on a statement path (it could
 * carry a belief), or a presupposition axiom created by the run (never auto-approved). Accept needs a "yes" for each.
 */
export interface DefinitionQuestion {
  /** Host-generated, stable within the proposal (`d1`, `d2`, …; `[A-Za-z0-9_.-]{1,64}`). */
  id: string;
  /** Fully-qualified Lean name. */
  name: string;
  kind: 'definition' | 'presupposition';
  /** Source text (with its docstring). */
  code: string;
  /** Node ids whose statement closure contains it. */
  usedByStatementsOf: string[];
  /** Claude's gloss (docstring). */
  gloss?: string;
}

export type GateStepId = 'G0' | 'G1' | 'G3' | 'G4' | 'G5';

/** One finish call and its gate outcome. */
export interface GateAttemptView {
  attempt: number;
  round: number;
  at: string;
  passed: boolean;
  failures: Array<{ step: GateStepId; text: string; detail?: string }>;
}

/** The report card (03 section 7; revealed after the statements, D-19). */
export interface ReportCard {
  verdict: RunVerdict;
  target: string;
  /**
   * What the target's proof rests on (proved): card ids, `presup:<Lean name>` and anything else as `axiom:<name>`
   * (the `ProofStatus.footprint` convention). Empty when not proved.
   */
  footprint: string[];
  /** Selected premises the proof does not use (G6 flag, shown, never a failure). */
  unusedPremises: string[];
  /** D-6: until the M3 model finder runs. */
  consistency: 'unchecked';
  /**
   * Proved without using a single arrow (the report says "proved from nothing", S18): no card in the footprint and no
   * verified edge into the target, whether or not premises were selected (A9; slice 1e fixer: it required zero premises).
   */
  selfEvident: boolean;
  /** Claude's words. */
  claudeSummary?: string;
  /** Claude's words: what is missing (not proved). */
  gap?: string;
  /** Claude's words: premises it believes conflict (unverified in M2). */
  conflict?: string[];
  /** Claude's words: interpretive choices made without asking (D-20), each with "Ask me instead" (= Feedback). */
  assumedWithoutAsking: string[];
  gateAttempts: GateAttemptView[];
  usage: RunUsage;
  durationMs: number;
  agentMs: number;
  /** Set when the shadow was reverted to the last passing state (gave up, cap, no finish). */
  reverted?: { toCommit: string; label: string; reason: string };
}

/** The end-of-round proposal (`proposal` message). Applying it is all-or-nothing (D-21). */
export interface ProposalView {
  runId: string;
  /** Host-generated (`p1`, `p2`, …; `[A-Za-z0-9_.-]{1,64}`); a new id for every rebuild (Accept names the one reviewed). */
  proposalId: string;
  round: number;
  subject: string;
  /** The subject's board as it would be after Accept (built from the shadow's files and its Lean facts). */
  graph: TlGraph;
  diff: GraphDiff;
  files: ProposalFile[];
  review: ReviewItem[];
  definitions: DefinitionQuestion[];
  ghosts: GhostView[];
  report: ReportCard;
  /**
   * Model files changed (on disk or in editors) since the run started, when the proposal was built. Spec v4 ES-7 (slice
   * 1f): Accept then refuses, naming the files, until they match the run's base again (D-21's rebase is no longer taken).
   */
  baseChanged: boolean;
  /** The round changed no file: Accept only records the outcome. */
  empty: boolean;
}

/** Status flags of builds before spec v4: what each one is now (`null`: gone). */
const LEGACY_FLAGS: Readonly<Record<string, StatusFlag | null>> = { claimed: null, 'proved-goal': null, 'rests-on-claimed': 'rests-on-pending' };

/** TL102's variant that spec v4 removed (B.5; GOAL is gone): a proof resting on it now carries `rests-on-pending`. */
const LEGACY_TL102 = 'The proof rests on a goal asserted as an axiom';
/** The start of TL102's spec v4 variant (B.5; core `project/build.ts`): "The proof rests on pending: ‹ids›." */
const RESTS_ON_PENDING_TL102 = 'The proof rests on pending:';

/**
 * A proposal saved (run.json) by a build before spec v4, read in the two kinds as the markup reads old files (spec v4
 * A19; slice 1a fixer). A run still in review when telelean is updated keeps its proposal, and the board builds its
 * proposed view from it, so its graph must hold only kinds and statuses this build knows:
 *  - ASSUMPTION -> AXIOM, DERIVATION and GOAL -> PROPOSITION (`parseNodeType`);
 *  - a proposition's `axiom n.holds` is `pending`: the old `pending-promotion`, and `assumed` on an old GOAL;
 *  - the flags `claimed` and `proved-goal` go, `rests-on-claimed` becomes `rests-on-pending`, and a proof that rests on
 *    a now pending card gets `rests-on-pending` too (it had TL102 "rests on a goal asserted as an axiom");
 *  - the diagnostics spec v4 removed go (TL105, TL116 and that TL102), and so do the lifecycle items (spec v4 has none);
 *  - (slice 1f, carry-over 3) a proof that rests on pending cards gets the TL102 warning a fresh build gives it (B.5):
 *    "The proof rests on pending: ‹ids›." (the pending cards of its footprint, in footprint order), at the card's block.
 * `established` is not computed (it needs the facts): such a proposal shows no green glow. Changes `proposal` in place
 * and returns whether anything changed (a proposal of this build is left as it is).
 */
export function upgradeLegacyProposal(proposal: ProposalView): boolean {
  let changed = false;
  const legacy = proposal as ProposalView & { lifecycle?: unknown };
  if ('lifecycle' in legacy) {
    delete legacy.lifecycle;
    changed = true;
  }
  const graph = proposal.graph as TlGraph | undefined;
  if (graph === undefined || !Array.isArray(graph.nodes)) return changed;
  const pending = new Set<string>();
  for (const node of graph.nodes) {
    const kind = parseNodeType(String(node.type))?.type;
    if (kind !== undefined && kind !== node.type) {
      node.type = kind;
      changed = true;
    }
    const status = node.status as TlNode['status'] | undefined;
    if (status === undefined) continue;
    const proof = (status.proof as { kind: string } | undefined)?.kind;
    if (proof === 'pending-promotion' || (proof === 'assumed' && node.type === 'PROPOSITION')) {
      status.proof = { kind: 'pending' };
      changed = true;
    }
    if (status.proof?.kind === 'pending') pending.add(node.id);
    if (!Array.isArray(status.flags)) continue;
    const flags: StatusFlag[] = [];
    for (const flag of status.flags as string[]) {
      const now = Object.hasOwn(LEGACY_FLAGS, flag) ? LEGACY_FLAGS[flag] : (flag as StatusFlag);
      if (now !== null && now !== undefined && !flags.includes(now)) flags.push(now);
    }
    if (flags.length !== status.flags.length || flags.some((flag, i) => flag !== status.flags[i])) {
      status.flags = flags;
      changed = true;
    }
  }
  /** The new TL102 warnings to add: one per proof that rests on pending cards (B.5, as `build.ts` gives it). */
  const restsOnPending: BoardDiagnostic[] = [];
  for (const node of graph.nodes) {
    const proof = node.status?.proof;
    if (proof === undefined || (proof.kind !== 'proved' && proof.kind !== 'conditional')) continue;
    const footprint = proof.kind === 'proved' ? proof.footprint : (proof.footprint ?? []);
    if (!Array.isArray(node.status.flags) || !Array.isArray(footprint)) continue;
    const resting = footprint.filter((id) => pending.has(id));
    if (resting.length === 0) continue;
    if (!node.status.flags.includes('rests-on-pending')) {
      node.status.flags.push('rests-on-pending');
      changed = true;
    }
    restsOnPending.push({
      code: 'TL102',
      severity: 'warning',
      message: `${RESTS_ON_PENDING_TL102} ${[...new Set(resting)].join(', ')}.`,
      ...(node.loc !== undefined ? { file: node.loc.file, range: node.loc.range } : {}),
      nodeId: node.id,
    });
  }
  const before = Array.isArray(graph.diagnostics) ? graph.diagnostics : [];
  const kept = before.filter((d) => d.code !== 'TL105' && d.code !== 'TL116' && !(d.code === 'TL102' && String(d.message).startsWith(LEGACY_TL102)));
  // A card that has its "rests on pending" warning already (a proposal of this build, or one upgraded before) keeps it.
  const has = new Set(kept.filter((d) => d.code === 'TL102' && String(d.message).startsWith(RESTS_ON_PENDING_TL102)).map((d) => d.nodeId));
  const added = restsOnPending.filter((d) => !has.has(d.nodeId));
  if (kept.length !== before.length || added.length > 0) {
    graph.diagnostics = [...kept, ...added];
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Sidecars: attempts.jsonl (D-18 attempts history) and decisions.json (D-20)

export const ATTEMPT_FORMAT = 'telelean-attempt' as const;
export const ATTEMPT_RESOLUTION_FORMAT = 'telelean-attempt-resolution' as const;
export const DECISIONS_FORMAT = 'telelean-decisions' as const;

/** One round of one run, appended to `.telelean/subjects/<S>/attempts.jsonl` when the round ends. */
export interface AttemptRecord {
  format: typeof ATTEMPT_FORMAT;
  version: 1;
  /** `<runId>.<round>`. */
  id: string;
  run: string;
  round: number;
  /** ISO time the round ended. */
  date: string;
  subject: string;
  target: string;
  premises: string[];
  verdict: RunVerdict;
  /** The proved target's footprint (ProofStatus convention). */
  footprint?: string[];
  ghosts?: Array<{ id: string; naturalName: string; adopted: boolean }>;
  /** Claude's words (cut to 500 characters). */
  summary?: string;
  gateAttempts: number;
  model: string;
  effort?: string;
  usage?: { requests: number; inputTokens: number; outputTokens: number; costEstimateUsd: number };
}

/** Appended when the user resolves a round (append-only file: the record itself is never rewritten). */
export interface AttemptResolution {
  format: typeof ATTEMPT_RESOLUTION_FORMAT;
  version: 1;
  run: string;
  round: number;
  date: string;
  /** `superseded`: a Feedback or ghost adoption started the next round. */
  resolution: 'accepted' | 'discarded' | 'superseded';
}

export type AttemptLine = AttemptRecord | AttemptResolution;

/** What the board lists per goal (`TlGraph.attempts`): a record with its latest resolution. */
export interface AttemptSummary extends AttemptRecord {
  resolution?: AttemptResolution['resolution'];
}

/** One answered question (D-20), kept in `.telelean/subjects/<S>/decisions.json`. */
export interface DecisionRecord {
  /** `<runId>.<setId>.<question index>`. */
  id: string;
  run: string;
  date: string;
  subject: string;
  phenomenon: Phenomenon;
  /** Claude's words. */
  question: string;
  /** Claude's words. */
  options: Array<{ label: string; consequence: string }>;
  answer: AnswerChoiceView;
  /** Readable answer: the option's label, the free text, "Leave it open" or "Decide for me". */
  answerText: string;
  scope: DecisionScope;
  affectedNodes: string[];
  /** D-20: who decided and who worded it. */
  decidedBy: 'user';
  wordedBy: 'agent';
  claudesGuess?: { option?: number; note?: string };
}

export interface DecisionsFile {
  format: typeof DECISIONS_FORMAT;
  version: 1;
  decisions: DecisionRecord[];
}

// Spec v4.1 ES-2, AR-8, AP-13 (slice 1e): the question of Formalize for dependencies and the host's start check.
export * from './formalize.js';
