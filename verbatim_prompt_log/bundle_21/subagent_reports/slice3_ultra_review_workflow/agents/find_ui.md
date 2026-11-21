# find:ui

Agent `a0a16d1f8ecd3152d` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** Lens: user interface and interaction. Most of the plan's UI follows CM-1–CM-7, FZ-9–FZ-13 and the patterns of slices 1–2:
- the four actions, disabled with a reason on hover;
- lock slots that only select (D3-28);
- a rose `telelean.frozen` that stays clear of the blue and green glows and the git diff halos, is drawn inside the card, and is never the only cue (contrast 6.0:1 dark, 5.8:1 light);
- high-contrast fallbacks;
- request cards beside Claude's questions;
- keep ticks with `keepAll`;
- Undo during a step only for freeze actions.

The earlier rounds' UI fixes F13, F15, F16 and F17 hold on their own. Two of them break when they meet the built webview:
- R2-11's "one `confirmed` confirms every list" collides with the webview's own preview dialog (U3).
- F16's banner mode ignores Submit queues (U10).
- F13's lock slots in the item detail feed a board selection whose routing depends on where the focus is (U2).

I checked the plan against the built webview: `menu.ts`, `contextActions.ts`, `ContextSection.tsx`, `NodeCard.tsx`, `CardDetails.tsx`, `Vocabulary.tsx`, `BoardInput.ts`, `board.css`, `Toasts.tsx`, the harness and the theme test.

**Findings: no blocker, 6 major, 12 minor, 1 nit.**

The majors:
- **U1:** a right-click menu runs the freeze group on the selection, not on the thing under the pointer, wherever CM-7 keeps the selection. A plain Unfreeze can then silently hit the wrong cards.
- **U2:** routing by "Proposed view or focus in the session scope" causes three problems:
  - Freezing review items, request rows and end-confirmation rows is disabled whenever the Current view is on screen.
  - A Current-view selection can be frozen at J.
  - There is nowhere to unfreeze during the session's first queue.
- **U3:** the webview's preview dialog sends `confirmed`, which confirms, unseen, the lists only the host computes: Filling now, and RV-5's cascade.
- **U4:** empty fields have no row, so FZ-2's keep-empty cannot be applied field by field. D3-44 also creates keep-empty freezes that nobody can see or select.
- **U5:** partial freezes (`left`) contradict CM-3 and are never shown.
- **U6:** presupposition chips and vocabulary cards cannot be selected (and vocabulary boxes not by keyboard); wholly frozen vocabulary cards get no aura or badge.
- **findings:**
  - [1]
    - **id:** U1
    - **severity:** major
    - **where:** §4.3 (the freeze group in 'every right-click menu'; `freezeSelection(op)`), §4.2 ('elsewhere as today'), D3-34; built board/menu.ts `menuSelection` (a card right-clicked while other cards are selected keeps the selection) and runAction.ts (card actions act on the clicked card; Formalize and Delete act on the selection); slice 2 §5.10 (a proposed arrow's right click selects nothing)
    - **problem:** CM-7 says the menu offers 'the Context Menu's actions for what is under it', and that a right click on a card while other cards are selected keeps the selection and makes the clicked card the menu's target ('plus that card's own actions'). The plan puts the four freeze actions in every right-click menu but runs them through `freezeSelection(op)`, which acts on the selection. So wherever a right click keeps the selection, Freeze and Unfreeze act on things other than the one under the pointer:
- another card, while cards are selected;
- Claude's proposed '+'/'−' arrow, which selects nothing;
- a review item, while the board selection is not empty (D3-34).

A plain Unfreeze asks nothing first, so the wrong freezes go silently.
    - **scenario:** Frozen cards A and B are selected. The person right-clicks frozen card X, which is not selected, and chooses Unfreeze, meaning X.
- `menuSelection` keeps {A, B}, so A and B are unfrozen with no dialog, and X stays frozen.
- 'Freeze all other cards' from X's menu freezes X as well.
- Right-clicking a proposed arrow and choosing Freeze freezes whatever the board selection holds, not that arrow's item.
    - **fix:** Add to §4.3:
- In a right-click menu, the freeze group acts on the menu's target, never on a selection the right click kept. That target is the clicked card, field, vocabulary card, arrow, mark or review item when it is not part of the selection; otherwise it is the whole selection it belongs to.
- On a proposed arrow, the target is its review item: `{ kind: 'item', item, rev }`.
- When the target is not the whole selection, the entries name it: 'Freeze “‹card›”', 'Unfreeze 3 cards'.
- The Context Menu section keeps acting on the selection (D3-34).
- The review list lies outside `.tl-board`, where BoardInput's contextmenu handler and the menu's state live, so the menu state moves up to the board area.

Add store-freeze tests for each case.
  - [2]
    - **id:** U2
    - **severity:** major
    - **where:** §4.1 'Routing'; §3.9 ('Select them … the person then chooses Unfreeze in the Context Menu'); §4.2 (detail lock slots put {card, field} in the board selection); §4.7 ('Rows … are selectable'); §3.6 (J = the base during the first queue); slice 2 §5.2 ('the first stage switches the board to Proposed'); FZ-9, ES-9, FZ-10 ('freezes the version you see')
    - **problem:** The routing rule is borrowed from slice 2's Undo, where a shortcut is pressed while the focus sits somewhere. A freeze is pressed in the header's Context Menu section or in a popover. Both lie outside `data-undo-scope="session"`, so pressing either moves the focus out of the scope. The rule is therefore ill-defined: at render time the focus may be in the panel, at click time it is not.

With the Current view on screen this has three consequences:
- The four actions resolve to 'disabled: freeze on the Proposed view' even when the selection holds only review items, item-detail rows, request rows or end-confirmation rows. FZ-9 lists those places separately from the Proposed view.
- A Current-view board selection (selecting is allowed there, ES-9) routed while the focus is in the panel becomes a session freeze at J's value, while the person is looking at B.
- The plan never says what the board shows during the session's first queue. Slice 2 switches to the Proposed view only at the first stage, yet §3.6 freezes at J = B during that queue.
    - **scenario:** The session's first step runs and Claude calls request_unfreeze. The panel opens itself, and the board is on the Current view (stage 0, not yet switched by slice 2). The person presses [Select them], then Unfreeze in the Context Menu section. It is disabled: 'During an edit session your files can't change: freeze on the Proposed view.' If there is no Proposed view at stage 0, nothing can be unfrozen while the step waits, and the request can only be answered 'nothing unfrozen'.
    - **fix:** Replace §4.1's routing with:
- During a session, every freeze action is a sessionFreeze.
- What decides its subjects is the selection's origin, not the focus. Review items, item-detail rows, request rows, end-confirmation rows and stage problems are session subjects on either view.
- Board selections count only on the Proposed view. A Current-view board selection is never a subject; its entries are disabled with the ES-9 text.
- `FieldRef` gains `from: 'board' | 'session'`.

Also add:
- The Proposed view exists from the session's start. During stage 0 it shows J, the base.
- [Select them] on a request card, Select them on `Gate.frozen` and [Select it] on a stage problem switch the board to the Proposed view before selecting.

Tests in store-freeze:
- Current view with a checked review item: enabled.
- Current view with a board selection: disabled.
- A request answered during stage 0.
  - [3]
    - **id:** U3
    - **severity:** major
    - **where:** §4.3 (`freezeSelection` previews and opens the dialog; `confirmFreeze` sends `confirmed`); §4.4; §2.4 ('resending once with confirmed confirms them all', R2-11); §2.5 `sessionFreeze.confirmed?: boolean`; FZ-10 bullet 4; RV-5
    - **problem:** The webview's preview (planFreeze) can show the counts, the versions and D3-25's numbers. It cannot show two lists only the host computes:
- `fillingNow`, which comes from the running queue's StepScopes in the runner;
- RV-5's cascade with its frozen items, which the reducer computes.

When the preview opens a dialog and the person confirms it, the webview posts `confirmed: true`. Per R2-11, the host takes that as confirming every list, including the ones the person never saw. FZ-10 says freezing a field Claude is filling 'asks you to confirm'. RV-5 says telelean 'lists every accepted item that depends on it … Cancelling the list cancels the change'.
    - **scenario:** (a) A whole-model mid-stage step runs. The person freezes card C, which has a Change item in review and an empty Why.
- The preview asks 'Freeze which version?' and the person picks Claude's proposal.
- The webview posts `confirmed: true`.
- The host's `fillingNow` for C's Why counts as confirmed, so the Why is frozen empty without §3.8's 'Claude may be filling … Freeze it empty?' and its warning that the step may end without a result.

(b) In a stage, the person chooses 'Unfreeze all other cards' with 'Also un-accept' ticked.
- The dialog shows only '‹k› accepted items return to review (with what depends on them)'.
- On confirm, the dependents return to review without ever being listed.
    - **fix:** §2.5 and §2.4: make `confirmed` name what was shown: `confirmed?: { counts?: true; versions?: true; fillingNow?: true; cascade?: true; frozenChanges?: true }`. The host answers `needs-confirmation` again with every list it computed that `confirmed` does not name.

§4.3: the preview sets only enablement and the lists of the first dialog. A dialog opened from the host's `needs-confirmation` shows every list and resends with every kind named.

Tests (3g):
- versions confirmed in the preview, plus `fillingNow`: a second dialog follows;
- 'also un-accept': the cascade dialog follows.
  - [4]
    - **id:** U4
    - **severity:** major
    - **where:** §4.5 'Locks' (slots: sentence and Why on the face; Kind, Stance, Source, Lean statement, Proof and Dependencies in the details) and 'Keep-empty'; §2.6 D3-44 ('an emptied field is frozen empty'); built NodeCard.tsx (the 'because:' line only when a Why is set), CardDetails.tsx (Stance chips only on axioms or when set; `Proof` returns null for an unproved card), Vocabulary.tsx (gloss only when set); FZ-2, FZ-9, FZ-11
    - **problem:** The lock slots hang on the rows the board draws today. Those rows are not drawn for:
- an empty Why;
- a proposition's unset Stance;
- an unproved card's Proof;
- an empty vocabulary gloss.

A field that is not drawn can be neither clicked (lock slot) nor Alt-clicked. So FZ-2's keep-empty can be applied to exactly these fields only by freezing the whole card.

D3-44 makes it worse. Clearing a Why on the board, or a proposition's stance, freezes that field empty as a standing freeze, and its row then disappears. The lock is never seen (FZ-11: 'A frozen field shows a small lock'), and the field cannot be selected to Unfreeze it. Yet whole-model steps may fill these fields (§3.8 'Filling now'; G5's exception).
    - **scenario:** 1. The person clears card C's Why with 'Edit why'.
2. D3-44 freezes the Why empty.
3. The face drops its 'because:' line, and the details offer only 'Add why'.
4. Later, with the whole model open, Claude cannot give C a Why.
5. The person has nothing to click to see why, or to unfreeze it, short of Unfreeze on the whole card, which also lifts its other freezes.
    - **fix:** Add to §4.5:
- The details always list every CF-2 field of the card's kind as a row with its lock slot, empty ones included: 'Why — (empty)', 'Stance — (empty)', 'Proof — empty / pending / proved'.
- A vocabulary item's details list Gloss even when it is empty.
- An empty field that is individually frozen also shows on the face as '— kept empty' with its lock.

Tests (freezeLook, store-freeze):
- freeze an empty Why, a proposition's empty Stance and an unproved Proof by their slots;
- a Why cleared on the board under D3-44 shows 'kept empty'.
  - [5]
    - **id:** U5
    - **severity:** major
    - **where:** §2.4 (ok branch `freeze.left`); §2.9 `FreezePlan.left`; §3.6 'Not freezable' (D3-6); §4.3; §4.4–§4.5 (nowhere is `left` shown); CM-3
    - **problem:** CM-3: 'An action that fits only some of the selected items is shown disabled, with the reason on hover.' planFreeze instead freezes what it can and returns the rest in `left`.
- Nothing in §4 says where `left` is shown. The UI design had 'and `left` says so in a toast'; the plan lost it.
- The deviation from CM-3 is not logged.
- The commonest case is a target card frozen while the results are hidden: its Proof, Dependencies and mark are left.
- D3-6's only text, '“‹T›”'s proof can be frozen once its result is shown.', is also the reason given for the Dependencies and the mark.
    - **scenario:** 1. The results are hidden. The person selects target T and chooses Freeze.
2. Six fields are frozen, and the Proof and Dependencies are not.
3. T gets a '🔒 6' chip instead of the aura, and nothing says what was left out.
4. After Show results, a later Submit or re-ask step replaces T's proof, which the person believes they froze.
    - **fix:** §4.3:
- When planFreeze leaves some subjects, the entry stays enabled, with the tooltip 'Freezes ‹n› of ‹m›: ‹reason›'.
- After the action, a toast lists `left`, for example: 'Froze 6 fields of “T”; left: Proof, Dependencies: “T”'s proof, Dependencies and mark can be frozen once its result is shown.'

Also:
- Log this as a narrowing of CM-3 in §7.2 (D3-52; alternative: disabled, as CM-3 says).
- Change D3-6's text to name all three: '“‹T›”'s proof, Dependencies and mark can be frozen once its result is shown.'
- 3f test: freezing a hidden target shows the left list.
  - [6]
    - **id:** U6
    - **severity:** major
    - **where:** §4.2 ('a vocabulary item's header selects it (its chevron still opens it)'), §4.3, §4.5 (aura, card lock badge and keep-empty only for NodeCard; slots on vocabulary items), §1.1 3f; built Vocabulary.tsx (the Presuppositions section renders `PresuppositionChip` spans with no header, no chevron and no focus; a VocabBox's div is not focusable), Board.tsx (the band sits outside `.tl-board`), BoardInput.ts:791 (contextmenu listener on `.tl-board` only); CF-1, CM-2, FZ-9, FZ-11; the user's FROZEN 4–5
    - **problem:** Presuppositions are vocabulary cards shown as chips. They are Lean axioms, so belief content. None of the plan's gestures exists on a chip: no header, no chevron, no lock slots on a declaration or gloss. So a presupposition cannot be selected, frozen or unfrozen by itself, and cannot show a lock or a 'held by' mark.

Vocabulary boxes have the same gaps in milder form:
- they can be selected only with the mouse, because no header is focusable;
- a wholly frozen one gets no aura and no card lock badge, although FZ-11 says 'a frozen card gets an aura … plus a lock badge';
- a right click on the band opens VS Code's Cut/Copy/Paste menu, because the band lies outside the element BoardInput listens on.

The user's FROZEN 4 asks that any visible card can be selected and frozen at all times.
    - **scenario:** Before opening the whole model, the person wants to keep 'assumes characters exist' exactly as it is.
- Clicking the chip selects nothing.
- A right click shows Cut/Copy/Paste.
- The keyboard cannot reach it.

The only ways left are 'Freeze all other cards' from some other card, which freezes everything, or freezing the review item after Claude has already changed it.
    - **fix:** §4.2 and §4.5:
- Presupposition chips and vocabulary boxes are selectable cards: a click selects (Ctrl adds); they are focusable (tabIndex 0), Space selects, and Shift+F10 opens their menu.
- A right click opens the shared menu. The band gets its own contextmenu handler, and the menu's state moves from Board.tsx up to the board area.
- A wholly frozen vocabulary card gets the frost and a lock badge.
- A frozen presupposition chip gets a lock glyph.
- 'held by' shows as the link glyph and in the chip's tooltip.

Add `Vocabulary.tsx` tests and an s3-freeze case for a presupposition.
  - [7]
    - **id:** U7
    - **severity:** minor
    - **where:** §4.5 'Aura' ('only when every field of the card's kind has a reason (`whole`)') against §4.5's banner bullet and D3-27 ('accepted content shows field locks'); the user's FROZEN 1
    - **problem:** The user's FROZEN 1 says frozen status 'is applied … when the user … accepts a card … It should manifest visually as an aura'. D3-27 gives accepted content field locks only, so an accepted Add, all of whose fields RV-4 freezes, never gets the aura. §4.5's own rule ('every field … has a reason', with any reason) says it would. A builder cannot tell which is meant, and 3g's twin test of the lock DOM depends on it. R2-12 reversed D3-44 for the same kind of narrowing.
    - **scenario:** The person accepts 'Add ‹card›'. All of its fields are frozen as accepted, and under D3-27 it shows field locks and a '🔒 8' chip, but no aura.
    - **fix:** §4.5: `whole` counts every reason the view shows, accepted ones included, so an accepted Add gets the aura; partial accepted freezes keep field locks (D3-26).

Revise D3-27 accordingly, with 'accepted content: locks only' as the alternative. If D3-27 is kept instead, reword it to say that it narrows the user's FROZEN 1, and list it for the user's review.
  - [8]
    - **id:** U8
    - **severity:** minor
    - **where:** §4.5 ('Dependencies ("Depends on") in the details'; the `deps` badge has 'no pointer events'); built CardDetails.tsx 'Depends on' = cardData `dependsOn()` (declared premises plus proof uses plus statement mentions, on axioms too); CF-7; CM-2 ('click its lock icon'); FZ-13
    - **problem:** 'Depends on' is derived data: it mixes proof uses (some with no drawn arrow, TL107) and statement mentions with the drawn arrows.
- A lock on it suggests that those can be frozen, which CF-7 forbids.
- The list is shown on axioms too, which have no Dependencies field.
- The selection summary calls the field 'Dependencies'.
- The lock 'where the arrows enter the card' (FZ-11) takes no pointer, so CM-2's 'click its lock icon' does not work for this field on a collapsed card.
    - **scenario:** A proposition's proof uses a card with no drawn arrow. The person freezes 'Depends on', expecting that use to be fixed. The use is not in the field, and Claude may still change the proof.
    - **fix:** Give a proposition's details a 'Dependencies' row listing its drawn arrows, or 'follows from nothing', or 'no stated basis', with its lock slot. Leave 'Depends on' as it is, without a slot.

Give the `deps` badge a hit target: a click selects `{ card, field: 'dependencies' }`, and a right click opens its menu. When the card has no arrival slot, place it at the middle of the card's left edge.
  - [9]
    - **id:** U9
    - **severity:** minor
    - **where:** §4.8 ('Store formalizeOptions { runId, wholeModel, mayAddCards }, persisted; … resets when the session ends or another runId appears'); ES-2 ('The switch resets to off after each session'); D3-29
    - **problem:** Before a session there is no runId.
- A switch set before the start sees 'another runId appears' as soon as the new session's first `session` message arrives. A literal build resets it then, and the session's mid-stage Formalizes run narrow, against D3-29.
- If the webview misses the end (the window closed during Exit or Apply), the persisted `wholeModel: true` survives with the old runId. Nothing resets it before the next session's start message is posted.
    - **scenario:** 1. Session R1 runs with the whole model open.
2. The window closes during Exit and is reopened: there is no session, but `{ runId: R1, wholeModel: true }` is persisted.
3. The person's next Formalize reads 'Formalize for dependencies (whole model)' and posts `options.wholeModel`, which they never chose for this session.
    - **fix:** §4.8:
- `runId` is null until the Formalize that starts a session is answered, and then takes that session's runId.
- A later, different runId, a `session: null`, or loading with no session active, resets both switches to off.

Add tests in store-formalize.
  - [10]
    - **id:** U10
    - **severity:** minor
    - **where:** §4.5 'Session banner' (`freezes.mode` holds only wholeModel and mayAddCards) and 'May change' (`freezes.open`: target, fuzzy, arrowsInto); §2.4 SessionFreezesView
    - **problem:** A narrow Submit queue reworks the Shaky and to-be-redone items (DO-3, RV-12, D3-42), so it may change those cards' sentences and statements. The banner then reads 'Only empty Lean statements at the selected arrows, the targets' proofs, and new arrows into the targets may change', which is false for that queue. `open` marks only the target's proof and the fuzzy statements, not the cards being reworked.
    - **scenario:** The person declines two cards Shaky and presses Submit review. While the Submit steps run, the banner says only empty statements, proofs and new arrows may change, yet Claude rewrites both Shaky cards' sentences.
    - **fix:** §2.4:
- `mode` gains `submit: boolean`: some step of the running or last queue is a Submit step.
- `open` gains `rework: string[]`: the cards of the step's open items.

§4.5:
- For such a queue the banner reads 'Claude reworks the cards you declined Shaky or that are to be redone; everything else is kept as in a Formalize step'.
- Those cards get a 'Claude reworks this' chip.

Add a 3g test.
  - [11]
    - **id:** U11
    - **severity:** minor
    - **where:** §4.7; §2.4 (`start` is 'EN-2's summary line'); the user's REVIEW 8 ('tell him which cards / card fields will be automatically frozen / unfrozen'); EN-2 ('the other N cards return to how they were'); F15 (2,000+ rows)
    - **problem:** The confirmation's freeze rows have four problems:
- Each row carries only the tick label, 'stays frozen (standing)' or 'stays unfrozen'. What happens by default at the end, unfrozen or frozen again, is never said, although REVIEW 8 asks for exactly that.
- §4.7's fixed line, 'Claude's step limits end with the session; your other freezes return to how they were.', uses neither `start` nor a count, which contradicts §2.4 and EN-2.
- After 'Unfreeze all other cards' on 250 cards, the section lists about 2,000 per-key rows, each with its own tick.
- The rows are grouped by card, but the group of an arrow row (both ends are cards) and of a vocabulary row (no card) is undefined.
    - **scenario:** The person opens Apply's confirmation after 'Unfreeze all other cards'. They face about 2,000 'stays unfrozen' ticks under 250 card headings, and no sentence says that the unticked ones are frozen again.
    - **fix:** §4.7:
- Two groups with headings: 'Unfrozen when the session ends, unless you keep them (‹n›)' and 'Frozen again when the session ends, unless you keep them unfrozen (‹m›)'.
- Each card group has one tick for all its rows; groups are collapsed by default and expand to per-field ticks.
- An arrow row goes under its target card; vocabulary rows go under 'Vocabulary'.
- The summary line is built from `start`: 'Started with Formalize for dependencies[ (whole model)]: Claude's step limits end with the session; the other ‹N› cards of ‹subject› return to how they were.'
  - [12]
    - **id:** U12
    - **severity:** minor
    - **where:** §3.12, the FZ-12 list and its grep for 'statements frozen'; built webview model/run.ts:152 (the checks counter's tooltip 'Lean checks Claude used this round (check, freeze and suggestion checks count one each)'); runner run/manager.ts:2030 (activity lines 'freeze_statements: refused (…)' and 'freeze_statements: telelean could not run Lean (…)')
    - **problem:** Two user-facing texts still use 'freeze' for D-19's step, which FZ-12 renames so that it 'cannot be confused with FROZEN'. The planned grep looks only for 'statements frozen', so it would not catch either of them, nor the activity lines' 'freeze_statements:' prefix.
    - **scenario:** During a session, the run panel's 'checks 3/25' tooltip says 'freeze … checks count one each', and the activity feed shows 'freeze_statements: refused (1 reason)' next to FROZEN's own refusals.
    - **fix:** Add to §3.12:
- the counter's tooltip: '(check, fix-statements and suggestion checks count one each)';
- every activity line uses TOOL_TITLES' 'Fix statements' as its prefix ('Fix statements: refused (…)', 'Fix statements: statements fixed (round N)').

Widen the test to search user-facing texts for /\bfreez|frozen/ outside FREEZE_TEXTS.
  - [13]
    - **id:** U13
    - **severity:** minor
    - **where:** §4.5 'Review list' ('a gate with frozen offers Select them'); §2.4 `Gate.frozen`; slice 2 §5.6 ('Select them' for missing dependencies); §4.4 ('A refused un-reject, Undo or Redo shows its text as a toast, with [Select them]'); built toasts/Toasts.tsx (Undo and Dismiss only; errors auto-dismiss after 15 s); §1.1 3f/3g file lists
    - **problem:** An Add premise's Accept can be gated by both `missing` (dependencies in review) and `frozen` (the target's Dependencies are frozen). That gives two buttons labelled 'Select them' with different effects: items in the list against targets on the board.

The toast's [Select them] also needs a new toast action. No sub-slice's file list includes Toasts.tsx, and an auto-dismissing toast can vanish before its button is pressed.
    - **scenario:** An Add premise draft is both missing an accepted dependency and blocked by its target's frozen Dependencies. The detail shows 'Select them' twice. Separately, a refused un-reject's toast disappears after 15 s, together with its only route to the frozen targets.
    - **fix:** Label the two buttons 'Select the missing items' and 'Select the frozen targets'.

For the refusal, either:
- show it in the item detail's footer, or as an event in the events box, with [Select the frozen targets]; or
- add `toasts/Toasts.tsx` and an optional toast `action` to 3g's files, and keep such toasts until dismissed.
  - [14]
    - **id:** U14
    - **severity:** minor
    - **where:** §4.2 (new selection kinds), §4.5 ('Field lock slots … 14 px buttons … still focusable'), §4.2 ('Shift+F10 on a focused lock slot'); slice 1's practice (a selected card shows a check glyph as well as the focus colour); BD-3 ('Tab moves between cards'); built s1-canvas.spec.ts (Tab from one card to another within 8 presses)
    - **problem:** Lock slots and the new selection kinds have three gaps:
- No look is given for a selected field or vocabulary card, so the only sign of what Freeze will act on is the summary line. Slice 1 added the check glyph because colour alone was not enough.
- Lock slots and cards have no accessible names: a slot needs '‹field›: frozen … select', with aria-pressed when selected, and the card's aria-label lacks '(frozen)'.
- Two more tab stops per card face (sentence and Why, besides the chevron) make Tab walk controls instead of cards.
    - **scenario:** A keyboard user Tabs from one canvas card to the next: each card now takes three or four presses. A screen reader announces 'button' for a lock slot, without saying which field it is or whether it is frozen.
    - **fix:** §4.5:
- A selected field row gets `data-selected`: the focus-colour outline plus a check glyph in its slot. A selected vocabulary card is marked as a selected card is.
- FieldLock's aria-label is '‹field›: frozen (‹reasons›). Select' or '‹field›: not frozen. Select', with aria-pressed when selected.
- NodeCard's aria-label adds '(frozen)' or '(‹n› fields frozen)'.
- Slots get tabIndex −1 with a roving focus inside the focused card (←/→). Space selects the focused slot, Shift+F10 opens its menu, and Tab still goes from card to card.

List s1-canvas's Tab test as touched.
  - [15]
    - **id:** U15
    - **severity:** minor
    - **where:** §4.3 reasons ('Not frozen.'); FZ-4 and §3.9 (held content); ES-2 ('Unfreeze removes FZ-7 reasons only; it does not lift a step's preset'); the UI design's preset text, which the plan dropped
    - **problem:** Two kinds of content show Unfreeze disabled with 'Not frozen.':
- a held declaration;
- content fixed only by the running step's preset.

The text is true, but it says neither what holds the content nor what to do, which is exactly the confusion ES-2's sentence warns about.
    - **scenario:** Claude asks to change definition D, which frozen card A holds. The person selects D and finds Unfreeze disabled, 'Not frozen.', with no hint that A must be unfrozen.
    - **fix:** Held content: 'Held by “‹A›” (and ‹n› more): unfreeze what holds it.', with a menu entry 'Select what holds it'.

Content fixed only by the preset, during a narrow step: 'Only this step's limits keep it fixed, and Unfreeze does not lift them: open the whole model when you formalize.'
  - [16]
    - **id:** U16
    - **severity:** minor
    - **where:** §4.6 (one row per item with [Select them] [Continue] [Keep frozen]); §3.9 (Keep frozen enabled only while every item is still frozen or held; Continue computed from the store); FZ-9 (request cards); CM-3
    - **problem:** FZ-9 lists request cards as a place where a card, field or arrow can be selected, but [Select them] selects all requested targets at once, and single rows cannot be selected. Keep frozen's disabled reason has no text. Continue can be pressed while an Unfreeze is still on its way, so its tooltip ('lists what it will report') may describe a state the host is about to change.
    - **scenario:** Claude asks to change three items, and the person wants to allow one. They press [Select them] and must then Ctrl-click two targets off on the board, which is impossible for a held declaration in the collapsed Vocabulary band. Keep frozen goes grey with no reason given.
    - **fix:** §4.6:
- Each row is selectable: a click selects its target, Ctrl adds, and a right click opens the freeze group.
- Keep frozen's disabled reason reads 'You unfroze some of them: press Continue to tell Claude.'
- Continue and Keep frozen are disabled while a freeze action of this session is on its way (`freezeBusy`).
  - [17]
    - **id:** U17
    - **severity:** minor
    - **where:** §1.1 3f ('the harness's colour variable'); §6.1 3f/3g Playwright specs; built test/harness/harness.js (only the MUTATIONS message types get an automatic actionResult; per-theme vars), test/unit/theme.test.ts (M1_COLOURS require theme-token fallbacks); §4.5 `--tl-frozen: var(--vscode-telelean-frozen, #e070b0)`
    - **problem:** The test harness and the theme test are not ready for the slice-3 specs:
- `setFreezes`, `sessionFreeze`, `answerUnfreeze` and endSession's keep are not in the harness's MUTATIONS. With the UI not optimistic (`freezeBusy`), every s3 spec waits for an actionResult unless each test replies by hand.
- The fallback #e070b0 is not the dark default (#F07CB8), and on the light widget background (#f8f8f8) its contrast is 2.78:1, below WCAG's 3:1 for UI components.
- One harness variable cannot give the light and high-contrast screenshots their own defaults.
- If the id goes into M1_COLOURS, the theme test fails, since that list requires theme-token fallbacks.
    - **scenario:** The integrator runs s3-freeze.spec.ts. The Freeze click's spinner never clears, and the light-theme screenshot shows locks too faint to judge the look.
    - **fix:** 3f:
- Add the three messages to the harness's MUTATIONS; 3g adds endSession's keep.
- Add `telelean-frozen` to each harness theme: dark #F07CB8, light #B4236E, hc #FF8FD2.
- Use the dark default as the CSS fallback.
- Put `telelean.frozen` in a new SLICE3_COLOURS list in theme.test.ts (explicit defaults, no theme-token fallback).
  - [18]
    - **id:** U18
    - **severity:** minor
    - **where:** §4.1 (the webview previews with planFreeze and frozenNeeds); §2.9 `planFreeze`/`frozenNeeds` take `reasons: Record<FreezeKey, readonly FreezeReason[]>`; §2.4 `SessionFreezesView.frozen: Record<FreezeKey, FreezeReasonView[]>` and `BoardFreezesView.frozen: FreezeKey[]`; §2.2 FreezeReason 'yours' requires `at`
    - **problem:** The webview has only `FreezeReasonView`, which has no `at`, and on the board only bare keys. But planFreeze and frozenNeeds require `FreezeReason`, whose 'yours' variant needs `at`. 3f may change no core file, so it must cast or invent `at` to call the functions that §4.1 says it previews with. 3b's test 'the same plan from view data and from records' presumes an adapter that the plan does not define.
    - **scenario:** The 3f builder writes `planFreeze({ reasons: session.freezes.frozen, … })`. tsc refuses it, because 'yours' lacks `at`, and the builder has to stop and report a contract change.
    - **fix:** §2.9: type both inputs as `reasons: Readonly<Record<FreezeKey, readonly FreezeReasonView[]>>`; neither function reads `at`. Board callers map each key to `[{ kind: 'standing' }]`. 3b's test passes view data unchanged.
  - [19]
    - **id:** U19
    - **severity:** nit
    - **where:** §4.5 ('a chip "🔒 ‹n›" (`tl-chip--frozen`)', '"— kept empty 🔒"', and the frost `<span class="tl-card__frost">` with `inset: 0` and an inset box-shadow including `0 0 10px 1px` at 40 %)
    - **problem:** Two details of the look:
- The emoji is drawn by the system's emoji font: a yellow padlock, or a missing glyph on Linux without one. It ignores the theme and high contrast, unlike the codicon locks used everywhere else.
- An absolutely positioned child with z-index auto paints above the card's text. Its 10 px inner glow tints the sentence near the edges and covers half of the 4 px kind stripe (`.tl-card::before`). Without `border-radius: inherit`, its square corners show outside the card's 5 px rounded corners.
    - **scenario:** In a light theme, a partly frozen card shows a yellow emoji padlock beside rose field locks, and the start of its sentence sits under a pink haze.
    - **fix:** Use `codicon-lock` in `--tl-frozen` in both chips, with 'frozen' in the title and aria-label.

Give the frost `border-radius: inherit; z-index: 0`, and the card's rows `position: relative; z-index: 1`, or start the ring at `left: 3px`, inside the stripe.
