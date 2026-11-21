/**
 * The Spyro sample at the states of the M2 walkthrough (docs/m2-plan.md section 10.2: the FakeBackend scripts' exact
 * edits), parsed with WP-markup's real parser, with facts derived from the texts (fakeFacts, M1 style; the integrator
 * re-checks them against real facts). Shared by the gate tests.
 */
import type { LeanFacts } from '../../../src/facts.js';
import { evaluateRules, type RuleInput, type RulePurpose, type RuleReport, type Selection } from '../../../src/gate/index.js';
import { parseLeanFile } from '../../../src/markup/api.js';
import { buildProjectModel, type ProjectModel } from '../../../src/project/index.js';
import { fakeFacts, freshHashes, type FakeFactsOptions } from '../../project/helpers/fakeFacts.js';
import { SPYRO_TEXTS } from '../../project/helpers/spyro.js';

export const ROOT = 'Model.lean';
export const MAIN = 'Model/Spyro/Main.lean';
export const VOCAB = 'Model/Spyro/Vocabulary.lean';

export type Texts = Record<string, string>;

/** B: the user's files at run start (test-fixtures/spyro: pg-no-dark-past code-less, the target formalised, unproved). */
export const BASE: Texts = { [ROOT]: SPYRO_TEXTS.root, [MAIN]: SPYRO_TEXTS.main, [VOCAB]: SPYRO_TEXTS.vocabulary };

/** `{ kind: 'edit', path, oldString, newString }` of the FakeBackend scripts: `oldString` must occur exactly once. */
export function edit(texts: Texts, path: string, oldString: string, newString: string): Texts {
  const text = texts[path];
  if (text === undefined) throw new Error(`no file ${path}`);
  const at = text.indexOf(oldString);
  if (at < 0 || text.indexOf(oldString, at + 1) >= 0) throw new Error(`edit: ${JSON.stringify(oldString)} does not occur exactly once in ${path}`);
  return { ...texts, [path]: text.slice(0, at) + newString + text.slice(at + oldString.length) };
}

const A3_OLD = 'stance: rule\nasserted: 2026-11-01\n-/\n\n';
const statementLine = (body: string) => `abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ${body}`;
const A3_NEW = (body: string) => `stance: rule\nasserted: 2026-11-01\n-/\n/-- PG games cannot have characters with dark pasts -/\n${statementLine(body)}\naxiom pg_no_dark_past.holds : pg_no_dark_past\n\n`;
export const TARGET_LINE = 'abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro\n';
export const HONEST_PROOF = 'theorem cynder_not_good.holds : cynder_not_good :=\n  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds\n';

/** Reading A step 3: pg-no-dark-past formalised (normative). */
export const normative = (texts: Texts = BASE) => edit(texts, MAIN, A3_OLD, A3_NEW('¬ GoodAddition c g'));
/** Reading A step 6: the honest proof right after the target's statement. */
export const proved = (texts: Texts = normative()) => edit(texts, MAIN, TARGET_LINE, `${TARGET_LINE}${HONEST_PROOF}`);
/** Reading B steps 3-4: `InGame` in the vocabulary, pg-no-dark-past formalised literally. */
export const literal = (texts: Texts = BASE) =>
  edit(edit(texts, VOCAB, '/-- Cynder -/', '/-- is in -/\naxiom InGame : Character → Game → Prop\n/-- Cynder -/'), MAIN, A3_OLD, A3_NEW('¬ InGame c g'));
/** What telelean's normalisation writes for the normative formalisation (the pin; the docstring is there already). */
export const pinned = (texts: Texts) => edit(texts, MAIN, 'stance: rule\nasserted: 2026-11-01\n-/', 'stance: rule\nasserted: 2026-11-01\nlean: Spyro.pg_no_dark_past\n-/');

export interface ModelOptions {
  /**
   * `false`: no facts at all. Slice 1e: the facts carry the value probe's `valueConsts` unless these options say
   * `valueConsts: false` (the gate's facts always come from a refresh that runs the probe since slice 1d, and B.2's
   * `undeclared-premise` refuses a proof whose direct uses it cannot see).
   */
  facts?: false | FakeFactsOptions;
  mutate?: (facts: LeanFacts) => void;
}

export function model(texts: Texts, options: ModelOptions = {}): ProjectModel {
  const files = Object.entries(texts).map(([path, text]) => parseLeanFile(path, text));
  if (options.facts === false) return buildProjectModel({ files, fileHashes: freshHashes(files), library: 'Model' });
  const facts = fakeFacts(files, { valueConsts: true, ...(options.facts ?? {}) });
  options.mutate?.(facts);
  return buildProjectModel({ files, fileHashes: freshHashes(files), facts, library: 'Model' });
}

/** The walkthrough's selection: all three premises for the goal. */
export const SEL: Selection = { subject: 'Spyro', target: 'cynder-not-good', premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'], adoptedGhosts: [] };
/** The "unselected" cheat's selection: without new-spyro-pg. */
export const SEL_NO_PG: Selection = { ...SEL, premises: ['cynder-dark-past', 'pg-no-dark-past'] };

export function rules(purpose: RulePurpose, stage: RuleInput['stage'], base: ProjectModel, current: ProjectModel, extra: Partial<RuleInput> = {}): RuleReport {
  return evaluateRules({ purpose, stage, selection: SEL, base, current, teleleanBlocks: [], ...extra });
}

export const codes = (report: RuleReport) => report.findings.map((f) => f.code);
export const findingsOf = (report: RuleReport, code: string) => report.findings.filter((f) => f.code === code);
