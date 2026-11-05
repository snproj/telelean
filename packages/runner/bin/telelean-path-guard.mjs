#!/usr/bin/env node
// telelean path guard: a Claude Code PreToolUse command hook that confines the agent's built-in
// file tools (Read / Glob / Grep / Edit / Write) to the run's shadow workspace.
//
// Installed by the runner through a generated `--settings` file, in exec form:
//   { "type": "command", "command": <node>, "args": [<this file>, <policy.json>],
//     "timeout": 30, "onFailure": "block" }
//
// Hook protocol (code.claude.com/docs/en/hooks, verified for Claude Code 2.1.314):
//   stdin   one JSON object: session_id, cwd, hook_event_name, tool_name, tool_input, tool_use_id, ...
//   deny    print {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
//           "permissionDecisionReason":"..."}} and exit 0 (the reason is shown to Claude)
//   pass    print nothing and exit 0 (no opinion: the normal permission rules decide)
//   error   exit 2 with a message on stderr: blocks the call. `onFailure: "block"` additionally makes
//           a crash, a timeout or unparsable output block the call, so the guard fails closed.
//
// What a hook can and cannot see. For Read / Edit / Write the hook sees the one file the call
// touches. For Grep and Glob it sees only the search root and the pattern text, while the tool
// walks the whole tree below the root: in Claude Code 2.1.314 Grep runs ripgrep with `--hidden`
// (only VCS folders excluded) and Glob runs `rg --files --hidden --no-ignore`, and a whitelist
// glob such as `**/*` matches dot-names too (ripgrep globs follow .gitignore rules, where `*`
// matches a leading '.'). No pattern check can therefore keep hidden entries out of a search.
// Instead the guard scans the search root before the call: Grep and Glob are allowed only on a
// folder that contains no hidden entry at any depth (symlinks are not followed, matching ripgrep,
// which does not follow them either). Pattern checks remain for patterns that spell out hidden
// names or try to leave the root.
//
// The decision logic is exported (`decide`) so the runner's TypeScript code and tests use exactly
// the code that the hook runs. This file deliberately has no dependencies beyond Node built-ins.

import { appendFileSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD_POLICY_VERSION = 1;
/** Directory entries the Grep/Glob scope scan may visit before it gives up (and denies). */
export const DEFAULT_MAX_SCAN_ENTRIES = 20_000;

/** Tools whose path arguments the guard knows how to check. */
const PATH_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);
const DEFAULT_HIDDEN = ['.lake', '.telelean', '.git'];
/** Brace expansion of one pattern stops (and denies) beyond this many alternatives. */
const MAX_BRACE_ALTERNATIVES = 256;

const defaultFs = {
  realpath: (p) => realpathSync(p),
  lstat: (p) => lstatSync(p),
  readdir: (p) => readdirSync(p, { withFileTypes: true }),
};

/**
 * Decide one PreToolUse call.
 * @param {import('./telelean-path-guard.mjs').HookInput} input
 * @param {import('./telelean-path-guard.mjs').GuardPolicy} policy
 * @param {Partial<import('./telelean-path-guard.mjs').GuardFs>} [fsImpl]
 * @returns {import('./telelean-path-guard.mjs').GuardDecision}
 */
export function decide(input, policy, fsImpl = {}) {
  const toolName = typeof input?.tool_name === 'string' ? input.tool_name : '';
  const toolInput = isRecord(input?.tool_input) ? input.tool_input : {};
  const base = { tool: toolName, checked: [] };

  if (input?.hook_event_name !== undefined && input.hook_event_name !== 'PreToolUse') {
    return { ...base, kind: 'pass', reason: `not a PreToolUse event (${String(input.hook_event_name)})` };
  }
  if (toolName === '') {
    return { ...base, kind: 'deny', reason: 'hook input has no tool_name' };
  }
  for (const prefix of policy.passthroughToolPrefixes ?? []) {
    if (toolName.startsWith(prefix)) return { ...base, kind: 'pass', reason: `telelean tool (${prefix}*)` };
  }
  if ((policy.passthroughTools ?? []).includes(toolName)) {
    return { ...base, kind: 'pass', reason: 'tool listed as passthrough' };
  }

  const ctx = makeContext(policy, input, { ...defaultFs, ...fsImpl });
  try {
    if (PATH_TOOLS.has(toolName)) {
      base.checked.push(checkPath(ctx, 'file_path', toolInput.file_path, { required: true }));
    } else if (toolName === 'Glob') {
      // Glob passes its pattern to ripgrep as one --glob argument.
      checkPattern(ctx, 'pattern', toolInput.pattern, { required: true, negatable: false });
      const scope = checkPath(ctx, 'path', toolInput.path, { required: false });
      base.checked.push(scope);
      assertNoHiddenInScope(ctx, toolName, scope);
    } else if (toolName === 'Grep') {
      const scope = checkPath(ctx, 'path', toolInput.path, { required: false });
      base.checked.push(scope);
      for (const token of grepGlobTokens(toolInput.glob)) {
        checkPattern(ctx, 'glob', token, { required: false, negatable: true });
      }
      assertNoHiddenInScope(ctx, toolName, scope);
    } else if (policy.unknownTools === 'pass') {
      return { ...base, kind: 'pass', reason: 'unknown tool passed through by policy' };
    } else {
      return { ...base, kind: 'deny', reason: `telelean does not allow the ${toolName} tool in this run` };
    }
  } catch (err) {
    if (err instanceof GuardDenial) {
      return { ...base, kind: 'deny', reason: `telelean confinement: ${toolName} ${err.message}` };
    }
    throw err;
  }
  return { ...base, kind: 'pass', reason: 'inside the workspace copy' };
}

/** The JSON a PreToolUse hook prints for a decision, or undefined for "no opinion". */
export function hookOutputFor(decision) {
  if (decision.kind !== 'deny') return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `${decision.reason}. Only files inside the workspace copy are accessible, ` +
        'excluding dotfiles, .lake/ and .telelean/. Use paths inside the current working directory.',
    },
  };
}

/** Read and validate a policy file. Throws on anything unexpected (the hook then blocks). */
export function loadPolicy(policyPath) {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (!isRecord(policy) || policy.version !== GUARD_POLICY_VERSION) {
    throw new Error(`unsupported guard policy (expected version ${GUARD_POLICY_VERSION})`);
  }
  if (typeof policy.root !== 'string' || !path.isAbsolute(policy.root)) {
    throw new Error('guard policy needs an absolute "root"');
  }
  return policy;
}

/**
 * The globs Claude Code 2.1.314's Grep tool makes from its `glob` argument: split on whitespace;
 * a token holding both '{' and '}' stays whole, any other token is split on ','. Each one becomes
 * a separate ripgrep --glob argument.
 */
export function grepGlobTokens(value) {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') return [value]; // checkPattern refuses it
  const tokens = [];
  for (const word of value.split(/\s+/)) {
    if (word === '') continue;
    if (word.includes('{') && word.includes('}')) tokens.push(word);
    else tokens.push(...word.split(',').filter(Boolean));
  }
  return tokens;
}

// ---------------------------------------------------------------------------------------------

class GuardDenial extends Error {}

function makeContext(policy, input, fsImpl) {
  const rootLexical = path.resolve(policy.root);
  // The root is canonicalised on every call: if it cannot be resolved, the call is blocked (throws).
  const rootReal = fsImpl.realpath(rootLexical);
  const hidden = new Set(policy.hiddenSegments ?? DEFAULT_HIDDEN);
  const denyDot = policy.denyDotSegments !== false;
  const maxScanEntries =
    Number.isInteger(policy.maxScanEntries) && policy.maxScanEntries > 0 ? policy.maxScanEntries : DEFAULT_MAX_SCAN_ENTRIES;
  const cwd = typeof input?.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : rootLexical;
  return { fs: fsImpl, rootLexical, rootReal, hidden, denyDot, maxScanEntries, cwd };
}

function isHiddenName(ctx, name) {
  return ctx.hidden.has(name) || (ctx.denyDot && name.startsWith('.') && name !== '.');
}

// --- patterns ---------------------------------------------------------------------------------

/**
 * Refuses patterns that are absolute, contain '..', or spell out a hidden name. A segment counts
 * as spelling out a hidden name when, after brace expansion, it starts with a literal '.' (also
 * escaped as '\.'), with '?', or with a character class that can match '.' (e.g. '[.]', '[!a]').
 * Segments starting with '*' are allowed although '*' can match a leading '.' too: refusing them
 * would make Glob useless, and the scope scan is what keeps hidden entries out of a search.
 * A Grep exclusion ('!pattern') can only narrow a search, so it is not checked for hidden names.
 */
function checkPattern(ctx, role, value, { required, negatable }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new GuardDenial(`needs a "${role}"`);
    return;
  }
  if (typeof value !== 'string') throw new GuardDenial(`"${role}" must be a string`);
  if (value.includes('\0')) throw new GuardDenial(`"${role}" contains a NUL byte`);
  const negated = negatable && value.startsWith('!');
  const body = negated ? value.slice(1) : value;
  for (const alternative of expandBraces(role, value, body)) {
    if (isAbsolutePattern(alternative)) {
      throw new GuardDenial(`"${role}" '${value}' is absolute; use a pattern relative to the workspace copy`);
    }
    // ripgrep globs use '/' as the separator and '\' as an escape (Linux and macOS).
    for (const segment of alternative.split('/')) {
      const literal = unescapeGlob(segment);
      if (literal === '..') throw new GuardDenial(`"${role}" '${value}' contains a '..' segment`);
      if (segment === '' || literal === '.' || negated) continue;
      const why = hiddenSegmentReason(ctx, segment, literal);
      if (why) throw new GuardDenial(`"${role}" '${value}' ${why}`);
    }
  }
}

function isAbsolutePattern(p) {
  return p.startsWith('/') || p.startsWith('~') || p.startsWith('\\/') || /^[A-Za-z]:/.test(p);
}

function hiddenSegmentReason(ctx, segment, literal) {
  if (isHiddenName(ctx, literal)) return `names a hidden entry ('${literal}')`;
  const first = segment[0];
  if (first === '\\' && segment[1] === '.') return `names a hidden entry ('${literal}')`;
  if (first === '?') return `has a segment starting with '?' ('${segment}'), which can match hidden names`;
  if (first === '[') {
    const cls = parseClass(segment, 0);
    if (cls === undefined || cls.matches('.')) {
      return `has a segment starting with a character class that can match '.' ('${segment}'), which can match hidden names`;
    }
  }
  return undefined;
}

/** Removes glob escapes ('\x' -> 'x'); wildcards stay as they are. */
function unescapeGlob(segment) {
  return segment.replace(/\\(.)/g, '$1');
}

/**
 * Parses a character class starting at `start` ('[' ... ']', with '!' or '^' negation, ranges and
 * escapes). Returns { end, matches(ch) }, or undefined when the class is not closed.
 */
function parseClass(s, start) {
  let i = start + 1;
  let negated = false;
  if (s[i] === '!' || s[i] === '^') {
    negated = true;
    i += 1;
  }
  const singles = new Set();
  const ranges = [];
  let first = true;
  for (; i < s.length; i++) {
    let ch = s[i];
    if (ch === ']' && !first) {
      const inSet = (c) => singles.has(c) || ranges.some(([a, b]) => a <= c && c <= b);
      return { end: i, matches: (c) => (negated ? !inSet(c) : inSet(c)) };
    }
    first = false;
    if (ch === '\\' && i + 1 < s.length) {
      i += 1;
      ch = s[i];
    }
    if (s[i + 1] === '-' && i + 2 < s.length && s[i + 2] !== ']') {
      let hi = s[i + 2];
      let skip = 2;
      if (hi === '\\' && i + 3 < s.length) {
        hi = s[i + 3];
        skip = 3;
      }
      ranges.push([ch, hi]);
      i += skip;
    } else {
      singles.add(ch);
    }
  }
  return undefined;
}

/** Index of the '}' that closes the '{' at `open`, skipping escapes and classes; -1 if none. */
function closingBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      i += 1;
    } else if (ch === '[') {
      const cls = parseClass(s, i);
      if (cls) i = cls.end;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Splits the inside of a brace group on its top-level commas. */
function splitAlternatives(inner) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\') {
      i += 1;
    } else if (ch === '[') {
      const cls = parseClass(inner, i);
      if (cls) i = cls.end;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(inner.slice(from));
  return parts;
}

/** All brace alternatives of a pattern ('.{lake,git}/*' -> ['.lake/*', '.git/*']), bounded. */
function expandBraces(role, value, pattern) {
  const out = [];
  const visit = (p) => {
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '\\') {
        i += 1;
      } else if (ch === '[') {
        const cls = parseClass(p, i);
        if (cls) i = cls.end;
      } else if (ch === '{') {
        const close = closingBrace(p, i);
        if (close < 0) break; // unclosed: ripgrep rejects the glob; check it as written
        const head = p.slice(0, i);
        const tail = p.slice(close + 1);
        for (const alt of splitAlternatives(p.slice(i + 1, close))) visit(head + alt + tail);
        return;
      }
    }
    out.push(p);
    if (out.length > MAX_BRACE_ALTERNATIVES) {
      throw new GuardDenial(`"${role}" '${value}' has more than ${MAX_BRACE_ALTERNATIVES} brace alternatives`);
    }
  };
  visit(pattern);
  return out;
}

// --- paths ------------------------------------------------------------------------------------

function checkPath(ctx, role, value, { required }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new GuardDenial(`needs a "${role}"`);
    // Glob and Grep default to the session's working directory, which must itself be inside.
    const resolved = canonicalise(ctx, ctx.cwd);
    assertInside(ctx, role, ctx.cwd, resolved);
    return { role, raw: null, resolved };
  }
  if (typeof value !== 'string') throw new GuardDenial(`"${role}" must be a string`);
  if (value.includes('\0')) throw new GuardDenial(`"${role}" contains a NUL byte`);
  if (value.startsWith('~')) throw new GuardDenial(`path '${value}' starts with '~' (home directory)`);
  if (value.split(/[\\/]/).includes('..')) throw new GuardDenial(`path '${value}' contains a '..' segment`);

  const absolute = path.isAbsolute(value) ? path.normalize(value) : path.resolve(ctx.cwd, value);
  // Lexical check first: a hidden name in the path as written is refused even when it resolves
  // somewhere visible (for example a symlink called .lake that points at a model file).
  for (const rootForm of new Set([ctx.rootLexical, ctx.rootReal])) {
    const rel = path.relative(rootForm, absolute);
    if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) assertNotHidden(ctx, value, rel);
  }
  const resolved = canonicalise(ctx, absolute);
  assertInside(ctx, role, value, resolved);
  return { role, raw: value, resolved };
}

/**
 * Grep and Glob walk the whole tree below their search root and search hidden entries too (see
 * the header). They are therefore allowed only on a folder without any hidden entry below it.
 * A search root that is a single file was already checked as a path.
 */
function assertNoHiddenInScope(ctx, toolName, scope) {
  let stat;
  try {
    stat = ctx.fs.lstat(scope.resolved);
  } catch {
    return; // the search root does not exist: the tool itself reports that
  }
  if (!stat.isDirectory()) return;
  const where = path.relative(ctx.rootReal, scope.resolved) || '.';
  const found = findHiddenEntry(ctx, scope.resolved, where);
  if (found === undefined) return;
  const suggestions = visibleSubfolders(ctx, scope.resolved, where);
  const hint =
    suggestions.length > 0
      ? `; give a "path" to a folder without hidden entries, such as ${suggestions.map((s) => `'${s}'`).join(' or ')}`
      : '; give a "path" to a folder without hidden entries';
  throw new GuardDenial(
    `would search '${where}', which contains the hidden entry '${found}'. ` +
      `${toolName} also searches hidden files, so it may only search folders without hidden entries${hint}`,
  );
}

/** First hidden entry below `dir` (relative to it), without following symlinks; bounded. */
function findHiddenEntry(ctx, dir, where) {
  let visited = 0;
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const entries = listDir(ctx, rel === '' ? dir : path.join(dir, rel), rel === '' ? where : path.join(where, rel));
    for (const entry of entries) {
      visited += 1;
      if (visited > ctx.maxScanEntries) {
        throw new GuardDenial(
          `would search '${where}', which has more than ${ctx.maxScanEntries} entries to check for hidden files; give a narrower "path"`,
        );
      }
      const childRel = rel === '' ? entry.name : path.join(rel, entry.name);
      if (isHiddenName(ctx, entry.name)) return childRel;
      // Dirent types come from lstat: a symlink is never a directory here, so it is not followed
      // (ripgrep does not follow symlinks below the search root either).
      if (entry.isDirectory()) stack.push(childRel);
    }
  }
  return undefined;
}

function listDir(ctx, abs, label) {
  try {
    return ctx.fs.readdir(abs);
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    throw new GuardDenial(`cannot check '${label}' for hidden entries (${code ?? String(err)})`);
  }
}

function visibleSubfolders(ctx, dir, where) {
  try {
    return listDir(ctx, dir, where)
      .filter((e) => e.isDirectory() && !isHiddenName(ctx, e.name))
      .map((e) => (where === '.' ? e.name : path.join(where, e.name)))
      .sort()
      .slice(0, 4);
  } catch {
    return [];
  }
}

/**
 * realpath of an existing path; for a path that does not exist yet (a new file), the realpath of
 * its deepest existing ancestor plus the missing tail. A missing component that is itself a
 * (dangling) symlink is refused: writing through it would create the link's target elsewhere.
 */
function canonicalise(ctx, absolute) {
  const tail = [];
  let probe = absolute;
  for (;;) {
    try {
      const real = ctx.fs.realpath(probe);
      return tail.length === 0 ? real : path.join(real, ...tail.reverse());
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : undefined;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw new GuardDenial(`path '${absolute}' cannot be resolved (${code ?? String(err)})`);
      }
      if (code === 'ENOENT' && existsAsLink(ctx, probe)) {
        throw new GuardDenial(`path '${absolute}' goes through a dangling symlink ('${probe}')`);
      }
      const parent = path.dirname(probe);
      if (parent === probe) throw new GuardDenial(`path '${absolute}' cannot be resolved`);
      tail.push(path.basename(probe));
      probe = parent;
    }
  }
}

function existsAsLink(ctx, p) {
  try {
    ctx.fs.lstat(p);
    return true; // realpath said ENOENT but the entry exists: a dangling symlink
  } catch {
    return false;
  }
}

function assertInside(ctx, role, raw, resolved) {
  const inside = resolved === ctx.rootReal || resolved.startsWith(ctx.rootReal + path.sep);
  if (!inside) {
    throw new GuardDenial(`"${role}" '${raw}' resolves outside the workspace copy (to ${resolved})`);
  }
  const rel = path.relative(ctx.rootReal, resolved);
  if (rel !== '') assertNotHidden(ctx, raw, rel);
}

function assertNotHidden(ctx, raw, rel) {
  for (const segment of rel.split(path.sep)) {
    if (isHiddenName(ctx, segment)) {
      throw new GuardDenial(`path '${raw}' is inside a hidden entry ('${segment}')`);
    }
  }
}

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function logDecision(policy, input, decision) {
  if (typeof policy.logFile !== 'string') return;
  const record = {
    ts: new Date().toISOString(),
    session_id: input?.session_id,
    tool_use_id: input?.tool_use_id,
    tool: decision.tool,
    decision: decision.kind,
    reason: decision.reason,
    // Paths and patterns only: never file contents (Write/Edit carry them in tool_input).
    paths: decision.checked,
    pattern: typeof input?.tool_input?.pattern === 'string' ? input.tool_input.pattern : undefined,
  };
  appendFileSync(policy.logFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const policyPath = argv[0];
  if (!policyPath) throw new Error('usage: telelean-path-guard.mjs <policy.json>  (hook input on stdin)');
  const policy = loadPolicy(policyPath);
  const input = JSON.parse(await readStdin());
  const decision = decide(input, policy);
  logDecision(policy, input, decision);
  const out = hookOutputFor(decision);
  if (out !== undefined) process.stdout.write(`${JSON.stringify(out)}\n`);
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (err) => {
      // Exit 2 blocks the tool call; stderr is the message Claude Code shows.
      process.stderr.write(`telelean path guard failed, blocking the call: ${err?.message ?? String(err)}\n`);
      process.exit(2);
    },
  );
}
