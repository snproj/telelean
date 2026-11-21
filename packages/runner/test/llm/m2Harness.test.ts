/**
 * WP3's additions to the LLM harness (docs/m2-plan.md sections 4.3, 5.4 and 9 WP3): the compact renderings
 * (permitted axioms in the freeze reply, the alone-entails flag, an environment give-up that is not Claude's fault),
 * MCP tools without readOnlyHint (so the CLI never runs them concurrently with file edits), the FakeBackend's new
 * usage / rateLimit / sleep steps and cumulative cost, and the data-script player.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FakeBackend } from '../../src/llm/fake.js';
import { playFakeScript, validateFakeScriptFile } from '../../src/llm/fakeScripts.js';
import { StubToolHost } from '../../src/llm/stubToolHost.js';
import { renderAdoption, renderCheckResult, renderFreezeResult, renderGateVerdict } from '../../src/llm/toolSchemas.js';
import { startToolServer } from '../../src/llm/toolServer.js';
import type { LlmEvent, SessionConfig } from '../../src/llm/types.js';
import { makeShadow, removeDir, type ShadowFixture } from './helpers.js';

let fx: ShadowFixture;
beforeAll(async () => {
  fx = await makeShadow();
});
afterAll(async () => removeDir(fx.base));

const cfg = (host = new StubToolHost()): SessionConfig => ({ cwd: fx.root, runDir: fx.runDir, systemPrompt: 'test', model: 'fake-model', toolHost: host });

async function collect(it: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('renderings (section 4.3)', () => {
  it('the freeze reply lists the permitted axioms', () => {
    expect(renderFreezeResult({ frozen: true, refusals: [], snapshotId: 'freeze-1', permitted: ['propext', 'Spyro.cynder_dark_past.holds'] })).toBe(
      'Statements frozen (snapshot freeze-1). Now prove them unchanged.\nYour proofs may rest only on these axioms (anything else fails the gate): propext, Spyro.cynder_dark_past.holds.',
    );
    expect(renderFreezeResult({ frozen: false, refusals: ['markup: the target was re-pointed\n  at cynder_not_good_weak'] })).toBe('Freeze refused:\n- markup: the target was re-pointed\n    at cynder_not_good_weak');
  });

  it('an adoption shows the alone-entails flag', () => {
    expect(renderAdoption({ status: 'recorded', ghostId: 'ghost-1', gateChecked: true, aloneEntails: true, message: 'shown to the person' })).toBe(
      'Proposal recorded as ghost-1: shown to the person\nNote: the gap proof uses none of the selected premises, so this suggestion alone gives the target; it may simply restate it.',
    );
    expect(renderAdoption({ status: 'recorded', ghostId: 'ghost-2', gateChecked: true, aloneEntails: false, message: 'ok' })).toBe('Proposal recorded as ghost-2: ok');
    expect(renderAdoption({ status: 'rejected', gateChecked: true, message: 'unknown identifier InGame' })).toBe('Proposal rejected: unknown identifier InGame');
  });

  it('an environment give-up says it is not Claude\'s fault; retries list the exact failures', () => {
    const env = renderGateVerdict({ passed: false, failures: [], flaggedDefinitions: [], attempt: 1, maxAttempts: 3, next: 'give_up', environment: 'low memory' });
    expect(env).toBe('telelean could not run the checks (low memory). This is not your fault and was not counted as an attempt. Stop now and call no more tools: the person has been told, and the run ends here.');
    const retry = renderGateVerdict({ passed: false, failures: [{ check: 'build', detail: 'Main.lean:3:0: error: type mismatch\n  h\nhas type' }], flaggedDefinitions: ['Spyro.InGame'], attempt: 1, maxAttempts: 3, next: 'retry' });
    expect(retry).toBe('Gate failed (attempt 1 of 3):\n- build: Main.lean:3:0: error: type mismatch\n    h\n  has type\nFix these and call finish again.\nNew definitions flagged for the user to review: Spyro.InGame.');
  });

  it('check results are compact text with whole Lean messages', () => {
    const text = renderCheckResult({
      ok: false,
      diagnostics: [{ file: 'Model/Spyro/Main.lean', line: 12, column: 2, severity: 'error', message: "unknown identifier 'foo'\nwhile elaborating" }],
      footprints: { 'Spyro.cynder_not_good.holds': ['propext'], 'Spyro.lemma': [] },
      violations: ['G0 sorry: Model/Spyro/Main.lean:14:4'],
      stage: 'formalise',
      checksLeft: 24,
    });
    expect(text).toBe(
      [
        'Check found problems.',
        'stage: formalise (proofs are rejected until freeze_statements succeeds); checks left: 24.',
        'Violations:',
        '- G0 sorry: Model/Spyro/Main.lean:14:4',
        'Lean messages:',
        "Model/Spyro/Main.lean:12:2: error: unknown identifier 'foo'\n  while elaborating",
        'Axiom footprints:',
        '- Spyro.cynder_not_good.holds: propext',
        '- Spyro.lemma: (no axioms)',
      ].join('\n'),
    );
    expect(renderCheckResult({ ok: false, diagnostics: [], footprints: {}, violations: [], environment: 'sandbox could not start', stage: 'prove', checksLeft: 3 })).toBe(
      'telelean could not run Lean (sandbox could not start). This is not your fault and was not counted as a check; try again, or call finish.\nstage: prove; checks left: 3.',
    );
  });
});

describe('MCP tools declare no readOnlyHint (section 3.7)', () => {
  it('lists every agent tool without annotations, so the CLI never treats them as concurrency-safe', async () => {
    const server = await startToolServer({ host: new StubToolHost() });
    const client = new Client({ name: 't', version: '0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(6); // slice 2d: propose_arrow
      for (const tool of tools) {
        expect(tool.annotations?.readOnlyHint).toBeUndefined();
        expect(tool._meta?.['anthropic/alwaysLoad']).toBe(true);
      }
    } finally {
      await client.close().catch(() => undefined);
      await server.close();
    }
  });
});

describe('FakeBackend M2 steps', () => {
  it('emits usage and rate-limit events, and results carry the cumulative cost', async () => {
    const session = await new FakeBackend([
      [{ kind: 'usage', messageId: 'm1', usage: { inputTokens: 5 } }, { kind: 'rateLimit', info: { status: 'allowed_warning', resetsAt: 1793503200 } }, { kind: 'result', costEstimateUsd: 0.25 }],
      [{ kind: 'usage', model: 'claude-opus-5-5', usage: { outputTokens: 7 } }],
    ]).startSession(cfg());
    const first = await collect(session.send('one'));
    expect(first.find((e) => e.type === 'usage')).toEqual({ type: 'usage', messageId: 'm1', usage: { inputTokens: 5, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }, parentToolUseId: null });
    expect(first.find((e) => e.type === 'rate_limit')).toEqual({ type: 'rate_limit', info: { status: 'allowed_warning', resetsAt: 1793503200 } });
    expect(first.at(-1)).toMatchObject({ type: 'result', costEstimateUsd: 0.25 });
    const second = await collect(session.send('two'));
    expect(second.find((e) => e.type === 'usage')).toMatchObject({ model: 'claude-opus-5-5', usage: { outputTokens: 7 } });
    expect((second.find((e) => e.type === 'usage') as { messageId: string }).messageId).toMatch(/^fake_msg_\d+$/);
    expect(second.at(-1)).toMatchObject({ type: 'result', costEstimateUsd: 0.25 }); // the cumulative figure repeats
  });

  it('a sleep step lets fake time pass and ends early on interrupt', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const session = await new FakeBackend([
        [{ kind: 'sleep', ms: 60_000 }, { kind: 'text', text: 'after the sleep' }],
        [{ kind: 'text', text: 'thinking' }, { kind: 'sleep', ms: 60_000 }, { kind: 'text', text: 'never' }],
      ]).startSession(cfg());
      const done = collect(session.send('one'));
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await done).some((e) => e.type === 'assistant_text' && e.text === 'after the sleep')).toBe(true);
      const second = session.send('two');
      const it = second[Symbol.asyncIterator]();
      expect((await it.next()).value).toMatchObject({ type: 'assistant_text', text: 'thinking' });
      const rest = (async () => {
        const out: LlmEvent[] = [];
        for (let r = await it.next(); !r.done; r = await it.next()) out.push(r.value);
        return out;
      })();
      await session.interrupt();
      const events = await rest;
      expect(events.at(-1)).toMatchObject({ type: 'result', status: 'interrupted' });
      expect(events.some((e) => e.type === 'assistant_text' && e.text === 'never')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('data scripts (test-fixtures/walkthrough)', () => {
  it('plays turns in order, matching turn texts, and keeps the cursor across sessions (resume)', async () => {
    const player = playFakeScript([
      { match: 'Run: "These suffice"', steps: [{ kind: 'text', text: 'round 1' }] },
      { match: 'The person adopted', steps: [{ kind: 'text', text: 'round 2' }] },
    ]);
    const backend = new FakeBackend(player.script);
    const s1 = await backend.startSession(cfg());
    const t1 = await collect(s1.send('Run: "These suffice" for the subject Spyro'));
    const nudged = await collect(s1.send('You ended your turn without calling finish.'));
    const s2 = await backend.startSession({ ...cfg(), resumeSessionId: s1.sessionId ?? '' });
    const t2 = await collect(s2.send('The person adopted your suggestion as an assumption'));
    expect(t1.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'round 1' });
    expect(nudged.filter((e) => e.type === 'assistant_text')).toEqual([]);
    expect(t2.find((e) => e.type === 'assistant_text')).toMatchObject({ text: 'round 2' });
    expect(player.played.map((p) => p.scripted)).toEqual([0, -1, 1]);
    expect(player.remaining()).toBe(0);
  });

  it('validates the shape of a script file', () => {
    expect(() => validateFakeScriptFile({ name: 'x', turns: [{ steps: [{ kind: 'explode' }] }] })).toThrow(/unknown kind "explode"/);
    expect(() => validateFakeScriptFile({ name: 'x', turns: [{ steps: [{ kind: 'edit', path: 'a.lean', oldString: 'a' }] }] })).toThrow(/needs oldString and newString/);
    expect(validateFakeScriptFile({ name: 'ok', turns: [{ match: 'Run:', steps: [{ kind: 'result' }] }] }).name).toBe('ok');
  });
});
