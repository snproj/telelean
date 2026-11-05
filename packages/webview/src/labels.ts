/**
 * User-facing wording of the board, in one place (D-14 stance and evidential chips, D-15 status words, the
 * Vocabulary group's sections, history action names, the Lean badge).
 */
import type { Evidential, HistoryActionKind, NodeType, Phenomenon, RunNoticeKind, SemanticSummary, Stance, VocabKind } from '@telelean/core';
import { plainText, sentences } from './model/format';

export const COLUMN_TITLE: Readonly<Record<NodeType, string>> = {
  ASSUMPTION: 'Assumptions',
  DERIVATION: 'Derivations',
  GOAL: 'Goals',
};

export const KIND_NOUN: Readonly<Record<NodeType, string>> = {
  ASSUMPTION: 'Assumption',
  DERIVATION: 'Derivation',
  GOAL: 'Goal',
};

/** The kind glyph on every card (paired with colour and column, never colour alone: D-15). */
export const KIND_GLYPH: Readonly<Record<NodeType, string>> = {
  ASSUMPTION: 'A',
  DERIVATION: 'D',
  GOAL: 'G',
};

export const PROMPT_PLACEHOLDER: Readonly<Record<NodeType, string>> = {
  ASSUMPTION: 'State something you believe is true…',
  DERIVATION: 'State something that should follow from your assumptions…',
  GOAL: 'State something you want to show…',
};

/** D-14 stance chips. */
export const STANCE_LABEL: Readonly<Record<Stance, string>> = {
  believe: 'I believe it',
  rule: "It's a rule or definition",
  supposing: 'Supposing, for argument',
};

/** D-14 evidential chips (the `source:` field). */
export const SOURCE_LABEL: Readonly<Record<Evidential, string>> = {
  observed: 'observed',
  reported: 'reported',
  inferred: 'inferred',
  common: 'common knowledge',
};

/**
 * The "why" field's prompt (D-14: the prompt adapts to the stance). Assumptions without a chosen stance get the
 * "believe" wording, the default reading of an assumption.
 */
export function whyPlaceholder(kind: NodeType, stance: Stance | undefined): string {
  if (kind === 'DERIVATION') return 'Why do you think it follows?';
  if (kind === 'GOAL') return 'Why do you care?';
  if (stance === 'rule') return 'Where does the rule come from?';
  if (stance === 'supposing') return 'What are you exploring?';
  return 'Why do you believe it?';
}

/** Sections of the Vocabulary group, in display order (docs/m1-plan.md section 6.4). */
export const VOCAB_SECTIONS: ReadonlyArray<{ kind: VocabKind; title: string }> = [
  { kind: 'sort', title: 'Types' },
  { kind: 'predicate', title: 'Predicates & relations' },
  { kind: 'function', title: 'Functions' },
  { kind: 'constant', title: 'Constants' },
  { kind: 'presupposition', title: 'Presuppositions' },
  { kind: 'definition', title: 'Definitions' },
  { kind: 'lemma', title: 'Lemmas' },
  { kind: 'unmarked-axiom', title: 'Unmarked axioms' },
  { kind: 'other', title: 'Other' },
];

/** One word for a vocabulary item's kind (the "uses" dropdown, tooltips). */
export const VOCAB_KIND_NOUN: Readonly<Record<VocabKind, string>> = {
  sort: 'type',
  predicate: 'predicate',
  function: 'function',
  constant: 'constant',
  presupposition: 'presupposition',
  definition: 'definition',
  lemma: 'lemma',
  'unmarked-axiom': 'unmarked axiom',
  other: 'other',
};

/** The action column of the history dropdown ("time · action · label"). M2 adds Accept's entry (`accept-proposal`). */
export const HISTORY_ACTION_LABEL: Readonly<Record<HistoryActionKind, string>> = {
  'add-node': 'add',
  'edit-node': 'edit',
  'delete-node': 'delete',
  'change-kind': 'kind',
  reorder: 'move',
  'set-premises': 'premises',
  'create-subject': 'new subject',
  initial: 'start',
  manual: 'manual edits',
  undo: 'undo',
  redo: 'redo',
  revert: 'revert',
  initialize: 'initialize',
  'accept-proposal': 'accept',
};

/** D-20 phenomenon tags of Claude's questions, in plain words. */
export const PHENOMENON_LABEL: Readonly<Record<Phenomenon, string>> = {
  enthymeme: 'unstated premise',
  genericity: 'genericity',
  modality: 'modality',
  negation: 'negation',
  presupposition: 'presupposition',
  scalar: 'scalar word',
  vagueness: 'vagueness',
  'evaluative-standard': 'evaluative standard',
  indexical: 'indexical',
  'word-sense': 'word sense',
  tense: 'tense',
  granularity: 'granularity',
  'closed-world': 'closed world',
  other: 'other',
};

/** The icon of a run notice (A2), by kind. */
export const NOTICE_ICON: Readonly<Record<RunNoticeKind, string>> = {
  'gate-failed': 'warning',
  'gave-up': 'error',
  reverted: 'discard',
  cap: 'watch',
  interrupted: 'debug-pause',
  resumed: 'debug-continue',
  environment: 'server-environment',
  info: 'info',
};

export type BadgeTone = 'ok' | 'busy' | 'warn' | 'error' | 'off';

/**
 * The Lean badge in the header, one per SemanticSummary state (docs/m1-plan.md section 4). The tooltip is plain
 * sentences: the host's detail gets its closing period when it lacks one, and loses core's backticks.
 */
export function semanticBadge(summary: SemanticSummary): { text: string; title: string; tone: BadgeTone } {
  const detail = summary.detail ? plainText(summary.detail) : undefined;
  const refresh = 'Click to check again.';
  switch (summary.state) {
    case 'unavailable':
      return { text: 'Lean: not checked yet', title: sentences('Lean has not checked these files yet', detail, refresh), tone: 'off' };
    case 'checking':
      return { text: 'Lean: checking…', title: sentences('Building and checking the model with Lean', detail), tone: 'busy' };
    case 'fresh':
      return { text: 'Lean: up to date', title: sentences(`Lean checked every file on this board${summary.checkedAt ? ` (${summary.checkedAt})` : ''}`, refresh), tone: 'ok' };
    case 'stale': {
      const files = summary.staleFiles?.length ? `Changed: ${summary.staleFiles.join(', ')}` : undefined;
      return { text: 'Lean: files changed', title: sentences('Some files changed since Lean last checked them; their cards show the last known status', files, refresh), tone: 'warn' };
    }
    case 'failed': {
      const n = summary.errorCount ?? 0;
      const text = n > 0 ? `Lean: ${n} error${n === 1 ? '' : 's'}` : 'Lean: check failed';
      return { text, title: sentences(n > 0 ? 'The build reported errors (see Problems)' : 'The last Lean check did not complete', detail, refresh), tone: 'error' };
    }
    case 'paused-low-memory':
      return { text: 'Lean paused: low memory', title: sentences('Lean checks are paused while little memory is available', detail, refresh), tone: 'warn' };
    case 'unsupported-toolchain':
      return { text: 'Lean: syntactic mode', title: sentences('This project is not on the toolchain telelean checks with, so cards are read from the files only', detail), tone: 'off' };
    case 'disabled':
      return { text: 'Lean: off', title: sentences('Lean checking is off', detail, refresh), tone: 'off' };
  }
}
