/**
 * Slice 2b2 (docs/slice2-plan.md 4.11, 6.1): taking content out, `planItemRevert`: B's version of each item's content
 * back, from the items' drafts on the working copy, with `replace-decl` where B had another text; the comment lines
 * that go with the content and the enclosing lines of its last declaration; a written premise with its completion
 * (AF2); refusals; the result checked before it is returned. Reverting an item that is the only difference from B gives
 * B's text back byte for byte, so the decision commit's inverse patch re-applies it.
 */
import { describe, expect, it } from 'vitest';
import { ActionError, type FileChange } from '../../src/actions.js';
import { planGhostAdoption } from '../../src/gate/index.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { applyLeanOps, applyTextEdits } from '../../src/markup/api.js';
import { compareTexts, computeItems } from '../../src/review/items.js';
import { planItemRevert } from '../../src/review/revert.js';
import type { ItemDraft, LedgerEntry, PremiseDraft, SessionInference } from '../../src/review/types.js';
import { HONEST_PROOF, TARGET_LINE, literal, pinned } from '../gate/helpers/spyroRun.js';
import { FORMALISED, PROVED, freezeOf, judge, withChain } from './helpers/judge.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, VOCAB, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';

interface Case {
  base: Texts;
  current: Texts;
  ledger?: LedgerEntry[];
  premises?: PremiseDraft[];
  inferences?: SessionInference[];
  ended?: string[];
}

const itemsOf = (c: Case) =>
  computeItems({ base: modelOf(c.base), current: modelOf(c.current), ledger: c.ledger ?? [], premises: c.premises ?? [], inferences: c.inferences ?? [INFERENCE], ended: c.ended ?? [TARGET] });

function draftsOf(c: Case, keys: readonly string[]): ItemDraft[] {
  const { drafts } = itemsOf(c);
  return keys.map((key) => {
    const d = drafts.find((x) => x.key === key);
    if (d === undefined) throw new Error(`no draft ${key} (have ${drafts.map((x) => x.key).join(', ')})`);
    return d;
  });
}

/** The texts after the changes. */
function applied(texts: Texts, changes: readonly FileChange[]): Texts {
  const out: Texts = { ...texts };
  for (const change of changes) {
    expect(change.before, change.path).toBe(texts[change.path] ?? null);
    if (change.after === null) delete out[change.path];
    else out[change.path] = change.after;
  }
  return out;
}

function revert(c: Case, keys: readonly string[]): Texts {
  const changes = planItemRevert({ base: modelOf(c.base), current: modelOf(c.current), drafts: draftsOf(c, keys), ledger: c.ledger ?? [] });
  return applied(c.current, changes);
}

const refusal = (fn: () => unknown): ActionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ActionError) return error;
    throw error;
  }
  throw new Error('expected an ActionError');
};

describe('planItemRevert: B’s version back, kind by kind (§4.11)', () => {
  it('nothing to take out: no drafts, an unwritten premise draft, a Result that is B’s version', () => {
    const c: Case = { base: FORMALISED, current: FORMALISED, premises: [draftOf()], ended: [TARGET] };
    expect(planItemRevert({ base: modelOf(c.base), current: modelOf(c.current), drafts: [], ledger: [] })).toEqual([]);
    const drafts = draftsOf(c, [`premise:${TARGET}:cynder_is_evil`, `proof:${TARGET}`]);
    expect(drafts[1]?.asInBase).toBe(true);
    expect(planItemRevert({ base: modelOf(c.base), current: modelOf(c.current), drafts, ledger: [] })).toEqual([]);
  });

  it('a Formalize: the statement, its docstring mirror, an AXIOM’s `.holds` and the pin go; the card is code-less again, B’s text byte for byte', () => {
    const c: Case = { base: BASE, current: FORMALISED, ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] };
    const [d] = draftsOf(c, ['card:pg-no-dark-past']);
    expect(d?.kind).toBe('formalize');
    expect(d?.provides.decls).toEqual(['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds']);
    const after = revert(c, ['card:pg-no-dark-past']);
    expect(after).toEqual(BASE);
    const card = modelOf(after).nodes.get('pg-no-dark-past');
    expect(card?.block.binding.mode).toBe('none');
    expect(itemsOf({ ...c, current: after }).drafts.map((x) => x.key)).toEqual([`proof:${TARGET}`]);
  });

  it('a Formalize whose card would otherwise bind the declaration below it: a blank line keeps it code-less', () => {
    // The statement and the next card's block are separated by nothing but the statement itself.
    const tight = edit(FORMALISED, MAIN, 'axiom pg_no_dark_past.holds : pg_no_dark_past\n\n/-', 'axiom pg_no_dark_past.holds : pg_no_dark_past\nabbrev helper_p : Prop := True\n\n/-');
    const base = edit(BASE, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\n\nabbrev helper_p : Prop := True\n\n');
    const c: Case = { base, current: tight, ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] };
    const after = revert(c, ['card:pg-no-dark-past']);
    expect(modelOf(after).nodes.get('pg-no-dark-past')?.block.binding.mode).toBe('none');
    expect(after[MAIN]).toContain('lean: Spyro.cynder_dark_past');
    expect(after[MAIN]).not.toContain('pg_no_dark_past');
    expect(itemsOf({ ...c, current: after }).problems).toEqual([]);
  });

  it('a Result that replaces the person’s proof: T.holds gets B’s text back (`replace-decl`), its lemma and the lemma’s comment go', () => {
    const lemma = '-- the lemma the new proof uses\ntheorem dark_pg : HasDarkPast cynder ∧ IsPG newSpyro := ⟨cynder_dark_past.holds, new_spyro_pg.holds⟩';
    const other = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder dark_pg.2 dark_pg.1\n';
    const current = append(edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', other), MAIN, lemma);
    const c: Case = { base: PROVED, current, ledger: [created('Spyro.dark_pg', 'proof')] };
    const [d] = draftsOf(c, [`proof:${TARGET}`]);
    expect(d?.provides.decls).toEqual(['Spyro.cynder_not_good.holds', 'Spyro.dark_pg']);
    const after = revert(c, [`proof:${TARGET}`]);
    expect(after).toEqual(PROVED);
    // Re-applying the item's own text of T.holds with replace-decl gives its text back (the round trip).
    const file = parseLeanFile(MAIN, after[MAIN] as string);
    const back = applyLeanOps(file, [{ op: 'replace-decl', name: TARGET_HOLDS, text: other.trimEnd() }]);
    expect(back.problems).toEqual([]);
    expect(applyTextEdits(file.text, back.edits)).toBe(edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', other)[MAIN]);
  });

  it('a Result whose B had no proof: T.holds and its proof material go; a pending claim’s theorem gets the axiom back', () => {
    const c: Case = { base: FORMALISED, current: PROVED, ledger: [created(TARGET_HOLDS, 'proof')] };
    expect(revert(c, [`proof:${TARGET}`])).toEqual(FORMALISED);
    const pending = append(FORMALISED, MAIN, 'axiom cynder_not_good.holds : cynder_not_good');
    const provedPending = edit(pending, MAIN, 'axiom cynder_not_good.holds : cynder_not_good', 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds');
    expect(revert({ base: pending, current: provedPending }, [`proof:${TARGET}`])).toEqual(pending);
  });

  it('a Result whose T.holds the step removed (B had it): B’s text goes back right after its statement', () => {
    const removed = edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', '');
    const c: Case = { base: PROVED, current: removed };
    const [d] = draftsOf(c, [`proof:${TARGET}`]);
    expect(d?.provides.decls).toEqual([]);
    expect(d?.asInBase).toBeUndefined();
    expect(revert(c, [`proof:${TARGET}`])).toEqual(PROVED);
  });

  it('an Add arrow: its source leaves `premises:`; the line goes when it is empty', () => {
    const two = edit(PROVED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w' }];
    const added = edit(two, MAIN, 'premises: cynder-dark-past, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past, new-spyro-pg');
    expect(revert({ base: two, current: added, ledger }, [`arrow:new-spyro-pg>${TARGET}`])).toEqual(two);
    // Alone in the line.
    const none = edit(PROVED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', '');
    const only = edit(PROVED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: new-spyro-pg');
    const after = revert({ base: none, current: only, ledger }, [`arrow:new-spyro-pg>${TARGET}`]);
    expect(after).toEqual(none);
    expect(after[MAIN]).not.toContain(`id: ${TARGET}\ntype: GOAL\nnatural_name: Cynder would not be a good addition to the new Spyro game\npremises:`);
  });

  it('vocabulary and declarations: a new term and a presupposition with its helper instance (an instance without a name) go; a changed existing definition gets B’s text back', () => {
    const vocab = edit(BASE, VOCAB, '/-- Cynder -/', '/-- dragons -/\naxiom Dragon : Type\n/-- there is a dragon -/\naxiom Dragon.exists : Nonempty Dragon\ninstance : Nonempty Dragon := Dragon.exists\n/-- Cynder -/');
    const ledger = [created('Spyro.Dragon', 'statements'), created('Spyro.Dragon.exists', 'statements'), created('Spyro.instNonemptyDragon', 'statements')];
    const c: Case = { base: BASE, current: vocab, ledger };
    expect(itemsOf(c).drafts.map((d) => d.key)).toEqual(['decl:Spyro.Dragon.exists', `proof:${TARGET}`, 'vocab:Spyro.Dragon']);
    expect(revert(c, ['decl:Spyro.Dragon.exists'])[VOCAB]).toBe(edit(BASE, VOCAB, '/-- Cynder -/', '/-- dragons -/\naxiom Dragon : Type\n/-- Cynder -/')[VOCAB]);
    expect(revert(c, ['decl:Spyro.Dragon.exists', 'vocab:Spyro.Dragon'])).toEqual(BASE);
    // An existing definition an earlier step changed (a vocabulary change), and its round trip.
    const evil = 'def Evil (c : Character) : Prop := HasDarkPast c';
    const base = append(BASE, MAIN, evil);
    const changed = edit(base, MAIN, evil, 'def Evil (c : Character) : Prop := HasDarkPast c ∧ True');
    const [d] = draftsOf({ base, current: changed }, ['decl:Spyro.Evil']);
    expect(d?.declKind).toBe('vocabulary-change');
    expect(revert({ base, current: changed }, ['decl:Spyro.Evil'])).toEqual(base);
  });

  it('enclosing lines go with the last declaration they enclose, also when two items share them; the comments attached go too', () => {
    const shared = 'namespace Lemmas\n-- the lemma\ntheorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds\n-- the definition\ndef Wicked (c : Character) : Prop := HasDarkPast c\nend Lemmas';
    const current = append(PROVED, MAIN, shared);
    const ledger = [created('Spyro.Lemmas.t_lemma', 'proof'), created('Spyro.Lemmas.Wicked', 'statements')];
    const c: Case = { base: PROVED, current, ledger };
    expect(itemsOf(c).drafts.map((d) => d.key)).toEqual(['decl:Spyro.Lemmas.Wicked', `proof:${TARGET}`]);
    // The Result alone: its lemma and comment go, the namespace stays for the definition.
    const one = revert(c, [`proof:${TARGET}`]);
    expect(one).toEqual(append(PROVED, MAIN, 'namespace Lemmas\n-- the definition\ndef Wicked (c : Character) : Prop := HasDarkPast c\nend Lemmas'));
    expect(itemsOf({ ...c, current: one }).problems).toEqual([]);
    // Then the definition: the namespace goes with it, its last declaration.
    expect(revert({ ...c, current: one }, ['decl:Spyro.Lemmas.Wicked'])).toEqual(PROVED);
    // Both at once, in either order.
    expect(revert(c, ['decl:Spyro.Lemmas.Wicked', `proof:${TARGET}`])).toEqual(PROVED);
    expect(revert(c, [`proof:${TARGET}`, 'decl:Spyro.Lemmas.Wicked'])).toEqual(PROVED);
    // A mutual pair of one item's two declarations.
    const mutual = append(PROVED, MAIN, 'mutual\ntheorem m_one : HasDarkPast cynder := cynder_dark_past.holds\ntheorem m_two : HasDarkPast cynder := cynder_dark_past.holds\nend');
    expect(revert({ base: PROVED, current: mutual, ledger: [created('Spyro.m_one', 'proof'), created('Spyro.m_two', 'proof')] }, [`proof:${TARGET}`])).toEqual(PROVED);
  });

  it('a written premise with its completion: card, arrow and mark removal go, and T.holds gets B’s text back (AF2); with its Result too, the same', () => {
    const LITERAL = pinned(literal());
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const request = {
      subject: 'Spyro',
      target: TARGET,
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      leanName: 'not_in_game_not_good',
      session: 'rmabc123',
      today: '2026-11-02',
    };
    for (const holdAs of ['axiom', 'pending'] as const) {
      const plan = planGhostAdoption(modelOf(marked), { ...request, holdAs });
      const written: Texts = { ...marked, [MAIN]: plan.changes[0]?.after as string };
      const completed = edit(written, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := (fun h => h) not_in_game_not_good.holds cynder newSpyro\n');
      const key = `premise:${TARGET}:not_in_game_not_good`;
      const ledger: LedgerEntry[] = [
        { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs, item: key, commit: 'c-adopt' },
        { kind: 'mark-removed', card: TARGET, item: key, commit: 'c-adopt' },
        { kind: 'completion', target: TARGET, item: key, commit: 'c-complete' },
      ];
      const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] }];
      const draft = draftOf({ leanName: 'not_in_game_not_good', naturalName: request.naturalName, leanStatement: request.leanStatement });
      const c: Case = { base: marked, current: completed, ledger, premises: [draft], inferences };
      const [d] = draftsOf(c, [key]);
      expect(d?.provides).toEqual({ decls: ['Spyro.not_in_game_not_good', 'Spyro.not_in_game_not_good.holds'], arrows: [{ source: plan.nodeId, target: TARGET }], cards: [plan.nodeId] });
      const after = revert(c, [key]);
      expect(after, holdAs).toEqual(marked);
      expect(modelOf(after).nodes.get(TARGET)?.node.fromNothing).toBe(true);
      expect(revert(c, [key, `proof:${TARGET}`]), holdAs).toEqual(marked);
      // Without the completion entry, T.holds is the Result's: the premise alone leaves it.
      const withoutCompletion = revert({ ...c, ledger: ledger.slice(0, 2) }, [key]);
      expect(withoutCompletion[MAIN]).toContain('theorem cynder_not_good.holds');
    }
  });

  it('several items of several files at once; the result parses with the expected blocks', () => {
    const vocab = edit(PROVED, VOCAB, '/-- Cynder -/', '/-- dragons -/\naxiom Dragon : Type\n/-- Cynder -/');
    const c: Case = { base: BASE, current: vocab, ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof'), created('Spyro.Dragon', 'statements')] };
    const keys = itemsOf(c).drafts.map((d) => d.key);
    expect(keys).toEqual(['card:pg-no-dark-past', `proof:${TARGET}`, 'vocab:Spyro.Dragon']);
    const changes = planItemRevert({ base: modelOf(c.base), current: modelOf(c.current), drafts: draftsOf(c, keys), ledger: c.ledger ?? [] });
    expect(changes.map((x) => x.path)).toEqual([MAIN, VOCAB]);
    const after = applied(c.current, changes);
    expect(after).toEqual(BASE);
    expect(parseLeanFile(MAIN, after[MAIN] as string).blocks.map((b) => b.id)).toEqual(parseLeanFile(MAIN, BASE[MAIN] as string).blocks.map((b) => b.id));
  });
});

describe('planItemRevert refuses what it cannot take out cleanly (fail closed)', () => {
  it('a declaration whose end Lean reads beyond telelean’s span, for a removal and for `replace-decl`', () => {
    const other = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n  -- the same proof\n';
    const current = edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', other);
    const c: Case = { base: PROVED, current };
    const drafts = draftsOf(c, [`proof:${TARGET}`]);
    const longer = modelOf(current, {}, (facts) => {
      const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
      if (holds) holds.range = { ...holds.range, end: { line: holds.range.end.line + 2, character: 0 } };
    });
    const error = refusal(() => planItemRevert({ base: modelOf(PROVED), current: longer, drafts, ledger: [] }));
    expect(error.code).toBe('unsafe');
    expect(error.message).toMatch(/Spyro\.cynder_not_good\.holds ends on line \d+ of Model\/Spyro\/Main\.lean for Lean/);
    // As Lean reads it, the same revert goes through.
    expect(planItemRevert({ base: modelOf(PROVED), current: modelOf(current), drafts, ledger: [] }).length).toBe(1);
    // A removal: the proof B lacks.
    const removal = draftsOf({ base: FORMALISED, current: PROVED, ledger: [created(TARGET_HOLDS, 'proof')] }, [`proof:${TARGET}`]);
    const longerRemoval = modelOf(PROVED, {}, (facts) => {
      const holds = facts.decls.find((d) => d.name === TARGET_HOLDS);
      if (holds) holds.range = { ...holds.range, end: { line: holds.range.end.line + 2, character: 0 } };
    });
    expect(refusal(() => planItemRevert({ base: modelOf(FORMALISED), current: longerRemoval, drafts: removal, ledger: [created(TARGET_HOLDS, 'proof')] })).code).toBe('unsafe');
  });

  it('two declarations of one name (the first one goes, the other stays): the result is checked, nothing is returned', () => {
    const dup = 'def Dup : Nat := 1';
    const current = edit(append(PROVED, MAIN, dup), VOCAB, '/-- Cynder -/', `${dup}\n/-- Cynder -/`);
    const c: Case = { base: PROVED, current, ledger: [created('Spyro.Dup', 'statements')] };
    const error = refusal(() => planItemRevert({ base: modelOf(PROVED), current: modelOf(current), drafts: draftsOf(c, ['decl:Spyro.Dup']), ledger: [] }));
    expect(error.code).toBe('unsafe');
    expect(error.message).toBe('telelean could not take the content out cleanly (Spyro.Dup is still there): nothing was written.');
  });

  it('an item kind no slice-2 step makes', () => {
    const [d] = draftsOf({ base: BASE, current: FORMALISED, ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] }, ['card:pg-no-dark-past']);
    for (const kind of ['delete', 'remove-arrow', 'add', 'proof-broken'] as const) {
      const error = refusal(() => planItemRevert({ base: modelOf(BASE), current: modelOf(FORMALISED), drafts: [{ ...(d as ItemDraft), kind }], ledger: [] }));
      expect(error.code, kind).toBe('invalid');
    }
  });

  it('an instance without a name that the step moved (no LeanOp finds it again)', () => {
    const instance = 'instance : Nonempty Game := Game.exists\n';
    const moved = edit(edit(BASE, VOCAB, instance, ''), VOCAB, '\nend Spyro', `\n${instance}\nend Spyro`);
    const c: Case = { base: BASE, current: moved };
    const key = itemsOf(c).drafts.map((d) => d.key).find((k) => k.startsWith('decl:') && k.includes('Nonempty'));
    expect(key).toBeDefined();
    const error = refusal(() => planItemRevert({ base: modelOf(BASE), current: modelOf(moved), drafts: draftsOf(c, [key as string]), ledger: [] }));
    expect(error.code).toBe('unsafe');
    expect(error.message).toMatch(/an instance without a name, moved since the session started/);
  });

  it('a proposition’s Change whose `.holds` the state lacks: the `.holds` is its Result’s, so the Change goes back alone; with the Result too, B', () => {
    const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro';
    const changed = edit(
      edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', ''),
      MAIN,
      statement,
      'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∨ False',
    );
    const c: Case = { base: PROVED, current: changed };
    expect(itemsOf(c).drafts.map((d) => [d.key, d.kind])).toEqual([
      [`card:${TARGET}`, 'change'],
      [`proof:${TARGET}`, 'result'],
    ]);
    const alone = revert(c, [`card:${TARGET}`]);
    expect(alone[MAIN]).toContain(`${statement}\n`);
    expect(alone[MAIN]).not.toContain('theorem cynder_not_good.holds');
    expect(revert(c, [`card:${TARGET}`, `proof:${TARGET}`])).toEqual(PROVED);
  });

  it('a card’s statement that lost a declaration B bound to it (it would need a place): refused', () => {
    const lost = edit(PROVED, MAIN, 'axiom cynder_dark_past.holds : cynder_dark_past\n', '');
    const c: Case = { base: PROVED, current: lost };
    const [d] = draftsOf(c, ['card:cynder-dark-past']);
    expect(d?.kind).toBe('change');
    const error = refusal(() => planItemRevert({ base: modelOf(PROVED), current: modelOf(lost), drafts: [d as ItemDraft], ledger: [] }));
    expect(error.code).toBe('unsafe');
    expect(error.message).toMatch(/^Spyro\.cynder_dark_past\.holds was removed from “cynder-dark-past”/);
  });

  it('a premise card the working copy lacks, and a draft of another state', () => {
    const [d] = draftsOf({ base: BASE, current: FORMALISED, ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] }, ['card:pg-no-dark-past']);
    // The draft's declarations are not in this working copy: nothing it names is taken out, and the card's binding stays B's.
    expect(planItemRevert({ base: modelOf(BASE), current: modelOf(BASE), drafts: [d as ItemDraft], ledger: [] })).toEqual([]);
    const premise: ItemDraft = { ...(d as ItemDraft), key: `premise:${TARGET}:p`, kind: 'add-premise', provides: { decls: [], arrows: [], cards: ['nope'] } };
    expect(refusal(() => planItemRevert({ base: modelOf(BASE), current: modelOf(BASE), drafts: [premise], ledger: [] })).code).toBe('unsafe');
  });
});

describe('fixer 2b2 r1: what a step may leave that the revert must still take out', () => {
  const OTHER = 'abbrev other_fact : Prop := True';
  const MOVED_PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder (new_spyro_pg.holds) cynder_dark_past.holds';

  it('S-V2B2-S1, C-V2B2-C1, A-V2B2-ADV-2: a Result whose T.holds the step wrote below later content (the person’s proof replaced, a pending claim proved): B’s text goes back in B’s place', () => {
    // The person's proof, replaced by one written after a later declaration of the person's: the step limits let it
    // through (the target's proof is open), and computeItems gives the moved T.holds to the Result.
    const base = append(PROVED, MAIN, OTHER);
    const moved = append(edit(base, MAIN, HONEST_PROOF, ''), MAIN, MOVED_PROOF);
    expect(judge(moved, { base, stepStart: base, freeze: freezeOf(base, TARGET, INFERENCE.question.sources, base), purpose: 'gate-proved' }).stepFindings).toEqual([]);
    const c: Case = { base, current: moved };
    const [d] = draftsOf(c, [`proof:${TARGET}`]);
    expect(d?.provides.decls).toEqual([TARGET_HOLDS]);
    expect(revert(c, [`proof:${TARGET}`])).toEqual(base);
    // With its own lemma, and a comment above each: they go too.
    const withLemma = append(edit(base, MAIN, HONEST_PROOF, ''), MAIN, `-- the lemma\ntheorem dark_pg : HasDarkPast cynder := cynder_dark_past.holds\n-- the new proof\n${MOVED_PROOF}`);
    expect(revert({ base, current: withLemma, ledger: [created('Spyro.dark_pg', 'proof')] }, [`proof:${TARGET}`])).toEqual(base);
    const commented = append(edit(base, MAIN, HONEST_PROOF, ''), MAIN, `-- the new proof\n${MOVED_PROOF}`);
    expect(revert({ base, current: commented }, [`proof:${TARGET}`])).toEqual(base);
    // The person's proof itself moved, its text unchanged: the move alone is the Result's, and goes back.
    const same = append(edit(base, MAIN, HONEST_PROOF, ''), MAIN, HONEST_PROOF);
    expect(draftsOf({ base, current: same }, [`proof:${TARGET}`])[0]?.asInBase).toBeUndefined();
    expect(revert({ base, current: same }, [`proof:${TARGET}`])).toEqual(base);
    // A pending claim proved below later content: the axiom goes back where it was.
    const pending = append(edit(FORMALISED, MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`), MAIN, OTHER);
    const provedBelow = append(edit(pending, MAIN, 'axiom cynder_not_good.holds : cynder_not_good\n', ''), MAIN, MOVED_PROOF);
    expect(revert({ base: pending, current: provedBelow }, [`proof:${TARGET}`])).toEqual(pending);
    // B's `.holds` the step removed outright goes back in B's place too, which need not be right after its statement.
    const apart = append(edit(FORMALISED, MAIN, TARGET_LINE, `${TARGET_LINE}${OTHER}\n`), MAIN, 'axiom cynder_not_good.holds : cynder_not_good');
    const without = edit(apart, MAIN, '\n\naxiom cynder_not_good.holds : cynder_not_good\n', '\n');
    expect(revert({ base: apart, current: without }, [`proof:${TARGET}`])).toEqual(apart);
  });

  it('a declaration the step moved goes back in B’s place: after the unit before it, else (first in its file) before the unit after it', () => {
    const evil = 'def Evil (c : Character) : Prop := HasDarkPast c';
    const good = 'def Good (c : Character) : Prop := ¬ HasDarkPast c';
    const base = append(BASE, MAIN, `${evil}\n${good}`);
    const moved = append(BASE, MAIN, `${good}\n${evil}`);
    expect(itemsOf({ base, current: moved }).drafts.map((d) => d.key)).toContain('decl:Spyro.Evil');
    expect(revert({ base, current: moved }, ['decl:Spyro.Evil'])).toEqual(base);
    // First in its file, with no unit before it.
    const EXTRA = 'Model/Spyro/Extra.lean';
    const first: Texts = { ...BASE, [EXTRA]: 'def a_one : Nat := 1\n\ndef a_two : Nat := 2\ndef a_three : Nat := 3\n' };
    const last: Texts = { ...BASE, [EXTRA]: 'def a_two : Nat := 2\ndef a_three : Nat := 3\n\ndef a_one : Nat := 1\n' };
    expect(itemsOf({ base: first, current: last }).drafts.map((d) => d.key)).toContain('decl:a_one');
    expect(revert({ base: first, current: last }, ['decl:a_one'])).toEqual(first);
  });

  it('C-V2B2-C2, A-V2B2-ADV-3: two written premises into a marked target: the first taken out leaves the mark removed while the second’s arrow stays (no TL023); both out, the mark is back', () => {
    const LITERAL = pinned(literal());
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const common = { subject: 'Spyro', target: TARGET, session: 'rmabc123', today: '2026-11-02' };
    const r1 = { ...common, naturalName: 'A character who cannot be in a game would not be a good addition to it', leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g', leanName: 'not_in_game_not_good' };
    const r2 = { ...common, naturalName: 'Cynder is not in the new game', leanStatement: '¬ InGame cynder newSpyro', leanName: 'cynder_not_in' };
    const p1 = planGhostAdoption(modelOf(marked), { ...r1, holdAs: 'axiom' });
    const w1: Texts = { ...marked, [MAIN]: p1.changes[0]?.after as string };
    const p2 = planGhostAdoption(modelOf(w1), { ...r2, holdAs: 'axiom' });
    const w2: Texts = { ...w1, [MAIN]: p2.changes[0]?.after as string };
    const k1 = `premise:${TARGET}:not_in_game_not_good`;
    const k2 = `premise:${TARGET}:cynder_not_in`;
    const ledger: LedgerEntry[] = [
      { kind: 'premise', card: p1.nodeId, target: TARGET, holdAs: 'axiom', item: k1, commit: 'c-adopt1' },
      { kind: 'mark-removed', card: TARGET, item: k1, commit: 'c-adopt1' },
      { kind: 'premise', card: p2.nodeId, target: TARGET, holdAs: 'axiom', item: k2, commit: 'c-adopt2' },
    ];
    const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] }];
    const premises = [
      draftOf({ leanName: 'not_in_game_not_good', naturalName: r1.naturalName, leanStatement: r1.leanStatement }),
      draftOf({ leanName: 'cynder_not_in', naturalName: r2.naturalName, leanStatement: r2.leanStatement }),
    ];
    const c: Case = { base: marked, current: w2, ledger, premises, inferences };
    const first = revert(c, [k1]);
    const target = modelOf(first).nodes.get(TARGET);
    expect(target?.block.fields.followsFrom).toBeUndefined();
    expect(target?.node.premises).toEqual([p2.nodeId]);
    expect(modelOf(first).diagnostics.filter((x) => x.code === 'TL023')).toEqual([]);
    expect(first[MAIN]).not.toContain('not_in_game_not_good');
    // Both at once: no arrow stays, so the mark comes back: B's text.
    expect(revert(c, [k1, k2])).toEqual(marked);
    // The second alone: it removed no mark, and the first's arrow stays.
    const second = revert(c, [k2]);
    expect(modelOf(second).nodes.get(TARGET)?.node.premises).toEqual([p1.nodeId]);
    expect(modelOf(second).nodes.get(TARGET)?.block.fields.followsFrom).toBeUndefined();
  });

  it('A-V2B2-ADV-1: a premise’s take-out leaves a T.holds a later step reworked without it (its Result’s); one that still rests on it goes, through a lemma too, and without complete facts its text decides', () => {
    const LITERAL = pinned(literal());
    const marked = edit(LITERAL, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const request = {
      subject: 'Spyro',
      target: TARGET,
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      leanName: 'not_in_game_not_good',
      session: 'rmabc123',
      today: '2026-11-02',
    };
    const plan = planGhostAdoption(modelOf(marked), { ...request, holdAs: 'axiom' });
    const written: Texts = { ...marked, [MAIN]: plan.changes[0]?.after as string };
    const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
    const completion = 'theorem cynder_not_good.holds : cynder_not_good := (fun h => h) not_in_game_not_good.holds cynder newSpyro';
    const completed = edit(written, MAIN, statement, `${statement}${completion}\n`);
    const key = `premise:${TARGET}:not_in_game_not_good`;
    const ledger: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs: 'axiom', item: key, commit: 'c-adopt' },
      { kind: 'mark-removed', card: TARGET, item: key, commit: 'c-adopt' },
      { kind: 'completion', target: TARGET, item: key, commit: 'c-complete' },
    ];
    const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1', 's2'] }];
    const premises = [draftOf({ leanName: 'not_in_game_not_good', naturalName: request.naturalName, leanStatement: request.leanStatement })];
    const take = (current: Texts, facts = {}) => {
      const c: Case = { base: marked, current, ledger, premises, inferences };
      return applied(current, planItemRevert({ base: modelOf(marked), current: modelOf(current, facts), drafts: draftsOf(c, [key]), ledger }));
    };
    // A later step proved T another way, without the premise: its Result does not depend on it, and its proof stays.
    const reworked = edit(completed, MAIN, completion, 'theorem cynder_not_good.holds : cynder_not_good := other_reason');
    expect(judge(reworked, { base: marked, purpose: 'stage', ledger, inferences, ended: [TARGET], premises }).deps[`proof:${TARGET}`] ?? []).not.toContain(key);
    const kept = take(reworked);
    expect(kept[MAIN]).toContain('theorem cynder_not_good.holds : cynder_not_good := other_reason');
    expect(kept[MAIN]).not.toContain('not_in_game_not_good');
    // The completion itself goes (B had no proof: T.holds goes), and so does a rework that rests on the premise through a lemma.
    expect(take(completed)[MAIN]).not.toContain('cynder_not_good.holds');
    const viaLemma = edit(completed, MAIN, completion, 'theorem via_premise : cynder_not_good := (fun h => h) not_in_game_not_good.holds cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := via_premise');
    const lemmaTaken = take(viaLemma);
    expect(lemmaTaken[MAIN]).not.toContain('theorem cynder_not_good.holds');
    // Without complete facts for T.holds, its text decides: the completion names the premise, the rework does not.
    const noFacts = { valueConsts: true, typeConsts: true, overrides: { [TARGET_HOLDS]: { noValueConsts: true } } };
    expect(take(completed, noFacts)[MAIN]).not.toContain('cynder_not_good.holds');
    expect(take(reworked, noFacts)[MAIN]).toContain('theorem cynder_not_good.holds : cynder_not_good := other_reason');
  });
});

describe('fixer 2b2 r2 (R1-2): declarations that go back next to each other, after the same unit that stayed in place', () => {
  it('two pending claims adjacent in B, each proved below later content by its own step, both Results taken out at once (a cascade, RV-5): B byte for byte; each alone goes back too', () => {
    const later = 'abbrev o_one : Prop := True\nabbrev o_two : Prop := True\nabbrev o_three : Prop := True';
    const base = append(append(withChain(BASE), MAIN, 'axiom t1.holds : t1\naxiom t2.holds : t2'), MAIN, later);
    const s1 = append(edit(base, MAIN, 'axiom t1.holds : t1\n', ''), MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
    const s2 = append(edit(s1, MAIN, 'axiom t2.holds : t2\n', ''), MAIN, 'theorem t2.holds : t2 := t1.holds');
    const inferences: SessionInference[] = [
      { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] },
      { target: 't2', question: { sources: ['t1'], fromNothing: false }, order: 1, steps: ['s2'] },
    ];
    // Each step passes its gate (its target's proof is open, its `.holds`'s place too).
    const steps = [
      { start: base, now: s1, inference: inferences[0] as SessionInference, ended: [] as string[] },
      { start: s1, now: s2, inference: inferences[1] as SessionInference, ended: ['t1'] },
    ];
    for (const { start, now, inference, ended } of steps) {
      const step = inference.steps[0] as string;
      const scope = { step, target: inference.target, question: inference.question, fuzzyStatements: [], openProof: true, openArrows: true, openItems: [] };
      const freeze = freezeOf(start, inference.target, inference.question.sources, base);
      const j = judge(now, { base, stepStart: start, scope, freeze, purpose: 'gate-proved', inferences: inferences.filter((x) => x.order <= inference.order), ended });
      expect(j.stepFindings, step).toEqual([]);
    }
    const c: Case = { base, current: s2, inferences, ended: ['t1', 't2'] };
    expect([...compareTexts(modelOf(base), modelOf(s2)).moved].sort()).toEqual(['Spyro.t1.holds', 'Spyro.t2.holds']);
    expect(revert(c, ['proof:t1', 'proof:t2'])).toEqual(base);
    // Alone, each goes back to its place, and the other's proof stays where its step wrote it.
    const alone = [
      ['proof:t1', 'axiom t1.holds : t1', 'Spyro.t2.holds', 'theorem t2.holds : t2 := t1.holds'],
      ['proof:t2', 'axiom t2.holds : t2', 'Spyro.t1.holds', 'theorem t1.holds : t1 := cynder_dark_past.holds'],
    ] as const;
    for (const [key, back, other, stays] of alone) {
      const after = revert(c, [key]);
      expect(after[MAIN], key).toContain(back);
      expect(after[MAIN], key).toContain(stays);
      expect([...compareTexts(modelOf(base), modelOf(after)).moved], key).toEqual([other]);
    }
  });

  it('three that go back after the same unit; two after different units; one in each of two files; two first in their file, before the same unit', () => {
    const EXTRA = 'Model/Spyro/Extra.lean';
    const defs = (...names: string[]) => names.map((n) => `def a_${n} : Nat := 0`).join('\n');
    const base: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('one', 'two', 'three')}\n\n${defs('four', 'five', 'six', 'seven')}\n` };
    const moved: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('four', 'five', 'six', 'seven')}\n${defs('one', 'two', 'three')}\n` };
    const keys = ['decl:a_one', 'decl:a_three', 'decl:a_two'];
    expect(itemsOf({ base, current: moved }).drafts.map((d) => d.key)).toEqual(expect.arrayContaining(keys));
    expect(revert({ base, current: moved }, keys)).toEqual(base);
    // a_one after a_zero, a_two after a_four: one after the other in B's order, each after its own unit.
    const apart: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('one', 'four', 'two')}\n\n${defs('five', 'six')}\n` };
    const scattered: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('four')}\n\n${defs('five', 'six', 'two', 'one')}\n` };
    expect([...compareTexts(modelOf(apart), modelOf(scattered)).moved].sort()).toEqual(['a_one', 'a_two']);
    expect(revert({ base: apart, current: scattered }, ['decl:a_one', 'decl:a_two'])).toEqual(apart);
    // One in each of two files, after units that end at the same offset of their files.
    const EXTRA2 = 'Model/Spyro/Extra2.lean';
    const two: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('one')}\n\n${defs('four', 'five')}\n`, [EXTRA2]: 'def b_zero : Nat := 0\n\ndef b_one : Nat := 0\n\ndef b_four : Nat := 0\ndef b_five : Nat := 0\n' };
    const each: Texts = { ...BASE, [EXTRA]: `${defs('zero')}\n\n${defs('four', 'five', 'one')}\n`, [EXTRA2]: 'def b_zero : Nat := 0\n\ndef b_four : Nat := 0\ndef b_five : Nat := 0\ndef b_one : Nat := 0\n' };
    expect(revert({ base: two, current: each }, ['decl:a_one', 'decl:b_one'])).toEqual(two);
    const first: Texts = { ...BASE, [EXTRA]: `${defs('one', 'two')}\n\n${defs('four', 'five', 'six')}\n` };
    const last: Texts = { ...BASE, [EXTRA]: `${defs('four', 'five', 'six')}\n${defs('one', 'two')}\n` };
    expect(revert({ base: first, current: last }, ['decl:a_one', 'decl:a_two'])).toEqual(first);
  });
});

describe('builder 2c1 (carry-over R2-1): the first of two adjacent declarations ends its last line with whitespace', () => {
  const EXTRA = 'Model/Spyro/Extra.lean';
  const def = (n: string, trailing = '') => `def a_${n} : Nat := 0${trailing}`;
  /** Both layouts: after a unit that stayed in place, and first in the file, before one. */
  const layouts = (trailing: string): Array<{ what: string; base: Texts; moved: Texts }> => [
    {
      what: 'after a kept unit',
      base: { ...BASE, [EXTRA]: `${def('zero')}\n\n${def('one', trailing)}\n${def('two')}\n\n${def('four')}\n${def('five')}\n${def('six')}\n` },
      moved: { ...BASE, [EXTRA]: `${def('zero')}\n\n${def('four')}\n${def('five')}\n${def('six')}\n${def('one', trailing)}\n${def('two')}\n` },
    },
    {
      what: 'first in the file, before a unit',
      base: { ...BASE, [EXTRA]: `${def('one', trailing)}\n${def('two')}\n\n${def('four')}\n${def('five')}\n${def('six')}\n` },
      moved: { ...BASE, [EXTRA]: `${def('four')}\n${def('five')}\n${def('six')}\n${def('one', trailing)}\n${def('two')}\n` },
    },
  ];

  it('both taken out at once give B byte for byte, its trailing spaces and tabs kept; each alone goes back too', () => {
    for (const trailing of ['   ', '\t', ' \t ']) {
      for (const { what, base, moved } of layouts(trailing)) {
        const label = `${what}, ${JSON.stringify(trailing)}`;
        expect([...compareTexts(modelOf(base), modelOf(moved)).moved].sort(), label).toEqual(['a_one', 'a_two']);
        expect(revert({ base, current: moved }, ['decl:a_one', 'decl:a_two']), label).toEqual(base);
        // Alone, each goes back in its place (the other stays where it was moved).
        const one = revert({ base, current: moved }, ['decl:a_one'])[EXTRA] ?? '';
        expect(one, label).toContain(`${def('one', trailing)}\n`);
        expect([...compareTexts(modelOf(base), modelOf({ ...base, [EXTRA]: one })).moved], label).toEqual(['a_two']);
        const two = revert({ base, current: moved }, ['decl:a_two'])[EXTRA] ?? '';
        expect([...compareTexts(modelOf(base), modelOf({ ...base, [EXTRA]: two })).moved], label).toEqual(['a_one']);
      }
    }
  });

  it('the same in a file with CRLF line breaks, and three in a row whose first two end with spaces', () => {
    const crlf = (texts: Texts): Texts => ({ ...texts, [EXTRA]: (texts[EXTRA] ?? '').replace(/\n/g, '\r\n') });
    for (const { what, base, moved } of layouts('  ')) expect(revert({ base: crlf(base), current: crlf(moved) }, ['decl:a_one', 'decl:a_two']), what).toEqual(crlf(base));
    const rest = ['four', 'five', 'six', 'seven'].map((n) => def(n)).join('\n');
    const three: Texts = { ...BASE, [EXTRA]: `${def('zero')}\n\n${def('one', '  ')}\n${def('two', ' ')}\n${def('three')}\n\n${rest}\n` };
    const below: Texts = { ...BASE, [EXTRA]: `${def('zero')}\n\n${rest}\n${def('one', '  ')}\n${def('two', ' ')}\n${def('three')}\n` };
    expect(revert({ base: three, current: below }, ['decl:a_one', 'decl:a_two', 'decl:a_three'])).toEqual(three);
    const head: Texts = { ...BASE, [EXTRA]: `${def('one', '  ')}\n${def('two', ' ')}\n${def('three')}\n\n${rest}\n` };
    const tail: Texts = { ...BASE, [EXTRA]: `${rest}\n${def('one', '  ')}\n${def('two', ' ')}\n${def('three')}\n` };
    expect(revert({ base: head, current: tail }, ['decl:a_one', 'decl:a_two', 'decl:a_three'])).toEqual(head);
  });

  it('R1-2’s scenario: two pending claims adjacent in B, the first ending with spaces, each proved below later content by its own step: both Results out at once give B', () => {
    const later = 'abbrev o_one : Prop := True\nabbrev o_two : Prop := True';
    const base = append(append(withChain(BASE), MAIN, 'axiom t1.holds : t1   \naxiom t2.holds : t2'), MAIN, later);
    const s1 = append(edit(base, MAIN, 'axiom t1.holds : t1   \n', ''), MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
    const s2 = append(edit(s1, MAIN, 'axiom t2.holds : t2\n', ''), MAIN, 'theorem t2.holds : t2 := t1.holds');
    const inferences: SessionInference[] = [
      { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] },
      { target: 't2', question: { sources: ['t1'], fromNothing: false }, order: 1, steps: ['s2'] },
    ];
    const c: Case = { base, current: s2, inferences, ended: ['t1', 't2'] };
    expect([...compareTexts(modelOf(base), modelOf(s2)).moved].sort()).toEqual(['Spyro.t1.holds', 'Spyro.t2.holds']);
    expect(revert(c, ['proof:t1', 'proof:t2'])).toEqual(base);
    // Each alone goes back to its place, its trailing spaces kept.
    expect(revert(c, ['proof:t1'])[MAIN]).toContain('axiom t1.holds : t1   \n');
    expect(revert(c, ['proof:t2'])[MAIN]).toContain('axiom t2.holds : t2\n');
  });
});
