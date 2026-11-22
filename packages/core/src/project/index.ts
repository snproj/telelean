/**
 * WP-model: building the project model and one subject's board graph (docs/m1-plan.md sections 5.3 and 6).
 * Signatures and documented behaviour are FROZEN; the implementation lives in ./build.ts and ./subjectGraph.ts.
 */
import type { TlGraph } from '../model.js';
import { buildProject } from './build.js';
import { buildSubjectGraph } from './subjectGraph.js';
import type { ProjectInput, ProjectModel, SubjectGraphOptions } from './types.js';

export * from './types.js';
/** Spec v4.1 B.2 (slice 1e): direct() of a proof checked outside the files (the runner's "Claude suggests" scratch check). */
export { directWalkOfConsts, type ConstsWalk } from './edges.js';
/**
 * Slice 2f (additive): the name Lean gives an anonymous instance (`inst` + the words of its type), as core's facts index,
 * computeItems' ownership and the vocabulary read it, so the runner's ledger names a step's new anonymous instance (a
 * presupposition's helper instance) the same way (D2-43's `created` entries).
 */
export { anonymousInstanceName } from './vocabulary.js';

/**
 * Steps 2-5 of 03 section 2: bind blocks to declarations, merge the Lean facts, add vocabulary / presupposition /
 * untracked items, validate (TL1xx), and derive every node's status (D-15) and `lean` card data.
 * Facts are trusted fully only where the file hash matches. For a stale file (docs/m1-plan.md section 6.3) a
 * declaration keeps its previous facts BY NAME while its current syntactic keyword agrees with the facts' kind
 * (flag `stale`; refs dropped, `uses` kept); otherwise it falls back to the syntactic keyword (a theorem then shows
 * no proof, flagged `stale`/`not-checked`: the board never claims "proved" without Lean).
 */
export function buildProjectModel(input: ProjectInput): ProjectModel {
  return buildProject(input);
}

/**
 * One subject's board: its nodes in column order (layout first, then file order), declared + verified edges
 * (with D-13 mismatch flags), its vocabulary group, its diagnostics, and the semantic summary.
 * An unknown subject yields an empty board (its project-level diagnostics only).
 */
export function subjectGraph(model: ProjectModel, subject: string, options: SubjectGraphOptions): TlGraph {
  return buildSubjectGraph(model, subject, options);
}
