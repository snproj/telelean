/**
 * AT3.14 and AT3.15 (docs/m2-plan.md sections 10.2 and 10.3): the walkthrough and the cheating
 * scripts end to end, with the FakeBackend playing test-fixtures/walkthrough/*.json against the REAL engine (sandboxed
 * Lean), shadow, proposal service and sidecar store, and an fs-backed ModelWorkspace on a scratch git copy of
 * mental_model/. Real Lean: one job at a time (vitest runs files sequentially), LEAN_NUM_THREADS=4 (runLean).
 *   AT3.14a normative -> proved -> G->D -> Accept: the files gain the pinned formalisation, the proof and
 *           `type: DERIVATION`; the real model files are untouched before Accept; one history entry; Undo restores;
 *           attempts.jsonl says accepted
 *   AT3.14b literal -> not proved + ghost -> adopt -> re-freeze -> proved -> Accept; the adopted card is worded_by agent
 *   AT3.15  each cheating script shows its notice and the scripted retry (which replaces the cheat) passes; the
 *           give-up script reverts; fixer round 1 adds an axiom below a selected GOAL premise (freeze refused; a
 *           belief after the freeze), a run-written proof of a selected DERIVATION premise resting on an unselected
 *           assumption, and a private lemma (no Lean facts: fails closed); fixer round 2 adds proofs carried by
 *           declarations that are not theorems (a `PLift` def, an `Inhabited` instance, a structure field default)
 *           resting on an assumption that is not selected, in a not-proved and in a proved round; fixer round 3 adds
 *           an `example` resting on an unselected assumption, before the freeze and after it, never written by Accept
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseAttemptLines, type RunView } from '@telelean/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createLeanCheckEngine } from '../../src/gate/index.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript } from '../../src/llm/fakeScripts.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { createProposalService, createRunSidecarStore } from '../../src/proposal/index.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, gateCheckOf, type RunManager } from '../../src/run/index.js';
import { listRunDirs } from '../../src/shadow/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, makeTempDir, MENTAL_MODEL } from './helpers/env.js';
import { loadWalkthrough, waitForRun } from './helpers/harness.js';

const MAIN = 'Model/Spyro/Main.lean';
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) cleanup(d);
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test-user@example.invalid',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test-user@example.invalid',
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });
}

/** Model files only (the user's Lean): what must stay untouched until Accept. */
function modelTree(root: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(path.join(root, rel))) {
    if (name.startsWith('.')) continue;
    const child = rel === '' ? name : `${rel}/${name}`;
    if (statSync(path.join(root, child)).isDirectory()) Object.assign(out, modelTree(root, child));
    else out[child] = readFileSync(path.join(root, child), 'utf8');
  }
  return out;
}

interface Walk {
  dir: string;
  root: string;
  workspace: ModelWorkspace;
  manager: RunManager;
  play: ReturnType<typeof playFakeScript>;
  file: ReturnType<typeof loadWalkthrough>;
  runsDir: string;
}

async function setup(name: string): Promise<Walk> {
  const file = loadWalkthrough(name);
  const dir = makeTempDir(`walk-${name}`);
  dirs.push(dir);
  const root = path.join(dir, 'model');
  cpSync(MENTAL_MODEL, root, { recursive: true, filter: (src) => !src.includes(`${path.sep}.lake`) && !src.endsWith(`${path.sep}.git`) });
  // The user's own edits before the run (fixer round 1: a code-less GOAL or DERIVATION card to select as a premise).
  for (const e of (file['userEdits'] as Array<{ path: string; oldString: string; newString: string }> | undefined) ?? []) {
    const text = readFileSync(path.join(root, e.path), 'utf8');
    if (!text.includes(e.oldString)) throw new Error(`userEdits: ${JSON.stringify(e.oldString)} not in ${e.path}`);
    writeFileSync(path.join(root, e.path), text.replace(e.oldString, e.newString));
  }
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'the user own model');
  const workspace = createModelWorkspace({ root, text: fsTextSource(root), applier: fsEditApplier(root), semantic: { debounceMs: 60_000 } });
  await workspace.load();
  await workspace.refreshNow();
  const play = playFakeScript(file);
  const runsDir = path.join(dir, 'runs');
  const manager = createRunManager({
    root,
    runsDir,
    workspace,
    services: { backend: new FakeBackend(play.script), engine: createLeanCheckEngine(), proposals: createProposalService(), sidecars: createRunSidecarStore() },
    settings: DEFAULT_RUN_SETTINGS,
  });
  return { dir, root, workspace, manager, play, file, runsDir };
}

/** Starts the script's run and answers the modality question as the script's `answer` says. */
async function runRound1(w: Walk): Promise<RunView> {
  const premises = (w.file['premises'] as string[] | undefined) ?? ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
  const started = await w.manager.start({ subject: 'Spyro', target: 'cynder-not-good', premises });
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
  const option = (w.file['answer'] as { option: number } | undefined)?.option ?? 0;
  const waiting = await waitForRun(w.manager, (v) => v.state === 'waiting-for-answer' || v.state === 'review' || v.state === 'failed', 180_000);
  if (waiting.state === 'waiting-for-answer') {
    const answered = await w.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option }, scope: 'run' }]);
    expect(answered).toMatchObject({ ok: true });
  }
  return waitForRun(w.manager, (v) => v.state === 'review' || v.state === 'failed', 300_000, 'the end of round 1');
}

function transcriptResults(runDir: string): Array<Extract<LlmEvent, { type: 'tool_result' }>> {
  return readFileSync(path.join(runDir, 'session', 'transcript.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; event?: LlmEvent })
    .filter((e) => e.kind === 'event' && e.event?.type === 'tool_result')
    .map((e) => e.event as Extract<LlmEvent, { type: 'tool_result' }>);
}

async function runDirOf(w: Walk, runId: string): Promise<string> {
  const listed = await listRunDirs(w.runsDir, w.root);
  const found = listed.find((d) => d.runId === runId);
  if (found === undefined) throw new Error(`no run dir for ${runId}`);
  return found.runDir;
}

function noLeftoverUnits(runId: string): void {
  try {
    const out = execFileSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', `telelean-${runId}-*`], { encoding: 'utf8' });
    expect(out.trim()).toBe('');
  } catch {
    // no user manager here: nothing to check
  }
}

describe('the walkthrough end to end (AT3.14)', () => {
  it('(a) normative: proved, G->D, Accept writes the formalisation, the proof and type: DERIVATION; Undo restores', async () => {
    const w = await setup('normative');
    const before = modelTree(w.root);
    const review = await runRound1(w);
    expect(review.state, JSON.stringify(review.notices)).toBe('review');
    expect(review.verdict).toBe('proved');
    expect(modelTree(w.root)).toEqual(before); // nothing reaches the real files before Accept
    const proposal = w.manager.proposal();
    expect(proposal?.lifecycle.map((l) => [l.id, l.from, l.to, l.recommended])).toEqual([['l1', 'GOAL', 'DERIVATION', true]]);
    expect(proposal?.report.footprint).toEqual(expect.arrayContaining((w.file['expect'] as { footprint: string[] }).footprint));
    expect(proposal?.definitions).toEqual([]);
    const accepted = await w.manager.accept(review.runId, proposal?.proposalId ?? '', ['l1'], []);
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
    const main = readFileSync(path.join(w.root, MAIN), 'utf8');
    expect(main).toContain('lean: Spyro.pg_no_dark_past');
    expect(main).toContain('/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop :=');
    expect(main).toContain('axiom pg_no_dark_past.holds : pg_no_dark_past');
    expect(main).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(main).toMatch(/id: cynder-not-good\ntype: DERIVATION\n/);
    const history = await w.workspace.listHistory('Spyro');
    expect(history.entries.filter((e) => (e.action as string) === 'accept-proposal')).toHaveLength(1);
    const attempts = parseAttemptLines(readFileSync(path.join(w.root, '.telelean', 'subjects', 'Spyro', 'attempts.jsonl'), 'utf8'));
    expect(attempts.some((a) => a.format === 'telelean-attempt-resolution' && a.resolution === 'accepted')).toBe(true);
    const undone = await w.workspace.undo('Spyro');
    expect(undone).toMatchObject({ ok: true });
    expect(modelTree(w.root)).toEqual(before);
    w.manager.dispose();
    noLeftoverUnits(review.runId);
  });

  it('(b) literal: not proved with a ghost; adopting it re-freezes and proves; Accept writes the agent-worded card', async () => {
    const w = await setup('literal');
    const before = modelTree(w.root);
    const r1 = await runRound1(w);
    expect(r1.state, JSON.stringify(r1.notices)).toBe('review');
    expect(r1.verdict).toBe('not-proved');
    expect(r1.ghosts).toHaveLength(1);
    expect(r1.ghosts[0]).toMatchObject({ id: 'ghost-1', closesGap: true, aloneEntails: false, state: 'suggested', leanStatement: '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g' });
    expect(w.manager.proposal()?.review.some((item) => item.kind === 'vocabulary' && item.items.some((i) => i.name.endsWith('InGame')))).toBe(true);
    const adopted = await w.manager.adoptGhost(r1.runId, 'ghost-1', 'it seems obvious to me');
    expect(adopted, JSON.stringify(adopted)).toMatchObject({ ok: true });
    const r2 = await waitForRun(w.manager, (v) => v.round === 2 && (v.state === 'review' || v.state === 'failed'), 300_000, 'round 2');
    expect(r2.verdict, JSON.stringify(r2.notices)).toBe('proved');
    expect(modelTree(w.root)).toEqual(before);
    const proposal = w.manager.proposal();
    expect(proposal?.report.footprint).toContain('a-character-who-cannot-be-in');
    const accepted = await w.manager.accept(r2.runId, proposal?.proposalId ?? '', proposal?.lifecycle.map((l) => l.id) ?? [], proposal?.definitions.map((d) => d.id) ?? []);
    expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
    const main = readFileSync(path.join(w.root, MAIN), 'utf8');
    expect(main).toContain('natural_name: A character who cannot be in a game would not be a good addition to it');
    expect(main).toContain('worded_by: agent');
    expect(main).toContain('origin: agent');
    expect(main).toContain(`session: ${r2.runId}`);
    expect(main).toContain('rationale: it seems obvious to me');
    expect(main).toContain('not_in_game_not_good.holds cynder newSpyro');
    // Fixer round 1: the adopted card is declared on the target (the user adopted it for this target), so the board
    // shows no TL107 ("uses … which the declared premises do not cover") and no used-undeclared arrow after Accept.
    expect(main).toMatch(/id: cynder-not-good\ntype: DERIVATION\nnatural_name: [^\n]*\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in\n/);
    await w.workspace.refreshNow();
    const graph = w.workspace.graph('Spyro');
    const target = graph.nodes.find((n) => n.id === 'cynder-not-good');
    expect(target?.status.proof.kind).toBe('proved');
    expect(target?.premises).toContain('a-character-who-cannot-be-in');
    expect(graph.diagnostics.filter((d) => d.nodeId === 'cynder-not-good' && d.code === 'TL107')).toEqual([]);
    expect(graph.edges.filter((e) => e.mismatch !== undefined)).toEqual([]);
    w.manager.dispose();
    noLeftoverUnits(r2.runId);
  });
});

const CHEATS = [
  'added-axiom',
  'sorry',
  'weakened-abbrev',
  'weakened-type',
  'unselected',
  'rebind-target',
  'lemma-not-proved',
  'definition-belief',
  'vocabulary-redefined',
  'eval',
  'proof-before-freeze',
  'edited-words',
  'give-up',
  // Fixer round 1 (gate verification P1, P6b, P2, P12): selected GOAL/DERIVATION premises and a private lemma.
  'goal-premise-axiom',
  'goal-premise-belief',
  'derivation-premise-proof',
  'private-lemma',
  // Fixer round 2 (P12 by another route): proofs carried by a def, an instance and a structure default, in a not-proved
  // round (also refused before the freeze) and in a proved round.
  'carrier-not-proved',
  'carrier-proved',
  // Fixer round 3 (final verification, probe X-14): an example resting on an unselected assumption, in a round that
  // finishes not proved without freezing (it used to pass and Accept wrote it), then again after a freeze.
  'example-not-proved',
];

describe('the cheating scripts end to end (AT3.15)', () => {
  for (const name of CHEATS) {
    it(name, async () => {
      const w = await setup(`cheat-${name}`);
      const expectation = w.file['expect'] as {
        firstFailure?: string[];
        freezeRefused?: string[];
        checkViolation?: string[];
        verdict: string;
        gateAttempts?: number;
        flaggedDefinition?: string;
        notices?: string[];
      };
      const review = await runRound1(w);
      expect(review.state, JSON.stringify(review.notices)).toBe('review');
      expect(review.verdict, JSON.stringify(review.notices.map((n) => n.text))).toBe(expectation.verdict);
      const results = transcriptResults(await runDirOf(w, review.runId));
      const finishes = results.filter((r) => r.text.startsWith('Gate'));
      if (expectation.firstFailure !== undefined) {
        // The first finish failed with the expected check, and the board said so.
        expect(finishes[0]?.text.split('\n')[0]).toMatch(/^Gate failed/);
        for (const code of expectation.firstFailure) expect(finishes[0]?.text).toContain(`- ${gateCheckOf(code as never, true)}:`);
        expect(review.notices[0]?.kind).toBe('gate-failed');
      }
      if (expectation.freezeRefused !== undefined) {
        expect(results.some((r) => r.text.startsWith('Freeze refused:'))).toBe(true);
      }
      if (expectation.checkViolation !== undefined) {
        expect(results.some((r) => r.text.startsWith('Check found problems.'))).toBe(true);
      }
      if (expectation.gateAttempts !== undefined) expect(review.counters.gateAttempts).toBe(expectation.gateAttempts);
      if (expectation.notices !== undefined) expect(review.notices.map((n) => n.kind)).toEqual(expectation.notices);
      const proposal = w.manager.proposal();
      if (name === 'give-up') {
        const shown = await w.manager.proposalDiff(review.runId, proposal?.proposalId ?? '');
        expect(shown.map((c) => c.after ?? '').join('\n')).not.toContain('axiom shortcut');
        expect(proposal?.report.reverted?.label).toMatch(/frozen/i);
      } else if (expectation.verdict === 'proved' || expectation.verdict === 'not-proved') {
        // The retry replaced the cheat: the last finish passed.
        expect(finishes.at(-1)?.text.split('\n')[0]).toBe('Gate passed. The run is complete; stop here.');
      }
      if (name === 'example-not-proved') {
        // Refused before the freeze (proof-before-freeze) and after it (footprint), never written by Accept.
        expect(finishes.map((r) => r.text.split('\n')[0])).toEqual(['Gate failed (attempt 1 of 3):', 'Gate failed (attempt 2 of 3):', 'Gate passed. The run is complete; stop here.']);
        expect(finishes[0]?.text).toContain('an `example` is a proof, written before freeze_statements: remove it.');
        expect(finishes[1]?.text).toContain('an `example` may not stay in the files');
        const accepted = await w.manager.accept(review.runId, proposal?.proposalId ?? '', [], proposal?.definitions.map((d) => d.id) ?? []);
        expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
        const main = readFileSync(path.join(w.root, MAIN), 'utf8');
        expect(main).toContain('abbrev pg_no_dark_past : Prop');
        expect(main).not.toContain('example');
      }
      if (expectation.flaggedDefinition !== undefined) {
        expect(proposal?.definitions.map((d) => d.name)).toContain(expectation.flaggedDefinition);
        const refused = await w.manager.accept(review.runId, proposal?.proposalId ?? '', [], []);
        expect(refused).toMatchObject({ ok: false, code: 'invalid' });
        const ok = await w.manager.accept(review.runId, proposal?.proposalId ?? '', [], proposal?.definitions.map((d) => d.id) ?? []);
        expect(ok, JSON.stringify(ok)).toMatchObject({ ok: true });
      }
      w.manager.dispose();
      noLeftoverUnits(review.runId);
      expect(existsSync(path.join(w.root, '.telelean'))).toBe(true);
    });
  }
});
