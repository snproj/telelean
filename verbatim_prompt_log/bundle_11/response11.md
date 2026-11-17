## Steps 3 and 4: the real-Claude walkthrough

**Why it's needed.** Every M2 run so far used the *fake* backend, a script that plays Claude's part. Steps 3 and 4 are the first time your real Claude Code drives the system. They answer three questions:
- Does the CLI integration still work on your updated Claude Code?
- Does a real model follow the protocol (formalise, `freeze_statements`, then prove, using telelean's tools)?
- Does it pass the gate within 3 attempts, and does it ask the right pragmatics question?

**How it runs.** It runs on a **copy** of `mental_model/` in the scratch folder, so your files are never touched. The script `scripts/walkthrough-claude.mjs`:
1. copies the Spyro model;
2. runs one Lean refresh;
3. acts as you: it selects the three assumptions and the goal "Cynder would not be a good addition to the new Spyro game", and presses **These suffice**;
4. answers Claude's question about what "PG games cannot have characters with dark pasts" means. It gives one reading per run, and stops at the end.

It uses your Claude Code login with Opus 5.5 at high effort, capped at 80 turns, 25 checks and 20 minutes per run.

**Step 3, the normative reading:** "such characters are not good additions to PG games".
- Expected: Claude formalises it roughly as `∀ g c, IsPG g → HasDarkPast c → ¬ GoodAddition c g` and proves the goal in one step. The gate passes with the footprint *exactly* your three assumptions plus the two presuppositions ("characters exist", "games exist").
- The proposal turns the goal into a DERIVATION. After Accept, the copy refreshes to "proved".

**Step 4, the literal reading:** "PG games cannot *include* such characters".
- This doesn't entail the goal, since "can't be in the game" isn't "not a good addition". So the expected first round ends **not proved**, with a ghost premise such as "a character who cannot be in the game is not a good addition", plus a checked proof that it closes the gap.
- The script plays you pressing **I hold this**. The statements are then re-frozen, round 2 should be **proved**, and Accept follows.

**Cost:** both readings together come to about 30–55 requests: roughly 0.5–1.5M mostly-cached input tokens, 50–150k cache-write tokens and 20–60k output tokens, taking 10–30 minutes. I'd post this again right before starting.

**Side effects:**
- Claude Code saves these sessions' transcripts under `~/.claude/projects/…` and may add entries to `~/.claude.json`.
- The prompts sent to Anthropic contain the Spyro sample only.

**Recorded per reading:** the verdict of each round, any failed attempts, the questions and answers, ghosts, the final diff and statuses, token usage, and timing. It all goes into that turn's bundle as a walkthrough report.

## Step 7: the modifications audit

This is the audit you asked for at the start of turn 9: *everything I or my subagents modified, including installs and effectful commands that might have mutated files on this computer or on other computers*. Turn 9 isn't covered yet; the turn-2 audit covered turns 1–2. I'd use the same three-part method:

1. **From the transcripts.** Go through every command run during turn 9 by me and the ~54 subagents. Classify anything that wrote, deleted, installed, started background processes, touched git or systemd, or reached the network.
2. **From the disk, independently.** List files created or changed in the turn-9 time window (2026-11-01 10:18 to 2026-11-02 ~11:40) in your home folder, `/tmp` and `/var`, separating our effects from your apps'. This is harder now, because your own activity since then (including your git commit on Nov 5) has touched many files. So the transcript view is the primary source and the disk view is the cross-check.
3. **Other computers.** List all network effects: Claude Code's traffic to Anthropic, web reads, and any downloads. Confirm there were no pushes, uploads, messages or publishing.

A reconciliation step then checks each list against the other.

**Output:** a document like turn 2's `05_downloads_and_installs.md`. Every item gets its location, size, the agent responsible, whether it still exists, and an exact undo command; none would be run.

Items already known to go in: npm pruning its own debug logs, about 6.1 GB of scratch copies in `/tmp`, vitest caches in the repo, the transient systemd scopes (none left), and the Chrome and VS Code test isolation that kept your real config untouched.
