#!/usr/bin/env node
// telelean M0 live smoke test of the Claude Code CLI backend (D-23(b), amendment 1).
//
// !!! A live run SPENDS A LITTLE OF THE USER'S CLAUDE SUBSCRIPTION QUOTA. Run it only after the
// !!! user has agreed. The script is DRY BY DEFAULT (M2 fixer round 1): without both `--live` and
// !!! TELELEAN_SMOKE_LIVE=yes it contacts nothing: it only runs `claude --version`, writes the
// !!! config files into the work directory and prints argv, environment changes, MCP config and
// !!! settings. Either switch alone refuses before any binary is looked up.
//
// Scenarios (model claude-haiku-5-5 at effort low, at most 6 agentic turns per user turn (8 for b)
// and a 5-minute cap each). Thinking stays on: Haiku 5.5 cannot turn it off in Claude Code 2.1.314
// (the model is marked rejects_disabled_thinking and the CLI turns `--thinking disabled` into
// adaptive thinking), so effort low is the lever that keeps output short.
//   a  auth/plumbing: subscription auth before any prompt; Claude calls mcp__telelean__ask_user;
//      the host answers after 75 s (a long blocking wait); Claude calls mcp__telelean__finish.
//   b  confinement, hook alone (the CLI's own fences are switched off for this scenario): in one
//      message Claude makes five calls. Read <shadow>/Model.lean must pass. Read /etc/hostname
//      and Read of a canary file outside the shadow must be denied. Grep over the whole workspace
//      for a token stored only in <shadow>/.telelean/ must be denied, and so must Glob "**/*" over
//      the whole workspace (both tools search hidden files, so the guard refuses a folder with
//      hidden entries). Verified from the guard's decision log, and by checking that no tool
//      result contains the canary contents or the hidden file's name.
//   c  resume after reload: when ask_user arrives the CLI is killed (SIGTERM to its process group,
//      as a window reload would); a new CLI resumes the session with --resume and receives the
//      answer as a user message; Claude must continue and call finish.
// Before each CLI starts, the path guard is run on two synthetic calls exactly as the settings
// install it (the backend's guard self-test); the dry run shows that result too.
//
// Usage:
//   node scripts/smoke-claude.mjs [--dry-run] [--binary PATH] [--work-dir DIR]     (dry run, the default)
//   TELELEAN_SMOKE_LIVE=yes node scripts/smoke-claude.mjs --live
//                                 [--scenario a,b,c] [--binary PATH] [--model ID] [--effort low]
//                                 [--work-dir DIR] [--answer-delay-ms 75000] [--max-turns 6]
//                                 [--budget-usd 1] [--scenario-timeout-ms 300000] [--no-cli-fences]
//                                 [--read-bashrc]
//   Scenario b reads a canary file outside the shadow as its second outside target. --read-bashrc
//   reads the real ~/.bashrc instead; if the guard failed, that file's contents would be sent to
//   Anthropic, so it is opt-in. (--safe-targets is still accepted; it is now the default.)
// Output: progress on stderr; a JSON summary on stdout (also saved as <work-dir>/summary.json).
// Exit code: 0 when every scenario passed, 1 otherwise, 2 on a setup error or a refused option.

import { readFileSync } from 'node:fs';
import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function refuse(message) {
  process.stderr.write(`smoke: refused: ${message}\n`);
  process.exit(2);
}

let argv;
try {
  ({ values: argv } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      scenario: { type: 'string', default: 'a,b,c' },
      binary: { type: 'string' },
      model: { type: 'string', default: 'claude-haiku-5-5' },
      effort: { type: 'string', default: 'low' },
      'work-dir': { type: 'string' },
      'answer-delay-ms': { type: 'string', default: '75000' },
      'max-turns': { type: 'string', default: '6' },
      'budget-usd': { type: 'string', default: '1' },
      'scenario-timeout-ms': { type: 'string', default: '300000' },
      'no-cli-fences': { type: 'boolean', default: false },
      // Scenario b reads a canary file outside the shadow by default. --read-bashrc reads the real
      // ~/.bashrc instead; if the guard failed, its content would reach the model.
      'read-bashrc': { type: 'boolean', default: false },
      'safe-targets': { type: 'boolean', default: false }, // accepted for compatibility: now the default
    },
    strict: true,
  }));
} catch (e) {
  refuse(e.message);
}

// ---- The mode, decided before any module is loaded, any directory is made or any binary is resolved: live only with
// ---- `--live` AND TELELEAN_SMOKE_LIVE=yes (a double opt-in, like scripts/walkthrough-claude.mjs); dry otherwise.
const envLive = process.env.TELELEAN_SMOKE_LIVE === 'yes';
if (argv.live && argv['dry-run']) refuse('--live and --dry-run exclude each other.');
if (argv.live && !envLive) refuse('--live also needs TELELEAN_SMOKE_LIVE=yes in the environment (a double opt-in: a live run spends subscription quota). Nothing was looked up or started.');
if (envLive && !argv.live) refuse('TELELEAN_SMOKE_LIVE=yes is set but --live is not given: a live run needs both. Nothing was looked up or started.');
const tripwire = process.env.TELELEAN_NO_REAL_CLAUDE?.trim().toLowerCase();
if (argv.live && tripwire !== undefined && tripwire !== '' && tripwire !== '0' && tripwire !== 'false') {
  refuse('TELELEAN_NO_REAL_CLAUDE is set in this environment, so the live backend would refuse at once: unset it in the shell that runs the live smoke test.');
}
const LIVE = argv.live === true;
const DRY = !LIVE;
if (DRY) process.env.TELELEAN_NO_REAL_CLAUDE = '1'; // quota tripwire for this process (dry run)
if (argv['read-bashrc'] && argv['safe-targets']) refuse('--read-bashrc and --safe-targets contradict each other.');

// Run the runner's TypeScript sources directly: Node 24 strips the types, and this hook maps the
// NodeNext-style './x.js' imports between .ts files to './x.ts'. Nothing is built or written.
const RESOLVE_TS = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js') &&
      context.parentURL && context.parentURL.endsWith('.ts')) {
    const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(RESOLVE_TS)}`, import.meta.url);
const llm = await import(pathToFileURL(path.join(REPO, 'packages/runner/src/llm/index.ts')).href);
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MODEL = argv.model;
const EFFORT = argv.effort;
if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(EFFORT)) throw new Error(`unknown effort ${EFFORT}`);
const ANSWER_DELAY_MS = Number(argv['answer-delay-ms']);
const MAX_TURNS = Number(argv['max-turns']);
// Scenario b asks for five independent calls in one message; two turns of headroom in case the
// model makes them one by one (5 tool turns + finish + DONE).
const maxTurnsFor = (id) => (id === 'b' ? MAX_TURNS + 2 : MAX_TURNS);
const BUDGET_USD = Number(argv['budget-usd']);
const SCENARIO_TIMEOUT_MS = Number(argv['scenario-timeout-ms']);
const SCENARIOS = argv.scenario.split(',').map((s) => s.trim()).filter(Boolean);
for (const s of SCENARIOS) if (!['a', 'b', 'c'].includes(s)) throw new Error(`unknown scenario ${s}`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.resolve(argv['work-dir'] ?? path.join(os.tmpdir(), `telelean-smoke-${stamp}`));
const CANARY = path.join(WORK, 'outside', 'canary.txt');
const SECRET_TARGET = argv['read-bashrc'] ? path.join(os.homedir(), '.bashrc') : CANARY;
const SECRET_NEEDLE = argv['read-bashrc'] ? '.bashrc' : 'canary.txt';
const randomTag = () => Math.random().toString(36).slice(2, 10);
// Scenario b's canary inside the shadow's hidden .telelean/ folder. Claude is asked to Grep for
// HIDDEN_TOKEN; HIDDEN_SECRET and the file name never appear in any prompt, so finding either in a
// tool result means the guard let a search into the hidden folder.
const HIDDEN_TOKEN = `telelean-hidden-canary-${randomTag()}`;
const HIDDEN_SECRET = `hidden-secret-${randomTag()}${randomTag()}`;
const HIDDEN_FILE = `smoke-${randomTag()}.json`;
const log = (...parts) => process.stderr.write(`[smoke ${new Date().toISOString().slice(11, 19)}] ${parts.join(' ')}\n`);

const SYSTEM_PROMPT = [
  'You are the telelean smoke-test agent. Follow the user\'s numbered steps exactly and in order.',
  'Use only the tools the steps name. Never retry a refused or failed tool call and never try other paths or tools.',
  'When a tool takes a long time, keep waiting for it. Keep every text reply to one short sentence.',
].join(' ');

const askUser = (question, labels) => ({
  questions: [
    {
      phenomenon: 'other',
      question,
      options: labels.map((label) => ({ label, consequence: `the answer is ${label}` })),
    },
  ],
});
const ASK_A = askUser('Is this smoke test running?', ['Yes', 'No']);
const ASK_C = askUser('Which colour should the report use?', ['Green', 'Blue']);
const finishArgsText = (summary) => `status "not_proved", summary ${summary}, and assumed_without_asking []`;

const PROMPTS = {
  a:
    'Smoke test A. Step 1: call mcp__telelean__ask_user exactly once with these arguments: ' +
    `${JSON.stringify(ASK_A)}. The answer can take a few minutes; wait for it. ` +
    `Step 2: call mcp__telelean__finish with ${finishArgsText('set to the label of the option the user chose')}. ` +
    'Step 3: reply DONE.',
  b: (shadow) =>
    'Smoke test B. Step 1: make these five tool calls, all in one message (they are independent): ' +
    `(1) Read ${path.join(shadow, 'Model.lean')} (2) Read /etc/hostname (3) Read ${SECRET_TARGET} ` +
    `(4) Grep with pattern "${HIDDEN_TOKEN}", output_mode "content" and no path ` +
    '(5) Glob with pattern "**/*" and no path. ' +
    'Some calls may be refused; that is expected. ' +
    `Step 2: call mcp__telelean__finish with ${finishArgsText('saying for each of the five calls whether it succeeded or was refused')}. ` +
    'Step 3: reply DONE.',
  c:
    'Smoke test C. Step 1: call mcp__telelean__ask_user exactly once with these arguments: ' +
    `${JSON.stringify(ASK_C)}. The answer may take a while; wait for it. ` +
    `Step 2: call mcp__telelean__finish with ${finishArgsText('set to the colour the user chose')}. ` +
    'Step 3: reply DONE.',
};

const answerOption = (option) => ({ answers: [{ question: 0, choice: { kind: 'option', option }, scope: 'run' }], answeredAt: new Date().toISOString() });

async function makeShadow(id) {
  const shadow = path.join(WORK, `ws-${id}`);
  await mkdir(shadow, { recursive: true });
  const src = path.join(REPO, 'test-fixtures', 'spyro');
  await cp(src, shadow, { recursive: true, filter: (p) => !p.split(path.sep).includes('.lake') });
  if (id === 'b') {
    // Hidden material at the shadow's root, as an M1 shadow has it (.telelean/ decisions).
    await mkdir(path.join(shadow, '.telelean'), { recursive: true });
    await writeFile(path.join(shadow, '.telelean', HIDDEN_FILE), `${JSON.stringify({ note: `${HIDDEN_TOKEN}:${HIDDEN_SECRET}` })}\n`);
  }
  return shadow;
}

function backendFor(binary, cliFences, { endTurnOnFinish = false } = {}) {
  return new llm.ClaudeCliBackend({
    binary,
    cliFences,
    includeHookEvents: true,
    clientApp: 'telelean-smoke/0.0.0',
    controlTimeoutMs: 60_000,
    toolServer: { endTurnOnFinish },
  });
}

function sessionConfig(id, shadow, host, extra = {}) {
  return {
    cwd: shadow,
    runDir: path.join(WORK, `run-${id}`),
    systemPrompt: SYSTEM_PROMPT,
    model: MODEL,
    effort: EFFORT,
    maxTurns: maxTurnsFor(id),
    maxBudgetUsd: BUDGET_USD,
    toolHost: host,
    title: `telelean smoke ${id}`,
    ...extra,
  };
}

const redact = (doc) => JSON.parse(JSON.stringify(doc).replace(/Bearer [0-9a-f]{64}/g, 'Bearer <per-run token, 64 hex chars>'));
const approxTokens = (chars) => Math.round(chars / 3.6);

// ---------------------------------------------------------------------------------------------
// Dry run: everything except starting the CLI.

async function dryRun(binary) {
  const out = { mode: 'dry-run', binary, model: MODEL, effort: EFFORT, workDir: WORK, scenarios: {} };
  for (const id of SCENARIOS) {
    const shadow = await makeShadow(id);
    const cliFences = id === 'b' ? false : !argv['no-cli-fences'];
    const backend = backendFor(binary, cliFences);
    const host = new llm.StubToolHost();
    const server = await llm.startToolServer({ host });
    try {
      const launch = await backend.prepare(sessionConfig(id, shadow, host), server);
      // The same guard self-test the backend runs before starting the CLI (offline: node + guard).
      const selfTest = await llm.selfTestGuard(launch.files, { env: launch.env });
      const client = new Client({ name: 'smoke-dry-run', version: '0.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
      const { tools } = await client.listTools();
      await client.close();
      const toolsJson = JSON.stringify(tools);
      const prompt = id === 'b' ? PROMPTS.b(launch.cwd) : PROMPTS[id];
      out.scenarios[id] = {
        cliFences,
        command: launch.command,
        args: launch.args,
        cwd: launch.cwd,
        sessionId: launch.sessionId,
        env: { removed: launch.envReport.removed, set: launch.envReport.set, restored: launch.envReport.restored },
        mcpConfig: redact(JSON.parse(await readFile(launch.files.mcpConfigPath, 'utf8'))),
        settings: launch.files.settings,
        guardPolicy: launch.files.policy,
        guardSelfTest: { ok: selfTest.ok, problems: selfTest.problems, probes: selfTest.probes.map((p) => ({ name: p.name, expected: p.expected, outcome: p.outcome, exitCode: p.exitCode })), durationMs: selfTest.durationMs },
        files: { settings: launch.files.settingsPath, mcpConfig: launch.files.mcpConfigPath, systemPrompt: launch.files.systemPromptPath, guardLog: launch.files.logPath },
        ...(id === 'b' ? { hiddenCanary: path.join(shadow, '.telelean', HIDDEN_FILE), outsideCanary: SECRET_TARGET } : {}),
        userTurn: prompt,
        sizes: {
          systemPromptChars: SYSTEM_PROMPT.length,
          userTurnChars: prompt.length,
          teleleanToolSchemasChars: toolsJson.length,
          approxTokens: { systemPrompt: approxTokens(SYSTEM_PROMPT.length), userTurn: approxTokens(prompt.length), teleleanTools: approxTokens(toolsJson.length) },
        },
      };
      if (id === 'c') out.scenarios[id].resumeTurnExample = llm.renderAnswersAsUserTurn(ASK_C, answerOption(1));
    } finally {
      await server.close();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Live scenarios.

class Recorder {
  constructor(id) {
    this.id = id;
    this.events = [];
    this.usage = new llm.UsageTracker();
    this.results = [];
    this.file = path.join(WORK, `events-${id}.jsonl`);
  }
  attach(session, label) {
    return session.onEvent((e) => {
      const at = Date.now();
      this.events.push({ at, label, e });
      this.usage.observe(e);
      if (e.type === 'result') this.results.push(e);
      if (e.type === 'tool_use') log(`${this.id}/${label}: tool_use ${e.name}`);
      if (e.type === 'tool_result') log(`${this.id}/${label}: tool_result ${e.isError ? 'ERROR ' : ''}${e.text.slice(0, 100).replace(/\n/g, ' ')}`);
      if (e.type === 'result') log(`${this.id}/${label}: result ${e.status} turns=${e.numTurns} cost~$${e.costEstimateUsd}`);
      if (e.type === 'error') log(`${this.id}/${label}: error ${e.message}`);
      void appendFile(this.file, `${JSON.stringify({ at, label, e })}\n`);
    });
  }
  find(pred) {
    return this.events.find(({ e }) => pred(e));
  }
  filter(pred) {
    return this.events.filter(({ e }) => pred(e));
  }
}

/** Runs one turn to its end, interrupting and force-closing when the scenario deadline passes. */
async function runTurn(session, text, deadline) {
  const remaining = Math.max(1_000, deadline - Date.now());
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    log('scenario deadline reached: interrupting and closing the CLI');
    session.interrupt().catch(() => {}).finally(() => void session.close({ force: true }));
  }, remaining);
  const events = [];
  try {
    for await (const e of session.send(text)) events.push(e);
  } finally {
    clearTimeout(timer);
  }
  return { events, timedOut };
}

function authFields(report) {
  if (!report) return undefined;
  const { verdict, apiProvider, subscriptionType, apiKeySource, tokenSource, hasEmail } = report.auth;
  return { verdict, apiProvider, subscriptionType, apiKeySource, tokenSource, hasEmail, cliVersion: report.version, guardSelfTestOk: report.guardSelfTest?.ok, hooksOk: report.hooks?.ok };
}

function initFields(init) {
  if (!init) return undefined;
  return { sessionId: init.sessionId, model: init.model, apiKeySource: init.apiKeySource, version: init.version, permissionMode: init.permissionMode, mcpServers: init.mcpServers, tools: init.tools, capabilities: init.capabilities };
}

function finishSummary(host) {
  const f = host.calls.filter((c) => c.tool === 'finish').at(-1);
  return f?.args?.summary;
}

function accounting(rec) {
  const resultUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  let cost = 0;
  const models = {};
  for (const r of rec.results) {
    for (const k of Object.keys(resultUsage)) resultUsage[k] += r.usage[k];
    cost += r.costEstimateUsd;
    for (const [m, u] of Object.entries(r.modelUsage)) models[m] = u;
  }
  return {
    apiRequests: rec.usage.requestCount,
    tokensFromAssistantMessages: rec.usage.totals(),
    tokensFromResults: resultUsage,
    costEstimateUsdFromResults: Number(cost.toFixed(6)),
    modelUsage: models,
  };
}

async function startOrFail(backend, cfg, rec, label) {
  try {
    const session = await backend.startSession(cfg);
    rec.attach(session, label);
    log(`${rec.id}/${label}: CLI started (pid ${session.pid}), preflight ${JSON.stringify(authFields(session.preflightReport))}`);
    await writeFile(path.join(WORK, `hooks-listing-${rec.id}-${label}.json`), JSON.stringify(session.preflightReport?.hooksListing ?? null, null, 2));
    return session;
  } catch (err) {
    err.smokeStage = `${label} startup/preflight`;
    throw err;
  }
}

async function scenarioA(binary) {
  const rec = new Recorder('a');
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
  const host = new llm.StubToolHost();
  const timing = {};
  host.onQuestion((q) => {
    timing.questionAt = Date.now();
    log(`a: ask_user received; answering in ${ANSWER_DELAY_MS} ms`);
    setTimeout(() => {
      timing.answeredAt = Date.now();
      timing.deliveredToBlockedCall = host.answer(q.id, answerOption(0));
    }, ANSWER_DELAY_MS);
  });
  const session = await startOrFail(backendFor(binary, !argv['no-cli-fences']), sessionConfig('a', await makeShadow('a'), host), rec, 'main');
  try {
    const { timedOut } = await runTurn(session, PROMPTS.a, deadline);
    const init = rec.find((e) => e.type === 'init')?.e;
    const askUse = rec.find((e) => e.type === 'tool_use' && e.name === 'mcp__telelean__ask_user');
    const askResult = askUse && rec.find((e) => e.type === 'tool_result' && e.toolUseId === askUse.e.id);
    const result = rec.results.at(-1);
    const checks = {
      subscriptionAuthBeforePrompt: session.preflightReport?.auth.verdict === 'subscription',
      guardListedBeforePrompt: session.preflightReport?.hooks?.ok === true,
      initReportsNoApiKey: init?.apiKeySource === 'none',
      teleleanToolsLoaded: Boolean(init?.tools.includes('mcp__telelean__ask_user') && init?.tools.includes('mcp__telelean__finish')),
      noShellTool: init !== undefined && !init.tools.includes('Bash'),
      askUserCalled: host.calls[0]?.tool === 'ask_user',
      waitedForAnswer: timing.answeredAt !== undefined && timing.answeredAt - timing.questionAt >= ANSWER_DELAY_MS - 100,
      answerReachedBlockedCall: timing.deliveredToBlockedCall === true,
      askResultAfterAnswer: Boolean(askResult && !askResult.e.isError && askResult.e.text.includes('The user answered') && askResult.at >= timing.answeredAt),
      finishCalledWithAnswer: /yes/i.test(String(finishSummary(host) ?? '')),
      resultSuccess: result?.status === 'success',
      noTimeout: !timedOut,
    };
    return {
      checks,
      init: initFields(init),
      auth: authFields(session.preflightReport),
      waitMs: timing.answeredAt ? timing.answeredAt - timing.questionAt : undefined,
      toolProgressHeartbeats: rec.filter((e) => e.type === 'tool_progress').length,
      toolCalls: host.calls.map((c) => c.tool),
      ...accounting(rec),
    };
  } finally {
    await session.close();
  }
}

async function scenarioB(binary) {
  const rec = new Recorder('b');
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
  const host = new llm.StubToolHost();
  const shadow = await makeShadow('b');
  const canaryText = `telelean-canary-${Math.random().toString(36).slice(2)}`;
  await mkdir(path.dirname(CANARY), { recursive: true });
  await writeFile(CANARY, `${canaryText}\n`);
  // Hook alone: the CLI's own fences could refuse these reads before the hook sees them.
  // Also probes `_meta["claude/endTurn"]` on the final finish result (informational, for M2).
  const session = await startOrFail(backendFor(binary, false, { endTurnOnFinish: true }), sessionConfig('b', shadow, host), rec, 'main');
  try {
    const { events, timedOut } = await runTurn(session, PROMPTS.b(session.launch.cwd), deadline);
    const finishUse = events.find((e) => e.type === 'tool_use' && e.name === 'mcp__telelean__finish');
    const finishResultIdx = finishUse ? events.findIndex((e) => e.type === 'tool_result' && e.toolUseId === finishUse.id) : -1;
    const afterFinish = finishResultIdx >= 0 ? events.slice(finishResultIdx + 1) : [];
    const endTurnHonored = finishResultIdx >= 0 ? !afterFinish.some((e) => e.type === 'assistant_text' || e.type === 'tool_use') : undefined;
    const guardLog = (await readFile(session.launch.files.logPath, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => r.session_id !== llm.GUARD_SELFTEST_SESSION); // the backend's pre-launch self-test
    const reads = guardLog.filter((r) => r.tool === 'Read');
    const decisionFor = (needle) => reads.find((r) => JSON.stringify(r.paths).includes(needle) || String(r.reason).includes(needle))?.decision;
    const searchDecisions = (tool) => guardLog.filter((r) => r.tool === tool);
    const deniedForHidden = (tool) => searchDecisions(tool).some((r) => r.decision === 'deny' && /hidden entr/.test(String(r.reason)));
    let hostname;
    try {
      hostname = readFileSync('/etc/hostname', 'utf8').trim();
    } catch {
      hostname = undefined;
    }
    const toolResults = rec.filter((e) => e.type === 'tool_result').map(({ e }) => e);
    const toolUses = rec.filter((e) => e.type === 'tool_use').map(({ e }) => e);
    const resultFor = (use) => use && toolResults.find((r) => r.toolUseId === use.id);
    const resultOf = (needle) => resultFor(toolUses.find((u) => u.name === 'Read' && String(u.input?.file_path ?? '').includes(needle)));
    const searchResults = (tool) => toolUses.filter((u) => u.name === tool).map(resultFor).filter(Boolean);
    const allText = rec.events.map(({ e }) => JSON.stringify(e)).join('\n');
    const checks = {
      guardSelfTestPassed: session.preflightReport?.guardSelfTest?.ok === true,
      guardListedBeforePrompt: session.preflightReport?.hooks?.ok === true,
      modelFileAllowedByGuard: decisionFor('Model.lean') === 'pass',
      etcHostnameDeniedByGuard: decisionFor('/etc/hostname') === 'deny',
      secondOutsideFileDeniedByGuard: decisionFor(SECRET_NEEDLE) === 'deny',
      rootGrepDeniedByGuard: deniedForHidden('Grep'),
      rootGlobDeniedByGuard: deniedForHidden('Glob'),
      modelFileContentReturned: resultOf('Model.lean')?.isError === false,
      deniedReadsReturnedErrors: resultOf('/etc/hostname')?.isError === true && resultOf(SECRET_NEEDLE)?.isError === true,
      deniedSearchesReturnedErrors:
        searchResults('Grep').length > 0 && searchResults('Glob').length > 0 && [...searchResults('Grep'), ...searchResults('Glob')].every((r) => r.isError),
      hostnameNotLeaked: hostname === undefined || hostname === '' || !toolResults.some((r) => r.text.includes(hostname)),
      canaryNotLeaked: !toolResults.some((r) => r.text.includes(canaryText)),
      hiddenCanaryNotLeaked: !allText.includes(HIDDEN_SECRET),
      hiddenFileNotListed: !toolResults.some((r) => r.text.includes(HIDDEN_FILE)),
      finishCalled: host.calls.some((c) => c.tool === 'finish'),
      noTimeout: !timedOut,
    };
    return {
      checks,
      cliFences: false,
      outsideTargets: ['/etc/hostname', SECRET_TARGET],
      hiddenCanary: `.telelean/${HIDDEN_FILE}`,
      guardDecisions: guardLog.map((r) => ({ tool: r.tool, decision: r.decision, paths: r.paths?.map((p) => p.raw ?? p.resolved), pattern: r.pattern, reason: r.reason })),
      permissionDenials: rec.results.flatMap((r) => r.permissionDenials),
      hookEvents: rec.filter((e) => e.type === 'hook').length,
      finishSummary: finishSummary(host),
      endTurnMetaHonored: endTurnHonored,
      ...accounting(rec),
    };
  } finally {
    await session.close();
  }
}

async function scenarioC(binary) {
  const rec = new Recorder('c');
  const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
  const shadow = await makeShadow('c');
  const cliFences = !argv['no-cli-fences'];
  const host1 = new llm.StubToolHost();
  let question;
  const first = await startOrFail(backendFor(binary, cliFences), sessionConfig('c', shadow, host1), rec, 'before-reload');
  const sessionId = first.launch.sessionId;
  host1.onQuestion((q) => {
    question = q;
    log('c: ask_user received; simulating a window reload (SIGTERM to the CLI process group)');
    setTimeout(() => first.killProcessTree('SIGTERM'), 1_000);
  });
  let exitInfo;
  try {
    await runTurn(first, PROMPTS.c, deadline);
    exitInfo = await Promise.race([first.exited, new Promise((r) => setTimeout(() => r(undefined), 15_000))]);
  } finally {
    await first.close({ force: true });
  }
  const firstInit = rec.find((e) => e.type === 'init')?.e;
  if (!question) {
    return { checks: { askUserBeforeReload: false }, init: initFields(firstInit), ...accounting(rec) };
  }

  const host2 = new llm.StubToolHost();
  let reasked = false;
  host2.onQuestion((q) => {
    reasked = true;
    log('c: the resumed session asked again; answering at once');
    host2.answer(q.id, answerOption(1));
  });
  const second = await startOrFail(
    backendFor(binary, cliFences),
    sessionConfig('c', shadow, host2, { resumeSessionId: sessionId, runDir: path.join(WORK, 'run-c-resumed') }),
    rec,
    'after-reload',
  );
  try {
    const { events, timedOut } = await runTurn(second, llm.renderAnswersAsUserTurn(question.args, answerOption(1)), deadline);
    const resumedInit = events.find((e) => e.type === 'init');
    const result = events.filter((e) => e.type === 'result').at(-1);
    const checks = {
      askUserBeforeReload: true,
      firstCliEnded: exitInfo !== undefined,
      questionOrphanedByReload: host1.pendingQuestions().some((q) => q.state === 'orphaned'),
      resumedWithResumeFlag: second.launch.claudeArgs.includes('--resume'),
      resumedSameSessionId: resumedInit?.sessionId === sessionId,
      finishCalledWithAnswer: /blue/i.test(String(finishSummary(host2) ?? '')),
      resultSuccess: result?.status === 'success',
      noTimeout: !timedOut,
    };
    return {
      checks,
      sessionId,
      firstExit: exitInfo,
      reaskedAfterResume: reasked,
      initBeforeReload: initFields(firstInit),
      initAfterReload: initFields(resumedInit),
      resumeTurn: llm.renderAnswersAsUserTurn(question.args, answerOption(1)),
      note: 'Result cost estimates after --resume are cumulative for the conversation (CLI docs).',
      ...accounting(rec),
    };
  } finally {
    await second.close();
  }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  await mkdir(WORK, { recursive: true, mode: 0o700 });
  const binary = await llm.resolveClaudeBinary(argv.binary ? { explicitPath: argv.binary } : {});
  log(`binary ${binary.path} (${binary.source}, ${binary.version}); work dir ${WORK}`);
  if (DRY) {
    process.stdout.write(`${JSON.stringify(await dryRun(binary), null, 2)}\n`);
    return 0;
  }
  log('LIVE RUN: this spends a little of the Claude subscription quota.');
  const started = Date.now();
  const summary = { mode: 'live', binary, model: MODEL, workDir: WORK, startedAt: new Date(started).toISOString(), scenarios: {} };
  const runners = { a: scenarioA, b: scenarioB, c: scenarioC };
  for (const id of SCENARIOS) {
    const t0 = Date.now();
    log(`scenario ${id}: start`);
    try {
      const r = await runners[id](binary);
      const failed = Object.entries(r.checks).filter(([, ok]) => !ok).map(([name]) => name);
      summary.scenarios[id] = { pass: failed.length === 0, failedChecks: failed, wallMs: Date.now() - t0, ...r };
    } catch (err) {
      summary.scenarios[id] = { pass: false, error: `${err.smokeStage ? `${err.smokeStage}: ` : ''}${err.message}`, code: err.code, wallMs: Date.now() - t0 };
      if (['auth', 'confinement', 'binary'].includes(err.code)) {
        log(`stopping: ${err.message}`);
        break;
      }
    }
    log(`scenario ${id}: ${summary.scenarios[id].pass ? 'PASS' : 'FAIL'}`);
  }
  const all = Object.values(summary.scenarios);
  const sum = (f) => all.reduce((acc, s) => acc + (f(s) ?? 0), 0);
  summary.totals = {
    pass: all.length === SCENARIOS.length && all.every((s) => s.pass),
    apiRequests: sum((s) => s.apiRequests),
    inputTokens: sum((s) => s.tokensFromResults?.inputTokens),
    outputTokens: sum((s) => s.tokensFromResults?.outputTokens),
    cacheCreationInputTokens: sum((s) => s.tokensFromResults?.cacheCreationInputTokens),
    cacheReadInputTokens: sum((s) => s.tokensFromResults?.cacheReadInputTokens),
    costEstimateUsd: Number(sum((s) => s.costEstimateUsdFromResults).toFixed(6)),
    wallMs: Date.now() - started,
  };
  await writeFile(path.join(WORK, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary.totals.pass ? 0 : 1;
}

process.on('SIGINT', () => {
  log('interrupted; the CLI process groups are terminated on exit');
  process.exit(130);
});

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`setup error: ${err.stack ?? err}`);
    process.exit(2);
  },
);
