# How to resume the telelean autopilot (turn 21) after the quota resets

Written 2026-11-20 19:15 SGT, when the user's weekly quota was at 96%. It resets on 21 Nov at 9 pm SGT. The build may stop in the middle of a sub-slice when the limit is hit. Nothing that was finished is lost:
- every finished sub-slice is saved as a patch;
- every plan, brief and orchestration script is copied in `resume_kit/`.

Follow the steps below in order. They also work from a fresh Claude Code session: read this file and `user_requested_documents/02_autopilot_decisions.md` (AP-1 to AP-35) first.

## Standing rules (the user's; unchanged)
- **Never** push, publish, upload, email or message anyone. Never change git state: no commit, stash, checkout, `git rm` or index changes. The user commits.
- Tests never call real Claude. Announce the quota cost before any real-Claude run.
- Watch RAM, and kill only your own processes.
- Log every user message verbatim in `verbatim_prompt_log/bundle_21/` (this session's bundle).
- **AP-34 (the user's decision):**
  - middle-ground verification (`chain_v4.js`);
  - **stop after slice 2** and ask before slices 3–5;
  - no further plan reviews for slices 3–5.
- **Quota:** report usage at milestones, and ask before large new spends. See the memory note `watch-subagent-quota`.

## State at this checkpoint
- **Slice 1:** done. It is installed in the user's extension (`packages/extension/dist` and `out`, built 2026-11-19 13:47; nothing has touched them since).
- **Slice 2, done and verified**, with patches in `evidence/patches/`:
  - 2a1, 2a2 (as built), 2a (the review pass over 2a1 and 2a2);
  - 2b1a, 2b1b, 2b2, 2c1, 2c2;
  - 2b3a (isolated probe), 2b3b (runner engine; `after_slice_2b3b.patch`, 18:37), **2d** (sessions, queues and steps; `after_slice_2d.patch`, 2026-11-20 22:35).
- **In flight:** **2e**. Chain v4 run `wf_3eac68c8-9de` started 2026-11-20 22:40; its 2e builder failed on the weekly limit at about 23:10. The run was RESUMED on 2026-11-21 at 21:25 SGT (task `wy263n0qq`), with an interruption note in `briefs/2e.md`. The interrupted builder's partial work is kept as `evidence/patches/wip_2e_interrupted.full.diff` (10 files).
- **Still to build:** 2e, 2f, 2g, 2h, 2i. Then:
  1. the final slice-2 checks;
  2. rebuild `dist` (AP-8);
  3. the AP log entries for 2b3a–2i;
  4. the report to the user;
  5. **stop** (AP-34) — but see AP-36: the user asked to use the quota fully, so continue into slice 3 (pre-build refresh, then the build) if quota remains.
- **Slices 3–5:** planned, and paused by the user. The latest plans are `resume_kit/plans/slice3-plan.md`, `slice4-plan.md` and `slice5-plan.md`. Their open items are `resume_kit/plans/slice3_pending_items.md`, `slices45_open_final.json` and `slice3_open_after_ultra.json`.

## Step 1: restore the scratch directory if it is gone
The scripts hard-code the scratch path. If it was wiped (for example by a reboot), recreate it:
```sh
S=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad
K=/home/zhengyew/telelean/verbatim_prompt_log/bundle_21/resume_kit
mkdir -p "$S/briefs" "$S/plans"
cp -n "$K"/scripts/* "$S"/
cp -n "$K"/briefs/* "$S"/briefs/
cp -n "$K"/plans/* "$S"/plans/
cp -n "$K"/carry/* "$S"/
chmod +x "$S"/*.sh "$S"/*.py
```

## Step 2: check whether a sub-slice was interrupted
```sh
cd /home/zhengyew/telelean
P=verbatim_prompt_log/bundle_21/evidence/patches
LAST=$(ls -t $P/after_slice_*.patch | head -1)    # the newest finished sub-slice
"$S"/snapdiff.sh /tmp/now.diff >/dev/null && cmp -s /tmp/now.diff "$LAST" && echo CLEAN || echo "PARTIAL WORK after $LAST"
git diff --cached --stat | wc -l    # must print 0
git log -1 --format=%h              # must print 187673d
```
- **CLEAN:** nothing was in flight. Start at the sub-slice after `$LAST` (Step 3).
- **PARTIAL WORK:** a builder or fixer was interrupted.
  1. Keep its work as evidence: `cp /tmp/now.diff $P/wip_<id>_interrupted.full.diff`.
  2. Resume that sub-slice. Add to `"$S"/briefs/<id>.md` a first paragraph: "A previous run of this sub-slice was interrupted by a usage limit. Its partial changes are in the working tree; the last finished state is `<LAST>`. First compare the tree with that patch, then finish the sub-slice, reusing what is right and redoing what is not."
  3. Verifiers isolate the sub-slice against `$LAST`, so they review all of its changes, the partial ones included.
- **Check the chain's journal too:** `~/.claude/projects/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/subagents/workflows/<run>/journal.jsonl`. An agent that ended on a usage-limit error returns nothing.
  - If a sub-slice's **verifiers** returned nothing, its integrator must not be trusted, even when it passed: re-run that sub-slice as review-only. Chain v4 accepts `{ "id": "<id>", "review": true, "reports": "<file with the builder's report>" }`.
  - If its **integrator** returned nothing, just run `"$S"/recheck_full.sh <id>`, then `"$S"/savepatch.sh after_slice_<id>` if everything passes.

## Step 3: restart the chain
In the same session, the Workflow tool can resume the run. Completed agents replay from cache, and the interrupted one runs again:
```
Workflow({ scriptPath: "<S>/chain_v4.js", resumeFromRunId: "wf_3eac68c8-9de" })
```
From a fresh session, start the chain anew, beginning with the next sub-slice to build:
```
Workflow({ scriptPath: "<S>/chain_v4.js",
           args: { ids: ["2e","2f","2g","2h","2i"],
                   carry: <the JSON array in resume_kit/carry/open_2d.json> } })
```
Drop the ids that are already done. Each sub-slice takes about 2.3M subagent tokens and about 2 hours. Real-Lean tests need 12 GB or more of free memory, or they skip themselves; `recheck_full.sh` now catches that (AP-35).

## Step 4: after 2i
1. **Final slice-2 checks.**
   - Build the webview into a scratch folder: `TELELEAN_WEBVIEW_OUT=<scratch>/webview-build`, then `vite build` from `packages/webview` (never into `dist`).
   - Run the Playwright specs one at a time against it: `TELELEAN_WEBVIEW_OUT=… capped.sh 3000 sh -c 'ulimit -c 0; node_modules/.bin/playwright test test/e2e/<spec>'`. Include the new `s2-review.spec.ts` and `s2-board.spec.ts` drafted by 2g and 2h.
   - Move `test-results` into scratch afterwards.
2. **Rebuild the user's extension (AP-8).** From `packages/webview`, run `vite build`. From `packages/extension`, run `node scripts/build.mjs`.
3. **Log the remaining sub-slices.** Add AP entries for 2b3a–2i. Collect each report's "Decisions for the orchestrator to log" from the chain journals.
4. **Report to the user, then STOP.** Slices 3–5 wait for their go-ahead (AP-34).

## Logging still to do for turn 21 (in `verbatim_prompt_log/bundle_21/`)
- `prompt21_midturn.md` is up to date through mid-turn message 13 and the AskUserQuestion answers. Message 14 (the quota message, 2026-11-20 11:10:28Z) is logged; add any later ones.
- `response21.md`: the final message. A checkpoint version exists: `response21_checkpoint.md`.
- `response21_interim.md`: generate it with `python3 -I "$S"/build_interim.py 21 2026-11-18T15:04:07.442Z response21_interim.md`, then add a note. The answers to mid-turn messages 5–7 were first written only in hidden reasoning; they were given visibly on 2026-11-19 at about 09:56Z.
- `response21_modelinfo.md`:
  - the workflow table from `python3 -I "$S"/wf_usage.py 2026-11-18T15:04:07.442Z`;
  - the ledger of outside effects: memory notes, scratch, transient systemd scopes, `node_modules/.vite-temp` writes, npm log rotation (AP-17), the `/tmp` cleanups, the dist rebuild;
  - the honest gaps: the quota is not visible to me, and neither is my own main-loop usage.
