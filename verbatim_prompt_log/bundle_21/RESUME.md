# How to resume the telelean autopilot (read this first, next session)

Last updated: 2026-11-21 21:45 SGT, by the session `20626c17-…`.

The user wants a **demo by the end of this week (around 28 Nov)**, and the limiting factor is the **weekly quota**, which reset on 21 Nov at 9 pm SGT. Every choice below serves that goal.

## ⚠ QUOTA OPTIMIZATIONS: the user's instructions (AP-38, 2026-11-21); follow them
1. **Scope: SLICE 2 ONLY, then STOP.**
   - Finish 2e, 2f, 2g, 2h and 2i, then the final checks and the rebuild of the installed extension, then report.
   - Do not start slice 3, 4 or 5, and do not review their plans. This replaces AP-36's "use the quota fully".
   - **Keep the rest of the quota** for the demo and the user's other work. telelean's Formalize runs call the user's own Claude CLI, so demo rehearsals cost quota. Keep a reserve of at least 10–15%, and never start a real-Claude run without announcing its cost.
2. **You are the "fresh session" the user chose.** Keep your own context small, because every turn re-reads it:
   - Don't read big files into context: the plan is 3,700 lines, and the agent reports and journals are large. Use scripts, `grep`, `head` and the summaries instead.
   - Keep wake-ups to a minimum. Do NOT arm the 30-minute RAM Monitor. Instead start one background guard that exits only when free memory is critical:
     ```sh
     until [ "$(awk '/MemAvailable/{print $2}' /proc/meminfo)" -lt 1572864 ]; do sleep 30; done; echo RAM CRITICAL
     ```
     Otherwise just wait for the workflow's completion notice.
   - Don't poll workflows. Don't write long status messages.
3. **Cheaper models for the checking roles.** `chain_v5.js` does this already:
   - builders stay on the session model (Opus);
   - verifiers, fixers and re-verifiers run on **Sonnet**;
   - the integrator runs on **Haiku**. It only runs `recheck_full.sh` and `savepatch.sh` and reads the summary.
4. **Plan extracts.** Each agent reads `<S>/extracts/plan_<id>.md` instead of the whole `docs/slice2-plan.md`: §0, the sub-slice's own §1 and §6 entries, the contract and design sections its kind of work needs, §7, and only the §8 entries that mention it.
   - `chain_v5.js` adds this reading rule to every prompt.
   - **Regenerate the extracts right before launching the chain:** `python3 -I <S>/plan_extract.py <id> <S>/extracts/plan_<id>.md`.
   - The chain cannot regenerate them between sub-slices, since workflow scripts cannot run commands. So later sub-slices miss only the newest §8 lines, which each builder appends. That is acceptable: each builder's report is passed to its verifiers. If a chain stops and is relaunched, regenerate first.
5. **Lighter checks for the UI sub-slices** (2g, 2h, 2i): one verifier (fidelity and code, plus a short safety pass) instead of two. Built into `chain_v5.js`.
   - The real-Lean runner suite still runs in every integrator check. It is a script, so it costs no quota.
   - The browser tests run once, at the end.
6. **Report the quota use** at the end: `python3 -I <S>/wf_usage.py 2026-11-21T13:20:00Z` gives the workflow token table. Ask before any large new spend: see the memory note `watch-subagent-quota`.
7. **Prompt logging is opt-in per session.** Ask the user whether to keep logging for the new session; turn 21's bundle is `verbatim_prompt_log/bundle_21/`.

## Standing rules (the user's; unchanged)
- **Never** push, publish, upload, email or message anyone. Never change git state: no commit, stash, checkout, `git rm` or index changes. HEAD must stay `187673d` with nothing staged; the user commits.
- Tests never call real Claude.
- Watch RAM. Kill only your own processes. The user runs other Lean work (`~/webring`) and a telelean run for `doorstuck`: leave them alone.
- Builders follow `<S>/builder_rules.md`. Every decision goes into `user_requested_documents/02_autopilot_decisions.md` (AP-n): AP-1 to AP-38 so far.

## State (2026-11-21 21:45 SGT)
- **Slice 1:** done. It is installed in the user's extension (`packages/extension/dist` and `out`, built 2026-11-19 13:47; nothing has touched them since).
- **Slice 2, done and verified**, with patches in `evidence/patches/`:
  - 2a1, 2a2, 2a (review);
  - 2b1a, 2b1b, 2b2, 2c1, 2c2;
  - 2b3a, 2b3b, **2d** (`after_slice_2d.patch`, 2026-11-20 22:35).
- **2e: partial work in the tree, no chain running.** Two runs of 2e were interrupted: one by the weekly limit (2026-11-20 ~23:10), and one on purpose to switch to these settings (2026-11-21 ~21:35).
  - The tree's state is saved as `evidence/patches/wip_2e_interrupted2.full.diff`.
  - `briefs/2e.md` starts with a note telling the builder to compare that work with `after_slice_2d.patch`, then finish 2e.
- **Still to do:**
  1. build 2e, 2f, 2g, 2h, 2i;
  2. the final slice-2 checks (Step 4);
  3. rebuild `dist`;
  4. the AP entries for 2b3a–2i;
  5. the report;
  6. STOP.
- **Slices 3–5:** planned, and not to be touched this week. Their plans are in `resume_kit/plans/`.

## Step 1: restore the scratch directory if it is gone
The scripts hard-code this scratch path:
```sh
S=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad
K=/home/zhengyew/telelean/verbatim_prompt_log/bundle_21/resume_kit
mkdir -p "$S/briefs" "$S/plans" "$S/extracts"
cp -n "$K"/scripts/* "$S"/
cp -n "$K"/briefs/* "$S"/briefs/
cp -n "$K"/plans/* "$S"/plans/
cp -n "$K"/extracts/* "$S"/extracts/
cp -n "$K"/carry/* "$S"/
chmod +x "$S"/*.sh "$S"/*.py
```

## Step 2: check the tree
```sh
cd /home/zhengyew/telelean
P=verbatim_prompt_log/bundle_21/evidence/patches
"$S"/snapdiff.sh /tmp/now.diff >/dev/null
cmp -s /tmp/now.diff $P/wip_2e_interrupted2.full.diff && echo "AS LEFT (2e partial work)" || echo "CHANGED since the checkpoint: look before building"
git diff --cached --stat | wc -l    # must print 0
git log -1 --format=%h              # must print 187673d
```

## Step 3: launch chain v5 from 2e
First regenerate the extracts:
```sh
for i in 2e 2f 2g 2h 2i; do python3 -I "$S"/plan_extract.py $i "$S"/extracts/plan_$i.md; done
```
Then use the Workflow tool:
```
Workflow({ scriptPath: "<S>/chain_v5.js",
           args: { ids: ["2e","2f","2g","2h","2i"],
                   carry: <the JSON array in <S>/open_2d.json, also in resume_kit/carry/open_2d.json> } })
```
- The chain moves leftover minor findings from each sub-slice into the next.
- It stops at the first failed check, or when blocker or major findings remain after two fix rounds. If it stops, read only that sub-slice's integrator or re-verifier summary from the journal, using a small script.
- **If the quota runs out mid-way,** come back to Step 2 after the reset, and add an "interrupted" note to that sub-slice's brief, as was done for 2e.
- **The skip check** (`recheck_full.sh`) expects 1 skipped runner test plus the plan's `it.skip('moves to …')` placeholders, and catches memory-induced skips (AP-35, AP-37).

## Step 4: after 2i
1. **Final slice-2 checks.**
   - Build the webview into scratch: from `packages/webview`, `TELELEAN_WEBVIEW_OUT=<S>/final-webview-build "$S"/capped.sh 1500 /home/zhengyew/telelean/node_modules/.bin/vite build`.
   - Run the Playwright specs **one at a time** against it: `TELELEAN_WEBVIEW_OUT=<S>/final-webview-build "$S"/capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test test/e2e/<spec>'`. Include `s2-review.spec.ts` and `s2-board.spec.ts`.
   - Move `packages/webview/test-results` into scratch afterwards.
   - **A failing spec:** fix it with one Sonnet agent, or mark it `test.fixme` with the reason and report it.
2. **Rebuild the user's extension (AP-8),** only after everything passes. From `packages/webview`, run `vite build`. From `packages/extension`, run `node scripts/build.mjs`.
3. **Log the remaining sub-slices.** Add AP entries for 2b3a–2i: collect "Decisions for the orchestrator to log" from the journals with a script, and summarise them briefly.
4. **Report to the user, then STOP.** Cover:
   - what works now, and a short demo script: which board to open, what to click, what Claude does;
   - the quota used;
   - slices 3–5, which wait for their go-ahead.

## Turn-21 logs (in `verbatim_prompt_log/bundle_21/`)
They were finalised at the end of turn 21 (see `response21.md`). The next session's work belongs to a new turn: ask the user about logging.
