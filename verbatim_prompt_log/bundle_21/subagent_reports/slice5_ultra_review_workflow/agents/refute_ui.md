# refute:ui

Agent `a4bdaabee2d665da6` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** UI-1
    - **real:** True
    - **severity:** major
    - **reason:** Survives refutation. The plan never names a render target, portal or focus model for RefPicker; its only mechanism is that rows use onMouseDown with preventDefault (§4.1). Its hosts have conflicting constraints, all checked in code: (1) common/Popover's second layout effect focuses the first menuitem or its tabIndex=-1 root on open, and its tooltip mode is pointer-events:none (board.css); (2) it portals to document.body, and common/Modal uses showModal(), so anything outside the dialog sits beneath the top layer and is inert. The hold-as dialog (slice 2 Dialogs) and the transform window (D4-18, a Modal) are hosts in 5f2. (3) Popover's capture-phase pointerdown closes on any target outside its element or anchor, so a separately portaled picker closes the decline menu that holds the Shaky note. (4) Rendering inline on the canvas puts the picker in the scaled layer, clipped by overflow:clip, where BoardInput's wheel handler preventDefaults and zooms. (5) Presses on the picker's hint or padding, or on 'Shows as:' chips, blur the input, and InlineEdit's onBlur commits. The plan's pointer to slice 4's CardSearch.tsx (a focus-taking Popover search) makes reusing Popover likely. Slice 4's own plan treated rendering inside its modal as plan-level (Popover `container`), but slice 5 never cites it. Builders cannot run a browser, so these failures of the user's headline # dropdown would surface only in an integrator Playwright run, if RAM allows.
  - [2]
    - **id:** UI-2
    - **real:** True
    - **severity:** minor
    - **reason:** Partly real. The decisive point is verified: Popover adds `document.addEventListener('keydown', ..., true)`, which calls stopPropagation and close() on Escape. That runs before React's root dispatch, so in the decline menu (a Popover) the first Esc closes the whole menu and its typed note. RF-3 and CM-2's 'first Esc closes only the picker' fails there, and the plan specifies keys only against InlineEdit. The other sub-claims are weaker. Any Enter-inserting handler must preventDefault on keydown, which already suppresses the A|P form's implicit submit and a native dialog's Escape cancel. Slice 2 does not say hold-as confirms on Enter. Tab is covered by the plan's 'a blur closes it', and blur-commit is InlineEdit's existing behaviour. The consequences are recoverable (retype a note, session Undo of an Accept), so minor.
  - [3]
    - **id:** UI-3
    - **real:** True
    - **severity:** minor
    - **reason:** Real. §4.3 explicitly says a chip click selects the target card or vocabulary item. Every existing reveal only flashes and pans: revealNode and highlightVocab set `flash`, and NodeCard's effect pans; neither selects. The plan's own tooltip says 'Click to show it.' With D3-34 (section freeze actions act on a non-empty board selection, else on the checked items), a chip click in a review row moves the section's target. The stated mechanism is also wrong: NodeCard selects in its onClick (clickCard), and stopping pointerdown in React stops neither that nor dragGuard's native capture listener. That listener blocks a column card's HTML drag only for NO_DRAG_SELECTOR elements, and BoardInput's native board listener runs before React's root. Existing in-card buttons stop propagation in onClick. Not major: the summary and hover labels name the new target, freeze changes are undoable steps, and nothing Claude then does lands without review and Apply.
  - [4]
    - **id:** UI-4
    - **real:** True
    - **severity:** minor
    - **reason:** Real gap. 5c2 is core only and computes reference dependents. 5f2's window work covers only # in sentences, Whys, Instructions and Dependencies, plus nameOf; no sub-slice touches slice 4's ImpactPanel. TransformDependent (slice 4 §2) has via, frozen, choices and target, but no text, and §2.4 names no carrier. So §2.8's 'Its reference becomes words: ‹text›.' has no path to the screen, and D5-12's automatic detach (which can rewrite a frozen referrer) goes unexplained in the panel. Minor, not major: slice 4's panel still lists the dependent generically, which meets RF-5 b's 'TR-13 warns'. The 'will read' and other-subject rows can travel as `warnings` entries that already carry text. The session's End confirmation shows typed changes, and a direct transform is one Undo step.
  - [5]
    - **id:** UI-5
    - **real:** True
    - **severity:** minor
    - **reason:** Real. RationaleDialog (dialogs/Dialogs.tsx) is the live 'Move to axioms' dialog: moveToAxioms and requestKindChange open it, and slice 3 keeps and extends it. Its 'Why do you hold it?' goes through confirmRationale to change-kind, and core planAction.ts lines 203–204 write it as `rationale:`. RF-1 says '# in any prose field (sentences, Why, …)', but §4.4 and D5-11's list omit this field, and 5f1's files lack Dialogs.tsx. 5c1 validates only planEditNode, planAddNode, adoption and slice-4 drafts, so a pasted token here skips refProblems. Minor: it is one optional field, and the same Why can be edited in place with #. An unvalidated token only shows 'deleted card' with TL124/TL125, as a hand edit would. A forged id is still recorded into ids.json by namedIdsInText before the write, and no session or hidden content is involved (the dialog works only outside sessions).
  - [6]
    - **id:** UI-6
    - **real:** True
    - **severity:** minor
    - **reason:** Real. webview/vitest.config.ts includes only test/unit/**/*.test.ts in the default Node environment, and its comment calls these tests DOM-free. jsdom and happy-dom appear only as vitest's optional peer deps and are not installed. No unit test renders React, and §0 forbids installs and reserves Playwright for the integrator. Yet §6.1 lists browser-only behaviour as 5f1's own tests: a row click not committing InlineEdit, Ctrl+Z after execCommand, pointerdown not dragging, Esc twice. §1 requires each sub-slice's unit tests to pass, and §4.1 asks 5f1 to decide execCommand undo, which it cannot observe. Minor: builders can move these to the Playwright draft, as slices 1–2 did. The impact is that these behaviours go unverified until the integrator's run, not a wrong product by itself.
