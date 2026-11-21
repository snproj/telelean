# Edit sessions: revised specification (proposal for your approval)

**Status:** a proposal. Nothing is implemented. It rewrites your specification of 2026-11-18 (`bundle_20/prompt20.md`), checked against the current code by six read-only agents (`bundle_20/subagent_reports/`).

**How to read it.**
- Every clause has an ID (e.g. `FZ-5`), so you can approve or amend by number.
- The tag after a clause says where it came from:
  - *(yours: REVIEW 3)*: your clause, reworded only;
  - *(clarified: …)*: your clause, with an ambiguity resolved or an edge case filled in;
  - *(changed: …)*: differs in substance from your text; every one is listed with its reason in §15;
  - *(new)*: added by me.
- **★** marks a decision I need from you (§14).
- The order follows a session's life: first the building blocks (cards and fields, FROZEN, the Context Menu), then a session from start to end.

---

## 0. Purpose *(yours: preamble)*

Give you granular, systematic control over the cards and over every change to them, and reduce special cases: every card gets the same base capabilities.

## 1. Terms *(new)*

| Term | Meaning |
|---|---|
| **Card** | Anything on the board: an ASSUMPTION, DERIVATION or GOAL card, or a **vocabulary card** (a type, predicate, function, constant, definition, presupposition, lemma …). |
| **Field** | An editable part of a card (§2). |
| **Derived information** | What telelean computes from Lean and the graph: status, Depends on, Used by, Uses, Rests on, arrows. Never editable, never frozen. |
| **Frozen** | A field or card that Claude may not change (§3). |
| **Held** | Not frozen itself, but something a frozen card relies on, so Claude may not change it either (FZ-5). |
| **Fuzzy** | A field with no value yet, which Claude is to fill in (§6). |
| **Edit session** | A sequence of Claude steps and review stages, worked on a private copy of your model. Your files change only when it ends successfully (§5). |
| **Claude step** | One stretch of Claude's work inside a session. It ends with proposed changes. "Claude" means whichever LLM telelean is set up with. |
| **Review stage** | Your pass over those proposed changes, one **review item** per change (§7). |
| **Belief item** | A review item that would make the model assume something new (RV-7). |
| **Transform** | The window where you propose turning a set of cards into another set (§6). |
| **Context Menu** | The toolbar section showing the actions for the current selection (§4). |
| **Reference** | A link to a card or field, typed with `#` (§10). |
| **Apply** | Writing a finished session's changes to your files (EN-3). It replaces today's "Accept" button. |

## 2. Cards and fields *(new; makes your "sensible fields" (TRANSFORM 10) precise)*

- **CF-1** Every card has the same base capabilities: select it (or any of its fields), freeze or unfreeze it, reference it with `#`, and transform it.
- **CF-2** Editable fields:

  | Card | Fields |
  |---|---|
  | ASSUMPTION | Sentence · Kind · Why · Stance · Source · Lean statement |
  | DERIVATION, GOAL | Sentence · Kind · Why · Stance · Source · Lean statement · Proof |
  | Vocabulary | Lean declaration (its type, or its body for a definition) · Gloss |

  An assumption's `.holds` axiom is not a field: telelean writes it from the Lean statement.
- **CF-3** Not editable (derived, or kept by telelean): status, Depends on (your declared premises plus what Lean found), Used by, Uses, Rests on, arrows, attempts, ids, provenance. *(yours: TRANSFORM 10)*
- **CF-4** **Kind** is a field, so moving a card between columns (e.g. GOAL → DERIVATION) is a field change. *(new)*
- **CF-5** Vocabulary stays computed from Lean, with no markup of its own, as decided in D-3. A vocabulary card is identified by its Lean name. It keeps its box look in the Vocabulary group, so that it does not read as a belief. *(clarified: TRANSFORM 9, "Vocabulary cards")*
- **CF-6** Text Claude writes is marked as Claude's wording (italic). telelean sets that mark, never Claude. When you edit the text, it becomes yours. *(new; today the mark wrongly survives your edits)*

## 3. FROZEN

- **FZ-1** Claude cannot change a frozen field. Claude cannot delete a card that has any frozen field. Freezing a card freezes all its fields. *(clarified: FROZEN 1–2)*
- **FZ-2** Freezing an empty field means "keep it empty": Claude may not fill it in. *(new)*
- **FZ-3** Frozen binds Claude only. You can always change a field yourself in a transform; it then stays frozen (TR-6). *(new)*
- **FZ-4 Mechanical, not by asking.** Claude can never change frozen content, under any circumstances. telelean enforces this itself:
  - it keeps the frozen values where Claude cannot see or edit them;
  - it checks every state of Claude's working copy against them, and refuses any state that changes them (with today's retry loop).

  It is never enforced by telling Claude. *(yours: FROZEN 2)*
- **FZ-5 Frozen means the meaning too.** A card can change meaning without its text changing, so Claude may also not change:
  - anything a frozen card's Lean relies on: the vocabulary and definitions its statement or proof uses, directly or indirectly;
  - any card a frozen card's sentence references with `#` (RF-5).

  Nor may Claude add Lean that changes how frozen Lean is read, such as a new instance. These items are **held**: shown with a lighter mark and "held by ‹card›". *(new; safety issue S2)*
- **FZ-6 Unfreeze requests.** If Claude wants to change frozen or held content, it must ask first. A request card says what it wants to change and why, and offers **Select them** and **Keep frozen**. Only you can unfreeze: select the cards or fields and choose **Unfreeze** in the Context Menu. Claude may then change them, because they are no longer frozen, not because you approved something. *(yours: FROZEN 2, REVIEW 5)*
- **FZ-7 Standing and session freezes.**
  - A freeze is **standing** if made outside an edit session; it persists.
  - It is a **session freeze** if made during one: by accepting an item, by starting a session, by filling a field in a transform, by rejecting a change, or by your own Freeze.
  - Unfreezing a standing freeze during a session is a **session unfreeze**.

  *(new; makes EDIT SESSIONS 7 and FROZEN 3 consistent)*
- **FZ-8** When a session starts, telelean records every card's and field's standing state. When it ends, successfully or not, everything returns to that state: session freezes are lifted and session unfreezes are undone. Cards created in the session end up unfrozen. Apart from the optional "keep" ticks of EN-2, this is the only time telelean changes a freeze by itself. *(yours: EDIT SESSIONS 7, FROZEN 3; clarified: new cards)*
- **FZ-9 Always available.**
  - Wherever a card or field is visible (the board's Current and Proposed views, review items, the transform window), you can select it and choose **Freeze**, **Unfreeze**, **Freeze all other cards** or **Unfreeze all other cards** in the Context Menu, at any time, including while Claude is working.
  - "All other cards" means every card of the current subject that contains none of the selected items.
  - Each change shows an Undo toast. Otherwise Undo and History never change freezes.

  *(yours: FROZEN 4–5; clarified)*
- **FZ-10** A freeze made while Claude is working applies to the version you can see. If Claude has already changed that field in its working copy, the change is refused at its next check. *(new; edge case)*
- **FZ-11 Look.**
  - A frozen card gets a solid inner ring and a lock badge; a frozen field shows a small lock; a held item shows a small chain icon.
  - It never uses dashing, translucency or colour alone, because those already mean "declared by you", "suggested" and status (D-15), and it never adds a second glow, which is the blue "has Lean" aura.
  - In high-contrast themes it becomes an inner outline.

  *(yours: FROZEN 1)*
- **FZ-12** The run's existing "statements frozen before proving" step (D-19) is renamed **statements fixed**, with its own icon, so it cannot be confused with FROZEN. *(new; terminology)*

## 4. Selection and the CONTEXT MENU

- **CM-1** A section of the toolbar labelled **Context Menu** shows icons for the actions that fit the current selection. With nothing selected it reads: "Select some items to see possible actions here." *(yours)*
- **CM-2** You can select cards (including vocabulary cards), single fields and review items, with Ctrl-click for several and Esc to clear. A selection may mix them. *(clarified: needed by FROZEN 4)*
- **CM-3** An action that fits only some of the selected items is shown disabled, with the reason on hover. Every icon has a text label on hover. *(new)*
- **CM-4** Actions:

  | Action | Applies to | Notes |
  |---|---|---|
  | Freeze / Unfreeze | cards, fields | everywhere (FZ-9) |
  | Freeze all other cards / Unfreeze all other cards | cards, fields | everywhere (FZ-9) |
  | Transform cards… | cards | starts a session if none is active (ES-3); inside a session, a mid-stage transform (RV-9) |
  | These suffice | premises + goals | as today's tray button; starts a session (ES-2), or runs mid-stage (RV-9) |
  | Accept / Decline… | review items | in a review stage |
  | Copy reference | cards, fields | (§10) |
  | Show on board / Open in editor | cards | |
  | Raw Lean diff… · Exit session | — | while a session is active |

- **CM-5** The selection tray stays, to show what "These suffice" will use (premises ⊢ goal). Its buttons move into the Context Menu. *(new)*

## 5. EDIT SESSIONS

- **ES-1** At most one edit session is active per model folder, on one subject. While one is active, the board has two views: **Current** (your files) and **Proposed** (the session's working state). *(new)*
- **ES-2 Starting with These suffice** (no session active). **★D3**
  - This is a preset transform of the selected cards:
    - every empty Lean statement or Proof field of a selected card is fuzzy;
    - **everything else is session-frozen**: every other card, and the selected cards' existing fields, which keeps today's guarantee that your words and your existing Lean are never changed unless you unfreeze them;
    - Claude may add cards, so that it can propose a missing premise;
    - the instruction is: prove each selected goal from exactly the selected premises.
  - If you select several goals, each is a separate inference with its own premises: one goal's proof may not use another selected goal.
  - Claude starts at once. *(yours: INITIATING 1, EDIT SESSIONS 2; changed: the preset freezes and several goals)*
- **ES-3 Starting with Transform cards…** (one or more cards selected, no session active). Every non-selected card is session-frozen, and the transform window opens on the selected cards (§6). Submitting it starts the first Claude step; cancelling it means no session starts. *(yours: INITIATING 2, EDIT SESSIONS 1; changed: your "transform cards" button and "initiate edit session" option are one action)*
- **ES-4 A Claude step.**
  - Claude works on the session's private copy. Inside the step, today's discipline stays: Claude fixes its statements before it proves (FZ-12).
  - Every check runs as today (the gate), plus the frozen checks of FZ-4/5, with today's loop: up to 3 attempts, then the step rolls back to its last passing state and tells you.
  - A rollback never undoes your decisions (accepted items, transforms, freezes).
  - Claude may ask you questions and make unfreeze requests. **Cancel step** stops it.
  - The step ends in a review stage.

  *(yours: EDIT SESSIONS 2–3; clarified: failures, cancel)*
- **ES-5** Your files change only when the session ends successfully (EN-3). This includes the declared premises that "These suffice" records, which today it writes at the start. *(new; today's guarantee, tightened)*
- **ES-6** A session survives a window reload. *(new)*
- **ES-7** You may still edit Lean files by hand in VS Code during a session. Apply re-checks the session's changes on top of yours, as Accept does today. *(new; as today)*
- **ES-8** **Exit session** at any time discards all its changes and restores the freezes (§9). *(yours: EDIT SESSIONS 6)*
- **ES-9** You cannot edit card fields directly on the board. Every change goes through a transform (but see ★D1 for the A|D|G box and quick edits). *(yours: INITIATING 3)*

## 6. TRANSFORM

- **TR-1** The transform window shows draft cards, which start as exact copies of the selected cards. Submitting it unchanged makes no changes. *(yours: TRANSFORM 1)*
- **TR-2** You can create new cards of any kind, including vocabulary cards. *(yours: TRANSFORM 2)*
- **TR-3** You can drag a card to the **trash** area. A trashed card stays visible and can be dragged back; everything in the trash is deleted when the transform's result is applied. **★D4** *(yours: TRANSFORM 3)*
- **TR-4** Each field is in one of three states, each clearly marked:
  - **fuzzy**: empty, and Claude fills it in. All fields of a new card start fuzzy. *(yours: TRANSFORM 4)*
  - **open**: has a value that Claude may change if the transform needs it. Copied fields start open, unless already frozen. *(new: copied fields need a state)*
  - **frozen**: Claude may not change it (§3).
- **TR-5** Clearing a field makes it fuzzy. Freezing an empty field keeps it empty (FZ-2). *(new)*
- **TR-6** Filling in a field yourself freezes it (a session freeze). *(yours: TRANSFORM 5)*
- **TR-7** Only the editable fields of §2 can be edited. *(yours: TRANSFORM 10)*
- **TR-8** The **Claude may add cards** checkbox says whether Claude may add new ASSUMPTION, DERIVATION or GOAL cards to fill gaps, or must stick to the cards in the window. New vocabulary is always allowed, because formalising usually needs it; it is reviewed like everything else. Default: off. *(yours: TRANSFORM 6; clarified: vocabulary)*
- **TR-9** An **Instructions** box takes prose for Claude, with `#` references. *(yours: TRANSFORM 7)*
- **TR-10** **Submit transform** finishes; **Cancel** closes without changes. *(yours: TRANSFORM 8; your "ok" in TRANSFORM 1 is this button)*
- **TR-11** Any card can be transformed, including vocabulary cards and proposed cards (what used to be "Claude suggests"). *(yours: TRANSFORM 9)*
- **TR-12** A kind change you make yourself is carried out by telelean's existing kind-change rules (D-11): adding or removing the `.holds`, and rewriting or marking dependents, with the impact shown. Claude does not do it. *(new; keeps D-11/D-17)*
- **TR-13** On submit, telelean checks the Lean you typed: it must be a single Lean term, with no hidden extra declarations, and must be well-formed as far as can be checked before Claude fills the rest. *(new; safety issue S10)*
- **TR-14** Before you submit, the window warns you when you are:
  - deleting or changing a card that others rely on (it lists them, and says which are frozen, since those would block Claude);
  - changing a sentence whose Lean stays frozen (the two may then disagree).

  *(new)*
- **TR-15** A transform that needs nothing from Claude (no fuzzy fields, no instructions, "Claude may add cards" off) runs without Claude. Its changes become items you have already accepted, and the session goes straight to the end confirmation (EN-2). *(new; keeps quick edits quick, see ★D1)*

## 7. REVIEW STAGE

- **RV-1 Items.** Each Claude step ends with a list of review items, one per proposed change: *(yours: REVIEW 1–2; clarified)*
  - **Add ‹card›**: a new card. A premise Claude proposes (what used to be a "Claude suggests" card) is an Add item for an ASSUMPTION card. It keeps the marks "closes the gap (checked)" and "may simply restate the goal".
  - **Change ‹card›**: a change to an existing card, shown field by field (before → after). For a vocabulary card, it lists the cards whose meaning changes with it.
  - **Formalize ‹card›**: a Change that only fills in an empty Lean statement, with nothing else changed.
  - **Prove ‹card›**: a Change that adds or replaces a proof. It shows what the proof rests on ("proved from …") and, for a goal, offers **make it a Derivation** (ticked). *(new label)*
  - **Delete ‹card›**: the card and its Lean. A card's `.holds` is never left behind as a hidden assumption.
  - **Vocabulary (N)**: all new or changed plain vocabulary (types, predicates, functions, constants) as one item, which you can expand into per-term sub-items. Definitions and presuppositions ("X exists") are **not** in it: each gets its own Add or Change item, because they can carry beliefs (RV-7). *(changed: REVIEW 2)*
- **RV-2 The review list is the status table.**
  - It is a scrollable list showing each item's label, status and badges (**belief**, **changes your words**, **depends on N**), with counts at the top: "3 in review · 5 accepted · 1 declined".
  - Clicking an item shows its detail. For a statement, that is your sentence above its Lean, the **Fully explicit** toggle and what it uses, as today's Statement steps.

  *(yours: REVIEW 2; changed: list and table merged)*
- **RV-3 Statuses.**
  - Every item starts **in review**.
  - **Accept** makes it **accepted**, and session-freezes the content it produces until you change its status again. Unfreezing that content returns the item to "in review".
  - **Decline** makes it **declined**, with a decline option you must pick (§8).
  - You can change any status until you submit.

  *(yours: REVIEW 3; clarified: the link with Unfreeze; "its definition" now reads "its content")*
- **RV-4 Dependencies.**
  - An item depends on the items whose results its Lean uses. For example, "Prove G" depends on "Formalize G", on the premises' items, on any vocabulary or definition item it uses, and on the Add item of any new assumption it uses.
  - Accepting an item also needs everything it depends on: **Accept** offers "Accept with its N dependencies" and lists them.
  - Declining an item that accepted items depend on asks you to return those to "in review" as well.
  - So the accepted items always form a self-contained whole.

  *(new; safety issue S4)*
- **RV-5 Meaning before proof.** A Prove item's result stays hidden until the statements it proves are accepted. This keeps D-19's order: you judge what a statement says before you see whether it was proved. *(new; safety issue S7)*
- **RV-6 Groups.** You can select several items and Accept or Decline them together. Declining several with the Transform option opens one transform window for all of them, which is how you make a multi-card transform. *(yours: REVIEW 4)*
- **RV-7 Beliefs need explicit, individual consent.** **★D2**
  - A **belief item** is one that would make the model assume something new: adding an ASSUMPTION card, changing an ASSUMPTION's sentence or Lean, formalising an assumption, adding or changing a definition, or adding a presupposition.
  - Each needs its own Accept. A group Accept skips them and says so.
  - A proof that rests on a pending belief item counts only once that item is accepted (RV-4).

  *(new; safety issues S5, S6)*
- **RV-8 The stage report.** Above the list sits today's report card, out of the list. It holds Claude's summary; per goal, the verdict and what it rests on (once revealed); unused premises; "What is missing"; and "Consistency unchecked". It also lists **Assumed without asking**, each with **Ask me instead**, which opens a mid-stage transform with the question prefilled. *(new: the review list had no home for these)*
- **RV-9 Mid-stage actions.**
  - At any point in a review stage you can select cards and choose **These suffice** or **Transform cards…**. Claude runs a step at once, and its results join the current stage:
    - new items appear "in review";
    - items whose proposal changed return to "in review", marked "updated".
  - Claude never changes accepted or frozen content, but may make unfreeze requests (FZ-6).
  - These actions are disabled while a Claude step is running.

  *(yours: REVIEW 5; clarified: results join the current stage; mid-stage Transform added)*
- **RV-10 Submit review** is enabled once no item is "in review".
  - If every item is accepted, the session ends (§9).
  - Otherwise a Claude step handles each declined item according to its decline option, and the next review stage begins. Accepted items carry over, still accepted.

  *(yours: REVIEW 6)*
- **RV-11** If a step proposes nothing, the stage says so, with Claude's reason. *(new; edge case)*

## 8. DECLINE OPTIONS *(yours: one must be picked; a group decline applies it to every item)*

- **DO-1 Reject**: keep the card as it was before this proposal, and Claude may not propose the same thing again in this session. *(yours: option 1, generalised from new cards to every item)*
  - For an Add: the card is not created.
  - For a Change: the card keeps its previous content.
  - For a Delete: the card stays.

  Rejected items are listed under **Rejected in this session**, where you can un-reject them. "The same thing" is checked mechanically only for exact repeats: the same name, statement or sentence after normalising. A near-repeat simply appears as a new item, which you can reject again.
- **DO-2 Transform**: opens the transform window on the proposed version, with the previous version alongside. It runs at Submit review. *(yours: option 2, "Adjust this card"; renamed to match REVIEW 4)*
- **DO-3 Shaky**: Claude may do anything with the card(s), within the frozen rules: keep, change, remove, split or merge them. The constraint is that what it proposes in their place in the next stage must not be identical to the declined proposal.
  - "Identical" means the same cards with the same field values, ignoring ids, whitespace and the names of bound variables. telelean checks this mechanically and asks Claude to retry.
  - If Claude believes the declined version is the only sensible one, it may say so: the items come back marked "Claude found no alternative", and you decide again.

  *(yours: option 3; clarified: a single card too, what "exact" means, and an escape)*

## 9. Ending a session

- **EN-1** A session ends successfully when you submit a review stage in which every item is accepted. Otherwise it ends by **Exit session**. *(yours: REVIEW 6)*
- **EN-2** Before it ends, a confirmation shows: *(yours: EDIT SESSIONS 8, extended)*
  1. the changes that will be applied: the added, changed and deleted cards, each a link;
  2. the final check, which reruns all of today's checks plus the frozen checks on exactly the final result: everything builds, every "proved" holds from what it lists, and no frozen content changed;
  3. the freeze changes FZ-8 will make: which cards and fields become unfrozen and which become frozen again, each with an optional **keep** tick (unticked) that makes it standing instead. *(keep ticks: new)*
- **EN-3** **Apply** writes the changes to your files as one history entry and one Undo step, as Accept does today, and then restores the freezes. *(new)*
- **EN-4** Exiting discards the working copy; your files are untouched. Your answers to Claude's questions stay recorded, as today. *(clarified)*

## 10. REFERENCE SYSTEM

- **RF-1** Typing `#` in any prose field opens a dropdown of cards and fields, filtered as you type. Prose fields are sentences, Why, transform instructions and answers to Claude. Picking an entry inserts a reference, shown as a chip, e.g. "Cynder has a dark past › Lean statement"; clicking it reveals the target. *(yours)*
- **RF-2** A reference is stored by stable id: the card's id, or the Lean name for a vocabulary card, with an optional field. It always shows the target's current name; a reference to a deleted card shows "deleted card". *(new)*
- **RF-3** `#` does not open the dropdown in Lean fields, where it starts commands such as `#check`. Esc closes the dropdown and leaves a plain `#`. *(new)*
- **RF-4** Like GitHub's issue numbers, cards could also get short numbers (#12) for typing. I suggest searching by sentence instead, which needs no new numbering. *(new; your call, but not a ★)*
- **RF-5** A frozen card's references hold their targets (FZ-5): Claude may not change a card that a frozen card's sentence refers to. *(new; safety issue S12)*

## 11. What telelean guarantees mechanically *(new)*

1. Your files change only when a session ends successfully, and only to a state that passed every check.
2. "Proved" means Lean checked the proof, with no `sorry`, resting on exactly what it lists. For These suffice, that is only your selected premises (plus vocabulary and the presuppositions you accepted).
3. Claude never changes frozen or held content. telelean checks this itself and never trusts Claude to comply.
4. The accepted items always form a self-contained whole.
5. Nothing becomes something the model assumes without your individual Accept.
6. You judge what a statement means before you see whether it was proved.
