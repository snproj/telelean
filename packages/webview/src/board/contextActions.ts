/**
 * The Context Menu section's model (spec v4.1 CM-1–CM-5, ES-2 with AP-9's one target, AR-8, AP-13; slice 1e). Pure, so
 * the rules are unit-tested; header/ContextSection.tsx renders it, and the right-click menu (board/menu.ts, CM-7) offers
 * the same Formalize entry, computed by the same `formalizeState`, and the same card actions (menu.ts `cardActions`).
 *
 * The section shows what is selected ("2 arrows into “X”", "3 cards", …) and the actions that fit it:
 *  - **Formalize for dependencies** (a labelled button): the selected arrows into exactly one proposition, or that
 *    proposition's "follows from nothing" mark, are the question; enabled when no run of the model folder is active,
 *    otherwise disabled with the reason on hover (CM-3). Only drawn arrows and ∅ marks can be selected (the store keeps
 *    nothing else), so warning and mention arrows never count. Several targets wait for the review list (slice 2).
 *    No cycle of arrows (drawn and solid, TL015; AP-13) may lie anywhere in the subject: one through the target or a
 *    source names that card, any other is named too (core `formalizeCycleProblem`; AP-29, G2, slice 2b2).
 *  - Delete (the selected arrows and marks, one Undo step);
 *  - for one selected card, its actions: Follows from nothing / Remove it, Select incoming arrows, Mark pending, Move to
 *    axioms, the old axiom's two (A19), Show on board, Open in editor; each disabled with its reason when it fits only
 *    partly (during an edit session, in the Proposed view, on a card the host has not written yet). With several cards
 *    selected, the same actions (those any of them offers) are listed disabled, with "Select one card for this action."
 *    on hover (CM-3; fixer 1e: they were left out, with no reason shown).
 * An unproved proposition among the sources does not disable Formalize: pressing it asks first (AR-8, the store).
 */
import { formalizeCycleProblem, type ArrowEnds, type RunView, type TlEdge, type TlNode } from '@telelean/core';
import { trayRunBlock } from '../model/run';
import { cardActions, FORMALIZE_LABEL, MENU_PROPOSED_ARROWS, MENU_PROVISIONAL, menuName, removeSelectionLabel, type MenuAction, type MenuContext } from './menu';

/** The labelled button's words (CM-3; defined with the right-click menu, which offers the same entry). */
export { FORMALIZE_LABEL };

/** Why Formalize for dependencies cannot be pressed (CM-3: the reason on hover). */
export const FORMALIZE_TEXTS = {
  /** Arrows (or marks) into several propositions: one target at a time in slice 1 (AP-9). */
  several: 'Select arrows into one card: several targets come with the review list.',
  /** No arrow and no mark selected. */
  none: "Select arrows, or a 'follows from nothing' mark.",
  /** A run of the model folder is active, or a start is on its way. */
  runActive: 'A run is active.',
  /** The empty section (CM-1). */
  empty: 'Select some items to see possible actions here.',
  /** A card action while several cards are selected (CM-3: shown, disabled, with the reason on hover; fixer 1e). */
  severalCards: 'Select one card for this action.',
} as const;

/** What Formalize for dependencies would ask now. */
export interface FormalizeState {
  /** Why it cannot be pressed now, or null. */
  disabled: string | null;
  /** The proposition the question is about (the selected arrows' target, or the marked card), when there is one. */
  target: string | null;
  /** The question: the selected arrows' sources (empty for a "follows from nothing" mark), in selection order. */
  sources: string[];
  /** The button's tooltip: the reason when disabled, else what it asks. */
  title: string;
}

export interface FormalizeContext {
  /** The Current board's cards. */
  nodes: Readonly<Record<string, TlNode>>;
  /** The Current board's edges (drawn and verified ones count for cycles). */
  edges: readonly TlEdge[];
  selectedArrows: readonly ArrowEnds[];
  selectedMarks: readonly string[];
  provisional: Readonly<Record<string, true>>;
  /** Why no run can start now (`formalizeRunBlock`), or null. */
  runBlock: string | null;
}

/**
 * Why no run can start now (CM-3): a run of the model folder is active (any subject, any state before it ends; in
 * slice 1 a run is the edit session, ES-1), or this board's start is on its way. Null when one can start.
 */
export function formalizeRunBlock(run: RunView | null | undefined, subject: string, starting: boolean): string | null {
  const active = trayRunBlock(run, subject);
  if (active !== null) return `${FORMALIZE_TEXTS.runActive} ${active}`;
  return starting ? `${FORMALIZE_TEXTS.runActive} It is starting.` : null;
}

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

/** Formalize for dependencies on the current selection (see the module comment). */
export function formalizeState(ctx: FormalizeContext): FormalizeState {
  const off = (disabled: string, target: string | null = null, sources: string[] = []): FormalizeState => ({ disabled, target, sources, title: disabled });
  if (ctx.runBlock !== null) return off(ctx.runBlock);
  const arrows = ctx.selectedArrows.filter((a) => ctx.nodes[a.target] !== undefined && ctx.nodes[a.source] !== undefined);
  const marks = ctx.selectedMarks.filter((id) => ctx.nodes[id] !== undefined);
  const targets = unique([...arrows.map((a) => a.target), ...marks]);
  if (targets.length === 0) return off(FORMALIZE_TEXTS.none);
  if (targets.length > 1) return off(FORMALIZE_TEXTS.several);
  const target = targets[0] as string;
  const sources = unique(arrows.filter((a) => a.target === target).map((a) => a.source));
  if ([target, ...sources].some((id) => ctx.provisional[id] === true)) return off(MENU_PROVISIONAL, target, sources);
  const cycle = formalizeCycleProblem({ nodes: ctx.nodes, edges: ctx.edges }, [target, ...sources]);
  if (cycle !== undefined) return off(cycle, target, sources);
  const name = menuName(ctx.nodes, target);
  const title =
    sources.length === 0
      ? `Ask Claude to prove “${name}” from no premises at all (you marked it "follows from nothing")`
      : `Ask Claude to formalise ${sources.length === 1 ? 'the selected arrow' : `the ${sources.length} selected arrows`} and prove “${name}” from exactly ${sources.length === 1 ? 'its source' : 'their sources'}`;
  return { disabled: null, target, sources, title };
}

export interface SelectionContext {
  nodes: Readonly<Record<string, TlNode>>;
  selected: readonly string[];
  selectedArrows: readonly ArrowEnds[];
  selectedMarks: readonly string[];
}

/** CM-5: the selection in one line ("2 arrows into “X” · 1 card"), and every item on its own line for the tooltip. */
export function selectionSummary(ctx: SelectionContext): { text: string; title: string } | null {
  const name = (id: string) => `“${menuName(ctx.nodes, id)}”`;
  const parts: string[] = [];
  const lines: string[] = [];
  const arrows = ctx.selectedArrows;
  if (arrows.length > 0) {
    const targets = unique(arrows.map((a) => a.target));
    const n = `${arrows.length} arrow${arrows.length === 1 ? '' : 's'}`;
    parts.push(targets.length === 1 ? `${n} into ${name(targets[0] as string)}` : `${n} into ${targets.length} propositions`);
    for (const a of arrows) lines.push(`${name(a.source)} → ${name(a.target)}`);
  }
  const marks = ctx.selectedMarks;
  if (marks.length > 0) {
    parts.push(marks.length === 1 ? `the "follows from nothing" mark of ${name(marks[0] as string)}` : `${marks.length} "follows from nothing" marks`);
    for (const id of marks) lines.push(`∅ → ${name(id)}`);
  }
  const cards = ctx.selected.filter((id) => ctx.nodes[id] !== undefined);
  if (cards.length > 0) {
    parts.push(cards.length === 1 ? name(cards[0] as string) : `${cards.length} cards`);
    for (const id of cards) lines.push(name(id));
  }
  if (parts.length === 0) return null;
  return { text: parts.join(' · '), title: lines.join('\n') };
}

/**
 * D-3b (the tray's "+ presupposes" chips before 1e; fixer 1e): the cards whose statements' existence presuppositions
 * the summary's tooltip lists: the ends of the selected arrows (the question's target and premises: selecting an arrow
 * clears the selected cards), the marked cards, and the selected cards. Each once, in that order; only cards on board.
 */
export function selectionCards(ctx: SelectionContext): string[] {
  const ids: string[] = [];
  for (const a of ctx.selectedArrows) ids.push(a.target, a.source);
  ids.push(...ctx.selectedMarks, ...ctx.selected);
  return unique(ids).filter((id) => ctx.nodes[id] !== undefined);
}

/** The summary's tooltip: every selected item, then what the selection's statements presuppose (D-3b), if anything. */
export function summaryTitle(summary: { title: string }, presupposes: readonly string[]): string {
  return presupposes.length > 0 ? `${summary.title}\n+ presupposes: ${presupposes.join(', ')}` : summary.title;
}

/** An action of the section (the right-click menu's ids; `remove-selection` is the section's Delete). */
export type ContextAction = MenuAction | 'remove-selection';

export interface ContextEntry {
  action: ContextAction;
  label: string;
  /** Why it cannot be chosen now (its tooltip then), or null. */
  disabled: string | null;
  /** A codicon name: the section shows icons with their labels on hover (CM-3). */
  icon: string;
}

export interface ContextActions {
  summary: { text: string; title: string } | null;
  formalize: FormalizeState;
  /** The other actions, in order (the narrow window's "…" menu takes those that do not fit). */
  entries: ContextEntry[];
  /**
   * The card the card actions are about: the one selected card on the board shown, else null (fixer 1e: the section
   * runs them on this card, the same one the entries were built for).
   */
  card: string | null;
}

/** The card actions the section shows, in the right-click menu's order (editing a field stays on the card itself). */
const SECTION_CARD_ACTIONS: ReadonlySet<MenuAction> = new Set<MenuAction>([
  'from-nothing',
  'remove-from-nothing',
  'select-incoming',
  'mark-pending',
  'move-to-axioms',
  'legacy-make-proposition',
  'legacy-drop-arrows',
  'show',
  'open',
]);

export const CONTEXT_ICONS: Readonly<Record<ContextAction, string>> = {
  'remove-selection': 'trash',
  'from-nothing': 'circle-slash',
  'remove-from-nothing': 'close',
  'select-incoming': 'list-selection',
  'mark-pending': 'watch',
  'move-to-axioms': 'arrow-left',
  'legacy-make-proposition': 'arrow-right',
  'legacy-drop-arrows': 'remove',
  show: 'eye',
  open: 'go-to-file',
  formalize: 'play',
  'draw-from-selection': 'arrow-right',
  'draw-this-arrow': 'arrow-right',
  details: 'chevron-down',
  edit: 'edit',
  why: 'comment',
  delete: 'trash',
  'remove-arrows': 'trash',
  'show-source': 'eye',
  'show-target': 'eye',
  'remove-mark': 'close',
  'new-here': 'add',
  fit: 'screen-full',
  tidy: 'layout',
};

/** The section's model for the selection (see the module comment). `menu`: the right-click menu's context for the cards. */
export function contextActions(menu: MenuContext, formalize: FormalizeState): ContextActions {
  const summary = selectionSummary(menu);
  const entries: ContextEntry[] = [];
  const arrows = menu.selectedArrows.length;
  const marks = menu.selectedMarks.length;
  if (arrows + marks > 0) {
    entries.push({ action: 'remove-selection', label: removeSelectionLabel(arrows, marks), disabled: menu.proposed ? MENU_PROPOSED_ARROWS : menu.lock, icon: CONTEXT_ICONS['remove-selection'] });
  }
  const cards = menu.selected.filter((id) => menu.nodes[id] !== undefined);
  if (cards.length === 1) {
    for (const entry of cardActions(cards[0] as string, menu)) {
      if (!SECTION_CARD_ACTIONS.has(entry.action)) continue;
      entries.push({ action: entry.action, label: entry.label, disabled: entry.disabled, icon: CONTEXT_ICONS[entry.action] });
    }
  } else if (cards.length > 1) {
    // CM-3: each of these acts on one card, so with several selected they are shown disabled, with the reason on hover:
    // those any selected card offers, in the section's order, with the first such card's words.
    const offered = new Map<MenuAction, string>();
    for (const id of cards) for (const entry of cardActions(id, menu)) if (SECTION_CARD_ACTIONS.has(entry.action) && !offered.has(entry.action)) offered.set(entry.action, entry.label);
    for (const action of SECTION_CARD_ACTIONS) {
      const label = offered.get(action);
      if (label !== undefined) entries.push({ action, label, disabled: FORMALIZE_TEXTS.severalCards, icon: CONTEXT_ICONS[action] });
    }
  }
  return { summary, formalize, entries, card: cards.length === 1 ? (cards[0] as string) : null };
}

/** CM-3 on a narrow window: how many icon buttons fit in `available` px (the rest go into the "…" menu, `more` px wide). */
export function fittingActions(available: number, count: number, button: number, more: number): number {
  if (count * button <= available) return count;
  return Math.max(0, Math.min(count - 1, Math.floor((available - more) / button)));
}
