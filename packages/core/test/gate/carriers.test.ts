/**
 * Fixer round 2 (M2 final verification: "P12 by another route"). A declaration whose type is not a Prop can still
 * carry a proof: a `def` of type `PLift p`, an `Inhabited (PLift p)` instance, a structure whose Prop field defaults
 * to `p.holds`, a `where` declaration. `footprint` now judges every declaration added or changed in the run whatever
 * its kind or type (and the names only Lean reports inside one), and `proof-before-freeze` refuses such a carrier
 * before the freeze (token `carrier`), while vocabulary, definitions, presupposition instances and the fields Lean
 * generates for a structure stay fine.
 *
 * The facts are shaped like Lean 4.35's (checked with the pinned toolchain on these very declarations): the def and
 * the instance list the `.holds` in `#print axioms`; the structure does not (the default lives in `HelperS.h._default`,
 * which neither `#print axioms Spyro.HelperS` nor the `.ilean` index lists) but the index attributes the usage of
 * `new_spyro_pg.holds` to `Spyro.HelperS` (its `refs`); the field `Spyro.HelperS.h` is an auxiliary theorem (parent
 * `Spyro.HelperS`) resting on the structure's axioms only; a `where` declaration `Spyro.helper_w.bar` is a name of its
 * own (parent `Spyro.helper_w`), which the declaration it sits in does not use.
 */
import { describe, expect, it } from 'vitest';
import type { DeclFacts, LeanFacts } from '../../src/facts.js';
import { holdsName } from '../../src/facts.js';
import { attemptNotice, describeFinding, evaluateRules, frozenSnapshot, type DescribeContext, type GateFinding, type RuleReport, type Selection } from '../../src/gate/index.js';
import { subjectGraph } from '../../src/project/index.js';
import { LineMap } from '../../src/project/text.js';
import { BASE, edit, MAIN, model, normative, pinned, proved, SEL, SEL_NO_PG, type Texts } from './helpers/spyroRun.js';
import type { DeclOverride } from '../project/helpers/fakeFacts.js';

const PLIFT = 'def helper_plift : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩';
const INHABITED = 'instance helper_inh : Inhabited (PLift new_spyro_pg) := ⟨⟨new_spyro_pg.holds⟩⟩';
const STRUCTURE = 'structure HelperS where\n  h : new_spyro_pg := new_spyro_pg.holds';
const WHERE = 'def helper_w : Nat := 0\n  where bar : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩';
/** What Lean's `#print axioms` lists for something mentioning `new_spyro_pg` (through `newSpyro`'s presupposition). */
const PG_STATEMENT_AXIOMS = ['Classical.choice', 'Spyro.Game', 'Spyro.IsPG', 'Spyro.Game.exists'];

const addBeforeEnd = (texts: Texts, code: string) => edit(texts, MAIN, 'end Spyro', `${code}\n\nend Spyro`);

/** Facts entries Lean reports that the header parser does not list, placed at `needle` (the name) in MAIN. */
function auxiliary(texts: Texts, name: string, needle: string, rest: Partial<DeclFacts>): (facts: LeanFacts) => void {
  return (facts) => {
    const text = texts[MAIN] as string;
    const at = text.indexOf(needle);
    if (at < 0) throw new Error(`no ${needle}`);
    const range = new LineMap(text).rangeOf(at, at + needle.length);
    facts.decls.push({ name, module: 'Model.Spyro.Main', file: MAIN, range, selectionRange: range, refs: [], ...rest });
  };
}

/** The four carriers after the target's statement, with Lean's facts for them. */
function carriers(texts: Texts, extraOverrides: Record<string, DeclOverride> = {}) {
  const withThem = addBeforeEnd(texts, [PLIFT, INHABITED, STRUCTURE, WHERE].join('\n'));
  const field = auxiliary(withThem, 'Spyro.HelperS.h', 'h : new_spyro_pg :=', {
    kind: 'theorem',
    type: 'Spyro.HelperS → Spyro.new_spyro_pg',
    typeSort: 'Prop',
    axioms: PG_STATEMENT_AXIOMS,
    usesSorry: false,
    parent: 'Spyro.HelperS',
  });
  const nested = auxiliary(withThem, 'Spyro.helper_w.bar', 'bar :', {
    kind: 'def',
    type: 'PLift Spyro.new_spyro_pg',
    typeSort: 'Type',
    axioms: [...PG_STATEMENT_AXIOMS, 'Spyro.new_spyro_pg.holds'],
    usesSorry: false,
    parent: 'Spyro.helper_w',
  });
  return model(withThem, {
    facts: {
      overrides: {
        'Spyro.helper_plift': { typeSort: 'Type', type: 'PLift Spyro.new_spyro_pg' },
        'Spyro.helper_inh': { typeSort: 'Type', type: 'Inhabited (PLift Spyro.new_spyro_pg)' },
        'Spyro.HelperS': { typeSort: 'Type', type: 'Prop', axioms: PG_STATEMENT_AXIOMS },
        'Spyro.helper_w': { typeSort: 'Type', type: 'Nat', axioms: [], refs: [] },
        ...extraOverrides,
      },
    },
    mutate: (facts) => {
      field(facts);
      nested(facts);
    },
  });
}

const B = model(BASE);
const run = (purpose: 'check' | 'freeze' | 'gate-proved' | 'gate-other', stage: 'formalise' | 'prove', current: ReturnType<typeof model>, selection: Selection, extra = {}): RuleReport =>
  evaluateRules({ purpose, stage, selection, base: B, current, teleleanBlocks: [], ...extra });

/** The declaration a finding is about: the name after `file:line:col: ` in its message. */
const subjectOf = (f: GateFinding) => /^[^:]+:\d+:\d+: (\S+)/.exec(f.message)?.[1];
const footprintFindings = (r: RuleReport) => r.findings.filter((f) => f.code === 'footprint');
const show = (r: RuleReport) => JSON.stringify(r.findings.map((f) => f.message), null, 1);

function contextOf(selected: readonly string[]): DescribeContext {
  const graph = subjectGraph(B, 'Spyro', { version: 1, semantic: { state: 'fresh' } });
  const owner = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.lean.statement === undefined) continue;
    owner.set(node.lean.statement, node.id);
    owner.set(holdsName(node.lean.statement), node.id);
  }
  return { sentenceOf: (id) => graph.nodes.find((n) => n.id === id)?.naturalName, nodeOfDecl: (name) => owner.get(name), selected };
}

describe('fixer round 2: proofs carried by declarations that are not theorems', () => {
  it('a not-proved round (gate-other, no freeze): the PLift def, the Inhabited instance, the structure default and the `where` declaration are each a footprint finding', () => {
    const S = carriers(normative());
    const report = run('gate-other', 'formalise', S, SEL_NO_PG);
    const found = footprintFindings(report);
    expect(found.map(subjectOf), show(report)).toEqual(['Spyro.helper_plift', 'Spyro.helper_inh', 'Spyro.HelperS', 'Spyro.helper_w.bar']);
    for (const f of found) expect(f.names).toEqual(['Spyro.new_spyro_pg.holds']);
    expect(found[0]?.message).toContain('Spyro.helper_plift is not a theorem but carries a proof resting on Spyro.new_spyro_pg.holds ("The new Spyro game is PG", not selected), outside the permitted set');
    // Located at the declaration (the `where` declaration at its own name), so the board and Claude can find it.
    expect(found.map((f) => f.file)).toEqual([MAIN, MAIN, MAIN, MAIN]);
    const text = S.files.get(MAIN)?.text ?? '';
    expect(found[3]?.range?.start).toEqual(new LineMap(text).positionAt(text.indexOf('bar :')));
    // Nothing else: the structure's generated field and the declaration the `where` sits in rest on vocabulary only.
    expect(report.findings.filter((f) => f.code !== 'footprint'), show(report)).toEqual([]);
    const ctx = contextOf(SEL_NO_PG.premises);
    expect(describeFinding(found[0] as GateFinding, ctx)).toBe('it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn\'t select');
    expect(attemptNotice(report.findings, 1, 3, ctx)).toBe("Attempt 1 didn't pass: it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn't select. Asking Claude to retry.");
  });

  it('the same round after a freeze, and with the target proved: still each carrier, in gate-other and gate-proved', () => {
    const frozen = frozenSnapshot(model(normative()), SEL_NO_PG, 1, B);
    const other = run('gate-other', 'prove', carriers(pinned(normative())), SEL_NO_PG, { freeze: frozen });
    expect(footprintFindings(other).map(subjectOf), show(other)).toEqual(['Spyro.helper_plift', 'Spyro.helper_inh', 'Spyro.HelperS', 'Spyro.helper_w.bar']);
    // All three premises selected: the carriers rest on a selected premise, so the proved round passes.
    const all = frozenSnapshot(model(normative()), SEL, 1, B);
    const passed = run('gate-proved', 'prove', carriers(pinned(proved())), SEL, { freeze: all });
    expect(passed.findings, show(passed)).toEqual([]);
  });

  it('a proved round: a PLift def resting on an assumption of the user that is not selected, next to the honest proof', () => {
    const withFun = edit(
      BASE,
      MAIN,
      '/-\n@@ telelean v1\nid: cynder-not-good',
      '/-\n@@ telelean v1\nid: spyro-fun\ntype: ASSUMPTION\nnatural_name: Spyro games are fun\nasserted: 2026-11-01\nlean: Spyro.spyro_fun\n-/\n/-- Spyro games are fun -/\nabbrev spyro_fun : Prop := True\naxiom spyro_fun.holds : spyro_fun\n\n/-\n@@ telelean v1\nid: cynder-not-good',
    );
    const base = model(withFun);
    const frozen = frozenSnapshot(model(normative(withFun)), SEL, 1, base);
    expect(frozen.permitted.all).not.toContain('Spyro.spyro_fun.holds');
    const texts = addBeforeEnd(pinned(proved(normative(withFun))), 'def helper_fun : PLift spyro_fun := ⟨spyro_fun.holds⟩\nstructure HelperF where\n  h : spyro_fun := spyro_fun.holds');
    const current = model(texts, { facts: { overrides: { 'Spyro.helper_fun': { typeSort: 'Type' }, 'Spyro.HelperF': { typeSort: 'Type', axioms: [] } } } });
    const report = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SEL, base, current, teleleanBlocks: [], freeze: frozen });
    expect(report.findings.map((f) => [f.code, subjectOf(f), f.names]), show(report)).toEqual([
      ['footprint', 'Spyro.helper_fun', ['Spyro.spyro_fun.holds']],
      ['footprint', 'Spyro.HelperF', ['Spyro.spyro_fun.holds']],
    ]);
    // The target's own proof is fine and its footprint is reported as before; carriers are not listed as proofs.
    expect(Object.keys(report.footprints)).toEqual(['Spyro.cynder_not_good.holds']);
  });

  it('before the freeze each carrier is a proof written before freeze_statements (token `carrier`), also one resting on a selected premise', () => {
    const S = carriers(normative());
    const report = run('check', 'formalise', S, SEL_NO_PG);
    const early = report.findings.filter((f) => f.code === 'proof-before-freeze');
    expect(early.map((f) => [f.token, f.names?.[0]]), show(report)).toEqual([
      ['carrier', 'Spyro.helper_plift'],
      ['carrier', 'Spyro.helper_inh'],
      ['carrier', 'Spyro.HelperS'],
      ['carrier', 'Spyro.helper_w.bar'],
    ]);
    expect(early[0]?.message).toContain('Spyro.helper_plift carries a proof written before freeze_statements (it rests on Spyro.new_spyro_pg.holds)');
    expect(describeFinding(early[0] as GateFinding, contextOf(SEL_NO_PG.premises))).toBe('it put a proof inside `helper_plift` before freezing the statements');
    expect(run('freeze', 'formalise', S, SEL_NO_PG).findings.filter((f) => f.token === 'carrier')).toHaveLength(4);
    // D-19 is about any proof: a definition holding the selected premise's proof is one too, until the freeze.
    const witness = model(addBeforeEnd(normative(), 'def witness : PLift pg_no_dark_past := ⟨pg_no_dark_past.holds⟩'), { facts: { overrides: { 'Spyro.witness': { typeSort: 'Type' } } } });
    expect(run('check', 'formalise', witness, SEL).findings.map((f) => [f.code, f.token, f.names?.[0]])).toEqual([['proof-before-freeze', 'carrier', 'Spyro.witness']]);
    expect(run('gate-proved', 'prove', model(pinned(proved(addBeforeEnd(normative(), 'def witness : PLift pg_no_dark_past := ⟨pg_no_dark_past.holds⟩'))), { facts: { overrides: { 'Spyro.witness': { typeSort: 'Type' } } } }), SEL, { freeze: frozenSnapshot(model(normative()), SEL, 1, B) }).findings).toEqual([]);
  });

  it('vocabulary, definitions, presupposition instances and the fields Lean generates are no carriers and pass the footprint, also unselected', () => {
    const legit = addBeforeEnd(
      edit(
        normative(),
        'Model/Spyro/Vocabulary.lean',
        '/-- Cynder -/',
        '/-- consoles -/\naxiom Console : Type\n/-- there is a console -/\naxiom Console.exists : Nonempty Console\ninstance : Nonempty Console := Console.exists\n/-- a console -/\nnoncomputable opaque console1 : Console\n/-- Cynder -/',
      ),
      'def InGame (c : Character) (g : Game) : Prop := GoodAddition c g\nstructure GoodPair where\n  c : Character\n  ok : HasDarkPast c',
    );
    const S = model(legit, {
      facts: { overrides: { 'Spyro.instNonemptyConsole': { typeSort: 'Prop' }, 'Spyro.GoodPair': { typeSort: 'Type 1' } } },
      mutate: auxiliary(legit, 'Spyro.GoodPair.ok', 'ok : HasDarkPast c', {
        kind: 'theorem',
        type: '∀ (self : Spyro.GoodPair), Spyro.HasDarkPast self.c',
        typeSort: 'Prop',
        axioms: ['Spyro.Character', 'Spyro.HasDarkPast'],
        usesSorry: false,
        parent: 'Spyro.GoodPair',
      }),
    });
    for (const [purpose, stage] of [['check', 'formalise'], ['freeze', 'formalise']] as const) {
      const r = run(purpose, stage, S, SEL_NO_PG);
      expect(r.findings.filter((f) => f.code === 'proof-before-freeze' || f.code === 'footprint'), show(r)).toEqual([]);
    }
    // No selected statement mentions a console: `console1` and the instance rest on `Console.exists`, a presupposition.
    const gate = run('gate-other', 'formalise', S, SEL_NO_PG);
    expect(gate.findings.filter((f) => f.code === 'footprint'), show(gate)).toEqual([]);
  });

  it('the presupposition-instance pattern is no hiding place for a claim', () => {
    const texts = edit(
      normative(),
      'Model/Spyro/Vocabulary.lean',
      '/-- Cynder -/',
      '/-- consoles -/\naxiom Console : Type\n/-- there is a console -/\naxiom Console.exists : Nonempty Console\n/-- Cynder -/',
    );
    const smuggled = addBeforeEnd(texts, 'instance : Nonempty Console := (fun _ => Console.exists) new_spyro_pg.holds');
    const S = model(smuggled, { facts: { overrides: { 'Spyro.instNonemptyConsole': { typeSort: 'Prop' } } } });
    expect(run('check', 'formalise', S, SEL_NO_PG).findings.map((f) => [f.code, f.token, f.names?.[0]])).toEqual([['proof-before-freeze', 'carrier', 'Spyro.instNonemptyConsole']]);
    expect(footprintFindings(run('gate-other', 'formalise', S, SEL_NO_PG)).map((f) => f.names)).toEqual([['Spyro.new_spyro_pg.holds']]);
  });

  it('a private structure, definition or instance Lean reports nothing about fails closed in every purpose', () => {
    const texts = addBeforeEnd(normative(), 'private structure HelperP where\n  h : new_spyro_pg := new_spyro_pg.holds\nprivate def helper_pd : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩');
    const S = model(texts, { facts: { overrides: { 'Spyro.HelperP': { drop: true }, 'Spyro.helper_pd': { drop: true } } } });
    for (const [purpose, stage] of [['check', 'formalise'], ['gate-other', 'formalise'], ['gate-proved', 'prove']] as const) {
      const r = run(purpose, stage, S, SEL_NO_PG);
      expect(r.findings.filter((f) => f.token === 'no-facts').map((f) => f.names?.[0]), `${purpose}: ${show(r)}`).toEqual(['Spyro.HelperP', 'Spyro.helper_pd']);
    }
  });

  it('a name only Lean reports outside every declaration the parser lists is judged only when it is new (also against a round start without facts)', () => {
    const LINE = '-- generated: helper_gen';
    const facts = (texts: Texts) =>
      auxiliary(texts, 'Spyro.helper_gen', LINE, { kind: 'def', type: 'PLift Spyro.new_spyro_pg', typeSort: 'Type', axioms: [...PG_STATEMENT_AXIOMS, 'Spyro.new_spyro_pg.holds'], usesSorry: false });
    const harmless = (texts: Texts) => addBeforeEnd(texts, 'abbrev harmless : Prop := True');
    // The user's own: in B (with facts) and in the round start (text only, as the engine builds it).
    const own = addBeforeEnd(BASE, LINE);
    const base = model(own, { mutate: facts(own) });
    const roundStart = model(normative(own), { facts: false });
    const ownNow = harmless(normative(own));
    const current = model(ownNow, { mutate: facts(ownNow) });
    const check = evaluateRules({ purpose: 'check', stage: 'formalise', selection: SEL_NO_PG, base, current, roundStart, teleleanBlocks: [] });
    expect(check.findings, show(check)).toEqual([]);
    const gate = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_NO_PG, base, current, roundStart, teleleanBlocks: [] });
    expect(gate.findings, show(gate)).toEqual([]);
    // Written in this round: new against the round start's text and against B's facts.
    const fresh = harmless(addBeforeEnd(normative(), LINE));
    const now = model(fresh, { mutate: facts(fresh) });
    const early = evaluateRules({ purpose: 'check', stage: 'formalise', selection: SEL_NO_PG, base: B, current: now, roundStart: model(normative(), { facts: false }), teleleanBlocks: [] });
    expect(early.findings.map((f) => [f.code, f.token, f.names?.[0]]), show(early)).toEqual([['proof-before-freeze', 'carrier', 'Spyro.helper_gen']]);
    const late = run('gate-other', 'formalise', now, SEL_NO_PG);
    expect(footprintFindings(late).map((f) => [subjectOf(f), f.names]), show(late)).toEqual([['Spyro.helper_gen', ['Spyro.new_spyro_pg.holds']]]);
  });

  it('the user\'s own unchanged structure, whose default rests on an assumption that is not selected, is not judged', () => {
    const userOwn = addBeforeEnd(BASE, 'structure UserS where\n  h : new_spyro_pg := new_spyro_pg.holds');
    const overrides = { 'Spyro.UserS': { typeSort: 'Type', axioms: PG_STATEMENT_AXIOMS } };
    const base = model(userOwn, { facts: { overrides } });
    const current = model(normative(userOwn), { facts: { overrides } });
    const report = evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_NO_PG, base, current, teleleanBlocks: [] });
    expect(report.findings, show(report)).toEqual([]);
  });
});
