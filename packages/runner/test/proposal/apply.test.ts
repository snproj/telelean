/**
 * AT4.6 Accept through a REAL ModelWorkspace (real M1 core, disk TextSource/EditApplier, history on private refs) in a
 * scratch user repository: the user's hand edits made during the run are snapshotted first ("Manual edits"), then
 * the merged proposal is applied as ONE history entry of kind `accept-proposal` and one Undo step; a Lean refresh is
 * requested; the user's index, HEAD, branches, status outside the model folder, config and hooks are untouched
 * (M1's integration assertions). WP1's proposalLabel is faked; the real one is checked in its own block.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LeanFacts } from '@telelean/core';

import { createProposalService, type ProposalCore } from '../../src/proposal/index.js';
import type { RefreshRequest } from '../../src/semantic/types.js';
import { createModelWorkspace, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, copyMentalModel, fakeFacts, freshModules, makeTempDir, read, recordingApplier, sha256, userGit, waitFor, write, type RecordingApplier } from '../workspace/helpers.js';
import { edit, fakeDiff, fakeShadow, INBOX, MAIN, normativeState, SELECTION_ALL, USAGE } from './helpers.js';

const HOOKS = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'reference-transaction', 'post-index-change', 'post-checkout', 'post-rewrite', 'pre-auto-gc'];
const MODEL_DIR = 'models/my model';
const RATIONALE = 'rationale: known from gaming news';
const RATIONALE_EDITED = 'rationale: known from gaming news and the trailer';

/** Everything about the user's repository that Accept must not change (M1's history test, plan 10.4). */
function repoState(repo: string): Record<string, string> {
  const gitDir = path.join(repo, '.git');
  const index = path.join(gitDir, 'index');
  return {
    head: userGit(repo, 'rev-parse', 'HEAD'),
    symbolicHead: userGit(repo, 'symbolic-ref', 'HEAD'),
    otherRefs: userGit(repo, 'for-each-ref', '--format=%(refname) %(objectname)')
      .split('\n')
      .filter((l) => l !== '' && !l.startsWith('refs/telelean/'))
      .join('\n'),
    indexMtime: String(statSync(index).mtimeMs),
    indexHash: sha256(readFileSync(index)),
    config: readFileSync(path.join(gitDir, 'config'), 'utf8'),
    hooks: readdirSync(path.join(gitDir, 'hooks')).sort().join(','),
    status: userGit(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--', '.', `:(exclude)${MODEL_DIR}`),
  };
}

interface Setup {
  tmp: string;
  repo: string;
  root: string;
  markers: string;
  ws: ModelWorkspace;
  applier: RecordingApplier;
  refreshes: RefreshRequest[];
  before: Record<string, string>;
}

/** A user repository with a commit, a dirty tree, marker hooks, and the model root nested in it; the workspace loaded. */
async function setUp(label: string): Promise<Setup> {
  const tmp = makeTempDir(label);
  const repo = path.join(tmp, 'repo');
  const markers = path.join(tmp, 'hook-markers');
  mkdirSync(markers);
  mkdirSync(path.join(repo, 'models'), { recursive: true });
  const root = copyMentalModel(path.join(repo, 'models'), 'my model');
  userGit(repo, 'init', '-q', '-b', 'main');
  write(repo, 'README.md', 'user readme\n');
  write(repo, 'notes.txt', 'v1\n');
  userGit(repo, 'add', '-A');
  userGit(repo, 'commit', '-q', '-m', 'user commit');
  write(repo, 'notes.txt', 'v2 staged\n');
  userGit(repo, 'add', 'notes.txt');
  write(repo, 'README.md', 'user readme, edited\n');
  write(repo, 'untracked.txt', 'x\n');
  for (const hook of HOOKS) {
    const file = path.join(repo, '.git', 'hooks', hook);
    writeFileSync(file, `#!/bin/sh\necho ran >> "${markers}/${hook}"\n`);
    chmodSync(file, 0o755);
    execFileSync('sh', [file]); // positive control, run directly (never through git)
  }
  expect(readdirSync(markers).sort()).toEqual([...HOOKS].sort());
  for (const marker of readdirSync(markers)) rmSync(path.join(markers, marker));
  const before = repoState(repo);
  const applier = recordingApplier(root);
  const refreshes: RefreshRequest[] = [];
  const ws = createModelWorkspace({
    root,
    text: fsTextSource(root),
    applier,
    semantic: { enabled: true, debounceMs: 0 },
    refreshFacts: async (request): Promise<LeanFacts> => {
      refreshes.push(request);
      return fakeFacts('ok', { modules: freshModules(root) });
    },
    now: () => new Date('2026-11-01T12:00:00Z'),
  });
  await ws.load();
  return { tmp, repo, root, markers, ws, applier, refreshes, before };
}

/**
 * A run on the workspace as WP3 drives it: the base read through the M2 members, Claude's normative state in the
 * shadow, hand edits during the run (Inbox.lean, and new-spyro-pg's rationale in Main.lean, far from Claude's
 * changes), then build -> baseDrift -> planAccept -> apply.
 */
async function acceptRun(s: Setup, core: Partial<ProposalCore>) {
  const ws = s.ws;
  const base = new Map<string, string>();
  for (const rel of ws.modelFiles?.() ?? []) base.set(rel, (await ws.readText?.(rel)) ?? '');
  const shown = normativeState(base);
  const shadow = fakeShadow({ runDir: path.join(s.tmp, 'runs', 'r1'), root: s.root, base, current: shown });
  const service = createProposalService({ core });
  const proposal = await service.build({
    runId: 'r1',
    round: 1,
    proposalId: 'p1',
    selection: { ...SELECTION_ALL, premises: [...SELECTION_ALL.premises], adoptedGhosts: [] },
    shadow,
    check: { outcome: 'ok', g0: [], findings: [], diagnostics: [], durationMs: 1 },
    rendered: [],
    currentGraph: ws.graph('Spyro'),
    verdict: 'proved',
    finish: { status: 'proved', summary: 'Proved.', assumed_without_asking: [] },
    ghosts: [],
    gateAttempts: [],
    flaggedDefinitions: [],
    usage: USAGE,
    durationMs: 1,
    agentMs: 1,
    drift: [],
    graphVersion: 1,
  });
  // The user keeps working during the run (on disk, unknown to the workspace until Accept).
  const inboxEdited = `${read(s.root, INBOX)}-- an idea for later\n`;
  write(s.root, INBOX, inboxEdited);
  const mainEdited = edit(read(s.root, MAIN), RATIONALE, RATIONALE_EDITED);
  write(s.root, MAIN, mainEdited);
  const readReal = (rel: string) => ws.readText?.(rel) ?? Promise.resolve(null);
  const drift = await service.baseDrift(shadow, readReal, ws.modelFiles?.());
  const plan = await service.planAccept({ proposal, shadow, lifecycle: [], readReal, today: '2026-11-01', realFiles: ws.modelFiles?.() ?? [] });
  if (!plan.ok) throw new Error(`plan refused: ${JSON.stringify(plan)}`);
  const refreshesBefore = s.refreshes.length;
  const outcome = await service.apply(plan, ws, 'Spyro');
  return { base, shown, plan, drift, outcome, inboxEdited, mainEdited, refreshesBefore };
}

const FAKE_LABEL = 'These suffice → proved: (fake label)';

describe('AT4.6 apply on a real ModelWorkspace in a scratch git repository', () => {
  let setup: Setup | undefined;
  afterEach(() => {
    setup?.ws.dispose();
    if (setup) cleanup(setup.tmp);
    setup = undefined;
  });

  it('"Manual edits" first, one accept-proposal entry, one Undo restores every file, a refresh, the repository untouched', async () => {
    const s = (setup = await setUp('proposal-apply'));
    expect((await s.ws.historyStatus()).state).toBe('ready');
    expect((await s.ws.listHistory('Spyro')).entries.map((e) => e.label)).toEqual(['Initial state']);
    const run = await acceptRun(s, { diffGraphs: () => fakeDiff(), proposalLabel: () => FAKE_LABEL });

    expect(run.drift).toEqual([INBOX, MAIN]);
    expect(run.plan.drift).toEqual([INBOX, MAIN]);
    expect(run.outcome).toEqual({ ok: true, label: FAKE_LABEL, undoable: true });
    // The merged file (Claude's formalisation and proof + the user's rationale); the Inbox keeps the user's text.
    const merged = edit(run.shown.get(MAIN) ?? '', RATIONALE, RATIONALE_EDITED);
    expect(read(s.root, MAIN)).toBe(merged);
    expect(read(s.root, INBOX)).toBe(run.inboxEdited);
    expect(s.applier.calls).toEqual([{ label: FAKE_LABEL, changes: [{ path: MAIN, before: run.mainEdited, after: merged }] }]);

    // History: the hand edits were snapshotted first, then exactly one entry for the Accept.
    const history = await s.ws.listHistory('Spyro');
    expect(history.entries.map((e) => [e.action, e.label])).toEqual([
      ['accept-proposal', FAKE_LABEL],
      ['manual', 'Manual edits'],
      ['initial', 'Initial state'],
    ]);
    expect(history.entries[0]?.nodes).toEqual(['cynder-not-good', 'pg-no-dark-past']);
    const manual = await s.ws.historyDiff('Spyro', history.entries[1]?.id ?? '', 'parent');
    expect(manual.files.map((f) => [f.path, f.after])).toEqual([
      [INBOX, run.inboxEdited],
      [MAIN, run.mainEdited],
    ]);
    const accepted = await s.ws.historyDiff('Spyro', history.entries[0]?.id ?? '', 'parent');
    expect(accepted.files).toEqual([{ path: MAIN, before: run.mainEdited, after: merged }]);
    // Neither sidecar log nor anything else rode along.
    expect(accepted.files.some((f) => f.path.includes('attempts') || f.path.includes('decisions'))).toBe(false);

    // A Lean refresh of the real files was requested; the board shows the proposal's cards.
    await waitFor(() => s.refreshes.length > run.refreshesBefore);
    expect(s.ws.graph('Spyro').nodes.find((n) => n.id === 'pg-no-dark-past')?.lean.statement).toBe('Spyro.pg_no_dark_past');
    expect((await s.ws.workspaceState('Spyro')).undo).toBe(FAKE_LABEL);

    // One Undo restores every file the Accept changed (the user's own edits stay); Redo re-applies it.
    expect(await s.ws.undo('Spyro')).toEqual({ ok: true, label: `Undo: ${FAKE_LABEL}`, undoable: false });
    expect(read(s.root, MAIN)).toBe(run.mainEdited);
    expect(read(s.root, INBOX)).toBe(run.inboxEdited);
    expect((await s.ws.listHistory('Spyro')).entries[0]).toMatchObject({ action: 'undo', label: `Undo: ${FAKE_LABEL}` });
    expect((await s.ws.redo('Spyro')).ok).toBe(true);
    expect(read(s.root, MAIN)).toBe(merged);

    // The user's repository: index, HEAD, branches, status outside the model, config, hooks: untouched.
    expect(repoState(s.repo)).toEqual(s.before);
    expect(readdirSync(s.markers)).toEqual([]);
  });

  it('applyChanges refuses changes outside the model files and changes whose before no longer matches, writing nothing', async () => {
    const s = (setup = await setUp('proposal-apply-refusals'));
    const ws = s.ws;
    const main = read(s.root, MAIN);
    const apply = ws.applyChanges?.bind(ws);
    expect(apply).toBeTypeOf('function');
    if (!apply) return;
    expect(await apply({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: '.telelean/config.json', before: null, after: '{}' }] })).toMatchObject({
      ok: false,
      code: 'unsafe',
    });
    expect(await apply({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: '../outside.lean', before: null, after: 'x' }] })).toMatchObject({
      ok: false,
      code: 'unsafe',
    });
    expect(
      await apply({
        label: 'x',
        action: 'accept-proposal',
        subject: 'Spyro',
        nodes: [],
        changes: [
          { path: MAIN, before: main, after: `${main}-- a\n` },
          { path: MAIN, before: main, after: `${main}-- b\n` },
        ],
      }),
    ).toMatchObject({ ok: false, code: 'invalid' });
    expect(await apply({ label: 'x', action: 'accept-proposal', subject: '', nodes: [], changes: [] })).toMatchObject({ ok: false, code: 'invalid' });
    // The file changed between plan and apply: the applier's `before` check -> conflict, nothing recorded.
    expect(await apply({ label: 'x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: MAIN, before: `${main}-- stale`, after: 'y' }] })).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    // Nothing to write (an empty proposal): ok, not undoable, nothing recorded.
    expect(await apply({ label: 'These suffice → not proved: x', action: 'accept-proposal', subject: 'Spyro', nodes: [], changes: [{ path: MAIN, before: main, after: main }] })).toEqual({
      ok: true,
      label: 'These suffice → not proved: x',
      undoable: false,
    });
    expect(read(s.root, MAIN)).toBe(main);
    expect((await ws.workspaceState('Spyro')).undo).toBeNull();
    expect((await ws.listHistory('Spyro')).entries.map((e) => e.action)).toEqual(['initial']);
    expect(repoState(s.repo)).toEqual(s.before);
  });

  describe("WP1's proposalLabel", () => {
    it('the history entry carries the real label', async () => {
      const s = (setup = await setUp('proposal-apply-label'));
      const run = await acceptRun(s, { diffGraphs: () => fakeDiff() });
      const label = 'These suffice → proved: Cynder would not be a good addition to the new Spyro game';
      expect(run.outcome).toEqual({ ok: true, label, undoable: true });
      expect((await s.ws.listHistory('Spyro')).entries[0]).toMatchObject({ action: 'accept-proposal', label });
      expect(repoState(s.repo)).toEqual(s.before);
    });
  });
});
