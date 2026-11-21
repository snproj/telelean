/**
 * Slice 2b1b (docs/slice2-plan.md 4.8, 4.9, 6.1): `judgeState` over every inference of a session, its step limits, G5
 * against S₀, B.1–B.4, `new-axiom`, `stray-command`, `other-result`, `rejected-repeat`, and `proposeArrowProblems`, on
 * the Spyro sample and edited copies (facts from `fakeFacts`, value and type constants on).
 */
import { describe, expect, it } from 'vitest';
import { ActionError } from '../../src/actions.js';
import { planGhostAdoption } from '../../src/gate/index.js';
import { stepWording } from '../../src/gate/sessionRules.js';
import { judgeState, proposeArrowProblems } from '../../src/review/judge.js';
import { CLAUDE_SESSION_TEXTS } from '../../src/review/texts.js';
import { extraSources, isSessionProof, permittedFor } from '../../src/review/permitted.js';
import { premiseDraftKey } from '../../src/review/items.js';
import type { LedgerEntry, SessionInference, StepScope } from '../../src/review/types.js';
import { CHAIN_INFERENCES, FORMALISED, PROVED, SCOPE, chainProved, freezeOf, judge, tags, withChain, withCode } from './helpers/judge.js';
import { HONEST_PROOF, literal, model, normative, pinned, proved } from '../gate/helpers/spyroRun.js';
import { record } from './helpers/records.js';
import { BASE, INFERENCE, MAIN, TARGET, TARGET_HOLDS, VOCAB, append, created, draftOf, edit, modelOf, type Texts } from './helpers/session.js';

describe('judgeState: a judged state (§4.9)', () => {
  it('passes the walkthrough’s honest proof at a proved finish: commit and files key pass through, both class maps and the dependencies are filled', () => {
    const j = judge(PROVED, { freeze: freezeOf(FORMALISED) });
    expect(j.stepFindings).toEqual([]);
    expect(j.ok).toBe(true);
    expect([j.commit, j.filesKey, j.purpose]).toEqual(['c-judged', 'files-judged', 'gate-proved']);
    expect(j.drafts.map((d) => d.key)).toEqual(['card:pg-no-dark-past', `proof:${TARGET}`]);
    expect(Object.keys(j.classes).sort()).toEqual(['card:pg-no-dark-past', `proof:${TARGET}`]);
    expect(Object.keys(j.classesBeforeReveal).sort()).toEqual(['card:pg-no-dark-past', `proof:${TARGET}`]);
    expect(j.deps[`proof:${TARGET}`]).toEqual(['card:pg-no-dark-past']);
    const t = j.inferences[TARGET];
    expect(t).toMatchObject({ passes: true, verdict: 'established', direct: ['pg-no-dark-past', 'new-spyro-pg', 'cynder-dark-past'], extra: [], throughResults: [] });
    expect(t?.contrib).toEqual({ 'cynder-dark-past': { kind: 'claim' }, 'new-spyro-pg': { kind: 'claim' }, 'pg-no-dark-past': { kind: 'claim' } });
    expect(t?.band).toEqual({ used: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], notNeeded: [], complete: true, open: [] });
    expect(t?.restsOn).toEqual(['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past']);
    expect(t?.footprint).toContain('Spyro.pg_no_dark_past.holds');
  });

  it('judges a three-target chain sources first, whatever order the inferences come in: each session proof counts for the next (B.1), with its RV-5 edge', () => {
    const base = withChain(BASE);
    const current = chainProved(base);
    const ledger = [created('Spyro.t1.holds', 'proof', 's1'), created('Spyro.t2.holds', 'proof', 's2'), created('Spyro.t3.holds', 'proof', 's3')];
    const j = judge(current, { base, purpose: 'stage', inferences: CHAIN_INFERENCES, ledger, ended: ['t1', 't2', 't3'] });
    expect(Object.keys(j.inferences)).toEqual(['t1', 't2', 't3']);
    expect(j.global).toEqual([]);
    for (const t of ['t1', 't2', 't3']) expect(j.inferences[t]?.passes, t).toBe(true);
    expect(j.inferences.t2?.contrib).toEqual({ t1: { kind: 'session-proof' } });
    expect(j.inferences.t2?.throughResults).toEqual(['t1']);
    expect(j.inferences.t3?.throughResults).toEqual(['t2']);
    expect(j.inferences.t1?.contrib).toEqual({ 'cynder-dark-past': { kind: 'claim' } });
    expect(j.deps['proof:t3']).toEqual(['proof:t2']);
    expect(j.deps['proof:t2']).toEqual(['proof:t1']);
    expect(j.inferences.t3?.permitted).toContain('Spyro.cynder_dark_past.holds');
  });

  it('a session proof counts only once its own inference passed in the same state: judged out of order, the next one has nothing from it', () => {
    const base = withChain(BASE);
    const current = chainProved(base, ['t1', 't2']);
    // t2's inference fails (its question is t1, but it uses new_spyro_pg.holds too), so t3 gets nothing from t2.
    const t2Bad = edit(current, MAIN, 'theorem t2.holds : t2 := t1.holds', 'theorem t2.holds : t2 := (fun _ => t1.holds) new_spyro_pg.holds');
    const withT3 = chainProved(t2Bad, ['t3']);
    const ledger = [created('Spyro.t1.holds', 'proof', 's1'), created('Spyro.t2.holds', 'proof', 's2'), created('Spyro.t3.holds', 'proof', 's3')];
    const j = judge(withT3, { base, purpose: 'stage', inferences: CHAIN_INFERENCES, ledger, ended: ['t1', 't2', 't3'] });
    expect(j.inferences.t2?.passes).toBe(false);
    expect(tags(j.inferences.t2?.findings ?? [])).toEqual(['footprint', 'undeclared-premise/unselected']);
    expect(j.inferences.t3?.contrib).toEqual({ t2: { kind: 'nothing', reason: 'not-passing' } });
    expect(j.inferences.t3?.passes).toBe(false);
    expect(j.inferences.t3?.throughResults).toEqual([]);
  });

  it('an inference other than the step’s feeds RV-11 only: its findings stay out of stepFindings', () => {
    const base = withChain(BASE);
    // t1's step runs; the walkthrough's target was proved by an earlier step whose question has no arrow from
    // pg-no-dark-past, although its proof uses it: that inference fails, not t1's step.
    const start = withChain(PROVED);
    const current = chainProved(start, ['t1']);
    const scope: StepScope = { ...SCOPE, step: 's1', target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, fuzzyStatements: [] };
    const narrow = { ...INFERENCE, question: { sources: ['cynder-dark-past', 'new-spyro-pg'], fromNothing: false }, order: 1, steps: ['s0'] };
    const j = judge(current, {
      base,
      stepStart: start,
      scope,
      freeze: freezeOf(start, 't1', ['cynder-dark-past'], base),
      inferences: [narrow, { target: 't1', question: scope.question, order: 0, steps: ['s1'] }],
      ledger: [created('Spyro.cynder_not_good.holds', 'proof', 's0'), created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0')],
    });
    expect(j.inferences[TARGET]?.passes).toBe(false);
    expect(tags(j.inferences[TARGET]?.findings ?? [])).toContain('undeclared-premise/unselected');
    expect(j.inferences.t1?.passes).toBe(true);
    expect(j.stepFindings).toEqual([]);
  });

  it('no inference: only the global rules (an empty session state)', () => {
    const j = judgeState({ purpose: 'stage', stage: 'prove', commit: 'c', filesKey: 'k', base: modelOf(BASE), current: modelOf(BASE), inferences: [], ledger: [], items: [], premises: [], ended: [], rejectedArrows: [] });
    expect(j).toMatchObject({ ok: true, global: [], stepFindings: [], inferences: {}, drafts: [], problems: [] });
  });
});

describe('the step limits (ES-2’s preset, D2-41): `existing-changed` against S₀', () => {
  const statement = '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g';
  /** A later step for the target: pg-no-dark-past was formalised by an earlier step (it is not in B). */
  const later: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
  const earlier = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0')];
  const inference = { ...INFERENCE, steps: ['s0', 's2'] };

  it('an earlier step’s statement changed: token `session`, "leave it exactly as it is in this step"; unchanged, it passes', () => {
    const changed = edit(FORMALISED, MAIN, statement, '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g ∨ True');
    const j = judge(changed, { purpose: 'check', stage: 'formalise', stepStart: FORMALISED, scope: later, inferences: [inference], ledger: earlier, ended: [TARGET] });
    const found = withCode(j.stepFindings, 'existing-changed');
    expect(tags(found)).toEqual(['existing-changed/session']);
    expect(found[0]?.names).toEqual(['Spyro.pg_no_dark_past']);
    expect(found[0]?.message).toContain('was proposed earlier in this session, and the person reviews it: leave it exactly as it is in this step; restore it.');
    expect(judge(FORMALISED, { purpose: 'check', stage: 'formalise', stepStart: FORMALISED, scope: later, inferences: [inference], ledger: earlier, ended: [TARGET] }).stepFindings).toEqual([]);
  });

  it('a fuzzy fill passes; a non-fuzzy empty card filled is G5’s (`formalised`, or `lean` when pinned)', () => {
    expect(judge(FORMALISED, { purpose: 'check', stage: 'formalise' }).stepFindings).toEqual([]);
    const closed: StepScope = { ...SCOPE, fuzzyStatements: [] };
    const pinned = judge(FORMALISED, { purpose: 'check', stage: 'formalise', scope: closed });
    expect(tags(pinned.stepFindings)).toEqual(['markup/lean']);
    const unpinned = judge(edit(FORMALISED, MAIN, 'lean: Spyro.pg_no_dark_past\n', ''), { purpose: 'check', stage: 'formalise', scope: closed });
    expect(tags(unpinned.stepFindings)).toEqual(['markup/formalised']);
  });

  it('a meaning change with unchanged text, through an instance: token `meaning` (the value’s constants changed); the printed value alone too', () => {
    const instance = append(BASE, 'Model/Spyro/Vocabulary.lean', 'instance : Inhabited Character := ⟨cynder⟩');
    const consts = { valueConsts: ['Spyro.HasDarkPast', 'Spyro.cynder', 'Spyro.instInhabitedCharacter'] };
    const j = judge(instance, { purpose: 'check', stage: 'formalise', facts: { overrides: { 'Spyro.cynder_dark_past': consts } } });
    const found = withCode(j.stepFindings, 'existing-changed');
    expect(tags(found)).toEqual(['existing-changed/meaning']);
    expect(found[0]?.names).toEqual(['Spyro.cynder_dark_past']);
    expect(found[0]?.message).toContain('existed when this step started and was changed: in this step only the target\'s proof, the empty Lean statements at the selected arrows and new arrows into the target may change; restore it.');
    expect(found[0]?.message).toContain('the constants its value uses changed');
    const printed = judge(instance, { purpose: 'check', stage: 'formalise', facts: { overrides: { 'Spyro.cynder_dark_past': { value: 'Spyro.HasDarkPast Spyro.cynder ∧ True' } } } });
    expect(tags(withCode(printed.stepFindings, 'existing-changed'))).toEqual(['existing-changed/meaning']);
    // The same instance, with no declaration's meaning changed, passes.
    expect(withCode(judge(instance, { purpose: 'check', stage: 'formalise' }).stepFindings, 'existing-changed')).toEqual([]);
  });

  it('the target’s statement is fixed (`target`); a removed declaration (`removed`); a moved one (`changed`, "It was moved")', () => {
    const weakened = edit(FORMALISED, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∨ True');
    expect(tags(withCode(judge(weakened, { purpose: 'check', stage: 'formalise' }).stepFindings, 'existing-changed'))).toEqual(['existing-changed/target']);
    const removed = edit(FORMALISED, VOCAB, '/-- is rated PG -/\naxiom IsPG : Game → Prop\n', '');
    // new_spyro_pg's statement used it, so its meaning changed too.
    const gone = withCode(judge(removed, { purpose: 'check', stage: 'formalise' }).stepFindings, 'existing-changed');
    expect(gone.map((f) => [f.token, f.names?.[0]])).toEqual([
      ['meaning', 'Spyro.new_spyro_pg'],
      ['removed', 'Spyro.IsPG'],
    ]);
    const moved = edit(edit(FORMALISED, VOCAB, '/-- is rated PG -/\naxiom IsPG : Game → Prop\n', ''), VOCAB, '/-- Cynder -/', '/-- is rated PG -/\naxiom IsPG : Game → Prop\n/-- Cynder -/');
    const found = withCode(judge(moved, { purpose: 'check', stage: 'formalise' }).stepFindings, 'existing-changed');
    expect(tags(found)).toEqual(['existing-changed/changed']);
    expect(found[0]?.message).toContain('It was moved: a declaration stays where it is.');
  });

  it('the person’s text outside declarations stays: a comment the step removed is `text` (fixer 2b1b r1, S-F4: not `removed`, which names a declaration)', () => {
    const noted = append(BASE, MAIN, '-- a note of the person');
    const j = judge(append(FORMALISED, MAIN, ''), { purpose: 'check', stage: 'formalise', base: noted, stepStart: noted });
    expect(tags(withCode(j.stepFindings, 'existing-changed'))).toEqual(['existing-changed/text']);
    expect(withCode(j.stepFindings, 'existing-changed')[0]?.names).toEqual(['-- a note of the person']);
    expect(withCode(j.stepFindings, 'existing-changed')[0]?.message).toMatch(/^Model\/Spyro\/Main\.lean:\d+: `-- a note of the person` stood here when this step started/);
  });

  it('`openItems` opens their declarations (a Submit step); the target’s proof is open under `openProof` only', () => {
    const changed = edit(FORMALISED, MAIN, statement, '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g ∨ True');
    const submit: StepScope = { ...later, openItems: ['card:pg-no-dark-past'] };
    expect(withCode(judge(changed, { purpose: 'check', stage: 'formalise', stepStart: FORMALISED, scope: submit, inferences: [inference], ledger: earlier, ended: [TARGET] }).stepFindings, 'existing-changed')).toEqual([]);
    // A statements-only step (A12): its target's proof is closed; a proof it adds is refused, named after the source.
    const only: StepScope = { ...SCOPE, openProof: false, openArrows: false, statementsOnly: 'new-spyro-pg' };
    const j = judge(PROVED, { purpose: 'gate-other', freeze: freezeOf(FORMALISED), scope: only });
    const found = withCode(j.stepFindings, 'existing-changed');
    expect(tags(found)).toEqual(['existing-changed/closed-proof']);
    expect(found[0]?.names).toEqual([TARGET_HOLDS]);
    expect(found[0]?.message).toContain('the target\'s proof is closed in this step (it only formalises the statements: “new-spyro-pg” was not proved)');
    // With the proof open, the same state has no step-limit finding.
    expect(withCode(judge(PROVED, { purpose: 'gate-proved', freeze: freezeOf(FORMALISED) }).stepFindings, 'existing-changed')).toEqual([]);
  });

  it('only at step purposes: a stage judgement has no step limits', () => {
    const changed = edit(FORMALISED, MAIN, statement, '∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g ∨ True');
    expect(withCode(judge(changed, { purpose: 'stage', ledger: earlier, inferences: [inference] }).global, 'existing-changed')).toEqual([]);
  });
});

describe('G5 against S₀, and B.3 (`arrow`): Claude never edits a field; telelean writes the ledger’s arrows', () => {
  /** pg-no-dark-past formalised in B, and only one arrow drawn into the target. */
  const B1 = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past');
  const PROOF = proved(B1);
  const q1 = { sources: ['cynder-dark-past'], fromNothing: false };
  const scope: StepScope = { ...SCOPE, question: q1, fuzzyStatements: [] };
  const inference = { ...INFERENCE, question: q1 };
  const TARGET_PREMISES = 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past\n';
  const arrow = (texts: Texts, sources: string) =>
    edit(texts, MAIN, TARGET_PREMISES, `natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, ${sources}\n`);
  const ledgerArrow = (source: string, step = 's1') => ({ kind: 'arrow' as const, source, target: TARGET, step, why: 'the proof needs it', written: 'c-normalise' });
  const opts = (o: Parameters<typeof judge>[1] = {}) => ({ base: B1, scope, inferences: [inference], freeze: freezeOf(B1, TARGET, q1.sources, B1), ...o });

  it('G5 on edited `premises:`: an entry no ledger entry explains is `markup` (`premises`), added or removed; the ledger’s arrows pass, and E(T) then lets the proof use them (B.2)', () => {
    const edited = judge(arrow(B1, 'new-spyro-pg, pg-no-dark-past'), opts({ purpose: 'check', stage: 'formalise' }));
    expect(tags(edited.stepFindings)).toEqual(['markup/premises']);
    expect(edited.stepFindings[0]?.message).toContain('never edit `premises:`; propose an arrow with propose_arrow (telelean writes it)');
    const written = judge(arrow(PROOF, 'new-spyro-pg, pg-no-dark-past'), opts({ ledger: [ledgerArrow('new-spyro-pg'), ledgerArrow('pg-no-dark-past')] }));
    expect(written.stepFindings).toEqual([]);
    expect(written.inferences[TARGET]?.extra).toEqual(['new-spyro-pg', 'pg-no-dark-past']);
    const removed = judge(edit(B1, MAIN, TARGET_PREMISES, 'natural_name: Cynder would not be a good addition to the new Spyro game\n'), opts({ purpose: 'check', stage: 'formalise' }));
    expect(tags(removed.stepFindings)).toEqual(['markup/premises']);
  });

  it('G5: `follows_from:` goes only through a ledger `mark-removed`; `type:` never changes; a new block only for a ledger premise', () => {
    const marked = edit(BASE, MAIN, 'id: pg-no-dark-past\ntype: ASSUMPTION\n', 'id: pg-no-dark-past\ntype: PROPOSITION\nfollows_from: nothing\n');
    const unmarked = edit(marked, MAIN, 'type: PROPOSITION\nfollows_from: nothing\n', 'type: PROPOSITION\n');
    expect(tags(judge(unmarked, { purpose: 'check', stage: 'formalise', base: marked }).stepFindings)).toEqual(['markup/follows_from']);
    const premise = { kind: 'mark-removed' as const, card: 'pg-no-dark-past', item: 'premise:pg-no-dark-past:p', commit: 'c-premise' };
    expect(judge(unmarked, { purpose: 'check', stage: 'formalise', base: marked, ledger: [premise] }).stepFindings).toEqual([]);
    const kind = edit(BASE, MAIN, 'id: pg-no-dark-past\ntype: ASSUMPTION\n', 'id: pg-no-dark-past\ntype: PROPOSITION\n');
    expect(tags(judge(kind, { purpose: 'check', stage: 'formalise' }).stepFindings)).toEqual(['markup/type']);
    const card = '/-\n@@ telelean v1\nid: extra-card\ntype: AXIOM\nnatural_name: An extra card\nasserted: 2026-11-01\n-/';
    expect(tags(judge(append(BASE, MAIN, card), { purpose: 'check', stage: 'formalise' }).stepFindings)).toEqual(['markup/block']);
    const written = { kind: 'premise' as const, card: 'extra-card', target: TARGET, holdAs: 'axiom' as const, item: `premise:${TARGET}:extra`, commit: 'c-premise' };
    expect(judge(append(BASE, MAIN, card), { purpose: 'stage', ledger: [written] }).global).toEqual([]);
  });

  it('B.3 ignores the ledger arrow of a declined arrow item; one still drawn is `arrow` (`declined`)', () => {
    const items = [
      {
        id: 'it0000000000000001',
        key: `arrow:new-spyro-pg>${TARGET}`,
        kind: 'add-arrow' as const,
        rev: 1,
        origin: { step: 's0', target: TARGET, phase: 'proof' as const },
        partOf: TARGET,
        status: 'declined' as const,
        decline: { option: 'plain' as const, at: 'now' },
        markers: [],
        fingerprint: 'fp',
        content: { decls: [] },
        versions: [],
        rejectedFingerprints: ['fp'],
      },
    ];
    const ledger = [ledgerArrow('new-spyro-pg', 's0')];
    const rejectedArrows = [{ source: 'new-spyro-pg', target: TARGET }];
    const gone = judge(B1, { base: B1, purpose: 'stage', inferences: [inference], ledger, items, rejectedArrows });
    expect(gone.global).toEqual([]);
    expect(gone.inferences[TARGET]?.extra).toEqual([]);
    const still = judge(arrow(B1, 'new-spyro-pg'), { base: B1, purpose: 'stage', inferences: [inference], ledger, items, rejectedArrows });
    expect(tags(still.global)).toEqual(['arrow/declined']);
  });

  it('B.3 at the gate: each arrow the step added is checked again (not-target, into-axiom, no-holds, declined, other-target, drawn); a legal one passes', () => {
    const base = withChain(B1);
    const chain = (texts: Texts) => edit(texts, MAIN, 'premises: t1\n', 'premises: t1, cynder-dark-past\n');
    // into t2, which is no target of this step (the chain's cards are propositions with no .holds).
    const notTarget = judge(chain(base), { ...opts({ base, ledger: [{ ...ledgerArrow('cynder-dark-past'), target: 't2' }] }), freeze: freezeOf(base, TARGET, q1.sources, base) });
    expect(tags(withCode(notTarget.stepFindings, 'arrow'))).toEqual(['arrow/not-target']);
    // from t1, which has no .holds, and is another target of the session.
    const t1 = { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s0'] };
    const fromT1 = judge(arrow(base, 't1'), { ...opts({ base, ledger: [ledgerArrow('t1')], inferences: [t1, { ...inference, order: 1 }] }), freeze: freezeOf(base, TARGET, q1.sources, base) });
    expect(tags(withCode(fromT1.stepFindings, 'arrow'))).toEqual(['arrow/no-holds', 'arrow/other-target']);
    // declined before: `rejected-repeat` (`arrow`) says it, B.3 not again (fixer 2b1b r1, S-F7: one finding per problem).
    const declined = judge(arrow(B1, 'new-spyro-pg'), opts({ ledger: [ledgerArrow('new-spyro-pg')], rejectedArrows: [{ source: 'new-spyro-pg', target: TARGET }] }));
    expect(withCode(declined.stepFindings, 'arrow')).toEqual([]);
    expect(tags(withCode(declined.stepFindings, 'rejected-repeat'))).toEqual(['rejected-repeat/arrow']);
    // drawn already when the step started.
    const drawn = judge(PROOF, opts({ ledger: [ledgerArrow('cynder-dark-past')] }));
    expect(tags(withCode(drawn.stepFindings, 'arrow'))).toEqual(['arrow/drawn']);
    // into an axiom card.
    const intoAxiom = edit(B1, MAIN, 'id: new-spyro-pg\ntype: ASSUMPTION\n', 'id: new-spyro-pg\ntype: ASSUMPTION\npremises: cynder-dark-past\n');
    const axiom = judge(intoAxiom, opts({ ledger: [{ ...ledgerArrow('cynder-dark-past'), target: 'new-spyro-pg' }] }));
    expect(tags(withCode(axiom.stepFindings, 'arrow'))).toEqual(['arrow/not-target', 'arrow/into-axiom']);
    // A legal arrow: from a card with a .holds, into the target, not drawn, not declined.
    expect(withCode(judge(arrow(PROOF, 'new-spyro-pg'), opts({ ledger: [ledgerArrow('new-spyro-pg')] })).stepFindings, 'arrow')).toEqual([]);
    // An earlier step's arrow is not checked again for other-target (check 3's exception, §4.12).
    const t1Proved = chainProved(base, ['t1']);
    const earlier = judge(arrow(t1Proved, 't1'), { ...opts({ base, stepStart: arrow(t1Proved, 't1'), ledger: [ledgerArrow('t1', 's0')], inferences: [t1, { ...inference, order: 1 }] }), freeze: freezeOf(arrow(t1Proved, 't1'), TARGET, q1.sources, base) });
    expect(withCode(earlier.stepFindings, 'arrow')).toEqual([]);
  });

  it('B.3: the drawn and solid arrows are acyclic; a cycle B already had is never counted (AP-13)', () => {
    const card = (id: string, premise: string, proof: boolean) =>
      `/-\n@@ telelean v1\nid: ${id}\ntype: PROPOSITION\nnatural_name: Card ${id}\npremises: ${premise}\nasserted: 2026-11-01\nlean: Spyro.${id}\n-/\n/-- Card ${id} -/\nabbrev ${id} : Prop := HasDarkPast cynder\n${proof ? `theorem ${id}.holds : ${id} := cynder_dark_past.holds\n` : ''}`;
    const looped = append(B1, MAIN, [card('ca', 'cb', false), card('cb', 'ca', false)].join('\n'));
    expect(withCode(judge(looped, { base: looped, purpose: 'stage', inferences: [inference] }).global, 'arrow')).toEqual([]);
    // A card x that rests on the target (drawn), and Claude's arrow x -> target: a new cycle.
    const withX = append(B1, MAIN, card('cx', TARGET, true));
    const closed = arrow(withX, 'cx');
    const j = judge(closed, { base: withX, purpose: 'stage', inferences: [inference], ledger: [ledgerArrow('cx', 's0')] });
    const cycle = withCode(j.global, 'arrow');
    expect(tags(cycle)).toEqual(['arrow/cycle']);
    expect(cycle[0]?.message).toContain('now form a cycle: “cx” → “cynder-not-good” → “cx”');
  });
});

describe('proposeArrowProblems (§4.9): propose_arrow’s refusals, each with its token and text', () => {
  const B1 = edit(FORMALISED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past');
  const scope: StepScope = { ...SCOPE, question: { sources: ['cynder-dark-past'], fromNothing: false }, fuzzyStatements: [] };
  const ask = (source: string, target = TARGET, o: { texts?: Texts; scope?: StepScope; rejected?: Array<{ source: string; target: string }>; ledger?: Parameters<typeof proposeArrowProblems>[0]['ledger']; inferences?: Parameters<typeof proposeArrowProblems>[0]['inferences'] } = {}) =>
    proposeArrowProblems({ current: modelOf(o.texts ?? B1), scope: o.scope ?? scope, inferences: o.inferences ?? [INFERENCE], ledger: o.ledger ?? [], rejectedArrows: o.rejected ?? [], source, target });

  it('accepts a legal arrow: [] (from a card with a .holds, into the target, not drawn, not declined, no cycle)', () => {
    expect(ask('new-spyro-pg')).toEqual([]);
  });

  it('refuses each case with its exact text', () => {
    expect(ask('new-spyro-pg', 'cynder-dark-past')).toEqual([
      { token: 'not-target', text: `You may add arrows only into “${TARGET}” in this step.` },
      { token: 'into-axiom', text: '“cynder-dark-past” is an axiom: an arrow into it would make it a proposition, which only the person decides.' },
    ]);
    expect(ask('new-spyro-pg', TARGET, { scope: { ...scope, question: { sources: [], fromNothing: true }, openArrows: false } })).toEqual([
      { token: 'mark', text: `The person marked “${TARGET}” as following from nothing: propose a missing premise with propose_assumption instead.` },
    ]);
    expect(ask('pg-no-dark-past', TARGET, { texts: edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past') })).toEqual([
      { token: 'no-holds', text: '“pg-no-dark-past” has no proof and no claim: the proof cannot use it.' },
    ]);
    expect(ask('new-spyro-pg', TARGET, { rejected: [{ source: 'new-spyro-pg', target: TARGET }] })).toEqual([
      { token: 'declined', text: `The person declined “new-spyro-pg” → “${TARGET}” in this session: do not propose it again.` },
    ]);
    expect(ask('cynder-dark-past')).toEqual([{ token: 'drawn', text: 'That arrow is drawn already.' }]);
    expect(ask('new-spyro-pg', TARGET, { ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w' }] })).toEqual([{ token: 'drawn', text: 'That arrow is drawn already.' }]);
    expect(ask('nope')).toEqual([{ token: 'unknown-card', text: 'No card "nope" (it may have been deleted).' }]);
    expect(ask('Spyro.IsPG')).toEqual([{ token: 'unknown-card', text: 'Spyro.IsPG is vocabulary: arrows join axioms and propositions only.' }]);
    // The target itself: a self-arrow (and it has no .holds).
    expect(ask(TARGET)).toEqual([
      { token: 'cycle', text: 'A card cannot have an arrow into itself.' },
      { token: 'no-holds', text: `“${TARGET}” has no proof and no claim: the proof cannot use it.` },
    ]);
    const t1 = { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s0'] };
    const proved = chainProved(withChain(B1), ['t1']);
    expect(ask('t1', TARGET, { texts: proved, inferences: [t1, INFERENCE] })).toEqual([
      { token: 'other-target', text: `“t1” is another target of this session: “${TARGET}” may use it only through an arrow the person selected.` },
    ]);
    // A cycle: t1 rests on the target (its arrow drawn), so t1 -> target closes it.
    const looped = edit(proved, MAIN, 'id: t1\ntype: PROPOSITION\nnatural_name: Cynder has a dark past, once\npremises: cynder-dark-past', `id: t1\ntype: PROPOSITION\nnatural_name: Cynder has a dark past, once\npremises: cynder-dark-past, ${TARGET}`);
    expect(ask('t1', TARGET, { texts: looped })).toEqual([
      { token: 'cycle', text: 'This arrow would make a cycle: Cynder has a dark past, once → Cynder would not be a good addition to … → Cynder has a dark past, once.' },
    ]);
    // A statements-only step (A12) refuses every arrow.
    expect(ask('new-spyro-pg', TARGET, { scope: { ...scope, openArrows: false, openProof: false, statementsOnly: 'new-spyro-pg' } })).toEqual([
      { token: 'not-target', text: 'This step only formalises the statements: “new-spyro-pg” was not proved.' },
    ]);
  });
});

describe('B.4 (`holds-kind`) and `new-axiom` against B by name and type', () => {
  const pending = append(FORMALISED, MAIN, 'axiom cynder_not_good.holds : cynder_not_good');

  it('Claude writes `axiom T.holds : T` for a proposition: `axiom-for-proposition` (B.4 says it, not new-axiom too)', () => {
    const j = judge(pending, { freeze: freezeOf(FORMALISED), purpose: 'gate-other' });
    expect(tags(withCode(j.stepFindings, 'holds-kind'))).toEqual(['holds-kind/axiom-for-proposition']);
    expect(withCode(j.stepFindings, 'new-axiom')).toEqual([]);
    expect(withCode(j.stepFindings, 'holds-kind')[0]?.message).toContain('Claude never writes an axiom .holds for a proposition');
  });

  it('a theorem made an axiom with the same name: `theorem-to-axiom` (B.4) and `type-changed` (new-axiom: a reused name)', () => {
    const j = judge(pending, { base: PROVED, stepStart: PROVED, purpose: 'gate-other', freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) });
    expect(tags(withCode(j.stepFindings, 'holds-kind'))).toEqual(['holds-kind/theorem-to-axiom']);
    expect(tags(withCode(j.stepFindings, 'new-axiom'))).toEqual(['new-axiom/type-changed']);
  });

  it('a pending target proved: from axiom to theorem with the identical type passes; another type is `type-changed`', () => {
    const sameType = edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=', 'theorem cynder_not_good.holds : cynder_not_good :=');
    expect(withCode(judge(sameType, { base: pending, stepStart: pending, freeze: freezeOf(pending, TARGET, INFERENCE.question.sources, pending) }).stepFindings, 'holds-kind')).toEqual([]);
    const otherType = edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=', 'theorem cynder_not_good.holds : ¬ GoodAddition cynder newSpyro :=');
    const j = judge(otherType, { base: pending, stepStart: pending, freeze: freezeOf(pending, TARGET, INFERENCE.question.sources, pending) });
    expect(tags(withCode(j.stepFindings, 'holds-kind'))).toEqual(['holds-kind/type-changed']);
  });

  it('`new-axiom`: B’s axioms and shape-passing vocabulary pass; a Prop axiom bound to no card is a `belief` (D2-40); a reused name `type-changed`', () => {
    const vocab = append(BASE, VOCAB, '/-- is evil -/\naxiom IsEvil : Character → Prop');
    expect(withCode(judge(vocab, { purpose: 'check', stage: 'formalise' }).stepFindings, 'new-axiom')).toEqual([]);
    const belief = append(BASE, VOCAB, '/-- evil -/\naxiom cynder_is_evil : HasDarkPast cynder');
    expect(tags(withCode(judge(belief, { purpose: 'check', stage: 'formalise' }).stepFindings, 'new-axiom'))).toEqual(['new-axiom/belief']);
    const reused = edit(BASE, VOCAB, 'noncomputable opaque cynder : Character', 'axiom cynder : Character');
    const j = judge(reused, { purpose: 'check', stage: 'formalise' });
    expect(tags(withCode(j.stepFindings, 'new-axiom'))).toEqual(['new-axiom/type-changed']);
    expect(withCode(j.stepFindings, 'new-axiom')[0]?.message).toContain('reuses the name of a declaration of the person\'s files');
    // After the freeze no axiom may be added, vocabulary included (slice 1's rule).
    const late = judge(append(PROVED, VOCAB, '/-- is evil -/\naxiom IsEvil : Character → Prop'), { freeze: freezeOf(FORMALISED) });
    expect(tags(withCode(late.stepFindings, 'new-axiom'))).toEqual(['new-axiom/after-freeze']);
  });

  it('`new-axiom` allows the .holds of an axiom card formalised in this session, stating exactly its statement, and of a ledger premise', () => {
    // pg-no-dark-past's `axiom … .holds` comes with its fuzzy fill (FORMALISED): no finding.
    expect(withCode(judge(FORMALISED, { purpose: 'check', stage: 'formalise' }).stepFindings, 'new-axiom')).toEqual([]);
    // A premise card telelean wrote (ledger `premise`), as pending: a proposition with `axiom P.holds`.
    const premise =
      '/-\n@@ telelean v1\nid: cynder-evil\ntype: PROPOSITION\nnatural_name: Cynder is evil\nasserted: 2026-11-01\nlean: Spyro.cynder_evil\n-/\n/-- Cynder is evil -/\nabbrev cynder_evil : Prop := HasDarkPast cynder\naxiom cynder_evil.holds : cynder_evil';
    const ledger = [{ kind: 'premise' as const, card: 'cynder-evil', target: TARGET, holdAs: 'pending' as const, item: `premise:${TARGET}:cynder_evil`, commit: 'c-premise' }];
    const j = judge(append(FORMALISED, MAIN, premise), { purpose: 'stage', ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), ...ledger] });
    expect(withCode(j.global, 'new-axiom')).toEqual([]);
    expect(withCode(j.global, 'holds-kind')).toEqual([]);
  });
});

describe('B.2 (`undeclared-premise`) with E(T), and B.1 (`permittedFor`)', () => {
  const TARGET_PREMISES = 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n';
  const without = (texts: Texts, source: string) =>
    edit(texts, MAIN, TARGET_PREMISES, TARGET_PREMISES.replace(`, ${source}`, '').replace(`${source}, `, ''));

  it('an unselected card is refused (`unselected`), its message proposing the arrow; the selected ones pass', () => {
    const narrow = { sources: ['cynder-dark-past', 'new-spyro-pg'], fromNothing: false };
    const j = judge(PROVED, { freeze: freezeOf(FORMALISED, TARGET, narrow.sources), scope: { ...SCOPE, question: narrow }, inferences: [{ ...INFERENCE, question: narrow }] });
    const found = withCode(j.stepFindings, 'undeclared-premise');
    expect(tags(found)).toEqual(['undeclared-premise/unselected']);
    expect(found[0]?.nodeId).toBe('pg-no-dark-past');
    expect(found[0]?.inference).toBe(TARGET);
    expect(found[0]?.message).toContain('Either propose the arrow with propose_arrow (it becomes an item for the person), or prove the target without it.');
    expect(j.inferences[TARGET]?.missing).toEqual([{ source: 'pg-no-dark-past', drawn: true }]);
    expect(withCode(judge(PROVED, { freeze: freezeOf(FORMALISED) }).stepFindings, 'undeclared-premise')).toEqual([]);
  });

  it('without the elaborated values the proof is refused (`source-only`), never judged from the `.ilean` references', () => {
    const j = judge(PROVED, { freeze: freezeOf(FORMALISED), facts: { valueConsts: false } });
    expect(tags(withCode(j.stepFindings, 'undeclared-premise'))).toEqual(['undeclared-premise/source-only']);
  });

  it('a question source counts only while its arrow exists (D2-59): its Claude arrow declined, the proof that uses it is refused', () => {
    // Fixer 2b1b r1 (S-F9): the real case. B lacks new-spyro-pg -> T; an earlier step drew it as Claude's arrow (ledger
    // `arrow`), a mid-stage Formalize selected it into T's question, and the person declined it (DO-0): its decline
    // took it out of `premises:`, and the question still names the source.
    const B1 = without(FORMALISED, 'new-spyro-pg');
    const declined = without(PROVED, 'new-spyro-pg');
    const arrowItem = record(`arrow:new-spyro-pg>${TARGET}`, 'add-arrow', { status: 'declined', decline: { option: 'plain', at: 'now' }, origin: { step: 's0', target: TARGET, phase: 'proof' }, partOf: TARGET });
    const ledger = [{ kind: 'arrow' as const, source: 'new-spyro-pg', target: TARGET, step: 's0', why: 'w', written: 'c' }, created(TARGET_HOLDS, 'proof', 's1')];
    const inferences = [{ ...INFERENCE, steps: ['s0', 's1'] }];
    const j = judge(declined, { base: B1, purpose: 'stage', inferences, ledger, items: [arrowItem], rejectedArrows: [{ source: 'new-spyro-pg', target: TARGET }] });
    expect(INFERENCE.question.sources).toContain('new-spyro-pg');
    expect(Object.keys(j.inferences[TARGET]?.contrib ?? {})).toEqual(['cynder-dark-past', 'pg-no-dark-past']);
    expect(j.inferences[TARGET]?.extra).toEqual([]);
    expect(tags(j.inferences[TARGET]?.findings ?? [])).toEqual(['footprint', 'undeclared-premise/unselected']);
    expect(j.inferences[TARGET]?.passes).toBe(false);
    expect(j.inferences[TARGET]?.missing).toEqual([{ source: 'new-spyro-pg', drawn: false }]);
    expect(j.global).toEqual([]);
    // The same arrow drawn and not declined: a source again (Q(T) and E(T)), and the proof passes.
    const drawn = judge(PROVED, { base: B1, purpose: 'stage', inferences, ledger });
    expect(drawn.inferences[TARGET]?.extra).toEqual(['new-spyro-pg']);
    expect(drawn.inferences[TARGET]?.passes).toBe(true);
    expect(drawn.global).toEqual([]);
  });

  it('E(T): Claude’s arrows in the ledger that are not declined, and T’s written premises, are sources (B.1 and B.2)', () => {
    const narrow = { sources: ['cynder-dark-past'], fromNothing: false };
    const ledger = [
      { kind: 'arrow' as const, source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w', written: 'c' },
      { kind: 'premise' as const, card: 'pg-no-dark-past', target: TARGET, holdAs: 'axiom' as const, item: `premise:${TARGET}:p`, commit: 'c' },
    ];
    const j = judge(PROVED, { freeze: freezeOf(FORMALISED, TARGET, narrow.sources), scope: { ...SCOPE, question: narrow }, inferences: [{ ...INFERENCE, question: narrow }], ledger });
    expect(j.inferences[TARGET]?.extra).toEqual(['new-spyro-pg', 'pg-no-dark-past']);
    expect(withCode(j.stepFindings, 'undeclared-premise')).toEqual([]);
    expect(withCode(j.stepFindings, 'footprint')).toEqual([]);
  });
});

describe('permittedFor (B.1, §4.8): what each source contributes', () => {
  const base = withChain(BASE);
  const t2 = (current: Texts, earlier: Record<string, boolean> = { t1: true }, o: { base?: Texts; items?: Parameters<typeof permittedFor>[0]['items']; ledger?: Parameters<typeof permittedFor>[0]['ledger'] } = {}) =>
    permittedFor({
      base: modelOf(o.base ?? base),
      current: modelOf(current),
      target: 't2',
      inferences: CHAIN_INFERENCES,
      ledger: o.ledger ?? [],
      items: o.items ?? [],
      earlier: Object.fromEntries(Object.entries(earlier).map(([t, passes]) => [t, { passes } as never])),
    });

  it('a session proof whose inference passed counts, with its footprint and the RV-5 edge; whatever the records say (in review, Shaky): the state decides', () => {
    const current = chainProved(base, ['t1']);
    const record = (status: 'in-review' | 'declined') => ({
      id: 'it00000000000000aa',
      key: 'proof:t1',
      kind: 'result' as const,
      rev: 1,
      origin: { step: 's1', target: 't1', phase: 'proof' as const },
      status,
      ...(status === 'declined' ? { decline: { option: 'shaky' as const, at: 'now' } } : {}),
      markers: [],
      fingerprint: 'fp',
      content: { decls: [] },
      versions: [],
      rejectedFingerprints: [],
    });
    const plain = t2(current);
    expect(plain.contrib).toEqual({ t1: { kind: 'session-proof' } });
    expect(plain.throughResults).toEqual(['t1']);
    expect(plain.extra).toEqual([]);
    expect(plain.permitted).toContain('Spyro.cynder_dark_past.holds');
    expect(plain.permitted).not.toContain('Spyro.t2.holds');
    expect(t2(current, { t1: true }, { items: [record('in-review')] })).toEqual(plain);
    expect(t2(current, { t1: true }, { items: [record('declined')] })).toEqual(plain);
  });

  it('a session proof that does not pass, or was not judged before T, gives nothing (`not-passing`)', () => {
    const current = chainProved(base, ['t1']);
    expect(t2(current, { t1: false })).toMatchObject({ contrib: { t1: { kind: 'nothing', reason: 'not-passing' } }, throughResults: [] });
    expect(t2(current, {}).contrib).toEqual({ t1: { kind: 'nothing', reason: 'not-passing' } });
    expect(t2(current, { t1: false }).permitted).not.toContain('Spyro.cynder_dark_past.holds');
  });

  it('a rejected session proof gives what B’s .holds gives: nothing without one; the person’s own proof (`own-proof`); a pending claim (`claim`, pending)', () => {
    expect(t2(base).contrib).toEqual({ t1: { kind: 'nothing', reason: 'no-holds' } });
    const own = chainProved(base, ['t1']);
    expect(t2(own, { t1: false }, { base: own })).toMatchObject({ contrib: { t1: { kind: 'own-proof' } }, throughResults: [] });
    const claim = append(base, MAIN, 'axiom t1.holds : t1');
    const pending = t2(claim, {}, { base: claim });
    expect(pending.contrib).toEqual({ t1: { kind: 'claim', pending: true } });
    expect(pending.permitted).toContain('Spyro.t1.holds');
  });

  it('nothing, with why: a conditional proof, a mismatched .holds, a proof resting on T’s own pending claim (`circular`)', () => {
    const conditional = append(base, MAIN, 'theorem t1.holds : cynder_dark_past → t1 := fun h => h');
    expect(t2(conditional).contrib).toEqual({ t1: { kind: 'nothing', reason: 'conditional' } });
    const mismatch = append(base, MAIN, 'theorem t1.holds : IsPG newSpyro := new_spyro_pg.holds');
    expect(t2(mismatch).contrib).toEqual({ t1: { kind: 'nothing', reason: 'mismatch' } });
    const circular = append(append(base, MAIN, 'axiom t2.holds : t2'), MAIN, 'theorem t1.holds : t1 := t2.holds');
    expect(t2(circular, { t1: true }, { base: append(base, MAIN, 'axiom t2.holds : t2') }).contrib).toEqual({ t1: { kind: 'nothing', reason: 'circular' } });
  });

  it('E(T): ledger arrows into T whose item is not declined, then T’s written premises; a source with no arrow left counts not (D2-59); no source at all', () => {
    const declinedItem = { id: 'it00000000000000bb', key: 'arrow:new-spyro-pg>t2', kind: 'add-arrow' as const, rev: 1, origin: { step: 's2', target: 't2', phase: 'proof' as const }, status: 'declined' as const, markers: [], fingerprint: 'fp', content: { decls: [] }, versions: [], rejectedFingerprints: [] };
    const ledger = [
      { kind: 'arrow' as const, source: 'new-spyro-pg', target: 't2', step: 's2', why: 'w' },
      { kind: 'arrow' as const, source: 'cynder-dark-past', target: 't2', step: 's2', why: 'w' },
      { kind: 'premise' as const, card: 'pg-no-dark-past', target: 't2', holdAs: 'axiom' as const, item: 'premise:t2:p', commit: 'c' },
      { kind: 'arrow' as const, source: 'new-spyro-pg', target: 't3', step: 's3', why: 'w' },
    ];
    // Claude's arrows count while the state draws them (fixer 2b1b r1, A-ADV-1); the running step's own before its normalise.
    const drawn = edit(base, MAIN, 'natural_name: Cynder has a dark past, twice\npremises: t1\n', 'natural_name: Cynder has a dark past, twice\npremises: t1, new-spyro-pg, cynder-dark-past\n');
    expect(t2(drawn, {}, { ledger }).extra).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
    expect(t2(drawn, {}, { ledger, items: [declinedItem] }).extra).toEqual(['cynder-dark-past', 'pg-no-dark-past']);
    expect(t2(base, {}, { ledger }).extra).toEqual(['pg-no-dark-past']);
    const running = permittedFor({ base: modelOf(base), current: modelOf(base), target: 't2', inferences: CHAIN_INFERENCES, ledger, items: [], earlier: {}, activeStep: 's2' });
    expect(running.extra).toEqual(['new-spyro-pg', 'cynder-dark-past', 'pg-no-dark-past']);
    // t2's arrow from t1 removed: t1 is no source any more.
    const noArrow = edit(chainProved(base, ['t1']), MAIN, 'natural_name: Cynder has a dark past, twice\npremises: t1\n', 'natural_name: Cynder has a dark past, twice\n');
    expect(t2(noArrow)).toMatchObject({ contrib: {}, throughResults: [], extra: [] });
    expect(t2(noArrow).permitted).not.toContain('Spyro.cynder_dark_past.holds');
  });
});

describe('`rejected-repeat` (D2-66): step purposes only, for content the step created or changed since S₀', () => {
  const key = 'card:pg-no-dark-past';
  const keyOf = (texts: Texts) => judge(texts, { purpose: 'check', stage: 'formalise' }).drafts.find((d) => d.key === key)?.contentKey as string;
  const rejected = (fingerprint: string, over: Partial<Parameters<typeof record>[2]> = {}) =>
    record(key, 'formalize', { status: 'declined', decline: { option: 'reject', at: 'now' }, rejectedFingerprints: [fingerprint], fingerprint, ...over });

  it('`rejected`: the step proposes exactly a version the person rejected; a reworded one passes; at a stage, never', () => {
    const fp = keyOf(FORMALISED);
    const j = judge(FORMALISED, { purpose: 'check', stage: 'formalise', items: [rejected(fp)] });
    const found = withCode(j.stepFindings, 'rejected-repeat');
    expect(tags(found)).toEqual(['rejected-repeat/rejected']);
    expect(found[0]?.message).toBe('Formalize “pg-no-dark-past” is exactly a version the person rejected in this session: never propose it again; propose something else, or leave it out.');
    const reworded = edit(FORMALISED, MAIN, '→ ¬ GoodAddition c g\n', '→ ¬ (GoodAddition c g)\n');
    expect(withCode(judge(reworded, { purpose: 'check', stage: 'formalise', items: [rejected(fp)] }).stepFindings, 'rejected-repeat')).toEqual([]);
    expect(withCode(judge(FORMALISED, { purpose: 'stage', items: [rejected(fp)], ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] }).stepFindings, 'rejected-repeat')).toEqual([]);
  });

  it('content the person brought back (Undo, un-reject) was not made by the step: in S₀ already, it is never refused (F4)', () => {
    const fp = keyOf(FORMALISED);
    const later: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
    const j = judge(FORMALISED, { purpose: 'gate-other', stepStart: FORMALISED, scope: later, items: [rejected(fp)], freeze: freezeOf(FORMALISED), ledger: [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0')], inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }] });
    expect(withCode(j.stepFindings, 'rejected-repeat')).toEqual([]);
  });

  it('`premise`: a premise draft of the step with a rejected premise’s draft key; `arrow`: an arrow of the step the person declined', () => {
    const draft = draftOf();
    const premiseRecord = record(`premise:${TARGET}:cynder_is_evil`, 'add-premise', { status: 'declined', decline: { option: 'reject', at: 'now' }, rejectedFingerprints: [premiseDraftKey(draft)] });
    const j = judge(PROVED, { freeze: freezeOf(FORMALISED), items: [premiseRecord], premises: [draft] });
    expect(tags(withCode(j.stepFindings, 'rejected-repeat'))).toEqual(['rejected-repeat/premise']);
    // The same draft from an earlier step is no repeat of this step's.
    expect(withCode(judge(PROVED, { freeze: freezeOf(FORMALISED), items: [premiseRecord], premises: [{ ...draft, step: 's0' }] }).stepFindings, 'rejected-repeat')).toEqual([]);
    const B1 = edit(PROVED, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
    const arrows = judge(PROVED, {
      base: B1,
      stepStart: B1,
      freeze: freezeOf(B1, TARGET, ['cynder-dark-past', 'pg-no-dark-past'], B1),
      scope: { ...SCOPE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false }, fuzzyStatements: [] },
      inferences: [{ ...INFERENCE, question: { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false } }],
      ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w', written: 'c' }],
      rejectedArrows: [{ source: 'new-spyro-pg', target: TARGET }],
    });
    expect(tags(withCode(arrows.stepFindings, 'rejected-repeat'))).toEqual(['rejected-repeat/arrow']);
    // One finding per problem (fixer 2b1b r1, S-F7): B.3's re-check of the step's arrows leaves this one to D2-66.
    expect(withCode(arrows.stepFindings, 'arrow')).toEqual([]);
  });

  it('`shaky-identical`: the inference’s Shaky set back unchanged at a finish, unless `no_alternative`; never at the freeze; changed, it passes', () => {
    const fp = keyOf(FORMALISED);
    const shaky = record(key, 'formalize', { status: 'declined', decline: { option: 'shaky', at: 'now' }, fingerprint: fp, origin: { step: 's0', target: TARGET, phase: 'statements' } });
    const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [key] };
    const o = { stepStart: FORMALISED, scope: submit, items: [shaky], freeze: freezeOf(FORMALISED), ledger: [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0')], inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }] };
    const same = judge(FORMALISED, { purpose: 'gate-other', ...o });
    expect(tags(withCode(same.stepFindings, 'rejected-repeat'))).toEqual(['rejected-repeat/shaky-identical']);
    expect(withCode(same.stepFindings, 'rejected-repeat')[0]?.message).toContain('or, if there is none, finish with no_alternative: true.');
    expect(withCode(judge(FORMALISED, { purpose: 'gate-other', noAlternative: true, ...o }).stepFindings, 'rejected-repeat')).toEqual([]);
    expect(withCode(judge(FORMALISED, { purpose: 'freeze', ...o }).stepFindings, 'rejected-repeat')).toEqual([]);
    const reworked = edit(FORMALISED, MAIN, '→ ¬ GoodAddition c g\n', '→ ¬ (GoodAddition c g)\n');
    expect(withCode(judge(reworked, { purpose: 'gate-other', ...o }).stepFindings, 'rejected-repeat')).toEqual([]);
  });
});

describe('`stray-command` (D2-52, AP-26): only declarations, and the lines enclosing new ones', () => {
  const lemma = 'theorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds';
  const at = (texts: Texts) => judge(texts, { purpose: 'check', stage: 'prove', freeze: freezeOf(FORMALISED) });
  const stray = (texts: Texts) => withCode(at(texts).stepFindings, 'stray-command');
  const lineOf = (texts: Texts, path: string, needle: string) => (texts[path] as string).split('\n').findIndex((l) => l.includes(needle)) + 1;

  it('refuses an `attribute [simp]` line, `open Classical`, `#print`, and `open Classical in` above a theorem or on its line, each with the message', () => {
    for (const command of ['attribute [simp] cynder_dark_past', 'open Classical', '#print axioms cynder_dark_past']) {
      const texts = append(PROVED, MAIN, command);
      const found = stray(texts);
      expect(tags(found), command).toEqual(['stray-command']);
      expect(found[0]?.message, command).toBe(
        `Model/Spyro/Main.lean:${lineOf(texts, MAIN, command)}: \`${command}\` stands outside any declaration: in a session, write only declarations, with fully qualified names instead of \`open\` (e.g. \`Classical.em\`), and \`@[…]\` on the declaration itself; remove it.`,
      );
    }
    const above = append(PROVED, MAIN, `open Classical in\n${lemma}`);
    expect(stray(above).map((f) => f.names?.[0])).toEqual(['open Classical in']);
    const sameLine = append(PROVED, MAIN, `open Classical in ${lemma}`);
    expect(tags(stray(sameLine))).toEqual(['stray-command']);
  });

  it('passes what the system prompt asks for: a `@[simp]` lemma with fully qualified names, `Classical.em`, an indented `open Classical in` inside a proof', () => {
    expect(stray(append(PROVED, MAIN, `@[simp] ${lemma}`))).toEqual([]);
    expect(stray(append(PROVED, MAIN, 'theorem t_em : HasDarkPast cynder ∨ ¬ HasDarkPast cynder := Classical.em _'))).toEqual([]);
    expect(stray(append(PROVED, MAIN, 'theorem t_open : HasDarkPast cynder := by\n  open Classical in\n  exact cynder_dark_past.holds'))).toEqual([]);
  });

  it('namespace lines around new declarations pass, also when they enclose two items’ declarations (F13); around an existing one they are stray', () => {
    expect(stray(append(PROVED, MAIN, `namespace Lemmas\n${lemma}\nend Lemmas`))).toEqual([]);
    const two = append(BASE, VOCAB, 'namespace More\n/-- is evil -/\naxiom IsEvil : Character → Prop\n/-- evil enough -/\ndef EvilEnough (c : Character) : Prop := IsEvil c\nend More');
    expect(withCode(judge(two, { purpose: 'check', stage: 'formalise' }).stepFindings, 'stray-command')).toEqual([]);
    const around = edit(PROVED, VOCAB, '/-- Cynder -/\nnoncomputable opaque cynder : Character\n', 'section Old\n/-- Cynder -/\nnoncomputable opaque cynder : Character\nend Old\n');
    expect(tags(stray(around))).toEqual(['stray-command', 'stray-command']);
  });

  it('comments (AP-26): a new comment between two of the person’s unchanged declarations is refused; above a new lemma (blank lines between) or trailing a changed declaration, it passes', () => {
    const between = edit(PROVED, VOCAB, '/-- games -/', '-- a stray remark\n/-- games -/');
    const found = stray(between);
    expect(tags(found)).toEqual(['stray-command/comment']);
    expect(found[0]?.message).toBe(
      `Model/Spyro/Vocabulary.lean:${lineOf(between, VOCAB, 'a stray remark')}: this comment is not next to a declaration this step wrote or changed: put it directly above the declaration it describes, or remove it.`,
    );
    expect(stray(append(PROVED, MAIN, `-- why this lemma\n\n${lemma}`))).toEqual([]);
    const trailing = edit(FORMALISED, MAIN, '→ ¬ GoodAddition c g\n', '→ ¬ GoodAddition c g\n-- the rule, as the person wrote it\n');
    expect(withCode(judge(trailing, { purpose: 'check', stage: 'formalise' }).stepFindings, 'stray-command')).toEqual([]);
  });

  it('an `example` is the example rule’s, not a stray command; at a stage, the reference is B', () => {
    expect(tags(withCode(at(append(PROVED, MAIN, 'example : HasDarkPast cynder := cynder_dark_past.holds')).stepFindings, 'stray-command'))).toEqual([]);
    const j = judge(append(PROVED, MAIN, 'open Classical'), { purpose: 'stage', ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')] });
    expect(tags(j.global)).toEqual(['stray-command']);
    expect(j.ok).toBe(false);
  });
});

describe('`other-result` (D2-50, F7): proof material stays with its Result', () => {
  const base = withChain(BASE);
  const t1: SessionInference = { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] };
  const target: SessionInference = { ...INFERENCE, order: 1, steps: ['s2'] };
  /** t1 proved by an earlier step through its lemma `t1_lemma` (proof phase of s1). */
  const t1Done = append(withChain(FORMALISED), MAIN, 'theorem t1_lemma : HasDarkPast cynder := cynder_dark_past.holds\ntheorem t1.holds : t1 := t1_lemma');
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created('Spyro.t1_lemma', 'proof', 's1'), created('Spyro.t1.holds', 'proof', 's1')];
  const scope: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
  const o = { base, stepStart: t1Done, scope, inferences: [t1, target], ledger, ended: ['t1'], freeze: freezeOf(t1Done, TARGET, INFERENCE.question.sources, base) };

  it('T’s proof using a lemma of t1’s proof, t1 not a source of Q(T): refused; once t1 is a source, it passes', () => {
    const uses = edit(proved(t1Done), MAIN, 'new_spyro_pg.holds cynder_dark_past.holds', 'new_spyro_pg.holds t1_lemma');
    const j = judge(uses, o);
    const found = withCode(j.stepFindings, 'undeclared-premise');
    expect(tags(found)).toEqual(['undeclared-premise/other-result']);
    expect(found[0]?.message).toContain('Spyro.t1_lemma belongs to the proof of “t1”, which is not a premise of “cynder-not-good”: prove what you need here.');
    expect(found[0]?.inference).toBe(TARGET);
    // With t1 selected (its arrow drawn), the same proof passes D2-50.
    const selected = edit(uses, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, t1');
    const question = { sources: [...INFERENCE.question.sources, 't1'], fromNothing: false };
    const ok = judge(selected, { ...o, scope: { ...scope, question }, inferences: [t1, { ...target, question }], stepStart: edit(t1Done, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, t1') });
    expect(withCode(ok.stepFindings, 'undeclared-premise')).toEqual([]);
  });

  it('a statement may not use proof material, nor a target’s .holds while its Result is in ws/: a statement-phase definition is refused, with the statement message', () => {
    const def = append(t1Done, VOCAB, '/-- lemma-backed -/\ndef LemmaBacked : Prop := t1_lemma = t1_lemma');
    const j = judge(def, { ...o, purpose: 'check', stage: 'formalise', freeze: undefined });
    const found = withCode(j.stepFindings, 'undeclared-premise');
    expect(tags(found)).toEqual(['undeclared-premise/other-result']);
    expect(found[0]?.message).toContain('Spyro.t1_lemma was written for the proof of “t1”: a statement may not use it; define what you need before fixing the statements.');
    const holds = append(t1Done, VOCAB, '/-- holds-backed -/\ndef HoldsBacked : Prop := t1.holds = t1.holds');
    expect(withCode(judge(holds, { ...o, purpose: 'check', stage: 'formalise', freeze: undefined }).stepFindings, 'undeclared-premise').map((f) => f.names?.[0])).toEqual(['Spyro.t1.holds']);
  });

  it('F7: a later statement mentioning a definition that t1’s premise draft reached (proof phase, part of its Result) is refused', () => {
    const withDef = append(withChain(FORMALISED), VOCAB, '/-- wicked -/\ndef Wicked (c : Character) : Prop := HasDarkPast c');
    const done = append(withDef, MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
    const reached = [...ledger.filter((e) => e.kind !== 'created' || e.name !== 'Spyro.t1_lemma'), created('Spyro.Wicked', 'proof', 's1', 'premise:t1:wicked')];
    const later = append(done, VOCAB, '/-- wicked cynder -/\ndef WickedCynder : Prop := Wicked cynder');
    const j = judge(later, { ...o, stepStart: done, ledger: reached, purpose: 'check', stage: 'formalise', freeze: undefined });
    expect(withCode(j.stepFindings, 'undeclared-premise').map((f) => [f.token, f.names?.[0]])).toEqual([['other-result', 'Spyro.Wicked']]);
  });

  it('a premise draft of T mentioning t1’s proof material is refused; T’s own drafts may mention T’s', () => {
    const draft = draftOf({ step: 's2', consts: ['Spyro.HasDarkPast', 'Spyro.t1_lemma'] });
    const j = judge(proved(t1Done), { ...o, premises: [draft] });
    expect(withCode(j.stepFindings, 'undeclared-premise').map((f) => [f.token, f.names?.[0], f.inference])).toEqual([['other-result', 'Spyro.t1_lemma', TARGET]]);
    const own = draftOf({ target: 't1', step: 's1', consts: ['Spyro.HasDarkPast', 'Spyro.t1_lemma'] });
    const mine = judge(proved(t1Done), { ...o, premises: [own] });
    expect(withCode(mine.stepFindings, 'undeclared-premise')).toEqual([]);
    expect(mine.inferences.t1?.findings).toEqual([]);
    // The same draft, for the walkthrough's target, is refused in that target's judgement.
    const other = judge(proved(t1Done), { ...o, premises: [{ ...own, target: TARGET, step: 's0' }] });
    expect(other.inferences[TARGET]?.findings.map((f) => [f.token, f.names?.[0]])).toEqual([['other-result', 'Spyro.t1_lemma']]);
  });
});

describe('`status-mismatch` under judgeState: a not-proved finish leaves T.holds exactly as it was when the step started', () => {
  it('a changed or removed proof (`changed`, `removed`), in the step’s words; an added one; left as it was, it passes', () => {
    const o = { purpose: 'gate-other' as const, base: PROVED, stepStart: PROVED, freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) };
    const removed = judge(edit(PROVED, MAIN, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n', ''), o);
    const found = withCode(removed.stepFindings, 'status-mismatch');
    expect(tags(found)).toEqual(['status-mismatch/removed']);
    expect(found[0]?.message).toContain('leaves the target\'s .holds exactly as it was when this step started');
    expect(found[0]?.message).not.toContain('the run');
    const changed = judge(edit(PROVED, MAIN, 'pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds', '(pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)'), o);
    expect(tags(withCode(changed.stepFindings, 'status-mismatch'))).toEqual(['status-mismatch/changed']);
    expect(withCode(judge(PROVED, o).stepFindings, 'status-mismatch')).toEqual([]);
    const added = judge(PROVED, { purpose: 'gate-other', freeze: freezeOf(FORMALISED) });
    expect(tags(withCode(added.stepFindings, 'status-mismatch'))).toEqual(['status-mismatch']);
  });
});

describe('the active step’s own rules (slice 1’s, against S₀ and the step’s freeze, in the step’s words)', () => {
  it('freeze: readiness (a selected axiom card left without a statement is `not-formalised`); once formalised it is ready', () => {
    expect(tags(judge(BASE, { purpose: 'freeze', stage: 'formalise' }).stepFindings)).toEqual(['not-formalised']);
    expect(judge(FORMALISED, { purpose: 'freeze', stage: 'formalise' }).stepFindings).toEqual([]);
  });

  it('a proved finish: `not-frozen` without a freeze; `not-proved` without a proof, in the step’s words', () => {
    expect(tags(judge(PROVED, { purpose: 'gate-proved' }).stepFindings)).toEqual(['not-frozen']);
    expect(judge(PROVED, { purpose: 'gate-proved' }).stepFindings[0]?.message).toContain('in this step');
    const missing = withCode(judge(FORMALISED, { freeze: freezeOf(FORMALISED) }).stepFindings, 'not-proved');
    expect(tags(missing)).toEqual(['not-proved/missing']);
    expect(missing[0]?.inference).toBe(TARGET);
    // Its proof existed when the step started: the way back names the step's start, never "the run".
    const removed = judge(FORMALISED, { base: PROVED, stepStart: PROVED, freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) });
    expect(withCode(removed.stepFindings, 'not-proved')[0]?.message).toContain('exactly as it was when this step started');
  });

  it('`statement-changed` against the step’s freeze; `proof-before-freeze` against S₀ (an earlier step’s proof is S₀’s)', () => {
    const after = edit(PROVED, MAIN, '→ ¬ GoodAddition c g\n', '→ ¬ GoodAddition c g ∨ True\n');
    expect(tags(withCode(judge(after, { freeze: freezeOf(FORMALISED) }).stepFindings, 'statement-changed'))).toEqual(['statement-changed']);
    const lemma = append(FORMALISED, MAIN, 'theorem early : HasDarkPast cynder := cynder_dark_past.holds');
    expect(tags(withCode(judge(lemma, { purpose: 'check', stage: 'formalise' }).stepFindings, 'proof-before-freeze'))).toEqual(['proof-before-freeze']);
    const later: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
    const fromS0 = judge(lemma, { purpose: 'check', stage: 'formalise', stepStart: lemma, scope: later, ledger: [created('Spyro.early', 'proof', 's0')], inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }], ended: [TARGET] });
    expect(withCode(fromS0.stepFindings, 'proof-before-freeze')).toEqual([]);
  });
});

describe('B.3 at the gate: `mark` and `unknown-card`', () => {
  const TARGET_PREMISES = 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n';
  it('an arrow into a target questioned by its mark, and one from no card, are refused', () => {
    const marked = edit(FORMALISED, MAIN, TARGET_PREMISES, 'natural_name: Cynder would not be a good addition to the new Spyro game\nfollows_from: nothing\n');
    const fromNothing: StepScope = { ...SCOPE, question: { sources: [], fromNothing: true }, openArrows: false, fuzzyStatements: [] };
    const withArrow = edit(marked, MAIN, 'follows_from: nothing\n', 'premises: new-spyro-pg\n');
    const j = judge(withArrow, {
      purpose: 'check',
      base: marked,
      scope: fromNothing,
      inferences: [{ ...INFERENCE, question: fromNothing.question }],
      ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's1', why: 'w', written: 'c' }, { kind: 'mark-removed', card: TARGET, item: 'x', commit: 'c' }],
    });
    expect(tags(withCode(j.stepFindings, 'arrow'))).toEqual(['arrow/mark']);
    const ghost = edit(FORMALISED, MAIN, TARGET_PREMISES, 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, no-such-card\n');
    const unknown = judge(ghost, { purpose: 'check', ledger: [{ kind: 'arrow', source: 'no-such-card', target: TARGET, step: 's1', why: 'w', written: 'c' }] });
    expect(tags(withCode(unknown.stepFindings, 'arrow'))).toEqual(['arrow/unknown-card']);
  });
});

describe('the judgement’s problems and `ok`; the end (`final`)', () => {
  const ledger = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')];

  it('Lean’s errors map to the items owning the failing declarations (`no-longer-builds`); the state is not ok', () => {
    const lines = (PROVED[MAIN] as string).split('\n');
    const line = lines.findIndex((l) => l.startsWith('abbrev pg_no_dark_past'));
    const messages = [{ file: MAIN, range: { start: { line, character: 2 }, end: { line, character: 8 } }, severity: 'error' as const, text: 'type mismatch' }];
    const j = judge(PROVED, { purpose: 'stage', ledger, facts: { messages } });
    expect(j.problems).toEqual([{ code: 'no-longer-builds', text: `${MAIN}:${line + 1}:2: error: type mismatch`, keys: ['card:pg-no-dark-past'], declaration: 'Spyro.pg_no_dark_past' }]);
    expect(tags(j.global)).toEqual(['build']);
    expect(j.ok).toBe(false);
  });

  it('a module that did not build leaves its items without facts: a `facts` problem naming them, and the state is not ok; no facts at all, too', () => {
    const j = judge(PROVED, { purpose: 'stage', ledger, facts: { moduleStates: { [MAIN]: 'failed' } } });
    const facts = j.problems.filter((p) => p.code === 'facts');
    expect(facts).toEqual([{ code: 'facts', text: 'telelean could not see what the final statements rely on', keys: ['card:pg-no-dark-past', `proof:${TARGET}`] }]);
    expect(j.ok).toBe(false);
    const none = judgeState({ purpose: 'stage', stage: 'prove', commit: 'c', filesKey: 'k', base: modelOf(BASE), current: model(PROVED, { facts: false }), inferences: [INFERENCE], ledger, items: [], premises: [], ended: [TARGET], rejectedArrows: [] });
    expect(none.problems.filter((p) => p.code === 'facts')).toEqual([{ code: 'facts', text: 'telelean could not see what the final statements rely on' }]);
    expect(none.ok).toBe(false);
  });

  it('`final` judges against B: the session’s statements, pins, Claude’s arrows and premise cards pass; stepFindings are the global findings', () => {
    const j = judge(PROVED, { purpose: 'final', ledger });
    expect(j).toMatchObject({ ok: true, global: [], stepFindings: [], purpose: 'final' });
    const stray = judge(append(PROVED, MAIN, '#check cynder_not_good'), { purpose: 'final', ledger });
    expect(tags(stray.stepFindings)).toEqual(['stray-command']);
    expect(stray.stepFindings).toEqual(stray.global);
  });

  it('`reach` is R_stmt’s `by`: the cards whose statements reach each name', () => {
    const j = judge(PROVED, { purpose: 'stage', ledger });
    expect(j.reach['Spyro.IsPG']).toEqual(['new-spyro-pg', 'pg-no-dark-past']);
  });
});

describe('stepWording: slice 1’s messages reused on S₀ speak of the step', () => {
  it('rewrites "before the run", "in this run", "in the run" and "in this round"; leaves other words; empty stays empty', () => {
    expect(stepWording([])).toEqual([]);
    const one = stepWording([{ step: 'G3', code: 'not-proved', message: 'restore X exactly as it was before the run and finish' }]);
    expect(one.map((f) => f.message)).toEqual(['restore X exactly as it was when this step started and finish']);
    const many = stepWording([
      { step: 'G3', code: 'status-mismatch', message: 'X was changed in this run: … as it was before the run.' },
      { step: 'G3', code: 'footprint', message: 'a proof added in the run' },
      { step: 'G3', code: 'not-frozen', message: 'needs a freeze in this round: rerun it' },
    ]);
    expect(many.map((f) => f.message)).toEqual(['X was changed in this step: … as it was when this step started.', 'a proof added in this step', 'needs a freeze in this step: rerun it']);
  });
});

describe('a Result in the judgement: verdict, flags, band and what is missing (§2.9, shown with the results)', () => {
  const ledger = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')];

  it('no proof: not proved, nothing else; a proof replacing the person’s (`replaces-your-proof`); one of a changed statement (`proves-changed-statement`)', () => {
    expect(judge(FORMALISED, { purpose: 'stage', ledger }).inferences[TARGET]).toMatchObject({ verdict: 'not-proved', flags: [], footprint: [], direct: [], restsOn: [], missing: [], band: { used: [], notNeeded: [], complete: false, open: [] } });
    const again = edit(PROVED, MAIN, 'pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds', '(pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)');
    expect(judge(again, { purpose: 'stage', base: PROVED, ledger }).inferences[TARGET]?.flags).toEqual(['replaces-your-proof']);
    const changed = edit(PROVED, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro', 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∧ True');
    expect(judge(changed, { purpose: 'stage', ledger }).inferences[TARGET]?.flags).toEqual(['proves-changed-statement']);
  });

  it('a proof that uses no card is `proved-from-nothing`; an unselected use opens the band and is missing, drawn or not', () => {
    const trivial =
      '/-\n@@ telelean v1\nid: plain\ntype: PROPOSITION\nnatural_name: Plainly so\nfollows_from: nothing\nasserted: 2026-11-01\nlean: Spyro.plain\n-/\n/-- Plainly so -/\nabbrev plain : Prop := True\ntheorem plain.holds : plain := trivial';
    const plain = { target: 'plain', question: { sources: [], fromNothing: true }, order: 0, steps: ['s1'] };
    const j = judge(append(BASE, MAIN, trivial), { purpose: 'stage', inferences: [plain], ledger: [created('Spyro.plain.holds', 'proof')], ended: ['plain'] });
    expect(j.inferences.plain).toMatchObject({ verdict: 'established', flags: ['proved-from-nothing'], restsOn: [], band: { used: [], complete: true } });
    const narrow = { sources: ['cynder-dark-past', 'new-spyro-pg'], fromNothing: false };
    const used = judge(PROVED, { purpose: 'stage', inferences: [{ ...INFERENCE, question: narrow }], ledger });
    expect(used.inferences[TARGET]?.missing).toEqual([{ source: 'pg-no-dark-past', drawn: true }]);
    expect(used.inferences[TARGET]?.band.notNeeded).toEqual([]);
  });
});

describe('the active step’s question, and footprints by creator', () => {
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
  /** A re-ask of the proved target with fewer arrows (§3.2): the step asks its own question; the session keeps the old one. */
  const fewer = { sources: ['cynder-dark-past', 'new-spyro-pg'], fromNothing: false };
  const reask: StepScope = { ...SCOPE, step: 's2', question: fewer, fuzzyStatements: [] };
  const o = { stepStart: PROVED, scope: reask, ledger, inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }], ended: [TARGET], freeze: freezeOf(PROVED, TARGET, fewer.sources) };

  it('a re-ask judges its target against the step’s question: a new proof that still uses the dropped source is refused', () => {
    const again = edit(PROVED, MAIN, 'pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds', '(pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)');
    const j = judge(again, { ...o, purpose: 'gate-proved' });
    expect(tags(withCode(j.stepFindings, 'undeclared-premise'))).toEqual(['undeclared-premise/unselected']);
    expect(Object.keys(j.inferences[TARGET]?.contrib ?? {})).toEqual(['cynder-dark-past', 'new-spyro-pg']);
  });

  it('a re-ask that finishes not proved, leaving the old proof as it was, passes: the old proof is not judged against the new question', () => {
    expect(judge(PROVED, { ...o, purpose: 'gate-other' }).stepFindings).toEqual([]);
    // A proved finish claims the new question: the old proof is judged then (A11), with its own message.
    const claimed = withCode(judge(PROVED, { ...o, purpose: 'gate-proved' }).stepFindings, 'undeclared-premise');
    expect(tags(claimed)).toEqual(['undeclared-premise/unselected']);
    expect(claimed[0]?.message).toContain('is the proof of the target as it was when this step started');
  });

  it('proof material is judged against its creator’s permitted set (`footprint`, its inference); a declaration no step recorded, against the vocabulary layer (global)', () => {
    const narrow = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const lemma = append(FORMALISED, MAIN, 'theorem side : IsPG newSpyro := new_spyro_pg.holds');
    const stage = { purpose: 'stage' as const, inferences: [{ ...INFERENCE, question: narrow }], ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements')] };
    const own = judge(lemma, { ...stage, ledger: [...stage.ledger, created('Spyro.side', 'proof')] });
    expect(tags(own.inferences[TARGET]?.findings ?? [])).toEqual(['footprint']);
    expect(own.inferences[TARGET]?.findings[0]?.names).toEqual(['Spyro.new_spyro_pg.holds']);
    expect(own.global).toEqual([]);
    const nobody = judge(lemma, stage);
    expect(tags(nobody.global)).toEqual(['footprint']);
    expect(nobody.global[0]?.message).toContain('outside the permitted set of no inference');
    expect(nobody.inferences[TARGET]?.passes).toBe(true);
  });

  it('a target questioned by its mark, with no statement yet, may be formalised and pinned', () => {
    const codeless = edit(BASE, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\nasserted: 2026-11-01\nlean: Spyro.cynder_not_good\n-/\n/-- Cynder would not be a good addition to the new Spyro game -/\nabbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', 'follows_from: nothing\nasserted: 2026-11-01\n-/\n');
    const filled = edit(codeless, MAIN, 'follows_from: nothing\nasserted: 2026-11-01\n-/\n', 'follows_from: nothing\nasserted: 2026-11-01\nlean: Spyro.cynder_not_good\n-/\n/-- Cynder would not be a good addition to the new Spyro game -/\nabbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n');
    const mark = { sources: [], fromNothing: true };
    const j = judge(filled, { base: codeless, purpose: 'check', stage: 'formalise', scope: { ...SCOPE, question: mark, openArrows: false, fuzzyStatements: [] }, inferences: [{ ...INFERENCE, question: mark }] });
    expect(j.stepFindings).toEqual([]);
  });
});

describe('more of the step’s rules, pinned exactly', () => {
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
  const again = edit(PROVED, MAIN, 'pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds', '(pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)');

  it('a Submit step whose Result is not open (`openProof` false) may not touch T.holds as it was at S₀ (`session`, or `closed-proof` for the person’s own); with the proof open it may', () => {
    const closed: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openProof: false };
    const o = { stepStart: PROVED, ledger, inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }], ended: [TARGET], freeze: freezeOf(PROVED) };
    const j = judge(again, { ...o, scope: closed, purpose: 'gate-proved' });
    // An earlier step proposed it, so the token is `session`; the message says the proof is closed.
    const found = withCode(j.stepFindings, 'existing-changed');
    expect(found.map((f) => [f.token, f.names?.[0]])).toEqual([['session', TARGET_HOLDS]]);
    expect(found[0]?.message).toContain("(the target's proof is closed in this step)");
    // The person's own proof (B's), closed: token `closed-proof` (fixer 2b1b r1, S-F4: `target` names the statement).
    const own = judge(again, { ...o, base: PROVED, scope: closed, purpose: 'gate-proved', freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) });
    expect(withCode(own.stepFindings, 'existing-changed').map((f) => [f.token, f.names?.[0]])).toEqual([['closed-proof', TARGET_HOLDS]]);
    expect(withCode(judge(again, { ...o, scope: { ...closed, openProof: true }, purpose: 'gate-proved' }).stepFindings, 'existing-changed')).toEqual([]);
  });

  it('a declaration of the step Lean reported nothing about fails closed (`footprint`, `no-facts`)', () => {
    const lemma = append(PROVED, MAIN, 'private theorem hidden : HasDarkPast cynder := cynder_dark_past.holds');
    const j = judge(lemma, { freeze: freezeOf(FORMALISED), facts: { overrides: { 'Spyro.hidden': { drop: true } } } });
    const found = withCode(j.stepFindings, 'footprint');
    expect(tags(found)).toEqual(['footprint/no-facts']);
    expect(found[0]?.message).toContain('Lean does not report `private` declarations');
  });

  it('the vocabulary shape rule judges changed items too (Appendix B), not only new ones', () => {
    const reshaped = edit(BASE, VOCAB, 'axiom IsPG : Game → Prop', 'axiom IsPG : Game → Game');
    expect(tags(withCode(judge(reshaped, { purpose: 'stage', base: BASE }).global, 'vocabulary-shape'))).toEqual(['vocabulary-shape']);
  });

  it('before its freeze, the active step’s declarations are not judged by the footprint rule (a carrier is `proof-before-freeze`’s)', () => {
    const narrow = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
    const carrier = append(FORMALISED, MAIN, 'def carried : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩');
    const j = judge(carrier, { purpose: 'check', stage: 'formalise', scope: { ...SCOPE, question: narrow }, inferences: [{ ...INFERENCE, question: narrow }] });
    expect(tags(j.stepFindings)).toEqual(['proof-before-freeze/carrier']);
  });
});

describe('fixer 2b1b r1 (S-F1, A-ADV-2, C-V2B1B-C3): only the step’s target is proved; no other `.holds` changes between axiom and theorem (ES-2, B.4)', () => {
  const t1Question = { sources: ['cynder-dark-past'], fromNothing: false };
  const t1Scope: StepScope = { ...SCOPE, step: 's1', target: 't1', question: t1Question, fuzzyStatements: [] };
  const t1Only: SessionInference[] = [{ target: 't1', question: t1Question, order: 0, steps: ['s1'] }];

  it('a proof of a card that is not the step’s target is `not-target`, at the finish and at the stage; the target’s own proof passes', () => {
    const base = withChain(BASE);
    const freeze = freezeOf(base, 't1', ['cynder-dark-past'], base);
    expect(judge(chainProved(base, ['t1']), { base, scope: t1Scope, inferences: t1Only, freeze }).stepFindings).toEqual([]);
    const current = append(chainProved(base, ['t1']), MAIN, 'theorem t2.holds : t2 := cynder_dark_past.holds');
    const j = judge(current, { base, scope: t1Scope, inferences: t1Only, freeze });
    expect(tags(j.stepFindings)).toEqual(['holds-kind/not-target']);
    expect(j.stepFindings[0]).toMatchObject({ names: ['Spyro.t2.holds'], nodeId: 't2' });
    expect(j.stepFindings[0]?.message).toContain('Spyro.t2.holds is a proof of the card t2 ("Cynder has a dark past, twice"), which is not this step\'s target: in this step only the proof of “t1” may be written; remove it.');
    const stage = judge(current, { base, purpose: 'stage', inferences: t1Only, ledger: [created('Spyro.t1.holds', 'proof', 's1'), created('Spyro.t2.holds', 'proof', 's1')], ended: ['t1'] });
    expect(tags(stage.global)).toEqual(['holds-kind/not-target']);
    expect(stage.global[0]?.message).toContain('which is not a target of this session: only the proof of a target of this session may be written; remove it.');
    expect(stage.ok).toBe(false);
  });

  it('a statements-only step (A12) may not prove the source it names either', () => {
    const base = withChain(BASE);
    const inferences: SessionInference[] = [...t1Only, { target: 't2', question: { sources: ['t1'], fromNothing: false }, order: 1, steps: ['s2'] }];
    const scope: StepScope = { step: 's2', target: 't2', question: { sources: ['t1'], fromNothing: false }, fuzzyStatements: [], openProof: false, openArrows: false, openItems: [], statementsOnly: 't1' };
    const j = judge(chainProved(base, ['t1']), { base, scope, purpose: 'gate-other', inferences, ended: ['t1'], freeze: freezeOf(base, 't2', ['t1'], base) });
    expect(tags(j.stepFindings)).toEqual(['holds-kind/not-target']);
    expect(j.stepFindings[0]?.names).toEqual(['Spyro.t1.holds']);
  });

  it('an axiom card’s claim made a theorem by a Submit step that opened its Formalize item: `axiom-to-theorem`, without a freeze too; at the stage (`not-target` against B); B’s own claim made a theorem', () => {
    const earlier = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0')];
    const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
    const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: ['card:pg-no-dark-past'] };
    const changed = edit(FORMALISED, MAIN, 'axiom pg_no_dark_past.holds : pg_no_dark_past', 'theorem pg_no_dark_past.holds : pg_no_dark_past := by trivial');
    const j = judge(changed, { purpose: 'gate-other', stepStart: FORMALISED, scope: submit, inferences, ledger: earlier, ended: [TARGET] });
    expect(tags(j.stepFindings)).toEqual(['holds-kind/axiom-to-theorem']);
    expect(j.stepFindings[0]?.message).toContain(
      'Spyro.pg_no_dark_past.holds, the claim of the card pg-no-dark-past ("PG games cannot have characters with dark pasts"), was an axiom and is now a theorem: in this step only the proof of “cynder-not-good” may be written, and no other .holds changes between axiom and theorem (B.4); restore `axiom pg_no_dark_past.holds : pg_no_dark_past`.',
    );
    // Not opened, the step limits hold it, and they alone say it (one finding per problem).
    const closed = judge(changed, { purpose: 'gate-other', stepStart: FORMALISED, scope: { ...submit, openItems: [] }, inferences, ledger: earlier, ended: [TARGET] });
    expect(tags(closed.stepFindings)).toEqual(['existing-changed/session']);
    // At the stage the reference is B, which had no claim for it: a proof of a card that is no target.
    const stage = judge(changed, { purpose: 'stage', inferences, ledger: earlier, ended: [TARGET] });
    expect(tags(stage.global)).toEqual(['holds-kind/not-target']);
    expect(stage.global[0]?.message).toContain("never a proof); remove it.");
    expect(stage.ok).toBe(false);
    const own = edit(PROVED, MAIN, 'axiom cynder_dark_past.holds : cynder_dark_past', 'theorem cynder_dark_past.holds : cynder_dark_past := by trivial');
    const ledger = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')];
    expect(tags(withCode(judge(own, { purpose: 'stage', ledger }).global, 'holds-kind'))).toEqual(['holds-kind/axiom-to-theorem']);
  });

  it('a written premise’s pending claim proved by a Submit step that opened the premise: `axiom-to-theorem` at the finish; at the stage, `not-target` (B had no claim)', () => {
    const premiseCard =
      '/-\n@@ telelean v1\nid: p-extra\ntype: PROPOSITION\nnatural_name: Cynder is evil\nasserted: 2026-11-01\nlean: Spyro.p_extra\n-/\n/-- Cynder is evil -/\nabbrev p_extra : Prop := ∀ g : Game, IsPG g → IsPG g\naxiom p_extra.holds : p_extra\n';
    const S0 = edit(append(FORMALISED, MAIN, premiseCard), MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, p-extra');
    const item = `premise:${TARGET}:p_extra`;
    const ledger = [{ kind: 'premise' as const, card: 'p-extra', target: TARGET, holdAs: 'pending' as const, item, commit: 'c-premise' }];
    const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
    const proved = edit(S0, MAIN, 'axiom p_extra.holds : p_extra', 'theorem p_extra.holds : p_extra := fun _ h => h');
    // As written, the pending claim passes every rule.
    expect(judge(S0, { purpose: 'stage', base: FORMALISED, inferences, ledger, ended: [TARGET] }).global).toEqual([]);
    const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [item] };
    const j = judge(proved, { purpose: 'gate-other', base: FORMALISED, stepStart: S0, scope: submit, inferences, ledger, ended: [TARGET] });
    expect(tags(j.stepFindings)).toEqual(['holds-kind/axiom-to-theorem']);
    expect(tags(judge(proved, { purpose: 'stage', base: FORMALISED, inferences, ledger, ended: [TARGET] }).global)).toEqual(['holds-kind/not-target']);
  });

  it('a fuzzy axiom card filled with a theorem `.holds` is `not-target`: its claim is an axiom', () => {
    const theorem = edit(FORMALISED, MAIN, 'axiom pg_no_dark_past.holds : pg_no_dark_past', 'theorem pg_no_dark_past.holds : pg_no_dark_past := by trivial');
    const j = judge(theorem, { purpose: 'gate-other' });
    expect(tags(withCode(j.stepFindings, 'holds-kind'))).toEqual(['holds-kind/not-target']);
    expect(withCode(j.stepFindings, 'holds-kind')[0]?.message).toContain("(an axiom card's .holds is its claim, `axiom pg_no_dark_past.holds : pg_no_dark_past`, never a proof)");
  });

  it('the person’s own proof of another card stays theirs; changed, it is the step limits’ alone (one finding), and B.4’s when the scope opened it', () => {
    const base = chainProved(withChain(PROVED), ['t1']);
    const inferences: SessionInference[] = [{ target: 't1', question: t1Question, order: 0, steps: ['s0'] }, { ...INFERENCE, order: 1, steps: ['s1'] }];
    const scope: StepScope = { ...SCOPE, fuzzyStatements: [] };
    const o = { base, scope, inferences, ended: ['t1'], freeze: freezeOf(base, TARGET, INFERENCE.question.sources, base), purpose: 'gate-proved' as const };
    expect(judge(base, o).stepFindings).toEqual([]);
    const changed = edit(base, MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds', 'theorem t1.holds : t1 := (cynder_dark_past.holds)');
    expect(tags(judge(changed, o).stepFindings)).toEqual(['existing-changed/changed']);
    // A scope that opened another inference's Result (no runner should): the step limits pass it, B.4 does not.
    const opened = judge(changed, { ...o, scope: { ...scope, openItems: ['proof:t1'] } });
    expect(tags(opened.stepFindings)).toEqual(['holds-kind/not-target']);
  });
});

describe('fixer 2b1b r1 (S-F2): the comment and the enclosing lines of content the step opens go with it', () => {
  const helper = 'namespace Lemmas\n-- a helper of the proof\ntheorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds\nend Lemmas';
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0'), created('Spyro.Lemmas.t_lemma', 'proof', 's0')];
  const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [`proof:${TARGET}`] };
  const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
  const at = (S0: Texts, o: Parameters<typeof judge>[1] = {}) => ({ stepStart: S0, scope: submit, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0), ...o });

  it('a Submit step that opened the Result removes its lemma with the lemma’s comment and its namespace lines', () => {
    const S0 = append(PROVED, MAIN, helper);
    expect(judge(PROVED, at(S0)).stepFindings).toEqual([]);
    // Not opened (a later step of another kind), the same removal is refused, the lines with it.
    const closed = judge(PROVED, at(S0, { scope: { ...submit, openItems: [], openProof: false } }));
    expect(tags(closed.stepFindings)).toEqual(['existing-changed/session', 'existing-changed/text', 'existing-changed/text', 'existing-changed/text']);
  });

  it('a comment on the target’s proof goes with the proof while it is open, but not at a finish without a proof (the Result stays as it was)', () => {
    const S0 = edit(PROVED, MAIN, 'theorem cynder_not_good.holds', '-- the honest proof\ntheorem cynder_not_good.holds');
    const reask = at(S0, { scope: { ...SCOPE, step: 's2', fuzzyStatements: [] } });
    expect(judge(PROVED, { ...reask, purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
    expect(judge(PROVED, { ...reask, purpose: 'gate-proved' }).stepFindings).toEqual([]);
    const other = judge(PROVED, { ...reask, purpose: 'gate-other' });
    expect(other.stepFindings.map((f) => [f.code, f.token, f.names?.[0]])).toEqual([['existing-changed', 'text', '-- the honest proof']]);
  });

  it('only what the opened content brought goes with it: the person’s comment, a comment of content not opened, and a pair around content not all opened stay', () => {
    // The person's comment (in B) next to the lemma: removing both, the comment is refused.
    const noted = append(BASE, MAIN, '-- a note of the person');
    const S0 = append(proved(pinned(normative(noted))), MAIN, helper);
    const withoutBoth = edit(edit(S0, MAIN, helper, ''), MAIN, '-- a note of the person', '');
    const person = judge(withoutBoth, at(S0, { base: noted }));
    expect(tags(person.stepFindings)).toEqual(['existing-changed/text']);
    expect(person.stepFindings[0]?.names).toEqual(['-- a note of the person']);
    // A comment an earlier step wrote above a statement-phase definition it made (not opened by this step).
    const side = append(PROVED, MAIN, '-- why we need it\n/-- a side definition -/\ndef side_def : Prop := HasDarkPast cynder');
    const sideLedger = [...ledger, created('Spyro.side_def', 'statements', 's0')];
    const commentGone = judge(edit(side, MAIN, '-- why we need it\n', ''), at(side, { ledger: sideLedger }));
    expect(tags(commentGone.stepFindings)).toEqual(['existing-changed/text']);
    // A namespace around the opened lemma and that definition: its lines go only if all it encloses is opened.
    const both = append(PROVED, MAIN, 'namespace Lemmas\n-- a helper of the proof\ntheorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds\n/-- a side definition -/\ndef side_def : Prop := HasDarkPast cynder\nend Lemmas');
    const bothLedger = [...ledger, created('Spyro.Lemmas.side_def', 'statements', 's0')];
    const allGone = judge(PROVED, at(both, { ledger: bothLedger }));
    expect(withCode(allGone.stepFindings, 'existing-changed').map((f) => [f.token, f.names?.[0]])).toEqual([
      ['session', 'Spyro.Lemmas.side_def'],
      ['text', 'namespace Lemmas'],
      ['text', 'end Lemmas'],
    ]);
  });
});

describe('fixer 2b1b r1 (A-ADV-1, A-ADV-5): E(T) holds the arrows ws/ draws; a step draws only its own', () => {
  /** t1's written premise p-extra (pending); Claude's arrow p-extra -> target (step s2), taken out by a cascade (to be redone, reverted). */
  const premiseCard =
    '/-\n@@ telelean v1\nid: p-extra\ntype: PROPOSITION\nnatural_name: Cynder is evil\nasserted: 2026-11-01\nlean: Spyro.p_extra\n-/\n/-- Cynder is evil -/\nabbrev p_extra : Prop := HasDarkPast cynder\naxiom p_extra.holds : p_extra\n';
  const base = withChain(FORMALISED);
  const S0 = edit(append(base, MAIN, premiseCard), MAIN, 'premises: cynder-dark-past\nasserted: 2026-11-01\nlean: Spyro.t1', 'premises: cynder-dark-past, p-extra\nasserted: 2026-11-01\nlean: Spyro.t1');
  const proof = 'theorem cynder_not_good.holds : cynder_not_good :=\n  (fun _ => pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds) p_extra.holds';
  const current = append(S0, MAIN, proof);
  const ledger: LedgerEntry[] = [
    { kind: 'premise', card: 'p-extra', target: 't1', holdAs: 'pending', item: 'premise:t1:p_extra', commit: 'c-premise' },
    { kind: 'arrow', source: 'p-extra', target: TARGET, step: 's2', why: 'needed' },
    created(TARGET_HOLDS, 'proof', 's2'),
  ];
  const inferences: SessionInference[] = [
    { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] },
    { ...INFERENCE, order: 1, steps: ['s2', 's3'] },
  ];
  const arrowItem = record(`arrow:p-extra>${TARGET}`, 'add-arrow', { status: 'to-be-redone', redo: { because: ['x'], reverted: true }, origin: { step: 's2', target: TARGET, phase: 'proof' }, partOf: TARGET });
  const scope: StepScope = { ...SCOPE, step: 's3', fuzzyStatements: [], openItems: [`proof:${TARGET}`, `arrow:p-extra>${TARGET}`] };
  const freeze = freezeOf(S0, TARGET, INFERENCE.question.sources, base);
  const again = { kind: 'arrow' as const, source: 'p-extra', target: TARGET, step: 's3', why: 'needed again' };

  it('a Claude arrow a cascade took out is no source while undrawn: a proof using its card is refused, at the finish and at the stage', () => {
    const j = judge(current, { base, stepStart: S0, scope, inferences, ledger, items: [arrowItem], ended: ['t1', TARGET], freeze });
    expect(j.inferences[TARGET]?.extra).toEqual([]);
    expect(tags(withCode(j.stepFindings, 'undeclared-premise'))).toEqual(['undeclared-premise/unselected']);
    expect(withCode(j.stepFindings, 'undeclared-premise')[0]?.nodeId).toBe('p-extra');
    const stage = judge(current, { base, purpose: 'stage', inferences, ledger, items: [arrowItem], ended: ['t1', TARGET] });
    expect(stage.inferences[TARGET]?.extra).toEqual([]);
    expect(stage.inferences[TARGET]?.passes).toBe(false);
    expect(tags(stage.inferences[TARGET]?.findings ?? [])).toContain('undeclared-premise/unselected');
    // Proposed again by this step (its own entry, before its normalise draws it): a source again.
    const back = judge(current, { base, stepStart: S0, scope, inferences, ledger: [...ledger, again], items: [arrowItem], ended: ['t1', TARGET], freeze });
    expect(back.inferences[TARGET]?.extra).toEqual(['p-extra']);
    expect(withCode(back.stepFindings, 'undeclared-premise')).toEqual([]);
  });

  it('propose_arrow accepts such an arrow again; this step’s own proposal, or a drawn arrow, is `drawn`', () => {
    const ask = (l: LedgerEntry[], texts: Texts = S0) => proposeArrowProblems({ current: modelOf(texts), scope, inferences, ledger: l, rejectedArrows: [], source: 'p-extra', target: TARGET });
    expect(ask(ledger)).toEqual([]);
    expect(ask([...ledger, again])).toEqual([{ token: 'drawn', text: 'That arrow is drawn already.' }]);
    const drawn = edit(S0, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, p-extra');
    expect(ask(ledger, drawn)).toEqual([{ token: 'drawn', text: 'That arrow is drawn already.' }]);
  });

  it('G5 at a step: an earlier step’s ledger arrow that S₀ lacks is not the step’s to draw (`markup`, `premises`); its own is', () => {
    const redrawn = edit(S0, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, p-extra');
    const o = { base, stepStart: S0, scope: { ...SCOPE, step: 's3', fuzzyStatements: [] }, purpose: 'check' as const, stage: 'formalise' as const, inferences, items: [arrowItem], ended: ['t1', TARGET] };
    expect(tags(judge(redrawn, { ...o, ledger }).stepFindings)).toEqual(['markup/premises']);
    expect(withCode(judge(redrawn, { ...o, ledger: [...ledger, again] }).stepFindings, 'markup')).toEqual([]);
    // At a stage, the reference is B, and any ledger arrow explains its entry (a declined one is B.3's).
    expect(withCode(judge(redrawn, { base, purpose: 'stage', inferences, ledger, ended: ['t1', TARGET] }).global, 'markup')).toEqual([]);
  });
});

describe('fixer 2b1b r1 (A-ADV-4): a `.holds` whose text stayed but whose meaning changed is judged as a changed proof', () => {
  const base = append(withChain(PROVED), MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
  const current = append(base, MAIN, '@[simp] theorem helperInst : t1 := t1.holds');
  const facts = { overrides: { [TARGET_HOLDS]: { valueConsts: ['Spyro.pg_no_dark_past.holds', 'Spyro.newSpyro', 'Spyro.cynder', 'Spyro.new_spyro_pg.holds', 'Spyro.cynder_dark_past.holds', 'Spyro.helperInst'] } } };
  const ledger = [created('Spyro.helperInst', 'proof', 's1')];
  const scope: StepScope = { ...SCOPE, fuzzyStatements: [] };

  it('the person’s proof routed through a lemma the step added: refused at a finish without a proof, and at the stage; unrouted, it passes', () => {
    const other = judge(current, { base, scope, purpose: 'gate-other', ledger, facts });
    expect(tags(other.stepFindings)).toEqual(['undeclared-premise/unselected']);
    expect(other.stepFindings[0]?.nodeId).toBe('t1');
    expect(other.inferences[TARGET]?.direct).toContain('t1');
    expect(judge(current, { base, scope, purpose: 'gate-other', ledger }).stepFindings).toEqual([]);
    const stage = judge(current, { base, purpose: 'stage', ledger, facts });
    expect(stage.inferences[TARGET]?.passes).toBe(false);
    expect(tags(stage.inferences[TARGET]?.findings ?? [])).toEqual(['undeclared-premise/unselected']);
    expect(judge(current, { base, purpose: 'stage', ledger }).inferences[TARGET]?.passes).toBe(true);
  });

  it('isSessionProof: the text, or else the meaning (printed value, value and type constants), against B', () => {
    expect(isSessionProof(modelOf(base), modelOf(current), TARGET)).toBe(false);
    expect(isSessionProof(modelOf(base), modelOf(current, facts), TARGET)).toBe(true);
    expect(isSessionProof(modelOf(base), modelOf(current, { overrides: { [TARGET_HOLDS]: { typeConsts: ['Spyro.cynder_not_good', 'Spyro.helperInst'] } } }), TARGET)).toBe(true);
    const valued = (value: string) => ({ overrides: { [TARGET_HOLDS]: { value } } });
    expect(isSessionProof(modelOf(base, valued('Spyro.pg_no_dark_past.holds …')), modelOf(current, valued('Spyro.helperInst')), TARGET)).toBe(true);
    expect(isSessionProof(modelOf(base, valued('Spyro.helperInst')), modelOf(current, valued('Spyro.helperInst')), TARGET)).toBe(false);
    expect(isSessionProof(modelOf(FORMALISED), modelOf(PROVED), TARGET)).toBe(true);
  });
});

describe('fixer 2b1b r1 (A-ADV-3): a step never leaves a difference no review item can hold', () => {
  it('G5 compares a block’s other lines in order: swapped field lines, and a line that is no field (`markup`, `lines`); a field rule that speaks says it alone', () => {
    const swapped = edit(PROVED, MAIN, 'source: common\nasserted: 2026-11-01\n', 'asserted: 2026-11-01\nsource: common\n');
    const j = judge(swapped, { freeze: freezeOf(FORMALISED) });
    expect(tags(j.stepFindings)).toEqual(['markup/lines']);
    expect(j.stepFindings[0]?.message).toContain("lines changed (moved, added or rewritten): a block's lines stay exactly as written, in their order; restore them.");
    expect(j.problems.map((p) => p.code)).toEqual(['unowned']);
    const malformed = edit(PROVED, MAIN, 'source: common\nasserted: 2026-11-01\n', 'source: common\nasserted: 2026-11-01\nthis is not a field\n');
    expect(tags(judge(malformed, { freeze: freezeOf(FORMALISED) }).stepFindings)).toEqual(['markup/lines']);
    const reworded = edit(swapped, MAIN, 'rationale: familiar with gaming lore', 'rationale: well known');
    expect(tags(judge(reworded, { freeze: freezeOf(FORMALISED) }).stepFindings)).toEqual(['markup/rationale']);
    // At a stage, against B.
    const ledger = [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')];
    expect(tags(judge(swapped, { purpose: 'stage', ledger }).global)).toEqual(['markup/lines']);
  });

  it('what no rule names and no item can hold fails the step (`existing-changed`, `unowned`), unless S₀ had it', () => {
    const block = '/-\n@@ telelean v1\nid: pg-no-dark-past\ntype: ASSUMPTION\nnatural_name: PG games cannot have characters with dark pasts\nstance: rule\nasserted: 2026-11-01\n-/\n\n';
    const moved = edit(edit(BASE, MAIN, block, ''), MAIN, '\nend Spyro', `\n${block}end Spyro`);
    const o = { purpose: 'check' as const, stage: 'formalise' as const, scope: { ...SCOPE, fuzzyStatements: [] } };
    const j = judge(moved, o);
    expect(tags(j.stepFindings)).toEqual(['existing-changed/unowned']);
    expect(j.stepFindings[0]?.message).toBe(
      'The card “PG games cannot have characters with dark pasts” changed, but no review item covers it. In a session every change must belong to an item the person can accept or decline, and this one cannot: write only the target\'s proof, the empty Lean statements at the selected arrows, new declarations next to what they serve, and arrows through propose_arrow; restore it.',
    );
    expect(j.global).toEqual([]);
    // S₀ had it (an earlier step's): not this step's.
    expect(judge(moved, { ...o, stepStart: moved }).stepFindings).toEqual([]);
    // Another rule speaks: it names the problem instead.
    expect(tags(judge(append(moved, MAIN, 'open Classical'), o).stepFindings)).toEqual(['stray-command']);
    // At a stage, the unowned difference is a problem (Apply disabled), never a finding.
    expect(judge(moved, { purpose: 'stage' }).stepFindings).toEqual([]);
  });

  it('session content no item of S₀ provides is no proposal the person reviews: the step limits say so plainly', () => {
    const base = withChain(BASE);
    const t1Only: SessionInference[] = [{ target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1', 's2'] }];
    const S0 = append(chainProved(base, ['t1']), MAIN, 'theorem t2.holds : t2 := cynder_dark_past.holds');
    const scope: StepScope = { ...SCOPE, step: 's2', target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, fuzzyStatements: [], openItems: ['proof:t1'] };
    const ledger = [created('Spyro.t1.holds', 'proof', 's1'), created('Spyro.t2.holds', 'proof', 's1')];
    const j = judge(chainProved(base, ['t1']), { base, stepStart: S0, scope, inferences: t1Only, ledger, ended: ['t1'], freeze: freezeOf(S0, 't1', ['cynder-dark-past'], base) });
    const found = withCode(j.stepFindings, 'existing-changed');
    // Token `uncovered` (fixer 2b1b r2, R1-3): the board does not say the person reviews it either.
    expect(found.map((f) => [f.token, f.names?.[0]])).toEqual([['uncovered', 'Spyro.t2.holds']]);
    expect(found[0]?.message).toContain('Spyro.t2.holds was written earlier in this session, and no review item covers it: leave it exactly as it is in this step; restore it.');
  });
});

describe('fixer 2b1b r1: judgeState’s contract, and one finding per problem', () => {
  it('a step purpose without its scope or S₀ throws (S-F3): it is never judged as a stage', () => {
    const input = { stage: 'prove' as const, commit: 'c', filesKey: 'k', base: modelOf(BASE), current: modelOf(PROVED), inferences: [INFERENCE], ledger: [], items: [], premises: [], ended: [], rejectedArrows: [] };
    for (const purpose of ['check', 'freeze', 'gate-proved', 'gate-other'] as const) {
      expect(() => judgeState({ ...input, purpose }), purpose).toThrow(ActionError);
      expect(() => judgeState({ ...input, purpose, scope: SCOPE }), purpose).toThrow(/judges a running step, and needs its scope and the state it started from/);
      expect(() => judgeState({ ...input, purpose, stepStart: modelOf(BASE) }), purpose).toThrow(ActionError);
    }
    expect(judgeState({ ...input, purpose: 'stage', ended: [TARGET], ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')] }).ok).toBe(true);
  });

  it('a premise draft repeating a rejected one is `premise` only, also when its item exists (a Submit step, S-F7)', () => {
    const draft = draftOf({ step: 's2' });
    const key = `premise:${TARGET}:cynder_is_evil`;
    const rejected = record(key, 'add-premise', { status: 'declined', decline: { option: 'reject', at: 'now' }, rejectedFingerprints: [premiseDraftKey(draft)] });
    const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [`proof:${TARGET}`] };
    const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
    const j = judge(PROVED, { stepStart: PROVED, scope: submit, freeze: freezeOf(PROVED), items: [rejected], premises: [draft], ended: [TARGET], inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }], ledger });
    expect(j.drafts.find((d) => d.key === key)?.contentKey).toBe(premiseDraftKey(draft));
    expect(tags(withCode(j.stepFindings, 'rejected-repeat'))).toEqual(['rejected-repeat/premise']);
  });
});

describe('fixer 2b1b r1: B.2’s cross-check in a session (A-ADV-6), and a target’s `.holds` Lean reports nothing about (C-V2B1B-C4)', () => {
  /** An axiom card that no arrow joins to the target, which the proof's footprint holds but its direct uses do not show. */
  const extraCard = '/-\n@@ telelean v1\nid: extra-card\ntype: ASSUMPTION\nnatural_name: An extra claim\nasserted: 2026-11-01\nlean: Spyro.extra_card\n-/\n/-- An extra claim -/\nabbrev extra_card : Prop := HasDarkPast cynder\naxiom extra_card.holds : extra_card\n';
  const base = append(FORMALISED, MAIN, extraCard);
  const footprint = ['Spyro.cynder_dark_past.holds', 'Spyro.extra_card.holds', 'Spyro.new_spyro_pg.holds', 'Spyro.pg_no_dark_past.holds'];
  const hidden = { overrides: { [TARGET_HOLDS]: { axioms: footprint } } };
  const ledger = [created(TARGET_HOLDS, 'proof')];

  it('a card in the footprint that no card the proof uses rests on is `unseen`, at the finish and at the stage; used directly and selected, it passes', () => {
    const j = judge(proved(base), { base, stepStart: base, freeze: freezeOf(base, TARGET, INFERENCE.question.sources, base), facts: hidden, scope: { ...SCOPE, fuzzyStatements: [] } });
    const found = withCode(j.stepFindings, 'undeclared-premise');
    expect(tags(found)).toEqual(['undeclared-premise/unseen']);
    expect(found[0]).toMatchObject({ nodeId: 'extra-card', inference: TARGET, names: ['Spyro.extra_card.holds'] });
    const stage = judge(proved(base), { base, purpose: 'stage', ledger, facts: hidden });
    expect(tags(withCode(stage.inferences[TARGET]?.findings ?? [], 'undeclared-premise'))).toEqual(['undeclared-premise/unseen']);
    expect(stage.inferences[TARGET]?.passes).toBe(false);
    // Used directly (in its value), with its arrow selected: no hidden edge.
    const selected = edit(base, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, extra-card');
    const question = { sources: [...INFERENCE.question.sources, 'extra-card'], fromNothing: false };
    const seen = { overrides: { [TARGET_HOLDS]: { axioms: footprint, valueConsts: ['Spyro.pg_no_dark_past.holds', 'Spyro.newSpyro', 'Spyro.cynder', 'Spyro.new_spyro_pg.holds', 'Spyro.cynder_dark_past.holds', 'Spyro.extra_card.holds'] } } };
    const ok = judge(proved(selected), { base: selected, purpose: 'stage', ledger, facts: seen, inferences: [{ ...INFERENCE, question }] });
    expect(withCode(ok.inferences[TARGET]?.findings ?? [], 'undeclared-premise')).toEqual([]);
    expect(ok.inferences[TARGET]?.passes).toBe(true);
  });

  it('a target’s theorem `.holds` Lean reported nothing about fails closed (`footprint`, `no-facts`): by check_lean, at the stage', () => {
    const drop = { overrides: { [TARGET_HOLDS]: { drop: true } } };
    const check = judge(PROVED, { purpose: 'check', stage: 'prove', freeze: freezeOf(FORMALISED), facts: drop });
    expect(tags(check.stepFindings)).toEqual(['footprint/no-facts']);
    expect(check.stepFindings[0]?.message).toContain('Lean reported nothing about Spyro.cynder_not_good.holds, so telelean cannot check what the proof of “cynder-not-good” rests on');
    const stage = judge(PROVED, { purpose: 'stage', ledger: [created('Spyro.pg_no_dark_past', 'statements'), created('Spyro.pg_no_dark_past.holds', 'statements'), created(TARGET_HOLDS, 'proof')], facts: drop });
    expect(tags(stage.inferences[TARGET]?.findings ?? [])).toEqual(['footprint/no-facts']);
    expect(stage.inferences[TARGET]?.passes).toBe(false);
    // A `private` one says why; a module that did not build is G1's (the build finding), not this rule's.
    const hiddenProof = edit(PROVED, MAIN, 'theorem cynder_not_good.holds', 'private theorem cynder_not_good.holds');
    expect(judge(hiddenProof, { purpose: 'check', stage: 'prove', freeze: freezeOf(FORMALISED), facts: drop }).stepFindings[0]?.message).toContain('(Lean does not report `private` declarations)');
    const lines = (PROVED[MAIN] as string).split('\n');
    const line = lines.findIndex((l) => l.startsWith('abbrev pg_no_dark_past'));
    const broken = judge(PROVED, { purpose: 'check', stage: 'prove', freeze: freezeOf(FORMALISED), facts: { ...drop, moduleStates: { [MAIN]: 'failed' }, messages: [{ file: MAIN, range: { start: { line, character: 0 }, end: { line, character: 4 } }, severity: 'error', text: 'boom' }] } });
    expect(withCode(broken.stepFindings, 'footprint')).toEqual([]);
    expect(tags(withCode(broken.stepFindings, 'build'))).toEqual(['build']);
  });
});

describe('fixer 2b1b r1: `other-result` on a written premise (C-V2B1B-C1), and a re-ask’s earlier material (C-V2B1B-C2)', () => {
  const base = withChain(BASE);
  const t1: SessionInference = { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] };
  const target: SessionInference = { ...INFERENCE, order: 1, steps: ['s2'] };
  const withDef = append(withChain(FORMALISED), VOCAB, '/-- wicked -/\ndef Wicked (c : Character) : Prop := HasDarkPast c');
  const done = append(withDef, MAIN, 'theorem t1.holds : t1 := cynder_dark_past.holds');
  const premiseCard = (id: string, lean: string) =>
    `/-\n@@ telelean v1\nid: ${id}\ntype: ASSUMPTION\nnatural_name: Cynder is wicked (${id})\nasserted: 2026-11-01\nlean: Spyro.${lean}\n-/\n/-- Cynder is wicked (${id}) -/\nabbrev ${lean} : Prop := Wicked cynder\naxiom ${lean}.holds : ${lean}`;
  const writtenFor = (card: string, lean: string, into: string, premises: string) =>
    edit(append(done, MAIN, premiseCard(card, lean)), MAIN, premises, `${premises}, ${card}`);
  const ledgerFor = (card: string, owner: string, lean: string): LedgerEntry[] => [
    created('Spyro.pg_no_dark_past', 'statements', 's0'),
    created('Spyro.pg_no_dark_past.holds', 'statements', 's0'),
    created('Spyro.Wicked', 'proof', 's1', `premise:t1:${lean}`),
    created('Spyro.t1.holds', 'proof', 's1'),
    { kind: 'premise', card, target: owner, holdAs: 'axiom', item: `premise:${owner}:${lean}`, commit: 'c-premise' },
  ];

  it('the card telelean wrote for t1’s premise may mention what its draft reached (t1’s proof material): the stage is ok, and the next step’s check too', () => {
    const written = writtenFor('cynder-wicked', 'cynder_wicked', 't1', 'natural_name: Cynder has a dark past, once\npremises: cynder-dark-past');
    const ledger = ledgerFor('cynder-wicked', 't1', 'cynder_wicked');
    const stage = judge(written, { base, purpose: 'stage', inferences: [t1, target], ledger, ended: ['t1'] });
    expect(stage.global).toEqual([]);
    expect(stage.ok).toBe(true);
    expect(stage.inferences.t1?.passes).toBe(true);
    const next = judge(written, { base, stepStart: written, scope: { ...SCOPE, step: 's2', fuzzyStatements: [] }, purpose: 'check', stage: 'prove', freeze: freezeOf(written, TARGET, INFERENCE.question.sources, base), inferences: [t1, target], ledger, ended: ['t1'] });
    expect(next.stepFindings).toEqual([]);
  });

  it('a premise card written for another target may not mention t1’s proof material: refused, that target’s finding', () => {
    const written = writtenFor('cynder-evil', 'cynder_evil', TARGET, 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past');
    const ledger = ledgerFor('cynder-evil', TARGET, 'cynder_evil');
    const stage = judge(written, { base, purpose: 'stage', inferences: [t1, target], ledger, ended: ['t1', TARGET] });
    expect(stage.global).toEqual([]);
    const found = withCode(stage.inferences[TARGET]?.findings ?? [], 'undeclared-premise');
    expect(found.map((f) => [f.token, f.names?.[0], f.nodeId])).toEqual([['other-result', 'Spyro.Wicked', 't1']]);
    expect(found[0]?.message).toContain('Spyro.Wicked was written for the proof of “t1”: a statement may not use it');
  });

  describe('a re-ask with fewer sources (§3.2): what an earlier step made for the target keeps the question it was made under until the step claims its new one', () => {
    /** s0 proved the target through a lemma it wrote in its proof phase. */
    const viaLemma = edit(
      PROVED,
      MAIN,
      'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n',
      'theorem cnd_lemma : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\ntheorem cynder_not_good.holds : cynder_not_good := cnd_lemma\n',
    );
    const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created('Spyro.cnd_lemma', 'proof', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
    const fewer = { sources: ['cynder-dark-past', 'new-spyro-pg'], fromNothing: false };
    const reask: StepScope = { ...SCOPE, step: 's2', question: fewer, fuzzyStatements: [] };
    const o = { stepStart: viaLemma, scope: reask, ledger, inferences: [{ ...INFERENCE, steps: ['s0', 's2'] }], ended: [TARGET], freeze: freezeOf(viaLemma, TARGET, fewer.sources) };
    const fresh = edit(viaLemma, MAIN, 'theorem cynder_not_good.holds : cynder_not_good := cnd_lemma', 'theorem cynder_not_good.holds : cynder_not_good := (fun _ _ => absurd) new_spyro_pg.holds cynder_dark_past.holds');
    const lemma = 'theorem cnd_lemma : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

    it('finishing not proved, everything as it was, passes (gate-other); so does check_lean before the proof changes', () => {
      expect(judge(viaLemma, { ...o, purpose: 'gate-other' }).stepFindings).toEqual([]);
      expect(judge(viaLemma, { ...o, purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
    });

    it('a proved finish claims the new question for the whole Result: the old lemma resting on a dropped source is refused, saying why; removed (the proof is open), the finish passes', () => {
      const kept = judge(fresh, { ...o, purpose: 'gate-proved' });
      expect(tags(kept.stepFindings)).toEqual(['footprint']);
      expect(kept.stepFindings[0]?.names).toEqual(['Spyro.pg_no_dark_past.holds']);
      expect(kept.stepFindings[0]?.message).toContain('An earlier step wrote it for “cynder-not-good” under a question this step no longer asks: the target\'s proof is open in this step, so remove it, or rest it on this step\'s sources.');
      // check_lean once T.holds changed speaks of it too.
      expect(tags(judge(fresh, { ...o, purpose: 'check', stage: 'prove' }).stepFindings)).toEqual(['footprint']);
      const removed = edit(fresh, MAIN, lemma, '');
      expect(judge(removed, { ...o, purpose: 'gate-proved' }).stepFindings).toEqual([]);
    });

    it('`other-result` likewise: old material may mention a source’s proof material while the old question stands, not once the step claims the new one', () => {
      const T_PREMISES = 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n';
      const chain = edit(withChain(FORMALISED), MAIN, T_PREMISES, T_PREMISES.replace('pg-no-dark-past\n', 'pg-no-dark-past, t1\n'));
      const S0 = proved(append(chain, MAIN, 'theorem t1_lemma : HasDarkPast cynder := cynder_dark_past.holds\ntheorem t1.holds : t1 := t1_lemma\ntheorem cnd_side : HasDarkPast cynder := t1_lemma'));
      const old = { sources: [...INFERENCE.question.sources, 't1'], fromNothing: false };
      const inferences: SessionInference[] = [{ target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] }, { ...INFERENCE, question: old, order: 1, steps: ['s0', 's2'] }];
      const ledger2 = [created('Spyro.t1_lemma', 'proof', 's1'), created('Spyro.t1.holds', 'proof', 's1'), created('Spyro.cnd_side', 'proof', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
      const scope: StepScope = { ...SCOPE, step: 's2', question: INFERENCE.question, fuzzyStatements: [] };
      const p = { base: chain, stepStart: S0, scope, inferences, ledger: ledger2, ended: ['t1', TARGET], freeze: freezeOf(S0, TARGET, INFERENCE.question.sources, chain) };
      expect(judge(S0, { ...p, purpose: 'gate-other' }).stepFindings).toEqual([]);
      const claimed = judge(S0, { ...p, purpose: 'gate-proved' });
      expect(withCode(claimed.stepFindings, 'undeclared-premise').map((f) => [f.token, f.names?.[0], f.nodeId])).toEqual([['other-result', 'Spyro.t1_lemma', 't1']]);
    });

    it('a finish without a proof leaves the Result as it was: the old lemma may not go then (`existing-changed`, `session`)', () => {
      const removed = edit(viaLemma, MAIN, lemma, '');
      expect(tags(withCode(judge(removed, { ...o, purpose: 'gate-other' }).stepFindings, 'existing-changed'))).toEqual(['existing-changed/session']);
    });
  });
});

describe('fixer 2b1b r1 (C-V2B1B-C5): slice 1’s `example` message speaks the session’s rules', () => {
  it('it suggests a named lemma, never `#check` (a stray command in a session)', () => {
    const j = judge(append(PROVED, MAIN, 'example : HasDarkPast cynder := cynder_dark_past.holds'), { purpose: 'check', stage: 'prove', freeze: freezeOf(FORMALISED) });
    const found = withCode(j.stepFindings, 'footprint');
    expect(tags(found)).toEqual(['footprint/example']);
    expect(found[0]?.message).toContain('(to try something out, use a named lemma)');
    expect(found[0]?.message).not.toContain('#check');
  });
});

describe('fixer 2b1b r2 (C-V2B1B-C2): in a re-ask, the target’s own `.holds` is judged with the question its Result’s material is judged with', () => {
  // The review's R4: an earlier step (s0) proved T through t1_lemma, t1's proof material, while t1 was a source of T's
  // question (D2-50 allows it); the re-ask s2 drops t1.
  const T_PREMISES = 'natural_name: Cynder would not be a good addition to the new Spyro game\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n';
  const chain = edit(withChain(FORMALISED), MAIN, T_PREMISES, T_PREMISES.replace('pg-no-dark-past\n', 'pg-no-dark-past, t1\n'));
  const oldProof = 'theorem cynder_not_good.holds : cynder_not_good :=\n  (fun _ => pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds) t1_lemma';
  const S0 = append(append(chain, MAIN, 'theorem t1_lemma : HasDarkPast cynder := cynder_dark_past.holds\ntheorem t1.holds : t1 := t1_lemma'), MAIN, oldProof);
  const old = { sources: [...INFERENCE.question.sources, 't1'], fromNothing: false };
  const inferences: SessionInference[] = [
    { target: 't1', question: { sources: ['cynder-dark-past'], fromNothing: false }, order: 0, steps: ['s1'] },
    { ...INFERENCE, question: old, order: 1, steps: ['s0', 's2'] },
  ];
  const ledger = [created('Spyro.t1_lemma', 'proof', 's1'), created('Spyro.t1.holds', 'proof', 's1'), created(TARGET_HOLDS, 'proof', 's0')];
  const scope: StepScope = { ...SCOPE, step: 's2', question: INFERENCE.question, fuzzyStatements: [] };
  const o = { base: chain, stepStart: S0, scope, inferences, ledger, ended: ['t1', TARGET] };
  const frozen = { ...o, freeze: freezeOf(S0, TARGET, INFERENCE.question.sources, chain) };
  const fresh = edit(S0, MAIN, oldProof, 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds');

  it('the old proof stands until the step claims the new question: its checks and its freeze, check_lean, a finish without a proof, and the stage before', () => {
    expect(judge(S0, { ...o, purpose: 'check', stage: 'formalise' }).stepFindings).toEqual([]);
    expect(judge(S0, { ...o, purpose: 'freeze', stage: 'formalise' }).stepFindings).toEqual([]);
    expect(judge(S0, { ...frozen, purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
    expect(judge(S0, { ...frozen, purpose: 'gate-other' }).stepFindings).toEqual([]);
    const stage = judge(S0, { base: chain, purpose: 'stage', inferences, ledger, ended: ['t1', TARGET] });
    expect(stage.global).toEqual([]);
    expect(stage.inferences[TARGET]?.passes).toBe(true);
  });

  it('a proved finish claims it: the old proof is `other-result`; a new proof from the new sources passes (finish, check_lean); a changed proof still using it is refused by check_lean', () => {
    const claimed = judge(S0, { ...frozen, purpose: 'gate-proved' });
    expect(claimed.stepFindings.map((f) => [f.code, f.token, f.names?.[0], f.nodeId])).toEqual([['undeclared-premise', 'other-result', 'Spyro.t1_lemma', 't1']]);
    expect(claimed.stepFindings[0]?.message).toContain('Spyro.t1_lemma belongs to the proof of “t1”, which is not a premise of “cynder-not-good”: prove what you need here.');
    expect(judge(fresh, { ...frozen, purpose: 'gate-proved' }).stepFindings).toEqual([]);
    expect(judge(fresh, { ...frozen, purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
    const reworked = edit(S0, MAIN, oldProof, oldProof.replace(') t1_lemma', ') (t1_lemma)'));
    expect(tags(judge(reworked, { ...frozen, purpose: 'check', stage: 'prove' }).stepFindings)).toEqual(['undeclared-premise/other-result']);
    // Not a re-ask (the step asks the old question): the old proof passes at a proved finish too.
    const same = { ...frozen, scope: { ...scope, question: old }, freeze: freezeOf(S0, TARGET, old.sources, chain) };
    expect(judge(S0, { ...same, purpose: 'gate-proved' }).stepFindings).toEqual([]);
  });
});

describe('fixer 2b1b r2 (R1-1): the comment of content the step opens may be reworded', () => {
  const helper = 'namespace Lemmas\n-- a helper of the proof\ntheorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds\nend Lemmas';
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0'), created('Spyro.Lemmas.t_lemma', 'proof', 's0')];
  const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
  const S0 = append(PROVED, MAIN, helper);
  const reworded = edit(S0, MAIN, '-- a helper of the proof', '-- the helper the proof uses');
  const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [`proof:${TARGET}`] };
  const o = { stepStart: S0, scope: submit, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0) };

  it('a Submit step that opened the Result rewords its lemma’s comment, the lemma as it was: it passes (check, both finishes), and the stage holds the comment with the lemma', () => {
    for (const purpose of ['check', 'gate-proved', 'gate-other'] as const) expect(judge(reworded, { ...o, purpose, stage: 'prove' }).stepFindings, purpose).toEqual([]);
    const stage = judge(reworded, { purpose: 'stage', ledger, inferences, ended: [TARGET] });
    expect(stage.global).toEqual([]);
    expect(stage.problems).toEqual([]);
  });

  it('next to content the step did not open, the reworded comment is still a stray comment (and the old line is `text`)', () => {
    // A finish without a proof leaves the Result as it was: it opens nothing of it, unless its items say so.
    const kept: StepScope = { ...submit, openItems: [] };
    const j = judge(reworded, { ...o, scope: kept, purpose: 'gate-other', stage: 'prove' });
    expect(tags(j.stepFindings).sort()).toEqual(['existing-changed/text', 'stray-command/comment']);
    expect(withCode(j.stepFindings, 'stray-command')[0]?.message).toContain('this comment is not next to a declaration this step wrote or changed');
    // The proof closed: check_lean refuses it the same way.
    const closed = judge(reworded, { ...o, scope: { ...kept, openProof: false }, purpose: 'check', stage: 'prove' });
    expect(tags(closed.stepFindings).sort()).toEqual(['existing-changed/text', 'stray-command/comment']);
  });

  it('a new comment above the person’s own proof stays a stray comment, though the open proof may be replaced: no item would hold it at the stage', () => {
    const noted = edit(PROVED, MAIN, 'theorem cynder_not_good.holds', '-- the person’s proof\ntheorem cynder_not_good.holds');
    const own = { base: PROVED, stepStart: PROVED, scope: { ...SCOPE, step: 's2', fuzzyStatements: [] }, inferences, ended: [TARGET], freeze: freezeOf(PROVED, TARGET, INFERENCE.question.sources, PROVED) };
    expect(tags(judge(noted, { ...own, purpose: 'check', stage: 'prove' }).stepFindings)).toEqual(['stray-command/comment']);
    expect(judge(noted, { base: PROVED, purpose: 'stage', inferences, ended: [TARGET] }).problems.map((p) => p.code)).toEqual(['unowned']);
  });
});

describe('fixer 2b1b r2 (R1-2): E(T) is read with the judged state, always', () => {
  const ledger: LedgerEntry[] = [
    { kind: 'arrow', source: 'new-spyro-pg', target: 't2', step: 's2', why: 'w' },
    { kind: 'premise', card: 'pg-no-dark-past', target: 't2', holdAs: 'axiom', item: 'premise:t2:p', commit: 'c' },
  ];
  const base = withChain(BASE);

  it('an earlier step’s ledger arrow the state does not draw is no source; the running step’s own is; without the state there is no E(T) (it throws, never the ledger alone)', () => {
    expect(extraSources('t2', ledger, [], modelOf(base))).toEqual(['pg-no-dark-past']);
    expect(extraSources('t2', ledger, [], modelOf(base), 's2')).toEqual(['new-spyro-pg', 'pg-no-dark-past']);
    const drawn = edit(base, MAIN, 'natural_name: Cynder has a dark past, twice\npremises: t1\n', 'natural_name: Cynder has a dark past, twice\npremises: t1, new-spyro-pg\n');
    expect(extraSources('t2', ledger, [], modelOf(drawn))).toEqual(['new-spyro-pg', 'pg-no-dark-past']);
    expect(extraSources('t2', [], [], modelOf(drawn))).toEqual([]);
    // @ts-expect-error E(T) needs the judged state (§4.8): the drawn test is never skipped.
    expect(() => extraSources('t2', ledger, [])).toThrow(TypeError);
  });
});

describe('fixer 2b1b r2 (R1-4): a declined Claude arrow drawn again by hand is B.3’s alone', () => {
  const premisesOf = (texts: Texts) => edit(texts, MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past', 'premises: cynder-dark-past, pg-no-dark-past');
  const B1 = premisesOf(FORMALISED);
  const S0 = premisesOf(PROVED);
  const arrowItem = record(`arrow:new-spyro-pg>${TARGET}`, 'add-arrow', { status: 'declined', decline: { option: 'plain', at: 'now' }, origin: { step: 's0', target: TARGET, phase: 'proof' }, partOf: TARGET });
  const ledger: LedgerEntry[] = [{ kind: 'arrow', source: 'new-spyro-pg', target: TARGET, step: 's0', why: 'w' }, created(TARGET_HOLDS, 'proof', 's1')];
  const question = { sources: ['cynder-dark-past', 'pg-no-dark-past'], fromNothing: false };
  const inferences = [{ ...INFERENCE, question, steps: ['s0', 's1', 's3'] }];
  const scope: StepScope = { ...SCOPE, step: 's3', question, fuzzyStatements: [] };
  const o = { base: B1, stepStart: S0, scope, inferences, ledger, ended: [TARGET], rejectedArrows: [{ source: 'new-spyro-pg', target: TARGET }], freeze: freezeOf(S0, TARGET, question.sources, B1) };

  it('at a step, `arrow` (`declined`) only, not G5’s `premises` too; at the stage the same; not declined, it stays G5’s (A-ADV-5)', () => {
    const j = judge(PROVED, { ...o, items: [arrowItem], purpose: 'check', stage: 'prove' });
    expect(tags(j.stepFindings)).toEqual(['arrow/declined']);
    // Builder 2b2 (carry-over R2-2): the step drew it (S₀ did not): the message ends with what Claude must do.
    expect(j.stepFindings[0]?.message).toContain(
      'The person declined “new-spyro-pg” → “cynder-not-good” in this session: do not propose it again. You drew it by editing `premises:`: never edit `premises:`; remove it.',
    );
    expect(j.stepFindings[0]?.message.endsWith('You drew it by editing `premises:`: never edit `premises:`; remove it.')).toBe(true);
    expect(j.stepFindings[0]?.message).not.toContain('It is still drawn');
    // At the stage no step drew it: the state, as before.
    const stage = judge(PROVED, { base: B1, purpose: 'stage', inferences, ledger, items: [arrowItem], ended: [TARGET], rejectedArrows: o.rejectedArrows });
    expect(tags(stage.global)).toEqual(['arrow/declined']);
    expect(stage.global[0]?.message).toContain('It is still drawn into “cynder-not-good”: it may not be used.');
    expect(stage.global[0]?.message).not.toContain('You drew it');
    const inReview = record(`arrow:new-spyro-pg>${TARGET}`, 'add-arrow', { status: 'in-review', origin: { step: 's0', target: TARGET, phase: 'proof' }, partOf: TARGET });
    expect(tags(judge(PROVED, { ...o, items: [inReview], rejectedArrows: [], purpose: 'check', stage: 'prove' }).stepFindings)).toEqual(['markup/premises']);
    // A declined record with no ledger arrow (B.3 has nothing to say): G5 says it.
    expect(tags(judge(PROVED, { ...o, ledger: [created(TARGET_HOLDS, 'proof', 's1')], items: [arrowItem], purpose: 'check', stage: 'prove' }).stepFindings)).toEqual(['markup/premises']);
  });

  it('builder 2b2 (R2-2): at a step whose S₀ already drew the declined arrow, the step did not draw it: the state’s wording stays', () => {
    const j = judge(PROVED, { ...o, stepStart: PROVED, freeze: freezeOf(PROVED, TARGET, question.sources, B1), items: [arrowItem], purpose: 'check', stage: 'prove' });
    expect(tags(j.stepFindings)).toEqual(['arrow/declined']);
    expect(j.stepFindings[0]?.message).toContain('It is still drawn into “cynder-not-good”: it may not be used.');
    expect(j.stepFindings[0]?.message).not.toContain('You drew it');
  });
});

describe('builder 2b2 (carry-over R2-1): a comment a step adds is judged by the stage’s attachment too', () => {
  const evil = 'def Evil (c : Character) : Prop := HasDarkPast c';
  const lemma = 'theorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds';
  const earlier = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
  const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
  const stageOf = (texts: Texts, ledger: LedgerEntry[]) => judge(texts, { purpose: 'stage', ledger, inferences, ended: [TARGET] });
  const keyOf = (texts: Texts, ledger: LedgerEntry[], key: string) => stageOf(texts, ledger).drafts.find((d) => d.key === key)?.contentKey;

  // S₀: an earlier step's proof lemma (part of the target's Result) directly above its statement-phase definition, no
  // markup block between them. A Submit step opens the Result (so the lemma), not the definition.
  const ledger = [...earlier, created('Spyro.t_lemma', 'proof', 's0'), created('Spyro.Evil', 'statements', 's0')];
  const S0 = append(PROVED, MAIN, `${lemma}\n${evil}`);
  const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [`proof:${TARGET}`] };
  const o = { stepStart: S0, scope: submit, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0) };
  const between = edit(S0, MAIN, evil, `-- Evil: a dark past\n${evil}`);

  it('below an opened, unchanged lemma and above a definition the step was not given: refused, naming the definition it would go with', () => {
    // The problem: the stage attaches the comment to the definition below it, whose content key changes.
    expect(keyOf(between, ledger, 'decl:Spyro.Evil')).not.toBe(keyOf(S0, ledger, 'decl:Spyro.Evil'));
    for (const purpose of ['check', 'gate-proved', 'gate-other'] as const) {
      const j = judge(between, { ...o, purpose, stage: 'prove' });
      expect(tags(j.stepFindings), purpose).toEqual(['stray-command/comment']);
      expect(j.stepFindings[0]?.names).toEqual(['Spyro.Evil']);
      expect(j.stepFindings[0]?.message).toContain(
        'this comment would go with Spyro.Evil, which existed when this step started and which this step may not change: put it directly above a declaration this step wrote or changed, or remove it.',
      );
    }
  });

  it('the same comment passes once the step may change the definition (its item opened); a reworded comment of the lemma itself passes (R1-1)', () => {
    const opened: StepScope = { ...submit, openItems: [`proof:${TARGET}`, 'decl:Spyro.Evil'] };
    expect(judge(between, { ...o, scope: opened, purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
    const noted = append(PROVED, MAIN, `-- the lemma\n${lemma}\n${evil}`);
    const reworded = edit(noted, MAIN, '-- the lemma', '-- the lemma the proof uses');
    expect(judge(reworded, { ...o, stepStart: noted, freeze: freezeOf(noted), purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
  });

  it('the older case: a trailing comment of a new lemma, directly above a definition the step was not given, is refused too', () => {
    const start = append(PROVED, MAIN, evil);
    const ledger1 = [...earlier, created('Spyro.Evil', 'statements', 's0')];
    const trailing = edit(start, MAIN, evil, `theorem n_lemma : HasDarkPast cynder := cynder_dark_past.holds\n-- the lemma above\n${evil}`);
    const scope: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
    expect(keyOf(trailing, [...ledger1, created('Spyro.n_lemma', 'proof', 's2')], 'decl:Spyro.Evil')).not.toBe(keyOf(start, ledger1, 'decl:Spyro.Evil'));
    const j = judge(trailing, { stepStart: start, scope, ledger: ledger1, inferences, ended: [TARGET], freeze: freezeOf(start), purpose: 'check', stage: 'prove' });
    expect(tags(j.stepFindings)).toEqual(['stray-command/comment']);
    expect(j.stepFindings[0]?.names).toEqual(['Spyro.Evil']);
    // With no declaration below it (the lemma written last), the trailing comment goes with the lemma at the stage too.
    const last = append(start, MAIN, 'theorem n_lemma : HasDarkPast cynder := cynder_dark_past.holds\n-- the lemma above');
    expect(judge(last, { stepStart: start, scope, ledger: ledger1, inferences, ended: [TARGET], freeze: freezeOf(start), purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
  });

  it('a comment the stage would attach to nothing (computeItems would report it unowned) is a plain stray comment', () => {
    // B has a definition; an earlier step changed it (a vocabulary change); a Submit step that opened it puts B's text
    // back, with a comment above: against S₀ it goes with the changed definition, against B with nothing.
    const base = append(BASE, MAIN, evil);
    const start = edit(base, MAIN, evil, 'def Evil (c : Character) : Prop := HasDarkPast c ∧ True');
    const back = edit(start, MAIN, 'def Evil (c : Character) : Prop := HasDarkPast c ∧ True', `-- back as it was\n${evil}`);
    const scope: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openProof: false, openArrows: false, openItems: ['decl:Spyro.Evil'] };
    const j = judge(back, { base, stepStart: start, scope, inferences, ended: [TARGET], purpose: 'check', stage: 'formalise' });
    expect(tags(j.stepFindings)).toEqual(['stray-command/comment']);
    expect(j.stepFindings[0]?.names).toBeUndefined();
    expect(j.stepFindings[0]?.message).toContain('this comment is not next to a declaration this step wrote or changed');
    expect(judge(back, { base, purpose: 'stage', inferences, ended: [TARGET] }).problems.map((p) => p.code)).toEqual(['unowned']);
  });

  it('a comment above a declaration the step changed but may not: the step limits’ one finding, no comment finding too', () => {
    const start = append(PROVED, MAIN, evil);
    const ledger1 = [...earlier, created('Spyro.Evil', 'statements', 's0')];
    const rewritten = edit(start, MAIN, evil, '-- reworded\ndef Evil (c : Character) : Prop := HasDarkPast c ∧ True');
    const scope: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
    const j = judge(rewritten, { stepStart: start, scope, ledger: ledger1, inferences, ended: [TARGET], freeze: freezeOf(start), purpose: 'check', stage: 'prove' });
    expect(tags(j.stepFindings)).toContain('existing-changed/session');
    expect(tags(j.stepFindings)).not.toContain('stray-command/comment');
  });

  it('at the stage and the end nothing changes: the reference is B already', () => {
    const stage = stageOf(between, ledger);
    expect(tags(stage.global)).toEqual([]);
    // Fixer 2b2 r1 (C-V2B2-C4): the end too.
    expect(tags(judge(between, { purpose: 'final', ledger, inferences, ended: [TARGET] }).global)).toEqual([]);
  });
});

describe('fixer 2b2 r1 (A-V2B2-ADV-4): an item of S₀ the step may not change keeps its content key, comments included', () => {
  const evil = 'def Evil (c : Character) : Prop := HasDarkPast c';
  const lemma = 'theorem n_lemma : HasDarkPast cynder := cynder_dark_past.holds';
  const earlier = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
  const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];
  const ledger = [...earlier, created('Spyro.Evil', 'statements', 's0')];
  const keyOf = (texts: Texts, l: LedgerEntry[]) => judge(texts, { purpose: 'stage', ledger: l, inferences, ended: [TARGET] }).drafts.find((d) => d.key === 'decl:Spyro.Evil')?.contentKey;
  const scope: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [] };
  const atStep = (W: Texts, S0: Texts, purpose: 'check' | 'gate-proved' = 'check', s: StepScope = scope) =>
    judge(W, { stepStart: S0, scope: s, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0), purpose, stage: 'prove' });
  const frozen = (W: Texts, S0: Texts, purpose: 'check' | 'gate-proved' = 'check') => {
    const j = atStep(W, S0, purpose);
    expect(tags(j.stepFindings), purpose).toEqual(['existing-changed/session']);
    expect(j.stepFindings[0]?.names).toEqual(['Spyro.Evil']);
    expect(j.stepFindings[0]?.message).toBe(CLAUDE_SESSION_TEXTS.frozenItemChanged('Spyro.Evil'));
  };

  it('A1: a lemma written between an earlier step’s comment and the definition it describes takes the comment', () => {
    const S0 = append(PROVED, MAIN, `-- Evil: a dark past\n${evil}`);
    const W = edit(S0, MAIN, `-- Evil: a dark past\n${evil}`, `-- Evil: a dark past\n${lemma}\n${evil}`);
    expect(keyOf(W, [...ledger, created('Spyro.n_lemma', 'proof', 's2')])).not.toBe(keyOf(S0, ledger));
    frozen(W, S0);
    frozen(W, S0, 'gate-proved');
    // Written above the comment instead, the comment keeps its declaration: nothing to say.
    const above = edit(S0, MAIN, `-- Evil: a dark past\n${evil}`, `${lemma}\n-- Evil: a dark past\n${evil}`);
    expect(atStep(above, S0).stepFindings).toEqual([]);
    // With the definition's item opened, its key may change.
    expect(atStep(W, S0, 'check', { ...scope, openItems: ['decl:Spyro.Evil'] }).stepFindings).toEqual([]);
    // Facts missing (a failed probe): the keys cannot be compared, so nothing is said here.
    expect(tags(judge(W, { stepStart: S0, scope, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0), purpose: 'check', stage: 'prove', facts: { probe: 'failed' } }).stepFindings)).not.toContain('existing-changed/session');
    // S₀'s facts from before the probe's marker (no typeConsts) and the judged state's with it: the keys differ by the
    // facts alone, so nothing is compared (§2.1's approximate case); with the marker on both, the unchanged state passes.
    const o = { stepStart: S0, scope, ledger, inferences, ended: [TARGET], freeze: freezeOf(S0), purpose: 'check' as const, stage: 'prove' as const };
    expect(judge(S0, { ...o, startFacts: { typeConsts: false }, facts: { probe: 'ok' } }).stepFindings).toEqual([]);
    expect(judge(S0, { ...o, startFacts: { probe: 'ok' }, facts: { probe: 'ok' } }).stepFindings).toEqual([]);
  });

  it('A2: a lemma written below an earlier definition’s trailing comment takes the comment', () => {
    const S0 = append(PROVED, MAIN, `${evil}\n-- Evil done`);
    const W = append(S0, MAIN, lemma);
    expect(keyOf(W, [...ledger, created('Spyro.n_lemma', 'proof', 's2')])).not.toBe(keyOf(S0, ledger));
    frozen(W, S0);
  });

  it('A3: a Submit step that removes its opened lemma and leaves the lemma’s comment, which then goes with the definition above it', () => {
    const l3 = [...ledger, created('Spyro.t_lemma', 'proof', 's0')];
    const tLemma = 'theorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds';
    const S0 = append(PROVED, MAIN, `${evil}\n-- the lemma\n${tLemma}`);
    const W = edit(S0, MAIN, `-- the lemma\n${tLemma}`, '-- the lemma');
    const submit: StepScope = { ...scope, openItems: [`proof:${TARGET}`] };
    const j = judge(W, { stepStart: S0, scope: submit, ledger: l3, inferences, ended: [TARGET], freeze: freezeOf(S0), purpose: 'check', stage: 'prove' });
    expect(tags(j.stepFindings)).toEqual(['existing-changed/session']);
    expect(j.stepFindings[0]?.names).toEqual(['Spyro.Evil']);
    // Removing the comment with its lemma passes.
    const clean = edit(S0, MAIN, `\n-- the lemma\n${tLemma}`, '');
    expect(judge(clean, { stepStart: S0, scope: submit, ledger: l3, inferences, ended: [TARGET], freeze: freezeOf(S0), purpose: 'check', stage: 'prove' }).stepFindings).toEqual([]);
  });

  it('the active target’s Result is its own rules’ only while the scope opens it: with its proof closed, a definition written below its lemma’s comment takes the comment', () => {
    const l4 = [...earlier, created('Spyro.t_lemma', 'proof', 's0')];
    const tLemma = 'theorem t_lemma : HasDarkPast cynder := cynder_dark_past.holds';
    const S0 = append(PROVED, MAIN, `-- the lemma\n${tLemma}`);
    const W = edit(S0, MAIN, `-- the lemma\n${tLemma}`, `-- the lemma\n${evil}\n${tLemma}`);
    const closed: StepScope = { ...scope, openProof: false };
    const j = judge(W, { stepStart: S0, scope: closed, ledger: l4, inferences, ended: [TARGET], purpose: 'check', stage: 'formalise' });
    expect(tags(j.stepFindings)).toEqual(['existing-changed/session']);
    expect(j.stepFindings[0]?.names).toEqual([TARGET_HOLDS, 'Spyro.t_lemma']);
    // With the proof open, the Result is the step's to change.
    expect(judge(W, { stepStart: S0, scope, ledger: l4, inferences, ended: [TARGET], purpose: 'check', stage: 'formalise' }).stepFindings).toEqual([]);
  });
});

describe('fixer 2b2 r2 (R1-1): a premise draft that is not written is outside ws/, so a later step may propose it again (§3.5, S13)', () => {
  const ledger = [created('Spyro.pg_no_dark_past', 'statements', 's0'), created('Spyro.pg_no_dark_past.holds', 'statements', 's0'), created(TARGET_HOLDS, 'proof', 's0')];
  const key = `premise:${TARGET}:cynder_is_evil`;
  const old = draftOf({ step: 's0' });
  const reworded = draftOf({ step: 's2', naturalName: 'Cynder is evil, really', leanStatement: 'HasDarkPast cynder ∧ True' });
  const rejected = record(key, 'add-premise', { status: 'declined', decline: { option: 'reject', at: 'now' }, rejectedFingerprints: [premiseDraftKey(old)] });
  const submit: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [`proof:${TARGET}`] };
  const inferences = [{ ...INFERENCE, steps: ['s0', 's2'] }];

  it('a reworded repeat of a rejected premise at a Submit step (check, gate-proved) and at a not-proved finish (gate-other) passes; the item reads the newer draft', () => {
    for (const purpose of ['check', 'gate-proved'] as const) {
      const j = judge(PROVED, { stepStart: PROVED, scope: submit, freeze: freezeOf(PROVED), items: [rejected], premises: [old, reworded], ended: [TARGET], inferences, ledger, purpose });
      expect(j.stepFindings, purpose).toEqual([]);
      expect(j.drafts.find((d) => d.key === key)?.contentKey).toBe(premiseDraftKey(reworded));
    }
    // The finish that proposes the missing premise again (T not proved).
    const notProved = ledger.slice(0, 2);
    const o = { stepStart: FORMALISED, scope: submit, freeze: freezeOf(FORMALISED), items: [rejected], ended: [TARGET], inferences, ledger: notProved, purpose: 'gate-other' as const };
    expect(judge(FORMALISED, { ...o, premises: [old] }).stepFindings).toEqual([]);
    expect(judge(FORMALISED, { ...o, premises: [old, reworded] }).stepFindings).toEqual([]);
  });

  it('a premise still in review, proposed again reworded by a later step that opens no item, passes', () => {
    const step: StepScope = { ...SCOPE, step: 's2', fuzzyStatements: [], openItems: [] };
    const inReview = record(key, 'add-premise', { status: 'in-review' });
    const j = judge(PROVED, { stepStart: PROVED, scope: step, freeze: freezeOf(PROVED), items: [inReview], premises: [old, reworded], ended: [TARGET], inferences, ledger, purpose: 'gate-proved' });
    expect(j.stepFindings).toEqual([]);
  });

  it('the exact repeat of the rejected premise stays `rejected-repeat/premise` alone', () => {
    const j = judge(PROVED, { stepStart: PROVED, scope: submit, freeze: freezeOf(PROVED), items: [rejected], premises: [old, { ...old, step: 's2' }], ended: [TARGET], inferences, ledger });
    expect(tags(j.stepFindings)).toEqual(['rejected-repeat/premise']);
  });

  it('a written premise is in ws/ and stays frozen: a lemma written below the comment after its `.holds` takes the comment', () => {
    const marked = edit(pinned(literal()), MAIN, 'premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n', 'follows_from: nothing\n');
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
    const pkey = `premise:${TARGET}:not_in_game_not_good`;
    const l: LedgerEntry[] = [
      { kind: 'premise', card: plan.nodeId, target: TARGET, holdAs: 'axiom', item: pkey, commit: 'c-adopt' },
      { kind: 'mark-removed', card: TARGET, item: pkey, commit: 'c-adopt' },
    ];
    const question = { sources: [], fromNothing: true };
    const infs: SessionInference[] = [{ target: TARGET, question, order: 0, steps: ['s1', 's2'] }];
    const premises = [draftOf({ leanName: 'not_in_game_not_good', naturalName: request.naturalName, leanStatement: request.leanStatement })];
    const holds = 'axiom not_in_game_not_good.holds : not_in_game_not_good\n';
    const S0 = edit(written, MAIN, holds, `${holds}-- held as an axiom\n`);
    const W = edit(S0, MAIN, `${holds}-- held as an axiom\n`, `${holds}-- held as an axiom\ntheorem n_lemma : True := trivial\n`);
    const step: StepScope = { step: 's2', target: TARGET, question, fuzzyStatements: [], openProof: true, openArrows: true, openItems: [] };
    const o = { base: marked, stepStart: S0, scope: step, ledger: l, inferences: infs, ended: [TARGET], premises, freeze: freezeOf(S0, TARGET, [], marked), stage: 'prove' as const };
    expect(judge(S0, { ...o, purpose: 'check' }).stepFindings).toEqual([]);
    for (const purpose of ['check', 'gate-other'] as const) {
      const j = judge(W, { ...o, purpose });
      expect(tags(j.stepFindings), purpose).toEqual(['existing-changed/session']);
      expect(j.stepFindings[0]?.names).toEqual(['Spyro.not_in_game_not_good', 'Spyro.not_in_game_not_good.holds']);
    }
  });
});

describe('fixer 2c1 r2 (R1-1): a card’s statement is statement content, whatever phase of its step wrote it (§4.9, D2-43)', () => {
  const PENDING = 'axiom cynder_not_good.holds : cynder_not_good\n';
  /** B: the target pending, pg-no-dark-past code-less. */
  const B1 = edit(BASE, MAIN, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n', `abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n${PENDING}`);
  const DEF = '/-- has a dark character -/\ndef DarkChar (c : Character) : Prop := HasDarkPast c';
  /** The step formalised pg-no-dark-past with a new definition its statement uses. */
  const withDef = (texts: Texts) => edit(edit(texts, VOCAB, '/-- Cynder -/', `${DEF}\n/-- Cynder -/`), MAIN, 'IsPG g → HasDarkPast c →', 'IsPG g → DarkChar c →');
  const STATEMENTS = withDef(pinned(normative(B1)));
  const o = { base: B1, stepStart: B1, scope: SCOPE };
  const otherResult = (j: ReturnType<typeof judge>) => withCode(j.stepFindings, 'undeclared-premise').filter((f) => f.token === 'other-result');

  it('a not-proved finish without freeze_statements whose new statement uses a definition the step wrote is refused, asking for the freeze; with the freeze it passes', () => {
    // Without the freeze, everything the step wrote reads `proof` at a finish (as its end would record it, §3.4), so the
    // definition would be hidden with the Result while the statement that uses it is listed (computeItems: `card:<c>`).
    const none = judge(STATEMENTS, { ...o, purpose: 'gate-other' });
    const found = otherResult(none);
    expect(found.map((f) => [f.names?.[0], f.nodeId, f.inference])).toEqual([['Spyro.DarkChar', TARGET, TARGET]]);
    expect(found[0]?.message).toContain(CLAUDE_SESSION_TEXTS.otherResultNotFrozen('Spyro.DarkChar'));
    // Builder 2c2 (carry-over R2-1): the late freeze holds statement content only once the attempt's own helpers are gone.
    expect(found[0]?.message).toContain('Remove what you wrote only for the proof attempt, call freeze_statements, then finish again.');
    expect(none.stepFindings).toEqual(found);
    // With the step's freeze, the statement and the definition are statement content: the finish passes.
    expect(judge(STATEMENTS, { ...o, purpose: 'gate-other', freeze: freezeOf(STATEMENTS, TARGET, INFERENCE.question.sources, B1) }).stepFindings).toEqual([]);
    // A statement that uses only B's names needs no freeze; check_lean while formalising says nothing either.
    expect(judge(pinned(normative(B1)), { ...o, purpose: 'gate-other' }).stepFindings).toEqual([]);
    expect(judge(STATEMENTS, { ...o, purpose: 'check', stage: 'formalise' }).stepFindings).toEqual([]);
  });

  it('a card formalised after the freeze may not use a definition written after it either (the statement message)', () => {
    const frozenEarly = { ...o, freeze: freezeOf(B1, TARGET, INFERENCE.question.sources, B1) };
    for (const purpose of ['check', 'gate-proved'] as const) {
      const found = otherResult(judge(edit(STATEMENTS, MAIN, PENDING, HONEST_PROOF), { ...frozenEarly, purpose, stage: 'prove' }));
      expect(found.map((f) => f.names?.[0]), purpose).toEqual(['Spyro.DarkChar']);
      expect(found[0]?.message, purpose).toContain(CLAUDE_SESSION_TEXTS.otherResultStatement('Spyro.DarkChar', TARGET));
    }
  });

  it('a card’s statement may use another card’s statement the same unfrozen step wrote: both are the cards’ visible content, never proof material', () => {
    const OWN = '/-- Cynder is a character who has a dark past -/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\naxiom cynder_dark_past.holds : cynder_dark_past\n';
    // S₀: cynder-dark-past code-less too (no pin, no statement).
    const start = edit(edit(B1, MAIN, OWN, ''), MAIN, 'asserted: 2026-11-01\nlean: Spyro.cynder_dark_past\n-/\n', 'asserted: 2026-11-01\n-/\n');
    const both = edit(pinned(normative(B1)), MAIN, 'abbrev pg_no_dark_past : Prop := ∀', 'abbrev pg_no_dark_past : Prop := cynder_dark_past → ∀');
    const scope: StepScope = { ...SCOPE, fuzzyStatements: ['pg-no-dark-past', 'cynder-dark-past'] };
    const j = judge(both, { base: start, stepStart: start, scope, purpose: 'gate-other' });
    expect(modelOf(both).declFacts.get('Spyro.pg_no_dark_past')?.valueConsts).toContain('Spyro.cynder_dark_past');
    expect(otherResult(j)).toEqual([]);
  });
});
