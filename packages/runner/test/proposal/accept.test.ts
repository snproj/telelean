/**
 * AT4.4 baseDrift, AT4.5 planAccept, AT4.9 diffFiles and ProposalService.apply, with an in-memory shadow and fakes for
 * WP1's stubs (proposalLabel). The merge is checked line by line around the 3 context lines of docs/m2-plan.md
 * section 7.1: a user's edit 3 lines from a change of Claude's is a conflict, 4 lines away merges. (Spec v4 removed
 * the lifecycle items and their tests: docs/slice1-plan.md 2.6.)
 */
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUserNode, REVIEW_TEXTS, type ActionOutcome, type FileChange, type ProposalView, type ReportCard } from '@telelean/core';

import { createProposalService, MERGE_CONTEXT_LINES, type ApplyRequest, type ProposalCore } from '../../src/proposal/index.js';
import type { ExternalChangeSet, ModelWorkspace } from '../../src/workspace/types.js';
import { cleanup, copyMentalModel, makeTempDir, overlayTextSource, write } from '../workspace/helpers.js';
import { edit, fakeDiff, fakeShadow, INBOX, MAIN, normativeState, realReader, shadowFilesOnDisk, USAGE, VOCABULARY } from './helpers.js';

const TARGET_SENTENCE = 'Cynder would not be a good addition to the new Spyro game';

function report(overrides: Partial<ReportCard> = {}): ReportCard {
  return {
    verdict: 'proved',
    target: 'cynder-not-good',
    footprint: [],
    unusedPremises: [],
    consistency: 'unchecked',
    selfEvident: false,
    assumedWithoutAsking: [],
    gateAttempts: [],
    usage: USAGE,
    durationMs: 1,
    agentMs: 1,
    ...overrides,
  };
}

function proposal(overrides: Partial<ProposalView> = {}): ProposalView {
  const target = createUserNode({ id: 'cynder-not-good', type: 'PROPOSITION', naturalName: TARGET_SENTENCE, subject: 'Spyro' });
  return {
    runId: 'r1',
    proposalId: 'p1',
    round: 1,
    subject: 'Spyro',
    graph: { version: 1, subject: 'Spyro', nodes: [target], edges: [], vocabulary: [], diagnostics: [], semantic: { state: 'fresh' } },
    diff: fakeDiff(),
    files: [],
    review: [],
    definitions: [],
    ghosts: [],
    report: report(),
    baseChanged: false,
    empty: false,
    ...overrides,
  };
}

/** Fakes for WP1's stubs, recording their calls. */
function fakes() {
  const labels: Array<Parameters<ProposalCore['proposalLabel']>> = [];
  const core: Partial<ProposalCore> = {
    diffGraphs: () => fakeDiff(),
    proposalLabel: (...args) => {
      labels.push(args);
      return `label(${args[0]}, ${args[1]}, +${args[2].adoptedGhosts} adopted)`;
    },
  };
  return { core, labels };
}

/** 40 distinct lines (`-- line 1` … `-- line 40`), with line `k` (1-based) replaced. */
const LINES = Array.from({ length: 40 }, (_, i) => `-- line ${i + 1}`);
const lines = (changes: Record<number, string> = {}): string => `${LINES.map((l, i) => changes[i + 1] ?? l).join('\n')}\n`;

describe('the proposal service around Accept', () => {
  let tmp: string;
  let root: string;
  let base: Map<string, string>;
  beforeEach(() => {
    tmp = makeTempDir('proposal-accept');
    root = copyMentalModel(tmp);
    base = shadowFilesOnDisk(root);
  });
  afterEach(() => cleanup(tmp));

  const runDir = (): string => path.join(tmp, 'runs', 'r1');

  describe('AT4.4 baseDrift', () => {
    it('reports nothing when the real files are untouched', async () => {
      const service = createProposalService();
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      expect(await service.baseDrift(shadow, overlayTextSource(root).read, [...base.keys()])).toEqual([]);
    });

    it('reports a real file whose open (unsaved) buffer differs from the base', async () => {
      const service = createProposalService();
      const shadow = fakeShadow({ runDir: runDir(), root, base });
      const text = overlayTextSource(root, new Map([[MAIN, `${base.get(MAIN) ?? ''}-- typed, not saved\n`]]));
      expect(await service.baseDrift(shadow, text.read)).toEqual([MAIN]);
    });

    it('reports a model file the user added (in realFiles) and one they deleted; other files never count', async () => {
      const service = createProposalService();
      const shadow = fakeShadow({ runDir: runDir(), root, base });
      write(root, 'Model/Spyro/Extra.lean', 'namespace Spyro\nend Spyro\n');
      write(root, 'notes.md', 'not a model file\n');
      const text = overlayTextSource(root, new Map([[INBOX, null]])); // deleted in the editor
      const realFiles = [...[...base.keys()].filter((rel) => rel !== INBOX), 'Model/Spyro/Extra.lean', 'notes.md', '.telelean/config.json'];
      expect(await service.baseDrift(shadow, text.read, realFiles)).toEqual(['Model/Spyro/Extra.lean', INBOX]);
      // Without realFiles only the base's files are compared: the deletion still shows, the addition cannot.
      expect(await service.baseDrift(shadow, text.read)).toEqual([INBOX]);
    });
  });

  describe('AT4.5 planAccept', () => {
    it('no drift: before = the real files, after = the shown files; shadowState = every merged file', async () => {
      const { core, labels } = fakes();
      const service = createProposalService({ core });
      const shown = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(new Map(base)), today: '2026-11-01', realFiles: [...base.keys()] });
      expect(plan).toEqual({
        ok: true,
        changes: [{ path: MAIN, before: base.get(MAIN), after: shown.get(MAIN) }],
        label: `label(proved, ${TARGET_SENTENCE}, +0 adopted)`,
        nodes: ['cynder-not-good'],
        drift: [],
        shadowState: shown,
      });
      expect(labels).toEqual([['proved', TARGET_SENTENCE, { adoptedGhosts: 0 }]]);
    });

    it(`drift more than ${MERGE_CONTEXT_LINES} lines from every change of Claude's merges; files only the user changed keep their text`, async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const baseFiles = new Map([...base, [MAIN, lines()]]);
      const shadow = fakeShadow({ runDir: runDir(), root, base: baseFiles, current: new Map([...baseFiles, [MAIN, lines({ 20: '-- line 20, by Claude' })]]) });
      for (const k of [10, 16, 24, 40]) {
        const real = new Map<string, string | null>([...baseFiles, [MAIN, lines({ [k]: `-- line ${k}, by the user` })], [INBOX, `${base.get(INBOX) ?? ''}-- mine\n`]]);
        const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(real), today: '2026-11-01', realFiles: [...baseFiles.keys()] });
        expect(plan.ok, `user edit on line ${k}: ${JSON.stringify(plan)}`).toBe(true);
        if (!plan.ok) continue;
        const merged = lines({ [k]: `-- line ${k}, by the user`, 20: '-- line 20, by Claude' });
        expect(plan.changes).toEqual([{ path: MAIN, before: real.get(MAIN), after: merged }]);
        expect(plan.drift).toEqual([INBOX, MAIN]);
        expect(plan.shadowState.get(MAIN)).toBe(merged);
        expect(plan.shadowState.get(INBOX)).toBe(real.get(INBOX)); // the user's own change, untouched by Accept
      }
    });

    it(`drift within ${MERGE_CONTEXT_LINES} lines of a change of Claude's (or on it) is a conflict naming the file`, async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const baseFiles = new Map([...base, [MAIN, lines()]]);
      const shadow = fakeShadow({ runDir: runDir(), root, base: baseFiles, current: new Map([...baseFiles, [MAIN, lines({ 20: '-- line 20, by Claude' })]]) });
      for (const k of [17, 19, 20, 21, 23]) {
        const real = new Map<string, string | null>([...baseFiles, [MAIN, lines({ [k]: `-- line ${k}, by the user` })]]);
        const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(real), today: '2026-11-01', realFiles: [...baseFiles.keys()] });
        expect(plan, `user edit on line ${k}`).toEqual({
          ok: false,
          code: 'conflict',
          error: `Your edits to ${MAIN} since the run started overlap Claude's; Discard, or undo those edits and Accept again.`,
          files: [MAIN],
        });
      }
    });

    it('on the Spyro files: the user edited a rationale far from the formalisation and the proof -> merged', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const shown = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const realMain = edit(base.get(MAIN) ?? '', 'rationale: known from gaming news', 'rationale: known from gaming news and the trailer');
      const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(new Map([...base, [MAIN, realMain]])), today: '2026-11-01' });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      expect(plan.changes).toEqual([
        { path: MAIN, before: realMain, after: edit(shown.get(MAIN) ?? '', 'rationale: known from gaming news', 'rationale: known from gaming news and the trailer') },
      ]);
      // An edit of the user's inside pg-no-dark-past's block (which normalisation pinned) overlaps: conflict.
      const inBlock = edit(base.get(MAIN) ?? '', 'stance: rule\n', 'stance: believe\n');
      const conflict = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(new Map([...base, [MAIN, inBlock]])), today: '2026-11-01' });
      expect(conflict).toMatchObject({ ok: false, code: 'conflict', files: [MAIN] });
    });

    it('files created, deleted or added: Claude creates a module; a user-added file is kept; deleting a file Claude changed is a conflict', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const lemmas = 'Model/Spyro/Lemmas.lean';
      const shown = new Map([...normativeState(base), [lemmas, 'namespace Spyro\nend Spyro\n']]);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const mine = 'Model/Spyro/Mine.lean';
      const real = new Map<string, string | null>([...base, [mine, 'namespace Spyro\n-- mine\nend Spyro\n'], [INBOX, null]]);
      const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(real), today: '2026-11-01', realFiles: [...base.keys(), mine].filter((r) => r !== INBOX) });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      expect(plan.changes).toEqual([
        { path: lemmas, before: null, after: shown.get(lemmas) },
        { path: MAIN, before: base.get(MAIN), after: shown.get(MAIN) },
      ]);
      expect(plan.drift).toEqual([INBOX, mine]);
      expect(plan.shadowState.get(mine)).toBe(real.get(mine)); // the re-gate sees the user's new file too
      expect(plan.shadowState.has(INBOX)).toBe(false); // deleted by the user, untouched by Claude: stays deleted
      // The user deleted the file Claude changed: conflict.
      const gone = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(new Map([...base, [MAIN, null]])), today: '2026-11-01', realFiles: [] });
      expect(gone).toMatchObject({ ok: false, code: 'conflict', files: [MAIN] });
    });

    it('without realFiles the model root on disk is listed, so a user-added file is still kept', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      write(root, 'Model/Spyro/Mine.lean', 'namespace Spyro\nend Spyro\n');
      const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: overlayTextSource(root).read, today: '2026-11-01' });
      expect(plan.ok && plan.shadowState.get('Model/Spyro/Mine.lean')).toBe('namespace Spyro\nend Spyro\n');
      expect(plan.ok && plan.drift).toEqual(['Model/Spyro/Mine.lean']);
    });

    it('with shownState (after a passing re-gate): after = exactly those files, before = the real files', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const shown = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      // The user's files at Accept (a drifted Inbox and a drifted rationale), as the RunManager writes them for the re-check.
      const realMain = edit(base.get(MAIN) ?? '', 'rationale: known from gaming news', 'rationale: from the trailer');
      const real = new Map<string, string | null>([...base, [MAIN, realMain], [INBOX, `${base.get(INBOX) ?? ''}-- mine\n`]]);
      await shadow.writeFiles([...real].map(([rel, text]) => ({ path: rel, before: shadow.current.get(rel) ?? null, after: text })));
      await shadow.commit('accept-base', 'Your files at Accept', 1);
      const regated = new Map([...real].filter((e): e is [string, string] => e[1] !== null));
      regated.set(MAIN, edit(shown.get(MAIN) ?? '', 'rationale: known from gaming news', 'rationale: from the trailer'));
      const plan = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(real), today: '2026-11-01', shownState: regated });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      expect(plan.changes).toEqual([{ path: MAIN, before: realMain, after: regated.get(MAIN) }]);
      expect(plan.shadowState).toEqual(regated);
      expect(plan.drift).toEqual([INBOX, MAIN]);
    });

    it('with shownState: a file the user changed again during the re-check is kept when untouched, a conflict when rebased', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const shown = normativeState(base);
      // The RunManager wrote the user's files at Accept into ws/ (here: the base, for simplicity) and committed them.
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: base });
      await shadow.commit('accept-base', 'Your files at Accept', 1);
      for (const [rel, text] of shown) shadow.current.set(rel, text);
      const regated = new Map(shown);
      // During the re-check the user typed in Vocabulary.lean (which the re-gated state leaves as it was): kept.
      const typed = new Map<string, string | null>([...base, [VOCABULARY, `${base.get(VOCABULARY) ?? ''}-- typed\n`]]);
      const kept = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(typed), today: '2026-11-01', shownState: regated });
      expect(kept.ok && kept.changes).toEqual([{ path: MAIN, before: base.get(MAIN), after: shown.get(MAIN) }]);
      // … and in Main.lean, which the re-gated state changes: refused, nothing lost.
      const raced = new Map<string, string | null>([...base, [MAIN, `${base.get(MAIN) ?? ''}-- typed\n`]]);
      const refused = await service.planAccept({ proposal: proposal(), shadow, readReal: realReader(raced), today: '2026-11-01', shownState: regated });
      expect(refused).toEqual({
        ok: false,
        code: 'conflict',
        error: `You changed ${MAIN} while telelean re-checked the proposal; press Accept again to include your edits.`,
        files: [MAIN],
      });
    });

    it('the label counts adopted ghosts; nodes = target, reviewed statements and adopted cards', async () => {
      const { core, labels } = fakes();
      const service = createProposalService({ core });
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      const ghost = { id: 'ghost-1', naturalName: 'g', leanStatement: 'True', leanName: 'g', whyNeeded: 'w', closesGap: true, aloneEntails: false, round: 1 } as const;
      const p = proposal({
        review: [
          { kind: 'statement', nodeId: 'pg-no-dark-past', sentence: 's', wordedBy: 'user', leanName: 'Spyro.pg_no_dark_past', pretty: 'p', explicit: 'e', closure: [], change: 'new' },
          { kind: 'statement', nodeId: 'a-character-who-cannot-be-in', sentence: 'g', wordedBy: 'agent', leanName: 'Spyro.g', pretty: 'p', explicit: 'e', closure: [], change: 'new' },
          { kind: 'vocabulary', items: [] },
        ],
        ghosts: [
          { ...ghost, state: 'adopted', nodeId: 'a-character-who-cannot-be-in' },
          { ...ghost, id: 'ghost-2', state: 'rejected' },
        ],
      });
      const plan = await service.planAccept({ proposal: p, shadow, readReal: realReader(new Map(base)), today: '2026-11-01' });
      expect(plan.ok && plan.nodes).toEqual(['cynder-not-good', 'pg-no-dark-past', 'a-character-who-cannot-be-in']);
      expect(labels.at(-1)).toEqual(['proved', TARGET_SENTENCE, { adoptedGhosts: 1 }]);
    });
  });

  describe('the report card from the proposed board (faked subjectGraph)', () => {
    /** A build whose proposed board is `target` (status as given) plus `edges`, on the Spyro files without facts. */
    async function reportFor(proof: ProposalView['graph']['nodes'][number]['status']['proof'], premises: string[], verdict: ReportCard['verdict'], edges: ProposalView['graph']['edges'] = []) {
      const target = createUserNode({ id: 'cynder-not-good', type: 'PROPOSITION', naturalName: TARGET_SENTENCE, subject: 'Spyro' });
      const proposed = { ...proposal().graph, nodes: [{ ...target, status: { ...target.status, proof } }], edges };
      const service = createProposalService({ core: { diffGraphs: () => fakeDiff(), subjectGraph: () => proposed } });
      const built = await service.build({
        runId: 'r1',
        round: 1,
        proposalId: 'p1',
        selection: { subject: 'Spyro', target: 'cynder-not-good', premises, adoptedGhosts: [] },
        shadow: fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) }),
        check: { outcome: 'ok', g0: [], findings: [], diagnostics: [], durationMs: 1 },
        rendered: [],
        currentGraph: proposal().graph,
        verdict,
        ghosts: [],
        gateAttempts: [],
        flaggedDefinitions: [],
        usage: USAGE,
        durationMs: 1,
        agentMs: 1,
        drift: [],
        graphVersion: 3,
        reverted: verdict === 'gave-up' ? { toCommit: 'c1', label: 'Statements frozen (round 1)', reason: 'gave up' } : undefined,
      });
      return built;
    }

    it('"Self-evident?": proved from zero premises with only presuppositions in the footprint', async () => {
      const built = await reportFor({ kind: 'proved', footprint: ['presup:Spyro.Character.exists'] }, [], 'proved');
      expect(built.report).toMatchObject({ verdict: 'proved', footprint: ['presup:Spyro.Character.exists'], selfEvident: true, unusedPremises: [] });
      expect(built).not.toHaveProperty('lifecycle');
      const hidden = await reportFor({ kind: 'proved', footprint: ['axiom:Spyro.shortcut'] }, [], 'proved');
      expect(hidden.report.selfEvident).toBe(false);
    });

    it('A9 / S18 (fixer 1e): proved without using a single selected arrow is "proved from nothing" too; through a selected card proved from nothing it is not', async () => {
      const ignored = await reportFor({ kind: 'proved', footprint: ['presup:Spyro.Character.exists'] }, ['cynder-dark-past', 'new-spyro-pg'], 'proved');
      expect(ignored.report).toMatchObject({ selfEvident: true, unusedPremises: ['cynder-dark-past', 'new-spyro-pg'] });
      // The selected premise is itself proved from nothing: the target's footprint holds no card, but its proof uses that
      // arrow (the verified edge), so the flag stays off.
      const through = await reportFor({ kind: 'proved', footprint: ['presup:Spyro.Character.exists'] }, ['a-derivation'], 'proved', [
        { id: 'verified:a-derivation->cynder-not-good', type: 'verified', source: 'a-derivation', target: 'cynder-not-good', origin: 'lean', where: 'proof' },
      ]);
      expect(through.report).toMatchObject({ selfEvident: false, unusedPremises: [] });
      // A hidden assumption (`axiom:`) is never "from nothing".
      expect((await reportFor({ kind: 'proved', footprint: ['axiom:Spyro.shortcut'] }, ['cynder-dark-past'], 'proved')).report.selfEvident).toBe(false);
    });

    it('a premise used through a proved proposition (verified edge) is not unused; one the proof ignores is', async () => {
      const built = await reportFor({ kind: 'proved', footprint: ['cynder-dark-past'] }, ['cynder-dark-past', 'a-derivation', 'new-spyro-pg'], 'proved', [
        { id: 'verified:a-derivation->cynder-not-good', type: 'verified', source: 'a-derivation', target: 'cynder-not-good', origin: 'lean', where: 'proof' },
      ]);
      expect(built.report.unusedPremises).toEqual(['new-spyro-pg']);
      expect(built.report.selfEvident).toBe(false);
    });

    it('not proved, gave up (reverted): no footprint, no unused premises; the revert is reported', async () => {
      const built = await reportFor({ kind: 'proved', footprint: ['cynder-dark-past'] }, ['cynder-dark-past'], 'gave-up');
      expect(built.report).toMatchObject({ verdict: 'gave-up', footprint: [], unusedPremises: [], selfEvident: false, reverted: { toCommit: 'c1', label: 'Statements frozen (round 1)', reason: 'gave up' } });
      const conditional = await reportFor({ kind: 'conditional', on: ['new-spyro-pg'], footprint: [] }, ['cynder-dark-past'], 'proved');
      expect(conditional.report.footprint).toEqual([]);
    });
  });

  describe('AT4.9 diffFiles and apply', () => {
    it('diffFiles gives base -> shown for the model and project files (a stray non-model file is not part of a proposal)', async () => {
      const service = createProposalService();
      const shown = new Map([...normativeState(base), ['Model/Spyro/Lemmas.lean', 'namespace Spyro\nend Spyro\n'], ['Model/Spyro/notes.md', 'x\n']]);
      shown.delete(INBOX);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const changes = await service.diffFiles(shadow, proposal());
      expect(changes).toEqual<FileChange[]>([
        { path: INBOX, before: base.get(INBOX) ?? null, after: null },
        { path: 'Model/Spyro/Lemmas.lean', before: null, after: 'namespace Spyro\nend Spyro\n' },
        { path: MAIN, before: base.get(MAIN) ?? null, after: shown.get(MAIN) ?? null },
      ]);
    });

    it('apply hands the plan to ModelWorkspace.applyChanges with history kind accept-proposal; never throws', async () => {
      const service = createProposalService();
      const calls: ExternalChangeSet[] = [];
      const changes = [{ path: MAIN, before: 'a', after: 'b' }];
      const plan = { ok: true as const, changes, label: 'These suffice → proved: x', nodes: ['cynder-not-good'], drift: [], shadowState: new Map<string, string>() };
      const workspace = {
        applyChanges: async (set: ExternalChangeSet): Promise<ActionOutcome> => {
          calls.push(set);
          return { ok: true, label: set.label, undoable: true };
        },
      } as unknown as ModelWorkspace;
      expect(await service.apply(plan, workspace, 'Spyro')).toEqual({ ok: true, label: 'These suffice → proved: x', undoable: true });
      expect(calls).toEqual([{ label: 'These suffice → proved: x', action: 'accept-proposal', subject: 'Spyro', nodes: ['cynder-not-good'], changes }]);
      expect(await service.apply(plan, {} as ModelWorkspace, 'Spyro')).toMatchObject({ ok: false, code: 'internal' });
      const throwing = { applyChanges: async () => Promise.reject(new Error('boom')) } as unknown as ModelWorkspace;
      expect(await service.apply(plan, throwing, 'Spyro')).toEqual({ ok: false, code: 'internal', error: 'boom' });
    });
  });

  describe('slice 2b3b: planApply, an edit session\'s Apply (docs/slice2-plan.md 3.10 step 4)', () => {
    const request = (shadow: ReturnType<typeof fakeShadow>, real: Map<string, string | null>, finalState: ReadonlyMap<string, string>, over: Record<string, unknown> = {}) => ({
      shadow,
      readReal: realReader(real),
      finalState,
      targets: [TARGET_SENTENCE],
      nodes: ['cynder-not-good', 'pg-no-dark-past', 'cynder-not-good'],
      realFiles: [...base.keys()],
      ...over,
    });

    it('real files equal to B: exactly B -> F, no merge, Apply\'s label, drift empty, shadowState = F\'s model files', async () => {
      const service = createProposalService();
      const final = normativeState(base);
      final.set('Model/Spyro/Lemmas.lean', 'namespace Spyro\nend Spyro\n');
      final.delete(INBOX);
      final.set('Model/Spyro/notes.md', 'not a model file\n');
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: new Map([...base, [MAIN, 'ws/ moved on\n']]) });
      const plan = await service.planApply(request(shadow, new Map(base), final));
      if (!plan.ok) throw new Error(plan.error);
      expect(plan.changes).toEqual([
        { path: INBOX, before: base.get(INBOX), after: null },
        { path: 'Model/Spyro/Lemmas.lean', before: null, after: 'namespace Spyro\nend Spyro\n' },
        { path: MAIN, before: base.get(MAIN), after: final.get(MAIN) },
      ]);
      expect(plan.label).toBe(`Apply: Formalize for dependencies → ${TARGET_SENTENCE}`);
      expect(plan.nodes).toEqual(['cynder-not-good', 'pg-no-dark-past']);
      expect(plan.drift).toEqual([]);
      expect(plan.shadowState.has('Model/Spyro/notes.md')).toBe(false);
      expect(plan.shadowState.get(MAIN)).toBe(final.get(MAIN));
      // F equal to B: nothing to change (an empty Apply).
      const empty = await service.planApply(request(shadow, new Map(base), base));
      expect(empty).toMatchObject({ ok: true, changes: [], drift: [] });
      // F is the state the final check passed, which the caller names (fixer 2b3b r1, A-V2B3B-ADV-6): never ws/ by
      // default. A request without it does not compile, and is refused before anything is read.
      const reader = realReader(new Map(base));
      // @ts-expect-error finalState is required
      const missing: ApplyRequest = { shadow: fakeShadow({ runDir: runDir(), root, base, current: final }), readReal: reader, targets: [TARGET_SENTENCE], nodes: [] };
      await expect(service.planApply(missing)).rejects.toThrow(/planApply needs finalState/u);
      expect(reader.reads).toEqual([]);
    });

    it('real files that differ from B (an edit, an unsaved buffer, a file the person added or deleted): refused with the session\'s drift text, nothing planned, nothing written', async () => {
      const service = createProposalService();
      const final = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: final });
      const ws = new Map(shadow.current);
      const cases: Array<[string, Map<string, string | null>, string[] | undefined, string[]]> = [
        ['an edit', new Map([...base, [VOCABULARY, `${base.get(VOCABULARY) ?? ''}-- mine\n`]]), undefined, [VOCABULARY]],
        ['an edit to a file F changes', new Map([...base, [MAIN, `${base.get(MAIN) ?? ''}-- mine\n`]]), undefined, [MAIN]],
        ['a file the person deleted', new Map([...base, [INBOX, null]]), undefined, [INBOX]],
        ['a file the person added', new Map([...base, ['Model/Spyro/Mine.lean', 'namespace Spyro\nend Spyro\n']]), [...base.keys(), 'Model/Spyro/Mine.lean'], ['Model/Spyro/Mine.lean']],
        ['two at once', new Map([...base, [INBOX, null], [VOCABULARY, '']]), undefined, [INBOX, VOCABULARY]],
      ];
      expect(REVIEW_TEXTS.drift([VOCABULARY])).toBe(
        `Your files changed since the session started: ${VOCABULARY}. Apply stays disabled until they match again (undo those edits in the editor), or until you exit the session.`,
      );
      for (const [label, real, realFiles, drift] of cases) {
        const reader = realReader(real);
        const plan = await service.planApply({ ...request(shadow, real, final), readReal: reader, ...(realFiles !== undefined ? { realFiles } : {}) });
        expect(plan, label).toEqual({
          ok: false,
          code: 'conflict',
          error: REVIEW_TEXTS.drift(drift),
          files: drift,
        });
        // Each real file was read once; ws/ is untouched (a plan writes nothing).
        expect(new Set(reader.reads).size).toBe(reader.reads.length);
        expect(shadow.current).toEqual(ws);
      }
    });
  });
});
