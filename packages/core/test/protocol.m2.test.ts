// The architect's scratch test of the M2 protocol additions, copied by WP1 (docs/m2-plan.md section 0). Changes from
// the scratch copy: imports from ../src/index.js with explicit vitest imports, and the last test expects WP1's
// scanForbidden and diffGraphs to be implemented (the scratch copy asserted they were still stubs). Slice 2h
// (docs/slice2-plan.md 2.4) retired M2's review messages and the host's `proposal`: their cases went, and a test pins
// that the validators refuse them.
import { describe, expect, it } from 'vitest';
import { parseWebviewToHost, parseHostToWebview, webviewMessage, hostMessage, spyroGraph, RUN_MESSAGE_TYPES, DEFAULT_RUN_CAPS, isTerminalRunState, attemptsPath, decisionsPath, isImplemented, scanForbidden, diffGraphs } from '../src/index.js';

const ok = (m: unknown) => expect(parseWebviewToHost(JSON.parse(JSON.stringify(m)))).toEqual({ ok: true, value: m });
const bad = (m: unknown, part: string) => {
  const r = parseWebviewToHost(m);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(part);
};

describe('M2 webview -> host messages', () => {
  it('accepts every run message in canonical form', () => {
    ok(webviewMessage('answerQuestions', { runId: 'rabc_1', setId: 'q1', answers: [
      { question: 0, choice: { kind: 'option', option: 1 }, scope: 'run' },
      { question: 1, choice: { kind: 'free-text', text: 'I mean it as a norm.\nNot literally.' }, scope: 'subject' },
      { question: 2, choice: { kind: 'leave-open' }, scope: 'nodes' },
    ], requestId: 'r2' }));
    ok(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q2', answers: [{ question: 0, choice: { kind: 'decide-for-me' }, scope: 'run' }] }));
    ok(webviewMessage('cancelRun', { runId: 'r1' }));
    ok(webviewMessage('resumeRun', { runId: 'r1', requestId: 'x' }));
    ok(webviewMessage('dismissRun', { runId: 'r1' }));
    ok(webviewMessage('kindChange', { id: 'a', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, dependents: 'rewrite', confirmedDependents: ['g', 'Spyro.lemma1'] }));
    // Slice 2 (2c1) appends the session's messages (docs/slice2-plan.md 2.4); since 2h M2's four kept ones come first.
    expect(RUN_MESSAGE_TYPES.slice(0, 4)).toEqual(['answerQuestions', 'cancelRun', 'resumeRun', 'dismissRun']);
    // 2j2 (D2-92): `noteItem` is the fifteenth.
    expect(RUN_MESSAGE_TYPES.length).toBe(15);
  });

  it('refuses malformed run messages', () => {
    bad(webviewMessage('cancelRun', { runId: 'bad id!' } as never), 'payload.runId');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [] } as never), '1 to 3 answers');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [
      { question: 0, choice: { kind: 'leave-open' }, scope: 'run' }, { question: 0, choice: { kind: 'leave-open' }, scope: 'run' }] } as never), 'more than once');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'option', option: 4 }, scope: 'run' }] } as never), 'option');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'free-text', text: '   ' }, scope: 'run' }] } as never), 'blank');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'leave-open' }, scope: 'forever' }] } as never), 'scope');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'guess' }, scope: 'run' }] } as never), 'kind');
    bad(webviewMessage('kindChange', { id: 'a', from: 'PROPOSITION', to: 'AXIOM', beforeId: null, confirmedDependents: 'g' } as never), 'confirmedDependents');
  });

  it('slice 2h: the retired messages are refused by the validators (M2\'s review, its start and the host\'s proposal)', () => {
    // Well-formed payloads as M2's validators took them: each type is unknown now, whatever it carries.
    const retired: Array<[string, Record<string, unknown>]> = [
      ['startRun', { target: 'g', premises: ['a'], requestId: 'r1' }],
      ['acceptProposal', { runId: 'r1', proposalId: 'p1', definitions: [] }],
      ['feedback', { runId: 'r1', text: 'Use the literal reading.' }],
      ['discardProposal', { runId: 'r1' }],
      ['adoptGhost', { runId: 'r1', ghostId: 'ghost-1' }],
      ['rejectGhost', { runId: 'r1', ghostId: 'ghost-1' }],
      ['openProposalDiff', { runId: 'r1', proposalId: 'p1' }],
    ];
    for (const [type, payload] of retired) {
      const r = parseWebviewToHost({ v: 1, type, payload });
      expect(r, type).toEqual({ ok: false, error: `unknown message type "${type}"` });
      expect((RUN_MESSAGE_TYPES as readonly string[]).includes(type), type).toBe(false);
    }
    expect(parseHostToWebview({ v: 1, type: 'proposal', payload: { proposal: null } })).toEqual({ ok: false, error: 'unknown message type "proposal"' });
    expect(parseHostToWebview({ v: 1, type: 'proposal', payload: { proposal: { runId: 'r1', proposalId: 'p1', graph: spyroGraph() } } }).ok).toBe(false);
  });

  it('strips unknown properties', () => {
    const r = parseWebviewToHost({ v: 1, type: 'cancelRun', payload: { runId: 'r1', extra: 1 } });
    expect(r).toEqual({ ok: true, value: { v: 1, type: 'cancelRun', payload: { runId: 'r1' } } });
  });
});

describe('M2 host -> webview messages', () => {
  it('passes run through, and null clears it (2h: the proposal message is retired, see above)', () => {
    expect(parseHostToWebview(hostMessage('run', { run: null }))).toEqual({ ok: true, value: hostMessage('run', { run: null }) });
    const run = { runId: 'r1', state: 'working', notices: [], activity: [], answered: [], ghosts: [] };
    expect(parseHostToWebview({ v: 1, type: 'run', payload: { run } }).ok).toBe(true);
    expect(parseHostToWebview({ v: 1, type: 'run', payload: { run: { runId: 'r1' } } }).ok).toBe(false);
  });
});

describe('M2 helpers implemented with the contract', () => {
  it('caps, states, sidecar paths, WP1 implemented', () => {
    expect(DEFAULT_RUN_CAPS).toEqual({ maxTurns: 80, maxChecks: 25, maxAgentMs: 1_200_000, leanJobMs: 120_000, maxGateAttempts: 3 });
    expect(isTerminalRunState('review')).toBe(false);
    expect(isTerminalRunState('accepted')).toBe(true);
    expect(attemptsPath('Spyro')).toBe('.telelean/subjects/Spyro/attempts.jsonl');
    expect(decisionsPath('Spyro')).toBe('.telelean/subjects/Spyro/decisions.json');
    expect(isImplemented(() => scanForbidden('a.lean', '', { library: 'Model', subject: 'Spyro', projectModules: new Set() }))).toBe(true);
    expect(isImplemented(() => diffGraphs(spyroGraph(), spyroGraph()))).toBe(true);
  });
});
