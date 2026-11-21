/**
 * Spec v4 BD-1 (slice 1c): the band above the board splits the computed vocabulary (D-3) into two columns. The
 * Definitions column holds today's "Definitions" section (`def`, `abbrev`, `structure`, `inductive`, `class`,
 * `instance`); the Vocabulary column holds the others (Types, Predicates & relations, Functions, Constants,
 * Presuppositions, Lemmas, Unmarked axioms, Other). Collapsed, the band is one line that keeps the counts and flags,
 * e.g. "Vocabulary 9 · 1 hidden assumption · Definitions 4 · 1 needs your endorsement".
 */
import type { NodeChangeKind, VocabItem, VocabKind } from '@telelean/core';
import { VOCAB_SECTIONS } from '../labels';

export const DEFINITIONS_SECTIONS = VOCAB_SECTIONS.filter((section) => section.kind === 'definition');
export const VOCABULARY_SECTIONS = VOCAB_SECTIONS.filter((section) => section.kind !== 'definition');

const DEFINITION_KINDS: ReadonlySet<VocabKind> = new Set(DEFINITIONS_SECTIONS.map((section) => section.kind));

/** The items of each column, in vocabulary order. */
export function splitVocabulary(items: readonly VocabItem[]): { vocabulary: VocabItem[]; definitions: VocabItem[] } {
  return {
    vocabulary: items.filter((item) => !DEFINITION_KINDS.has(item.kind)),
    definitions: items.filter((item) => DEFINITION_KINDS.has(item.kind)),
  };
}

export interface BandSummary {
  vocabulary: number;
  definitions: number;
  /** Prop-valued axioms with no card (TL104). */
  hidden: number;
  /** Definitions on a statement path, which need the user's endorsement (D-4, S-8). */
  endorse: number;
  /** Items the proposal adds, per column (the Proposed view's "+N new"). */
  added: { vocabulary: number; definitions: number };
}

export function bandSummary(items: readonly VocabItem[], diff: Readonly<Record<string, NodeChangeKind>> = {}): BandSummary {
  const { vocabulary, definitions } = splitVocabulary(items);
  const added = (list: readonly VocabItem[]) => list.filter((item) => diff[item.name] === 'added').length;
  return {
    vocabulary: vocabulary.length,
    definitions: definitions.length,
    hidden: vocabulary.filter((item) => item.kind === 'unmarked-axiom').length,
    endorse: definitions.filter((item) => item.flags.includes('definitional-choice')).length,
    added: { vocabulary: added(vocabulary), definitions: added(definitions) },
  };
}

/** The collapsed band's line, as words (also its accessible description). */
export function bandSummaryText(summary: BandSummary): string {
  const parts = [`Vocabulary ${summary.vocabulary}`];
  if (summary.hidden > 0) parts.push(`${summary.hidden} hidden assumption${summary.hidden === 1 ? '' : 's'}`);
  if (summary.added.vocabulary > 0) parts.push(`${summary.added.vocabulary} new`);
  parts.push(`Definitions ${summary.definitions}`);
  if (summary.endorse > 0) parts.push(`${summary.endorse} need${summary.endorse === 1 ? 's' : ''} your endorsement`);
  if (summary.added.definitions > 0) parts.push(`${summary.added.definitions} new`);
  return parts.join(' · ');
}
