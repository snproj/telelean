# M0 report: spikes (2026-11-01)

**Verdict: M0 is complete.** All three spikes work on this machine, each was checked by an independent verifier and then fixed, and the real-Claude smoke test passed. Nothing is usable as a tool yet; M1 is the first usable milestone (the board on your real Lean files, without AI).

## What exists now

```
packages/core       types, versioned board⇄extension protocol, Spyro sample graph (15 tests)
packages/runner     lean/  runLean sandbox, shadow copy, #print-axioms footprints, lake comparator   (140 tests,
                    llm/   provider interface, Claude CLI backend, MCP tool server, path guard, fake  lean + llm)
packages/webview    React board (24 unit tests + 13 Playwright tests in your Chrome)
packages/extension  VS Code extension "telelean: Open Board" (4 unit + 5 smoke tests in VS Code 1.140 under xvfb)
scripts/smoke-claude.mjs   the live smoke test (run once, with your permission)
test-fixtures/      the verified Spyro Lean project + inert probe files (*.lean.txt)
```

All 201 tests passed in my final re-run, done separately from the agents' own runs.

## Spike 1: sandboxed Lean runs

| Claim | Evidence (ran) |
|---|---|
| Builds run in a memory-capped bwrap sandbox | Spyro builds in ~0.9 s, peak 95 MiB; a rebuild from a copied `.lake/build` recompiles 0 modules |
| The sandbox blocks your home folder and the network | Inert probes: writing to the real `$HOME` fails; listing `$HOME` shows an empty tmpfs; DNS, TCP, D-Bus and abstract sockets are all blocked |
| The memory cap works | 600 MB allocated under a 256 MB cap is reported as `oom` (cgroup `oom_kill=1` and systemd `Result=oom-kill` agree) |
| Nothing survives a timeout, cancel or crash | The whole scope is killed in each case, including when the host process dies |
| `#print axioms` footprints are exact | `cynder_not_good.holds` has exactly the 11 expected axioms |
| `lake comparator` runs under the sandbox | Honest proof: accepted. Rejected: weakened goal (both ways), unselected assumption, smuggled axiom, `sorry`, retyped assumption, missing proof, vocabulary turned into a definition. A sandbox start-up failure is reported as "could not start", never as "rejected" |
| No side effects | `~/.elan/known-projects` stays at 36 lines; no units or processes are left over |

## Spike 2: the Claude CLI harness (your D-23(a) choice)

**Offline (93 tests):**
- argv assembly;
- environment sanitising: every `CLAUDE*`/`ANTHROPIC_*` variable is stripped, because a Claude-enabled VS Code exports parent-session variables;
- parsing of the JSON event stream;
- the loopback MCP tool server (bearer token; Host/Origin checks);
- the path guard;
- the fake backend.

**Live smoke test, on Haiku 5.5:**
- **8 requests;** about 36k cache-read, 9k cache-write and 14 uncached input tokens, and 1.1k output tokens. The CLI's cost estimate is **$0.003**.
- **(a) Login and long waits: pass.** The subscription (Claude Ultra, first-party, no API key) was verified *before* any prompt was sent. The shell tool was absent and telelean's tools loaded. A question blocked for **75 s** and the answer still reached Claude.
- **(b) File confinement: pass.**
  - Allowed: reading the model file.
  - Denied: `/etc/hostname`, a decoy file outside the copy, and whole-folder Grep/Glob, which would have searched hidden files.
  - No hidden or outside content leaked.
- **(c) Reload: pass.** The CLI was killed mid-question, then `--resume` continued the same session and finished.

## Spike 3: the board in a real VS Code webview

The board has:
- three independently scrolling columns, with each card's sentence first, a kind glyph, a blue aura when formalised, and a chevron that expands to the Lean code;
- SVG arrows: dashed for declared, solid for verified. They follow scrolling and resizing, and become a stub plus an "n linked" badge when one end is scrolled away;
- drag to another column, which requests a kind change;
- click and Ctrl/Cmd-click selection, with a tray holding a target slot and a **These suffice** button;
- the A|D|G box.

Colours come only from VS Code theme variables, and the Content Security Policy is strict and nonce-based. In the real VS Code 1.140 test instance the webview loads with **0 CSP violations** and reports "4 cards, 3 arrows" for Spyro and "75 cards, 34 arrows (31 stubs)" for the large test graph.

## Design changes learned in M0 (to fold into M1/M2)

1. **Sandbox:**
   - Add a small *keeper* process with `setpriv --pdeathsig KILL`. Without it a crashed host leaves the sandbox running; this was tested as a negative control.
   - Set `OOMPolicy=stop` and run `reset-failed` afterwards.
   - "Could not start" is decided by bwrap's `exit-code` record, not by `child-pid`.
   - PATH must put the toolchain's `bin/` first, never elan's proxies.
2. **Comparator messages.** A weakened goal abbrev is reported as "definition mismatch" against the abbrev's own name. The user- and LLM-facing message should say "a definition the frozen statement depends on changed".
3. **Claude CLI:**
   - Telelean's MCP tools need `alwaysLoad` and `ENABLE_TOOL_SEARCH=false`, otherwise they hide behind a ToolSearch tool that isn't allowed.
   - Long questions need a per-server MCP timeout.
   - The account check uses the CLI's `initialize` reply before any prompt, so a refusal costs nothing.
   - In `-p` mode the CLI silently ignores an invalid settings file. Telelean therefore asks the running CLI for its hook list and refuses to start without the guard. The minimum CLI version is 2.1.295.
   - `--max-turns` counts per user turn, so telelean enforces its own run cap.
   - Haiku 5.5 can't switch thinking off in CLI 2.1.314; low effort keeps output short.
4. **Grep/Glob search hidden files.** The guard scans the search folder first. M1's shadow layout should give Claude a root holding only model files, with `.lake/` and `.telelean/` visible only inside the Lean sandbox.
5. **Board:**
   - Contributed colour ids must have exactly one dot. VS Code replaces only the first dot when naming the CSS variable.
   - Messages to a still-loading webview are queued, not dropped, so applying a graph must be idempotent or versioned.
   - Default colours should not rely on `charts.*` tokens, which some themes (e.g. Abyss) derive badly.

## Open items (not blocking; M1/M2)

- **runLean:**
  - production layout untested: a shadow under `~/.config`, and projects with real Lake dependencies;
  - G1's per-declaration budgets;
  - Lean errors are cut to their first line, which matters for the M2 retry prompts.
- **CLI:**
  - the hook has not been tested under the snap VS Code extension host;
  - a watchdog is needed if the extension host is SIGKILLed;
  - `check_lean` path validation, in the real host.
- **Board:** Undo, D-11 impact text on drop zones, keyboard equivalents, Shiki, persistence, vocabulary group.
- **Housekeeping:** 13 empty Chrome temp folders in `/tmp`, some older than this session, so not provably ours. Remove with `rmdir /tmp/com.google.Chrome.chrome_chrome_url_fetcher_.*` if you like.

## Re-running

```bash
cd /home/zhengyew/telelean
(cd packages/runner && npx vitest run)        # Lean sandbox + comparator + Claude harness (offline), ~70 s
(cd packages/core && npm test)
(cd packages/webview && npm test)             # typecheck, build, unit, Playwright (your Chrome, headless)
(cd packages/extension && npm test)           # includes VS Code 1.140 under xvfb
node scripts/smoke-claude.mjs --dry-run       # prints the exact Claude CLI invocation; contacts nothing
```

**Optional: see the board now.**
1. In VS Code run **Developer: Install Extension from Location…** and pick `/home/zhengyew/telelean/packages/extension`.
2. Run **telelean: Open Board**.

It shows the static Spyro sample; nothing reads your files yet. To remove it, uninstall it from the Extensions view.
