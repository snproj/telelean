/**
 * WP1: pure helpers for proposals (docs/m2-plan.md sections 0, 4.5 and 7): the board diff behind the overlay, the
 * history/undo label of an accepted proposal, and the sidecar codecs (attempts.jsonl, decisions.json).
 * Signatures and documented behaviour are FROZEN; the implementations live in ./diff.ts and ./sidecars.ts.
 * Types live in ../run.ts (ProposalView, GraphDiff, AttemptLine, DecisionsFile, …).
 */
import type { TlGraph } from '../model.js';
import { graphDiff } from './diff.js';
import { add, inForce, label, parseAttempts, parseDecisions, serializeAttempt, serializeDecisions, summarise } from './sidecars.js';
import type { AttemptLine, AttemptSummary, DecisionRecord, DecisionsFile, GraphDiff, RunVerdict } from '../run.js';

/**
 * The proposed board vs the current one: nodes added / removed / changed (sentence, type, statement, proof,
 * premises, status, binding, other fields), vocabulary added / changed / removed (by name; `changed` = type, kind or
 * code differs), edges by id. Node identity is the node id; a node whose statement changed is `changed` with
 * `statement`. Pure and deterministic (keys in node order of `proposed`, then removed ones).
 */
export function diffGraphs(current: TlGraph, proposed: TlGraph): GraphDiff {
  return graphDiff(current, proposed);
}

/**
 * One line for the history dropdown, the Undo toast and the attempt (m1 plan 6.2 style, sentences cut to 60
 * characters): `Formalize → proved: <target sentence>`, `Formalize → not proved: <target sentence>`, with
 * ` (+ 1 adopted axiom)` / `(+ n adopted axioms)` when ghosts were adopted. Fixer round 1: `extras.premises`
 * (optional) = the number of premises the user selected; with 0 (the target's "follows from nothing" mark was the
 * question) the line starts `Follows from nothing? → …` instead. (Spec v4 removed the ` (+ Make Derivation)` lifecycle
 * suffix. Slice 1e renamed the action, spec v4.1 ES-2: entries written before say `These suffice → …` and
 * `Self-evident? → …`, and are shown as they were written.)
 */
export function proposalLabel(verdict: RunVerdict, targetSentence: string, extras: { adoptedGhosts: number; premises?: number }): string {
  return label(verdict, targetSentence, extras);
}

// ---------------------------------------------------------------------------------------------
// Sidecar codecs (formats: core run.ts; paths: core paths.ts attemptsPath / decisionsPath)

/**
 * Parses `attempts.jsonl`: one JSON object per line; blank lines skipped; a line that is not valid JSON or not a known
 * `format` (a hand edit, a newer telelean) is skipped, never fatal. Order preserved.
 */
export function parseAttemptLines(text: string): AttemptLine[] {
  return parseAttempts(text);
}

/** One line (no trailing newline): `JSON.stringify` with keys in the interface's order. */
export function serializeAttemptLine(line: AttemptLine): string {
  return serializeAttempt(line);
}

/** Records with their latest resolution attached, newest first (by `date`, then file order). */
export function summariseAttempts(lines: readonly AttemptLine[]): AttemptSummary[] {
  return summarise(lines);
}

/** Parses `decisions.json` leniently: a missing, empty or unreadable file is an empty `DecisionsFile`; bad entries are dropped. */
export function parseDecisionsFile(json: string | null): DecisionsFile {
  return parseDecisions(json);
}

/** Pretty JSON (2 spaces) with a trailing newline, decisions in insertion order. */
export function serializeDecisionsFile(file: DecisionsFile): string {
  return serializeDecisions(file);
}

/** Adds records (replacing any with the same id), returning a new file. */
export function addDecisions(file: DecisionsFile, records: readonly DecisionRecord[]): DecisionsFile {
  return add(file, records);
}

/**
 * The decisions in force for a new run (context bundle, D-20): scope `subject` of this subject, plus scope `nodes`
 * whose `affectedNodes` meet `nodeIds`. Scope `run` decisions never carry over. Newest first.
 */
export function decisionsInForce(file: DecisionsFile, subject: string, nodeIds: readonly string[]): DecisionRecord[] {
  return inForce(file, subject, nodeIds);
}
