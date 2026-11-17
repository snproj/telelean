/**
 * Fresh models end to end (turn 13, the demo path): a person opens an EMPTY folder, runs "telelean: Initialize Model
 * Here" (runner `inspectFolder` + `planInitialize`, written by the fs EditApplier as the extension's applier writes
 * them; then the git offer, accepted with `initGit` or declined), opens the board (a Lean refresh) and types their own
 * example as cards (M1 `add-node` actions, exactly what the board's A|D|G box sends: code-less blocks in
 * Model/<Subject>/Inbox.lean), selects premises and a goal and presses "These suffice". A FakeBackend plays
 * test-fixtures/fresh/*.json: a well-behaved Claude following the system prompt, which must create EVERYTHING
 * itself (sorts, predicates, constants with their existence presupposition and instance, the statements, the
 * selected assumptions' `.holds`, lemmas and proofs). The REAL RunManager, Lean check engine (sandboxed Lean), proposal
 * service and sidecar store run it; then Accept, a Lean refresh and the board's statuses.
 *
 *   (a) socrates  proved; G->D; the existence presupposition is the only question; Accept; Undo and Redo; then a
 *                 second example in the same model (plato) that reuses the accepted vocabulary
 *   (b) chain     a named lemma and a tactic proof; proved; a reason and a card the person typed while Claude worked
 *                 are kept by Accept (placed by card id, then re-checked)
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
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { NodeType, RunView, TlGraph } from '@telelean/core';
import { afterAll, describe, expect, it } from 'vitest';

import { createLeanCheckEngine } from '../../src/gate/index.js';
import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript, validateFakeScriptFile, type FakeScriptFile } from '../../src/llm/fakeScripts.js';
import type { LlmEvent } from '../../src/llm/types.js';
import { createProposalService, createRunSidecarStore } from '../../src/proposal/index.js';
import { createRunManager, DEFAULT_RUN_SETTINGS, type RunManager } from '../../src/run/index.js';
import { listRunDirs } from '../../src/shadow/index.js';
import { createModelWorkspace, fsEditApplier, fsTextSource, inspectFolder, planInitialize, type ModelWorkspace } from '../../src/workspace/index.js';
import { cleanup, makeTempDir, REPO_ROOT } from './helpers/env.js';
import { waitForRun } from './helpers/harness.js';

const FIXTURES = path.join(REPO_ROOT, 'test-fixtures', 'fresh');
const INBOX = 'Model/Demo/Inbox.lean';
const VOCABULARY = 'Model/Demo/Vocabulary.lean';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) cleanup(d);
});

interface FreshCard {
  type: NodeType;
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

/** The person types the script's cards in the A|D|G box (one `add-node` each), then the board refreshes. */
async function typeCards(f: Fresh, script: FreshScript): Promise<void> {
  for (const card of script.cards) {
    const outcome = await f.workspace.perform({ kind: 'add-node', subject: script.subject, type: card.type, naturalName: card.naturalName });
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

/** Presses "These suffice"; answers Claude's question (if it asks) as the script says. Resolves at the end of round 1. */
async function theseSuffice(f: Fresh, manager: RunManager, script: FreshScript): Promise<{ review: RunView; before: Record<string, string> }> {
  const started = await manager.start({ subject: script.subject, target: script.target, premises: script.premises });
  expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
  // From here on (the premises are declared) nothing may change the person's files until Accept.
  const before = modelTree(f.root);
  const first = await waitForRun(manager, (v) => v.state === 'waiting-for-answer' || v.state === 'review' || v.state === 'failed', 240_000, 'the question or the end of round 1');
  f.runIds.push(first.runId);
  if (first.state === 'waiting-for-answer') {
    expect(script.answer, 'the script asks a question, so it says how to answer it').toBeDefined();
    const answered = await manager.answer(first.runId, first.pendingQuestions?.id ?? '', [{ question: 0, choice: { kind: 'option', option: script.answer?.option ?? 0 }, scope: 'run' }]);
    expect(answered, JSON.stringify(answered)).toMatchObject({ ok: true });
  } else {
    expect(script.answer).toBeUndefined();
  }
  const review = await waitForRun(manager, (v) => v.state === 'review' || v.state === 'failed', 300_000, 'the end of round 1');
  expect(review.state, JSON.stringify({ error: review.error, notices: review.notices })).toBe('review');
  expect(modelTree(f.root)).toEqual(before);
  return { review, before };
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

/** Accepts the proposal with every lifecycle item ticked and every definition approved. */
async function acceptAll(f: Fresh, manager: RunManager, review: RunView): Promise<void> {
  const proposal = manager.proposal();
  expect(proposal).not.toBeNull();
  const accepted = await manager.accept(review.runId, proposal?.proposalId ?? '', proposal?.lifecycle.map((l) => l.id) ?? [], proposal?.definitions.map((d) => d.id) ?? []);
  expect(accepted, JSON.stringify(accepted)).toMatchObject({ ok: true });
  expect(manager.current()?.state).toBe('accepted');
}

/** After Accept and a refresh: the selected assumptions are formalised and assumed, Lean reports no error. */
async function refreshedGraph(f: Fresh, script: FreshScript): Promise<TlGraph> {
  expect(await f.workspace.refreshNow()).toMatchObject({ state: 'fresh' });
  const graph = f.workspace.graph(script.subject);
  expect(graph.diagnostics.filter((d) => d.severity === 'error'), JSON.stringify(graph.diagnostics)).toEqual([]);
  for (const id of script.premises) {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.type !== 'ASSUMPTION') continue;
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
 * The common path of a one-round script: a fresh folder, the cards, "These suffice", the expected verdict with the
 * expected questions and lifecycle item, Accept, a refresh; returns the refreshed graph.
 */
async function oneRound(
  name: string,
  git = true,
  beforeAccept?: (f: Fresh, script: FreshScript) => Promise<void>,
): Promise<{ f: Fresh; script: FreshScript; review: RunView; graph: TlGraph }> {
  const script = loadFresh(name);
  const f = await initialiseFolder(name, script.subject, script.today, git);
  await typeCards(f, script);
  const manager = newManager(f, script);
  const { review } = await theseSuffice(f, manager, script);
  expect(review.verdict, JSON.stringify(review.notices)).toBe(script.expect.verdict);
  neverRefused(await toolResults(f, review.runId), script.expect.failedChecks, script.expect.freezeRefusals);
  const proposal = manager.proposal();
  expect(proposal?.definitions.map((d) => d.name)).toEqual(script.expect.definitions);
  for (const d of proposal?.definitions ?? []) expect(d.kind, d.name).toBe('presupposition');
  const targetType = script.cards.find((c) => c.id === script.target)?.type;
  const proved = script.expect.verdict === 'proved';
  expect(proposal?.lifecycle.map((l) => [l.id, l.from, l.to, l.recommended])).toEqual(proved && targetType === 'GOAL' ? [['l1', 'GOAL', 'DERIVATION', true]] : []);
  if (script.expect.footprint !== undefined) expect(sorted(proposal?.report.footprint ?? [])).toEqual(sorted(script.expect.footprint));
  expect(proposal?.report.selfEvident).toBe(script.expect.selfEvident ?? false);
  await beforeAccept?.(f, script);
  await acceptAll(f, manager, review);
  const graph = await refreshedGraph(f, script);
  const target = graph.nodes.find((n) => n.id === script.target);
  expect(target?.status.formal).toBe('formalized');
  expect(target?.lean.binding).toBe('pinned');
  if (proved) {
    expect(target?.type).toBe('DERIVATION');
    expect(target?.status.proof).toEqual({ kind: 'proved', footprint: expect.arrayContaining(script.expect.footprint ?? []) as unknown as string[] });
  } else {
    expect(target?.type).toBe(targetType);
    expect(target?.status.proof).toEqual({ kind: 'none' });
  }
  return { f, script, review, graph };
}

describe('fresh models: a demo user\'s own example from "Initialize Model Here" to the refreshed board', () => {
  it('(a) socrates: proved; Accept writes the vocabulary and the formalisation; Undo/Redo; a second example reuses the vocabulary', async () => {
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
    expect(inbox).toMatch(/id: socrates-is-mortal\ntype: DERIVATION\nnatural_name: Socrates is mortal\npremises: all-humans-are-mortal, socrates-is-a-human\n/);
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
    const { review } = await theseSuffice(f, manager, plato);
    expect(review.verdict, JSON.stringify(review.notices)).toBe('proved');
    neverRefused(await toolResults(f, review.runId));
    expect(manager.proposal()?.definitions).toEqual([]);
    expect(sorted(manager.proposal()?.report.footprint ?? [])).toEqual(sorted(plato.expect.footprint ?? []));
    await acceptAll(f, manager, review);
    const after = await refreshedGraph(f, plato);
    for (const id of ['socrates-is-mortal', 'plato-is-mortal']) {
      const node = after.nodes.find((n) => n.id === id);
      expect(node?.type, id).toBe('DERIVATION');
      expect(node?.status.proof.kind, id).toBe('proved');
    }
    expect(after.vocabulary.find((v) => v.shortName === 'plato')?.kind).toBe('constant');
    expect(script.target).toBe('socrates-is-mortal');
    await finishFresh(f);
  });

  it('(b) chain: a named lemma and a tactic proof; proved; the card and the reason typed meanwhile are kept by Accept', async () => {
    // While Claude works the person keeps using the board: a reason on a premise (the board asks for one on every
    // assumption) and one more card. On a fresh Inbox both are within 3 lines of Claude's changes: turn 13 places them
    // by card id, so Accept rebases, re-checks and keeps them.
    const meanwhile = async (f: Fresh): Promise<void> => {
      expect(await f.workspace.perform({ kind: 'edit-node', id: 'tom-is-a-cat', field: 'rationale', value: 'I have seen him' })).toMatchObject({ ok: true });
      expect(await f.workspace.perform({ kind: 'add-node', subject: 'Demo', type: 'ASSUMPTION', naturalName: 'Jerry is a mouse' })).toMatchObject({ ok: true, nodeId: 'jerry-is-a-mouse' });
    };
    const { f, graph } = await oneRound('chain', true, meanwhile);
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    expect(inbox).toContain('theorem tom_is_a_mammal : Mammal tom :=');
    expect(inbox).toMatch(/id: tom-is-a-cat\ntype: ASSUMPTION\nnatural_name: Tom is a cat\nrationale: I have seen him\nasserted: 2026-11-10\nlean: Demo\.tom_is_a_cat\n-\/\n/);
    expect(inbox.indexOf('id: jerry-is-a-mouse')).toBeGreaterThan(inbox.indexOf('theorem tom_is_an_animal.holds'));
    expect(graph.nodes.find((n) => n.id === 'jerry-is-a-mouse')?.status.formal).toBe('informal');
    expect(graph.nodes.find((n) => n.id === 'tom-is-a-cat')?.rationale).toBe('I have seen him');
    // The lemma is proof-only vocabulary, never a question.
    expect(graph.vocabulary.find((v) => v.shortName === 'tom_is_a_mammal')?.kind).toBe('lemma');
    await finishFresh(f);
  });

  it('(c) penguin: a question; not proved with a suggestion; "I hold this" re-freezes and proves; Accept writes the card worded by Claude', async () => {
    const script = loadFresh('penguin');
    const f = await initialiseFolder('penguin', script.subject, script.today, true);
    await typeCards(f, script);
    const manager = newManager(f, script);
    const { review: r1, before } = await theseSuffice(f, manager, script);
    expect(r1.verdict, JSON.stringify(r1.notices)).toBe(script.expect.round1);
    expect(r1.ghosts).toHaveLength(1);
    expect(r1.ghosts[0]).toMatchObject({ id: 'ghost-1', closesGap: true, aloneEntails: false, state: 'suggested', leanStatement: script.expect.ghostStatement });
    expect(manager.proposal()?.definitions.map((d) => d.name)).toEqual(script.expect.definitions);
    const decisions = JSON.parse(readFileSync(path.join(f.root, '.telelean', 'subjects', 'Demo', 'decisions.json'), 'utf8')) as { decisions: Array<{ phenomenon: string }> };
    expect(decisions.decisions.map((d) => d.phenomenon)).toEqual(['genericity']);
    const adopted = await manager.adoptGhost(r1.runId, script.adopt?.ghost ?? '', script.adopt?.rationale);
    expect(adopted, JSON.stringify(adopted)).toMatchObject({ ok: true });
    const r2 = await waitForRun(manager, (v) => v.round === 2 && (v.state === 'review' || v.state === 'failed'), 300_000, 'round 2');
    expect(r2.verdict, JSON.stringify(r2.notices)).toBe(script.expect.round2);
    expect(modelTree(f.root)).toEqual(before);
    neverRefused(await toolResults(f, r2.runId));
    const proposal = manager.proposal();
    expect(proposal?.lifecycle.map((l) => l.id)).toEqual(['l1']);
    expect(proposal?.definitions.map((d) => d.name)).toEqual(script.expect.definitions);
    expect(sorted(proposal?.report.footprint ?? [])).toEqual(sorted(script.expect.footprint ?? []));
    await acceptAll(f, manager, r2);
    const inbox = readFileSync(path.join(f.root, INBOX), 'utf8');
    // The adopted card sits right before the target's block, worded by Claude, and joins the target's premises.
    const ghostAt = inbox.indexOf('natural_name: Every penguin is a bird');
    expect(ghostAt).toBeGreaterThan(inbox.indexOf('natural_name: Tweety is a penguin'));
    expect(ghostAt).toBeLessThan(inbox.indexOf('natural_name: Tweety can fly'));
    expect(inbox).toContain('worded_by: agent');
    expect(inbox).toContain('rationale: penguins are birds');
    expect(inbox).toMatch(/id: tweety-can-fly\ntype: DERIVATION\nnatural_name: Tweety can fly\npremises: all-birds-can-fly, tweety-is-a-penguin, every-penguin-is-a-bird\n/);
    const graph = await refreshedGraph(f, script);
    const ghost = graph.nodes.find((n) => n.id === script.expect.ghostNode);
    expect(ghost?.type).toBe('ASSUMPTION');
    expect(ghost?.status.proof.kind).toBe('assumed');
    const target = graph.nodes.find((n) => n.id === script.target);
    expect(target?.type).toBe('DERIVATION');
    expect(target?.status.proof.kind).toBe('proved');
    expect(target?.premises).toContain(script.expect.ghostNode);
    expect(graph.diagnostics.filter((d) => d.nodeId === script.target && d.code === 'TL107')).toEqual([]);
    await finishFresh(f);
  });

  it('(d) zero premises, not self-evident: not proved; Accept keeps the formalisation; the goal stays a goal (no git history)', async () => {
    const { f, review, graph } = await oneRound('self-evident-not', false);
    expect(review.ghosts).toEqual([]);
    expect(readFileSync(path.join(f.root, INBOX), 'utf8')).toContain('abbrev pingu_can_swim : Prop := CanSwim pingu\n');
    expect(readFileSync(path.join(f.root, INBOX), 'utf8')).not.toContain('.holds');
    expect(graph.nodes.map((n) => [n.id, n.type])).toEqual([['pingu-can-swim', 'GOAL']]);
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

  it('(i) an intermediate step typed as a Derivation and selected: proved after the freeze and used; both proofs accepted', async () => {
    const { f, graph } = await oneRound('derivation-premise');
    const step = graph.nodes.find((n) => n.id === 'tom-is-a-mammal');
    expect(step?.type).toBe('DERIVATION');
    expect(step?.status.proof.kind).toBe('proved');
    await finishFresh(f);
  });

  it('(g) arithmetic with zero premises: proved and flagged self-evident (declarations that mention no constant get facts)', async () => {
    const { f, graph } = await oneRound('arith');
    expect(graph.nodes.find((n) => n.id === 'two-plus-two-is-four')?.status.flags).toContain('self-evident');
    expect(graph.vocabulary.find((v) => v.shortName === 'four_eq')?.kind).toBe('lemma');
    await finishFresh(f);
  });
});
