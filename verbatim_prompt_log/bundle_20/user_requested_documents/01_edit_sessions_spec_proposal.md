# Edit sessions: revised specification (proposal for your approval)

**Status:** a proposal. Nothing is implemented. It rewrites your specification of 2026-11-18 (`bundle_20/prompt20.md`). Before drafting, six read-only agents mapped the current code. The draft (v2) was then reviewed by four independent reviewers (fidelity, logic, soundness, implementability). They raised 108 findings; what happened to each is in `subagent_reports/review_workflow/DISPOSITIONS.md`. The resulting v3 was checked by two final verifiers (consistency, soundness), whose 26 findings are applied (`subagent_reports/verification_workflow/DISPOSITIONS.md`). This is v3.1.

**How to read it.**
- **Part 1** is the specification. Every clause has an ID (e.g. `FZ-4`), so you can approve or amend it by number.
- The tag after each clause says where it came from:
  - *(yours: REVIEW 3)*: your clause, reworded only;
  - *(clarified: …)*: your clause, with an ambiguity resolved;
  - *(changed: …)*: differs in substance from your text;
  - *(new)*: added by me.
  Every *changed* and *new* clause is listed with its reason in Part 4.
- **Part 2** lists the decisions I need from you (★).
- **Part 3** lists the safety issues I found in your text.
- **Part 4** is the change log.
- The appendices hold edge cases, the checks rule by rule, and the answers to your three questions.

**Earlier decisions referred to** (from the first design round; you approved them in turn 2):

| Code | Decision |
|---|---|
| D-3 | Vocabulary is computed from Lean, not written as markup. |
| D-4 | Definitions need your endorsement. |
| D-6 | Only you add beliefs; Claude can only suggest them ("Claude suggests"). |
| D-11 | telelean's rules for changing a card's kind: adding or removing its `.holds`, and handling dependents. |
| D-15 | Visual conventions: dashed = declared by you, solid = verified by Lean, translucent = suggested, blue aura = has Lean. |
| D-16 | The A\|D\|G box never calls Claude. |
| D-17 | Direct editing on the board, drag to change kind, in-board Undo. |
| D-18 | Delete, suspend, refine. |
| D-19 | Statements are fixed before proving, and you see what a statement means before you see whether it was proved. |
| D-21 | Accept is all-or-nothing. |

**The biggest changes from your text, in five lines:**
1. "These suffice" freezes everything that existed, except the selected cards' empty Lean statements and the targets' proofs, so it keeps today's protection (★D3).
2. Items that add or change beliefs, or change what is proved, need their own Accept (★D2). Accepting always respects dependencies.
3. Each inference gets one "Result" item, revealed after you have judged the statements it rests on (keeps D-19).
4. Transforms made during a review wait until Submit review. A transform writes no proofs; proofs come from These suffice.
5. Frozen covers meaning, not just text, and telelean checks it in Lean. The one exception is a change you explicitly allow (FZ-5), which then needs your Accept.

---

# Part 1: The specification

## 0. Purpose *(yours: preamble)*

Give you granular, systematic control over the cards and over every change to them. Reduce the number of special cards: every card gets the same base capabilities.

## 1. Terms *(new)*

| Term | Meaning |
|---|---|
| **Card** | Anything on the board: an ASSUMPTION, DERIVATION or GOAL card, or a **vocabulary card** (a type, predicate, function, constant, definition, presupposition, lemma …). |
| **Field** | An editable part of a card (§2). |
| **Frozen** | A field or card that Claude may not change (§3). |
| **Held** | Not frozen itself, but something frozen content relies on, so Claude may not change it either (FZ-4). |
| **Fuzzy** | An empty field that Claude is asked to fill in (TR-4). |
| **Edit session** | A sequence of Claude steps and review stages, worked on a private copy of your model (§5). |
| **Claude step** | One stretch of Claude's work inside a session. "Claude" means whichever LLM telelean is set up with. |
| **Inference** | One "These suffice" claim: a target card, and the premises it should follow from. |
| **Review stage** | Your pass over the proposed changes, one **review item** per change (§7). |
| **Belief item** / **proof-changing item** | Review items that need their own Accept (RV-7). |
| **Transform** | The window in which you propose turning a set of cards into another set (§6). |
| **Context Menu** | The toolbar section that shows the actions for the current selection (§4). |
| **Session bar** | The bar above the board that holds the controls of the active session (CM-6). |
| **Reference** | A link to a card or field, typed with `#` (§10). |
| **Apply** | Writing a finished session's changes to your files (EN-3). It replaces today's "Accept" button. |

## 2. Cards and fields

- **CF-1** Every card has the same base capabilities: you can select it or any of its fields, freeze or unfreeze it, reference it with `#`, and transform it. The one exception is vocabulary from other subjects, which cannot be transformed (TR-10). *(new; from your preamble)*
- **CF-2** Fields you can edit: *(clarified: TRANSFORM 10's "sensible fields")*

  | Card | Fields |
  |---|---|
  | ASSUMPTION | Sentence · Kind · Why · Stance · Source · Lean statement |
  | DERIVATION, GOAL | Sentence · Kind · Why · Stance · Source · Lean statement · Proof |
  | Vocabulary | Lean declaration (the whole declaration) · Gloss |

  A Proof is in one of three states:
  - *empty*;
  - *claimed*, i.e. an `axiom ….holds`, which counts as no proof;
  - *proved*, i.e. a theorem.

  An assumption's `.holds` is not a field of its own: it must state exactly the assumption's Lean statement.
- **CF-3** **Data telelean keeps** is never changed by Claude, frozen or not, and every check verifies this, as today's "your words untouched" rule does. *(new)*
  - It covers the card's id, its dates, its provenance (who worded it, where it came from, which session created it), its Kind (only you change it, CF-4), its declared premises (the stored part of "Depends on"), lineage, tags, notes, extension data, and its Lean pin and binding.
  - Claude adds a new card only when "Claude may add cards" is ticked, when splitting a Shaky card, or as new vocabulary.
  - A card's Lean statement means three things together: its binding, the full text of the bound declaration, and what that declaration means in Lean.
- **CF-4** **Kind** is a field, but only you change it: in a transform, with **make it a Derivation** on a Result item, or by today's direct kind change if you choose ★D1(c). telelean then carries the change out by D-11, showing its impact. Claude never changes the Kind of an existing card, and never turns a proof into an axiom. It can ask you to. *(new)*
- **CF-5** Vocabulary stays computed from Lean (D-3). A vocabulary card is identified by its Lean name, and keeps its box look in the Vocabulary group so it does not read as a belief. *(clarified: TRANSFORM 9's "Vocabulary cards")*
- **CF-6** telelean marks any sentence Claude writes as Claude's wording (italic). When you edit that sentence yourself, it becomes yours; today the mark wrongly survives your edit. *(new)*
- **CF-7** Derived information can never be edited or frozen: status, Used by, Uses, Rests on, the Lean-verified part of Depends on, arrows, and attempts. *(yours: TRANSFORM 10)*

## 3. FROZEN

- **FZ-1** Claude cannot change a frozen field, and cannot delete a card that has any frozen field. Freezing a card freezes all of its fields. Frozen binds Claude only: you can always change a field yourself in a transform, and it then stays frozen. *(yours: FROZEN 1–2)*
- **FZ-2** Freezing an empty field means "keep it empty": Claude may not fill it in. *(new)*
- **FZ-3 Mechanical, never by asking.** *(yours: FROZEN 2; clarified: how)*
  - telelean records which cards and fields are frozen, in its own files, which Claude can neither see nor change.
  - It also keeps each frozen field's **frozen value**:
    - for a standing freeze or a session's starting freeze: your files' value;
    - for an accepted item: the content you accepted;
    - for your own freeze during a session: the value shown when you froze it;
    - for an inference's step limits (ES-2): the value when the step started.

    When you change frozen content yourself, the frozen value becomes your version (ES-7).
  - Every state telelean judges (each check, the fixing of statements, the finish, and Apply) must leave frozen and held content exactly at its frozen value. Text is compared directly; meaning is compared in Lean. A state that changes either is refused. The one exception is a provisional meaning change that you allowed under FZ-5.
  - Claude is told what is frozen, but nothing depends on whether it complies.
- **FZ-4 Held: frozen meaning, not just frozen text.** Claude may also not change: *(new; safety issues S2, S12)*
  - anything that frozen Lean relies on, as Lean sees it after elaboration: other cards' statements, definitions, lemmas, vocabulary, and the instances and coercions Lean inserted. For a `.holds`, only its type is held; proofs are not, because a proof cannot change what any statement means;
  - the field that a frozen card's sentence or Why references with `#` (for a reference to a whole card, that card's Sentence).

  Any other way of changing what frozen Lean means, for example an instance, an `open` or an attribute placed before it, is caught by the meaning comparison of FZ-3.

  Held never overrides ES-2's exceptions: a target's Proof stays open, and a selected card's empty Lean statement stays fuzzy, because neither changes what a frozen card says. The Result lists any frozen card whose "Rests on" changes as a consequence.

  Held items show a chain mark: "held by ‹card›".
- **FZ-5 Unfreeze requests.** If Claude wants to change frozen or held content, it must ask first. *(yours: FROZEN 2, REVIEW 5; lifecycle: new)*
  - A request card says what Claude wants to change and why. It offers **Select them**, **Continue** and **Keep frozen**.
  - The step pauses while the request is open, as it does for a question. **Continue** tells Claude exactly which of the requested items are now unfrozen. **Keep frozen** tells it that none are.
  - A request still open when the step ends is listed in the stage report.
  - For held content, the card names what holds it and offers **Allow this change** on the held item X.
    - X is then exempt from the held check, and its frozen holders are compared against X's new version instead of the old one.
    - Every frozen card whose held closure contains X gets an item "meaning changed by X". This is decided by membership in the closure, not by comparing the card's own Lean, which may read the same. It is a belief item if the card is an assumption.
    - X's own item can be accepted only after each of these items is accepted, individually where RV-7 requires it.
    - Declining any of them declines X and restores it. Accepting X makes its accepted version X's frozen value.
- **FZ-6** Only you unfreeze: select the cards or fields, then choose **Unfreeze** in the Context Menu. Claude may then change them because they are no longer frozen, not because you approved anything. *(yours: FROZEN 2)*
- **FZ-7 Reasons.** A field can be frozen for several reasons at once, and it stays frozen while any reason remains. *(new)*
  - The reasons are:
    - *standing*: you froze it outside a session;
    - the session's start froze it;
    - you accepted an item that covers it;
    - you filled it in a transform;
    - you froze it during the session.
  - Changing an item's status removes only that item's reason.
  - **Unfreeze** removes every reason at once. Any accepted item covering the field then returns to "in review" (RV-5).
- **FZ-8 When a session ends,** successfully or not, every card and field of the session's subject returns to its standing state as recorded at the session's start. *(yours: REVIEW 7; changed: keep ticks)*
  - Session reasons disappear, and unfreezes of standing freezes are undone.
  - Cards created in the session end up unfrozen.
  - The exception is what you tick **keep** in the end confirmation (EN-2).
  - Apart from your own actions, this is the only time freezes change.
- **FZ-9 Always available.** *(yours: FROZEN 4–5; clarified)*
  - Wherever a card or field is shown (the board's Current and Proposed views, review items, the transform window, the end confirmation, request cards), you can select it and choose **Freeze**, **Unfreeze**, **Freeze all other cards** or **Unfreeze all other cards** in the Context Menu. This works at any time, including while Claude works.
  - "All other cards" means every card of the current subject that contains none of the selected items.
  - **Unfreeze all other cards** asks first if it would remove standing freezes, and says how many. It leaves accepted content frozen unless you tick "also un-accept".
  - Freeze changes go on the board's Undo (Ctrl+Z). They change no file and make no History snapshot.
- **FZ-10 Freezing while Claude works** freezes the version you see. *(new)*
  - Claude is told in its next tool result, and a check that fails only because of this freeze does not count as one of its attempts.
  - Freezing a card that has a pending item asks which version to freeze: Claude's proposal (the item stays in review), or your version (which rejects the item).
  - Rejecting an item whose proposal you froze first asks whether to unfreeze it.
  - Freezing an empty field that Claude is filling asks you to confirm.
- **FZ-11 Look.** *(yours: FROZEN 1, made concrete)*
  - A frozen card gets an aura in its own theme colour (`telelean.frozen`, never blue), drawn inside the card so it combines with the blue "has Lean" aura and the diff halos, plus a lock badge, so it is never colour alone.
  - It never uses dashing or translucency, which already mean "declared by you" and "suggested" (D-15).
  - A frozen field shows a small lock. In high-contrast themes, a lock badge and a "frozen" chip replace the aura. The legend gets an entry.
  - During a session, the session's starting freezes appear as one banner, and the board marks what Claude may change rather than putting an aura on every card. After These suffice, the banner reads "Only the selected cards' empty Lean statements and the targets' proofs may change". After Transform cards…, it reads "Everything except the selected cards is frozen". Standing freezes and your own keep their aura.
- **FZ-12** The run's existing "statements frozen before proving" step (D-19) is renamed **statements fixed**, with its own icon, so it cannot be confused with FROZEN. *(new; terminology)*

## 4. Selection and the CONTEXT MENU

- **CM-1** A section of the toolbar labelled **Context Menu** shows the actions that fit the current selection. It has a fixed height, so it does not reflow the toolbar. With nothing selected it reads "Select some items to see possible actions here." *(yours)*
- **CM-2** You can select cards (vocabulary cards included), single fields and review items. *(clarified: needed by FROZEN 4)*
  - To select a field, click its lock icon or Alt-click the field.
  - Ctrl adds to the selection, and a selection may mix kinds.
  - Esc first closes whatever is open, then clears the selection.
- **CM-3** An action that fits only some of the selected items is shown disabled, with the reason on hover. *(new)*
  - These suffice, Transform cards…, Accept and Decline… are labelled buttons.
  - The other actions are icons with labels on hover.
  - On a narrow window, extra actions overflow into a "…" menu.
- **CM-4** The actions: *(new)*

  | Action | Applies to |
  |---|---|
  | Freeze / Unfreeze; Freeze all other cards / Unfreeze all other cards | cards, fields |
  | Transform cards… | cards; starts a session if none is active (ES-3), otherwise queued (RV-9) |
  | These suffice (with today's tray controls: ⊢ to mark targets, Self-evident? when no premises are selected, Add to its premises ▶, and the warning when declared premises would be dropped) | premises + targets (ES-2, RV-9) |
  | Accept / Decline… | review items |
  | Copy reference | cards, fields |
  | Show on board / Open in editor | cards |

- **CM-5** The tray at the bottom goes. Its selection summary ("premises ⊢ targets") moves into the Context Menu section. *(new)*
- **CM-6** The session's controls sit in the **session bar** above the board (today's proposal banner): **Submit review**, **Exit session**, **Cancel step** / **Resume**, **Raw Lean diff…**, and the **Current | Proposed** switch. *(new)*

## 5. EDIT SESSIONS

- **ES-1** At most one edit session is active per model folder, on one subject. While it is active, the board has two views: **Current** (your files) and **Proposed** (the session's working copy). Freezes you make meanwhile on cards of other subjects are standing. *(new)*
- **ES-2 Starting with These suffice** (no session active). *(yours: INITIATING 1, EDIT SESSIONS 2; changed: the preset and several targets)*
  - **Targets** are the cards you mark with ⊢; by default, the selected GOAL, as today. An ASSUMPTION cannot be a target. All other selected cards are the **premises**. With no premises, the action is "Self-evident?".
  - With several targets, Claude proves them one after another, one step each. Each is proved from the premises, and never from another target.
  - **Preset** (★D3): in each inference's step, everything that exists when the step starts is frozen for that step, at its value then: every field, binding and declaration, including content whose item is still in review. There are two exceptions:
    - each selected card's empty Lean statement is fuzzy;
    - each target's Proof is open, even when empty. Claude may fill it, prove a claimed one, or replace an existing proof (shown as "replaces your proof"). In a step that does not end in a proof, it stays exactly as it was.

    A standing freeze always wins over fuzzy and open.
  - For the inference that starts a session, these freezes are also the session's starting freezes (FZ-7). For a mid-stage inference (RV-9), they are limits on its step only: they add no FZ-7 reason, and they end with the step.
  - Claude may propose missing premises (RV-1, Add).
- **ES-3 Starting with Transform cards…** (one or more cards selected, no session active). *(yours: INITIATING 2, EDIT SESSIONS 1; changed: one action instead of two names; a provisional session; Cancel needs no confirmation unless you changed freezes)*
  - Opening the window starts a **provisional** session, in which every non-selected card is session-frozen.
  - **Submit transform** then does one of three things:
    - **unchanged**: the session continues with an empty first stage and no Claude step, from which you can run These suffice. This is your "initiate edit session";
    - **needs Claude** (TR-15): the first Claude step starts;
    - **changed, but needs no Claude**: the provisional session is dropped, its freezes are undone, and your edits are applied directly as one Undo step (★D1).
  - **Cancel** drops the provisional session, with nothing to apply. A confirmation comes first only if you changed any freezes while the window was open.
- **ES-4 A Claude step.** *(yours: EDIT SESSIONS 2–3; clarified: failures)*
  - Claude works on the session's private copy. Within a step, statements are fixed before proving, as today (FZ-12). Every check of Appendix B runs, with today's loop of up to 3 attempts.
  - After a failed attempt, the step rolls back to the newest passing state that is no older than your latest decision. A rollback never undoes your decisions.
  - If there is no such state, the stage is headed "Claude's step did not pass: …". It then allows Decline, Unfreeze, These suffice and Exit, but no Accept, until a later step passes.
  - **Cancel step**, a turn or time cap, or an environment failure returns you to the previous stage, marked "step cancelled" or "step failed", with **Retry step**. For the session's first step, you get an empty stage with the same mark, **Retry step** and **Exit session**.
  - A step never ends the session.
  - Claude may ask you questions and make unfreeze requests; both pause the step.
- **ES-5** A session changes your files only when it ends successfully (EN-3). This includes the declared premises that These suffice records, which today it writes at the start. *(new)*
- **ES-6** A session survives a window reload. A running step is interrupted and can be resumed. Stages, transform drafts and an open confirmation come back as they were. *(new)*
- **ES-7 Your own edits during a session** (hand edits in VS Code, the A|D|G box, Undo, History) are copied into the session's base and working copy as they happen; while a step runs, at its next check. *(new)*
  - They never become items, and Apply lists them separately.
  - If they touch frozen or held content, the frozen value becomes your version. Every accepted item whose content or dependencies they touch returns to "in review".
  - If they conflict with an accepted item, you are told when you make the edit.
- **ES-8** **Exit session**, at any time, discards the session's work after the confirmation of EN-2. *(yours: REVIEW 6)*
- **ES-9** While a session is active, fields cannot be edited directly on the Current view. How far beyond this the rule goes is ★D1. *(yours: INITIATING 3)*

## 6. TRANSFORM

- **TR-1** The transform window shows draft cards, which start as exact copies of the selected cards. Submitting it unchanged changes nothing. *(yours: TRANSFORM 1; your "ok" is Submit transform)*
- **TR-2** You can create new cards of any kind, vocabulary included. You choose a new card's Kind (and a vocabulary card's Lean name) when you create it, as in the A|D|G box, and telelean gives it an id. *(yours: TRANSFORM 2; changed: Kind and name are never fuzzy)*
- **TR-3** You can drag a card to the **trash**. It stays visible there and can be dragged back; everything in the trash is deleted when the result is applied. ★D4 covers "delete permanently". *(yours: TRANSFORM 3; changed: ★D4)*
- **TR-4 Field states.** Each field is either frozen or not. *(yours: TRANSFORM 4–5; changed: starting states)*
  - A field that is not frozen and is empty is **fuzzy**. It shows "Claude fills this" with its own icon, and never uses italics, dashing or translucency, which already mean Claude's wording, declared and suggested.
  - A field that is not frozen and is filled is **open**: Claude may change it if the transform needs it.
  - Starting states:
    - a new card's fields start fuzzy, except its Kind and Lean name, which you chose (TR-2), and its Proof, which starts empty and "keep empty";
    - a copied card's Sentence, Why, Stance and Source start open;
    - its Lean statement and Proof start frozen;
    - its empty fields start "keep empty" (one click makes them fuzzy), so Claude formalises a card with no Lean only if you ask.
  - A Proof field is never fuzzy, because proofs come from These suffice (TR-14). In a transform you can keep a proof or clear it. Clearing deletes the proof and leaves the card unproved, never claimed.
- **TR-5** Typing in a field freezes it (a session freeze). Clearing a field makes it fuzzy. *(yours: TRANSFORM 5)*
- **TR-6** Only the fields of CF-2 can be edited. *(yours: TRANSFORM 10)*
- **TR-7** A checkbox, **Claude may add cards**, says whether Claude may add new ASSUMPTION, DERIVATION or GOAL cards to fill gaps, or must stick to the cards in the window. Default: off. *(yours: TRANSFORM 6; changed: vocabulary)*
  - New plain vocabulary is always allowed, because formalising needs it.
  - Splitting a Shaky card is always allowed.
  - Both are reviewed like everything else.
- **TR-8** An **Instructions** box takes prose for Claude, with `#` references. *(yours: TRANSFORM 7)*
- **TR-9** **Submit transform** finishes. **Cancel** closes without changes: a decline-Transform returns its item to "in review". *(yours: TRANSFORM 8)*
- **TR-10** Any card can be transformed, including vocabulary cards and proposed cards (what used to be "Claude suggests"). Vocabulary from other subjects can be frozen and referenced, but not transformed. *(yours: TRANSFORM 9; changed: other subjects' vocabulary is excluded)*
- **TR-11** A kind change you make is carried out by telelean, by D-11, with its impact shown. Claude does not carry it out. *(new; keeps D-11)*
- **TR-12** When you submit, telelean checks the Lean you typed: *(new; safety issue S10)*
  - it must pass today's single-term rule (statements and proofs), or the vocabulary shape rule (vocabulary declarations);
  - it must elaborate in a scratch Lean file against the current vocabulary;
  - names that don't exist yet are allowed, and listed as "Claude must define: …".
- **TR-13** Before you submit, the window warns you when you: *(new)*
  - delete or change a card that other cards rely on, including through references. It lists them, says which are frozen, and offers to rewrite them (D-11), to delete them too, or to leave the unfrozen ones to Claude. Inside a session nothing is ever left broken. Today's "Delete anyway", which marks dependents broken, remains only for transforms applied directly outside a session (TR-15);
  - change a sentence whose Lean stays frozen, since the two may then disagree.
- **TR-14** A transform step writes no proofs. A proof that stops building because of the transform becomes a **Proof broken ‹card›** item, which takes the card's proof slot (RV-1). You can re-prove the card with These suffice, or make it a claim: its proof is replaced by `axiom ….holds`, a belief item that needs its own Accept. *(changed: TRANSFORM 4, for the Proof field; safety issue S8)*
- **TR-15 Transforms that need no Claude.** *(new; see ★D1)*
  - A transform needs Claude if it has any of these:
    - a fuzzy field;
    - instructions;
    - "Claude may add cards" ticked;
    - an open Lean field on a card whose sentence you changed;
    - typed Lean that names something not yet defined;
    - dependents you left to Claude (TR-13).
  - Otherwise telelean applies it itself:
    - **outside a session** (including ES-3's provisional session), as direct edits: one Undo step and no session. TR-12's checks of the Lean you typed still run; the build and the full gate do not;
    - **inside a session**, at Submit review (RV-9). Only what you typed, and telelean's follow-on edits, count as yours (RV-7). Content the window copied from Claude's proposal stays Claude's: its item keeps its id and its RV-7 class, and returns to "in review", marked "updated", if you changed any of its fields. RV-5, RV-6 and RV-7 apply to it as to any item.
  - telelean's own follow-on edits (removing a deleted card from premises lists, D-11 rewrites, pins, ids) may touch frozen cards; they count as your change, and TR-13 lists them.

## 7. REVIEW STAGE

- **RV-1 Items.** A card has at most two items: one for its fields (Add, Change, Formalize or Delete) and one for its proof (Result, or Proof broken). Each item keeps the same id from stage to stage. A newer proposal updates its item in place: back to "in review", marked "updated", with the previous proposal viewable. *(yours: REVIEW 1–2; changed: items per card, a Result item instead of separate proof items, and what the vocabulary item holds)*
  - **Add ‹card›**: a new card.
    - A premise Claude proposes stays outside the working copy until you accept it, as today. telelean checks in a scratch file that your premises plus it prove the target ("closes the gap (checked)"), flags "may simply restate the goal", and re-checks whenever something it relies on changes.
    - Proposed premises are part of a target's result, so they appear only when that Result is revealed (RV-6).
    - Accepting one makes telelean write the card (in Claude's wording) and add it to the target's premises, with no extra Claude step.
      - telelean re-checks the premise where it was written: its fully explicit form must equal the one you accepted. Otherwise the item returns to "in review", marked "meaning differs in place".
      - telelean then completes the target's proof from the checked proof, and checks that state as a step would: build, footprint with the premise selected, statements fixed, and Lean's comparator. Until that passes, the Result reads "completion not checked".
      - The target's Result then returns to "in review", marked "updated".
      - If you accept a second proposed premise for the same target, the first completion stands, and the second premise is listed as unused.
  - **Change ‹card›**: shown field by field, before → after. It lists every card whose statement or proof mentions what it changes.
  - **Formalize ‹card›**: fills an empty Lean statement, and changes nothing else.
  - **Delete ‹card›**: deletes the card and its Lean. A `.holds` is never left behind as a hidden assumption.
  - **Vocabulary (N)**: the new plain vocabulary (types, predicates, functions, constants) as one item. It expands into sub-items, each with its own status ("k of N accepted"). A change to existing vocabulary, and every definition or presupposition, gets its own item. A presupposition's helper instance belongs to that presupposition's item; any other new instance gets its own item.
  - **Result ‹target›**: one per inference, always present, whether or not a proof was found. Once revealed (RV-6), it shows the verdict, the proof (marked "replaces your proof" when it does), and what it rests on. For a goal it offers **make it a Derivation**, ticked by default. *(new: one item carries both the outcome and the proof, so its presence reveals nothing)*
  - **Proof broken ‹card›**: TR-14.
  - A **statement item** is an Add, Formalize or Change item that adds or changes a Lean statement.
  - Items are computed between the session's base (your files at its start, plus your own changes, ES-7) and the working copy.
- **RV-2 The review list is the status table.** *(yours: REVIEW 2; changed: list and table merged)*
  - Items are grouped by card. Each shows its label, its status and badges (**belief**, **changes what is proved**, **depends on N**). Counts are at the top ("3 in review · 5 accepted · 1 declined"), with a filter for "in review".
  - You cycle through items with Back/Next or ↑/↓. A accepts, D declines, and **Accept & next** combines the two.
  - The detail shows your sentence above its Lean, the **Fully explicit** toggle (the Lean printed without notation, every argument written out), and what the Lean uses. On a narrow panel, the detail replaces the list.
- **RV-3 Statuses.** *(yours: REVIEW 3; changed: a fourth status, set by telelean)*
  - Every item starts **in review**, then becomes **accepted** or **declined** (with a decline option, §8). You can change any item's status at any time during the session; declines take effect as §8 says.
  - telelean sets **to be redone** on an item when something it depends on is declined. That status does not block Submit review, and the next step proposes the item again.
  - Markers: "updated", "no alternative found".
- **RV-4 What Accept freezes** (a session freeze, until the item's status changes): *(clarified: REVIEW 3's "its definition is FROZEN")*
  - Add: every field of the new card.
  - Change or Formalize: the card's sentence and Lean statement together, plus any other field that changed.
  - Result: the proof and the Derivation tick.
  - Delete: nothing, but Claude may not re-add the card.
  - Vocabulary: each term.
- **RV-5 Dependencies.** *(new; safety issue S4)*
  - Item I depends on item J when:
    - I's Lean, as Lean sees it after elaboration, mentions something J adds or changes;
    - I is a Result whose inference uses J;
    - I deletes or changes something that another card's version before J mentions. So a Delete depends on the items that remove the other mentions of the deleted card.
  - **Accept** is enabled only once everything the item depends on is accepted. Until then it lists what is missing, with **Select them**. Nothing is ever accepted as a side effect.
  - An item can leave "accepted" by being declined, by a status change, because its content was unfrozen, or because you changed its content or something it depends on (in a transform, by a D-11 follow-on edit, or by a hand edit, ES-7). Before it does, telelean lists every accepted item that depends on it, and returns them to "in review" with it. Cancelling the list cancels the change.
  - So the accepted items always form a self-contained whole.
- **RV-6 Meaning before proof.** *(new; keeps D-19; safety issue S7)*
  - Each **Result ‹target›** item stays neutral until every statement and belief item it depends on has been decided (accepted or declined), or until you press **Show result**, which notes that you saw the result early.
  - Hidden until then:
    - the verdict, the proof and what it rests on;
    - the premises Claude proposes for that target (RV-1);
    - the stage report's verdicts and Claude's summary;
    - the proof chips, footprints and verified arrows in the Proposed view;
    - whether a proof exists at all: the target's Proof field and proof status, in the Proposed view and in every item's detail.
  - The result is hidden again if any of those items returns to "in review".
- **RV-7 Items that need their own Accept** (★D2). Group Accept skips these and says so. *(new; safety issues S5, S6, S11)*
  - **belief**: changes what the model assumes. It:
    - adds an ASSUMPTION card;
    - formalises an assumption, or changes an assumption's sentence or Lean;
    - adds or changes any axiom (a presupposition, an unmarked axiom);
    - adds a definition, instance or coercion, or changes any existing vocabulary item, that lies in the elaborated closure of a card's Lean statement. New plain vocabulary (a sort, predicate, constant or function that passes the shape rule) is not a belief;
    - is a "meaning changed" item of an assumption (FZ-5).

    telelean classifies items by their effect in Lean, never by column.
  - **changes what is proved**: changes a Lean statement or proof that existed when the session started, or the statement that a Result proves, or the sentence of any card that has a Lean statement. A changed sentence is shown above the unchanged Lean, marked "sentence and Lean may disagree".
  - Content you typed yourself counts as accepted by you.
- **RV-8 Groups.** You can select several items, then Accept or Decline them together. *(yours: REVIEW 4; changed: limited by RV-5 and RV-7)*
  - Accept takes every selected item that is not an RV-7 item and all of whose dependencies are either already accepted or taken by this same Accept (which never takes RV-7 items). It lists the items it left, and why.
  - Decline applies one option to all of them. Decline → Transform opens one window for all of them: this is how you make a multi-card transform.
- **RV-9 During a stage.** *(yours: REVIEW 5; changed: ES-2's step limits apply; transforms wait for Submit; disabled while a step runs)*
  - At any point you can select cards and run **These suffice**. It runs a Claude step at once, with ES-2's preset, and its items join the current stage. Cards you declined with Transform or Shaky count as frozen for it. It is disabled while a step runs.
  - Transforms you start during a stage, from Decline or from the Context Menu, wait until **Submit review**.
- **RV-10 The stage report** sits above the list. *(new)*
  - It contains:
    - Claude's summary;
    - for each target, the verdict and what it rests on, once revealed;
    - unused premises;
    - what is missing;
    - "consistency unchecked";
    - open unfreeze requests.
  - It also lists **Assumed without asking**: interpretive choices Claude made without asking you. Each has **Ask me instead**, which declines the items that rely on that choice, with Transform and "Ask me about: …" prefilled.
- **RV-11** Every step re-checks every inference of the session. A Result whose verdict or dependencies changed returns to "in review", marked "updated", with its result hidden again. A proof you accepted earlier in the session counts like one of your own for later inferences, whose reports show what they rest on through it. *(new)*
- **RV-12 Submit review** is enabled once nothing is "in review". *(yours: REVIEW 6; changed: rejects no longer need a Claude step)*
  - Queued transforms that need no Claude are carried out first, as accepted items (TR-15).
  - If every item is then accepted or rejected, nothing is waiting to be redone, and no queued transform needs Claude, the session goes to the end confirmation (§9) with no Claude step. telelean carries out the rejects.
  - Otherwise one Claude step handles the queued transforms, the Shaky items and the items to be redone, and the next stage begins. Accepted items carry over.
- **RV-13** A step that proposes nothing says so, with Claude's reason. *(new)*

## 8. DECLINE OPTIONS *(yours: one must be picked; a group decline applies it to every item)*

On a Result item, Decline offers two options. Reject keeps the previous proof, and Claude may not offer this exact proof again. Shaky makes Claude try again at Submit review. Transform is not offered. *(new)*

- **DO-1 Reject.** *(yours: option 1; changed: applies to every item kind)*
  - telelean restores the previous version in the working copy at once.
  - Claude may not propose that exact thing again in this session. Exact repeats are checked. A reworded repeat comes back as the same item, in review and marked "updated"; the rejected version stays under "Rejected in this session".
  - The card is **not** frozen, so Claude may still propose something different. To stop all changes to it, also Freeze it.
  - Rejected items are listed under **Rejected in this session**, where you can un-reject them.
- **DO-2 Transform.** It opens the transform window on the proposed version, with the previous version alongside, and waits until Submit review. Fields copied from Claude's proposal are marked "Claude's proposal", and submitting the window does not accept them (TR-15). *(yours: option 2, "Adjust this card", renamed to match REVIEW 4)*
- **DO-3 Shaky.** *(yours: option 3; clarified)*
  - All items marked Shaky in a stage are taken together. Claude may keep, change, remove, split or merge those cards, within the frozen rules.
  - The set it proposes in their place must not be identical to the declined set, though any single card may come back unchanged. "Identical" means the same kinds, sentences and Lean statements, with whitespace collapsed. telelean checks this.
  - If Claude finds no different arrangement, it says so, and the items come back marked "no alternative found".

## 9. Ending a session

- **EN-1** A session ends successfully when you submit a stage in which every item is accepted or rejected, and no transform needing Claude is queued. Otherwise it ends by **Exit session**. *(yours: REVIEW 6; changed: rejected items no longer block the end)*
- **EN-2** A confirmation always comes first. The one exception is Cancel in the window that started a session, when you changed no freezes (ES-3). *(yours: REVIEW 8, extended)*
  - **Apply** shows:
    - the changes, each as a link;
    - your own edits during the session, separately;
    - the final check: every check run on exactly the final state. The file checks may reuse the last result if the final state is identical to the last state judged; the backstop of §11.5 always runs;
    - the freeze changes caused by your decisions (accepted items, your own Freezes and Unfreezes, filled fields, new cards), each with a **keep** tick;
    - the session's starting freezes, summarised in one line ("the other N cards return to how they were").
  - **Exit** shows "discards N accepted and M pending items; your files are not changed", followed by the same freeze list. Here keep ticks are offered only for content that is in your files.
  - Every confirmation has **Back to review**, which returns you to the submitted stage, unsubmitted, with nothing changed.
  - If the final check fails, Apply is disabled and the failures are listed. Nothing is applied.
- **EN-3** **Apply** writes the changes as one history entry and one Undo step, as Accept does today, then restores the freezes, apart from those you ticked keep. It also records each definition and presupposition you accepted as endorsed, so the board stops saying it "needs your endorsement". *(new)*
- **EN-4** Exit discards the session's working copy. Your answers to Claude's questions stay recorded. *(clarified)*

## 10. REFERENCE SYSTEM

- **RF-1** Typing `#` in any prose field (sentences, Why, transform instructions, answers to Claude) opens a dropdown of cards and fields, filtered as you type. Picking one inserts a reference, shown as a chip such as "Cynder has a dark past › Lean statement"; clicking it reveals the target. *(yours)*
- **RF-2** A reference is stored by stable id: the card's id, or the Lean name for a vocabulary card, plus an optional field. *(new)*
  - telelean never reuses a card id within a subject.
  - A reference always shows its target's current name, and a deleted target shows "deleted card".
  - In Lean docstrings and in everything Claude reads, references appear as the target's sentence.
- **RF-3** `#` does not open the dropdown in Lean fields, where it starts commands such as `#check`. Esc leaves a plain `#`. *(new)*
- **RF-4** Short card numbers (#12) are ★D6. *(new)*
- **RF-5** References count as reliance: a frozen card's references hold their targets (FZ-4), and TR-13 warns about them. *(new; safety issue S12)*

## 11. What telelean guarantees mechanically *(new)*

1. A session's changes reach your files only when it ends successfully, and only as a state that passed every check.
2. "Proved" means Lean checked the proof, with no `sorry`, resting on exactly what it lists. For These suffice, that list can contain only:
   - your selected premises (a selected derivation or goal that is only claimed contributes its claim, marked "claimed"), plus any premise Claude proposed and you accepted (named as such);
   - what your selected proved derivations rest on;
   - Lean's standard axioms (propext, Classical.choice, Quot.sound);
   - the signature: every non-Prop axiom that no card owns, including any of yours that break the vocabulary shape rule or sit in the library root. Each one that is not a plain sort, predicate, function or constant is named in the report;
   - the existence presuppositions of the statements involved.
3. Claude never changes frozen or held content, or data telelean keeps. telelean checks this itself. The one exception is a change you allow under FZ-5, which needs your Accept.
4. The accepted items always form a self-contained whole.
5. Nothing becomes something the model assumes without your individual Accept. Apply checks this again, never reusing an earlier result (Appendix B, Backstop).
6. You judge what the statements mean before you see whether they were proved, unless you press Show result.

---

# Part 2: Decisions I need from you

Reply "approve, with the ★ recommendations", plus any overrides by number.

| # | Question | Options | Recommendation |
|---|---|---|---|
| **★D1** | INITIATING 3: "no editing fields directly on the Current tab". The Current view exists only during a session, but outside a session the board is the same view, and today it is fully editable: edit sentence or Why, stance/source chips, Make ‹kind› or drag, Delete, and the A\|D\|G box (which by D-16 never calls Claude). | **(a)** No direct field edits anywhere: you edit through the transform window, and a transform that needs no Claude is applied at once (TR-15: one Undo step, no session). The A\|D\|G box stays. A typo fix becomes select → Transform cards… → edit → Submit, against F2 → type → Enter today. **(b)** As (a), and the A\|D\|G box goes too. **(c)** Literal reading: the Current view is read-only only during a session; outside sessions, today's direct edits stay, except the card-only Delete (S9). | **(a)**: it fits your aim of systematic control, at one extra step per edit. **(c)** if the extra step bothers you. |
| **★D2** | Must "belief" and "changes what is proved" items (RV-7) each be accepted on their own? Cost: for a goal with 3 premises that have no Lean, plus vocabulary and one definition, today's minimum is about 4 clicks; with this rule it is about 10–12 (keyboard: A, Next). | **(a)** Yes, each needs its own Accept, as "I hold this" and "Yes, I endorse it" do today. **(b)** No: group Accept may include them, but its confirmation lists them and needs one more click. | **(a)** |
| **★D3** | As written, These suffice protects nothing (S1). Adopt ES-2's preset: everything that existed is frozen, apart from the selected cards' empty Lean statements and the targets' proofs? | yes / no | **yes** |
| **★D4** | TRANSFORM 3: "delete it permanently" from the trash. | **(a)** Drop it: a trashed card is deleted anyway when applied. **(b)** It hides the card from Claude, so Claude isn't told what was there. **(c)** Recycle bin: trashing archives the card (its Lean kept, restorable), and Delete permanently removes it completely. | **(a)**, unless you meant (c) |
| **★D5** | Build order and cost. M2 alone took about 12.6 M subagent tokens and about 16 h of workflow time; this is roughly 1.5–2.5× that (about 20–30 M tokens over 2–3 days), plus a few real-Claude runs, each announced with its quota before it runs. | **(a)** Four slices, each planned, built and verified like M1/M2, with a stop after each for you to try it: **1.** the review list, statuses, belief items, Result items, dependencies (RV-5), the stage report, Submit review, Reject/Shaky, Exit, and Apply with its backstop (§11.5), for These suffice sessions. This runs on today's checks, which already protect everything in your files, and is what you would use daily. Until slice 2, Accept does not freeze: a later step may still change an accepted item, which then returns to "in review", marked "updated". **2.** FROZEN: standing and session freezes, the Context Menu, field selection, the look, unfreeze requests, and the checks generalised from "your files are immutable" to "frozen and held content is immutable". **3.** The transform window, transform-started sessions and ★D1. **4.** References. **(b)** All at once. | **(a)** |
| **★D6** | References: should every card show a short number (#12) as on GitHub, or is search by sentence enough? | **(a)** Search by sentence only. **(b)** Numbers too. | **(a)**; numbers can be added later |

---

# Part 3: Safety issues found in your text

These are the logic and formalisation-safety problems, in the spirit of "A definition can quietly carry a belief". Each was checked against the current gate (`subagent_reports/understand_workflow/agents/gate-accept.md` §6) and by an independent soundness reviewer. The Lean examples were checked on Lean 4.35 (`bundle_20/evidence/lean_checks/`).

**S1. As written, a "These suffice" session protects nothing.**
- Today everything that existed before a run is immutable to Claude: "existing declarations unchanged", plus "your words untouched".
- Your text replaces that with "Claude may change anything not frozen", but only INITIATING 2 freezes anything.
- So Claude could weaken your goal to `¬ GoodAddition cynder newSpyro ∨ True` and prove it by `Or.inr trivial`, using none of your premises (checked). It could also rewrite the Lean of your premise "PG games cannot have characters with dark pasts".
- **Fix:** ES-2's preset (★D3), applied to every inference, including mid-stage ones (RV-9). It keeps today's protection, with two deliberate differences:
  - Claude may now propose premises as items (S6);
  - your existing proof of the target can no longer be deleted in a step that fails to prove it (closing a known gap, report §3.7 7a).

**S2. Frozen text is not frozen meaning.**
- Suppose a frozen assumption `abbrev cynder_dark_past : Prop := HasDarkPast cynder` keeps its text, but Claude redefines `HasDarkPast` as `def HasDarkPast (_ : Character) : Prop := False`.
- The assumption then says `False`, and `cynder_dark_past.holds.elim` proves your goal. Its footprint lists only that premise plus vocabulary (checked).
- The same works through another card's statement: change the goal that a frozen assumption mentions, and the frozen assumption can become inconsistent while its text is untouched. Instances and `open` can do it too.
- **Fix:** FZ-4 holds everything frozen Lean relies on after elaboration, and FZ-3 compares meaning in Lean.

**S3. The freeze must be out of Claude's reach.** If "frozen" were a field in the card's Lean comment, Claude could edit it in its working copy. **Fix:** FZ-3. Freezes live in telelean's own files; Claude's working copy never contains them.

**S4. Accepting part of a proposal can certify a proof whose ground you declined.**
- For example, you accept the proof of your goal and decline the formalisation of a premise it used.
- The files are then in a state no check ever judged. Today Accept is all-or-nothing precisely to avoid this.
- **Fix:** RV-5 enforces dependencies, and EN-2 reruns every check on the exact final state.

**S5. Group accept, and "one item for all the vocabulary", can adopt hidden beliefs.**
- **The definition cheat.** Claude adds `def InGame (c : Character) (g : Game) : Prop := GoodAddition c g`, formalises your premise as `∀ g c, IsPG g → HasDarkPast c → ¬ InGame c g`, and proves the goal in one line. Every mechanical check passes: the only beliefs used are your three selected premises (checked). The belief "being in a game = being a good addition" lives only in the definition's body, which `#print axioms` cannot see.
- **The presupposition cheat.** Naming `gardenUnicorn` needs `axiom Unicorn.exists : Nonempty Unicorn`. With it, "all unicorns are white" (vacuously true if there are none) proves "the unicorn in my garden is white": existential import.
- **Fix:** definitions and presuppositions get their own items (RV-1), each with its own Accept (RV-7, ★D2).

**S6. Claude can now author beliefs.**
- Gap-filling, Shaky and fuzzy fields let Claude create assumptions. Separately, Claude could turn your proved derivation into a claim by writing `axiom D.holds` in place of its proof: today's new-axiom rule skips names that already exist.
- **Fix:**
  - premises Claude proposes stay outside the files until you accept them (RV-1);
  - belief items are classified by their effect in Lean (RV-7);
  - Claude never changes Kind or replaces a proof with an axiom (CF-4);
  - Apply's backstop checks that every new or changed axiom, definition and instance was individually accepted (§11.5).

**S7. A list lets you see the result before judging the meaning.**
- D-19 hides the proof result until you have seen the statements, to counter automation bias: a "proved" badge makes a wrong formalisation look right.
- In a list, the mere presence of a proof item, or of a premise Claude proposes, would reveal whether the proof succeeded.
- **Fix:** one Result item per inference, always present and kept neutral, which also carries the proof; proposed premises appear only when it is revealed (RV-1, RV-6).

**S8. A proof made in a transform would have no premise set.** "Proved" would then mean nothing definite. **Fix:** transform steps write no proofs (TR-14); proofs come only from These suffice, each with its own premises, statements fixed and comparator check.

**S9. Deleting a card can leave a hidden belief.** Today's "card only" delete leaves `axiom ….holds` behind as an unmarked axiom. **Fix:** a Delete removes the card and its Lean (RV-1), and dependents are handled (TR-13).

**S10. Lean you type can do more than you see.** A Lean field holding `True`, a newline, then `axiom evil : False` adds an axiom that proves anything. **Fix:** TR-12 checks typed Lean.

**S11. Copied Lean, if open, could be weakened.**
- If you transform your goal, its Lean statement could be rewritten to something weaker, then proved in a mid-stage These suffice.
- **Fix:**
  - copied Lean starts frozen (TR-4);
  - every inference uses ES-2's preset (RV-9);
  - a change to existing Lean is a "changes what is proved" item that needs its own Accept (RV-7).

**S12. References create meaning dependencies.** A frozen card that says "‹Spyro is PG› is too strong" changes meaning if Claude rewords the referenced card. **Fix:** a frozen card's references hold their targets (RF-5).

**S13. "Don't propose it again" and "not identical" can only be checked for exact repeats.** A reworded repeat passes both checks. That is not a safety issue, because nothing enters without your Accept. DO-1 and DO-3 say so.

---

# Part 4: Changes from your text

## Clause by clause

| Your clause | What changed (clause) | Why |
|---|---|---|
| Preamble | kept (§0, CF-1) | |
| CONTEXT MENU | kept (CM-1); added: selecting fields and review items, disabled actions with reasons, the action list, the tray's controls moved in, a session bar (CM-2–6) | FROZEN 4 needs field selection; session controls are not selection actions |
| EDIT SESSIONS 1 | the "transform cards" button and INITIATING 2's "initiate edit session" are one action, **Transform cards…**; submitting it unchanged opens an empty session (ES-3) | same action; keeps "initiate a session, then These suffice" possible |
| EDIT SESSIONS 2–3 | added: failures, rollback without losing your decisions, Cancel/Retry, pauses (ES-4) | missing cases |
| REVIEW 1 | added: Result items (one per inference, carrying the proof) and Proof broken items; at most two items per card (RV-1) | S7; dependencies |
| REVIEW 2 | the list and the status table are merged, with cycling kept (Back/Next, ↑/↓); "Vocabulary (N)" holds only new plain vocabulary; definitions, presuppositions and changes to vocabulary get their own items (RV-1/2) | S5 |
| REVIEW 3 | "its definition is FROZEN" now reads "the content it produces is frozen", made precise per item kind (RV-4); un-accepting and unfreezing are linked through reasons (FZ-7) | "definition" means a Lean `def` in telelean |
| REVIEW 4 | kept, except that items of RV-7 need their own Accept (RV-8, ★D2) | S5, S6, S11 |
| REVIEW 5 | its results join the current stage, with ES-2's preset; transforms during a stage wait for Submit review (RV-9) | S11; predictable timing and quota |
| REVIEW 6 | split into Submit review (RV-12) and Exit (ES-8); a stage with only accepts and rejects ends without a Claude step | no quota spent on doing nothing |
| REVIEW 7 | made precise as freeze reasons and standing state (FZ-7/8); plus optional keep ticks (EN-2) | consistency with FROZEN 3; keeps a freeze you want |
| REVIEW 8 | the confirmation also shows the changes, your own edits, the final check and its failure path, with Back to review; on Exit it says what is discarded; no confirmation for Cancel in the window that started a session, if you changed no freezes (EN-2, ES-3) | |
| (new) | dependencies (RV-5), meaning before proof (RV-6), items needing their own Accept (RV-7), the stage report (RV-10), re-checking inferences (RV-11) | S4, S5, S6, S7 |
| (new) | one session per folder, with Current/Proposed views (ES-1); declared premises written at Apply instead of at the start (ES-5); reload (ES-6); your own edits during a session (ES-7); Apply records endorsements (EN-3); steps that propose nothing (RV-13); the guarantees (§11); keep empty (FZ-2); Claude's-wording mark (CF-6); "statements fixed" (FZ-12) | completeness; ES-5 keeps "your files change only at the end" exact |
| DECLINE 1 | applies to Change and Delete items too; carried out at once; the card is not frozen; the "Rejected in this session" list (DO-1) | "don't create" only fits Add items |
| DECLINE 2 | renamed **Transform**, shows the previous version too, waits for Submit (DO-2) | matches REVIEW 4 |
| DECLINE 3 | the Shaky items of a stage form one set; "identical" defined; an escape when no alternative exists (DO-3) | otherwise Claude is forced into cosmetic changes |
| TRANSFORM 1 | "ok" is Submit transform (TR-1) | |
| TRANSFORM 2 | you choose a new card's Kind (and a vocabulary card's name) when you create it (TR-2) | a card without a kind cannot exist; Claude must not choose your beliefs' kind |
| TRANSFORM 3 | "delete permanently" is ★D4 (TR-3) | unclear |
| TRANSFORM 4–5 | fuzzy = not frozen and empty; open = not frozen and filled; copied Lean starts frozen; copied empty fields start "keep empty"; a Proof is never fuzzy (TR-4/5, TR-14) | S8, S11; so Claude formalises a card only if you ask |
| TRANSFORM 6 | new plain vocabulary is always allowed, and so is splitting a Shaky card (TR-7) | formalising needs vocabulary |
| TRANSFORM 9 | "Claude suggests" is no longer a special card (TR-10, RV-1) | your preamble |
| TRANSFORM 10 | made precise: the fields (CF-2), data telelean keeps (CF-3), Kind changed only by you (CF-4) | S6 |
| (new) | typed Lean checked (TR-12), warnings (TR-13), Claude-free transforms (TR-15), kind changes by D-11 (TR-11) | S10; D-11; ★D1 |
| FROZEN 1 | the aura in its own colour, inside the card, plus a lock (FZ-11) | avoids clashing with the blue aura and D-15 |
| FROZEN 2 | added: where freezes live and how they are checked (FZ-3); held content (FZ-4); the request lifecycle (FZ-5) | S2, S3 |
| FROZEN 3 | via reasons and standing state (FZ-7/8) | |
| FROZEN 4–5 | added: every interface, the scope of "all other cards", the confirmation before removing standing freezes, Undo, freezing while Claude works (FZ-9/10) | edge cases |
| INITIATING 1 | the preset; targets marked with ⊢; Self-evident? (ES-2) | S1, ★D3 |
| INITIATING 2 | merged with EDIT SESSIONS 1 (ES-3) | |
| INITIATING 3 | ★D1 | ambiguity; conflicts with D-16/D-17 |
| REFERENCE | added: stable storage, no dropdown in Lean fields, deleted targets, references hold targets, ★D6 (RF-2–5) | S12 |

## What this replaces in today's telelean

| Today | Under this spec |
|---|---|
| "Claude suggests" cards with "I hold this" / "No" | Add items for proposed premises (belief items); accepting one also completes the proof |
| The review stepper (Statement 1…N, New vocabulary, Definitions, Result, Card changes) | The review list plus the stage report (D-19's one-shot review becomes per item, over several stages) |
| "Yes, I endorse it" on definitions | Accept on each definition's own item (D-4 kept) |
| Vocabulary "Revoke…" | Decline on the vocabulary item or sub-item |
| "Card changes" ticks | "make it a Derivation" on the Result item |
| Show result | kept (RV-6) |
| Accept (all-or-nothing) | Accept per item, then Apply once at the end, as one Undo step (D-21's deferred partial accept, made safe) |
| Feedback… | Decline → Transform with instructions |
| Discard | Exit session |
| Self-evident?, Add to its premises ▶, the warning about dropped premises | kept, in the Context Menu (CM-4) |
| "Card only" delete (keeps the Lean) | gone: a Delete removes the card and its Lean (S9) |
| "Your words untouched" and "existing declarations unchanged" | the preset freezes (ES-2/3), checked by FZ-3/4, plus data telelean keeps (CF-3) |
| Direct board edits, drag to change kind | ★D1; kind changes still follow D-11 |
| One target per run | several targets, proved one after another |
| "Statements frozen (round N)" | "Statements fixed" (FZ-12) |

---

# Appendix A: Edge cases *(not for approval: consequences of the clauses above)*

- **A1** You reject an item that a pending item depends on: the dependent item becomes "to be redone" (RV-3).
- **A2** Your frozen Lean no longer builds once Claude has filled the rest. Claude cannot fix it, so it makes an unfreeze request instead of retrying forever, and the stage reports it.
- **A3** An instruction can't be followed without changing frozen content: Claude makes an unfreeze request (FZ-5). If you keep the content frozen, the stage reports that the instruction couldn't be followed.
- **A4** Your files change on disk during a session: your edits are copied into the session as they happen (ES-7), and a conflict with an accepted item shows when you make the edit. Apply re-checks everything on the final state.
- **A5** You press "Unfreeze all other cards" by accident: Ctrl+Z restores the freezes and the statuses together (FZ-9).
- **A6** A freeze record whose card no longer exists is listed under "Frozen items not found", never dropped silently. Deleting a card through telelean removes its record.

# Appendix B: The checks, rule by rule *(for implementing; not for approval)*

- **Kept:**
  - G0, the forbidden-text scan;
  - the build;
  - no `sorry`, no `example`;
  - the vocabulary shape rule, now also for *changed* items;
  - the definition questions, now also for *changed* definitions and for items that change kind;
  - per inference: the footprint within its permitted set, statements fixed, and Lean's comparator (G4);
  - in a step that does not finish proved, each target's `.holds` stays byte-identical to its version at the step's start (today's status-mismatch rule, extended to removals and changed theorems).
- **Replaced:** "existing declarations unchanged" and "your words untouched" become:
  - the frozen and held check (text compared directly; meaning compared in Lean, by term comparison like G4's, or at least by fully explicit printing);
  - "data telelean keeps never changes" (CF-3): Claude may not change an existing block's `type:`, and may add a block only when "Claude may add cards" is ticked, for a Shaky split, or as new vocabulary.
- **Generalised:**
  - new-axiom counts an axiom as new unless your files had an axiom of that name **and type** when the session started;
  - each declaration Claude adds is judged against the permitted set of the inference that produced it;
  - accepted content is protected by the frozen check, not by the baseline.
- **Baseline:**
  - your files at session start, plus what you typed and telelean's follow-on edits from your transforms, committed by telelean with Lean facts rebuilt;
  - content copied from Claude's proposal never joins the baseline and never counts as your proof;
  - Claude's content never counts as your text (for G0 or new-axiom);
  - a proof you accepted counts as yours only for later inferences' permitted sets (RV-11).
- **Held sets:** the transitive closure of the constants in each frozen declaration's elaborated type and value, through card statements, definitions, lemmas and instances. For a `.holds`, only its type. Not today's `uses` list, which records vocabulary only.
- **Backstop at Apply** (never reused). telelean lists each declaration of the final state that is new or changed relative to the session base plus your own edits.
  - Each of these must belong to an item you accepted individually:
    - (a) every axiom, except new sorts, predicates, constants and functions that pass the shape rule;
    - (b) every definition, instance or coercion in the elaborated closure of any card's Lean statement, with the closure computed as for held sets;
    - (c) every existing name whose kind, type or value changed.
  - Exempt: an accepted presupposition's helper instance, lemmas, and definitions or instances that no statement reaches.
  - Every frozen and held declaration still elaborates to its frozen term. A held item changed under FZ-5 passes only if it and all its "meaning changed" items are accepted.
  - Otherwise Apply is refused, naming the declaration.
- **Storage:**
  - standing freezes go in a per-subject file under `.telelean/`, keyed by written card id (an id is written first if needed) or by vocabulary Lean name;
  - session state (items, statuses, the Rejected list, session freezes, the standing snapshot) lives with the run's state in VS Code's storage;
  - neither is ever in Claude's working copy.
- **Sessions are runs with rounds:**
  - a review stage is a round;
  - Submit review sends structured Feedback, generated from the statuses;
  - Apply is today's all-or-nothing Accept path (rebase, re-check, one history entry) on the fully decided state;
  - transform-started sessions need a run kind without a single target, whose steps finish as "done" or "cannot".

# Appendix C: Answers to your three questions

**1. What does the "Fully explicit" checkbox do?**
- It appears on each "Statement N" step of today's review.
- It switches the Lean shown there between Lean's normal printing and the same statement printed with `pp.explicit true`, `pp.notation false`, `pp.universes true` and `pp.coercions false`:
  - `¬P` becomes `Not (P)`;
  - `∧`, `∨`, `↔` become `And`, `Or`, `Iff`;
  - `∃ x, …` becomes `Exists fun x => …`;
  - `a = b` becomes `@Eq T a b`, showing the type;
  - hidden arguments, universe levels and coercions are written out.
- It changes only what you see, one statement at a time. Nothing in your files or in Accept changes.
- It exists so you can check that the Lean says what your sentence says without notation hiding anything: the scope of a `¬`, how `∧`/`∨`/`→` group, the order of quantifiers, an equality's type, an inserted coercion or instance.
- With telelean's simple vocabulary it mostly spells out the logical symbols.
- Lean produces both forms in a scratch check (`runner/src/gate/scratch.ts`). If Lean could not print a statement, both show the source text, and the toggle changes nothing.

**2. "Claude suggests" cards versus "Statement 1", "Statement 2"…**
- **"Statement N"** is a *meaning check*. There is one step per card whose Lean statement Claude wrote or changed this round: usually the goal and the premises it formalised.
  - It asks "Does the Lean say what the sentence says?", showing your sentence above Claude's Lean.
  - These formalisations are already in the files Accept would write. There is no accept or decline per statement today: you can only Accept everything, give Feedback, or Discard.
- **"Claude suggests"** is a *new belief* Claude proposes, usually because the goal did not follow from your premises.
  - It is not in the files. telelean checked in a scratch file that your premises plus it prove the goal ("closes the gap (checked)"), and flags it when it may simply restate the goal.
  - It has its own decision: "I hold this" makes telelean write it as your assumption (in Claude's wording) and start another proof round; "No" drops it.
  - Once adopted, it gets its own Statement step in the next round.
- In short: a statement step checks Claude's *translation* of your cards; a suggestion asks whether you *believe* something new. Under this spec, the first becomes Formalize items and the second becomes Add items (belief items).

**3. Where do "definitions" show up in the main card graph?**
- **Only in the Vocabulary group,** in its "Definitions" section. The group sits at the top of the Assumptions column, after any "Claude suggests" cards and before the cards themselves, and is collapsed by default.
  - Each definition is a box (name, type, gloss) with a flag "definition on a statement path" when a statement relies on it.
  - Expanded, it shows its code and the cards that use it.
  - Definitions have no cards, no column and no arrows.
- **From a card**, you reach its definitions three ways:
  - the "uses:" line and its ▾ menu;
  - hovering or clicking an identifier in the expanded Lean, which opens and highlights the item;
  - the "definitional choice" chip, information only.
- **Not shown as definitions:**
  - a card's own `abbrev n : Prop := …`, which is the card's statement;
  - existence assumptions (`T.exists`), which are under "Presuppositions".
- After Accept, your "Yes, I endorse it" is not recorded anywhere, so the board keeps saying that the definition "needs your endorsement". Under this spec, the accepted item records it.

# Appendix D: How this proposal was made

1. Six read-only agents mapped the current code (review UI, board, run engine, gate and Accept, card model, design rationale): `subagent_reports/understand_workflow/`.
2. A first revision (v2) was written from your text and the maps.
3. Four independent reviewers (fidelity, logic, soundness, implementability) raised 108 findings (4 blockers, 51 major, 47 minor, 6 nits): `subagent_reports/review_workflow/`.
4. Every finding was decided. Most were accepted; where reviewers disagreed, one option was chosen, with reasons: `subagent_reports/review_workflow/DISPOSITIONS.md`.
5. Two final verifiers checked v3: one read it cold for consistency, the other re-attacked its soundness. They raised 26 findings: 1 blocker (Claude's proposal could be accepted through a Decline → Transform that only edited prose), 13 major and 12 minor. All were applied, one partly: `subagent_reports/verification_workflow/DISPOSITIONS.md`. This is v3.1.
6. The Lean examples in Part 3 were checked on Lean 4.35: `evidence/lean_checks/`.
