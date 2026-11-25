# telelean: user guide (the board, Claude runs)

The board is "the map without AI": your **axioms** (what you hold) and **propositions** (what follows, or what you want to show), read from and written to Lean files, checked by Lean, with undo and git history. You draw the **arrows** that say what follows from what. **Formalize for dependencies** asks Claude to prove a proposition from exactly the arrows you selected: Claude formalises and proves in a private copy of your model, telelean checks the result with Lean and a fixed set of rules, and nothing reaches your files until you review its changes item by item and press **Apply** (section 10; slice 2 replaced M2's proposal and its Accept with the edit session). Nothing calls Claude until you press Formalize for dependencies and allow it.

**Status (2026-11-19).** M1 (the board) and M2 (Claude runs) are done. On 2026-11-10 M2 ran with the real Claude: the Spyro walkthrough (both readings) and two examples typed into fresh folders through the board, in your snap VS Code. All passed, at $0.14–$0.18 per run (Claude Code's estimate at API list prices) and under a minute and a half each (`docs/m2-live-report.md`). Slice 1 of spec v4 then rebuilt the board (next section); it has not run with the real Claude yet. `docs/DEMO.md` walks through an example of your own.

## What changed in slice 1 (spec v4, 2026-11-19)

Slice 1 builds the new board of [spec v4.1](../verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md) (clause IDs below refer to it). It was built on autopilot, as you asked: every choice made without you is in [the autopilot decision log](../verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md), and every detail decided while building it in `docs/slice1-plan.md` (section 8).

- **Two kinds.** AXIOM cards sit in the **AXIOMS column**; PROPOSITION cards sit on the **PROPOSITIONS canvas**, which you pan and zoom. Your files' `type: ASSUMPTION` is read as AXIOM, `DERIVATION` and `GOAL` as PROPOSITION, and never rewritten; telelean writes AXIOM or PROPOSITION whenever it writes a `type:` line (Terms, BD-1–BD-3).
- **You draw the arrows** (a card's handle, or "Draw arrows from the selection"), select them and delete them. "Follows from nothing" replaces "Self-evident?" (AR-1–AR-5).
- **A card's place is its kind.** **Move to axioms** (or dropping a proposition on the AXIOMS column) makes it an axiom; an arrow into an axiom makes it a proposition, "pending proof" until a run proves it (AR-6, AR-7).
- **Glows and bands.** The green glow means *established* (proved, resting only on axioms, presuppositions and definitions, with current facts); the band's ✓ means *these arrows suffice together*, as Lean checked (BD-6, BD-7).
- **The Context Menu section** under the toolbar replaces the tray; **Formalize for dependencies** replaces "These suffice" (CM-1–CM-5, ES-2). A right click opens the same actions at the pointer (CM-7).
- **During a run the board is read-only**, and Accept refuses when your files changed since the run started (ES-7, ES-9, UN-3).
- **Not in slice 1 yet:** the review list with an item per change and arrow items, and the session's own Undo (slice 2: see "What changed in slice 2" below); FROZEN (slice 3); the transform window (slice 4); references with `#` (slice 5).

## What changed in slice 2 (the edit session, 2026-11-21)

A run is now an **edit session** (spec v4 ES-1–ES-9, RV-1–RV-13, UN-1–UN-5): Claude's changes come as **review items** you decide one by one, Claude may add (and propose to remove) arrows, a missing premise is an **Add premise** item, several targets go in one session, and nothing reaches your files until **Apply**. M2's proposal, its banner, its step-by-step review, **Accept**, **Feedback**, **Discard** and the "I hold this" / "No" of suggested premises are gone (sections 10.7–10.14). On the board, a card's **Delete** now always removes its Lean code too: "Delete card only, keep Lean" is gone, because it left the card's `axiom ….holds` behind as an assumption no card shows (S9; section 4). Details and every choice made while building it: `docs/slice2-plan.md` (section 8).

## 1. Start

1. **Load the new build.** You installed the extension in M0 with **Developer: Install Extension from Location…** (`/home/zhengyew/telelean/packages/extension`). That registration points at the folder, so the rebuilt `dist/` is used after **Developer: Reload Window**, or in any new window (**File → New Window**). Nothing to reinstall. If a Claude Code session runs in your window, prefer the new window: a reload restarts that session too.
2. **Open a folder that holds a model**, for example `/home/zhengyew/telelean` (it contains the sample `mental_model/`) or `mental_model/` itself. telelean starts by itself only in windows that contain a model (a `.telelean/config.json`); its commands work in any window. Untrusted and virtual workspaces are not supported: when VS Code asks whether you trust a folder's authors, answer **Yes**, or telelean's commands are missing (Restricted Mode).
3. **Use the VS Code snap** (the `code` you start normally). On this Ubuntu, Lean's sandbox (`bwrap`) may create its user namespaces only in programs that AppArmor allows, and the snap's VS Code is one of them. In a VS Code started any other way every Lean check fails ("Lean: off", "sandbox unavailable: …").
4. **Run `telelean: Open Board`** (Command Palette). With several models in the window it asks which one; with none it offers Initialize.

The sample `mental_model/` is your Spyro walkthrough as subject `Spyro`: three axioms ("PG games cannot have characters with dark pasts" is comment-only with stance *rule*; "Cynder is a character who has a dark past" and "The new Spyro game is PG" are formalised) and one formalised, unproved proposition ("Cynder would not be a good addition to the new Spyro game"), with an arrow from each axiom into it.

Opening the board builds the model with Lean in place: `mental_model/.lake/` and `.telelean/graph.json` appear (both gitignored).

## 2. Make a new model: `telelean: Initialize Model Here`

Run it from the Command Palette, or right-click a folder in the Explorer.

- **Empty folder:** it asks for the first subject's name (a Lean namespace such as `Spyro`; the default comes from the folder name) and writes the Lake project (`lakefile.toml` with `autoImplicit = false`, toolchain `v4.35.0`), `Model.lean`, `Model/<Subject>.lean`, `Model/<Subject>/{Vocabulary,Inbox,Main}.lean`, `.telelean/` and `.gitignore`.
- **Existing Lake project without dependencies:** it asks first, then only adds `.telelean/` and the missing `.gitignore` lines. Your Lean files are not changed.
- **Refused:** projects with Lake dependencies (Mathlib: M4), `lakefile.lean`-only projects (convert with `lake translate-config toml`), folders with other files but no lakefile.
- Then, if the folder is not inside a git repository, it offers `git init` for history (say no and history stays off; you can still accept later from the board).
- **A model folder that is already inside a git repository** (yours) gets history without being asked: opening its board writes "Initial state" snapshots there, as commits under private refs (`refs/telelean/…`; never a branch, never your staging area, never pushed). Section 9 says how to remove them.

## 3. The board

From top to bottom: the header (subject picker, History, Undo/Redo, Lean badge, Problems, legend); the **Context Menu** section (one line: what is selected and what you can do with it, 3.4); the **Vocabulary and Definitions** band; the **AXIOMS** column on the left with the **PROPOSITIONS** canvas filling the rest; and the A|P box. **Problems** in the header lists the diagnostics of this subject. Nothing scrolls sideways: on a narrow board the AXIOMS column keeps a readable width and the canvas takes what is left.

**The Vocabulary and Definitions band** sits above the board, collapsed to one line that keeps its counts and flags, for example "Vocabulary 9 · 1 hidden assumption · Definitions 4 · 1 needs your endorsement". Click it to open its two columns: **Vocabulary** (sorts, predicates and relations, functions, constants, presuppositions, lemmas, unmarked axioms) and **Definitions** (`def`, `abbrev`, `structure`, `inductive`, `class`, `instance`), each scrolling on its own. Drag the divider below it (or focus the divider and press ↑/↓, Home/End) to give it more or less room; Enter or a double click restores the default. Opening, closing and the size are remembered for the board, not written to any file. The band is hidden when the subject has no vocabulary at all.

**The AXIOMS column** holds your axioms in your order: drag a card within the column, or press **Alt+Up / Alt+Down** on a focused card. Its header counts them and, on a second line, what is assumed outside the column: "also assumed: K pending claims, N existence assumptions, M hidden assumptions" (each links to its card or its Vocabulary item).

**Keyboard.** Tab moves between cards and buttons (the column first, then the canvas from top to bottom and left to right; the canvas follows the card that has the focus). On a focused card, Enter expands it, Space adds it to the selection (or takes it out), F2 edits its sentence, Delete removes the selected arrows and marks or, when none is selected, opens the card's delete dialog. Escape closes whatever is open, then clears the selection. Opening a dropdown (subject picker, History, Problems, "uses:") moves the focus into it: Up/Down/Home/End move between its items, Escape or choosing an item gives the focus back to its button. Saving or cancelling an in-place edit gives the focus back to the card.

**Cards.** The face shows your sentence, "because: …" (your reason), the kind glyph **A** or **P**, status chips, and for formalised cards a "uses:" line. A blue glow means the card has a Lean statement; a green glow means it is established (section 7). The chevron (or Enter on a focused card) expands it.

**Expanded card.** Lean code with **Copy** (puts exactly that code on the clipboard) and **Open in editor** (opens the file beside the board, never over it); problems; "Rests on" (the axioms its proof uses) and "Presupposes" chips; "Depends on / Used by"; its attempts (section 10); stance and source chips; its arrow actions (**Follows from nothing** or **Remove 'follows from nothing'**, **Select incoming arrows**, **Mark pending**; on an axiom whose `premises:` was written before v4, **Make it a proposition (pending)** and **Drop these arrows**); **Move to axioms** (propositions only); **Edit**, **Add why / Edit why**, **Delete**. On the canvas an expanded card opens over the cards below it, raised above them and the arrows, and nothing moves; the canvas clips it, so pan to see its lower part.

**In the Lean code:** press and drag to select text (it never drags the card); hover an identifier for its gloss (or the card's sentence); click it to highlight the item in the Vocabulary band (or to reveal that card). Ctrl/Cmd+click is reserved for later.

**"uses:" line.** The vocabulary the card's statement uses, from Lean, two names inline ("HasDarkPast, cynder, …"); **▾ N** lists all of them with kinds and glosses, and picking one highlights it.

### 3.1 The canvas

- **Zoom:** the mouse wheel zooms about the cursor (the point under it stays put); Ctrl+wheel, which is what a trackpad pinch sends, zooms faster. The range is 10 %–400 %. A trackpad's two-finger scroll cannot be told from a wheel, so it zooms too; on some Linux setups a pinch sends nothing at all, and the wheel, + and − still work.
- **Pan:** drag with the right mouse button. A right-drag only pans: it never selects anything or opens a menu.
- **Move a card:** drag it with the left button (when it is selected, the other selected propositions move with it); Escape puts it back. Its place is stored in the subject's `layout.json`, one Undo step ("Move: …"). Dropped on the AXIOMS column, it becomes an axiom instead (3.2).
- **Select several:** drag on empty canvas to draw a rectangle; it selects the cards and the arrows wholly inside it (Ctrl/Cmd adds them to the selection). A click on empty canvas clears the selection.
- **Keyboard,** with the canvas focused (click on it): **+** and **−** zoom about the middle, **0** shows every card (Fit all), the arrow keys pan (Shift: further). + − 0 work from a focused card on the canvas too.
- **Toolbar** (top right): zoom out, the zoom level, zoom in, **Fit all**, **Zoom to selection** (the selected propositions, up to 150 %), **Tidy layout** (places the selected propositions again, or all of them when none is selected, sources left of their targets, and stores their places: one Undo step).
- **Placement:** a card with no stored place is placed for you, sources left of their targets and no card over another. That placement is not written, so opening a board writes nothing. A new proposition from the A|P box goes next to the selected card (right of a proposition; level with an axiom), else in view, or where you chose **New proposition here**, and its place is stored in `layout.json` with the add, in the same Undo step ("Add proposition: …"). Moving cards and **Tidy layout** store places too. A kind change (Move to axioms; an arrow or "follows from nothing" that makes an axiom a proposition) and a delete drop the card's stored place.
- **Out of view:** an arrow into a card that is out of view stops at the canvas edge it leaves through; each edge has a badge ("◀ 2 linked", "▲ 1 linked" …) that pans to the nearest such card. In the AXIOMS column an arrow to a card scrolled out of view stops at the column's top or bottom, with "▲ n linked" / "▼ n linked" in its header and footer, which scroll the column.
- **Show on board** (and every other reveal: Problems, Depends on / Used by, a name in a proof) pans and zooms the canvas to the card, or scrolls the column to it.
- The view (pan and zoom) is not saved: a board is fitted to its cards when it first shows a subject.

### 3.2 Arrows

An arrow X → Y says that Y follows, at least in part, from X. Y is always a proposition; there is one arrow per pair, both ends are axiom or proposition cards (never vocabulary), and arrows stay within one subject. The arrows into a proposition are stored as its `premises:` line.

- **Draw an arrow:** hover a card, then drag the small circle at its right edge (its handle) to another card. A dotted arrow follows the pointer, and the card under it is outlined. Before you let go, a hint next to the pointer says what a release does: "Arrow into “…”"; into an axiom, what it becomes and how many cards lose their green glow; or why it cannot be drawn ("That arrow is drawn already.", or a cycle, named: "This arrow would make a cycle: X → Y → X."). Escape, or letting go anywhere else, cancels.
- **Several at once:** select the source cards (click, Ctrl/Cmd+click), right-click the target, and choose **Draw arrows from the selection**.
- **Into an axiom** (or marking an axiom "follows from nothing"): the axiom becomes a proposition and moves to the canvas. telelean always asks first, with what it becomes: an `axiom n.holds` stays, now **pending proof** (everything that uses it keeps building, and the cards that rest on it lose their green glow until it is proved, listed in the dialog); without a `.holds` it becomes an unproved proposition; with a proof it is a proved one.
- **Select arrows:** click an arrow (the clickable band is wider than the line), Ctrl/Cmd+click adds or removes one, **Select incoming arrows** on a card selects all the arrows into it, and the selection rectangle selects those inside it. Selected arrows are drawn thicker, in the focus colour. Selecting is allowed at any time, also during a run (the Proposed view, which is read-only, selects nothing).
- **Delete arrows:** press **Delete** with arrows (or ∅ marks) selected: they go in one Undo step ("Remove 2 arrows into …"). If a checked proof uses one, telelean asks first ("Remove an arrow that a proof uses?"), naming the proofs; after you remove it, the proof's use shows as a mismatch arrow (section 7). Delete never removes a card together with arrows: the card's delete dialog opens only when no arrow or mark is selected.
- **Cycles** over your arrows and the solid arrows of checked proofs are refused, with the cycle named. A cycle already in your files (written by hand, TL015) is shown, and blocks Formalize until you remove one of its arrows.
- **A proof's use you did not draw** (the warning colour, TL107) cannot be selected; its right-click menu offers **Draw this arrow**.
- **Follows from nothing:** a proposition with no arrows into it can be marked **Follows from nothing** (right-click menu, Context Menu section, or its details). It is stored as its own field, `follows_from: nothing`, and drawn as a short dotted arrow labelled **∅** into the card. You select the mark like an arrow (a click; Ctrl/Cmd adds), Delete removes it, and drawing an arrow into the card removes it too (Undo restores it). A proposition with neither arrows nor the mark has no stated basis yet: nothing can be formalised for it until you give it one.
- **Move to axioms:** on a proposition (right-click menu, Context Menu section, its details), or drag the card onto the AXIOMS column (it lands where you drop it). The column then says what the drop does, and a dialog shows it again before anything changes: the arrows and the "follows from nothing" mark it loses, that a proof becomes `axiom n.holds` (the proof is kept in the attic, and Undo restores it), how many cards will rest on it. One card at a time: dropping several selected propositions on the column is refused. An axiom cannot be dragged onto the canvas ("Draw an arrow into it to make it a proposition").
- **Mark pending:** a proposition with a Lean statement and no proof can be assumed until a run proves it: telelean adds `axiom n.holds : n`, and the card shows **pending proof**. Cards that rest on it are not established until it is proved.
- **Arrows written before v4** into an axiom (an axiom with a `premises:` line) are not drawn. The card's chip says "declared before v4: make it a proposition, or drop these arrows", and its tooltip names the cards those arrows come from; its details name them too ("Declared before v4 (not drawn): arrows from “…”"), then offer **Make it a proposition (pending)** (the arrows are drawn into it, and it becomes a pending proposition) and **Drop these arrows**. Problems lists the same cards (TL122).

### 3.3 The right-click menu

A right click without movement (under 4 px between press and release) opens, at the pointer, the actions for what is under it. That thing is selected first, unless it is already part of the selection; a right click on a card while other cards are selected keeps them selected (they are the sources of "Draw arrows from the selection"), and so does a right click on empty canvas.

- **A card:** "Draw arrows from the selection" (when other cards are selected), Follows from nothing or Remove 'follows from nothing', Select incoming arrows, Mark pending, Move to axioms; Show on board, Show/Hide details, Open in editor; Edit sentence, Add/Edit why, Delete….
- **An arrow you drew:** Formalize for dependencies (section 10), Remove arrow (or the whole selection), Select the arrows into “…”, Show “source”, Show “target”.
- **A ∅ mark:** Formalize for dependencies, Remove 'follows from nothing', Show on board.
- **Empty canvas:** **New proposition here** (the A|P box switches to Proposition and takes the focus; the card goes where you clicked), Fit all, Tidy layout.

Over a text field or selected text, VS Code's own menu (Cut, Copy, Paste) stays. Shift+F10 or the Menu key opens the menu of the focused card.

### 3.4 The Context Menu section

The line under the toolbar shows the actions for what is selected, so you never have to hunt for them. With nothing selected it reads "Select some items to see possible actions here." (on a board without cards, how to add the first one). Otherwise:

- **What is selected**, in one line: "3 arrows into “…”", "2 arrows into 2 propositions", "the "follows from nothing" mark of “…”", "“…”" (one card) or "3 cards". Hover it for every item, and for what the selected statements presuppose ("+ presupposes: assumes characters exist").
- **Formalize for dependencies**, a labelled button (section 10). When it cannot be pressed, the reason is beside it and on hover: "Select arrows, or a 'follows from nothing' mark." (cards alone are no question), "Select arrows into one card: several targets come with the review list.", "A run is active. …", "Waiting for the extension to write this card.", or a cycle: "This card is on a cycle of arrows (…): remove one arrow first." when a selected card lies on it, and "The arrows of this subject form a cycle (…): remove one arrow first." for a cycle anywhere else in the subject (any cycle of arrows blocks Formalize, named; a card that lists itself among its premises counts as one).
- **The other actions** as icons, their names on hover: Delete (the selected arrows and marks), and for one selected card its actions (Follows from nothing, Select incoming arrows, Mark pending, Move to axioms, Show on board, Open in editor). With several cards selected they are shown disabled ("Select one card for this action."). On a narrow window, those that do not fit go into the "…" menu.

## 4. Every board action

| Action | How | What changes on disk |
|---|---|---|
| Add a card | A\|P box: pick **Axiom** or **Proposition**, type one sentence, optionally a stance (axioms), a why and a source; Enter or **Add**. A proposition goes onto the canvas (3.1) | a comment block in `Model/<S>/Inbox.lean` (your words verbatim; no Lean yet; `type: AXIOM` or `PROPOSITION`); a proposition's place in `layout.json` |
| Edit the sentence | **Edit** in the expanded card, the right-click menu, or F2; Enter saves, Esc cancels | the block's `natural_name:`; a docstring that repeated the old sentence follows it; a formalised card's binding is pinned (`lean:`) |
| Edit the reason | **Add why / Edit why**, or the "no reason yet" chip; empty removes it | `rationale:` |
| Stance, source | chips in the expanded card (click again to clear) | `stance:` / `source:` |
| Re-order axioms | drag a card within the AXIOMS column, or Alt+Up / Alt+Down | `.telelean/subjects/<S>/layout.json` only |
| Move propositions | drag them on the canvas, or **Tidy layout** | `layout.json` only (their places) |
| Draw arrows | a card's handle, or **Draw arrows from the selection** (3.2) | the target's `premises:` (its `follows_from:` line goes); into an axiom also `type: PROPOSITION` |
| Remove arrows and marks | select them, **Delete** (3.2) | the targets' `premises:` and `follows_from:` lines |
| Follows from nothing | right-click menu, Context Menu section, or the card's details | `follows_from: nothing` (on an axiom also `type: PROPOSITION`) |
| Mark pending | right-click menu, Context Menu section, or the card's details | `axiom n.holds : n` after the statement |
| Move to axioms | right-click menu, Context Menu section, the card's details, or drop the card on the AXIOMS column | `type: AXIOM`, its `premises:` and `follows_from:` lines go, plus the D-11 Lean change below |
| Formalize for dependencies (M2) | select arrows into one or more propositions, or their ∅ marks, and press **Formalize for dependencies** (section 10) | nothing until you Apply the edit session (slice 2) |
| Delete | **Delete** (or the Delete key with no arrow selected); the dialog lists what refers to it on this board (arrows, proofs, statements) and has the focus on **Cancel**; a formalised card offers **Delete card and its Lean code** (a delete always takes the card's Lean with it: keeping it would leave `axiom ….holds` behind as an assumption no card shows, S9). If other declarations use its Lean code (other cards' proofs, lemmas without a card, other subjects' proofs), telelean deletes nothing yet and asks again ("Delete it anyway?"), listing them (cards by their sentence, another subject's card with "(subject …)", anything else by its Lean name): **Delete anyway** (they stop compiling and show Lean errors until you change them; Undo brings the code back) or **Cancel** | the block and its Lean; its arrows go from the other cards' `premises:`; theorem proofs go to `.telelean/subjects/<S>/attic/`; its entries in `layout.json` go. A card directly above it stays comment-only (a blank line keeps it from binding to what follows) |
| Undo / Redo | header buttons, Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y), or **Undo** on a toast: only the toast of the latest action offers it, and only while that action is still the one Undo would revert (after another action, an Undo or a Redo, no toast offers Undo; use the header) | the previous file contents; if you edited a file by hand since, only telelean's change is reversed (refused if that no longer applies) |
| Refresh Lean | click the Lean badge, or `telelean: Refresh Lean Check` | `.lake/`, `.telelean/graph.json` |

**Kind changes (D-11)** never rename a statement, and a `.holds` that others use is never removed before its replacement exists. Only you change a card's kind:
- **Move to axioms** (proposition → axiom) adds `axiom n.holds : n` (a theorem's proof is archived in the attic), and removes the card's incoming arrows and its "follows from nothing" mark; its outgoing arrows stay. Its dialog states this first and asks "why do you hold it?" (optional: **Skip** is fine; a reason the card already has is in the field).
- If its proof takes hypotheses (`theorem n.holds (h : a) : n`, "proved, given …"), the axiom states `n` directly, so the proofs that pass it arguments must change. The dialog explains this and lists them: **Rewrite them to use it directly** (each `(n.holds h)` becomes `n.holds`; needs fresh Lean facts), or **Keep them, marked broken**.
- **Axiom → proposition** happens only by drawing an arrow into the axiom or marking it "follows from nothing" (3.2): only `type:` changes, plus the arrows or the mark. Its `axiom n.holds` stays, marked **pending proof**, until a run proves it.
- Comment-only cards just change `type:`.
- The text on a drop zone, a menu entry or a dialog comes from the board's cards alone ("No card on this board uses it"). Lemmas without a card and other subjects' proofs are checked when you confirm: if the change would break one of them, telelean asks before changing anything.

**Edits save files immediately**, including unsaved typing in that file. If a file changed after the board planned an edit, the edit is refused ("changed since"); try again.

**Undo/Redo** keep 100 steps per subject, in memory: they survive closing the board but not a window reload. If you edited a file by hand since, Undo may refuse ("use History to revert").

## 5. History (needs git)

- Open **History** in the header. Without a repository it offers **Initialize git** (asks first).
- Each change telelean makes is a snapshot under private refs (`refs/telelean/…`): your branches, staging area and hooks are never touched, nothing is pushed. Hand edits are snapshotted as "Manual edits" before telelean's next change. Re-ordering and moving cards alone ride along with the next snapshot.
- Each entry shows time · action · label. **Preview** opens a read-only diff beside the board (tab title `History: <label> (<time>)`); **Revert to this** writes that state back to the subject's files (the current state is snapshotted first, and the revert can be undone). If that first snapshot fails (for example a leftover git `….lock` file), nothing is reverted and the message names the file to remove.
- A subject's history covers its `.lean` files, its `layout.json` and its attic. Other files you put in `.telelean/subjects/<S>/` are never snapshotted, reverted or deleted. Each linked git worktree (`git worktree add`) has its own history.
- The top line shows the disk the snapshots take (this subject · all subjects); **Keep last N** trims a subject's history. It asks first ("Drop 3 older snapshots of Spyro? This cannot be undone.") and is disabled when there is nothing to drop; git's own housekeeping frees the space later.

## 6. Subjects

The header's **subject: [Spyro ▾]** lists the subjects with their card counts. **New subject…** creates `Model/<Name>.lean` and `Model/<Name>/…` and adds `import Model.<Name>` to `Model.lean`; the board switches to it. A board shows one subject; ids are unique across subjects; Undo and History are per subject.

## 7. What the marks mean

**Lean badge:** "not checked yet", "checking…" (only while Lean runs), "up to date", "files changed" (cards show the last known status), "N errors" (see the problems list), "check failed" (the last check did not complete, e.g. it timed out or ran out of memory: hover the badge for why; cards keep their last known status), "paused: low memory", "syntactic mode" (the project is not on `leanprover/lean4:v4.35.0`, so cards come from the text only), "off" (switched off, a project with dependencies, or the sandbox is unavailable: the banner says which).

**Glows:** a **blue** glow means the card has a Lean statement. A **green** glow, with the chip "✓ established", means the proposition is established: its proof is checked by Lean, takes no hypothesis, uses no `sorry` and no hidden assumption, rests only on axiom cards, presuppositions and definitions (never on a pending proposition), no card it rests on has a `.holds` that states something else, and the facts of all of them are current. The green glow replaces the blue one. Axioms never glow green. Out-of-date facts dim the blue glow and never show the green one. In high contrast both glows are outlines.

**Card chips:**

| Chip | Meaning |
|---|---|
| no Lean yet / λ Lean / Lean problem | comment-only / has a Lean statement / its statement or `.holds` is missing, broken or not `abbrev n : Prop := …` |
| assumed | an axiom whose `.holds` is a Lean axiom |
| has a proof | an axiom whose `.holds` is a theorem (TL106); it never glows green |
| unproved | a proposition stated in Lean, with no proof yet |
| ✓ established | proved and established (the green glow, above) |
| proved, but rests on pending: … / proved, given: … / proved, but uses a hidden assumption | proved by Lean but not established, and why: its proof rests on a pending proposition, takes unproved statements as hypotheses (the hollow arrowheads), or rests on a Lean axiom that is no axiom card (TL103) |
| proved | proved by Lean, not established because facts it rests on are out of date (hover: why) |
| pending proof | a proposition whose `.holds` is still an axiom: assumed until a run proves it |
| follows from nothing | you marked it (3.2) |
| proved from nothing | proved from no card at all, and not marked "follows from nothing": check what the statement says |
| uses … in a way the arrows do not show | the proof relies on that card through something no arrow covers (TL123) |
| changed since last check / not checked by Lean | its file changed since Lean last checked it, so the other chips show the last known status (it reads "checking…" while Lean checks again) / Lean could not check it |
| uses sorry / missing .holds / .holds says something else | the proof has `sorry` / a formalised axiom without `axiom n.holds : n` / `n.holds` states something other than `n` |
| existence commitment | the proof needs an existence assumption no statement mentions |
| definitional choice | the statement relies on a definition (needs your endorsement later, D-4) |
| broken | depends on something removed |
| no reason yet (no source yet for rules) | add a "because" (Problems shows the same as TL011) |
| declared before v4: make it a proposition, or drop these arrows | an axiom with a `premises:` line from before v4 (3.2) |
| ⚠ N | problems that need attention (click to expand) |

**Arrows** (never told apart by colour alone; see the legend):
- **declared** (round dots): an arrow you drew;
- **verified by Lean** (solid): a checked proof of the target uses the source;
- **conditional** (hollow head): the proof takes the source as a hypothesis;
- **mismatch** (the warning colour, notched head): a proof uses a card you drew no arrow from (TL107; its right-click menu offers **Draw this arrow**);
- a dotted arrow into a proved card whose proof does not use it stays plain dotted, with the tooltip "Not used by the current proof": it is never removed for you, and it is not a warning;
- thin arrows, only while one end is hovered or selected: one statement mentions the other (not selectable);
- **∅**: the "follows from nothing" mark.

**The band:** when a proposition's proof is checked, a green bracket just left of the card binds the arrows its proof uses. **With ✓** (hover: "Together these suffice (checked by Lean) · consistency unchecked") every card the proof uses directly has an arrow, and the proof takes no hypothesis and no hidden assumption. Without ✓ the band is **open** (dashed) and its tooltip names what lies outside it, for example "also uses “…” (no arrow)", "given “…” (not proved)", "a hidden assumption", "computed from the source text only". The tooltip adds "also by definition: …" and "also presupposes: …" when they apply. The band says that these arrows suffice together; not that each one is needed, nor that your axioms are consistent. A proof from nothing puts the band on the card's ∅ mark. No band is drawn from out-of-date facts, and in the Proposed view a new result's band waits until the review reveals it. Which cards a proof uses directly is computed from Lean's elaborated proof, not from Claude's account, so a card used through a `simp` lemma or an instance still counts.

**Legend:** declared, verified by Lean, conditional, mismatch, formalised, established, these suffice together (the band), pending proof.

**Vocabulary band:** the sorts, predicates, constants, functions, presuppositions ("assumes characters exist"), definitions and lemmas of the subject; "hidden assumption" marks a Prop axiom without a card. Items of another subject that this subject's cards use (through an explicit `import`) are listed too, under their full names (e.g. `Spyro.IsPG`), so their glosses show on hover.

## 8. Limits of the board

- (Claude runs and their limits are in sections 10 and 10.14.)
- No Lean-editor features (hover, completion, code lenses: M4) and no Mathlib or other Lake dependencies (M4).
- Only toolchain `v4.35.0` is checked by Lean; others get syntactic mode.
- Lean checks run only while the model's board is open: when it opens, after a save in VS Code, after telelean's own edits, when another program (a script, git, an agent) writes a Lean file of the model, and when you click the badge. The build runs in your model folder, so it can race your Lean extension on `.lake` (a redundant rebuild at worst; delete `.lake` if a build looks damaged).
- Undo is lost on window reload (History is not). History needs git.
- Definitions are flagged, not endorsed.
- Not in slice 1 yet: freezing cards and arrows (slice 3), transforming cards (slice 4), references with `#` (slice 5); the review list and the session's own Undo come with slice 2.
- Settings (`telelean.*`: memory cap 4 GiB, pause below 2 GiB available, refresh on/off and delay, history on/off, git path) take effect after a window reload (open boards come back by themselves after the reload). The memory cap is lowered automatically when less memory is free, so a check stops at its own cap rather than straining the machine.
- Files telelean deletes (for example Undo of a new subject, or a Revert) go through VS Code, which moves them to the OS trash with its default settings.

## 9. Troubleshooting

- **The board stays empty / "Waiting for the extension to send the graph…":** check **View → Output → telelean** for the log, then close that board tab and run **telelean: Open Board** again. (Boards restored by a window reload or a restart now render by themselves.)
- **"telelean could not load the model…":** the message names the problem; fix it and run Open Board again (no reload needed).
- **"Lean: N errors":** expand the card with ⚠, or use the problems list; **Open in editor** jumps to the line.
- **"Lean paused: low memory":** close something, then click the badge (threshold: `telelean.memory.minAvailableGiB`).
- **"Lean: off" with "sandbox unavailable":** the check runs under `systemd-run --user` and `bwrap`; both must work for your user. If the reason says "setting up uid map: Permission denied" and that "this kernel lets only some programs create user namespaces", you are in a VS Code that AppArmor does not allow to create them: use the VS Code snap (section 1).
- **A card or an arrow cannot be changed, and the controls say "An edit session is active…":** a run of this model folder is active (section 10.4). Apply or exit its edit session, or wait for it to end.
- **I cannot see part of an expanded card:** the canvas clips it; pan (right-drag, or the arrow keys with the canvas focused) or zoom out.
- **Undo refused ("changed since; use History to revert"):** you edited the file by hand; use **History → Revert to this**.
- **History says there is no repository:** **History → Initialize git**, or `git init` in the model folder yourself.
- **History refused a revert because of a `….lock` file:** a git process crashed earlier; when no git command is running, delete the file the message names and try again.
- **To stop using telelean in a folder:** delete its `.telelean/` folder (and `.lake/` if you like). Your Lean files stay as they are. The history snapshots stay in the git repository under `refs/telelean/` (no branch shows them); to remove them, run in the repository: `git for-each-ref --format='delete %(refname)' refs/telelean/ | git update-ref --stdin` (git frees the space at its next housekeeping).

## 10. Proving with Claude: "Formalize for dependencies" (M2)

A run asks Claude to decide whether a proposition follows from exactly the arrows you selected into it. Claude works in a private copy of your model (never in your files): it formalises the cards that have no Lean yet, freezes the statements, proves, and says it is finished. telelean then checks the result itself, with Lean and fixed rules. Since slice 2 a run is an **edit session**: you review Claude's changes item by item (10.9), Submit what you declined for Claude to rework (10.13), and end the session with **Apply** (your files change, one Undo step) or **Exit** (nothing changes). (Slice 1 renamed M2's "These suffice": your arrows are the question now, and the run no longer writes `premises:`.)

### 10.1 What you need

- **Claude Code**, logged in with your claude.ai subscription. telelean uses your own Claude Code (no API key): by default the binary of the VS Code Claude Code extension, else `claude` on the PATH, else `~/.local/bin/claude` (setting `telelean.claude.path` to choose one). Version 2.1.295 or newer.
- The model builds with toolchain `leanprover/lean4:v4.35.0` and has no Lake dependencies; the Lean sandbox works (as for the board's checks; on this machine only in the VS Code snap, section 1); enough free memory (`telelean.memory.minAvailableGiB`).
- **Your files must build.** Right after the run starts telelean builds your files once; Lean errors anywhere end the run before Claude is contacted ("your files have Lean errors (…); fix or save them, then start again").

### 10.2 Starting a run

1. **Draw the arrows** into the proposition you want proved (3.2), if they are not there yet.
2. **Select the question:** the arrows into a proposition (click, Ctrl/Cmd+click, **Select incoming arrows** on the proposition, or the selection rectangle), or its ∅ mark ("follows from nothing": a proof from no premises at all). The Context Menu section reads, for example, "3 arrows into “Cynder would not be a good addition to …”". Selected cards add nothing to the question, and arrows you did not select are not part of it. **Several targets** (slice 2): arrows into several propositions (or their marks) are one request, one Claude step per target, **sources first**: a target that is the source of another target's arrow is proved before it, whatever order you selected them in ("Ask Claude to formalise the selected arrows and prove 2 targets, one step each, sources first").
3. Press **Formalize for dependencies** in the Context Menu section, or in the right-click menu of a selected arrow or mark. When it is disabled, the reason is beside it (3.4).
4. **A source that is not proved** (a proposition with neither a proof nor a pending claim) is asked about first, one at a time, unless it is a target of the same request (a chain: it is proved first): "“…” is not proved. Mark it pending (assumed until proved), or cancel?" **Mark pending and continue** adds its `axiom n.holds` (your own edit, one Undo step) before the run starts; **Cancel** starts nothing. A source without a Lean statement must be formalised and proved first: "“…” has no Lean statement and no proof yet: formalize and prove it first." When that source has drawn arrows (or its ∅ mark), **Select the arrows into “…” too** adds them to the selection and asks again, so it becomes a target of the same request. Axiom sources need no question.
5. The first time in a model folder, telelean asks for your consent (10.3).
6. telelean checks the start before anything is sent: no other run of this model folder is active; the target is a proposition; every selected premise is the source of an arrow drawn into it ("Draw the arrows first."); with no premises, the target is marked "follows from nothing" ("Select arrows into one card."); the subject has no cycle of arrows, whether or not a selected card lies on it (each refusal names the cycle); every proposition among the premises is proved or pending ("“…” is not proved: mark it pending first."); toolchain, sandbox and memory are fine (for the sandbox, telelean also runs `bwrap` once to see that it can set up its namespaces here); Claude Code is found. Any refusal changes nothing. Board edits you made just before pressing Formalize are applied first, so the run sees them. Then it makes the private copy (it builds your files from scratch: a second or two for a small model; with `telelean.run.reuseLeanBuild` on it starts from your Lean build instead, but only when the board's last Lean check succeeded and nothing has written that build since, and Lake still rebuilds whatever in it does not match the run's files), builds your files once, and starts Claude Code. Claude Code itself checks before the first prompt that you are logged in with a claude.ai subscription; a refusal there costs no quota.

At most one run per model folder at a time. Closing the board does not stop a run: the header badge ("Claude: working on Spyro · 3/25 checks") shows it in any board of the folder.

### 10.3 Consent and what leaves the machine

Before the first run in a model folder telelean asks: *"Run Claude on this model? telelean sends this subject's cards (sentences, reasons, Lean statements), its vocabulary and your recorded answers, plus any model file Claude reads, to Anthropic through your Claude Code login (your claude.ai subscription; no API key)."* **Run with Claude** is remembered for that folder, in the folder (`.telelean/runs/consent.json`, which names the folder); **Cancel** starts nothing and is not remembered (you are asked again next time).

What is sent, through your Claude Code login: a fixed system prompt (the same text every run), the first message (the target, the selected premises and the subject's other cards with their sentences, reasons and Lean; the vocabulary; your earlier answers that are in force; the run's budget), every model file Claude reads in its copy (all subjects of the project are in the copy, so imports work), and every tool result (Lean check results, your answers, the check verdicts). Your Feedback text and your answers go as messages. telelean sends nothing else from your machine. Claude Code itself may also send its own usage telemetry and error reports, as it does in your other sessions: the switches that turn those off (`DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` for all non-essential traffic) are passed on to telelean's runs when VS Code was started with them.

What stays on your machine, all of it inside your model folder: each run's directory, `.telelean/runs/<run id>/` (Claude's working copy, its Lean build, its git history, `run.json` and `session/transcript.jsonl`, the exact text of every message and tool call), and your consent, `.telelean/runs/consent.json`. The runs folder is ignored by git (it holds a `.gitignore` of its own, and Initialize adds `/.telelean/runs/` to the model's `.gitignore`), so it is never committed, shared or copied with a clone, and telelean never reacts to what changes in it. The newest `telelean.run.keepRuns` (10) finished runs are kept. Delete the model folder and all of it goes too; a new folder at the same path starts with no session and asks for your consent again. If you delete the folder while a session is open and make a new one at the same path, without reloading the window, the board shows that session as interrupted ("This run's folder no longer exists …") with only **Stop**, which writes nothing into the new folder. Outside the model folder: Claude Code's own transcript of each session under `~/.claude/projects/` (that is how a session is resumed; telelean never reads it), VS Code's list of the boards a window had open, and telelean's log in VS Code's logs. The history snapshots (`refs/telelean/…`) are in the git repository that holds the folder: its own `.git`, which goes with the folder, unless the folder sits inside a larger repository of yours. Then they stay in that repository, and a new folder at the same place in it finds the old history.

If you move, rename or copy a model folder, its runs go with it (the consent does not: it names the folder, so the copy or the renamed folder asks again). A run that was open in the folder's old place cannot go on in the new one (the same folder reached through a symlink counts as the same folder): the board shows it as interrupted, with a notice naming the folder it was started in, and offers only **Stop**, which ends it without changing your files or recording anything in this folder. Moved back, it can go on.

Runs and consents of telelean versions before this one were kept in VS Code's storage, `~/.config/Code/User/globalStorage/telelean.telelean/runs/` (and the consents in VS Code's own state). telelean no longer reads or deletes them: delete that `runs` folder by hand when no older telelean is running.

### 10.4 The run panel, and the board during a run

The panel opens beside the board when a run starts (below the board on a narrow board); the header badge shows and hides it. Its target line reads "Formalize for dependencies: “…” from 3 premises" (or "Follows from nothing?" for a mark). Its status line: state and stage ("Working · formalising", "· proving", "Waiting for your answer", "Checking Claude's result", "Ready for review"), the round, Lean checks used (3/25), Claude's turns (12/80), Claude's working time (paused while a question waits for you), check attempts (1/3), tokens, the cost estimate and the usage-limit status. Below: **notices** (the check results, reverts, caps, machine problems), the **activity** feed (each check, freeze, suggestion; Claude's own words in italics with a "Claude" marker) and your answered questions. **Cancel** stops the run (10.15).

Everything Claude wrote (its messages, questions, summaries, suggested premises, glosses of new vocabulary) is shown in italics with a marker, never in the style of your own words.

**While a run is active, the board cannot be edited** (spec v4 ES-9): from the moment you press Formalize until you Apply or Exit the session, or the run ends otherwise, and for every subject of the model folder (they share one Lean build). The A|P box, the arrow handles, Edit, Add why, Delete, Move to axioms, the arrow actions, the stance and source chips, moving cards, Undo, Redo and History's "Revert to this" are disabled, each with the reason "An edit session is active: the board can't be edited until you apply or exit it." on hover (a key such as Delete shows it as a toast). You can still look: select cards and arrows, expand cards, pan and zoom, copy, open in the editor, preview History. The run works on a base that never moves: your files as they were when it started (10.13).

### 10.5 Claude's questions

When a sentence can be read in ways that change the result (modality, genericity, scope, word sense, …), Claude asks first: up to three questions at a time, each with a tag ("modality"), its options with their plain consequences, **In my own words**, **Leave it open** and **Decide for me**, and a scope for your answer: **this run** (default), **these cards** or **the whole subject**. Send it with **Send answers**. Claude's own guess is shown only after you answered (it never reaches the board before). Claude's clock is paused while it waits for you.

Every answer is recorded in `.telelean/subjects/<S>/decisions.json`. Answers with the scope "the whole subject" (and "these cards", when the run involves them) are sent to later runs as "earlier answers in force". (Revoking an answer comes in M3.)

### 10.6 The checks, the notices and the retry loop

Claude must first **freeze** the statements: the target's Lean statement and those of the selected premises. Proofs are refused before the freeze, also a proof tucked inside a definition, an instance or a structure. When Claude says it is finished, telelean checks the result without Claude:

- only allowed Lean in what Claude wrote: no `sorry`, no `#eval` or other commands except `#check`/`#print`, no `set_option`, no metaprogramming, no imports from outside the project, no changes to the project files;
- the files build (each Lean job has a time and memory limit);
- the proof rests only on the selected premises, Lean's standard axioms, the vocabulary and the existence presuppositions of what the statements mention ("there is at least one character"): the **permitted set**, listed in the report; every lemma Claude adds is held to the same rule, also when it says "not proved", and so is a proof hidden in anything else it adds (a definition, an instance, or a structure field whose default value is a proof); an `example` Claude adds is refused outright, before or after the freeze (it is a proof without a name, so nothing could check what it rests on);
- **every card the proof uses directly is one of the arrows you selected** (spec v4.1 B.2): the proof may not reach another card, even one that is proved, except through a selected arrow ("The proof uses “…”, which is not one of the arrows you selected."); which cards it uses is read from Lean's elaborated proof;
- the frozen statements are unchanged (Lean's comparator), your words and blocks are unchanged, declarations that existed before the run are unchanged, and the only new axioms are the `.holds` of selected axioms Claude formalised and vocabulary of its own (an axiom written directly below a card's block would be that card's statement: it is refused, whatever its type);
- a card Claude formalises gets a real statement (`abbrev … : Prop := …`), whatever its kind;
- in a round that does not end in a proof, the target's `.holds` stays exactly as it was (a proof or a pending claim you had stays as it is);
- Lean must report on every declaration Claude adds, of any kind: one it cannot see (a `private` declaration) is refused, since nothing could be checked about it. Lean's index leaves out some declarations that mention no constant (such as `abbrev … : Prop := 2 + 2 = 4`, or a lemma over plain propositions); since 2026-11-10 telelean finds those in the source and checks them like the rest, where it used to refuse them;
- new vocabulary has the simple shape (sorts, predicates, constants, functions).

New **definitions** Claude introduces are never accepted silently: each is a Definitions item in the review list, which needs its own Accept (10.9). A premise Claude thinks is **missing** becomes an **Add premise** item (10.8, 10.9), never part of your files until you accept it and Apply. Neither is a failure. A card that already exists and that the proof would need gets an **Add arrow** item from it, or is named in the stage report's "What is missing" with **Select these arrows** (10.7).

If the check fails, a notice says why, for example *"Attempt 1 didn't pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry."*, and Claude gets the exact failure and tries again. A statement written below a card with a blank line in between does not belong to the card (a card's Lean must follow its block directly); the notice then says *"it left a blank line between “…” and its Lean statement"*, and Claude is told to remove the blank line. After the last allowed attempt (`telelean.run.maxGateAttempts`, 3 per round) telelean stops it and tells you, for example *"Claude's attempts didn't pass the checks 3 times: … telelean reverted its working copy to “Statements frozen (round 1)”."*: the stage then shows the last state that passed (often the formalisation without a proof), and the session bar says the step did not pass: you can decline, formalize again or exit (10.7).

More rules of the loop: edits Claude makes after its check passed are discarded (the stage is always exactly the checked files); a turn that ends without finishing gets one reminder, then the round ends the same way as after the last attempt; reaching a cap (10.16) does too. Problems of the machine (the sandbox could not start, low memory, or facts too incomplete to see which cards a proof uses) are not Claude's fault and are not counted: telelean tries the check once more after 30 seconds, and if it fails again the run ends as failed with the reason.

### 10.7 The edit session and its bar

When Claude's first step ends, the run becomes an **edit session** in review, and the **session bar** above the board (it replaced M2's proposal banner) reads, for example, "Edit session · Formalize for dependencies: “Cynder would not be a good addition to …” · Stage 1 · Review: 3 in review · 0 accepted · results after the review". It holds:

- **Current | Proposed**: the board shows your files (Current) or the session's working copy (Proposed, 10.8). The first stage switches the board to Proposed.
- **Raw Lean diff…**: the session's file changes beside the board (read-only). While the results are hidden it asks first, since the diff shows Claude's proofs: "The raw diff shows Claude's proofs: opening it shows the results (noted as seen early)."
- **Submit review** (10.13), disabled with its reason, written next to it (for example "3 items are still in review: decide them first."), and **Go to the first one**;
- **Exit session…** (10.13); while a step runs, **Cancel step** (with the steps queued after it: "Cancels this step and the N after it; Retry step runs them later."), and **Resume** after a reload; **Retry step** when a step was cancelled or failed;
- second lines when they apply: "Claude's step did not pass: …" (you can decline, formalize again or exit; nothing can be accepted until a later step passes), your files changed since the session started (Apply waits until they match again), "Re-checking the working copy…".

The run panel shows the session ("Edit session"): the **Inferences** (one line per target, "“T” ← 2 arrows", with its step's state: queued, running, ended, cancelled, failed, not run; never a verdict), Claude's questions, the **stage report** (each target's verdict, band and what it rests on, what is not needed and what is missing, with **Select these arrows**, and "consistency unchecked"; Claude's summary and what it **assumed without asking**, each with **Ask me instead**), "Since your last action: …", **the review list** (10.9) and its detail, and "Rejected in this session". The header badge reads "Edit session: review · Spyro" (never a verdict).

### 10.8 The Proposed view during a session

**Proposed** shows the session's working copy, from the session alone (nothing on it is worked out from your own board, so it can never tell a result early):

- **Card marks**: each card's review items as a glyph, a word and a status, never colour alone: "+ new · in review", "~ Formalize · accepted ✓", "− Delete · declined ✗". A click on a mark shows the item in the review list; Ctrl/Cmd+click selects it for a group decision.
- **Claude's arrows**, only while the results are shown: an arrow Claude **adds**, still in review, is translucent with a **+** badge at its middle (thin while the proof does not use it, solid once it does); accepted, it is dotted like your arrows, still with its **+** ("Claude's arrow, accepted: written to your files at Apply"). An arrow Claude would **remove** is your arrow, translucent and dotted, with a **−** badge. An accepted Remove and a declined Add are not drawn. In high contrast, translucency becomes a dashed line; the badges stay. A click on one of Claude's arrows still in review shows its item; it is never selected (so it is never part of a Formalize until you accept it). Its right-click menu offers **Accept**, **Decline…**, **Show its review item** and both ends.
- **"Claude suggests" cards**: the Add premise items (10.9) not written yet, translucent at the top of the AXIOMS column with a "+" arrow into their target and **Review it**; only while the results are shown. They are decided in the list.
- **The neutral chip** "result after the review" on every target while the results are hidden (10.10), in place of its proof status, band and glow.
- **Selecting works** as on the Current board (cards, your arrows, Claude's accepted arrows, ∅ marks, the selection rectangle), so you can Formalize during a stage (10.12) and decide items from the Context Menu section: with cards or items selected it adds "· 2 review items" and **Accept k of N** / **Decline…** (one group decision; the tooltip names what it leaves and why, for example a belief, which needs its own Accept).
- **Moving a card** is a session step (Undo in the session takes it back, 10.14); it reaches your files only with Apply. Drawing arrows, editing and Move to axioms stay off ("Arrows change only through review items and transforms."). **Open in editor** opens the card in your file ("Opens your file; Claude's version is in the raw diff"); a card that exists only in the session has none.
- The legend adds "proposed by Claude: + adds, − removes".

### 10.9 The review list

The list holds one **item** per change Claude made: a vocabulary term, a definition (declaration), a card it formalised ("Formalize …"), changed, added or deleted, an **Add arrow** or **Remove arrow**, an **Add premise** (a premise you might hold that closes a gap), and each target's **Result**. Items come in groups: the source cards, Vocabulary ("k of N accepted"), Definitions, the targets, other cards; within a card its own item, then its arrows and premises, then its Result. Every item comes after what it depends on.

- **Each row**: a checkbox, the status as a glyph and a word (● in review, ✓ accepted, ✗ declined, ↻ to be redone, – withdrawn), the label (your words in your style, Claude's in italics), badges such as **belief**, **changes what is proved**, **depends on N**.
- **To be redone** (↻): telelean sets it on an item when something it depends on is declined, or when its checks fail. The item says why, in its detail and as its row's tooltip: "↻ to be redone: it depends on …, declined Shaky" (one line per cause), or "↻ to be redone: telelean took it out: …". It counts as finished for the review: it does not keep the results hidden and does not block Submit review, and Claude proposes it again at Submit review. You cannot set it back to review by hand ("Claude redoes it at Submit review. To review it yourself now, set back to review what it depends on, or use Undo."): it comes back to review by itself, in the same step, when you set back to review what took it down (un-Shaky, un-reject, or an arrow you declined), unless something else still holds it, and Undo brings it back too. You can still decline it from the list (select its row, then **Decline…** or the **D** key); its own detail has no Decline button. Its detail offers **Note for Claude…**: type what Claude should know when it redoes the item and **Save** (Ctrl+Enter); a blank note clears it. The note shows in the detail, is one Undo step ("Note for Claude: …"), and goes to Claude at Submit review; it is dropped when the item comes back to review.
- **The detail** of the current item: a formalisation's sentence above its Lean (**Fully explicit** shows every name in full), a change field by field, an Add premise's sentence and why Claude needs it, an arrow's two cards and Claude's reason, a definition's code and the statements that rely on it, a Result's verdict, band, what it rests on and its proof.
- **Accept** and **Accept & next** decide the current item. A **belief** (a new axiom, definition or assumption) and a change to what is proved need **their own Accept**: a group Accept leaves them. An Accept waits for what the item depends on ("needs … first", with **Select them**). Accepting an Add premise asks how you hold it: **As an axiom (you hold it)** or **As a proposition, pending proof**, with an optional Why.
- **Groups**: select rows (Space, or **Select all in review**), then **Accept N** (it previews the rules: "Accept 4 of 6") or **Decline…**; after a group Accept a note lists what was left and why.
- **Keys** (outside text fields): ↑/↓, Home/End; Space selects; **A** accepts (Shift+A: Accept & next); **D** declines; Ctrl+Z / Ctrl+Shift+Z undo and redo in the session (10.14).
- A decision shows a spinner until telelean answers; what it then shows is the truth. If an item changed since you looked at it, the decision is refused: "“…” changed since you looked at it: look again."
- **When a decision affects others** (declining a formalisation that a result relies on, for example), telelean lists them first and asks: **Continue** or **Cancel**.

**While Claude works** (a step of Submit review, or the first queue): the list shows the stage as the step found it, **read-only**: every decision, Undo, Formalize and moving a card are disabled with "Claude's step is running: you can review when it ends." You can still browse the list, the details and the board, and **Cancel step** or **Exit** the session.

### 10.10 The stage reveal and Show results

Meaning before proof status (RV-6): while you have statement or belief items to decide in a stage, its **results are hidden**. Each Result is a neutral row ("◌ result after the review"), its arrows and premises are left out of the list, the targets show "result after the review", the stage report says "results after the review (M items to decide)", and nothing on the board or in the panel says whether a proof exists (the two outcomes look the same). Claude's words and activity are withheld too. Formalize waits ("The results are not shown yet: decide the statements, or show the results, first.").

The results are shown once you have decided every statement and belief item. **Show results** (in the stage report, a hidden Result's detail, or beside Formalize's reason) shows them earlier: every result of the stage, marked "you saw this result early" (permanent; Undo can take the step back). Opening the raw diff or **Show Claude's activity** counts as Show results, and asks first.

### 10.11 The decline options

Every decline takes an optional **Note for Claude**: choose an option, type the note if you want one, then press its button (**Decline (Reject)**, **Decline (Shaky)** or **Decline**; Ctrl+Enter). A group decline shares one note. Claude receives the notes at Submit review (and with the next step of a Formalize during the stage), and the item's detail shows its note.

- **An arrow item**: one **Decline**: the arrow is taken away at once; results that use it are redone. (The **D** key declines an arrow item at once, with no note; **Decline…** in the board's right-click menu opens the menu, with **Decline** chosen and its note field.)
- **A Result**: **Reject** keeps the previous proof (Claude may not offer this exact proof again); **Shaky** asks Claude to try again at Submit review.
- **Any other item**: **Reject** (the change is not made); **Shaky**: Claude reworks it at Submit review; **Transform…** is shown disabled (the transform window comes with a later slice). **Ask me instead** in the stage report opens Shaky with "Ask me about: …" prefilled.
- A hidden Result has no menu: show the results first.
- Declined items are listed under "Rejected in this session", with **Un-reject**.

### 10.12 Formalize during a stage

In the Proposed view, with the results shown, **Formalize for dependencies** asks Claude about more targets in the same session (a mid-stage Formalize: one more step per target, sources first). It is disabled, with the reason: while a step runs ("Claude's step is running: Formalize again when it ends."), while the results are hidden (with **Show results** beside it), in the end confirmation ("Back to review first."), on the Current view ("During a session, Formalize asks about the Proposed view: switch to Proposed."), while telelean re-checks the working copy, and during another subject's session. Claude's arrows count only once accepted ("Accept this arrow first."). During a session nothing can be marked pending: an unproved source is asked about as "“…” is not proved; during a session it can't be marked pending.", with **Select the arrows into “…” too** or **Cancel**.

### 10.13 Submit review, Apply and Exit

- **Submit review** ends the stage. With items declined Shaky or to be redone, it starts Claude's next steps for them (accepted items carry over), and the next stage comes back to you. It first asks, under the session bar: it says what it will do, offers a **Comment for Claude (optional)** for the whole review, and **Submit** or **Cancel**. Claude reads the comment first, and the next stage's report shows it ("Your comment at Submit review (stage 1): …"). With every item accepted or rejected it leads to the **end confirmation** at once (no Claude step, no comment). Submit seals the session's Undo (10.14).
- **The end confirmation** lists the changes (each a link), what was rejected and is not applied, the definitions and presuppositions you endorse, and runs a **final check** on exactly that state (build, the checks, a backstop). **Apply** is enabled once the check passed and your files still match the session's base; **Back to review** returns to the list; **Exit session…**.
- **Apply** writes the session's changes to your files as **one history entry and one Undo step** ("Applied: the session's changes are in your files. One Undo takes the whole session back."); a session that changes no file only records its outcome. Lean then checks your files and the board shows the real statuses.
- **If your files changed since the session started** (an edit in the editor, a git checkout), Apply stays disabled until they match again (undo those edits in the editor), or you exit. telelean never merges such changes (ES-7): the base never moves.
- **Exit session…** asks first: "Exit the edit session? This discards N accepted items and M items in review. Your files are not changed; your answers to Claude's questions stay recorded. Exit cannot be undone." Exit works at any time, also while Claude's step runs (it stops it).
- **Once the session has ended** (Apply or Exit), the run panel says how, as for any run that has ended, with **Dismiss**: the Apply line above ("Recorded: nothing in your files changed; …" when nothing in your files changed), or "You exited the edit session: your files were not changed. Your answers to Claude's questions stay recorded." The session bar and the review are gone, and the board shows your files again.

Each step is recorded in `.telelean/subjects/<S>/attempts.jsonl` (verdict, premises, footprint, Claude's summary, usage), with what became of it; the expanded card lists its attempts. Like `decisions.json` it is written directly, never undone and not part of history snapshots or reverts.

### 10.14 The two Undo stacks

During a session there are two Undo stacks, and Ctrl+Z, Ctrl+Shift+Z and the toolbar's Undo and Redo act on the one of the view you are in:

- **The session stack**, in the Proposed view or while the focus is in the review panel or the session bar: your review steps ("Undo: Accept: …", "Accept 3 items", "Decline: … (Reject)", "Back to review: …", "Show results", "Move: …", "Note for Claude: …"). Navigating, selecting, filters and opening details are not steps. Undo stops at Claude's step: "Undo stops at Claude's step: it has already acted on what came before. To change an earlier decision, set the item's status directly." While a step runs it is disabled with "Claude's step is running: you can review when it ends.". An Undo that affects other items asks first, as a decision does.
- **The board stack** (your files' edits, M1's Undo), on the Current view: it stays locked during a session: "Your files can't change during an edit session; Undo in the Proposed view undoes your review steps." After Apply, one board Undo takes the whole session back.

### 10.15 Cancel, reload, resume

- **Cancel** (run panel, while a run starts) stops Claude and the run's Lean jobs at once; nothing is written. In a session, **Cancel step** (session bar) stops the running step and keeps the session (its changes are taken back; **Retry step** runs it again). The working copy and transcript stay until old runs are pruned. **Dismiss** removes an ended run from the panel.
- **Window reload or restart:** a waiting question or the session comes back as it was; answering a restored question resumes the same Claude session. A step that was working comes back as **interrupted** with **Resume** (continues the same session), **Cancel step** and **Exit**. Nothing starts by itself after a reload. A Lean job the run had going when the window closed is stopped too. The board stays read-only until the session ends. A run started before slice 2 (an M2 proposal) becomes an edit session when its round ends; should that fail, **Stop** ends it.

### 10.16 Usage, quota and caps

The status line shows Claude's requests and tokens and Claude Code's own cost estimate ("$0.42 estimate": at API list prices; your subscription is not billed per token, but runs use your plan's usage). Its count of output tokens ("… out", also on the report card and in `attempts.jsonl`) is far too low: in the live runs of 2026-11-10 it showed 111–143 where Claude Code's own transcripts record 1,913–3,886. The requests, the other token counts and the cost estimate were right. When Claude Code reports a usage-limit status other than "allowed", a notice says so in plain words and local time, for example *"Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45."* Caps bound one step (each target's step, and each step Submit review starts): 80 turns, 25 Lean checks, 20 minutes of Claude's working time (waiting for you does not count), 120 seconds per Lean job, 3 check attempts. Reaching the turn or time cap stops Claude; the round ends with the last state that passed.

### 10.17 Settings

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

### 10.18 Limits of M2 and slices 1–2

- One run (session) per model folder at a time; its targets are propositions of the board's subject.
- While a session is active the whole model folder's boards are read-only (10.4); changes you want then wait until you apply or exit it.
- Transform (a third decline option) comes with a later slice; FROZEN with slice 3.
- No consistency check of your axioms yet ("consistency unchecked", M3); no countermodels; the review is minimal (no back-translation or alignment check).
- Recorded answers cannot be revoked yet (M3); "Decide for me" lets Claude choose and say so.
- Lean 4 core only (no Mathlib, M4). The checks are a prototype profile for your own use, not hardened against a determined adversary (later: H).
- New vocabulary must have the simple shape (section 10.6): predicates and constants over Lean's built-in types, such as `age : Person → Nat` or `Even : Nat → Prop`, are refused. Use plain properties of things in examples; numerals inside a statement are fine.
- A run needs Claude Code logged in with a claude.ai subscription; runs use your plan's usage.
- The checks guarantee "proved from your premises *as Claude formalised them*", not that the formalisation means what you meant. In the live penguin example, "All birds can fly" read with no exceptions plus "All penguins are birds" proves "Tweety can fly". Read the statements in the review, and the list of what Claude assumed without asking.

### 10.19 Troubleshooting runs

- **"Not started: telelean sends nothing to Claude until you allow it"**: you pressed Cancel in the consent question; press Formalize for dependencies again and choose **Run with Claude**.
- **Formalize for dependencies is disabled**: its reason is beside it (3.4). Cards alone are no question: select the arrows into the proposition (**Select incoming arrows** on it), or its ∅ mark.
- **"Draw the arrows first." / "“…” is not proved: mark it pending first."**: the host checked your question again on the files: draw the arrows you meant to select, or answer the "Mark it pending" question (10.2). During a session: "select the arrows into “…” too" (10.12).
- **"Claude could not be started: …"**: the message lists the places telelean looked for Claude Code, or says the version is too old or that Claude Code is not logged in with a claude.ai subscription. Install or update the Claude Code extension, or set `telelean.claude.path`, then reload.
- **"The run could not start: your files have Lean errors (…)"**: fix or save the files the message names (Problems on the board lists them), then start again.
- **"A run is active. Claude is already working on …" / "An edit session is waiting for your review: apply or exit it first."**: one run per model folder; finish, cancel, apply or exit the other one first (its badge is in the header).
- **"telelean could not run the checks (…); this is not Claude's fault"**: the sandbox or the memory guard stopped a Lean job twice; free memory or fix the sandbox, then start a new run.
- **"Lean's sandbox is not available, so telelean cannot check Claude's work: bwrap cannot set up the sandbox here (…)"**: the run was refused before anything was sent. On this machine it means you are not in the VS Code snap, the only VS Code that may create the sandbox's user namespaces (section 1).
- **telelean's commands are missing from the Command Palette**: the folder is open in Restricted Mode. Run **Workspaces: Manage Workspace Trust** and trust it.
- **Apply disabled, "Your files changed since the session started"**: undo the edits in the editor (the message names the files) and Apply again, or exit the session.
- **Ctrl+Z does nothing on the Current view during a session**: the board's Undo is locked then (10.14); switch to Proposed (or click into the review panel) to undo your review steps.
- **To free disk space**: lower `telelean.run.keepRuns`, or delete old run folders under the model folder's `.telelean/runs/` while no run is active (keep `consent.json` there if you do not want to be asked again). Runs left by telelean versions before this one are in `~/.config/Code/User/globalStorage/telelean.telelean/runs/`, which you can delete as a whole.
