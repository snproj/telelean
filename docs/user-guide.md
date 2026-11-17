# telelean: user guide (M1 board, M2 Claude runs)

M1 is "the map without AI": a board of your ASSUMPTION / DERIVATION / GOAL cards, read from and written to Lean files, checked by Lean, with undo and git history. M2 adds one-shot **"These suffice"**: you select premises and a target, Claude formalises and proves in a private copy of your model, telelean checks the result with Lean and a fixed set of rules, and nothing reaches your files until you review the proposal and press **Accept** (section 10). Nothing calls Claude until you press "These suffice" and allow it.

**Status (2026-11-13).** Both are done. On 2026-11-10 M2 ran with the real Claude: the Spyro walkthrough (both readings) and two examples typed into fresh folders through this board, in your snap VS Code. All passed, at $0.14–$0.18 per run (Claude Code's estimate at API list prices) and under a minute and a half each (`docs/m2-live-report.md`). To try your own example in five minutes, follow `docs/DEMO.md`.

## 1. Start

1. **Load the new build.** You installed the extension in M0 with **Developer: Install Extension from Location…** (`/home/zhengyew/telelean/packages/extension`). That registration points at the folder, so the rebuilt `dist/` is used after **Developer: Reload Window**, or in any new window (**File → New Window**). Nothing to reinstall. If a Claude Code session runs in your window, prefer the new window: a reload restarts that session too.
2. **Open a folder that holds a model**, for example `/home/zhengyew/telelean` (it contains the sample `mental_model/`) or `mental_model/` itself. telelean starts by itself only in windows that contain a model (a `.telelean/config.json`); its commands work in any window. Untrusted and virtual workspaces are not supported: when VS Code asks whether you trust a folder's authors, answer **Yes**, or telelean's commands are missing (Restricted Mode).
3. **Use the VS Code snap** (the `code` you start normally). On this Ubuntu, Lean's sandbox (`bwrap`) may create its user namespaces only in programs that AppArmor allows, and the snap's VS Code is one of them. In a VS Code started any other way every Lean check fails ("Lean: off", "sandbox unavailable: …").
4. **Run `telelean: Open Board`** (Command Palette). With several models in the window it asks which one; with none it offers Initialize.

The sample `mental_model/` is your Spyro walkthrough as subject `Spyro`: three assumptions ("PG games cannot have characters with dark pasts" is comment-only with stance *rule*; "Cynder is a character who has a dark past" and "The new Spyro game is PG" are formalised) and one formalised, unproved goal ("Cynder would not be a good addition to the new Spyro game").

Opening the board builds the model with Lean in place: `mental_model/.lake/` and `.telelean/graph.json` appear (both gitignored).

## 2. Make a new model: `telelean: Initialize Model Here`

Run it from the Command Palette, or right-click a folder in the Explorer.

- **Empty folder:** it asks for the first subject's name (a Lean namespace such as `Spyro`; the default comes from the folder name) and writes the Lake project (`lakefile.toml` with `autoImplicit = false`, toolchain `v4.35.0`), `Model.lean`, `Model/<Subject>.lean`, `Model/<Subject>/{Vocabulary,Inbox,Main}.lean`, `.telelean/` and `.gitignore`.
- **Existing Lake project without dependencies:** it asks first, then only adds `.telelean/` and the missing `.gitignore` lines. Your Lean files are not changed.
- **Refused:** projects with Lake dependencies (Mathlib: M4), `lakefile.lean`-only projects (convert with `lake translate-config toml`), folders with other files but no lakefile.
- Then, if the folder is not inside a git repository, it offers `git init` for history (say no and history stays off; you can still accept later from the board).
- **A model folder that is already inside a git repository** (yours) gets history without being asked: opening its board writes "Initial state" snapshots there, as commits under private refs (`refs/telelean/…`; never a branch, never your staging area, never pushed). Section 9 says how to remove them.

## 3. The board

From top to bottom: the header (subject picker, History, Undo/Redo, Lean badge, Problems, legend), three columns (Assumptions, Derivations, Goals; each scrolls on its own), the selection tray, and the A|D|G box. The **Vocabulary group** is the first item of the Assumptions column, collapsed by default (click its heading to open it). **Problems** in the header lists the diagnostics of this subject. On a narrow board the columns keep a readable width and the board scrolls sideways.

**Keyboard.** Tab moves between cards and buttons; on a focused card, Enter expands it, Space adds it to the selection (or takes it out), F2 edits its sentence, Delete opens the delete dialog and **Alt+Up / Alt+Down** moves it up or down in its column. Opening a dropdown (subject picker, History, Problems, "uses:") moves the focus into it: Up/Down/Home/End move between its items, Escape or choosing an item gives the focus back to its button. Saving or cancelling an in-place edit gives the focus back to the card.

**Cards.** The face shows your sentence, "because: …" (your reason), the kind glyph **A**/**D**/**G**, status chips, and for formalised cards a "uses:" line. A glow (aura) means the card has a Lean statement. The chevron (or Enter on a focused card) expands it.

**Expanded card.** Lean code with **Copy** (puts exactly that code on the clipboard) and **Open in editor** (opens the file beside the board, never over it); problems; "Rests on" (the assumptions its proof uses) and "Presupposes" chips; "Depends on / Used by"; stance and source chips; **Make Assumption / Make Derivation / Make Goal**; **Edit**, **Add why / Edit why**, **Delete**.

**In the Lean code:** press and drag to select text (it never drags the card); hover an identifier for its gloss (or the card's sentence); click it to highlight the item in the Vocabulary group (or to reveal that card). Ctrl/Cmd+click is reserved for later.

**"uses:" line.** The vocabulary the card's statement uses, from Lean, two names inline ("HasDarkPast, cynder, …"); **▾ N** lists all of them with kinds and glosses, and picking one highlights it.

## 4. Every board action

| Action | How | What changes on disk |
|---|---|---|
| Add a card | A\|D\|G box: pick the kind, type one sentence, optionally a stance (Assumption), a why, a source (Assumption, Derivation); Enter or **Add** | a comment block in `Model/<S>/Inbox.lean` (your words verbatim; no Lean yet) |
| Edit the sentence | **Edit** in the expanded card, or F2; Enter saves, Esc cancels | the block's `natural_name:`; a docstring that repeated the old sentence follows it; a formalised card's binding is pinned (`lean:`) |
| Edit the reason | **Add why / Edit why**, or the "no reason yet" chip; empty removes it | `rationale:` |
| Stance, source | chips in the expanded card (click again to clear) | `stance:` / `source:` |
| Re-order | drag a card within its column | `.telelean/subjects/<S>/layout.json` only |
| Change kind | drag to another column (a panel shows what it does to the Lean), or **Make …** | `type:`, plus the D-11 Lean change below |
| Declare support and prove (M2) | select the premises and one goal (click; Ctrl/Cmd+click adds to the selection); the tray takes the goal as target (with several, pick it with ⊢); **These suffice ▶** declares exactly the selected premises (undoable, as in M1) and asks Claude to prove the target from them (section 10). If the target already declares premises you did not select, the tray says which ones it would drop and offers **Add to its premises ▶** instead; with only a target selected it offers **Self-evident?** (prove it from no premises; declares nothing) | `premises:` on the target; Claude's work only on Accept |
| Delete | **Delete** (or the Delete key); the dialog lists what refers to it on this board (premises, proofs, statements) and has the focus on **Cancel**; a formalised card offers **Delete card and its Lean code** or **Delete card only, keep Lean**. If other declarations use its Lean code (other cards' proofs, lemmas without a card, other subjects' proofs), telelean deletes nothing yet and asks again, listing them (cards by their sentence, another subject's card with "(subject …)", anything else by its Lean name): **Delete anyway** (they stop compiling and show Lean errors until you change them; Undo brings the code back), **Delete card only, keep Lean**, or **Cancel** | the block (and its Lean unless kept); theorem proofs go to `.telelean/subjects/<S>/attic/`. A card directly above it stays comment-only (a blank line keeps it from binding to what follows) |
| Undo / Redo | header buttons, Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y), or **Undo** on a toast: only the toast of the latest action offers it, and only while that action is still the one Undo would revert (after another action, an Undo or a Redo, no toast offers Undo; use the header) | the previous file contents; if you edited a file by hand since, only telelean's change is reversed (refused if that no longer applies) |
| Refresh Lean | click the Lean badge, or `telelean: Refresh Lean Check` | `.lake/`, `.telelean/graph.json` |

**Kind changes (D-11)** never rename a statement:
- Goal or Derivation → Assumption adds `axiom n.holds : n` (a theorem's proof is archived); a card without a reason asks "why do you hold it?" (optional).
- Assumption → Derivation keeps the axiom and shows **promotion pending** until you replace it with a proof by hand (`theorem n.holds : n := …`).
- → Goal removes `n.holds`. If proofs use it, a dialog lists them and you choose: **Rewrite them to take it as a hypothesis** `(h_n : n)` (needs fresh Lean facts; refused when a user is not a theorem), or **Keep them, marked broken** (they stop compiling and show it). If `n.holds` itself takes hypotheses (after an earlier rewrite), each use `(n.holds h)` becomes `h_n`.
- → Assumption on a proof that takes hypotheses (`theorem n.holds (h : a) : n`, "conditional on …"): the axiom states `n` directly, so the proofs that pass it arguments must change. The dialog explains this and lists them: **Rewrite them to use it directly** (each `(n.holds h)` becomes `n.holds`; needs fresh Lean facts), or **Keep them, marked broken**.
- Comment-only cards just change `type:`.
- The text on a drop zone or a **Make …** button comes from the board's cards alone ("No card on this board uses it"). Lemmas without a card and other subjects' proofs are checked when you confirm: if the change would break one of them, telelean asks before changing anything.

**Edits save files immediately**, including unsaved typing in that file. If a file changed after the board planned an edit, the edit is refused ("changed since"); try again.

**Undo/Redo** keep 100 steps per subject, in memory: they survive closing the board but not a window reload. If you edited a file by hand since, Undo may refuse ("use History to revert").

## 5. History (needs git)

- Open **History** in the header. Without a repository it offers **Initialize git** (asks first).
- Each change telelean makes is a snapshot under private refs (`refs/telelean/…`): your branches, staging area and hooks are never touched, nothing is pushed. Hand edits are snapshotted as "Manual edits" before telelean's next change. Re-ordering alone rides along with the next snapshot.
- Each entry shows time · action · label. **Preview** opens a read-only diff beside the board (tab title `History: <label> (<time>)`); **Revert to this** writes that state back to the subject's files (the current state is snapshotted first, and the revert can be undone). If that first snapshot fails (for example a leftover git `….lock` file), nothing is reverted and the message names the file to remove.
- A subject's history covers its `.lean` files, its `layout.json` and its attic. Other files you put in `.telelean/subjects/<S>/` are never snapshotted, reverted or deleted. Each linked git worktree (`git worktree add`) has its own history.
- The top line shows the disk the snapshots take (this subject · all subjects); **Keep last N** trims a subject's history. It asks first ("Drop 3 older snapshots of Spyro? This cannot be undone.") and is disabled when there is nothing to drop; git's own housekeeping frees the space later.

## 6. Subjects

The header's **subject: [Spyro ▾]** lists the subjects with their card counts. **New subject…** creates `Model/<Name>.lean` and `Model/<Name>/…` and adds `import Model.<Name>` to `Model.lean`; the board switches to it. A board shows one subject; ids are unique across subjects; Undo and History are per subject.

## 7. What the marks mean

**Lean badge:** "not checked yet", "checking…" (only while Lean runs), "up to date", "files changed" (cards show the last known status), "N errors" (see the problems list), "check failed" (the last check did not complete, e.g. it timed out or ran out of memory: hover the badge for why; cards keep their last known status), "paused: low memory", "syntactic mode" (the project is not on `leanprover/lean4:v4.35.0`, so cards come from the text only), "off" (switched off, a project with dependencies, or the sandbox is unavailable: the banner says which).

**Card chips:**

| Chip | Meaning |
|---|---|
| no Lean yet / λ Lean / Lean problem | comment-only / has a Lean statement / its statement or `.holds` is missing, broken or not `abbrev n : Prop := …` |
| assumed | taken as an axiom (on a goal: "asserted as an axiom: make it an Assumption?") |
| unproved | stated in Lean, no proof yet |
| ✓ proved | Lean checked the proof (hover: which assumptions it rests on); without ✓ Lean has not checked it |
| proved: make Derivation? / has a proof: make Derivation? | a proved goal / an assumption with a proof (click to change kind) |
| conditional on … | proved, but with unproved statements as hypotheses |
| promotion pending | a Derivation whose `.holds` is still an axiom |
| rests on a claimed node | its proof uses a pending Derivation |
| changed since last check / not checked by Lean | its file changed since Lean last checked it, so the other chips show the last known status (it reads "checking…" while Lean checks again) / Lean could not check it |
| uses sorry / missing .holds / .holds says something else | the proof has `sorry` / an assumption without `axiom n.holds : n` / `n.holds` states something other than `n` |
| self-evident / existence commitment | proved from no assumptions / the proof needs an existence assumption no statement mentions |
| definitional choice | the statement relies on a definition (needs your endorsement later, D-4) |
| broken | depends on something removed |
| no reason yet (no source yet for rules) | add a "because" (Problems shows the same as TL011) |
| you think this follows from those: prove it? | an assumption with declared support could be a Derivation |
| ⚠ N | problems that need attention (click to expand) |

**Arrows (see the legend):** declared (your premises), verified by Lean (the proof uses it), conditional (hollow head: taken as a hypothesis), mismatch (warning colour: declared but unused, or used but not declared), thin Lean-reference arrows on hover/selection.

**Vocabulary group:** the sorts, predicates, constants, functions, presuppositions ("assumes characters exist"), definitions and lemmas of the subject; "hidden assumption" marks a Prop axiom without a card. Items of another subject that this subject's cards use (through an explicit `import`) are listed too, under their full names (e.g. `Spyro.IsPG`), so their glosses show on hover.

## 8. Limits of the board (M1)

- (M1 alone had no AI; M2's runs and their limits are in sections 10 and 10.14.)
- No Lean-editor features (hover, completion, code lenses: M4) and no Mathlib or other Lake dependencies (M4).
- Only toolchain `v4.35.0` is checked by Lean; others get syntactic mode.
- Lean checks run only while the model's board is open: when it opens, after a save in VS Code, after telelean's own edits, when another program (a script, git, an agent) writes a Lean file of the model, and when you click the badge. The build runs in your model folder, so it can race your Lean extension on `.lake` (a redundant rebuild at worst; delete `.lake` if a build looks damaged).
- Undo is lost on window reload (History is not). History needs git.
- No drawing arrows by dragging; definitions are flagged, not endorsed.
- Settings (`telelean.*`: memory cap 4 GiB, pause below 2 GiB available, refresh on/off and delay, history on/off, git path) take effect after a window reload (open boards come back by themselves after the reload). The memory cap is lowered automatically when less memory is free, so a check stops at its own cap rather than straining the machine.
- Files telelean deletes (for example Undo of a new subject, or a Revert) go through VS Code, which moves them to the OS trash with its default settings.

## 9. Troubleshooting

- **The board stays empty / "Waiting for the extension to send the graph…":** check **View → Output → telelean** for the log, then close that board tab and run **telelean: Open Board** again. (Boards restored by a window reload or a restart now render by themselves.)
- **"telelean could not load the model…":** the message names the problem; fix it and run Open Board again (no reload needed).
- **"Lean: N errors":** expand the card with ⚠, or use the problems list; **Open in editor** jumps to the line.
- **"Lean paused: low memory":** close something, then click the badge (threshold: `telelean.memory.minAvailableGiB`).
- **"Lean: off" with "sandbox unavailable":** the check runs under `systemd-run --user` and `bwrap`; both must work for your user. If the reason says "setting up uid map: Permission denied" and that "this kernel lets only some programs create user namespaces", you are in a VS Code that AppArmor does not allow to create them: use the VS Code snap (section 1).
- **Undo refused ("changed since; use History to revert"):** you edited the file by hand; use **History → Revert to this**.
- **History says there is no repository:** **History → Initialize git**, or `git init` in the model folder yourself.
- **History refused a revert because of a `….lock` file:** a git process crashed earlier; when no git command is running, delete the file the message names and try again.
- **To stop using telelean in a folder:** delete its `.telelean/` folder (and `.lake/` if you like). Your Lean files stay as they are. The history snapshots stay in the git repository under `refs/telelean/` (no branch shows them); to remove them, run in the repository: `git for-each-ref --format='delete %(refname)' refs/telelean/ | git update-ref --stdin` (git frees the space at its next housekeeping).

## 10. Proving with Claude: "These suffice" (M2)

A run asks Claude to decide whether the target card follows from exactly the premises you selected. Claude works in a private copy of your model (never in your files): it formalises the cards that have no Lean yet, freezes the statements, proves, and says it is finished. telelean then checks the result itself, with Lean and fixed rules. You review a proposal on the board and decide: **Accept**, **Feedback** or **Discard**.

### 10.1 What you need

- **Claude Code**, logged in with your claude.ai subscription. telelean uses your own Claude Code (no API key): by default the binary of the VS Code Claude Code extension, else `claude` on the PATH, else `~/.local/bin/claude` (setting `telelean.claude.path` to choose one). Version 2.1.295 or newer.
- The model builds with toolchain `leanprover/lean4:v4.35.0` and has no Lake dependencies; the Lean sandbox works (as for M1's checks; on this machine only in the VS Code snap, section 1); enough free memory (`telelean.memory.minAvailableGiB`).
- **Your files must build.** Right after the run starts telelean builds your files once; Lean errors anywhere end the run before Claude is contacted ("your files have Lean errors (…); fix or save them, then start again").

### 10.2 Starting a run

1. On the board, click the premises, then Ctrl/Cmd+click the target (a Goal or a Derivation; an Assumption is something you hold: make it a Derivation first). The tray shows "premises ⊢ target".
2. Press **These suffice ▶** (exactly these premises), **Add to its premises ▶** (the target's declared premises plus the selected ones) or, with only the target selected, **Self-evident?** (no premises at all).
3. The first time in a model folder, telelean asks for your consent (10.3).
4. telelean checks the start before anything is sent ("preflight"): no other run of this model folder is active; the selection is valid; toolchain, sandbox and memory are fine (for the sandbox, telelean also runs `bwrap` once to see that it can set up its namespaces here); Claude Code is found. Any refusal changes nothing. Only then does it declare the selected premises on the target (`premises:`, M1's undoable action; skipped when they are already declared, and never for Self-evident?), make the private copy (it builds your files from scratch: a second or two for a small model; with `telelean.run.reuseLeanBuild` on it starts from your Lean build instead, but only when the board's last Lean check succeeded and nothing has written that build since, and Lake still rebuilds whatever in it does not match the run's files), build your files once, and start Claude Code. Claude Code itself checks before the first prompt that you are logged in with a claude.ai subscription; a refusal there costs no quota.

At most one run per model folder at a time. Closing the board does not stop a run: the header badge ("Claude: working on Spyro · 3/25 checks") shows it in any board of the folder.

### 10.3 Consent and what leaves the machine

Before the first run in a model folder telelean asks: *"Run Claude on this model? telelean sends this subject's cards (sentences, reasons, Lean statements), its vocabulary and your recorded answers, plus any model file Claude reads, to Anthropic through your Claude Code login (your claude.ai subscription; no API key)."* **Run with Claude** is remembered for that folder; **Cancel** starts nothing and is not remembered (you are asked again next time).

What is sent, through your Claude Code login: a fixed system prompt (the same text every run), the first message (the target, the selected premises and the subject's other cards with their sentences, reasons and Lean; the vocabulary; your earlier answers that are in force; the run's budget), every model file Claude reads in its copy (all subjects of the project are in the copy, so imports work), and every tool result (Lean check results, your answers, the check verdicts). Your Feedback text and your answers go as messages. telelean sends nothing else from your machine. Claude Code itself may also send its own usage telemetry and error reports, as it does in your other sessions: the switches that turn those off (`DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` for all non-essential traffic) are passed on to telelean's runs when VS Code was started with them.

What stays on your machine: each run's directory in VS Code's storage for telelean (`~/.config/Code/User/globalStorage/telelean.telelean/runs/…`: Claude's working copy, its Lean build, its git history, `run.json` and `session/transcript.jsonl`, the exact text of every message and tool call). The newest `telelean.run.keepRuns` (10) finished runs per model folder are kept. Claude Code also keeps its own transcript of each session under `~/.claude/projects/` (that is how a session is resumed); telelean never reads it.

### 10.4 The run panel

The panel opens beside the board when a run starts (below the board on a narrow board); the header badge shows and hides it. Its status line: state and stage ("Working · formalising", "· proving", "Waiting for your answer", "Checking Claude's result", "Ready for review"), the round, Lean checks used (3/25), Claude's turns (12/80), Claude's working time (paused while a question waits for you), check attempts (1/3), tokens, the cost estimate and the usage-limit status. Below: **notices** (the check results, reverts, caps, machine problems), the **activity** feed (each check, freeze, suggestion; Claude's own words in italics with a "Claude" marker) and your answered questions. **Cancel** stops the run (10.11).

Everything Claude wrote (its messages, questions, summaries, suggested premises, glosses of new vocabulary) is shown in italics with a marker, never in the style of your own words.

### 10.5 Claude's questions

When a sentence can be read in ways that change the result (modality, genericity, scope, word sense, …), Claude asks first: up to three questions at a time, each with a tag ("modality"), its options with their plain consequences, **In my own words**, **Leave it open** and **Decide for me**, and a scope for your answer: **this run** (default), **these cards** or **the whole subject**. Send it with **Send answers**. Claude's own guess is shown only after you answered (it never reaches the board before). Claude's clock is paused while it waits for you.

Every answer is recorded in `.telelean/subjects/<S>/decisions.json`. Answers with the scope "the whole subject" (and "these cards", when the run involves them) are sent to later runs as "earlier answers in force". (Revoking an answer comes in M3.)

### 10.6 The checks, the notices and the retry loop

Claude must first **freeze** the statements: the target's Lean statement and those of the selected premises. Proofs are refused before the freeze, also a proof tucked inside a definition, an instance or a structure. When Claude says it is finished, telelean checks the result without Claude:

- only allowed Lean in what Claude wrote: no `sorry`, no `#eval` or other commands except `#check`/`#print`, no `set_option`, no metaprogramming, no imports from outside the project, no changes to the project files;
- the files build (each Lean job has a time and memory limit);
- the proof rests only on the selected premises, Lean's standard axioms, the vocabulary and the existence presuppositions of what the statements mention ("there is at least one character"): the **permitted set**, listed in the report; every lemma Claude adds is held to the same rule, also when it says "not proved", and so is a proof hidden in anything else it adds (a definition, an instance, or a structure field whose default value is a proof); an `example` Claude adds is refused outright, before or after the freeze (it is a proof without a name, so nothing could check what it rests on);
- the frozen statements are unchanged (Lean's comparator), your words and blocks are unchanged, declarations that existed before the run are unchanged, and the only new axioms are the `.holds` of selected assumptions Claude formalised and vocabulary of its own (an axiom written directly below a card's block would be that card's statement: it is refused, whatever its type);
- a card Claude formalises gets a real statement (`abbrev … : Prop := …`), whatever its kind; a selected Goal or Derivation that Claude proves in the run is a lemma like any other: its proof must rest on the selected premises too, and it never widens the permitted set (only proofs you already had count as yours);
- Lean must report on every declaration Claude adds, of any kind: one it cannot see (a `private` declaration) is refused, since nothing could be checked about it. Lean's index leaves out some declarations that mention no constant (such as `abbrev … : Prop := 2 + 2 = 4`, or a lemma over plain propositions); since 2026-11-10 telelean finds those in the source and checks them like the rest, where it used to refuse them;
- new vocabulary has the simple shape (sorts, predicates, constants, functions).

New **definitions** Claude introduces are never accepted silently: they become definition questions in the review. A premise Claude thinks is **missing** becomes a suggestion (10.9), never part of your files. Neither is a failure.

If the check fails, a notice says why, for example *"Attempt 1 didn't pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry."*, and Claude gets the exact failure and tries again. A statement written below a card with a blank line in between does not belong to the card (a card's Lean must follow its block directly); the notice then says *"it left a blank line between “…” and its Lean statement"*, and Claude is told to remove the blank line. After the last allowed attempt (`telelean.run.maxGateAttempts`, 3 per round) telelean stops it and tells you, for example *"Claude's attempts didn't pass the checks 3 times: … telelean reverted its working copy to “Statements frozen (round 1)”."*: the proposal then shows the last state that passed (often the formalisation without a proof), which you can still accept, answer with Feedback, or discard.

More rules of the loop: edits Claude makes after its check passed are discarded (the proposal is always exactly the checked files); a turn that ends without finishing gets one reminder, then the round ends the same way as after the last attempt; reaching a cap (10.12) does too. Problems of the machine (the sandbox could not start, low memory) are not Claude's fault and are not counted: telelean tries the check once more after 30 seconds, and if it fails again the run ends as failed with the reason.

### 10.7 The proposal on the board

When a round ends, the banner reads "Claude's proposal: 1 new · 2 changed · +1 vocabulary" with **Current | Proposed**, **Review…**, **Accept**, **Feedback**, **Discard** and **Raw Lean diff…**. The board switches to **Proposed**: the subject as it would be after Accept, with diff marks on the cards ("+new", "~changed", "−removed": a glyph, a word, a colour and a halo; hover for what changed), and the vocabulary group opened with "+N new". The proposed view is read-only; **Current** shows your files as they are.

Until you have looked at the statements in the review, the target's result stays hidden ("result after the review"): meaning before proof status. **Show result** reveals it early. **Raw Lean diff…** opens the file changes beside the board (read-only; tab "Raw Lean diff: Spyro (round 1)"; per file from the report card).

### 10.8 The review

The review in the run panel goes step by step:

1. **Statements**: each new or changed statement, your sentence beside its Lean. **Fully explicit** shows every name in full and `Not (…)` instead of `¬`; the closure lists the names the statement uses, with glosses. **Show on the board** highlights the card.
2. **New vocabulary**: the sorts, predicates and constants Claude added. **Revoke…** prefills Feedback.
3. **Definitions**: each definition Claude introduced, with its code and the statements that rely on it. Each needs **Yes** before Accept is possible; **No** prefills Feedback. A new existence assumption is one of them: on a fresh model each new sort comes with one, for example `Being.exists` ("there is at least one being"), which naming Socrates takes for granted.
4. **Result**: the report card: the verdict, the footprint (the cards and presuppositions the proof rests on, e.g. "assumes characters exist"), unused premises, "self-evident" when it needed no premise, **consistency unchecked** (checking that your assumptions do not contradict each other comes in M3), Claude's summary and the gap it reports, every choice Claude made without asking (each with **Ask me instead**, which prefills Feedback), the suggested premises, the check attempts (each failed check named in plain words, e.g. "what it rests on"; hover shows its step G0–G5), the changed files, usage and duration.
5. **Card changes**: for a proved Goal, "Make … a Derivation (Lean proved it from the selected premises; recommended)", ticked by default. Untick it to keep the card a Goal.

### 10.9 Suggested premises ("Claude suggests")

When the target does not follow, Claude may suggest a premise you might hold that closes the gap. It appears as a translucent **Claude suggests** card at the top of the Assumptions column (in the Proposed view, and in the report card): Claude's sentence in italics, its Lean statement, **closes the gap (checked)** (telelean checked in a scratch file that the suggestion, with your selected premises, proves the target) and, if so, **gives the goal on its own** (it may simply restate the goal).

**I hold this** (with an optional one-line reason) starts a new round: telelean writes the card into Claude's working copy as an Assumption right before the target (worded by Claude, with your reason), adds it to the target's declared premises (`premises:`, as "These suffice" declares the premises you selected; so after Accept the proof's arrows match the declared premises and no "uses … which the declared premises do not cover" warning appears), freezes the statements again with it selected, and Claude proves the target with it. The card and the declaration reach your files only if you then accept (the raw Lean diff shows both), and the card stays marked as Claude's wording (italics) until you edit its sentence. **No** declines it.

### 10.10 Accept, Feedback, Discard

- **Accept** applies exactly the checked files of the proposal (plus the ticked card changes) to your files, through M1's history: your hand edits are snapshotted first ("Manual edits"), then one history entry *"accept · These suffice → proved: …"* (*"Self-evident? → …"* for a run without premises; with "(+ Make Derivation)" or "(+ 1 adopted assumption)" when they apply), and **one Undo step reverts the whole Accept** (History → Revert works too). A proposal that changes no file (the review says "This round changed no file: Accept only records the outcome") is only recorded: the notice reads *"Recorded: … (no file changed)."*, and there is no history entry and no Undo step. Lean then checks your files and the board shows the real statuses (e.g. the target proved, in the Derivations column). A "not proved" round can be accepted too (its statements and vocabulary). If you changed model files while Claude worked, telelean puts Claude's changes on top of yours and checks the combination again (with your current files as the starting point) before applying it; an edit of yours within 3 lines of a change of Claude's counts as overlapping and Accept is refused (*"Your edits to Model/Spyro/Main.lean since the run started overlap Claude's; Discard, or undo those edits and Accept again."*). Cards you add with the A|D|G box, and reasons you write, change or remove, while Claude works do not count as overlapping: telelean puts them back by card id on top of Claude's changes, and the combination is checked as above. Any other edit near Claude's, a changed sentence above all, still does. Accept never writes anything but the model's Lean files of the proposal and never applies part of a proposal.
- **Feedback** (a text field; Ctrl+Enter sends) starts a new round in the same Claude session with fresh caps: Claude may revise the statements and must freeze them again before it can claim "proved". The proposal is withdrawn until the round ends.
- **Discard** ends the run; nothing is written to your files.

Each round is recorded in `.telelean/subjects/<S>/attempts.jsonl` (verdict, premises, footprint, Claude's summary, usage), with what you did with it. Like `decisions.json` it is written directly, never undone and not part of history snapshots or reverts; commit it with your own commits if you want to keep it.

### 10.11 Cancel, reload, resume

- **Cancel** (run panel, while the run starts or Claude works) stops Claude and the run's Lean jobs at once; nothing is written. The working copy and transcript stay until old runs are pruned. **Dismiss** removes an ended run from the panel.
- **Window reload or restart:** a waiting question or a proposal comes back as it was; answering a restored question resumes the same Claude session. A run that was working comes back as **interrupted** with **Resume** (continues the same session) and **Stop** (ends it like Discard; the toast says "Run stopped"). Nothing starts by itself after a reload. A Lean job the run had going when the window closed is stopped too.

### 10.12 Usage, quota and caps

The status line shows Claude's requests and tokens and Claude Code's own cost estimate ("$0.42 estimate": at API list prices; your subscription is not billed per token, but runs use your plan's usage). Its count of output tokens ("… out", also on the report card and in `attempts.jsonl`) is far too low: in the live runs of 2026-11-10 it showed 111–143 where Claude Code's own transcripts record 1,913–3,886. The requests, the other token counts and the cost estimate were right. When Claude Code reports a usage-limit status other than "allowed", a notice says so in plain words and local time, for example *"Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45."* Caps bound one round (the first round, each Feedback, each adopted suggestion): 80 turns, 25 Lean checks, 20 minutes of Claude's working time (waiting for you does not count), 120 seconds per Lean job, 3 check attempts. Reaching the turn or time cap stops Claude; the round ends with the last state that passed.

### 10.13 Settings

All take effect after a window reload (Developer: Reload Window), or in a new window. The live runs of 2026-11-10 used the defaults.

| Setting | Default | What it does |
|---|---|---|
| `telelean.model` | `claude-opus-5-5` | the Claude model of a run (Claude Code's `--model`; an alias such as `opus` works) |
| `telelean.effort` | `high` | low, medium, high, xhigh, max (Claude Code's `--effort`) |
| `telelean.claude.path` | empty (automatic) | the Claude Code executable; empty: the VS Code Claude Code extension's binary, then `claude` on the PATH, then `~/.local/bin/claude` |
| `telelean.run.maxTurns` | 80 | model responses per round (1–1000) |
| `telelean.run.maxChecks` | 25 | Lean checks per round (1–500; a check, a freeze and each suggested premise count one) |
| `telelean.run.maxAgentMinutes` | 20 | Claude's working minutes per round (1–240) |
| `telelean.run.leanJobSeconds` | 120 | time limit of each Lean job of a run (10–1800) |
| `telelean.run.maxGateAttempts` | 3 | check attempts per round before telelean stops Claude and reverts (1–10) |
| `telelean.run.keepRuns` | 10 | finished runs kept per model folder (1–100) |
| `telelean.run.contextScope` | `subject` | which other cards the first message lists: the whole subject, or `neighbourhood` (only cards the target's and premises' statements mention) |
| `telelean.run.reuseLeanBuild` | off | on: a run's private copy starts from your Lean build (`.lake/build`) instead of building from scratch, but only when the board's last Lean check succeeded and nothing (the Lean extension, a terminal) has written that build since; otherwise it builds from scratch anyway. Lake still rebuilds whatever in the copy does not match the run's files (for example a part another program wrote while that check ran) |

The memory settings of section 8 (`telelean.memory.*`) apply to a run's Lean jobs too.

### 10.14 Limits of M2

- One run per model folder at a time; targets are Goals and Derivations of the board's subject.
- Accept takes the whole proposal (no partial Accept); a definition is endorsed only by its "Yes" before Accept.
- No consistency check of your assumptions yet ("consistency unchecked", M3); no countermodels; the review is minimal (no back-translation or alignment check).
- Recorded answers cannot be revoked yet (M3); "Decide for me" lets Claude choose and say so.
- Lean 4 core only (no Mathlib, M4). The checks are a prototype profile for your own use, not hardened against a determined adversary (later: H).
- New vocabulary must have the simple shape (section 10.6): predicates and constants over Lean's built-in types, such as `age : Person → Nat` or `Even : Nat → Prop`, are refused. Use plain properties of things in examples; numerals inside a statement are fine.
- After Accept is refused because your edits overlap Claude's, Feedback does not help: it continues on Claude's working copy, which never moves onto your files.
- A run needs Claude Code logged in with a claude.ai subscription; runs use your plan's usage.
- The checks guarantee "proved from your premises *as Claude formalised them*", not that the formalisation means what you meant. In the live penguin example, "All birds can fly" read with no exceptions plus "All penguins are birds" proves "Tweety can fly". Read the statements in the review, and the list of what Claude assumed without asking.

### 10.15 Troubleshooting runs

- **"Not started: telelean sends nothing to Claude until you allow it"**: you pressed Cancel in the consent question; press These suffice again and choose **Run with Claude**.
- **"Claude could not be started: …"**: the message lists the places telelean looked for Claude Code, or says the version is too old or that Claude Code is not logged in with a claude.ai subscription. Install or update the Claude Code extension, or set `telelean.claude.path`, then reload.
- **"The run could not start: your files have Lean errors (…)"**: fix or save the files the message names (Problems on the board lists them), then start again.
- **"Claude is already working on …" / "…waiting for your review"**: one run per model folder; finish, cancel or discard the other one first (its badge is in the header).
- **"telelean could not run the checks (…); this is not Claude's fault"**: the sandbox or the memory guard stopped a Lean job twice; free memory or fix the sandbox, then start a new run.
- **"Lean's sandbox is not available, so telelean cannot check Claude's work: bwrap cannot set up the sandbox here (…)"**: the run was refused before anything was sent. On this machine it means you are not in the VS Code snap, the only VS Code that may create the sandbox's user namespaces (section 1).
- **telelean's commands are missing from the Command Palette**: the folder is open in Restricted Mode. Run **Workspaces: Manage Workspace Trust** and trust it.
- **Accept refused**: either your edits overlap Claude's (Discard, or undo those edits and Accept again; Feedback does not help here, because it continues on Claude's working copy) or Claude's changes no longer pass the checks on top of your current files (the message lists the findings).
- **To free disk space**: lower `telelean.run.keepRuns`, or delete old run folders under `~/.config/Code/User/globalStorage/telelean.telelean/runs/` while no run is active.
