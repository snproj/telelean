/**
 * AT1.8 (docs/m2-plan.md section 3.5, amendment A2): describeFinding and attemptNotice give the plan's sentences, for
 * findings produced by the real rules, G0 and (comparator) the runner's mapping.
 */
import { describe, expect, it } from 'vitest';
import { holdsName } from '../../src/facts.js';
import { attemptNotice, describeFinding, frozenSnapshot, scanForbidden, type DescribeContext, type GateFinding } from '../../src/gate/index.js';
import type { TlGraph } from '../../src/model.js';
import { subjectGraph } from '../../src/project/index.js';
import { BASE, edit, HONEST_PROOF, MAIN, model, normative, pinned, proved, rules, SEL, SEL_NO_PG, TARGET_LINE } from './helpers/spyroRun.js';

/** The DescribeContext the RunManager builds from the current board (the user's real files). */
function contextOf(graph: TlGraph, selected: readonly string[]): DescribeContext {
  const owner = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.lean.statement === undefined) continue;
    owner.set(node.lean.statement, node.id);
    owner.set(holdsName(node.lean.statement), node.id);
  }
  return { sentenceOf: (id) => graph.nodes.find((n) => n.id === id)?.naturalName, nodeOfDecl: (name) => owner.get(name), selected };
}

const B = model(BASE);
const N = model(normative());
const board = subjectGraph(B, 'Spyro', { version: 1, semantic: { state: 'fresh' } });
const CTX = contextOf(board, SEL.premises);
const CTX_NO_PG = contextOf(board, SEL_NO_PG.premises);
const first = (findings: readonly GateFinding[]) => findings[0] as GateFinding;

describe('AT1.8 the A2 sentences of plan 3.5', () => {
  it('an unselected premise', () => {
    const report = rules('gate-proved', 'prove', B, model(pinned(proved())), { freeze: frozenSnapshot(N, SEL_NO_PG, 1), selection: SEL_NO_PG });
    expect(describeFinding(first(report.findings), CTX_NO_PG)).toBe('it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn\'t select');
    expect(attemptNotice(report.findings, 1, 3, CTX_NO_PG)).toBe("Attempt 1 didn't pass: it used “The new Spyro game is PG” (`new_spyro_pg.holds`), which you didn't select. Asking Claude to retry.");
  });

  it('a gap (sorry), found by G0', () => {
    const text = (proved()[MAIN] as string).replace(HONEST_PROOF, 'theorem cynder_not_good.holds : cynder_not_good := sorry\n');
    const findings = scanForbidden(MAIN, text, { library: 'Model', subject: 'Spyro', projectModules: new Set() }, BASE[MAIN]);
    expect(attemptNotice(findings, 2, 3, CTX)).toBe("Attempt 2 didn't pass: it left a gap (`sorry`) in `cynder_not_good.holds`. Asking Claude to retry.");
  });

  it('a changed statement: the comparator\'s definition mismatch (M0 lesson 2 wording) and the weakened abbrev', () => {
    const comparator: GateFinding = { step: 'G4', code: 'comparator-definition-mismatch', message: 'lake comparator: definition mismatch for Spyro.cynder_not_good', names: ['Spyro.cynder_not_good'] };
    expect(attemptNotice([comparator], 2, 3, CTX)).toBe(
      "Attempt 2 didn't pass: it changed the statement it had to prove (a definition the frozen statement depends on changed: `cynder_not_good`). Asking Claude to retry.",
    );
    const weak = model(pinned(edit(proved(), MAIN, TARGET_LINE, 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro ∨ True\n')));
    const report = rules('gate-proved', 'prove', B, weak, { freeze: frozenSnapshot(N, SEL, 1) });
    expect(report.findings.map((f) => f.code)).toEqual(['existing-changed', 'statement-changed']);
    expect(attemptNotice(report.findings, 2, 3, CTX)).toBe(
      "Attempt 2 didn't pass: it changed the statement it had to prove (a definition the frozen statement depends on changed: `cynder_not_good`). Asking Claude to retry.",
    );
  });

  it('a forbidden command, with its file and line', () => {
    const text = `${'-- line\n'.repeat(11)}#eval 1\n`;
    const findings = scanForbidden(MAIN, text, { library: 'Model', subject: 'Spyro', projectModules: new Set() });
    expect(attemptNotice(findings, 1, 3, CTX)).toBe("Attempt 1 didn't pass: it used a forbidden command (`#eval`) in Model/Spyro/Main.lean line 12. Asking Claude to retry.");
  });

  it('an added axiom (its footprint consequence is not counted as another problem)', () => {
    const cheat = model(edit(pinned(normative()), MAIN, 'end Spyro', 'axiom shortcut : cynder_not_good\ntheorem cynder_not_good.holds : cynder_not_good := shortcut\n\nend Spyro'));
    const report = rules('gate-proved', 'prove', B, cheat, { freeze: frozenSnapshot(N, SEL, 1) });
    expect(report.findings.map((f) => f.code)).toEqual(['new-axiom', 'footprint']);
    expect(attemptNotice(report.findings, 1, 3, CTX)).toBe("Attempt 1 didn't pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry.");
  });

  it('the user\'s words changed', () => {
    const words = model(edit(normative(), MAIN, 'natural_name: Cynder is a character who has a dark past', 'natural_name: Cynder had a dark past'));
    const report = rules('check', 'formalise', B, words);
    expect(attemptNotice(report.findings, 1, 3, CTX)).toBe("Attempt 1 didn't pass: it changed your words on “Cynder is a character who has a dark past”. Asking Claude to retry.");
  });

  it('the give-up sentence names what kept failing and the state telelean reverted to', () => {
    const report = rules('gate-proved', 'prove', B, model(pinned(proved())), { freeze: frozenSnapshot(N, SEL_NO_PG, 1), selection: SEL_NO_PG });
    expect(attemptNotice(report.findings, 3, 3, CTX_NO_PG, 'Statements frozen (round 1)')).toBe(
      "Claude's attempts didn't pass the checks 3 times: each time it used `new_spyro_pg.holds`, which you didn't select. telelean reverted its working copy to “Statements frozen (round 1)”.",
    );
    expect(attemptNotice(report.findings, 3, 3, CTX_NO_PG, '“Statements frozen (round 1)”')).toContain('to “Statements frozen (round 1)”.');
    expect(attemptNotice(report.findings, 1, 1, CTX_NO_PG)).toBe(
      "Claude's attempt didn't pass the checks: each time it used `new_spyro_pg.holds`, which you didn't select. telelean reverted its working copy to the last state that passed.",
    );
  });

  it('the reviewer\'s additions: status mismatch, a re-pointed pin, an existing declaration changed', () => {
    const left = rules('gate-other', 'prove', B, model(pinned(proved())));
    expect(describeFinding(first(left.findings), CTX)).toBe('it said the goal was not proved but left a proof of it in the files');
    const repinned = model(edit(edit(normative(), MAIN, 'lean: Spyro.cynder_not_good\n', 'lean: Spyro.cynder_not_good_weak\n'), MAIN, 'end Spyro', 'abbrev cynder_not_good_weak : Prop := True\n\nend Spyro'));
    expect(describeFinding(first(rules('freeze', 'formalise', B, repinned).findings), CTX)).toBe('it re-pointed “Cynder would not be a good addition to the new Spyro game” to a different Lean statement');
    const redefined = model(edit(proved(), 'Model/Spyro/Vocabulary.lean', 'axiom GoodAddition : Character → Game → Prop', 'def GoodAddition (c : Character) (_g : Game) : Prop := ¬ HasDarkPast c'));
    const report = rules('gate-proved', 'prove', B, redefined, { freeze: frozenSnapshot(N, SEL, 1) });
    expect(attemptNotice(report.findings, 1, 3, CTX)).toBe("Attempt 1 didn't pass: it changed an existing declaration (`GoodAddition`). Asking Claude to retry.");
  });

  it('an example (fixer round 3): before the freeze, and left in the files after it', () => {
    const code = 'example : cynder_not_good := pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds';
    const early = rules('gate-other', 'formalise', B, model(edit(normative(), MAIN, 'end Spyro', `${code}\n\nend Spyro`)));
    expect(attemptNotice(early.findings, 1, 3, CTX)).toBe("Attempt 1 didn't pass: it wrote an example before freezing the statements. Asking Claude to retry.");
    const late = rules('gate-proved', 'prove', B, model(pinned(edit(proved(), MAIN, 'end Spyro', `${code}\n\nend Spyro`))), { freeze: frozenSnapshot(N, SEL, 1) });
    expect(attemptNotice(late.findings, 1, 3, CTX)).toBe(
      "Attempt 1 didn't pass: it left an example in the files (a proof without a name, so telelean cannot check what it rests on). Asking Claude to retry.",
    );
  });

  it('singular and plural', () => {
    const a: GateFinding = { step: 'G3', code: 'not-frozen', message: 'x' };
    const b: GateFinding = { step: 'G0', code: 'bad-path', message: 'y', file: 'Model/Spyro/notes.md', token: 'Model/Spyro/notes.md' };
    const c: GateFinding = { step: 'G0', code: 'project-file', message: 'z', file: 'lakefile.toml', token: 'lakefile.toml' };
    expect(attemptNotice([a, b], 1, 3, CTX)).toBe("Attempt 1 didn't pass: it claimed the goal was proved without freezing the statements first (and 1 more). Asking Claude to retry.");
    expect(attemptNotice([a, b, c], 2, 3, CTX)).toBe("Attempt 2 didn't pass: it claimed the goal was proved without freezing the statements first (and 2 more). Asking Claude to retry.");
    const two: GateFinding = { step: 'G3', code: 'footprint', message: 'w', file: MAIN, nodeId: 'cynder-not-good', names: ['Spyro.new_spyro_pg.holds', 'Spyro.cynder_dark_past.holds'] };
    expect(describeFinding(two, contextOf(board, ['pg-no-dark-past']))).toBe(
      'it used “The new Spyro game is PG” (`new_spyro_pg.holds`) and “Cynder is a character who has a dark past” (`cynder_dark_past.holds`), which you didn\'t select',
    );
    expect(describeFinding({ ...two, names: ['Spyro.shortcut'] }, CTX)).toBe('it used `shortcut`, which the selected premises do not allow');
  });

  it('every code has a sentence', () => {
    const sample = (code: GateFinding['code'], extra: Partial<GateFinding> = {}): string => describeFinding({ step: 'G3', code, message: 'm', ...extra }, CTX);
    expect(sample('project-file', { file: 'lean-toolchain' })).toBe('it changed a project file (`lean-toolchain`)');
    expect(sample('outside-subject', { file: 'Model.lean' })).toBe('it changed a file outside this subject (`Model.lean`)');
    expect(sample('deleted-file', { file: MAIN })).toBe('it deleted a file (`Model/Spyro/Main.lean`)');
    expect(sample('bad-path', { file: 'Model/Spyro/notes.md' })).toBe('it wrote a file that is not a Lean module of this subject (`Model/Spyro/notes.md`)');
    expect(sample('import', { token: 'import Lean' })).toBe('it imported a module from outside the project (`import Lean`)');
    expect(sample('build', { file: MAIN, range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } } })).toBe('the files did not build (an error in Model/Spyro/Main.lean line 4)');
    expect(sample('budget')).toBe('the build ran out of time or memory');
    expect(sample('not-proved', { names: ['Spyro.cynder_not_good.holds'], file: MAIN, token: 'mismatch' })).toBe('it proved something other than the goal (`cynder_not_good.holds` does not state the goal)');
    expect(sample('not-proved', { names: ['Spyro.cynder_not_good.holds'], file: MAIN, token: 'missing' })).toBe('it did not prove the goal (`cynder_not_good.holds` is missing)');
    expect(sample('vocabulary-shape', { names: ['Spyro.spyro'], file: 'Model/Spyro/Vocabulary.lean' })).toBe('it added vocabulary of a kind telelean does not allow (`spyro`)');
    expect(sample('not-formalised', { nodeId: 'pg-no-dark-past' })).toBe('it did not formalise “PG games cannot have characters with dark pasts”');
    expect(sample('missing-holds', { nodeId: 'pg-no-dark-past', names: ['Spyro.pg_no_dark_past.holds'], file: MAIN })).toBe(
      'it did not state “PG games cannot have characters with dark pasts” as an assumption (`pg_no_dark_past.holds` is missing)',
    );
    expect(sample('proof-before-freeze', { names: ['Spyro.cynder_not_good.holds'], file: MAIN })).toBe('it wrote a proof before freezing the statements (`cynder_not_good.holds`)');
    expect(sample('sorry-axiom', { names: ['Spyro.helper'], file: MAIN })).toBe('it left a gap (`sorry`) in `helper`');
    expect(sample('new-axiom', { names: ['Spyro.Console'], file: MAIN, token: 'after-freeze' })).toBe('it added vocabulary (`Console`) after freezing the statements');
    expect(sample('comparator-kernel')).toBe("Lean's kernel rejected the proof");
    expect(sample('comparator-missing', { names: ['Spyro.cynder_not_good.holds'] })).toBe('the proof of the goal is missing (`cynder_not_good.holds`)');
    expect(sample('markup', { nodeId: 'pg-no-dark-past', token: 'formalised' })).toBe('it formalised “PG games cannot have characters with dark pasts”, which you didn\'t select');
    expect(sample('markup', { nodeId: 'claude-card', token: 'block' })).toBe('it added a card of its own');
    expect(sample('native-code', { token: '+native', file: MAIN, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } })).toBe('it used native code (`+native`) in Model/Spyro/Main.lean line 1');
  });
});
