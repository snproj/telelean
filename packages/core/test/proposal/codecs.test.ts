/**
 * AT1.10 (docs/m2-plan.md section 7.3): the attempts.jsonl and decisions.json codecs, summariseAttempts and
 * decisionsInForce; and proposalLabel (the history entry of an accepted proposal).
 */
import { describe, expect, it } from 'vitest';
import {
  addDecisions,
  decisionsInForce,
  parseAttemptLines,
  parseDecisionsFile,
  proposalLabel,
  serializeAttemptLine,
  serializeDecisionsFile,
  summariseAttempts,
} from '../../src/proposal/index.js';
import type { AttemptRecord, AttemptResolution, DecisionRecord, DecisionsFile } from '../../src/run.js';
import attemptsJsonl from '../fixtures/proposal/attempts.jsonl?raw';

const RECORD: AttemptRecord = {
  format: 'telelean-attempt',
  version: 1,
  id: 'rmx1.1',
  run: 'rmx1',
  round: 1,
  date: '2026-11-02T09:00:00.000Z',
  subject: 'Spyro',
  target: 'cynder-not-good',
  premises: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'],
  verdict: 'proved',
  footprint: ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past', 'presup:Spyro.Character.exists', 'presup:Spyro.Game.exists'],
  ghosts: [{ id: 'ghost-1', naturalName: 'A suggestion', adopted: false }],
  summary: 'Proved from the three premises under the normative reading.',
  gateAttempts: 1,
  model: 'claude-opus-5-5',
  effort: 'high',
  usage: { requests: 9, inputTokens: 2000, outputTokens: 700, costEstimateUsd: 0.12 },
};
const RESOLUTION: AttemptResolution = { format: 'telelean-attempt-resolution', version: 1, run: 'rmx1', round: 1, date: '2026-11-02T09:10:00.000Z', resolution: 'accepted' };

describe('AT1.10 attempts.jsonl', () => {
  it('round trips a record and a resolution; one line each, keys in the interface\'s order', () => {
    const line = serializeAttemptLine(RECORD);
    expect(line).not.toContain('\n');
    expect(Object.keys(JSON.parse(line) as object)).toEqual(['format', 'version', 'id', 'run', 'round', 'date', 'subject', 'target', 'premises', 'verdict', 'footprint', 'ghosts', 'summary', 'gateAttempts', 'model', 'effort', 'usage']);
    expect(parseAttemptLines(`${line}\n${serializeAttemptLine(RESOLUTION)}\n`)).toEqual([RECORD, RESOLUTION]);
    const minimal: AttemptRecord = { format: 'telelean-attempt', version: 1, id: 'r.1', run: 'r', round: 1, date: '2026-11-02T00:00:00.000Z', subject: 'S', target: 'g', premises: [], verdict: 'cancelled', gateAttempts: 0, model: 'm' };
    expect(parseAttemptLines(serializeAttemptLine(minimal))).toEqual([minimal]);
    expect(serializeAttemptLine(RESOLUTION)).toBe('{"format":"telelean-attempt-resolution","version":1,"run":"rmx1","round":1,"date":"2026-11-02T09:10:00.000Z","resolution":"accepted"}');
  });

  it('skips blank, malformed, unknown-format and newer-version lines; drops unknown keys', () => {
    const lines = parseAttemptLines(attemptsJsonl);
    expect(lines.map((l) => (l.format === 'telelean-attempt' ? l.id : `${l.run}.${l.round}:${l.resolution}`))).toEqual(['rA.1', 'rA.1:superseded', 'rA.2', 'rA.2:discarded', 'rA.2:accepted', 'rC.1']);
    expect(JSON.stringify(lines)).not.toContain('"extra"');
    expect(parseAttemptLines('')).toEqual([]);
    expect(parseAttemptLines('\r\n\r\n')).toEqual([]);
    expect(parseAttemptLines(`${serializeAttemptLine(RECORD)}\r\n`)).toEqual([RECORD]);
  });

  it('summariseAttempts: records newest first, each with its latest resolution', () => {
    const summary = summariseAttempts(parseAttemptLines(attemptsJsonl));
    expect(summary.map((s) => [s.id, s.resolution])).toEqual([
      ['rA.2', 'accepted'],
      ['rA.1', 'superseded'],
      ['rC.1', undefined],
    ]);
    expect(summary[0]).toMatchObject({ verdict: 'proved', gateAttempts: 2, usage: { costEstimateUsd: 0.33 } });
    expect('resolution' in (summary[2] as object)).toBe(false);
    // Same date: the later line is the newer.
    const twin = { ...RECORD, id: 'rmx2.1', run: 'rmx2' };
    expect(summariseAttempts([RECORD, twin]).map((s) => s.id)).toEqual(['rmx2.1', 'rmx1.1']);
    expect(summariseAttempts([])).toEqual([]);
  });
});

const decision = (id: string, over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id,
  run: 'rmx1',
  date: '2026-11-02T09:05:00.000Z',
  subject: 'Spyro',
  phenomenon: 'modality',
  question: 'Does "cannot have" state a rule (normative), or that a PG game is unable to contain such a character (literal)?',
  options: [
    { label: 'A rule (normative)', consequence: 'A PG game with such a character breaks the rule.' },
    { label: 'Impossible (literal)', consequence: 'No PG game contains such a character.' },
  ],
  answer: { kind: 'option', option: 0 },
  answerText: 'A rule (normative)',
  scope: 'run',
  affectedNodes: ['pg-no-dark-past'],
  decidedBy: 'user',
  wordedBy: 'agent',
  claudesGuess: { option: 0 },
  ...over,
});

describe('AT1.10 decisions.json', () => {
  const empty: DecisionsFile = { format: 'telelean-decisions', version: 1, decisions: [] };

  it('a missing, empty, unreadable or foreign file is an empty DecisionsFile; bad entries are dropped', () => {
    expect(parseDecisionsFile(null)).toEqual(empty);
    expect(parseDecisionsFile('')).toEqual(empty);
    expect(parseDecisionsFile('{ not json')).toEqual(empty);
    expect(parseDecisionsFile('{"format":"telelean-decisions","version":2,"decisions":[]}')).toEqual(empty);
    const good = decision('rmx1.q1.0');
    const json = JSON.stringify({ format: 'telelean-decisions', version: 1, decisions: [good, { ...good, id: 'bad', phenomenon: 'astrology' }, { ...good, id: 'bad2', answer: { kind: 'option', option: 7 } }, 42] });
    expect(parseDecisionsFile(json)).toEqual({ ...empty, decisions: [good] });
  });

  it('serialises as pretty JSON with a trailing newline and round trips', () => {
    const file = addDecisions(empty, [decision('rmx1.q1.0'), decision('rmx1.q1.1', { answer: { kind: 'free-text', text: 'I mean it as a rule.' }, answerText: 'I mean it as a rule.', scope: 'subject', claudesGuess: undefined })]);
    const text = serializeDecisionsFile(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "decisions": [\n    {\n      "id": "rmx1.q1.0",');
    expect(parseDecisionsFile(text)).toEqual(JSON.parse(JSON.stringify(file)));
  });

  it('serialising never throws or drops an entry: keys are only put in the interfaces\' order', () => {
    const odd = { ...decision('odd'), phenomenon: 'astrology', extra: 1 } as unknown as DecisionRecord;
    const parsed = JSON.parse(serializeDecisionsFile({ ...empty, decisions: [odd] })) as { decisions: Array<Record<string, unknown>> };
    expect(parsed.decisions).toHaveLength(1);
    expect(Object.keys(parsed.decisions[0] as object)).toEqual(['id', 'run', 'date', 'subject', 'phenomenon', 'question', 'options', 'answer', 'answerText', 'scope', 'affectedNodes', 'decidedBy', 'wordedBy', 'claudesGuess']);
    const record = { ...RECORD, usage: { costEstimateUsd: 0.5, requests: 1, inputTokens: 2, outputTokens: 3 }, unknown: true } as unknown as AttemptRecord;
    expect(serializeAttemptLine(record)).toContain('"usage":{"requests":1,"inputTokens":2,"outputTokens":3,"costEstimateUsd":0.5}');
    expect(serializeAttemptLine(record)).not.toContain('unknown');
  });

  it('addDecisions adds and replaces by id, keeping the order', () => {
    const first = addDecisions(empty, [decision('a'), decision('b')]);
    const second = addDecisions(first, [decision('a', { answerText: 'Leave it open', answer: { kind: 'leave-open' } }), decision('c')]);
    expect(second.decisions.map((d) => [d.id, d.answerText])).toEqual([
      ['a', 'Leave it open'],
      ['b', 'A rule (normative)'],
      ['c', 'A rule (normative)'],
    ]);
    expect(first.decisions).toHaveLength(2);
  });

  it('decisionsInForce: run scope never, nodes scope when it meets the nodes, subject scope always; newest first', () => {
    const file = addDecisions(empty, [
      decision('run', { scope: 'run' }),
      decision('nodes-hit', { scope: 'nodes', affectedNodes: ['pg-no-dark-past'], date: '2026-11-02T10:00:00.000Z' }),
      decision('nodes-miss', { scope: 'nodes', affectedNodes: ['other-card'] }),
      decision('subject', { scope: 'subject', affectedNodes: [], date: '2026-11-02T11:00:00.000Z' }),
      decision('elsewhere', { scope: 'subject', subject: 'Zelda' }),
    ]);
    expect(decisionsInForce(file, 'Spyro', ['cynder-not-good', 'pg-no-dark-past']).map((d) => d.id)).toEqual(['subject', 'nodes-hit']);
    expect(decisionsInForce(file, 'Spyro', []).map((d) => d.id)).toEqual(['subject']);
    expect(decisionsInForce(file, 'Zelda', []).map((d) => d.id)).toEqual(['elsewhere']);
  });
});

describe('proposalLabel', () => {
  const TARGET = 'Cynder would not be a good addition to the new Spyro game';
  it('names the verdict, the target sentence (cut to 60 characters) and the extras', () => {
    expect(proposalLabel('proved', TARGET, { adoptedGhosts: 0 })).toBe(`Formalize → proved: ${TARGET}`);
    expect(proposalLabel('proved', TARGET, { adoptedGhosts: 1 })).toBe(`Formalize → proved: ${TARGET} (+ 1 adopted axiom)`);
    expect(proposalLabel('not-proved', TARGET, { adoptedGhosts: 2 })).toBe(`Formalize → not proved: ${TARGET} (+ 2 adopted axioms)`);
    expect(proposalLabel('gave-up', TARGET, { adoptedGhosts: 0 })).toBe(`Formalize → not proved: ${TARGET}`);
    // Fixer round 1: a run with no premises; spec v4.1 (slice 1e): its question was the "follows from nothing" mark.
    expect(proposalLabel('not-proved', TARGET, { adoptedGhosts: 0, premises: 0 })).toBe(`Follows from nothing? → not proved: ${TARGET}`);
    expect(proposalLabel('proved', TARGET, { adoptedGhosts: 1, premises: 0 })).toBe(`Follows from nothing? → proved: ${TARGET} (+ 1 adopted axiom)`);
    expect(proposalLabel('proved', TARGET, { adoptedGhosts: 0, premises: 2 })).toBe(`Formalize → proved: ${TARGET}`);
    const long = 'A sentence that is very much longer than sixty characters, so it must be cut';
    expect(proposalLabel('proved', long, { adoptedGhosts: 0 })).toBe('Formalize → proved: A sentence that is very much longer than sixty characters, …');
  });
});
