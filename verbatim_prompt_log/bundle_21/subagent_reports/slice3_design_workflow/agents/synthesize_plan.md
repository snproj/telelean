# synthesize:plan

Agent `aedca81a0623ccc22` of workflow `wf_d355dac3-0d9`. Verbatim output (JSON alongside).

I wrote the slice-3 plan to /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice3-plan.md: 838 lines, following slice 2's plan structure (§0–§8, §8 change log left for builders). That file is the only thing written; everything else was read only, nothing heavy was run and nothing was sent anywhere.

The most consequential calls for the user's later review are D3-1, D3-5, D3-9 and D3-12; each is logged with its alternative and how to reverse it.

**Sub-slices** (3a → 3b → 3c strictly one after another in core; 3d and 3e change no core file; 3f and 3g are webview and may run beside 3d/3e):
- **3a – Contracts and the frozen check (core).** All types, texts and freezes.json; `addressValue`/`heldValue`, `effectiveFreezes`, `frozenFindings` (held, inherited, fresh); judgeState and backstop integration; `statement-changed` compares meaningKey.
- **3b – Freeze actions, review hooks, views, protocol (core).** `planFreeze`, `acceptCovers`; Accept freezes (`ItemRecord.frozen`, which reconcile keeps); decline of a frozen proposal; Undo/Redo; the `answer` seal; SessionView/board freeze views; the `set-freezes` board action; protocol messages and validators.
- **3c – Whole model open and new cards (core).** Ownership, revert and dependencies for field Change, Delete, Remove arrow, intermediate Add and Proof broken; whole-model step limits plus the after-freeze rule; tool validators; intermediates as derived inferences.
- **3d – Freezes in runner and host.** freezes.json on the board stack; session freezes in run.json; `request_unfreeze`; freezing while Claude works (notices, uncounted fresh failures, finish re-check, rollback to the step's start); turn sections; FZ-12 rename; host routing.
- **3e – Probe, whole model in the runner, the end.** The meaningKey probe; Formalize options; the four tools and their ledger writes; comparator per intermediate; end-of-session restore with keep ticks, freezes.json inside Apply, Exit's keep step.
- **3f – Webview: selecting and freezing, dialogs, the look.**
- **3g – Webview: session freeze UI.** Request cards, end confirmation and Exit keep lists, Formalize's ▾, Undo during a step, banner and may-change marks, user guide.

Fallback splits are pre-planned for 3a, 3d, 3e and 3f.

**Decisions (each marked AUTOPILOT DECISION in §7.2):**
- D3-1: A Formalize-started session makes no binding "session-start" freezes; the per-step limits enforce the preset, and the banner is display only.
- D3-2: Meaning is compared in Lean by `meaningKey` (SHA-256 of the elaborated term's `Repr`); if it is missing, the fallback comparison still lets steps run but refuses Apply.
- D3-3: Held content keeps text and meaning; held theorems and `.holds` keep their type only.
- D3-4: Accept's freeze lasts until the person's own status change or Unfreeze; reconcile's automatic returns to review keep it.
- D3-5: A freeze made during a queue keeps the value the person sees. Content an earlier step of that queue already changed becomes a stage problem, and Apply waits for the person; the queue is not cancelled.
- D3-6: A target's Proof, Dependencies and mark cannot be frozen while results are hidden or while its step is queued or running.
- D3-7: During a step, "your version" (a Reject) and unfreezing accepted content wait for the step's end.
- D3-8: In a stage, freezing waits while the working copy is re-checked; freeze requests carry the view version and stale ones are refused.
- D3-9: No "Allow this change" and no "meaning changed by X" items; to change held content the person unfreezes what holds it (b5 unused).
- D3-10: Proof broken: Claude marks it before fixing statements; telelean removes the `.holds` plus proof material only it uses; Accept means the card loses its proof, Reject cascades; "make it pending" waits for slice 4.
- D3-11: Structural changes go through tools (remove_arrow, delete_card, add_card, mark_proof_broken) that telelean writes via the ledger.
- D3-12: Whole-model changes are allowed only before freeze_statements; after it, card blocks and all declarations are fixed.
- D3-13: Intermediate cards are added before the freeze, judged as derived inferences, and may end unproved (A25).
- D3-14: remove_arrow and delete_card are limited to the person's own arrows and cards that nothing else uses, and to cards that are not frozen or held.
- D3-15: freezes.json is not a History sidecar; Apply's Undo includes it.
- D3-16: The first freeze of a card with a derived id writes its `id:` (snapshotted).
- D3-17: FZ-12 renames only user-facing text; the tool name `freeze_statements` stays.
- D3-18: Formalize over frozen content shows a warning with "Formalize anyway"; there is no unfreeze-first button.
- D3-19: Only failures caused solely by freezes made since Claude's last tool result go uncounted.
- D3-20: A whole-card freeze stores all 8 fields; the aura shows when every field of the current kind is frozen.
- D3-21: Standing freezes are board-stack steps with no History snapshot ("change no file" read as no model file).
- D3-22: A session freeze action records the whole freeze state before and after; Undo is refused if a restored freeze no longer holds.
- D3-23: Freeze actions and their Undo/Redo work during a step; answering a question or request seals the stack. This revises slice 2's "answering adds no seal".
- D3-24: Keep frozen is enabled only while every requested item is still frozen or held; Continue reports what the store says.
- D3-25: "Unfreeze all other cards" always confirms, with counts.
- D3-26: The frozen colour is rose, drawn as an inner overlay; partly frozen cards get field locks plus a chip.
- D3-27: In a session, standing and own freezes keep their aura and accepted content shows field locks. While a narrow step runs, the board marks what Claude may change, from the question and the visible state.
- D3-28: A field's lock slot only selects; it never toggles the freeze.
- D3-29: Formalize's ▾ switches stay on for the session and reset when it ends.
- D3-30: Freezing a review item freezes its Accept cover at Claude's proposal.
- D3-31: Unfreeze requests travel in RunView; their wording is an accepted residual channel while results are hidden.
- D3-32: Kept freezes go inside Apply's change set; Exit's are one board step afterwards.
- D3-33: Keep ticks default off, one row per frozen target.
- D3-34: A board selection takes precedence over a review-item selection.
- D3-35: In the end confirmation, an Unfreeze that would un-accept is refused.
- D3-36: A premise into frozen Dependencies or a frozen mark is refused when proposed; an older draft's Accept is gated.
- D3-37: Whole-model steps write derived ids at their start; kept freezes get their ids written at Apply.
- D3-38: With the whole model open, propose_arrow may target any unfrozen proposition before the freeze, and intermediates may be arrow sources or targets.
- D3-39: A declaration's position is not part of its frozen value (no `moved` token).
- D3-40: Contracts and protocol live in core sub-slices 3a and 3b, so later sub-slices touch no core file.

**Conflicts between the two designs** are resolved in the §7.1 table (22 topics). The main ones:
- **Starting freezes:** made non-binding, the engine design's choice over the UI design's `start` reason.
- **Freezes during a queue:** a stage problem instead of the engine design's cancel-from-step.
- **Unfreezing accepted content during a step:** the UI design's wait, not the engine design's deferred review.
- **Hidden target proofs:** the UI design's refusal, not freezing the unseen proposal.
- **Allow this change:** dropped from both.

**Could not resolve without building or measuring:**
1. The meaning probe's cost and whether `Repr` stays identical across rebuilds are unmeasured. 3e measures both; if cost exceeds 1.5× the 2b3 probe's, the integrator decides (fallback: probe only the subject's closure).
2. Slice 2 is built only through 2a2: judge, backstop, revert, mask, the view builder and 2g/2h's webview are stubs or absent. The plan targets slice 2's plan contracts, and builders must log mismatches in §8. The webview file names (`run/review/*`, `SessionBar.tsx`, `state/session.ts`, `setBadges`, `undoScope`) depend on what 2g/2h actually build.
3. Freeze-race scenarios 10a and 10b need a test hook in the fake engine to inject a freeze mid-step or mid-gate; 3d must add one, and the plan leaves its design to the builder.
4. The comparator per intermediate assumes 2b3's engine can run a separate comparator per inference with its own permitted set, as it does at the final check. If it cannot, 3e has to extend it.
