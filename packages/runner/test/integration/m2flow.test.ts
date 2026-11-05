/**
 * The integrator's M2 flow test (docs/m2-plan.md section 11 step 4): whole runs on a scratch copy of mental_model/
 * inside a user's own git repository, through the REAL ModelWorkspace (fs adapters, git history under private refs),
 * RunManager (FakeBackend playing test-fixtures/walkthrough/), Lean check engine (sandboxed Lean), proposal service
 * and sidecar store. No Claude: TELELEAN_NO_REAL_CLAUDE=1 (vitest config) and the FakeBackend only.
 *
 *   (a) normative: Accept, Undo, Redo, then a History revert of the Accept (itself undoable)
 *   (b) literal: the ghost adopted, re-frozen and proved; Accept writes the card worded by Claude
 *   (c) Accept after drift: the user's own edit to new-spyro-pg's reason, more than 3 lines from every change of
 *       Claude's, is rebased, re-checked as part of B and kept; an edit of theirs inside pg-no-dark-past's block
 *       (which telelean's normalisation pinned) is refused as a conflict and the proposal stays open
 *   (d) a start that declares new premises (one M1 history entry, in the run's base) and a start refused by
 *       preflight (nothing declared, nothing created)
 *   (e) recovery from run.json with a pending question: a new RunManager shows it and starts no session; the answer
 *       resumes the session (--resume) and the run finishes
 * Always: the user's HEAD, index, branches, config, hooks and status outside the model stay as they were, and no
 * telelean-<runId>-* unit is left.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { RunView } from '@telelean/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createLeanCheckEngine } from '../../src/gate/index.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript, type FakeScriptPlayer, type FakeScriptTurn } from '../../src/llm/fakeScripts.js';
import type { BackendCaps, LlmBackend, LlmSession, SessionConfig } from '../../src/llm/types.js';
import { createProposalService, createRunSidecarStore } from '../../src/proposal/index.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, type RunManager } from '../../src/run/index.js';
import { listRunDirs, openRunShadow } from '../../src/shadow/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, makeTempDir, MENTAL_MODEL } from '../run/helpers/env.js';
import { loadWalkthrough, waitForRun } from '../run/helpers/harness.js';

const MAIN = 'Model/Spyro/Main.lean';
const VOCABULARY = 'Model/Spyro/Vocabulary.lean';
const TARGET = 'cynder-not-good';
const ALL = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
const MODEL_DIR = 'model';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) cleanup(d);
});

function userGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test-user@example.invalid',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test-user@example.invalid',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });
}

/** What telelean must never touch in the user's repository (refs/telelean/* are its private history). */
function repoState(repo: string): Record<string, string> {
  const gitDir = path.join(repo, '.git');
  return {
    head: userGit(repo, 'rev-parse', 'HEAD'),
    symbolicHead: userGit(repo, 'symbolic-ref', 'HEAD'),
    otherRefs: userGit(repo, 'for-each-ref', '--format=%(refname) %(objectname)')
      .split('\n')
      .filter((l) => l !== '' && !l.startsWith('refs/telelean/'))
      .join('\n'),
    index: createHash('sha256').update(readFileSync(path.join(gitDir, 'index'))).digest('hex'),
    config: readFileSync(path.join(gitDir, 'config'), 'utf8'),
    hooks: readdirSync(path.join(gitDir, 'hooks')).sort().join(','),
    status: userGit(repo, 'status', '--porcelain=v1', '--untracked-files=all', '--', '.', `:(exclude)${MODEL_DIR}`),
  };
}

function noLeftoverUnits(runId: string): void {
  let out = '';
  try {
    out = execFileSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', `telelean-${runId}-*`], { encoding: 'utf8' });
  } catch {
    return; // no user manager here: nothing to check
  }
  expect(out.trim()).toBe('');
}

/** A backend around one FakeBackend script that records every session it starts (a resumed one too). */
class RecordingFake implements LlmBackend {
  readonly id = 'fake' as const;
  readonly caps: BackendCaps = { builtinFileTools: true, subscriptionAuth: false, resume: true, interrupt: true };
  readonly sessions: SessionConfig[] = [];
  private readonly fake: FakeBackend;
  constructor(readonly player: FakeScriptPlayer) {
    this.fake = new FakeBackend(player.script);
  }
  async startSession(cfg: SessionConfig): Promise<LlmSession> {
    this.sessions.push(cfg);
    return this.fake.startSession(cfg);
  }
}

interface Flow {
  tmp: string;
  repo: string;
  root: string;
  runsDir: string;
  workspace: ModelWorkspace;
  backend: RecordingFake;
  manager: RunManager;
  before: Record<string, string>;
  runIds: string[];
}

/** A user's repository (one commit, a staged change, an untracked file) holding a copy of the sample model. */
async function setupFlow(label: string, turns: FakeScriptTurn[]): Promise<Flow> {
  const tmp = makeTempDir(`m2flow-${label}`);
  dirs.push(tmp);
  const repo = path.join(tmp, 'repo');
  const root = path.join(repo, MODEL_DIR);
  cpSync(MENTAL_MODEL, root, { recursive: true, filter: (src) => !path.relative(MENTAL_MODEL, src).split(path.sep).some((p) => p === '.lake' || p === '.git' || p === 'graph.json') });
  userGit(repo, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(repo, 'README.md'), 'my notes\n');
  writeFileSync(path.join(repo, 'staged.txt'), 'v1\n');
  userGit(repo, 'add', 'README.md', 'staged.txt');
  userGit(repo, 'commit', '-q', '-m', 'the user own commit');
  writeFileSync(path.join(repo, 'staged.txt'), 'v2\n');
  userGit(repo, 'add', 'staged.txt');
  writeFileSync(path.join(repo, 'untracked.txt'), 'x\n');
  const before = repoState(repo);
  const workspace = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { debounceMs: 60_000 } });
  await workspace.load();
  await workspace.refreshNow();
  const backend = new RecordingFake(playFakeScript(turns));
  const runsDir = path.join(tmp, 'runs');
  const manager = newManager(root, runsDir, workspace, backend);
  return { tmp, repo, root, runsDir, workspace, backend, manager, before, runIds: [] };
}

function newManager(root: string, runsDir: string, workspace: ModelWorkspace, backend: LlmBackend): RunManager {
  return createRunManager({
    root,
    runsDir,
    workspace,
    services: { backend, engine: createLeanCheckEngine(), proposals: createProposalService(), sidecars: createRunSidecarStore() },
    settings: DEFAULT_RUN_SETTINGS,
  });
}

const read = (f: Flow, rel: string): string => readFileSync(path.join(f.root, rel), 'utf8');
const writeReal = async (f: Flow, rel: string, text: string): Promise<void> => {
  writeFileSync(path.join(f.root, rel), text);
  await f.workspace.invalidate([rel]); // as the extension's file watcher does
};

/** Starts a run with `premises` and answers its question (if it asks) with `option`; resolves at the end of round 1. */
async function round1(f: Flow, option: number, premises: string[] = ALL): Promise<RunView> {
  const started = await f.manager.start({ subject: 'Spyro', target: TARGET, premises });
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
  const first = await waitForRun(f.manager, (v) => v.state === 'waiting-for-answer' || v.state === 'review' || v.state === 'failed', 240_000, 'the question or the end of round 1');
  f.runIds.push(first.runId);
  if (first.state === 'waiting-for-answer') {
    const answered = await f.manager.answer(first.runId, first.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option }, scope: 'run' }]);
    expect(answered, JSON.stringify(answered)).toMatchObject({ ok: true });
  }
  return waitForRun(f.manager, (v) => v.state === 'review' || v.state === 'failed', 300_000, 'the end of round 1');
}

async function finishFlow(f: Flow): Promise<void> {
  await f.manager.dispose();
  f.workspace.dispose();
  expect(repoState(f.repo)).toEqual(f.before);
  for (const runId of f.runIds) noLeftoverUnits(runId);
}

async function runDirOf(f: Flow, runId: string): Promise<string> {
  const found = (await listRunDirs(f.runsDir, f.root)).find((d) => d.runId === runId);
  if (found === undefined) throw new Error(`no run directory for ${runId}`);
  return found.runDir;
}

const normative = (): FakeScriptTurn[] => loadWalkthrough('normative').turns;

describe('M2 flows end to end (real workspace, engine, proposals, git; FakeBackend)', () => {
  it('(a) normative: Accept, Undo, Redo; a History revert of the Accept restores the files and can itself be undone', async () => {
    const f = await setupFlow('normative', normative());
    const original = { main: read(f, MAIN), vocabulary: read(f, VOCABULARY) };
    const review = await round1(f, 0);
    expect(review.verdict, JSON.stringify(review.notices)).toBe('proved');
    expect(read(f, MAIN)).toBe(original.main); // nothing before Accept
    const proposal = f.manager.proposal();
    expect(proposal?.lifecycle.map((l) => l.id)).toEqual(['l1']);
    const accepted = await f.manager.accept(review.runId, proposal?.proposalId ?? '', ['l1'], []);
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true, undoable: true });
    const afterAccept = read(f, MAIN);
    expect(afterAccept).toContain('lean: Spyro.pg_no_dark_past');
    expect(afterAccept).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(afterAccept).toMatch(/id: cynder-not-good\ntype: DERIVATION\n/);

    const listing = await f.workspace.listHistory('Spyro');
    expect(listing.entries[0]).toMatchObject({ action: 'accept-proposal' });
    expect(listing.entries[0]?.label).toMatch(/^These suffice → proved: Cynder would not be a good addition/);
    expect(listing.entries.filter((e) => e.action === 'accept-proposal')).toHaveLength(1);

    expect(await f.workspace.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(original.main);
    expect(await f.workspace.redo('Spyro')).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(afterAccept);

    // History: revert to the state before the Accept (the subject's first snapshot), then undo the revert.
    const entries = (await f.workspace.listHistory('Spyro')).entries;
    const initial = entries.find((e) => e.action === 'initial');
    expect(initial, JSON.stringify(entries.map((e) => e.action))).toBeDefined();
    expect(await f.workspace.revert('Spyro', initial?.id ?? '')).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(original.main);
    expect(read(f, VOCABULARY)).toBe(original.vocabulary);
    expect(await f.workspace.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(afterAccept);
    await finishFlow(f);
  });

  it('(b) literal: not proved with a ghost; adopted, re-frozen and proved; Accept writes the card worded by Claude', async () => {
    const f = await setupFlow('literal', loadWalkthrough('literal').turns);
    const r1 = await round1(f, 1);
    expect(r1.verdict, JSON.stringify(r1.notices)).toBe('not-proved');
    expect(r1.ghosts.map((g) => [g.id, g.state, g.closesGap, g.aloneEntails])).toEqual([['ghost-1', 'suggested', true, false]]);
    expect(await f.manager.adoptGhost(r1.runId, 'ghost-1', 'it seems obvious to me')).toMatchObject({ ok: true });
    const frozen = await waitForRun(f.manager, (v) => v.round === 2 && v.frozen?.round === 2, 60_000, 'the re-freeze');
    expect(frozen.frozen?.permitted.selected).toContain('Spyro.not_in_game_not_good.holds');
    const r2 = await waitForRun(f.manager, (v) => v.round === 2 && (v.state === 'review' || v.state === 'failed'), 300_000, 'round 2');
    expect(r2.verdict, JSON.stringify(r2.notices)).toBe('proved');
    const proposal = f.manager.proposal();
    expect(proposal?.report.footprint).toContain('a-character-who-cannot-be-in');
    const accepted = await f.manager.accept(r2.runId, proposal?.proposalId ?? '', proposal?.lifecycle.map((l) => l.id) ?? [], proposal?.definitions.map((d) => d.id) ?? []);
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
    const main = read(f, MAIN);
    expect(main).toContain('natural_name: A character who cannot be in a game would not be a good addition to it\n');
    expect(main).toContain('worded_by: agent\n');
    expect(main).toContain(`session: ${r2.runId}\n`);
    expect(main).toContain('rationale: it seems obvious to me\n');
    expect(read(f, VOCABULARY)).toContain('axiom InGame : Character → Game → Prop');
    expect((await f.workspace.listHistory('Spyro')).entries[0]?.label).toMatch(/^These suffice → proved/);
    // Fixer round 1: the adopted card is declared on the goal, so the refreshed board has no TL107 and no mismatch.
    expect(main).toContain('premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in\n');
    await f.workspace.refreshNow();
    const graph = f.workspace.graph('Spyro');
    expect(graph.diagnostics.filter((d) => d.code === 'TL107')).toEqual([]);
    expect(graph.edges.filter((e) => e.mismatch !== undefined)).toEqual([]);
    await finishFlow(f);
  });

  it("(c) Accept after drift: a far edit of the user's is rebased, re-checked as part of B and kept; an overlapping one is a conflict", async () => {
    const f = await setupFlow('drift', [...normative(), ...normative()]);
    const original = read(f, MAIN);
    // Run 1: while the proposal waits, the user edits new-spyro-pg's reason (far from every change of Claude's).
    const review = await round1(f, 0);
    expect(review.verdict, JSON.stringify(review.notices)).toBe('proved');
    const edited = original.replace('rationale: known from gaming news\n', 'rationale: known from the official gaming news\n');
    expect(edited).not.toBe(original);
    await writeReal(f, MAIN, edited);
    const proposal = f.manager.proposal();
    const accepted = await f.manager.accept(review.runId, proposal?.proposalId ?? '', ['l1'], []);
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
    const main = read(f, MAIN);
    expect(main).toContain('rationale: known from the official gaming news\n'); // the user's edit is kept
    expect(main).toContain('lean: Spyro.pg_no_dark_past');
    expect(main).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(main).toMatch(/id: cynder-not-good\ntype: DERIVATION\n/);
    // The shadow rebased: the user's files at Accept (accept-base, B of the re-check), then Claude's changes on them.
    const shadow = await openRunShadow(await runDirOf(f, review.runId), { root: f.root, library: 'Model' });
    const kinds = (await shadow.commits()).map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['accept-base', 'rebase']));
    const acceptBase = (await shadow.commits()).find((c) => c.kind === 'accept-base');
    expect((await shadow.filesAt(acceptBase?.id ?? '')).get(MAIN)).toBe(edited);
    // Undo reverts telelean's Accept only; the user's edit stays.
    expect(await f.workspace.undo('Spyro')).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(edited);
    expect(await f.manager.dismiss(review.runId)).toMatchObject({ ok: true });

    // Run 2: the user edits inside pg-no-dark-past's block, next to the pin telelean's normalisation added.
    const review2 = await round1(f, 0);
    expect(review2.verdict, JSON.stringify(review2.notices)).toBe('proved');
    const overlapping = edited.replace('natural_name: PG games cannot have characters with dark pasts\nstance: rule\n', 'natural_name: PG games cannot have characters with dark pasts\nstance: believe\n');
    expect(overlapping).not.toBe(edited);
    await writeReal(f, MAIN, overlapping);
    const proposal2 = f.manager.proposal();
    const refused = await f.manager.accept(review2.runId, proposal2?.proposalId ?? '', ['l1'], []);
    expect(refused).toMatchObject({ ok: false, code: 'conflict' });
    expect(refused.ok ? '' : refused.error).toMatch(/Model\/Spyro\/Main\.lean/);
    expect(read(f, MAIN)).toBe(overlapping); // nothing applied
    expect(f.manager.current()?.state).toBe('review'); // the proposal stays open (Feedback can redo it)
    expect(f.manager.proposal()?.proposalId).toBe(proposal2?.proposalId);
    expect(await f.manager.discard(review2.runId)).toMatchObject({ ok: true });
    expect(read(f, MAIN)).toBe(overlapping);
    await finishFlow(f);
  });

  it('(d) a start that declares new premises records one M1 history entry in the run’s base; a start refused by preflight declares nothing', async () => {
    const quick: FakeScriptTurn[] = [
      {
        match: 'Run: "These suffice"',
        steps: [
          { kind: 'callTool', tool: 'finish', args: { status: 'not_proved', summary: 'Without the PG premise the goal does not follow.', gap: 'Nothing says the new game is PG.', assumed_without_asking: [] } },
          { kind: 'result' },
        ],
      },
    ];
    const f = await setupFlow('premises', quick);
    const historyBefore = (await f.workspace.listHistory('Spyro')).entries.length;
    const review = await round1(f, 0, ['cynder-dark-past', 'pg-no-dark-past']);
    expect(review.verdict, JSON.stringify(review.notices)).toBe('not-proved');
    const main = read(f, MAIN);
    expect(main).toContain('premises: cynder-dark-past, pg-no-dark-past\n');
    const entries = (await f.workspace.listHistory('Spyro')).entries;
    expect(entries).toHaveLength(historyBefore + 1);
    expect(entries[0]).toMatchObject({ action: 'set-premises' });
    // The declaration is in the run's base: the shadow started from the declared files.
    const shadow = await openRunShadow(await runDirOf(f, review.runId), { root: f.root, library: 'Model' });
    const base = (await shadow.commits()).find((c) => c.kind === 'base');
    expect((await shadow.filesAt(base?.id ?? '')).get(MAIN)).toBe(main);
    expect(await f.manager.discard(review.runId)).toMatchObject({ ok: true });

    // Preflight refuses an ASSUMPTION as the target: nothing is declared, no run directory is made.
    const runDirsBefore = (await listRunDirs(f.runsDir, f.root)).length;
    const refused = await f.manager.start({ subject: 'Spyro', target: 'cynder-dark-past', premises: ['new-spyro-pg'] });
    expect(refused).toMatchObject({ ok: false, code: 'not-yet' });
    expect(read(f, MAIN)).toBe(main);
    expect((await f.workspace.listHistory('Spyro')).entries).toHaveLength(historyBefore + 1);
    expect(await listRunDirs(f.runsDir, f.root)).toHaveLength(runDirsBefore);
    expect(f.backend.sessions).toHaveLength(1);
    await finishFlow(f);
  });

  it('(e) recovery from run.json: a new RunManager shows the pending question and starts no session; the answer resumes it', async () => {
    const steps = normative()[0]?.steps ?? [];
    const ask = steps.findIndex((s) => s.kind === 'callTool' && s.tool === 'ask_user');
    expect(ask).toBeGreaterThan(0);
    const f = await setupFlow('recovery', [
      { match: 'Run: "These suffice"', steps: steps.slice(0, ask + 1) },
      { match: 'Here are the answers to it', steps: steps.slice(ask + 1) },
    ]);
    const started = await f.manager.start({ subject: 'Spyro', target: TARGET, premises: ALL });
    expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
    const waiting = await waitForRun(f.manager, (v) => v.state === 'waiting-for-answer' || v.state === 'failed', 240_000, 'the question');
    expect(waiting.state, JSON.stringify(waiting.notices)).toBe('waiting-for-answer');
    f.runIds.push(waiting.runId);
    await f.manager.dispose(); // the window closes
    const persisted = JSON.parse(readFileSync(path.join(await runDirOf(f, waiting.runId), 'run.json'), 'utf8')) as { view: RunView };
    expect(persisted.view.state).toBe('waiting-for-answer');
    expect(JSON.stringify(persisted.view)).not.toContain('claudesGuess'); // the guess stays out of the view (D-20)

    f.manager = newManager(f.root, f.runsDir, f.workspace, f.backend); // the next window
    await f.manager.recover();
    const restored = f.manager.current();
    expect(restored).toMatchObject({ runId: waiting.runId, state: 'waiting-for-answer' });
    expect(restored?.pendingQuestions?.id).toBe(waiting.pendingQuestions?.id);
    expect(f.backend.sessions).toHaveLength(1); // recovery never starts a session by itself
    const answered = await f.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option: 0 }, scope: 'run' }]);
    expect(answered, JSON.stringify(answered)).toMatchObject({ ok: true });
    const review = await waitForRun(f.manager, (v) => v.state === 'review' || v.state === 'failed', 300_000, 'the end of the resumed round');
    expect(review.verdict, JSON.stringify(review.notices)).toBe('proved');
    expect(f.backend.sessions).toHaveLength(2);
    expect(f.backend.sessions[1]?.resumeSessionId).toBe(f.backend.sessions[0]?.sessionId);
    expect(f.backend.player.remaining()).toBe(0);
    // The decision was recorded when the user answered (after the reload).
    const decisions = JSON.parse(readFileSync(path.join(f.root, '.telelean', 'subjects', 'Spyro', 'decisions.json'), 'utf8')) as { decisions: Array<{ run: string; answerText: string }> };
    expect(decisions.decisions.map((d) => [d.run, d.answerText])).toEqual([[waiting.runId, 'A rule (normative)']]);
    expect(await f.manager.discard(review.runId)).toMatchObject({ ok: true });
    expect(existsSync(path.join(f.root, '.telelean', 'subjects', 'Spyro', 'attempts.jsonl'))).toBe(true);
    expect(statSync(path.join(f.root, MAIN)).isFile()).toBe(true);
    await finishFlow(f);
  });
});
