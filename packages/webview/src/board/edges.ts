import type { TlEdge, TlNode } from '@telelean/core';
import { proposedLook, type ProposedArrow } from '../model/sessionBoard';
import type { EdgeSpec } from './geometry';

export interface DisplayEdge extends EdgeSpec {
  declared: boolean;
  verified: boolean;
}

/** TL107's tooltip: a proof uses a card nobody drew an arrow from (the warning colour, spec v4 BD-5). */
export const USED_UNDECLARED_TITLE = 'The proof uses it, but no arrow is drawn from it (TL107)';
/** BD-5: a drawn arrow into a proved card whose source is not in direct(v): plain dotted, never a warning. */
export const NOT_USED_TITLE = 'Not used by the current proof';

/** What the arrows' tooltips may say about the target's proof (slice 1d). */
export interface DisplayContext {
  nodes: Readonly<Record<string, TlNode>>;
  /** Cards whose result the Proposed view hides: their arrows say nothing about a proof. */
  hidden?: ReadonlySet<string>;
  /** Slice 2h (BD-5): Claude's arrows in a session's Proposed view, by edge id (model/sessionBoard.ts `sessionOverlay`). */
  proposed?: ReadonlyMap<string, ProposedArrow>;
}

/**
 * Merges the graph's edges into what the overlay draws (03 section 7, D-13, D-15; spec v4 BD-5, slice 1d):
 *  - one arrow per (source, target) pair: solid once Lean verified it, dotted while it is only declared;
 *  - a verified edge into a conditional proof keeps the solid line but gets its own (hollow) marker and the tooltip
 *    "taken as a hypothesis";
 *  - an arrow a proof uses without a declaration (TL107, used-undeclared) is drawn in the warning colour, with its
 *    tooltip;
 *  - a declared arrow into a proved card that the proof does not use directly (TL109's declared-unused, or a source only
 *    reached through other cards' proofs) stays plain dotted, NOT in the warning colour, with the tooltip "Not used by
 *    the current proof" (BD-5: it is never removed for you, and it is not a warning);
 *  - `lean-ref` edges (a statement mentions another node's statement) are drawn thin, and only while one of their
 *    ends is in `focus` (hovered or selected) and no declared or verified arrow already joins the pair.
 */
export function toDisplayEdges(edges: readonly TlEdge[], focus: ReadonlySet<string> = new Set(), ctx?: DisplayContext): DisplayEdge[] {
  const byPair = new Map<string, DisplayEdge>();
  const references: TlEdge[] = [];
  const unused = new Set<string>();
  for (const edge of edges) {
    if (edge.type === 'lean-ref') {
      references.push(edge);
      continue;
    }
    const id = `${edge.source}->${edge.target}`;
    const entry = byPair.get(id) ?? { id, source: edge.source, target: edge.target, pattern: 'declared', declared: false, verified: false };
    if (edge.type === 'premise') entry.declared = true;
    if (edge.type === 'verified') {
      entry.verified = true;
      if (edge.conditional) entry.conditional = true;
    }
    // Only TL107 (used-undeclared) is a mismatch the overlay shows in the warning colour; TL109 (declared-unused) is a
    // plain dotted arrow with its tooltip (BD-5, slice 1d).
    if (edge.mismatch === 'used-undeclared') entry.mismatch = 'used-undeclared';
    if (edge.mismatch === 'declared-unused') unused.add(id);
    entry.pattern = entry.verified ? 'verified' : 'declared';
    byPair.set(id, entry);
  }
  for (const entry of byPair.values()) {
    // Slice 2h (BD-5, D2-34): one of Claude's arrows looks like none of the person's (its own line, translucency and
    // badge), whatever the working copy's premise and proof edges say; its tooltip says what it is.
    const arrow = ctx?.proposed?.get(entry.id);
    if (arrow !== undefined) {
      const look = proposedLook(arrow);
      entry.proposed = { item: arrow.item, change: arrow.change, status: arrow.status, used: arrow.used };
      entry.pattern = look.line === 'solid' ? 'verified' : look.line === 'thin' ? 'reference' : 'declared';
      delete entry.conditional;
      delete entry.mismatch;
      entry.title = look.title;
      continue;
    }
    const titles: string[] = [];
    if (entry.conditional) titles.push('Taken as a hypothesis: the proof is conditional on it');
    if (entry.mismatch) titles.push(USED_UNDECLARED_TITLE);
    else if (!entry.verified && entry.declared && (unused.has(entry.id) || provedAndShown(entry.target, ctx))) titles.push(NOT_USED_TITLE);
    if (titles.length > 0) entry.title = titles.join('. ');
  }
  for (const edge of references) {
    if (!focus.has(edge.source) && !focus.has(edge.target)) continue;
    if (byPair.has(`${edge.source}->${edge.target}`)) continue;
    const id = `ref:${edge.source}->${edge.target}`;
    if (byPair.has(id)) continue;
    byPair.set(id, { id, source: edge.source, target: edge.target, pattern: 'reference', declared: false, verified: false, title: 'Its statement mentions this one' });
  }
  return [...byPair.values()];
}

/** The target has a checked proof the board may show (proved or conditional, and not hidden by the Proposed view). */
function provedAndShown(target: string, ctx: DisplayContext | undefined): boolean {
  if (!ctx || ctx.hidden?.has(target)) return false;
  const kind = ctx.nodes[target]?.status.proof.kind;
  return kind === 'proved' || kind === 'conditional';
}

/** Whether a graph has edges whose visibility depends on the focus (so a hover must recompute the arrows). */
export function hasFocusEdges(edges: readonly TlEdge[]): boolean {
  return edges.some((edge) => edge.type === 'lean-ref');
}

/** The look of an arrow, by its spec (slice 1d, BD-5): what its line, its head and its colour say. */
export interface ArrowLook {
  line: 'dotted' | 'solid' | 'thin';
  head: 'filled' | 'hollow';
  warning: boolean;
  /** Slice 2h (BD-5): Claude's arrow still undecided: translucent (in high contrast, a dashed outline instead). */
  translucent: boolean;
  /** Slice 2h: Claude's arrow's badge at its middle ("+" adds, "−" removes), or none. */
  badge: '+' | '−' | null;
}

export function arrowLook(edge: Pick<EdgeSpec, 'pattern' | 'conditional' | 'mismatch' | 'proposed'>): ArrowLook {
  if (edge.proposed !== undefined) {
    const look = proposedLook(edge.proposed);
    return { line: look.line, head: 'filled', warning: false, translucent: look.translucent, badge: look.badge };
  }
  return {
    line: edge.pattern === 'declared' ? 'dotted' : edge.pattern === 'verified' ? 'solid' : 'thin',
    head: edge.conditional ? 'hollow' : 'filled',
    warning: edge.mismatch === 'used-undeclared',
    translucent: false,
    badge: null,
  };
}

/** What a drawn arrow's state adds to its look (slices 1c1–1c2). */
export interface ArrowState {
  /** One end is out of view (the arrow stops at the column's top or bottom, or a canvas edge). */
  stub: boolean;
  /** One end is hovered or selected. */
  focused: boolean;
  /** The arrow itself is selected. */
  selected: boolean;
  /** The pointer is on the arrow. */
  hovered: boolean;
}

const LINE_CLASS: Readonly<Record<ArrowLook['line'], string>> = { dotted: 'tl-edge--declared', solid: 'tl-edge--verified', thin: 'tl-edge--reference' };

/**
 * The class of a drawn arrow (EdgeEngine.writePaths), from its look (`arrowLook`, BD-5) and its state: the line
 * (`tl-edge--declared` round dots, `--verified` solid, `--reference` thin), `--conditional` for the hollow head's arrow,
 * `--mismatch` for the warning colour (TL107 only, slice 1d), slice 2h's `--proposed` for Claude's arrow (with
 * `--translucent` while it is undecided), then `--stub`, `--focus`, `--selected` and `--hover`.
 */
export function edgeClass(edge: Pick<EdgeSpec, 'pattern' | 'conditional' | 'mismatch' | 'proposed'>, state: ArrowState): string {
  const look = arrowLook(edge);
  return (
    `tl-edge ${LINE_CLASS[look.line]}` +
    `${look.head === 'hollow' ? ' tl-edge--conditional' : ''}${look.warning ? ' tl-edge--mismatch' : ''}` +
    `${edge.proposed !== undefined ? ' tl-edge--proposed' : ''}${look.translucent ? ' tl-edge--translucent' : ''}` +
    `${state.stub ? ' tl-edge--stub' : ''}${state.focused ? ' tl-edge--focus' : ''}${state.selected ? ' tl-edge--selected' : ''}` +
    `${state.hovered ? ' tl-edge--hover' : ''}`
  );
}

/**
 * The arrowhead of an arrow (one <marker> per variant, Board.tsx), from its look: the hollow head of a hypothesis and
 * the notched head of TL107 keep their shape when the arrow is focused or selected (never colour alone: slice 1d, and
 * the 1d fixer for TL107); otherwise the focus head, or the line's own.
 */
export function markerVariant(edge: Pick<EdgeSpec, 'pattern' | 'conditional' | 'mismatch' | 'proposed'>, focused: boolean): MarkerVariant {
  const look = arrowLook(edge);
  if (look.head === 'hollow') return focused ? 'conditional-focus' : 'conditional';
  if (look.warning) return focused ? 'mismatch-focus' : 'mismatch';
  if (focused) return 'focus';
  return edge.pattern;
}

/**
 * Slice 2h (BD-5, D2-34): the badges of Claude's arrows among the arrows to draw: one at the middle of each ("+" adds,
 * "−" removes), with the arrow's tooltip. The EdgeEngine draws them (`setBadges`, shared later by FZ-13's lock badges).
 */
export function proposedBadges(edges: readonly DisplayEdge[]): Array<{ edge: string; text: string; title: string }> {
  return edges.flatMap((e) => {
    const badge = arrowLook(e).badge;
    return badge === null ? [] : [{ edge: e.id, text: badge, title: e.title ?? '' }];
  });
}

/** Every marker variant the board defines (Board.tsx renders one <marker> per variant). */
export const MARKER_VARIANTS = ['declared', 'verified', 'reference', 'focus', 'mismatch', 'mismatch-focus', 'conditional', 'conditional-focus'] as const;
export type MarkerVariant = (typeof MARKER_VARIANTS)[number];
