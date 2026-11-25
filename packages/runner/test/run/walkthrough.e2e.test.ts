/**
 * AT3.14 and AT3.15 (docs/m2-plan.md sections 10.2 and 10.3): the walkthrough and the cheating
 * scripts end to end, with the FakeBackend playing test-fixtures/walkthrough/*.json against the REAL engine (sandboxed
 * Lean), shadow, proposal service and sidecar store, and an fs-backed ModelWorkspace on a scratch git copy of
 * mental_model/. Real Lean: one job at a time (vitest runs files sequentially), LEAN_NUM_THREADS=4 (runLean).
 *   AT3.14a normative -> proved -> Accept: the files gain the pinned formalisation and the proof; the target keeps
 *           its `type: GOAL` line (spec v4: an alias of PROPOSITION, no G->D lifecycle item any more); the real model
 *           files are untouched before Accept; one history entry; Undo restores; attempts.jsonl says accepted
 *   AT3.14b literal -> not proved + ghost -> adopt -> re-freeze -> proved -> Accept; the adopted card is worded_by agent
 *   AT3.15  each cheating script shows its notice and the scripted retry (which replaces the cheat) passes; the
 *           give-up script reverts; fixer round 1 adds an axiom below a selected GOAL premise (freeze refused; a
 *           belief after the freeze), a run-written proof of a selected DERIVATION premise resting on an unselected
 *           assumption, and a private lemma (no Lean facts: fails closed); fixer round 2 adds proofs carried by
 *           declarations that are not theorems (a `PLift` def, an `Inhabited` instance, a structure field default)
 *           resting on an assumption that is not selected, in a not-proved and in a proved round; fixer round 3 adds
 *           an `example` resting on an unselected assumption, before the freeze and after it, never written by Accept
 *
 * Slice 2d (docs/slice2-plan.md §0, "Tests that move"): every start is an edit session. (a) and (b) tested Accept and the
 * adoption of a ghost, and moved to 2f, which rewrote them as sessions to their Apply (the premise's Accept and write,
 * the completion with real Lean, the final check); so did the definition-belief Accept refusal. The cheating scripts run as a one-step session (Formalize with the script's
 * premises): the same checks of the step's gate (the transcript, run.json's notices and the step's counters and
 * verdict, since a session's RunView withholds Claude's notices until the results are shown), then the stage opens with
 * a real judgement and the user's files are untouched; what each script's run left is read in the session's working
 * copy. The Accept refusal of a flagged definition moved to 2f (a belief item now). A new (a) runs the normative script
 * as a session.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseAttemptLines, REVIEW_TEXTS, type RunView } from '@telelean/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createLeanCheckEngine } from '../../src/gate/index.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript } from '../../src/llm/fakeScripts.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { createProposalService, createRunSidecarStore } from '../../src/proposal/index.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, gateCheckOf, type PersistedRun, type PersistedStep, type RunManager } from '../../src/run/index.js';
import { listRunDirs, runsDirOf } from '../../src/shadow/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, makeTempDir, MENTAL_MODEL } from './helpers/env.js';
import { applyEverything } from './helpers/apply.js';
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
  const runsDir = runsDirOf(root); // 2k2: in the model folder
  const manager = createRunManager({
    root,
    workspace,
    services: { backend: new FakeBackend(play.script), engine: createLeanCheckEngine(), proposals: createProposalService(), sidecars: createRunSidecarStore() },
    settings: DEFAULT_RUN_SETTINGS,
  });
  return { dir, root, workspace, manager, play, file, runsDir };
}

interface StepEnd {
  view: RunView;
  /** run.json at the stage (the session's RunView withholds Claude's notices, §3.12). */
  raw: PersistedRun;
  step: PersistedStep;
  runDir: string;
}

/**
 * Slice 2d: the script's run as a one-step edit session: Formalize with the script's premises, the modality question
 * answered as the script says, then the stage (the step ended and the queue's judgement converged).
 */
async function runStep1(w: Walk): Promise<StepEnd> {
  const premises = (w.file['premises'] as string[] | undefined) ?? ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
  const started = await w.manager.formalize({ subject: 'Spyro', inferences: [{ target: 'cynder-not-good', premises }] });
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
  const option = (w.file['answer'] as { option: number } | undefined)?.option ?? 0;
  const atStage = (v: RunView): boolean => (v.session?.phase === 'stage' && w.manager.session()?.judging === false) || v.state === 'failed';
  const waiting = await waitForRun(w.manager, (v) => v.state === 'waiting-for-answer' || atStage(v), 180_000);
  if (waiting.state === 'waiting-for-answer') {
    const answered = await w.manager.answer(waiting.runId, waiting.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option }, scope: 'run' }]);
    expect(answered).toMatchObject({ ok: true });
  }
  const view = await waitForRun(w.manager, atStage, 600_000, 'the stage after step 1');
  const runDir = await runDirOf(w, view.runId);
  const raw = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8')) as PersistedRun;
  const step = raw.session?.steps[0];
  if (step === undefined) throw new Error('run.json has no step');
  return { view, raw, step, runDir };
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
  const listed = await listRunDirs(w.runsDir);
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

describe('the walkthrough end to end (AT3.14), in slice 2f as an edit session to its Apply', () => {
  it('(a) normative: proved; every item accepted, the final check passed, Apply writes the formalisation and the proof and keeps the type: line; one history entry; Undo restores', async () => {
    const w = await setup('normative');
    const before = modelTree(w.root);
    const { view, raw } = await runStep1(w);
    expect(view.state, JSON.stringify(raw.view.notices)).toBe('review');
    expect(modelTree(w.root)).toEqual(before); // nothing reaches the real files before Apply
    const applied = await applyEverything(w.manager, view.runId);
    expect(applied, JSON.stringify(applied)).toMatchObject({ ok: true, undoable: true });
    const main = readFileSync(path.join(w.root, MAIN), 'utf8');
    expect(main).toContain('lean: Spyro.pg_no_dark_past');
    expect(main).toContain('/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop :=');
    expect(main).toContain('axiom pg_no_dark_past.holds : pg_no_dark_past');
    expect(main).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(main).toMatch(/id: cynder-not-good\ntype: GOAL\n/);
    const history = await w.workspace.listHistory('Spyro');
    expect(history.entries.filter((e) => (e.action as string) === 'accept-proposal')).toHaveLength(1);
    expect(history.entries[0]?.label).toBe(REVIEW_TEXTS.applyLabel(['Cynder would not be a good addition to the new Spyro game']));
    const attempts = parseAttemptLines(readFileSync(path.join(w.root, '.telelean', 'subjects', 'Spyro', 'attempts.jsonl'), 'utf8'));
    expect(attempts.some((a) => a.format === 'telelean-attempt-resolution' && a.resolution === 'accepted')).toBe(true);
    expect(w.manager.current()?.state).toBe('accepted');
    const undone = await w.workspace.undo('Spyro');
    expect(undone).toMatchObject({ ok: true });
    expect(modelTree(w.root)).toEqual(before);
    w.manager.dispose();
    noLeftoverUnits(view.runId);
  });

  it('(b) literal: not proved with a premise suggested; its Accept (as an axiom, with the Why) writes the card worded by Claude, telelean completes the proof (real Lean: a new freeze, the gate, the comparator), and Apply writes both', async () => {
    const w = await setup('literal');
    const before = modelTree(w.root);
    const { view, raw } = await runStep1(w);
    expect(view.state, JSON.stringify(raw.view.notices)).toBe('review');
    expect(raw.session?.premises.map((d) => [d.leanName, d.leanStatement])).toEqual([['not_in_game_not_good', '∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g']]);
    const applied = await applyEverything(w.manager, view.runId, { holdAs: 'axiom', rationale: 'it seems obvious to me' });
    expect(applied, JSON.stringify(applied)).toMatchObject({ ok: true });
    const main = readFileSync(path.join(w.root, MAIN), 'utf8');
    expect(main).toContain('natural_name: A character who cannot be in a game would not be a good addition to it');
    expect(main).toContain('worded_by: agent');
    expect(main).toContain('origin: agent');
    expect(main).toContain(`session: ${view.runId}`);
    expect(main).toContain('rationale: it seems obvious to me');
    expect(main).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(main).toContain('Spyro.not_in_game_not_good.holds');
    // The written card is declared on the target (the adoption appends it), so the board shows no TL107 after Apply.
    expect(main).toMatch(/id: cynder-not-good\ntype: GOAL\nnatural_name: [^\n]*\npremises: cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in\n/);
    expect(main).toContain('id: a-character-who-cannot-be-in\ntype: AXIOM\n');
    // G1: the premise's arrow is on the attempt record (the run directory is pruned in time; the record is not).
    const attempts = parseAttemptLines(readFileSync(path.join(w.root, '.telelean', 'subjects', 'Spyro', 'attempts.jsonl'), 'utf8'));
    expect(attempts.find((a) => a.format === 'telelean-attempt-resolution')).toMatchObject({ resolution: 'accepted', arrows: [{ source: 'a-character-who-cannot-be-in', target: 'cynder-not-good', step: 's1', kind: 'premise' }] });
    expect((await w.workspace.listHistory('Spyro')).entries[0]?.arrows).toEqual([{ source: 'a-character-who-cannot-be-in', target: 'cynder-not-good', step: 's1', kind: 'premise' }]);
    await w.workspace.refreshNow();
    const graph = w.workspace.graph('Spyro');
    const target = graph.nodes.find((n) => n.id === 'cynder-not-good');
    expect(target?.status.proof.kind).toBe('proved');
    expect(target?.premises).toContain('a-character-who-cannot-be-in');
    expect(graph.diagnostics.filter((d) => d.nodeId === 'cynder-not-good' && d.code === 'TL107')).toEqual([]);
    expect(graph.edges.filter((e) => e.mismatch !== undefined)).toEqual([]);
    expect(modelTree(w.root)).not.toEqual(before);
    w.manager.dispose();
    noLeftoverUnits(view.runId);
  });
});

describe('the walkthrough as an edit session (slice 2d)', () => {
  it('(a) normative as a one-step session: the step passes; the stage opens with a real judgement; the files stay untouched until the end, and Exit leaves them so', async () => {
    const w = await setup('normative');
    const before = modelTree(w.root);
    const { view, raw, step, runDir } = await runStep1(w);
    expect(view.state, JSON.stringify(raw.view.notices)).toBe('review');
    expect(view.session).toEqual({ stage: 1, phase: 'stage' });
    expect(view.notices).toEqual([]); // withheld until the results are shown (D2-10, AF9)
    expect(step).toMatchObject({ state: 'passed', target: 'cynder-not-good', queue: 1 });
    expect(step.attempt?.verdict).toBe('proved');
    expect(step.freezeCommit).toBeDefined();
    expect(raw.version).toBe(2);
    expect(raw.session?.queue).toEqual([]);
    expect(raw.session?.inFlight).toBeUndefined();
    // The stage judgement, computed with real Lean on the session's working copy (its facts kept for a reload, D2-72),
    // and its renderings.
    const judged = JSON.parse(readFileSync(path.join(runDir, 'judged-facts.json'), 'utf8')) as { commit?: string; facts?: { format?: string } | null };
    expect(raw.session?.judged).toMatchObject({ commit: raw.session?.head, ok: true });
    expect(judged.commit).toBe(raw.session?.judged?.commit);
    expect(judged.facts?.format).toBe('telelean-lean-facts');
    expect(existsSync(path.join(runDir, 'renderings.json'))).toBe(true);
    const session = w.manager.session();
    expect(session?.judging).toBe(false);
    expect(session?.steps.map((x) => [x.target, x.state])).toEqual([['cynder-not-good', 'ended']]); // the results are hidden
    expect(session?.items.some((item) => item.kind === 'result')).toBe(true);
    const ws = readFileSync(path.join(runDir, 'ws', MAIN), 'utf8');
    expect(ws).toContain('theorem cynder_not_good.holds : cynder_not_good :=');
    expect(modelTree(w.root)).toEqual(before); // nothing reaches the user's files during the session
    // Exit (2f; 2h retired the RunManager's discard, builder 2d's stopgap): the session ends and the files are as they were.
    const ended = await w.manager.end(view.runId, 'exit');
    expect(ended, JSON.stringify(ended)).toMatchObject({ ok: true });
    expect(modelTree(w.root)).toEqual(before);
    w.manager.dispose();
    noLeftoverUnits(view.runId);
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
      const before = modelTree(w.root);
      const { view, raw, step, runDir } = await runStep1(w);
      const notices = raw.view.notices;
      expect(view.state, JSON.stringify(notices)).toBe('review');
      expect(view.session?.phase).toBe('stage');
      expect(step.attempt?.verdict, JSON.stringify(notices.map((n) => n.text))).toBe(expectation.verdict);
      expect(step.state).toBe(name === 'give-up' ? 'gave-up' : 'passed');
      const results = transcriptResults(runDir);
      const finishes = results.filter((r) => r.text.startsWith('Gate'));
      if (expectation.firstFailure !== undefined) {
        // The first finish failed with the expected check, and the step's notices said so.
        expect(finishes[0]?.text.split('\n')[0]).toMatch(/^Gate failed/);
        for (const code of expectation.firstFailure) expect(finishes[0]?.text).toContain(`- ${gateCheckOf(code as never, true)}:`);
        expect(notices[0]?.kind).toBe('gate-failed');
      }
      if (expectation.freezeRefused !== undefined) {
        expect(results.some((r) => r.text.startsWith('Freeze refused:'))).toBe(true);
      }
      if (expectation.checkViolation !== undefined) {
        expect(results.some((r) => r.text.startsWith('Check found problems.'))).toBe(true);
      }
      if (expectation.gateAttempts !== undefined) expect(step.counters.gateAttempts).toBe(expectation.gateAttempts);
      if (expectation.notices !== undefined) expect(notices.map((n) => n.kind)).toEqual(expectation.notices);
      // What the step left, in the session's working copy at the stage.
      const ws = readFileSync(path.join(runDir, 'ws', MAIN), 'utf8');
      if (name === 'give-up') {
        // A give-up keeps the step's statements (written before its freeze) and takes the rest back to S0 (§3.3, as M2's
        // revert to the freeze): the smuggled axiom and the proof are gone.
        expect(step.freezeCommit).toBeDefined();
        expect(ws).toContain('/-- PG games cannot have characters with dark pasts -/\nabbrev pg_no_dark_past : Prop :=');
        expect(ws).not.toContain('axiom shortcut');
        expect(ws).not.toContain('theorem cynder_not_good.holds');
      } else if (expectation.verdict === 'proved' || expectation.verdict === 'not-proved') {
        // The retry replaced the cheat: the last finish passed.
        expect(finishes.at(-1)?.text.split('\n')[0]).toBe('Gate passed. The run is complete; stop here.');
      }
      if (name === 'example-not-proved') {
        // Refused before the freeze (proof-before-freeze) and after it (footprint); not in the working copy.
        expect(finishes.map((r) => r.text.split('\n')[0])).toEqual(['Gate failed (attempt 1 of 3):', 'Gate failed (attempt 2 of 3):', 'Gate passed. The run is complete; stop here.']);
        expect(finishes[0]?.text).toContain('an `example` is a proof, written before freeze_statements: remove it.');
        expect(finishes[1]?.text).toContain('an `example` may not stay in the files');
        expect(ws).toContain('abbrev pg_no_dark_past : Prop');
        expect(ws).not.toContain('example');
      }
      expect(modelTree(w.root)).toEqual(before); // nothing reaches the user's files during the session
      w.manager.dispose();
      noLeftoverUnits(view.runId);
      expect(existsSync(path.join(w.root, '.telelean'))).toBe(true);
    });
  }
  // definition-belief's flagged definition held M2's Accept back until it was approved; in a session (2f) it is an item.
  it('the cheating scripts (AT3.15) definition-belief: the flagged definition is a belief item: a group Accept leaves it, Submit review waits for it, and its own Accept lets Apply through', async () => {
    const w = await setup('cheat-definition-belief');
    const { view, raw } = await runStep1(w);
    expect(view.state, JSON.stringify(raw.view.notices)).toBe('review');
    const definition = raw.session?.items.find((r) => r.key === 'decl:Spyro.InGame');
    expect(definition).toMatchObject({ kind: 'declaration', status: 'in-review' });
    const v = w.manager.session();
    const item = v?.items.find((i) => i.id === definition?.id);
    expect(item?.classes?.belief).toBe(true);
    const group = await w.manager.decide(view.runId, 1, false, [{ item: definition?.id ?? '', rev: definition?.rev ?? 0, to: 'accepted' }], false);
    expect(group).toMatchObject({ ok: true, review: { taken: [], left: [{ item: definition?.id, reason: 'own-accept' }] } });
    expect(await w.manager.submit(view.runId, 1)).toMatchObject({ ok: false, code: 'refused' });
    const applied = await applyEverything(w.manager, view.runId);
    expect(applied, JSON.stringify(applied)).toMatchObject({ ok: true });
    expect(readFileSync(path.join(w.root, 'Model/Spyro/Vocabulary.lean'), 'utf8')).toContain('def InGame (c : Character) (g : Game) : Prop := GoodAddition c g');
    // EN-3: the definition is endorsed at Apply, so the board stops asking for its endorsement.
    expect(readFileSync(path.join(w.root, '.telelean', 'subjects', 'Spyro', 'endorsements.json'), 'utf8')).toContain('"name": "Spyro.InGame"');
    await w.workspace.refreshNow();
    expect(w.workspace.graph('Spyro').vocabulary.find((x) => x.name === 'Spyro.InGame')?.flags ?? []).not.toContain('definitional-choice');
    w.manager.dispose();
  });
});
