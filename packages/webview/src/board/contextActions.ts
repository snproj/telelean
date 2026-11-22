/**
 * The Context Menu section's model (spec v4.1 CM-1–CM-5, ES-2 with AP-9's one target, AR-8, AP-13; slice 1e). Pure, so
 * the rules are unit-tested; header/ContextSection.tsx renders it, and the right-click menu (board/menu.ts, CM-7) offers
 * the same Formalize entry, computed by the same `formalizeState`, and the same card actions (menu.ts `cardActions`).
 *
 * The section shows what is selected ("2 arrows into “X”", "3 cards", …) and the actions that fit it:
 *  - **Formalize for dependencies** (a labelled button): the selected arrows into exactly one proposition, or that
 *    proposition's "follows from nothing" mark, are the question; enabled when no run of the model folder is active,
 *    otherwise disabled with the reason on hover (CM-3). Only drawn arrows and ∅ marks can be selected (the store keeps
 *    nothing else), so warning and mention arrows never count. (Slice 2h: several targets at once, below.)
 *    No cycle of arrows (drawn and solid, TL015; AP-13) may lie anywhere in the subject: one through the target or a
 *    source names that card, any other is named too (core `formalizeCycleProblem`; AP-29, G2, slice 2b2).
 *  - Delete (the selected arrows and marks, one Undo step);
 *  - for one selected card, its actions: Follows from nothing / Remove it, Select incoming arrows, Mark pending, Move to
 *    axioms, the old axiom's two (A19), Show on board, Open in editor; each disabled with its reason when it fits only
 *    partly (during an edit session, in the Proposed view, on a card the host has not written yet). With several cards
 *    selected, the same actions (those any of them offers) are listed disabled, with "Select one card for this action."
 *    on hover (CM-3; fixer 1e: they were left out, with no reason shown).
 * An unproved proposition among the sources does not disable Formalize: pressing it asks first (AR-8, the store).
 *
 * Slice 2h (§5.11, RV-9, ES-1): Formalize takes several targets at once (the "several targets" reason went): one
 * inference per proposition the selected arrows or marks point into, ordered sources first (core `formalizeOrder`), and
 * checked with core `formalizeStartProblems`, the host's own check, all but its AR-8 check 4 (the store asks about an
 * unproved source instead). During an edit session it is a mid-stage Formalize of the Proposed view, disabled while
 * Claude's step runs, while the results are hidden (D2-65, with Show results), while confirming, in the Current view,
 * while judging, and on another subject's board. The section also lists the selection's review items ("N review items")
 * with Accept and Decline… (RV-8: a group, `own: false`, previewed with core `planGroupAccept`).
 */
import { formalizeOrder, formalizeStartProblems, REVIEW_TEXTS, type ArrowEnds, type RunView, type SessionView, type TlEdge, type TlGraph, type TlNode } from '@telelean/core';
import { acceptPreview, leftNote, listControls, stepRunning, type Control } from '../model/review';
import { trayRunBlock } from '../model/run';
import { formalizeSessionOf } from '../model/sessionBoard';
import { cardActions, FORMALIZE_LABEL, MENU_PROPOSED_ARROWS, MENU_PROVISIONAL, menuName, removeSelectionLabel, type MenuAction, type MenuContext } from './menu';

/** The labelled button's words (CM-3; defined with the right-click menu, which offers the same entry). */
export { FORMALIZE_LABEL };

/** Why Formalize for dependencies cannot be pressed (CM-3: the reason on hover). (Slice 2h: no "several targets" reason.) */
export const FORMALIZE_TEXTS = {
  /** No arrow and no mark selected. */
  none: "Select arrows, or a 'follows from nothing' mark.",
  /** A run of the model folder is active, or a start is on its way. */
  runActive: 'A run is active.',
  /** The empty section (CM-1). */
  empty: 'Select some items to see possible actions here.',
  /** A card action while several cards are selected (CM-3: shown, disabled, with the reason on hover; fixer 1e). */
  severalCards: 'Select one card for this action.',
} as const;

/** One inference of a Formalize: a target and the sources of the arrows selected into it (none: its mark). */
export interface FormalizeInference {
  target: string;
  premises: string[];
}

/** What Formalize for dependencies would ask now. */
export interface FormalizeState {
  /** Why it cannot be pressed now, or null. */
  disabled: string | null;
  /**
   * The question (slice 2h, §5.11): one inference per proposition the selected arrows (or "follows from nothing" marks)
   * point into, its premises the selected arrows' sources in selection order (none for a mark), ordered sources first
   * (core `formalizeOrder`) when it can be pressed.
   */
  inferences: FormalizeInference[];
  /** The button's tooltip: the reason when disabled, else what it asks. */
  title: string;
  /** A session's start (`start`), or a Formalize of the session's current stage (`mid-stage`, RV-9). */
  mode: 'start' | 'mid-stage';
  /** D2-65: disabled because the results are hidden; Show results is offered beside the reason. */
  showResults?: true;
}

export interface FormalizeContext {
  /** The cards of the board on screen (the Current board's; in a session, the Proposed view's). */
  nodes: Readonly<Record<string, TlNode>>;
  /** That board's edges (drawn and verified ones count for cycles). */
  edges: readonly TlEdge[];
  selectedArrows: readonly ArrowEnds[];
  selectedMarks: readonly string[];
  provisional: Readonly<Record<string, true>>;
  /** Why no run can start now (`formalizeRunBlock`; outside a session), or null. */
  runBlock: string | null;
  /** Slice 2h: the board's subject (a session of another subject disables Formalize). */
  subject?: string;
  /** Slice 2h: the root's edit session, and whether its Proposed view is on screen. */
  session?: { view: SessionView; proposed: boolean };
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

/**
 * The reasons Formalize is off during a session, in §5.11's order (null: none): another subject's session, a step
 * running, confirming (applying), the Current view, the results hidden (D2-65), judging, then the host's own gate
 * (`SessionView.formalize`).
 */
function sessionReason(ctx: FormalizeContext): { text: string; showResults?: true } | null {
  const s = ctx.session;
  if (s === undefined) return null;
  const v = s.view;
  if (ctx.subject !== undefined && v.subject !== ctx.subject) return { text: REVIEW_TEXTS.runElsewhere(v.subject) };
  if (stepRunning(v)) return { text: REVIEW_TEXTS.formalizeStepRunning };
  if (v.phase === 'confirming') return { text: REVIEW_TEXTS.formalizeConfirming };
  if (v.phase === 'applying') return { text: REVIEW_TEXTS.applyingNow };
  if (!s.proposed) return { text: REVIEW_TEXTS.formalizeCurrentView };
  if (!v.results.shown) return { text: REVIEW_TEXTS.formalizeResultsHidden, showResults: true };
  if (v.judging) return { text: REVIEW_TEXTS.judging };
  if (!v.formalize.ok) return { text: v.formalize.reason };
  return null;
}

/** Formalize for dependencies on the current selection (see the module comment). */
export function formalizeState(ctx: FormalizeContext): FormalizeState {
  const mode: FormalizeState['mode'] = ctx.session !== undefined ? 'mid-stage' : 'start';
  const off = (disabled: string, inferences: FormalizeInference[] = [], extra: { showResults?: true } = {}): FormalizeState => ({ disabled, inferences, title: disabled, mode, ...extra });
  const blocked = sessionReason(ctx);
  if (blocked !== null) return off(blocked.text, [], blocked.showResults === true ? { showResults: true } : {});
  if (ctx.session === undefined && ctx.runBlock !== null) return off(ctx.runBlock);
  const arrows = ctx.selectedArrows.filter((a) => ctx.nodes[a.target] !== undefined && ctx.nodes[a.source] !== undefined);
  const marks = ctx.selectedMarks.filter((id) => ctx.nodes[id] !== undefined);
  const targets = unique([...arrows.map((a) => a.target), ...marks]);
  if (targets.length === 0) return off(FORMALIZE_TEXTS.none);
  const asked: FormalizeInference[] = targets.map((target) => ({ target, premises: unique(arrows.filter((a) => a.target === target).map((a) => a.source)) }));
  if (asked.some((inf) => [inf.target, ...inf.premises].some((id) => ctx.provisional[id] === true))) return off(MENU_PROVISIONAL, asked);
  // The host's own check (core §4.12), all but check 4: an unproved source is asked about when Formalize is pressed (AR-8).
  // The subject is the board's (all its cards are of it; the session's in a session, sessionReason refused another).
  const subject = ctx.session?.view.subject ?? (ctx.subject !== undefined && ctx.subject !== '' ? ctx.subject : (Object.values(ctx.nodes)[0]?.subject ?? ''));
  const board = { subject, nodes: Object.values(ctx.nodes), edges: [...ctx.edges] } as unknown as TlGraph;
  const session = ctx.session !== undefined ? formalizeSessionOf(ctx.session.view) : undefined;
  const problem = formalizeStartProblems(board, asked, session).find((p) => p.check !== 4);
  if (problem !== undefined) return off(problem.text, asked);
  const order = formalizeOrder(board, asked);
  const inferences = order.map((t) => asked.find((inf) => inf.target === t) as FormalizeInference);
  return { disabled: null, inferences, title: formalizeTitle(ctx.nodes, inferences), mode };
}

/** What Formalize asks, for its tooltip: one target as slice 1e worded it; several, sources first (builder 2h). */
function formalizeTitle(nodes: Readonly<Record<string, TlNode>>, inferences: readonly FormalizeInference[]): string {
  if (inferences.length > 1) return `Ask Claude to formalise the selected arrows and prove ${inferences.length} targets, one step each, sources first`;
  const only = inferences[0] as FormalizeInference;
  const name = menuName(nodes, only.target);
  const sources = only.premises;
  return sources.length === 0
    ? `Ask Claude to prove “${name}” from no premises at all (you marked it "follows from nothing")`
    : `Ask Claude to formalise ${sources.length === 1 ? 'the selected arrow' : `the ${sources.length} selected arrows`} and prove “${name}” from exactly ${sources.length === 1 ? 'its source' : 'their sources'}`;
}

/** Slice 2h (CM-2, RV-8): the Context Menu section's review items: "N review items", Accept k of N, Decline…. */
export interface ReviewItemsModel {
  items: string[];
  text: string;
  accept: Control & { label: string };
  decline: Control;
}

/**
 * The section's review items (`ids`, model/sessionBoard.ts `contextItems`), with the list's group controls (D2-62
 * first). "Accept k of N" says on hover which items it leaves and why (core `planGroupAccept`'s reasons, RV-8).
 */
export function reviewItemsModel(view: SessionView, ids: readonly string[], busy: boolean): ReviewItemsModel | null {
  if (ids.length === 0) return null;
  const controls = listControls(view, ids, busy);
  const left = leftNote(view.items, acceptPreview(view.items, ids).left);
  const accept = controls.acceptGroup.enabled && left !== null ? { ...controls.acceptGroup, title: `${controls.acceptGroup.title}\n${left}` } : controls.acceptGroup;
  return { items: [...ids], text: REVIEW_TEXTS.reviewItems(ids.length), accept, decline: controls.declineGroup };
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
  'accept-item': 'check',
  'decline-item': 'close',
  'show-item': 'list-flat',
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
