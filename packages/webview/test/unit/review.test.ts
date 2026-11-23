/**
 * Slice 2g (docs/slice2-plan.md 5.3-5.7, 6.1): the review list's pure parts. The list keeps the host's order (every
 * item's listed dependencies before it, on every fixture), groups it, words statuses, badges and markers, previews
 * group decisions with core's planners, and maps keys (no key for Show results) and the panel width (640 px).
 */
import { planGroupAccept, REVIEW_TEXTS, type ItemView, type SessionView, type TlNode } from '@telelean/core';
import { describe, expect, it } from 'vitest';
import {
  acceptPreview,
  agentPhrases,
  askMeControl,
  askMeItems,
  countsText,
  cutLike,
  declineEntries,
  firstInReview,
  groupDeclineEntries,
  groupItemOf,
  inferenceLines,
  inReviewIds,
  itemBadges,
  itemControls,
  itemLabelParts,
  itemMarkers,
  labelOf,
  leftNote,
  listControls,
  markAgent,
  moveFrom,
  namedCard,
  paneModeFor,
  partsText,
  positionOf,
  redoLines,
  reportSummary,
  reportTargets,
  reviewKey,
  reviewRows,
  rowIds,
  rowOf,
  SPLIT_MIN_WIDTH,
  statusOf,
  STEP_CHIP_INTERRUPTED,
  unrejectControl,
  verdictText,
  wordsIn,
  type LabelPart,
} from '../../src/model/review';
import {
  allAcceptedStage,
  cardRef,
  closed,
  confirmingSession,
  firstQueue,
  hiddenStage,
  IDS,
  itemView,
  shownStage,
  stepSession,
  TARGET,
} from '../shared/sessions';

const nodesOf = (session: SessionView): Record<string, TlNode> => Object.fromEntries(session.board.graph.nodes.map((n) => [n.id, n]));
const rows = (session: SessionView, filter: 'all' | 'in-review' = 'all') => reviewRows(session.items, session.inferences, nodesOf(session), filter);
const FIXTURES: Array<[string, SessionView]> = [
  ['hidden', hiddenStage()],
  ['shown', shownStage()],
  ['all accepted', allAcceptedStage()],
  ['step', stepSession()],
  ['confirming', confirmingSession()],
  ['first queue', firstQueue()],
];

describe('the list (RV-2, §5.5)', () => {
  it('keeps the host’s order, grouped into runs of one group: a source card, Vocabulary (N) with "k of N accepted", Definitions, the target', () => {
    const groups = rows(shownStage({ vocab: 'accepted' }));
    expect(groups.map((g) => g.key)).toEqual(['vocabulary', 'card:pg-no-dark-past', 'definitions', `card:${TARGET}`]);
    expect(rowIds(groups)).toEqual(shownStage().items.map((i) => i.id));
    expect(partsText(groups[0]?.title ?? [])).toBe(REVIEW_TEXTS.vocabularyGroup(1));
    expect(groups[0]?.summary).toBe(REVIEW_TEXTS.vocabularyAccepted(1, 1));
    expect(partsText(groups[2]?.title ?? [])).toBe(REVIEW_TEXTS.definitionsGroup);
    expect(groups[3]).toMatchObject({ kind: 'card', target: true, onBoard: true });
    expect(groups[1]).toMatchObject({ kind: 'card', target: false, onBoard: true });
    // Within the target: its Add arrow, its Add premise, then its Result.
    expect(groups[3]?.rows.map((r) => r.id)).toEqual([IDS.arrow, IDS.premise, IDS.result]);
  });

  it('every item’s listed dependencies come before it, on every fixture (the host’s order is never changed)', () => {
    for (const [name, session] of FIXTURES) {
      const ids = rowIds(rows(session));
      expect(ids, name).toEqual(session.items.map((i) => i.id));
      for (const item of session.items) for (const dep of item.dependsOn) expect(ids.indexOf(dep), `${name}: ${item.id} after ${dep}`).toBeLessThan(ids.indexOf(item.id));
    }
  });

  it('a card off the board, and a group split by a hoisted dependency, keep their rows in order', () => {
    const off = itemView({ id: 'x1', kind: 'formalize', cards: [{ id: 'gone', type: 'PROPOSITION', sentence: 'Gone', wordedBy: 'user' }], detail: { kind: 'proof-broken', card: cardRef(TARGET), error: 'e' } });
    const v1 = itemView({ id: 'v1', kind: 'vocabulary-term', detail: { kind: 'vocabulary-term', name: 'A', vocabKind: 'sort', code: 'axiom A : Type' } });
    const v2 = itemView({ id: 'v2', kind: 'vocabulary-term', detail: { kind: 'vocabulary-term', name: 'B', vocabKind: 'sort', code: 'axiom B : Type' }, status: 'accepted' });
    const groups = reviewRows([v1, off, v2], [], nodesOf(hiddenStage()), 'all');
    expect(groups.map((g) => g.key)).toEqual(['vocabulary', 'card:gone', 'vocabulary']);
    expect(groups[1]?.onBoard).toBe(false);
    // Both runs of Vocabulary say N and k of all its terms.
    expect(groups.filter((g) => g.kind === 'vocabulary').map((g) => g.summary)).toEqual([REVIEW_TEXTS.vocabularyAccepted(1, 2), REVIEW_TEXTS.vocabularyAccepted(1, 2)]);
  });

  it('empty, one and many: no group, one group of one row, every row once', () => {
    expect(reviewRows([], [], {}, 'all')).toEqual([]);
    const one = [hiddenStage().items[0] as ItemView];
    expect(rowIds(reviewRows(one, [], {}, 'all'))).toEqual([IDS.vocab]);
    expect(rowIds(rows(shownStage()))).toHaveLength(6);
  });

  it('"Only in review" keeps the items in review (never a hidden Result); a group left empty is left out', () => {
    const session = shownStage({ vocab: 'accepted', definition: 'accepted' });
    const groups = rows(session, 'in-review');
    expect(groups.map((g) => g.key)).toEqual(['card:pg-no-dark-past', `card:${TARGET}`]);
    expect(rowIds(groups)).toEqual([IDS.formalize, IDS.arrow, IDS.premise, IDS.result]);
    expect(rowIds(rows(hiddenStage(), 'in-review'))).not.toContain(IDS.result);
  });

  it('a hidden Result is a neutral row: ◌ "result after the review", no status, no badge, not selectable', () => {
    const row = rows(hiddenStage()).flatMap((g) => g.rows).find((r) => r.id === IDS.result);
    expect(row).toMatchObject({ status: 'hidden', glyph: '◌', word: REVIEW_TEXTS.resultAfterReview, badges: [], markers: [], selectable: false });
    expect(partsText(row?.label ?? [])).toBe('Result “Cynder would not be a good addition to the new Spyro game”');
  });

  it('counts are the host’s listed items: "3 in review · 0 accepted · 0 declined" (+ "· 1 to be redone")', () => {
    expect(countsText(hiddenStage().counts)).toBe('3 in review · 0 accepted · 0 declined');
    expect(countsText({ inReview: 1, accepted: 5, declined: 1, toBeRedone: 1 })).toBe('1 in review · 5 accepted · 1 declined · 1 to be redone');
  });

  it('navigation: Back/Next stop at the ends, Home/End, an unknown current starts at an end; "4 of 12"', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveFrom(ids, 'b', 1)).toBe('c');
    expect(moveFrom(ids, 'c', 1)).toBe('c');
    expect(moveFrom(ids, 'a', -1)).toBe('a');
    expect(moveFrom(ids, 'b', 'first')).toBe('a');
    expect(moveFrom(ids, 'b', 'last')).toBe('c');
    expect(moveFrom(ids, 'zz', 1)).toBe('a');
    expect(moveFrom(ids, null, -1)).toBe('c');
    expect(moveFrom([], 'a', 1)).toBeNull();
    expect(moveFrom(['a'], 'a', 1)).toBe('a');
    expect(positionOf(ids, 'b')).toEqual({ index: 2, of: 3 });
    expect(positionOf(ids, 'zz')).toBeNull();
    expect(firstInReview(shownStage({ vocab: 'accepted' }).items)).toBe(IDS.formalize);
    expect(firstInReview(allAcceptedStage().items)).toBe(IDS.vocab);
    expect(firstInReview([])).toBeNull();
    expect(inReviewIds(hiddenStage().items)).toEqual([IDS.vocab, IDS.formalize, IDS.definition]);
  });
});

describe('statuses, badges, markers and labels (§5.5, provenance)', () => {
  it('status as glyph and word, never colour alone; a decline names its option', () => {
    const base = { declined: undefined };
    expect(statusOf({ ...base, status: 'in-review' })).toEqual({ status: 'in-review', glyph: '●', word: 'in review' });
    expect(statusOf({ ...base, status: 'accepted' })).toEqual({ status: 'accepted', glyph: '✓', word: 'accepted' });
    expect(statusOf({ status: 'declined', declined: { option: 'reject' } }).word).toBe('declined (Reject)');
    expect(statusOf({ status: 'declined', declined: { option: 'shaky', note: 'n' } }).word).toBe('declined (Shaky)');
    expect(statusOf({ status: 'declined', declined: { option: 'plain' } }).word).toBe('declined');
    expect(statusOf({ ...base, status: 'to-be-redone' })).toMatchObject({ glyph: '↻', word: 'to be redone' });
    expect(statusOf({ ...base, status: 'withdrawn' })).toMatchObject({ glyph: '–', word: 'withdrawn' });
  });

  it('2j1 (D2-76 D4): an item to be redone has core’s lines as its row’s tooltip, one per line; any other item none', () => {
    const one = REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoDependsOn('Definition Spyro.IsEvil', 'declined Shaky'));
    const two = REVIEW_TEXTS.redoLine(REVIEW_TEXTS.redoTookOut(REVIEW_TEXTS.redoReasonQueue));
    const vocab = (patch: Partial<ItemView>) => itemView({ id: IDS.vocab, kind: 'vocabulary-term', detail: { kind: 'vocabulary-term', name: 'Spyro.InGame', vocabKind: 'predicate', code: '' }, ...patch });
    // None, one and many lines.
    expect(rowOf(vocab({ status: 'to-be-redone', redo: { because: [], why: [] } })).title).toBeUndefined();
    expect(rowOf(vocab({ status: 'to-be-redone', redo: { because: [IDS.definition], why: [one] } })).title).toBe(one);
    expect(rowOf(vocab({ status: 'to-be-redone', redo: { because: [IDS.definition], why: [one, two] } })).title).toBe(`${one}\n${two}`);
    expect(redoLines(vocab({ status: 'to-be-redone', redo: { because: [IDS.definition], why: [one, two] } }))).toEqual([one, two]);
    // An item not to be redone has none, even if a `redo` came with it; a host that sent no `redo` gives none.
    expect(rowOf(vocab({ status: 'accepted', redo: { because: [], why: [one] } })).title).toBeUndefined();
    expect(redoLines(vocab({ status: 'to-be-redone' }))).toEqual([]);
    for (const [name, session] of FIXTURES) for (const item of session.items) if (item.status !== 'to-be-redone') expect(rowOf(item).title, name).toBeUndefined();
  });

  it('badges: belief, changes what is proved, depends on N; markers in core’s words', () => {
    const items = shownStage().items;
    const by = (id: string) => items.find((i) => i.id === id) as ItemView;
    expect(itemBadges(by(IDS.formalize))).toEqual(['belief', 'depends on 1']);
    expect(itemBadges(by(IDS.arrow))).toEqual(['changes what is proved']);
    expect(itemBadges(by(IDS.result))).toEqual(['changes what is proved', 'depends on 2']);
    expect(itemBadges(by(IDS.vocab))).toEqual([]);
    expect(itemMarkers(by(IDS.result))).toEqual(['you saw this result early']);
    expect(itemBadges(hiddenStage().items.find((i) => i.id === IDS.result) as ItemView)).toEqual([]);
  });

  it('labels carry provenance: the user’s sentences as the user’s, Claude’s (an Add premise, a card Claude worded) as Claude’s', () => {
    const items = shownStage().items;
    const parts = (id: string) => itemLabelParts(items.find((i) => i.id === id) as ItemView);
    const wordsOf = (p: LabelPart[]) => p.filter((x) => x.kind === 'words');
    expect(wordsOf(parts(IDS.formalize))).toEqual([{ kind: 'words', text: 'PG games cannot have characters with dark pasts', by: 'user' }]);
    expect(wordsOf(parts(IDS.premise))).toEqual([{ kind: 'words', text: 'Cynder is evil', by: 'agent' }]);
    expect(partsText(parts(IDS.arrow))).toBe('Add arrow “The new Spyro game is PG” → “Cynder would not be a good addition to the new Spyro game”');
    expect(parts(IDS.vocab)).toEqual([{ kind: 'text', text: 'Vocabulary term ' }, { kind: 'code', text: 'Spyro.InGame' }]);
    const agentCard = itemView({ id: 'n', kind: 'add', cards: [cardRef('new-spyro-pg', 'agent')], detail: { kind: 'add', card: cardRef('new-spyro-pg', 'agent'), fields: [] } });
    expect(wordsOf(itemLabelParts(agentCard))[0]).toMatchObject({ by: 'agent' });
    expect(itemLabelParts({ label: 'Delete', kind: 'delete', cards: [], detail: { kind: 'delete', card: cardRef(TARGET), arrows: [], mentionedBy: [] } })).toEqual([{ kind: 'text', text: 'Delete' }]);
  });

  it('a phrase of Claude’s is marked only as a whole piece of text, never inside the user’s word (F-V2G-FC-4)', () => {
    expect(markAgent('The name IsEvil is the user’s', ['Evil'])).toEqual([{ kind: 'text', text: 'The name IsEvil is the user’s' }]);
    expect(markAgent('Darkness and Dark', ['Dark'])).toEqual([
      { kind: 'text', text: 'Darkness and ' },
      { kind: 'words', text: 'Dark', by: 'agent' },
    ]);
    // The first whole match wins when an earlier occurrence sits inside a word.
    expect(markAgent('IsEvil, Evil, EvilTwin', ['Evil'])).toEqual([
      { kind: 'text', text: 'IsEvil, ' },
      { kind: 'words', text: 'Evil', by: 'agent' },
      { kind: 'text', text: ', EvilTwin' },
    ]);
    expect(markAgent('“Evil”', ['Evil'])[1]).toEqual({ kind: 'words', text: 'Evil', by: 'agent' });
    // Accented and digit neighbours are word characters too; a phrase that ends in "…" or punctuation needs no boundary after it.
    expect(markAgent('éEvil Evil9', ['Evil'])).toEqual([{ kind: 'text', text: 'éEvil Evil9' }]);
    expect(markAgent('Long phrase…x', ['Long phrase…'])).toEqual([{ kind: 'words', text: 'Long phrase…', by: 'agent' }, { kind: 'text', text: 'x' }]);
  });

  it('Claude’s phrases in the host’s texts are marked as Claude’s (D-15): whole, cut as labels cut them, several, none', () => {
    const session = shownStage();
    const phrases = agentPhrases(session);
    expect(phrases).toContain('Cynder is evil');
    expect(agentPhrases(hiddenStage())).toEqual([]); // no premise, no card Claude worded is listed
    const note = REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Add premise “Cynder is evil”'), REVIEW_TEXTS.leftBlocked('Formalize “PG games cannot have characters with dark pasts”')]);
    const marked = markAgent(note, phrases);
    expect(partsText(marked)).toBe(note);
    expect(marked.filter((p) => p.kind === 'words')).toEqual([{ kind: 'words', text: 'Cynder is evil', by: 'agent' }]);
    expect(markAgent('', phrases)).toEqual([]);
    expect(markAgent('nothing of Claude here', phrases)).toEqual([{ kind: 'text', text: 'nothing of Claude here' }]);
    // The earliest phrase first, whatever the order of the list (a shorter one before a longer one).
    expect(markAgent('short then a much longer phrase', ['a much longer phrase', 'short'])).toEqual([
      { kind: 'words', text: 'short', by: 'agent' },
      { kind: 'text', text: ' then ' },
      { kind: 'words', text: 'a much longer phrase', by: 'agent' },
    ]);
    expect(markAgent('Cynder is evil, Cynder is evil', ['Cynder is evil'])).toEqual([
      { kind: 'words', text: 'Cynder is evil', by: 'agent' },
      { kind: 'text', text: ', ' },
      { kind: 'words', text: 'Cynder is evil', by: 'agent' },
    ]);
    // A long sentence Claude worded is found as core's labels cut it (60) and as the board's hints do (40).
    const long = 'A character whose past includes a long list of dark and terrible deeds';
    const agentCard = itemView({ id: 'n', kind: 'add', cards: [cardRef('new-spyro-pg', 'agent')], detail: { kind: 'add', card: cardRef('new-spyro-pg', 'agent'), fields: [] } });
    const withLong = { ...session, items: [...session.items, { ...agentCard, cards: [{ ...cardRef('new-spyro-pg', 'agent'), sentence: long }] }] };
    const cut = cutLike(long, 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(markAgent(`Add “${cut}”`, agentPhrases(withLong)).find((p) => p.kind === 'words')).toEqual({ kind: 'words', text: cut, by: 'agent' });
    expect(cutLike(' a  b ', 60)).toBe('a b');
  });

  it('wordsIn splits core’s text around the name it embeds (empty, at the start, at the end, absent)', () => {
    expect(wordsIn('“T” ← 2 arrows', 'T', 'user')).toEqual([{ kind: 'text', text: '“' }, { kind: 'words', text: 'T', by: 'user' }, { kind: 'text', text: '” ← 2 arrows' }]);
    expect(wordsIn('T first', 'T', 'agent')).toEqual([{ kind: 'words', text: 'T', by: 'agent' }, { kind: 'text', text: ' first' }]);
    expect(wordsIn('ends with T', 'T', 'user')).toEqual([{ kind: 'text', text: 'ends with ' }, { kind: 'words', text: 'T', by: 'user' }]);
    expect(wordsIn('no name', 'T', 'user')).toEqual([{ kind: 'text', text: 'no name' }]);
    expect(wordsIn('x', '', 'user')).toEqual([{ kind: 'text', text: 'x' }]);
  });
});

describe('group decisions (RV-8): previews with core’s planners, the note on what was left', () => {
  it('"Accept N", or "Accept k of N" when the rules leave some: an RV-7 item, a dependency not taken; a dependency in the group is taken', () => {
    const items = shownStage().items;
    expect(acceptPreview(items, [IDS.vocab]).label).toBe(REVIEW_TEXTS.acceptN(1));
    // The Formalize is a belief (own Accept): left; the vocabulary term is taken.
    const p = acceptPreview(items, [IDS.vocab, IDS.formalize]);
    expect(p.take).toEqual([IDS.vocab]);
    expect(p.label).toBe(REVIEW_TEXTS.acceptKOfN(1, 2));
    expect(p.left).toEqual([{ item: IDS.formalize, reason: 'own-accept' }]);
    // A plain item that depends on one in the same group is taken with it.
    const a = itemView({ id: 'a', kind: 'vocabulary-term', detail: { kind: 'vocabulary-term', name: 'A', vocabKind: 'sort', code: 'a' } });
    const b = itemView({ id: 'b', kind: 'vocabulary-term', dependsOn: ['a'], detail: { kind: 'vocabulary-term', name: 'B', vocabKind: 'sort', code: 'b' }, accept: closed('needs a', ['a']) });
    expect(acceptPreview([a, b], ['a', 'b']).take).toEqual(['a', 'b']);
    expect(acceptPreview([a, b], ['b']).take).toEqual([]);
    expect(acceptPreview([a, b], []).label).toBe(REVIEW_TEXTS.acceptN(0));
  });

  it('the GroupItem of an item: own Accept by class, hidden, blocked as the host says (ItemView.blocked; builder 2h, F-V2G-FC-9), arrow', () => {
    const hidden = hiddenStage().items.find((i) => i.id === IDS.result) as ItemView;
    expect(groupItemOf(hidden)).toMatchObject({ hidden: true, ownAccept: false, status: null, blocked: false });
    const shown = shownStage().items;
    expect(groupItemOf(shown.find((i) => i.id === IDS.arrow) as ItemView)).toMatchObject({ arrow: true, ownAccept: true, blocked: false });
    expect(groupItemOf(shown.find((i) => i.id === IDS.result) as ItemView).blocked).toBe(false);
    // The host's `blocked` (core reducer's groupItemOf, on its records), never a guess from the own Accept's gate.
    const didNotPass = itemView({ id: 'x', kind: 'formalize', detail: shown[1]?.detail as ItemView['detail'], accept: closed(REVIEW_TEXTS.acceptDidNotPass), blocked: true });
    expect(groupItemOf(didNotPass).blocked).toBe(true);
    const { blocked: _drop, ...noFlag } = didNotPass;
    expect(groupItemOf(noFlag).blocked).toBe(false);
  });

  it('carry-over F-V2G-FC-9: an item that waits for a hidden item and has a dependency in review: "blocked", as the host plans it', () => {
    // c waits for the results (the host's GroupItem: blocked) and depends on a, in review: its gate names the missing
    // dependency, so fixer 2g r1's guess from the gate said "depends" (and took c with a); the host leaves it, blocked.
    const a = itemView({ id: 'a', kind: 'vocabulary-term', detail: { kind: 'vocabulary-term', name: 'A', vocabKind: 'sort', code: 'a' } });
    const c = itemView({ id: 'c', kind: 'vocabulary-term', dependsOn: ['a'], detail: { kind: 'vocabulary-term', name: 'C', vocabKind: 'sort', code: 'c' }, accept: closed('needs a', ['a']), blocked: true });
    const items = [a, c];
    const both = acceptPreview(items, ['a', 'c']);
    expect(both).toMatchObject({ take: ['a'], left: [{ item: 'c', reason: 'blocked' }], label: REVIEW_TEXTS.acceptKOfN(1, 2) });
    expect(leftNote(items, both.left)).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftBlocked(labelOf(items, 'c'))]));
    expect(acceptPreview(items, ['c']).left).toEqual([{ item: 'c', reason: 'blocked' }]);
    // The preview is the host's plan: core planGroupAccept on the GroupItems core's reducer builds (blocked included).
    const host = items.map((i) => ({ id: i.id, status: i.status, dependsOn: i.dependsOn, ownAccept: false, hidden: false, blocked: i.blocked === true, arrow: false }));
    expect(both.left).toEqual(planGroupAccept(host, ['a', 'c']).left);
    // Once the host no longer says blocked (the results shown), c goes with its dependency, or waits for it alone.
    const { blocked: _gone, ...free } = c;
    expect(acceptPreview([a, free], ['a', 'c'])).toMatchObject({ take: ['a', 'c'], left: [], label: REVIEW_TEXTS.acceptN(2) });
    expect(acceptPreview([a, free], ['c']).left).toEqual([{ item: 'c', reason: 'depends' }]);
  });

  it('the note lists what was left, in core’s words, for every reason', () => {
    const items = shownStage().items;
    const label = (id: string) => (id === IDS.formalize ? 'Formalize “PG games cannot have characters with dark pasts”' : id);
    expect(leftNote(items, [])).toBeNull();
    expect(leftNote(items, [{ item: IDS.formalize, reason: 'own-accept' }])).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept(label(IDS.formalize))]));
    const arrowLabel = 'Add arrow “The new Spyro game is PG” → “Cynder would not be a good addition to the new Spyro game”';
    expect(leftNote(items, [{ item: IDS.arrow, reason: 'own-accept' }])).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAcceptProved(arrowLabel)]));
    const resultLabel = 'Result “Cynder would not be a good addition to the new Spyro game”';
    expect(leftNote(items, [{ item: IDS.result, reason: 'depends' }])).toBe(REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftDepends(resultLabel, label(IDS.formalize))]));
    const reasons: Array<[string, (l: string) => string]> = [
      ['hidden-result', REVIEW_TEXTS.leftHiddenResult],
      ['blocked', REVIEW_TEXTS.leftBlocked],
      ['not-in-review', REVIEW_TEXTS.leftNotInReview],
      ['needs-option', REVIEW_TEXTS.leftNeedsOption],
    ];
    for (const [reason, text] of reasons) expect(leftNote(items, [{ item: IDS.formalize, reason }])).toBe(REVIEW_TEXTS.leftNote([text(label(IDS.formalize))]));
    // Two reasons, joined by " · "; an item the view no longer lists is named by its id.
    expect(leftNote(items, [{ item: 'gone', reason: 'blocked' }, { item: IDS.formalize, reason: 'own-accept' }])).toBe(
      `Left 2: ${REVIEW_TEXTS.leftBlocked('gone')} · ${REVIEW_TEXTS.leftOwnAccept(label(IDS.formalize))}`,
    );
  });

  it('the decline menu (§5.7): an arrow’s one Decline; a Result’s Reject and Shaky; others Reject, Shaky, Transform disabled; every option but Transform takes a note (2j2, D2-92)', () => {
    const items = shownStage().items;
    const by = (id: string) => items.find((i) => i.id === id) as ItemView;
    expect(declineEntries(by(IDS.arrow))).toEqual([{ option: 'plain', label: 'Decline', description: REVIEW_TEXTS.declineArrow, note: true }]);
    expect(declineEntries(by(IDS.result))).toEqual([
      { option: 'reject', label: 'Reject', description: REVIEW_TEXTS.rejectResult, note: true },
      { option: 'shaky', label: 'Shaky', description: REVIEW_TEXTS.shakyResult, note: true },
    ]);
    expect(declineEntries(by(IDS.formalize))).toEqual([
      { option: 'reject', label: 'Reject', note: true },
      { option: 'shaky', label: 'Shaky', note: true },
      { option: 'transform', label: 'Transform…', note: false, disabled: REVIEW_TEXTS.transformLater },
    ]);
    expect(groupDeclineEntries(items, [IDS.arrow])).toEqual([{ option: 'plain', label: 'Decline', description: REVIEW_TEXTS.declineArrow, note: true }]);
    expect(groupDeclineEntries(items, [IDS.arrow, IDS.formalize]).map((e) => [e.option, e.disabled !== undefined, e.note])).toEqual([
      ['reject', false, true],
      ['shaky', false, true],
      ['transform', true, false],
    ]);
    // The confirm button's words, one per option.
    expect(['reject', 'shaky', 'plain'].map((o) => REVIEW_TEXTS.declineConfirm(o as 'reject'))).toEqual(['Decline (Reject)', 'Decline (Shaky)', 'Decline']);
  });
});

describe('the panel’s parts (§5.3, §5.4)', () => {
  it('Inferences: "“T” ← 2 arrows" or "← follows from nothing", with the latest step’s chip, never a verdict', () => {
    const lines = inferenceLines(shownStage());
    expect(lines).toHaveLength(1);
    expect(partsText(lines[0]?.parts ?? [])).toBe(REVIEW_TEXTS.inferenceArrows('Cynder would not be a good addition to the new Spyro game', 2));
    expect(lines[0]?.parts.find((p) => p.kind === 'words')).toMatchObject({ by: 'user' });
    expect(lines[0]?.chip).toBe('ended');
    const step = inferenceLines(stepSession())[0];
    expect(step?.chip).toBe('queued'); // the latest step of the target (s3, queued after s2)
    const fromNothing = hiddenStage({ inferences: [{ ...hiddenStage().inferences[0]!, question: [], fromNothing: true }] });
    expect(partsText(inferenceLines(fromNothing)[0]?.parts ?? [])).toBe(REVIEW_TEXTS.inferenceFromNothing('Cynder would not be a good addition to the new Spyro game'));
    const interrupted = hiddenStage({ steps: [{ ...hiddenStage().steps[0]!, state: 'interrupted' }] });
    expect(inferenceLines(interrupted)[0]?.chip).toBe(STEP_CHIP_INTERRUPTED);
    expect(inferenceLines(hiddenStage({ steps: [{ ...hiddenStage().steps[0]!, state: 'not-run' }] }))[0]?.chip).toBe('not run');
    expect(inferenceLines(hiddenStage({ steps: [] }))[0]?.chip).toBeNull();
    for (const [, s] of FIXTURES) for (const l of inferenceLines(s)) expect(partsText(l.parts)).not.toMatch(/proved|established/);
  });

  it('the report: while hidden each target reads no verdict and the summary counts what to decide; once shown its verdict, band (Claude’s arrow with its status) and Rests on', () => {
    expect(reportSummary(hiddenStage())).toBe(REVIEW_TEXTS.reportSummaryHidden(1, 1, 2));
    expect(reportSummary(shownStage())).toBe(REVIEW_TEXTS.reportSummaryShown(1, 1));
    expect(reportTargets(hiddenStage())).toEqual([{ target: TARGET, name: 'Cynder would not be a good addition to the new Spyro game', revealed: false, result: IDS.result }]);
    // Defence in depth: a target the report marks unrevealed shows no verdict, whatever else it carries.
    const leaky = hiddenStage({ report: { ...hiddenStage().report, targets: [{ target: TARGET, revealed: false, verdict: 'established' }] } });
    expect(reportTargets(leaky)[0]?.verdict).toBeUndefined();
    const shown = reportTargets(shownStage())[0];
    expect(shown?.verdict).toBe('✓ established');
    expect(shown?.band?.used).toEqual([
      { id: 'cynder-dark-past', name: 'Cynder is a character who has a dark past', by: 'user' },
      { id: 'pg-no-dark-past', name: 'PG games cannot have characters with dark pasts', by: 'user' },
      { id: 'new-spyro-pg', name: 'The new Spyro game is PG', by: 'user', status: 'in-review' },
    ]);
    expect(shown?.restsOn).toHaveLength(3);
    expect(verdictText('not-proved', '“L” was not proved')).toBe('not proved · “L” was not proved');
    expect(verdictText('proved')).toBe('proved, not established');
    const through = shownStage({}, { report: { ...shownStage().report, targets: [{ ...shownStage().report.targets[0]!, throughResults: ['pg-no-dark-past'] }] } });
    const parts = reportTargets(through)[0]?.throughResults ?? [];
    expect(parts.map(partsText)).toEqual([REVIEW_TEXTS.throughProof('“PG games cannot have characters with dark pasts”')]);
    expect(parts[0]?.find((p) => p.kind === 'words')).toEqual({ kind: 'words', text: 'PG games cannot have characters with dark pasts', by: 'user' });
  });

  it('a card the board names carries who worded it', () => {
    const graph = shownStage().board.graph;
    const nodes = Object.fromEntries(graph.nodes.map((n) => [n.id, { ...n, provenance: { ...n.provenance, wordedBy: n.id === 'new-spyro-pg' ? ('agent' as const) : n.provenance.wordedBy } }]));
    expect(namedCard(nodes, 'new-spyro-pg')).toEqual({ id: 'new-spyro-pg', name: 'The new Spyro game is PG', by: 'agent' });
    expect(namedCard(nodes, 'pg-no-dark-past').by).toBe('user');
    expect(namedCard(nodes, 'gone')).toEqual({ id: 'gone', name: 'gone', by: 'user' });
  });

  it('a target not proved: the gap in Claude’s words with the board’s hints (a card the judgement’s list names left out); none for a proved one', () => {
    const base = shownStage();
    const notProved = (missing: Array<{ text: string; select?: { source: string; target: string } }>) =>
      shownStage(
        {},
        {
          items: base.items.map((i) =>
            i.id === IDS.result && i.detail.kind === 'result' && i.detail.revealed ? { ...i, detail: { ...i.detail, verdict: 'not-proved' as const, gap: 'It needs new-spyro-pg.' } } : i,
          ),
          report: { ...base.report, targets: [{ ...base.report.targets[0]!, verdict: 'not-proved', missing }] },
        },
      );
    const line = reportTargets(notProved([]))[0];
    expect(line?.gap).toBe('It needs new-spyro-pg.');
    expect(line?.hints).toEqual([{ id: 'new-spyro-pg', kind: 'select', text: 'Select “The new Spyro game is PG” → “Cynder would not be a good addition to …” too.' }]);
    const named = reportTargets(notProved([{ text: REVIEW_TEXTS.selectTooHint('x', 'y'), select: { source: 'new-spyro-pg', target: TARGET } }]))[0];
    expect(named?.hints).toEqual([]);
    expect(named?.missing).toEqual([{ text: REVIEW_TEXTS.selectTooHint('x', 'y'), select: { source: 'new-spyro-pg', target: TARGET } }]);
    expect(reportTargets(shownStage())[0]?.gap).toBeUndefined();
    expect(reportTargets(hiddenStage())[0]?.hints).toBeUndefined();
  });

  it('Ask me instead declines the items the choice names, else the step’s statement items that are listed and not declined', () => {
    const session = shownStage();
    expect(askMeItems(session, 's1', [])).toEqual([IDS.formalize]);
    expect(askMeItems(session, 's1', [IDS.definition])).toEqual([IDS.definition]);
    expect(askMeItems(shownStage({ formalize: 'declined' }), 's1', [])).toEqual([]);
    expect(askMeItems(session, 's9', [])).toEqual([]);
    // A named item that is a hidden Result is not offered.
    expect(askMeItems(hiddenStage(), 's1', [IDS.result])).toEqual([IDS.formalize]);
  });
});

describe('read-only while a step runs (D2-62): every review control is disabled with its text', () => {
  it('item, list, Un-reject and Ask me instead controls in phases step and interrupted', () => {
    for (const session of [stepSession(), stepSession({ phase: 'interrupted' })]) {
      for (const item of session.items) for (const control of Object.values(itemControls(item, session, false))) expect(control).toEqual({ enabled: false, title: REVIEW_TEXTS.stepRunning });
      const list = listControls(session, session.items.map((i) => i.id), false);
      for (const control of [list.acceptGroup, list.declineGroup, list.showResults, list.activity]) expect(control).toMatchObject({ enabled: false, title: REVIEW_TEXTS.stepRunning });
      expect(unrejectControl({ unreject: { ok: true }, superseded: false }, session, false)).toEqual({ enabled: false, title: REVIEW_TEXTS.stepRunning });
      expect(askMeControl(session, 's1', [], false)).toEqual({ enabled: false, title: REVIEW_TEXTS.stepRunning });
    }
  });

  it('while a step runs they are closed even where a gate the host sent is open (defence in depth)', () => {
    const session = stepSession();
    const open = { ...(session.items[0] as ItemView), accept: { ok: true as const }, decline: { ok: true as const, options: [] }, review: { ok: true as const } };
    for (const control of Object.values(itemControls(open, session, false))) expect(control).toEqual({ enabled: false, title: REVIEW_TEXTS.stepRunning });
  });

  it('in a stage they follow the host’s gates, and a request on its way disables them', () => {
    const session = shownStage();
    const formalize = session.items.find((i) => i.id === IDS.formalize) as ItemView;
    expect(itemControls(formalize, session, false).accept).toEqual({ enabled: false, title: (formalize.accept as { reason: string }).reason });
    const vocab = session.items.find((i) => i.id === IDS.vocab) as ItemView;
    expect(itemControls(vocab, session, false)).toEqual({
      accept: { enabled: true, title: 'Accept' },
      acceptNext: { enabled: true, title: 'Accept & next' },
      decline: { enabled: true, title: 'Decline ▾' },
      review: { enabled: false, title: REVIEW_TEXTS.inReviewAlready('Vocabulary term') },
    });
    expect(itemControls(vocab, session, true).accept.enabled).toBe(false);
    const list = listControls(session, [IDS.vocab, IDS.formalize], false);
    expect(list.acceptGroup).toEqual({ enabled: true, title: REVIEW_TEXTS.acceptKOfN(1, 2), label: REVIEW_TEXTS.acceptKOfN(1, 2) });
    // Nothing it would take: disabled, saying what it would leave.
    expect(listControls(session, [IDS.formalize], false).acceptGroup).toMatchObject({ enabled: false, title: REVIEW_TEXTS.leftNote([REVIEW_TEXTS.leftOwnAccept('Formalize “PG games cannot have characters with dark pasts”')]) });
    expect(list.showResults.enabled).toBe(false); // shown already
    expect(listControls(hiddenStage(), [], false).showResults.enabled).toBe(true);
    expect(listControls(hiddenStage(), [], true).showResults.enabled).toBe(false);
    expect(unrejectControl({ unreject: { ok: true }, superseded: true }, session, false)).toBeNull();
    expect(unrejectControl({ unreject: closed('newer') as { ok: false; reason: string }, superseded: false }, session, false)).toEqual({ enabled: false, title: 'newer' });
  });

  it('Accept on a not-proved Result says it keeps the target as it was', () => {
    const session = shownStage();
    const result = session.items.find((i) => i.id === IDS.result) as ItemView;
    const notProved = { ...result, accept: { ok: true as const }, detail: { ...(result.detail as Extract<ItemView['detail'], { revealed: true }>), verdict: 'not-proved' as const } };
    expect(itemControls(notProved, session, false).accept.title).toBe(REVIEW_TEXTS.acceptNotProved('Cynder would not be a good addition to the new Spyro game'));
  });
});

describe('keys (D2-37) and the panes (§5.5)', () => {
  const arrow = { kind: 'add-arrow' as const };
  const formalize = { kind: 'formalize' as const };
  it('maps every review key; D declines an arrow at once and opens the menu for any other item; R and S only in the menu', () => {
    const k = (key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}, item: { kind: ItemView['kind'] } | null = formalize, menuOpen = false) =>
      reviewKey({ key, ...mods }, { item, menuOpen });
    expect(k('ArrowUp')).toEqual({ kind: 'move', to: -1 });
    expect(k('ArrowDown')).toEqual({ kind: 'move', to: 1 });
    expect(k('Home')).toEqual({ kind: 'move', to: 'first' });
    expect(k('End')).toEqual({ kind: 'move', to: 'last' });
    expect(k(' ')).toEqual({ kind: 'toggle-select' });
    expect(k('a')).toEqual({ kind: 'accept', next: false });
    expect(k('A', { shiftKey: true })).toEqual({ kind: 'accept', next: true });
    expect(k('d', {}, arrow)).toEqual({ kind: 'decline-now' });
    expect(k('d')).toEqual({ kind: 'decline-menu' });
    expect(k('r')).toBeNull();
    expect(k('r', {}, formalize, true)).toEqual({ kind: 'menu-option', option: 'reject' });
    expect(k('s', {}, formalize, true)).toEqual({ kind: 'menu-option', option: 'shaky' });
    expect(k('t', {}, formalize, true)).toBeNull();
    expect(k('Enter')).toEqual({ kind: 'open-detail' });
    expect(k('Escape')).toEqual({ kind: 'escape' });
    expect(k('z', { ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(k('Z', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(k('y', { ctrlKey: true })).toEqual({ kind: 'redo' });
    expect(k('z', { metaKey: true })).toEqual({ kind: 'undo' });
    expect(k('z', { ctrlKey: true, altKey: true })).toBeNull();
    expect(k('a', { altKey: true })).toBeNull();
    expect(k('a', {}, null)).toBeNull();
    expect(k('d', {}, null)).toBeNull();
  });

  it('there is no key for Show results: no key, with any modifier, maps to a reveal', () => {
    const keys = [...'abcdefghijklmnopqrstuvwxyz0123456789', 'Enter', ' ', 'F5', 'Tab'];
    for (const key of keys)
      for (const mods of [{}, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { ctrlKey: true, shiftKey: true }])
        for (const menuOpen of [false, true]) {
          const action = reviewKey({ key, ...mods }, { item: formalize, menuOpen });
          expect(['move', 'toggle-select', 'accept', 'decline-now', 'decline-menu', 'menu-option', 'open-detail', 'escape', 'undo', 'redo', undefined]).toContain(action?.kind);
        }
  });

  it('paneModeFor: side by side from 640 px; below, the pane the user chose (the list by default)', () => {
    expect(SPLIT_MIN_WIDTH).toBe(640);
    expect(paneModeFor(640, 'list')).toBe('split');
    expect(paneModeFor(1200, 'detail')).toBe('split');
    expect(paneModeFor(639, 'list')).toBe('list');
    expect(paneModeFor(639, 'detail')).toBe('detail');
    expect(paneModeFor(0, 'list')).toBe('list');
    expect(paneModeFor(Number.NaN, 'detail')).toBe('detail');
  });
});
