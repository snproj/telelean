/**
 * AT2.10 (schema part): the committed packages/core/schema/telelean-graph-1.0.schema.json equals the JSON Schema
 * generated from the zod schema. Regenerate it with:
 *
 *   cd packages/core && UPDATE_SCHEMA=1 npx vitest run test/export/schema.test.ts
 *
 * (core's test config has no Node typings on purpose, so the file write goes through a dynamic import.)
 */
import { describe, expect, it } from 'vitest';
import committed from '../../schema/telelean-graph-1.0.schema.json?raw';
import exportIndex from '../../src/export/index.ts?raw';
import graphJsonSource from '../../src/export/graphJson.ts?raw';
import coreIndex from '../../src/index.ts?raw';
import { graphJsonJsonSchema } from '../../src/export/schema.js';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const generated = `${JSON.stringify(graphJsonJsonSchema(), null, 2)}\n`;

describe('AT2.10 the committed JSON Schema', () => {
  it('equals the schema generated from zod (z.toJSONSchema, draft 2020-12)', async () => {
    if (env['UPDATE_SCHEMA'] === '1') {
      const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { writeFileSync(path: string, data: string): void };
      const url = (await import(/* @vite-ignore */ `node:${'url'}`)) as { fileURLToPath(href: string): string };
      const URLCtor = (globalThis as unknown as { URL: new (input: string, base: string) => { href: string } }).URL;
      const here = (import.meta as unknown as { url: string }).url;
      fs.writeFileSync(url.fileURLToPath(new URLCtor('../../schema/telelean-graph-1.0.schema.json', here).href), generated);
      return;
    }
    expect(committed).toBe(generated);
  });

  it.skipIf(env['UPDATE_SCHEMA'] === '1')('describes the frozen top-level shape and accepts unknown properties (consumers ignore them)', () => {
    const schema = JSON.parse(committed) as { $schema: string; required: string[]; additionalProperties: unknown; properties: Record<string, unknown> };
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toEqual([
      'format',
      'format_version',
      'generator',
      'position_encoding',
      'line_base',
      'generated_at',
      'semantic',
      'subjects',
      'nodes',
      'vocabulary',
      'edges',
      'attempts',
      'diagnostics',
      'files',
    ]);
    expect(schema.additionalProperties).toEqual({});
  });

  it('zod stays out of the bundled entry points (export/index.ts does not re-export schema.ts)', () => {
    const imports = (source: string) => source.split('\n').filter((line) => /^(import|export)\b.*\bfrom\b/.test(line));
    for (const source of [exportIndex, graphJsonSource, coreIndex]) {
      expect(imports(source).length).toBeGreaterThan(0);
      expect(imports(source).filter((line) => /'zod'|schema\.js'/.test(line))).toEqual([]);
    }
  });
});
