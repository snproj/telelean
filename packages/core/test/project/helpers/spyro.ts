/** The Spyro fixture files and hand-written facts, shared by the model, planner and export tests. */
import rootLean from '../../../../../test-fixtures/spyro/Model.lean?raw';
import mainLean from '../../../../../test-fixtures/spyro/Model/Spyro/Main.lean?raw';
import vocabLean from '../../../../../test-fixtures/spyro/Model/Spyro/Vocabulary.lean?raw';
import provedMainLean from '../../../../../test-fixtures/runner-lean/overlays/proved/Model/Spyro/Main.lean?raw';
import derivedMainLean from '../../fixtures/project/spyro-derived/Main.lean?raw';
import derivedFactsJson from '../../fixtures/project/spyro-derived-facts.json?raw';
import factsJson from '../../fixtures/project/spyro-facts.json?raw';
import provedFactsJson from '../../fixtures/project/spyro-proved-facts.json?raw';
import type { LeanFacts } from '../../../src/facts.js';
import type { ParsedFile } from '../../../src/markup/types.js';
import { buildProjectModel, type ProjectInput, type ProjectModel } from '../../../src/project/index.js';

export type Parser = (path: string, text: string) => ParsedFile;

export const SPYRO_TEXTS = { root: rootLean, main: mainLean, vocabulary: vocabLean, provedMain: provedMainLean, derivedMain: derivedMainLean } as const;

export const SPYRO_HASHES: Readonly<Record<string, string>> = { 'Model.lean': 'sha-model-root', 'Model/Spyro/Main.lean': 'sha-main', 'Model/Spyro/Vocabulary.lean': 'sha-vocabulary' };
export const SPYRO_PROVED_HASHES: Readonly<Record<string, string>> = { ...SPYRO_HASHES, 'Model/Spyro/Main.lean': 'sha-main-proved' };

export const spyroFacts = (): LeanFacts => JSON.parse(factsJson) as LeanFacts;
export const spyroProvedFacts = (): LeanFacts => JSON.parse(provedFactsJson) as LeanFacts;
/** The proved overlay plus a derivation (`dark-and-pg`) and a goal proved through it (`pg_again.holds := dark_and_pg.holds.2`). */
export const spyroDerivedFacts = (): LeanFacts => JSON.parse(derivedFactsJson) as LeanFacts;
export const SPYRO_DERIVED_HASHES: Readonly<Record<string, string>> = { ...SPYRO_HASHES, 'Model/Spyro/Main.lean': 'sha-main-derived' };

export function spyroFiles(parse: Parser, main: string = mainLean): ParsedFile[] {
  return [parse('Model.lean', rootLean), parse('Model/Spyro/Main.lean', main), parse('Model/Spyro/Vocabulary.lean', vocabLean)];
}

export function spyroInput(parse: Parser): ProjectInput {
  return { files: spyroFiles(parse), fileHashes: SPYRO_HASHES, facts: spyroFacts(), library: 'Model' };
}

export function spyroProvedInput(parse: Parser): ProjectInput {
  return { files: spyroFiles(parse, provedMainLean), fileHashes: SPYRO_PROVED_HASHES, facts: spyroProvedFacts(), library: 'Model' };
}

export function spyroDerivedInput(parse: Parser): ProjectInput {
  return { files: spyroFiles(parse, derivedMainLean), fileHashes: SPYRO_DERIVED_HASHES, facts: spyroDerivedFacts(), library: 'Model' };
}

export const spyroModel = (parse: Parser): ProjectModel => buildProjectModel(spyroInput(parse));
export const spyroProvedModel = (parse: Parser): ProjectModel => buildProjectModel(spyroProvedInput(parse));
