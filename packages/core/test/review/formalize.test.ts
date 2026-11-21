/**
 * Slice 2b2 (docs/slice2-plan.md 4.12, 6.1): Formalize for several targets: `formalizeStartProblems` (checks 1-6 in
 * their order, at a start and during a stage) and `formalizeOrder` (sources first, ties by reading order), on the
 * Spyro sample's board with proposition cards added.
 */
import { describe, expect, it } from 'vitest';
import { FORMALIZE_START_TEXTS, formalizeCycleProblem, formalizeStartProblem } from '../../src/formalize.js';
import type { TlEdge, TlGraph, TlNode } from '../../src/model.js';
import { formalizeOrder, formalizeStartProblems } from '../../src/review/formalize.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { FormalizeSession, StartProblem } from '../../src/review/types.js';
import { spyroGraph } from '../../src/samples/spyro.js';

const TARGET = 'cynder-not-good';

/** A proposition card cloned from the target, with its own id, sentence, premises and Lean (a `.holds` unless `holds` is null). */
function proposition(id: string, naturalName: string, premises: string[], holds: 'axiom' | 'theorem' | null = 'theorem', extra: Partial<TlNode> = {}): TlNode {
  const base = spyroGraph().nodes.find((n) => n.id === TARGET) as TlNode;
  const { justification: _j, justificationKind: _k, ...withoutHolds } = base.lean;
  void _j;
  void _k;
  const statement = `Spyro.${id.replace(/-/g, '_')}`;
  return {
    ...base,
    id,
    naturalName,
    premises,
    lean: { ...withoutHolds, statement, ...(holds !== null ? { justification: `${statement}.holds`, justificationKind: holds } : {}) },
    ...extra,
  };
}

/**
 * The sample's board plus x (proved, from cynder-dark-past), l (proved, from x) and a (unproved, from l and new-spyro-pg):
 * the chain X -> L -> A; then the target as in the sample. Reading order: the sample's cards, then x, l, a.
 */
function board(changes: Record<string, Partial<TlNode>> = {}, extra: TlNode[] = [], edges: TlEdge[] = []): TlGraph {
  const graph = spyroGraph();
  const added = [
    proposition('x', 'X holds', ['cynder-dark-past']),
    proposition('l', 'L holds', ['x']),
    proposition('a', 'A holds', ['l', 'new-spyro-pg'], null),
    ...extra,
  ];
  const nodes = [...graph.nodes, ...added].map((n) => ({ ...n, ...(changes[n.id] ?? {}) }) as TlNode);
  return { ...graph, nodes, edges: [...graph.edges, ...edges] };
}

const SHOWN: FormalizeSession = { subject: 'Spyro', resultsShown: true, targets: [TARGET], arrows: [], shakyTargets: [], results: { [TARGET]: 'in-review' } };
const texts = (problems: readonly StartProblem[]) => problems.map((p) => [p.check, p.text]);

describe('formalizeOrder: sources first, ties by reading order', () => {
  it('X→L→A orders L before A, whatever order the request names them in; independent targets keep reading order', () => {
    const b = board();
    expect(formalizeOrder(b, [{ target: 'a', premises: ['l'] }, { target: 'l', premises: ['x'] }])).toEqual(['l', 'a']);
    expect(formalizeOrder(b, [{ target: 'a', premises: ['l'] }, { target: 'x', premises: ['cynder-dark-past'] }, { target: 'l', premises: ['x'] }])).toEqual(['x', 'l', 'a']);
    // A source later in reading order than the target whose question names it still comes first.
    const late = board({ x: { premises: ['cynder-dark-past', 'z'] } }, [proposition('z', 'Z holds', ['cynder-dark-past'])]);
    expect(formalizeOrder(late, [{ target: 'x', premises: ['z'] }, { target: 'z', premises: ['cynder-dark-past'] }])).toEqual(['z', 'x']);
    // Among the targets whose sources are placed, the first in reading order: a (independent) is read before z.
    expect(formalizeOrder(late, [{ target: 'x', premises: ['z'] }, { target: 'a', premises: ['new-spyro-pg'] }, { target: 'z', premises: ['cynder-dark-past'] }])).toEqual(['a', 'z', 'x']);
    // Independent: the board's order (the target comes before x, l and a in it).
    expect(formalizeOrder(b, [{ target: 'a', premises: ['new-spyro-pg'] }, { target: TARGET, premises: ['cynder-dark-past'] }, { target: 'x', premises: ['cynder-dark-past'] }])).toEqual([TARGET, 'x', 'a']);
  });

  it('empty, one target, an unknown card last, and a cycle among the targets still gives every target once', () => {
    const b = board();
    expect(formalizeOrder(b, [])).toEqual([]);
    expect(formalizeOrder(b, [{ target: 'a', premises: ['l'] }])).toEqual(['a']);
    expect(formalizeOrder(b, [{ target: 'zz', premises: [] }, { target: 'x', premises: [] }])).toEqual(['x', 'zz']);
    expect(formalizeOrder(b, [{ target: 'l', premises: ['a'] }, { target: 'a', premises: ['l'] }])).toEqual(['l', 'a']);
  });
});

describe('formalizeStartProblems, outside a session (a start)', () => {
  it('a good request has no problem: several targets, drawn arrows, an earlier target of the request as an unproved source', () => {
    const b = board();
    expect(formalizeStartProblems(b, [{ target: TARGET, premises: ['cynder-dark-past', 'new-spyro-pg'] }])).toEqual([]);
    expect(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }, { target: 'l', premises: ['x'] }])).toEqual([]);
    // a is unproved, but a target of the same request: no check 4.
    const c = board({}, [proposition('c', 'C holds', ['a'], null)]);
    expect(formalizeStartProblems(c, [{ target: 'c', premises: ['a'] }, { target: 'a', premises: ['l'] }])).toEqual([]);
  });

  it('the problems in their order: 3 (an axiom target, an undrawn premise, an empty question without the mark), 4 (an unproved source), 6 (a cycle)', () => {
    const c = board({}, [proposition('c', 'C holds', ['a'], null), proposition('p', 'P holds', ['q']), proposition('q', 'Q holds', ['p'])]);
    const problems = formalizeStartProblems(c, [
      { target: 'c', premises: ['a'] },
      { target: 'cynder-dark-past', premises: ['new-spyro-pg'] },
      { target: TARGET, premises: ['x'] },
      { target: 'x', premises: [] },
    ]);
    expect(texts(problems)).toEqual([
      [3, FORMALIZE_START_TEXTS.axiomTarget],
      [3, FORMALIZE_START_TEXTS.drawFirst],
      [3, FORMALIZE_START_TEXTS.oneTarget],
      [4, '“A holds” is not proved: mark it pending first.'],
      [6, 'The arrows of this subject form a cycle (P holds → Q holds → P holds): remove one arrow first.'],
    ]);
    expect(problems[1]?.arrow).toEqual({ source: 'x', target: TARGET });
    expect(problems[3]?.card).toBe('a');
  });

  it('check 1: a target that is not a card of the subject, a target asked twice, and an empty request; nothing after it', () => {
    const b = board();
    expect(texts(formalizeStartProblems(b, [{ target: 'nope', premises: [] }, { target: 'cynder-dark-past', premises: [] }]))).toEqual([[1, 'The target "nope" is not a card of Spyro.']]);
    expect(texts(formalizeStartProblems(b, [{ target: 'x', premises: ['cynder-dark-past'] }, { target: 'x', premises: ['cynder-dark-past'] }]))).toEqual([[1, '“X holds” is asked about twice: select its arrows once.']]);
    expect(texts(formalizeStartProblems(b, []))).toEqual([[1, FORMALIZE_START_TEXTS.oneTarget]]);
    // A premise that is no card, or the target itself.
    expect(texts(formalizeStartProblems(b, [{ target: 'x', premises: ['nope', 'x'] }]))).toEqual([
      [3, 'The premise "nope" is not a card of Spyro.'],
      [3, 'The target "X holds" cannot also be one of its own premises.'],
    ]);
  });

  it('check 6 (AP-29, G2): a cycle of drawn arrows elsewhere in the subject, not through the question’s cards, refuses and names it; slice 1’s path gives the same refusal; removing one arrow lifts it', () => {
    const cyclic = board({}, [proposition('p', 'P holds', ['q']), proposition('q', 'Q holds', ['p'])]);
    const request = [{ target: TARGET, premises: ['cynder-dark-past'] }];
    const text = 'The arrows of this subject form a cycle (P holds → Q holds → P holds): remove one arrow first.';
    expect(texts(formalizeStartProblems(cyclic, request))).toEqual([[6, text]]);
    // Slice 1's start check and the cycle check the board's Formalize uses.
    expect(formalizeStartProblem({ nodes: cyclic.nodes, edges: cyclic.edges, subject: 'Spyro' }, TARGET, ['cynder-dark-past'])).toBe(text);
    expect(formalizeCycleProblem({ nodes: cyclic.nodes, edges: cyclic.edges }, [TARGET, 'cynder-dark-past'])).toBe(text);
    // One arrow of the cycle removed: no problem.
    const broken = board({}, [proposition('p', 'P holds', []), proposition('q', 'Q holds', ['p'])]);
    expect(formalizeStartProblems(broken, request)).toEqual([]);
    expect(formalizeCycleProblem({ nodes: broken.nodes, edges: broken.edges }, [TARGET])).toBeUndefined();
    // A cycle through a solid arrow (a checked proof's use) elsewhere counts too.
    const solid: TlEdge = { id: 'verified:q->p', type: 'verified', source: 'q', target: 'p', origin: 'lean', where: 'proof' };
    expect(texts(formalizeStartProblems(board({}, [proposition('p', 'P holds', []), proposition('q', 'Q holds', ['p'])], [solid]), request))).toEqual([[6, text]]);
    // A cycle through the question's own cards keeps slice 1's text, which names the card.
    const through = board({ [TARGET]: { premises: ['cynder-dark-past', 'x'] }, x: { premises: ['cynder-dark-past', TARGET] } });
    expect(formalizeStartProblems(through, [{ target: TARGET, premises: ['x'] }])[0]?.text).toMatch(/^This card is on a cycle of arrows \(/);
  });
});

describe('formalizeStartProblems in a session (a mid-stage Formalize, RV-9)', () => {
  it('check 2: while the results are hidden, every request gets check 2’s text, before anything else (D2-65)', () => {
    const hidden: FormalizeSession = { ...SHOWN, resultsShown: false, shakyTargets: ['x'], results: { x: 'to-be-redone' } };
    const cyclic = board({}, [proposition('p', 'P holds', ['q']), proposition('q', 'Q holds', ['p'])]);
    for (const request of [
      [{ target: 'a', premises: ['l'] }],
      [{ target: 'x', premises: ['cynder-dark-past'] }],
      [{ target: 'cynder-dark-past', premises: [] }],
      [{ target: 'l', premises: ['x'] }],
    ]) {
      expect(texts(formalizeStartProblems(cyclic, request, hidden))).toEqual([[2, REVIEW_TEXTS.formalizeResultsHidden]]);
    }
    // Check 1 comes first: it reads only the board's cards.
    expect(texts(formalizeStartProblems(cyclic, [{ target: 'nope', premises: [] }], hidden))).toEqual([
      [1, 'The target "nope" is not a card of Spyro.'],
      [2, REVIEW_TEXTS.formalizeResultsHidden],
    ]);
    // Another subject's board while a session runs.
    expect(texts(formalizeStartProblems({ ...board(), subject: 'Other' }, [{ target: 'x', premises: ['cynder-dark-past'] }], SHOWN))[0]).toEqual([1, REVIEW_TEXTS.runElsewhere('Spyro')]);
  });

  it('check 3: Claude’s accepted arrows count as drawn; one in review gives "Accept this arrow first."; a target with a Shaky item is refused (D2-53)', () => {
    // Claude's arrow l -> a, drawn in the working copy.
    const b = board({ a: { premises: ['l', 'new-spyro-pg'] } });
    const arrow = (status: 'accepted' | 'in-review') => ({ ...SHOWN, targets: [TARGET, 'a'], arrows: [{ item: 'it-arrow', source: 'l', target: 'a', status }] });
    expect(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], arrow('accepted'))).toEqual([]);
    expect(texts(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], arrow('in-review')))).toEqual([[3, REVIEW_TEXTS.acceptArrowFirst]]);
    expect(texts(formalizeStartProblems(b, [{ target: 'x', premises: ['cynder-dark-past'] }], { ...SHOWN, shakyTargets: ['x'] }))).toEqual([[3, '“X holds” has items you declined as Shaky: Claude reworks them at Submit review.']]);
  });

  it('check 3 (D2-50): a new target at the source of Claude’s arrow into another target is refused, and allowed with that arrow selected in the same request', () => {
    // Claude's accepted arrow l -> a; the session's target is a; l becomes a new target.
    const b = board({ a: { premises: ['l', 'new-spyro-pg'] } });
    const session: FormalizeSession = { ...SHOWN, targets: ['a'], arrows: [{ item: 'it-arrow', source: 'l', target: 'a', status: 'accepted' }], results: { a: 'accepted' } };
    const refused = formalizeStartProblems(b, [{ target: 'l', premises: ['x'] }], session);
    expect(texts(refused)).toEqual([[3, '“L holds” is the source of Claude\'s arrow into “A holds”: select that arrow too, or decline it first.']]);
    expect(refused[0]?.arrow).toEqual({ source: 'l', target: 'a' });
    expect(formalizeStartProblems(b, [{ target: 'l', premises: ['x'] }, { target: 'a', premises: ['l'] }], session)).toEqual([]);
    // A target already in the session is no new target.
    expect(formalizeStartProblems(b, [{ target: 'l', premises: ['x'] }], { ...session, targets: ['a', 'l'] })).toEqual([]);
  });

  it('check 4 in a session: no pending mark (AR-8); check 5: a Shaky source and a to-be-redone one (D2-53)', () => {
    const b = board();
    expect(texts(formalizeStartProblems(b, [{ target: TARGET, premises: ['cynder-dark-past'] }, { target: 'c', premises: [] }], SHOWN))[0]?.[0]).toBe(1);
    const c = board({}, [proposition('c', 'C holds', ['a'], null)]);
    expect(texts(formalizeStartProblems(c, [{ target: 'c', premises: ['a'] }], SHOWN))).toEqual([[4, '“A holds” is not proved: select the arrows into “A holds” too.']]);
    const session = (results: FormalizeSession['results'], extra: Partial<FormalizeSession> = {}): FormalizeSession => ({ ...SHOWN, targets: ['l', 'x'], results, ...extra });
    expect(texts(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'to-be-redone' })))).toEqual([[5, '“L holds”\'s result is to be redone: select the arrows into “L holds” too, or Submit review first.']]);
    expect(texts(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'declined' }, { shakyResults: ['l'] })))).toEqual([[5, '“L holds”\'s result is Shaky: Claude reworks it at Submit review; set it back to review to use it now.']]);
    // A rejected Result is B's version: no check 5 (its `.holds` decides check 4).
    expect(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'declined' }, { shakyResults: [] }))).toEqual([]);
    // Without `shakyResults`, a declined Result of a card with a Shaky item counts as Shaky.
    expect(texts(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'declined' }, { shakyTargets: ['l'] })))[0]?.[0]).toBe(5);
    expect(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'declined' }))).toEqual([]);
    // In review or accepted: usable now (B.1 counts it, D2-48).
    expect(formalizeStartProblems(b, [{ target: 'a', premises: ['l'] }], session({ l: 'in-review' }))).toEqual([]);
  });
});
