/**
 * Spec v4.1 ES-2 (one target, AP-9), AR-4, AR-5, AR-8, AP-13 (slice 1e): the host's check of a `startRun` request
 * (`formalizeStartProblem`) and the cycle of arrows through a card (`arrowCycleThrough`), on the Spyro sample's board.
 */
import { describe, expect, it } from 'vitest';
import { arrowCycleThrough, FORMALIZE_START_TEXTS, formalizeCycleProblem, formalizeStartProblem, needsHoldsFirst, subjectCycle } from '../src/formalize.js';
import type { TlEdge, TlGraph, TlNode } from '../src/model.js';
import { spyroGraph, spyroProvedGraph } from '../src/samples/spyro.js';

const TARGET = 'cynder-not-good';

/** The sample's cards by id, with changes. */
function board(changes: Record<string, Partial<TlNode>> = {}, extra: TlNode[] = [], edges?: TlEdge[], graph: TlGraph = spyroGraph()) {
  const nodes: Record<string, TlNode> = {};
  for (const n of [...graph.nodes, ...extra]) nodes[n.id] = { ...n, ...(changes[n.id] ?? {}) } as TlNode;
  return { nodes, edges: edges ?? graph.edges, subject: 'Spyro' };
}

/** A proposition card cloned from the target, with its own id, sentence, premises and Lean. */
function proposition(id: string, naturalName: string, premises: string[], lean: Partial<TlNode['lean']> = {}): TlNode {
  const base = spyroGraph().nodes.find((n) => n.id === TARGET) as TlNode;
  const { justification: _j, justificationKind: _k, ...withoutHolds } = base.lean;
  void _j;
  void _k;
  return { ...base, id, naturalName, premises, lean: { ...withoutHolds, statement: `Spyro.${id.replace(/-/g, '_')}`, ...lean } };
}

describe('the host\'s check of a startRun request (formalizeStartProblem)', () => {
  it('accepts drawn arrows into the target from axioms (an axiom without Lean is Claude\'s to formalise)', () => {
    expect(formalizeStartProblem(board(), TARGET, ['cynder-dark-past'])).toBeUndefined();
    expect(formalizeStartProblem(board(), TARGET, ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'])).toBeUndefined();
  });

  it('every premise must be the source of an arrow drawn into the target ("Draw the arrows first.")', () => {
    const b = board({ [TARGET]: { premises: ['cynder-dark-past'] } });
    expect(formalizeStartProblem(b, TARGET, ['cynder-dark-past', 'new-spyro-pg'])).toBe(FORMALIZE_START_TEXTS.drawFirst);
    expect(FORMALIZE_START_TEXTS.drawFirst).toBe('Draw the arrows first.');
  });

  it('no premises only for a target marked "follows from nothing" ("Select arrows into one card.")', () => {
    expect(formalizeStartProblem(board(), TARGET, [])).toBe('Select arrows into one card.');
    expect(formalizeStartProblem(board({ [TARGET]: { premises: [], fromNothing: true } }), TARGET, [])).toBeUndefined();
  });

  it('AR-8: a proposition premise with neither a proof nor a pending claim is refused; a pending or proved one is fine', () => {
    const l = proposition('l-card', 'L is a lemma the person wrote', []);
    const b = board({ [TARGET]: { premises: ['cynder-dark-past', 'l-card'] } }, [l]);
    expect(needsHoldsFirst(l)).toBe(true);
    expect(formalizeStartProblem(b, TARGET, ['l-card'])).toBe('“L is a lemma the person wrote” is not proved: mark it pending first.');
    const pending = proposition('l-card', 'L is a lemma the person wrote', [], { justification: 'Spyro.l_card.holds', justificationKind: 'axiom' });
    expect(formalizeStartProblem(board({ [TARGET]: { premises: ['l-card'] } }, [pending]), TARGET, ['l-card'])).toBeUndefined();
    const proved = proposition('l-card', 'L is a lemma the person wrote', [], { justification: 'Spyro.l_card.holds', justificationKind: 'theorem' });
    expect(formalizeStartProblem(board({ [TARGET]: { premises: ['l-card'] } }, [proved]), TARGET, ['l-card'])).toBeUndefined();
  });

  it('the target must be a proposition of the board; premises must be cards of it, and not the target', () => {
    expect(formalizeStartProblem(board(), 'cynder-dark-past', ['new-spyro-pg'])).toBe(FORMALIZE_START_TEXTS.axiomTarget);
    expect(formalizeStartProblem(board(), 'nope', [])).toBe('The target "nope" is not a card of Spyro.');
    expect(formalizeStartProblem(board(), TARGET, ['nope'])).toBe('The premise "nope" is not a card of Spyro.');
    expect(formalizeStartProblem(board(), TARGET, [TARGET])).toMatch(/cannot also be one of its own premises/);
  });

  it('AP-13: a target or a premise on a cycle of arrows (drawn, or solid from a checked proof) is refused, naming the cycle', () => {
    const l = proposition('l-card', 'L comes from the target', [TARGET], { justification: 'Spyro.l_card.holds', justificationKind: 'axiom' });
    const cyclic = board({ [TARGET]: { premises: ['cynder-dark-past', 'l-card'] } }, [l]);
    expect(arrowCycleThrough(cyclic, TARGET)).toEqual([TARGET, 'l-card', TARGET]);
    expect(formalizeStartProblem(cyclic, TARGET, ['cynder-dark-past'])).toBe(
      'This card is on a cycle of arrows (Cynder would not be a good addition to … → L comes from the target → Cynder would not be a good addition to …): remove one arrow first.',
    );
    // A premise on a cycle that does not pass through the target is refused too.
    const m = proposition('m-card', 'M', ['n-card'], { justification: 'Spyro.m_card.holds', justificationKind: 'axiom' });
    const n = proposition('n-card', 'N', ['m-card'], { justification: 'Spyro.n_card.holds', justificationKind: 'axiom' });
    const other = board({ [TARGET]: { premises: ['m-card'] } }, [m, n]);
    expect(formalizeStartProblem(other, TARGET, ['m-card'])).toBe('This card is on a cycle of arrows (M → N → M): remove one arrow first.');
    // A verified edge (a checked proof's use) closes a cycle with a drawn arrow.
    const proved = spyroProvedGraph();
    const used = proved.edges.find((e) => e.type === 'verified' && e.target === TARGET);
    expect(used).toBeDefined();
    const back = board({ [used!.source]: { type: 'PROPOSITION', premises: [TARGET] } }, [], proved.edges, proved);
    expect(formalizeCycleProblem(back, [TARGET])).toMatch(/^This card is on a cycle of arrows \(/);
  });

  it('AP-29 (G2; 2b2): any cycle of arrows in the subject refuses the start, also one through none of the question\'s cards, and names it; removing one of its arrows lifts it', () => {
    const m = proposition('m-card', 'M', ['n-card'], { justification: 'Spyro.m_card.holds', justificationKind: 'axiom' });
    const n = proposition('n-card', 'N', ['m-card'], { justification: 'Spyro.n_card.holds', justificationKind: 'axiom' });
    const elsewhere = board({}, [m, n]);
    expect(arrowCycleThrough(elsewhere, TARGET)).toBeNull();
    expect(subjectCycle(elsewhere)).toEqual(['m-card', 'n-card', 'm-card']);
    const text = 'The arrows of this subject form a cycle (M → N → M): remove one arrow first.';
    expect(FORMALIZE_START_TEXTS.subjectCycle(['M', 'N', 'M'])).toBe(text);
    expect(formalizeCycleProblem(elsewhere, [TARGET, 'cynder-dark-past'])).toBe(text);
    expect(formalizeStartProblem(elsewhere, TARGET, ['cynder-dark-past'])).toBe(text);
    // One arrow of the cycle removed: the start passes again.
    const broken = board({}, [m, { ...n, premises: [] }]);
    expect(subjectCycle(broken)).toBeNull();
    expect(formalizeStartProblem(broken, TARGET, ['cynder-dark-past'])).toBeUndefined();
    // A subject without cycles is unaffected; the cycle found first follows the board's order of its cards.
    expect(subjectCycle(board())).toBeNull();
    expect(subjectCycle(board({}, [n, m]))).toEqual(['n-card', 'm-card', 'n-card']);
    // A longer cycle is named whole.
    const k = proposition('k-card', 'K', ['m-card'], { justification: 'Spyro.k_card.holds', justificationKind: 'axiom' });
    expect(subjectCycle(board({}, [{ ...m, premises: ['k-card'] }, { ...n, premises: [] }, k, { ...proposition('j-card', 'J', [], {}), premises: [] }]))).toEqual(['m-card', 'k-card', 'm-card']);
  });

  it('fixer 2b2 r1 (S-V2B2-S4): a proposition that lists itself in `premises:` (TL015) is a cycle of one arrow: it refuses the start too, named', () => {
    const selfish = proposition('m-card', 'M', ['m-card'], { justification: 'Spyro.m_card.holds', justificationKind: 'axiom' });
    const b = board({}, [selfish]);
    expect(arrowCycleThrough(b, 'm-card')).toBeNull();
    expect(subjectCycle(b)).toEqual(['m-card', 'm-card']);
    const text = 'The arrows of this subject form a cycle (M → M): remove one arrow first.';
    expect(formalizeCycleProblem(b, [TARGET, 'cynder-dark-past'])).toBe(text);
    expect(formalizeStartProblem(b, TARGET, ['cynder-dark-past'])).toBe(text);
    // An old axiom that lists itself is not drawn (A19): no cycle.
    expect(subjectCycle(board({ 'cynder-dark-past': { premises: ['cynder-dark-past'] } }))).toBeNull();
    // Before a longer cycle later in the board's order, the board's order decides.
    const n = proposition('n-card', 'N', ['k-card'], {});
    const k = proposition('k-card', 'K', ['n-card'], {});
    expect(subjectCycle(board({}, [n, k, selfish]))).toEqual(['n-card', 'k-card', 'n-card']);
    expect(subjectCycle(board({}, [selfish, n, k]))).toEqual(['m-card', 'm-card']);
  });

  it('an old axiom\'s premises (declared before v4, A19) are not drawn: no cycle through them', () => {
    const b = board({ 'cynder-dark-past': { premises: [TARGET] } });
    expect(arrowCycleThrough(b, TARGET)).toBeNull();
    expect(formalizeStartProblem(b, TARGET, ['cynder-dark-past'])).toBeUndefined();
  });
});
