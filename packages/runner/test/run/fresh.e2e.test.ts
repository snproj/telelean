/**
 * Fresh models end to end (turn 13, the demo path): a person opens an EMPTY folder, runs "telelean: Initialize Model
 * Here" (runner `inspectFolder` + `planInitialize`, written by the fs EditApplier as the extension's applier writes
 * them; then the git offer, accepted with `initGit` or declined), opens the board (a Lean refresh) and types their own
 * example as cards (M1 `add-node` actions, exactly what the board's A|P box sends: code-less blocks in
 * Model/<Subject>/Inbox.lean), draws arrows from the premises into the goal and runs "Formalize for dependencies"
 * (M2's "These suffice"; with no premises, "Follows from nothing?"). The scripts still name the
 * kinds ASSUMPTION, DERIVATION and GOAL: the board sends their spec v4 names (AXIOM, PROPOSITION), as the markup reads
 * them (`parseNodeType`). A FakeBackend plays
 * test-fixtures/fresh/*.json: a well-behaved Claude following the system prompt, which must create EVERYTHING
 * itself (sorts, predicates, constants with their existence presupposition and instance, the statements, the
 * selected assumptions' `.holds`, lemmas and proofs). The REAL RunManager, Lean check engine (sandboxed Lean), proposal
 * service and sidecar store run it; then Accept, a Lean refresh and the board's statuses.
 *
 *   (a) socrates  proved; the existence presupposition is the only question; Accept; Undo and Redo; then a
 *                 second example in the same model (plato) that reuses the accepted vocabulary
 *   (b) chain     a named lemma and a tactic proof; proved; a hand edit made while Claude worked holds Accept back
 *                 (spec v4 ES-7, slice 1f: the files differ from the run's base) until it is undone; before 1f,
 *                 Accept rebased such edits by card id
 *   (c) penguin   a question answered; not proved with a suggestion that closes the gap; adopted ("I hold this");
 *                 re-frozen; proved; Accept writes the card worded by Claude
 *   (d) zero premises, not self-evident: not proved; Accept keeps the formalisation (git history declined)
 *   (e) the goal typed before its premises: the proof moves below them; proved
 *   (f) propositional, the conclusion typed as a Derivation: proved, no kind change, nothing to approve
 *   (g) arithmetic, zero premises: proved and flagged self-evident (declarations that mention no constant get facts)
 *   (h) honest variants a real Claude may write (a named presupposition instance, vocabulary in Inbox.lean, `def`
 *       statements, the proof in Main.lean) all pass; a stray blank line is named as such and fixed
 *   (i) an intermediate step typed as a Derivation and selected: proved after the freeze and used
 *
 * A well-behaved Claude is never refused: every freeze succeeds (except where a script makes a mistake on purpose)
 * and every finish passes at its first attempt.
 * Real Lean, one job at a time (vitest runs files sequentially), LEAN_NUM_THREADS=4 (runLean); no Claude
 * (TELELEAN_NO_REAL_CLAUDE=1 in the vitest config, FakeBackend only).
 *
 * Slice 2d (docs/slice2-plan.md §0, "Tests that move"): every start is an edit session, whose RunView has no verdict and
 * which has no proposal to Accept; each of these runs ended in Accept, so all of them moved to 2f, which rewrote them as
 * sessions to their Apply: the step's verdict from run.json, M2's definition questions as presupposition items, every
 * item accepted (each its own Accept), Submit review, the final check (real Lean), Apply; (b)'s hand edit is drift, and
 * (c)'s "I hold this" is the Add premise's Accept, whose write and completion are telelean's (no second Claude round).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseNodeType, REVIEW_TEXTS, type NodeType, type RunView, type TlGraph } from '@telelean/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createLeanCheckEngine } from '../../src/gate/index.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript, validateFakeScriptFile, type FakeScriptFile } from '../../src/llm/fakeScripts.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { createProposalService, createRunSidecarStore } from '../../src/proposal/index.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, type PersistedRun, type RunManager } from '../../src/run/index.js';
import { listRunDirs } from '../../src/shadow/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, inspectFolder, planInitialize, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, makeTempDir, REPO_ROOT } from './helpers/env.js';
import { acceptEverything, applyEverything, confirm } from './helpers/apply.js';
import { waitForRun } from './helpers/harness.js';

const FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'fresh');
const INBOX = 'Model/Demo/Inbox.lean';
const VOCABULARY = 'Model/Demo/Vocabulary.lean';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) cleanup(d);
});

interface FreshCard {
  /** The kind as the script names it (ASSUMPTION, DERIVATION or GOAL: read as AXIOM or PROPOSITION). */
  type: string;
  naturalName: string;
  /** The id the board derives for it (the script's edits rely on it). */
  id: string;
}

interface FreshScript extends FakeScriptFile {
  subject: string;
  /** The date the board writes into `asserted:` (the workspace's clock is fixed to it). */
  today: string;
  cards: FreshCard[];
  target: string;
  premises: string[];
  answer?: { option: number };
  adopt?: { ghost: string; rationale?: string };
  expect: {
    verdict?: string;
    round1?: string;
    round2?: string;
    definitions: string[];
    footprint?: string[];
    selfEvident?: boolean;
    failedChecks?: number;
    freezeRefusals?: number;
    ghostNode?: string;
    ghostStatement?: string;
  };
}

function loadFresh(name: string): FreshScript {
  return validateFakeScriptFile(JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'))) as FreshScript;
}

/** Model files only (the person's Lean and project files): what must stay untouched until Accept. */
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

function noLeftoverUnits(runId: string): void {
  let out = '';
  try {
    out = execFileSync('systemctl', ['--user', 'list-units', '--all', '--no-legend', `telelean-${runId}-*`], { encoding: 'utf8' });
  } catch {
    return; // no user manager here: nothing to check
  }
  expect(out.trim()).toBe('');
}

interface Fresh {
  root: string;
  runsDir: string;
  workspace: ModelWorkspace;
  managers: RunManager[];
  runIds: string[];
}

/** "Initialize Model Here" on an empty folder, the git offer, and the board's first refresh. */
async function initialiseFolder(label: string, subject: string, today: string, git: boolean): Promise<Fresh> {
  const dir = makeTempDir(`fresh-${label}`);
  dirs.push(dir);
  const root = path.join(dir, 'demo');
  mkdirSync(root);
  const inspection = await inspectFolder(root);
  expect(inspection).toEqual({ kind: 'empty' });
  await fsEditApplier(root).apply(planInitialize({ subject, inspection }), 'Initialize model');
  const workspace = createModelWorkspace({
    root,
    text: fsTextSource(root),
    applier: fsEditApplier(root),
    semantic: { debounceMs: 60_000 },
    now: () => new Date(`${today}T12:00:00Z`),
  });
  await workspace.load();
  if (git) expect(await workspace.initGit()).toMatchObject({ state: 'ready' });
  expect(await workspace.refreshNow()).toMatchObject({ state: 'fresh' });
  return { root, runsDir: path.join(dir, 'runs'), workspace, managers: [], runIds: [] };
}

/** A script's kind name as the board sends it (spec v4: the old names read as aliases). */
function kindOf(written: string | undefined): NodeType {
  const kind = parseNodeType(written ?? '')?.type;
  if (kind === undefined) throw new Error(`not a kind: ${String(written)}`);
  return kind;
}

/** The person types the script's cards in the A|P box (one `add-node` each), then the board refreshes. */
async function typeCards(f: Fresh, script: FreshScript): Promise<void> {
  for (const card of script.cards) {
    const outcome = await f.workspace.perform({ kind: 'add-node', subject: script.subject, type: kindOf(card.type), naturalName: card.naturalName });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, nodeId: card.id });
  }
  expect(await f.workspace.refreshNow()).toMatchObject({ state: 'fresh' });
  const graph = f.workspace.graph(script.subject);
  for (const card of script.cards) expect(graph.nodes.find((n) => n.id === card.id)?.status.formal).toBe('informal');
}

function newManager(f: Fresh, script: FreshScript): RunManager {
  const play = playFakeScript(script);
  const manager = createRunManager({
    root: f.root,
    runsDir: f.runsDir,
    workspace: f.workspace,
    services: { backend: new FakeBackend(play.script), engine: createLeanCheckEngine(), proposals: createProposalService(), sidecars: createRunSidecarStore() },
    settings: DEFAULT_RUN_SETTINGS,
  });
  f.managers.push(manager);
  return manager;
}

/**
 * Runs "Formalize for dependencies" (spec v4.1) on the arrows the person drew; answers Claude's question (if it asks) as
 * the script says. Slice 2f: an edit session, so it resolves at the stage (the step ended, the queue's judgement
 * converged), with the step's verdict and the session's records from run.json (a session's RunView has no verdict).
 * The person draws the arrows first (one `add-arrows`, as the board's handle or "Draw arrows from the selection"
 * would); the files then hold the `premises:` line the scripts' edits expect. (An empty question is left as it was:
 * the runner does not check it; the extension host does, core formalizeStartProblems.)
 */
async function theseSuffice(f: Fresh, manager: RunManager, script: FreshScript): Promise<{ review: RunView; before: Record<string, string>; raw: PersistedRun; verdict: string }> {
  if (script.premises.length > 0) {
    const drawn = await f.workspace.perform({ kind: 'add-arrows', target: script.target, sources: script.premises });
    expect(drawn, JSON.stringify(drawn)).toMatchObject({ ok: true });
  }
  const started = await manager.start({ subject: script.subject, target: script.target, premises: script.premises });
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
  // From here on (the arrows are drawn) nothing may change the person's files until Apply.
  const before = modelTree(f.root);
  const atStage = (v: RunView): boolean => (v.session?.phase === 'stage' && manager.session()?.judging === false) || v.state === 'failed';
  const first = await waitForRun(manager, (v) => v.state === 'waiting-for-answer' || atStage(v), 240_000, 'the question or the stage');
  f.runIds.push(first.runId);
  if (first.state === 'waiting-for-answer') {
    expect(script.answer, 'the script asks a question, so it says how to answer it').toBeDefined();
    const answered = await manager.answer(first.runId, first.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option: script.answer?.option ?? 0 }, scope: 'run' }]);
    expect(answered, JSON.stringify(answered)).toMatchObject({ ok: true });
  } else {
    expect(script.answer).toBeUndefined();
  }
  const review = await waitForRun(manager, atStage, 600_000, 'the stage');
  const raw = await rawRunOf(f, review.runId);
  expect(review.state, JSON.stringify({ error: review.error, notices: raw.view.notices })).toBe('review');
  expect(modelTree(f.root)).toEqual(before);
  const verdict = raw.session?.steps[0]?.attempt?.verdict ?? '';
  // Builder 2f: a step's new helper instance of a presupposition is owned (by its presupposition's item), never unowned.
  expect(raw.session?.judged?.problems, JSON.stringify(raw.session?.judged)).toEqual([]);
  return { review, before, raw, verdict };
}

/** run.json of a run as written now. */
async function rawRunOf(f: Fresh, runId: string): Promise<PersistedRun> {
  const found = (await listRunDirs(f.runsDir, f.root)).find((d) => d.runId === runId);
  if (found === undefined) throw new Error(`no run directory for ${runId}`);
  return JSON.parse(readFileSync(path.join(found.runDir, 'run.json'), 'utf8')) as PersistedRun;
}

/** Slice 2f: the presuppositions a session proposed (its `decl:` items of that kind), M2's definition questions. */
function presuppositions(raw: PersistedRun): string[] {
  return (raw.session?.items ?? []).filter((r) => r.kind === 'declaration' && r.declKind === 'presupposition').map((r) => r.key.slice('decl:'.length));
}

/** Slice 2f: the target's Result as the stage judged it (its verdict and what it rests on). */
function judgedResult(raw: PersistedRun, target: string): NonNullable<NonNullable<PersistedRun['session']>['items'][number]['judged']> | undefined {
  return raw.session?.items.find((r) => r.key === `proof:${target}`)?.judged;
}

/** Every tool result of the run so far, from its transcript. */
async function toolResults(f: Fresh, runId: string): Promise<string[]> {
  const found = (await listRunDirs(f.runsDir, f.root)).find((d) => d.runId === runId);
  if (found === undefined) throw new Error(`no run directory for ${runId}`);
  return readFileSync(path.join(found.runDir, 'session', 'transcript.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; event?: LlmEvent })
    .filter((e) => e.kind === 'event' && e.event?.type === 'tool_result')
    .map((e) => (e.event as Extract<LlmEvent, { type: 'tool_result' }>).text);
}

/** A well-behaved Claude is never refused: freezes succeed, every finish passes, only the expected checks fail. */
function neverRefused(results: readonly string[], failedChecks = 0, freezeRefusals = 0): void {
  expect(results.filter((r) => r.startsWith('Freeze refused')), results.join('\n---\n')).toHaveLength(freezeRefusals);
  const finishes = results.filter((r) => r.startsWith('Gate'));
  expect(finishes.length).toBeGreaterThan(0);
  for (const r of finishes) expect(r.split('\n')[0], r).toBe('Gate passed. The run is complete; stop here.');
  expect(results.filter((r) => r.startsWith('Check found problems.')), results.join('\n---\n')).toHaveLength(failedChecks);
  expect(results.filter((r) => r.startsWith('Statements frozen')).length).toBeGreaterThan(0);
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

/** Slice 2f: every item accepted (each its own Accept), Submit review, the final check passed, Apply. */
async function acceptAll(f: Fresh, manager: RunManager, review: RunView, premise?: { holdAs: 'axiom' | 'pending'; rationale?: string }): Promise<void> {
  void f;
  const applied = await applyEverything(manager, review.runId, premise);
  expect(applied, JSON.stringify(applied)).toMatchObject({ ok: true });
  expect(manager.current()?.state).toBe('accepted');
}

/** After Accept and a refresh: the selected assumptions are formalised and assumed, Lean reports no error. */
async function refreshedGraph(f: Fresh, script: FreshScript): Promise<TlGraph> {
  expect(await f.workspace.refreshNow()).toMatchObject({ state: 'fresh' });
  const graph = f.workspace.graph(script.subject);
  expect(graph.diagnostics.filter((d) => d.severity === 'error'), JSON.stringify(graph.diagnostics)).toEqual([]);
  for (const id of script.premises) {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.type !== 'AXIOM') continue;
    expect(node.status.formal, id).toBe('formalized');
    expect(node.status.proof.kind, id).toBe('assumed');
    expect(node.lean.binding, id).toBe('pinned');
  }
  return graph;
}

async function finishFresh(f: Fresh): Promise<void> {
  for (const m of f.managers) await m.dispose();
  f.workspace.dispose();
  for (const runId of f.runIds) noLeftoverUnits(runId);
}

/**
 * The common path of a one-round script: a fresh folder, the cards, Formalize, the expected verdict with the
 * expected questions, Accept, a refresh; returns the refreshed graph.
 */
async function oneRound(
  name: string,
  git = true,
  beforeAccept?: (f: Fresh, script: FreshScript, manager: RunManager, review: RunView) => Promise<void>,
): Promise<{ f: Fresh; script: FreshScript; review: RunView; graph: TlGraph }> {
  const script = loadFresh(name);
  const f = await initialiseFolder(name, script.subject, script.today, git);
  await typeCards(f, script);
  const manager = newManager(f, script);
  const { review, raw, verdict } = await theseSuffice(f, manager, script);
  expect(verdict, JSON.stringify(raw.view.notices)).toBe(script.expect.verdict);
  neverRefused(await toolResults(f, review.runId), script.expect.failedChecks, script.expect.freezeRefusals);
  // Slice 2f: M2's definition questions are the session's presupposition items, each with its own Accept.
  expect(presuppositions(raw)).toEqual(script.expect.definitions);
  const targetType = kindOf(script.cards.find((c) => c.id === script.target)?.type);
  const proved = script.expect.verdict === 'proved';
  expect(judgedResult(raw, script.target)?.verdict).toEqual(proved ? expect.stringMatching(/^(proved|established)$/u) : 'not-proved');
  // The Result rests on the selected cards the proof uses (M2's footprint, the presuppositions aside).
  if (script.expect.footprint !== undefined && proved) {
    expect(sorted(judgedResult(raw, script.target)?.restsOn ?? [])).toEqual(sorted(script.expect.footprint.filter((x) => !x.startsWith('presup:'))));
  }
  await beforeAccept?.(f, script, manager, review);
  // (b)'s drift test ends the session itself, with the Apply that goes through once the edit is undone.
  if (manager.current()?.state !== 'accepted') await acceptAll(f, manager, review);
  const graph = await refreshedGraph(f, script);
  const target = graph.nodes.find((n) => n.id === script.target);
  expect(target?.status.formal).toBe('formalized');
  expect(target?.lean.binding).toBe('pinned');
  expect(target?.type).toBe(targetType);
  if (proved) {
    expect(target?.status.proof).toEqual({ kind: 'proved', footprint: expect.arrayContaining(script.expect.footprint ?? []) as unknown as string[] });
  } else {
    expect(target?.status.proof).toEqual({ kind: 'none' });
  }
  return { f, script, review, graph };
}

describe('fresh models: a demo user\'s own example from "Initialize Model Here" to the refreshed board', () => {
  it('(a) socrates: proved; Apply writes the vocabulary and the formalisation; Undo/Redo; a second example reuses the vocabulary', async () => {
    const { f, script, graph } = await oneRound('socrates');
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    for (const [id, statement] of [
      ['all-humans-are-mortal', 'all_humans_are_mortal'],
      ['socrates-is-a-human', 'socrates_is_a_human'],
      ['socrates-is-mortal', 'socrates_is_mortal'],
    ]) {
      expect(inbox).toMatch(new RegExp(`id: ${id}\\n[^]*?lean: Demo\\.${statement}\\n-/\\n/-- [^\\n]* -/\\nabbrev ${statement} : Prop :=`));
    }
    expect(inbox).toContain('axiom all_humans_are_mortal.holds : all_humans_are_mortal');
    expect(inbox).toContain('theorem socrates_is_mortal.holds : socrates_is_mortal :=');
    expect(inbox).toMatch(/id: socrates-is-mortal\ntype: PROPOSITION\nnatural_name: Socrates is mortal\npremises: all-humans-are-mortal, socrates-is-a-human\n/);
    const vocabulary = readFileSync(path.join(f.root, VOCABULARY), 'utf8');
    expect(vocabulary).toContain('axiom Being : Type\n');
    expect(vocabulary).toContain('axiom Being.exists : Nonempty Being\ninstance : Nonempty Being := Being.exists\n');
    expect(vocabulary).toContain('noncomputable opaque socrates : Being\n');
    expect(graph.vocabulary.map((v) => [v.shortName, v.kind])).toEqual([
      ['Being', 'sort'],
      ['Human', 'predicate'],
      ['Mortal', 'predicate'],
      ['socrates', 'constant'],
      ['Being.exists', 'presupposition'],
    ]);
    // One undoable step, recorded in the history.
    const accepted = modelTree(f.root);
    expect((await f.workspace.listHistory('Demo')).entries.filter((e) => (e.action as string) === 'accept-proposal')).toHaveLength(1);
    expect(await f.workspace.undo('Demo')).toMatchObject({ ok: true });
    expect(readFileSync(path.join(f.root, VOCABULARY), 'utf8')).not.toContain('Being');
    expect(readFileSync(path.join(f.root, INBOX), 'utf8')).not.toContain('abbrev');
    expect(await f.workspace.redo('Demo')).toMatchObject({ ok: true });
    expect(modelTree(f.root)).toEqual(accepted);

    // The person tries a second example in the same model: the accepted vocabulary and premise are reused.
    const plato = loadFresh('plato');
    await typeCards(f, plato);
    const manager = newManager(f, plato);
    const { review, raw, verdict } = await theseSuffice(f, manager, plato);
    expect(verdict, JSON.stringify(raw.view.notices)).toBe('proved');
    neverRefused(await toolResults(f, review.runId));
    expect(presuppositions(raw)).toEqual([]);
    await acceptAll(f, manager, review);
    const after = await refreshedGraph(f, plato);
    for (const id of ['socrates-is-mortal', 'plato-is-mortal']) {
      const node = after.nodes.find((n) => n.id === id);
      expect(node?.type, id).toBe('PROPOSITION');
      expect(node?.status.proof.kind, id).toBe('proved');
    }
    expect(after.vocabulary.find((v) => v.shortName === 'plato')?.kind).toBe('constant');
    expect(script.target).toBe('socrates-is-mortal');
    await finishFresh(f);
  });

  it('(b) chain: a named lemma and a tactic proof; proved; a hand edit made meanwhile holds Apply back until it is undone (ES-7)', async () => {
    // During the session the person edits the Inbox by hand (the board itself cannot be edited during a run, ES-9).
    // The drift watcher records it; Apply then refuses, naming the file, and changes nothing; once the edit is undone
    // (as the editor's Undo would), the same Apply goes through. (Before slice 1f, Accept rebased such edits.)
    const meanwhile = async (f: Fresh, _script: FreshScript, manager: RunManager, review: RunView): Promise<void> => {
      const file = path.join(f.root, INBOX);
      const base = readFileSync(file, 'utf8');
      const edited = base.replace('natural_name: Tom is a cat\n', 'natural_name: Tom is a cat\nrationale: I have seen him\n');
      expect(edited).not.toBe(base);
      writeFileSync(file, edited);
      await f.workspace.invalidate([INBOX]);
      await acceptEverything(manager, review.runId);
      const c = await confirm(manager, review.runId);
      for (let k = 0; k < 300 && manager.session()?.drift === null; k++) await new Promise((r) => setTimeout(r, 20));
      expect(manager.session()?.drift?.files).toEqual([INBOX]);
      const refused = await manager.end(review.runId, 'apply', manager.session()?.stage ?? 0, c.check.id);
      expect(refused).toEqual({ ok: false, code: 'conflict', error: REVIEW_TEXTS.drift([INBOX]) });
      expect(manager.current()?.state).toBe('review');
      expect(readFileSync(file, 'utf8')).toBe(edited); // nothing applied
      writeFileSync(file, base);
      await f.workspace.invalidate([INBOX]);
      for (let k = 0; k < 300 && manager.session()?.drift !== null; k++) await new Promise((r) => setTimeout(r, 20));
      expect(await manager.end(review.runId, 'apply', manager.session()?.stage ?? 0, c.check.id)).toMatchObject({ ok: true });
    };
    const { f, graph } = await oneRound('chain', true, meanwhile);
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    expect(inbox).toContain('theorem tom_is_a_mammal : Mammal tom :=');
    expect(inbox).not.toContain('rationale: I have seen him');
    expect(graph.nodes.find((n) => n.id === 'tom-is-a-cat')?.rationale).toBeUndefined();
    // The lemma is proof-only vocabulary, never a question.
    expect(graph.vocabulary.find((v) => v.shortName === 'tom_is_a_mammal')?.kind).toBe('lemma');
    await finishFresh(f);
  });

  it('(c) penguin: a question; not proved with a suggestion that closes the gap; its Accept ("I hold this", with the Why) writes the card worded by Claude and telelean completes the proof; Apply writes both', async () => {
    const script = loadFresh('penguin');
    const f = await initialiseFolder('penguin', script.subject, script.today, true);
    await typeCards(f, script);
    const manager = newManager(f, script);
    const { review: r1, before, raw, verdict } = await theseSuffice(f, manager, script);
    expect(verdict, JSON.stringify(raw.view.notices)).toBe(script.expect.round1);
    expect(raw.session?.premises.map((d) => d.leanStatement)).toEqual([script.expect.ghostStatement]);
    expect(presuppositions(raw)).toEqual(script.expect.definitions);
    const decisions = JSON.parse(readFileSync(path.join(f.root, '.telelean', 'subjects', 'Demo', 'decisions.json'), 'utf8')) as { decisions: Array<{ phenomenon: string }> };
    expect(decisions.decisions.map((d) => d.phenomenon)).toEqual(['genericity']);
    expect(modelTree(f.root)).toEqual(before);
    // One Claude round only: the premise's write and the completion are telelean's (F15).
    await acceptAll(f, manager, r1, { holdAs: 'axiom', ...(script.adopt?.rationale !== undefined ? { rationale: script.adopt.rationale } : {}) });
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    // The written card sits right before the target's block, worded by Claude, and joins the target's premises.
    const ghostAt = inbox.indexOf('natural_name: Every penguin is a bird');
    expect(ghostAt).toBeGreaterThan(inbox.indexOf('natural_name: Tweety is a penguin'));
    expect(ghostAt).toBeLessThan(inbox.indexOf('natural_name: Tweety can fly'));
    expect(inbox).toContain('worded_by: agent');
    expect(inbox).toContain('rationale: penguins are birds');
    expect(inbox).toMatch(/id: tweety-can-fly\ntype: PROPOSITION\nnatural_name: Tweety can fly\npremises: all-birds-can-fly, tweety-is-a-penguin, every-penguin-is-a-bird\n/);
    expect(inbox).toMatch(/id: every-penguin-is-a-bird\ntype: AXIOM\n/);
    const graph = await refreshedGraph(f, script);
    const ghost = graph.nodes.find((n) => n.id === script.expect.ghostNode);
    expect(ghost?.type).toBe('AXIOM');
    expect(ghost?.status.proof.kind).toBe('assumed');
    const target = graph.nodes.find((n) => n.id === script.target);
    expect(target?.type).toBe('PROPOSITION');
    expect(target?.status.proof.kind).toBe('proved');
    expect(target?.premises).toContain(script.expect.ghostNode);
    expect(graph.diagnostics.filter((d) => d.nodeId === script.target && d.code === 'TL107')).toEqual([]);
    await finishFresh(f);
  });

  it('(d) zero premises, not self-evident: not proved; Apply keeps the formalisation; the proposition stays one (no git history)', async () => {
    const { f, review, graph } = await oneRound('self-evident-not', false);
    expect(review.ghosts).toEqual([]);
    expect(readFileSync(path.join(f.root, INBOX), 'utf8')).toContain('abbrev pingu_can_swim : Prop := CanSwim pingu\n');
    expect(readFileSync(path.join(f.root, INBOX), 'utf8')).not.toContain('.holds');
    expect(graph.nodes.map((n) => [n.id, n.type])).toEqual([['pingu-can-swim', 'PROPOSITION']]);
    await finishFresh(f);
  });

  it('(e) the goal typed before its premises: the proof moves below them; proved', async () => {
    const { f } = await oneRound('goal-first');
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    expect(inbox.indexOf('theorem socrates_is_mortal.holds')).toBeGreaterThan(inbox.indexOf('axiom socrates_is_a_human.holds'));
    await finishFresh(f);
  });

  it('(f) propositional, the conclusion typed as a Derivation: proved; no kind change; nothing to approve', async () => {
    const { f, graph } = await oneRound('rain');
    expect(graph.vocabulary.map((v) => [v.shortName, v.kind])).toEqual([
      ['Rains', 'predicate'],
      ['StreetWet', 'predicate'],
    ]);
    await finishFresh(f);
  });

  it('(h) honest variants: a named presupposition instance, vocabulary in Inbox.lean, `def` statements, the proof in Main.lean; a blank line named and fixed', async () => {
    const { f, review } = await oneRound('variants');
    const results = await toolResults(f, review.runId);
    // The one refusal names the blank line and never asks to remove the assumption's .holds.
    const refused = results.find((r) => r.startsWith('Freeze refused')) ?? '';
    expect(refused).toContain('a blank line separates Demo.all_humans_are_mortal from the block of the card all-humans-are-mortal');
    expect(refused).toContain('Demo.all_humans_are_mortal follows its block after a blank line, so it is not attached; remove the blank line');
    expect(refused).not.toContain('propose_assumption');
    expect(readFileSync(path.join(f.root, 'Model/Demo/Main.lean'), 'utf8')).toContain('theorem socrates_is_mortal.holds : socrates_is_mortal := by');
    await finishFresh(f);
  });

  it('(i) an intermediate step typed as a Derivation: in a session it is its own target (a two-target Formalize, sources first), proved in its own step and used by the next; both proofs applied', async () => {
    // Slice 2f: the fixture's one round proved the selected intermediate card too, which a session step may not (ES-2,
    // B.4 `not-target`: only its own target's proof). The person asks about both instead; its steps split the round.
    const script = loadFresh('derivation-premise');
    const all = script.turns[0]?.steps ?? [];
    const edit = (needle: string) => {
      const found = all.find((x) => x.kind === 'edit' && x.oldString.includes(needle));
      if (found === undefined || found.kind !== 'edit') throw new Error(`the fixture has no edit at ${needle}`);
      return found;
    };
    const statement = (card: string, premises: string, needle: string) => {
      const e0 = edit(needle);
      if (e0.kind !== 'edit') throw new Error('not an edit');
      const block = `natural_name: ${card}\npremises: ${premises}\nasserted: 2026-11-10\n-/\n`;
      return { ...e0, oldString: block, newString: block + e0.newString.slice(e0.oldString.length) };
    };
    const MAMMAL = 'every-cat-is-a-mammal, tom-is-a-cat';
    const ANIMAL = 'every-mammal-is-an-animal, tom-is-a-mammal';
    const turns = [
      {
        match: 'Run: "Formalize for dependencies"',
        steps: [
          edit('namespace Demo\n\nend Demo\n'),
          edit('natural_name: Every cat is a mammal\n'),
          edit('natural_name: Tom is a cat\n'),
          statement('Tom is a mammal', MAMMAL, 'natural_name: Tom is a mammal\n'),
          { kind: 'callTool' as const, tool: 'freeze_statements', args: { targets: ['tom-is-a-mammal'] } },
          edit('abbrev tom_is_a_mammal : Prop := Mammal tom\n'),
          { kind: 'callTool' as const, tool: 'finish', args: { status: 'proved', summary: 'Tom is a cat, so a mammal.', assumed_without_asking: [] } },
          { kind: 'result' as const },
        ],
      },
      {
        match: 'Step 2 of 2: formalize and prove “tom-is-an-animal”',
        steps: [
          edit('natural_name: Every mammal is an animal\n'),
          statement('Tom is an animal', ANIMAL, 'natural_name: Tom is an animal\n'),
          { kind: 'callTool' as const, tool: 'freeze_statements', args: { targets: ['tom-is-an-animal'] } },
          edit('abbrev tom_is_an_animal : Prop := Animal tom\n'),
          { kind: 'callTool' as const, tool: 'finish', args: { status: 'proved', summary: 'A mammal, so an animal.', assumed_without_asking: [] } },
          { kind: 'result' as const },
        ],
      },
    ];
    const f = await initialiseFolder('derivation-premise', script.subject, script.today, true);
    await typeCards(f, script);
    for (const [target, sources] of [['tom-is-a-mammal', ['every-cat-is-a-mammal', 'tom-is-a-cat']], ['tom-is-an-animal', ['every-mammal-is-an-animal', 'tom-is-a-mammal']]] as const) {
      expect(await f.workspace.perform({ kind: 'add-arrows', target, sources: [...sources] })).toMatchObject({ ok: true });
    }
    const manager = newManager(f, { ...script, turns } as FreshScript);
    const started = await manager.formalize({
      subject: script.subject,
      inferences: [
        { target: 'tom-is-an-animal', premises: ['every-mammal-is-an-animal', 'tom-is-a-mammal'] },
        { target: 'tom-is-a-mammal', premises: ['every-cat-is-a-mammal', 'tom-is-a-cat'] },
      ],
    });
    expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
    const view = await waitForRun(manager, (v) => (v.session?.phase === 'stage' && manager.session()?.judging === false) || v.state === 'failed', 600_000, 'the stage');
    f.runIds.push(view.runId);
    const raw = await rawRunOf(f, view.runId);
    expect(raw.session?.steps.map((x) => [x.target, x.state, x.attempt?.verdict])).toEqual([
      ['tom-is-a-mammal', 'passed', 'proved'],
      ['tom-is-an-animal', 'passed', 'proved'],
    ]);
    expect(raw.session?.judged?.problems).toEqual([]);
    await acceptAll(f, manager, view);
    const graph = await refreshedGraph(f, script);
    for (const id of ['tom-is-a-mammal', 'tom-is-an-animal']) {
      const node = graph.nodes.find((n) => n.id === id);
      expect(node?.type, id).toBe('PROPOSITION');
      expect(node?.status.proof.kind, id).toBe('proved');
    }
    await finishFresh(f);
  });

  it('(g) arithmetic with zero premises: proved and flagged self-evident (declarations that mention no constant get facts)', async () => {
    const { f, graph } = await oneRound('arith');
    expect(graph.nodes.find((n) => n.id === 'two-plus-two-is-four')?.status.flags).toContain('self-evident');
    expect(graph.vocabulary.find((v) => v.shortName === 'four_eq')?.kind).toBe('lemma');
    await finishFresh(f);
  });
});
