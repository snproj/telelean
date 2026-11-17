# telelean demo: your own example in 5 minutes

You type a few sentences as cards, select them, press **These suffice ▶**, answer Claude's questions, and get a checked result: **proved** (with a proposal to Accept) or **not proved** (with a suggested missing premise). The user guide (`docs/user-guide.md`, section 10) has the details.

## Before you start (once)

- telelean is installed from its folder (**Developer: Install Extension from Location…** → `/home/zhengyew/telelean/packages/extension`).
- The VS Code **Claude Code** extension is installed and logged in with your claude.ai subscription. A run uses your plan's usage; there is no API key.
- Lean's toolchain `v4.35.0` is in `~/.elan`, as for the board.
- You use your usual VS Code, the snap: on this Ubuntu, Lean's sandbox works only there (see *If something goes wrong*).

## The demo

1. **Load the current build.** A new window loads it: use **File → New Window** for the demo. (**Developer: Reload Window** does it too, but it also restarts everything running in that window, Claude Code included.)
2. **Open a fresh folder.** In that window, use **File → Open Folder…** and create a new empty folder, e.g. `~/telelean-demo/socrates`. If VS Code asks whether you trust the folder, answer **Yes** (telelean does not run in restricted mode).
3. **Initialize.** In the Command Palette (Ctrl+Shift+P), run **telelean: Initialize Model Here**. Pick the folder, keep or type a subject name (a capitalised name such as `Demo`), and answer **Initialize git** (this gives you history). The board opens and soon shows **Lean: up to date**. If it does not open, run **telelean: Open Board**.
4. **Type your cards** in the A|D|G box at the bottom of the board:
   - With **Assumption** chosen, type `All humans are mortal` and press Enter. Do the same for `Socrates is a human`.
   - Switch to **Goal**, type `Socrates is mortal`, and press Enter.
5. **Select.** Click the first assumption, then Ctrl+click the other assumptions and the goal. The tray reads `3 selected … ⊢ "Socrates is mortal"`.
6. **Press These suffice ▶.**
7. **Consent.** The first run in a folder asks **"Run Claude on this model?"** and says what is sent. Press **Run with Claude**.
8. **Watch the run panel** on the right. Its status line shows the state ("Working · formalising"), round, Lean checks, turns, Claude's working time, tokens and a cost estimate. Its count of output tokens is known to be far too low (user guide, 10.12); the cost estimate is Claude Code's own. **Cancel** stops the run at any time and writes nothing.
9. **Answer Claude's questions, if it asks any.** In the live Socrates and penguin runs it asked none; it listed its readings under "assumed without asking" in the review instead. Each question has a tag (e.g. *genericity*) and options with their consequences. You can also choose **In my own words**, **Leave it open** or **Decide for me**, and set **Remember for** (this run, these cards, or the whole subject). Then press **Send answer**. Claude's own guess appears only after you have answered.
10. **Review.** A banner says **Claude's proposal …**, and the board switches to **Proposed**, with marks on what changed. Step through the review in the panel:
    - **Statements:** your sentence beside its Lean (tick **Fully explicit** to see every detail).
    - **New vocabulary:** the types, predicates and constants Claude added.
    - **Definitions:** for example `Demo.Being.exists`, an *existence assumption* (there is at least one being) that comes with naming Socrates, shown with its Lean code. Each needs your **Yes, I endorse it** before Accept is possible.
    - **Result:** proved or not proved, what the proof rests on, Claude's summary, anything it assumed without asking, and suggested premises.
    - **Card changes:** "make the goal a Derivation" is ticked when it was proved.
11. **Decide.**
    - **Accept** writes exactly the checked files. Lean checks them again, and the goal moves to **Derivations** marked **proved**. One **Undo** reverts the whole Accept.
    - **Feedback…** starts a new round in the same session with your text (Ctrl+Enter sends it).
    - **Discard** writes nothing.
    - **Not proved?** Claude may suggest a premise: a translucent **Claude suggests** card marked **closes the gap (checked)**. Press **I hold this** (a reason is optional). A second round then proves the goal with it, and you can Accept.

## What to expect

- **Timings measured by the dry-run driver** (no Claude): the board opens about 3 s after Initialize. Lean's first check takes 2–3 s, or up to about 20 s on a busy machine. Each card takes about 1 s. Accept plus Lean's re-check takes 15–20 s.
- **Claude's part,** measured in live runs on 2026-11-10 with the defaults (Opus 5.5, effort high):

  | Example | Rounds | Requests | Cost estimate | Total time, from VS Code start to Lean's re-check |
  |---|---|---|---|---|
  | Socrates | 1, proved | 6 | ~$0.14 | ~52 s |
  | The penguin | 2: not proved, suggested premise, proved | 10 | ~$0.14 | ~76 s |

  The status line counts only Claude's working time, never the time it waits for your answer. Each round is capped at 20 minutes, 80 turns and 25 Lean checks.
- For a faster demo, set **telelean.effort** to `medium` in Settings, then reload the demo window (**Developer: Reload Window**).
- **What changes on disk:** after Accept, the Lean goes into `Model/<Subject>/Inbox.lean` (statements and the proof) and `Vocabulary.lean` (new vocabulary). Your answers are in `.telelean/subjects/<Subject>/decisions.json`. History lists *accept · These suffice → proved: …*.

## Tips for good simple examples

- **One idea per card.** Use one plain line each and 2–4 assumptions.
- **Same words for the same thing.** Use "human" in every card, not "human" in one and "person" in another. Otherwise Claude has to ask, or suggest a bridging premise.
- **One or two steps from the assumptions to the goal**, for example a syllogism, if-then, or a chain of "all … are …".
- **Ambiguity is the interesting part.** Generic sentences ("Birds fly"), "can't" and "or" make Claude ask, and your answer can change the result.
- **Leave out a premise on purpose** to see **not proved** with a suggested premise and **I hold this**.
- **Avoid arithmetic, time and probability.** telelean uses Lean's core only (no Mathlib).

Examples that work well:

| Assumptions | Goal | What it shows |
|---|---|---|
| All humans are mortal · Socrates is a human | Socrates is mortal | the classic. The dry run's scripted Claude asks whether "All" allows exceptions; live, Claude did not ask, read "All" strictly and said so under "assumed without asking" |
| If it rains, the street gets wet · It is raining | The street is wet | if-then |
| All cats are mammals · All mammals are animals · Tom is a cat | Tom is an animal | a two-step chain |
| Birds fly · Tweety is a bird | Tweety flies | "in general" vs "all": the answer matters |
| Socrates is a human | Socrates is mortal | not proved; Claude suggests the missing premise |

## If something goes wrong

- **"Not started: telelean sends nothing to Claude until you allow it"**: you pressed Cancel on the consent. Press These suffice again.
- **"Claude could not be started: …"**: Claude Code is missing, too old or not logged in. Fix that, or set `telelean.claude.path`, then reload.
- **The question is not visible**: click the **Claude** badge in the board's header.
- **telelean's commands are missing from the Command Palette**: the folder is open in Restricted Mode. telelean needs a trusted folder (Lean can run code while it compiles): run **Workspaces: Manage Workspace Trust** and trust the folder.
- **"Lean's sandbox is not available … bwrap cannot set up the sandbox here"**: this Ubuntu lets only some programs create user namespaces (AppArmor). The VS Code snap may; a VS Code started any other way (or a script from a plain terminal) may not.
- **To start over**: Initialize a new empty folder.

## The automated driver (for rehearsals)

`packages/extension/scripts/demo-driver.mjs` plays the whole demo in a separate, isolated VS Code window. It types the cards, selects them, presses These suffice, gives consent, answers the questions (your `--answer` specs, otherwise option 1), steps through the review, adopts a suggested premise, Accepts and waits for Lean. It then prints a JSON summary (also saved as `<work>/summary.json`) and saves screenshots to `<work>/screenshots/`.

```sh
cd /home/zhengyew/telelean
# No Claude: a scripted "Claude" formalises simple syllogisms (anything else as whole claims); about 40 s
node packages/extension/scripts/demo-driver.mjs --dry-run          # or: npm --prefix packages/extension run demo -- --dry-run
node packages/extension/scripts/demo-driver.mjs --dry-run --answer 2      # "in general": not proved, then I hold this
node packages/extension/scripts/demo-driver.mjs --dry-run --assume "Birds fly" --assume "Tweety is a bird" --goal "Tweety flies"
# The real UI path (palette, git dialog, consent dialog) without Claude; --vscode snap uses your own VS Code
node packages/extension/scripts/demo-driver.mjs --rehearse --vscode snap
# LIVE: spends subscription quota. It needs both opt-ins, and TELELEAN_NO_REAL_CLAUDE must be unset
TELELEAN_DEMO_LIVE=yes node packages/extension/scripts/demo-driver.mjs --live --vscode snap \
  --assume "All humans are mortal" --assume "Socrates is a human" --goal "Socrates is mortal" --answer 1
```

- **Options:** `--answer` takes `1`–`4`, `open`, `decide`, or `text:…` (one per question, in order). There are also `--answer-scope run|nodes|subject`, `--no-adopt`, `--end accept|discard`, `--model`, `--effort`, `--show` (show the window; the default is headless under xvfb), `--work-dir` and `--timeout-minutes`.
- **The summary** lists the verdict of each round, the questions with the answers given (and Claude's guesses), the suggested premises, the final Lean files, the cards' statuses after Accept, wall times and token usage.
- **The dry run** loads the extension in VS Code's Test mode, through `test/demo/agent.ts`. That mode never shows the git or consent dialogs and has no folder picker, so the agent answers those in advance. `--rehearse` and `--live` click them like a user.
- **A live run uses the real HOME**, because Claude Code's login lives there. VS Code's own profile and XDG folders stay in the work dir. Claude Code keeps its own session files under `~/.claude/` as usual. A live run cancels itself at the first rate-limit warning (unless `--continue-on-rate-warning`).
