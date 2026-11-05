# features:write (agent af310d426ec9a7a6a)

## markdown
# Part 2: Functionality and features

This part covers what a user can do with telelean today and what happens when they do it. It was checked against the code as of 2026-11-02:

- the extension manifest and host (`packages/extension`);
- the React board (`packages/webview`);
- the runner (`packages/runner`);
- the pure core (`packages/core`).

It was also compared with `docs/user-guide.md` and with the last verifier report (`verbatim_prompt_log/bundle_9/subagent_reports/m2c_workflow/agents/m2close-verify-2.md`). The built bundles in `packages/extension/dist/` are newer than every source file, so an installed extension runs exactly this code. Where the user guide and the code disagree, the text says **Docs vs code**; section 2.7.3 lists all of these places.

**Status in brief.**
- **M1, the board without AI, is complete.**
- **M2, one-shot "These suffice" with Claude, is implemented and integrated.** Every M2 flow has been run with a scripted fake Claude (the FakeBackend), including real clicks through the board in a VS Code test instance.
- **Real Claude has never driven the M2 code.** The only contact with real Claude so far was M0's eight-request smoke test of the command-line harness.
- **The last verification round ended "needs-work", with minor issues only** (section 2.7.2).

---

## 2.1 Setting up and running

### 2.1.1 What the machine needs

- **Linux with the sandbox tools.** Lean checks need four things:
  - bubblewrap (`bwrap`);
  - a reachable systemd user manager (`systemd-run --user`, `systemctl --user`);
  - cgroup v2 with the memory controller;
  - util-linux `setpriv`.

  All four are in `/usr/bin` on this machine. Without them, checks fail closed: the board shows "Lean: off" with "sandbox unavailable: …".
- **Lean `leanprover/lean4:v4.35.0` under `~/.elan`** (or `$ELAN_HOME`). telelean calls `~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lake` and `lean` directly, never elan's proxies, so it never writes `~/.elan/known-projects`. That toolchain is installed here.
- **git**, for history. It is optional; the setting `telelean.git.path` chooses the executable.
- **For M2: Claude Code 2.1.295 or newer, logged in with a claude.ai subscription.** By default telelean uses the binary inside the VS Code Claude Code extension. Here that is `~/.vscode/extensions/anthropic.claude-code-2.1.314-linux-x64/resources/native-binary/claude`.
- **VS Code 1.140 or newer.** Building needs Node 24.22.2 (`.node-version`).

### 2.1.2 Build, install, reload

- **There is no VSIX package.** Packaging is an optional M4 item. The extension runs from its folder.
- **Building, only after a source change.** Run `npm run build` at the repository root. It does four things:
  - builds core with `tsc`;
  - bundles the extension host with esbuild, which also copies the Claude path-guard hook to `packages/extension/dist/bin/telelean-path-guard.mjs`;
  - builds the runner with `tsc`;
  - builds the webview with Vite into `packages/extension/dist/webview/`.

  `npm --prefix packages/extension run build:all` rebuilds only the webview and the extension bundle. At the moment nothing needs rebuilding.
- **Installing, once.** Run **Developer: Install Extension from Location…** and pick `/home/zhengyew/telelean/packages/extension`. The user guide says this was done in M0; the M0 report offered it as optional. VS Code registers the folder, so after a rebuild **Developer: Reload Window** loads the new `dist/`.
- **Trust.** The manifest declares untrusted workspaces unsupported, because building a model with Lean can run code. VS Code therefore disables the extension in Restricted Mode and in virtual workspaces.

### 2.1.3 Commands and activation

| Command | Where | What it does |
|---|---|---|
| **telelean: Open Board** (`telelean.openBoard`) | Command Palette | Opens, or reveals, the board of a model folder (2.1.5). |
| **telelean: Initialize Model Here** (`telelean.initializeModel`) | Command Palette; Explorer right-click on a folder | Turns a folder into a model (2.1.4). |
| **telelean: Refresh Lean Check** (`telelean.refresh`) | Command Palette | Re-checks the focused board, or the only open board. With several open and none focused it asks which; with none open it runs Open Board. |

- **Keybindings and menus.** No keybindings are contributed. Apart from the Explorer entry, no menu items are contributed.
- **Activation.** The extension activates by itself in windows that contain `**/.telelean/config.json`, when VS Code restores a board tab, and when one of its commands runs. Activation reads no model file, runs no Lean and looks for no Claude binary until a board opens.
- **Log.** Its log is **View → Output → telelean**.

### 2.1.4 Initialize Model Here

1. **Folder.** It uses the folder you right-clicked. Otherwise it shows a quick pick of the window's folders plus "Choose another folder…".
2. **Inspection.** telelean inspects the folder and acts on what it finds.

   - **Already a model.** It says so and opens the board.

   - **Empty folder** (no visible entries). It asks for the first subject's name: a capitalised Lean identifier of at most 64 characters, suggested from the folder name (for example `mental_model` → `MentalModel`). Then it writes:
     - `lakefile.toml`, with `autoImplicit = false`, `relaxedAutoImplicit = false` and one `[[lean_lib]] Model`;
     - `lean-toolchain`, set to `leanprover/lean4:v4.35.0`;
     - `lake-manifest.json`, with no packages;
     - the missing `.gitignore` lines: `/.lake/`, `/.telelean/graph.json`, `/.telelean/frozen/`, `/.telelean/sessions/`, `/.telelean/*.tmp`;
     - `Model.lean` and `Model/<S>.lean`;
     - `Model/<S>/{Vocabulary,Inbox,Main}.lean`, each `namespace <S> … end <S>` with a one-line comment;
     - `.telelean/config.json`;
     - `.telelean/subjects/<S>/layout.json`.

   - **Lake project without dependencies.** It asks first, in a modal: "Add telelean to the Lake project …?". Then it writes only `.telelean/config.json` (with the project's library name), a layout file per subject it found, and the missing `.gitignore` lines. It does not change any Lean file.

   - **Refused, with the reason.** It refuses in these cases:
     - Lake dependencies (Mathlib comes in M4);
     - a project configured only by `lakefile.lean` (Lake can convert it with `lake translate-config toml`);
     - both lakefiles at once;
     - no `[[lean_lib]]`, or a library name that is not a plain identifier;
     - a missing or invalid `lake-manifest.json`;
     - a folder that has files but no `lakefile.toml`.

3. **git offer.** If the folder is not inside a git repository, a modal offers `git init` for history. Saying no leaves history off; the board can still initialise git later. A folder already inside a repository gets history without being asked.
4. **Board.** telelean opens the board. Every file it writes goes through VS Code (one `WorkspaceEdit`) and is saved.

**Docs vs code (minor).** The user guide's file list leaves out `lake-manifest.json` and the layout file. It also does not say that an existing Lake project needs a `lake-manifest.json`.

### 2.1.5 Open Board

- **Finding models.** telelean searches the window's folders up to depth 6 for `.telelean/config.json`. It skips `node_modules`, `.lake`, `.git`, `verbatim_prompt_log` and `test-fixtures`. In this repository it finds only `mental_model/`, so opening `/home/zhengyew/telelean` opens that model directly.
- **Choosing.** One model opens directly. Several give a quick pick ("Which model?"). None gives an information message with **Initialize Model Here…**.
- **The tab.** There is one board per model folder, an ordinary editor tab titled `telelean: <folder>`. The parent folder is added to the title when two models share a name. Running the command again reveals the existing tab.
- **Restoring.** The tab survives a window reload: VS Code restores it, and the extension maps it back to its model and the subject it showed.
- **Loading errors.** If the model cannot be loaded, the tab says why. Fix the problem and run Open Board again; no reload is needed.
- **First check.** Opening the board starts a Lean check (2.3.9).

### 2.1.6 The sample model on first open

- **Content.** `mental_model/` holds subject `Spyro`, with three assumptions and one goal:
  - "PG games cannot have characters with dark pasts": comment-only, stance *rule*, no reason, so it shows the chip "no source yet";
  - "Cynder is a character who has a dark past": formalised as an `abbrev` plus `axiom ….holds`;
  - "The new Spyro game is PG": formalised the same way;
  - the goal "Cynder would not be a good addition to the new Spyro game": formalised, unproved, already declaring the three assumptions as `premises:`.
- **Vocabulary.** Sorts `Character` and `Game`, each with an existence presupposition; predicates `HasDarkPast` and `IsPG`; the relation `GoodAddition`; constants `cynder` and `newSpyro`.
- **Build on first open.** The first open builds the model in place: `mental_model/.lake/` and `mental_model/.telelean/graph.json` appear. Both are gitignored.
- **History.** Neither `mental_model/` nor `/home/zhengyew/telelean` is a git repository, so History shows **Initialize git** until you accept. If you accept, `git init` runs inside `mental_model/`.

### 2.1.7 A caution before pressing "These suffice"

Pressing **These suffice ▶** and then **Run with Claude** starts a real run on the user's claude.ai subscription quota. The planned real-Claude walkthrough has not been done (2.8). The main session earlier asked the user not to press it until M2 is declared ready.

---

## 2.2 The board

### 2.2.1 Layout, top to bottom

1. **Header.**
   - the word "telelean" and the model folder's name;
   - the subject picker;
   - **History**;
   - Undo and Redo;
   - the Lean badge;
   - **Problems N**, shown only when there are diagnostics;
   - the Claude run badge, shown only when a run exists;
   - a legend of the arrow styles and the aura.
2. **Banners, when relevant.**
   - syntactic mode, or Lean checking switched off;
   - a one-line note about a Claude run on another subject, with **Show**, which switches to that subject;
   - the proposal banner (2.4.9).
3. **Workspace.** The three columns with toasts at their bottom. During a run the run panel sits beside them, or below them when the board is narrower than 1000 px.
4. **Selection tray.**
5. **A|D|G box**, for typing new cards.

### 2.2.2 Columns and cards

- **Columns.** There are three: Assumptions, Derivations and Goals. Each scrolls on its own and has a glyph, a title and a count.
  - An empty column says so. On an empty board, both the Assumptions column and the tray point to the A|D|G box.
  - Columns keep at least 220 px. On a narrow board the whole board scrolls sideways, and during a drag it auto-scrolls near the edges.
- **The card face** shows:
  - your sentence first;
  - "because: …" with your reason;
  - the kind glyph **A**, **D** or **G** (colour, letter and column together; never colour alone);
  - a check mark when the card is selected;
  - a chevron to expand it;
  - status chips (2.2.6);
  - **⚠ N** when there are warnings or errors (click it to expand the card);
  - "saving…" while the host has not yet confirmed a new card;
  - for formalised cards, a "uses:" line (2.2.4).
- **Aura.** A glow, blue by default, means the card has a Lean statement.
- **Claude's wording.** A card worded by Claude (an adopted suggestion, 2.4.11) shows its sentence in italics followed by "(Claude's wording)".

### 2.2.3 The expanded card

Open a card with the chevron, or with Enter on a focused card. Pressing inside the details never drags the card, and clicking there never changes the selection. The expanded card shows the following.

- **The Lean box.**
  - **Copy** puts exactly the card's Lean code on the clipboard; the button shows "Copied" for 1.5 s. Code over 1,000,000 characters is refused with a toast.
  - **Open in editor** opens the file at the code's first line, beside the board and never over it. It reuses an editor group that already shows the file; the window splits only when the board's group is the only one.
  - A comment-only card instead shows "No Lean code yet: this node is a comment-only `@@ telelean` block." and its own Open in editor button.
- **Inside the code.**
  - Press and drag selects text. A drag guard switches the card's draggability off while the press lasts.
  - Hovering an identifier that Lean resolved shows a tooltip. For a card's statement it shows that card's sentence and Lean name; for a vocabulary item, its gloss (docstring), kind and type.
  - Clicking an identifier reveals that card (it scrolls into view and flashes for 2 s), or opens the Vocabulary group and flashes the item.
  - Ctrl/Cmd+click is reserved and does nothing yet.
- **Problems** of this card, each with an **Open** button.
- **Proof information.**
  - **Rests on**: the footprint of a proved card. It lists cards, presupposition chips such as "assumes characters exist", and any foreign axiom flagged TL103.
  - **Taken as hypotheses (unproved)**: for a conditional proof.
  - **Presupposes**: chips that highlight the presupposition in the Vocabulary group.
  - **Lean's axiom list (N)**: a folded section.
- **Depends on / Used by.** Each entry is a card button with the reason: declared, used by the proof, used through other proofs, taken as a hypothesis, or mentioned in the statement. "Used by" also lists users the board shows no card for: lemmas without a card, and other subjects' cards marked "(subject …)".
- **Attempts (N).** Every "These suffice" round with this card as the target, newest first, five at a time with **Show all N**. Each entry shows:
  - date and verdict;
  - the round;
  - what you did with it: accepted, discarded, continued in a later round, or not resolved;
  - the premises, or "from no premises (self-evident?)";
  - Claude's summary in italics;
  - the number of check attempts;
  - the model and effort.

  **Docs vs code:** the user guide does not mention this list.
- **Stance and source chips.**
  - Stance chips appear on Assumptions, or on any card that already has a stance. They read "I believe it", "It's a rule or definition" and "Supposing, for argument".
  - Source chips appear on non-Goals, or on any card that already has a source. They read observed, reported, inferred and common knowledge.
  - Clicking a pressed chip clears it.
- **Buttons.** Make Assumption, Make Derivation and Make Goal (each tooltip states the D-11 impact), **Edit**, **Add why** or **Edit why**, and **Delete**.
- **In the proposed view** the chips and buttons are replaced by "This is Claude's proposal (read-only): switch the board to "Current" to edit your cards."

### 2.2.4 The "uses:" line

- **Inline.** Formalised cards list the vocabulary their statement uses, computed from Lean. The first two names are inline, as in "uses: HasDarkPast, cynder, …". This subject's items get short names; other names are fully qualified.
- **Dropdown.** **▾ N** opens a list of all the names with their kind and gloss. Picking one highlights it in the Vocabulary group. Names not in the subject's vocabulary are greyed out as "elsewhere".

### 2.2.5 The Vocabulary group

- **Place and state.** It is the first item of the Assumptions column and is collapsed by default. The open or closed state is remembered per board, in the webview's own state, not in a model file. Highlighting an item opens the group.
- **Header.** It shows the item count, and "N hidden assumption(s)" when Prop-valued axioms have no card (TL104).
- **Sections, in order.**
  1. Types
  2. Predicates & relations
  3. Functions
  4. Constants
  5. Presuppositions, shown as chips worded from the sort's gloss ("assumes characters exist"), or "assumes there is a T" without one
  6. Definitions
  7. Lemmas
  8. Unmarked axioms
  9. Other
- **Each item** shows its short name, type and gloss, plus flags: hidden assumption, shape (TL111), definition on a statement path (D-4, needs your endorsement), changed since last check, or new. Its chevron shows the item's Lean code, the cards that use it, and Open in editor.
- **Other subjects.** Items of another subject that this subject's cards use through an explicit `import` are listed under their full names, so their glosses show on hover.
- **In the proposed view** the group shows the proposal's vocabulary, with diff marks and "+N new". It opens by itself when the proposal adds vocabulary.

### 2.2.6 Arrows and status marks

**Arrows.** They are SVG lines drawn over the three scrolling columns, one arrow per pair of cards.

| Style | Meaning |
|---|---|
| dashed | **declared**: you declared the support (`premises:`) |
| solid | **verified by Lean**: the proof uses it |
| hollow arrowhead | **conditional**: the proof takes it as a hypothesis |
| warning colour | **mismatch**: declared but unused (TL109), or used but not declared (TL107); the tooltip says which |
| thin | **statement reference**: one statement mentions another. Drawn only while one end is hovered or selected, and only if no other arrow joins the pair |

- **Scrolled-away ends.** When the other end is scrolled out of view, a short stub is drawn, and the column header or footer shows "▲ n linked" or "▼ n linked". Clicking that scrolls to the nearest hidden linked card.
- **Crossing the middle column.** Arrows that cross the Derivations column run under the cards, unless one end is hovered or selected.

**Status chips** on the card face:

| Chip | Meaning |
|---|---|
| no Lean yet / λ Lean / Lean problem | comment-only / has a Lean statement / statement or `.holds` missing, broken or not of the form `abbrev n : Prop := …` |
| assumed | taken as an axiom. On a Goal it is flagged: "asserted as an axiom: make it an Assumption?" (TL116) |
| unproved | stated in Lean, not proved yet |
| ✓ proved | Lean checked the proof; the tooltip lists what it rests on. Without ✓, Lean did not check it |
| proved: make Derivation? / has a proof: make Derivation? | a proved Goal (TL105) / an Assumption with a proof (TL106). Clicking changes the kind |
| conditional on … | proved, but with unproved statements as hypotheses |
| promotion pending | a Derivation whose `.holds` is still an axiom |
| rests on a claimed node | its proof uses a Derivation whose promotion is pending |
| changed since last check, or "checking…" while Lean runs / not checked by Lean | its file changed since the last check, so other chips are dimmed and show the last known status / Lean could not check it |
| uses sorry / missing .holds / .holds says something else | TL115 / TL117 / TL114 |
| self-evident / existence commitment / definitional choice | proved from no assumptions / needs an existence presupposition no statement mentions (TL108) / its statement relies on a definition |
| broken | depends on something removed |
| no reason yet (no source yet for stance *rule*) | an Assumption without a "because". Clicking opens the reason editor (TL011) |
| you think this follows from those: prove it? | an Assumption that has declared support |

**Diagnostic codes.** The codes run TL001–TL019 (markup), TL101–TL121 (Lean side) and TL201 (the project cannot be checked).

### 2.2.7 The Lean badge, banners and Problems

| Badge | Meaning |
|---|---|
| Lean: not checked yet | no check has run yet |
| Lean: checking… | building or checking now |
| Lean: up to date | every file of the board checked |
| Lean: files changed | some files changed since the check; their cards show the last known status |
| Lean: N errors | the build reported errors (see Problems) |
| Lean: check failed | the last check did not finish: a time-out, out of memory, cancelled, or an internal error. Hover for the reason; cards keep their last known status |
| Lean paused: low memory | available memory is below `telelean.memory.minAvailableGiB` |
| Lean: syntactic mode | the project is not on v4.35.0, so cards come from the text only |
| Lean: off | switched off by the setting, a project telelean cannot check (dependencies; TL201), or "sandbox unavailable" |

- **Refreshing.** Clicking the badge asks for a refresh.
- **Banners.** Syntactic mode and "Lean checking is off" also show a banner under the header.
- **Problems.** The **Problems** dropdown lists every diagnostic of the subject. Each has **Show card** (when it belongs to a card) and a `file:line` button that opens the file.

### 2.2.8 Subjects

- **Picker.** "subject: [Spyro ▾]" lists the model's subjects with their card counts. Picking one switches the board.
- **New subject.** **New subject…** opens a name field (a capitalised identifier of at most 64 characters, not already taken). Creating it writes `Model/<Name>.lean` and `Model/<Name>/{Vocabulary,Inbox,Main}.lean`, adds `import Model.<Name>` to `Model.lean`, and switches the board to it.
- **Rules.**
  - A board shows one subject at a time.
  - Card ids are unique across subjects.
  - Undo and History work per subject.
  - If the shown subject disappears (an Undo of its creation, a revert), the board switches to the first remaining subject and says so.
  - The subject is remembered across reloads.

### 2.2.9 Selection and the tray

- **Selecting.** A click selects one card, replacing the selection. Ctrl/Cmd+click, or Space on a focused card, adds a card to the selection or removes it.
- **The tray** shows "N selected", the premise chips, a turnstile ⊢ and a target slot.
  - **Target.** The target is the card you chose with ⊢ on a premise chip. Without that, it is the single selected Goal.
  - **Chips.** Each chip has ⊢ ("Make this the target") and × ("remove").
  - **Presuppositions.** "+ presupposes:" chips show the existence presuppositions of the selected statements; clicking one highlights it.
  - **Buttons.** **Clear** and the run buttons (2.4.1).
- **Read-only proposed view.** There, clicks never change the selection.

### 2.2.10 Keyboard

- **Focus.** Tab moves between cards and buttons.
- **On a focused card.** Enter expands or collapses it, Space selects or deselects it, F2 edits its sentence, Delete opens the delete dialog, and **Alt+Up / Alt+Down** moves it one place in its column.
- **Undo and Redo.** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. These do not apply while typing in a field or while a dialog is open.
- **Dropdowns** (subject picker, History, Problems, "uses:"). Opening one moves the focus into it. Up, Down, Home and End move between its items. Escape, or choosing an item, gives the focus back to the button that opened it.
- **Dialogs** are native modal dialogs: the focus is trapped inside, Escape cancels, and Cancel has the initial focus on every destructive dialog.
- **A|D|G switch.** Left and Right arrow move between Assumption, Derivation and Goal.

### 2.2.11 Toasts, provenance and theming

- **Toasts.**
  - At most three at a time, at the bottom of the board area.
  - Info toasts stay 6 s, warnings 10 s and errors 15 s.
  - **Undo** appears only on the newest undoable toast, and only while Undo would revert exactly that action.
  - Identical messages are merged.
- **Provenance.** Everything Claude wrote appears in italics with a "Claude" marker, "(Claude's words)" or "(Claude's wording)", and never in the style of your own words. This covers its messages, questions and options, suggestions, summaries, and glosses of new vocabulary.
- **Theme colours.** Six colours can be overridden through `workbench.colorCustomizations`, with defaults for dark, light and both high-contrast themes:
  - `telelean.kindAssumption`
  - `telelean.kindDerivation`
  - `telelean.kindGoal`
  - `telelean.formalizedAura`
  - `telelean.vocabulary`
  - `telelean.highlight`

  The board follows VS Code's reduced-motion preference.

---

## 2.3 Editing the model without AI (M1)

### 2.3.1 Every board action

| Action | Gesture | What is written | Undo / History |
|---|---|---|---|
| Add a card | A\|D\|G box | a comment block in `Model/<S>/Inbox.lean` | yes / "add" |
| Edit the sentence | **Edit** or F2; Enter saves, Esc cancels | `natural_name:`. A docstring equal to the old sentence follows it; a formalised card gets its `lean:` pin | yes / "edit" |
| Edit the reason | **Add why / Edit why**, or the "no reason yet" chip; empty removes it | `rationale:` | yes / "edit" |
| Stance, source | chips in the expanded card | `stance:` / `source:` | yes / "edit" |
| Re-order | drag within a column, or Alt+Up/Down | `.telelean/subjects/<S>/layout.json` only | yes / no entry of its own; it rides along with the next snapshot |
| Change kind | drag to another column, **Make …**, or the "make Derivation?" chips | `type:` plus the D-11 Lean change (2.3.5) | yes / "kind" |
| Delete | **Delete**, or the Delete key | the block, and its Lean unless kept; theorem proofs go to `.telelean/subjects/<S>/attic/<id>.lean`; the id leaves other cards' `premises:` | yes / "delete" |
| New subject | subject picker | the subject's files and an import in `Model.lean` | yes / "new subject" |
| Undo / Redo | header buttons, keys, or a toast's Undo | the previous file contents | / "undo", "redo" |
| Revert to a history entry | History → **Revert to this** → **Revert** | the subject's files as they were then | yes / "revert" |
| Refresh Lean | badge or command | `.lake/`, `.telelean/graph.json` | no |

- **Saving and conflicts.** Edits are saved at once, including any unsaved typing in the same file. telelean checks each file's current text against what it planned. If the file changed meanwhile, the edit is refused with "… changed since telelean planned "…"; nothing was applied".
- **Optimistic display.** The board shows adds, moves and edits at once, and rolls them back with an error toast when the host refuses them.

### 2.3.2 Adding cards: the A|D|G box

1. Pick the kind: Assumption, Derivation or Goal.
2. Type one sentence. Pasted line breaks are folded into one line.
3. Optionally, fill in the second row:
   - stance chips (Assumption only);
   - a "why" field, whose prompt follows the kind and stance: "Why do you believe it?", "Where does the rule come from?", "What are you exploring?", "Why do you think it follows?" or "Why do you care?";
   - source chips (Assumption and Derivation).
4. Press Enter or **Add assumption/derivation/goal**.

telelean writes a comment-only block (your words, trimmed, no Lean) with an id derived from the sentence and `asserted:` set to today. If `Inbox.lean` is missing, it creates it and adds its import. The box keeps working during a Claude run: its second row folds away while the run panel is shown, and adding a card switches the board back to the Current view.

### 2.3.3 Editing

- **Inline edits.** The sentence and the reason are edited in place on the card. When a card is saved or cancelled from the keyboard, the focus returns to the card.
- **Stance and source.** These change with one click on a chip.
- **Card ids.** Ids never change with the sentence.

### 2.3.4 Deleting

Deleting has two stages.

1. **The first dialog** lists what refers to the card on this board: declared as a premise by, used by the proofs of, mentioned in the statements of. It also lists what uses it outside the board: lemmas without a card, and other subjects' cards. It says "Nothing else refers to it." only when nothing does. The buttons are:
   - **Delete card and its Lean code**, or just **Delete card** for a comment-only card;
   - **Delete card only, keep Lean**;
   - **Cancel**, which has the focus.

   "Card only" leaves `axiom …holds` as an unmarked axiom. The Vocabulary group then flags it as a hidden assumption.
2. **The second dialog.** If deleting the Lean code would break other declarations (the host knows this from Lean's facts), telelean deletes nothing yet. It reopens the dialog as "Delete its Lean code too?" and lists those declarations: cards by sentence, another subject's card with "(subject …)", anything else by its Lean name. The buttons are:
   - **Delete anyway**: the listed declarations stop compiling until changed; Undo brings the code back;
   - **Delete card only, keep Lean**;
   - **Cancel**.

### 2.3.5 Changing kind (D-11)

Kind changes never rename a statement.

| Change | Lean effect |
|---|---|
| comment-only card, any change | only `type:` |
| Goal → Derivation | none now; the card counts as derived once `theorem n.holds` exists |
| Goal or Derivation → Assumption | adds `axiom n.holds : n`, or turns the theorem into that axiom (the proof is archived in the attic). Without a reason, an optional "Why do you hold it?" dialog appears (Skip is fine) |
| Assumption → Derivation | the axiom stays; the card shows **promotion pending** until you replace the axiom with a proof by hand |
| → Goal | removes `n.holds`. If proofs use it, a dialog lists them, as described below |
| → Assumption, when `n.holds` takes hypotheses | proofs that pass it arguments must change; the dialog offers "Rewrite them to use it directly" or "Keep them, marked broken" |

When proofs use `n.holds` and the card becomes a Goal, the dialog offers:

- **Rewrite them to take it as a hypothesis** `(h_n : n)`. This needs fresh Lean facts, and is refused when a user is not a theorem.
- **Keep them, marked broken.**
- **Cancel.**

How the board previews and confirms kind changes:

- **Drop zones.** During a drag, the other columns become labelled drop zones that show the impact, for example "Make Derivation: promotion pending until proved". That text comes from the board's own cards only ("No card on this board uses it").
- **Re-checking with Lean.** The host re-plans the change with Lean's facts. If it finds more dependents (lemmas without a card, other subjects' proofs), it asks again with its own list and says it found more. Your choice then applies to exactly the listed dependents.

### 2.3.6 Re-ordering

Drag a card within its column, or use Alt+Up/Down. Only `layout.json` changes. Dropping a card outside every column cancels the drag.

### 2.3.7 Declaring premises

The only board gesture that writes `premises:` is the tray's **These suffice ▶** or **Add to its premises ▶**, and both start a Claude run (2.4). The declaration is written after preflight and is an ordinary undoable M1 action, labelled "These suffice: … ← N premises". It refuses premises from another subject, a card supporting itself, and cycles.

If you do not want to use Claude, the board cannot declare support; you edit `premises:` by hand. The host would accept a declare-only message, but the board never sends one.

### 2.3.8 Undo, Redo and History

- **Undo and Redo.**
  - 100 steps per subject, kept in memory. They survive closing the board, but not a window reload.
  - The tooltips name the action ("Undo: Add assumption: …").
  - If you edited a file by hand since, Undo reverses only telelean's change, and refuses when that no longer applies ("changed since; use History to revert").
- **History** needs git (A3). Each telelean change becomes a commit on private refs: `refs/telelean/<folder-hash>/subjects/<S>` per subject, and `…/project` for project files.
  - **Never touched:** your branches, index, HEAD, remotes and hooks. Nothing is pushed.
  - **When snapshots are taken:** "Initial state" snapshots are taken when a board first loads. Hand edits are snapshotted as "Manual edits" before telelean's next change.
  - **What a subject's snapshots cover:** its `.lean` files, its `layout.json` and its attic. `attempts.jsonl` and `decisions.json` are not covered.
- **The History dropdown.**
  - **Storage line:** "This subject: X · All subjects: Y". This is disk use, not memory.
  - **Entries:** "time · action · label", 50 at a time, with **Show older entries**.
  - **Preview** opens a read-only multi-file diff of what the entry changed, beside the board. Its tab is titled `History: <label> (<time>)`.
  - **Revert to this** asks first. It snapshots the current state, then writes that entry's state back. The revert can itself be undone. If that first snapshot fails (for example a stale git `….lock` file), nothing is reverted and the message names the file.
  - **Keep the last N** confirms inline ("Drop 3 older snapshots of Spyro? This cannot be undone.") and is disabled when there is nothing to drop. git frees the disk space at its next housekeeping.
- **No repository.** Without a repository the dropdown offers **Initialize git**, which asks before running `git init` in the model folder. With history switched off or git missing, it explains why and says that board actions and Undo still work.

### 2.3.9 When Lean checks run, and what they do

- **Only while the board is open.** A check runs in these cases:
  - when the board opens;
  - after you save a model file in VS Code;
  - after telelean's own edits;
  - when another program writes a model `.lean` file, `lakefile.toml`, `lean-toolchain` or `lake-manifest.json`;
  - when you click the badge or run the Refresh command.

  Each trigger waits `telelean.refresh.debounceMs` (750 ms) first.
- **Unsaved typing** is re-parsed after about 200 ms but not built, so affected cards show "changed since last check".
- **The check itself** builds in place: `lake build Model` runs in the sandbox, with the model folder read-only except `.lake/` and with `.git` hidden. It then runs one generated check file (`#check`, `#print`, `#print axioms`) through `lake env lean --stdin`. Each step has a fixed 120 s limit that no setting changes.
- **Failures.** If a check fails, the facts of the last good check stay in use and are marked stale where files differ.
- **One job at a time.** Only one Lean job runs at a time in a window; board checks and run jobs queue behind each other.
- **Toolchains.** Only toolchain v4.35.0 is checked; any other toolchain gives syntactic mode.

### 2.3.10 Files telelean writes in a model folder

| File | Written when | Gitignored | In history | Undoable |
|---|---|---|---|---|
| model `.lean` files | board actions, Accept | no | yes | yes |
| `.telelean/config.json` | Initialize | no | yes (project chain) | through History |
| `.telelean/subjects/<S>/layout.json` | re-orders, new cards | no | yes | yes |
| `.telelean/subjects/<S>/attic/<id>.lean` | archived proofs | no | yes | yes |
| `.telelean/graph.json` | after every check and every telelean edit | yes | no | no |
| `.telelean/subjects/<S>/attempts.jsonl` | every Claude round | no | no | no |
| `.telelean/subjects/<S>/decisions.json` | every answer to Claude | no | no | no |
| `.lake/` | Lean builds | yes | no | no |

- **`graph.json`** describes the whole project as one versioned JSON document for your scripts (`telelean-graph`, format version 1.1, JSON Schema in `packages/core/schema/`). It always lists `attempts: []`; only the board's own graphs carry attempts.
- **`.telelean/frozen/` and `.telelean/sessions/`** are gitignored but unused, because runs live in VS Code's storage (2.4.3).
- **Deleted files** (an Undo of a new subject, a revert) are removed through VS Code. The guide says they go to the OS trash under VS Code's default settings; I did not verify that.

---

## 2.4 Proving with Claude: "These suffice" (M2)

A run asks Claude whether the target follows from exactly the selected premises. Claude works only in a private copy of the model. telelean checks Claude's result with Lean and fixed rules, which involve no LLM. Nothing reaches your files until you review the proposal and press **Accept**.

### 2.4.1 Starting a run from the tray

1. **Select.** Select the premises and a target: a Goal, or a Derivation chosen with ⊢. Remember that a plain click replaces the selection, so Ctrl/Cmd+click every card after the first.
2. **Pick a button.** The tray offers:
   - **These suffice ▶**: proves the target from exactly the selected premises, after declaring them as the target's support. That replaces its declared premises.
   - **Add to its premises ▶** (secondary), offered when the target already declares premises you did not select: keeps the declared premises and adds the selected ones. A warning line names what These suffice would drop: "“These suffice” replaces the target’s declared premises and drops “…”." **Docs vs code:** the guide says this button appears "instead"; the tray actually shows both buttons.
   - **Self-evident?**, when only a target is selected: proves it from no premises at all. It declares nothing and keeps the target's declared premises as they are.
3. **When the buttons are disabled**, the reason is shown next to them:
   - "An assumption is something you hold: make it a Derivation first, then prove it."
   - "Several goals are selected: choose the target with ⊢."
   - "Choose the target (a Goal or a Derivation) with ⊢."
   - "Select the card to prove too: …"
   - a run of this model folder is already active.

   While a run is active the tray folds to one line (the selection summed up, the disabled button, the reason); its chevron unfolds it.
4. **Lean busy.** The button works while the board's own Lean check runs; an end-to-end test covers exactly that race.

### 2.4.2 Consent

The first start in a model folder shows a modal: "Run Claude on this model?". Its detail reads: "telelean sends this subject's cards (sentences, reasons, Lean statements), its vocabulary and your recorded answers, plus any model file Claude reads, to Anthropic through your Claude Code login (your claude.ai subscription; no API key)." It has two answers:

- **Run with Claude** is remembered for that folder (per folder path, in VS Code's global state).
- **Cancel** starts nothing, declares nothing and is not remembered. The board shows an information toast: 'Not started: telelean sends nothing to Claude until you allow it ("Run with Claude").'

There is no command to withdraw a consent once given.

### 2.4.3 What happens at the start

1. **Busy check, then consent** (in the board session).
2. **Preflight**, in this order. Each refusal is one sentence and changes nothing.
   1. No other active run of this folder.
   2. The selection is valid: the target is a Goal or Derivation of the subject, the premises are cards of the subject, and the target is not one of its premises.
   3. The workspace can run Claude.
   4. `lean-toolchain` is v4.35.0, there is a lakefile, and `lake-manifest.json` lists no packages.
   5. The sandbox works.
   6. Available memory is at least `telelean.memory.minAvailableGiB`.
3. **Finding Claude Code.** telelean finds the binary, in this order: the setting, then the VS Code Claude Code extension's binary (newest first, starting with the copy VS Code actually runs), then `claude` on the PATH, then `~/.local/bin/claude`. Each candidate must answer `--version` (which contacts nobody) with 2.1.295 or newer. A binary set in the setting must work; there is no fallback. This happens once per window, at the first start that passed preflight.
4. **Premises declaration** (2.3.7). It is skipped when the declaration would not change and for Self-evident?.
5. **The private copy.** It is created at `~/.config/Code/User/globalStorage/telelean.telelean/runs/<folder>-<hash>/<run id>/`.
   - `ws/` is Claude's working directory. It holds only the model files as the board sees them, open editor buffers included, and no dot-entries.
   - `build/` is a mirror with the run's own Lean build. It is built from scratch, unless `telelean.run.reuseLeanBuild` is on and the board's last check recorded a complete build that nothing has touched since.
   - `git/` holds the copy's own history.
   - `session/` holds the generated settings, the guard policy and log, the MCP config with a bearer token, the system prompt and `transcript.jsonl`.
   - Also there: `run.json`, the freeze and gate working folders, and scratch projects.
6. **Base check.** Your files are built once, as one Lean job that is not counted. Lean errors anywhere end the run before Claude is contacted: "The run could not start: your files have Lean errors (…); fix or save them, then start again."
7. **Claude Code starts**, and three checks run before the first prompt (2.6.2), so a refusal costs no quota:
   - telelean self-tests the path-guard hook;
   - it starts the CLI and asks it for the account: anything but a claude.ai subscription login is refused;
   - it asks for the CLI's hooks listing: the guard must be listed and enabled.
8. **The first message** goes to Claude, and the run is "Working · formalising".

### 2.4.4 What Claude can do, and what is sent

- **Claude's tools.**
  - File tools Read, Glob, Grep, Edit and Write, confined to `ws/`.
  - telelean's five tools, served over a local MCP server:
    - `check_lean`: a sandboxed build plus the rule check; each call counts one check;
    - `freeze_statements`: freezes the target's and the premises' statements; counts one check;
    - `ask_user`: 1–3 questions;
    - `propose_assumption`: suggests a missing premise; counts one check;
    - `finish`, with status proved, not_proved, insufficient, inconsistent or lean_errors.
  - No shell, no web, no subagents.
- **What is sent, through your Claude Code login.**
  - **A fixed system prompt:** the same text every run, describing the workflow and the rules.
  - **The first message:**
    - TARGET;
    - SELECTED PREMISES;
    - OTHER CARDS OF THIS SUBJECT: all of them, or only the neighbourhood (`telelean.run.contextScope`);
    - VOCABULARY;
    - EARLIER ANSWERS IN FORCE;
    - BUDGET.
  - **Every model file Claude reads.** All subjects are in the copy, so imports work.
  - **Every tool result, your answers and your Feedback.**
  - **Claude Code's own telemetry and error reports**, as in your other sessions. They are off only if VS Code was started with `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; telelean passes those switches through.
- **What stays on the machine.**
  - The run directories: the newest `telelean.run.keepRuns` (10) finished runs per folder are kept, and older ones are pruned when a run ends.
  - Claude Code's own session transcripts under `~/.claude/projects/`, which `--resume` uses and telelean never reads.

### 2.4.5 The run panel

- **Where it appears.** It opens beside the board when a run starts, or below the board on a narrow board.
- **Header.**
  - "Claude" and the state: Starting, "Working · formalising", "Working · proving", "Waiting for your answer", "Checking Claude's result", "Ready for review" (with the verdict once revealed), Interrupted, Accepted, Discarded, Cancelled or Failed;
  - **Cancel**, while the run starts, works, waits for an answer or is being checked;
  - × to hide the panel. Hiding never stops the run.
- **Status line.**
  - round N;
  - checks 3/25, turns 12/80;
  - agent 4:05 / 20:00, marked "(paused)" while Claude waits for you;
  - check attempts 1/3;
  - tokens in and out for the whole run;
  - "$0.42 estimate";
  - the rate-limit state: "rate limit ok", "rate limit: close (resets …)" or "rate limited (resets …)".
- **Body.**
  - the target line ("These suffice: “…” from 3 premises", or "Self-evident?: “…” from no premises at all");
  - progress text for starting and checking;
  - question cards;
  - notices with timestamps and folded details;
  - the review;
  - your answered questions;
  - the **activity** feed (each check, freeze, suggestion and gate step, plus Claude's own words in italics; it follows new lines unless you scrolled up, and folds away in review);
  - a backend line: model · effort · Claude Code version.
- **Resizing.** The panel's edge is a splitter. Drag it, or focus it and use the arrow keys (Home and End for the limits). Double-click or Enter restores the default size. The size is remembered per layout.
- **The header badge.** It reads "Claude: working on Spyro · 3/25 checks", "Claude: a question for you · Spyro", "Claude: proposal ready · Spyro" and so on. It shows or hides the panel; for a run on another subject it switches to that subject. It gets a bell when the run needs you.

### 2.4.6 Claude's questions

- **When Claude asks.** It asks before formalising when a reading changes the result: modality, genericity, scope, word sense and so on. There are up to three questions at a time.
- **Each question card shows:**
  - a tag in plain words: unstated premise, genericity, modality, negation, presupposition, scalar word, vagueness, evaluative standard, indexical, word sense, tense, granularity, closed world, or other;
  - Claude's question, marked "Claude asks";
  - "About “…”" with the affected cards;
  - 2–4 options, each with its plain consequence and an optional Lean preview;
  - the board's own choices: **In my own words** (a text field), **Leave it open** (recorded) and **Decide for me** (Claude chooses, and lists the choice under "assumed without asking");
  - "Remember for:" **this run** (the default), **these cards** (disabled when no card is affected) or **the whole subject**.
- **Answering.** Nothing is pre-selected. **Send answer(s)** sends the whole batch, and Claude's clock is paused while it waits. Claude's own guess is never sent to the board before you answer; afterwards it shows under "Your answers".
- **Recording.** Every answer is written to `.telelean/subjects/<S>/decisions.json`. Answers for "the whole subject", and "these cards" answers when the run involves those cards, are sent to later runs as earlier answers in force. Answers cannot be revoked yet (M3).

### 2.4.7 The checks, retry notices and the revert

- **The freeze.** Claude must first freeze the statements: the target's, and those of the selected premises. Proofs before the freeze are refused, including proofs hidden in a definition, an instance or a structure.
- **The gate.** When Claude calls `finish`, telelean runs the gate on the committed working copy. It has five checks: G0, G1, G3, G4 and G5; there is no G2. Their tooltip names are:
  - G0: allowed Lean only;
  - G1: build;
  - G3: what it rests on;
  - G4: statement unchanged (Lean's comparator, for "proved" only);
  - G5: your words untouched.

  The theory behind these is Part 3's subject.
- **Not failures.**
  - New definitions become yes/no questions in the review.
  - A missing premise becomes a suggestion.
- **A failed attempt.** A notice appears, for example *"Attempt 1 didn't pass: it added an axiom (`shortcut`), and only you can add beliefs. Asking Claude to retry."* Claude receives the exact findings.
- **After the last allowed attempt** (`telelean.run.maxGateAttempts`, 3 per round):
  - telelean stops Claude and reverts the working copy to the last state that passed: the last passing gate, the freeze, or the start;
  - it normalises that state and re-checks it (not counted);
  - it builds the proposal from it, with notices such as *"telelean reverted Claude's working copy to “Statements frozen (round 1)” (…)"*.

  The proposal banner then says so up front: "Claude gave up: its result didn't pass the checks 3 times. This proposal holds only what last passed the checks (…)". Accept is then a secondary button.
- **More rules of the loop.**
  - **Edits after a passing check** are discarded: the proposal is always exactly the checked files.
  - **A turn that ends without `finish`** gets one reminder. A second one ends the round as "ended without finishing", with the same revert.
  - **Hitting the turn or time cap** ends the round as "stopped at a limit", with the same revert. A cap reached during a tool call takes effect when the call returns. The check cap only refuses further checks ("call finish").
  - **Machine problems** (the sandbox could not start, low memory) are not counted. telelean retries once after 30 s; if that fails too, the run ends as failed, "… this is not Claude's fault". A Lean job that runs out of time or memory is counted as Claude's.

### 2.4.8 Caps, usage and quota

- **Caps per round.** The first round, each Feedback and each adopted suggestion get a fresh budget: 80 turns, 25 Lean checks, 20 minutes of Claude's working time (time spent waiting for you does not count), 120 s per Lean job, and 3 check attempts. There is no dollar cap and no limit on the number of rounds.
- **Cost estimate.** The "$… estimate" is Claude Code's own figure at API list prices, and the latest value only, since it is cumulative across `--resume`. A subscription is not billed per token, but runs use the plan's usage.
- **Usage limits.** When Claude Code reports a usage-limit status other than "allowed", a notice says so in local time, for example *"Close to your plan's usage limit (five-hour window, 83% used); resets at 00:45."*
- **Recorded usage.** The report card shows requests, tokens, the estimate, the duration and Claude's working time. `attempts.jsonl` records usage per round.

### 2.4.9 When a round ends: the proposal on the board

- **The banner** reads "Claude’s proposal 1 new · 2 changed · +1 vocabulary". It has:
  - the **Current | Proposed** toggle;
  - **Review…**, which opens the panel and the proposed view;
  - **Accept**, **Feedback…**, **Discard** and **Raw Lean diff…**.
- **The board switches to Proposed by itself**, unless you are dragging or editing. It shows the subject as Accept would leave it:
  - diff marks on cards ("+ new", "~ changed", "− removed": a glyph, a word, a colour and a halo), with a tooltip listing the changed fields;
  - cards the proposal removes, still shown;
  - the proposal's arrows and vocabulary.

  The proposed view is read-only: no selection, dragging or editing; expanding works.
- **Meaning before proof status (D-19).** Until you have stepped past the statements in the review, or pressed **Show result**, the target and every new or re-proved card show the chip "result after the review". Their proof chips, footprints and verified arrows stay hidden. Outcomes that are not proof results (gave up, stopped at a limit, ended without finishing) show at once.
- **Raw Lean diff…** opens VS Code's multi-file diff of every file the proposal changes, read-only, with the run's base on the left. Its tab is titled "Raw Lean diff: Spyro (round 1)". The report card's per-file **diff** buttons open one file at a time. The diff opens in an editor group beside the board; if the board's group is the only one, the window splits and the board gets half the width (2.8).

### 2.4.10 The review and the report card

The review is a stepper in the run panel. Its steps can be clicked, or walked with Back and Next.

1. **Statement steps**, one per new or changed statement. Each asks "Does the Lean say what the sentence says?" and shows:
   - the sentence above its Lean proposition (the `#print` header is stripped);
   - a **Fully explicit** checkbox: no notation, every argument shown, no coercion arrows;
   - "It uses": the names in the statement, with glosses;
   - **Show on the board**.

   **Docs vs code:** the guide says "beside"; the code puts the sentence above the Lean because the panel is narrow.
2. **New vocabulary.** The sorts, predicates, functions and constants Claude added, with gloss and code. These are approved unless you press **Revoke…**, which prefills Feedback.
3. **Definitions (N).** Each definition or existence assumption Claude introduced, with its code and the statements that rely on it. It offers **Yes, I endorse it** and **No…**; No prefills Feedback. Accept stays disabled until every one has Yes.
4. **Result: the report card.** It contains:
   - the verdict: proved, not proved, "Claude reports a conflict (unverified until M3)", gave up, stopped at a limit, ended without finishing, cancelled, or failed;
   - the revert note, when there was one;
   - **Rests on** (for "proved");
   - "Self-evident: proved without any of your premises";
   - "Not used by the proof: …";
   - **Consistency unchecked** (for "proved"; the model finder comes in M3);
   - Claude's summary, the gap it reports, and any conflict it reports;
   - **Assumed without asking**, each item with **Ask me instead** (prefilled Feedback);
   - the suggested premises;
   - the check attempts, each failure in plain words with "What Claude was told";
   - "Files Accept would change", with line counts and diff buttons;
   - the usage line.
5. **Card changes.** For a proved Goal: "Make “…” a Derivation (Lean proved it from the selected premises; recommended)", ticked by default. Untick it to keep the card a Goal.

The panel also notes "Your files changed since the run started: Accept re-checks Claude’s changes on top of them first", and "This round changed no file: Accept only records the outcome", where these apply.

### 2.4.11 Suggested premises and "I hold this"

- **How a suggestion appears.** When the target does not follow, Claude may suggest a premise after freezing. The suggestion must be one Lean proposition, on one line, using existing vocabulary only. telelean checks it in a scratch Lean project and shows it only if the suggestion, together with the selected premises, proves the frozen target.
- **The suggestion card.** It appears as a translucent "Claude suggests" card at the top of the Assumptions column (proposed view) and in the report card. It shows:
  - Claude's sentence and "Why it is needed";
  - the Lean statement;
  - the chip **closes the gap (checked)**;
  - **gives the goal on its own: it may simply restate it**, when the check used none of your premises;
  - the Lean name it would get.
- **I hold this.** This takes an optional one-line reason, then **Adopt**. telelean then:
  1. writes the card into Claude's working copy right before the target, as an Assumption worded by Claude (`worded_by: agent`), with your reason;
  2. adds it to the target's `premises:`;
  3. freezes the statements again with it selected.

  If that freeze fails, the adoption is undone and a notice says why. Otherwise a new round starts with Claude proving the target. The card and the declaration reach your files only through Accept, and both show in the raw diff.
- **No** marks the suggestion as declined. The run stays in review.

### 2.4.12 Accept, Feedback, Discard

- **Accept** applies exactly the checked files of the proposal, plus the ticked card changes, through M1's write path:
  1. your hand edits are snapshotted first;
  2. there is one history entry "accept · These suffice → proved: …" (or "Self-evident? → …", plus "(+ Make Derivation)" or "(+ N adopted assumption)");
  3. **one Undo step reverts the whole Accept**;
  4. a Lean check follows, and the board shows the real statuses.

  The toast reads "Accepted: …. Undo reverts it." Further rules:
  - **"Not proved" rounds** can be accepted too: their statements and vocabulary are applied.
  - **Rounds that changed no file** are only recorded ("Recorded: … (no file changed)."), with no history entry and no Undo step.
  - **Changed files.** If you changed model files during the run, telelean merges Claude's changes onto yours with a 3-way patch (3 context lines, no fuzz).
    - An edit of yours within 3 lines of a change of Claude's refuses the Accept: *"Your edits to Model/Spyro/Main.lean since the run started overlap Claude's; Discard, or Feedback to redo it on your current files."*
    - Otherwise telelean re-freezes and re-gates the combination, with your current files as the base, before applying it. A failure refuses the Accept, listing the findings.
  - **Never partial.** Accept never applies part of a proposal.
- **Feedback** is a text field: Ctrl+Enter sends it, Esc closes it, and it holds up to 4000 characters. It starts a new round in the same Claude session with fresh caps. Claude may revise the statements but must freeze again; the proposal is withdrawn until the round ends.
- **Discard** ends the run without touching your files.

### 2.4.13 Attempts history

Each round appends one line to `.telelean/subjects/<S>/attempts.jsonl`, containing the verdict, premises, footprint, Claude's summary (up to 500 characters), check attempts, model and effort, and usage. A second line later records what you did with it: accepted, discarded, or superseded by Feedback or an adoption. The board shows these in the target card's **Attempts** list (2.2.3). Like `decisions.json`, this file is written directly, never undone and not part of history.

### 2.4.14 Cancel, closing, reload and resume

- **Cancel** stops Claude and the run's Lean jobs at once. The working copy and transcript are kept until pruning. **Dismiss** removes an ended run from the panel.
- **Closing the board** does not stop a run. Reopening the board shows it again.
- **Window reload, restart or close.**
  - **An active run** is saved as "interrupted" and its Lean job is cancelled.
  - **After the reload:**
    - a waiting question or a proposal comes back as it was; answering a restored question resumes the same Claude session with `--resume`;
    - a run that was working shows "The session was interrupted (the editor reloaded) while Claude was working. Your files were not changed." with **Resume** (when a session id exists) and **Stop** (ends it like Discard; toast "Run stopped");
    - a run still starting is marked failed;
    - older leftover runs are marked failed ("superseded by a newer run").
  - **Nothing starts by itself** after a reload.

### 2.4.15 Run states at a glance

| State | The panel shows | You can |
|---|---|---|
| starting | "Checking the setup, copying your model and starting Claude…" | Cancel |
| working (formalise / prove) | status, notices, activity | Cancel, hide the panel |
| waiting for answer | question cards | answer, Cancel |
| gate | "Claude says it is done: telelean checks the result …" | Cancel |
| review | banner, overlay, review, report card | Accept, Feedback, Discard, I hold this / No, Raw Lean diff |
| interrupted | interruption text | Resume (if possible), Stop |
| accepted / discarded / cancelled / failed | outcome sentence (and error) | Dismiss |

---

## 2.5 Settings

**When settings take effect.** All settings are read when a model's workspace and run manager are created, so they take effect after **Developer: Reload Window**; open boards come back by themselves. One exception: `telelean.claude.path` is read at the first run start in a window.

**Bad values.** Out-of-range numbers are clamped to the bounds and rounded. Wrong types fall back to the default. An invalid model name falls back to `claude-opus-5-5`.

| Setting | Default | Allowed | Scope | What it does |
|---|---|---|---|---|
| `telelean.memory.capGiB` | 4 | 1–64 | machine-overridable | memory cap of each sandboxed Lean job (systemd `MemoryMax`, no swap); lowered automatically when less memory is free |
| `telelean.memory.minAvailableGiB` | 2 | 0–64 | machine-overridable | no Lean job starts below this much `MemAvailable` ("paused: low memory"; runs refuse at preflight) |
| `telelean.refresh.enabled` | true | boolean | resource | checks the model with Lean while its board is open |
| `telelean.refresh.debounceMs` | 750 | 0–60000 | resource | wait after a save or edit before re-checking |
| `telelean.git.snapshotRefs` | true | boolean | resource | history snapshots under `refs/telelean/…` |
| `telelean.git.path` | `git` | string | machine | the git executable |
| `telelean.model` | `claude-opus-5-5` | model id or alias | resource | Claude Code's `--model` |
| `telelean.effort` | `high` | low, medium, high, xhigh, max | resource | Claude Code's `--effort` |
| `telelean.claude.path` | empty (automatic search) | path (`~` expanded) | machine | the Claude Code binary; when set it must work |
| `telelean.run.maxTurns` | 80 | 1–1000 | resource | model responses per round |
| `telelean.run.maxChecks` | 25 | 1–500 | resource | Lean checks per round (check, freeze, each suggestion) |
| `telelean.run.maxAgentMinutes` | 20 | 1–240 | resource | Claude's working minutes per round |
| `telelean.run.leanJobSeconds` | 120 | 10–1800 | resource | time limit of each Lean job of a run |
| `telelean.run.maxGateAttempts` | 3 | 1–10 | resource | check attempts per round before the stop and revert |
| `telelean.run.keepRuns` | 10 | 1–100 | machine | finished runs kept per model folder |
| `telelean.run.contextScope` | `subject` | `subject`, `neighbourhood` | resource | which other cards the first message lists |
| `telelean.run.reuseLeanBuild` | false | boolean | resource | start a run's build from your `.lake/build` (see known issue 2.7.2) |

**How the cap is lowered.** The automatic cap is the smaller of the setting and `MemAvailable` minus min(1 GiB, half the threshold), and never below 256 MiB. A job near the limit then stops at its own cap instead of pushing the machine into swap.

**`telelean.refresh.enabled` off: Docs vs code.** The setting's description says the board then "runs in syntactic mode". The board actually shows "Lean: off" and "Lean checking is off". The effect is the same: cards come from the text only.

The six theme colours (2.2.11) are the only other configuration points.

---

## 2.6 Safety features

telelean is a personal-use prototype. It keeps the proof-integrity checks and cheap safety, and defers adversarial hardening to the optional milestone H.

### 2.6.1 The Lean sandbox and memory

- **One wrapper for every Lean process** (`runLean`): `systemd-run --user --scope` with `MemoryMax`, `MemorySwapMax=0` and `OOMPolicy=stop`, then `setpriv --pdeathsig KILL`, then `bwrap`.
- **What bwrap allows:**
  - no network (all namespaces unshared, loopback only);
  - fresh `/tmp` and `/run`;
  - `$HOME` hidden under an empty tmpfs, with only `~/.elan` bound read-only;
  - the sources read-only and only `.lake/` writable; `.git` is hidden during board checks;
  - an environment cleared except `HOME`, `PATH` (toolchain first) and `LEAN_NUM_THREADS=4`.
- **Fail closed.** If bwrap, setpriv, systemd-run, the user manager, cgroup v2 or an enforced memory cap is missing, nothing runs ("could not start").
- **Limits.** Each job has a wall-clock limit and can be cancelled (its whole scope is killed). Only one Lean job runs at a time per window.
- **Memory guard.** Nothing starts below the free-memory threshold, and the cap is lowered automatically.
- **Toolchain.** Binaries are called directly, never through elan.

### 2.6.2 Confining Claude Code

- **Your own CLI only, in headless stream mode.** The flags are:
  - `--tools Read,Glob,Grep,Edit,Write`;
  - `--disallowedTools Bash,WebFetch,WebSearch,Agent,AskUserQuestion,NotebookEdit`;
  - `--permission-mode dontAsk` and `--restricted`;
  - `--setting-sources=` (none of your Claude Code settings, hooks or CLAUDE.md);
  - `--strict-mcp-config` with only telelean's tool server.

  Auto-memory, CLAUDE.md loading, claude.ai MCP servers, tool search, background tasks and the auto-updater are switched off.
- **Path guard** (`telelean-path-guard.mjs`). A PreToolUse command hook with `onFailure: "block"` confines every file tool to the run's `ws/`. It refuses dot-segments and hidden folders, and allows Grep or Glob only on folders with no hidden entry below them. telelean self-tests the hook before the CLI starts, and refuses to start unless the CLI lists the hook as enabled. The CLI's own fences (block reads and writes outside the working directory, deny rules for hidden entries) are a second layer.
- **The working copy holds only model files.** Your real folder, `.lake`, `.telelean` and `.git` are not in it.
- **The tool server** listens on 127.0.0.1, on a random port. It requires a per-run bearer token, checks the Host header and refuses browser Origins. The token file is owner-only.
- **Process lifetime.** The CLI runs in its own process group, under `setpriv --pdeathsig KILL`, so it dies with the extension host.
- **Subscription only.**
  - **Before the CLI starts:** the environment is cleaned. telelean removes `ANTHROPIC_*`, `CLAUDE*`, cloud-provider variables, OTEL exporters, `NODE_OPTIONS`, `SSH_AUTH_SOCK`, and VS Code, Electron and snap variables. It keeps `CLAUDE_CONFIG_DIR` and the privacy switches. The aim is that no run can bill per token or attach to another Claude Code session.
  - **Before the first prompt:** the account must be a claude.ai subscription login.
  - **During the run:** a run stops if the CLI reports an API key in use.

### 2.6.3 Your files, your words and your quota

- **No writes before Accept.** Nothing reaches your files except the premises declaration (undoable) and Accept (one undo step, snapshotted, re-checked after drift, refused on overlapping edits).
- **Proposals are judged states.** A proposal is always exactly the files the gate judged.
- **Consent.** It is asked per folder before anything is sent.
- **Claude's guesses** stay hidden until you answer.
- **Claude's words** are always visually marked.
- **No session starts by itself.**
  - The backend is created lazily, at the first start that passed preflight.
  - A reload never resumes a session.
  - Caps bound every round.
  - Machine problems are retried once and never counted against Claude.

### 2.6.4 Quota tripwires and test isolation

- **`TELELEAN_NO_REAL_CLAUDE`.** Any non-empty value other than `0` or `false` makes the runner refuse to look up a Claude binary or spawn anything but a node test double in a test fixtures folder. Every test runner sets it: the runner and extension vitest configs and the VS Code test configuration.
- **Test mode.** In VS Code Test mode the extension refuses real Claude ("real Claude is disabled in Test mode"). Only a FakeBackend that a test installs can run.
- **Scripts.** `scripts/walkthrough-claude.mjs` and `scripts/smoke-claude.mjs` are dry by default. Going live needs both `--live` and `TELELEAN_WALKTHROUGH_LIVE=yes` (or `TELELEAN_SMOKE_LIVE=yes`), and either one alone refuses before anything is resolved. The walkthrough also refuses `--live` when the tripwire is armed.
- **Real binary check.** The one test that runs the real binary's `--version` is opt-in (`TELELEAN_ALLOW_REAL_CLAUDE_VERSION=1`).
- **VS Code smoke and end-to-end tests** run in an isolated profile under a scratch directory:
  - HOME, XDG folders, user data and extensions are scratch copies;
  - `xvfb`, `--disable-extensions`, and `GIT_CONFIG_GLOBAL=/dev/null`;
  - copies of the sample model;
  - the run refuses to start without that profile, checks that the real `~/.config/Code` and similar folders did not change, and checks that no process or `telelean-*` unit is left behind.
- **Test files.** Runner and extension tests run sequentially and use `$TELELEAN_TEST_TMP`.

### 2.6.5 Webview and host hygiene

- **Strict CSP.** Only two nonce'd scripts run: no inline styles, no eval, command URIs disabled, and local resources only from `dist/webview`.
- **Message validation.** Every message from the webview is validated by core's protocol parser.
- **Open in editor** re-checks that the path stays inside the model folder, including after symlinks are resolved.

---

## 2.7 Limitations and known issues

### 2.7.1 By design or by scope

**Board (M1)**

- **Lean side.**
  - Lean 4 core only: no Mathlib or other Lake dependencies (M4).
  - Only toolchain v4.35.0 is checked; others give syntactic mode.
  - No Lean-editor features (hover, completion, code lenses: M4).
- **When checks run.** Lean checks run only while the board is open. The in-place build can race the Lean extension on `.lake`; at worst that means a redundant rebuild.
- **Undo, History and settings.**
  - Undo is lost on a window reload.
  - History needs git.
  - Settings need a window reload.
- **Board limits.**
  - You cannot draw arrows by dragging.
  - Definitions are flagged on the board and endorsed only in a proposal's review.
  - A board shows one subject.
  - Ctrl/Cmd+click in code does nothing yet.
- **Platform.** Linux only in practice, because of the sandbox requirements.

**Runs (M2)**

- **One run at a time, of the board's subject.**
  - One run per model folder; the target must be a Goal or Derivation of the board's subject.
  - The one-run rule is enforced within one VS Code window. There is no lock across windows.
- **Accept.**
  - No partial Accept.
  - A definition is endorsed only by its Yes before Accept.
- **Not yet available (M3).**
  - No consistency check of your assumptions ("consistency unchecked") and no countermodels.
  - A minimal review: no alignment check, gloss or back-translation.
  - Recorded answers cannot be revoked.
- **Hardening.** The gate is a prototype profile, not hardened against a determined adversary (H). The path guard is not symlink-proof (H), although the working copy contains only regular files and Claude has no shell.
- **Login and cost.** A run needs Claude Code logged in with a claude.ai subscription. There is no dollar cap and no limit on rounds.
- **No declare-only gesture.** Declaring premises without starting a Claude run is not a board gesture any more (2.3.7).
- **What persists after a run ends.** The premises declaration made at the start stays in your files after Discard, Cancel, or a start that fails at the base check or at Claude Code's start; Undo removes it. The `attempts.jsonl` record stays too. The guide calls the declaration undoable but does not say it survives these.
- **No withdrawing consent.** There is no command to withdraw a consent.
- **graph.json** never lists attempts.

### 2.7.2 Known issues still open (last verifier, m2close-verify-2)

1. **`telelean.run.reuseLeanBuild` can start a run from a stale compiled module.** If you save a file while an outside `lake build` compiles it and then Undo, Lake can trust a compiled file built from the other version. A run with the setting on then copies it, and its checks read facts about the other version. The setting's description, the user guide, the plan and `seed.ts` all promise "Lake still rebuilds whatever in the copy does not match the run's files", which is untrue in this case. The default (off) is unaffected; the board's own facts have the same exposure, which is an M1 matter. The verifier suggested removing the setting or rewording the texts. Neither has been done.
2. **The suggested premise's Lean-name chip can differ from the name adoption writes.** The suggestion step checks fewer name clashes than adoption. For example, Claude's name `Spyro` is shown, but `Spyro.pg_rules_out_cynder` is written. The adoption turn and the stored name are corrected afterwards.
3. **Cosmetic issues in the tests:**
   - the title of a runner test (`test/shadow/shadow.test.ts:108`) still uses the old overstated wording;
   - the new race end-to-end test cannot run on its own with `TELELEAN_SMOKE_GREP`, because it relies on the suite's first test opening the board.

### 2.7.3 Docs vs code

- **Claude's wording after an edit.** User guide 10.9 says an adopted card "stays marked as Claude's wording (italics) until you edit its sentence". It does not: editing on the board changes only `natural_name:`. `worded_by: agent` stays, and the card keeps "(Claude's wording)". This was confirmed by applying core's own edit planner in a scratch experiment: `/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn9/report-features/worded-by.mjs`. The only way to clear the mark is to edit `worded_by:` by hand.
- **reuseLeanBuild wording:** see 2.7.2 item 1.
- **"Add to its premises ▶" "instead":** the tray shows both buttons (2.4.1).
- **Review statement step:** the guide says "beside"; the code puts the sentence above its Lean (2.4.10).
- **Gate step names:** the guide says "G0–G5"; G2 does not exist.
- **Subscription check:** the guide says "Claude Code itself checks" the subscription. telelean asks Claude Code for the account and refuses anything else; the substance is the same.
- **`telelean.refresh.enabled` description:** it says "syntactic mode"; the board says "Lean: off" (2.5).
- **Missing from the guide:**
  - `lake-manifest.json` and `layout.json` in Initialize's file list, and the manifest requirement for existing Lake projects (2.1.4);
  - the card's Attempts list;
  - the resizable run panel and the folded tray;
  - theme colours.

---

## 2.8 Not done yet, and the open decision

- **The real-Claude walkthrough** (plan section 12) has not been run. It drives the Spyro sample with a scripted user, with the "cannot" read normatively (expected: proved, then Goal → Derivation accepted) and literally (expected: not proved, a suggestion adopted, round 2 proved, accepted). The script exists and its dry run passes both readings with the FakeBackend and real Lean. Going live needs both opt-ins, about 12 GB of free memory, and an announcement of the quota use beforehand; the plan's estimate is roughly 0.5–1.5 M cache-read tokens and 5–15 minutes per reading. The architecture defines "good enough to start using" as M2 plus a successful real-Claude walkthrough, so M2 is not formally ready.
- **The modifications audit**, the main session's planned end-of-turn audit of everything modified this turn (files, installs, effectful commands, network effects), has not been done. Verifiers recorded their own effects outside the repository, and a separate scan answered which git repositories were read (`verbatim_prompt_log/bundle_9/evidence/scan_git.py`), but the full audit is outstanding.
- **Two runner test files have not been run:** `packages/runner/test/run/walkthroughScript.test.ts` and `packages/runner/test/run/smokeScript.test.ts`. They spawn the two scripts with `--live` and the `*_LIVE` variables (with a fake binary and the tripwire armed) to show that live mode refuses. The verifiers' no-live rule excluded them, and they are left to the main session: `cd packages/runner && TELELEAN_NO_REAL_CLAUDE=1 npx vitest run test/run/walkthroughScript.test.ts test/run/smokeScript.test.ts`.
- **Later milestones:**
  - **M3 (faithfulness):**
    - the full review: alignment, deterministic gloss, back-translation;
    - a model finder for consistency, non-vacuity and countermodels, replacing "consistency unchecked";
    - the DECISIONs UI, including revoking answers;
    - refine, supersede, merge and suspend;
    - Formalise-first;
    - the full "Ask Claude…" composer;
    - anti-goals, pause-when-risky and sign-offs.
  - **M4 (integration):**
    - Lean-editor features;
    - a CLI (`telelean export|check|init|fmt|schema`) with a JSON Schema;
    - Shiki and accessibility polish;
    - the full test-electron suite;
    - an optional VSIX;
    - Mathlib opt-in.
  - **H (optional hardening):**
    - a symlink-proof file-tool guard;
    - an audited sandbox profile with socket isolation;
    - the full vocabulary data-type rule;
    - `leanchecker`;
    - formal immutability;
    - an exploit-fixture suite.
  - **Also later:** partial, node-level Accept (D-21).
- **Verification status, per the last verifier** (clean build, all in a scratch copy):
  - core: 498 tests;
  - runner: 532 passed and 1 skipped, with the two files above excluded;
  - webview: 130 unit tests and 81 Playwright tests;
  - extension: 171 unit tests;
  - VS Code: 36 smoke tests and 21 end-to-end tests;
  - walkthrough dry run: both readings passed;
  - no real Claude process was started.
- **Open decision for the user: where "Raw Lean diff…" should open.**
  - **Now:** the diff opens beside the board. When the board is the only editor group, VS Code splits the window, so the board shrinks to half its width while the diff is open (still usable).
  - **The alternative:** open it as a tab in the board's own group, over the board. The board keeps its full width but is hidden until you switch back.

  Nothing changes until the user chooses (decisions log, top). History **Preview** uses the same placement code, so the choice would naturally apply to it too.


