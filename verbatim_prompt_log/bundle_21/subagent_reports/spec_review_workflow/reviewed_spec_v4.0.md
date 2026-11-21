# Edit sessions and the new board: revised specification v4 (proposal for your approval)

**Status:** a proposal. Nothing is implemented.
- v4 = v3.1 (turn 20, `bundle_20/user_requested_documents/01_edit_sessions_spec_proposal.md`) + the board changes you sent in turn 21 (`bundle_21/prompt21.md`) + your answers to ★D1–★D6 (`bundle_21/prompt21_midturn.md`).
- How v4 was checked: Appendix D.

**How to read it.**
- **Part 1** is the specification. Every clause has an ID (e.g. `AR-6`), so you can approve or amend it by number.
- **(v4)** after a clause ID marks a clause that is new or changed since v3.1. Everything else is v3.1 unchanged, apart from the renamed terms (Part 4).
- The tag after each clause says where it came from:
  - *(yours: REVIEW 3)*: a clause of your turn-20 text, reworded only;
  - *(yours: T21 ¶7)*: paragraph 7 of your turn-21 text (Part 4 numbers the paragraphs);
  - *(decided: ★D3)*: your answer to a turn-20 decision;
  - *(clarified: …)*: yours, with an ambiguity resolved;
  - *(changed: …)*: differs in substance from your text;
  - *(new)*: added by me.

  Every *changed* and *new* clause is listed with its reason in Part 4.
- **Part 2** lists your turn-21 answers, and the two further decisions (★D7, ★D8), which I took for you on autopilot, as you asked. How to reverse each is in `bundle_21/user_requested_documents/02_autopilot_decisions.md`.
- **Part 3** lists the safety issues: S1–S13 from turn 20, and S14–S21, new in v4.
- **Part 4** is the change log. The appendices hold edge cases, the checks rule by rule, the answers to your turn-20 questions, and how this was made.

**Earlier decisions referred to** (from the first design round; you approved them in turn 2):

| Code | Decision |
|---|---|
| D-3 | Vocabulary is computed from Lean, not written as markup. |
| D-4 | Definitions need your endorsement. |
| D-5 | "Self-evident?": a claim with no premises, provable from nothing. |
| D-6 | Only you add beliefs; Claude can only suggest them. |
| D-11 | telelean's rules for changing a card's kind: a `.holds` that others use is never removed before its replacement exists; dependents are handled. |
| D-13 | Declared premises, drawn as dashed arrows. |
| D-15 | Visual conventions: dashed = declared by you, solid = verified by Lean, translucent = suggested, blue aura = has Lean. |
| D-17 | Direct editing on the board, drag to change kind, in-board Undo. |
| D-19 | Statements are fixed before proving, and you see what a statement means before you see whether it was proved. |
| D-21 | Accept is all-or-nothing. |

**What v4 changes, in six lines:**
1. **One AXIOMS column and a PROPOSITIONS canvas.** The canvas zooms with the wheel about the cursor, or with a pinch, and pans with a right-drag. The Vocabulary and Definitions columns sit above. Derivations and goals are now just propositions (BD).
2. **You draw the dependency arrows.** Formalize for dependencies proves the targets of the arrows you select, from those arrows' sources. Lean, never Claude, decides the green band (the arrows a checked proof really uses) and the green glow (proved all the way down to axioms) (AR, ES-2).
3. **A card's place is its kind.** Dragging a proposition into the AXIOMS column makes it an axiom. An arrow into an axiom makes it a proposition whose claim stays "pending proof" until a run proves it (AR-6, AR-7).
4. **Claude's arrow changes are review items.** An arrow a proof relies on needs its own Accept. Declining an arrow takes down what rests on it (RV-1, DO-0).
5. **Your turn-20 answers are built in:**
   - direct edits are allowed, except during an edit session (★D1);
   - each belief or proof-changing item needs its own Accept (★D2);
   - the freeze preset is adopted, with an **Open the whole model** switch (★D3);
   - no "delete permanently" (★D4);
   - the build goes in slices, or on autopilot when you say so (★D5);
   - references are found by searching sentences (★D6).
6. **Eight new safety issues** (S14–S21). The main ones are below.
   - A pending claim must not make a card look proved.
   - Claude's arrows must not look like yours.
   - Every card a proof uses must have a drawn arrow.

---

# Part 1: The specification

## 0. Purpose *(yours: preamble)*

Give you granular, systematic control over the cards and over every change to them. Reduce the number of special cards: every card gets the same base capabilities.

## 1. Terms

| Term | Meaning |
|---|---|
| **Card** (v4) | Anything on the board: an **axiom** or **proposition** card, or a **vocabulary card** (a type, predicate, function, constant, definition, presupposition, lemma …). |
| **Axiom** (v4) | A card for something you hold. It sits in the AXIOMS column, and its `.holds` is a Lean `axiom`. This was "ASSUMPTION". |
| **Proposition** (v4) | A card for something derived, or to be derived. It sits on the canvas. Its `.holds` is a theorem (**proved**), a Lean `axiom` (**pending proof**), or missing (**unproved**). This replaces "DERIVATION" and "GOAL". |
| **Arrow** (v4) | "X → Y": you claim that Y follows, at least in part, from X. It is **dotted** while only claimed, and **solid** once a checked proof of Y uses X. |
| **Dependencies** (v4) | A proposition's incoming arrows, as one field. "Follows from nothing" is the explicitly empty set (AR-5). |
| **Band** (v4) | The green band that binds the arrows a checked proof uses: together they suffice (BD-7). |
| **Established** (v4) | Proved, and resting only on axioms, never on a pending claim. Shown as the green glow (BD-6). |
| **Field** | An editable part of a card (§2). |
| **Frozen** | A field, card or arrow that Claude may not change (§5). |
| **Held** | Not frozen itself, but something frozen content relies on, so Claude may not change it either (FZ-4). |
| **Fuzzy** | An empty field that Claude is asked to fill in (TR-4). |
| **Edit session** | A sequence of Claude steps and review stages, worked on a private copy of your model (§7). |
| **Claude step** | One stretch of Claude's work inside a session. "Claude" means whichever LLM telelean is set up with. |
| **Formalize for dependencies** (v4) | The action that replaces "These suffice": select arrows, and Claude formalises and proves what they claim (ES-2). |
| **Inference** (v4) | One target of Formalize for dependencies, with its **question**: the selected arrows into it. |
| **Review stage** | Your pass over the proposed changes, one **review item** per change (§9). |
| **Belief item** / **proof-changing item** | Review items that need their own Accept (RV-7). |
| **Arrow item** (v4) | A review item for an arrow Claude adds or removes (RV-1). |
| **Transform** | The window in which you propose turning a set of cards into another set (§8). |
| **Context Menu** | The toolbar section that shows the actions for the current selection (§6). A right click opens the same actions at the cursor (CM-7). |
| **Session bar** | The bar above the board that holds the controls of the active session (CM-6). |
| **Reference** | A link to a card or field, typed with `#` (§12). |
| **Apply** | Writing a finished session's changes to your files (EN-3). It replaces today's "Accept" button. |

## 2. Cards and fields

- **CF-1** Every card has the same base capabilities: you can select it or any of its fields, freeze or unfreeze it, reference it with `#`, and transform it. The one exception is vocabulary from other subjects, which cannot be transformed (TR-10). *(new; from your preamble)*
- **CF-2 (v4)** Fields you can edit: *(clarified: TRANSFORM 10's "sensible fields"; yours: T21 ¶9)*

  | Card | Fields |
  |---|---|
  | Axiom | Sentence · Kind · Why · Stance · Source · Lean statement |
  | Proposition | Sentence · Kind · Why · Stance · Source · Lean statement · Dependencies · Proof |
  | Vocabulary | Lean declaration (the whole declaration) · Gloss |

  - A Proof is in one of three states:
    - *empty*;
    - *pending*, i.e. an `axiom ….holds`, which counts as no proof;
    - *proved*, i.e. a theorem.
  - An axiom's `.holds` is not a field of its own: it must state exactly the axiom's Lean statement.
  - **Dependencies** holds the proposition's incoming arrows, stored as its declared premises, or the "follows from nothing" mark (AR-5).
- **CF-3 (v4)** **Data telelean keeps** is never changed by Claude, frozen or not, and every check verifies this, as today's "your words untouched" rule does. *(new; v4: declared premises moved out)*
  - It covers:
    - the card's id, its dates and its provenance (who worded it, where it came from, which session created it);
    - its Kind (only you change it, CF-4);
    - lineage, tags, notes and extension data;
    - its Lean pin and binding;
    - its position on the board.
  - Declared premises are no longer in this list. They are the Dependencies field, which Claude may change when it is not frozen, through review items (AR, RV-1).
  - Claude adds a new card only when it proposes a missing premise (RV-1), when "Claude may add cards" is on (ES-2, TR-7), when splitting a Shaky card, or as new vocabulary.
  - A card's Lean statement means three things together: its binding, the full text of the bound declaration, and what that declaration means in Lean.
- **CF-4 (v4)** **Kind** is a field, but only you change it. *(new; v4: yours: T21 ¶11)*
  - You change it by dragging a proposition into the AXIOMS column (AR-7), by drawing an arrow into an axiom or marking it "follows from nothing" (AR-6), or in a transform (TR-11).
  - telelean carries the change out by D-11, showing its impact first.
  - Claude never changes the Kind of an existing card. It never adds an arrow into an axiom, never moves a card between the column and the canvas, and never turns a proof into an axiom. It can ask you to.
- **CF-5 (v4)** Vocabulary stays computed from Lean (D-3). A vocabulary card is identified by its Lean name, and keeps its box look in the Vocabulary or Definitions column (BD-1), so it does not read as a belief. *(clarified: TRANSFORM 9's "Vocabulary cards")*
- **CF-6** telelean marks any sentence Claude writes as Claude's wording (italic). When you edit that sentence yourself, it becomes yours; today the mark wrongly survives your edit. *(new)*
- **CF-7 (v4)** Derived information can never be edited or frozen. *(yours: TRANSFORM 10; v4: arrows split)*
  - It covers: status, the glows and bands, solid arrows (what a proof uses), Used by, Uses, Rests on, and attempts.
  - Dotted arrows are not derived: they are the Dependencies field, which you edit and can freeze (FZ-13).

## 3. The board *(v4; yours: T21 ¶2, ¶7–¶10, ¶12)*

- **BD-1 (v4) Layout.** *(yours: T21 ¶7, ¶10; clarified: divider, collapse, where presuppositions go)*
  - At the top, side by side, are the **Vocabulary** column and the **Definitions** column, each scrolling on its own. Below them are the **AXIOMS** column on the left and the **PROPOSITIONS** canvas filling the rest.
  - The divider between top and bottom can be dragged.
  - The top can be collapsed to one line that still shows its counts and flags, e.g. "Definitions 4 · 1 needs your endorsement".
  - The Definitions column holds today's "Definitions" section: `def`, `abbrev`, `structure`, `inductive`, `class` and `instance`.
  - The Vocabulary column holds today's other sections: Types, Predicates & relations, Functions, Constants, Presuppositions, Lemmas, Unmarked axioms and Other.
  - Other subjects' items that this subject uses are shown read-only, as today.
  - The AXIOMS column header also counts what is assumed without a card: "also assumed: N existence assumptions, M hidden assumptions". Each links to its item in the Vocabulary column. So the column accounts for every belief.
- **BD-2 (v4)** The AXIOMS column holds axiom cards only, in your order: drag within the column, or press Alt+↑/↓. It scrolls vertically. *(yours: T21 ¶7, ¶9)*
- **BD-3 (v4) The canvas** holds proposition cards, placed freely. *(yours: T21 ¶7, ¶8; clarified: keys, trackpads, where new cards go)*
  - **Zoom:**
    - the mouse wheel zooms about the cursor;
    - Ctrl+wheel (a trackpad pinch) zooms the same way;
    - the zoom range is fixed (about 10 %–400 %).
  - **Pan:** right-button drag, as in Miro or Prezi.
    - A trackpad's two-finger scroll cannot be told apart from a wheel, so it zooms too.
    - On a trackpad, pan with a right-button drag or the keyboard.
  - **Left button:**
    - drag a card to move it;
    - drag on empty canvas to draw a selection rectangle (it selects the cards and arrows inside);
    - drag from a card's arrow handle to draw an arrow (AR-1).
  - **Keyboard:**
    - Tab moves between cards, and the canvas follows the focused card;
    - + and − zoom;
    - the arrow keys pan while the canvas has focus;
    - **Fit all** and **Zoom to selection** are in the toolbar.
  - **Placement:**
    - telelean places every card that has no stored position: an existing board on first opening, a new card from the A|P box, or a card from a proposal. Sources go to the left of their targets, and cards do not overlap.
    - Moving a card stores its position. **Tidy layout** re-places the selected cards.
    - Positions are layout only: they change only the subject's layout file, never appear in a review, and never count as an edit.
  - "Show on board" and every other reveal pan and zoom the canvas to the card.
- **BD-4 (v4) Arrows across the two parts** follow the column's scrolling and the canvas's pan and zoom. *(yours: T21 ¶12; clarified: off-screen ends)*
  - When an end is out of view, the arrow stops at the edge of the column or the canvas, with today's "▲ n linked" stub badges.
- **BD-5 (v4) How arrows look** (D-15; never colour alone). *(new)*

  | Look | Meaning |
  |---|---|
  | dotted | declared by you |
  | solid | a checked proof of the target uses it |
  | hollow head | the proof takes it as a hypothesis (today's conditional proofs) |
  | translucent, with a "+" or "−" mark | proposed by Claude (Proposed view and review only) |
  | lock badge | frozen (FZ-13) |
  | solid, in the warning colour | a proof uses a card you drew no arrow from (only hand-written proofs can, B.2; TL107) |
  | thin, only while an end is hovered or selected | one statement mentions the other (today's reference arrows) |

  A dotted arrow into a proved card that the proof does not use stays dotted, with the tooltip "not used by the current proof". It is never removed for you, and it is not a warning.
- **BD-6 (v4) Glows.** *(yours: T21 ¶2; changed: S16)*
  - **Blue glow:** the card has a Lean statement, as today.
  - **Green glow**, with "✓ proved": the card is **established**.
    - Its proof is checked by Lean, takes no hypotheses, and uses no `sorry` and no hidden axiom.
    - Everything it rests on is an axiom card, a presupposition or a definition. It never rests on a pending proposition.
    - The green glow replaces the blue one.
  - A proposition that is proved but not established keeps the blue glow, with a chip saying why: "rests on pending: ‹card›", "given: ‹card›" (conditional), or "uses a hidden assumption".
  - A pending proposition shows "pending proof" (today's "promotion pending").
  - Axioms never glow green. An axiom whose `.holds` is a theorem shows "has a proof" (today's TL106).
- **BD-7 (v4) The band.** *(yours: T21 ¶4; clarified: what decides it)*
  - When a proposition's proof is checked, a green band, with a ✓ and the tooltip "Together these suffice (checked by Lean)", binds the arrows from the cards the proof uses directly, at the target's end.
  - For a card proved from nothing, the band sits on its "follows from nothing" mark.
  - telelean computes the band from Lean after every check. These are the cards whose `.holds` the proof reaches, following lemmas and definitions that belong to no card (today's `directUses`). The band never comes from Claude's account.
  - The band says that these arrows suffice together. It does not say that each one is needed, or that your axioms are consistent (S20).
  - If the proof also relies on definitions or presuppositions, the band carries a chip naming them, e.g. "also by definition: InGame".
  - The band is drawn even when the target is proved but not established: it certifies the inference, and the glow certifies the card.
  - A proposition has one proof, so at most one band.
- **BD-8 (v4)** The **A|P box** (today's A|D|G box) stays. *(decided: ★D1)*
  - It adds an axiom to the column, or a proposition to the canvas (placed in view, next to the selected card if any).
  - Your words are kept verbatim; no Claude and no Lean are involved.
- **BD-9 (v4) Colours.** *(new)*
  - The axiom stripe keeps today's Assumption colour, and the proposition stripe takes today's Goal colour.
  - Green is kept for "proved": the glow and the band. Today's green Derivation stripe goes.
  - The legend lists: declared, verified by Lean, conditional, mismatch, formalised, established, band, pending proof, frozen.

## 4. Arrows and dependencies *(v4; yours: T21 ¶3–¶6, ¶11)*

- **AR-1 (v4) Drawing.** *(yours: T21 ¶3; clarified: gestures)*
  - To draw an arrow, drag from a card's arrow handle (shown on hover at its right edge) to another card. Alternatively, select one or more cards, right-click the target, and choose **Draw arrows from the selection**.
  - To remove arrows, select them and press Delete.
  - Each such change is one Undo step and one History entry, as other board edits are today.
- **AR-2 (v4)** An arrow X → Y means "Y is derived, at least in part, from X". *(yours: T21 ¶3)*
  - Y must be a proposition: drawing into an axiom makes it one (AR-6).
  - There is one arrow per pair, and arrows stay within one subject, as today.
- **AR-3 (v4) Cycles.** An arrow that would close a cycle is refused, and the message names the cycle. *(yours: T21 ¶11; clarified: also for Claude)*
  - This holds for your arrows, for telelean's follow-on edits, and for Claude's proposals.
  - It is checked on every state telelean judges.
- **AR-4 (v4)** The set of arrows into a proposition is its **Dependencies** field (CF-2). *(new)*
  - It is stored as the card's declared premises (`premises:`).
  - Today only "These suffice" writes that field. Under v4 you write it by drawing, and Claude proposes changes to it as items.
- **AR-5 (v4) Follows from nothing.** *(yours: T21 ¶11; clarified: a selectable mark; replaces "Self-evident?", D-5)*
  - A proposition with no incoming arrows can be marked **follows from nothing**, from the Context Menu.
  - The mark shows as a short stub arrow "∅" into the card. You can select it like an arrow, freeze it, and formalize it.
  - Drawing an arrow into the card removes the mark (Undo restores it).
  - A proposition with neither arrows nor the mark has no stated basis yet. Nothing can be formalized for it until you give it one.
  - Only you set or remove the mark. Claude can ask (FZ-5).
- **AR-6 (v4) From axiom to proposition.** You cannot drag an axiom onto the canvas. *(yours: T21 ¶11; clarified: any card can be the source; "follows from nothing" also works)*
  - Instead, draw an arrow into it from another card, or mark it "follows from nothing". It then moves to the canvas, next to its new source.
  - Its `axiom n.holds` stays, marked **pending proof**, until a run proves it. So everything that uses it keeps building (D-11: a `.holds` that others use is never removed before its replacement exists).
  - Before you let go, the gesture states the impact, e.g. "3 cards that rest on it will lose their green glow until it is proved" (BD-6).
- **AR-7 (v4) From proposition to axiom.** Drag a proposition into the AXIOMS column, or choose **Move to axioms**. *(yours: T21 ¶11; clarified: the impact)*
  - It loses all its incoming arrows, and any "follows from nothing" mark, and becomes an axiom.
  - Its proof, if any, is replaced by `axiom n.holds`. The proof stays in History, and Undo restores it.
  - Its outgoing arrows stay.
  - The drop zone states the impact first:
    - the arrows that will be removed, naming the frozen ones;
    - that the proof will be dropped;
    - how many cards will now rest on it as an assumption.
- **AR-8 (v4)** A proposition with no proof and no pending claim can be the source of an arrow. Formalizing such an arrow first asks you (★D7 (b)): "‹source› is not proved. Mark it pending (assumed until proved), also formalize the arrows into it, or cancel?" Nothing is assumed without your answer. *(new; safety issue S17)*

## 5. FROZEN

- **FZ-1 (v4)** Claude cannot change a frozen field, and cannot delete a card that has any frozen field. Freezing a card freezes all of its fields, including a proposition's Dependencies. Frozen binds Claude only: you can always change a field yourself, and it then stays frozen. *(yours: FROZEN 1–2)*
  - An arrow belongs to its target's Dependencies. So freezing a card does not freeze the arrows out of it.
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
- **FZ-4 (v4) Held: frozen meaning, not just frozen text.** Claude may also not change: *(new; safety issues S2, S12)*
  - anything that frozen Lean relies on, as Lean sees it after elaboration: other cards' statements, definitions, lemmas, vocabulary, and the instances and coercions Lean inserted. For a `.holds`, only its type is held; proofs are not, because a proof cannot change what any statement means;
  - the field that a frozen card's sentence or Why references with `#` (for a reference to a whole card, that card's Sentence).

  Any other way of changing what frozen Lean means, for example an instance, an `open` or an attribute placed before it, is caught by the meaning comparison of FZ-3.

  Held never overrides ES-2's exceptions: a target's Proof stays open, and an empty Lean statement at either end of a selected arrow stays fuzzy, because neither changes what a frozen card says. The Result lists any frozen card whose "Rests on" changes as a consequence.

  Held items show a chain mark: "held by ‹card›".
- **FZ-5 Unfreeze requests.** If Claude wants to change frozen or held content, it must ask first. *(yours: FROZEN 2, REVIEW 5; lifecycle: new)*
  - A request card says what Claude wants to change and why. It offers **Select them**, **Continue** and **Keep frozen**.
  - The step pauses while the request is open, as it does for a question. **Continue** tells Claude exactly which of the requested items are now unfrozen. **Keep frozen** tells it that none are.
  - A request still open when the step ends is listed in the stage report.
  - For held content, the card names what holds it and offers **Allow this change** on the held item X.
    - X is then exempt from the held check, and its frozen holders are compared against X's new version instead of the old one.
    - Every frozen card whose held closure contains X gets an item "meaning changed by X". This is decided by membership in the closure, not by comparing the card's own Lean, which may read the same. It is a belief item if the card is an axiom.
    - X's own item can be accepted only after each of these items is accepted, individually where RV-7 requires it.
    - Declining any of them declines X and restores it. Accepting X makes its accepted version X's frozen value.
- **FZ-6 (v4)** Only you unfreeze: select the cards, fields or arrows, then choose **Unfreeze** in the Context Menu. Claude may then change them because they are no longer frozen, not because you approved anything. *(yours: FROZEN 2)*
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
- **FZ-9 (v4) Always available.** *(yours: FROZEN 4–5; clarified)*
  - Wherever a card, field or arrow is shown (the board's Current and Proposed views, review items, the transform window, the end confirmation, request cards), you can select it and choose **Freeze**, **Unfreeze**, **Freeze all other cards** or **Unfreeze all other cards** in the Context Menu. This works at any time, including while Claude works.
  - "All other cards" means every card of the current subject that contains none of the selected items, with all its fields, Dependencies included.
  - **Unfreeze all other cards** asks first if it would remove standing freezes, and says how many. It leaves accepted content frozen unless you tick "also un-accept".
  - Freeze changes go on the board's Undo (Ctrl+Z). They change no file and make no History snapshot.
- **FZ-10 Freezing while Claude works** freezes the version you see. *(new)*
  - Claude is told in its next tool result, and a check that fails only because of this freeze does not count as one of its attempts.
  - Freezing a card that has a pending item asks which version to freeze: Claude's proposal (the item stays in review), or your version (which rejects the item).
  - Rejecting an item whose proposal you froze first asks whether to unfreeze it.
  - Freezing an empty field that Claude is filling asks you to confirm.
- **FZ-11 (v4) Look.** *(yours: FROZEN 1, made concrete)*
  - A frozen card gets an aura in its own theme colour (`telelean.frozen`, never blue or green), drawn inside the card so it combines with the glows and the diff halos, plus a lock badge, so it is never colour alone.
  - It never uses dashing or translucency, which already mean "declared by you" and "suggested" (D-15).
  - A frozen field shows a small lock. A frozen arrow has a lock badge at its middle. Frozen Dependencies show a lock where the arrows enter the card, and a "dependencies frozen" chip.
  - In high-contrast themes, a lock badge and a "frozen" chip replace the aura. The legend gets an entry.
  - During a session, the session's starting freezes appear as one banner, and the board marks what Claude may change rather than putting an aura on every card. The banner text depends on how the session started:

    | Started by | Banner |
    |---|---|
    | Formalize for dependencies | "Only empty Lean statements at the selected arrows, the targets' proofs, and new arrows into the targets may change" |
    | the same, with the whole model open | "Whole model open: only your own freezes and the selected arrows are kept" |
    | Transform cards… | "Everything except the selected cards is frozen" |

    Standing freezes and your own keep their aura.
- **FZ-12** The run's existing "statements frozen before proving" step (D-19) is renamed **statements fixed**, with its own icon, so it cannot be confused with FROZEN. *(new; terminology)*
- **FZ-13 (v4) Freezing arrows and dependencies.** *(yours: T21 ¶5)*
  - Select one or more arrows (or a "follows from nothing" mark) and choose **Freeze**: Claude may not remove them.
  - To freeze a proposition's **Dependencies**, select that field or freeze the whole card. Claude then may neither add nor remove arrows into it, nor change its "follows from nothing" mark.
  - Reasons, frozen values, Undo and the rest of §5 apply as for any field.

## 6. Selection and the CONTEXT MENU

- **CM-1** A section of the toolbar labelled **Context Menu** shows the actions that fit the current selection. It has a fixed height, so it does not reflow the toolbar. With nothing selected it reads "Select some items to see possible actions here." *(yours)*
- **CM-2 (v4)** You can select cards (vocabulary cards included), single fields, arrows, "follows from nothing" marks and review items. *(clarified: needed by FROZEN 4; v4: arrows)*
  - To select a field, click its lock icon or Alt-click the field.
  - To select an arrow, click it; the clickable area is wider than the line.
  - Ctrl adds to the selection, and a selection may mix kinds.
  - On the canvas, a selection rectangle selects the cards and arrows inside it.
  - **Select incoming arrows**, on a card, selects every arrow into it.
  - Esc first closes whatever is open, then clears the selection.
- **CM-3 (v4)** An action that fits only some of the selected items is shown disabled, with the reason on hover. *(new)*
  - Formalize for dependencies, Transform cards…, Accept and Decline… are labelled buttons.
  - The other actions are icons with labels on hover.
  - On a narrow window, extra actions overflow into a "…" menu.
- **CM-4 (v4)** The actions: *(new; v4: arrows replace the tray's premises ⊢ target)*

  | Action | Applies to |
  |---|---|
  | Freeze / Unfreeze; Freeze all other cards / Unfreeze all other cards | cards, fields, arrows, marks |
  | Formalize for dependencies, with a ▾ for **Open the whole model** and **Claude may add cards** | arrows into propositions, "follows from nothing" marks (ES-2, RV-9) |
  | Transform cards… | cards; starts a session if none is active (ES-3), otherwise queued (RV-9) |
  | Follows from nothing / Remove "follows from nothing" | a proposition with no incoming arrows; an axiom (AR-6) |
  | Select incoming arrows | cards |
  | Draw arrows from the selection | cards (on the target, from the right-click menu) |
  | Delete (arrows) | arrows; outside a session |
  | Move to axioms | propositions (AR-7) |
  | Accept / Decline… | review items |
  | Copy reference | cards, fields |
  | Show on board / Open in editor | cards |

  Today's tray controls go:
  - ⊢ to mark targets: targets are now the arrows' targets;
  - "Self-evident?": now "follows from nothing";
  - "Add to its premises ▶" and the warning about dropped premises: nothing is replaced any more.
- **CM-5 (v4)** The tray at the bottom goes. Its selection summary moves into the Context Menu section, as "N arrows into M propositions". *(new)*
- **CM-6** The session's controls sit in the **session bar** above the board (today's proposal banner): **Submit review**, **Exit session**, **Cancel step** / **Resume**, **Raw Lean diff…**, and the **Current | Proposed** switch. *(new)*
- **CM-7 (v4) The right-click menu.** A right click without movement opens, at the cursor, the Context Menu's actions for what is under it. *(yours: T21 ¶8; clarified: which menu)*
  - "Without movement" means less than 4 px between press and release.
  - The thing under the cursor can be a card, an arrow, a field, a mark or the empty canvas. It is selected first, unless it is already part of the selection.
  - On empty canvas, the menu offers **New proposition here**, **Fit all** and **Tidy layout**.
  - A right-drag only pans: it never selects anything or opens the menu.
  - The toolbar's Context Menu section stays.

## 7. EDIT SESSIONS

- **ES-1** At most one edit session is active per model folder, on one subject. While it is active, the board has two views: **Current** (your files) and **Proposed** (the session's working copy). Freezes you make meanwhile on cards of other subjects are standing. *(new)*
- **ES-2 (v4) Starting with Formalize for dependencies** (no session active). *(yours: INITIATING 1, EDIT SESSIONS 2; T21 ¶3; decided: ★D3; T21 answer to ★D3)*
  - **The question.** Select one or more arrows (or "follows from nothing" marks) into propositions, then choose **Formalize for dependencies**.
    - Each proposition at the head of a selected arrow is a **target**.
    - Its **question** is the set of its selected arrows: "does it follow from these?"
    - Unselected arrows into it are not part of the question.
  - **Order.** Claude proves the targets one after another, sources first, one step each.
    - A target may use another target of the same run only through a selected arrow.
    - That other target must be proved earlier in this run, or must already have a proof or a pending claim. For a source with neither, telelean asks first (AR-8).
  - **Preset** (★D3, adopted). In each inference's step, everything that exists when the step starts is frozen for that step, at its value then: every field, binding, declaration and arrow, including content whose item is still in review. There are three exceptions:
    - the empty Lean statement of each card at either end of a selected arrow is fuzzy;
    - each target's Proof is open, even when empty. Claude may fill it, prove a pending one, or replace an existing proof (shown as "replaces your proof"). In a step that does not end in a proof, it stays exactly as it was;
    - each target's Dependencies is open for additions: Claude may propose new arrows into it (RV-1). It may not remove any arrow.

    A standing freeze always wins over fuzzy and open.

    The cards at the selected arrows are protected too: your sentences and existing Lean statements, the targets' included, stay frozen. That is what stops a target being weakened to `… ∨ True` (S1).
  - **Open the whole model** (a switch on the action). *(yours: T21 answer to ★D3)*
    - With it on, the preset freezes nothing, apart from three things that still hold:
      - your standing freezes;
      - the selected arrows (they are your question);
      - the data telelean keeps (CF-3).
    - Claude may then change any other card, arrow, definition or vocabulary item, for example to add a notion of time throughout the model.
    - Every change comes back as an item, each belief or proof-changing item with its own Accept (★D2; S21).
    - The switch remembers your last choice per subject. The banner says which mode is on (FZ-11).
  - **Claude may add cards** (a switch, off by default). With it on, Claude may add proposition cards for intermediate steps, with their own arrows and Results. With it off, intermediate steps stay as lemmas in Lean (Vocabulary column). Either way, Claude may propose missing premises (RV-1).
  - For the inference that starts a session, these freezes are also the session's starting freezes (FZ-7). For a mid-stage inference (RV-9), they are limits on its step only: they add no FZ-7 reason, and they end with the step.
- **ES-3 Starting with Transform cards…** (one or more cards selected, no session active). *(yours: INITIATING 2, EDIT SESSIONS 1; changed: one action instead of two names; a provisional session; Cancel needs no confirmation unless you changed freezes)*
  - Opening the window starts a **provisional** session, in which every non-selected card is session-frozen.
  - **Submit transform** then does one of three things:
    - **unchanged**: the session continues with an empty first stage and no Claude step, from which you can run Formalize for dependencies. This is your "initiate edit session";
    - **needs Claude** (TR-15): the first Claude step starts;
    - **changed, but needs no Claude**: the provisional session is dropped, its freezes are undone, and your edits are applied directly as one Undo step (★D1).
  - **Cancel** drops the provisional session, with nothing to apply. A confirmation comes first only if you changed any freezes while the window was open.
- **ES-4 A Claude step.** *(yours: EDIT SESSIONS 2–3; clarified: failures)*
  - Claude works on the session's private copy. Within a step, statements are fixed before proving, as today (FZ-12). Every check of Appendix B runs, with today's loop of up to 3 attempts.
  - After a failed attempt, the step rolls back to the newest passing state that is no older than your latest decision. A rollback never undoes your decisions.
  - If there is no such state, the stage is headed "Claude's step did not pass: …". It then allows Decline, Unfreeze, Formalize for dependencies and Exit, but no Accept, until a later step passes.
  - **Cancel step**, a turn or time cap, or an environment failure returns you to the previous stage, marked "step cancelled" or "step failed", with **Retry step**. For the session's first step, you get an empty stage with the same mark, **Retry step** and **Exit session**.
  - A step never ends the session.
  - Claude may ask you questions and make unfreeze requests; both pause the step.
- **ES-5 (v4)** A session changes your files only when it ends successfully (EN-3). *(new; v4: arrows)*
  - Your own arrows are already in your files before the session.
  - Arrows you accept from Claude are written at Apply, like everything else.
- **ES-6** A session survives a window reload. A running step is interrupted and can be resumed. Stages, transform drafts and an open confirmation come back as they were. *(new)*
- **ES-7 (v4) Your own edits during a session** are hand edits in VS Code. The board's edits are blocked for the session's subject (ES-9). *(new; v4: narrowed by ★D1)*
  - Hand edits are copied into the session's base and working copy as they happen; while a step runs, at its next check.
  - They never become items, and Apply lists them separately.
  - If they touch frozen or held content, the frozen value becomes your version. Every accepted item whose content or dependencies they touch returns to "in review".
  - If they conflict with an accepted item, you are told when you make the edit.
- **ES-8** **Exit session**, at any time, discards the session's work after the confirmation of EN-2. *(yours: REVIEW 6)*
- **ES-9 (v4) No direct edits during a session.** *(yours: INITIATING 3; decided: ★D1 (c), with the A|P box kept)*
  - While a session is active, the session subject's Current view is read-only. That means no field edits, no arrows, no kind changes, no adding (the A|P box) and no deleting, and no file Undo or History revert for that subject.
  - Moving cards still works, because it is layout only. Undo then covers only freeze changes.
  - Changes you want during a session go through Transform cards…, queued until Submit review (RV-9).
  - Outside a session, the board stays directly editable, as today, with the arrow actions added. Today's "card only" Delete is the one exception (S9).
  - Other subjects stay editable.

## 8. TRANSFORM

- **TR-1** The transform window shows draft cards, which start as exact copies of the selected cards. Submitting it unchanged changes nothing. *(yours: TRANSFORM 1; your "ok" is Submit transform)*
- **TR-2 (v4)** You can create new cards of any kind, vocabulary included. You choose a new card's Kind (Axiom or Proposition; for vocabulary, its Lean name) when you create it, as in the A|P box, and telelean gives it an id. *(yours: TRANSFORM 2; changed: Kind and name are never fuzzy)*
- **TR-3 (v4)** You can drag a card to the **trash**. It stays visible there and can be dragged back; everything in the trash is deleted when the result is applied. There is no separate "delete permanently". *(yours: TRANSFORM 3; decided: ★D4 (a))*
- **TR-4 (v4) Field states.** Each field is either frozen or not. *(yours: TRANSFORM 4–5; changed: starting states)*
  - A field that is not frozen and is empty is **fuzzy**. It shows "Claude fills this" with its own icon, and never uses italics, dashing or translucency, which already mean Claude's wording, declared and suggested.
  - A field that is not frozen and is filled is **open**: Claude may change it if the transform needs it.
  - Starting states:
    - a new card's fields start fuzzy, except its Kind and Lean name, which you chose (TR-2), and its Proof, which starts empty and "keep empty";
    - a copied card's Sentence, Why, Stance and Source start open;
    - its Lean statement, Dependencies and Proof start frozen;
    - its empty fields start "keep empty" (one click makes them fuzzy), so Claude formalises a card with no Lean only if you ask.
  - A fuzzy Dependencies field asks Claude to propose what the card follows from.
  - A Proof field is never fuzzy, because proofs come from Formalize for dependencies (TR-14). In a transform you can keep a proof or clear it. Clearing deletes the proof and leaves the card unproved, never pending.
- **TR-5** Typing in a field freezes it (a session freeze). Clearing a field makes it fuzzy. *(yours: TRANSFORM 5)*
- **TR-6** Only the fields of CF-2 can be edited. *(yours: TRANSFORM 10)*
- **TR-7 (v4)** A checkbox, **Claude may add cards**, says whether Claude may add new axiom or proposition cards to fill gaps, or must stick to the cards in the window. Default: off. *(yours: TRANSFORM 6; changed: vocabulary)*
  - New plain vocabulary is always allowed, because formalising needs it.
  - Splitting a Shaky card is always allowed.
  - Both are reviewed like everything else.
- **TR-8** An **Instructions** box takes prose for Claude, with `#` references. *(yours: TRANSFORM 7)*
- **TR-9** **Submit transform** finishes. **Cancel** closes without changes: a decline-Transform returns its item to "in review". *(yours: TRANSFORM 8)*
- **TR-10** Any card can be transformed, including vocabulary cards and proposed cards (what used to be "Claude suggests"). Vocabulary from other subjects can be frozen and referenced, but not transformed. *(yours: TRANSFORM 9; changed: other subjects' vocabulary is excluded)*
- **TR-11 (v4)** A kind change you make follows the board's rules: a proposition becomes an axiom by losing its Dependencies (AR-7); an axiom becomes a proposition by getting at least one dependency or the "follows from nothing" mark (AR-6). telelean, not Claude, carries it out, by D-11, with its impact shown. *(new; keeps D-11)*
- **TR-12** When you submit, telelean checks the Lean you typed: *(new; safety issue S10)*
  - it must pass today's single-term rule (statements and proofs), or the vocabulary shape rule (vocabulary declarations);
  - it must elaborate in a scratch Lean file against the current vocabulary;
  - names that don't exist yet are allowed, and listed as "Claude must define: …".
- **TR-13 (v4)** Before you submit, the window warns you when you: *(new)*
  - delete or change a card that other cards rely on, through arrows, proofs or references. It lists them, says which are frozen, and offers to rewrite them (D-11), to delete them too, or to leave the unfrozen ones to Claude. Inside a session nothing is ever left broken. Today's "Delete anyway", which marks dependents broken, remains only for transforms applied directly outside a session (TR-15);
  - change a sentence whose Lean stays frozen, since the two may then disagree.
- **TR-14 (v4)** A transform step writes no proofs. *(changed: TRANSFORM 4, for the Proof field; safety issue S8)*
  - A proof that stops building because of the transform becomes a **Proof broken ‹card›** item, which takes the card's proof slot (RV-1).
  - You can re-prove the card with Formalize for dependencies, or make it pending. Pending replaces its proof with `axiom ….holds`, a belief item that needs its own Accept.
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
  - telelean's own follow-on edits (removing a deleted card's arrows, D-11 rewrites, pins, ids) may touch frozen cards; they count as your change, and TR-13 lists them.

## 9. REVIEW STAGE

- **RV-1 (v4) Items.** A card has at most two items: one for its fields (Add, Change, Formalize or Delete) and one for its proof (Result, or Proof broken). Arrows have their own items. Each item keeps the same id from stage to stage. A newer proposal updates its item in place: back to "in review", marked "updated", with the previous proposal viewable. *(yours: REVIEW 1–2; changed: items per card, Result items, the vocabulary item; v4: arrow items, T21 ¶6)*
  - **Add ‹card›**: a new card.
  - **Add premise ‹card› for ‹target›** (v4): a missing premise Claude proposes, together with its arrow into the target, as one item.
    - It stays outside the working copy until you accept it, as today. telelean checks in a scratch file that the target's question plus it prove the target ("closes the gap (checked)"), flags "may simply restate the goal", and re-checks whenever something it relies on changes.
    - It is part of the target's result, so it appears only when that Result is revealed (RV-6).
    - Accepting it asks how you hold it:
      - **as an axiom**: you hold it;
      - **as a proposition, pending proof**: assumed until proved, and never green (BD-6).

      Either way it is a belief item.
    - telelean then writes the card (in Claude's wording) and the arrow, with no extra Claude step.
      - telelean re-checks the premise where it was written: its fully explicit form must equal the one you accepted. Otherwise the item returns to "in review", marked "meaning differs in place".
      - telelean then completes the target's proof from the checked proof, and checks that state as a step would: build, footprint, statements fixed, and Lean's comparator. Until that passes, the Result reads "completion not checked".
      - The target's Result then returns to "in review", marked "updated".
      - If you accept a second proposed premise for the same target, the first completion stands, and the second premise is listed as unused.
  - **Add arrow X → Y** / **Remove arrow X → Y** (v4): an arrow Claude adds or removes. An added arrow into a target is part of that target's result (RV-6). Removing a card's arrows as part of deleting the card is part of its Delete item, not separate items.
  - **Change ‹card›**: shown field by field, before → after. It lists every card whose statement or proof mentions what it changes.
  - **Formalize ‹card›**: fills an empty Lean statement, and changes nothing else.
  - **Delete ‹card›**: deletes the card, its Lean and its arrows. A `.holds` is never left behind as a hidden assumption.
  - **Vocabulary (N)**: the new plain vocabulary (types, predicates, functions, constants) as one item. It expands into sub-items, each with its own status ("k of N accepted"). A change to existing vocabulary, and every definition or presupposition, gets its own item. A presupposition's helper instance belongs to that presupposition's item; any other new instance gets its own item.
  - **Result ‹target›**: one per inference, always present, whether or not a proof was found. *(new: one item carries both the outcome and the proof, so its presence reveals nothing)*
    - Once revealed (RV-6), it shows:
      - the verdict;
      - the proof, marked "replaces your proof" when it does;
      - the band: which arrows the proof uses;
      - what it rests on.
    - The verdicts are:
      - **established**;
      - **proved, resting on pending ‹card›**;
      - **proved from nothing** (S18);
      - **not proved**.
    - Selected arrows the proof did not need are listed as "not needed"; they stay dotted.
    - If the session changed the target's statement, the Result also says "proves a statement changed in this session" (S21).
  - **Proof broken ‹card›**: TR-14.
  - A **statement item** is an Add, Formalize or Change item that adds or changes a Lean statement.
  - Items are computed between the session's base (your files at its start, plus your own changes, ES-7) and the working copy.
- **RV-2 (v4) The review list is the status table.** *(yours: REVIEW 2; changed: list and table merged)*
  - Items are grouped by card. Arrow items are grouped under their target.
  - Each item shows its label, its status and badges (**belief**, **changes what is proved**, **depends on N**). Counts are at the top ("3 in review · 5 accepted · 1 declined"), with a filter for "in review".
  - You cycle through items with Back/Next or ↑/↓. A accepts, D declines, and **Accept & next** combines the two.
  - The detail shows your sentence above its Lean, the **Fully explicit** toggle (the Lean printed without notation, every argument written out), and what the Lean uses. An arrow item's detail shows both cards' sentences. On a narrow panel, the detail replaces the list.
- **RV-3 Statuses.** *(yours: REVIEW 3; changed: a fourth status, set by telelean)*
  - Every item starts **in review**, then becomes **accepted** or **declined** (with a decline option, §10). You can change any item's status at any time during the session; declines take effect as §10 says.
  - telelean sets **to be redone** on an item when something it depends on is declined. That status does not block Submit review, and the next step proposes the item again.
  - Markers: "updated", "no alternative found".
- **RV-4 (v4) What Accept freezes** (a session freeze, until the item's status changes): *(clarified: REVIEW 3's "its definition is FROZEN")*
  - Add or Add premise: every field of the new card, and its arrow.
  - Add arrow: the arrow.
  - Change or Formalize: the card's sentence and Lean statement together, plus any other field that changed.
  - Result: the proof.
  - Delete or Remove arrow: nothing, but Claude may not re-add the card or arrow.
  - Vocabulary: each term.
- **RV-5 (v4) Dependencies.** *(new; safety issue S4)*
  - Item I depends on item J when:
    - I's Lean, as Lean sees it after elaboration, mentions something J adds or changes;
    - I is a Result whose inference uses J, including a Result whose proof uses an arrow that J adds;
    - I is an arrow item and J adds a card at one of its ends;
    - I adds an arrow that would close a cycle unless J removes another one;
    - I deletes or changes something that another card's version before J mentions. So a Delete depends on the items that remove the other mentions of the deleted card.
  - **Accept** is enabled only once everything the item depends on is accepted. Until then it lists what is missing, with **Select them**. Nothing is ever accepted as a side effect.
  - An item can leave "accepted" by being declined, by a status change, because its content was unfrozen, or because you changed its content or something it depends on (in a transform, by a D-11 follow-on edit, or by a hand edit, ES-7). Before it does, telelean lists every accepted item that depends on it, and returns them to "in review" with it. Cancelling the list cancels the change.
  - So the accepted items always form a self-contained whole.
- **RV-6 (v4) Meaning before proof.** *(new; keeps D-19; safety issue S7)*
  - Each **Result ‹target›** item stays neutral until every statement and belief item it depends on has been decided (accepted or declined), or until you press **Show result**, which notes that you saw the result early.
  - Hidden until then:
    - the verdict, the proof, the band and what it rests on;
    - the premises and arrows Claude proposes into that target (RV-1);
    - the stage report's verdicts and Claude's summary;
    - the proof chips, footprints, bands, glows and solid arrows into that target in the Proposed view;
    - whether a proof exists at all: the target's Proof field and proof status, in the Proposed view and in every item's detail.
  - The result is hidden again if any of those items returns to "in review".
- **RV-7 (v4) Items that need their own Accept** (★D2, decided: yes). Group Accept skips these and says so. *(new; safety issues S5, S6, S11, S15)*
  - **belief**: changes what the model assumes. It:
    - adds an axiom card, or a premise accepted as a pending proposition;
    - formalises an axiom, or changes an axiom's sentence or Lean;
    - adds or changes any Lean axiom (a presupposition, an unmarked axiom, a pending claim);
    - adds a definition, instance or coercion, or changes any existing vocabulary item, that lies in the elaborated closure of a card's Lean statement. New plain vocabulary (a sort, predicate, constant or function that passes the shape rule) is not a belief;
    - is a "meaning changed" item of an axiom (FZ-5).

    telelean classifies items by their effect in Lean, never by column.
  - **changes what is proved**:
    - changes a Lean statement or proof that existed when the session started, or the statement that a Result proves;
    - changes the sentence of any card that has a Lean statement. A changed sentence is shown above the unchanged Lean, marked "sentence and Lean may disagree";
    - adds an arrow into a target that its Result's proof uses. Such an item is marked "adds no new basis" when the added card rests only on what the question already covers.
  - Removing an arrow, and adding an arrow that no proof uses, are not RV-7 items: neither lets anything into what is proved.
  - Content you typed yourself counts as accepted by you.
- **RV-8 (v4) Groups.** You can select several items, then Accept or Decline them together. *(yours: REVIEW 4; changed: limited by RV-5 and RV-7)*
  - Accept takes every selected item that is not an RV-7 item and all of whose dependencies are either already accepted or taken by this same Accept (which never takes RV-7 items). It lists the items it left, and why.
  - Decline applies one option to all of them, and plain Decline to arrow items (DO-0). Decline → Transform opens one window for all of them: this is how you make a multi-card transform.
- **RV-9 (v4) During a stage.** *(yours: REVIEW 5; changed: ES-2's step limits apply; transforms wait for Submit; disabled while a step runs)*
  - At any point you can select arrows and run **Formalize for dependencies**. It runs a Claude step at once, with ES-2's preset (or the whole model open, if that switch is on), and its items join the current stage. Cards you declined with Transform or Shaky count as frozen for it. It is disabled while a step runs.
  - Transforms you start during a stage, from Decline or from the Context Menu, wait until **Submit review**.
- **RV-10 (v4) The stage report** sits above the list. *(new)*
  - It contains:
    - Claude's summary;
    - for each target, once revealed: the verdict, the band, and what it rests on;
    - selected arrows that were not needed;
    - what is missing;
    - "consistency unchecked";
    - open unfreeze requests.
  - It also lists **Assumed without asking**: interpretive choices Claude made without asking you. Each has **Ask me instead**, which declines the items that rely on that choice, with Transform and "Ask me about: …" prefilled.
- **RV-11** Every step re-checks every inference of the session. A Result whose verdict or dependencies changed returns to "in review", marked "updated", with its result hidden again. A proof you accepted earlier in the session counts like one of your own for later inferences, whose reports show what they rest on through it. *(new)*
- **RV-12** **Submit review** is enabled once nothing is "in review". *(yours: REVIEW 6; changed: rejects no longer need a Claude step)*
  - Queued transforms that need no Claude are carried out first, as accepted items (TR-15).
  - If every item is then accepted or rejected, nothing is waiting to be redone, and no queued transform needs Claude, the session goes to the end confirmation (§11) with no Claude step. telelean carries out the rejects.
  - Otherwise one Claude step handles the queued transforms, the Shaky items and the items to be redone, and the next stage begins. Accepted items carry over.
- **RV-13** A step that proposes nothing says so, with Claude's reason. *(new)*

## 10. DECLINE OPTIONS *(yours: one must be picked; a group decline applies it to every item)*

On a Result item, Decline offers two options. Reject keeps the previous proof, and Claude may not offer this exact proof again. Shaky makes Claude try again at Submit review. Transform is not offered. *(new)*

- **DO-0 (v4) Arrow items have no options.** *(yours: T21 ¶6; clarified: what "the relevant cards" are)*
  - Decline works like Reject (DO-1): the arrow is put back or taken away at once, and Claude may not propose that exact arrow again in this session.
  - It also declines what rests on the arrow:
    - every Result whose proof uses it becomes "to be redone";
    - any card Claude added at either end of it is declined, with that card's items.

    Your own cards are never declined by it.
  - An Add premise item (RV-1) carries its arrow, so declining it declines both.
- **DO-1 Reject.** *(yours: option 1; changed: applies to every item kind)*
  - telelean restores the previous version in the working copy at once.
  - Claude may not propose that exact thing again in this session. Exact repeats are checked. A reworded repeat comes back as the same item, in review and marked "updated"; the rejected version stays under "Rejected in this session".
  - The card is **not** frozen, so Claude may still propose something different. To stop all changes to it, also Freeze it.
  - Rejected items are listed under **Rejected in this session**, where you can un-reject them.
- **DO-2 Transform.** It opens the transform window on the proposed version, with the previous version alongside, and waits until Submit review. Fields copied from Claude's proposal are marked "Claude's proposal", and submitting the window does not accept them (TR-15). *(yours: option 2, "Adjust this card", renamed to match REVIEW 4)*
- **DO-3 (v4) Shaky.** *(yours: option 3; clarified)*
  - All items marked Shaky in a stage are taken together. Claude may keep, change, remove, split or merge those cards, within the frozen rules.
  - The set it proposes in their place must not be identical to the declined set, though any single card may come back unchanged. "Identical" means the same kinds, sentences, Lean statements and arrows, with whitespace collapsed. telelean checks this.
  - If Claude finds no different arrangement, it says so, and the items come back marked "no alternative found".

## 11. Ending a session

- **EN-1** A session ends successfully when you submit a stage in which every item is accepted or rejected, and no transform needing Claude is queued. Otherwise it ends by **Exit session**. *(yours: REVIEW 6; changed: rejected items no longer block the end)*
- **EN-2** A confirmation always comes first. The one exception is Cancel in the window that started a session, when you changed no freezes (ES-3). *(yours: REVIEW 8, extended)*
  - **Apply** shows:
    - the changes, each as a link;
    - your own edits during the session, separately;
    - the final check: every check run on exactly the final state. The file checks may reuse the last result if the final state is identical to the last state judged; the backstop of §13.5 always runs;
    - the freeze changes caused by your decisions (accepted items, your own Freezes and Unfreezes, filled fields, new cards), each with a **keep** tick;
    - the session's starting freezes, summarised in one line ("the other N cards return to how they were").
  - **Exit** shows "discards N accepted and M pending items; your files are not changed", followed by the same freeze list. Here keep ticks are offered only for content that is in your files.
  - Every confirmation has **Back to review**, which returns you to the submitted stage, unsubmitted, with nothing changed.
  - If the final check fails, Apply is disabled and the failures are listed. Nothing is applied.
- **EN-3** **Apply** writes the changes as one history entry and one Undo step, as Accept does today, then restores the freezes, apart from those you ticked keep. It also records each definition and presupposition you accepted as endorsed, so the board stops saying it "needs your endorsement". *(new)*
- **EN-4** Exit discards the session's working copy. Your answers to Claude's questions stay recorded. *(clarified)*

## 12. REFERENCE SYSTEM

- **RF-1** Typing `#` in any prose field (sentences, Why, transform instructions, answers to Claude) opens a dropdown of cards and fields, filtered as you type. Picking one inserts a reference, shown as a chip such as "Cynder has a dark past › Lean statement"; clicking it reveals the target. *(yours)*
- **RF-2** A reference is stored by stable id: the card's id, or the Lean name for a vocabulary card, plus an optional field. *(new)*
  - telelean never reuses a card id within a subject.
  - A reference always shows its target's current name, and a deleted target shows "deleted card".
  - In Lean docstrings and in everything Claude reads, references appear as the target's sentence.
- **RF-3** `#` does not open the dropdown in Lean fields, where it starts commands such as `#check`. Esc leaves a plain `#`. *(new)*
- **RF-4 (v4)** Cards get no short numbers: you find them by searching their sentences. *(decided: ★D6 (a))*
- **RF-5** References count as reliance: a frozen card's references hold their targets (FZ-4), and TR-13 warns about them. *(new; safety issue S12)*

## 13. What telelean guarantees mechanically *(new; v4: items 2, 7–10)*

1. A session's changes reach your files only when it ends successfully, and only as a state that passed every check.
2. "Proved" means Lean checked the proof, with no `sorry`, resting on exactly what it lists. For Formalize for dependencies, that list can contain only:
   - the sources of the target's arrows in the final state: the selected ones, plus those you accepted from Claude (named as such);
   - what those sources rest on: a proved source contributes its own basis; an axiom or a pending source contributes its claim, marked "pending" for the latter;
   - Lean's standard axioms (propext, Classical.choice, Quot.sound);
   - the signature: every non-Prop axiom that no card owns, including any of yours that break the vocabulary shape rule or sit in the library root. Each one that is not a plain sort, predicate, function or constant is named in the report;
   - the existence presuppositions of the statements involved.
3. Claude never changes frozen or held content, or data telelean keeps. telelean checks this itself. The one exception is a change you allow under FZ-5, which needs your Accept.
4. The accepted items always form a self-contained whole.
5. Nothing becomes something the model assumes without your individual Accept. Apply checks this again, never reusing an earlier result (Appendix B, Backstop).
6. You judge what the statements mean before you see whether they were proved, unless you press Show result.
7. Every card a proof uses directly has an arrow into the proved card, and the band shows exactly those arrows. Both come from Lean, never from Claude's account.
8. The green glow appears only on established cards (BD-6).
9. The arrows never form a cycle.
10. Only you change a card's kind, whether by dragging, by drawing an arrow into an axiom, or in a transform.

---
# Part 2: Decisions

## Your answers to ★D1–★D6 (built into v4)

| # | Your answer | Where it is in v4 |
|---|---|---|
| ★D1 | Direct field edits are fine, but not while an edit session is going on. The A\|D\|G box becomes an A\|P box and stays. | Option (c): ES-9, BD-8. ES-7 now covers only hand edits in VS Code. |
| ★D2 | Own Accept. | RV-7, RV-8. |
| ★D3 | Adopt it, plus an easy way to open the whole model, for subsystems such as time or good/bad. | ES-2's preset and its **Open the whole model** switch; FZ-11's banners; S21. |
| ★D4 | (a) | TR-3. |
| ★D5 | Slices, unless you say to continue on autopilot. | ★D8 below gives the slice order with the new board. Autopilot: when you say so, I go on to the next slice without stopping; the safety rules still hold. |
| ★D6 | Search by sentence. | RF-4. |

**One clarification on ★D3.** You described the preset as "everything outside the cards touched by the selected dotted arrows is frozen". v4 also keeps part of those cards frozen:
- inside them, your sentences and existing Lean statements stay frozen;
- only their empty Lean statements, the targets' proofs and new arrows into the targets may change.

Without this, Claude could weaken a target's statement to `… ∨ True` and prove it (S1). The whole-model switch lifts it when you want.

## Decided for you on autopilot (turn 21)

You asked me to take any remaining decisions myself, choosing what I recommend, and to log them so you can reverse them later. Each choice, and how to reverse it, is in `bundle_21/user_requested_documents/02_autopilot_decisions.md`.

| # | Question | Options | Chosen |
|---|---|---|---|
| **★D7** | What does formalizing an arrow L → A mean when L has neither a proof nor a pending claim (AR-8, S17)? Lean would need `L.holds`, which does not exist. | **(a) Given.** The proof takes L's statement as a hypothesis (today's conditional proofs). The band is drawn and A shows "given: L". When L is proved later, telelean discharges the hypothesis itself, with no Claude. **(b) Ask.** telelean asks: "L is not proved. Mark it pending (assumed until proved), also formalize the arrows into L, or cancel?" **(c) Refuse.** Only arrows whose sources are proved, pending, or proved earlier in the same run can be formalized. | **(b)**. It reuses your "pending proof", adds no new kind of proof, and never assumes anything without asking. (a) is the most expressive and could come later. |
| **★D8** | The slice order, now that the board changes too (★D5). | **(a) Board first:** <br>1. The new board: AXIOMS column, canvas, the two columns above, arrows, kinds by position, pending, follows from nothing, glows and bands. Formalize for dependencies runs on today's review: all-or-nothing Accept, today's checks plus the new arrow checks. In this slice Claude adds no arrows of its own; it proposes missing premises as today's "Claude suggests" cards, and "I hold this" adds the card and its arrow. The whole-model switch waits for slices 2–3. <br>2. The review list (v3.1's slice 1), now with arrow items. <br>3. FROZEN, including arrows. <br>4. The transform window. <br>5. References. <br>**(b)** v3.1's order, with the board last. | **(a)**. Formalize replaces These suffice, every later slice builds on the arrows, and the board is what you use daily. |

**Cost of ★D8 (a).** M2 took about 12.6 M subagent tokens and about 16 h of workflow time. v4 is roughly 2.5–3.5× that: about 30–45 M tokens over 3–5 days. A few real-Claude runs come on top, each announced with its quota before it runs.

---

# Part 3: Safety issues in your text and answers

S1–S13 are the turn-20 issues, kept as written then (in v3.1's terms: "These suffice", ASSUMPTION, GOAL). S14–S21 are new in v4.

The Lean examples were checked on Lean 4.35 in turn 20 (`bundle_20/evidence/lean_checks/`). The claims about today's code cite the files they come from.

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
  - Apply's backstop checks that every new or changed axiom, definition and instance was individually accepted (§13.5).

**S7. A list lets you see the result before judging the meaning.**
- D-19 hides the proof result until you have seen the statements, to counter automation bias: a "proved" badge makes a wrong formalisation look right.
- In a list, the mere presence of a proof item, or of a premise Claude proposes, would reveal whether the proof succeeded.
- **Fix:** one Result item per inference, always present and kept neutral, which also carries the proof; proposed premises appear only when it is revealed (RV-1, RV-6).

**S8. A proof made in a transform would have no premise set.** "Proved" would then mean nothing definite. **Fix:** transform steps write no proofs (TR-14); proofs come only from Formalize for dependencies, each with its own question, statements fixed and comparator check.

**S9. Deleting a card can leave a hidden belief.** Today's "card only" delete leaves `axiom ….holds` behind as an unmarked axiom. **Fix:** a Delete removes the card and its Lean (RV-1), and dependents are handled (TR-13).

**S10. Lean you type can do more than you see.** A Lean field holding `True`, a newline, then `axiom evil : False` adds an axiom that proves anything. **Fix:** TR-12 checks typed Lean.

**S11. Copied Lean, if open, could be weakened.**
- If you transform your goal, its Lean statement could be rewritten to something weaker, then proved in a mid-stage run.
- **Fix:**
  - copied Lean starts frozen (TR-4);
  - every inference uses ES-2's preset (RV-9);
  - a change to existing Lean is a "changes what is proved" item that needs its own Accept (RV-7).

**S12. References create meaning dependencies.** A frozen card that says "‹Spyro is PG› is too strong" changes meaning if Claude rewords the referenced card. **Fix:** a frozen card's references hold their targets (RF-5).

**S13. "Don't propose it again" and "not identical" can only be checked for exact repeats.** A reworded repeat passes both checks. That is not a safety issue, because nothing enters without your Accept. DO-1 and DO-3 say so.

## New in v4

**S14. The arrows must show the proof's real structure, and Lean must decide them.**
- Your text binds "jointly sufficient" arrows with a green band. If the band followed Claude's account of its proof, or the arrows Claude drew, it could certify a structure the proof does not have.
- Today's gate even lets a proof use a proved card that was not selected, as long as what that card rests on is covered by the selection (`core/src/gate/permitted.ts`). The board then draws a solid arrow that nobody declared, and flags nothing, because the basis is covered (`core/src/project/edges.ts`, TL107). On the new board that arrow would sit inside the band.
- **Fix:**
  - telelean computes the band from Lean after every check (BD-7);
  - a new check requires every card a proof uses directly to have an arrow into the target in the final state, so Claude must propose an arrow item for anything extra it uses (Appendix B);
  - the band claims sufficiency, and nothing more (S20).

**S15. Claude's arrow changes change what is proved.**
- Your text lets Formalize for dependencies "add or delete" arrows that are not frozen.
  - An added arrow into a target widens what its proof may rest on.
  - Removing a selected arrow changes the question you asked.
  - Either way, a green band would then certify a claim you did not make.
- **Fix:**
  - the preset keeps every existing arrow, so in a Formalize step Claude can only add arrows into the targets (ES-2). Even with the whole model open, the selected arrows stay;
  - each added arrow that a proof uses is a "changes what is proved" item, with its own Accept (RV-7). It is revealed with the target's Result (RV-6), and the Result can be accepted only after it (RV-5);
  - declining an arrow takes down what rests on it, as your text says (DO-0);
  - Claude's arrows are drawn translucent with a "+" (suggested, D-15) until accepted, never dotted like yours (BD-5).

**S16. Pending claims make "proven" ambiguous.**
- When an axiom moves to the canvas, its `axiom n.holds` stays. Every proof that used it still builds. Under "green = proven", all of them, and everything resting on them, would glow green, while resting on a claim that nobody proved.
- The same happens with a premise you accept as a pending proposition (RV-1), and with an old GOAL asserted as an axiom (today's TL116), which v4 reads as pending.
- **Fix:** two signals with two meanings (BD-6, BD-7).
  - The band certifies the inference: these arrows suffice for this card.
  - The green glow certifies the card: proved all the way down to axioms, with no pending claim anywhere.
  - A card that rests on a pending one says so, and has no green glow.
  - A pending claim is never usable in its own proof (today's circularity rule), and, like any card, only through an arrow (S14).

**S17. Formalizing an arrow out of an unproved proposition.**
- Your text doesn't say what "formalize L → A" means while L has neither a proof nor a pending claim. Lean needs `L.holds`, which does not exist.
- The convenient automatic fix would be to give L a pending `axiom L.holds`. That adds an assumption you never made.
- **Fix:** ★D7. Nothing is assumed without your say.

**S18. "Follows from nothing" is where weak formalizations hide.**
- A proof from nothing succeeds exactly when the Lean statement holds by logic and definitions alone: a target weakened to `… ∨ True` (S1), or a definition that makes it true (S5).
- **Fix:**
  - only you set the mark (AR-5);
  - the preset keeps existing statements frozen (ES-2), and changed statements and definitions are own-Accept items (RV-7);
  - any Result proved without using a single arrow says "proved from nothing: check what the statement says", whether or not you marked it (RV-1).

**S19. A card's place is now its kind, so arrows and drags change what you assume.**
- An arrow into an axiom turns it into a pending proposition.
- A drag into the AXIOMS column turns a proved card into an assumption and drops its proof.
- If Claude could do either, it would change which of your claims are assumptions.
- **Fix:**
  - Claude never adds an arrow into an axiom, never moves cards between the column and the canvas (CF-4), and never changes the "follows from nothing" mark (AR-5). It can ask;
  - your own drags and arrows state their impact before you let go (AR-6, AR-7).

**S20. Inconsistent axioms make every band green.**
- From contradictory axioms, any set of arrows "jointly suffices" for anything, and the band would look like support.
- This is today's "consistency unchecked", unchanged, but a band invites over-reading.
- **Fix for now:**
  - the band's tooltip and the stage report keep saying "consistency unchecked";
  - a consistency check (the model finder of M3) is still future work.

**S21. "Open the whole model" removes the preset's protection.**
- With the whole model open (your ★D3 answer), Claude can weaken a target's statement (S1), or reformalise your axioms.
- What remains is the review:
  - every such change is a belief or "changes what is proved" item, with its own Accept (★D2), shown before → after;
  - the target's Result stays hidden until those items are decided (RV-6), and it says "proves a statement changed in this session" (RV-1);
  - your standing freezes and the selected arrows still hold.
- Expect many items for a model-wide change: that is the price of keeping every belief change visible.

---

# Part 4: Changes

## Your turn-21 text, paragraph by paragraph

The paragraphs of `bundle_21/prompt21.md`, numbered after its first line:

| ¶ | Your text, abridged | Clauses | What changed, and why |
|---|---|---|---|
| ¶1 | Changes to the ASSUMPTION, DERIVATION, GOAL split and the "this suffices" button | §3, §4 | |
| ¶2 | Remove DERIVATION/GOAL; a blue glow for formalization and a green glow for "proven" | Terms, CF-2, BD-6 | Green means established, not merely proved. A proved card that rests on a pending one keeps the blue glow, with a chip (S16). |
| ¶3 | Draw dependency arrows; "formalize for dependencies"; Claude may add or delete arrows that aren't frozen; select dotted arrows and press the button | AR-1–4, ES-2, CM-4 | Unselected arrows into a target are not part of its question. The preset keeps every existing arrow, so in a Formalize step Claude only adds arrows into the targets, unless you unfreeze arrows or open the whole model. Added arrows are items (S15). |
| ¶4 | Jointly sufficient arrows are bound by a green band | BD-7 | Lean decides the band (S14). It says "these suffice together"; it does not say that each one is needed, or that the axioms are consistent (S20). |
| ¶5 | Freeze arrows, and freeze a card's set of dependencies | FZ-13, FZ-1, FZ-11 | Dependencies is a field. Freezing a card freezes its incoming arrows, not its outgoing ones. |
| ¶6 | Claude's arrow changes go through review; declining has no options; declining also declines the relevant cards | RV-1, DO-0, RV-5 | "The relevant cards" are: every Result that uses the arrow (to be redone), and every card Claude added at its ends (declined). Your own cards are never declined. |
| ¶7 | One ASSUMPTIONS column; everything else on a scrollable, zoomable canvas; wheel zoom about the cursor; right-drag pans; Ctrl+wheel (pinch) zooms | BD-1–3 | Added: keyboard control, Fit all, placement of new cards, and a note on trackpads. |
| ¶8 | A right click without movement still opens the menu | CM-7 | "The menu" is read as the Context Menu's actions, shown at the cursor; "without movement" means under 4 px. |
| ¶9 | AXIOMS (formerly ASSUMPTIONS) and PROPOSITIONS (formerly DERIVATIONS and GOALS) | Terms, CF-2 | |
| ¶10 | Vocabulary and definitions get their own scrollable columns, above | BD-1 | Added: a divider and a collapsed one-line summary. Presuppositions stay in the Vocabulary column, but the AXIOMS header counts them. |
| ¶11 | Dragging a proposition into AXIOMS removes its incoming arrows; an axiom moves to the canvas only once it has dependencies from another axiom; its `axiom n.holds` stays, "pending proof"; cycles are refused; a way to mark "follows from nothing" | AR-3, AR-5–7, CF-4 | The arrow's source may be any card, not only an axiom. "Follows from nothing" also moves an axiom to the canvas. The impact is shown first. Claude can do none of these (S19). |
| ¶12 | Arrows from the column into the canvas follow pan and zoom | BD-4 | Added: off-screen ends stop at the edge, with stub badges. |

## v3.1 clauses changed in v4

Every clause marked **(v4)** in Part 1. Besides the renamed terms, the changes are:
- the new sections: §3 The board (BD-1–9) and §4 Arrows and dependencies (AR-1–8), plus FZ-13, CM-7 and DO-0;
- the Terms, CF-2–5 and CF-7;
- FZ-1, FZ-4, FZ-6, FZ-9 and FZ-11 (arrows, Dependencies, banners);
- CM-2–5;
- ES-2 (Formalize for dependencies, the preset, the two switches), ES-5, ES-7 and ES-9 (★D1);
- TR-2–4, TR-7, TR-11, TR-13 and TR-14;
- RV-1, RV-2, RV-4–10 (arrow items, Add premise, Result verdicts);
- DO-3, and RF-4 (★D6);
- §13 items 2 and 7–10.

## Renamed terms

| v3.1 | v4 |
|---|---|
| ASSUMPTION | axiom (card) |
| DERIVATION, GOAL | proposition |
| These suffice | Formalize for dependencies |
| selected premises ⊢ targets | selected arrows into targets: each target's question |
| "claimed" (a Proof state) | pending |
| Self-evident? | follows from nothing |
| A\|D\|G box | A\|P box |
| "make it a Derivation" | gone: the green glow shows it |
| §3 FROZEN … §11 guarantees | §3 The board and §4 Arrows are inserted, so FROZEN is §5 … the guarantees are §13 |

The turn-20 clause-by-clause log is in v3.1's Part 4 (`bundle_20/user_requested_documents/01_edit_sessions_spec_proposal.md`), unchanged.

## What this replaces in today's telelean

| Today | Under v4 |
|---|---|
| Three columns (Assumptions, Derivations, Goals), each scrolling | The AXIOMS column and the PROPOSITIONS canvas, with pan and zoom (BD-2, BD-3) |
| The Vocabulary group, collapsed, at the top of the Assumptions column | The Vocabulary and Definitions columns above the board (BD-1) |
| Kinds A, D, G; a green Derivation stripe | Axiom and Proposition; green means proved (BD-9) |
| GOAL → DERIVATION once proved ("make it a Derivation", TL105) | Gone: the green glow shows it |
| "promotion pending" (A → D) | "pending proof" (AR-6) |
| "rests on a claimed node" | "rests on pending: ‹card›", and no green glow (BD-6) |
| A GOAL asserted as an axiom (TL116) | A pending proposition |
| Declared premises written by These suffice, replacing the old ones | Arrows you draw; Formalize never replaces them (AR-4) |
| The tray: premises ⊢ target, ⊢, Self-evident?, Add to its premises ▶, the dropped-premises warning | Selected arrows, the Context Menu, follows from nothing (CM-4, AR-5) |
| No drawing arrows by dragging (user guide §8) | AR-1 |
| A declared arrow the proof does not use, in the warning colour (TL109) | It stays plain dotted; only "used but not drawn" (TL107) warns (BD-5) |
| "Claude suggests" cards with "I hold this" / "No" | Add premise items, accepted as an axiom or as a pending proposition (RV-1) |
| The A\|D\|G box | The A\|P box (BD-8) |
| One target per run | Several targets, sources first (ES-2) |
| The review stepper (Statement 1…N, New vocabulary, Definitions, Result, Card changes) | The review list plus the stage report (D-19's one-shot review becomes per item, over several stages) |
| "Yes, I endorse it" on definitions | Accept on each definition's own item (D-4 kept) |
| Vocabulary "Revoke…" | Decline on the vocabulary item or sub-item |
| Show result | Kept (RV-6) |
| Accept (all-or-nothing) | Accept per item, then Apply once at the end, as one Undo step (D-21's deferred partial accept, made safe) |
| Feedback… | Decline → Transform with instructions |
| Discard | Exit session |
| "Card only" delete (keeps the Lean) | Gone: a Delete removes the card and its Lean (S9) |
| "Your words untouched" and "existing declarations unchanged" | The preset freezes (ES-2, ES-3), checked by FZ-3 and FZ-4, plus data telelean keeps (CF-3) |
| Direct board edits, drag to change kind | Kept outside sessions, blocked during one (ES-9, ★D1); kind changes follow D-11 |
| "Statements frozen (round N)" | "Statements fixed" (FZ-12) |

---

# Appendix A: Edge cases *(not for approval: consequences of the clauses above)*

- **A1** You reject an item that a pending item depends on: the dependent item becomes "to be redone" (RV-3).
- **A2** Your frozen Lean no longer builds once Claude has filled the rest. Claude cannot fix it, so it makes an unfreeze request instead of retrying forever, and the stage reports it.
- **A3** An instruction can't be followed without changing frozen content: Claude makes an unfreeze request (FZ-5). If you keep the content frozen, the stage reports that the instruction couldn't be followed.
- **A4** Your files change on disk during a session: your edits are copied into the session as they happen (ES-7), and a conflict with an accepted item shows when you make the edit. Apply re-checks everything on the final state.
- **A5** You press "Unfreeze all other cards" by accident: Ctrl+Z restores the freezes and the statuses together (FZ-9).
- **A6** A freeze record whose card no longer exists is listed under "Frozen items not found", never dropped silently. Deleting a card through telelean removes its record.
- **A7 (v4)** You select only some of a target's arrows. Only those form its question; the others stay dotted, whatever the result.
- **A8 (v4)** The proof uses fewer arrows than you selected. The band binds the ones it uses; the others are listed as "not needed" and stay dotted.
- **A9 (v4)** The proof uses none of the selected arrows. The verdict is "proved from nothing", flagged (S18).
- **A10 (v4)** Claude needs a card you drew no arrow from. It proposes an arrow item. If the target's Dependencies are frozen, it makes an unfreeze request instead (FZ-5).
- **A11 (v4)** You select arrows into a proposition that is already proved from other arrows. If the new proof passes, it replaces the old one ("replaces your proof"): the band moves, and the Result lists the cards whose basis changes as a result.
- **A12 (v4)** You select a chain X → L → A. L is proved first, then A, which may use L. If L fails, A's step reports "L was not proved", and ★D7 applies if you retry A alone.
- **A13 (v4)** You drag a pending proposition back into the AXIOMS column. It becomes an axiom again; its `axiom n.holds` stays, and nothing is rewritten.
- **A14 (v4)** You drag a proved proposition that others use into the AXIOMS column. Their proofs still build, now resting on it as an axiom. Established cards stay established.
- **A15 (v4)** You draw an arrow into an axiom that proofs use. It becomes pending, and everything resting on it loses its green glow until it is proved; the gesture states how many cards first.
- **A16 (v4)** You delete an arrow that a proof uses (outside a session). The proof still builds, but it now uses a card you drew no arrow from. The arrow is shown solid in the warning colour (TL107) until you draw it again or the card is re-proved. The delete confirmation says so.
- **A17 (v4)** A proposal removes A → Z and adds Z → A. The addition depends on the removal (RV-5), so declining the removal declines the addition too.
- **A18 (v4)** Arrows between subjects are not allowed, as today (TL121).
- **A19 (v4)** Old files: `type: ASSUMPTION` reads as an axiom; `DERIVATION` and `GOAL` read as propositions. A DERIVATION or GOAL whose `.holds` is an axiom reads as pending. Nothing is rewritten until you change that card's kind.
- **A20 (v4)** A hand-written proof uses a card with no arrow. That arrow shows solid in the warning colour (TL107), and is never inside a band until you draw it.
- **A21 (v4)** A right-drag that ends on a card only pans: no selection change, no menu.
- **A22 (v4)** A card marked "follows from nothing" gets an arrow from you. The mark goes, even if frozen, because freezes bind only Claude (FZ-1); Undo restores it.
- **A23 (v4)** With the whole model open, Claude wants to change something you froze earlier (a standing freeze). It makes an unfreeze request (FZ-5).
- **A24 (v4)** telelean places only cards that have no stored position, and Tidy layout moves only the selected cards, so your own arrangement is never rearranged.
- **A25 (v4)** With "Claude may add cards" on, an intermediate proposition Claude added fails to be proved. Its Result says so, and the target that used it becomes "to be redone" (RV-3).
- **A26 (v4)** You accept a missing premise as a pending proposition. The target is proved but rests on pending, so it has no green glow until you prove the premise (BD-6).

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
  - "data telelean keeps never changes" (CF-3): Claude may not change an existing block's `type:`, and may add a block only for a proposed premise, when "Claude may add cards" is on, for a Shaky split, or as new vocabulary.
- **Generalised:**
  - new-axiom counts an axiom as new unless your files had an axiom of that name **and type** when the session started;
  - each declaration Claude adds is judged against the permitted set of the inference that produced it;
  - accepted content is protected by the frozen check, not by the baseline.
- **New in v4: arrows.**
  - **B.1 Per inference.** The question Q(T) is the set of selected arrows into T. Claude's answer may add arrows E(T), each an item. The permitted set is today's formula (`core/src/gate/permitted.ts`), with "the selected premises" replaced by the sources of Q(T) ∪ E(T):
    - a source's `.holds`, if the source is an axiom or pending;
    - its footprint, if it is proved by your own proof, by a proof accepted earlier in the session, or by an earlier step of this run;
    - nothing, if it has no `.holds` (★D7).

    T's own `.holds` and `sorryAx` are excluded, as today.
  - **B.2 No hidden edges.** direct(T) must be a subset of the sources of Q(T) ∪ E(T). direct(T) is the set of cards whose `.holds` T's proof reaches through declarations that belong to no card (today's `directUses`, `core/src/project/edges.ts`).
  - **B.3 Arrows.**
    - The final arrow graph is acyclic.
    - Claude adds arrows only where Dependencies are open: into the targets under the preset; into any unfrozen Dependencies with the whole model open, or in a transform. It never adds an arrow into an axiom card.
    - Claude removes only unfrozen arrows, never a selected one.
    - Claude never sets or removes "follows from nothing".
  - **B.4 Kinds and pending.**
    - Claude never changes `type:`, as today.
    - Proving a pending target replaces `axiom T.holds` with `theorem T.holds` of the identical type.
    - Any other change of a `.holds` between axiom and theorem is refused.
  - **B.5 Status, on the board** (core's build, beside today's `rests-on-claimed` and `self-evident` flags).
    - established(v) holds when all of these do:
      - v's proof is "proved", with no hypotheses;
      - it uses no `sorry` and no `axiom:` (TL103);
      - every card in its footprint is an axiom card, not a pending proposition.
    - band(v) = the arrows from direct(v).
  - **B.6 Markup.**
    - `type:` accepts AXIOM and PROPOSITION. ASSUMPTION, DERIVATION and GOAL are read as aliases, and never rewritten except by a kind change.
    - "Follows from nothing" is an explicitly empty premises list (`premises: []`). A missing `premises:` means that no dependencies are declared.
    - TL116 and TL105 go; TL106 stays, as "has a proof".
  - **B.7 Layout.** Canvas positions are kept in the subject's layout file; the column order as today.
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
  - (v4) Every arrow of the final state is yours, or was accepted individually, or is an accepted removal. B.2 and B.3 hold.
  - Otherwise Apply is refused, naming the declaration or arrow.
- **Storage:**
  - standing freezes go in a per-subject file under `.telelean/`, keyed by written card id (an id is written first if needed), by vocabulary Lean name, or by arrow (source and target ids);
  - session state (items, statuses, the Rejected list, session freezes, the standing snapshot) lives with the run's state in VS Code's storage;
  - neither is ever in Claude's working copy.
- **Sessions are runs with rounds:**
  - a review stage is a round;
  - Submit review sends structured Feedback, generated from the statuses;
  - Apply is today's all-or-nothing Accept path (rebase, re-check, one history entry) on the fully decided state;
  - transform-started sessions need a run kind without a single target, whose steps finish as "done" or "cannot";
  - (v4) Formalize runs have several targets, proved sources first.
- **The canvas, implementation notes (v4):**
  - The canvas is a transformed layer in a clipped viewport. Zooming about the cursor keeps the point under it fixed: offset′ = cursor − (cursor − offset) · s′/s.
  - The wheel listener must not be passive, so it can stop the page scrolling. A pinch arrives as Ctrl+wheel with small deltas, which are scaled up.
  - Right-drag uses pointer capture.
  - The browser's own `contextmenu` event is suppressed: on Linux and macOS it fires on the press, before any movement. telelean's menu opens on release instead, if the pointer moved less than 4 px. This also keeps VS Code's default webview menu away.
  - The arrow overlay (today's EdgeEngine, built for three scrolling columns) is generalised to one scrolling column plus a transformed canvas:
    - endpoints come from on-screen boxes;
    - there is one overlay in board space, clipped per part;
    - it is recomputed on scroll, pan, zoom and resize, at most once per frame, as today.
  - Each arrow gets a transparent wide stroke as its click area.
  - New theme colours (`telelean.proved`, `telelean.frozen`) need the theme test's whitelist updated. In high contrast, the band is drawn as an outlined bracket with a "✓" label, and glows as outlines.

# Appendix C: Answers to your turn-20 questions

These describe today's telelean, as answered in turn 20. Under v4:
- definitions get their own column (BD-1);
- "Claude suggests" becomes the Add premise item (RV-1);
- "Statement N" steps become Formalize and Change items in the review list.

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
- In short: a statement step checks Claude's *translation* of your cards; a suggestion asks whether you *believe* something new.

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

**Turn 20 (v3.1):**
1. Six read-only agents mapped the current code (review UI, board, run engine, gate and Accept, card model, design rationale): `bundle_20/subagent_reports/understand_workflow/`.
2. A first revision (v2) was written from your text and the maps.
3. Four independent reviewers (fidelity, logic, soundness, implementability) raised 108 findings (4 blockers, 51 major, 47 minor, 6 nits): `bundle_20/subagent_reports/review_workflow/`.
4. Every finding was decided. Most were accepted; where reviewers disagreed, one option was chosen, with reasons: `bundle_20/subagent_reports/review_workflow/DISPOSITIONS.md`.
5. Two final verifiers checked v3: one read it cold for consistency, the other re-attacked its soundness. They raised 26 findings: 1 blocker (Claude's proposal could be accepted through a Decline → Transform that only edited prose), 13 major and 12 minor. All were applied, one partly: `bundle_20/subagent_reports/verification_workflow/DISPOSITIONS.md`. This was v3.1.
6. The Lean examples in Part 3 were checked on Lean 4.35: `bundle_20/evidence/lean_checks/`.

**Turn 21 (v4):**

7. Your board text and your answers were folded into v3.1. The turn-20 maps were re-used, together with targeted reads of today's arrow, kind and status code: `core/src/project/edges.ts` (`directUses`, the mismatch flags), `core/src/project/build.ts` (proof states, `pending-promotion`, `rests-on-claimed`, `self-evident`), and `core/src/gate/permitted.ts` (via the turn-20 gate map).
