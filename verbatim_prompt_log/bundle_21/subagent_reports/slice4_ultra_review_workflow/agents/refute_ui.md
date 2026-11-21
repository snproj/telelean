# refute:ui

Agent `acabb00d58e287668` of workflow `wf_67531371-ae0`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** UI-1
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed. AnalyseInput (§2.9) requires `model: ProjectModel`, and needs `session.records/base` for touched and cascade. The webview gets only TlGraph plus the masked SessionView: HostToWebviewMessage has no ProjectModel, and no file in packages/webview/src uses one. TlGraph lacks DeclFacts and definition-to-definition reach, so §3.4's dependents cannot be derived from it. TransformWindowView carries only `submit: Gate`. §2.7 gives saveTransformDraft no analysis payload. ActionOutcome.transform has no kinds, warnings, touched or reworkResults. So §4.1's preview, and with it §4.2 row 6's ImpactPanel (TR-13 'before you submit', RV-5 b3 previews), cannot be built as written. Without a fix the panel fills only after a refused Submit, and 4j–4l may not change core. One claim is overstated: 'every Submit bounces' is wrong, because the outcome kind is mostly draft-local, so `expect` usually matches. The contract gap is still real and spans 4f, 4i and 4k.
  - [2]
    - **id:** UI-2
    - **real:** True
    - **severity:** major
    - **reason:** Mechanism checked in code. Modal maps the native `cancel` event to onCancel with preventDefault and calls showModal() only on mount. Popover's capture-phase Escape handler only calls stopPropagation, not preventDefault, so the keydown's default close request still reaches the dialog. Under Chromium's close-watcher rule, preventing one cancel uses up the user activation, and Esc is not an activation. So a second Esc in a row fires a non-cancelable cancel, and the native dialog closes while React still renders it. Every existing Modal closes on Esc, so this is the first one that must not, and the plan names common/Modal and requires 'never closes' without saying how. Esc-then-Esc is the plan's own two-step gesture and a common reflex. The result: the window is invisible, TW-1 refuses decisions, Cancel cannot be reached, and only Exit or a reload gets out. jsdom tests cannot catch this, and 4m lists no Esc test. The busy() half is minor and only happens if the builder edits busy() as a whole: in a session pressDelete(null) only toasts under the edit lock, and Esc only clears the board selection.
  - [3]
    - **id:** UI-3
    - **real:** True
    - **severity:** major
    - **reason:** Confirmed. §4.5 sends Ctrl+Z outside text fields in the window to the session stack. TW-1 (§2.7) and §4.5 allow undoing any freeze action, with no limit at `openedAtAction`. §5.1 makes no draft edit a step. The window has no Undo button naming the step, the toolbar is inert behind the modal, and slices 2 and 3 show no toast for a session Undo. So Ctrl+Z after Move to trash silently undoes an earlier 'Freeze: Z' made on the Proposed view. That is the kind of cross-scope Undo the user's third mid-turn message warned against, and slice 3 rated an Undo that silently unfreezes as major (R2-2). UN-1 does route windows to the session stack, but limiting Undo to actions since `openedAtAction` and labelling the step stay inside the spec. A draft-level undo for edits outside text fields goes beyond UN-4 4b, so that part of the fix is optional.
  - [4]
    - **id:** UI-4
    - **real:** True
    - **severity:** minor
    - **reason:** Partly real. Selecting draft cards is implied (§4.2 row 3's selection summary, Move to trash and Restore, the right click), though no gesture is defined. Fields can be selected through FieldLock. A typed item's detail rows are FieldChangeView rows, which slice 3 §4.2 already gives lock slots. The real gaps: in DependenciesEditor, existing arrows and the ∅ mark (only ×), although FZ-9 names the transform window and the board is inert behind the modal; queued-transform card chips and EN-2's typed rows, which are not made session subjects; and no rule for `new:` cards or newly added chips. The consequences are limited. The Dependencies field can be frozen as a whole. An arrow can be frozen on the board before opening the window, or while the transform is queued. Claude's removals come back as Remove arrow items, which can be declined. Outside the modal, the Proposed view shows the same cards. KindImpact, PreviousVersion and dependent rows are of little use to freeze, since freezes bind only Claude. This matches slice 3's F13 (lock slots in detail rows), which was rated minor.
  - [5]
    - **id:** UI-5
    - **real:** True
    - **severity:** minor
    - **reason:** A real inconsistency in the window, caused by D4-10. draftFromModel starts every copied Sentence, Why, Stance and Source 'open: Claude may change it' whatever their session reasons. D3-44 makes board-edited fields standing-frozen, so many rows will show a closed rose FieldLock beside an 'open' chip. The chip text 'frozen: you typed it' is the same text §3.11 gives the session reason. Slice 3's Unfreeze answers 'Not frozen.' on fields frozen only by their chip, such as every S11 copied Lean statement. Freeze on a fuzzy field triggers §3.2's Submit-blocking problem, whose text never mentions 'kept empty'. TR-13 b2's [Unfreeze its Lean statement] is really a chip change. But the behaviour stays safe: session freezes win (§3.2, transformScopeOf drops frozen keys), both signals appear in the row, D4-10 is logged, and the chip and the b2 button give a direct way through. This is confusing presentation with workarounds, not wrong or unsafe behaviour, so it is minor.
  - [6]
    - **id:** UI-6
    - **real:** True
    - **severity:** minor
    - **reason:** Confirmed. §3.11 makes `session-start` entries cover every field of every card outside the selection, and §2.3 and §3.11 Views show them as reasons. Slice 3's cardFreezeLook puts the frost, the card lock and closed field locks on any card where every field has a reason the view shows. No slice-4 sub-slice touches model/freezeLook.ts: it is not in 4l's files, and the tests check only the banner. So every card outside the selection gets the aura, against FZ-11's 'one banner … rather than putting an aura on every card' and 'Standing freezes and your own keep their aura', which §9 claims as covered. Impact is visual only. Reasons stay in the lock tooltips, nothing changes what Claude may do, and an aura on frozen cards is what FROZEN 1 literally asks for. The fix is one local rule.
  - [7]
    - **id:** UI-7
    - **real:** True
    - **severity:** minor
    - **reason:** Real but small. §3.6 ends the provisional session on `direct` with no dialog and no keep rows. §3.1, by contrast, gives Cancel with freeze actions slice 3's Exit dialog with keep ticks. EN-2's only exception is Cancel with no freeze changes, and REVIEW 8 asks for a popup naming the cards and fields before any session ends. D4-16 does not log this as a narrowing. Mitigations: ES-3 itself says this path undoes the provisional session's freezes, and TR-15 calls it 'outside a session'. The OutcomeLine states 'The ‹n› freeze changes … are dropped' before Submit. After the direct path the board is editable, so the person can make those freezes again as standing ones, which equals keeping them. This is a narrowing with a warning that gives only a count, not a loss of protection. The proposed dialog when freezeActions > 0, or a logged D4 decision, is the right fix.
