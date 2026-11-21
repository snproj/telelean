/**
 * Slice 2b2 (docs/slice2-plan.md section 4.12): Formalize for several targets, at the start of a session and during a
 * stage (RV-9). Slice 1's one-target check stays in `core/src/formalize.ts` (`formalizeStartProblem`), whose texts and
 * cycle check these share.
 *
 * `formalizeStartProblems(board, inferences, session?)` checks, in this order, and returns every problem it finds,
 * ordered by check (then by the request's order):
 *  1. every target is a card of the board's subject, the session's for a mid-stage Formalize, and asked once;
 *  2. in a session, the results are shown (D2-65): while they are hidden, every request gets this text, and nothing
 *     after it is checked, so no answer can depend on whether a proof exists;
 *  3. each target is a proposition whose premises are the sources of arrows drawn into it (in a session Claude's
 *     accepted arrows count, one still in review gives "Accept this arrow first.", D2-20); an empty question needs the
 *     mark; in a session, no target has a Shaky item (D2-53), and a new target that is the source of Claude's arrow into
 *     another target is refused unless the same request selects that arrow (D2-50);
 *  4. a proposition source without a `.holds` that is no target of the same request: "mark it pending first" outside a
 *     session, "select the arrows into it too" in one (AR-8: no pending mark during a session);
 *  5. in a session, a source whose Result is declined Shaky or to be redone (D2-53);
 *  6. any cycle of drawn and solid arrows in the subject (AP-13; AP-29, G2), named.
 *
 * `formalizeOrder(board, inferences)`: a target that is a source of another target's question comes first; ties by
 * reading order (the board's order of its cards).
 *
 * Pure TypeScript: no Node or vscode APIs (the webview bundles core).
 */
import { FORMALIZE_START_TEXTS, formalizeCycleProblem, needsHoldsFirst } from '../formalize.js';
import type { TlGraph, TlNode } from '../model.js';
import { cutText } from '../project/text.js';
import { REVIEW_TEXTS } from './texts.js';
import type { FormalizeSession, StartProblem } from './types.js';

type Request = ReadonlyArray<{ target: string; premises: readonly string[] }>;

/** §4.12 (2b2): the start checks 1-6, in their order; [] when the request may start. */
export function formalizeStartProblems(board: TlGraph, inferences: Request, session?: FormalizeSession): StartProblem[] {
  const nodes = new Map<string, TlNode>(board.nodes.map((n) => [n.id, n]));
  const sentence = (id: string) => cutText(nodes.get(id)?.naturalName ?? id, 60);
  const subject = session?.subject ?? board.subject;

  // 1. One subject, the session's for a mid-stage Formalize; each target once; something asked (the validator's 1-50).
  const first: StartProblem[] = [];
  if (session !== undefined && board.subject !== session.subject) first.push({ check: 1, text: REVIEW_TEXTS.runElsewhere(session.subject) });
  if (inferences.length === 0) first.push({ check: 1, text: FORMALIZE_START_TEXTS.oneTarget });
  const asked = new Set<string>();
  for (const { target } of inferences) {
    const t = nodes.get(target);
    if (t === undefined || t.subject !== subject) first.push({ check: 1, text: `The target "${target}" is not a card of ${subject}.`, card: target });
    else if (asked.has(target)) first.push({ check: 1, text: REVIEW_TEXTS.askedTwice(sentence(target)), card: target });
    asked.add(target);
  }
  // 2. In a session, nothing before the results are shown (D2-65).
  if (session !== undefined && !session.resultsShown) return [...first, { check: 2, text: REVIEW_TEXTS.formalizeResultsHidden }];
  if (first.length > 0) return first;

  const problems: StartProblem[] = [];
  const targets = new Set(inferences.map((inf) => inf.target));
  const selected = (source: string, target: string) => inferences.some((inf) => inf.target === target && inf.premises.includes(source));
  const arrowItem = (source: string, target: string) => session?.arrows.find((a) => a.source === source && a.target === target);
  const sessionTargets = new Set(session?.targets ?? []);

  // 3. Each target a proposition, its premises the sources of arrows drawn into it.
  for (const { target, premises } of inferences) {
    const t = nodes.get(target) as TlNode;
    if (t.type !== 'PROPOSITION') {
      problems.push({ check: 3, text: FORMALIZE_START_TEXTS.axiomTarget, card: target });
      continue;
    }
    const sources = [...new Set(premises)];
    for (const p of sources) {
      if (p === target) problems.push({ check: 3, text: `The target "${t.naturalName}" cannot also be one of its own premises.`, card: target });
      else if (!nodes.has(p)) problems.push({ check: 3, text: `The premise "${p}" is not a card of ${subject}.`, card: p });
      else if (!t.premises.includes(p)) problems.push({ check: 3, text: FORMALIZE_START_TEXTS.drawFirst, arrow: { source: p, target } });
      else if (session !== undefined) {
        // D2-20: Claude's arrows count only once accepted.
        const item = arrowItem(p, target);
        if (item !== undefined && item.status !== 'accepted') problems.push({ check: 3, text: REVIEW_TEXTS.acceptArrowFirst, arrow: { source: p, target } });
      }
    }
    if (sources.length === 0 && t.fromNothing !== true) problems.push({ check: 3, text: FORMALIZE_START_TEXTS.oneTarget, card: target });
    if (session === undefined) continue;
    // D2-53: RV-9 counts a card with a Shaky item as frozen: its proof could not change.
    if (session.shakyTargets.includes(target)) problems.push({ check: 3, text: REVIEW_TEXTS.shakyTarget(sentence(target)), card: target });
    // D2-50: a new target at the source of Claude's arrow into another target, unless the request selects that arrow.
    if (!sessionTargets.has(target)) {
      for (const a of session.arrows) {
        if (a.source !== target || a.target === target || selected(target, a.target)) continue;
        problems.push({ check: 3, text: REVIEW_TEXTS.claudeArrowSource(sentence(target), sentence(a.target)), arrow: { source: a.source, target: a.target } });
      }
    }
  }

  // 4. A proposition source with neither a proof nor a pending claim, no target of this request (AR-8).
  for (const { premises } of inferences) {
    for (const p of [...new Set(premises)]) {
      const source = nodes.get(p);
      if (source === undefined || targets.has(p) || !needsHoldsFirst(source)) continue;
      problems.push({ check: 4, text: session !== undefined ? REVIEW_TEXTS.notProvedSelectArrows(sentence(p)) : REVIEW_TEXTS.notProvedMarkPending(sentence(p)), card: p });
    }
  }

  // 5. In a session, a source whose Result is Shaky or to be redone (D2-53).
  if (session !== undefined) {
    const shaky = (p: string) => (session.shakyResults !== undefined ? session.shakyResults.includes(p) : session.results[p] === 'declined' && session.shakyTargets.includes(p));
    for (const { premises } of inferences) {
      for (const p of [...new Set(premises)]) {
        if (!nodes.has(p) || !Object.hasOwn(session.results, p)) continue;
        if (session.results[p] === 'to-be-redone') problems.push({ check: 5, text: REVIEW_TEXTS.redoneSource(sentence(p)), card: p });
        else if (shaky(p)) problems.push({ check: 5, text: REVIEW_TEXTS.shakySource(sentence(p)), card: p });
      }
    }
  }

  // 6. Any cycle of drawn and solid arrows in the subject (AP-13; AP-29, G2), named.
  const cards = [...new Set(inferences.flatMap((inf) => [inf.target, ...inf.premises]))].filter((id) => nodes.has(id));
  const cycle = formalizeCycleProblem({ nodes: board.nodes, edges: board.edges }, cards);
  if (cycle !== undefined) problems.push({ check: 6, text: cycle });

  // Collected check by check, so already in their order.
  return problems;
}

/** §4.12 (2b2): a target that is a source of another target's question comes first; ties by reading order. */
export function formalizeOrder(board: TlGraph, inferences: Request): string[] {
  const reading = new Map(board.nodes.map((n, k) => [n.id, k]));
  const premisesOf = new Map<string, Set<string>>();
  for (const { target, premises } of inferences) premisesOf.set(target, new Set([...(premisesOf.get(target) ?? []), ...premises]));
  const before = (a: string, b: string) => (reading.get(a) ?? Number.MAX_SAFE_INTEGER) - (reading.get(b) ?? Number.MAX_SAFE_INTEGER) || (a < b ? -1 : a > b ? 1 : 0);
  const remaining = [...premisesOf.keys()];
  const out: string[] = [];
  while (remaining.length > 0) {
    const free = remaining.filter((t) => [...(premisesOf.get(t) ?? [])].every((p) => p === t || !remaining.includes(p)));
    // A cycle among the targets (check 6 refuses it): reading order decides.
    const next = (free.length > 0 ? free : remaining).sort(before)[0] as string;
    out.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return out;
}
