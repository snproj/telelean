/**
 * Slice 2h (docs/slice2-plan.md 5.10-5.12): the Proposed view of an edit session, pure (no DOM, no React; unit-tested).
 *
 * The host owns the session (§5.1): `sessionOverlay` builds the Proposed view from `SessionView.board` only (masked by
 * the host while the results are hidden, D2-5): no GraphDiff and no `resultSignature`, so nothing here derives a proof
 * result (this also ends slice 1's leaks, §7.3). What it adds to the host's graph:
 *  - the card marks (`board.marks`, listed items only): ItemMark, glyph, word and status, never colour alone;
 *  - Claude's arrows (`board.arrows`, only while the results are shown; BD-5, D2-34): an Add in review translucent with a
 *    "+" badge (thin, solid once the proof uses it), an accepted Add dotted with the badge, a Remove in review the base
 *    arrow translucent and dotted with a "−" badge, an accepted Remove and a declined Add not drawn;
 *  - the Add premise drafts not written yet (`board.premises`, only while shown; D2-35): "Claude suggests" cards at the
 *    top of the AXIOMS column, each with a "+" arrow into its target;
 *  - every target with the neutral chip while the results are hidden (`board.hiddenTargets`, RESULT_HIDDEN_CHIP);
 *  - the Current board's places of its cards (`locations`, for "Open in editor": the masked graph carries no source
 *    positions, §4.7), a card the session removes at its Current canvas place (the working copy no longer places it),
 *    and the vocabulary names it adds or removes against the Current board.
 *
 * Also here: Formalize's FormalizeSession (core `formalizeStartProblems` reads it; the host builds it from the view,
 * §4.12), the Context Menu's review items (CM-2, RV-8), and the Undo routing of §5.12 (`undoScope`).
 */
import {
  columnOrder,
  ITEM_KIND_LABELS,
  REVIEW_TEXTS,
  type CanvasPosition,
  type FormalizeSession,
  type ItemKind,
  type ItemStatus,
  type ItemView,
  type NodeChangeKind,
  type NodeType,
  type SessionView,
  type SourceLocation,
  type TlEdge,
  type TlNode,
  type VocabItem,
} from '@telelean/core';

/** What the board's columns read: the current graph's data, or the session's Proposed view (BoardState and Overlay both have it). */
export interface BoardViewData {
  nodes: Readonly<Record<string, TlNode>>;
  order: Readonly<Record<NodeType, readonly string[]>>;
  edges: readonly TlEdge[];
  vocabulary: readonly VocabItem[];
  vocab: ReadonlyMap<string, VocabItem>;
  /** Spec v4 BD-3: the stored canvas positions of propositions (the canvas places the others, slice 1c). */
  positions: Readonly<Record<string, CanvasPosition>>;
}

/** One of Claude's arrows as the Proposed view draws it (`SessionBoardView.arrows`). */
export interface ProposedArrow {
  item: string;
  change: 'add' | 'remove';
  status: ItemStatus;
  /** The proof uses it (an Add in review is drawn solid then, thin otherwise). */
  used: boolean;
  source: string;
  target: string;
}

/** A card's review item as its mark shows it (`SessionBoardView.marks`). */
export interface CardMark {
  item: string;
  kind: ItemKind;
  status: ItemStatus;
}

/** An Add premise draft not written yet (`SessionBoardView.premises`): a "Claude suggests" card. */
export interface PremiseSuggestion {
  item: string;
  target: string;
  sentence: string;
  status: ItemStatus;
}

/** The Proposed view of an edit session (§5.10). */
export interface Overlay extends BoardViewData {
  runId: string;
  subject: string;
  /** Targets with the neutral chip ("result after the review"): every target while the results are hidden. */
  hidden: ReadonlySet<string>;
  /** Listed items per card, for the card's ItemMark (Results left out while the results are hidden). */
  marks: Readonly<Record<string, readonly CardMark[]>>;
  /** Claude's arrows still drawn, by edge id (`${source}->${target}`); empty while the results are hidden. */
  proposed: ReadonlyMap<string, ProposedArrow>;
  /** The "Claude suggests" cards (empty while the results are hidden). */
  premises: readonly PremiseSuggestion[];
  /** Each card's place in the user's files (the Current graph's), for "Open in editor"; none: it exists only in the session. */
  locations: Readonly<Record<string, SourceLocation>>;
  /** The vocabulary names the Proposed view adds or removes against the Current board (the band's "+N new"). */
  diff: { vocabulary: Readonly<Record<string, NodeChangeKind>> };
}

const pairId = (source: string, target: string) => `${source}->${target}`;

/** Whether an arrow item is drawn as Claude's proposal still undecided (in review, or to be redone). */
export function proposedOpen(status: ItemStatus): boolean {
  return status === 'in-review' || status === 'to-be-redone';
}

/** What the Proposed view reads of the Current board: where its cards are (files, canvas) and its vocabulary. */
export interface CurrentBoard {
  nodes: Readonly<Record<string, TlNode>>;
  vocabulary: readonly VocabItem[];
  positions?: Readonly<Record<string, CanvasPosition>>;
}

/**
 * §5.10's overlay, from `view.board` only. `current`: the Current board (its cards' places and its vocabulary), which
 * tells only where a card is in the user's files or on the canvas and which vocabulary names are new; nothing about a
 * proof.
 */
export function sessionOverlay(view: SessionView, current: CurrentBoard): Overlay {
  const board = view.board;
  const graph = board.graph;
  // While the results are hidden the host sends no arrow, premise or Result mark, and every target in hiddenTargets
  // (§4.7, D2-5); the overlay holds to that whatever a view carries, so nothing it draws can tell a result early.
  const shown = view.results.shown;
  const arrows = shown ? board.arrows : [];
  const premises = shown ? board.premises : [];
  const hiddenTargets = shown ? board.hiddenTargets : [...new Set([...board.hiddenTargets, ...view.inferences.map((i) => i.target.id)])];
  const marks = shown ? board.marks : withoutResults(board.marks);
  const nodeList = [...graph.nodes, ...board.removedNodes.filter((n) => !graph.nodes.some((m) => m.id === n.id))];
  const nodes: Record<string, TlNode> = Object.fromEntries(nodeList.map((n) => [n.id, n]));
  const proposed = new Map<string, ProposedArrow>();
  const drop = new Set<string>();
  const extra: TlEdge[] = [];
  for (const a of arrows) {
    const id = pairId(a.source, a.target);
    if (a.change === 'add') {
      // A declined (or withdrawn) Add is not drawn, even while the judge has not taken it out of the working copy yet.
      if (a.status === 'declined' || a.status === 'withdrawn') drop.add(id);
      else proposed.set(id, { ...a });
      continue;
    }
    // A Remove: in review (or to be redone), the base arrow, translucent and dotted with "−"; accepted, not drawn;
    // declined, the arrow is the person's again (the working copy draws it as any arrow).
    if (proposedOpen(a.status)) {
      proposed.set(id, { ...a });
      if (!graph.edges.some((e) => e.type === 'premise' && e.source === a.source && e.target === a.target)) {
        extra.push({ id: `proposed:${id}`, type: 'premise', source: a.source, target: a.target, origin: 'declared' });
      }
    } else if (a.status === 'accepted') drop.add(id);
  }
  const edges = drop.size === 0 && extra.length === 0 ? graph.edges : [...graph.edges.filter((e) => e.type === 'lean-ref' || !drop.has(pairId(e.source, e.target))), ...extra];
  const vocabulary = [...graph.vocabulary];
  const names = new Set(vocabulary.map((v) => v.name));
  const before = new Set(current.vocabulary.map((v) => v.name));
  const vocabDiff: Record<string, NodeChangeKind> = {};
  for (const name of names) if (!before.has(name)) vocabDiff[name] = 'added';
  const locations: Record<string, SourceLocation> = {};
  for (const id of Object.keys(nodes)) {
    const loc = current.nodes[id]?.loc;
    if (loc !== undefined) locations[id] = loc;
  }
  // A card the session removes stays where it is on the Current board (BD-3), unless the session placed it.
  const removedAt: Record<string, CanvasPosition> = {};
  for (const n of board.removedNodes) {
    const at = current.positions?.[n.id];
    if (at !== undefined && !graph.nodes.some((m) => m.id === n.id)) removedAt[n.id] = at;
  }
  return {
    runId: view.runId,
    subject: view.subject,
    nodes,
    order: columnOrder(nodeList),
    edges,
    vocabulary,
    vocab: new Map(vocabulary.map((item) => [item.name, item])),
    positions: { ...removedAt, ...(graph.positions ?? {}), ...(board.positions ?? {}) },
    hidden: new Set(hiddenTargets),
    marks,
    proposed,
    premises: premises.map((p) => ({ ...p })),
    locations,
    diff: { vocabulary: vocabDiff },
  };
}

/** The marks without Results' (a hidden Result's status is never needed: the target's chip stands for it, AF9). */
function withoutResults(marks: Readonly<Record<string, readonly CardMark[]>>): Readonly<Record<string, readonly CardMark[]>> {
  if (!Object.values(marks).some((list) => list.some((m) => m.kind === 'result'))) return marks;
  const out: Record<string, readonly CardMark[]> = {};
  for (const [card, list] of Object.entries(marks)) {
    const kept = list.filter((m) => m.kind !== 'result');
    if (kept.length > 0) out[card] = kept;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Card marks (§5.10: ItemMark replaces DiffBadge)

/** The chip that stands for a target's result while the results are hidden (RV-6, D2-61). */
export const RESULT_HIDDEN_CHIP = {
  key: 'result-hidden',
  label: REVIEW_TEXTS.resultAfterReview,
  title: 'The results are shown once you have decided every statement and belief item (or pressed Show results), so you judge their meaning first',
  tone: 'subtle',
} as const;

/** Chip keys of a card face that tell its proof result (left out of a target whose result is hidden). */
export const RESULT_CHIP_KEYS: ReadonlySet<string> = new Set([
  'proof',
  'established',
  'conditional',
  'pending',
  'uses-sorry',
  'holds-mismatch',
  'self-evident',
  'rests-on-pending',
  'hidden-assumption',
  'uses-unseen',
  'existence-commitment',
  'provable-assumption',
]);

/** A mark's glyph: "+" what the session adds (a card, a premise, an arrow), "−" what it removes, "~" any other change. */
export function markGlyph(kind: ItemKind): string {
  if (kind === 'add' || kind === 'add-premise' || kind === 'add-arrow') return '+';
  return kind === 'delete' || kind === 'remove-arrow' ? '−' : '~';
}

/** Builder 2h: a mark's status word, with its glyph after it as §5.10's example ("accepted ✓"); "in review" alone. */
const MARK_STATUS: Readonly<Record<ItemStatus, string>> = {
  'in-review': 'in review',
  accepted: 'accepted ✓',
  declined: 'declined ✗',
  'to-be-redone': 'to be redone ↻',
  withdrawn: 'withdrawn –',
};

/** "+ new · in review", "~ Formalize · accepted ✓" (§5.10; core's REVIEW_TEXTS.markLabel). */
export function markText(mark: Pick<CardMark, 'kind' | 'status'>): string {
  if (mark.kind === 'add' && mark.status === 'in-review') return REVIEW_TEXTS.markNewInReview;
  return REVIEW_TEXTS.markLabel(markGlyph(mark.kind), mark.kind === 'add' ? 'new' : ITEM_KIND_LABELS[mark.kind], MARK_STATUS[mark.status]);
}

// ---------------------------------------------------------------------------------------------------------------
// Claude's arrows (BD-5, S15, D2-34)

/** How one of Claude's arrows is drawn: its line, whether it is translucent, its badge and its tooltip. */
export interface ProposedLook {
  line: 'dotted' | 'solid' | 'thin';
  translucent: boolean;
  badge: '+' | '−';
  title: string;
}

/** Builder 2h: the tooltip of Claude's arrow in review (the plan quotes only the accepted one's). */
export const PROPOSED_ARROW_TITLES = {
  addInReview: "Claude's arrow, in review: click to review it",
  removeInReview: 'Claude would remove this arrow (in review): click to review it',
} as const;

/** §5.10's looks. Never colour alone: translucency (or, in high contrast, a dashed outline) and the badge. */
export function proposedLook(arrow: Pick<ProposedArrow, 'change' | 'status' | 'used'>): ProposedLook {
  if (arrow.change === 'remove') return { line: 'dotted', translucent: true, badge: '−', title: PROPOSED_ARROW_TITLES.removeInReview };
  if (arrow.status === 'accepted') return { line: 'dotted', translucent: false, badge: '+', title: REVIEW_TEXTS.arrowAccepted };
  return { line: arrow.used ? 'solid' : 'thin', translucent: true, badge: '+', title: PROPOSED_ARROW_TITLES.addInReview };
}

/**
 * Whether a click on Claude's arrow focuses its item instead of selecting it: every one not accepted (§5.10: "Never
 * selectable for Formalize until accepted", D2-20). An accepted Add is drawn in the working copy like the person's.
 */
export function focusesItem(arrow: Pick<ProposedArrow, 'change' | 'status'> | undefined): boolean {
  return arrow !== undefined && !(arrow.change === 'add' && arrow.status === 'accepted');
}

/** The anchor id of a "Claude suggests" card (the edge engine measures it as an arrow end, `data-edge-anchor`). */
export function premiseAnchor(item: string): string {
  return `premise:${item}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Formalize during a stage (RV-9, §4.12, §5.11)

/**
 * What core `formalizeStartProblems` reads of the session, built from the view (§4.12: it holds all of it while the
 * results are shown, the only time a mid-stage Formalize is allowed, D2-65). The runner checks again on its records.
 */
export function formalizeSessionOf(view: Pick<SessionView, 'subject' | 'results' | 'inferences' | 'items'>): FormalizeSession {
  const shaky = (i: ItemView) => i.status === 'declined' && i.declined?.option === 'shaky';
  const results: Record<string, ItemStatus> = {};
  const shakyResults: string[] = [];
  for (const inf of view.inferences) {
    const r = inf.result !== undefined ? view.items.find((i) => i.id === inf.result) : undefined;
    if (r === undefined || r.status === null) continue;
    results[inf.target.id] = r.status;
    if (shaky(r)) shakyResults.push(inf.target.id);
  }
  return {
    subject: view.subject,
    resultsShown: view.results.shown,
    targets: view.inferences.map((i) => i.target.id),
    arrows: view.items.flatMap((i) => {
      if (i.kind !== 'add-arrow' || i.status === null || i.status === 'declined' || i.status === 'withdrawn' || i.detail.kind !== 'add-arrow') return [];
      return [{ item: i.id, source: i.detail.source.id, target: i.detail.target.id, status: i.status }];
    }),
    shakyTargets: [...new Set(view.items.filter(shaky).map((i) => i.origin.target))],
    results,
    shakyResults,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The Context Menu's review items (CM-2, RV-8)

/**
 * The review items a board selection names, in the list's order: the items selected in the list or on the board
 * (`selectedItems`), and the listed items marking the selected cards (a card's marks). A hidden Result never: its card
 * has no mark for it, and the list never selects it.
 */
export function contextItems(view: Pick<SessionView, 'items' | 'board'>, selectedItems: readonly string[], selectedCards: readonly string[]): string[] {
  const wanted = new Set(selectedItems);
  for (const card of selectedCards) for (const m of view.board.marks[card] ?? []) wanted.add(m.item);
  return view.items.filter((i) => wanted.has(i.id) && i.status !== null).map((i) => i.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Session Undo (§5.12, UN-1, D2-38)

/**
 * Which stack Ctrl+Z, Ctrl+Shift+Z and the toolbar's Undo and Redo act on: the session stack when a session exists and
 * either the Proposed view is on screen or the focus is inside `data-undo-scope="session"` (the review panel, the
 * session's dialogs); otherwise the board stack, which stays locked during a session.
 */
export function undoScope(input: { session: boolean; proposedOnScreen: boolean; focusInSession: boolean }): 'session' | 'board' {
  return input.session && (input.proposedOnScreen || input.focusInSession) ? 'session' : 'board';
}

export interface UndoButtonModel {
  disabled: boolean;
  title: string;
}

/**
 * The toolbar's Undo and Redo on the session stack: the host's step label ("Undo: Accept ‹item›", UN-1); disabled with
 * D2-62's text while a step runs, with UN-5's when Undo stops at a seal, else when there is nothing to undo.
 */
export function sessionUndoButtons(view: Pick<SessionView, 'phase' | 'undo' | 'redo' | 'sealed'>, busy: boolean): { undo: UndoButtonModel; redo: UndoButtonModel } {
  if (view.phase === 'step' || view.phase === 'interrupted') {
    const off = { disabled: true, title: REVIEW_TEXTS.stepRunning };
    return { undo: off, redo: off };
  }
  if (view.phase !== 'stage') {
    const off = { disabled: true, title: view.phase === 'applying' ? REVIEW_TEXTS.applyingNow : REVIEW_TEXTS.formalizeConfirming };
    return { undo: off, redo: off };
  }
  const undo: UndoButtonModel =
    view.undo !== null
      ? { disabled: busy, title: `Undo: ${view.undo.label} (Ctrl+Z)` }
      : { disabled: true, title: view.sealed !== null ? REVIEW_TEXTS.sealed : 'Nothing to undo' };
  const redo: UndoButtonModel = view.redo !== null ? { disabled: busy, title: `Redo: ${view.redo.label} (Ctrl+Shift+Z)` } : { disabled: true, title: 'Nothing to redo' };
  return { undo, redo };
}
