/**
 * Slice 2c1 (docs/slice2-plan.md 2.6, 6.1; D2-18, EN-3): endorsements. The build drops `definitional-choice` from a
 * definition whose name and `endorsementHash` of its source text its subject's endorsements hold, and from a card none
 * of whose definitions still needs it; `endorsementsPath`, `endorsementHash` and the sidecar's reading and writing.
 */
import { describe, expect, it } from 'vitest';
import { endorsementHash, endorsementsPath, parseEndorsements, serializeEndorsements, type EndorsementsFile } from '../../src/paths.js';
import { buildProjectModel, type ProjectModel } from '../../src/project/index.js';
import { sha256Hex } from '../../src/review/hash.js';
import { block, build, mainS, nodeOf, VOCAB_S } from './helpers/build.js';

const DEF = '/-- good pairs -/\ndef GoodPair (x y : T) : Prop := Good x ∧ Good y';
const DEF2 = '/-- bad pairs -/\ndef BadPair (x y : T) : Prop := Bad x ∧ Bad y';
const vocab = (defs: string) => VOCAB_S.replace('end S\n', `${defs}\n\nend S\n`);
const body = (statement: string) =>
  [block({ id: 'c', type: 'PROPOSITION', name: 'A good pair', lean: 'S.c' }), '/-- A good pair -/', `abbrev c : Prop := ${statement}`].join('\n');

/** The model of a vocabulary and one card, with `endorsements`. */
function modelWith(defs: string, statement: string, endorsements?: Record<string, Array<{ name: string; textHash: string }>>): ProjectModel {
  const built = build({ 'Model/S/Vocabulary.lean': vocab(defs), 'Model/S/Main.lean': mainS(body(statement)) });
  return buildProjectModel({ files: built.files, fileHashes: built.hashes, ...(built.facts ? { facts: built.facts } : {}), library: 'Model', ...(endorsements ? { endorsements } : {}) });
}
const flagsOf = (model: ProjectModel, name: string) => model.vocabulary.find((v) => v.name === name)?.flags;
const codeOf = (model: ProjectModel, name: string) => model.vocabulary.find((v) => v.name === name)?.code ?? '';

describe('the build reads endorsements (D2-18)', () => {
  it('none, an empty list, another subject’s list: the definition and the card that uses it need endorsement', () => {
    const cases: Array<Record<string, Array<{ name: string; textHash: string }>> | undefined> = [undefined, {}, { S: [] }, { Other: [{ name: 'S.GoodPair', textHash: endorsementHash(DEF) }] }];
    for (const endorsements of cases) {
      const model = modelWith(DEF, 'GoodPair t t', endorsements);
      expect(flagsOf(model, 'S.GoodPair'), JSON.stringify(endorsements)).toEqual(['definitional-choice']);
      expect(nodeOf(model, 'c').status.flags, JSON.stringify(endorsements)).toContain('definitional-choice');
    }
  });

  it('a matching name and hash drop the flag, from the definition and the card; the hash is of the source text (`VocabItem.code`)', () => {
    const plain = modelWith(DEF, 'GoodPair t t');
    expect(codeOf(plain, 'S.GoodPair')).toBe(DEF);
    const model = modelWith(DEF, 'GoodPair t t', { S: [{ name: 'S.GoodPair', textHash: endorsementHash(codeOf(plain, 'S.GoodPair')) }] });
    expect(flagsOf(model, 'S.GoodPair')).toEqual([]);
    expect(nodeOf(model, 'c').status.flags).not.toContain('definitional-choice');
    // Nothing else changes: the same item, used by the same card.
    expect(model.vocabulary.find((v) => v.name === 'S.GoodPair')?.usedBy).toEqual(['c']);
  });

  it('only for a matching hash: a changed text, another name, or a hash of another text flags again; a re-wrapped text does not', () => {
    const hash = endorsementHash(DEF);
    const changed = '/-- good pairs -/\ndef GoodPair (x y : T) : Prop := Good x ∧ Good y ∧ True';
    expect(flagsOf(modelWith(changed, 'GoodPair t t', { S: [{ name: 'S.GoodPair', textHash: hash }] }), 'S.GoodPair')).toEqual(['definitional-choice']);
    expect(flagsOf(modelWith(DEF, 'GoodPair t t', { S: [{ name: 'S.Other', textHash: hash }] }), 'S.GoodPair')).toEqual(['definitional-choice']);
    expect(flagsOf(modelWith(DEF, 'GoodPair t t', { S: [{ name: 'S.GoodPair', textHash: endorsementHash(DEF2) }] }), 'S.GoodPair')).toEqual(['definitional-choice']);
    const rewrapped = '/-- good pairs -/\ndef GoodPair (x y : T) : Prop :=\n  Good x ∧   Good y';
    expect(flagsOf(modelWith(rewrapped, 'GoodPair t t', { S: [{ name: 'S.GoodPair', textHash: hash }] }), 'S.GoodPair')).toEqual([]);
    // Several entries: any one that matches.
    expect(flagsOf(modelWith(DEF, 'GoodPair t t', { S: [{ name: 'S.GoodPair', textHash: 'f'.repeat(64) }, { name: 'S.GoodPair', textHash: hash }] }), 'S.GoodPair')).toEqual([]);
  });

  it('a card that uses two definitions keeps the flag while one of them is not endorsed', () => {
    const both = `${DEF}\n${DEF2}`;
    const one = modelWith(both, 'GoodPair t t ∧ BadPair t t', { S: [{ name: 'S.GoodPair', textHash: endorsementHash(DEF) }] });
    expect(flagsOf(one, 'S.GoodPair')).toEqual([]);
    expect(flagsOf(one, 'S.BadPair')).toEqual(['definitional-choice']);
    expect(nodeOf(one, 'c').status.flags).toContain('definitional-choice');
    const two = modelWith(both, 'GoodPair t t ∧ BadPair t t', { S: [{ name: 'S.GoodPair', textHash: endorsementHash(DEF) }, { name: 'S.BadPair', textHash: endorsementHash(DEF2) }] });
    expect(nodeOf(two, 'c').status.flags).not.toContain('definitional-choice');
  });
});

describe('the endorsements sidecar (§2.6)', () => {
  it('lives in the subject’s sidecar folder', () => {
    expect(endorsementsPath('Spyro')).toBe('.telelean/subjects/Spyro/endorsements.json');
  });

  it('endorsementHash: SHA-256 of the text with whitespace collapsed, deterministic', () => {
    expect(endorsementHash(DEF)).toBe(sha256Hex('/-- good pairs -/ def GoodPair (x y : T) : Prop := Good x ∧ Good y'));
    expect(endorsementHash(` ${DEF}\n\n`)).toBe(endorsementHash(DEF));
    expect(endorsementHash(DEF)).not.toBe(endorsementHash(DEF2));
    expect(endorsementHash('')).toBe(sha256Hex(''));
    expect(endorsementHash(DEF)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('round-trips, sorted by name then hash, with a final newline; reading is lenient and fails closed', () => {
    const file: EndorsementsFile = {
      format: 'telelean-endorsements',
      version: 1,
      endorsed: [
        { name: 'S.b', textHash: 'bb', run: 'r2', date: '2026-11-02' },
        { name: 'S.a', textHash: 'zz', run: 'r1', date: '2026-11-01' },
        { name: 'S.a', textHash: 'aa', run: 'r1', date: '2026-11-01' },
      ],
    };
    const text = serializeEndorsements(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseEndorsements(text).endorsed.map((e) => [e.name, e.textHash])).toEqual([['S.a', 'aa'], ['S.a', 'zz'], ['S.b', 'bb']]);
    expect(parseEndorsements(serializeEndorsements(parseEndorsements(text)))).toEqual(parseEndorsements(text));
    const empty = { format: 'telelean-endorsements', version: 1, endorsed: [] };
    expect(serializeEndorsements(empty as EndorsementsFile)).toBe(`${JSON.stringify(empty, null, 2)}\n`);
    const entry = '[{"name":"S.a","textHash":"aa","run":"r","date":"d"}]';
    for (const bad of ['', 'not json', '[]', 'null', `{"format":"telelean-endorsements","version":2,"endorsed":${entry}}`, `{"format":"other","version":1,"endorsed":${entry}}`, `{"version":1,"endorsed":${entry}}`, '{"format":"telelean-endorsements","version":1}', '{"format":"telelean-endorsements","version":1,"endorsed":{}}']) {
      expect(parseEndorsements(bad), bad).toEqual(empty);
    }
    const mixed = JSON.stringify({ format: 'telelean-endorsements', version: 1, endorsed: [null, 3, { name: 'S.x' }, { name: '', textHash: 'h' }, { name: 'S.y', textHash: 'h' }, { name: 'S.z', textHash: 'h', run: 7, date: 'd' }] });
    expect(parseEndorsements(mixed).endorsed).toEqual([
      { name: 'S.y', textHash: 'h', run: '', date: '' },
      { name: 'S.z', textHash: 'h', run: '', date: 'd' },
    ]);
  });
});
