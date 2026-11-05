export const meta = {
  name: 'telelean-download-audit',
  description: 'Read-only audit: exhaustive list of everything downloaded/installed this session (transcripts vs disk, then reconcile)',
  phases: [
    { title: 'Inventory', detail: 'transcript-based and disk-based inventories, independently' },
    { title: 'Reconcile', detail: 'cross-check both lists, resolve discrepancies with evidence' },
  ],
}

const SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad'
const S = '/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
const COMMON = `
CONTEXT. A Claude Code session (main session + subagents) has been building "telelean" in /home/zhengyew/telelean since 2026-11-01 01:00 +0800 (UTC+8; transcript timestamps are UTC, so the session started 2026-10-31T17:00Z). Turn 1 (about 01:00-06:20 +0800) was research/design: workflows wf_a7c3b292-09a (8 research agents), wf_e8b19376-07c (7 reviewers), wf_f115952b-904 (2 verifiers). Turn 2 (from 06:22 +0800) was implementation: the main session installed Node, npm packages, ran tests and a live Claude smoke test; workflow wf_1ea207b3-94f (9 agents) built spikes. The user asked: "give me an exhaustive list of things that you / your subagents downloaded or installed; check thoroughly that the list is exhaustive."

SOURCES.
- Transcripts: main session ${S}.jsonl ; subagents ${S}/subagents/workflows/<run>/agent-<id>.jsonl (labels in each run's journal.jsonl "started" events). JSONL; tool calls are assistant messages with content items {type:"tool_use", name, input}.
- A broad pre-scan of all transcripts: ${SCR}/turn2/scan_out.txt (lists every Bash command that uses a network-capable tool, marked DL when it might download, plus every WebFetch/WebSearch). The scanner is ${SCR}/turn2/scan_transcripts.py; its regexes may miss things (it initially missed "lake +toolchain new"), so do not rely on it alone.
- A filesystem pre-scan: ${SCR}/turn2/audit_session.txt (mtime-based; note mtime misses extracted archives, use ctime: find -newerct).
- Known (already disclosed) turn-1 side effects: ~450 MB of Mathlib .ltar files in ~/.cache/mathlib from an accidental "lake new ... math" template; 28 lines appended to ~/.elan/known-projects (now 36 lines in total); turn-1 research artifacts (npm registry dumps, package tarballs, cloned repos, .lake dirs) under ${SCR}/research/, ${SCR}/review/, ${SCR}/verify/.
- Known turn-2 items: Node.js 24.22.2 tarball -> ~/.local/opt/node-v24.22.2-linux-x64 (+ symlinks node/npm/npx/corepack in ~/.local/bin; tarball deleted); npm install of 306 packages into /home/zhengyew/telelean/node_modules (+ ~/.npm/_cacache); the VS Code 1.140.0 test build in /home/zhengyew/telelean/packages/extension/.vscode-test; Claude CLI smoke test (sessions saved in ~/.claude/projects/-tmp-claude-1002--...-smoke-live-ws-{a,b,c}, ~/.claude.json rewritten with backups in ~/.claude/backups).

RULES. Strictly READ-ONLY: do not delete, move, modify, install or download anything; no network access except none at all (do not fetch URLs). Never read or print ~/.claude/.credentials.json or any token/secret; for files under ~/.claude, ~/.config, ~/snap use metadata (names, sizes, times) only, not contents. "Downloaded or installed" includes: software/packages/toolchains/browsers/binaries/archives fetched from the network, files saved from the web (curl/wget/npm pack/git clone), package caches populated, things registered/installed into apps (e.g. VS Code extensions), and side-effect writes to user config by tools (e.g. ~/.claude.json, ~/.elan/known-projects). Also list web pages merely fetched into context (WebFetch/WebSearch) as a separate, summarised category (not saved to disk), with counts per agent and the distinct domains. Distinguish what the user's own apps did (browsers, Discord, the user's VS Code and Lean servers, GNOME tracker) from what this session did; when unsure, say so and give the evidence.
Return your result as the structured output.`

const ITEM = {
  type: 'object',
  properties: {
    what: { type: 'string' }, version: { type: 'string' }, source: { type: 'string', description: 'URL / registry / tool that fetched it' },
    location: { type: 'string' }, size: { type: 'string' }, by: { type: 'string', description: 'main session or agent label(s)' },
    turn: { type: 'string' }, when: { type: 'string' }, still_present: { type: 'string' },
    evidence: { type: 'string', description: 'transcript command (abridged) and/or disk evidence (path, ctime, size)' },
    removal: { type: 'string', description: 'exact command to undo, if applicable' }, notes: { type: 'string' },
  },
  required: ['what', 'location', 'by', 'turn', 'still_present', 'evidence'],
}
const INVENTORY = {
  type: 'object',
  properties: {
    items: { type: 'array', items: ITEM },
    web_fetches: { type: 'string', description: 'summary: counts per agent, distinct domains, nothing saved' },
    temp_leftovers: { type: 'array', items: { type: 'string' } },
    uncertain: { type: 'array', items: { type: 'string' } },
    method: { type: 'string' },
  },
  required: ['items', 'web_fetches', 'temp_leftovers', 'uncertain', 'method'],
}

phase('Inventory')
const [fromTranscripts, fromDisk] = await parallel([
  () => agent(`${COMMON}
YOUR TASK (transcript view). Build the inventory from what the session DID: go through ${SCR}/turn2/scan_out.txt line by line (every DL line and every WEB line), and also search the raw transcripts yourself for anything the regexes could have missed (e.g. node/python scripts that download, "lake +toolchain ...", test runners that download browsers or VS Code, tools that write to user config). For each real download/install, find where it landed and whether it is still present (check the disk with ls/du/stat). Merge duplicates (e.g. many npm view calls -> one item "npm registry metadata queries"). Do not skip turn 1.`, { label: 'inventory:transcripts', phase: 'Inventory', schema: INVENTORY }),
  () => agent(`${COMMON}
YOUR TASK (disk view, independent of the transcripts). Inventory what is ON DISK that came from downloads/installs since 2026-11-01 01:00 +0800, without relying on the transcript scan: (1) $HOME with find -newerct (ctime) excluding nothing at first, then classify every top-level area (include ~/.cache, ~/.local, ~/.npm, ~/.elan, ~/.config/Code*, ~/.vscode, ~/.claude metadata, ~/snap metadata, ~/.cache/ms-playwright, pip caches, etc.); (2) /tmp and /var/tmp entries owned by uid 1002 (including ${SCR}: list downloaded archives *.tgz/*.tar*/*.zip/*.ltar, cloned git repos (.git dirs), node_modules dirs, .lake dirs and their packages, registry dumps); (3) check VS Code extension dirs (~/.vscode/extensions, test profiles) for anything installed; (4) check ~/.elan/toolchains and ~/.elan/known-projects. Classify each finding as session (which turn, which tool, evidence) vs user's own apps.`, { label: 'inventory:disk', phase: 'Inventory', schema: INVENTORY }),
])

phase('Reconcile')
const final = await agent(`${COMMON}
YOUR TASK (reconcile and verify exhaustiveness). Two independent inventories follow. Cross-check them: every transcript item must have a disk trace or an explanation (deleted, temp, not saved, failed); every disk item attributed to the session must have a command source; resolve each mismatch by checking the transcripts/disk yourself. Then produce the FINAL exhaustive list (merged, deduplicated, sorted by turn then size), with evidence, still-present status and exact undo commands (do not run them). Put anything you could not resolve in "uncertain".

TRANSCRIPT INVENTORY:
${JSON.stringify(fromTranscripts, null, 1)}

DISK INVENTORY:
${JSON.stringify(fromDisk, null, 1)}`, { label: 'reconcile', phase: 'Reconcile', schema: INVENTORY })

return { fromTranscripts, fromDisk, final }
