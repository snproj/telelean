/**
 * Slice 2, sub-slice 2b1a (docs/slice2-plan.md 1.1, 2.7, 6.1): the rules of `evaluateRules` taken out of the single
 * `evaluate` into per-rule helpers on one `RuleContext`, behaviour unchanged. These tests pin what the helpers are
 * (`evaluateRules` is their composition in report order, in every purpose; the helpers that only some purposes run
 * apply to those alone; the context's derived values) and close five gaps the refactor's mutation checks found in the
 * gate suites: behaviour the single function already had that no test held.
 */
import { describe, expect, it } from 'vitest';
import type { DeclFacts, LeanFacts } from '../../src/facts.js';
import { evaluateRules, frozenSnapshot, planGhostAdoption, type GateFinding, type RuleInput, type RulePurpose, type Selection } from '../../src/gate/index.js';
import {
  adoptedGhostFindings,
  buildFindings,
  exampleFindings,
  existingChangedFindings,
  flagged,
  footprintFindings,
  formalisedThisRunOf,
  malformedBindingFindings,
  markupFindings,
  newAxiomFindings,
  notFrozenFindings,
  notProvedFindings,
  orderFindings,
  proofBeforeFreezeFindings,
  readinessFindings,
  readyCards,
  ruleContext,
  sorryAxiomFindings,
  statementChangedFindings,
  statusMismatchFindings,
  undeclaredPremiseFindings,
  vocabularyShapeFindings,
} from '../../src/gate/rules.js';
import { parseLeanFile } from '../../src/markup/api.js';
import { buildProjectModel, type ProjectModel } from '../../src/project/index.js';
import { LineMap } from '../../src/project/text.js';
import { fakeFacts, freshHashes } from '../project/helpers/fakeFacts.js';
import { BASE, codes, edit, findingsOf, literal, MAIN, model, normative, pinned, proved, rules, SEL, SEL_NO_PG, TARGET_LINE, VOCAB, type Texts } from './helpers/spyroRun.js';

const B = model(BASE);
const N = model(normative());
const F = frozenSnapshot(N, SEL, 1);
const PURPOSES: ReadonlyArray<[RulePurpose, RuleInput['stage']]> = [
  ['check', 'formalise'],
  ['check', 'prove'],
  ['freeze', 'formalise'],
  ['gate-proved', 'prove'],
  ['gate-other', 'formalise'],
  ['gate-other', 'prove'],
];
const addBeforeEnd = (texts: Texts, code: string) => edit(texts, MAIN, 'end Spyro', `${code}\n\nend Spyro`);
const show = (findings: readonly GateFinding[]) => JSON.stringify(findings.map((f) => f.message), null, 1);
const input = (purpose: RulePurpose, stage: RuleInput['stage'], current: ProjectModel, extra: Partial<RuleInput> = {}): RuleInput => ({
  purpose,
  stage,
  selection: SEL,
  base: B,
  current,
  teleleanBlocks: [],
  ...extra,
});

/** `evaluate`'s composition, rebuilt from the exported helpers in the order the single function ran its rules. */
function composed(i: RuleInput) {
  const ctx = ruleContext(i);
  const built = buildFindings(ctx);
  const footprint = footprintFindings(ctx, built.length > 0);
  const ready = readyCards(ctx);
  const findings = orderFindings([
    ...built,
    ...newAxiomFindings(ctx),
    ...existingChangedFindings(ctx),
    ...adoptedGhostFindings(ctx),
    ...notProvedFindings(ctx),
    ...statusMismatchFindings(ctx),
    ...statementChangedFindings(ctx),
    ...footprint.findings,
    ...undeclaredPremiseFindings(ctx),
    ...sorryAxiomFindings(ctx),
    ...vocabularyShapeFindings(ctx),
    ...markupFindings(i, ctx.chosen, ctx.sentence),
    ...readinessFindings(ctx, ready),
    ...malformedBindingFindings(ctx, ready),
    ...proofBeforeFreezeFindings(ctx),
    ...exampleFindings(ctx),
    ...notFrozenFindings(ctx),
  ]);
  return { findings, flaggedDefinitions: flagged(i, ctx.chosen, ctx.inBase), footprints: footprint.footprints, formalisedThisRun: formalisedThisRunOf(ctx), declarations: { added: [...ctx.added], changed: [...ctx.changed], removed: [...ctx.removed] } };
}

const finding = (code: GateFinding['code'], message: string): GateFinding => ({ step: code === 'build' ? 'G1' : code === 'markup' ? 'G5' : 'G3', code, message });

describe('orderFindings: the report’s order (2b1a)', () => {
  it('empty, one, and many: grouped by code in the report’s order, each code’s findings in the order found; a code outside the lists is left out', () => {
    expect(orderFindings([])).toEqual([]);
    const one = finding('footprint', 'a');
    expect(orderFindings([one])).toEqual([one]);
    const many = [
      finding('not-frozen', '1'),
      finding('markup', '2'),
      finding('footprint', '3'),
      finding('new-axiom', '4'),
      finding('missing-holds', '5'),
      finding('footprint', '6'),
      finding('not-formalised', '7'),
      finding('build', '8'),
      finding('hash-command', '9'),
      finding('vocabulary-shape', '10'),
      finding('existing-changed', '11'),
      finding('proof-before-freeze', '12'),
      finding('undeclared-premise', '13'),
      finding('status-mismatch', '14'),
      finding('sorry-axiom', '15'),
      finding('statement-changed', '16'),
      finding('not-proved', '17'),
    ];
    expect(orderFindings(many).map((f) => f.message)).toEqual(['8', '4', '11', '17', '14', '16', '3', '6', '13', '15', '10', '2', '7', '5', '12', '1']);
  });
});

describe('the helpers and evaluateRules (2b1a)', () => {
  /** States of the walkthrough and its cheats, each with the extra input it is judged with. */
  const STATES: Array<[string, ProjectModel, Partial<RuleInput>]> = [
    ['B', B, {}],
    ['normative', N, {}],
    ['normative, frozen', N, { freeze: F }],
    ['proved', model(pinned(proved())), { freeze: F }],
    ['proved, not selected', model(pinned(proved())), { freeze: F, selection: SEL_NO_PG }],
    ['literal', model(pinned(literal())), {}],
    ['an axiom shortcut', model(edit(normative(), MAIN, TARGET_LINE, `${TARGET_LINE}axiom cynder_not_good.holds : cynder_not_good\n`)), { freeze: F }],
    ['an example and a changed word', model(edit(addBeforeEnd(normative(), 'example : True := trivial'), MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past')), {}],
    ['a Lean error', model(normative(), { facts: { messages: [{ severity: 'error', file: MAIN, text: 'boom' }] } }), {}],
    ['no facts', model(normative(), { facts: false }), {}],
  ];

  it('evaluateRules is the helpers’ composition, in the order of the report, for every purpose', () => {
    let nonEmpty = 0;
    for (const [label, current, extra] of STATES) {
      for (const [purpose, stage] of PURPOSES) {
        const i = input(purpose, stage, current, extra);
        const report = evaluateRules(i);
        expect(JSON.stringify(composed(i)), `${label}, ${purpose} ${stage}`).toBe(JSON.stringify(report));
        if (report.findings.length > 0) nonEmpty++;
      }
    }
    expect(nonEmpty).toBeGreaterThan(20);
  });

  it('the helpers that only some purposes run apply to those alone: not proved, not frozen, the readiness cards, status mismatch, proof before the freeze (and statement changed finds nothing without a freeze)', () => {
    const proof = model(pinned(proved()));
    for (const [purpose, stage] of PURPOSES) {
      const ctx = ruleContext(input(purpose, stage, model(BASE), {}));
      // Without a proof of the target, a finish with status proved is not-proved and not-frozen; nothing else is.
      expect(notProvedFindings(ctx).length > 0, purpose).toBe(purpose === 'gate-proved');
      expect(notFrozenFindings(ctx).length > 0, purpose).toBe(purpose === 'gate-proved');
      expect(readyCards(ctx), purpose).toEqual(purpose === 'freeze' || purpose === 'gate-proved' ? ['cynder-not-good', 'cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'] : []);
      // A proof the run added: a finish that is not proved must not leave it (gate-other only).
      expect(statusMismatchFindings(ruleContext(input(purpose, stage, proof, {}))).length > 0, purpose).toBe(purpose === 'gate-other');
      // Before the freeze, check (formalise) and freeze refuse it as written too early; with a freeze, nothing does.
      expect(proofBeforeFreezeFindings(ruleContext(input(purpose, stage, proof, {}))).length > 0, `${purpose} ${stage}`).toBe(purpose === 'freeze' || (purpose === 'check' && stage === 'formalise'));
      expect(proofBeforeFreezeFindings(ruleContext(input(purpose, stage, proof, { freeze: F })))).toEqual([]);
      expect(statementChangedFindings(ctx)).toEqual([]);
    }
  });

  it('the context: the declaration diff, the chosen cards (an adopted ghost named twice counts once), and whether the run added a proof of the target', () => {
    const ctx = ruleContext(input('check', 'prove', model(pinned(proved())), { selection: { ...SEL, adoptedGhosts: ['g', 'g'] } }));
    expect(ctx.added).toEqual(['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds', 'Spyro.cynder_not_good.holds']);
    expect([ctx.changed, ctx.removed]).toEqual([[], []]);
    expect([...ctx.chosen]).toEqual(['cynder-not-good', 'cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'g']);
    expect(ctx.ghosts).toEqual(['g']);
    expect([ctx.targetStatement, ctx.targetHolds, [...ctx.exempt]]).toEqual(['Spyro.cynder_not_good', 'Spyro.cynder_not_good.holds', ['Spyro.cynder_not_good.holds']]);
    expect([ctx.targetProofNew, ctx.undoTargetProof]).toEqual([true, 'remove the proof of the target']);
    // B's own proof, unchanged: no proof is new, and a not-proved finish restores the one B had.
    const own = model(pinned(proved()));
    const unchanged = ruleContext(input('gate-other', 'prove', own, { base: own }));
    expect([unchanged.targetProofNew, unchanged.undoTargetProof]).toEqual([false, 'restore Spyro.cynder_not_good.holds exactly as it was before the run']);
    expect([unchanged.added, unchanged.changed, unchanged.removed]).toEqual([[], [], []]);
    // The run's new statements: none in B, one after the normative formalisation.
    expect(formalisedThisRunOf(ruleContext(input('check', 'formalise', B)))).toEqual([]);
    expect(formalisedThisRunOf(ruleContext(input('check', 'formalise', N)))).toEqual(['pg-no-dark-past']);
  });
});

describe('behaviour the single function had that no test held (found by 2b1a’s mutation checks)', () => {
  it('a declaration of the run without facts fails closed when its file is stale and the build found nothing; with a build error it is G1’s', () => {
    const texts = addBeforeEnd(normative(), 'theorem helper_t : True := trivial');
    const stale = (messages: LeanFacts['build']['messages'] = []) => {
      const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
      const facts = fakeFacts(files, { valueConsts: true, overrides: { 'Spyro.helper_t': { drop: true } }, messages });
      return buildProjectModel({ files, fileHashes: { ...freshHashes(files), [MAIN]: 'sha-older' }, facts, library: 'Model' });
    };
    const quiet = stale();
    expect(quiet.freshFiles.has(MAIN)).toBe(false);
    const clean = evaluateRules(input('gate-other', 'formalise', quiet));
    expect(codes(clean)).not.toContain('build');
    expect(findingsOf(clean, 'footprint').filter((f) => f.token === 'no-facts').map((f) => f.names), show(clean.findings)).toEqual([['Spyro.helper_t']]);
    const broken = evaluateRules(input('gate-other', 'formalise', stale([{ severity: 'error', file: VOCAB, text: 'boom' }])));
    expect(codes(broken)).toContain('build');
    expect(findingsOf(broken, 'footprint').filter((f) => f.token === 'no-facts'), show(broken.findings)).toEqual([]);
  });

  it('a selected axiom bound in this run to something that is not a Prop statement is one not-formalised finding in every purpose, never two', () => {
    const texts = edit(BASE, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/\n\n', 'stance: rule\nasserted: 2026-11-01\n-/\ndef pg_no_dark_past : Nat := 0\n\n');
    const S = model(texts, { facts: { overrides: { 'Spyro.pg_no_dark_past': { typeSort: 'Type', type: 'Nat' } } } });
    expect(S.nodes.get('pg-no-dark-past')?.node.lean.statement).toBe('Spyro.pg_no_dark_past');
    for (const [purpose, stage] of PURPOSES) {
      const report = evaluateRules(input(purpose, stage, S));
      expect(findingsOf(report, 'not-formalised').filter((f) => f.nodeId === 'pg-no-dark-past').map((f) => [f.token, f.names]), `${purpose} ${stage}: ${show(report.findings)}`).toEqual([['malformed', ['Spyro.pg_no_dark_past']]]);
    }
  });

  it('the report is in its order, not the order the rules ran: an example left after the freeze (footprint) before a changed word (markup)', () => {
    const texts = edit(addBeforeEnd(normative(), 'example : True := trivial'), MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past');
    const report = rules('gate-other', 'prove', B, model(texts), { freeze: F });
    expect(report.findings.map((f) => [f.code, f.token]), show(report.findings)).toEqual([
      ['footprint', 'example'],
      ['markup', 'natural_name'],
    ]);
  });

  it('an adopted ghost is one of the chosen cards: its statement is new in the run, so normalisation pins it', () => {
    const literalTexts = pinned(literal());
    const plan = planGhostAdoption(model(literalTexts), {
      subject: 'Spyro',
      target: 'cynder-not-good',
      naturalName: 'A character who cannot be in a game would not be a good addition to it',
      leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g',
      leanName: 'not_in_game_not_good',
      session: 'r1',
      today: '2026-11-02',
      holdAs: 'axiom',
    });
    const A = model({ ...literalTexts, [MAIN]: plan.changes[0]?.after as string });
    const selection: Selection = { ...SEL, adoptedGhosts: [plan.nodeId] };
    const report = evaluateRules(input('check', 'formalise', A, { selection, adopted: A, teleleanBlocks: [plan.nodeId] }));
    expect(report.findings, show(report.findings)).toEqual([]);
    expect(report.formalisedThisRun).toEqual(['pg-no-dark-past', plan.nodeId]);
  });

  it('a name only Lean reports inside the user’s own unchanged declaration is judged neither by the footprint nor as a carrier, also when its file changed', () => {
    const STRUCTURE = 'structure UserS where\n  h : new_spyro_pg := new_spyro_pg.holds';
    const field = (texts: Texts) => (facts: LeanFacts) => {
      const text = texts[MAIN] as string;
      const at = text.indexOf('h : new_spyro_pg :=');
      const range = new LineMap(text).rangeOf(at, at + 'h : new_spyro_pg :='.length);
      const decl: DeclFacts = {
        name: 'Spyro.UserS.h',
        module: 'Model.Spyro.Main',
        file: MAIN,
        range,
        selectionRange: range,
        refs: [],
        kind: 'theorem',
        type: 'Spyro.UserS → Spyro.new_spyro_pg',
        typeSort: 'Prop',
        axioms: ['Classical.choice', 'Spyro.Game', 'Spyro.IsPG', 'Spyro.Game.exists', 'Spyro.new_spyro_pg.holds'],
        usesSorry: false,
        parent: 'Spyro.UserS',
      };
      facts.decls.push(decl);
    };
    const overrides = { 'Spyro.UserS': { typeSort: 'Type', axioms: ['Classical.choice', 'Spyro.Game', 'Spyro.IsPG', 'Spyro.Game.exists'] } };
    const userOwn = addBeforeEnd(BASE, STRUCTURE);
    const now = normative(userOwn);
    const base = model(userOwn, { facts: { overrides }, mutate: field(userOwn) });
    const current = model(now, { facts: { overrides }, mutate: field(now) });
    expect(current.declFacts.get('Spyro.UserS.h')?.axioms).toContain('Spyro.new_spyro_pg.holds');
    for (const [purpose, stage] of [['check', 'formalise'], ['gate-other', 'formalise']] as const) {
      const report = evaluateRules({ purpose, stage, selection: SEL_NO_PG, base, current, teleleanBlocks: [] });
      expect(report.findings, `${purpose}: ${show(report.findings)}`).toEqual([]);
    }
    // Written in the run, the same structure is judged (the footprint), and before the freeze it is a carrier.
    const fresh = normative(addBeforeEnd(BASE, STRUCTURE));
    const written = model(fresh, { facts: { overrides }, mutate: field(fresh) });
    expect(codes(evaluateRules({ purpose: 'gate-other', stage: 'formalise', selection: SEL_NO_PG, base: B, current: written, teleleanBlocks: [] }))).toContain('footprint');
    expect(evaluateRules({ purpose: 'check', stage: 'formalise', selection: SEL_NO_PG, base: B, current: written, teleleanBlocks: [] }).findings.map((f) => [f.code, f.token])).toContainEqual(['proof-before-freeze', 'carrier']);
  });
});
