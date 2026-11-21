#!/usr/bin/env node
// telelean M2 walkthrough (docs/m2-plan.md section 12): "Formalize for dependencies" (spec v4.1; M2's "These suffice")
// on the Spyro sample's goal and its three drawn arrows, driven like a user.
//
//   normative  "PG games cannot have characters with dark pasts" read as a rule: the goal is proved, the script
//              accepts it (spec v4: no Goal -> Derivation step; the goal stays a proposition).
//   literal    the same sentence read literally: not proved; Claude suggests the missing premise; the script adopts
//              it ("I hold this"); round 2 proves the goal; the script accepts.
//
// !!! A LIVE run SPENDS THE USER'S CLAUDE SUBSCRIPTION QUOTA. It needs BOTH `--live` AND the environment variable
// !!! TELELEAN_WALKTHROUGH_LIVE=yes; either one alone refuses before any Claude binary is looked up. The default is a
// !!! dry run: the FakeBackend plays test-fixtures/walkthrough/{normative,literal}.json against the real engine
// !!! (sandboxed Lean), proposal service and workspace; it contacts nothing and sets TELELEAN_NO_REAL_CLAUDE=1 for
// !!! itself, so any accidental real backend refuses. `--dry-run --binary-check` additionally runs `claude --version`
// !!! (binary resolution) and ClaudeCliBackend.prepare (writes the config files, spawns nothing), then prints the
// !!! resolved binary, argv, environment names, settings, MCP config (token redacted) and the system prompt.
//
// Usage:
//   node scripts/walkthrough-claude.mjs [--dry-run] [--binary-check] [--reading normative|literal|both]
//        [--work-dir DIR] [--model claude-opus-5-5] [--effort high] [--max-turns 80] [--max-checks 25]
//        [--max-agent-minutes 20] [--binary PATH] [--approve-definitions]
//   TELELEAN_WALKTHROUGH_LIVE=yes node scripts/walkthrough-claude.mjs --live [same options]
//
// What it does per reading: bundles packages/runner with esbuild's JS API into <work>/bundle (Node's type stripping
// cannot run the codebase's parameter properties), copies mental_model/ to <work>/model-<reading>/, initialises git
// there (isolated config), runs one Lean refresh, and drives the RunManager like a user: a question whose phenomenon
// is `modality` or whose text mentions "cannot" gets the reading's free-text answer, any other question "Decide for
// me"; in the literal reading the first gap-closing suggestion is adopted; a proved proposal is accepted (spec v4: no
// lifecycle items; definition questions only with --approve-definitions, otherwise the script stops and reports them);
// a live run stops (cancels) at the first rate_limit event whose status is not "allowed".
// Output: progress on stderr; a JSON summary on stdout, also saved as <work>/summary.json (and per reading
// <work>/summary-<reading>.json). Exit code: 0 when every reading met its pass criteria, 1 otherwise, 2 on a refusal
// or setup error.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { NO_REAL_CLAUDE_ENV, quotaTripwireArmed } from './quota-tripwire.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function refuse(message) {
  process.stderr.write(`walkthrough: refused: ${message}\n`);
  process.exit(2);
}

let argv;
try {
  ({ values: argv } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      'binary-check': { type: 'boolean', default: false },
      reading: { type: 'string', default: 'both' },
      model: { type: 'string', default: 'claude-opus-5-5' },
      effort: { type: 'string', default: 'high' },
      'work-dir': { type: 'string' },
      'max-turns': { type: 'string', default: '80' },
      'max-checks': { type: 'string', default: '25' },
      'max-agent-minutes': { type: 'string', default: '20' },
      binary: { type: 'string' },
      'approve-definitions': { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (e) {
  refuse(e.message);
}

// ---- The mode, decided before anything is bundled, copied or resolved (docs/m2-plan.md sections 10.4 and 12.1).
const envLive = process.env.TELELEAN_WALKTHROUGH_LIVE === 'yes';
if (argv.live && argv['dry-run']) refuse('--live and --dry-run exclude each other.');
if (argv.live && !envLive) refuse('--live also needs TELELEAN_WALKTHROUGH_LIVE=yes in the environment (a double opt-in: a live run spends subscription quota). Nothing was looked up or started.');
if (envLive && !argv.live) refuse('TELELEAN_WALKTHROUGH_LIVE=yes is set but --live is not given: a live run needs both. Nothing was looked up or started.');
// Any arming value of the tripwire, by the runner's own rule (fixer round 2: it used to refuse only for exactly `1`).
if (argv.live && quotaTripwireArmed(process.env)) refuse(`${NO_REAL_CLAUDE_ENV}=${process.env[NO_REAL_CLAUDE_ENV]?.trim()} is set in this environment, so the live backend would refuse at once: unset it in the shell that runs the live walkthrough.`);
if (argv['binary-check'] && argv.live) refuse('--binary-check belongs to the dry run.');
const LIVE = argv.live === true;
if (!LIVE) process.env.TELELEAN_NO_REAL_CLAUDE = '1'; // quota tripwire for this process (dry run)
const READINGS = argv.reading === 'both' ? ['normative', 'literal'] : [argv.reading];
for (const r of READINGS) if (r !== 'normative' && r !== 'literal') refuse(`--reading must be normative, literal or both (got ${JSON.stringify(argv.reading)}).`);
const int = (name, min, max) => {
  const n = Number.parseInt(argv[name], 10);
  if (!Number.isInteger(n) || n < min || n > max) refuse(`--${name} must be an integer from ${min} to ${max}.`);
  return n;
};
const CAPS = {
  maxTurns: int('max-turns', 1, 1000),
  maxChecks: int('max-checks', 1, 1000),
  maxAgentMs: int('max-agent-minutes', 1, 600) * 60_000,
  leanJobMs: 120_000,
  maxGateAttempts: 3,
};

const log = (message) => process.stderr.write(`walkthrough: ${message}\n`);
const work = path.resolve(argv['work-dir'] ?? mkdtempSync(path.join(os.tmpdir(), 'telelean-walkthrough-')));
mkdirSync(work, { recursive: true });
log(`${LIVE ? 'LIVE (spends subscription quota)' : 'dry run (FakeBackend, contacts nothing)'}; work dir ${work}`);

// ---- Bundle the runner (esbuild JS API) into the work dir.
const bundlePath = path.join(work, 'bundle', 'runner.mjs');
try {
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: [path.join(REPO, 'packages/runner/src/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: bundlePath,
    alias: { '@telelean/core': path.join(REPO, 'packages/core/src/index.ts') },
    banner: { js: "import { createRequire as __teleleanCreateRequire } from 'node:module'; const require = __teleleanCreateRequire(import.meta.url);" },
    logLevel: 'warning',
    sourcemap: false,
  });
} catch (e) {
  log(`bundling failed: ${e.message}`);
  process.exit(2);
}
const runner = await import(pathToFileURL(bundlePath).href);
const { llm, run, gate, proposal, workspace: ws } = runner;
const GUARD = path.join(REPO, 'packages/runner/bin/telelean-path-guard.mjs');
const SUBJECT = 'Spyro';
const TARGET = 'cynder-not-good';
const PREMISES = ['cynder-dark-past', 'new-spyro-pg', 'pg-no-dark-past'];
const ANSWERS = {
  normative: 'I mean it as a rule: PG games should not include characters with dark pasts. I do not mean it is impossible for a PG game to contain one.',
  literal: 'I mean it literally: a PG game cannot contain a character with a dark past at all.',
};
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CEILING_DIRECTORIES: work,
  GIT_AUTHOR_NAME: 'telelean walkthrough',
  GIT_AUTHOR_EMAIL: 'walkthrough@localhost',
  GIT_COMMITTER_NAME: 'telelean walkthrough',
  GIT_COMMITTER_EMAIL: 'walkthrough@localhost',
};
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });

function copyModel(dest) {
  cpSync(path.join(REPO, 'mental_model'), dest, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('.lake') && !src.split(path.sep).includes('.git'),
  });
}

function elanKnownProjects() {
  try {
    return readFileSync(path.join(os.homedir(), '.elan', 'known-projects'), 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return undefined;
  }
}

// ---- --binary-check: `claude --version` and the argv/config the live run would use; never startSession.
if (argv['binary-check']) {
  const dir = path.join(work, 'binary-check');
  const wsDir = path.join(dir, 'ws');
  copyModel(wsDir);
  const binary = await llm.resolveClaudeBinary(argv.binary ? { explicitPath: argv.binary } : {});
  const backend = new llm.ClaudeCliBackend({
    binary: { path: binary.path, version: binary.version },
    launcher: run.setprivLauncher(),
    guardScriptPath: GUARD,
    hookRuntime: llm.defaultHookRuntime(),
    clientApp: 'telelean-walkthrough/0.0.0',
  });
  const stubServer = {
    mcpConfigDocument: () => ({
      mcpServers: { telelean: { type: 'http', url: 'http://127.0.0.1:0/mcp', headers: { Authorization: 'Bearer <redacted>' }, timeout: llm.TOOL_CALL_TIMEOUT_MS, alwaysLoad: true } },
    }),
  };
  const launch = await backend.prepare(
    { cwd: wsDir, runDir: path.join(dir, 'session'), systemPrompt: run.buildSystemPrompt(), model: argv.model, effort: argv.effort, maxTurns: CAPS.maxTurns, toolHost: {} },
    stubServer,
  );
  const report = {
    binary,
    command: launch.command,
    args: launch.args,
    claudeArgs: launch.claudeArgs,
    hasBare: launch.claudeArgs.includes('--bare'),
    environmentNames: Object.keys(launch.env).sort(),
    environment: { removed: launch.envReport.removed, set: launch.envReport.set },
    settings: launch.files.settings,
    mcpConfig: JSON.parse(readFileSync(launch.files.mcpConfigPath, 'utf8')),
    systemPrompt: run.buildSystemPrompt(),
  };
  writeFileSync(path.join(work, 'binary-check.json'), `${JSON.stringify(report, null, 2)}\n`);
  log(`binary: ${binary.path} (${binary.version}, ${binary.source}); config written under ${dir}; startSession was not called`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// ---- One reading.
function waitFor(manager, predicate, timeoutMs, what) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const v = manager.current();
      if (v && predicate(v)) {
        clearTimeout(timer);
        sub.dispose();
        resolve(v);
      }
    };
    const sub = manager.onDidChange(check);
    const timer = setTimeout(() => {
      sub.dispose();
      reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${what}`));
    }, timeoutMs);
    check();
  });
}

function changedFiles(root) {
  try {
    return git(root, 'diff', '--stat', 'HEAD');
  } catch (e) {
    return `git diff failed: ${e.message}`;
  }
}

async function walk(reading) {
  const started = Date.now();
  const root = path.join(work, `model-${reading}`);
  const runsDir = path.join(work, `runs-${reading}`);
  const summary = { reading, live: LIVE, model: argv.model, effort: argv.effort, caps: CAPS, root, runsDir, rounds: [], questions: [], ghosts: [], notices: [], definitions: [], passed: false };
  if (existsSync(root)) throw new Error(`${root} exists already: use a fresh --work-dir`);
  copyModel(root);
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'walkthrough: the sample model');
  const workspace = ws.createModelWorkspace({ root, text: ws.fsTextSource(root), applier: ws.fsEditApplier(root), semantic: { debounceMs: 60_000 } });
  await workspace.load();
  const refreshed = await workspace.refreshNow();
  log(`${reading}: Lean refresh of the copy: ${refreshed.state}`);
  let backend;
  let player;
  if (LIVE) {
    backend = async () =>
      (
        await run.createClaudeBackend({
          claudePath: argv.binary ?? '',
          guardScriptPath: GUARD,
          hookRuntime: llm.defaultHookRuntime(),
          clientApp: 'telelean-walkthrough/0.0.0',
          pdeathsig: true,
        })
      ).backend;
  } else {
    const file = llm.validateFakeScriptFile(JSON.parse(readFileSync(path.join(REPO, 'test-fixtures', 'walkthrough', `${reading}.json`), 'utf8')));
    player = llm.playFakeScript(file);
    backend = new llm.FakeBackend(player.script);
  }
  const manager = run.createRunManager({
    root,
    runsDir,
    workspace,
    services: {
      backend,
      engine: gate.createLeanCheckEngine(),
      proposals: proposal.createProposalService(),
      sidecars: proposal.createRunSidecarStore(),
      log: (level, message) => log(`${reading}: [${level}] ${message}`),
    },
    settings: { ...run.DEFAULT_RUN_SETTINGS, model: argv.model, effort: argv.effort, caps: CAPS },
  });
  // A live run stops at the first rate-limit status that is not "allowed".
  let rateLimited;
  const rateWatch = manager.onDidChange(() => {
    const v = manager.current();
    const status = v?.usage.rateLimit?.status;
    if (LIVE && v && status && status !== 'allowed' && !rateLimited && !['accepted', 'discarded', 'cancelled', 'failed'].includes(v.state)) {
      rateLimited = v.usage.rateLimit;
      log(`${reading}: rate limit status ${status}: cancelling the run`);
      void manager.cancel(v.runId);
    }
  });
  try {
    const outcome = await manager.start({ subject: SUBJECT, target: TARGET, premises: PREMISES });
    log(`${reading}: start -> ${JSON.stringify(outcome)}`);
    if (!outcome.ok) {
      summary.error = outcome.error;
      return summary;
    }
    const deadline = started + Math.max(30 * 60_000, CAPS.maxAgentMs * 3);
    for (;;) {
      const v = await waitFor(
        manager,
        (x) => ['waiting-for-answer', 'review', 'failed', 'cancelled', 'accepted', 'discarded', 'interrupted'].includes(x.state),
        Math.max(1, deadline - Date.now()),
        'the run',
      );
      if (v.state === 'waiting-for-answer' && v.pendingQuestions) {
        const answers = v.pendingQuestions.questions.map((q) =>
          q.phenomenon === 'modality' || /cannot/i.test(q.question)
            ? { question: q.index, choice: { kind: 'free-text', text: ANSWERS[reading] }, scope: 'run' }
            : { question: q.index, choice: { kind: 'decide-for-me' }, scope: 'run' },
        );
        summary.questions.push({ round: v.round, questions: v.pendingQuestions.questions.map((q) => ({ phenomenon: q.phenomenon, question: q.question, options: q.options.map((o) => o.label) })), answers });
        log(`${reading}: answering ${answers.length} question(s)`);
        const answered = await manager.answer(v.runId, v.pendingQuestions.id, answers);
        if (!answered.ok) throw new Error(`answer refused: ${answered.error}`);
        await waitFor(manager, (x) => x.state !== 'waiting-for-answer' || x.pendingQuestions?.id !== v.pendingQuestions.id, 60_000, 'the answer to be taken');
        continue;
      }
      if (v.state === 'review') {
        const p = manager.proposal();
        summary.rounds.push({
          round: v.round,
          verdict: v.verdict,
          gateAttempts: p?.report.gateAttempts ?? [],
          footprint: p?.report.footprint ?? [],
          summary: p?.report.claudeSummary,
          gap: p?.report.gap,
          assumedWithoutAsking: p?.report.assumedWithoutAsking ?? [],
          definitions: (p?.definitions ?? []).map((d) => ({ id: d.id, name: d.name, kind: d.kind })),
          reverted: p?.report.reverted,
        });
        summary.ghosts = v.ghosts;
        summary.definitions = p?.definitions ?? [];
        log(`${reading}: round ${v.round} ended: ${v.verdict}`);
        if (v.verdict === 'proved' && p) {
          if (p.definitions.length > 0 && !argv['approve-definitions']) {
            summary.stopped = `the proposal has ${p.definitions.length} definition question(s); rerun with --approve-definitions to accept them`;
            break;
          }
          const accepted = await manager.accept(v.runId, p.proposalId, p.definitions.map((d) => d.id));
          summary.accept = accepted;
          log(`${reading}: accept -> ${JSON.stringify(accepted)}`);
          break;
        }
        const ghost = v.ghosts.find((g) => g.state === 'suggested' && g.closesGap);
        if (reading === 'literal' && ghost && v.round === 1) {
          log(`${reading}: adopting ${ghost.id}: "${ghost.naturalName}"`);
          const adopted = await manager.adoptGhost(v.runId, ghost.id, 'it seems obvious to me');
          summary.adopted = { ghost: ghost.id, outcome: adopted };
          if (!adopted.ok) break;
          await waitFor(manager, (x) => x.round > v.round || x.state !== 'review', 120_000, 'the adoption round');
          continue;
        }
        summary.stopped = `round ${v.round} ended ${v.verdict} and the scripted user has nothing more to do`;
        await manager.discard(v.runId);
        break;
      }
      summary.stopped = `the run ended as ${v.state}${v.error ? `: ${v.error}` : ''}`;
      break;
    }
  } catch (e) {
    summary.error = e.message;
    const v = manager.current();
    if (v && !['accepted', 'discarded', 'cancelled', 'failed'].includes(v.state)) await manager.cancel(v.runId).catch(() => undefined);
  } finally {
    rateWatch.dispose();
  }
  const v = manager.current();
  summary.runId = v?.runId;
  summary.finalState = v?.state;
  summary.notices = v?.notices ?? [];
  summary.usage = v?.usage;
  summary.backend = v?.backend;
  summary.agentMs = v?.counters.agentMs;
  summary.wallMs = Date.now() - started;
  if (rateLimited) summary.rateLimited = rateLimited;
  if (player) summary.fakeTurnsPlayed = player.played.map((t) => ({ scripted: t.scripted, turn: t.turn.slice(0, 80) }));
  if (v?.runId) summary.transcript = path.join(runsDir, runner.shadow.rootKeyOf(root), v.runId, 'session', 'transcript.jsonl');
  manager.dispose();
  // The copy as the user would see it after Accept: refreshed, with its final statuses.
  try {
    await workspace.refreshNow();
    const graph = workspace.graph(SUBJECT);
    summary.finalStatuses = graph.nodes.map((n) => ({ id: n.id, type: n.type, proof: n.status.proof.kind, footprint: n.status.proof.kind === 'proved' ? n.status.proof.footprint : undefined, wordedBy: n.provenance.wordedBy }));
  } catch (e) {
    summary.finalStatuses = `refresh failed: ${e.message}`;
  }
  summary.diff = changedFiles(root);
  workspace.dispose();
  const target = Array.isArray(summary.finalStatuses) ? summary.finalStatuses.find((n) => n.id === TARGET) : undefined;
  const provedAndAccepted = summary.finalState === 'accepted' && target?.proof === 'proved' && target?.type === 'PROPOSITION';
  if (reading === 'normative') summary.passed = provedAndAccepted && summary.rounds.at(-1)?.verdict === 'proved';
  else {
    const r1 = summary.rounds[0];
    const adoptedCard = Array.isArray(summary.finalStatuses) && summary.finalStatuses.some((n) => n.wordedBy === 'agent' && n.type === 'AXIOM');
    summary.passed = provedAndAccepted && r1?.verdict !== 'proved' && summary.adopted?.outcome?.ok === true && adoptedCard;
  }
  return summary;
}

const results = [];
const elanBefore = elanKnownProjects();
for (const reading of READINGS) {
  try {
    const s = await walk(reading);
    writeFileSync(path.join(work, `summary-${reading}.json`), `${JSON.stringify(s, null, 2)}\n`);
    results.push(s);
    log(`${reading}: ${s.passed ? 'PASSED' : 'did not pass'}${s.error ? ` (${s.error})` : ''}${s.stopped ? ` (${s.stopped})` : ''}`);
  } catch (e) {
    log(`${reading}: setup error: ${e.message}`);
    results.push({ reading, passed: false, error: e.message });
  }
}
const final = { live: LIVE, work, readings: results, elanKnownProjectsLines: { before: elanBefore, after: elanKnownProjects() } };
writeFileSync(path.join(work, 'summary.json'), `${JSON.stringify(final, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(final, null, 2)}\n`);
process.exit(results.every((r) => r.passed) ? 0 : 1);
