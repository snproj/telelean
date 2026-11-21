/**
 * Spec v4 slice 1b (docs/slice1-plan.md 2.4): the arrow actions as plans, through the real markup primitives:
 * add-arrows, remove-arrows, set-from-nothing, claim-pending and move-cards. Each is one plan (one Undo step, one
 * History entry), with its label; refusals (cycles over drawn and verified arrows, another subject, a self-arrow, an
 * unknown id, ...) and the needs-confirmation answers (an axiom with glowing dependents becomes pending, AR-6 and
 * A15; a removed arrow that a proof uses, A16). Also: an old axiom's `premises:` (A19, TL122) and the board's graph.
 */
import { describe, expect, it } from 'vitest';
import { ActionError, type BoardAction, type EditPlan } from '../../src/actions.js';
import { planAction, type PlanContext } from '../../src/edit/index.js';
import { kindChangeImpact } from '../../src/kindChange.js';
import { emptyLayout, type Layout } from '../../src/layout.js';
import type { ProjectModel } from '../../src/project/index.js';
import { AXIOM_PREMISES_MESSAGE } from '../../src/project/build.js';
import { block, build, codes, graphOf, mainS, nodeOf, VOCAB_S } from '../project/helpers/build.js';

const MAIN = 'Model/S/Main.lean';

const BODY = [
  block({ id: 'a1', type: 'AXIOM', name: 'A1 holds', rationale: 'r', lean: 'S.a1' }),
  'abbrev a1 : Prop := Good t',
  'axiom a1.holds : a1',
  '',
  block({ id: 'a2', type: 'AXIOM', name: 'A2 holds', rationale: 'r', lean: 'S.a2' }),
  'abbrev a2 : Prop := Bad t',
  'axiom a2.holds : a2',
  '',
  block({ id: 'a0', type: 'AXIOM', name: 'A0 has no holds', rationale: 'r', lean: 'S.a0' }),
  'abbrev a0 : Prop := Good t ∧ Good t',
  '',
  block({ id: 'ap', type: 'AXIOM', name: 'AP has a proof', rationale: 'r', lean: 'S.ap' }),
  'abbrev ap : Prop := Good t',
  'theorem ap.holds : ap := a1.holds',
  '',
  block({ id: 'legacy', type: 'ASSUMPTION', name: 'Legacy axiom with premises', rationale: 'r', premises: ['a2'], lean: 'S.lg' }),
  'abbrev lg : Prop := Bad t',
  'axiom lg.holds : lg',
  '',
  block({ id: 'p1', type: 'PROPOSITION', name: 'P1 proved from A1', premises: ['a1'], lean: 'S.p1' }),
  'abbrev p1 : Prop := Good t',
  'theorem p1.holds : p1 := a1.holds',
  '',
  block({ id: 'p2', type: 'PROPOSITION', name: 'P2 proved from P1', premises: ['p1'], lean: 'S.p2' }),
  'abbrev p2 : Prop := Good t',
  'theorem p2.holds : p2 := p1.holds',
  '',
  block({ id: 'p3', type: 'PROPOSITION', name: 'P3 unproved', lean: 'S.p3' }),
  'abbrev p3 : Prop := Good t ∧ Bad t',
  '',
  block({ id: 'p4', type: 'PROPOSITION', name: 'P4 code-less' }),
  '',
  block({ id: 'p5', type: 'PROPOSITION', name: 'P5 declares two', premises: ['a1', 'a2'] }),
  '',
  block({ id: 'p6', type: 'PROPOSITION', name: 'P6 declares A2', premises: ['a2'] }),
  '',
  block({ id: 'pf', type: 'PROPOSITION', name: 'PF from nothing', followsFrom: 'nothing', lean: 'S.pf' }),
  'abbrev pf : Prop := Good t',
  '',
  block({ id: 'pp', type: 'PROPOSITION', name: 'PP pending', lean: 'S.pp' }),
  'abbrev pp : Prop := Bad t',
  'axiom pp.holds : pp',
  '',
  block({ id: 'pu', type: 'PROPOSITION', name: 'PU uses A2 without an arrow', lean: 'S.pu' }),
  'abbrev pu : Prop := Bad t',
  'theorem pu.holds : pu := a2.holds',
  '',
  block({ id: 'c1', type: 'PROPOSITION', name: 'C1 in a cycle', premises: ['c2'] }),
  '',
  block({ id: 'c2', type: 'PROPOSITION', name: 'C2 in a cycle', premises: ['c1'] }),
].join('\n');

const Z_MAIN = `namespace Z\n\n${block({ id: 'z1', type: 'PROPOSITION', name: 'Z1 elsewhere' })}\n\nend Z\n`;

const TEXTS = { 'Model/S/Vocabulary.lean': VOCAB_S, [MAIN]: mainS(BODY), 'Model/Z/Main.lean': Z_MAIN };

function model(texts: Record<string, string> = TEXTS): ProjectModel {
  return build(texts).model;
}

const CTX: PlanContext = { today: '2026-11-19', now: '2026-11-19T10:00:00.000Z', layouts: {} };

const plan = (action: BoardAction, ctx: PlanContext = CTX, m: ProjectModel = model()) => planAction(m, action, ctx);
const main = (p: EditPlan) => p.changes.find((c) => c.path === MAIN)?.after ?? '';
const BEFORE = mainS(BODY);

function refusal(fn: () => unknown): ActionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
}

/** The model after applying a plan's file changes (to check what the files then say). */
function after(p: EditPlan): ProjectModel {
  const texts: Record<string, string> = { ...TEXTS };
  for (const change of p.changes) if (change.after !== null) texts[change.path] = change.after;
  return model(texts);
}

describe('the fixture (statuses the arrow rules rely on)', () => {
  it('p1 and p2 glow (established) on a1; pu glows on a2 through an undeclared use; c1/c2 is a TL015 cycle', () => {
    const m = model();
    expect(nodeOf(m, 'p1').status.flags).toContain('established');
    expect(nodeOf(m, 'p2').status.flags).toContain('established');
    expect(nodeOf(m, 'pu').status.flags).toContain('established');
    expect(nodeOf(m, 'pp').status.proof.kind).toBe('pending');
    expect(nodeOf(m, 'pf').fromNothing).toBe(true);
    expect(codes(m, 'c1')).toContain('TL015');
  });
});

describe('add-arrows (AR-1, AR-4, AR-5)', () => {
  it('appends the source to premises: as one plan labelled "Draw arrow: ‹source› → ‹target›"', () => {
    const p = plan({ kind: 'add-arrows', target: 'p3', sources: ['a1'] });
    expect(p).toMatchObject({ action: 'add-arrows', label: 'Draw arrow: A1 holds → P3 unproved', subject: 'S', nodes: ['p3', 'a1'] });
    expect(p.layout).toBeUndefined();
    expect(p.changes.map((c) => c.path)).toEqual([MAIN]);
    expect(main(p)).toBe(BEFORE.replace('natural_name: P3 unproved\nlean: S.p3', 'natural_name: P3 unproved\npremises: a1\nlean: S.p3'));
    expect(nodeOf(after(p), 'p3').premises).toEqual(['a1']);
  });

  it('several sources: existing order kept, new ones appended, an arrow already there ignored; "Draw N arrows into ‹target›"', () => {
    const p = plan({ kind: 'add-arrows', target: 'p5', sources: ['a0', 'a1', 'a0', 'p3'] });
    expect(p.label).toBe('Draw 2 arrows into P5 declares two');
    expect(p.nodes).toEqual(['p5', 'a0', 'p3']);
    expect(main(p)).toBe(BEFORE.replace('premises: a1, a2\n', 'premises: a1, a2, a0, p3\n'));
  });

  it('removes the "follows from nothing" mark in the same plan (AR-5, A22)', () => {
    const p = plan({ kind: 'add-arrows', target: 'pf', sources: ['a1'] });
    expect(main(p)).toBe(BEFORE.replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\npremises: a1\n'));
    expect(nodeOf(after(p), 'pf')).toMatchObject({ premises: ['a1'] });
    expect(nodeOf(after(p), 'pf').fromNothing).toBeUndefined();
  });

  it('into an axiom without .holds: it becomes an unproved proposition (type: only), moved to the propositions (AR-6)', () => {
    const layouts = { S: { ...emptyLayout(), positions: { a0: { x: 1, y: 2 }, p3: { x: 3, y: 4 } } } };
    const p = plan({ kind: 'add-arrows', target: 'a0', sources: ['a1'] }, { ...CTX, layouts });
    expect(p.label).toBe('Draw arrow: A1 holds → A0 has no holds');
    expect(main(p)).toBe(BEFORE.replace('id: a0\ntype: AXIOM\nnatural_name: A0 has no holds\nrationale: r\n', 'id: a0\ntype: PROPOSITION\nnatural_name: A0 has no holds\nrationale: r\npremises: a1\n'));
    expect(p.layout?.layout.columns.PROPOSITION.at(-1)).toBe('a0');
    expect(p.layout?.layout.columns.AXIOM).not.toContain('a0');
    // A stale canvas position of an axiom is dropped (AR-6 places it next to its source); others stay.
    expect(p.layout?.layout.positions).toEqual({ p3: { x: 3, y: 4 } });
    const m = after(p);
    expect(nodeOf(m, 'a0')).toMatchObject({ type: 'PROPOSITION', premises: ['a1'], status: { proof: { kind: 'none' } } });
  });

  it('into an axiom with a theorem .holds: a proved proposition; no confirmation (no glow rests on it)', () => {
    const p = plan({ kind: 'add-arrows', target: 'ap', sources: ['a1'] });
    expect(main(p)).toBe(BEFORE.replace('id: ap\ntype: AXIOM\nnatural_name: AP has a proof\nrationale: r\n', 'id: ap\ntype: PROPOSITION\nnatural_name: AP has a proof\nrationale: r\npremises: a1\n'));
    expect(nodeOf(after(p), 'ap')).toMatchObject({ type: 'PROPOSITION', status: { proof: { kind: 'proved' } } });
  });

  it('into an axiom that established cards rest on: needs-confirmation naming them, then pending (A15); its axiom stays', () => {
    const error = refusal(() => plan({ kind: 'add-arrows', target: 'a1', sources: ['a2'] }));
    expect(error.code).toBe('needs-confirmation');
    expect(error.message).toBe(
      'Drawing this arrow into “A1 holds” makes it a proposition. `axiom a1.holds` stays, marked pending proof, until a run proves it (`theorem a1.holds : … := …`). 2 cards that rest on it will lose their green glow until it is proved.',
    );
    expect(error.dependents).toEqual(['p1', 'p2']);
    const p = plan({ kind: 'add-arrows', target: 'a1', sources: ['a2'], confirmed: true });
    expect(p.label).toBe('Draw arrow: A2 holds → A1 holds');
    expect(main(p)).toBe(BEFORE.replace('id: a1\ntype: AXIOM\nnatural_name: A1 holds\nrationale: r\n', 'id: a1\ntype: PROPOSITION\nnatural_name: A1 holds\nrationale: r\npremises: a2\n'));
    expect(main(p)).toContain('axiom a1.holds : a1');
    const m = after(p);
    expect(nodeOf(m, 'a1').status.proof.kind).toBe('pending');
    expect(nodeOf(m, 'p1').status.flags).toContain('rests-on-pending');
    expect(nodeOf(m, 'p1').status.flags).not.toContain('established');
  });

  it('"Make it a proposition (pending)": an old axiom\'s premises (A19) become its arrows, one plan', () => {
    const p = plan({ kind: 'add-arrows', target: 'legacy', sources: ['a2'] });
    expect(p.label).toBe('Make proposition: Legacy axiom with premises');
    expect(p.nodes).toEqual(['legacy']);
    expect(main(p)).toBe(BEFORE.replace('id: legacy\ntype: ASSUMPTION\n', 'id: legacy\ntype: PROPOSITION\n'));
    const m = after(p);
    expect(nodeOf(m, 'legacy')).toMatchObject({ type: 'PROPOSITION', premises: ['a2'], status: { proof: { kind: 'pending' } } });
    expect(graphOf(m).edges.some((e) => e.type === 'premise' && e.target === 'legacy')).toBe(true);
    expect(codes(m, 'legacy')).not.toContain('TL122');
  });

  it('refuses an arrow that closes a cycle over the drawn arrows, naming the cycle by sentences (AR-3)', () => {
    const error = refusal(() => plan({ kind: 'add-arrows', target: 'a1', sources: ['p2'], confirmed: true }));
    expect(error.code).toBe('invalid');
    expect(error.message).toBe('This arrow would make a cycle: P2 proved from P1 → A1 holds → P1 proved from A1 → P2 proved from P1.');
  });

  it('refuses a cycle through the verified edge of a checked proof (an arrow nobody drew)', () => {
    // pu's proof uses a2 (verified, undeclared): pu -> a2 would close pu <- a2 <- pu.
    const error = refusal(() => plan({ kind: 'add-arrows', target: 'a2', sources: ['pu'], confirmed: true }));
    expect(error).toMatchObject({ code: 'invalid', message: 'This arrow would make a cycle: PU uses A2 without an arrow → A2 holds → PU uses A2 without an arrow.' });
  });

  it('into an old axiom, its premises from before v4 become arrows, so they count for the cycle check', () => {
    // legacy declares p3 before v4 (not drawn), and p3 has the drawn arrow legacy -> p3.
    const body = BODY.replace('premises: a2\nlean: S.lg', 'premises: p3\nlean: S.lg').replace('natural_name: P3 unproved\nlean: S.p3', 'natural_name: P3 unproved\npremises: legacy\nlean: S.p3');
    const m = model({ ...TEXTS, [MAIN]: mainS(body) });
    // The drawn arrows have no cycle: an unrelated arrow out of the old axiom is fine.
    expect(planAction(m, { kind: 'add-arrows', target: 'p4', sources: ['legacy'] }, CTX).label).toBe('Draw arrow: Legacy axiom with premises → P4 code-less');
    // Making it a proposition would draw p3 -> legacy too, closing p3 -> legacy -> p3.
    expect(refusal(() => planAction(m, { kind: 'add-arrows', target: 'legacy', sources: ['a1'] }, CTX))).toMatchObject({
      code: 'invalid',
      message: 'This arrow would make a cycle: P3 unproved → Legacy axiom with premises → P3 unproved.',
    });
  });

  it('a cycle already in the files (TL015) does not block unrelated arrows', () => {
    expect(plan({ kind: 'add-arrows', target: 'p4', sources: ['a1'] }).label).toBe('Draw arrow: A1 holds → P4 code-less');
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'c1', sources: ['c1'] })).message).toBe('A card cannot have an arrow into itself.');
  });

  it('refuses another subject, a self-arrow, an unknown id, vocabulary, an arrow already drawn and no source', () => {
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p3', sources: ['z1'] }))).toMatchObject({
      code: 'invalid',
      message: '“Z1 elsewhere” belongs to subject Z: arrows stay within one subject.',
    });
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p3', sources: ['p3'] }))).toMatchObject({ code: 'invalid', message: 'A card cannot have an arrow into itself.' });
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p3', sources: ['nope'] }))).toMatchObject({ code: 'invalid', message: 'No card "nope" (it may have been deleted).' });
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'nope', sources: ['a1'] })).code).toBe('not-found');
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p3', sources: ['S.Good'] }))).toMatchObject({ code: 'invalid', message: 'S.Good is vocabulary: arrows join axioms and propositions only.' });
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p1', sources: ['a1'] }))).toMatchObject({ code: 'invalid', message: 'That arrow is drawn already.' });
    expect(refusal(() => plan({ kind: 'add-arrows', target: 'p3', sources: [] })).code).toBe('invalid');
  });
});

describe('remove-arrows (AR-1, A16)', () => {
  it('removes an unused arrow; one plan labelled "Remove arrow: ‹source› → ‹target›"', () => {
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p5' }] });
    expect(p).toMatchObject({ action: 'remove-arrows', label: 'Remove arrow: A2 holds → P5 declares two', subject: 'S', nodes: ['p5', 'a2'] });
    expect(main(p)).toBe(BEFORE.replace('premises: a1, a2\n', 'premises: a1\n'));
  });

  it('removing every arrow into a card removes its premises: line; several targets in one plan', () => {
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p5' }, { source: 'a2', target: 'p5' }] });
    expect(p.label).toBe('Remove 2 arrows into P5 declares two');
    expect(main(p)).toBe(BEFORE.replace('natural_name: P5 declares two\npremises: a1, a2\n', 'natural_name: P5 declares two\n'));
    const both = plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p5' }, { source: 'a2', target: 'p6' }] });
    expect(both.label).toBe('Remove 2 arrows into 2 cards');
    expect(both.nodes).toEqual(['p5', 'p6', 'a2']);
    expect(main(both)).toBe(BEFORE.replace('premises: a1, a2\n', 'premises: a1\n').replace('natural_name: P6 declares A2\npremises: a2\n', 'natural_name: P6 declares A2\n'));
  });

  it('an arrow a proof uses: needs-confirmation saying what happens (A16), then removed when confirmed', () => {
    const error = refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p1' }] }));
    expect(error.code).toBe('needs-confirmation');
    expect(error.message).toBe(
      'The proof of “P1 proved from A1” uses “A1 holds”. Without the arrow the proof still builds, but it then uses a card you drew no arrow from: the board shows that use in the warning colour, and its band loses its ✓ until you draw the arrow again or the card is proved again.',
    );
    expect(error.dependents).toEqual(['p1']);
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p1' }], confirmed: true });
    expect(main(p)).toBe(BEFORE.replace('natural_name: P1 proved from A1\npremises: a1\n', 'natural_name: P1 proved from A1\n'));
    // The proof still builds; its use of a1 is now undeclared (TL107).
    expect(codes(after(p), 'p1')).toContain('TL107');
  });

  it('several used arrows: one message listing them', () => {
    const error = refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p1' }, { source: 'p1', target: 'p2' }, { source: 'a2', target: 'p5' }] }));
    expect(error.code).toBe('needs-confirmation');
    expect(error.message).toMatch(/^Proofs use 2 of these arrows: “A1 holds” → “P1 proved from A1”; “P1 proved from A1” → “P2 proved from P1”\. Without them/);
    expect(error.dependents).toEqual(['p1', 'p2']);
  });

  it('"Drop these arrows" on an old axiom removes its premises: line (A19)', () => {
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'legacy' }] });
    expect(p.label).toBe('Drop arrows declared before v4: Legacy axiom with premises');
    expect(main(p)).toBe(BEFORE.replace('rationale: r\npremises: a2\nlean: S.lg', 'rationale: r\nlean: S.lg'));
    const m = after(p);
    expect(nodeOf(m, 'legacy')).toMatchObject({ type: 'AXIOM', premises: [] });
    expect(codes(m, 'legacy')).not.toContain('TL122');
  });

  it('refuses an arrow that is not drawn, a self-arrow and an unknown target', () => {
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p3' }] }))).toMatchObject({
      code: 'invalid',
      message: 'There is no arrow from “A2 holds” into “P3 unproved” (any more).',
    });
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'p3', target: 'p3' }] })).code).toBe('invalid');
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'nope' }] })).code).toBe('not-found');
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [] })).code).toBe('invalid');
  });
});

describe('remove-arrows with "follows from nothing" marks: one Delete is one plan (slice 1f carry-over 2, AR-1, UN-2)', () => {
  /** The fixture with p3 marked "follows from nothing" too, and optionally Z's card marked. */
  const marked = (zMarked = false) =>
    model({
      ...TEXTS,
      [MAIN]: mainS(BODY.replace('natural_name: P3 unproved\nlean: S.p3', 'natural_name: P3 unproved\nfollows_from: nothing\nlean: S.p3')),
      ...(zMarked ? { 'Model/Z/Main.lean': Z_MAIN.replace('natural_name: Z1 elsewhere\n', 'natural_name: Z1 elsewhere\nfollows_from: nothing\n') } : {}),
    });

  it('arrows and a mark go in one plan (one Undo step), labelled with both', () => {
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p5' }], marks: ['pf'] });
    expect(p).toMatchObject({ action: 'remove-arrows', label: "Remove 1 arrow and 1 'follows from nothing' mark", subject: 'S', nodes: ['p5', 'pf', 'a2'] });
    expect(p.changes.map((c) => c.path)).toEqual([MAIN]);
    expect(main(p)).toBe(BEFORE.replace('premises: a1, a2\n', 'premises: a1\n').replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\n'));
    const m = after(p);
    expect(nodeOf(m, 'p5').premises).toEqual(['a1']);
    expect(nodeOf(m, 'pf').fromNothing).toBeUndefined();
  });

  it('marks alone: one mark is worded like "follows from nothing" off; several make one plan too', () => {
    const one = plan({ kind: 'remove-arrows', arrows: [], marks: ['pf'] });
    expect(one).toMatchObject({ action: 'remove-arrows', label: "Remove 'follows from nothing': PF from nothing", nodes: ['pf'] });
    expect(main(one)).toBe(BEFORE.replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\n'));
    const m = marked();
    const two = planAction(m, { kind: 'remove-arrows', arrows: [], marks: ['pf', 'p3', 'pf'] }, CTX);
    expect(two).toMatchObject({ label: "Remove 2 'follows from nothing' marks", nodes: ['pf', 'p3'] });
    const text = two.changes.find((c) => c.path === MAIN)?.after ?? '';
    expect(text).not.toContain('follows_from');
    expect(text).toBe(BEFORE.replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\n'));
  });

  it('a used arrow asks once for the whole Delete (A16): nothing is planned until it is confirmed, then all of it goes', () => {
    const error = refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p1' }], marks: ['pf'] }));
    expect(error.code).toBe('needs-confirmation');
    expect(error.dependents).toEqual(['p1']);
    const p = plan({ kind: 'remove-arrows', arrows: [{ source: 'a1', target: 'p1' }], marks: ['pf'], confirmed: true });
    expect(p.label).toBe("Remove 1 arrow and 1 'follows from nothing' mark");
    expect(main(p)).toBe(
      BEFORE.replace('natural_name: P1 proved from A1\npremises: a1\n', 'natural_name: P1 proved from A1\n').replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\n'),
    );
  });

  it('refuses a mark that is not there, an unknown card, another subject, and nothing at all', () => {
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [], marks: ['p3'] }))).toMatchObject({ code: 'invalid', message: '“P3 unproved” is not marked "follows from nothing" (any more).' });
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p5' }], marks: ['nope'] })).code).toBe('not-found');
    expect(refusal(() => planAction(marked(true), { kind: 'remove-arrows', arrows: [{ source: 'a2', target: 'p5' }], marks: ['z1'] }, CTX))).toMatchObject({
      code: 'invalid',
      message: 'Remove the arrows of one subject at a time.',
    });
    expect(refusal(() => plan({ kind: 'remove-arrows', arrows: [], marks: [] })).code).toBe('invalid');
  });
});

describe('TL015 follows the drawn arrows (slice 1f carry-over 1, A19)', () => {
  /** legacy (an old axiom) declares p3 before v4; `p3Arrows`: the drawn arrows into p3. */
  const texts = (p3Arrows: string[]) => {
    let body = BODY.replace('premises: a2\nlean: S.lg', 'premises: p3\nlean: S.lg');
    if (p3Arrows.length > 0) body = body.replace('natural_name: P3 unproved\nlean: S.p3', `natural_name: P3 unproved\npremises: ${p3Arrows.join(', ')}\nlean: S.p3`);
    return { ...TEXTS, [MAIN]: mainS(body) };
  };

  it('an old axiom\'s premises are no arrows: an arrow back from the axiom closes no cycle, so no TL015 (TL122 stays)', () => {
    const m = model(texts(['legacy']));
    expect(codes(m, 'legacy')).toContain('TL122');
    expect(codes(m, 'legacy')).not.toContain('TL015');
    expect(codes(m, 'p3')).not.toContain('TL015');
    // A drawn cycle is still reported.
    expect(codes(m, 'c1')).toContain('TL015');
    expect(codes(m, 'c2')).toContain('TL015');
  });

  it('the planner and TL015 agree: drawing the arrow from the old axiom is allowed, and the result has no TL015', () => {
    const m = model(texts([]));
    const p = planAction(m, { kind: 'add-arrows', target: 'p3', sources: ['legacy'] }, CTX);
    expect(p.label).toBe('Draw arrow: Legacy axiom with premises → P3 unproved');
    const next: Record<string, string> = { ...texts([]) };
    for (const change of p.changes) if (change.after !== null) next[change.path] = change.after;
    const result = model(next);
    expect(nodeOf(result, 'p3').premises).toEqual(['legacy']);
    expect(codes(result, 'p3')).not.toContain('TL015');
    expect(codes(result, 'legacy')).not.toContain('TL015');
  });
});

describe('"Move to axioms" wording (slice 1f carry-over 4, AR-7)', () => {
  it('the drop zone and dialog summary, the Undo and History label, and the re-order refusal say "Move to axioms"', () => {
    const m = model();
    expect(kindChangeImpact(graphOf(m), 'p3', 'AXIOM').summary).toBe('Move to axioms: adds axiom p3.holds');
    expect(plan({ kind: 'change-kind', id: 'p3', to: 'AXIOM', beforeId: null }).label).toBe('Move to axioms: P3 unproved');
    expect(refusal(() => plan({ kind: 'reorder', id: 'p3', column: 'AXIOM', beforeId: null })).message).toBe(
      'Moving a card to the Axioms column changes its kind: drop it on the "Move to axioms" zone.',
    );
  });
});

describe('set-from-nothing (AR-5, AR-6, B.6)', () => {
  it('on: writes `follows_from: nothing` on a proposition without arrows; off removes the line', () => {
    const on = plan({ kind: 'set-from-nothing', id: 'p3', on: true });
    expect(on).toMatchObject({ action: 'set-from-nothing', label: 'Follows from nothing: P3 unproved', nodes: ['p3'] });
    expect(main(on)).toBe(BEFORE.replace('natural_name: P3 unproved\nlean: S.p3', 'natural_name: P3 unproved\nfollows_from: nothing\nlean: S.p3'));
    expect(nodeOf(after(on), 'p3').fromNothing).toBe(true);
    const off = plan({ kind: 'set-from-nothing', id: 'pf', on: false });
    expect(off.label).toBe("Remove 'follows from nothing': PF from nothing");
    expect(main(off)).toBe(BEFORE.replace('natural_name: PF from nothing\nfollows_from: nothing\n', 'natural_name: PF from nothing\n'));
  });

  it('refuses the mark on a card with arrows, and a mark that is already there or not there', () => {
    expect(refusal(() => plan({ kind: 'set-from-nothing', id: 'p5', on: true }))).toMatchObject({
      code: 'invalid',
      message: 'It has arrows into it: a card follows from nothing only without them. Remove its arrows first.',
    });
    expect(refusal(() => plan({ kind: 'set-from-nothing', id: 'pf', on: true })).code).toBe('invalid');
    expect(refusal(() => plan({ kind: 'set-from-nothing', id: 'p3', on: false })).code).toBe('invalid');
    expect(refusal(() => plan({ kind: 'set-from-nothing', id: 'legacy', on: true })).message).toBe('It declares arrows from before v4: make it a proposition with them, or drop them first.');
  });

  it('on an axiom: it becomes a proposition that follows from nothing, with the same confirmation as an arrow (AR-6)', () => {
    const p = plan({ kind: 'set-from-nothing', id: 'a0', on: true });
    expect(main(p)).toBe(
      BEFORE.replace('id: a0\ntype: AXIOM\nnatural_name: A0 has no holds\nrationale: r\n', 'id: a0\ntype: PROPOSITION\nnatural_name: A0 has no holds\nrationale: r\nfollows_from: nothing\n'),
    );
    expect(p.layout?.layout.columns.PROPOSITION.at(-1)).toBe('a0');
    expect(nodeOf(after(p), 'a0')).toMatchObject({ type: 'PROPOSITION', fromNothing: true });
    const error = refusal(() => plan({ kind: 'set-from-nothing', id: 'a1', on: true }));
    expect(error).toMatchObject({ code: 'needs-confirmation', dependents: ['p1', 'p2'] });
    expect(error.message).toMatch(/^Marking “A1 holds” "follows from nothing" makes it a proposition\. `axiom a1\.holds` stays, marked pending proof/);
    expect(main(plan({ kind: 'set-from-nothing', id: 'a1', on: true, confirmed: true }))).toContain('type: PROPOSITION\nnatural_name: A1 holds\nrationale: r\nfollows_from: nothing\n');
  });
});

describe('claim-pending (AR-8, D-11 add-holds-axiom)', () => {
  it('adds `axiom n.holds : n` after the statement of a proposition with no .holds: it is pending', () => {
    const p = plan({ kind: 'claim-pending', id: 'p3' });
    expect(p).toMatchObject({ action: 'claim-pending', label: 'Mark pending: P3 unproved', subject: 'S', nodes: ['p3'] });
    expect(main(p)).toBe(BEFORE.replace('abbrev p3 : Prop := Good t ∧ Bad t\n', 'abbrev p3 : Prop := Good t ∧ Bad t\naxiom p3.holds : p3\n'));
    expect(nodeOf(after(p), 'p3').status.proof.kind).toBe('pending');
  });

  it('refuses a card without a Lean statement, one with a .holds, and an axiom', () => {
    expect(refusal(() => plan({ kind: 'claim-pending', id: 'p4' }))).toMatchObject({ code: 'invalid', message: 'It has no Lean statement yet: formalize it before marking it pending.' });
    expect(refusal(() => plan({ kind: 'claim-pending', id: 'pp' }))).toMatchObject({ code: 'invalid', message: 'It is pending proof already.' });
    expect(refusal(() => plan({ kind: 'claim-pending', id: 'p1' }))).toMatchObject({ code: 'invalid', message: 'It has a proof already: there is nothing to mark.' });
    expect(refusal(() => plan({ kind: 'claim-pending', id: 'a0' }))).toMatchObject({ code: 'invalid', message: 'Only a proposition can be marked pending: an axiom is assumed already.' });
    expect(refusal(() => plan({ kind: 'claim-pending', id: 'nope' })).code).toBe('not-found');
  });
});

describe('move-cards (BD-3, layout only)', () => {
  it('stores positions in the layout only, as one Undo step: "Move: ‹card›" / "Move: N cards"; others are kept', () => {
    const layout: Layout = { ...emptyLayout(), positions: { p1: { x: 0, y: 0 }, p3: { x: 5, y: 5 } } };
    const one = plan({ kind: 'move-cards', positions: { p3: { x: 10, y: -20.5 } } }, { ...CTX, layouts: { S: layout } });
    expect(one).toMatchObject({ action: 'move-cards', label: 'Move: P3 unproved', subject: 'S', nodes: ['p3'], changes: [], layoutOnly: true });
    expect(one.layout).toEqual({ subject: 'S', layout: { ...layout, positions: { p1: { x: 0, y: 0 }, p3: { x: 10, y: -20.5 } } } });
    const two = plan({ kind: 'move-cards', positions: { p3: { x: 1, y: 2 }, p4: { x: 3, y: 4 } } });
    expect(two.label).toBe('Move: 2 cards');
    expect(two.layout?.layout.positions).toEqual({ p3: { x: 1, y: 2 }, p4: { x: 3, y: 4 } });
  });

  it('refuses an axiom, an unknown card, another subject, no card and a position off the canvas', () => {
    expect(refusal(() => plan({ kind: 'move-cards', positions: { a1: { x: 1, y: 1 } } })).message).toBe('Only propositions have a place on the canvas: the axioms keep their column order.');
    expect(refusal(() => plan({ kind: 'move-cards', positions: { nope: { x: 1, y: 1 } } })).code).toBe('not-found');
    expect(refusal(() => plan({ kind: 'move-cards', positions: { p3: { x: 1, y: 1 }, z1: { x: 1, y: 1 } } })).message).toBe('Move the cards of one subject at a time.');
    expect(refusal(() => plan({ kind: 'move-cards', positions: {} })).code).toBe('invalid');
    expect(refusal(() => plan({ kind: 'move-cards', positions: { p3: { x: Number.NaN, y: 1 } } })).code).toBe('invalid');
    expect(refusal(() => plan({ kind: 'move-cards', positions: { p3: { x: 2_000_000, y: 1 } } })).code).toBe('invalid');
  });
});

describe("add-node's position (BD-3, BD-8, CM-7; slice 1c)", () => {
  it('stores a new proposition\'s place on the canvas in the same plan; an axiom\'s is ignored; the others are kept', () => {
    const layout: Layout = { ...emptyLayout(), positions: { p1: { x: 0, y: 0 } } };
    const added = plan({ kind: 'add-node', subject: 'S', type: 'PROPOSITION', naturalName: 'New here', position: { x: 120, y: -40.5 } }, { ...CTX, layouts: { S: layout } });
    expect(added).toMatchObject({ action: 'add-node', label: 'Add proposition: New here', nodeId: 'new-here' });
    expect(added.layout?.layout.positions).toEqual({ p1: { x: 0, y: 0 }, 'new-here': { x: 120, y: -40.5 } });
    expect(added.layout?.layout.columns.PROPOSITION.at(-1)).toBe('new-here');
    const axiom = plan({ kind: 'add-node', subject: 'S', type: 'AXIOM', naturalName: 'An axiom', position: { x: 1, y: 1 } }, { ...CTX, layouts: { S: layout } });
    expect(axiom.layout?.layout.positions).toEqual({ p1: { x: 0, y: 0 } });
    const none = plan({ kind: 'add-node', subject: 'S', type: 'PROPOSITION', naturalName: 'Placed by the board' });
    expect(none.layout?.layout).not.toHaveProperty('positions');
  });

  it('refuses a position off the canvas', () => {
    expect(refusal(() => plan({ kind: 'add-node', subject: 'S', type: 'PROPOSITION', naturalName: 'Far', position: { x: 2_000_000, y: 0 } }))).toMatchObject({
      code: 'invalid',
      message: 'A position on the canvas must be a number from -1000000 to 1000000.',
    });
  });
});

describe('the board (A19, BD-3)', () => {
  it('an old axiom\'s premises: are not drawn and get TL122; positions reach the graph for propositions only', () => {
    const m = model();
    expect(codes(m, 'legacy')).toEqual(['TL122']);
    expect(m.diagnostics.find((d) => d.code === 'TL122')).toMatchObject({ severity: 'info', message: AXIOM_PREMISES_MESSAGE });
    expect(nodeOf(m, 'legacy').premises).toEqual(['a2']);
    const layout: Layout = { ...emptyLayout(), positions: { p3: { x: 1, y: 2 }, a1: { x: 3, y: 4 }, gone: { x: 5, y: 6 } } };
    const graph = graphOf(m, 'S', layout);
    expect(graph.edges.filter((e) => e.target === 'legacy')).toEqual([]);
    expect(graph.edges.some((e) => e.type === 'premise' && e.target === 'p5')).toBe(true);
    expect(graph.positions).toEqual({ p3: { x: 1, y: 2 } });
    expect(graphOf(m)).not.toHaveProperty('positions');
  });
});
