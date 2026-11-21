/**
 * Slice 2b3b (docs/slice2-plan.md 2.9, 3.3, 3.8, 3.10): the engine's pure helpers for an edit session, and the ghost
 * file's session-only parts (the statement's explicit form and its own probe). No Lean.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildProjectModel,
  parseLeanFile,
  type BackstopRefusal,
  type GateFinding,
  type InferenceJudgement,
  type LeanFacts,
  type PermittedAxioms,
  type PremiseDraft,
  type ProjectModel,
  type StateJudgement,
} from '@telelean/core';

import {
  completionScope,
  explicitBody,
  finalCheckFailures,
  finalRuleOf,
  ghostScratchSource,
  readGhostScratch,
  relianceKey,
  sameNames,
  sessionContextKey,
  sessionPermitted,
  sessionProofTargets,
  statementFactsOf,
  withG0,
} from '../../src/gate/index.js';
import type { LeanMessage } from '../../src/lean/footprint.js';
import { valueProbeLines } from '../../src/semantic/checkFile.js';
import { spyroModelFiles } from './helpers.js';

const STD = ['Classical.choice', 'Quot.sound', 'propext'];

function categories(over: Partial<PermittedAxioms> = {}): PermittedAxioms {
  const base = {
    standard: [...STD],
    signature: ['Spyro.Character', 'Spyro.Game'],
    selected: ['Spyro.a.holds'],
    presuppositions: ['Spyro.Character.exists'],
    derivationFootprints: [],
    unusable: [],
    ...over,
  };
  return { ...base, all: [...new Set([...base.standard, ...base.signature, ...base.selected, ...base.presuppositions, ...base.derivationFootprints])].sort() };
}

const b1 = (permitted: string[], contrib: InferenceJudgement['contrib'] = {}): Pick<InferenceJudgement, 'permitted' | 'contrib'> => ({ permitted, contrib });

describe('sessionPermitted: B.1 as the freeze\'s permitted set (D2-19)', () => {
  it('takes B.1\'s set as `all` and sorts it into slice 1\'s categories; a session proof\'s footprint is a derivation footprint', () => {
    const permitted = sessionPermitted(categories(), b1([...STD, 'Spyro.Character', 'Spyro.Game', 'Spyro.Character.exists', 'Spyro.a.holds', 'Spyro.b.holds'], {
      a: { kind: 'claim' },
      b: { kind: 'session-proof' },
      c: { kind: 'nothing', reason: 'no-holds' },
    }));
    expect(permitted.all).toEqual([...STD, 'Spyro.Character', 'Spyro.Character.exists', 'Spyro.Game', 'Spyro.a.holds', 'Spyro.b.holds'].sort());
    expect(permitted.standard).toEqual(['propext', 'Classical.choice', 'Quot.sound']);
    expect(permitted.selected).toEqual(['Spyro.a.holds']);
    expect(permitted.derivationFootprints).toEqual(['Spyro.b.holds']);
    expect(permitted.unusable).toEqual(['c']);
  });

  it('drops from the categories what B.1 does not grant (a source whose arrow is gone), and is empty-safe', () => {
    const permitted = sessionPermitted(categories(), b1([...STD]));
    expect(permitted).toEqual({ standard: ['propext', 'Classical.choice', 'Quot.sound'], signature: [], selected: [], presuppositions: [], derivationFootprints: [], unusable: [], all: [...STD].sort() });
    const none = sessionPermitted(categories({ standard: [], signature: [], selected: [], presuppositions: [] }), b1([]));
    expect(none.all).toEqual([]);
    expect(none.derivationFootprints).toEqual([]);
  });
});

describe('sameNames', () => {
  it('compares as sets: order and repeats do not count; a missing or an extra name does; empty equals empty', () => {
    expect(sameNames(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
    expect(sameNames([], [])).toBe(true);
    expect(sameNames(['a'], ['a', 'b'])).toBe(false);
    expect(sameNames(['a', 'b'], ['a'])).toBe(false);
    expect(sameNames(['a'], ['b'])).toBe(false);
  });
});

describe('explicitBody: the value of a statement\'s #print (F11)', () => {
  it('cuts the header `… : Prop :=` (Lean 4.35\'s form, measured) and collapses whitespace, so the name never counts', () => {
    const scratch = '@[reducible] def Spyro.telelean_ghost_stmt : Prop :=\n∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.GoodAddition c g) → Not (Spyro.HasDarkPast c)';
    const written = '@[reducible] def Spyro.not_good_if_dark : Prop :=\n∀ (c : Spyro.Character)  (g : Spyro.Game),\n  Not (Spyro.GoodAddition c g) → Not (Spyro.HasDarkPast c)';
    expect(explicitBody(scratch)).toBe('∀ (c : Spyro.Character) (g : Spyro.Game), Not (Spyro.GoodAddition c g) → Not (Spyro.HasDarkPast c)');
    expect(explicitBody(written)).toBe(explicitBody(scratch));
    // A value that holds `:=` itself: only the header's is cut.
    expect(explicitBody('@[reducible] def X.y : Prop :=\nlet a := True; a')).toBe('let a := True; a');
    // No header (an error text, a value already cut): returned collapsed.
    expect(explicitBody('  Not   (A)  ')).toBe('Not (A)');
    expect(explicitBody('')).toBe('');
  });
});

const finding = (code: GateFinding['code'], message: string, extra: Partial<GateFinding> = {}): GateFinding => ({ step: 'G3', code, message, ...extra });

function judgementWith(over: Partial<StateJudgement> = {}): StateJudgement {
  return {
    commit: 'c1',
    filesKey: 'k1',
    purpose: 'final',
    ok: true,
    global: [],
    stepFindings: [],
    inferences: {},
    drafts: [],
    classes: {},
    classesBeforeReveal: {},
    deps: {},
    reach: {},
    problems: [],
    ...over,
  };
}

function inferenceWith(target: string, findings: GateFinding[] = [], over: Partial<InferenceJudgement> = {}): InferenceJudgement {
  return {
    target,
    passes: findings.length === 0,
    verdict: 'proved',
    flags: [],
    footprint: [],
    direct: [],
    extra: [],
    contrib: {},
    permitted: [],
    throughResults: [],
    restsOn: [],
    band: { used: [], notNeeded: [], complete: false, open: [] },
    missing: [],
    findings,
    ...over,
  };
}

describe('withG0 (AP30-1 r2): G0\'s findings first in global, ok false', () => {
  it('keeps the judgement\'s own findings after G0\'s, in global and stepFindings; with none of its own too', () => {
    const g0 = [finding('metaprogramming', 'Model/Spyro/Main.lean:9:0: `init` …', { step: 'G0' })];
    const own = finding('sorry', 'sorry');
    const merged = withG0(judgementWith({ global: [own], stepFindings: [own] }), g0);
    expect(merged.ok).toBe(false);
    expect(merged.global).toEqual([...g0, own]);
    expect(merged.stepFindings).toEqual([...g0, own]);
    expect(withG0(judgementWith(), g0)).toMatchObject({ ok: false, global: g0, stepFindings: g0 });
  });
});

describe('finalCheckFailures (§3.10): every failure by rule, the backstop\'s too', () => {
  const items = [{ key: 'proof:t', id: 'itAAAA' }, { key: 'decl:Spyro.D', id: 'itBBBB' }] as unknown as Parameters<typeof finalCheckFailures>[1];

  it('maps each finding to its rule, item keys to ids, and keeps one of each identical failure', () => {
    const judgement = judgementWith({
      ok: false,
      problems: [
        { code: 'facts', text: 'telelean could not see what the final statements rely on', keys: ['decl:Spyro.D', 'decl:Spyro.unknown'] },
        { code: 'unowned', text: '`open Classical` in Model/Spyro/Main.lean changed, but no review item covers it.' },
        { code: 'no-longer-builds', text: 'Lean error', keys: ['decl:Spyro.D'] },
      ],
      global: [finding('metaprogramming', 'G0 says no', { step: 'G0' }), finding('build', 'error: x', { step: 'G1' }), finding('arrow', 'a cycle'), finding('holds-kind', 'became an axiom', { names: ['Spyro.t.holds'] })],
      inferences: { t: inferenceWith('t', [finding('footprint', 'outside the permitted set', { names: ['Spyro.t.holds'] }), finding('undeclared-premise', 'uses a card')]) },
    });
    const backstop: BackstopRefusal[] = [
      { code: 'not-accepted', text: 'Spyro.D belongs to “D”, which is not accepted.', item: 'itBBBB', name: 'Spyro.D' },
      { code: 'facts', text: 'telelean could not see what the final statements rely on' },
    ];
    expect(finalCheckFailures(judgement, items, backstop)).toEqual([
      { rule: 'facts', text: 'telelean could not see what the final statements rely on', items: ['itBBBB'] },
      { rule: 'items', text: '`open Classical` in Model/Spyro/Main.lean changed, but no review item covers it.' },
      { rule: 'rules', text: 'G0 says no' },
      { rule: 'build', text: 'error: x' },
      { rule: 'arrows', text: 'a cycle' },
      { rule: 'kinds', text: 'became an axiom', declaration: 'Spyro.t.holds' },
      { rule: 'permitted', text: 'outside the permitted set', items: ['itAAAA'], declaration: 'Spyro.t.holds' },
      { rule: 'no-hidden-edges', text: 'uses a card', items: ['itAAAA'] },
      { rule: 'backstop', text: 'Spyro.D belongs to “D”, which is not accepted.', items: ['itBBBB'], declaration: 'Spyro.D' },
      { rule: 'backstop', text: 'telelean could not see what the final statements rely on' },
    ]);
  });

  it('nothing to report: no failure; one failure: one entry', () => {
    expect(finalCheckFailures(judgementWith(), items)).toEqual([]);
    expect(finalCheckFailures(judgementWith({ global: [finding('sorry', 'no sorry')] }), [])).toEqual([{ rule: 'rules', text: 'no sorry' }]);
  });

  it('finalRuleOf: G0 is rules; G1 build and budget; footprint, B.2, B.3, B.4, the comparator; anything else rules', () => {
    expect(finalRuleOf(finding('sorry', '', { step: 'G0' }))).toBe('rules');
    expect(finalRuleOf(finding('build', '', { step: 'G1' }))).toBe('build');
    expect(finalRuleOf(finding('budget', '', { step: 'G1' }))).toBe('build');
    expect(finalRuleOf(finding('footprint', ''))).toBe('permitted');
    expect(finalRuleOf(finding('undeclared-premise', ''))).toBe('no-hidden-edges');
    expect(finalRuleOf(finding('arrow', ''))).toBe('arrows');
    expect(finalRuleOf(finding('holds-kind', ''))).toBe('kinds');
    expect(finalRuleOf(finding('comparator-definition-mismatch', '', { step: 'G4' }))).toBe('comparator');
    expect(finalRuleOf(finding('new-axiom', ''))).toBe('rules');
  });
});

describe('completionScope and statementFactsOf (§3.8)', () => {
  it('the completion opens only the target\'s proof, with the question on record', () => {
    expect(completionScope('telelean-completion', { target: 't', question: { sources: ['a', 'b'], fromNothing: false } })).toEqual({
      step: 'telelean-completion',
      target: 't',
      question: { sources: ['a', 'b'], fromNothing: false },
      fuzzyStatements: [],
      openProof: true,
      openArrows: false,
      openItems: [],
    });
  });

  it('a draft\'s scratch facts: its statement abbrev (a def of type Prop, the probe\'s constants) and its `.holds` (an axiom of that type)', () => {
    const facts = statementFactsOf({ namespace: 'Spyro', leanName: 'p', statement: ' ∀ c,\n ¬ InGame c g ', valueConsts: ['Spyro.InGame', 'Spyro.Character'], typeConsts: [] });
    expect(Object.keys(facts)).toEqual(['Spyro.p', 'Spyro.p.holds']);
    expect(facts['Spyro.p']).toMatchObject({ name: 'Spyro.p', kind: 'def', type: 'Prop', typeSort: 'Type', value: '∀ c, ¬ InGame c g', valueConsts: ['Spyro.InGame', 'Spyro.Character'], typeConsts: [], refs: [] });
    expect(facts['Spyro.p.holds']).toMatchObject({ name: 'Spyro.p.holds', kind: 'axiom', type: 'Spyro.p', typeSort: 'Prop', valueConsts: [], typeConsts: ['Spyro.p'] });
  });
});

// ------------------------------------------------------------------------------------------- relianceKey, proofs of F

const MAIN = 'Model/Spyro/Main.lean';

/** The Spyro fixture with `main` as Main.lean, and facts naming `decls` (name -> the facts that matter here). */
function modelOf(main: string | undefined, decls: Record<string, { kind?: 'axiom' | 'theorem' | 'def'; type?: string; value?: string; valueConsts?: string[]; typeConsts?: string[]; axioms?: string[] }> = {}): ProjectModel {
  const files = spyroModelFiles();
  if (main !== undefined) files.set(MAIN, main);
  const lean = [...files.keys()].filter((p) => p.endsWith('.lean')).sort();
  const hash = (p: string) => createHash('sha256').update(files.get(p) ?? '', 'utf8').digest('hex');
  const fileHashes = Object.fromEntries(lean.map((p) => [p, hash(p)]));
  const facts: LeanFacts = {
    format: 'telelean-lean-facts',
    version: 1,
    toolchain: 'leanprover/lean4:v4.35.0',
    library: 'Model',
    startedAt: '',
    finishedAt: '',
    status: 'ok',
    build: { status: 'ok', durationMs: 0, messages: [], failedModules: [] },
    check: { status: 'ok', durationMs: 0, probed: 0 },
    // Every file fresh (its hash the one the model is built with), so the facts are usable.
    modules: lean.map((p) => ({ name: p.slice(0, -'.lean'.length).split('/').join('.'), file: p, sourceSha256: hash(p), state: 'fresh' as const, imports: [] })),
    decls: Object.entries(decls).map(([name, d]) => ({
      name,
      module: 'Model.Spyro.Main',
      file: MAIN,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      refs: [],
      ...d,
    })),
  };
  return buildProjectModel({ files: lean.map((p) => parseLeanFile(p, files.get(p) ?? '')), fileHashes, library: 'Model', facts });
}

const draft = (over: Partial<PremiseDraft> = {}): PremiseDraft => ({
  target: 'cynder-not-good',
  step: 's1',
  naturalName: 'A dark past rules a character out',
  leanName: 'dark_out',
  leanStatement: '∀ (c : Character) (g : Game), HasDarkPast c → ¬ GoodAddition c g',
  explicit: '∀ (c : Spyro.Character) (g : Spyro.Game), Spyro.HasDarkPast c → Not (Spyro.GoodAddition c g)',
  whyNeeded: 'the gap',
  proof: 'fun h => h cynder newSpyro cynder_dark_past.holds',
  footprint: ['Spyro.cynder_dark_past.holds', 'Spyro.HasDarkPast'],
  aloneEntails: false,
  facts: statementFactsOf({ namespace: 'Spyro', leanName: 'dark_out', statement: '…', valueConsts: ['Spyro.HasDarkPast', 'Spyro.GoodAddition'], typeConsts: [] }),
  ...over,
});

describe('relianceKey (§3.8: re-check when its footprint, its statement\'s closure or T\'s statement changed)', () => {
  const decls = {
    'Spyro.cynder_dark_past.holds': { kind: 'axiom' as const, type: 'Spyro.cynder_dark_past', typeConsts: ['Spyro.cynder_dark_past'], valueConsts: [], axioms: ['Spyro.cynder_dark_past.holds'] },
    'Spyro.HasDarkPast': { kind: 'axiom' as const, type: 'Spyro.Character → Prop', typeConsts: ['Spyro.Character'], valueConsts: [] },
    'Spyro.GoodAddition': { kind: 'axiom' as const, type: 'Spyro.Character → Spyro.Game → Prop', typeConsts: ['Spyro.Character', 'Spyro.Game'], valueConsts: [] },
    'Spyro.cynder_not_good': { kind: 'def' as const, type: 'Prop', value: '¬Spyro.GoodAddition Spyro.cynder Spyro.newSpyro', typeConsts: [], valueConsts: ['Spyro.GoodAddition'] },
  };
  const permit = b1([...STD, 'Spyro.cynder_dark_past.holds'], { 'cynder-dark-past': { kind: 'claim' } });
  const key = (d: PremiseDraft, model: ProjectModel, statement: string | undefined = 'Spyro.cynder_not_good', b = permit) => relianceKey(d, model, statement, b);

  it('is the same for the same state, and changes with the footprint\'s facts, the closure\'s, the target\'s statement, B.1, or the draft', () => {
    const model = modelOf(undefined, decls);
    const k = key(draft(), model);
    expect(key(draft(), modelOf(undefined, decls))).toBe(k);
    // A footprint name's meaning (here the claim's type).
    expect(key(draft(), modelOf(undefined, { ...decls, 'Spyro.cynder_dark_past.holds': { ...decls['Spyro.cynder_dark_past.holds'], type: 'Spyro.cynder_dark_past ∨ True' } }))).not.toBe(k);
    // A name the statement reaches (its facts): GoodAddition's constants.
    expect(key(draft(), modelOf(undefined, { ...decls, 'Spyro.GoodAddition': { ...decls['Spyro.GoodAddition'], typeConsts: ['Spyro.Character'] } }))).not.toBe(k);
    // T's statement: its value, or no statement at all.
    expect(key(draft(), modelOf(undefined, { ...decls, 'Spyro.cynder_not_good': { ...decls['Spyro.cynder_not_good'], value: 'True' } }))).not.toBe(k);
    expect(relianceKey(draft(), model, undefined, permit)).not.toBe(k);
    // B.1: a source that leaves the question, or one more granted name.
    expect(key(draft(), model, 'Spyro.cynder_not_good', b1([...STD]))).not.toBe(k);
    // The draft itself, reworded.
    expect(key(draft({ leanStatement: '∀ (c : Character), HasDarkPast c → ¬ GoodAddition c newSpyro' }), model)).not.toBe(k);
    // A name it does not rely on: no change.
    expect(key(draft(), modelOf(undefined, { ...decls, 'Spyro.IsPG': { kind: 'axiom', type: 'Spyro.Game → Prop', typeConsts: ['Spyro.Game'] } }))).toBe(k);
  });

  it('with an empty footprint and no facts it is still a stable key', () => {
    const lone = draft({ footprint: [], facts: {} });
    expect(key(lone, modelOf(undefined))).toBe(key(lone, modelOf(undefined)));
  });

  // Fixer 2b3b r1 (A-V2B3B-ADV-1): what the gap check relies on beyond the names it starts from.
  const statementOf = (value: string) => ({ kind: 'def' as const, type: 'Prop', value, typeConsts: [], valueConsts: ['Spyro.HasDarkPast', 'Spyro.cynder'] });
  const withSource = { ...decls, 'Spyro.cynder_dark_past': statementOf('Spyro.HasDarkPast Spyro.cynder') };

  it('changes when a source\'s statement behind a footprint `.holds` is reworded under the same constants (the `.holds` keeps its facts)', () => {
    const k = key(draft(), modelOf(undefined, withSource));
    expect(key(draft(), modelOf(undefined, { ...withSource, 'Spyro.cynder_dark_past': statementOf('¬Spyro.HasDarkPast Spyro.cynder') }))).not.toBe(k);
    // The `.holds` itself is unchanged: its type is the statement's name, its constants the same.
    expect(withSource['Spyro.cynder_dark_past.holds']).toEqual(decls['Spyro.cynder_dark_past.holds']);
  });

  it('changes when a lemma the gap proof used (its constants at the last check) is taken out, or changes its statement or its axioms; not when none is given', () => {
    const lemma = { kind: 'theorem' as const, type: '¬Spyro.GoodAddition Spyro.cynder Spyro.newSpyro → Spyro.cynder_not_good', typeConsts: ['Spyro.GoodAddition', 'Spyro.cynder_not_good'], valueConsts: [], axioms: ['Spyro.GoodAddition'] };
    const used = ['Spyro.helper_l', 'Spyro.cynder_not_good'];
    const lone = draft({ footprint: [] });
    const withLemma = modelOf(undefined, { ...decls, 'Spyro.helper_l': lemma });
    const k = relianceKey(lone, withLemma, 'Spyro.cynder_not_good', permit, used);
    expect(relianceKey(lone, modelOf(undefined, { ...decls, 'Spyro.helper_l': lemma }), 'Spyro.cynder_not_good', permit, used)).toBe(k);
    expect(relianceKey(lone, modelOf(undefined, decls), 'Spyro.cynder_not_good', permit, used)).not.toBe(k);
    expect(relianceKey(lone, modelOf(undefined, { ...decls, 'Spyro.helper_l': { ...lemma, type: 'Spyro.cynder_not_good' } }), 'Spyro.cynder_not_good', permit, used)).not.toBe(k);
    expect(relianceKey(lone, modelOf(undefined, { ...decls, 'Spyro.helper_l': { ...lemma, axioms: ['Spyro.GoodAddition', 'Spyro.cynder_dark_past.holds'] } }), 'Spyro.cynder_not_good', permit, used)).not.toBe(k);
    // What the lemma's own proof uses (the `uses` closure walks into it, as B.2's walk does).
    const helper2 = { kind: 'theorem' as const, type: 'True', typeConsts: [], valueConsts: [] };
    const viaHelper = { ...decls, 'Spyro.helper_l': { ...lemma, valueConsts: ['Spyro.helper2'] }, 'Spyro.helper2': helper2 };
    const k2 = relianceKey(lone, modelOf(undefined, viaHelper), 'Spyro.cynder_not_good', permit, used);
    expect(relianceKey(lone, modelOf(undefined, { ...viaHelper, 'Spyro.helper2': { ...helper2, valueConsts: ['Spyro.cynder_dark_past.holds'] } }), 'Spyro.cynder_not_good', permit, used)).not.toBe(k2);
    // Without the proof's constants (no check yet) the lemma is not seen: the key the engine compares always carries them.
    expect(relianceKey(lone, withLemma, 'Spyro.cynder_not_good', permit)).toBe(relianceKey(lone, modelOf(undefined, decls), 'Spyro.cynder_not_good', permit));
  });

  it('changes when a definition only the target\'s statement reaches changes; not for one nothing reaches', () => {
    const bad = { kind: 'def' as const, type: 'Spyro.Character → Prop', value: 'fun c => Spyro.HasDarkPast c', typeConsts: ['Spyro.Character'], valueConsts: ['Spyro.HasDarkPast'] };
    const reaching = { ...decls, 'Spyro.cynder_not_good': { ...decls['Spyro.cynder_not_good'], valueConsts: ['Spyro.GoodAddition', 'Spyro.Bad'] }, 'Spyro.Bad': bad };
    const lone = draft({ footprint: [], facts: {} });
    const k = key(lone, modelOf(undefined, reaching));
    expect(key(lone, modelOf(undefined, { ...reaching, 'Spyro.Bad': { ...bad, value: 'fun c => ¬Spyro.HasDarkPast c' } }))).not.toBe(k);
    expect(key(lone, modelOf(undefined, { ...reaching, 'Spyro.Unused': { ...bad, value: 'fun c => True' } }))).toBe(k);
  });
});

describe('sessionContextKey (fixer 2b3b r1, F-FC-3): the session\'s records a judgement was made under', () => {
  const records = {
    inferences: [{ target: 'cynder-not-good', question: { sources: ['a'], fromNothing: false }, order: 0, steps: ['s1'] }],
    ledger: [],
    items: [],
    premises: [],
    ended: [],
    rejectedArrows: [],
    scope: { step: 's1', target: 'cynder-not-good', question: { sources: ['a'], fromNothing: false }, fuzzyStatements: [], openProof: true, openArrows: true, openItems: [] },
    stepStartCommit: 'abc',
  };
  it('is the same for the same records (a copy too), and changes with any of them: a ledger arrow, the step, S₀, the drafts, the ends', () => {
    const k = sessionContextKey(records);
    expect(sessionContextKey(structuredClone(records))).toBe(k);
    expect(sessionContextKey({ ...records, ledger: [{ kind: 'arrow', source: 'new-spyro-pg', target: 'cynder-not-good', step: 's1', why: 'x' }] })).not.toBe(k);
    expect(sessionContextKey({ ...records, scope: { ...records.scope, step: 's2' } })).not.toBe(k);
    expect(sessionContextKey({ ...records, stepStartCommit: 'def' })).not.toBe(k);
    expect(sessionContextKey({ ...records, ended: ['cynder-not-good'] })).not.toBe(k);
    expect(sessionContextKey({ ...records, rejectedArrows: [{ source: 'a', target: 'cynder-not-good' }] })).not.toBe(k);
    expect(sessionContextKey({ ...records, noAlternative: true })).not.toBe(k);
    // Empty records, no step: still a key.
    const empty = { inferences: [], ledger: [], items: [], premises: [], ended: [], rejectedArrows: [] };
    expect(sessionContextKey(empty)).toBe(sessionContextKey({ ...empty }));
    expect(sessionContextKey(empty)).not.toBe(k);
  });
});

describe('sessionProofTargets (§3.10: the final comparator\'s proofs)', () => {
  const statement = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro';
  const proved = (proof: string) => spyroModelFiles().get(MAIN)?.replace(statement, `${statement}\ntheorem cynder_not_good.holds : cynder_not_good := ${proof}`);
  const judged = (verdict: InferenceJudgement['verdict']) => judgementWith({ inferences: { 'cynder-not-good': inferenceWith('cynder-not-good', [], { verdict }) } });
  const holds = (value: string) => ({ 'Spyro.cynder_not_good.holds': { kind: 'theorem' as const, type: 'Spyro.cynder_not_good', valueConsts: [value], typeConsts: [] } });

  it('a proof B has not (new, or another text) is one; B\'s own proof is not, unless its meaning changed; a target not proved never', () => {
    const base = modelOf(undefined);
    expect(sessionProofTargets(base, modelOf(proved('sorry')), judged('proved'))).toEqual(['cynder-not-good']);
    expect(sessionProofTargets(base, modelOf(proved('sorry')), judged('not-proved'))).toEqual([]);
    const own = modelOf(proved('x'), holds('Spyro.x'));
    expect(sessionProofTargets(modelOf(proved('x'), holds('Spyro.x')), own, judged('proved'))).toEqual([]);
    expect(sessionProofTargets(modelOf(proved('y'), holds('Spyro.x')), own, judged('established'))).toEqual(['cynder-not-good']);
    expect(sessionProofTargets(modelOf(proved('x'), holds('Spyro.y')), own, judged('proved'))).toEqual(['cynder-not-good']);
    expect(sessionProofTargets(base, base, judgementWith())).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------- the ghost file in a session

describe('the ghost file in a session (§3.8): the statement\'s explicit form and its own probe', () => {
  const names = ['Spyro.cynder_dark_past.holds', 'Spyro.Character', 'Spyro.telelean_ghost_stmt'];
  const input = {
    library: 'Model',
    namespace: 'Spyro',
    targetStatement: 'Spyro.cynder_not_good',
    statement: '¬ GoodAddition cynder newSpyro',
    proof: 'fun h => h',
    probe: { names },
  };
  const session = ghostScratchSource({ ...input, statementFacts: true });
  const plain = ghostScratchSource(input);
  const msg = (line: number, severity: string, data: string): LeanMessage => ({ severity, data, line, column: 0 });
  const axioms = "'Spyro.telelean_ghost_check' depends on axioms: [Spyro.cynder_dark_past.holds]";
  const checkLine = '{"telelean-value-consts":[["Spyro.cynder_dark_past.holds"],[],[]],"telelean-type-consts":[["Spyro.cynder_not_good"],[],[]]}';

  it('prints the pinned statement under the explicit options right after `#print axioms`, then the two probes; without the option, slice 1\'s file', () => {
    const lines = session.source.split('\n');
    expect(lines[session.printLine - 1]).toBe('#print axioms Spyro.telelean_ghost_check');
    expect(session.explicitLine).toBe(session.printLine + 1);
    expect(lines[(session.explicitLine ?? 0) - 1]).toBe(
      'set_option pp.explicit true in set_option pp.notation false in set_option pp.universes true in set_option pp.coercions false in #print Spyro.telelean_ghost_stmt',
    );
    expect(session.statementName).toBe('Spyro.telelean_ghost_stmt');
    // The check theorem's probe never lists the statement (it is followed through, as before); the second lists it first.
    expect(session.valueProbe?.probed).toEqual(['Spyro.telelean_ghost_check', 'Spyro.cynder_dark_past.holds', 'Spyro.Character']);
    expect(session.statementProbe?.probed).toEqual(['Spyro.telelean_ghost_stmt', 'Spyro.cynder_dark_past.holds', 'Spyro.Character']);
    expect(session.valueProbe?.firstLine).toBe((session.explicitLine ?? 0) + 1);
    expect(session.statementProbe?.firstLine).toBe((session.valueProbe?.lastLine ?? 0) + 1);
    expect(lines.slice((session.statementProbe?.firstLine ?? 0) - 1, -1)).toEqual(valueProbeLines(session.statementProbe?.probed ?? [], 'Model', { followMain: true }));
    // Slice 1's file is unchanged by the option's existence.
    expect(plain.explicitLine).toBeUndefined();
    expect(plain.statementProbe).toBeUndefined();
    expect(plain.source).toBe(ghostScratchSource({ ...input, probe: { names: names.filter((n) => n !== 'Spyro.telelean_ghost_stmt') } }).source);
    // Without the probe, only the explicit form.
    const noProbe = ghostScratchSource({ ...input, probe: undefined, statementFacts: true } as Parameters<typeof ghostScratchSource>[0]);
    expect(noProbe.explicitLine).toBe(noProbe.printLine + 1);
    expect(noProbe.statementProbe).toBeUndefined();
  });

  it('reads the explicit form and the statement\'s constants; an error in its probe voids only them, an error at the explicit line fails the check', () => {
    const first = session.statementProbe?.firstLine ?? 0;
    const own = '{"telelean-value-consts":[["Spyro.GoodAddition","Spyro.cynder"],[],[]],"telelean-type-consts":[[],[],[]]}';
    const printed = '@[reducible] def Spyro.telelean_ghost_stmt : Prop :=\nNot (Spyro.GoodAddition Spyro.cynder Spyro.newSpyro)';
    const ok = readGhostScratch(session, [
      msg(session.printLine, 'information', axioms),
      msg(session.explicitLine ?? 0, 'information', printed),
      msg(session.valueProbe?.firstLine ?? 0, 'information', checkLine),
      msg(first, 'information', own),
    ]);
    expect(ok).toEqual({
      errors: [],
      axioms: ['Spyro.cynder_dark_past.holds'],
      valueConsts: ['Spyro.cynder_dark_past.holds'],
      typeConsts: ['Spyro.cynder_not_good'],
      valueProblems: [],
      explicit: printed,
      statementValueConsts: ['Spyro.GoodAddition', 'Spyro.cynder'],
      statementTypeConsts: [],
      statementProblems: [],
    });
    // Its probe failed: the check stands, the statement's constants are gone.
    const failed = readGhostScratch(session, [msg(session.printLine, 'information', axioms), msg(session.valueProbe?.firstLine ?? 0, 'information', checkLine), msg(first + 2, 'error', 'unknown constant')]);
    expect(failed.errors).toEqual([]);
    expect(failed.valueConsts).toEqual(['Spyro.cynder_dark_past.holds']);
    expect(failed.statementValueConsts).toBeUndefined();
    expect(failed.statementProblems).toEqual([`the statement's probe failed: ${first + 2}:0: unknown constant`]);
    // Nothing printed for it, or a line without the type key (this probe always prints both): no constants.
    expect(readGhostScratch(session, [msg(session.printLine, 'information', axioms)]).statementProblems).toEqual(["Lean printed nothing for the statement's probe"]);
    expect(readGhostScratch(session, [msg(first, 'information', '{"telelean-value-consts":[["A"],[],[]]}')]).statementProblems).toEqual(["the statement's probe found no Spyro.telelean_ghost_stmt"]);
    // An error printing the statement is an error of the file (the suggestion is not checked).
    expect(readGhostScratch(session, [msg(session.explicitLine ?? 0, 'error', 'unknown constant')]).errors).toEqual([
      `Lean error in telelean's check file, line ${session.explicitLine ?? 0}: unknown constant`,
    ]);
    // Slice 1's reading has none of these fields.
    expect(readGhostScratch(plain, [msg(plain.printLine, 'information', axioms)])).not.toHaveProperty('statementProblems');
  });

  it('says where the errors are (fixer 2b3b r1, A-V2B3B-ADV-2): the suggestion\'s own lines, or only telelean\'s, or the header, which every later line fails with', () => {
    for (const scratch of [session, plain]) {
      const [header, proofEnd] = [scratch.statementLine - 1, scratch.proofLines[1]];
      const at = (...lines: number[]) => readGhostScratch(scratch, lines.map((line) => msg(line, 'error', 'oops'))).errorsAt;
      // None: no field.
      expect(readGhostScratch(scratch, [msg(scratch.printLine, 'information', axioms)])).not.toHaveProperty('errorsAt');
      // The pinned statement, the check theorem's header, its proof's last line: the suggestion's.
      expect(at(scratch.statementLine)).toBe('suggestion');
      expect(at(scratch.proofLines[0])).toBe('suggestion');
      expect(at(proofEnd, scratch.printLine)).toBe('suggestion');
      // Only telelean's own lines after the proof (the `#print`s): telelean's.
      expect(at(scratch.printLine)).toBe('telelean');
      if (scratch.explicitLine !== undefined) expect(at(scratch.explicitLine)).toBe('telelean');
      // The header (an import), alone or with errors in the suggestion's lines after it: telelean's; a message with no
      // position too.
      expect(at(1)).toBe('telelean');
      expect(at(header, scratch.statementLine, proofEnd)).toBe('telelean');
      expect(at(0)).toBe('telelean');
      // An error in a probe's lines is the probe's (its problems), never one of these.
      expect(readGhostScratch(scratch, [msg((scratch.valueProbe?.firstLine ?? 0) + 2, 'error', 'oops')])).not.toHaveProperty('errorsAt');
    }
  });
});
