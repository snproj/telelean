# START HERE: taking over telelean on a new machine

**For:** the next Claude Code session, which may run on another machine. The user reads it too.
**Written:** 2026-11-23, about 05:30Z (13:30 SGT), by session `c398a83b-d60f-46a4-ad9a-8d926e6fdd1b` at the end of turn 27.
**Suggested first message from the user:** "Read verbatim_prompt_log/bundle_27/handoff/START_HERE.md and follow it."

---

## 0. Read in this order

1. **This file.**
2. **`STANDING_INSTRUCTIONS.md`** in this folder. It is mandatory: the user's safety rules, logging rules, decision rules and quota-saving guidelines.
3. **`memory/`** in this folder: copies of the old session's memory notes.
   - Step 1 installs them into your memory folder.
   - `telelean-project.md` is the project's long history. Skim it; this file supersedes it where they differ.
4. Nothing else in full. The plans, reports and journals are big. Use `grep`, `head` and the extract scripts (STANDING_INSTRUCTIONS §D.2).

## 1. What telelean is, in five lines

- telelean is a VS Code extension: a board of cards in three columns (assumptions, derivations, goals) backed by a Lean 4 model folder.
- The user can ask Claude, through their own Claude Code CLI, to formalise and prove things inside an **edit session**. Claude works on a copy in a confined workspace.
- The user then reviews each item (Accept / Decline / To be redone, with notes), submits, and finally **Applies** the session to their files (one Undo) or **Exits** it (files unchanged).
- Packages:
  - `core`: the model and logic;
  - `runner`: runs, sessions, the Lean checks and the confinement;
  - `extension`: the VS Code host;
  - `webview`: the React board.
- Docs: `docs/user-guide.md` (what the user sees), `docs/slice2-plan.md` (the current slice's plan, ~4.1 k lines; read by extract) and `docs/project-report.md`.
- The spec is `verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md`.

## 2. State at handoff

| Item | State |
|---|---|
| **git** | HEAD `4640902` ("2j"), nothing staged. The user commits; never you. |
| **Working tree** | **Exactly 2k1**: 19 changed files, uncommitted. A diff against HEAD equals `bundle_27/evidence/patches/after_slice_2k1.patch` byte for byte (checked 05:20Z). This bundle (`verbatim_prompt_log/bundle_27/`) is untracked. |
| **Slice 1, slice 2 (2a–2i), 2j1/2j2** | Done, committed, and installed in the user's extension (`dist`/`out` built 2026-11-22 07:58 old-machine time, i.e. 15:58Z). |
| **2k1: the Exit/Apply fix** | Built and verified by the chain (see below). Still to run: the **final checks** (§4 Step 4) and the AP-46 entry. |
| **2k2: model data in its own folder** | **Interrupted** at the user's request (05:13Z), so they can move on to slices 3+. Partial, unverified work: `bundle_27/evidence/patches/slice_2k2_partial_only.patch`. Brief, with an "INTERRUPTED" note: `kit/briefs/2k2.md`. The user decides when to redo it. |
| **Slices 3, 4, 5** | Planned on 2026-11-19 to 21, before 2e–2k1 landed, so each needs a pre-build refresh against today's code. The user now wants to work on **slices 3 onwards**. |
| **Decisions log** | `bundle_21/user_requested_documents/02_autopilot_decisions.md`, AP-1 to AP-45. **AP-46 still to write.** |
| **Open questions for the user** | The live, read-only Q&A design note: `bundle_25/user_requested_documents/01_live_qa_design_note.md`, 6 questions unanswered. My recommendation was option A: a fresh, tool-less Claude given only the masked view. **The user plans to answer them in your session** (turn 28). Record the answers verbatim in that turn's bundle and as USER DECISIONs in the decisions log. Building the Q&A needs its own go-ahead and estimate: the note says ≈ 2–2.7 M tokens for option A, and option B adds ≈ 0.5–1 M. |
| **Open nits** | A-ADV-2j2-5 (a stale note line in decisions-since). The "AP-42 core defect" (see AP-42 in the decisions log). |

**About 2k1:**
- **What it fixes:** after Exit or Apply, the runner kept sending the board the ended session's review view, so the board kept showing the review panel. A second Exit then got "That run is not active any more."
- **The fix:**
  - `session()` is null for any ended run;
  - the end's change makes the host post `session: null`;
  - the board shows the ended run's outcome ("You exited…" / "Applied…") with Dismiss;
  - the board never draws review controls for an ended run, even with a stale view.
- **Its checks:**
  - the user's decisions D1–D6 are in the plan's §7.2, with "**2k1:**" entries in §1.1 and §6.1;
  - two Sonnet verifiers found no blocker or major;
  - one fix round fixed 4 findings;
  - the Haiku integrator passed 5 tsc configs, vitest in core, webview and extension, and the full real-Lean runner suite.
- **Reports:** `bundle_27/subagent_reports/agents/*.md`. Read the builder's "Decisions for the orchestrator to log" for AP-46, and its note on the **unrun VS Code e2e Exit scenario**.

**Left behind on the old machine** (not in the repo, so not here):
- the user's demo folders `~/telelean-demos/*`;
- telelean's run folders in VS Code's global storage (`telelean.telelean/runs/…`), where an old socrates session may still be open;
- doorclose's leaked `.telelean/subjects/Doorclose/attempts.jsonl`, which the user can delete.

The user copies any of these across if they want them.

## 3. Setting up the new machine: the USER does the installs

Agents may not download or install anything (STANDING_INSTRUCTIONS §A.5). Before Step 4, check each of these and list what is missing for the user:

| Need | Old machine | Check with |
|---|---|---|
| Node | v24.22.2 (`engines: >=24.22.2`) | `node -v` |
| Dependencies | `npm ci` at the repo root, **run by the user** | `ls node_modules/.bin/{tsc,vitest,vite,playwright}` |
| Lean | elan with `leanprover/lean4:v4.35.0` (`test-fixtures/spyro/lean-toolchain`) | `lake --version`, `elan show` |
| bubblewrap | `/usr/bin/bwrap` (the Lean sandbox) | `command -v bwrap` |
| Google Chrome | Playwright 1.64.1 uses channel "chrome" and never downloads browsers | `command -v google-chrome` |
| xvfb-run | for the VS Code suites | `command -v xvfb-run` |
| snap VS Code | `smoke.mjs --snap` uses `/snap/code/current` | `ls /snap/code` |
| systemd user session | `capped.sh` uses `systemd-run --user --scope` | `systemd-run --user --scope true` |
| RAM | 64 GB and 14 cores. The real-Lean runner tests skip themselves below 12 GB free; `recheck_full.sh` catches extra skips | `free -g` |
| Claude Code CLI, logged in | only for the user's real telelean runs; tests never call it | ask the user |
| The extension | **Developer: Install Extension from Location…** → `<repo>/packages/extension`, then reload | ask the user |

telelean's shared Lean fact extractor is compiled once per machine, outside the repo. There is nothing to copy for it.

## 4. Steps

### Step 1: install the kit into your scratchpad

The old scripts hard-code the old machine's paths. `install_kit.sh` copies them into your scratchpad and rewrites the repo, scratchpad, session, `/tmp/claude-<uid>`, `/run/user/<uid>` and home paths:

```sh
sh <repo>/verbatim_prompt_log/bundle_27/handoff/install_kit.sh <your scratchpad dir> --with-memory
```

- `--with-memory` copies `memory/*.md` into `~/.claude/projects/<repo slug>/memory/`. It never overwrites notes already there.
- Read its output, then fix the values in §6 by hand.
- Below, `S` means your scratchpad.

### Step 2: check the tree

```sh
cd <repo>
"$S"/snapdiff2.sh "$S"/now.diff
cmp -s "$S"/now.diff verbatim_prompt_log/bundle_27/evidence/patches/after_slice_2k1.patch && echo "AS LEFT (2k1 only)" || echo "CHANGED: look before doing anything"
git diff --cached --stat | wc -l      # must print 0
git log -1 --format='%h %s'           # 4640902 2j, unless the user has committed since
```

- **If the user committed 2k1** before moving, the diff is empty and HEAD is new. Check it with `git show --stat HEAD`: it should list 2k1's 19 files. Then use the new HEAD id everywhere in §6.
- **If the working tree didn't come across** (e.g. the user cloned at 4640902), you may restore 2k1 into the working tree with `patch -p1 < verbatim_prompt_log/bundle_27/evidence/patches/after_slice_2k1.patch`. Ask the user first, then re-run the check. This writes files only; git stays untouched.

### Step 3: logging

The user's first message to you opens **turn 29** (turn 28 was a short Q&A on the old machine; check `ls verbatim_prompt_log` and take the next free number):
- create `verbatim_prompt_log/bundle_29/`;
- save the message verbatim as `prompt29.md`;
- follow STANDING_INSTRUCTIONS §C from there.

Turn 27's logs are complete in `bundle_27/`. Its end-of-turn files are `response27.md`, `response27_modelinfo.md` and `response27_interim.md`.

### Step 4: 2k1's final checks (ask the user first)

My last question to the user was whether to run these now or go straight to slice 3. They chose to move machines instead and haven't answered.

**Recommend running them first.** They take about 35–60 min of wall clock and almost no tokens. They also give the user the Exit fix in their installed extension, and they let the user commit a fully checked 2k1, together with its rebuilt `dist`/`out`, before slice 3 starts.

1. **The webview build and Playwright.** From `packages/webview`:

   ```sh
   TELELEAN_WEBVIEW_OUT="$S"/final-webview-build-2k "$S"/capped.sh 1500 <repo>/node_modules/.bin/vite build
   ```

   Then run every spec one at a time: `"$S"/final_checks_2k/run_specs.sh`. Read it first; `all.sh` chains the build and the specs. Each spec's log lands in `$S/final_checks_2k/`.
   - Turn 25's result was 120/120 across 21 spec files.
   - `s2-review.spec.ts` carries 2k1's new Exit and Apply paths.
   - Move any `packages/webview/test-results` folder into scratch afterwards.
2. **The AP-8 rebuild, only if everything passed.**
   - From `packages/webview`: `"$S"/capped.sh 1500 <repo>/node_modules/.bin/vite build`, with no `TELELEAN_WEBVIEW_OUT`, so it writes `packages/extension/dist/webview`.
   - Then from `packages/extension`: `"$S"/capped.sh 2000 node scripts/build.mjs`.
   - This writes the tracked `dist/` and `out/`.
3. **The VS Code suites:** `"$S"/final_checks_2k/run_vscode_smoke.sh`, which runs `smoke.mjs --snap` with an isolated profile.
   - Turn 25: 53 passing, 8 pending (1 smoke, 7 old review scenarios that are skipped on purpose; don't un-skip them).
   - Expect 2k1's new Exit scenario, and perhaps an Apply one, to pass on top of that. It has never run.
   - On a failure: one Sonnet fixer, then the rebuild and a re-run.
4. **Then tell the user:**
   - reload VS Code (a new window is safer if Claude Code runs in it);
   - 2k1 plus the rebuilt `dist`/`out` are ready for them to commit.

### Step 5: write AP-46

Write AP-46 in the decisions log, for the user to read. Cover:
- the user's turn-27 decision: the Exit/Apply fix (the D2-n number is in the plan's §7.2, "USER DECISION (turn 27)");
- the 2k1 builder's and fixer's decisions, each with its alternative (from `subagent_reports/agents/build_2k1.md` and `fix_2k1_r1.md`; use `grep`, don't read them whole);
- the interruption of 2k2 and where its partial patch is;
- the results of Step 4.

### Step 6: slice 3, after the user's go-ahead and an estimate

- **Plans:** `verbatim_prompt_log/bundle_21/resume_kit/plans/slice3-plan.md` (359 KB, "FROZEN": Freeze/Unfreeze, the mechanical frozen-target check, reasons, unfreeze requests, the end, undo).
  - Its open items: `slice3_pending_items.md` and `slice3_open_after_ultra.json`.
  - Slices 4 and 5: `slice4-plan.md`, `slice5-plan.md` and `slices45_open_final.json`. The `.after_*` files are history.
- **First a pre-build refresh** of the slice-3 plan against the current code. Slice 2's 2e–2k1 changed a lot after that plan was frozen. Then move or copy the plan to `docs/slice3-plan.md`, cut it into sub-slices with briefs, and adapt `plan_extract.py` for it. It currently reads `docs/slice2-plan.md` and maps sub-slice ids to kinds.
- **Give the user a cost estimate before any of it** (STANDING_INSTRUCTIONS §D.1 and §D.9). A pre-build refresh plus a slice of slice-2 size is many millions of tokens. Offer cheaper shapes, e.g. one sub-slice at a time.
- **Build with the same chain** (§5).

### Step 7: 2k2, later

When the user asks for it:
- refresh `kit/briefs/2k2.md` against the code as it then is;
- decide with the user whether the partial patch is still worth comparing against;
- run it through the chain.

Until 2k2 lands, sessions are stored by folder path in VS Code's storage. Deleting and recreating a model folder that has an open session brings that session back, as happened with doorclose.

## 5. How the build chain works

`chain_2k.js` is the workflow script of turns 25–27. Use it as the template; on this machine its copy is in `$S` after Step 1.

- **The flow:**
  1. **Build:** one Opus builder per sub-slice. It reads `builder_rules.md`, its brief `briefs/<id>.md` and its plan extract.
  2. **Verify:** two Sonnet verifiers in parallel (`fc` and `adv`), sharing `briefs/verify_common.md`.
  3. **Fix:** up to 2 Sonnet fix rounds. A round is re-verified only if it fixed a blocker or major.
  4. **Integrate:** a Haiku integrator runs `recheck_full.sh <tag>` (about 45–60 min, in the background, waiting for `DONE` in `rcf_<tag>/summary.txt`), checks that HEAD is unchanged, nothing is staged and `dist`/`out` are untouched, then runs `savepatch2.sh after_slice_<id>`.
- **Sub-slices run one after another**, and the chain stops at the first failure.
- **If it stops:** read only that sub-slice's summary from `~/.claude/projects/<slug>/<session>/subagents/workflows/<run>/journal.jsonl`, with a small script.
- **Afterwards:**
  - `savewf.py <run-id> <bundle>/subagent_reports <script>` saves every agent's return for the log;
  - `wf_usage.py <start UTC>` gives the token table.
- **Briefs** carry the user's DESIGN, which beats the plan, plus pointers, the plan-update instructions, verification commands, mandatory **mutation checks** (break each key rule and show that a test fails), and the report format.
- **Builders cannot run the VS Code suites.** Those load the extension from `dist`/`out`, which only the orchestrator rebuilds, at the end.

## 6. Machine-specific values to refresh after Step 1

- **The HEAD id `4640902`:** `builder_rules.md` (its 2026-11-23 lines), `chain_2k.js` (the code lens and the integrator's checks), and the 2k2 brief. Use the new HEAD if the user has committed.
- **The `dist`/`out` timestamps** quoted in `chain_2k.js`'s integrator prompt ("dist at 2026-11-22 07:58:19.589394203 and out at 2026-11-22 07:58:20.063312842"). Take the new machine's from `stat -c %y packages/extension/dist packages/extension/out`.
- **The patch folder:** `savepatch2.sh` writes to `$PATCHES`, by default `bundle_27/evidence/patches`. Set `PATCHES=<repo>/verbatim_prompt_log/bundle_<N>/evidence/patches` for later turns, and say so in the briefs.
- **The ledger:** `ledger_disk.py` has a hard-coded start time (`time.strptime('…')`) and a list of folders to scan. `ledger_scan.py` has a `files =` line.
- **The time zone:** the old machine ran on UTC−8 and the user is on SGT (UTC+8). Check `date` here.
- **`recheck_full.sh`'s expected skip count** (1 opt-in real-Claude test plus the plan's `it.skip('moves to …')` placeholders) changes with the plan.
- **The RAM guard threshold** (1.5 GB) and the `capped.sh` caps (1500–14000 MB) assume 64 GB. Scale them down on a smaller machine.

## 7. What is in this package

```
bundle_27/handoff/
  START_HERE.md                this file
  STANDING_INSTRUCTIONS.md     the user's rules and quota guidelines
  install_kit.sh               installs kit/ into a new scratchpad, rewriting machine paths
  kit/scripts/                 capped.sh, recheck_full.sh, snapdiff2.sh, snapdiff2_core.sh, savepatch2.sh (takes $PATCHES),
                               plan_extract.py, chain_2k.js, builder_rules.md, wf_usage.py, savewf.py, build_interim.py,
                               ledger_disk.py, ledger_scan.py
  kit/briefs/                  2k1.md (done), 2k2.md (with the INTERRUPTED note), verify_common.md
  kit/final_checks/            run_specs.sh, run_vscode_smoke.sh, all.sh (output in $S/final_checks_2k)
  memory/                      the old session's memory notes, MEMORY.md is their index
bundle_27/evidence/patches/    after_slice_2k1.patch (19 files, against 4640902),
                               slice_2k2_partial_only.patch (48 files, patch -p1 on top of 2k1, unverified),
                               after_2k1_plus_2k2_partial.patch (60 files, both, against 4640902)
bundle_27/subagent_reports/    the 2k chain's agents (build, fc, adv, fix r1, integrate for 2k1) and workflow_script.js
bundle_27/RESUME_2k.md         the turn-27 resume notes, with the stop status
bundle_27/resume_kit/          the older subset of the kit (superseded by handoff/kit)
```
