/**
 * Spec v4.1 B.2 "no hidden edges" in the gate (slice 1e, rule `undeclared-premise`): every card the target's proof uses
 * directly (direct(T), from the elaborated proof: `DeclFacts.valueConsts` and core's walk, as the board computes it)
 * must be a selected premise or an adopted ghost. The S14 case: today's footprint rule lets a proof use an unselected
 * proved card whose basis the selection covers; B.2 names that card. Without elaborated values the gate refuses
 * (`source-only`), never falling back to the `.ilean` references. Hand-written facts (fakeFacts with `valueConsts`).
 */
import { describe, expect, it } from 'vitest';
import { describeFinding, evaluateRules, UNSEEN_PROOF, type RuleInput, type RulePurpose, type Selection } from '../../src/gate/index.js';
import type { ProjectModel } from '../../src/project/index.js';
import { block, build, mainS, VOCAB_S } from '../project/helpers/build.js';
import type { FakeFactsOptions } from '../project/helpers/fakeFacts.js';

const VOCAB = { 'Model/S/Vocabulary.lean': VOCAB_S };
const MAIN = 'Model/S/Main.lean';

const A = [block({ id: 'a', type: 'AXIOM', name: 'A holds', rationale: 'r', lean: 'S.a' }), 'abbrev a : Prop := Good t', 'axiom a.holds : a'].join('\n');
/** L: a proposition proved from a alone (its basis is covered by selecting a). */
const L = [block({ id: 'l', type: 'PROPOSITION', name: 'L follows from A', premises: ['a'], lean: 'S.l' }), 'abbrev l : Prop := Good t', 'theorem l.holds : l := a.holds'].join('\n');
/** G: an axiom card, standing in for an adopted ghost ("I hold this"). */
const G = [block({ id: 'g', type: 'AXIOM', name: 'G holds (adopted)', rationale: 'r', lean: 'S.g' }), 'abbrev g : Prop := Good t', 'axiom g.holds : g'].join('\n');
const V_BLOCK = (premises: string[]) => block({ id: 'v', type: 'PROPOSITION', name: 'V is the target', premises, lean: 'S.v' });

/** The files with the target `v` drawn from `premises`, its proof `proof` (none: unproved), and lemmas no card owns. */
function texts(premises: string[], proof?: string, lemmas: string[] = []): Record<string, string> {
  const body = [A, '', L, '', G, '', ...lemmas, '', V_BLOCK(premises), 'abbrev v : Prop := Good t', ...(proof !== undefined ? [`theorem v.holds : v := ${proof}`] : [])].join('\n');
  return { ...VOCAB, [MAIN]: mainS(body) };
}

function model(files: Record<string, string>, facts: FakeFactsOptions = { valueConsts: true }): ProjectModel {
  return build(files, { facts }).model;
}

const SELECT = (premises: string[], adoptedGhosts: string[] = []): Selection => ({ subject: 'S', target: 'v', premises, adoptedGhosts });

function judge(purpose: RulePurpose, base: ProjectModel, current: ProjectModel, selection: Selection, extra: Partial<RuleInput> = {}) {
  return evaluateRules({ purpose, stage: 'prove', selection, base, current, teleleanBlocks: [], ...extra }).findings.filter((f) => f.code === 'undeclared-premise');
}

const sentenceOf = (current: ProjectModel) => (id: string) => current.nodes.get(id)?.node.naturalName;
const ctxOf = (current: ProjectModel, selected: readonly string[]) => ({ sentenceOf: sentenceOf(current), nodeOfDecl: (name: string) => current.ownerOfDecl.get(name), selected });

describe('B.2 in the gate: direct(T) within the selected premises (undeclared-premise)', () => {
  const B = model(texts(['a', 'l']));

  it('passes when every card the proof uses directly is selected', () => {
    const S = model(texts(['a', 'l'], 'l.holds'));
    expect(S.nodes.get('v')?.node.status.direct).toEqual({ ids: ['l'], from: 'proof' });
    expect(judge('gate-proved', B, S, SELECT(['a', 'l']))).toEqual([]);
    // Selecting a superset is fine too (the band binds what the proof uses; A8).
    expect(judge('gate-proved', B, S, SELECT(['l', 'a']))).toEqual([]);
  });

  it('the S14 case: an unselected proved card whose basis the selection covers passes the footprint rule, and B.2 names it', () => {
    const S = model(texts(['a', 'l'], 'l.holds'));
    const all = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SELECT(['a']), base: B, current: S, teleleanBlocks: [] });
    // The footprint of v.holds is a.holds (through l's proof): within the permitted set of the selection {a}.
    expect(all.findings.filter((f) => f.code === 'footprint')).toEqual([]);
    const [finding, ...rest] = all.findings.filter((f) => f.code === 'undeclared-premise');
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ step: 'G3', code: 'undeclared-premise', nodeId: 'l', names: ['S.l.holds'], token: 'unselected', file: MAIN });
    expect(finding?.message).toContain('S.v.holds uses S.l.holds directly: the card l ("L follows from A") is not one of the selected premises.');
    expect(finding?.message).toContain('finish with status not_proved, naming l in gap');
    // The board's words (the attempt notice).
    expect(describeFinding(finding!, ctxOf(S, ['a']))).toBe('the proof uses “L follows from A”, which is not one of the arrows you selected');
  });

  it('an adopted ghost counts as selected; without the adoption it is named', () => {
    const S = model(texts(['a', 'g'], 'g.holds'));
    expect(judge('gate-proved', B, S, SELECT(['a'], ['g']))).toEqual([]);
    expect(judge('gate-proved', B, S, SELECT(['a'])).map((f) => [f.nodeId, f.token])).toEqual([['g', 'unselected']]);
  });

  it('refuses rather than guess when the facts have no elaborated values (never the .ilean references)', () => {
    const S = model(texts(['a', 'l'], 'l.holds'), {});
    expect(S.nodes.get('v')?.node.status.direct?.from).toBe('source');
    const findings = judge('gate-proved', B, S, SELECT(['a', 'l']));
    expect(findings.map((f) => [f.token, f.nodeId, f.message])).toEqual([['source-only', 'v', UNSEEN_PROOF]]);
    expect(UNSEEN_PROOF).toBe('telelean could not see which cards the proof uses; this check needs the elaborated facts');
    expect(describeFinding(findings[0]!, ctxOf(S, ['a', 'l']))).toBe(UNSEEN_PROOF);
    // One declaration the walk passes through without values is enough (a lemma no card owns): the whole walk would
    // be the references'.
    const lemma = texts(['a', 'l'], 'helper', ['theorem helper : l := l.holds']);
    expect(judge('gate-proved', B, model(lemma), SELECT(['a', 'l']))).toEqual([]);
    expect(model(lemma).nodes.get('v')?.node.status.direct).toEqual({ ids: ['l'], from: 'proof' });
    const partial = model(lemma, { valueConsts: true, overrides: { 'S.helper': { noValueConsts: true } } });
    expect(judge('gate-proved', B, partial, SELECT(['a', 'l'])).map((f) => f.token)).toEqual(['source-only']);
    // Through such a lemma, an unselected card is still named.
    expect(judge('gate-proved', B, model(lemma), SELECT(['a'])).map((f) => [f.token, f.nodeId])).toEqual([['unselected', 'l']]);
  });

  it('the cross-check: a card in the footprint that no card the walk reached rests on is refused (unseen)', () => {
    const S = model(texts(['a', 'l', 'g'], 'l.holds'), {
      valueConsts: true,
      overrides: { 'S.v.holds': { axioms: ['S.Good', 'S.T', 'S.T.exists', 'S.a.holds', 'S.g.holds'], valueConsts: ['S.l.holds'] } },
    });
    expect(S.nodes.get('v')?.node.status.direct).toEqual({ ids: ['l'], from: 'proof', unseen: ['g'] });
    const findings = judge('gate-proved', B, S, SELECT(['a', 'l', 'g']));
    expect(findings.map((f) => [f.token, f.nodeId])).toEqual([['unseen', 'g']]);
    expect(describeFinding(findings[0]!, ctxOf(S, ['a', 'l', 'g']))).toBe('the proof uses “G holds (adopted)” in a way the arrows do not show');
  });

  it('gate-other judges a proof of the target the run added or changed, never the user\'s own unchanged proof', () => {
    const own = model(texts(['a', 'l'], 'l.holds'));
    // The person's proof uses l, which they did not select this time (A11): finishing not proved leaves it as it was.
    expect(judge('gate-other', own, own, SELECT(['a']))).toEqual([]);
    // A proof the run wrote is judged (status-mismatch says to restore the person's proof; B.2 says what it used).
    const S = model(texts(['a', 'l'], '(l.holds)'));
    const all = evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SELECT(['a']), base: own, current: S, teleleanBlocks: [] }).findings;
    expect(all.map((f) => f.code)).toEqual(expect.arrayContaining(['status-mismatch', 'undeclared-premise']));
    expect(judge('gate-other', B, S, SELECT(['a'])).map((f) => f.nodeId)).toEqual(['l']);
  });

  it('A11 (fixer 1e): the person\'s own proof, unchanged, is judged only by a proved finish, whose message says to replace it or leave it; never by check_lean', () => {
    // v is proved already by the person, from l; the person now selects only the arrow from a (A11).
    const own = model(texts(['a', 'l'], 'l.holds'));
    // check_lean (stage prove): nothing about the person's unchanged proof, so "Claude suggests" (which needs a clean
    // check) stays possible. The footprint rule too: here the proof uses g, an axiom outside the selection.
    const viaG = model(texts(['a', 'g'], 'g.holds'));
    expect(evaluateRules({ purpose: 'check', stage: 'prove', selection: SELECT(['a']), base: own, current: own, teleleanBlocks: [] }).findings).toEqual([]);
    expect(evaluateRules({ purpose: 'check', stage: 'prove', selection: SELECT(['a']), base: viaG, current: viaG, teleleanBlocks: [] }).findings).toEqual([]);
    // A proved finish claims that the target follows from the selection: the existing proof is judged, and the message
    // says to write a new proof (it replaces the existing one) or to leave it exactly as it is (never to remove it).
    const [finding, ...rest] = judge('gate-proved', own, own, SELECT(['a']));
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ nodeId: 'l', names: ['S.l.holds'], token: 'unselected' });
    expect(finding?.message).toContain('S.v.holds is the existing proof of the target, unchanged in this run, and it uses S.l.holds directly');
    expect(finding?.message).toContain("write a new proof of the target that (with every lemma it uses) uses only the selected premises' .holds (it replaces the existing one)");
    expect(finding?.message).toContain('or finish with status not_proved and leave the existing proof exactly as it is, naming l in gap');
    expect(finding?.message).not.toContain('remove the proof');
    const footprint = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SELECT(['a']), base: viaG, current: viaG, teleleanBlocks: [] }).findings.filter((f) => f.code === 'footprint');
    expect(footprint.map((f) => f.names)).toEqual([['S.g.holds']]);
    expect(footprint[0]?.message).toContain('S.v.holds is the existing proof of the target, unchanged in this run, and it rests on S.g.holds');
    expect(footprint[0]?.message).toContain('or finish with status not_proved and leave the existing proof exactly as it is.');
    // Once the run changed the person's proof, it is judged everywhere, and the way back is to restore it, not remove it.
    const changed = model(texts(['a', 'l'], '(l.holds)'));
    expect(judge('check', own, changed, SELECT(['a'])).map((f) => f.nodeId)).toEqual(['l']);
    expect(judge('gate-proved', own, changed, SELECT(['a']))[0]?.message).toContain('if it cannot be done without it, restore S.v.holds exactly as it was before the run and finish with status not_proved, naming l in gap');
  });

  it('a not-proved finish leaves the target\'s .holds exactly as it was (fixer 1e; ES-2, Appendix B): removing or changing it is refused', () => {
    const own = model(texts(['a', 'l'], 'l.holds'));
    const status = (base: ProjectModel, current: ProjectModel) =>
      evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SELECT(['a']), base, current, teleleanBlocks: [] }).findings.filter((f) => f.code === 'status-mismatch');
    // The person's proof uses l, which they did not select this time; Claude removes it and finishes not proved.
    const removed = model(texts(['a', 'l']));
    const [gone, ...more] = status(own, removed);
    expect(more).toEqual([]);
    expect(gone).toMatchObject({ step: 'G3', token: 'removed', names: ['S.v.holds'], nodeId: 'v', file: MAIN });
    expect(gone?.message).toContain('you finished without status proved, but S.v.holds (the existing proof of the target) was removed in this run');
    expect(gone?.message).toContain('Restore S.v.holds exactly as it was before finishing.');
    expect(describeFinding(gone!, ctxOf(removed, ['a']))).toBe('it removed `v.holds` although it did not prove the goal (it must stay as it was)');
    // Nothing else would have refused the removal: the target's .holds is left to this rule.
    expect(evaluateRules({ purpose: 'gate-other', stage: 'prove', selection: SELECT(['a']), base: own, current: removed, teleleanBlocks: [] }).findings.map((f) => f.code)).toEqual(['status-mismatch']);
    // A proved finish without it: not proved, and the way out names the restore.
    const missing = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SELECT(['a']), base: own, current: removed, teleleanBlocks: [] }).findings.filter((f) => f.code === 'not-proved');
    expect(missing[0]?.message).toContain('or restore S.v.holds exactly as it was before the run and finish with status not_proved');
    // Changed: refused too, with the way back.
    const changed = model(texts(['a', 'l'], '(l.holds)'));
    const [edited] = status(own, changed);
    expect(edited).toMatchObject({ token: 'changed', names: ['S.v.holds'] });
    expect(edited?.message).toContain('or restore S.v.holds exactly as it was before finishing.');
    expect(describeFinding(edited!, ctxOf(changed, ['a']))).toBe('it changed `v.holds` although it did not prove the goal (it must stay as it was)');
    // A pending claim (`axiom v.holds`) Claude proved without finishing proved goes back as it was as well.
    const claim = texts(['a', 'l'], 'l.holds');
    claim[MAIN] = (claim[MAIN] ?? '').replace('theorem v.holds : v := l.holds', 'axiom v.holds : v');
    const [pending] = status(model(claim), own);
    expect(pending).toMatchObject({ token: 'changed', names: ['S.v.holds'] });
    expect(pending?.message).toContain('S.v.holds (the pending claim of the target, an axiom) was changed in this run');
    // Left exactly as it was: nothing; a proof the run added (B had none) keeps today's message.
    expect(status(own, own)).toEqual([]);
    const added = status(B, model(texts(['a', 'l'], 'l.holds')));
    expect(added.map((f) => [f.token, f.message.includes('or remove the proof of the target before finishing.')])).toEqual([[undefined, true]]);
  });

  it('check_lean in stage prove reports it too (it blocks nothing there); the formalise stage and freeze do not judge it', () => {
    const S = model(texts(['a', 'l'], 'l.holds'));
    expect(judge('check', B, S, SELECT(['a'])).map((f) => f.nodeId)).toEqual(['l']);
    expect(evaluateRules({ purpose: 'check', stage: 'formalise', selection: SELECT(['a']), base: B, current: S, teleleanBlocks: [] }).findings.some((f) => f.code === 'undeclared-premise')).toBe(false);
    expect(judge('freeze', B, S, SELECT(['a']))).toEqual([]);
  });

  it('an unproved target is not-proved\'s finding, not B.2\'s; the finding comes right after footprint in the report', () => {
    expect(judge('gate-proved', B, B, SELECT(['a']))).toEqual([]);
    const lemma = model(texts(['a', 'l'], 'l.holds'));
    const order = evaluateRules({ purpose: 'gate-proved', stage: 'prove', selection: SELECT(['a']), base: B, current: lemma, teleleanBlocks: [] }).findings.map((f) => f.code);
    const at = order.indexOf('undeclared-premise');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(order.slice(at + 1).every((c) => !['new-axiom', 'existing-changed', 'not-proved', 'status-mismatch', 'statement-changed', 'footprint'].includes(c))).toBe(true);
  });
});
