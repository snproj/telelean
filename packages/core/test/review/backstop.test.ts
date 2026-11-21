/**
 * Slice 2b2 (docs/slice2-plan.md 4.10, 6.1, 6.2): the backstop, `applyBackstop`, on the Spyro sample's final states
 * and records made from the final judgement's drafts (as an honest session would hold them), then tampered: one
 * refusal per code, the exemptions, a group-accepted Formalize of a proposition, enclosing lines and a mutual pair.
 */
import { describe, expect, it } from 'vitest';
import { probeFailure } from '../../src/facts.js';
import { applyBackstop } from '../../src/review/backstop.js';
import { fallbackLabel } from '../../src/review/records.js';
import { REVIEW_TEXTS } from '../../src/review/texts.js';
import type { BackstopRefusal, ItemRecord, LedgerEntry, SessionInference, StateJudgement } from '../../src/review/types.js';
import type { FakeFactsOptions } from '../project/helpers/fakeFacts.js';
import { planGhostAdoption } from '../../src/gate/index.js';
import { literal, pinned } from '../gate/helpers/spyroRun.js';
import { FORMALISED, PROVED, judge, withChain } from './helpers/judge.js';
import { AT, idOf, record } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, VOCAB, append, created, edit, modelOf, type Texts } from './helpers/session.js';

const PG = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')];
const HONEST: LedgerEntry[] = [...PG, created(TARGET_HOLDS, 'proof')];

interface Scene {
  base?: Texts;
  final: Texts;
  ledger?: LedgerEntry[];
  inferences?: SessionInference[];
  /** How each item was accepted (default `own`); `null`: in review. */
  how?: Record<string, 'own' | 'group' | null>;
  /** Record fields changed after the fact (tampering), by key. */
  tamper?: Record<string, Partial<ItemRecord>>;
  /** Keys with no record. */
  omit?: string[];
  extra?: ItemRecord[];
  facts?: FakeFactsOptions;
  baseFacts?: FakeFactsOptions;
  judgement?: (j: StateJudgement) => StateJudgement;
}

/** Records an honest session would hold for the final state's items: every one accepted, as its draft and judgement say. */
function recordsOf(s: Scene, j: StateJudgement): ItemRecord[] {
  const items: ItemRecord[] = [];
  for (const d of j.drafts) {
    if ((s.omit ?? []).includes(d.key)) continue;
    const given = s.how?.[d.key];
    const how: 'own' | 'group' | null = given === undefined ? 'own' : given;
    const cls = j.classes[d.key];
    const target = d.key.startsWith('proof:') ? d.key.slice('proof:'.length) : undefined;
    const inference = target !== undefined ? j.inferences[target] : undefined;
    const r = record(d.key, d.kind, {
      ...(d.declKind !== undefined ? { declKind: d.declKind } : {}),
      origin: { ...d.origin },
      ...(d.partOfResult !== undefined ? { partOf: d.partOfResult } : {}),
      fingerprint: d.contentKey,
      content: d.content,
      ...(inference !== undefined ? { judged: { verdict: inference.verdict, restsOn: [...inference.restsOn].sort(), deps: [...(j.deps[d.key] ?? [])].sort() } } : {}),
      ...(how === null
        ? { status: 'in-review' as const }
        : {
            status: 'accepted' as const,
            accepted: {
              how,
              fingerprint: d.contentKey,
              belief: cls?.belief ?? true,
              changesProved: cls?.changesProved ?? true,
              at: AT,
              ...(inference !== undefined ? { result: { verdict: inference.verdict, restsOn: [...inference.restsOn] } } : {}),
            },
          }),
    });
    items.push({ ...r, ...(s.tamper?.[d.key] ?? {}) });
  }
  return [...items, ...(s.extra ?? [])];
}

function backstop(s: Scene) {
  const base = s.base ?? BASE;
  const inferences = s.inferences ?? [INFERENCE];
  const ledger = s.ledger ?? [];
  const ended = inferences.map((inf) => inf.target);
  const judged = judge(s.final, { purpose: 'final', base, inferences, ledger, ended, facts: s.facts ?? {}, baseFacts: s.baseFacts ?? {} });
  const judgement = s.judgement ? s.judgement(judged) : judged;
  const items = recordsOf(s, judged);
  return { ...applyBackstop({ base: modelOf(base, s.baseFacts ?? {}), final: modelOf(s.final, s.facts ?? {}), items, ledger, inferences, judgement }), items, judgement };
}

const codes = (refusals: readonly BackstopRefusal[]) => refusals.map((r) => r.code);
const of = (refusals: readonly BackstopRefusal[], code: BackstopRefusal['code']) => refusals.filter((r) => r.code === code);

describe('applyBackstop: an honest final state passes', () => {
  it('the walkthrough: the Formalize of an axiom card (its own Accept) and the Result; also with nothing at all changed', () => {
    const b = backstop({ final: PROVED, ledger: HONEST });
    expect(b.items.map((r) => r.key)).toEqual(['card:pg-no-dark-past', `proof:${TARGET}`]);
    expect(b.refusals).toEqual([]);
    expect(b.ok).toBe(true);
    // A Result accepted as not proved, nothing else: F is B.
    expect(backstop({ final: BASE }).refusals).toEqual([]);
  });

  it('the exemptions: a presupposition’s helper instance (no own Accept asked for it, though a statement reaches it); a pending target proved, its Result accepted with a group', () => {
    const dragon = edit(FORMALISED, VOCAB, '/-- Cynder -/', '/-- dragons -/\naxiom Dragon : Type\n/-- there is a dragon -/\naxiom Dragon.exists : Nonempty Dragon\ninstance : Nonempty Dragon := Dragon.exists\n/-- Cynder -/');
    const ledger = [created('Spyro.Dragon', 'statements'), created('Spyro.Dragon.exists', 'statements'), created('Spyro.instNonemptyDragon', 'statements')];
    // A card statement reaches the helper instance.
    const facts: FakeFactsOptions = { overrides: { 'Spyro.pg_no_dark_past': { valueConsts: ['Spyro.IsPG', 'Spyro.HasDarkPast', 'Spyro.GoodAddition', 'Spyro.instNonemptyDragon'] } } };
    const own = backstop({ base: FORMALISED, final: dragon, ledger, facts, baseFacts: facts });
    expect(own.items.map((r) => r.key)).toEqual(['decl:Spyro.Dragon.exists', `proof:${TARGET}`, 'vocab:Spyro.Dragon']);
    expect(own.refusals).toEqual([]);
    // With a group: own Accept is asked for the presupposition (a new axiom), never for its helper instance.
    const group = backstop({ base: FORMALISED, final: dragon, ledger, facts, baseFacts: facts, how: { 'decl:Spyro.Dragon.exists': 'group', 'vocab:Spyro.Dragon': 'group' } });
    expect(group.refusals).toEqual([
      { code: 'own-accept', text: REVIEW_TEXTS.backstopOwnAccept('Spyro.Dragon.exists', 'Presupposition Spyro.Dragon.exists'), name: 'Spyro.Dragon.exists', item: idOf('decl:Spyro.Dragon.exists') },
    ]);
    // A pending target proved: `axiom T.holds` became a theorem of the same type; its Result accepted with a group.
    const pending = append(FORMALISED, MAIN, 'axiom cynder_not_good.holds : cynder_not_good');
    const proved = edit(pending, MAIN, 'axiom cynder_not_good.holds : cynder_not_good', 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds');
    const p = backstop({ base: pending, final: proved, ledger: [created(TARGET_HOLDS, 'proof')], how: { [`proof:${TARGET}`]: 'group' } });
    expect(p.refusals).toEqual([]);
  });

  it('fixer 2b2 r1 (A-V2B2-ADV-5): a Result the person rejected, its T.holds as in B again, beside accepted items: it passes', () => {
    const reject: Partial<ItemRecord> = { status: 'declined', decline: { option: 'reject', at: AT }, accepted: undefined };
    // Nothing else changed: F is B, and the rejected Result is B's version (no owner of anything).
    const alone = backstop({ final: BASE, tamper: { [`proof:${TARGET}`]: reject } });
    expect(alone.items.map((r) => [r.key, r.status])).toEqual([[`proof:${TARGET}`, 'declined']]);
    expect(alone.refusals).toEqual([]);
    // The Formalize accepted, the Result taken out (T.holds as in B: none).
    const formalised = backstop({ final: FORMALISED, ledger: PG, tamper: { [`proof:${TARGET}`]: reject } });
    expect(formalised.items.map((r) => [r.key, r.status])).toEqual([
      ['card:pg-no-dark-past', 'accepted'],
      [`proof:${TARGET}`, 'declined'],
    ]);
    expect(formalised.refusals).toEqual([]);
    expect(formalised.ok).toBe(true);
  });

  it('a group-accepted Formalize of a proposition is not own-accept (nor class): a statement abbrev is the card’s own', () => {
    const card = (id: string, sentence: string) => `/-\n@@ telelean v1\nid: ${id}\ntype: PROPOSITION\nnatural_name: ${sentence}\nasserted: 2026-11-01\n-/\n`;
    const base = append(BASE, MAIN, card('q-card', 'Q holds'));
    const final = append(BASE, MAIN, `${card('q-card', 'Q holds').replace('asserted: 2026-11-01\n', 'asserted: 2026-11-01\nlean: Spyro.q_card\n')}/-- Q holds -/\nabbrev q_card : Prop := HasDarkPast cynder`);
    const b = backstop({ base, final, ledger: [created('Spyro.q_card', 'statements')], how: { 'card:q-card': 'group' } });
    expect(b.items.map((r) => r.key)).toEqual(['card:q-card', `proof:${TARGET}`]);
    expect(b.refusals).toEqual([]);
  });

  it('enclosing lines (F13): two accepted items in one new namespace pass, and so does an accepted mutual pair of two items', () => {
    const namespace = append(PROVED, MAIN, 'namespace Lemmas\ntheorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds\ndef Wicked (c : Character) : Prop := HasDarkPast c\nend Lemmas');
    const ns = backstop({ final: namespace, ledger: [...HONEST, created('Spyro.Lemmas.t_lemma', 'proof'), created('Spyro.Lemmas.Wicked', 'statements')] });
    expect(ns.items.map((r) => r.key)).toEqual(['card:pg-no-dark-past', 'decl:Spyro.Lemmas.Wicked', `proof:${TARGET}`]);
    expect(ns.refusals).toEqual([]);
    const mutual = append(PROVED, MAIN, 'mutual\ndef ping (n : Nat) : Prop := True\ndef pong (n : Nat) : Prop := True\nend');
    const mp = backstop({ final: mutual, ledger: [...HONEST, created('Spyro.ping', 'statements'), created('Spyro.pong', 'statements')], how: { 'decl:Spyro.ping': 'group', 'decl:Spyro.pong': 'group' } });
    expect(mp.items.map((r) => r.key)).toEqual(['card:pg-no-dark-past', 'decl:Spyro.ping', 'decl:Spyro.pong', `proof:${TARGET}`]);
    expect(mp.refusals).toEqual([]);
    // One of them not accepted: its declaration is refused, the namespace lines with it (no `unowned` for them).
    const half = backstop({ final: namespace, ledger: [...HONEST, created('Spyro.Lemmas.t_lemma', 'proof'), created('Spyro.Lemmas.Wicked', 'statements')], how: { 'decl:Spyro.Lemmas.Wicked': null } });
    expect(codes(half.refusals)).toEqual(['not-accepted']);
  });
});

describe('applyBackstop: an accepted Add premise, written with its completion (§3.8, AF2)', () => {
  it('passes as an axiom and as pending: its card, arrow and mark removal are the premise’s, the completion the Result’s; without the ledger’s mark removal, `mark`', () => {
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
    const inferences: SessionInference[] = [{ target: TARGET, question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] }];
    for (const holdAs of ['axiom', 'pending'] as const) {
      const plan = planGhostAdoption(modelOf(marked), { ...request, holdAs });
      const written: Texts = { ...marked, [MAIN]: plan.changes[0]?.after as string };
      const final = edit(written, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\ntheorem cynder_not_good.holds : cynder_not_good := not_in_game_not_good.holds cynder newSpyro\n');
      const key = `premise:${TARGET}:not_in_game_not_good`;
      const ledger: LedgerEntry[] = [
        { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs, item: key, commit: 'c-adopt' },
        { kind: 'mark-removed', card: TARGET, item: key, commit: 'c-adopt' },
        { kind: 'completion', target: TARGET, item: key, commit: 'c-complete' },
      ];
      const b = backstop({ base: marked, final, ledger, inferences, tamper: { [key]: { accepted: undefined } } , how: {} });
      // The premise's record as the premise write leaves it: accepted with its hold-as choice and the written key.
      const premise = b.items.find((r) => r.key === key) as ItemRecord;
      expect(premise.kind).toBe('add-premise');
      const fixed = backstop({
        base: marked,
        final,
        ledger,
        inferences,
        tamper: { [key]: { accepted: { how: 'own', fingerprint: premise.fingerprint, belief: true, changesProved: false, at: AT, holdAs } } },
      });
      expect(fixed.refusals, holdAs).toEqual([]);
      // The mark gone without the ledger's mark removal: `mark` (and the field is unowned).
      const noMark = backstop({
        base: marked,
        final,
        ledger: ledger.filter((e) => e.kind !== 'mark-removed'),
        inferences,
        tamper: { [key]: { accepted: { how: 'own', fingerprint: premise.fingerprint, belief: true, changesProved: false, at: AT, holdAs } } },
      });
      expect(codes(noMark.refusals), holdAs).toContain('mark');
    }
  });
});

describe('applyBackstop: one refusal per code', () => {
  it('`facts`: F’s probe failed (one refusal, naming the cause); a definition reached by a statement without typeConsts (D2-25); no facts at all', () => {
    const failed = backstop({ final: PROVED, ledger: HONEST, facts: { probe: { status: 'failed', durationMs: 5, detail: 'probe.lean:3:2: unknown constant' } } });
    expect(of(failed.refusals, 'facts')).toEqual([{ code: 'facts', text: 'telelean could not read what the declarations of this state use in Lean: the probe failed: probe.lean:3:2: unknown constant.' }]);
    expect(codes(failed.refusals).filter((c) => c === 'content-changed')).toEqual([]);
    // Accepted on a state whose probe worked, then F's probe failed: one `facts` refusal, the cause; no item reads as
    // changed after its Accept (its key cannot be computed).
    const good = backstop({ final: PROVED, ledger: HONEST });
    const failedFacts = { probe: { status: 'failed' as const, durationMs: 5, detail: 'x' } };
    const failedJudgement = judge(PROVED, { purpose: 'final', ledger: HONEST, ended: [TARGET], facts: failedFacts });
    const after = applyBackstop({ base: modelOf(BASE), final: modelOf(PROVED, failedFacts), items: good.items, ledger: HONEST, inferences: [INFERENCE], judgement: failedJudgement });
    expect(after.refusals).toEqual([{ code: 'facts', text: 'telelean could not read what the declarations of this state use in Lean: the probe failed: x.' }]);
    const cut = backstop({ final: PROVED, ledger: HONEST, facts: { probe: 'cut' } });
    expect(of(cut.refusals, 'facts').map((r) => r.text)).toEqual([probeFailure({ ...modelOf(PROVED).facts!, probe: { status: 'cut', durationMs: 1 } })]);
    // S5's class-field variant without typeConsts: conservative, and Apply refused.
    const wicked = edit(FORMALISED, VOCAB, '/-- Cynder -/', '/-- wicked -/\nclass Wicked (c : Character) : Prop where\n  p : HasDarkPast c\n/-- Cynder -/');
    const reaching = edit(wicked, MAIN, '¬ GoodAddition c g', 'Wicked c → ¬ GoodAddition c g');
    const gap = backstop({ base: BASE, final: reaching, ledger: [...PG, created('Spyro.Wicked', 'statements')], facts: { overrides: { 'Spyro.Wicked': { noTypeConsts: true } } } });
    expect(of(gap.refusals, 'facts')).toEqual([{ code: 'facts', text: REVIEW_TEXTS.factsMissing, name: 'Spyro.Wicked' }]);
    expect(gap.ok).toBe(false);
    // The same with its typeConsts: a belief, own Accept given: it passes.
    expect(backstop({ base: BASE, final: reaching, ledger: [...PG, created('Spyro.Wicked', 'statements')] }).refusals).toEqual([]);
  });

  it('`facts`: a module that did not build (its items’ declarations lack facts): refused, naming the items, with no `content-changed`', () => {
    const good = backstop({ final: PROVED, ledger: HONEST });
    const unbuilt = { moduleStates: { [MAIN]: 'failed' as const } };
    const j = judge(PROVED, { purpose: 'final', ledger: HONEST, ended: [TARGET], facts: unbuilt });
    const b = applyBackstop({ base: modelOf(BASE), final: modelOf(PROVED, unbuilt), items: good.items, ledger: HONEST, inferences: [INFERENCE], judgement: j });
    expect(of(b.refusals, 'facts').map((r) => r.item)).toEqual(expect.arrayContaining([idOf('card:pg-no-dark-past'), idOf(`proof:${TARGET}`)]));
    expect(codes(b.refusals)).not.toContain('content-changed');
  });

  it('`unowned`: stray command text, and an extra axiom (S6), each named', () => {
    const stray = backstop({ final: edit(PROVED, MAIN, '\nend Spyro', '\nopen Classical\n\nend Spyro'), ledger: HONEST });
    expect(of(stray.refusals, 'unowned')).toEqual([{ code: 'unowned', text: '`open Classical` in Model/Spyro/Main.lean changed, but no review item covers it.' }]);
    const axiom = backstop({ final: append(PROVED, MAIN, 'axiom cynder_is_evil : HasDarkPast cynder'), ledger: HONEST });
    expect(of(axiom.refusals, 'unowned')).toEqual([{ code: 'unowned', text: 'Spyro.cynder_is_evil changed, but no review item covers it.', name: 'Spyro.cynder_is_evil' }]);
  });

  it('`not-accepted` (S4): P’s statement left in F while P is declined; also when the session’s records omit P', () => {
    const declined = backstop({ final: PROVED, ledger: HONEST, tamper: { 'card:pg-no-dark-past': { status: 'declined', decline: { option: 'reject', at: AT } } } });
    const expected = { code: 'not-accepted', text: REVIEW_TEXTS.notAccepted('Spyro.pg_no_dark_past', 'Formalize “pg-no-dark-past”'), name: 'Spyro.pg_no_dark_past' };
    expect(of(declined.refusals, 'not-accepted')).toEqual([{ ...expected, item: idOf('card:pg-no-dark-past') }]);
    const omitted = backstop({ final: PROVED, ledger: HONEST, omit: ['card:pg-no-dark-past'] });
    expect(omitted.refusals).toEqual([expected]);
    // In review, and an arrow item (named by its arrow).
    const arrowLedger: LedgerEntry[] = [...HONEST, { kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w' }];
    const base = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const inference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };
    const arrow = backstop({ base, final: PROVED, ledger: arrowLedger, inferences: [inference], how: { [`arrow:new-spyro-pg>${TARGET}`]: null } });
    expect(of(arrow.refusals, 'not-accepted')).toEqual([
      {
        code: 'not-accepted',
        text: REVIEW_TEXTS.notAccepted('The arrow “The new Spyro game is PG” → “Cynder would not be a good addition to the new Spyro game”', 'Add arrow “new-spyro-pg” → “cynder-not-good”'),
        arrow: { source: 'new-spyro-pg', target: TARGET },
        item: idOf(`arrow:new-spyro-pg>${TARGET}`),
      },
    ]);
  });

  it('`not-written` (AF2): an accepted Add premise with no ledger `premise` entry, or whose card is not in F', () => {
    const premise = record(`premise:${TARGET}:p`, 'add-premise', { status: 'accepted', accepted: { how: 'own', fingerprint: 'fp', belief: true, changesProved: false, at: AT, holdAs: 'axiom' } });
    const none = backstop({ final: PROVED, ledger: HONEST, extra: [premise] });
    expect(none.refusals).toEqual([{ code: 'not-written', text: REVIEW_TEXTS.notWritten(fallbackLabel(premise)), item: premise.id }]);
    const gone = backstop({ final: PROVED, ledger: [...HONEST, { kind: 'premise', card: 'p-card', target: TARGET, holdAs: 'axiom', item: premise.key, commit: 'c' }], extra: [premise] });
    expect(codes(gone.refusals)).toEqual(['not-written']);
  });

  it('`own-accept` (S5): a definition a statement reaches, accepted with a group; a new axiom’s card (an axiom card formalised) with a group', () => {
    const evil = edit(edit(BASE, VOCAB, '/-- Cynder -/', '/-- evil -/\ndef Evil (c : Character) : Prop := HasDarkPast c\n/-- Cynder -/'), MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/\n/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → Evil c → ¬ GoodAddition c g\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n');
    const ledger = [...PG, created('Spyro.Evil', 'statements')];
    const group = backstop({ final: evil, ledger, how: { 'decl:Spyro.Evil': 'group' } });
    expect(group.refusals).toEqual([{ code: 'own-accept', text: REVIEW_TEXTS.backstopOwnAccept('Spyro.Evil', 'Definition Spyro.Evil'), name: 'Spyro.Evil', item: idOf('decl:Spyro.Evil') }]);
    expect(backstop({ final: evil, ledger }).refusals).toEqual([]);
    const card = backstop({ final: PROVED, ledger: HONEST, how: { 'card:pg-no-dark-past': 'group' } });
    expect(card.refusals).toEqual([
      { code: 'own-accept', text: REVIEW_TEXTS.backstopOwnAccept('Spyro.pg_no_dark_past.holds', 'Formalize “pg-no-dark-past”'), name: 'Spyro.pg_no_dark_past.holds', item: idOf('card:pg-no-dark-past') },
    ]);
  });

  it('`content-changed`: an accepted key that differs, an accepted Result’s verdict or Rests on that differs on F, and accepted content gone from F', () => {
    const key = backstop({ final: PROVED, ledger: HONEST, tamper: { 'card:pg-no-dark-past': { accepted: { how: 'own', fingerprint: 'older', belief: true, changesProved: false, at: AT } } } });
    expect(key.refusals).toEqual([{ code: 'content-changed', text: REVIEW_TEXTS.changedAfterAccept('Formalize “pg-no-dark-past”'), item: idOf('card:pg-no-dark-past') }]);
    const accepted = (verdict: 'proved' | 'established' | 'not-proved', restsOn: string[]) => ({
      [`proof:${TARGET}`]: { accepted: { how: 'own' as const, fingerprint: '', belief: false, changesProved: false, at: AT, result: { verdict, restsOn } } },
    });
    const fp = backstop({ final: PROVED, ledger: HONEST }).items.find((r) => r.key === `proof:${TARGET}`)?.fingerprint as string;
    const withKey = (t: ReturnType<typeof accepted>) => ({ [`proof:${TARGET}`]: { accepted: { ...t[`proof:${TARGET}`].accepted, fingerprint: fp } } });
    expect(codes(backstop({ final: PROVED, ledger: HONEST, tamper: withKey(accepted('proved', ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'])) }).refusals)).toEqual(['content-changed']);
    expect(codes(backstop({ final: PROVED, ledger: HONEST, tamper: withKey(accepted('established', ['cynder-dark-past', 'new-spyro-pg'])) }).refusals)).toEqual(['content-changed']);
    expect(backstop({ final: PROVED, ledger: HONEST, tamper: withKey(accepted('established', ['pg-no-dark-past', 'new-spyro-pg', 'cynder-dark-past'])) }).refusals).toEqual([]);
    // An accepted arrow item whose arrow is not in F.
    const arrow = record(`arrow:new-spyro-pg>${TARGET}`, 'add-arrow', { status: 'accepted', accepted: { how: 'own', fingerprint: 'fp-arrow', belief: false, changesProved: true, at: AT } });
    expect(backstop({ final: PROVED, ledger: HONEST, extra: [arrow] }).refusals).toEqual([{ code: 'content-changed', text: REVIEW_TEXTS.changedAfterAccept('Add arrow “new-spyro-pg” → “cynder-not-good”'), item: arrow.id }]);
  });

  it('`class`: an item RV-7 on F (an Add arrow, c4) accepted with a group', () => {
    const base = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const ledger: LedgerEntry[] = [...HONEST, { kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w' }];
    const inference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };
    const key = `arrow:new-spyro-pg>${TARGET}`;
    expect(backstop({ base, final: PROVED, ledger, inferences: [inference] }).refusals).toEqual([]);
    expect(backstop({ base, final: PROVED, ledger, inferences: [inference], how: { [key]: 'group' } }).refusals).toEqual([
      { code: 'class', text: REVIEW_TEXTS.backstopClass('Add arrow “new-spyro-pg” → “cynder-not-good”'), item: idOf(key) },
    ]);
  });

  it('`arrow`: an added arrow no accepted item adds, one into an axiom card, a removed one; `mark`: the mark removed with no accepted premise', () => {
    const base = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const inference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };
    const added = backstop({ base, final: PROVED, ledger: HONEST, inferences: [inference] });
    expect(of(added.refusals, 'arrow')).toEqual([
      { code: 'arrow', text: REVIEW_TEXTS.backstopArrowAdded('The new Spyro game is PG', 'Cynder would not be a good addition to the new Spyro game'), arrow: { source: 'new-spyro-pg', target: TARGET } },
    ]);
    expect(codes(added.refusals)).toContain('unowned');
    const intoAxiom = backstop({ final: edit(PROVED, MAIN, 'id: new-spyro-pg\ntype: ASSUMPTION\n', 'id: new-spyro-pg\ntype: ASSUMPTION\npremises: cynder-dark-past\n'), ledger: HONEST });
    expect(of(intoAxiom.refusals, 'arrow').map((r) => [r.text, r.arrow])).toEqual([
      [REVIEW_TEXTS.backstopArrowIntoAxiom('Cynder is a character who has a dark past', 'The new Spyro game is PG'), { source: 'cynder-dark-past', target: 'new-spyro-pg' }],
    ]);
    const removed = backstop({ final: edit(PROVED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past'), ledger: HONEST });
    expect(of(removed.refusals, 'arrow').map((r) => r.text)).toEqual([REVIEW_TEXTS.backstopArrowRemoved('The new Spyro game is PG', 'Cynder would not be a good addition to the new Spyro game')]);
    const marked = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
    const unmarked = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', '');
    const mark = backstop({ base: marked, final: unmarked, inferences: [{ ...INFERENCE, question: { sources: [], fromNothing: true } }] });
    expect(of(mark.refusals, 'mark')).toEqual([{ code: 'mark', text: REVIEW_TEXTS.backstopMark('Cynder would not be a good addition to the new Spyro game'), name: TARGET }]);
  });

  it('`b2` (S14): a proof that uses a card with no selected or accepted arrow into its target is refused, never applied (§14.7)', () => {
    const inference = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } };
    const b = backstop({ final: PROVED, ledger: HONEST, inferences: [inference] });
    expect(of(b.refusals, 'b2')).toEqual([
      {
        code: 'b2',
        text: REVIEW_TEXTS.backstopUnselected('Cynder would not be a good addition to the new Spyro game', 'The new Spyro game is PG'),
        name: 'Spyro.new_spyro_pg.holds',
        arrow: { source: 'new-spyro-pg', target: TARGET },
      },
    ]);
    // Facts without valueConsts: B.2 cannot see what the proof uses: `facts`.
    const unseen = backstop({ final: PROVED, ledger: HONEST, facts: { valueConsts: false, overrides: { [TARGET_HOLDS]: { noValueConsts: true } } } });
    expect(of(unseen.refusals, 'facts').map((r) => r.name)).toContain(TARGET_HOLDS);
  });

  it('fixer 2b2 r1 (A-V2B2-ADV-6): `b2`: a source the question still lists counts only while its arrow is in F (D2-59, §14.7)', () => {
    // The arrow new-spyro-pg -> the target is in neither B nor F, but the inference's recorded question still lists it.
    const noArrow = (t: Texts) => edit(t, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const b = backstop({ base: noArrow(BASE), final: noArrow(PROVED), ledger: HONEST, inferences: [INFERENCE] });
    expect(of(b.refusals, 'b2')).toEqual([
      {
        code: 'b2',
        text: REVIEW_TEXTS.backstopUnselected('Cynder would not be a good addition to the new Spyro game', 'The new Spyro game is PG'),
        name: 'Spyro.new_spyro_pg.holds',
        arrow: { source: 'new-spyro-pg', target: TARGET },
      },
    ]);
    expect(b.ok).toBe(false);
  });

  it('`cycle` (B.3): a new cycle of drawn arrows, named; a cycle B already had is not counted (AP-13)', () => {
    const base = withChain(BASE);
    const final = edit(base, MAIN, 'natural_name: Cynder has a dark past, once\npremises: cynder-dark-past\n', 'natural_name: Cynder has a dark past, once\npremises: cynder-dark-past, t3\n');
    const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 't3', target: 't1', step: 's9', why: 'w' }];
    const inferences: SessionInference[] = [{ target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s9'] }];
    const b = backstop({ base, final, ledger, inferences });
    expect(codes(b.refusals)).toEqual(['cycle']);
    expect(b.refusals[0]?.text).toBe(REVIEW_TEXTS.backstopCycle(['Cynder has a dark past, thrice', 'Cynder has a dark past, once', 'Cynder has a dark past, twice', 'Cynder has a dark past, thrice']));
    expect(backstop({ base: final, final, inferences }).refusals).toEqual([]);
  });

  it('`kind` (B.4): a proof made an axiom; a proof of a card no inference targets', () => {
    const axiom = backstop({ base: PROVED, final: edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', 'axiom cynder_not_good.holds : cynder_not_good\n') });
    expect(of(axiom.refusals, 'kind')).toEqual([{ code: 'kind', text: REVIEW_TEXTS.backstopKind('theorem-to-axiom', 'Cynder would not be a good addition to the new Spyro game'), name: TARGET_HOLDS }]);
    const base = withChain(BASE);
    const other = backstop({ base, final: append(base, MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds') });
    expect(of(other.refusals, 'kind')).toEqual([{ code: 'kind', text: REVIEW_TEXTS.backstopKind('not-target', 'Cynder has a dark past, once'), name: 'Spyro.t1.holds' }]);
  });

  it('`scc`: a cycle of items with an accepted member that is not wholly accepted', () => {
    const cyclic = (j: StateJudgement): StateJudgement => ({ ...j, deps: { ...j.deps, 'card:pg-no-dark-past': [`proof:${TARGET}`], [`proof:${TARGET}`]: ['card:pg-no-dark-past'] } });
    const b = backstop({ final: PROVED, ledger: HONEST, judgement: cyclic, how: { [`proof:${TARGET}`]: null } });
    expect(of(b.refusals, 'scc')).toEqual([{ code: 'scc', text: REVIEW_TEXTS.acceptOrRejectTogether(['Formalize “pg-no-dark-past”', `Result “${TARGET}”`]) }]);
    expect(of(backstop({ final: PROVED, ledger: HONEST, judgement: cyclic }).refusals, 'scc')).toEqual([]);
  });
});
