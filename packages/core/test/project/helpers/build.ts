/** Builders for small synthetic projects (subject `S` unless stated), parsed with the fixture parser. */
import type { LeanFacts } from '../../../src/facts.js';
import type { Layout } from '../../../src/layout.js';
import type { ParsedFile } from '../../../src/markup/types.js';
import type { NodeType, NodeTypeAlias, TlGraph, TlNode } from '../../../src/model.js';
import { buildProjectModel, subjectGraph, type ProjectModel } from '../../../src/project/index.js';
import { fakeFacts, freshHashes, type FakeFactsOptions } from './fakeFacts.js';
import { parseFixture } from './parseFixture.js';

/** The vocabulary most synthetic tests share: a sort with its presupposition and instance, two predicates, a constant. */
export const VOCAB_S = `namespace S

/-- things -/
axiom T : Type
/-- there is at least one thing -/
axiom T.exists : Nonempty T
instance : Nonempty T := T.exists
/-- is good -/
axiom Good : T → Prop
/-- is bad -/
axiom Bad : T → Prop
/-- a thing -/
noncomputable opaque t : T

end S
`;

export interface BlockSpec {
  id?: string;
  /** AXIOM or PROPOSITION; the old ASSUMPTION, DERIVATION and GOAL still parse, as aliases (spec v4 B.6). */
  type: NodeType | NodeTypeAlias;
  name: string;
  rationale?: string;
  premises?: string[];
  /** Written as `follows_from: <value>` (spec v4 AR-5: `nothing` is the only valid value). */
  followsFrom?: string;
  lean?: string;
}

/** A markup block as telelean writes it (fields in canonical order). */
export function block(spec: BlockSpec): string {
  return [
    '/-',
    '@@ telelean v1',
    ...(spec.id ? [`id: ${spec.id}`] : []),
    `type: ${spec.type}`,
    `natural_name: ${spec.name}`,
    ...(spec.rationale ? [`rationale: ${spec.rationale}`] : []),
    ...(spec.premises ? [`premises: ${spec.premises.join(', ')}`] : []),
    ...(spec.followsFrom !== undefined ? [`follows_from: ${spec.followsFrom}`] : []),
    ...(spec.lean ? [`lean: ${spec.lean}`] : []),
    '-/',
  ].join('\n');
}

/** A Main module of subject `S` importing the shared vocabulary. */
export function mainS(body: string, subject = 'S'): string {
  return `import Model.${subject}.Vocabulary\n\nnamespace ${subject}\n\n${body.trim()}\n\nend ${subject}\n`;
}

export interface Built {
  model: ProjectModel;
  files: ParsedFile[];
  facts: LeanFacts | undefined;
  hashes: Record<string, string>;
}

export interface BuildOptions {
  /** `false`: no facts at all (syntactic mode). */
  facts?: FakeFactsOptions | false;
  /** Texts the facts were computed from (default: the current texts). Files whose text differs become stale. */
  factsFrom?: Record<string, string>;
  mutateFacts?: (facts: LeanFacts) => void;
  library?: string;
}

export function build(texts: Record<string, string>, options: BuildOptions = {}): Built {
  const parse = (all: Record<string, string>) => Object.entries(all).map(([path, text]) => parseFixture(path, text));
  const files = parse(texts);
  let facts: LeanFacts | undefined;
  const hashes = freshHashes(files);
  if (options.facts !== false) {
    const source = options.factsFrom ? parse({ ...texts, ...options.factsFrom }) : files;
    facts = fakeFacts(source, { ...(options.facts ?? {}), ...(options.library ? { library: options.library } : {}) });
    options.mutateFacts?.(facts);
    for (const [path, text] of Object.entries(options.factsFrom ?? {})) if (texts[path] !== text) hashes[path] = `sha-edited-${path}`;
  }
  const model = buildProjectModel({ files, fileHashes: hashes, ...(facts ? { facts } : {}), library: options.library ?? 'Model' });
  return { model, files, facts, hashes };
}

export function graphOf(model: ProjectModel, subject = 'S', layout?: Layout): TlGraph {
  return subjectGraph(model, subject, { version: 1, semantic: { state: 'fresh' }, ...(layout ? { layout } : {}) });
}

export function nodeOf(model: ProjectModel, id: string): TlNode {
  const entry = model.nodes.get(id);
  if (!entry) throw new Error(`no node ${id}; nodes: ${[...model.nodes.keys()].join(', ')}`);
  return entry.node;
}

export const codes = (model: ProjectModel, nodeId?: string) => model.diagnostics.filter((d) => nodeId === undefined || d.nodeId === nodeId).map((d) => d.code);
