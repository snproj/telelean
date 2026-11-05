M0 is done. All three spikes work on your machine; each was checked by an independent verifier and the issues found were fixed. At the end I re-ran every test suite myself: all 201 tests pass, and nothing was left running. The real-Claude smoke test also passed. Full report: [docs/m0-report.md](docs/m0-report.md).

| Spike | What it showed on your machine |
|---|---|
| **Sandboxed Lean** | Spyro builds in about 0.9 s inside a memory-capped sandbox that can't reach your home folder or the network. The memory cap, timeouts and crash clean-up work. `#print axioms` lists exactly the right assumptions. `lake comparator` accepts the honest proof. It rejects `sorry`, a smuggled axiom, a weakened goal, an unselected assumption, and vocabulary turned into a definition (your "belief tucked into a definition" case). |
| **Claude harness** (your CLI choice) | It is LLM-agnostic: telelean's tools reach the model over MCP. **Live test:** 8 Haiku requests, about $0.003. Your subscription was confirmed before any prompt was sent. A question waited 75 s and the answer still arrived. The file guard refused everything outside Claude's copy and all hidden files, and nothing leaked. A run resumed after a simulated window reload. |
| **Board** | Works in a real VS Code webview. The copy you installed is the static demo I described earlier; it starts reading your Lean files in M1. |

M0 also turned up facts that change the design, and M1 will apply them. For example, a small "keeper" process is needed so a crashed VS Code can't leave a sandbox running. They're listed in the report and summarised in [docs/design-amendments.md](docs/design-amendments.md) (A8).

## Your notes and questions

- **D-2, "most natural style for LLMs".** That line is from a research agent's report, not from 02, and nobody measured it.
  - It's a plausible guess: named `axiom`/`theorem` declarations are the most common shape in public Lean code. The alternatives (one big `structure` of beliefs, or section variables) are rarer and fiddlier.
  - It wasn't the reason for the decision. The reason is that `#print axioms` then reports exactly which beliefs each result uses.
  - The M2 walkthrough will be the first real evidence.
- **D-23(a): the CLI pattern is adopted, and your understanding is right,** with two nuances:
  - Each user signs in to their own Claude Code, and telelean never sees a login or a key. Anthropic's legal page explicitly allows that.
  - The Consumer Terms' clause on "automated means" still applies to subscription use. If you share telelean, an API key or another provider is the clean route.
  - Dropping the Agent SDK also removed a proprietary dependency and its 330 MB binary.
- **Your gate loop: adopted as you described it (A2).**
  - Programmatic checks, no LLM involved, run every time Claude says it's done. A failure shows a notice and triggers an automatic retry.
  - After 3 failed attempts, telelean tells you and reverts Claude's copy. Your own files change only when you press Accept.
  - New definitions and proposed missing premises become questions for you, not retries.
  - M0 already verified the core checks (first row above); the loop itself is built in M2.
- **D-33 history dropdown: M1.** You can revert to any snapshot, and a revert can itself be undone. The counter shows disk use, not RAM. Git compresses and deduplicates snapshots, so each is typically a few KB.
- **D-10:** attempted in M1; if it gets complicated, M1 ships with one subject first.
- **Your `telelean_scripts` commands** map one-to-one onto board actions (table in A7). Optionally, the board could log its actions in that style, giving you a replayable transcript.
- **"Spike"** means a short, time-boxed experiment that answers one question ("does X work here?") before anything is built on it. The "1–2 days" was a human-developer estimate and shouldn't have been there.
- **D-31 / D-32:** the tests use xvfb, and `mental_model/` is the sample workspace.

## Everything downloaded or installed (whole session)

Three agents produced this list without changing anything:
- two independent inventories: one from every command in my transcript and the 26 subagents', the other from every file changed on disk since the session began;
- a third agent that cross-checked them and resolved every mismatch.

The cross-check caught several things each method had missed alone. Evidence and an undo command for every row are in `verbatim_prompt_log/bundle_2/user_requested_documents/05_downloads_and_installs.md`. **Nothing has been deleted.**

| What | Where | Size | Still there? |
|---|---|---|---|
| **Turn 2** | | | |
| VS Code 1.140.0 test build + test profiles | `telelean/packages/extension/.vscode-test` | 1.0 GB | yes (needed for tests) |
| npm download cache, logs, update-check stamp | `~/.npm` | 279 MB | yes |
| Node.js 24.22.2 + npm/npx/corepack links | `~/.local/opt/…`, `~/.local/bin/` | 208 MB | yes (**needed**) |
| 306 npm packages + `package-lock.json` | `telelean/node_modules` | 177 MB | yes (**needed**) |
| Chrome crash reports from one crashed headless test run | `~/.config/google-chrome/Crash Reports/completed/` (2 × ~57 KB), `/var/crash/` (3.6 MB) | 3.8 MB | yes |
| Test VS Code's own downloads: spell-check dictionaries; it contacted the Marketplace/CDN but installed nothing | inside the `.vscode-test` folders | 3.2 MB | yes |
| Smoke test: Claude Code's session transcripts and logs | `~/.claude/projects/-tmp-…-smoke-live-ws-{a,b,c}`, `~/.cache/claude-cli-nodejs/…` | 221 KB | yes |
| Smoke test: `~/.claude.json` rewrites (+ Claude Code's own backups), model catalog, plugin record | `~/.claude.json`, `~/.claude/{backups,cache,plugins}` | small | yes |
| 23 log files from the test VS Code's built-in Copilot | `~/.copilot/logs/` | 13 KB | yes |
| vitest's per-user token | `~/.local/share/vitest/` | 37 B | yes |
| **Turn 1** | | | |
| Mathlib + 8 dependency repos, cloned by the accidental template | scratchpad | **7.2 GB at peak** | **no** (that agent deleted them) |
| Mathlib build-cache archives | `~/.cache/mathlib` | 450 MB | yes |
| npm registry metadata dumps | scratchpad | 208 MB | yes |
| npm package tarballs, unpacked for reading (never installed) | scratchpad | 105 MB | yes |
| Node.js tarballs 24.22.2 + 26.13.0 (for comparison) | scratchpad | 63 MiB | yes |
| Chrome's background ML-model downloads during a benchmark (throwaway profile) | scratchpad | 59 MB | yes |
| 9 shallow git clones (prior art) | scratchpad | 54 MB | yes |
| Source files and web pages saved with curl | scratchpad | 1.2 MB | yes |
| Oversized web-fetch results, PDF page images (saved by Claude Code) | `~/.claude/projects/…/tool-results/` | ~1 MB | yes |
| Policy pages and research copies, saved on purpose | `verbatim_prompt_log/bundle_1/…` | 2.4 MB | yes |
| 28 scratch project paths | `~/.elan/known-projects` | 28 lines | yes |
| **Both turns** | | | |
| Memory notes, on purpose | `~/.claude/projects/-home-zhengyew-telelean/memory/` | 10 KB | yes |

**Worth knowing:**
- **Chrome crash dumps.** One verifier's headless Chrome crashed, and Chrome saved the dumps into your real Chrome folder and `/var/crash`.
  - If Ubuntu shows a "system program problem" dialog about Chrome, that's this crash, and you can dismiss it.
  - Playwright disables crash uploads, so most likely nothing was sent, though I can't prove it.
  - M1's tests will give the test browser and the test VS Code an isolated home folder, so this can't recur.
- **Telemetry from the test VS Code.** Its built-in Copilot logged that its telemetry exporter was enabled, with every capture switch off. Whether anything was actually sent is unknown; VS Code itself ran with telemetry disabled.
- **The scratchpad** holds all the turn-1 research downloads (about 1.2 GB). It lives in `/tmp` and disappears at reboot.
- **Cleanup:** the audit document has a ready "safe to delete now" block, plus separate commands for uninstalling telelean itself.

**Not installed:** no Lean toolchain, no Playwright browser (your Chrome was used), no Python or global npm packages, nothing with sudo. Telelean is in your VS Code only because you installed it from the folder.

**Not ours:** your `sudo apt install xvfb`, which also upgraded four xserver packages, and your apps' normal background activity, which the audit checked and excluded.

## Next: M1, the board without AI (first usable)

M1 makes the board real:
- it reads the `@@ telelean` blocks in the open folder's `.lean` files, with `mental_model/` as the sample;
- Lean checks them in the sandbox, so statuses and verified arrows come from Lean;
- adding, editing, deleting and dragging write back to the files, with Undo, the D-33 history dropdown and its disk counter;
- several subjects per project (D-10, attempted);
- a `graph.json` snapshot for your scripts.

Say "go M1", or comment on anything first.

Everything from this turn is in `verbatim_prompt_log/bundle_2/`: the prompt, your 3 mid-turn messages, 8 interim replies, three documents (design amendments, the download/install list, the M0 report), the smoke-test evidence, and all 12 subagents' full reports.
