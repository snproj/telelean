## Your question first: what was going on, and what "exploits" means for you

**What I was doing.** Steps 1–3, design only: no code written, nothing installed. The last stretch went on two rounds of independent review (7 reviewers, then 2 verifiers) and on fixing what they found in the documents.

**What the "exploits" are.** There are two kinds, both demonstrated by agents on your machine:
1. **A proof that looks valid but doesn't really follow from your assumptions.** An LLM asked to "prove the goal" can take shortcuts:
   - add its own axiom;
   - leave a `sorry`;
   - quietly weaken the goal statement;
   - tuck one of your beliefs into a definition or a vocabulary item, so it drops out of the assumption list.
2. **Lean code running on your computer.** Lean executes code while compiling (`#eval`), so Lean written by an LLM can write files, read your home folder or use the network when built. Separately, Claude's file tools could follow a symlink out of their working copy.

**How much it matters for a personal prototype:**
- **Kind 1 matters even for you alone.** It isn't security; it's whether the board tells the truth, i.e. whether "proved" really means "follows from the assumptions you selected". The checks are cheap (seconds per run) and stay in the prototype:
  - Lean's `#print axioms` must list only your selected assumptions;
  - no `sorry`;
  - the goal statement is unchanged from what you see in the review;
  - new definitions are shown to you for a yes/no.
- **Kind 2 mostly matters against a misbehaving model, or if you share the tool.** Claude isn't adversarial, so the prototype keeps only cheap precautions:
  - Claude has no shell and edits a copy of your model files;
  - you review a diff before anything is applied;
  - Lean builds run in a basic sandbox with a **memory cap**, which doubles as protection against the RAM crashes you mentioned.

  Everything deeper is moved to an **optional "hardening" milestone H**: symlink-proof file guards, D-Bus/keyring socket isolation, rules for exotic types, kernel replay, the exploit test suite. `02_design_decisions.md` now opens with a short **"Prototype profile"** saying exactly this, and `03_architecture.md` marks the deferred parts **[H]**.

If you'd like the documents trimmed further towards "minimal prototype", say so and I will.

---

## Where things stand

Steps 1–3 are done, and I've stopped there, as you asked: **nothing is installed and no code exists until you approve.**

All of it is in `verbatim_prompt_log/bundle_1/`:
- `user_requested_documents/`
  - `01_consolidated_idea.md` — Step 1: the idea consolidated; all 55 sentences traced verbatim (machine-checked), plus your 5 mid-turn messages.
  - `02_design_decisions.md` — Step 2: the prototype profile, then 34 decisions; the **★ ones need your call**.
  - `03_architecture.md` — Step 3: the architecture, software list and run directions.
- `subagent_reports/` — every subagent's full response, prompt and evidence; `DISPOSITIONS.md` files show what happened to each of the 85 + 38 review findings; Anthropic's policy pages are saved byte-exact.
- `prompt1_midturn.md`, `response1_interim.md`, `response1_modelinfo.md` — the logging you asked for: one bundle per turn.

**One finding worth knowing.** Your walkthrough hinges on a pragmatic question.
- Read literally ("PG games can't *include* such characters"), the three assumptions don't entail "Cynder would not be a good addition": a bridge premise is missing.
- Read normatively ("such characters aren't good additions"), the goal follows in one step.

So that becomes Claude's first clarifying question. Your own `~/telelean_scripts/cynder.lean` (read-only) reaches the same gap, and its "h1 is actually … superseding h1" step is now a first-class Refine action.

## ★ Decisions — reply "approve the ★ recommendations", plus any overrides by number

| # | Recommendation |
|---|---|
| D-1 | Beliefs as global `axiom`s, which give exact per-result assumption sets; countermodels are generated |
| D-2 | **Your S37 style**: `abbrev n : Prop := S` + `n.holds`. **No `sorry` in your files** |
| D-3 | Vocabulary is computed from Lean (no new markup type). (b) "Characters exist"-style presuppositions of the constants in your selected statements count automatically, and are shown |
| D-4 | Claude defaults to plain (uninterpreted) vocabulary; your records style on request; definitions need your yes/no |
| D-10 | Several subjects per project (your scripts folder has five) |
| D-13 | Arrows: declared by you (dashed) vs verified by Lean (solid). (b) Arrows within a column are allowed |
| D-16 | Prompt box exactly **A \| D \| G**; adding never calls Claude. Requests go through "These suffice" or "Ask Claude…" |
| D-17 | Click selects, chevron expands; changing a node's kind uses drop zones that preview the impact; in-board Undo |
| D-18 | Delete / suspend / **refine-supersede** / merge; every "These suffice" attempt is kept |
| D-19 | **One-shot**: one diff at the end (your S31), after an explicit statement freeze; the review shows meaning first |
| D-20 | Your answers to Claude's questions are kept in `.telelean/decisions.json` |
| D-23 | (a) Claude Agent SDK driving the unmodified Claude Code binary under your login; personal use only. **(b) May I spend a little quota on one smoke test? (yes/no; no answer = no)** |
| D-27 | **LSP: not now.** A core library + a `graph.json` snapshot for your scripts |
| D-29 | **M1** map without AI → **M2** one-shot "These suffice" = *start using* → M3 faithfulness → M4 integration (→ optional H) |
| D-31 | Headless tests: `sudo apt install xvfb` (or the installed Xephyr, or visible windows) |
| D-32 | What is `mental_model/graph_representation/` for? I'd make `mental_model/` the sample workspace |

## Software to install (no sudo, unless you choose xvfb)

1. **Node.js 24.22.2 LTS**: a user-local tarball, checksum-verified (command in 03 §12).
2. **Repo-local npm packages** (`npm ci`): TypeScript 6, esbuild, Vite, React 19, a drag-and-drop library, Shiki, `@anthropic-ai/claude-agent-sdk` 0.3.316 (brings its own ~330 MB Claude Code binary), vitest, Playwright (uses your Chrome), and the VS Code test tools.
3. **Auto-downloaded by tests**: the VS Code 1.140 test build (349 MB).
4. **Optional**: `xvfb`.

Already present and used: Lean 4.35, bubblewrap, `systemd-run`, git, Chrome. Not needed: socat, Docker, Mathlib.

## Housekeeping

- **Side effects of the research.** One agent accidentally added about 450 MB to `~/.cache/mathlib`, and agents added 28 scratch lines to `~/.elan/known-projects`. Targeted undo commands are in 03 §15 (not run).
- **Exploit probes made inert.** All 219 Lean experiment files in `subagent_reports/` are renamed `*.lean.txt`, so opening them never runs their probe code.
- **RAM.** The watchdog never fired; free memory stayed at 35–38 GB.

When you've answered the ★ items, I'll start M0 (spikes, plus the smoke test if you say yes), then build towards M2, and tell you as soon as it's usable, with directions.
