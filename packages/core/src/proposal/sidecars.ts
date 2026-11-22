/**
 * The proposal's history label and the sidecar codecs (docs/m2-plan.md section 7.3): `attempts.jsonl` (one JSON object
 * per line, append-only, D-18) and `decisions.json` (D-20). Parsing is lenient (a hand edit or a newer telelean never
 * breaks the board: unknown or malformed entries are skipped), serialising is canonical (keys in the interfaces' order).
 */
import { cutText } from '../project/text.js';
import {
  ATTEMPT_FORMAT,
  ATTEMPT_RESOLUTION_FORMAT,
  DECISION_SCOPES,
  DECISIONS_FORMAT,
  PHENOMENA,
  type AnswerChoiceView,
  type AttemptLine,
  type AttemptRecord,
  type AttemptResolution,
  type AttemptSummary,
  type DecisionRecord,
  type DecisionScope,
  type DecisionsFile,
  type Phenomenon,
  type RunVerdict,
} from '../run.js';

/** See `proposalLabel` in ./index.ts. */
export function label(verdict: RunVerdict, targetSentence: string, extras: { adoptedGhosts: number; premises?: number }): string {
  const outcome = verdict === 'proved' ? 'proved' : 'not proved';
  // Spec v4.1 ES-2, AR-5 (slice 1e): "Formalize for dependencies", or its question being a "follows from nothing" mark.
  const action = extras.premises === 0 ? 'Follows from nothing?' : 'Formalize';
  let text = `${action} → ${outcome}: ${cutText(targetSentence, 60)}`;
  if (extras.adoptedGhosts > 0) text += ` (+ ${extras.adoptedGhosts} adopted axiom${extras.adoptedGhosts === 1 ? '' : 's'})`;
  return text;
}

// ---------------------------------------------------------------------------------------------
// Validation helpers (the files are user-editable text)

type Json = Record<string, unknown>;

const VERDICTS: readonly RunVerdict[] = ['proved', 'not-proved', 'insufficient', 'inconsistent', 'gave-up', 'cap-reached', 'no-finish', 'cancelled', 'failed'];
const RESOLUTIONS: ReadonlyArray<AttemptResolution['resolution']> = ['accepted', 'discarded', 'superseded'];

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function readUsage(v: unknown): AttemptRecord['usage'] | null {
  if (!isRecord(v)) return null;
  const { requests, inputTokens, outputTokens, costEstimateUsd } = v;
  if (!isNumber(requests) || !isNumber(inputTokens) || !isNumber(outputTokens) || !isNumber(costEstimateUsd)) return null;
  return { requests, inputTokens, outputTokens, costEstimateUsd };
}

function readGhosts(v: unknown): AttemptRecord['ghosts'] | null {
  if (!Array.isArray(v)) return null;
  const out: NonNullable<AttemptRecord['ghosts']> = [];
  for (const g of v) {
    if (!isRecord(g) || !isString(g.id) || !isString(g.naturalName) || typeof g.adopted !== 'boolean') return null;
    out.push({ id: g.id, naturalName: g.naturalName, adopted: g.adopted });
  }
  return out;
}

/** A record with keys in the interface's order (also the serialised form). */
function recordOf(v: Json): AttemptRecord | null {
  const { id, run, round, date, subject, target, premises, verdict, gateAttempts, model } = v;
  if (!isString(id) || !isString(run) || !isNumber(round) || !isString(date) || !isString(subject) || !isString(target) || !isStrings(premises)) return null;
  if (!VERDICTS.includes(verdict as RunVerdict) || !isNumber(gateAttempts) || !isString(model)) return null;
  if (v.footprint !== undefined && !isStrings(v.footprint)) return null;
  if (v.summary !== undefined && !isString(v.summary)) return null;
  if (v.effort !== undefined && !isString(v.effort)) return null;
  const ghosts = v.ghosts === undefined ? undefined : readGhosts(v.ghosts);
  const usage = v.usage === undefined ? undefined : readUsage(v.usage);
  if (ghosts === null || usage === null) return null;
  return {
    format: ATTEMPT_FORMAT,
    version: 1,
    id,
    run,
    round,
    date,
    subject,
    target,
    premises: [...premises],
    verdict: verdict as RunVerdict,
    ...(v.footprint !== undefined ? { footprint: [...(v.footprint as string[])] } : {}),
    ...(ghosts !== undefined ? { ghosts } : {}),
    ...(v.summary !== undefined ? { summary: v.summary as string } : {}),
    gateAttempts,
    model,
    ...(v.effort !== undefined ? { effort: v.effort as string } : {}),
    ...(usage !== undefined ? { usage } : {}),
  };
}

/** Slice 2f (G1): a resolution's `arrows`, read leniently: a malformed entry is dropped; none left (or absent) reads as none. */
function readArrows(v: unknown): NonNullable<AttemptResolution['arrows']> | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<AttemptResolution['arrows']> = [];
  for (const a of v) {
    if (!isRecord(a) || !isString(a.source) || !isString(a.target) || !isString(a.step) || (a.kind !== 'arrow' && a.kind !== 'premise')) continue;
    out.push({ source: a.source, target: a.target, step: a.step, kind: a.kind });
  }
  return out.length > 0 ? out : undefined;
}

function resolutionOf(v: Json): AttemptResolution | null {
  const { run, round, date, resolution } = v;
  if (!isString(run) || !isNumber(round) || !isString(date) || !RESOLUTIONS.includes(resolution as AttemptResolution['resolution'])) return null;
  const arrows = readArrows(v.arrows);
  return { format: ATTEMPT_RESOLUTION_FORMAT, version: 1, run, round, date, resolution: resolution as AttemptResolution['resolution'], ...(arrows !== undefined ? { arrows } : {}) };
}

function lineOf(v: unknown): AttemptLine | null {
  if (!isRecord(v) || v.version !== 1) return null;
  if (v.format === ATTEMPT_FORMAT) return recordOf(v);
  if (v.format === ATTEMPT_RESOLUTION_FORMAT) return resolutionOf(v);
  return null;
}

/** See `parseAttemptLines` in ./index.ts. */
export function parseAttempts(text: string): AttemptLine[] {
  const out: AttemptLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = lineOf(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** `obj` with exactly `keys`, in that order (undefined values left out). */
function ordered(obj: object, keys: readonly string[]): Json {
  const source = obj as Json;
  const out: Json = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

const RECORD_KEYS = ['format', 'version', 'id', 'run', 'round', 'date', 'subject', 'target', 'premises', 'verdict', 'footprint', 'ghosts', 'summary', 'gateAttempts', 'model', 'effort', 'usage'];
const RESOLUTION_KEYS = ['format', 'version', 'run', 'round', 'date', 'resolution', 'arrows'];

/** See `serializeAttemptLine` in ./index.ts (keys in the interface's order; nothing is validated or dropped but unknown keys). */
export function serializeAttempt(line: AttemptLine): string {
  if (line.format === ATTEMPT_RESOLUTION_FORMAT) {
    const resolution = ordered(line, RESOLUTION_KEYS);
    if (Array.isArray(resolution.arrows)) resolution.arrows = resolution.arrows.map((a: object) => ordered(a, ['source', 'target', 'step', 'kind']));
    return JSON.stringify(resolution);
  }
  const record = ordered(line, RECORD_KEYS);
  if (Array.isArray(record.ghosts)) record.ghosts = record.ghosts.map((g: object) => ordered(g, ['id', 'naturalName', 'adopted']));
  if (isRecord(record.usage)) record.usage = ordered(record.usage, ['requests', 'inputTokens', 'outputTokens', 'costEstimateUsd']);
  return JSON.stringify(record);
}

/** Orders ISO dates (falls back to string order when a date does not parse). */
function compareDates(a: string, b: string): number {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** See `summariseAttempts` in ./index.ts. */
export function summarise(lines: readonly AttemptLine[]): AttemptSummary[] {
  const latest = new Map<string, { resolution: AttemptResolution; index: number }>();
  lines.forEach((line, index) => {
    if (line.format !== ATTEMPT_RESOLUTION_FORMAT) return;
    const key = `${line.run}\u0000${line.round}`;
    const known = latest.get(key);
    if (!known || compareDates(known.resolution.date, line.date) <= 0) latest.set(key, { resolution: line, index });
  });
  const records = lines.map((line, index) => ({ line, index })).filter((x): x is { line: AttemptRecord; index: number } => x.line.format === ATTEMPT_FORMAT);
  records.sort((a, b) => compareDates(b.line.date, a.line.date) || b.index - a.index);
  return records.map(({ line }) => {
    const resolution = latest.get(`${line.run}\u0000${line.round}`)?.resolution.resolution;
    return { ...line, ...(resolution !== undefined ? { resolution } : {}) };
  });
}

// ---------------------------------------------------------------------------------------------
// decisions.json

function choiceOf(v: unknown): AnswerChoiceView | null {
  if (!isRecord(v)) return null;
  switch (v.kind) {
    case 'option':
      return Number.isInteger(v.option) && (v.option as number) >= 0 && (v.option as number) <= 3 ? { kind: 'option', option: v.option as number } : null;
    case 'free-text':
      return isString(v.text) && v.text.trim() !== '' ? { kind: 'free-text', text: v.text } : null;
    case 'leave-open':
      return { kind: 'leave-open' };
    case 'decide-for-me':
      return { kind: 'decide-for-me' };
    default:
      return null;
  }
}

function guessOf(v: unknown): DecisionRecord['claudesGuess'] | null {
  if (!isRecord(v)) return null;
  if (v.option !== undefined && !Number.isInteger(v.option)) return null;
  if (v.note !== undefined && !isString(v.note)) return null;
  return { ...(v.option !== undefined ? { option: v.option as number } : {}), ...(v.note !== undefined ? { note: v.note as string } : {}) };
}

/** A decision with keys in the interface's order, or null when an entry is malformed. */
function decisionOf(v: unknown): DecisionRecord | null {
  if (!isRecord(v)) return null;
  const { id, run, date, subject, phenomenon, question, options, answerText, scope, affectedNodes, decidedBy, wordedBy } = v;
  if (!isString(id) || !isString(run) || !isString(date) || !isString(subject) || !isString(question) || !isString(answerText)) return null;
  if (!PHENOMENA.includes(phenomenon as Phenomenon) || !DECISION_SCOPES.includes(scope as DecisionScope) || !isStrings(affectedNodes)) return null;
  if (decidedBy !== 'user' || wordedBy !== 'agent' || !Array.isArray(options)) return null;
  const opts: DecisionRecord['options'] = [];
  for (const o of options) {
    if (!isRecord(o) || !isString(o.label) || !isString(o.consequence)) return null;
    opts.push({ label: o.label, consequence: o.consequence });
  }
  const answer = choiceOf(v.answer);
  const guess = v.claudesGuess === undefined ? undefined : guessOf(v.claudesGuess);
  if (answer === null || guess === null) return null;
  return {
    id,
    run,
    date,
    subject,
    phenomenon: phenomenon as Phenomenon,
    question,
    options: opts,
    answer,
    answerText,
    scope: scope as DecisionScope,
    affectedNodes: [...affectedNodes],
    decidedBy: 'user',
    wordedBy: 'agent',
    ...(guess !== undefined ? { claudesGuess: guess } : {}),
  };
}

const emptyDecisions = (): DecisionsFile => ({ format: DECISIONS_FORMAT, version: 1, decisions: [] });

/** See `parseDecisionsFile` in ./index.ts. */
export function parseDecisions(json: string | null): DecisionsFile {
  if (json === null || json.trim() === '') return emptyDecisions();
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return emptyDecisions();
  }
  if (!isRecord(value) || value.format !== DECISIONS_FORMAT || value.version !== 1 || !Array.isArray(value.decisions)) return emptyDecisions();
  const decisions: DecisionRecord[] = [];
  for (const entry of value.decisions) {
    const decision = decisionOf(entry);
    if (decision) decisions.push(decision);
  }
  return { format: DECISIONS_FORMAT, version: 1, decisions };
}

const DECISION_KEYS = ['id', 'run', 'date', 'subject', 'phenomenon', 'question', 'options', 'answer', 'answerText', 'scope', 'affectedNodes', 'decidedBy', 'wordedBy', 'claudesGuess'];

/** One decision with keys in the interface's order (nothing is validated or dropped: the user's answers are kept). */
function orderedDecision(decision: DecisionRecord): Json {
  const out = ordered(decision, DECISION_KEYS);
  if (Array.isArray(out.options)) out.options = out.options.map((o: object) => ordered(o, ['label', 'consequence']));
  if (isRecord(out.answer)) out.answer = ordered(out.answer, ['kind', 'option', 'text']);
  if (isRecord(out.claudesGuess)) out.claudesGuess = ordered(out.claudesGuess, ['option', 'note']);
  return out;
}

/** See `serializeDecisionsFile` in ./index.ts. */
export function serializeDecisions(file: DecisionsFile): string {
  return `${JSON.stringify({ format: DECISIONS_FORMAT, version: 1, decisions: file.decisions.map(orderedDecision) }, null, 2)}\n`;
}

/** See `addDecisions` in ./index.ts. */
export function add(file: DecisionsFile, records: readonly DecisionRecord[]): DecisionsFile {
  const decisions = [...file.decisions];
  for (const record of records) {
    const index = decisions.findIndex((d) => d.id === record.id);
    if (index >= 0) decisions[index] = record;
    else decisions.push(record);
  }
  return { format: DECISIONS_FORMAT, version: 1, decisions };
}

/** See `decisionsInForce` in ./index.ts. */
export function inForce(file: DecisionsFile, subject: string, nodeIds: readonly string[]): DecisionRecord[] {
  const ids = new Set(nodeIds);
  return file.decisions
    .map((decision, index) => ({ decision, index }))
    .filter(({ decision }) => decision.subject === subject && (decision.scope === 'subject' || (decision.scope === 'nodes' && decision.affectedNodes.some((id) => ids.has(id)))))
    .sort((a, b) => compareDates(b.decision.date, a.decision.date) || b.index - a.index)
    .map(({ decision }) => decision);
}
