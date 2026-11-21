/**
 * Fakes for the RunManager's other collaborators (WP3 tests): the proposal service and sidecar store (WP4's are stubs
 * until integration), and an in-memory ModelWorkspace built from the Spyro fixture with core's real (M1) parser,
 * project model, board graph and planner, plus the recorded Spyro Lean facts, so the context bundle and
 * `set-premises` behave as on the real board.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  buildProjectModel,
  parseLeanFile,
  planAction,
  subjectGraph,
  type ActionOutcome,
  type AttemptRecord,
  type AttemptResolution,
  type AttemptSummary,
  type BoardAction,
  type DecisionRecord,
  type DecisionsFile,
  type FileChange,
  type LeanFacts,
  type ProjectModel,
  type ProposalView,
  type TlGraph,
} from '@telelean/core';

import type { AcceptPlan, AcceptRequest, ApplyRequest, ProposalBuildInput, ProposalService, ReadRealText, RunSidecarStore } from '../../../src/proposal/types.js';
import type { ShadowWorkspace } from '../../../src/shadow/types.js';
import type { ExternalChangeSet, ModelWorkspace, WorkspaceChange } from '../../../src/workspace/types.js';
import { SPYRO_FACTS, SPYRO_FIXTURE } from './env.js';

// ---------------------------------------------------------------------------------------------
// Proposals

export interface RecordedBuild {
  input: ProposalBuildInput;
  /** ws/ at the moment the proposal was built. */
  files: Map<string, string>;
}

export class FakeProposals implements ProposalService {
  readonly builds: RecordedBuild[] = [];
  readonly plans: AcceptRequest[] = [];
  readonly applied: Array<Extract<AcceptPlan, { ok: true }>> = [];
  drift: string[] = [];
  definitions: ProposalView['definitions'] = [];
  /** Replaces the default plan (ok, no changes). */
  onPlan?: (request: AcceptRequest, call: number) => AcceptPlan | Promise<AcceptPlan>;
  applyOutcome: ActionOutcome | undefined;
  readonly log: string[];

  constructor(log: string[] = []) {
    this.log = log;
  }

  async build(input: ProposalBuildInput): Promise<ProposalView> {
    this.log.push('proposals.build');
    this.builds.push({ input, files: await input.shadow.currentFiles() });
    const target = input.selection.target;
    return {
      runId: input.runId,
      proposalId: input.proposalId,
      round: input.round,
      subject: input.selection.subject,
      graph: input.currentGraph,
      diff: { nodes: {}, vocabulary: {}, edges: { added: [], removed: [] }, counts: { added: 0, changed: 0, removed: 0, vocabularyAdded: 0 } },
      files: [],
      review: [],
      definitions: this.definitions,
      ghosts: [...input.ghosts],
      report: {
        verdict: input.verdict,
        target,
        footprint: input.verdict === 'proved' ? ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'] : [],
        unusedPremises: [],
        consistency: 'unchecked',
        selfEvident: false,
        ...(input.finish !== undefined ? { claudeSummary: input.finish.summary } : {}),
        assumedWithoutAsking: input.finish?.assumed_without_asking ?? [],
        gateAttempts: [...input.gateAttempts],
        usage: input.usage,
        durationMs: input.durationMs,
        agentMs: input.agentMs,
        ...(input.reverted !== undefined ? { reverted: input.reverted } : {}),
      },
      baseChanged: input.drift.length > 0,
      empty: false,
    };
  }

  async baseDrift(_shadow: ShadowWorkspace, _readReal: ReadRealText, _realFiles?: readonly string[]): Promise<string[]> {
    this.log.push('proposals.baseDrift');
    return [...this.drift];
  }

  async planAccept(request: AcceptRequest): Promise<AcceptPlan> {
    this.log.push(`proposals.planAccept${request.shownState !== undefined ? '(shownState)' : ''}`);
    this.plans.push(request);
    if (this.onPlan !== undefined) return this.onPlan(request, this.plans.length);
    const shadowState = request.shownState !== undefined ? new Map(request.shownState) : await request.shadow.currentFiles();
    return { ok: true, changes: [], label: 'These suffice → proved: Cynder would not be a good addition to the new…', nodes: [request.proposal.report.target], drift: [...this.drift], shadowState };
  }

  /** Slice 2b3b: an edit session's Apply plan (no default: a test that reaches it scripts `onPlanApply`). */
  onPlanApply?: (request: ApplyRequest) => AcceptPlan | Promise<AcceptPlan>;

  async planApply(request: ApplyRequest): Promise<AcceptPlan> {
    this.log.push('proposals.planApply');
    if (this.onPlanApply === undefined) throw new Error('FakeProposals.planApply is not scripted');
    return this.onPlanApply(request);
  }

  async apply(plan: Extract<AcceptPlan, { ok: true }>, workspace: ModelWorkspace, subject: string): Promise<ActionOutcome> {
    this.log.push('proposals.apply');
    this.applied.push(plan);
    if (this.applyOutcome !== undefined) return this.applyOutcome;
    if (workspace.applyChanges !== undefined && plan.changes.length > 0) {
      return workspace.applyChanges({ label: plan.label, action: 'accept-proposal', subject, nodes: plan.nodes, changes: plan.changes });
    }
    return { ok: true, label: plan.label, undoable: true };
  }

  async diffFiles(shadow: ShadowWorkspace): Promise<FileChange[]> {
    return shadow.changes();
  }
}

// ---------------------------------------------------------------------------------------------
// Sidecars

export class FakeSidecars implements RunSidecarStore {
  readonly attempts: AttemptRecord[] = [];
  readonly resolutions: AttemptResolution[] = [];
  readonly decisions: DecisionRecord[] = [];
  /** What readDecisions returns (decisions recorded in this store are appended to it). */
  preset: DecisionRecord[] = [];

  async appendAttempt(_root: string, record: AttemptRecord): Promise<void> {
    this.attempts.push(structuredClone(record));
  }

  async resolveAttempt(_root: string, _subject: string, resolution: AttemptResolution): Promise<void> {
    this.resolutions.push(structuredClone(resolution));
  }

  async recordDecisions(_root: string, _subject: string, records: readonly DecisionRecord[]): Promise<void> {
    this.decisions.push(...structuredClone([...records]));
  }

  async readAttempts(): Promise<AttemptSummary[]> {
    return this.attempts.map((a) => ({ ...a }));
  }

  async readDecisions(): Promise<DecisionsFile> {
    return { format: 'telelean-decisions', version: 1, decisions: [...this.preset, ...this.decisions] };
  }
}

// ---------------------------------------------------------------------------------------------
// Workspace

function readTree(dir: string, rel = ''): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const name of readdirSync(path.join(dir, rel))) {
    if (name.startsWith('.')) continue;
    const child = rel === '' ? name : `${rel}/${name}`;
    const st = statSync(path.join(dir, child));
    if (st.isDirectory()) out.push(...readTree(dir, child));
    else out.push([child, readFileSync(path.join(dir, child), 'utf8')]);
  }
  return out;
}

const PROJECT_FILES = new Set(['lakefile.toml', 'lakefile.lean', 'lean-toolchain', 'lake-manifest.json']);

export class FakeWorkspace implements ModelWorkspace {
  readonly texts: Map<string, string>;
  facts: LeanFacts | undefined;
  readonly performed: BoardAction[] = [];
  readonly appliedChanges: ExternalChangeSet[] = [];
  readonly reloaded: string[] = [];
  /** Replaces perform's outcome (e.g. a refusal). */
  performOutcome: ActionOutcome | undefined;
  readonly log: string[];
  private version = 1;

  constructor(
    readonly root: string,
    options: { source?: string; withFacts?: boolean; log?: string[] } = {},
  ) {
    this.texts = new Map(readTree(options.source ?? SPYRO_FIXTURE).filter(([rel]) => rel.endsWith('.lean') || PROJECT_FILES.has(rel)));
    this.facts = options.withFacts === false ? undefined : (JSON.parse(readFileSync(SPYRO_FACTS, 'utf8')) as LeanFacts);
    this.log = options.log ?? [];
  }

  library(): string {
    return 'Model';
  }

  modelFiles(): string[] {
    return [...this.texts.keys()].sort();
  }

  async readText(rel: string): Promise<string | null> {
    return this.texts.get(rel) ?? null;
  }

  projectModel(): ProjectModel {
    const files = [...this.texts.entries()].filter(([rel]) => rel.endsWith('.lean')).map(([rel, text]) => parseLeanFile(rel, text));
    const fileHashes = Object.fromEntries([...this.texts.entries()].map(([rel, text]) => [rel, createHash('sha256').update(text, 'utf8').digest('hex')]));
    const lakefile = this.texts.get('lakefile.toml');
    return buildProjectModel({
      files,
      fileHashes,
      library: 'Model',
      ...(this.facts !== undefined ? { facts: this.facts } : {}),
      ...(lakefile !== undefined ? { lakefile: { path: 'lakefile.toml', text: lakefile } } : {}),
    });
  }

  graph(subject: string): TlGraph {
    const model = this.projectModel();
    if (!model.subjects.some((s) => s.name === subject)) throw new Error(`unknown subject ${subject}`);
    return subjectGraph(model, subject, { version: this.version++, semantic: { state: this.facts !== undefined ? 'fresh' : 'unavailable' } });
  }

  async perform(action: BoardAction): Promise<ActionOutcome> {
    this.log.push(`workspace.perform:${action.kind}`);
    this.performed.push(structuredClone(action));
    if (this.performOutcome !== undefined) return this.performOutcome;
    const plan = planAction(this.projectModel(), action, { today: '2026-11-01', now: '2026-11-01T00:00:00.000Z', layouts: {} });
    for (const c of plan.changes) {
      if (c.after === null) this.texts.delete(c.path);
      else this.texts.set(c.path, c.after);
    }
    return { ok: true, label: plan.label, undoable: true };
  }

  async applyChanges(set: ExternalChangeSet): Promise<ActionOutcome> {
    this.log.push('workspace.applyChanges');
    this.appliedChanges.push(structuredClone(set));
    for (const c of set.changes) {
      if ((this.texts.get(c.path) ?? null) !== c.before) return { ok: false, code: 'conflict', error: `${c.path} changed` };
    }
    for (const c of set.changes) {
      if (c.after === null) this.texts.delete(c.path);
      else this.texts.set(c.path, c.after);
    }
    return { ok: true, label: set.label, undoable: true };
  }

  async reloadAttempts(subject: string): Promise<void> {
    this.reloaded.push(subject);
  }

  // ---- M1 members the RunManager does not use
  async load(): Promise<void> {}
  subjects() {
    return this.projectModel().subjects.map((s) => ({ ...s }));
  }
  async workspaceState() {
    return { rootName: 'model', subjects: [], subject: 'Spyro', undo: null, redo: null, history: { state: 'disabled' as const } };
  }
  semantic() {
    return { state: 'fresh' as const };
  }
  onDidChange(_listener: (change: WorkspaceChange) => void) {
    return { dispose: () => undefined };
  }
  async invalidate(): Promise<void> {}
  requestRefresh(): void {}
  async refreshNow() {
    return { state: 'fresh' as const };
  }
  async undo(): Promise<ActionOutcome> {
    return { ok: false, code: 'not-yet', error: 'fake' };
  }
  async redo(): Promise<ActionOutcome> {
    return { ok: false, code: 'not-yet', error: 'fake' };
  }
  async historyStatus() {
    return { state: 'disabled' as const };
  }
  async listHistory(subject: string) {
    return { subject, entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false };
  }
  async historyDiff(): Promise<never> {
    throw new Error('fake');
  }
  async revert(): Promise<ActionOutcome> {
    return { ok: false, code: 'not-yet', error: 'fake' };
  }
  async prune(subject: string) {
    return { subject, entries: [], storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} }, more: false };
  }
  async initGit() {
    return { state: 'disabled' as const };
  }
  dispose(): void {}
}
