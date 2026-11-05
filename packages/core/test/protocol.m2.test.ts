// The architect's scratch test of the M2 protocol additions, copied by WP1 (docs/m2-plan.md section 0). Changes from
// the scratch copy: imports from ../src/index.js with explicit vitest imports, and the last test expects WP1's
// scanForbidden and diffGraphs to be implemented (the scratch copy asserted they were still stubs).
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
    ok(webviewMessage('startRun', { target: 'g', premises: ['a', 'b'], requestId: 'r1' }));
    ok(webviewMessage('startRun', { target: 'g', premises: [] }));
    ok(webviewMessage('answerQuestions', { runId: 'rabc_1', setId: 'q1', answers: [
      { question: 0, choice: { kind: 'option', option: 1 }, scope: 'run' },
      { question: 1, choice: { kind: 'free-text', text: 'I mean it as a norm.\nNot literally.' }, scope: 'subject' },
      { question: 2, choice: { kind: 'leave-open' }, scope: 'nodes' },
    ], requestId: 'r2' }));
    ok(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q2', answers: [{ question: 0, choice: { kind: 'decide-for-me' }, scope: 'run' }] }));
    ok(webviewMessage('cancelRun', { runId: 'r1' }));
    ok(webviewMessage('resumeRun', { runId: 'r1', requestId: 'x' }));
    ok(webviewMessage('acceptProposal', { runId: 'r1', proposalId: 'p1', lifecycle: ['l1'], definitions: [], requestId: 'r3' }));
    ok(webviewMessage('feedback', { runId: 'r1', text: 'Use the literal reading.' }));
    ok(webviewMessage('discardProposal', { runId: 'r1' }));
    ok(webviewMessage('adoptGhost', { runId: 'r1', ghostId: 'ghost-1', rationale: 'obvious to me' }));
    ok(webviewMessage('adoptGhost', { runId: 'r1', ghostId: 'ghost-1' }));
    ok(webviewMessage('rejectGhost', { runId: 'r1', ghostId: 'ghost-2', requestId: 'r4' }));
    ok(webviewMessage('openProposalDiff', { runId: 'r1', proposalId: 'p1', file: 'Model/Spyro/Main.lean' }));
    ok(webviewMessage('openProposalDiff', { runId: 'r1', proposalId: 'p1' }));
    ok(webviewMessage('dismissRun', { runId: 'r1' }));
    ok(webviewMessage('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, dependents: 'rewrite', confirmedDependents: ['g', 'Spyro.lemma1'] }));
    expect(RUN_MESSAGE_TYPES.length).toBe(11);
  });

  it('refuses malformed run messages', () => {
    bad(webviewMessage('startRun', { target: 'g', premises: ['g'] } as never), 'must not also be a premise');
    bad(webviewMessage('startRun', { target: 'g', premises: ['a', 'a'] } as never), 'more than once');
    bad(webviewMessage('cancelRun', { runId: 'bad id!' } as never), 'payload.runId');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [] } as never), '1 to 3 answers');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [
      { question: 0, choice: { kind: 'leave-open' }, scope: 'run' }, { question: 0, choice: { kind: 'leave-open' }, scope: 'run' }] } as never), 'more than once');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'option', option: 4 }, scope: 'run' }] } as never), 'option');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'free-text', text: '   ' }, scope: 'run' }] } as never), 'blank');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'leave-open' }, scope: 'forever' }] } as never), 'scope');
    bad(webviewMessage('answerQuestions', { runId: 'r1', setId: 'q1', answers: [{ question: 0, choice: { kind: 'guess' }, scope: 'run' }] } as never), 'kind');
    bad(webviewMessage('acceptProposal', { runId: 'r1', proposalId: 'p1', lifecycle: ['l1', 'l1'], definitions: [] } as never), 'more than once');
    bad(webviewMessage('feedback', { runId: 'r1', text: '' } as never), 'payload.text');
    bad(webviewMessage('adoptGhost', { runId: 'r1', ghostId: 'g/1' } as never), 'payload.ghostId');
    bad(webviewMessage('adoptGhost', { runId: 'r1', ghostId: 'ghost-1', rationale: 'two\nlines' } as never), 'single line');
    bad(webviewMessage('openProposalDiff', { runId: 'r1', proposalId: 'p1', file: '../x.lean' } as never), 'payload.file');
    bad(webviewMessage('kindChange', { id: 'a', from: 'ASSUMPTION', to: 'GOAL', beforeId: null, confirmedDependents: 'g' } as never), 'confirmedDependents');
  });

  it('strips unknown properties', () => {
    const r = parseWebviewToHost({ v: 1, type: 'cancelRun', payload: { runId: 'r1', extra: 1 } });
    expect(r).toEqual({ ok: true, value: { v: 1, type: 'cancelRun', payload: { runId: 'r1' } } });
  });
});

describe('M2 host -> webview messages', () => {
  it('passes run and proposal through, and null clears them', () => {
    expect(parseHostToWebview(hostMessage('run', { run: null }))).toEqual({ ok: true, value: hostMessage('run', { run: null }) });
    expect(parseHostToWebview(hostMessage('proposal', { proposal: null })).ok).toBe(true);
    const run = { runId: 'r1', state: 'working', notices: [], activity: [], answered: [], ghosts: [] };
    expect(parseHostToWebview({ v: 1, type: 'run', payload: { run } }).ok).toBe(true);
    expect(parseHostToWebview({ v: 1, type: 'run', payload: { run: { runId: 'r1' } } }).ok).toBe(false);
    const proposal = { runId: 'r1', proposalId: 'p1', graph: spyroGraph() };
    expect(parseHostToWebview({ v: 1, type: 'proposal', payload: { proposal } }).ok).toBe(true);
    expect(parseHostToWebview({ v: 1, type: 'proposal', payload: { proposal: { runId: 'r1', proposalId: 'p1', graph: {} } } }).ok).toBe(false);
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
