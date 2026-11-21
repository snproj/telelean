# map:review-ui

# Run/review UI in the webview: the current system

Scope: this map comes from reading the code and tests only. I ran nothing. Where the docs and the code disagree, **the code is authoritative**. Paths are relative to `/home/zhengyew/telelean/`.

## 0. Component map

- `packages/webview/src/App.tsx`: the layout, top to bottom: `Header` (holds the run badge), `LeanBanner`, `RunElsewhere`, **`ProposalBanner`**, then the workspace (**`Board`** with toasts, and **`RunPanel`** beside it, or below it when the window is narrow), `SelectionTray`, `PromptBox` (the A|D|G box) and `Dialogs`.
- `run/RunPanel.tsx:354-422` renders these in order:
  - the header ("Claude", the state label, Cancel, hide);
  - the status line;
  - the Target line ("These suffice:" / "Self-evident?" “sentence” "from N premises");
  - the Outcome;
  - the pending questions;
  - the upfront notices;
  - **`<Review>`**, shown only while `run.state==='review'` and a proposal exists (`:404`), otherwise "Preparing the proposal…" (`:405-409`);
  - "Earlier notices (N)", folded;
  - "Your answers";
  - Activity (folded during review);
  - the backend line.
- Review stepper: `run/Review.tsx`. Report card: `run/ReportCard.tsx`. Ghost card: `run/GhostSuggestion.tsx`. Banner: `run/ProposalBanner.tsx`.
- Ghost cards on the board: `board/GhostCards.tsx`, mounted at the top of the Assumptions list (`board/Column.tsx:95-97`), before the Vocabulary group.
- Pure helpers: `model/run.ts`. State: `state/store.ts`. The types it reads are `ReviewUi` (`:236-254`) and `RunUi` (`:269-290`).
- Core types (`packages/core/src/run.ts`):
  - `StatementReview` (`:352-367`), `VocabularyReview` (`:370-373`), `DefinitionQuestion` (`:381-393`), `LifecycleItem` (`:396-407`), `ReportCard` (`:421-449`), `GhostView` (`:235-254`);
  - `ProposalView` (`:452-471`), whose doc line `:451` reads "Applying it is all-or-nothing (D-21)".
- Messages (`packages/core/src/protocol.ts:167-182`): `acceptProposal {runId, proposalId, lifecycle[], definitions[]}`, `feedback {runId,text}`, `discardProposal`, `adoptGhost {ghostId, rationale?}`, `rejectGhost`, `openProposalDiff`. `LIMITS.reviewItems = 200` (`:270-271`).

## 1. The review flow, step by step

### 1.1 When it appears, and the state it keeps

- The host posts `run` (state `review`) and then `proposal`.
- `store.applyProposal` (`store.ts:950-968`):
  - On a *fresh* proposal (a new `proposalId` or `runId`) it builds `initialReview` (`:582-597`): step 0, `revealed = pastStatements(steps,0)` (true when there are no statement steps), `explicit:{}`, `definitions:{}`, `lifecycle = initialLifecycle` (recommended items pre-ticked), and an empty Feedback draft.
  - It forces `runPanelOpen:true`.
  - It switches the board to **Proposed**, unless the user is dragging or editing (`:961`).
- The review state lives **only in webview memory**. `PersistedState` (`store.ts:77-86`) holds only subject, vocabCollapsed, requestCounter and runSplit. After a webview reload, the definition answers, lifecycle ticks, step and explicit toggles are reset. The host never records endorsements.

### 1.2 Stepper chrome (`Review.tsx:304-383`)

- Heading **"Review"** (checklist icon). Progress line **"Step {i} of {n}: {label}"** (`:325-327`).
- While the result is hidden, a **"Show result"** button appears (title "Show the proof result now", `:329-333`).
- Steps (`model/run.ts reviewSteps :474-483`, in this order):
  - one step per `StatementReview`;
  - then at most one `VocabularyReview` with items;
  - then `definitions` if any exist;
  - then `result` (always);
  - then `lifecycle` if any exist.
- Pill labels (`stepLabel`, `Review.tsx:22-25`, and `STEP_TITLE`, `run.ts:491-497`):
  - **"Statement 1", "Statement 2", …**, or just **"Statement"** when there is only one;
  - **"New vocabulary"**;
  - **"Definitions (N)"** (`:347` appends the count);
  - **"Result"**;
  - **"Card changes"**.
  - `STEP_TITLE.statement = 'Statements'` is never used for the pills.
  - The e2e test pins `['Statement 1','Statement 2','New vocabulary','Definitions (2)','Result','Card changes']` (`webview/test/e2e/m2-review.spec.ts:33`).
- The pills are a wrapping row of buttons (`board.css:1348`, `display:flex; flex-wrap:wrap`). They are **not a list with statuses**: there is no done, accepted or declined mark. There is only `aria-current`, and `data-locked` on "Result" while it is hidden. Clicking any pill navigates there.
- Notes:
  - `baseChanged`: "Your files changed since the run started: Accept re-checks Claude’s changes on top of them first."
  - `empty`, with lifecycle items: "This round changed no file: Accept records the outcome and makes only the card changes you tick."
  - `empty`, without: "This round changed no file: Accept only records the outcome."
- Navigation: **"Back"** (disabled at step 0); **"Next: {next label}"**, which reads "Next: done" and is disabled on the last step.
- Reveal rule (`store.reviewGo :1461-1467`): reaching any step after the last statement sets `revealed:true`. So moving to "New vocabulary" already reveals the result. The hidden branch of ResultStep therefore looks unreachable by normal navigation.

### 1.3 Statement N (`StatementStep`, `Review.tsx:31-83`)

- Lead: **"Does the Lean say what the sentence says?"** plus a tag, **"new statement"** or **"changed statement"**.
- **"Sentence"**: the card's sentence. The user's style, or Claude's italic style with "(Claude's words)" when `wordedBy==='agent'` (an adopted ghost).
- **"Lean statement `<shortName>`"**: a `<pre>` holding `statementBody(explicit ? item.explicit : item.pretty)`.
  - `statementBody` (`run.ts:371-383`) strips Lean's `#print` header (`@[reducible] def X : Prop :=`).
  - The sentence sits **above** the Lean (`:39` comment). The docs say "beside".
- Checkbox **"Fully explicit"**, title **"No notation, every argument and universe shown, no coercion arrows"** (`:55-58`). See section 2.
- **"It uses"**: the statement closure (short name, kind noun, `: type`, gloss), or **"No vocabulary."**
- Button **"Show on the board"** (eye icon) → `showOnBoard`, which switches to Proposed and flashes the card (`store.ts:1573-1576`).
- **There is no accept or decline control.** Which cards get a step: `proposal/service.ts statementReviews :211-239`, one per card of the proposed board whose statement abbrev is new or changed against the run's base B. Adopted ghosts are included.

### 1.4 New vocabulary (`VocabularyStep`, `:90-118`)

- Lead: **"Claude added this vocabulary. Plain types, predicates and constants pass the simple vocabulary rule, so they are approved unless you revoke one (revoking sends Feedback)."**
- Per item: name, kind noun, type, a **"Revoke…"** button, the gloss (always Claude's style) and the code.
- **"Revoke…"** only *prefills* Feedback, via `openFeedback(revokeVocabularyText)` = ``Please don't add the vocabulary item `X` (“gloss”): ``. Nothing is sent, and Accept stays enabled.
- Contents: only *pure-signature* items new against B (`service.ts:59 PURE_SIGNATURE = sort|predicate|function|constant`, `:256-263`). It is already **a single review item**.

### 1.5 Definitions (N) (`DefinitionsStep` / `DefinitionItem`, `:120-169`)

- Lead: **"Claude introduced this definition."** or **"Claude introduced these definitions."**, followed by **"A definition can quietly carry a belief, so Accept needs your yes for each; a no is Feedback for Claude."**
- Per item:
  - the name and a kind label: **"existence assumption"** (`kind:'presupposition'`) or **"definition"**;
  - the gloss in Claude's style;
  - the code;
  - **"Your statements rely on it:"** followed by the cards (kind glyph and sentence).
- Buttons (`aria-pressed`, group aria-label ``Do you endorse <name>?``):
  - **"Yes, I endorse it"**;
  - **"No…"**: stores `'no'` and prefills Feedback with ``I don't endorse the definition `<fully-qualified name>` (“gloss”): `` (`store.ts:1484-1493`).
- Producer: core `gate/rules.ts flagged :808-834`.
  - New definitions **on a statement path**: used by a card, flagged `definitional-choice`, in the closure of the target, a premise or a ghost, or referred to by vocabulary.
  - Every **new presupposition axiom** (for example `T.exists`).
  - New definitions off a statement path and new lemmas get **no review item at all**. They appear only as "+ new" in the Vocabulary group of the Proposed view.

### 1.6 Result (`ResultStep` → `ReportCard`)

- Hidden branch: "The result is shown after the statements, so that you judge what they mean before you see whether they were proved." plus "Show result".
- The report card (`ReportCard.tsx:48-241`) shows:
  - the verdict line (`VERDICT_LABEL`, `run.ts:175-185`);
  - the revert note "telelean reverted Claude’s working copy to “…”: …";
  - **"Rests on"** (proved only), or "No assumptions at all.";
  - "Self-evident: proved without any of your premises.";
  - "Not used by the proof: …";
  - "Consistency unchecked: telelean has not yet checked that these premises can all hold together (the model finder arrives in M3).";
  - "Claude’s summary";
  - "What is missing, according to Claude";
  - "A conflict Claude reports (unverified until M3)";
  - **"Assumed without asking"** ("Nothing, according to Claude."), each item with **"Ask me instead"** → Feedback prefilled with "You assumed this without asking: “…”. Please ask me about it instead of assuming it.";
  - **"Premises Claude suggests"** (ghost cards, panel variant);
  - "Check attempts: X passed of Y";
  - "Files Accept would change" (+a −d, each with a "diff" button);
  - the usage line.

### 1.7 Card changes (`LifecycleStep`, `:186-213`)

- Lead: **"Changes to cards that Accept makes too, only when ticked:"**
- Items are checkboxes: **"Make “<sentence>” a <Kind> (<reason>; recommended)"**.
- In production there is only `l1`, a proved GOAL becoming a DERIVATION, with reason "Lean proved it from the selected premises", recommended and pre-ticked (`service.ts:184-188`).

### 1.8 Actions (`ReviewActions`, `:264-302`; the same buttons are in the banner)

- **"Accept"** / "Accepting…"
  - Disabled unless `definitionsApproved` and nothing is busy. While disabled, its title is "Answer every definition question with yes first (a no is Feedback)" and the hint **"Accept needs your yes for every definition question."** shows.
  - It becomes a secondary button when the verdict is gave-up, cap-reached or no-finish.
  - Its title is `acceptTitle` (`run.ts:328-332`), one of: "Record the outcome: this round changed no file, so there is no Undo step and no history entry" / "Make the ticked card changes in your files (one Undo step; a history entry)" / "Apply what last passed the checks to your files (one Undo step; a history entry)" / "Apply the proposal to your files (one Undo step; a history entry)".
- **"Feedback…"** opens the composer: label **"Feedback for Claude: it continues the same session in a new round (statements may change)"**, a textarea (maximum 4000 characters), **"Send feedback"** / "Sending…", **"Close"**, and the hint "Ctrl+Enter sends" (Esc closes).
- **"Discard"** / "Discarding…", title "End the run without changing your files".
- **"Raw Lean diff…"**, title "Open VS Code's diff of every file the proposal changes".
- **No action asks for confirmation.**

### 1.9 What Accept requires

- **Webview** (`store.acceptProposal :1525-1543`):
  - a proposal and a review with matching `proposalId` and `runId`;
  - nothing busy;
  - **every** `DefinitionQuestion` answered "yes".
  - It sends the ticked lifecycle ids and the "yes" definition ids (`acceptSelection`, `run.ts:505-513`).
- **Host** (`runner/src/run/manager.ts acceptNow :1645-1750`):
  - state `review`;
  - the proposal is the current one ("That proposal was replaced; review the current one.");
  - every definition id is present ("Answer every definition question: a “no” is feedback.");
  - the lifecycle ids are known;
  - `planAccept` (`proposal/service.ts:303-398`) does a 3-way merge with no fuzz, and refuses on conflict;
  - when the user's files drifted: rebase, re-freeze and re-gate, refusing if that fails.
- **Not required:** reading the statements, revealing the result, deciding on the ghosts, or ticking anything.

## 2. "Fully explicit": exactly what it switches

- **UI.** It is per statement, keyed by card id (`ReviewUi.explicit`, `store.toggleExplicit :1475-1482`). It is off by default and resets on every fresh proposal and every webview reload. It is display-only: nothing is posted, and it has no effect on Accept. It exists only on Statement steps. Definitions, vocabulary and ghosts show raw source text.
- **Data.** `StatementReview.pretty` versus `.explicit` (core `run.ts:360-363`: "`#print` of the statement abbrev (default notation)" and "`pp.explicit`, no notation, universes shown, no coercion arrows").
- **Producer chain (runner):**
  - `RunManager.buildProposal` (`manager.ts:1146-1208`) → `statementsToRender` (`:1131-1144`): the statements of subject cards that were touched (added or changed declarations) or are in focus (target, premises, adopted ghosts).
  - `engine.renderStatements` (`gate/engine.ts:785-799`) → `renderScratchSource` (`gate/scratch.ts:122-142`) writes a scratch file, fed on stdin to `lake env lean --stdin --json`. For each name it holds `#print <name>` and then **`set_option pp.explicit true in set_option pp.notation false in set_option pp.universes true in set_option pp.coercions false in #print <name>`** (`EXPLICIT_OPTIONS`, `scratch.ts:112`).
  - `readRenderScratch` (`:145-169`) collects the info messages line by line.
  - `ProposalServiceImpl.statementReviews` (`proposal/service.ts:224-233`): `pretty: rendered?.pretty ?? source`, `explicit: rendered?.explicit ?? source`. **If Lean failed to print, both fall back to the declaration's source text, and the toggle changes nothing.**
- **What changes on screen.** Notation becomes the underlying constants:
  - `¬P` → `Not (P)`;
  - `∧`, `∨`, `↔` → `And`, `Or`, `Iff`;
  - `∃` → `Exists fun …`;
  - `=` → `@Eq T a b`.
  Implicit and instance arguments are shown with `@`, universe levels are shown, and `↑` coercions become explicit functions.
- **Example.** The real-Lean engine test `runner/test/gate/engine.test.ts:576-586` (AT2.10) asserts that pretty contains `¬Spyro.InGame c g` and explicit contains `Not (Spyro.InGame c g)`.
  - **Names are fully qualified in both forms**: the scratch file `#print`s from outside the namespace. So the user guide's "shows every name in full" is not a real difference.
  - The webview e2e fixture (`test/shared/runs.ts:384-385`, `m2-review.spec.ts:40-42`) shows short names in the pretty form. That fixture is synthetic.
- **When it is useful.** Checking the scope of `¬`, how `∧`/`∨`/`→` group, the order of quantifiers, the type an equality or numeral lives at, and hidden coercions or instance choices. With telelean's vocabulary rule (simple sorts, predicates, functions and constants; built-in types in signatures are refused, `docs/user-guide.md` 10.14), implicit arguments, universes and coercions rarely occur. In practice the difference is mostly notation.
- **Design intent:** D-19's faithfulness check (02_design_decisions.md:325).

## 3. "Claude suggests" (ghost premises)

- **Source.** Claude calls `propose_assumption` only in the prove stage, after the freeze (`manager.ts toolProposeAssumption :2092-2139`).
  - telelean checks `theorem telelean_ghost_check : telelean_ghost_stmt → <target>` in a **scratch file** (`gate/scratch.ts:49-67`), never in the working copy.
  - Its `#print axioms` must stay within the permitted set.
  - The ghost is stored with `state:'suggested'` and `round`.
- **Rendering.**
  - **Board:** `GhostCards` shows the `suggestedGhosts(run, proposal)` (`run.ts:538-541`, filter `state==='suggested'`). It renders only in the Proposed view (`GhostCards.tsx:12-25`), at the top of the Assumptions column. These are **not model cards**: no `data-node-id`, a click stops propagation, they cannot be selected, dragged, edited or used as arrow ends, and they are not counted.
  - **Run panel:** inside the report card, "Premises Claude suggests", so **only after the result is revealed**. On the board they show at once, even before the reveal.
- **The card** (`GhostSuggestion.tsx`):
  - marker **"Claude suggests"**;
  - Claude's sentence;
  - **"Why it is needed:"** with the reason;
  - the Lean `<pre>`;
  - chips:
    - **"closes the gap (checked)"**, title "telelean checked in Lean that your selected premises plus this suggestion prove the target";
    - **"gives the goal on its own: it may simply restate it"**, title "Its proof that it closes the gap uses none of your selected premises (D-6)";
    - the Lean-name chip, title "The Lean name the new assumption would get".
- **Lifecycle.** The buttons are enabled only when `run.state==='review'` and nothing is busy.
  - **"I hold this"**, title "Adopt it as your assumption (worded by Claude; it stays marked as Claude's wording). Claude then proves the goal with it.", leads to the input "Why do you hold it? (optional)" with **"Adopt"** and **"Cancel"**. Adopt posts `adoptGhost`. The host (`manager.adoptGhostNow :1530-1613`) then:
    1. writes an ASSUMPTION block (`worded_by: agent`) and its `abbrev` and `.holds` axiom before the target, and appends the card to the target's `premises:`;
    2. commits `adopt`;
    3. re-freezes with the ghost selected; if that fails it reverts and stays in review;
    4. starts a new round in the prove stage: the proposal is withdrawn and the run state becomes `working`.
    In the next proposal the adopted ghost is a "+ new" card **and** a Statement N step in Claude's style.
  - **"No"** (title "You do not hold it", "Rejecting…") posts `rejectGhost`. The host (`:1615-1628`) sets `state='rejected'` in the run and in the shown proposal and writes the activity line "You declined ghost-N: “…”." The ghost disappears and **the proposal stays open**. **Claude is not told, and nothing stops it re-suggesting the same premise in a later round** (only Lean-name uniqueness is checked).
  - If the user does neither and presses Accept, the ghost is simply not written: it is never in the files.
  - No round filtering: a ghost suggested in round k stays "suggested", with its "checked" chip, through later Feedback rounds.
- **How it differs from Statement N.** A Statement step is a meaning check on a formalisation that is **in** the proposal's files and that Accept writes; it has no per-item control. A ghost is a **new belief** that is **not** in the files; it has its own adopt/reject decision, and adoption triggers a new proof round.

## 4. The Current / Proposed board views

- **Toggles:**
  - the banner's segmented "**Current** | **Proposed**" (`role=radiogroup`, aria "Board shows", `ProposalBanner.tsx:35-42`) → `setProposedView` (`store.ts:1453-1459`);
  - "Review…" (opens the panel and Proposed);
  - "Show on the board";
  - automatically when a fresh proposal arrives.
- **Leaves Proposed** when the run leaves review (`applyRun :945`), when the proposal becomes null, or on an add through the A|D|G box (`addNode` sets `proposedView:false`, `:1290`).
- **The Proposed overlay** (`run.ts buildOverlay :595-631`): the shadow's subject graph; plus current cards the proposal removes, kept and marked "− removed" (struck through); plus removed vocabulary; plus the proposal's edges.
- **Diff badge** (`NodeCard.tsx:33-42`): a glyph and a word, "+ new" / "~ changed" / "− removed", with a git-coloured halo.
  - Tooltips: "New in the proposal" / "Removed by the proposal" / "Changed in the proposal: <fields>", where the fields are sentence, kind, Lean statement, proof, premises, status, Lean binding, other fields. Proof and status are left out while the result is hidden.
- **Vocabulary group:** per-item diff marks, a header "**+N new**" (title "Vocabulary the proposal adds") and an automatic open.
- **Result hiding** (D-19), applied to the target and to every added card or card whose proof changed:
  - the chip "**result after the review**";
  - verified arrows into those cards are removed;
  - CardDetails shows "What its proof rests on is shown after you have reviewed the statements."
- **Not shown in Proposed:** the board's diagnostics.
- **Diff semantics:** `diffGraphs(currentRealGraph, shadowGraph)` (`core/src/proposal/diff.ts`).
  - G5 forbids Claude adding or removing blocks or changing markup fields, and G3 `existing-changed` forbids changing pre-run declarations. So "+ new" cards come only from adopted ghosts, and "~ changed" means Lean code (statement, proof, status, binding) or premises from an adoption.
  - Cards the user adds to the real board during the run would presumably show as "− removed" (inferred; see uncertainties).
- **Editability:**
  - **Proposed is read-only**:
    - a click does not select (`NodeCard.tsx:139-141`), there is no drag (`:101,106`), no inline edit (`:83`), only Enter to expand (`:146-153`), and chip actions are off (`:268`);
    - CardDetails replaces the stance/source chips and Make/Edit/Delete with "**This is Claude’s proposal (read-only): switch the board to “Current” to edit your cards.**" (`CardDetails.tsx:358-365`);
    - still possible: expand, Copy Lean, "Open in editor" (this opens the *real* file at the proposal's location), ghost buttons, the Vocabulary toggle.
  - **Current is fully editable at all times**, including during a run and during review (D-16): F2/Edit sentence, Add/Edit why, stance/source chips, Make <kind>, Delete, drag, the A|D|G box. These edits are drift that Accept rebases and re-gates.
  - The tray's run buttons are disabled throughout review: "Claude's proposal… is waiting for your review: accept, give feedback or discard it first." (`run.ts trayRunBlock :45-58`).

## 5. Feedback, Discard and Accept from the UI, and what happens to declined items

- **Feedback:** `sendFeedback` (`store.ts:1516-1523`) → `feedback`. The host (`manager.feedbackNow :1490-1506`):
  - resolves the attempt as `superseded`;
  - `startNewRound('formalise')`: round+1, caps reset, freeze cleared, proposal withdrawn;
  - posts the notice "Round N: your feedback was sent to Claude.";
  - sends Claude `feedbackTurn` (`run/prompts.ts:246-253`). **Every statement may change**, including the ones the user was happy with: there is no memory of approvals.
- **Discard:** `discardProposal` (`:1545-1550`) → host `discardNow` (`:1459-1473`): resolves `discarded` and ends the run. The panel shows "Discarded: your files were not changed." and "Dismiss".
- **Accept:** see 1.9. The panel then shows "Accepted: Claude’s changes are in your files. Undo (Ctrl+Z) or History reverts them." or "Recorded: nothing in your files changed; the outcome is in the card’s Attempts." (`run.ts ENDED_TEXT :280-286`).
- **Declined items:**
  - a ghost "No" is marked rejected (above);
  - a definition "No…" lives only in webview state: it blocks Accept and prefills Feedback, and the host never sees it;
  - vocabulary "Revoke…" prefills Feedback, and Accept still includes the item;
  - a statement has no decline at all: only Feedback or Discard;
  - a lifecycle item that is unticked is not applied;
  - an assumed-without-asking item uses "Ask me instead" to prefill Feedback.

## 6. Per-item granularity today

The only true per-item inclusion controls are the **lifecycle ticks** and the **ghost adopt/reject** decisions. Definitions are per-item yes/no, but **all of them** must be yes (there is no partial Accept). Statements, vocabulary and proofs are whole-proposal. Accept is all-or-nothing (D-21: "Accept is all-or-nothing (node-level partial accept comes later)", 02_design_decisions.md:350; user-guide 10.14 "Accept takes the whole proposal (no partial Accept)"). The new spec is essentially that deferred "later" feature.

## 7. Docs versus code (the code is authoritative)

1. User guide 10.8, m2-plan 6.4 and D-19 say "sentence beside its Lean". The code puts the sentence above the Lean (`Review.tsx:39`). project-report 2.4.10 already notes this.
2. User guide 10.8: "Fully explicit shows every name in full". Real Lean prints fully qualified names in both forms, so only the notation, implicit arguments, universes and coercions differ.
3. User guide 10.8 item 2: "sorts, predicates and constants". The code also includes functions. The UI lead says "Plain types, predicates and constants".
4. The UI lead says "(revoking sends Feedback)". The code only prefills the draft; the user must press "Send feedback".
5. project-report 2.4.10 says the button is "Show the proof result now". That is the tooltip; the label is "Show result".
6. Ghost cards on the board ignore the D-19 reveal (`GhostCards.tsx` has no `revealed` check), while the panel shows them only after the reveal. A suggestion usually implies "not proved", so this is a small leak of the result.

## 8. Facts just outside this area that matter for the spec

- **G5 and G3 forbid every Claude edit of cards:**
  - core `gate/rules.ts markupFindings :836-945`: a removed block gets ``removed: never add or delete blocks``, natural_name and rationale must stay "byte-identical", and any other field change is refused;
  - `existing-changed`: every declaration of B other than T.holds is unchanged (docs/project-report.md:1739-1742).
  So "Change <card>", "Delete <card>" and Claude-created "Add <card>" are new capabilities. "changed statement" is effectively unreachable in a proposal that passed the gate.
- **Naming clash.** "freeze" already means the per-round statement freeze: `freeze_statements`, `RunView.frozen`, G4 "frozen before the proof", the commit labels "Statements frozen (round N)", the activity kind 'freeze'.
- **Existing visual tokens** (`styles/board.css`):
  - the blue formalised aura `--tl-aura` (`:18`, `:349-351`);
  - diff halos in git green, amber and red (`:28-36`, `:1472-1476`);
  - the selection outline (focusBorder, `:343-347`);
  - the orange flash highlight (`:21`);
  - kind colours A purple, D green, G orange (`:15-17`);
  - ghost cards translucent with a purple bar (`:1484-1505`).
  A FROZEN aura must avoid all of these.
- **The run and session model.** One active run per model root. Each run has a target and premises. Rounds: the first, plus one per Feedback, plus one per adoption.

## 9. Context for user question 3 (definitions on the board; not asked of this area)

Definitions are not cards. On the board they appear:
- in the Vocabulary group at the top of the Assumptions column (collapsed by default), section "Definitions" (`labels.ts:61-71`), with the chip "definition on a statement path" (title "A definition your statements rely on (D-4: needs your endorsement)");
- as the chip "definitional choice" on a card whose statement uses one (`cardData.ts:168`);
- in the cards' "uses:" line.

Presuppositions appear as chips in the "Presuppositions" section, for example "assumes characters exist".

## spec_interactions

- **EDIT SESSIONS 1-3 / REVIEW STAGE 6 (session = stages; submit review; exit)** — current: A 'run' (RunView) is the session. Each round's proposal in run.state 'review' is the review stage. The end-of-stage actions are Feedback (free text, new round), Accept (all-or-nothing write; ends the run) and Discard (ends the run; no write). Cancel stops a working run. Every run needs a target and premises: it starts from 'These suffice ▶' or 'Self-evident?'.
  - files: packages/webview/src/run/Review.tsx:264-302; packages/webview/src/state/store.ts:1516-1550; packages/runner/src/run/manager.ts:1459-1522,1645-1750
  - conflict/gap: There is no 'submit review' with per-item results, and no session without a target (a TRANSFORM-initiated session has no counterpart). Mapping: review stage ~ round; exit ~ Discard; successful end ~ Accept of a fully accepted state.
  - safety: The final write must still be one complete state that passed the gate. Today's Accept writes exactly the checked files and re-gates on drift.
- **REVIEW STAGE 1 (Claude proposes changes, new cards, deletions)** — current: G5 forbids Claude adding or removing @@ telelean blocks and changing any markup field (natural_name and rationale are byte-identical). G3 'existing-changed' forbids changing or removing any declaration that existed at run start (B) other than T.holds. So a proposal can contain only: new statements for code-less cards ('Formalize'), new vocabulary, definitions, presuppositions and lemmas, proofs, telelean-written adopted ghosts, and the telelean lifecycle kind change.
  - files: packages/core/src/gate/rules.ts:836-945 (G5), existing-changed (G3; docs/project-report.md:1739-1742); packages/core/src/proposal/diff.ts
  - conflict/gap: 'Change <card>' beyond formalising, 'Delete <card>' and Claude-created 'Add <card>' are impossible today; they need a redesign of G3/G5. The '− removed' diff marks can currently arise only from cards the user added to the real board during the run, which looks like a spurious mark.
  - safety: High. Today's soundness rests on 'Claude never changes the user's words or existing declarations; new beliefs only through user adoption'. A replacement invariant is needed: every difference from B is covered by an item the user explicitly accepted, checked mechanically by the gate.
- **REVIEW STAGE 2 (scrollable list labelled Add/Change/Delete/Formalize <card>; status table)** — current: A wrapping row of pills, one step body at a time, and Back/Next. The labels are 'Statement N' (or 'Statement'), 'New vocabulary', 'Definitions (N)', 'Result', 'Card changes'. Progress reads 'Step i of n: label'. There is no per-step status.
  - files: packages/webview/src/run/Review.tsx:22-25,304-383; packages/webview/src/model/run.ts:466-497; packages/runner/src/proposal/service.ts:211-239
  - conflict/gap: Mapping: Formalize ~ StatementReview.change 'new' on an existing card; an adopted ghost is also 'new' today but would be 'Add'; 'changed' ~ Change (effectively unreachable today); lifecycle 'Make … a Derivation' ~ Change (kind). The 'Result' step (report card: verdict, footprint, unused premises, assumed without asking with 'Ask me instead', gate attempts, files) has no place in the spec, and neither do proofs (they are not review items).
  - safety: D-19 'meaning before proof status' hides proof results until the statements are reviewed. The spec does not say whether the list or status table may show proof status beside the statements (automation bias).
- **REVIEW STAGE 2 ('one item for all the vocabulary')** — current: VocabularyReview is already a single item, but it covers only pure-signature items (sort/predicate/function/constant). These are auto-approved, and revocable only by a prefilled Feedback. Definitions on a statement path and new presupposition axioms are separate DefinitionQuestions, each needing 'Yes, I endorse it'; Accept is blocked until all are yes. Off-path definitions and lemmas get no review item, only '+ new' in the Proposed view's Vocabulary group.
  - files: packages/runner/src/proposal/service.ts:59,170-182,256-263; packages/core/src/gate/rules.ts:808-834; packages/webview/src/run/Review.tsx:90-169
  - conflict/gap: The spec does not say whether definitions and existence assumptions go into the single vocabulary item or get items of their own.
  - safety: High. The UI's own rule is 'A definition can quietly carry a belief, so Accept needs your yes for each'. A presupposition (e.g. T.exists) is an axiom, that is, a belief. Bundling them into one vocabulary accept (or a group accept) would weaken the per-item endorsement. Recommend keeping each definition and presupposition as its own item.
- **REVIEW STAGE 2 ('Claude suggests' treated as regular new cards with their own entries)** — current: A ghost is not a card and not in the proposal's files. It is checked in a scratch file (selected premises + ghost ⊢ target). It is shown translucent at the top of the Assumptions column (Proposed view only; no data-node-id; not selectable) and in the report card after the reveal. 'I hold this' makes telelean write the card (worded_by agent) and the target's premises:, re-freeze with the ghost selected, and start a new round. 'No' marks it rejected; Claude is not told.
  - files: packages/webview/src/run/GhostSuggestion.tsx; packages/webview/src/board/GhostCards.tsx; packages/runner/src/run/manager.ts:1530-1628,2092-2139; packages/runner/src/gate/scratch.ts:49-67
  - conflict/gap: If suggestions become 'Add <card>' items inside the proposal files, the round's proof could rest on an assumption nobody has accepted yet. Ghosts cannot be selected or TRANSFORMed today. A suggested ghost is not invalidated when a later round changes the statements: its 'closes the gap (checked)' chip can be stale.
  - safety: High. A Claude-created ASSUMPTION's .holds must stay out of the permitted set until it is explicitly accepted. A verdict that rests on a pending Add must be shown as conditional and recomputed if the Add is declined. Today: G3 new-axiom, plus adoption followed by a re-freeze.
- **REVIEW STAGE 3 (per-item accept/decline; accepted ⇒ FROZEN; cannot end while any item is 'in review')** — current: No per-item accept, except definitions (yes/no, all must be yes), lifecycle ticks and ghost adopt/reject. Accept is all-or-nothing (D-21; 'node-level partial accept comes later'). The review state (ReviewUi) is webview memory only, lost on reload, and the host records no endorsements.
  - files: packages/webview/src/state/store.ts:77-86,236-254,582-597; packages/runner/src/run/manager.ts:1645-1652
  - conflict/gap: Item statuses must live and be enforced on the host side, in run.json and in a gate rule (like existing-changed/G5) that compares against an 'accepted snapshot'. They must also be bound to exact content (a hash), so that 'accepted' never carries over to changed text in the next stage.
  - safety: The webview is untrusted (protocol.ts header). A status that exists only in the UI cannot guarantee 'Claude can never edit a frozen card'.
- **REVIEW STAGE 4 (multi-select; group accept/decline; multi-card TRANSFORM)** — current: The Proposed view is read-only: a click does not select (NodeCard.tsx:139-141); there is no drag or edit. Ghost cards and vocabulary items are not selectable. Review steps are not selectable. Selection is a list of card ids on the Current graph only.
  - files: packages/webview/src/board/NodeCard.tsx:83,101,106,139-153; packages/webview/src/state/store.ts:1123-1145,1453-1459
  - conflict/gap: Selecting, and group actions, inside the review view or Proposed view need new UI and state.
  - safety: A group accept could sweep in belief-carrying items (definitions, presuppositions, new assumptions). Consider excluding them from group accept or requiring per-item confirmation.
- **REVIEW STAGE 5 ('These suffice' during a review stage)** — current: The tray's run buttons are disabled for any active run, review included: "Claude's proposal… is waiting for your review: accept, give feedback or discard it first." There is at most one run per model root, and the tray works on the Current graph.
  - files: packages/webview/src/model/run.ts:45-58; packages/webview/src/tray/SelectionTray.tsx:78-221; packages/webview/src/state/store.ts:1384-1393
  - conflict/gap: No in-session 'These suffice' exists. It would need a new round that still goes through formalise, freeze_statements, prove and the gate.
  - safety: The statement freeze before proving (D-19, checked by the G4 comparator) must still apply to a mid-session inference.
- **REVIEW STAGE 6 (Claude acts on non-accepted items, then the next stage)** — current: Feedback is free text. The next round restarts in the 'formalise' stage with the statement freeze cleared, so Claude may revise any statement, including ones the user was happy with. Feedback is the only channel for a definition 'No…', vocabulary 'Revoke…' and 'Ask me instead'; each only prefills the draft.
  - files: packages/webview/src/state/store.ts:1484-1523; packages/runner/src/run/prompts.ts:246-253; packages/runner/src/run/manager.ts:1490-1522
  - conflict/gap: Nothing structured tells Claude which items were accepted or declined, or why. The prefilled sentences are the only per-item signal.
  - safety: Without mechanical freezing, Claude can silently change already-approved statements in the next round. Today a new review of every new statement covers this.
- **REVIEW STAGE 7-8 (restore frozen state at session end; confirmation popup listing auto freeze/unfreeze)** — current: There is no user-level freeze. The run's statement freeze never touches the user's files. Accept, Discard, Cancel and Stop have no confirmation dialog, only tooltips (acceptTitle) and afterwards the outcome line or toast. The DialogState kinds are dependents, rationale, delete and revert.
  - files: packages/webview/src/run/Review.tsx:272-293; packages/webview/src/run/ProposalBanner.tsx:55-73; packages/webview/src/model/run.ts:280-286,328-332
  - conflict/gap: A new confirmation dialog is needed, plus durable storage of the pre-session frozen map.
  - safety: Low directly. Restoring state after a crash must be durable on the host side.
- **DECLINE OPTIONS 1 (don't create this card for the rest of the session: blacklist)** — current: Ghost 'No' sets the state to 'rejected'; it disappears from the board and report card and the proposal stays open. Claude is not told, and propose_assumption does not refuse a previously rejected statement (only Lean-name uniqueness is checked). Nothing else can be blacklisted.
  - files: packages/runner/src/run/manager.ts:1615-1628,2092-2139
  - conflict/gap: A blacklist has to be enforced on the host side, for example by refusing a matching Add or propose_assumption. Today nothing enforces one.
  - safety: Medium: it stops beliefs the user declined from being re-proposed.
- **DECLINE OPTIONS 2 (Adjust → TRANSFORM)** — current: Only free-text Feedback, prefilled per item: ``I don't endorse the definition `X` (“…”): `` / ``Please don't add the vocabulary item `X` (“…”): `` / 'You assumed this without asking: “…”. Please ask me about it instead of assuming it.'
  - files: packages/webview/src/run/Review.tsx:86-88; packages/webview/src/state/store.ts:1489-1492; packages/webview/src/run/ReportCard.tsx:44-46
  - conflict/gap: There is no structured edit of a proposed item. The Proposed view and review are read-only.
  - safety: Fields the user fills in must be recorded as the user's words (provenance), and fuzzy fields that Claude fills in as Claude's (worded_by agent).
- **DECLINE OPTIONS 3 (shaky; no exact regeneration)** — current: Nothing like it. Feedback rounds let Claude reproduce anything.
  - files: packages/runner/src/run/manager.ts:1490-1522
  - conflict/gap: Needs a mechanical comparison on the host side between the previous shaky configuration and the new one.
  - safety: Low (a usability constraint), but it should be enforced by the host, not by the prompt.
- **TRANSFORM 9-10 (any card including 'Claude suggests' and Vocabulary; no edits to Depends on / Used by)** — current: Ghosts are not cards (no data-node-id; stopPropagation). Vocabulary items are boxes in the Vocabulary group with code, Used by and Open in editor, and are not editable. 'Depends on' and 'Used by' are computed (CardDetails Relations).
  - files: packages/webview/src/board/GhostCards.tsx; packages/webview/src/board/VocabularyGroup.tsx; packages/webview/src/board/CardDetails.tsx:39-75,353-356
  - conflict/gap: Ghosts and vocabulary need to become selectable and transformable entities.
  - safety: Editing vocabulary changes the meaning of every statement that uses it. Dependents' items should go back to 'in review'.
- **FROZEN 1 (aura must not clash with the Lean-formalisation aura) and the name 'FROZEN'** — current: Existing visuals: the blue formalised aura (--tl-aura, charts-blue); git green, amber and red diff halos in the Proposed view; the selection outline (focusBorder); the orange flash highlight; kind colours A purple, D green, G orange; translucent ghost cards with a purple bar. 'Freeze' already names the per-round statement freeze: freeze_statements, RunView.frozen, G4 'frozen before the proof', the commit 'Statements frozen (round N)', the activity kind 'freeze' (lock icon).
  - files: packages/webview/src/styles/board.css:15-36,343-351,1454-1505; packages/core/src/run.ts:132,301-302; packages/webview/src/model/run.ts:366
  - conflict/gap: The spec's FROZEN collides in name with the existing freeze_statements concept, and its aura must avoid every colour above.
  - safety: Confusing the user-level lock with the proof-time statement freeze could mislead the user about what is guaranteed. Recommend a distinct term (e.g. 'Locked').
- **FROZEN 2-3 (Claude never edits a frozen card, enforced mechanically; unfreeze only by the user)** — current: The existing mechanical analogues are G5 (user's words and markup untouched), G3 existing-changed (B's declarations untouched) and G4 (lake comparator against the round's freeze). None of them is driven by user-chosen per-card or per-field locks.
  - files: packages/core/src/gate/rules.ts; packages/runner/src/run/manager.ts
  - conflict/gap: Needs a new gate rule against a user-lock snapshot, and a channel for Claude to request an unfreeze (ask_user or a new tool).
  - safety: High. It must be a rule in the gate, never a prompt instruction. It also interacts with proofs: a frozen target proof can break when a premise is unfrozen and changed, so the final Accept must re-gate everything.
- **FROZEN 4-5 (select cards or fields and freeze/unfreeze at ALL times in ALL interfaces)** — current: Selection is card ids only, on the Current view only. The Proposed view, review steps, ghost cards and vocabulary items cannot be selected. Fields cannot be selected at all.
  - files: packages/webview/src/state/store.ts:208-223,1123-1145; packages/webview/src/board/NodeCard.tsx:139-153
  - conflict/gap: Needs field-level selection and selection inside the review panel and Proposed view.
  - safety: Low directly.
- **INITIATING EDIT SESSIONS 3 (no direct field edits on the 'Current' tab)** — current: Current is fully editable at all times, including during a run and during review (D-16: the A|D|G box works during a run; D-21 'Hand edits are authoritative'). Edits during a run count as drift: Accept rebases (3-way, no fuzz) and re-freezes and re-gates. Proposed is read-only.
  - files: packages/webview/src/board/NodeCard.tsx:144-181; packages/webview/src/board/CardDetails.tsx:237-316; packages/webview/src/state/store.ts:1270-1305; packages/runner/src/run/manager.ts:1661-1721
  - conflict/gap: This contradicts D-16 and D-21 and the current UX (F2/Edit, Add why, stance/source chips, Make <kind>, Delete, drag, the A|D|G box). VS Code's text editor can still change the files, so drift handling must remain.
  - safety: Keep the drift re-gate at Accept whatever the UI allows.
- **REFERENCE SYSTEM ('#' references)** — current: The Feedback composer is a plain textarea (maximum 4000). Prefills name items with backtick Lean names. No mention or reference picker exists anywhere in the run UI.
  - files: packages/webview/src/run/Review.tsx:215-261
  - conflict/gap: New feature. The Feedback composer and the TRANSFORM prose box are the natural hosts.
  - safety: None directly. References inside the prompt text must be resolved by the host into exact ids or names.

## safety_invariants

- **Every definition question (a new definition on a statement path, or a new presupposition/existence axiom) needs an explicit per-item 'Yes, I endorse it' before Accept. A 'no' can never be accepted; it is Feedback.** — enforced: UI: packages/webview/src/model/run.ts:500-502 (definitionsApproved), Review.tsx:267-298, ProposalBanner.tsx:24,59, store.ts:1529. Host: packages/runner/src/run/manager.ts:1651-1652. Producer: packages/core/src/gate/rules.ts:808-834.
  - spec could break it: 'One item for all the vocabulary' and group accept (REVIEW STAGE 4) could endorse belief-carrying definitions and existence axioms in bulk, without individual attention.
- **Accept writes exactly a state that passed the gate (the checked files plus ticked lifecycle items), never part of a proposal. If the user's files drifted, Claude's changes are rebased and re-frozen and re-gated first.** — enforced: packages/runner/src/run/manager.ts:1087-1098 (post-finish edits discarded), 1645-1750; packages/runner/src/proposal/service.ts:303-398; packages/core/src/run.ts:451.
  - spec could break it: Per-item accept or decline tempts splicing accepted pieces into the real files. The final write must instead be a whole state that the gate re-checked after Claude removed the declined items.
- **A new belief (an ASSUMPTION or its .holds axiom) enters only by explicit user adoption. Claude cannot add blocks or .holds axioms for cards that are not selected. A suggestion is checked only in a scratch file and joins the permitted set only after adoption and a re-freeze.** — enforced: packages/core/src/gate/rules.ts:836-945 (G5, no new blocks except teleleanBlocks) and G3 new-axiom; packages/runner/src/gate/scratch.ts:49-67; packages/runner/src/run/manager.ts:1530-1613.
  - spec could break it: Treating 'Claude suggests' as regular 'Add' cards inside the proposal could let a proof rest on an assumption nobody has accepted, or let a TRANSFORM autofill (fuzzy fields) create beliefs.
- **Claude never changes the user's words or markup (natural_name, rationale, fields, ids, lean lines, notes) and never changes or removes any declaration that existed at run start (other than T.holds).** — enforced: packages/core/src/gate/rules.ts:836-945 (G5 'your words untouched'); G3 'existing-changed' (docs/project-report.md:1739-1742).
  - spec could break it: 'Change <card>' and 'Delete <card>' items and TRANSFORM need these rules relaxed. Without a replacement 'every difference is covered by an accepted item' check, unreviewed edits could slip through.
- **Statements are frozen before proving in each round (D-19). The proved statement must equal the frozen one (G4 lake comparator). Feedback reopens formalising and requires a new freeze.** — enforced: packages/runner/src/gate/engine.ts (freeze, gate G4); packages/runner/src/run/manager.ts:1509-1522 (startNewRound clears the freeze); packages/core/src/run.ts:132,301-302.
  - spec could break it: The spec's 'FROZEN' collides in name with this mechanism. A mid-review 'These suffice' that edits the Lean immediately must not skip the formalise → freeze → prove sequence.
- **Meaning before proof status (D-19): proof results stay hidden until the user steps past the statements or presses 'Show result'.** — enforced: packages/webview/src/model/run.ts:595-631 (buildOverlay hidden set), 224-236 (runStateLabel); packages/webview/src/board/NodeCard.tsx:22-27,122-127; packages/webview/src/board/CardDetails.tsx:159-168; packages/webview/src/run/Review.tsx:171-184; packages/webview/src/state/store.ts:1461-1473. (Small leak: ghost cards on the board ignore the reveal.)
  - spec could break it: A scrollable list with a status table and per-item accept, with no mention of the report card, may show 'proved' beside statements or drop the ordering. That invites automation bias.
- **Accept names the exact proposal reviewed. A rebuilt proposal gets a new id, and Accept of a replaced proposal is refused.** — enforced: packages/webview/src/state/store.ts:1528; packages/runner/src/run/manager.ts:1650; packages/core/src/run.ts:454.
  - spec could break it: Per-item 'accepted' statuses that carry across stages must be bound to exact content (a hash), or acceptance could silently transfer to changed text.
- **A lifecycle change (GOAL → DERIVATION) is never silent: it is applied only when ticked (D-21).** — enforced: packages/webview/src/model/run.ts:505-518; packages/runner/src/proposal/service.ts:306-311,358-375.
  - spec could break it: If it becomes a 'Change <card>' item, its acceptance must remain explicit and must not be swept up by a default or group accept.
- **The webview is untrusted. The host validates every message (tokens, lengths, LIMITS.reviewItems) and the runner re-checks every precondition. The review state in the webview is advisory only.** — enforced: packages/core/src/protocol.ts:258-277,649-676 and header comment; packages/runner/src/run/manager.ts:1645-1660.
  - spec could break it: If accepted/declined/FROZEN statuses lived only in the webview store, as today's ReviewUi does (in memory, lost on reload), 'Claude can never edit a frozen card' would not be mechanically guaranteed.
- **Provenance: Claude's words are always shown in italics with a marker. Adopted cards keep worded_by: agent and '(Claude's wording)' until the user edits them.** — enforced: packages/webview/src/common/AgentText.tsx; packages/webview/src/board/NodeCard.tsx:226-229; packages/runner/src/run/manager.ts:1548-1557 (planGhostAdoption).
  - spec could break it: TRANSFORM 'fuzzy' fields that Claude autofills, and Claude-created 'Add' cards, must keep agent provenance. Field-level FROZEN must not be read as user authorship.
- **The Proposed view is read-only. Nothing on the board edits Claude's proposal directly.** — enforced: packages/webview/src/board/NodeCard.tsx:83,101,106,139-153,268; packages/webview/src/board/CardDetails.tsx:358-365; packages/webview/src/state/store.ts:1453-1459.
  - spec could break it: TRANSFORM and in-review edits make proposal content editable. Those edits must go through the host and gate as user-authored and locked, not straight into the shadow.

## answers

Q1. What does the "Fully explicit" checkbox do?
It appears in each "Statement N" step of the review, under the box labelled "Lean statement <name>". Its tooltip reads "No notation, every argument and universe shown, no coercion arrows". It switches that box between two printouts of the same Lean statement. Both are produced by Lean itself from Claude's working copy after the round, not written by Claude:
- Normal: Lean's default printing, `#print <statement>`.
- Fully explicit: the same `#print` with these options set: `pp.explicit true` (hidden arguments shown with @), `pp.notation false` (symbols written as the functions they stand for), `pp.universes true` (universe levels shown) and `pp.coercions false` (type conversions shown as explicit functions instead of ↑). The options are fixed in `packages/runner/src/gate/scratch.ts:112`; the forms are built in `proposal/service.ts:224-233`.

The visible effect: `¬P` becomes `Not (P)`, `∧/∨/↔` become `And/Or/Iff`, `∃ x, …` becomes `Exists fun x => …`, and `a = b` becomes `@Eq T a b`, which shows the type T. A real example from the tests: `… → ¬Spyro.InGame c g` versus `… → Not (Spyro.InGame c g)`. Names are fully qualified in both forms. The user guide's "every name in full" is not actually a difference.

When it helps: when notation could hide what the Lean says. Examples are what a `¬` covers, how ∧, ∨ and → group, the order of quantifiers, the type an equality or numeral is taken at, and hidden conversions or instance choices. With telelean's simple vocabulary rule, hidden arguments, universes and conversions rarely occur, so in practice it mostly spells out the logical symbols.

What it does not do:
- It changes only the display, one statement at a time. It is off by default, resets for every new proposal (and on a webview reload), sends nothing and does not affect Accept.
- It exists only on Statement steps. Definitions, vocabulary and suggestions show their raw source.
- If Lean could not print a statement, both forms fall back to the source text, and the toggle shows no change.

Its purpose (design decision D-19) is the faithfulness check the step asks: "Does the Lean say what the sentence says?".

Q2. "Claude suggests" cards versus "Statement 1", "Statement 2", … in the review.
- "Statement N" is one review step per card whose Lean statement is new (or changed) in this run. Usually these are the target and the selected premises that Claude formalised, plus, in the round after you adopt a suggestion, that adopted card. The step shows your sentence above Claude's Lean, the "Fully explicit" toggle, "It uses" and "Show on the board". It is part of the proposal's files: Accept writes it. It has no accept or decline button of its own. It is a reading check, and if the Lean is wrong your only recourse is Feedback (a new round in which statements may change) or Discard.
- "Claude suggests" is a premise Claude thinks is missing: a new belief you might hold. It is usually offered when the target did not follow from your premises. Claude proposes it after the statements were frozen, and telelean checks in a separate scratch file, never in the files, that your selected premises plus this suggestion prove the target. That check gives the chip "closes the gap (checked)". The chip "gives the goal on its own: it may simply restate it" appears when your premises weren't needed. Both its sentence and its Lean are Claude's words.
  - It is not in the proposal's files, and Accept never writes it.
  - It appears as a translucent card at the top of the Assumptions column in the Proposed view (not a real card: you cannot select it and no arrows attach to it), and under "Premises Claude suggests" in the review's Result step.
  - It has its own decision. "I hold this" (an optional reason, then "Adopt") has telelean write it into Claude's working copy as your Assumption, worded by Claude. telelean also adds it to the target's premises and freezes the statements again, and a new round starts in which Claude proves the target with it; the current proposal is withdrawn. "No" declines it: the card disappears, the proposal stays open, and Claude is not told.
  - After adoption, the next round shows the adopted card as "+ new" on the board and as one of the "Statement N" steps, in Claude's italic style.
- In short: a Statement step asks "is this formalisation of a card faithful?" about content Accept will write. A "Claude suggests" card asks "do you believe this extra premise?". Saying yes changes your premise set and starts another proof round.

## uncertainties

- Nothing was run: every behaviour above comes from reading the code and the existing tests (unit, e2e and the runner's real-Lean engine test). It has not been confirmed in a live VS Code session.
- 'changed statement' (StatementReview.change === 'changed') looks unreachable in a proposal that passed the gate, because G3 'existing-changed' freezes every pre-run declaration. I did not find a test confirming either way.
- Cards the user adds to the real board while a run is going would presumably show as '− removed' in the Proposed view: the diff compares the current real graph with the shadow graph, and Accept's merge keeps them. This is inferred from core/src/proposal/diff.ts and manager.buildProposal, not verified.
- 'Open in editor' on a card in the Proposed view probably opens the user's real file at the location from the proposal's (shadow's) graph, which may point at the wrong lines. This is inferred from LeanCode.tsx:73 and not verified.
- A ghost suggested in an earlier round remains 'suggested', with its 'closes the gap (checked)' chip, after a Feedback round that may have changed the statements: no round filter exists in suggestedGhosts or the runner. Adoption re-freezes and the gate re-checks the proof, so this looks like a possibly stale display rather than a soundness hole.
- ResultStep's hidden branch ('The result is shown after the statements…') appears unreachable through normal navigation, because reaching any step after the statements reveals the result. I may have missed an edge case where step indices shift.
- How often implicit arguments, universes and coercions actually show in the Fully explicit form depends on the vocabulary rules. My claim that it is 'mostly notation in practice' rests on user-guide 10.14 (built-in types in signatures are refused; numerals allowed) and the test fixtures, not on a survey of real models.
- That rejecting a ghost is never communicated to Claude in later rounds is based on rejectGhost (manager.ts:1615-1628) sending no turn, and feedbackTurn containing only the user's text. I did not check whether the context bundle of a later round lists rejected ghosts.
