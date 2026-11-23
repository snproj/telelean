# Standing instructions for telelean sessions

These are the user's rules, collected on 2026-11-23 (turn 27) for the session that takes over on another machine. They apply in every turn until the user changes them. The user restated them at the start of each recent work turn:
- turn 25: "Stick to your standing instructions, as well as the guidelines regarding saving quota."
- turn 27: "Remember your standing instructions and the guidelines for quota saving."

Where the user's exact words are known, they are quoted with their source. The other rules are worded as the resume files have carried them since turn 21 (`bundle_21/RESUME.md`); the user has seen them in those files and in the end-of-turn reports.

---

## A. Safety and security

1. **Nothing leaves the machine, and git belongs to the user.**
   - Never push, publish, upload, email or message anyone.
   - Never change git state: no commit, stash, checkout, `git rm`, worktree or index change. HEAD stays where the user left it, with nothing staged. The user commits.
   - Allowed: reading git (`git diff`, `git log`, `git show`, `git archive HEAD | tar -x -C <scratch>`), and writing working-tree files, by editing them or by `patch -p1` / `git apply` *without* `--index` or `--cached`.
2. **Tests never call real Claude.** Every test and check runs with `TELELEAN_NO_REAL_CLAUDE=1`; `capped.sh` sets it.
3. **Hands off private and global configuration.**
   - Never read credentials: `~/.claude/.credentials.json`, tokens or keys.
   - Never touch the user's VS Code settings or extensions, `~/.config`, `~/.claude` (except Claude Code's own memory folder for this repo), `~/.elan`, or the global git config.
   - No `sudo`.
4. **`packages/extension/dist` and `packages/extension/out` are frozen.**
   - These are the user's installed extension, and they are tracked in git.
   - The only write allowed is the final "AP-8 rebuild", once every check of the work has passed.
5. **No downloads or installs by agents.**
   - No `npm install`, `npm ci`, new packages, `npx` or `npm` commands. Call the binaries in `node_modules/.bin` directly.
   - No browser or VS Code test-build downloads. Playwright uses the installed Google Chrome; the VS Code suites use the user's snap VS Code.
   - Setting up a new machine (`npm ci`, elan, Chrome and so on) is the **user's** job.
6. **Watch RAM. Kill only your own processes.** The machine has crashed from memory exhaustion before.
   - Run heavy jobs under `capped.sh <MB> …`, one at a time.
   - Keep one background guard for critical memory (section D).
   - Never kill the user's apps, their Lean servers or their other work. On the old machine that was `~/webring` and a telelean run for `doorstuck`.
7. **Real-Claude runs cost the user's quota.** telelean's Formalize runs call the user's own Claude CLI. Never start one without announcing its cost first.
8. **The user's model folders and telelean data are off limits.**
   - Never read or touch the user's telelean run folders, in VS Code's global storage, or their demo folders (`~/telelean-demos/…`). The only exception is reading, at the user's explicit request, as in turn 26.
   - New in turn 27: tests and checks must never create, change or delete anything in a real model folder of the user's, or in VS Code's real storage. Test VS Code and test browsers run with an isolated HOME and profile.
9. **Scope: a personal prototype** (memory note `telelean-scope-personal-prototype`).
   - Keep what makes "proved" mean "proved from exactly the selected assumptions", plus cheap safety.
   - Defer adversarial hardening.
   - When safety work comes up, explain plainly what it protects against and whether it matters for a single trusted user.

## B. How decisions are made and recorded

- **Ask when it's genuinely the user's call.** Turn 25: "Feel free to stop work and ask me any questions if you encounter design decisions or blockers." Otherwise decide, keep it minimal, and record it.
- **"Don't do anything yet"** means: answer only, change nothing, and still log the turn.
- **Two logs of decisions:**
  - **The project's decisions log:** `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md`.
    - Each entry is `### AP-n · <title> (<date>)`. AP-1 to AP-45 exist; **the next is AP-46**.
    - Write it in plain words, addressed to the user ("your extension rebuilt").
    - List the user's decisions and the builders' decisions, each with its alternative.
  - **The slice plan's §7.2:** the user's design decisions go in as "USER DECISION (turn N)"; a builder's own as "AUTOPILOT DECISION (<sub-slice>)", with the alternative.
- **The plan is updated first**, before code (§1.1, the design sections, the §6.1 test entry, §7.2 and §8's dated lines). Plans and briefs say what to build; the user's DESIGN section in a brief beats the plan's older wording.

## C. Logging: the verbatim prompt log (memory note `prompt-logging-instruction`)

Every user **turn** gets one bundle in `verbatim_prompt_log/`, numbered by turn. **The next is `bundle_29`** (turn 28 was a short Q&A on the old machine). Check with `ls verbatim_prompt_log` and take the next free number.

```
bundle_N/
  promptN.md                 the turn's opening message, verbatim
  promptN_midturn.md         every later message of the turn, verbatim, in order, with UTC times
                             (harness messages in the user role are logged too, marked as not typed by the user)
  responseN.md               the final reply, written to the file BEFORE it is sent, then sent with identical text
  responseN_interim.md       the text between tool calls (scratch script build_interim.py builds it from the transcript)
  responseN_midturn_reply.md replies to mid-turn questions (as in bundles 25 and 27)
  responseN_modelinfo.md     models, session id, harness, agents and workflows, token use, checks run, ledger, honest gaps
  user_requested_documents/  documents the user asked for
  subagent_reports/          ALL subagents' returns, verbatim (savewf.py extracts them from the workflow journal), plus the
                             workflow script (= their prompts)
  evidence/patches/          cumulative patches after each sub-slice (savepatch2.sh)
```

- Short Q&A turns get a bundle too.
- Never overwrite files the user wrote.
- If a reply is cut off by Anthropic's safety classifier, say so plainly. Don't reproduce the withheld content, and keep the next replies plain.

## D. Token and quota saving: the user's guidelines

### The user's words

- **Turn 2, D-23(b):** "You may use a little of the quota, though let me know just before you do it: How much quota you plan to use and why."
- **Turn 18:** "I need to save quota for now. Stop all agents (saving information in a file with instructions for a future session to continue then when commanded) …"
- **Turn 21:**
  - "My weekly quota is now at 96%, and will reset at 21 Nov 9pm SGT. You should plan your work so that when you hit usage limits, no work is lost and the work can be resumed when usage quota is replenished."
  - "I'm trying to target a demo by the end of this week; the main limiting factor is not time, but quota. Is there any optimization we can do towards this goal, and what would it entail?" The user then chose all four optimizations: **Fresh session, Cheaper models, Plan extracts, Lighter UI checks**.
  - For verification depth, the user chose: "Middle ground (Recommended) — about 2.3M per sub-slice: keep the adversarial verifier and the real-Lean suite; merge the plan-fidelity and code verifiers into one; re-verify a fix only when it fixed a blocker or major."
  - "Include the optimization instructions in the file that the next session will read."
- **Turn 27** (this handoff): "Include both the standing instructions as well as the guidelines for token saving."

### The rules that follow from them

1. **Ask before any large new spend, with an estimate.**
   - Keep a reserve of 10–15% of the weekly quota.
   - Report the turn's quota use at the end: subagent tokens with `wf_usage.py <turn start, UTC>`, and the main loop's use from the transcript, deduplicated by message id.
   - For a stopped workflow, `wf_usage.py` shows nothing. Sum the agents' transcripts instead (the method is in `bundle_27/response27_modelinfo.md`).
2. **Keep the main context small.** Every turn re-reads it.
   - Never read big files whole: the slice plans run to 2–4 k lines and 200–400 KB, and agent transcripts and journals are large. Use `grep`, `head`, small Python scripts and plan extracts.
   - From a workflow journal, read only the failing sub-slice's summary.
3. **Minimal wake-ups.**
   - Don't poll workflows; wait for their completion notice.
   - Run one background RAM guard only, which exits when free memory is critical:
     ```sh
     until [ "$(awk '/MemAvailable/{print $2}' /proc/meminfo)" -lt 1572864 ]; do sleep 30; done; echo RAM CRITICAL; grep MemAvailable /proc/meminfo; ps -eo pid,rss,etime,args --sort=-rss | head -12
     ```
   - Keep status messages short. When asked for an update, look once (the journal's started/result lines and the agent files' times) and answer.
4. **Model tiers:**
   - builders: the session model (Opus);
   - verifiers, fixers and re-verifiers: Sonnet;
   - the integrator: Haiku. It only runs `recheck_full.sh` and `savepatch2.sh` and reads the summary.
5. **Plan extracts.**
   - Each agent reads `<scratch>/extracts/plan_<id>.md` (from `plan_extract.py`), not the whole plan.
   - Regenerate the extracts right before launching a chain: workflow scripts can't run commands between sub-slices.
6. **Verification depth.**
   - Logic and safety sub-slices: two verifiers. One checks fidelity and code together (`fc`); the other is adversarial (`adv`).
   - UI-only sub-slices: one verifier.
   - At most two fix rounds. Re-verify only when a fix touched a blocker or major finding.
7. **Checks that are scripts cost no quota, so run them instead of agents where possible.**
   - The full real-Lean runner suite runs in every integrator check.
   - The browser (Playwright) specs and the VS Code suites run once, at the end. The orchestrator runs them directly, one at a time.
   - A failure there gets one Sonnet fixer, then a rebuild and a re-run.
8. **Never lose work to a limit.**
   - Save a cumulative patch after each sub-slice.
   - Keep a resume file up to date before long runs.
   - If a run is stopped, record where it stopped in the sub-slice's brief, as for 2e and 2k2.
9. **Calibrate estimates.** Recent actuals ran ~1.5× over the estimates:

   | Work | Estimate | Actual |
   |---|---|---|
   | 2j1 + 2j2 + design note (turn 25) | 1.5–2 M | 2.81 M |
   | 2k1, the Exit/Apply fix (turn 27) | 0.6–0.8 M | ≈ 1.2 M (the builder alone ≈ 0.78 M) |

   - The builders dominate.
   - The main loop costs about 0.09 M output tokens and 7–9 M cache reads per working turn.
10. **telelean's real Claude runs** (Formalize, demo rehearsals) spend the user's quota. Announce them, and never start them from tests.

## E. Ledger of downloads, installs and outside writes (memory note `track-downloads-installs`)

At the end of each working turn, report what was downloaded or installed and what was written outside the repo and the scratch dir. Use two methods and reconcile them:

1. **A disk scan by inode change time:** `ledger_disk.py`, with the turn's start time set inside it.
2. **A broad scan of every tool call** of the main session and all subagents: `ledger_scan.py`. Point its `files =` line at the turn's workflow folders.

The user's own apps (snap apps, VPN logs, their VS Code, GNOME) and Claude Code's housekeeping in `~/.claude` show up in the disk scan; name them as such.

Known leaks from test tooling into the real home folder:
- Playwright's Chrome: `~/.config/google-chrome/Crash Reports`, `/var/crash`;
- vitest: `~/.local/share/vitest`;
- the test VS Code's Copilot: `~/.copilot/logs`;
- Xvfb: `~/.cache/mesa_shader_cache`.

## F. Talking to the user

- **The user's background is formal methods** (memory note `user-profile`). Explain designs at that level, and introduce unfamiliar formal terms plainly. They use telelean in VS Code with a Claude subscription.
- **Their pronouns haven't been stated:** use they/them.
- **Times:** the user is in Singapore (SGT, UTC+8), so give times in SGT. The old machine's clock was UTC−8, so check the new machine's offset before converting.
- **Style:** short, plain status messages. End-of-turn reports say what changed, what to reload, what it cost (quota), the ledger, and what awaits the user.
