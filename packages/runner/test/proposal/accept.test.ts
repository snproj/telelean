/**
 * AT4.4 baseDrift, AT4.5 planAccept, AT4.9 diffFiles and ProposalService.apply, with an in-memory shadow and fakes for
 * WP1's stubs (proposalLabel, lifecycleChanges). The merge is checked line by line around the 3 context lines of
 * docs/m2-plan.md section 7.1: a user's edit 3 lines from a change of Claude's is a conflict, 4 lines away merges.
 */
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ActionError,
  createUserNode,
  type ActionOutcome,
  type FileChange,
  type LeanFacts,
  type LifecycleItem,
  type ProjectModel,
  type ProposalView,
  type ReportCard,
} from '@telelean/core';

import { createProposalService, MERGE_CONTEXT_LINES, PROPOSAL_FACTS_FILE, type ProposalCore } from '../../src/proposal/index.js';
import type { ExternalChangeSet, ModelWorkspace } from '../../src/workspace/types.js';
import { cleanup, copyMentalModel, fakeFacts, makeTempDir, overlayTextSource, write } from '../workspace/helpers.js';
import { edit, fakeDiff, fakeShadow, INBOX, MAIN, normativeState, realReader, shadowFilesOnDisk, USAGE, VOCABULARY } from './helpers.js';

const L1: LifecycleItem = { id: 'l1', kind: 'change-kind', nodeId: 'cynder-not-good', from: 'GOAL', to: 'DERIVATION', recommended: true, reason: 'Lean proved it from the selected premises' };
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
  const target = createUserNode({ id: 'cynder-not-good', type: 'GOAL', naturalName: TARGET_SENTENCE, subject: 'Spyro' });
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
    lifecycle: [L1],
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
  const lifecycle: Array<{ model: ProjectModel; items: readonly LifecycleItem[] }> = [];
  const core: Partial<ProposalCore> = {
    diffGraphs: () => fakeDiff(),
    proposalLabel: (...args) => {
      labels.push(args);
      return `label(${args[0]}, ${args[1]}, +${args[2].lifecycle} lifecycle, +${args[2].adoptedGhosts} adopted)`;
    },
    lifecycleChanges: (model, items) => {
      lifecycle.push({ model, items });
      const before = model.files.get(MAIN)?.text ?? '';
      return items.length === 0 ? [] : [{ path: MAIN, before, after: edit(before, 'id: cynder-not-good\ntype: GOAL\n', 'id: cynder-not-good\ntype: DERIVATION\n') }];
    },
  };
  return { core, labels, lifecycle };
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
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(new Map(base)), today: '2026-11-01', realFiles: [...base.keys()] });
      expect(plan).toEqual({
        ok: true,
        changes: [{ path: MAIN, before: base.get(MAIN), after: shown.get(MAIN) }],
        label: `label(proved, ${TARGET_SENTENCE}, +0 lifecycle, +0 adopted)`,
        nodes: ['cynder-not-good'],
        drift: [],
        shadowState: shown,
      });
      expect(labels).toEqual([['proved', TARGET_SENTENCE, { lifecycle: 0, adoptedGhosts: 0 }]]);
    });

    it(`drift more than ${MERGE_CONTEXT_LINES} lines from every change of Claude's merges; files only the user changed keep their text`, async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const baseFiles = new Map([...base, [MAIN, lines()]]);
      const shadow = fakeShadow({ runDir: runDir(), root, base: baseFiles, current: new Map([...baseFiles, [MAIN, lines({ 20: '-- line 20, by Claude' })]]) });
      for (const k of [10, 16, 24, 40]) {
        const real = new Map<string, string | null>([...baseFiles, [MAIN, lines({ [k]: `-- line ${k}, by the user` })], [INBOX, `${base.get(INBOX) ?? ''}-- mine\n`]]);
        const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(real), today: '2026-11-01', realFiles: [...baseFiles.keys()] });
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
        const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(real), today: '2026-11-01', realFiles: [...baseFiles.keys()] });
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
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(new Map([...base, [MAIN, realMain]])), today: '2026-11-01' });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      expect(plan.changes).toEqual([
        { path: MAIN, before: realMain, after: edit(shown.get(MAIN) ?? '', 'rationale: known from gaming news', 'rationale: known from gaming news and the trailer') },
      ]);
      // An edit of the user's inside pg-no-dark-past's block (which normalisation pinned) overlaps: conflict.
      const inBlock = edit(base.get(MAIN) ?? '', 'stance: rule\n', 'stance: believe\n');
      const conflict = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(new Map([...base, [MAIN, inBlock]])), today: '2026-11-01' });
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
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(real), today: '2026-11-01', realFiles: [...base.keys(), mine].filter((r) => r !== INBOX) });
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
      const gone = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(new Map([...base, [MAIN, null]])), today: '2026-11-01', realFiles: [] });
      expect(gone).toMatchObject({ ok: false, code: 'conflict', files: [MAIN] });
    });

    it('without realFiles the model root on disk is listed, so a user-added file is still kept', async () => {
      const { core } = fakes();
      const service = createProposalService({ core });
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      write(root, 'Model/Spyro/Mine.lean', 'namespace Spyro\nend Spyro\n');
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: overlayTextSource(root).read, today: '2026-11-01' });
      expect(plan.ok && plan.shadowState.get('Model/Spyro/Mine.lean')).toBe('namespace Spyro\nend Spyro\n');
      expect(plan.ok && plan.drift).toEqual(['Model/Spyro/Mine.lean']);
    });

    it('an unknown lifecycle id is not-found; nothing else is planned', async () => {
      const { core, lifecycle } = fakes();
      const service = createProposalService({ core });
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: ['l1', 'l9'], readReal: realReader(new Map(base)), today: '2026-11-01' });
      expect(plan).toEqual({ ok: false, code: 'not-found', error: 'l9 is not a lifecycle item of this proposal.' });
      expect(lifecycle).toEqual([]);
    });

    it('ticked lifecycle items are applied on top of the merged files (with the facts given), not in shadowState', async () => {
      const { core, lifecycle, labels } = fakes();
      const service = createProposalService({ core });
      const shown = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const facts = fakeFacts('ok');
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: ['l1'], readReal: realReader(new Map(base)), today: '2026-11-01', facts });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      const after = edit(shown.get(MAIN) ?? '', 'id: cynder-not-good\ntype: GOAL\n', 'id: cynder-not-good\ntype: DERIVATION\n');
      expect(plan.changes).toEqual([{ path: MAIN, before: base.get(MAIN), after }]);
      expect(plan.shadowState.get(MAIN)).toBe(shown.get(MAIN));
      expect(lifecycle).toHaveLength(1);
      expect(lifecycle[0]?.items).toEqual([L1]);
      expect(lifecycle[0]?.model.facts).toBe(facts);
      expect(lifecycle[0]?.model.files.get(MAIN)?.text).toBe(shown.get(MAIN));
      expect(labels.at(-1)).toEqual(['proved', TARGET_SENTENCE, { lifecycle: 1, adoptedGhosts: 0 }]);
    });

    it("a lifecycle item that no longer applies refuses the whole plan (core's ActionError, or a change that does not fit)", async () => {
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: normativeState(base) });
      const request = { proposal: proposal(), shadow, lifecycle: ['l1'], readReal: realReader(new Map(base)), today: '2026-11-01' };
      const refused = createProposalService({
        core: {
          ...fakes().core,
          lifecycleChanges: () => {
            throw new ActionError('unsafe', 'Cynder would not be a good addition… is no longer proved.');
          },
        },
      });
      expect(await refused.planAccept(request)).toEqual({ ok: false, code: 'unsafe', error: 'Cynder would not be a good addition… is no longer proved.' });
      const misfit = createProposalService({ core: { ...fakes().core, lifecycleChanges: () => [{ path: MAIN, before: 'something else', after: 'x' }] } });
      expect(await misfit.planAccept(request)).toMatchObject({ ok: false, code: 'unsafe' });
    });

    it('with shownState (after a passing re-gate): after = exactly those files (+ lifecycle), before = the real files', async () => {
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
      const plan = await service.planAccept({ proposal: proposal(), shadow, lifecycle: ['l1'], readReal: realReader(real), today: '2026-11-01', shownState: regated, facts: fakeFacts('ok') });
      expect(plan.ok, JSON.stringify(plan)).toBe(true);
      if (!plan.ok) return;
      expect(plan.changes).toEqual([
        { path: MAIN, before: realMain, after: edit(regated.get(MAIN) ?? '', 'id: cynder-not-good\ntype: GOAL\n', 'id: cynder-not-good\ntype: DERIVATION\n') },
      ]);
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
      const kept = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(typed), today: '2026-11-01', shownState: regated });
      expect(kept.ok && kept.changes).toEqual([{ path: MAIN, before: base.get(MAIN), after: shown.get(MAIN) }]);
      // … and in Main.lean, which the re-gated state changes: refused, nothing lost.
      const raced = new Map<string, string | null>([...base, [MAIN, `${base.get(MAIN) ?? ''}-- typed\n`]]);
      const refused = await service.planAccept({ proposal: proposal(), shadow, lifecycle: [], readReal: realReader(raced), today: '2026-11-01', shownState: regated });
      expect(refused).toEqual({
        ok: false,
        code: 'conflict',
        error: `You changed ${MAIN} while telelean re-checked the proposal; press Accept again to include your edits.`,
        files: [MAIN],
      });
    });

    it('the label counts adopted ghosts; nodes = target, reviewed statements, adopted cards and lifecycle cards', async () => {
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
      const plan = await service.planAccept({ proposal: p, shadow, lifecycle: ['l1'], readReal: realReader(new Map(base)), today: '2026-11-01', facts: fakeFacts('ok') });
      expect(plan.ok && plan.nodes).toEqual(['cynder-not-good', 'pg-no-dark-past', 'a-character-who-cannot-be-in']);
      expect(labels.at(-1)).toEqual(['proved', TARGET_SENTENCE, { lifecycle: 1, adoptedGhosts: 1 }]);
    });

    it('the facts build kept come back for Accept, also in a new service after a window reload', async () => {
      const shown = normativeState(base);
      const shadow = fakeShadow({ runDir: runDir(), root, base, current: shown });
      const facts: LeanFacts = { ...fakeFacts('ok'), finishedAt: '2026-11-01T11:11:11.000Z' };
      const first = fakes();
      const service = createProposalService({ core: first.core });
      const built = await service.build({
        runId: 'r1',
        round: 1,
        proposalId: 'p7',
        selection: { subject: 'Spyro', target: 'cynder-not-good', premises: [], adoptedGhosts: [] },
        shadow,
        check: { outcome: 'ok', g0: [], findings: [], diagnostics: [], facts, durationMs: 1 },
        rendered: [],
        currentGraph: proposal().graph,
        verdict: 'not-proved',
        ghosts: [],
        gateAttempts: [],
        flaggedDefinitions: [],
        usage: USAGE,
        durationMs: 1,
        agentMs: 1,
        drift: [],
        graphVersion: 9,
      });
      const p = { ...built, lifecycle: [L1] }; // as if the target were proved
      const request = { proposal: p, shadow, lifecycle: ['l1'], readReal: realReader(new Map(base)), today: '2026-11-01' };
      expect((await service.planAccept(request)).ok).toBe(true);
      expect(first.lifecycle[0]?.model.facts).toEqual(facts);
      const reloaded = fakes();
      expect((await createProposalService({ core: reloaded.core }).planAccept(request)).ok).toBe(true);
      expect(reloaded.lifecycle[0]?.model.facts).toEqual(facts);
      // Another proposal id: the kept facts are not used for it.
      const other = fakes();
      await createProposalService({ core: other.core }).planAccept({ ...request, proposal: { ...p, proposalId: 'p8' } });
      expect(other.lifecycle[0]?.model.facts).toBeUndefined();
      expect(path.basename(PROPOSAL_FACTS_FILE)).toBe('proposal-facts.json');
    });
  });

  describe('the report card from the proposed board (faked subjectGraph)', () => {
    /** A build whose proposed board is `target` (status as given) plus `edges`, on the Spyro files without facts. */
    async function reportFor(proof: ProposalView['graph']['nodes'][number]['status']['proof'], premises: string[], verdict: ReportCard['verdict'], edges: ProposalView['graph']['edges'] = []) {
      const target = createUserNode({ id: 'cynder-not-good', type: 'GOAL', naturalName: TARGET_SENTENCE, subject: 'Spyro' });
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
      expect(built.lifecycle.map((l) => l.id)).toEqual(['l1']);
      const hidden = await reportFor({ kind: 'proved', footprint: ['axiom:Spyro.shortcut'] }, [], 'proved');
      expect(hidden.report.selfEvident).toBe(false);
    });

    it('a premise used through a proved derivation (verified edge) is not unused; one the proof ignores is', async () => {
      const built = await reportFor({ kind: 'proved', footprint: ['cynder-dark-past'] }, ['cynder-dark-past', 'a-derivation', 'new-spyro-pg'], 'proved', [
        { id: 'verified:a-derivation->cynder-not-good', type: 'verified', source: 'a-derivation', target: 'cynder-not-good', origin: 'lean', where: 'proof' },
      ]);
      expect(built.report.unusedPremises).toEqual(['new-spyro-pg']);
      expect(built.report.selfEvident).toBe(false);
    });

    it('not proved, gave up (reverted): no footprint, no unused premises, no lifecycle item; the revert is reported', async () => {
      const built = await reportFor({ kind: 'proved', footprint: ['cynder-dark-past'] }, ['cynder-dark-past'], 'gave-up');
      expect(built.report).toMatchObject({ verdict: 'gave-up', footprint: [], unusedPremises: [], selfEvident: false, reverted: { toCommit: 'c1', label: 'Statements frozen (round 1)', reason: 'gave up' } });
      expect(built.lifecycle).toEqual([]);
      const conditional = await reportFor({ kind: 'conditional', on: ['new-spyro-pg'], footprint: [] }, ['cynder-dark-past'], 'proved');
      expect(conditional.report.footprint).toEqual([]);
      expect(conditional.lifecycle).toEqual([]);
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
});
