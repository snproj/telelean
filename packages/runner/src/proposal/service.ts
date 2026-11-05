/**
 * The proposal service (WP4; docs/m2-plan.md sections 4.5 and 7; contracts in ./types.ts):
 *
 *   build       the shown shadow state (ws/ now: model files only) parsed with core + the check's Lean facts ->
 *               buildProjectModel -> subjectGraph (column order taken from the current board) -> diffGraphs against
 *               the current board; files summary (base -> shown, line counts); one StatementReview per statement
 *               abbrev that is new or changed against the run's base B (adopted ghosts included, `wordedBy` from the
 *               block); one VocabularyReview of the new pure-signature items (sorts, predicates, functions,
 *               constants); the flagged definitions as questions d1, d2, …; the lifecycle item l1 (GOAL ->
 *               DERIVATION) when the verdict is `proved` and Lean shows the GOAL target proved; ghosts; the report
 *               card; baseChanged; empty. The facts are kept for Accept (in memory and in the run directory).
 *   baseDrift   real model files (open buffers first) that differ from B, plus files the user added or deleted
 *   planAccept  every model file: Claude's base -> shown patch rebased onto the real text (./files.ts mergeFile), or,
 *               after a passing re-gate, exactly `shownState`; then the ticked lifecycle items (core
 *               lifecycleChanges on the merged files with the shown state's facts); changes against the real files
 *   apply       ModelWorkspace.applyChanges with history kind `accept-proposal`
 *   diffFiles   base -> shown, for the raw diff
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ACCEPT_PROPOSAL_ACTION,
  ActionError,
  buildProjectModel,
  diffGraphs,
  lifecycleChanges,
  parseLeanFile,
  proposalLabel,
  subjectGraph,
  type ActionOutcome,
  type DefinitionQuestion,
  type FileChange,
  type LeanFacts,
  type Layout,
  type LifecycleItem,
  type ModelNode,
  type ProjectModel,
  type ProposalView,
  type ReportCard,
  type ReviewItem,
  type SemanticSummary,
  type StatementReview,
  type TlGraph,
  type TlNode,
  type VocabKind,
  type VocabularyReview,
} from '@telelean/core';

import type { ShadowWorkspace } from '../shadow/types.js';
import { isModelFile, isModelOrProjectFile, listModelFiles, PROJECT_FILES } from '../workspace/files.js';
import { summarize } from '../workspace/semanticSummary.js';
import type { ModelWorkspace } from '../workspace/types.js';
import { conflictMessage, diffFileMaps, listing, mergeFile, proposalFileOf, shadowFilesOf } from './files.js';
import type { AcceptPlan, AcceptRequest, ProposalBuildInput, ProposalCore, ProposalService, ReadRealText } from './types.js';

/** Vocabulary kinds D-3 auto-approves (revocable): the VocabularyReview lists new items of these kinds only. */
const PURE_SIGNATURE: ReadonlySet<VocabKind> = new Set<VocabKind>(['sort', 'predicate', 'function', 'constant']);

/** The lifecycle item a proved GOAL target gets (docs/m2-plan.md section 4.5). */
export const PROVED_GOAL_REASON = 'Lean proved it from the selected premises';

/** The file in the run directory that keeps the facts of the newest proposal (so Accept works after a reload). */
export const PROPOSAL_FACTS_FILE = 'proposal-facts.json';
const PROPOSAL_FACTS_FORMAT = 'telelean-proposal-facts';

let tempCounter = 0;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Defaults overridden only by the members that are actually set. */
function withDefaults<T extends object>(defaults: T, partial: Partial<T> | undefined): T {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(partial ?? {})) if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

const unique = (items: Iterable<string>): string[] => [...new Set(items)];

/** The source text of a syntactic declaration (docstring, attributes and modifiers included). */
function declText(model: ProjectModel, located: { file: string; decl: { span: { start: number; end: number } } }): string | undefined {
  const text = model.files.get(located.file)?.text;
  return text === undefined ? undefined : text.slice(located.decl.span.start, located.decl.span.end);
}

/** The source text of a statement without its docstring (what the review shows when Lean could not print it). */
function statementSource(model: ProjectModel, located: NonNullable<ModelNode['statementDecl']>): string {
  const text = model.files.get(located.file)?.text ?? '';
  const start = located.decl.docSpan?.end ?? located.decl.span.start;
  return text.slice(start, located.decl.span.end).trim();
}

/** A declaration of the model by fully-qualified name (the first one in file order). */
function findDecl(model: ProjectModel, name: string): { file: string; decl: NonNullable<ModelNode['statementDecl']>['decl'] } | undefined {
  for (const [file, parsed] of model.files) {
    const decl = parsed.decls.find((d) => d.fullName === name);
    if (decl) return { file, decl };
  }
  return undefined;
}

/** The column order of the current board as a layout, so cards keep their places in the proposed board. */
function layoutOf(graph: TlGraph): Layout {
  const columns: Layout['columns'] = { ASSUMPTION: [], DERIVATION: [], GOAL: [] };
  for (const node of graph.nodes) columns[node.type].push(node.id);
  return { format: 'telelean-layout', version: 1, columns };
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** ActionError codes that an AcceptPlan refusal can carry. */
function planRefusal(error: ActionError): Extract<AcceptPlan, { ok: false }> {
  const code = error.code === 'not-found' || error.code === 'conflict' || error.code === 'invalid' ? error.code : 'unsafe';
  return { ok: false, code, error: error.message };
}

interface KeptFacts {
  proposalId: string;
  facts: LeanFacts;
}

export class ProposalServiceImpl implements ProposalService {
  private readonly core: ProposalCore;
  private readonly now: () => Date;
  /** Per run: the facts of its newest proposal (also persisted in the run directory, PROPOSAL_FACTS_FILE). */
  private readonly kept = new Map<string, KeptFacts>();

  constructor(options: { now?: () => Date; core?: Partial<ProposalCore> } = {}) {
    this.now = options.now ?? (() => new Date());
    this.core = withDefaults<ProposalCore>({ diffGraphs, proposalLabel, lifecycleChanges, parseLeanFile, buildProjectModel, subjectGraph }, options.core);
  }

  // ------------------------------------------------------------------------------------------- build

  async build(input: ProposalBuildInput): Promise<ProposalView> {
    const { shadow, selection } = input;
    const library = shadow.library;
    const subject = selection.subject;
    const [baseAll, currentAll] = await Promise.all([shadow.baseFiles(), shadow.currentFiles()]);
    const base = shadowFilesOf(baseAll, library);
    const shown = shadowFilesOf(currentAll, library);
    const facts = input.check.facts;
    const model = this.modelOf(shown, library, facts);
    const baseModel = this.modelOf(base, library, undefined);

    const proposed = this.core.subjectGraph(model, subject, {
      version: input.graphVersion,
      semantic: this.semanticOf(model, shown, facts),
      layout: layoutOf(input.currentGraph),
    });
    const graph: TlGraph = {
      ...proposed,
      version: input.graphVersion,
      ...(input.currentGraph.attempts !== undefined ? { attempts: input.currentGraph.attempts.map((a) => ({ ...a })) } : {}),
    };
    const diff = this.core.diffGraphs(input.currentGraph, graph);
    const changes = diffFileMaps(base, shown);

    const statements = this.statementReviews(graph, model, baseModel, input);
    const vocabulary = this.vocabularyReview(graph, baseModel);
    const review: ReviewItem[] = [...statements, ...(vocabulary.items.length > 0 ? [vocabulary] : [])];
    const definitions: DefinitionQuestion[] = input.flaggedDefinitions.map((flagged, index) => {
      const located = flagged.code === undefined || flagged.gloss === undefined ? findDecl(model, flagged.name) : undefined;
      const gloss = flagged.gloss ?? located?.decl.docstring;
      return {
        id: `d${index + 1}`,
        name: flagged.name,
        kind: flagged.kind,
        code: flagged.code ?? (located ? (declText(model, located) ?? '') : ''),
        usedByStatementsOf: [...flagged.usedByStatementsOf],
        ...(gloss !== undefined ? { gloss } : {}),
      };
    });

    const target = graph.nodes.find((n) => n.id === selection.target);
    const lifecycle: LifecycleItem[] = [];
    if (input.verdict === 'proved' && target?.type === 'GOAL' && target.status.proof.kind === 'proved') {
      lifecycle.push({ id: 'l1', kind: 'change-kind', nodeId: target.id, from: 'GOAL', to: 'DERIVATION', recommended: true, reason: PROVED_GOAL_REASON });
    }

    const proposal: ProposalView = {
      runId: input.runId,
      proposalId: input.proposalId,
      round: input.round,
      subject,
      graph,
      diff,
      files: changes.map(proposalFileOf),
      review,
      definitions,
      lifecycle,
      ghosts: input.ghosts.map((g) => ({ ...g })),
      report: this.reportCard(input, graph, target),
      baseChanged: input.drift.length > 0,
      empty: changes.length === 0,
    };
    if (facts) await this.keepFacts(shadow, input.proposalId, facts);
    return proposal;
  }

  /** One StatementReview per node of the proposed board whose statement abbrev is new or changed against B. */
  private statementReviews(graph: TlGraph, model: ProjectModel, baseModel: ProjectModel, input: ProposalBuildInput): StatementReview[] {
    const out: StatementReview[] = [];
    for (const node of graph.nodes) {
      const now = model.nodes.get(node.id)?.statementDecl;
      if (!now) continue;
      const leanName = node.lean.statement ?? now.decl.fullName;
      if (leanName === undefined) continue;
      const baseNode = baseModel.nodes.get(node.id);
      const before = baseNode?.statementDecl;
      let change: StatementReview['change'] | undefined;
      if (!before) change = 'new';
      else if (declText(baseModel, before) !== declText(model, now) || (baseNode?.node.lean.statement ?? before.decl.fullName) !== leanName) change = 'changed';
      if (change === undefined) continue;
      const rendered = input.rendered.find((r) => r.name === leanName && r.error === undefined);
      const source = statementSource(model, now);
      out.push({
        kind: 'statement',
        nodeId: node.id,
        sentence: node.naturalName,
        wordedBy: node.provenance.wordedBy,
        leanName,
        pretty: rendered?.pretty ?? source,
        explicit: rendered?.explicit ?? source,
        closure: this.closureOf(model, node),
        change,
      });
    }
    return out;
  }

  /** The statement closure (`LeanBinding.uses`) with kinds, types and glosses. */
  private closureOf(model: ProjectModel, node: TlNode): StatementReview['closure'] {
    const vocabulary = new Map(model.vocabulary.map((v) => [v.name, v]));
    return (node.lean.uses ?? []).map((name) => {
      const item = vocabulary.get(name);
      if (item) return stripUndefined({ name, kind: item.kind, type: item.type, gloss: item.gloss, glossBy: item.glossBy });
      const owner = model.ownerOfDecl.get(name);
      const card = owner !== undefined ? model.nodes.get(owner)?.node : undefined;
      const facts = model.declFacts.get(name);
      if (card) return stripUndefined({ name, kind: 'statement', type: facts?.type, gloss: card.naturalName, glossBy: card.provenance.wordedBy });
      return stripUndefined({ name, kind: facts?.kind ?? 'other', type: facts?.type, gloss: facts?.docstring });
    });
  }

  /** New pure-signature vocabulary of the subject: items declared in the shown state but not in B. */
  private vocabularyReview(graph: TlGraph, baseModel: ProjectModel): VocabularyReview {
    const baseNames = new Set<string>();
    for (const file of baseModel.files.values()) for (const decl of file.decls) if (decl.fullName) baseNames.add(decl.fullName);
    const items = graph.vocabulary
      .filter((v) => PURE_SIGNATURE.has(v.kind) && !baseNames.has(v.name))
      .map((v) => stripUndefined({ name: v.name, vocabKind: v.kind, type: v.type, gloss: v.gloss, code: v.code }));
    return { kind: 'vocabulary', items };
  }

  private reportCard(input: ProposalBuildInput, graph: TlGraph, target: TlNode | undefined): ReportCard {
    const { selection, finish } = input;
    const proved = input.verdict === 'proved';
    const proof = target?.status.proof;
    const footprint = proved && proof?.kind === 'proved' ? [...proof.footprint] : [];
    // A selected proved derivation shows in the footprint through its own assumptions: its verified edge into the
    // target says that the proof uses it.
    const used = new Set([...footprint, ...graph.edges.filter((e) => e.type === 'verified' && e.target === selection.target).map((e) => e.source)]);
    const selected = unique([...selection.premises, ...selection.adoptedGhosts]);
    return {
      verdict: input.verdict,
      target: selection.target,
      footprint,
      unusedPremises: proved ? selected.filter((p) => !used.has(p)) : [],
      consistency: 'unchecked',
      selfEvident: proved && proof?.kind === 'proved' && selected.length === 0 && footprint.every((x) => x.startsWith('presup:')),
      ...(finish?.summary !== undefined ? { claudeSummary: finish.summary } : {}),
      ...(finish?.gap !== undefined ? { gap: finish.gap } : {}),
      ...(finish?.conflict !== undefined ? { conflict: [...finish.conflict] } : {}),
      assumedWithoutAsking: [...(finish?.assumed_without_asking ?? [])],
      gateAttempts: input.gateAttempts.map((a) => ({ ...a, failures: a.failures.map((f) => ({ ...f })) })),
      usage: { ...input.usage, ...(input.usage.rateLimit ? { rateLimit: { ...input.usage.rateLimit } } : {}) },
      durationMs: input.durationMs,
      agentMs: input.agentMs,
      ...(input.reverted ? { reverted: { ...input.reverted } } : {}),
    };
  }

  // ------------------------------------------------------------------------------------------- drift and Accept

  async baseDrift(shadow: ShadowWorkspace, readReal: ReadRealText, realFiles?: readonly string[]): Promise<string[]> {
    const base = shadowFilesOf(await shadow.baseFiles(), shadow.library);
    const paths = new Set([...base.keys(), ...(realFiles ?? []).filter((rel) => isModelOrProjectFile(rel, shadow.library))]);
    const out: string[] = [];
    for (const rel of [...paths].sort()) if ((await readReal(rel)) !== (base.get(rel) ?? null)) out.push(rel);
    return out;
  }

  async planAccept(request: AcceptRequest): Promise<AcceptPlan> {
    const { proposal, shadow } = request;
    const library = shadow.library;
    const known = new Set(proposal.lifecycle.map((item) => item.id));
    const unknown = request.lifecycle.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return { ok: false, code: 'not-found', error: `${listing(unknown)} ${unknown.length === 1 ? 'is not a lifecycle item' : 'are not lifecycle items'} of this proposal.` };
    }
    const ticked = proposal.lifecycle.filter((item) => request.lifecycle.includes(item.id));

    const base = shadowFilesOf(await shadow.baseFiles(), library);
    const shown = shadowFilesOf(request.shownState ?? (await shadow.currentFiles()), library);
    const realPaths = new Set([...base.keys(), ...shown.keys(), ...(await this.realFileList(request, shadow))]);
    const real = new Map<string, string | null>();
    for (const rel of [...realPaths].sort()) real.set(rel, await request.readReal(rel));
    const drift = [...realPaths].filter((rel) => (real.get(rel) ?? null) !== (base.get(rel) ?? null)).sort();

    // The merged files (every file present after Accept, lifecycle items not yet applied).
    const merged = new Map<string, string>();
    for (const [rel, text] of real) if (text !== null) merged.set(rel, text);
    if (request.shownState) {
      // After a passing re-gate: exactly the re-gated files (a real file absent from them is left alone). The re-gate
      // judged them against the user's files at the `accept-base` commit: a file the user changed again since then
      // keeps the user's text when the re-gated state left it as it was, and is a conflict otherwise (never lost).
      const acceptBase = await shadow.lastCommit(['accept-base']);
      const judged = acceptBase ? shadowFilesOf(await shadow.filesAt(acceptBase.id), library) : undefined;
      const changedSince: string[] = [];
      for (const [rel, text] of shown) {
        const now = real.get(rel) ?? null;
        if (judged !== undefined && now !== (judged.get(rel) ?? null)) {
          if (text === (judged.get(rel) ?? null)) continue; // untouched by the rebase: keep the user's newer text
          changedSince.push(rel);
          continue;
        }
        merged.set(rel, text);
      }
      if (changedSince.length > 0) {
        return {
          ok: false,
          code: 'conflict',
          error: `You changed ${listing(changedSince)} while telelean re-checked the proposal; press Accept again to include your edits.`,
          files: changedSince,
        };
      }
    } else {
      const conflicts: string[] = [];
      for (const rel of [...realPaths].sort()) {
        const result = mergeFile(rel, base.get(rel) ?? null, shown.get(rel) ?? null, real.get(rel) ?? null);
        if (!result.ok) conflicts.push(rel);
        else if (result.text === null) merged.delete(rel);
        else merged.set(rel, result.text);
      }
      if (conflicts.length > 0) return { ok: false, code: 'conflict', error: conflictMessage(conflicts), files: conflicts };
    }

    const final = new Map(merged);
    if (ticked.length > 0) {
      const facts = request.facts ?? (await this.factsFor(proposal, shadow));
      let lifecycle: FileChange[];
      try {
        lifecycle = this.core.lifecycleChanges(this.modelOf(merged, library, facts), ticked);
      } catch (error) {
        if (error instanceof ActionError) return planRefusal(error);
        throw error;
      }
      for (const change of lifecycle) {
        if (!isModelFile(change.path, library) || (merged.get(change.path) ?? null) !== change.before) {
          return { ok: false, code: 'unsafe', error: `The lifecycle change to ${change.path} does not fit the merged files; nothing was applied.` };
        }
        if (change.after === null) final.delete(change.path);
        else final.set(change.path, change.after);
      }
    }

    const changes: FileChange[] = [];
    for (const rel of [...new Set([...real.keys(), ...final.keys()])].sort()) {
      const before = real.get(rel) ?? null;
      const after = final.get(rel) ?? null;
      if (before !== after) changes.push({ path: rel, before, after });
    }
    const target = proposal.report.target;
    const sentence = proposal.graph.nodes.find((n) => n.id === target)?.naturalName ?? target;
    const adopted = proposal.ghosts.filter((g) => g.state === 'adopted');
    const label = this.core.proposalLabel(proposal.report.verdict, sentence, {
      lifecycle: ticked.length,
      adoptedGhosts: adopted.length,
      ...(request.premises !== undefined ? { premises: request.premises } : {}),
    });
    const nodes = unique([
      target,
      ...proposal.review.flatMap((item) => (item.kind === 'statement' ? [item.nodeId] : [])),
      ...adopted.flatMap((g) => (g.nodeId !== undefined ? [g.nodeId] : [])),
      ...ticked.map((item) => item.nodeId),
    ]);
    return { ok: true, changes, label, nodes, drift, shadowState: merged };
  }

  async apply(plan: Extract<AcceptPlan, { ok: true }>, workspace: ModelWorkspace, subject: string): Promise<ActionOutcome> {
    if (typeof workspace.applyChanges !== 'function') {
      return { ok: false, code: 'internal', error: 'This model workspace cannot apply proposals (it lacks the M2 members).' };
    }
    try {
      return await workspace.applyChanges({ label: plan.label, action: ACCEPT_PROPOSAL_ACTION, subject, nodes: plan.nodes, changes: plan.changes });
    } catch (error) {
      return { ok: false, code: 'internal', error: errorMessage(error) };
    }
  }

  async diffFiles(shadow: ShadowWorkspace, proposal: ProposalView): Promise<FileChange[]> {
    void proposal; // in review ws/ holds exactly the state the proposal shows
    const [base, current] = await Promise.all([shadow.baseFiles(), shadow.currentFiles()]);
    return diffFileMaps(shadowFilesOf(base, shadow.library), shadowFilesOf(current, shadow.library));
  }

  // ------------------------------------------------------------------------------------------- internals

  /** Core's project model of model files (path -> text) with optional facts, as the workspace builds it. */
  private modelOf(files: ReadonlyMap<string, string>, library: string, facts: LeanFacts | undefined): ProjectModel {
    const paths = [...files.keys()].filter((rel) => isModelFile(rel, library)).sort();
    const parsed = paths.map((rel) => this.core.parseLeanFile(rel, files.get(rel) ?? ''));
    const fileHashes = Object.fromEntries(paths.map((rel) => [rel, sha256(files.get(rel) ?? '')]));
    const lakefileName = ['lakefile.lean', 'lakefile.toml'].find((rel) => files.has(rel));
    return this.core.buildProjectModel({
      files: parsed,
      fileHashes,
      library,
      ...(facts ? { facts } : {}),
      ...(lakefileName !== undefined ? { lakefile: { path: lakefileName, text: files.get(lakefileName) ?? '' } } : {}),
    });
  }

  private semanticOf(model: ProjectModel, shown: ReadonlyMap<string, string>, facts: LeanFacts | undefined): SemanticSummary {
    const fileHashes = Object.fromEntries([...model.files.keys()].map((rel) => [rel, sha256(shown.get(rel) ?? '')]));
    return summarize({
      enabled: true,
      running: false,
      fileHashes,
      ...(facts
        ? {
            facts,
            last: stripUndefined({ status: facts.status, detail: facts.detail, toolchain: facts.toolchain, durationMs: facts.build.durationMs + facts.check.durationMs }),
          }
        : {}),
    });
  }

  /** The real model and project files to consider: the caller's list, else the model root's files on disk. */
  private async realFileList(request: AcceptRequest, shadow: ShadowWorkspace): Promise<string[]> {
    if (request.realFiles) return request.realFiles.filter((rel) => isModelOrProjectFile(rel, shadow.library));
    return [...(await listModelFiles(shadow.root, shadow.library)), ...PROJECT_FILES];
  }

  private async keepFacts(shadow: ShadowWorkspace, proposalId: string, facts: LeanFacts): Promise<void> {
    this.kept.set(shadow.runId, { proposalId, facts });
    const file = path.join(shadow.paths.runDir, PROPOSAL_FACTS_FILE);
    const temp = `${file}.${process.pid}-${++tempCounter}.tmp`;
    try {
      await mkdir(shadow.paths.runDir, { recursive: true });
      await writeFile(temp, `${JSON.stringify({ format: PROPOSAL_FACTS_FORMAT, version: 1, proposalId, savedAt: this.now().toISOString(), facts })}\n`, 'utf8');
      await rename(temp, file);
    } catch {
      await rm(temp, { force: true }).catch(() => undefined);
      // Best effort: without the file, Accept after a window reload plans lifecycle items without facts.
    }
  }

  /** The facts `build` kept for this proposal (memory first, then the run directory), if any. */
  private async factsFor(proposal: ProposalView, shadow: ShadowWorkspace): Promise<LeanFacts | undefined> {
    const kept = this.kept.get(proposal.runId);
    if (kept?.proposalId === proposal.proposalId) return kept.facts;
    try {
      const raw = JSON.parse(await readFile(path.join(shadow.paths.runDir, PROPOSAL_FACTS_FILE), 'utf8')) as { format?: unknown; proposalId?: unknown; facts?: unknown };
      if (raw.format === PROPOSAL_FACTS_FORMAT && raw.proposalId === proposal.proposalId && typeof raw.facts === 'object' && raw.facts !== null) {
        return raw.facts as LeanFacts;
      }
    } catch {
      // missing or unreadable: no facts
    }
    return undefined;
  }
}
