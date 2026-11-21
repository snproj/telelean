/**
 * `.telelean/graph.json` (D-27, 03 section 2 "graph.json schema"): the whole project as one versioned JSON document
 * for the user's scripts. Rewritten by the runner after every Lean refresh and every telelean edit.
 *
 * FROZEN CONTRACT (M1, docs/m1-plan.md section 6.6): the top-level shape below. WP-model owns the zod schema
 * (`export/schema.ts`) and the generated JSON Schema (`packages/core/schema/telelean-graph-1.0.schema.json`), and
 * may add optional properties (minor version bump: format_version "1.1", ...). Consumers must ignore unknown
 * properties. snake_case on purpose: this is an external format.
 */
import type { BoardDiagnostic, Range, TlEdge, TlNode, VocabItem } from '../model.js';
import { edgesOf } from '../project/build.js';
import type { ProjectModel } from '../project/types.js';

export const GRAPH_JSON_FORMAT = 'telelean-graph' as const;
/** 1.1 (M1 fixes): `status.conditional_on`; a conditional node's `footprint` is its real footprint (it was `on`). */
export const GRAPH_JSON_VERSION = '1.1' as const;

export interface GraphJsonPosition {
  line: number;
  character: number;
}
export interface GraphJsonRange {
  start: GraphJsonPosition;
  end: GraphJsonPosition;
}

export interface GraphJsonNode {
  id: string;
  subject: string;
  /** Spec v4: AXIOM or PROPOSITION (blocks that still say ASSUMPTION, DERIVATION or GOAL are exported under the new kind). */
  type: 'AXIOM' | 'PROPOSITION';
  natural_name: string;
  rationale: string | null;
  stance: string | null;
  source: string | null;
  asserted: string | null;
  premises: string[];
  worded_by: 'user' | 'agent';
  /** Where the block is. */
  location: { file: string; range: GraphJsonRange; markup_version: number } | null;
  lean: {
    binding: 'none' | 'adjacent' | 'pinned';
    statement: string | null;
    justification: string | null;
    justification_kind: 'axiom' | 'theorem' | 'other' | null;
    uses: string[];
    presupposes: string[];
    axioms: string[];
  };
  status: {
    formal: 'informal' | 'formalized' | 'ill-formed';
    /** `pending`: a proposition whose `.holds` is still an axiom (spec v4; was `pending-promotion`). */
    proof: 'none' | 'assumed' | 'pending' | 'conditional' | 'proved';
    /**
     * Proved or conditional: what the proof rests on, from `#print axioms`: node ids, `presup:<Lean name>` and
     * `axiom:<Lean name>` entries (format 1.0 listed a conditional node's hypotheses here instead).
     */
    footprint: string[];
    /** Conditional: the node ids whose statements the proof takes as hypotheses; otherwise empty (format 1.1). */
    conditional_on: string[];
    flags: string[];
  };
  extensions: Record<string, string>;
}

export interface GraphJsonVocabItem {
  name: string;
  subject: string;
  kind: string;
  type: string | null;
  gloss: string | null;
  used_by: string[];
  location: { file: string; range: GraphJsonRange } | null;
  flags: string[];
}

export interface GraphJsonEdge {
  type: 'premise' | 'verified' | 'lean-ref';
  source: string;
  target: string;
  origin: 'declared' | 'lean';
  where: 'statement' | 'proof' | null;
  conditional: boolean;
  mismatch: 'declared-unused' | 'used-undeclared' | null;
}

export interface GraphJsonDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  file: string | null;
  range: GraphJsonRange | null;
  node_id: string | null;
}

export interface GraphJson {
  format: typeof GRAPH_JSON_FORMAT;
  format_version: string;
  generator: { name: 'telelean'; version: string };
  position_encoding: 'utf-16';
  line_base: 0;
  /** ISO time this file was written. */
  generated_at: string;
  semantic: { available: boolean; stale: boolean; toolchain: string | null; checked_at: string | null; status: string };
  subjects: Array<{ name: string; files: string[]; node_count: number }>;
  nodes: GraphJsonNode[];
  vocabulary: GraphJsonVocabItem[];
  edges: GraphJsonEdge[];
  /** "These suffice" attempts (M2+); empty in M1. */
  attempts: unknown[];
  diagnostics: GraphJsonDiagnostic[];
  files: Array<{ path: string; sha256: string; node_count: number }>;
}

export interface GraphJsonOptions {
  generatorVersion: string;
  generatedAt: string;
  /** sha256 per file path (the same hashes ProjectInput got). */
  fileHashes: Readonly<Record<string, string>>;
}

function range(r: Range): GraphJsonRange {
  return { start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character } };
}

function sortedRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key] as string;
  return out;
}

function nodeJson(node: TlNode): GraphJsonNode {
  const proof = node.status.proof;
  const footprint = proof.kind === 'proved' ? proof.footprint : proof.kind === 'conditional' ? (proof.footprint ?? []) : [];
  const conditionalOn = proof.kind === 'conditional' ? proof.on : [];
  return {
    id: node.id,
    subject: node.subject,
    type: node.type,
    natural_name: node.naturalName,
    rationale: node.rationale ?? null,
    stance: node.stance ?? null,
    source: node.source ?? null,
    asserted: node.asserted ?? null,
    premises: [...node.premises],
    worded_by: node.provenance.wordedBy,
    location: node.loc ? { file: node.loc.file, range: range(node.loc.range), markup_version: node.loc.markupVersion } : null,
    lean: {
      binding: node.lean.binding,
      statement: node.lean.statement ?? null,
      justification: node.lean.justification ?? null,
      justification_kind: node.lean.justificationKind ?? null,
      uses: [...(node.lean.uses ?? [])],
      presupposes: [...(node.lean.presupposes ?? [])],
      axioms: [...(node.lean.axioms ?? [])],
    },
    status: { formal: node.status.formal, proof: proof.kind, footprint: [...footprint], conditional_on: [...conditionalOn], flags: [...node.status.flags] },
    extensions: sortedRecord(node.ext),
  };
}

function vocabJson(item: VocabItem): GraphJsonVocabItem {
  return {
    name: item.name,
    subject: item.subject,
    kind: item.kind,
    type: item.type ?? null,
    gloss: item.gloss ?? null,
    used_by: [...item.usedBy],
    location: item.loc ? { file: item.loc.file, range: range(item.loc.range) } : null,
    flags: [...item.flags],
  };
}

function edgeJson(edge: TlEdge): GraphJsonEdge {
  return {
    type: edge.type,
    source: edge.source,
    target: edge.target,
    origin: edge.origin,
    where: edge.where ?? null,
    conditional: edge.conditional === true,
    mismatch: edge.mismatch ?? null,
  };
}

function diagnosticJson(d: BoardDiagnostic): GraphJsonDiagnostic {
  return { code: d.code, severity: d.severity, message: d.message, file: d.file ?? null, range: d.range ? range(d.range) : null, node_id: d.nodeId ?? null };
}

/**
 * The export for the whole project (all subjects), deterministic for a given model and options: nodes in file order,
 * vocabulary per subject in display order, edges (declared, verified, lean-ref), diagnostics sorted by place, files
 * by path, record keys sorted. A proved or conditional node's `footprint` lists node ids, `presup:<name>` and
 * `axiom:<name>` entries (the latter: axioms that are neither assumptions nor vocabulary, TL103); a conditional node's
 * hypotheses are in `conditional_on`.
 */
export function toGraphJson(model: ProjectModel, options: GraphJsonOptions): GraphJson {
  const facts = model.facts;
  const files = [...model.files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const nodes = [...model.nodes.values()];
  const nodeCount = new Map<string, number>();
  for (const entry of nodes) nodeCount.set(entry.file, (nodeCount.get(entry.file) ?? 0) + 1);
  return {
    format: GRAPH_JSON_FORMAT,
    format_version: GRAPH_JSON_VERSION,
    generator: { name: 'telelean', version: options.generatorVersion },
    position_encoding: 'utf-16',
    line_base: 0,
    generated_at: options.generatedAt,
    semantic: {
      available: facts !== undefined,
      // Files changed since the facts (a hash differs, the module went stale, or the facts do not know the file).
      stale:
        facts !== undefined &&
        files.some((f) => {
          const module = facts.modules.find((m) => m.file === f.path);
          return module === undefined || module.state === 'stale' || options.fileHashes[f.path] !== module.sourceSha256;
        }),
      toolchain: facts?.toolchain ?? null,
      checked_at: facts?.finishedAt ?? null,
      status: facts?.status ?? 'unavailable',
    },
    subjects: model.subjects.map((s) => ({ name: s.name, files: [...s.files], node_count: s.nodeCount })),
    nodes: nodes.map((entry) => nodeJson(entry.node)),
    vocabulary: model.vocabulary.map(vocabJson),
    edges: edgesOf(model).edges.map(edgeJson),
    attempts: [],
    diagnostics: model.diagnostics.map(diagnosticJson),
    files: files.map((f) => ({ path: f.path, sha256: options.fileHashes[f.path] ?? '', node_count: nodeCount.get(f.path) ?? 0 })),
  };
}
