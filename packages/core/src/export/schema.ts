/**
 * The zod schema of `.telelean/graph.json` format `telelean-graph` 1.x (docs/m1-plan.md section 6.6), and the JSON
 * Schema generated from it (`packages/core/schema/telelean-graph-1.0.schema.json`, kept equal by
 * test/export/schema.test.ts; regenerate with `UPDATE_SCHEMA=1 npx vitest run test/export/schema.test.ts`).
 *
 * NOT re-exported from `export/index.ts` (nor from the package root): the webview bundles `@telelean/core`, and zod
 * must stay out of that bundle. Where validation is needed (runner, tests), import this file by path, e.g.
 * `../../../core/src/export/schema.js` from `packages/runner/src/workspace/` (the `@telelean/core` alias maps only the package root).
 *
 * Objects accept unknown properties: later 1.x versions add optional fields, and consumers must ignore them.
 */
import { z } from 'zod';
import type { GraphJson } from './graphJson.js';

const position = z.looseObject({
  line: z.number().int().min(0).describe('0-based line'),
  character: z.number().int().min(0).describe('0-based UTF-16 code unit'),
});
const range = z.looseObject({ start: position, end: position });
const nodeType = z.enum(['ASSUMPTION', 'DERIVATION', 'GOAL']);

const node = z.looseObject({
  id: z.string().min(1),
  subject: z.string(),
  type: nodeType,
  natural_name: z.string(),
  rationale: z.string().nullable(),
  stance: z.string().nullable(),
  source: z.string().nullable(),
  asserted: z.string().nullable(),
  premises: z.array(z.string()).describe('Declared joint support (node ids)'),
  worded_by: z.enum(['user', 'agent']),
  location: z.looseObject({ file: z.string(), range, markup_version: z.number().int() }).nullable().describe('Where the markup block is'),
  lean: z.looseObject({
    binding: z.enum(['none', 'adjacent', 'pinned']),
    statement: z.string().nullable().describe('Fully-qualified statement `n`'),
    justification: z.string().nullable().describe('Fully-qualified `n.holds`, when it exists'),
    justification_kind: z.enum(['axiom', 'theorem', 'other']).nullable(),
    uses: z.array(z.string()).describe('Vocabulary the statement uses (its closure), from Lean'),
    presupposes: z.array(z.string()).describe('Presupposition axioms in the statement footprint'),
    axioms: z.array(z.string()).describe('`#print axioms` of the justification'),
  }),
  status: z.looseObject({
    formal: z.enum(['informal', 'formalized', 'ill-formed']),
    proof: z.enum(['none', 'assumed', 'pending-promotion', 'conditional', 'proved']),
    footprint: z
      .array(z.string())
      .describe('Proved or conditional: what the proof rests on (node ids, `presup:<name>` and `axiom:<name>` entries); format 1.0 listed a conditional node\'s hypotheses here'),
    conditional_on: z.array(z.string()).optional().describe('Conditional: the node ids taken as hypotheses (format 1.1; empty otherwise)'),
    flags: z.array(z.string()),
  }),
  extensions: z.record(z.string(), z.string()),
});

const vocabItem = z.looseObject({
  name: z.string(),
  subject: z.string(),
  kind: z.string().describe('sort, predicate, function, constant, presupposition, definition, lemma, unmarked-axiom, other'),
  type: z.string().nullable(),
  gloss: z.string().nullable(),
  used_by: z.array(z.string()),
  location: z.looseObject({ file: z.string(), range }).nullable(),
  flags: z.array(z.string()),
});

const edge = z.looseObject({
  type: z.enum(['premise', 'verified', 'lean-ref']),
  source: z.string(),
  target: z.string(),
  origin: z.enum(['declared', 'lean']),
  where: z.enum(['statement', 'proof']).nullable(),
  conditional: z.boolean(),
  mismatch: z.enum(['declared-unused', 'used-undeclared']).nullable(),
});

const diagnostic = z.looseObject({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info', 'hint']),
  message: z.string(),
  file: z.string().nullable(),
  range: range.nullable(),
  node_id: z.string().nullable(),
});

export const graphJsonSchema = z
  .looseObject({
    format: z.literal('telelean-graph'),
    format_version: z.string().regex(/^1\.\d+$/),
    generator: z.looseObject({ name: z.literal('telelean'), version: z.string() }),
    position_encoding: z.literal('utf-16'),
    line_base: z.literal(0),
    generated_at: z.string().describe('ISO time'),
    semantic: z.looseObject({
      available: z.boolean(),
      stale: z.boolean(),
      toolchain: z.string().nullable(),
      checked_at: z.string().nullable(),
      status: z.string(),
    }),
    subjects: z.array(z.looseObject({ name: z.string(), files: z.array(z.string()), node_count: z.number().int().min(0) })),
    nodes: z.array(node),
    vocabulary: z.array(vocabItem),
    edges: z.array(edge),
    attempts: z.array(z.unknown()),
    diagnostics: z.array(diagnostic),
    files: z.array(z.looseObject({ path: z.string(), sha256: z.string(), node_count: z.number().int().min(0) })),
  })
  .meta({
    title: 'telelean graph.json 1.x',
    description:
      'The whole telelean project (every subject) as written to .telelean/graph.json: nodes with derived statuses, vocabulary, edges and diagnostics. Positions are 0-based lines and UTF-16 characters. Unknown properties must be ignored (minor versions add optional fields).',
  });

/** The JSON Schema (draft 2020-12) of graph.json, generated from the zod schema. */
export function graphJsonJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(graphJsonSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
}

/** The schema's input type without the index signatures `looseObject` adds (interfaces have none). */
type Strict<T> = T extends readonly (infer U)[] ? Strict<U>[] : T extends object ? { [K in keyof T as string extends K ? never : K]: Strict<T[K]> } : T;

/** Compile-time check: every GraphJson the exporter can produce has the shape the schema accepts. */
export const graphJsonAccepted: (value: GraphJson) => Strict<z.input<typeof graphJsonSchema>> = (value) => value;
