# Prompt given to the AP-41/42 draft agent (Sonnet)

You are drafting two entries for a decisions log that a non-specialist user reads (the user designed the project, a VS Code extension called telelean, and reads these entries to learn what was built and what was decided on their behalf). Write the draft to a file; do not edit anything else.

## Inputs (read these; all read-only)
1. Style reference — the existing log: /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md. Read lines 423-467 (entry AP-32, the model to copy: a "Done" list per sub-slice, "Caught by review and fixed (examples)", "Decisions you might notice") and lines 519-529 (AP-37, for brevity). Do not read the rest of the file.
2. The decisions to summarise: /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/decisions_2b3a-2i.md (52 KB; the "Decisions for the orchestrator to log" sections of every builder and fixer report for sub-slices 2b3a, 2b3b, 2d, 2e, 2f, 2g, 2h, 2i, verbatim).
3. What each sub-slice built: the FIRST 40 LINES ONLY of each builder report (the JSON file is one JSON string; decode it, e.g. `python3 -I -c "import json,sys;print('\n'.join(json.load(open(sys.argv[1])).splitlines()[:40]))" <file>`):
   - /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/subagent_reports/slice2_chain_v3_workflow/agents/build_2b3a.json
   - /home/zhengyew/telelean/verbatim_prompt_log/bundle_21/subagent_reports/slice2_chain_v4_part1_workflow/agents/build_2b3b.json and build_2d.json
   - /home/zhengyew/telelean/verbatim_prompt_log/bundle_22/subagent_reports/slice2_chain_v5_2e-2h_workflow/agents/build_2e.json, build_2f.json, build_2g.json, build_2h.json
   - /home/zhengyew/telelean/verbatim_prompt_log/bundle_22/subagent_reports/slice2_chain_v5_2i_workflow/agents/build_2i.json
4. What review caught: the verifier and re-verifier JSON files in the same agents/ folders (verify_*.json, reverify_*.json; each is an object with "summary" and "findings": [{id, severity, where, problem, ...}]). Use them to count findings by severity per sub-slice and to pick 4-6 telling examples of real problems caught and fixed (prefer blocker/major ones). Read only what you need; use small scripts rather than reading whole files.

## Facts to include as given (do not re-derive)
- Every sub-slice passed the full integrator check (5 typecheck configs; all unit suites; the real-Lean runner suite). Latest totals after 2i: core 1142 tests, webview 435, extension 216, runner 883 passed with 1 expected skip (the opt-in real-Claude test).
- 2h's first full check "failed" only because the runner suite (about 40 minutes on the new machine) hit an old 40-minute time cap; the cap was raised to 90 minutes and the re-run passed (this is already logged as AP-40, so just refer to it).
- A defect in core found by the 2e builder: core's review reducer treats an item that has no class in the stage judgement as if it had every badge, so an Undo that would restore an Accept (Undo of a Reject of an accepted item) is always refused with RV-7. 2e worked around it in the runner (`reviewState` in packages/runner/src/.../review.ts — check the exact path with grep, read-only); the proper fix belongs in core and is left for the user to decide. Give this its own short bullet group in the second entry.
- 2i's one leftover (F-F2, minor): for an old axiom's declared premises, the chip tooltip and details row name a card from another subject by its id, while the TL122 problem text names it by its sentence (the webview only holds the current board). Documented in the plan's §8, not changed.
- Under AP-38 (the user's decision), 2g, 2h and 2i had one verifier each; 2e and 2f had two (functional+adversarial); 2b3a had three; 2b3b and 2d two. Minor-only fix rounds were not re-verified (AP-34).

## What to write
Two entries, in the exact heading style of the log (`### AP-NN · Title`), numbered AP-41 and AP-42:
- `### AP-41 · Sub-slices 2b3a, 2b3b and 2d done (...)`: put a short phrase in the brackets saying what these three built (they are the runner/session side; take it from the builder reports).
- `### AP-42 · Sub-slices 2e, 2f, 2g, 2h and 2i done (...)`: likewise (the host and board UI side, plus 2i's cleanup).
Each entry: "Done" list (1-4 short sub-bullets per sub-slice, plain words, what the user can now do or what now holds), "Caught by review and fixed (examples)" (4-6 bullets), "Decisions you might notice" (only the decisions a user of the board would notice or might disagree with, at most 8 per entry, each one line plus its alternative in a few words; say that the full list with alternatives is in the plan's §8 under each builder's and fixer's entry, docs/slice2-plan.md). AP-42 also gets the core-defect bullet group and the F-F2 note.

Writing rules: short sentences; plain words; no internal jargon without a few words of explanation (finding ids like F-F2 may appear in brackets once); use the log's bullet style; keep each entry under about 55 lines. Do not invent anything: every claim must come from the inputs; if unsure, leave it out.

## Hard rules
- Write ONLY the file /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/ap41_42_draft.md. Do not modify any other file, do not run tests, builds, npm, npx or any git command that changes state (read-only `git grep`/`grep` is fine). Do not read credentials or anything under ~/.claude, ~/.config.
- Your final message: the path of the draft, its line count, and up to 5 lines on anything in the inputs you found contradictory or could not place.