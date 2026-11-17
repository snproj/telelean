#!/usr/bin/env node
// telelean demo driver (docs/DEMO.md): your own simple example, end to end in a real VS Code window, driven like a
// user. It starts an isolated VS Code (the downloaded 1.140.0 test build, or the user's snap with --vscode snap) with
// the extension under development on a FRESH empty folder, runs "telelean: Initialize Model Here", types the example
// into the board's A|D|G box as cards (assumptions and a goal), selects them, presses "These suffice ▶", gives the
// consent, answers Claude's questions on the board (your --answer specs, else the first option), steps through the
// review, adopts Claude's suggested premise when a round ends not proved (unless --no-adopt), Accepts, waits for Lean's
// check of the accepted files, and prints a JSON summary (verdict per round, questions and answers, ghosts, the Lean
// written, the statuses after Accept, wall times, token usage), with screenshots of each step.
//
// !!! A LIVE run SPENDS THE USER'S CLAUDE SUBSCRIPTION QUOTA. It needs BOTH `--live` AND TELELEAN_DEMO_LIVE=yes in the
// !!! environment, and refuses while the quota tripwire TELELEAN_NO_REAL_CLAUDE is armed; either one alone refuses
// !!! before anything is started. A live run uses the real HOME (Claude Code's login lives there); VS Code's own
// !!! profile (user data, extensions) and XDG dirs stay in the work dir. It cancels the run at the first rate-limit
// !!! status that is not "allowed" (unless --continue-on-rate-warning).
//
// Modes (exactly one; default --dry-run):
//   --dry-run   contacts nothing. VS Code runs the extension in Test mode with the agent test/demo/agent.ts (bundled
//               into the work dir), which installs the dry-run Claude (test/demo/demoClaude.ts: a FakeBackend that
//               formalises simple syllogisms, else whole sentences, and writes real Lean that the real checks judge),
//               answers the git and consent questions in advance (Test mode never shows them) and runs Initialize with
//               the folder as argument (Test mode has no folder picker). Everything else goes through the board UI.
//               TELELEAN_NO_REAL_CLAUDE=1 for VS Code and this process.
//   --rehearse  the live path without Claude: Development mode, Initialize through the command palette (folder pick,
//               subject input box, the git dialog), the cards, the selection, These suffice and the real consent
//               dialog ("Run with Claude"); with TELELEAN_NO_REAL_CLAUDE=1 the run must then be refused before any
//               Claude Code binary is looked up or run. Checks everything a live run does up to its first message.
//   --live      the same as --rehearse, then the real run with the user's Claude Code (SPENDS QUOTA, see above).
//
// Usage:
//   node packages/extension/scripts/demo-driver.mjs [--dry-run|--rehearse] [options]
//   TELELEAN_DEMO_LIVE=yes node packages/extension/scripts/demo-driver.mjs --live [options]
// Options:
//   --assume TEXT          an assumption card (repeat it); default: the Socrates example
//   --goal TEXT            the goal card
//   --subject NAME         the first subject (a Lean namespace; default Demo)
//   --answer SPEC          answer to the n-th question Claude asks (repeat it, in order): 1-4 = that option,
//                          open = Leave it open, decide = Decide for me, text:WORDS or any other text = In my own words.
//                          Questions without a SPEC get option 1.
//   --answer-scope S       run (default), nodes or subject: "Remember for" of every answer
//   --no-adopt             a round that ends not proved is not continued with Claude's suggested premise
//   --adopt-reason TEXT    the reason given for "I hold this" (default: "it seems right to me")
//   --max-rounds N         most rounds (the first, plus one per adopted suggestion; default 3)
//   --end accept|discard   what to do with the last proposal (default accept)
//   --no-approve-definitions  stop instead of answering "Yes" to definition questions in the review
//   --vscode WHICH         test-build (default), snap (the installed VS Code snap) or the path of a VS Code Electron binary
//   --show                 show the window on the current display (default: headless, under xvfb-run)
//   --screen WxH           the virtual screen under xvfb (default 1920x1200)
//   --work-dir DIR         where everything goes (default: a fresh folder under the OS temp dir); must not hold a run
//   --model M, --effort E  telelean.model / telelean.effort for the instance (default: the extension's)
//   --timeout-minutes N    give up after N minutes (default 15; live 60)
//   --isolated-home        live only: run VS Code with the isolated HOME too (Claude Code then finds no login)
//   --continue-on-rate-warning  live only: keep going when Claude Code reports a rate-limit warning
// Output: progress on stderr; the JSON summary on stdout and in <work>/summary.json; screenshots in <work>/screenshots.
// Exit code: 0 when the demo reached its end as expected, 1 when not, 2 on a refusal or a setup error.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { NO_REAL_CLAUDE_ENV, quotaTripwireArmed } from '../../../scripts/quota-tripwire.mjs';
import {
  EXTENSION_DIR,
  extensionLogs,
  freePort,
  homeChanges,
  homeSnapshot,
  instanceArgs,
  instanceEnv,
  launchInstance,
  makeProfile,
  processesOf,
  resolveVscode,
  runsDirOf,
  settleUnits,
  stopInstance,
  teleleanUnits,
  withSnapLayer,
  writeUserSettings,
} from './demo-vscode.mjs';
import { Board, connectWorkbench, sleep, waitFor, Workbench } from './demo-ui.mjs';

const SOCRATES = { assume: ['All humans are mortal', 'Socrates is a human'], goal: 'Socrates is mortal' };
const TERMINAL = ['accepted', 'discarded', 'cancelled', 'failed'];

function refuse(message) {
  process.stderr.write(`demo: refused: ${message}\n`);
  process.exit(2);
}

let argv;
try {
  ({ values: argv } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      rehearse: { type: 'boolean', default: false },
      live: { type: 'boolean', default: false },
      assume: { type: 'string', multiple: true },
      goal: { type: 'string' },
      subject: { type: 'string', default: 'Demo' },
      answer: { type: 'string', multiple: true },
      'answer-scope': { type: 'string', default: 'run' },
      'no-adopt': { type: 'boolean', default: false },
      'adopt-reason': { type: 'string', default: 'it seems right to me' },
      'max-rounds': { type: 'string', default: '3' },
      end: { type: 'string', default: 'accept' },
      'no-approve-definitions': { type: 'boolean', default: false },
      vscode: { type: 'string' },
      show: { type: 'boolean', default: false },
      screen: { type: 'string', default: '1920x1200' },
      'work-dir': { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      'timeout-minutes': { type: 'string' },
      'isolated-home': { type: 'boolean', default: false },
      'continue-on-rate-warning': { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (error) {
  refuse(error.message);
}

// ---- The mode, decided before anything is bundled, created or started.
const modes = ['dry-run', 'rehearse', 'live'].filter((m) => argv[m]);
if (modes.length > 1) refuse(`--${modes.join(' and --')} exclude each other.`);
const MODE = modes[0] ?? 'dry-run';
const LIVE = MODE === 'live';
const DRY = MODE === 'dry-run';
const envLive = process.env.TELELEAN_DEMO_LIVE === 'yes';
if (LIVE && !envLive) refuse('--live also needs TELELEAN_DEMO_LIVE=yes in the environment (a double opt-in: a live run spends subscription quota). Nothing was started.');
if (envLive && !LIVE) refuse('TELELEAN_DEMO_LIVE=yes is set but --live is not given: a live run needs both. Nothing was started.');
if (LIVE && quotaTripwireArmed(process.env)) refuse(`${NO_REAL_CLAUDE_ENV}=${process.env[NO_REAL_CLAUDE_ENV]?.trim()} is set in this environment, so the live run would be refused at once: unset it in the shell that runs the live demo.`);
if (!LIVE && (argv['isolated-home'] || argv['continue-on-rate-warning'])) refuse('--isolated-home and --continue-on-rate-warning belong to --live.');
if (!LIVE) process.env[NO_REAL_CLAUDE_ENV] = '1'; // quota tripwire for this process (and, through instanceEnv, VS Code)

// ---- The example.
const assumptions = (argv.assume ?? (argv.goal === undefined ? SOCRATES.assume : [])).map((s) => s.trim());
const goal = (argv.goal ?? (argv.assume === undefined ? SOCRATES.goal : '')).trim();
if (assumptions.length === 0) refuse('give at least one --assume TEXT (or neither --assume nor --goal for the Socrates example).');
if (goal === '') refuse('give the goal with --goal TEXT.');
const sentences = [...assumptions, goal];
for (const s of sentences) {
  if (s === '') refuse('a card sentence is empty.');
  if (/[\r\n]/.test(s)) refuse(`a card sentence is one line: ${JSON.stringify(s)}`);
  if (s.length > 300) refuse(`keep card sentences short (at most 300 characters): ${JSON.stringify(s.slice(0, 40))}…`);
}
if (new Set(sentences).size !== sentences.length) refuse('every card needs its own sentence (two are the same).');
if (!/^[A-Z][A-Za-z0-9_]{0,63}$/.test(argv.subject)) refuse(`--subject must be a capitalised Lean identifier (got ${JSON.stringify(argv.subject)}).`);
const SCOPES = ['run', 'nodes', 'subject'];
if (!SCOPES.includes(argv['answer-scope'])) refuse(`--answer-scope must be one of ${SCOPES.join(', ')}.`);
if (!['accept', 'discard'].includes(argv.end)) refuse('--end must be accept or discard.');
const MAX_ROUNDS = Number.parseInt(argv['max-rounds'], 10);
if (!Number.isInteger(MAX_ROUNDS) || MAX_ROUNDS < 1 || MAX_ROUNDS > 10) refuse('--max-rounds must be an integer from 1 to 10.');
const TIMEOUT_MS = Number.parseFloat(argv['timeout-minutes'] ?? (LIVE ? '60' : '15')) * 60_000;
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS < 60_000) refuse('--timeout-minutes must be a number of at least 1.');
if (!/^\d{3,5}x\d{3,5}$/.test(argv.screen)) refuse('--screen must look like 1920x1200.');
if (argv.effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(argv.effort)) refuse('--effort must be low, medium, high, xhigh or max.');

/** An answer spec of --answer: a board choice (the option index is 0-based). */
function parseAnswer(spec) {
  const scope = argv['answer-scope'];
  const s = spec.trim();
  if (/^[1-4]$/.test(s)) return { kind: 'option', option: Number(s) - 1, scope };
  if (/^(open|leave-open|leave it open)$/i.test(s)) return { kind: 'leave-open', scope };
  if (/^(decide|decide-for-me|decide for me)$/i.test(s)) return { kind: 'decide-for-me', scope };
  if (/^text:/i.test(s)) return { kind: 'free-text', text: s.slice(5).trim(), scope };
  return { kind: 'free-text', text: s, scope };
}
const answerQueue = (argv.answer ?? []).map(parseAnswer);
for (const a of answerQueue) if (a.kind === 'free-text' && a.text === '') refuse('an --answer text is empty.');

// ---- The work dir.
const log = (message) => process.stderr.write(`demo: ${message}\n`);
const work = path.resolve(argv['work-dir'] ?? mkdtempSync(path.join(os.tmpdir(), 'telelean-demo-')));
mkdirSync(work, { recursive: true });
if (existsSync(path.join(work, 'profile')) || existsSync(path.join(work, 'summary.json'))) refuse(`${work} holds an earlier run: use a fresh --work-dir.`);
const realHome = os.homedir();
if (!LIVE && (work === realHome || work.startsWith(`${realHome}${path.sep}`))) refuse(`the work dir ${work} is under the real home folder; use one outside it (default: under ${os.tmpdir()}).`);
const folder = path.join(work, 'demo');
if (existsSync(folder)) refuse(`${folder} exists already: the demo needs a fresh, empty folder.`);

const started = Date.now();
const summary = {
  mode: MODE,
  passed: false,
  example: { assumptions, goal, subject: argv.subject },
  work,
  folder,
  settings: { model: argv.model ?? '(extension default: claude-opus-5-5)', effort: argv.effort ?? '(extension default: high)' },
  vscode: undefined,
  times: {},
  cards: [],
  rounds: [],
  questions: [],
  ghosts: [],
  adopted: [],
  notifications: [],
  problems: [],
};
const times = summary.times;
const mark = (name) => {
  times[name] = Date.now() - started;
  log(`[${(times[name] / 1000).toFixed(1)} s] ${name}`);
};
log(`${MODE}${LIVE ? ' (SPENDS SUBSCRIPTION QUOTA)' : ' (no Claude)'}; work dir ${work}`);

// ---------------------------------------------------------------------------------------------------------------
// Files of the run

/** The instance's profile, once made (main). */
const profileRef = { current: undefined };

/** Every run.json of this instance: { runId, dir, run } newest first. */
function listRuns() {
  if (!profileRef.current) return [];
  const base = runsDirOf(profileRef.current);
  const out = [];
  for (const rootKey of safeReaddir(base)) {
    for (const runId of safeReaddir(path.join(base, rootKey))) {
      const file = path.join(base, rootKey, runId, 'run.json');
      try {
        out.push({ runId, dir: path.dirname(file), run: JSON.parse(readFileSync(file, 'utf8')) });
      } catch {
        // not written yet, or being replaced
      }
    }
  }
  return out.sort((a, b) => (Date.parse(b.run.view?.updatedAt ?? '') || 0) - (Date.parse(a.run.view?.updatedAt ?? '') || 0));
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** The subject's Lean files (Model/<Subject>/*.lean and Model/<Subject>.lean) as they are now. */
function leanFiles() {
  const out = {};
  const dir = path.join(folder, 'Model', argv.subject);
  for (const name of safeReaddir(dir).sort()) if (name.endsWith('.lean')) out[`Model/${argv.subject}/${name}`] = readText(path.join(dir, name));
  const root = readText(path.join(folder, 'Model', `${argv.subject}.lean`));
  if (root !== undefined) out[`Model/${argv.subject}.lean`] = root;
  return out;
}

function graphJson() {
  return readJson(path.join(folder, '.telelean', 'graph.json'));
}

/** The nodes of the subject in .telelean/graph.json (whatever its outer shape). */
function graphNodes(graph) {
  // graph.json (runner workspace): snake_case fields, `status.proof` a string ("proved", "assumed", ...).
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes
    .filter((n) => n && typeof n.id === 'string' && (n.subject === undefined || n.subject === argv.subject))
    .map((n) => ({
      id: n.id,
      type: n.type,
      sentence: n.natural_name,
      wordedBy: n.worded_by,
      proof: typeof n.status?.proof === 'string' ? n.status.proof : n.status?.proof?.kind,
      footprint: n.status?.footprint,
      formal: n.status?.formal,
      statement: n.lean?.statement,
      justification: n.lean?.justification_kind,
      premises: n.premises,
      flags: n.status?.flags,
    }));
}

// ---------------------------------------------------------------------------------------------------------------
// Answers and the run's state

/** The answer for the next question: the next --answer spec, else option 1; an option the question lacks becomes 1. */
function nextAnswer(question) {
  const spec = answerQueue.shift() ?? { kind: 'option', option: 0, scope: argv['answer-scope'] };
  if (spec.kind === 'option' && spec.option >= question.options.length) {
    summary.problems.push(`--answer ${spec.option + 1} for a question with ${question.options.length} options: option 1 given instead`);
    return { ...spec, option: 0 };
  }
  if (spec.scope === 'nodes' && (question.affectedNodes ?? []).length === 0) return { ...spec, scope: 'run' };
  return spec;
}

function describeAnswer(spec, question) {
  switch (spec.kind) {
    case 'option':
      return `option ${spec.option + 1}: ${question.options[spec.option]?.label ?? '?'}`;
    case 'free-text':
      return `in my own words: ${spec.text}`;
    case 'leave-open':
      return 'Leave it open';
    default:
      return 'Decide for me';
  }
}

function roundSummary(entry) {
  const { run } = entry;
  const p = run.proposal;
  const view = run.view;
  return {
    round: view.round,
    verdict: p?.report.verdict ?? view.verdict,
    footprint: p?.report.footprint ?? [],
    unusedPremises: p?.report.unusedPremises ?? [],
    selfEvident: p?.report.selfEvident ?? false,
    claudeSummary: p?.report.claudeSummary,
    gap: p?.report.gap,
    conflict: p?.report.conflict,
    assumedWithoutAsking: p?.report.assumedWithoutAsking ?? [],
    gateAttempts: (p?.report.gateAttempts ?? []).map((a) => ({ round: a.round, attempt: a.attempt, passed: a.passed, failures: a.failures.map((f) => `${f.step}: ${f.text}`) })),
    reverted: p?.report.reverted,
    statements: (p?.review ?? []).filter((r) => r.kind === 'statement').map((r) => ({ card: r.nodeId, sentence: r.sentence, wordedBy: r.wordedBy, lean: r.pretty, change: r.change })),
    newVocabulary: (p?.review ?? []).filter((r) => r.kind === 'vocabulary').flatMap((r) => r.items.map((i) => ({ name: i.name, kind: i.vocabKind, type: i.type, gloss: i.gloss }))),
    definitions: (p?.definitions ?? []).map((d) => ({ name: d.name, kind: d.kind, code: d.code })),
    lifecycle: (p?.lifecycle ?? []).map((l) => ({ card: l.nodeId, from: l.from, to: l.to, recommended: l.recommended, reason: l.reason })),
    files: p?.files ?? [],
    ghosts: (p?.ghosts ?? view.ghosts ?? []).filter((g) => g.round === view.round).map((g) => ({ id: g.id, sentence: g.naturalName, lean: g.leanStatement, closesGap: g.closesGap, aloneEntails: g.aloneEntails, state: g.state })),
    notices: view.notices.map((n) => `${n.kind}: ${n.text}`),
    usageAtReview: view.usage,
    durationMs: p?.report.durationMs,
    agentMs: p?.report.agentMs,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The demo

let launched;
let browser;
let wb;
/** The board and the run once it started (to end it if the demo stops early). */
const active = { board: undefined, runId: undefined };
const unitsBefore = new Set(teleleanUnits());
const homeBefore = homeSnapshot();
/** Started once; every caller (the end of main, an error, Ctrl+C) awaits the same promise before the process exits. */
let ending;
let shuttingDown;
const endActiveRun = () => (ending ??= endActiveRunOnce());
const shutdown = (reason) => (shuttingDown ??= shutdownOnce(reason));

/**
 * When the demo stops early (an error, the timeout, Ctrl+C) while the run is still going: Claude is stopped through the
 * board like a user would (Cancel while it works, Discard in review), so its session ends at once and the run is
 * recorded as cancelled or discarded instead of interrupted.
 */
async function endActiveRunOnce() {
  if (!active.board || !active.runId) return;
  const stateOf = () => listRuns().find((r) => r.runId === active.runId)?.run.view?.state;
  const state = stateOf();
  if (!state || TERMINAL.includes(state) || state === 'interrupted') return;
  log(`ending the run ${active.runId} (${state}) because the demo stops early`);
  try {
    if (state === 'review') await active.board.discard();
    else await active.board.cancelRun();
    await waitFor(() => TERMINAL.includes(stateOf()), 30_000, 'the run to end');
    summary.problems.push(`the run was ${state === 'review' ? 'discarded' : 'cancelled'} because the demo stopped early`);
  } catch (error) {
    summary.problems.push(`could not end the run through the board (${error.message}); closing VS Code stops it`);
  }
}

async function shutdownOnce(reason) {
  log(`shutting down (${reason})`);
  try {
    if (wb) {
      summary.notifications = [...new Set([...wb.notifications, ...(await wb.toastTexts().catch(() => []))])];
      summary.screenshots = wb.shots.map((s) => s.file);
    }
  } catch {
    // the page may be gone
  }
  await browser?.close().catch(() => undefined); // disconnects only
  const profile = profileRef.current;
  if (!launched || !profile) return;
  if (DRY) {
    writeFileSync(path.join(work, 'agent', 'stop'), `${new Date().toISOString()}\n`);
    // The agent returns, and VS Code closes itself (the end of its "test run").
    await Promise.race([launched.exited, sleep(30_000)]);
  }
  summary.leftoverProcessesKilled = await stopInstance({ launched, profile, log });
  summary.systemdUnits = await settleUnits({ before: unitsBefore, profile });
  const left = processesOf(work);
  if (left.length) summary.problems.push(`processes still running after the shutdown: ${left.map((p) => p.pid).join(', ')}`);
  if (DRY) {
    const state = readJson(path.join(work, 'agent', 'state.json'));
    summary.dryRunClaude = state?.dryRunClaude;
    summary.agent = { phase: state?.phase, stoppedBy: state?.stoppedBy, log: state?.log };
  }
  summary.extensionLogs = await extensionLogs(profile);
  summary.realHomeChanges = homeChanges(homeBefore, homeSnapshot());
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    summary.problems.push(`interrupted by ${sig}`);
    void endActiveRun()
      .then(() => shutdown(sig))
      .finally(() => {
        writeSummary();
        process.exit(130);
      });
  });
}

function writeSummary() {
  summary.times.totalMs = Date.now() - started;
  writeFileSync(path.join(work, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  const profile = await makeProfile(work);
  profileRef.current = profile;
  mkdirSync(folder);
  await writeUserSettings(profile, {
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    ...(argv.model ? { 'telelean.model': argv.model } : {}),
    ...(argv.effort ? { 'telelean.effort': argv.effort } : {}),
  });

  // The dry run's agent: bundled from test/demo/agent.ts into the work dir.
  let testsPath;
  const extra = {};
  if (DRY) {
    const agentDir = path.join(work, 'agent');
    mkdirSync(agentDir, { recursive: true });
    testsPath = path.join(agentDir, 'agent.js');
    const esbuild = await import('esbuild');
    const { commonOptions } = await import('./esbuild-options.mjs');
    await esbuild.build({
      ...commonOptions(EXTENSION_DIR),
      entryPoints: [path.join(EXTENSION_DIR, 'test', 'demo', 'agent.ts')],
      outfile: testsPath,
      external: ['vscode'],
      logLevel: 'warning',
      sourcemap: false,
    });
    const config = { folder, subject: argv.subject, stateFile: path.join(agentDir, 'state.json'), stopFile: path.join(agentDir, 'stop'), deadline: started + TIMEOUT_MS + 120_000 };
    writeFileSync(path.join(agentDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
    extra.TELELEAN_DEMO_AGENT = path.join(agentDir, 'config.json');
  }

  const vscode = await resolveVscode(argv.vscode);
  if (!vscode.ok) throw Object.assign(new Error(vscode.reason), { setup: true });
  summary.vscode = { kind: vscode.kind, binary: vscode.binary, version: vscode.version };
  const port = await freePort();
  const env = withSnapLayer(instanceEnv(process.env, { profile, realHome: LIVE && !argv['isolated-home'], live: LIVE, extra }), process.env, vscode, profile);
  summary.vscode.home = env.HOME;
  const args = instanceArgs({ profile, folder, cdpPort: port, testsPath });
  launched = launchInstance({ vscode, args, env, show: argv.show, screen: argv.screen, profile });
  summary.vscode.command = launched.command.map((a) => (a.length > 200 ? `${a.slice(0, 200)}…` : a));
  mark('VS Code started');
  // playwright-core keeps a temporary folder while connected: in the work dir, not the system's temp dir. (Only this
  // process: VS Code's environment is fixed already, and its socket paths must stay short.)
  mkdirSync(path.join(work, 'tmp'), { recursive: true });
  process.env.TMPDIR = path.join(work, 'tmp');

  ({ browser } = await connectWorkbench(port));
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('workbench.html'));
  wb = new Workbench(page, { screenshots: profile.screenshots, log });
  await wb.ready();
  summary.vscode.window = await wb.size();
  mark('workbench ready');

  // ---- Initialize Model Here
  if (DRY) {
    const state = await waitFor(
      () => {
        const s = readJson(path.join(work, 'agent', 'state.json'));
        return s && (s.phase === 'initialized' || s.phase === 'error') ? s : undefined;
      },
      180_000,
      'the dry-run agent to initialize the folder',
    );
    if (state.phase === 'error') throw new Error(`the dry-run agent failed: ${state.error}`);
    summary.initialize = { via: 'the dry-run agent (Test mode has no folder picker or dialogs)', result: state.initialize };
  } else {
    await wb.clearToasts();
    await wb.command('telelean: Initialize Model Here');
    const offered = await wb.pick(`${path.basename(folder)}, ${folder}`);
    await sleep(300);
    await wb.shot('initialize-subject');
    const inputBox = await wb.inputBox(argv.subject);
    const gitDialog = await wb.answerDialog(/^Initialize a git repository/, 'Initialize git');
    summary.initialize = { via: 'command palette', folderChoices: offered, inputBox, gitDialog };
  }
  const board = new Board(wb);
  await board.frame(180_000);
  mark('board open');
  if (!(await board.subject()).includes(argv.subject)) summary.problems.push(`the board shows subject "${await board.subject()}", not ${argv.subject}`);
  // Room for the board and the run panel beside it.
  await wb.clearToasts();
  await wb.command('View: Close Primary Side Bar').catch((error) => log(`could not close the side bar: ${error.message}`));
  const firstLean = await board.waitLean(['fresh', 'failed', 'unsupported-toolchain', 'disabled'], 300_000, "Lean's first check of the new folder");
  summary.firstLeanCheck = firstLean;
  mark(`first Lean check (${firstLean.state})`);
  await wb.shot('board-empty');

  // ---- The cards
  for (const text of assumptions) summary.cards.push({ kind: 'ASSUMPTION', text, id: await board.addCard('ASSUMPTION', text) });
  summary.cards.push({ kind: 'GOAL', text: goal, id: await board.addCard('GOAL', goal) });
  mark('cards typed');
  await board.waitLean(['fresh', 'failed', 'unsupported-toolchain', 'disabled'], 300_000, "Lean's check of the new cards").catch((error) => summary.problems.push(error.message));
  await wb.shot('cards');
  const target = summary.cards.at(-1).id;
  await board.select(summary.cards.map((c) => c.id));
  summary.tray = await board.tray();
  await wb.shot('selected');
  mark('cards selected');

  // ---- These suffice (and the consent)
  const before = new Set(listRuns().map((r) => r.runId));
  await board.theseSuffice();
  const pressed = Date.now();
  mark('These suffice pressed');
  if (DRY) {
    summary.consent = { via: 'the dry-run agent answered "Run with Claude" in advance (Test mode never shows the dialog)' };
  } else {
    const consent = await wb.answerDialog(/^Run Claude on this model\?/, 'Run with Claude', 60_000);
    summary.consent = { via: 'the dialog', ...consent, clicked: 'Run with Claude' };
    mark('consent given');
  }

  if (MODE === 'rehearse') {
    // With the quota tripwire the production backend factory refuses before any binary is looked up or run.
    const refusal = await waitFor(
      async () => {
        const texts = [...(await board.boardToasts()), ...(await wb.toastTexts())];
        return texts.find((t) => /real Claude is disabled|TELELEAN_NO_REAL_CLAUDE/.test(t)) ?? (texts.find((t) => /Claude could not be started|could not start/i.test(t)) && texts.join(' | '));
      },
      120_000,
      'the run to be refused by the quota tripwire',
    );
    await wb.shot('rehearsal-refused');
    const runs = listRuns().filter((r) => !before.has(r.runId));
    summary.rehearsal = { refusal, runsCreated: runs.map((r) => ({ runId: r.runId, state: r.run.view?.state })) };
    mark('refused as expected');
    summary.passed = /real Claude is disabled/.test(refusal) && runs.every((r) => r.run.view?.state !== 'working');
    return;
  }

  // ---- The run
  const deadline = started + TIMEOUT_MS;
  const newRun = await waitFor(() => listRuns().find((r) => !before.has(r.runId)), 120_000, 'the run to start (its run.json)').catch(async (error) => {
    const toasts = [...(await board.boardToasts()), ...(await wb.toastTexts())];
    throw new Error(`${error.message}; the board says: ${toasts.join(' | ') || '(nothing)'}`);
  });
  const runId = newRun.runId;
  active.board = board;
  active.runId = runId;
  summary.runId = runId;
  summary.runDir = newRun.dir;
  log(`run ${runId} started`);
  await sleep(500);
  await wb.shot('run-started');
  let rateLimited;
  let progress = '';
  const current = () => listRuns().find((r) => r.runId === runId);
  /** One progress line on stderr whenever the run's state, stage, round, turns or checks change. */
  const report = (view) => {
    const line = `run: ${view.state}${view.stage ? ` · ${view.stage}` : ''} · round ${view.round} · turns ${view.counters?.turns ?? 0} · checks ${view.counters?.checks ?? 0} · ${view.usage?.outputTokens ?? 0} tokens out`;
    if (line !== progress) {
      progress = line;
      log(line);
    }
  };
  /** Waits for the run's state to satisfy `predicate`; watches the overall deadline and (live) the rate limit. */
  const waitRun = (predicate, label, timeoutMs = deadline - Date.now()) =>
    waitFor(
      async () => {
        const entry = current();
        if (entry?.run.view) report(entry.run.view);
        const status = entry?.run.view?.usage?.rateLimit?.status;
        if (LIVE && status && status !== 'allowed' && !rateLimited && !argv['continue-on-rate-warning'] && !TERMINAL.includes(entry.run.view.state)) {
          rateLimited = entry.run.view.usage.rateLimit;
          log(`rate limit status ${status}: cancelling the run`);
          summary.problems.push(`rate limit status ${status}: the run was cancelled`);
          if (entry.run.view.state === 'review') await board.discard().catch(() => undefined);
          else await board.cancelRun().catch(() => undefined);
        }
        return entry && predicate(entry.run.view, entry) ? entry : undefined;
      },
      Math.max(1_000, timeoutMs),
      label,
      500,
    );

  let acceptClick;
  for (;;) {
    const entry = await waitRun(
      (v, e) =>
        ['interrupted', ...TERMINAL].includes(v.state) ||
        (v.state === 'waiting-for-answer' && v.pendingQuestions !== undefined) ||
        (v.state === 'review' && e.run.proposal?.round === v.round),
      `the run (now ${current()?.run.view?.state ?? '?'})`,
    );
    const view = entry.run.view;
    if (view.state === 'waiting-for-answer' && view.pendingQuestions) {
      const set = view.pendingQuestions;
      if (summary.times.firstQuestionMs === undefined) summary.times.firstQuestionMs = Date.now() - pressed;
      await board.ensureRunPanel();
      await (await board.frame()).locator(`[data-testid="question-set"][data-set-id="${set.id}"]`).waitFor({ timeout: 60_000 });
      await wb.shot(`question-r${view.round}`);
      const answers = set.questions.map((q) => nextAnswer(q));
      for (const [i, q] of set.questions.entries()) {
        summary.questions.push({
          round: view.round,
          set: set.id,
          phenomenon: q.phenomenon,
          question: q.question,
          options: q.options.map((o) => ({ label: o.label, consequence: o.consequence })),
          affectedCards: q.affectedNodes,
          answer: describeAnswer(answers[i], q),
          scope: answers[i].scope,
        });
      }
      log(`answering ${set.questions.length} question(s): ${summary.questions.slice(-set.questions.length).map((q) => q.answer).join(' | ')}`);
      await board.answerQuestions(set.id, answers, () => wb.shot(`answered-r${view.round}`));
      await waitRun((v) => v.pendingQuestions?.id !== set.id, 'the answer to reach the run', 120_000);
      continue;
    }
    if (view.state === 'review') {
      const round = roundSummary(entry);
      round.reviewShownAfterMs = Date.now() - pressed;
      log(`round ${view.round} ended: ${round.verdict}`);
      await sleep(500);
      await wb.shot(`proposal-r${view.round}`);
      const review = await board.readReview({
        approveDefinitions: !argv['no-approve-definitions'],
        onStep: (kind, i) => wb.shot(`review-r${view.round}-${i + 1}-${kind}`),
      });
      round.reviewSteps = review.steps;
      round.verdictOnBoard = review.verdict;
      summary.rounds.push(round);
      if (round.definitions.length > 0 && argv['no-approve-definitions']) {
        summary.stopped = `the proposal has ${round.definitions.length} definition question(s) and --no-approve-definitions was given`;
        await board.discard();
        await waitRun((v) => TERMINAL.includes(v.state), 'the run to be discarded', 120_000);
        break;
      }
      const ghost = view.ghosts.find((g) => g.state === 'suggested' && g.closesGap && g.round === view.round);
      if (round.verdict !== 'proved' && ghost && !argv['no-adopt'] && view.round < MAX_ROUNDS) {
        log(`adopting Claude's suggestion ${ghost.id}: "${ghost.naturalName}"`);
        await board.adoptGhost(ghost.id, argv['adopt-reason']);
        summary.adopted.push({ round: view.round, ghost: ghost.id, sentence: ghost.naturalName, lean: ghost.leanStatement, reason: argv['adopt-reason'] });
        await waitRun((v) => v.round > view.round || TERMINAL.includes(v.state), 'the round of the adopted premise', 300_000);
        await sleep(500);
        await wb.shot(`adopted-r${view.round}`);
        continue;
      }
      // The end: Accept (or Discard) the last proposal.
      if (argv.end === 'discard') {
        await board.discard();
        await waitRun((v) => TERMINAL.includes(v.state), 'the run to be discarded', 120_000);
        break;
      }
      const toastsBefore = new Set(await board.boardToasts());
      acceptClick = Date.now();
      await board.accept();
      // Accept ends the run, or the board says why it refused (overlapping edits, a failed re-check, ...).
      const outcome = await waitFor(
        async () => {
          const e = current();
          if (e && TERMINAL.includes(e.run.view.state)) return { entry: e };
          const refused = (await board.boardToasts()).filter((t) => !toastsBefore.has(t) && /refus|cannot|could not|overlap|fail/i.test(t));
          return refused.length > 0 ? { refused: refused.join(' | ') } : undefined;
        },
        300_000,
        'the Accept',
        500,
      );
      summary.times.acceptMs = Date.now() - acceptClick;
      if (outcome.refused) {
        summary.stopped = `Accept was refused: ${outcome.refused}`;
        await wb.shot('accept-refused');
        break;
      }
      summary.accept = { state: outcome.entry.run.view.state, changedFiles: outcome.entry.run.view.accepted?.changedFiles, error: outcome.entry.run.view.error };
      break;
    }
    // failed, cancelled, interrupted, or ended otherwise
    summary.stopped = `the run ended as ${view.state}${view.error ? `: ${view.error}` : ''}`;
    break;
  }

  // ---- After Accept: Lean checks the accepted files; the board shows their real statuses.
  const last = current();
  if (last?.run.view.state === 'accepted' && acceptClick !== undefined) {
    // The board's refresh after Accept rewrites .telelean/graph.json; a proved target must then show as proved.
    const graphFile = path.join(folder, '.telelean', 'graph.json');
    const proved = summary.rounds.at(-1)?.verdict === 'proved';
    await waitFor(
      async () => {
        const lean = await board.lean();
        const written = existsSync(graphFile) ? statSync(graphFile).mtimeMs : 0;
        if (written <= acceptClick || !['fresh', 'failed'].includes(lean.state)) return undefined;
        const node = graphNodes(graphJson()).find((n) => n.id === target);
        return !proved || node?.proof === 'proved' || lean.state === 'failed' ? lean : undefined;
      },
      300_000,
      "Lean's check of the accepted files",
    ).catch((error) => summary.problems.push(error.message));
    mark('Lean checked the accepted files');
    await sleep(1_000);
    await wb.shot('accepted');
    summary.leanAfterAccept = await board.lean();
    summary.statusesAfterAccept = graphNodes(graphJson());
    summary.cardsOnBoard = await board.cards();
  }

  // ---- The record
  const final = current() ?? last;
  if (final) {
    const view = final.run.view;
    summary.finalState = view.state;
    summary.usage = view.usage;
    summary.backend = view.backend;
    summary.ghosts = view.ghosts.map((g) => ({ id: g.id, round: g.round, sentence: g.naturalName, lean: g.leanStatement, leanName: g.leanName, closesGap: g.closesGap, aloneEntails: g.aloneEntails, state: g.state, card: g.nodeId }));
    summary.answered = view.answered.map((q) => ({ question: q.question, answer: q.answer, claudesGuess: q.claudesGuess }));
    summary.notices = view.notices.map((n) => `${n.level} ${n.kind}: ${n.text}`);
    summary.agentMs = final.run.clocks?.totalAgentMs;
    summary.runWallMs = (Date.parse(view.endedAt ?? view.updatedAt) || Date.now()) - Date.parse(view.startedAt);
    summary.transcript = path.join(final.dir, 'session', 'transcript.jsonl');
    if (rateLimited) summary.rateLimited = rateLimited;
  }
  summary.finalLean = leanFiles();
  summary.decisions = readJson(path.join(folder, '.telelean', 'subjects', argv.subject, 'decisions.json'));
  const lastRound = summary.rounds.at(-1);
  const targetAfter = (summary.statusesAfterAccept ?? []).find((n) => n.id === target);
  summary.result = {
    target,
    lastVerdict: lastRound?.verdict,
    rounds: summary.rounds.length,
    finalState: summary.finalState,
    targetAfterAccept: targetAfter ? { type: targetAfter.type, proof: targetAfter.proof } : undefined,
  };
  const ended = argv.end === 'accept' ? summary.finalState === 'accepted' : summary.finalState === 'discarded';
  const consistent = argv.end !== 'accept' || lastRound?.verdict !== 'proved' || targetAfter?.proof === 'proved';
  summary.passed = ended && consistent && summary.stopped === undefined && !summary.rateLimited;
}

let exitCode = 1;
try {
  await main();
  exitCode = summary.passed ? 0 : 1;
} catch (error) {
  summary.error = error.message;
  exitCode = error.setup ? 2 : 1;
  log(`error: ${error.message}`);
  if (wb) await wb.shot('error').catch(() => undefined);
  await endActiveRun();
} finally {
  await shutdown('done').catch((error) => summary.problems.push(`shutdown: ${error.message}`));
  writeSummary();
}
// A short recap for the person watching (the JSON on stdout has everything).
for (const q of summary.questions) log(`asked (${q.phenomenon}): ${q.question} -> ${q.answer}`);
for (const r of summary.rounds) log(`round ${r.round}: ${r.verdict}${r.gap ? ` (gap: ${r.gap})` : ''}`);
for (const a of summary.adopted) log(`adopted after round ${a.round}: "${a.sentence}" (${a.lean})`);
for (const n of summary.statusesAfterAccept ?? []) log(`after Accept: ${n.type} "${n.sentence}": ${n.proof ?? '-'}`);
if (summary.usage) log(`usage: ${summary.usage.requests} requests, ${summary.usage.inputTokens} in / ${summary.usage.outputTokens} out tokens (+${summary.usage.cacheReadInputTokens} cache read), estimate $${summary.usage.costEstimateUsd}`);
log(summary.passed ? 'PASSED' : `did not pass${summary.error ? ` (${summary.error})` : summary.stopped ? ` (${summary.stopped})` : ''}`);
log(`summary: ${path.join(work, 'summary.json')}; screenshots: ${path.join(work, 'screenshots')}`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(exitCode);
