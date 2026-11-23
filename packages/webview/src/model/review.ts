/**
 * Slice 2g (docs/slice2-plan.md 5.3-5.7): the review panel's pure parts, unit-tested without React. The host owns the
 * session (§5.1): items, statuses, classes, dependencies, the gates, the reveal and the order all come from the
 * `SessionView` the host built (core `buildSessionView`); this module only words and groups them. Where the board
 * previews a rule (a group Accept or Decline), it calls the same core function the host enforces it with
 * (`planGroupAccept`, `planGroupDecline`). Every text is core's (`REVIEW_TEXTS` and its tables), unless it says it is
 * builder 2g's wording (docs/slice2-plan.md section 8).
 *
 *  - `reviewRows`: the list (RV-2, §5.5), in the host's order (builder 2c2 orders `SessionView.items` by §5.5's groups
 *    and puts every item's listed dependencies before it), grouped into runs of one group: a card, Vocabulary (N) or
 *    Definitions. A hidden Result is a neutral row (◌ "result after the review"), never selectable.
 *  - labels as parts, so the board renders a card's sentence in the user's or Claude's style (provenance, D-15);
 *  - the badges, markers and status words (never colour alone);
 *  - the group previews and the note on what a group left (RV-8);
 *  - the decline menu's entries (§5.7);
 *  - `reviewKey` (D2-37: no key for Show results) and `paneModeFor` (list and detail side by side from 640 px).
 */
import {
  DECLINE_OPTION_TEXTS,
  HIDDEN_RESULT_ROW,
  ITEM_MARKER_TEXTS,
  ITEM_STATUS_TEXTS,
  itemLabel,
  planGroupAccept,
  planGroupDecline,
  PROVED_FROM_NOTHING_HINT,
  RESULT_FLAG_TEXTS,
  REVIEW_TEXTS,
  type CardRef,
  type DeclineOption,
  type GroupItem,
  type GroupLeftReason,
  type InferenceView,
  type ItemStatus,
  type ItemView,
  type SessionView,
  type StepView,
  type TlNode,
} from '@telelean/core';
import { missingArrowHints, type MissingArrowHint } from './run';

// ---------------------------------------------------------------------------------------------------------------
// Labels as parts (provenance)

/** A piece of a label: plain text, a card's or Claude's words (rendered by UserText or AgentText), or a Lean name. */
export type LabelPart = { kind: 'text'; text: string } | { kind: 'words'; text: string; by: 'user' | 'agent' } | { kind: 'code'; text: string };

const text = (t: string): LabelPart => ({ kind: 'text', text: t });
const code = (t: string): LabelPart => ({ kind: 'code', text: t });
const words = (t: string, by: 'user' | 'agent'): LabelPart => ({ kind: 'words', text: t, by });

/** A card's sentence in quotes, in its author's style. */
function quoted(card: Pick<CardRef, 'sentence' | 'wordedBy'>): LabelPart[] {
  return [text('“'), words(card.sentence, card.wordedBy), text('”')];
}

/** A text cut as core's labels cut a sentence (`cutText`: whitespace collapsed, at most `max` characters, "…"). */
export function cutLike(t: string, max: number): string {
  const chars = Array.from(t.replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * Claude's phrases that a host text may embed (D-15): the sentences of its Add premise items and of the cards it
 * worded, whole and as core's labels (60) and the board's hints (40) cut them; longest first.
 */
export function agentPhrases(session: Pick<SessionView, 'items' | 'inferences'>): string[] {
  const found = new Set<string>();
  const add = (sentence: string) => {
    const whole = sentence.replace(/\s+/g, ' ').trim();
    if (whole === '') return;
    found.add(whole);
    found.add(cutLike(whole, 60));
    found.add(cutLike(whole, 40));
  };
  for (const item of session.items) {
    if (item.detail.kind === 'add-premise') add(item.detail.sentence);
    for (const card of item.cards) if (card.wordedBy === 'agent') add(card.sentence);
    if (item.group.kind === 'card' && item.group.card.wordedBy === 'agent') add(item.group.card.sentence);
  }
  for (const inf of session.inferences) for (const card of [inf.target, ...inf.question]) if (card.wordedBy === 'agent') add(card.sentence);
  return [...found].sort((a, b) => b.length - a.length);
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Where `phrase` first occurs in `full` at or after `from` as a whole piece of text (builder 2g r1, F-V2G-FC-4): a
 * phrase that starts or ends in a word character must not touch another word character, so Claude's short sentence
 * "Evil" does not mark the inside of the user's "IsEvil".
 */
function findPhrase(full: string, phrase: string, from: number): number {
  const chars = Array.from(phrase);
  const first = chars[0] ?? '';
  const last = chars[chars.length - 1] ?? '';
  for (let at = full.indexOf(phrase, from); at >= 0; at = full.indexOf(phrase, at + 1)) {
    const before = Array.from(full.slice(0, at)).at(-1) ?? '';
    const after = Array.from(full.slice(at + phrase.length))[0] ?? '';
    if (WORD_CHAR.test(first) && WORD_CHAR.test(before)) continue;
    if (WORD_CHAR.test(last) && WORD_CHAR.test(after)) continue;
    return at;
  }
  return -1;
}

/** One of the host's texts (a gate's reason, an event, a note, a label) with Claude's phrases in Claude's style. */
export function markAgent(full: string, phrases: readonly string[]): LabelPart[] {
  const parts: LabelPart[] = [];
  let pos = 0;
  while (pos < full.length) {
    let best: { at: number; phrase: string } | null = null;
    for (const phrase of phrases) {
      if (phrase === '') continue;
      const at = findPhrase(full, phrase, pos);
      if (at >= 0 && (best === null || at < best.at || (at === best.at && phrase.length > best.phrase.length))) best = { at, phrase };
    }
    if (best === null) {
      parts.push(text(full.slice(pos)));
      break;
    }
    if (best.at > pos) parts.push(text(full.slice(pos, best.at)));
    parts.push(words(best.phrase, 'agent'));
    pos = best.at + best.phrase.length;
  }
  return parts;
}

/** The label's text, as a screen reader and the tests read it. */
export function partsText(parts: readonly LabelPart[]): string {
  return parts.map((p) => p.text).join('');
}

/**
 * Splits one of core's texts around the name it embeds, so the name keeps its author's style: `full` with the first
 * occurrence of `name` as words. A text that does not contain it stays one text part.
 */
export function wordsIn(full: string, name: string, by: 'user' | 'agent'): LabelPart[] {
  const at = name === '' ? -1 : full.indexOf(name);
  if (at < 0) return [text(full)];
  const parts: LabelPart[] = [];
  if (at > 0) parts.push(text(full.slice(0, at)));
  parts.push(words(name, by));
  if (at + name.length < full.length) parts.push(text(full.slice(at + name.length)));
  return parts;
}

/**
 * An item's label (§5.5): the kind's label, then what it names: its card's sentence, an arrow's two cards, an Add
 * premise's sentence (Claude's words), or a declaration's Lean name. `itemLabel` (core) gives the same in one string.
 */
export function itemLabelParts(item: Pick<ItemView, 'label' | 'kind' | 'cards' | 'detail'>): LabelPart[] {
  const detail = item.detail;
  switch (detail.kind) {
    case 'add-premise':
      return [text(`${item.label} “`), words(detail.sentence, 'agent'), text('”')];
    case 'vocabulary-term':
    case 'declaration':
      return [text(`${item.label} `), code(detail.name)];
    case 'add-arrow':
    case 'remove-arrow':
      return [text(`${item.label} `), ...quoted(detail.source), text(' → '), ...quoted(detail.target)];
    default: {
      const card = item.cards[0];
      return card !== undefined ? [text(`${item.label} `), ...quoted(card)] : [text(item.label)];
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Statuses, badges, markers

export type RowStatus = ItemStatus | 'hidden';

/**
 * §5.5: the status as glyph and word, never colour alone: ● in review, ✓ accepted, ✗ declined (with its option:
 * "declined (Reject)", "declined (Shaky)", or plain "declined" for an arrow's), ↻ to be redone, – withdrawn; a Result
 * while the results are hidden reads ◌ "result after the review", with no status.
 */
export function statusOf(item: Pick<ItemView, 'status' | 'declined'>): { status: RowStatus; glyph: string; word: string } {
  if (item.status === null) return { status: 'hidden', glyph: HIDDEN_RESULT_ROW.glyph, word: HIDDEN_RESULT_ROW.word };
  const base = ITEM_STATUS_TEXTS[item.status];
  const option = item.status === 'declined' ? item.declined?.option : undefined;
  const named = option === 'reject' || option === 'shaky' ? ` (${DECLINE_OPTION_TEXTS[option]})` : '';
  return { status: item.status, glyph: base.glyph, word: `${base.word}${named}` };
}

/** RV-2's badges: belief, changes what is proved, depends on N (listed dependencies only; none on a hidden Result). */
export function itemBadges(item: Pick<ItemView, 'classes' | 'dependsOn'>): string[] {
  const badges: string[] = [];
  if (item.classes?.belief === true) badges.push(REVIEW_TEXTS.badgeBelief);
  if (item.classes?.changesProved === true) badges.push(REVIEW_TEXTS.badgeChangesProved);
  if (item.dependsOn.length > 0) badges.push(REVIEW_TEXTS.badgeDependsOn(item.dependsOn.length));
  return badges;
}

export function itemMarkers(item: Pick<ItemView, 'markers'>): string[] {
  return item.markers.map((m) => ITEM_MARKER_TEXTS[m]);
}

/** "3 in review · 5 accepted · 1 declined" (+ "· 1 to be redone"): listed items only, as the host counts them. */
export function countsText(counts: SessionView['counts']): string {
  return REVIEW_TEXTS.counts(counts.inReview, counts.accepted, counts.declined, counts.toBeRedone);
}

const isArrow = (item: Pick<ItemView, 'kind'>) => item.kind === 'add-arrow' || item.kind === 'remove-arrow';

/** A hidden Result: it can be neither decided nor selected until the results are shown (D2-8). */
export const isHiddenResult = (item: Pick<ItemView, 'status'>) => item.status === null;

// ---------------------------------------------------------------------------------------------------------------
// The list (RV-2, §5.5)

export type ReviewFilter = 'all' | 'in-review';

export interface ReviewRow {
  id: string;
  status: RowStatus;
  glyph: string;
  word: string;
  label: LabelPart[];
  badges: string[];
  markers: string[];
  /** A group decision may take it (a hidden Result may not). */
  selectable: boolean;
  /** (2j1, D2-76 D4) An item to be redone: why, as the row's tooltip (core's lines, `ItemView.redo.why`). */
  title?: string;
}

export interface ReviewGroup {
  /** `card:‹id›`, `vocabulary` or `definitions`; consecutive rows of one group share it. */
  key: string;
  kind: 'card' | 'vocabulary' | 'definitions';
  card?: CardRef;
  /** The group's heading: the card's sentence, "Vocabulary (N)" or "Definitions". */
  title: LabelPart[];
  /** Vocabulary: "k of N accepted". */
  summary?: string;
  /** The card is one of the session's targets. */
  target: boolean;
  /** The card is on the session's board (§5.5's last group: cards not on the board). */
  onBoard: boolean;
  rows: ReviewRow[];
}

const groupKey = (item: Pick<ItemView, 'group'>) => (item.group.kind === 'card' ? `card:${item.group.card.id}` : item.group.kind);

export function rowOf(item: ItemView): ReviewRow {
  const status = statusOf(item);
  return {
    id: item.id,
    status: status.status,
    glyph: status.glyph,
    word: status.word,
    label: itemLabelParts(item),
    badges: itemBadges(item),
    markers: itemMarkers(item),
    selectable: !isHiddenResult(item),
    ...(redoLines(item).length > 0 ? { title: redoLines(item).join('\n') } : {}),
  };
}

/** 2j1 (D2-76 D4): why an item is to be redone, in core's words (one line per cause); none for any other item. */
export function redoLines(item: Pick<ItemView, 'status' | 'redo'>): string[] {
  return item.status === 'to-be-redone' ? [...(item.redo?.why ?? [])] : [];
}

/**
 * §5.5: the rows in the host's order (`SessionView.items` is already in §5.5's group order with every item's listed
 * dependencies before it: builder 2c2), as runs of one group each. A dependency the host hoisted out of its group
 * (a vocabulary term a source's Formalize uses) makes its own run, so the order, and with it the invariant, is never
 * changed here. `filter` 'in-review' keeps only the items in review; a group left with no row is left out.
 */
export function reviewRows(
  items: readonly ItemView[],
  inferences: readonly Pick<InferenceView, 'target'>[],
  nodes: Readonly<Record<string, TlNode>>,
  filter: ReviewFilter,
): ReviewGroup[] {
  const targets = new Set(inferences.map((i) => i.target.id));
  const vocabulary = items.filter((i) => i.group.kind === 'vocabulary');
  const vocabAccepted = vocabulary.filter((i) => i.status === 'accepted').length;
  const groups: ReviewGroup[] = [];
  for (const item of items) {
    if (filter === 'in-review' && item.status !== 'in-review') continue;
    const key = groupKey(item);
    let group = groups.at(-1);
    if (group === undefined || group.key !== key) {
      const g = item.group;
      group =
        g.kind === 'card'
          ? { key, kind: 'card', card: g.card, title: [words(g.card.sentence, g.card.wordedBy)], target: targets.has(g.card.id), onBoard: nodes[g.card.id] !== undefined, rows: [] }
          : g.kind === 'vocabulary'
            ? {
                key,
                kind: 'vocabulary',
                title: [text(REVIEW_TEXTS.vocabularyGroup(vocabulary.length))],
                summary: REVIEW_TEXTS.vocabularyAccepted(vocabAccepted, vocabulary.length),
                target: false,
                onBoard: true,
                rows: [],
              }
            : { key, kind: 'definitions', title: [text(REVIEW_TEXTS.definitionsGroup)], target: false, onBoard: true, rows: [] };
      groups.push(group);
    }
    group.rows.push(rowOf(item));
  }
  return groups;
}

/** The ids of the rows on screen, in order (Back/Next, Home/End and "4 of 12" walk them). */
export function rowIds(groups: readonly ReviewGroup[]): string[] {
  return groups.flatMap((g) => g.rows.map((r) => r.id));
}

/** The row `to` from `current` (Back/Next stop at the ends; an unknown current starts at the first or last row). */
export function moveFrom(ids: readonly string[], current: string | null, to: 1 | -1 | 'first' | 'last'): string | null {
  if (ids.length === 0) return null;
  if (to === 'first') return ids[0] ?? null;
  if (to === 'last') return ids.at(-1) ?? null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at < 0) return (to === 1 ? ids[0] : ids.at(-1)) ?? null;
  return ids[Math.max(0, Math.min(ids.length - 1, at + to))] ?? null;
}

/** "4 of 12": the item's place among the rows on screen (null when it is not one of them). */
export function positionOf(ids: readonly string[], id: string | null): { index: number; of: number } | null {
  const at = id === null ? -1 : ids.indexOf(id);
  return at < 0 ? null : { index: at + 1, of: ids.length };
}

/** Where the review starts: the first item in review, else the first item. */
export function firstInReview(items: readonly Pick<ItemView, 'id' | 'status'>[]): string | null {
  return (items.find((i) => i.status === 'in-review') ?? items[0])?.id ?? null;
}

/** "Select all in review": the listed items in review, in list order. */
export function inReviewIds(items: readonly Pick<ItemView, 'id' | 'status'>[]): string[] {
  return items.filter((i) => i.status === 'in-review').map((i) => i.id);
}

// ---------------------------------------------------------------------------------------------------------------
// Group decisions (RV-8, §5.5, §5.7)

/**
 * The GroupItem the host's planner reads of an item (core reducer's `groupItemOf`, from what the view shows): its
 * own-Accept class (RV-7), hidden (a hidden Result), blocked, an arrow item. `blocked` is the host's own
 * (`ItemView.blocked`; builder 2h, carry-over F-V2G-FC-9): fixer 2g r1 rebuilt it from the own Accept's gate ("closed
 * with no missing dependency"), which says "depends" for an item that both waits for the results and has a dependency
 * in review, where the host's planner says "blocked", so "Accept k of N" and the "Left" note could differ.
 */
export function groupItemOf(item: ItemView): GroupItem {
  return {
    id: item.id,
    status: item.status,
    dependsOn: item.dependsOn,
    ownAccept: item.classes !== null && (item.classes.belief || item.classes.changesProved),
    hidden: isHiddenResult(item),
    blocked: item.blocked === true,
    arrow: isArrow(item),
  };
}

/** The group Accept button: "Accept N", or "Accept k of N" when the rules leave some (`planGroupAccept`). */
export function acceptPreview(items: readonly ItemView[], selected: readonly string[]): { take: string[]; left: Array<{ item: string; reason: GroupLeftReason }>; label: string } {
  const plan = planGroupAccept(items.map(groupItemOf), selected);
  const n = new Set(selected).size;
  return { ...plan, label: plan.take.length === n ? REVIEW_TEXTS.acceptN(n) : REVIEW_TEXTS.acceptKOfN(plan.take.length, n) };
}

/** A group Decline (§5.7): one option for every item, the plain decline for arrow items (`planGroupDecline`). */
export function declinePlan(items: readonly ItemView[], selected: readonly string[], option: DeclineOption) {
  return planGroupDecline(items.map(groupItemOf), selected, option);
}

/** An item's full label (core's `itemLabel`), or its id when the view no longer lists it. */
export function labelOf(items: readonly ItemView[], id: string): string {
  const item = items.find((i) => i.id === id);
  return item !== undefined ? itemLabel(item) : id;
}

/** One reason a group left an item, in core's words. */
export function leftReasonText(items: readonly ItemView[], left: { item: string; reason: string }): string {
  const item = items.find((i) => i.id === left.item);
  const label = labelOf(items, left.item);
  switch (left.reason as GroupLeftReason) {
    case 'own-accept':
      return item?.classes?.belief === false ? REVIEW_TEXTS.leftOwnAcceptProved(label) : REVIEW_TEXTS.leftOwnAccept(label);
    case 'depends': {
      const dependency = item?.dependsOn.find((d) => items.find((i) => i.id === d)?.status !== 'accepted');
      return dependency !== undefined ? REVIEW_TEXTS.leftDepends(label, labelOf(items, dependency)) : REVIEW_TEXTS.leftBlocked(label);
    }
    case 'hidden-result':
      return REVIEW_TEXTS.leftHiddenResult(label);
    case 'blocked':
      return REVIEW_TEXTS.leftBlocked(label);
    case 'not-in-review':
      return REVIEW_TEXTS.leftNotInReview(label);
    case 'needs-option':
      return REVIEW_TEXTS.leftNeedsOption(label);
    default:
      return `${label}: ${left.reason}`;
  }
}

/** "Left 2: ‹item› needs its own Accept (belief) · ‹item› depends on ‹item› (in review)", or null when none was left. */
export function leftNote(items: readonly ItemView[], left: ReadonlyArray<{ item: string; reason: string }>): string | null {
  return left.length === 0 ? null : REVIEW_TEXTS.leftNote(left.map((l) => leftReasonText(items, l)));
}

// ---------------------------------------------------------------------------------------------------------------
// The decline menu (§5.7)

export interface DeclineEntry {
  option: DeclineOption;
  label: string;
  /** What it does (an arrow's Decline; a Result's Reject and Shaky). */
  description?: string;
  /** It takes an optional note for Claude: every option but Transform (2j2, D2-92; until then Shaky only, D2-13). */
  note: boolean;
  /** Why it is not offered now (Transform until a later slice, D2-14). */
  disabled?: string;
}

const describe = (item: Pick<ItemView, 'kind'>, option: DeclineOption): string | undefined => {
  if (option === 'plain') return REVIEW_TEXTS.declineArrow;
  if (item.kind !== 'result') return undefined;
  if (option === 'reject') return REVIEW_TEXTS.rejectResult;
  if (option === 'shaky') return REVIEW_TEXTS.shakyResult;
  return undefined;
};

/**
 * One item's menu, from the options the host offers it (`ItemView.decline.options`): an arrow item's one "Decline"
 * (DO-0); a Result's Reject and Shaky; any other kind's Reject, Shaky and "Transform…", disabled. Each but Transform
 * takes a note for Claude (2j2, D2-92).
 */
export function declineEntries(item: Pick<ItemView, 'kind' | 'decline'>): DeclineEntry[] {
  return item.decline.options.map((o) => {
    const description = describe(item, o.option);
    return {
      option: o.option,
      label: DECLINE_OPTION_TEXTS[o.option],
      ...(description !== undefined ? { description } : {}),
      note: o.option !== 'transform',
      ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
    };
  });
}

/**
 * A group's menu (RV-8): only arrow items selected, their one plain "Decline"; else Reject, Shaky and "Transform…"
 * disabled (the plain decline still goes to the arrow items among them). One note for Claude, shared by the group, with
 * every option but Transform (2j2, D2-92).
 */
export function groupDeclineEntries(items: readonly ItemView[], selected: readonly string[]): DeclineEntry[] {
  const chosen = items.filter((i) => selected.includes(i.id));
  if (chosen.length > 0 && chosen.every(isArrow)) return [{ option: 'plain', label: DECLINE_OPTION_TEXTS.plain, description: REVIEW_TEXTS.declineArrow, note: true }];
  return [
    { option: 'reject', label: DECLINE_OPTION_TEXTS.reject, note: true },
    { option: 'shaky', label: DECLINE_OPTION_TEXTS.shaky, note: true },
    { option: 'transform', label: DECLINE_OPTION_TEXTS.transform, note: false, disabled: REVIEW_TEXTS.transformLater },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// The panel's other parts (§5.3, §5.4)

/** Builder 2g's word for an interrupted step's chip (`stepChips` has none: the window reloaded while it ran). */
export const STEP_CHIP_INTERRUPTED = 'interrupted';

const STEP_CHIP: Readonly<Record<StepView['state'], string>> = {
  queued: REVIEW_TEXTS.stepChips.queued,
  running: REVIEW_TEXTS.stepChips.running,
  ended: REVIEW_TEXTS.stepChips.ended,
  cancelled: REVIEW_TEXTS.stepChips.cancelled,
  failed: REVIEW_TEXTS.stepChips.failed,
  interrupted: STEP_CHIP_INTERRUPTED,
  'not-run': REVIEW_TEXTS.stepChips.notRun,
};

export interface InferenceLine {
  target: CardRef;
  /** "“T” ← 2 arrows" or "“T” ← follows from nothing", the target in its author's style. */
  parts: LabelPart[];
  /** The chip of its latest step: queued, running, ended, cancelled, failed, interrupted or not run. Never a verdict. */
  chip: string | null;
  state: StepView['state'] | null;
  /** Its Result item, once a step for it ended. */
  result?: string;
}

/** §5.3, "Formalize for dependencies": one line per target with its step chip. */
export function inferenceLines(session: Pick<SessionView, 'inferences' | 'steps'>): InferenceLine[] {
  return [...session.inferences]
    .sort((a, b) => a.order - b.order)
    .map((inf) => {
      const name = inf.target.sentence;
      const full = inf.fromNothing ? REVIEW_TEXTS.inferenceFromNothing(name) : REVIEW_TEXTS.inferenceArrows(name, inf.question.length);
      const step = [...session.steps].reverse().find((s) => s.target === inf.target.id);
      return {
        target: inf.target,
        parts: wordsIn(full, name, inf.target.wordedBy),
        chip: step !== undefined ? STEP_CHIP[step.state] : null,
        state: step?.state ?? null,
        ...(inf.result !== undefined ? { result: inf.result } : {}),
      };
    });
}

/** Builder 2g's verdict words (the plan quotes RV-1's three verdicts, not their line): never shown while hidden. */
export const VERDICT_TEXT: Readonly<Record<'established' | 'proved' | 'not-proved', string>> = {
  established: '✓ established',
  proved: 'proved, not established',
  'not-proved': 'not proved',
};

/** A verdict with its reason chip ("not proved · “L” was not proved"). */
export function verdictText(verdict: 'established' | 'proved' | 'not-proved', reasonChip?: string): string {
  return reasonChip !== undefined && reasonChip !== '' ? `${VERDICT_TEXT[verdict]} · ${reasonChip}` : VERDICT_TEXT[verdict];
}

/** A shown Result's flags in core's words; "proved from nothing" carries its hint (S18). */
export function flagTexts(flags: readonly (keyof typeof RESULT_FLAG_TEXTS)[]): string[] {
  return flags.map((f) => (f === 'proved-from-nothing' ? `${RESULT_FLAG_TEXTS[f]} (${PROVED_FROM_NOTHING_HINT})` : RESULT_FLAG_TEXTS[f]));
}

/** A card named by the board (its sentence), else by its id. */
export function cardName(nodes: Readonly<Record<string, TlNode>>, id: string): string {
  return nodes[id]?.naturalName ?? id;
}

/** A card as the board has it: its sentence and who worded it (D-15), else its id. */
export interface NamedCard {
  id: string;
  name: string;
  by: 'user' | 'agent';
}

export function namedCard(nodes: Readonly<Record<string, TlNode>>, id: string): NamedCard {
  const node = nodes[id];
  return { id, name: node?.naturalName ?? id, by: node?.provenance.wordedBy === 'agent' ? 'agent' : 'user' };
}

export interface ReportTargetLine {
  target: string;
  name: string;
  revealed: boolean;
  /** Shown only with the results (D2-10). */
  verdict?: string;
  band?: { used: Array<NamedCard & { status?: ItemStatus }>; complete: boolean; open: string[] };
  restsOn?: NamedCard[];
  /** "through ‹L›'s proof (this session)", ‹L› in its author's style. */
  throughResults?: LabelPart[][];
  notNeeded?: NamedCard[];
  missing?: Array<{ text: string; select?: { source: string; target: string } }>;
  /** Not proved: the gap in Claude's words (its Result's), and the board's hints on the cards it names (A10). */
  gap?: string;
  hints?: MissingArrowHint[];
  /** Its Result item, for the link. */
  result?: string;
}

/**
 * §5.4, the stage report's targets: while the results are hidden each reads "result after the review"; once shown,
 * the verdict line, the band (the host's: the arrows the proof uses, Claude's marked with their item's status), Rests
 * on with "through ‹L›'s proof (this session)", Not needed, and What is missing (the judgement's, each "select ‹card› →
 * ‹target› too" with its arrow); for a target not proved, the gap in Claude's words with `missingArrowHints` on it (the
 * cards the judgement's list names already left out).
 */
export function reportTargets(session: Pick<SessionView, 'report' | 'inferences' | 'board' | 'items'>): ReportTargetLine[] {
  const nodes = Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
  const name = (id: string) => session.inferences.find((i) => i.target.id === id)?.target.sentence ?? cardName(nodes, id);
  return session.report.targets.map((t) => {
    const result = session.inferences.find((i) => i.target.id === t.target)?.result;
    const base: ReportTargetLine = { target: t.target, name: name(t.target), revealed: t.revealed, ...(result !== undefined ? { result } : {}) };
    if (!t.revealed || t.verdict === undefined) return base;
    const claude = (source: string) => session.board.arrows.find((a) => a.change === 'add' && a.source === source && a.target === t.target)?.status;
    const detail = session.items.find((i) => i.id === result)?.detail;
    const gap = t.verdict === 'not-proved' && detail?.kind === 'result' && detail.revealed ? detail.gap : undefined;
    const named = new Set((t.missing ?? []).flatMap((m) => (m.select !== undefined ? [m.select.source] : [])));
    const question = session.inferences.find((i) => i.target.id === t.target)?.question.map((c) => c.id) ?? [];
    const hints = gap !== undefined ? missingArrowHints({ verdict: 'not-proved', gap, target: t.target }, question, nodes).filter((h) => !named.has(h.id)) : [];
    return {
      ...base,
      verdict: verdictText(t.verdict, t.reasonChip),
      ...(t.band !== undefined
        ? {
            band: {
              used: t.band.used.map((id) => {
                const status = claude(id);
                return { ...namedCard(nodes, id), ...(status !== undefined ? { status } : {}) };
              }),
              complete: t.band.complete,
              open: t.band.open,
            },
          }
        : {}),
      restsOn: (t.restsOn ?? []).map((id) => namedCard(nodes, id)),
      throughResults: (t.throughResults ?? []).map((id) => {
        const card = namedCard(nodes, id);
        return wordsIn(REVIEW_TEXTS.throughProof(`“${card.name}”`), card.name, card.by);
      }),
      notNeeded: (t.notNeeded ?? []).map((id) => namedCard(nodes, id)),
      missing: (t.missing ?? []).map((m) => ({ text: m.text, ...(m.select !== undefined ? { select: { source: m.select.source, target: m.select.target } } : {}) })),
      ...(gap !== undefined ? { gap, hints } : {}),
    };
  });
}

/** The report's summary line: "Stage N · K targets · results shown · consistency unchecked", or the hidden one. */
export function reportSummary(session: Pick<SessionView, 'stage' | 'report' | 'results'>): string {
  const targets = session.report.targets.length;
  return session.results.shown
    ? REVIEW_TEXTS.reportSummaryShown(session.stage, targets)
    : REVIEW_TEXTS.reportSummaryHidden(session.stage, targets, session.results.waitingFor.length);
}

/**
 * The items "Ask me instead" declines (RV-10, D2-13): those that rely on the choice when the report names them, else
 * the step's statement items (its Formalize, Add and Change items) that are listed and not declined.
 */
export function askMeItems(session: Pick<SessionView, 'items'>, step: string, named: readonly string[]): string[] {
  const listed = (id: string) => session.items.some((i) => i.id === id && i.status !== null && i.status !== 'declined' && i.status !== 'withdrawn');
  const own = named.filter(listed);
  if (own.length > 0) return own;
  return session.items
    .filter((i) => i.origin.step === step && (i.kind === 'formalize' || i.kind === 'add' || i.kind === 'change') && listed(i.id))
    .map((i) => i.id);
}

// ---------------------------------------------------------------------------------------------------------------
// The controls (§5.6, §5.13; D2-62)

/** D2-62: phases step and interrupted, while Claude's step runs (or would run on Resume). */
export function stepRunning(session: Pick<SessionView, 'phase'>): boolean {
  return session.phase === 'step' || session.phase === 'interrupted';
}

/** D2-62: why every review control is disabled now (Claude's step runs), or null. */
export function readOnlyReason(session: Pick<SessionView, 'phase'>): string | null {
  return stepRunning(session) ? REVIEW_TEXTS.stepRunning : null;
}

export interface Control {
  enabled: boolean;
  /** The tooltip, or why it is disabled (the gate's reason). */
  title: string;
}

const on = (title: string): Control => ({ enabled: true, title });
const off = (title: string): Control => ({ enabled: false, title });

/**
 * §5.6's footer: the item's own Accept and Accept & next (`own: true`), Decline ▾, Back to review (un-reject included),
 * from the host's gates. While Claude's step runs every one is disabled with D2-62's text; while a request is on its
 * way, with its own title. Accept on a not-proved Result: "Accept the outcome: “T” stays as it was".
 */
export function itemControls(item: ItemView, session: Pick<SessionView, 'phase'>, busy: boolean): { accept: Control; acceptNext: Control; decline: Control; review: Control } {
  const ro = readOnlyReason(session);
  if (ro !== null) return { accept: off(ro), acceptNext: off(ro), decline: off(ro), review: off(ro) };
  const detail = item.detail;
  const notProved = detail.kind === 'result' && detail.revealed && detail.verdict === 'not-proved';
  const acceptTitle = detail.kind === 'result' && notProved ? REVIEW_TEXTS.acceptNotProved(detail.target.sentence) : REVIEW_TEXTS.accept;
  const gate = (g: { ok: true } | { ok: false; reason: string }, title: string): Control => (g.ok ? (busy ? off(title) : on(title)) : off(g.reason));
  return {
    accept: gate(item.accept, acceptTitle),
    acceptNext: gate(item.accept, notProved ? acceptTitle : REVIEW_TEXTS.acceptAndNext),
    decline: gate(item.decline, REVIEW_TEXTS.declineMenu),
    review: gate(item.review, REVIEW_TEXTS.backToReview),
  };
}

export interface ListControls {
  /** "Accept N" / "Accept k of N" (`planGroupAccept`); disabled when it would take nothing, saying what it would leave. */
  acceptGroup: Control & { label: string };
  declineGroup: Control;
  /** Show results (a click only, D2-37), while the results are hidden. */
  showResults: Control;
  /** "Show Claude's activity": while the results are hidden it counts as Show results (D2-10). */
  activity: Control;
}

/** The list's and the panel's review controls (§5.3-5.5); D2-62 closes every one while Claude's step runs. */
export function listControls(session: SessionView, selected: readonly string[], busy: boolean): ListControls {
  const preview = acceptPreview(session.items, selected);
  const ro = readOnlyReason(session);
  if (ro !== null) return { acceptGroup: { ...off(ro), label: preview.label }, declineGroup: off(ro), showResults: off(ro), activity: off(ro) };
  const chosen = session.items.filter((i) => selected.includes(i.id));
  const reveal = session.phase === 'stage' && !session.results.shown;
  const left = leftNote(session.items, preview.left);
  return {
    acceptGroup: { ...(preview.take.length > 0 && !busy ? on(preview.label) : off(left ?? preview.label)), label: preview.label },
    declineGroup: chosen.some((i) => i.decline.ok) && !busy ? on(REVIEW_TEXTS.declineEllipsis) : off(REVIEW_TEXTS.declineEllipsis),
    showResults: reveal && !busy ? on(REVIEW_TEXTS.showResults) : off(REVIEW_TEXTS.showResults),
    activity: reveal && !busy ? on(REVIEW_TEXTS.showClaudesActivity) : off(REVIEW_TEXTS.showClaudesActivity),
  };
}

/** "Rejected in this session": Un-reject, from the host's gate (D2-62 first). */
export function unrejectControl(rejected: { unreject: { ok: true } | { ok: false; reason: string }; superseded: boolean }, session: Pick<SessionView, 'phase'>, busy: boolean): Control | null {
  if (rejected.superseded) return null;
  const ro = readOnlyReason(session);
  if (ro !== null) return off(ro);
  if (!rejected.unreject.ok) return off(rejected.unreject.reason);
  return busy ? off(REVIEW_TEXTS.backToReview) : on(REVIEW_TEXTS.backToReview);
}

/** "Ask me instead" (RV-10): it opens the decline menu, so D2-62 closes it too. */
export function askMeControl(session: SessionView, step: string, named: readonly string[], busy: boolean): Control {
  const ro = readOnlyReason(session);
  if (ro !== null) return off(ro);
  return askMeItems(session, step, named).length > 0 && !busy ? on(REVIEW_TEXTS.askMeInstead) : off(REVIEW_TEXTS.askMeInstead);
}

// ---------------------------------------------------------------------------------------------------------------
// Keys and layout (D2-37, §5.5)

export interface ReviewKeyEvent {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type ReviewKeyAction =
  | { kind: 'move'; to: 1 | -1 | 'first' | 'last' }
  | { kind: 'toggle-select' }
  /** The current item's own Accept (`own: true`); Shift+A is Accept & next. */
  | { kind: 'accept'; next: boolean }
  /** D on an arrow item: its plain decline, at once (DO-0). */
  | { kind: 'decline-now' }
  /** D on any other item: the decline menu. */
  | { kind: 'decline-menu' }
  /** R and S while the menu is open (T, Transform, is disabled: no key). */
  | { kind: 'menu-option'; option: 'reject' | 'shaky' }
  | { kind: 'open-detail' }
  /** Esc closes a menu, then clears the selection. */
  | { kind: 'escape' }
  | { kind: 'undo' }
  | { kind: 'redo' };

/**
 * D2-37, the review keys outside text fields: ↑/↓ Back/Next, Home/End, Space selects, A Accept, Shift+A Accept &
 * next, D declines (at once for an arrow item, else the menu, where R is Reject and S Shaky), Enter opens the detail,
 * Esc, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) on the session stack. There is no key for Show results: seeing a
 * result early is permanent, so it is a click only.
 */
export function reviewKey(event: ReviewKeyEvent, ctx: { item: Pick<ItemView, 'kind'> | null; menuOpen: boolean }): ReviewKeyAction | null {
  const key = event.key;
  if (event.ctrlKey === true || event.metaKey === true) {
    if (event.altKey === true) return null;
    const lower = key.toLowerCase();
    if (lower === 'z') return event.shiftKey === true ? { kind: 'redo' } : { kind: 'undo' };
    if (lower === 'y' && event.shiftKey !== true) return { kind: 'redo' };
    return null;
  }
  if (event.altKey === true) return null;
  switch (key) {
    case 'ArrowUp':
      return { kind: 'move', to: -1 };
    case 'ArrowDown':
      return { kind: 'move', to: 1 };
    case 'Home':
      return { kind: 'move', to: 'first' };
    case 'End':
      return { kind: 'move', to: 'last' };
    case ' ':
      return { kind: 'toggle-select' };
    case 'Enter':
      return { kind: 'open-detail' };
    case 'Escape':
      return { kind: 'escape' };
    default:
      break;
  }
  const lower = key.toLowerCase();
  if (lower === 'a' && ctx.item !== null) return { kind: 'accept', next: event.shiftKey === true };
  if (lower === 'd' && ctx.item !== null) return isArrow(ctx.item) ? { kind: 'decline-now' } : { kind: 'decline-menu' };
  if (ctx.menuOpen && lower === 'r') return { kind: 'menu-option', option: 'reject' };
  if (ctx.menuOpen && lower === 's') return { kind: 'menu-option', option: 'shaky' };
  return null;
}

/** From this panel width (px) the list and the detail sit side by side (§5.5). */
export const SPLIT_MIN_WIDTH = 640;

export type PaneMode = 'split' | 'list' | 'detail';

/** §5.5: side by side from 640 px; below that, the detail replaces the list ("◀ All items"), as the user chose. */
export function paneModeFor(width: number, pane: 'list' | 'detail'): PaneMode {
  return Number.isFinite(width) && width >= SPLIT_MIN_WIDTH ? 'split' : pane;
}
