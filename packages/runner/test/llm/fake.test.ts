import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeBackend, type FakeStep } from '../../src/llm/fake.js';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import type { LlmEvent, SessionConfig } from '../../src/llm/types.js';
import { makeShadow, removeDir, type ShadowFixture } from './helpers.js';

let fx: ShadowFixture;
beforeAll(async () => {
  fx = await makeShadow();
});
afterAll(async () => removeDir(fx.base));

const cfg = (toolHost: StubToolHost, extra: Partial<SessionConfig> = {}): SessionConfig => ({
  cwd: fx.root,
  runDir: fx.runDir,
  systemPrompt: 'test',
  model: 'fake-model',
  toolHost,
  ...extra,
});

async function collect(it: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const askArgs = {
  questions: [
    {
      phenomenon: 'genericity',
      question: 'Do you mean all dragons or dragons typically?',
      options: [
        { label: 'All', consequence: 'A universal statement' },
        { label: 'Typically', consequence: 'A default with exceptions' },
      ],
    },
  ],
};

describe('FakeBackend', () => {
  it('replays writes into the shadow and real tool calls against the host', async () => {
    const host = new StubToolHost();
    host.onQuestion((q) => setTimeout(() => host.answer(q.id, { answers: [{ question: 0, choice: { kind: 'option', option: 1 } }], answeredAt: 'now' }), 50));
    const steps: FakeStep[] = [
      { kind: 'text', text: 'Formalising.' },
      { kind: 'writeFile', path: 'Model/Spyro/Extra.lean', content: 'theorem t : True := trivial\n' },
      { kind: 'edit', path: 'Model.lean', oldString: 'import Model.Spyro.Main', newString: 'import Model.Spyro.Main\nimport Model.Spyro.Extra' },
      { kind: 'callTool', tool: 'check_lean', args: {} },
      { kind: 'callTool', tool: 'ask_user', args: askArgs },
      { kind: 'callTool', tool: 'finish', args: { status: 'proved', summary: 'ok', assumed_without_asking: [] } },
    ];
    const session = await new FakeBackend([steps]).startSession(cfg(host));
    const seen: LlmEvent[] = [];
    session.onEvent((e) => seen.push(e));
    const events = await collect(session.send('These suffice'));
    expect(events[0]).toMatchObject({ type: 'init', model: 'fake-model', apiKeySource: 'none' });
    expect(events.at(-1)).toMatchObject({ type: 'result', status: 'success', numTurns: 6 });
    expect(seen).toHaveLength(events.length);
    expect(await readFile(path.join(fx.root, 'Model', 'Spyro', 'Extra.lean'), 'utf8')).toContain('theorem t');
    expect(await readFile(path.join(fx.root, 'Model.lean'), 'utf8')).toContain('import Model.Spyro.Extra');
    const results = events.filter((e): e is Extract<LlmEvent, { type: 'tool_result' }> => e.type === 'tool_result');
    expect(results.every((r) => !r.isError)).toBe(true);
    expect(results.find((r) => r.text.includes('The user answered'))?.text).toContain('option 1: Typically');
    expect(results.at(-1)?.text).toContain('Gate passed');
    expect(host.calls.map((c) => c.tool)).toEqual(['check_lean', 'ask_user', 'finish']);
    expect(events.filter((e) => e.type === 'tool_use').map((e) => (e as { name: string }).name)).toEqual([
      'Write',
      'Edit',
      'mcp__telelean__check_lean',
      'mcp__telelean__ask_user',
      'mcp__telelean__finish',
    ]);
  });

  it('confines file steps with the same guard as the CLI hook', async () => {
    const session = await new FakeBackend([
      [
        { kind: 'writeFile', path: path.join(fx.outside, 'pwned.txt'), content: 'x' },
        { kind: 'read', path: '.lake/build/x.olean' },
        { kind: 'read', path: 'escape/secret.txt' },
      ],
    ]).startSession(cfg(new StubToolHost()));
    const events = await collect(session.send('go'));
    expect(events.filter((e) => e.type === 'permission_denied')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'tool_result' && e.isError)).toHaveLength(3);
    await expect(stat(path.join(fx.outside, 'pwned.txt'))).rejects.toThrow();
  });

  it('rejects invalid tool arguments with the real schemas', async () => {
    const host = new StubToolHost();
    const session = await new FakeBackend([[{ kind: 'callTool', tool: 'ask_user', args: { questions: [] } }]]).startSession(cfg(host));
    const events = await collect(session.send('go'));
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ isError: true });
    expect(host.calls).toHaveLength(0);
  });

  it('interrupt() cancels a waiting ask_user and ends the turn as interrupted', async () => {
    const host = new StubToolHost();
    const session = await new FakeBackend([
      [
        { kind: 'callTool', tool: 'ask_user', args: askArgs },
        { kind: 'text', text: 'never reached' },
      ],
    ]).startSession(cfg(host));
    host.onQuestion(() => setTimeout(() => void session.interrupt(), 50));
    const events = await collect(session.send('go'));
    expect(events.at(-1)).toMatchObject({ type: 'result', status: 'interrupted' });
    expect(events.some((e) => e.type === 'assistant_text' && e.text === 'never reached')).toBe(false);
    expect(host.pendingQuestions()[0]?.state).toBe('orphaned');
  });

  it('interrupting a turn nobody has read ends it, so the next send() is accepted (verifier probe)', async () => {
    const backend = new FakeBackend((turn, index) => [{ kind: 'text', text: `turn ${index}: ${turn}` }]);
    const session = await backend.startSession(cfg(new StubToolHost()));
    const seen: LlmEvent[] = [];
    session.onEvent((e) => seen.push(e));
    const first = session.send('first'); // never iterated before the interrupt
    await session.interrupt();
    expect(seen.at(-1)).toMatchObject({ type: 'result', status: 'interrupted' });
    const second = await collect(session.send('second'));
    expect(second.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'turn 1: second' });
    expect(second.at(-1)).toMatchObject({ type: 'result', status: 'success' });
    // Reading the cancelled turn later yields only its interrupted result.
    expect(await collect(first)).toEqual([expect.objectContaining({ type: 'result', status: 'interrupted' })]);
  });

  it('runs multi-turn scripts, keeps the session id across turns and refuses overlapping turns', async () => {
    const backend = new FakeBackend((turn, index) => [{ kind: 'text', text: `turn ${index}: ${turn}` }]);
    const session = await backend.startSession(cfg(new StubToolHost(), { sessionId: 'fixed-id' }));
    const first = await collect(session.send('one'));
    const second = session.send('two');
    expect(() => session.send('three')).toThrow(/already running/);
    const events = await collect(second);
    expect(first[0]).toMatchObject({ type: 'init', sessionId: 'fixed-id' });
    expect(events.some((e) => e.type === 'init')).toBe(false);
    expect(events.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'turn 1: two' });
    expect(session.sessionId).toBe('fixed-id');
  });
});
