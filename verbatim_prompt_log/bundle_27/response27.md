The package is ready: `verbatim_prompt_log/bundle_27/handoff/`. To start, tell the new session:

> Read verbatim_prompt_log/bundle_27/handoff/START_HERE.md and follow it.

**What's in it:**
- **`START_HERE.md`:** where things stand, what to set up on the new machine, and the next steps in order.
- **`STANDING_INSTRUCTIONS.md`:** all your standing rules, with your own words quoted where I have them. That covers safety and git, logging, how decisions are recorded, the downloads ledger, and the token-saving guidelines. The token-saving part also has estimates against actual costs, so the new session plans with realistic numbers.
- **`install_kit.sh` and `kit/`:** my scripts, the build-chain template, the builders' rules and the briefs (2k2's brief now says it was interrupted). The scripts hard-code this machine's paths, so the installer copies them into the new session's scratch folder with the paths rewritten. I tested it against a fake new-machine layout.
- **`memory/`:** copies of my memory notes, which live only on this machine. The installer can add them to the new session's memory.

**The next steps it gives:**
1. Run 2k1's final checks: the browser tests, the extension rebuild and the VS Code tests. It asks you first.
2. Log the 2k1 decisions as AP-46.
3. Slice 3: bring its plan up to date with today's code, after giving you a cost estimate.
4. 2k2 later, when you ask.

**Before you switch machines:**
- **Carry the uncommitted work over.** The working tree holds 2k1 (19 files), not yet committed, and `verbatim_prompt_log/bundle_27/` isn't tracked. Either copy the whole repo folder without `node_modules`, or commit both yourself first. If only 4640902 makes it across, the new session can restore 2k1 from its patch.
- **Setup on the new machine is yours to do,** since agents may not install anything:
  - `npm ci`;
  - Node 24.22+;
  - Lean 4.35.0 via elan;
  - bubblewrap, xvfb-run and Google Chrome;
  - the snap VS Code (for the VS Code tests);
  - the extension, via **Install Extension from Location…** → `packages/extension`.
  - `START_HERE.md` §3 has a checklist.
- **These stay on this machine** unless you copy them: `~/telelean-demos`, and telelean's old sessions in VS Code's storage (an old socrates session may still be open).

**Turn 27 totals:**
- **Tokens:** about 1.7 M subagent tokens: 1.2 M for 2k1 and 0.5 M for the interrupted 2k2. The main loop used about 0.12 M output tokens.
- **Downloads and installs:** none.
- **Writes outside the repo:** only my scratch folder, short-lived memory-cap scopes, and Claude Code's own housekeeping.
- **git:** HEAD is still 4640902 with nothing staged.

The logs are complete in `bundle_27/`, and I added the two missing turn-25 messages to `bundle_25/prompt25_midturn.md`.

**Still waiting on you:** the six questions in the live Q&A design note, and the go-ahead for slice 3.
