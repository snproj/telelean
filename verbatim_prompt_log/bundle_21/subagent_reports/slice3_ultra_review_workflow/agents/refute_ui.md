# refute:ui

Agent `a6d28c6ab92da6f99` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** U1
    - **real:** True
    - **severity:** major
    - **reason:** Survives.
- §4.3 puts the freeze group in every right-click menu, shows it 'whenever the selection holds anything freezable', and runs it through freezeSelection(op).
- §4.2 leaves card right-clicks 'as today'. Built board/menu.ts `menuSelection` returns keep whenever `state.selected` is non-empty, so right-clicking an unselected X while {A,B} is selected keeps {A,B}.
- CM-7 makes the clicked card the menu's target with 'that card's own actions', and CM-4 lists Freeze/Unfreeze as card actions. Built runAction.ts runs every other card entry on the clicked card (`thing`), so the freeze group would be the one entry that does not.
- Nothing in the plan defines a menu target for the freeze group.

Consequences:
- A plain Unfreeze of standing or own reasons asks nothing (§3.6). A and B lose their freezes and X keeps its own.
- In a session this is silent: §4.9 gives a toast only to board steps.
- 'Freeze all other cards' from X's menu also freezes X.
- Slice 2 §5.10's proposed-arrow menu (its Accept and Decline act on the arrow's item) would gain a freeze group that acts on the board selection. With an empty selection the group does not appear at all.

Weaker parts:
- Neither slice defines a right-click menu on review-list rows, so the D3-34 item case is speculative.
- Moving the menu state up to the board area is an implementation detail.

Undo exists, but this silently strips protection from cards the person did not target. That is the same class as R2-2, which was rated major.
  - [2]
    - **id:** U2
    - **real:** True
    - **severity:** minor
    - **reason:** Partly survives; the severity is overstated.

What holds:
- The routing copies slice 2's undoScope, but freeze entries are pressed in the header's Context Menu section or in a Popover rendered into document.body (common/Popover.tsx). The focus is never inside data-undo-scope="session" at that moment.
- So in practice the rule reduces to 'Current view on screen → disabled', and its focus clause is incoherent.
- That narrows FZ-9 without a logged decision: FZ-9 lists review items, request cards and the end confirmation apart from the Current view.

Why it is minor:
- The outcome is a disabled entry whose reason says exactly what to do (switch to Proposed). Nothing wrong is frozen.
- The stage-0 dead end assumes no Proposed view during the first queue. Slice 2's contract gives SessionView a non-optional `board` from stage 0 (SessionViewInput.current; `judgement` null until the first queue ends), and the session bar carries the Current|Proposed switch (§5.8).
- The built store keeps the selection when the view switches.
- This plan explicitly freezes at J = base during the first queue (§3.6, §3.8, a 3d test). So [Select them], switch, Unfreeze works.
- The 'frozen at J while looking at B' case needs a freeze control inside the panel, and the plan has none: lock slots only select (D3-28).

Routing by the selection's origin, as the finding proposes, is a good clarification.
  - [3]
    - **id:** U3
    - **real:** True
    - **severity:** minor
    - **reason:** Survives as a hole in R2-11's fix, with limited harm.

The gap:
- §4.3: freezeSelection 'previews, then opens the dialog or posts', and confirmFreeze posts `confirmed`.
- §2.4: `confirmed` confirms every list.
- planFreeze's output (§2.9: add, remove, unaccept, counts, versions, left) has no fillingNow, which the runner computes (§3.8), and no RV-5 cascade, which the reducer adds.
- So a dialog the preview opens itself (Versions, or D3-25's always-asked Unfreeze all other cards), followed by confirmed: true, skips the host's Filling-now dialog and the cascade's list.
- The 'Also un-accept' tick is chosen inside the dialog, so even a host-first flow never lists that cascade before the confirmed resend.
- Both scenarios are reachable, e.g. Freeze all other cards during a whole-model step while items are in review.

Why it is minor:
- What is lost is a confirmation: FZ-10's 'asks you to confirm' with D3-50's warning, and RV-5's list.
- The freeze and the cascade themselves are applied correctly, and the frozen check is untouched.
- A5's Undo restores an Unfreeze all other cards, and a step that D3-50 ended can be retried.

This matches R2-11's minor rating.
  - [4]
    - **id:** U4
    - **real:** True
    - **severity:** minor
    - **reason:** Partly survives.

Confirmed in the built code:
- NodeCard draws 'because:' only when a Why is set.
- CardDetails shows Stance chips only on axioms or when a stance is set.
- Its Proof section returns null for an unproved card with no presuppositions or axioms.
- On the Proposed view it renders no Choices (Stance and Source) at all.
- Vocabulary.tsx shows a gloss only when one is set.

The gap: §4.5 hangs lock slots on these rows and never says an empty field gets a row. So an empty, unfrozen Why, a proposition's unset Stance, an unproved Proof or an empty gloss cannot be selected for FZ-2's keep-empty. The only route is to freeze the whole card, then unfreeze the other fields one by one.

The D3-44 half is largely refuted:
- §4.5's keep-empty rule draws '— kept empty 🔒' on an individually frozen empty field.
- A partly frozen card carries the '🔒 n' chip.
- So a Why that D3-44 froze empty is visible, and its lock can be selected for Unfreeze.

The plan already names rows the board lacks (Kind), so builders add rows anyway. Saying 'every field of the kind, empty ones included' is a one-line fix.
  - [5]
    - **id:** U5
    - **real:** True
    - **severity:** minor
    - **reason:** Survives.
- §2.4 and §2.9 define FreezePlan.left and the ok outcome's `freeze.left`, but §4 never says where `left` is shown.
- The UI design's line ('Freeze on such a card freezes its other fields, and `left` says so in a toast', design_ui-protocol.md, D3U-8 bullet) was lost in synthesis.
- §4.3 enables an entry whenever planFreeze has anything to do. For a mixed selection (e.g. a provisional card plus a normal card) this departs from CM-3's 'shown disabled', and §7.2 does not log it.
- D3-6's single text names only the proof, although §3.6 applies it to Dependencies and the mark too.

Effect: a target frozen while its result is hidden gets a '🔒 6' chip instead of the aura, with no explanation.

The harm is low:
- A later change to the unfrozen proof still comes back as a Result item to review.
- D3-6 deliberately forbids freezing an unseen proof.
  - [6]
    - **id:** U6
    - **real:** True
    - **severity:** minor
    - **reason:** Partly survives.

Confirmed:
- Vocabulary.tsx renders presuppositions as PresuppositionChip spans with no header, chevron, tabIndex, click handler or gloss row.
- The plan's gestures (header click, declaration and gloss slots, the held mark 'on vocabulary items') never mention chips.
- So a presupposition, which is a vocabulary card (`axiom T.exists : Nonempty T`), cannot be selected, frozen or unfrozen on its own. That goes against CF-1, CM-2 and the user's FROZEN 4.

Mitigations:
- 'Freeze all other cards' covers it as a vocabulary card.
- [Select them] on a request can still put it in `selectedVocab`.
- Any change Claude makes to it still comes back as a review item.

The other claims are weaker:
- Lock slots are focusable buttons with Shift+F10, so vocabulary fields are reachable by keyboard.
- A wholly frozen vocabulary card has no aura, but its locks show the freeze (never colour alone).
- The band's missing contextmenu listener (BoardInput listens on .tl-board only) is wiring the builder meets while implementing §4.2's 'on a vocabulary item, its menu', not a plan defect.
