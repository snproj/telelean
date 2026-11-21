/**
 * Formalize for dependencies (spec v4.1 ES-2 with AP-9's one target, AR-4, AR-5, AR-8, AP-13; slice 1e): the run's
 * question is the arrows the user selected into one proposition (its sources are the run's premises), or that
 * proposition's "follows from nothing" mark alone (no premises). Pure, so the board's action model, the extension
 * host's start check and their tests share it.
 *
 * The host checks a `startRun` request before the consent question (docs/slice1-plan.md 2.5, `formalizeStartProblem`):
 *   - the target is a proposition of the board;
 *   - every premise is the source of an arrow drawn into the target (AR-4: the arrows are already in the files, so the
 *     run writes no `premises:` of its own); no premises at all only when the target is marked "follows from nothing";
 *   - every proposition among the premises has a `.holds` (a proof, or a pending claim: AR-8, ★D7 (b) "mark it pending
 *     first"); an axiom without Lean is formalised by Claude, as before;
 *   - no cycle of arrows (the drawn arrows and the solid arrows of checked proofs, AR-3) anywhere in the subject: a cycle
 *     in the files, TL015, blocks Formalize until one of its arrows is removed (AP-13); since 2b2 any cycle of the
 *     subject, not only one through the question's own cards (AR-3, spec §14 item 9; coverage audit G2, AP-29).
 */
import { cutText } from './project/text.js';
import type { TlEdge, TlNode } from './model.js';
import { stronglyConnected } from './review/scc.js';

/** The texts of a refused start (the host's `startRun` check; the board's action model uses the cycle text too). */
export const FORMALIZE_START_TEXTS = {
  /** The premises are not a question about one card (nothing selected into a card without the mark). */
  oneTarget: 'Select arrows into one card.',
  /** A premise has no drawn arrow into the target. */
  drawFirst: 'Draw the arrows first.',
  /** The target is an axiom (an arrow into it makes it a proposition first, AR-6). */
  axiomTarget: 'An axiom is something you hold: draw arrows into it to make it a proposition first.',
  /** AR-8: a proposition among the premises with neither a proof nor a pending claim. */
  notProved: (sentence: string) => `“${sentence}” is not proved: mark it pending first.`,
  /** AP-13: the target or a premise lies on a cycle of arrows (the cycle named by the cards' sentences). */
  cycle: (names: readonly string[]) => `This card is on a cycle of arrows (${names.join(' → ')}): remove one arrow first.`,
  /**
   * AP-29 (G2; 2b2): a cycle of arrows elsewhere in the subject, through none of the question's cards (named the same
   * way). Builder 2b2's wording.
   */
  subjectCycle: (names: readonly string[]) => `The arrows of this subject form a cycle (${names.join(' → ')}): remove one arrow first.`,
} as const;

/** The board a question is asked on: its cards (by id) and its edges (premise and verified ones count for cycles). */
export interface ArrowBoard {
  nodes: Readonly<Record<string, TlNode>> | ReadonlyMap<string, TlNode> | readonly TlNode[];
  edges: readonly TlEdge[];
}

function nodeLookup(nodes: ArrowBoard['nodes']): (id: string) => TlNode | undefined {
  if (Array.isArray(nodes)) {
    const byId = new Map((nodes as readonly TlNode[]).map((n) => [n.id, n]));
    return (id) => byId.get(id);
  }
  if (nodes instanceof Map) return (id) => nodes.get(id);
  const record = nodes as Readonly<Record<string, TlNode>>;
  return (id) => (Object.prototype.hasOwnProperty.call(record, id) ? record[id] : undefined);
}

function allNodes(nodes: ArrowBoard['nodes']): readonly TlNode[] {
  if (Array.isArray(nodes)) return nodes as readonly TlNode[];
  if (nodes instanceof Map) return [...nodes.values()];
  return Object.values(nodes as Readonly<Record<string, TlNode>>);
}

/** Where the arrows lead (card id -> card ids): the drawn ones and the verified edges, between cards of the board. */
function arrowsOf(board: ArrowBoard): Map<string, string[]> {
  const node = nodeLookup(board.nodes);
  const next = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    const list = next.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    next.set(from, list);
  };
  for (const n of allNodes(board.nodes)) {
    if (n.type !== 'PROPOSITION') continue;
    for (const premise of n.premises) if (node(premise) !== undefined) add(premise, n.id);
  }
  for (const edge of board.edges) if (edge.type === 'verified' && node(edge.source) !== undefined && node(edge.target) !== undefined) add(edge.source, edge.target);
  return next;
}

/**
 * AR-3, AP-13: the shortest cycle of arrows through `id`, as card ids from `id` back to `id` (e.g. `[a, b, a]`), or
 * null. The arrows are the drawn ones (the premises of propositions; an old axiom's `premises:` is not drawn, A19)
 * and the verified edges of checked proofs, as core's planner and the board's drawing gesture count them.
 */
export function arrowCycleThrough(board: ArrowBoard, id: string): string[] | null {
  return cycleThroughIn(arrowsOf(board), id);
}

function cycleThroughIn(next: ReadonlyMap<string, readonly string[]>, id: string): string[] | null {
  // Breadth first from `id`: the first arrow found back into `id` closes a shortest cycle.
  const parent = new Map<string, string>();
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    for (const to of next.get(at) ?? []) {
      if (to === id) {
        const path = [at];
        for (let step = at; step !== id; ) {
          step = parent.get(step) as string;
          path.unshift(step);
        }
        return [...path, id];
      }
      if (seen.has(to)) continue;
      seen.add(to);
      parent.set(to, at);
      queue.push(to);
    }
  }
  return null;
}

/**
 * AP-29 (G2; 2b2): a cycle of arrows anywhere in the board (the subject's cards and their drawn and solid arrows), as
 * `arrowCycleThrough` gives it for the first card in the board's order that lies on one, or null when there is none.
 * A proposition that lists itself in `premises:` (TL015) is a cycle of one arrow, `[x, x]` (fixer 2b2 r1, S-V2B2-S4),
 * which `arrowCycleThrough`, slice 1's, does not count.
 */
export function subjectCycle(board: ArrowBoard): string[] | null {
  const next = arrowsOf(board);
  const onCycle = new Set<string>();
  for (const component of stronglyConnected([...next.keys()].sort(), (id) => next.get(id) ?? [])) if (component.length > 1) for (const id of component) onCycle.add(id);
  const selfArrow = (n: TlNode) => n.type === 'PROPOSITION' && n.premises.includes(n.id);
  const first = allNodes(board.nodes).find((n) => selfArrow(n) || onCycle.has(n.id));
  if (first === undefined) return null;
  return selfArrow(first) ? [first.id, first.id] : cycleThroughIn(next, first.id);
}

/** A card's sentence in a cycle's names (cut near 40 characters, like the planner's), or its id. */
export function cycleNames(board: ArrowBoard, cycle: readonly string[]): string[] {
  const node = nodeLookup(board.nodes);
  return cycle.map((id) => cutText(node(id)?.naturalName ?? id, 40));
}

/**
 * The cycle text for the first of `ids` that lies on a cycle of arrows (AP-13), else, since 2b2, for any cycle of
 * arrows in the board (AP-29, G2: any cycle in the subject blocks Formalize, naming it), or undefined when the board
 * has none. The board disables Formalize with it, and the host refuses such a start with it.
 */
export function formalizeCycleProblem(board: ArrowBoard, ids: readonly string[]): string | undefined {
  for (const id of ids) {
    const cycle = arrowCycleThrough(board, id);
    if (cycle !== null) return FORMALIZE_START_TEXTS.cycle(cycleNames(board, cycle));
  }
  const elsewhere = subjectCycle(board);
  return elsewhere === null ? undefined : FORMALIZE_START_TEXTS.subjectCycle(cycleNames(board, elsewhere));
}

/** Whether a source of a question needs a `.holds` first (AR-8): a proposition with neither a proof nor a pending claim. */
export function needsHoldsFirst(node: TlNode): boolean {
  return node.type === 'PROPOSITION' && node.lean.justification === undefined;
}

/**
 * The host's check of a `startRun` request (see the module comment), on the board of the run's subject: the refusal
 * text, or undefined when the run may start. Unknown cards are named as the runner's preflight names them.
 */
export function formalizeStartProblem(board: ArrowBoard & { subject?: string }, target: string, premises: readonly string[]): string | undefined {
  const node = nodeLookup(board.nodes);
  const where = board.subject !== undefined ? ` of ${board.subject}` : '';
  const t = node(target);
  if (t === undefined) return `The target "${target}" is not a card${where}.`;
  if (t.type !== 'PROPOSITION') return FORMALIZE_START_TEXTS.axiomTarget;
  const sources = [...new Set(premises)];
  for (const p of sources) {
    if (p === target) return `The target "${t.naturalName}" cannot also be one of its own premises.`;
    if (node(p) === undefined) return `The premise "${p}" is not a card${where}.`;
  }
  if (sources.length === 0) {
    if (t.fromNothing !== true) return FORMALIZE_START_TEXTS.oneTarget;
  } else if (sources.some((p) => !t.premises.includes(p))) {
    return FORMALIZE_START_TEXTS.drawFirst;
  }
  const cycle = formalizeCycleProblem(board, [target, ...sources]);
  if (cycle !== undefined) return cycle;
  for (const p of sources) {
    const source = node(p) as TlNode;
    if (needsHoldsFirst(source)) return FORMALIZE_START_TEXTS.notProved(cutText(source.naturalName, 60));
  }
  return undefined;
}
