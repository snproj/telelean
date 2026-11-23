# Subagent report: verify:2j2:adv (agent a5db4abb4cc013286, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "verify:2j2:adv", "workflowPhase": "Verify", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "sonnet", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
{
  "summary": "Adversarial review of 2j2 (notes for Claude) found no blocker and no major problem. I traced every (a) to (g) lens candidate through the code and none held. Nothing is accepted without the user's Accept. No hidden Result is named. Unjudged state is not applied. No proof rests on a changed question. Notes are not lost on Undo, Redo or reload. Claude cannot change kinds or arrows. Every note quoted to Claude is the user's own text, because the only code that writes `decline.note` (reducer.ts:524) and `redo.note` (noteItem) takes text the user sent. I found five minor or nit gaps, one of them an untested rule. Carry-over R1-1 is fixed correctly: texts.ts `redoReasonDeclined` now reads \"it depended on something that was declined\", the view test asserts the literal text, and the old text survives only inside plan quotations. I ran the core `notes`, `view` and `protocol.session` tests (98 passed), the webview `store-session` and `review` tests (75 passed) and the runner `prompts` test (21 passed). I did not run the slow runner session tests, and I did not run Playwright or the extension suite.",
  "findings": [
    {
      "id": "ADV-2j2-1",
      "severity": "minor",
      "where": "packages/runner/src/run/session.ts:255 (`decidedSinceSeal` now counts `a.kind === 'note'`), builder decision 9",
      "problem": "A new rule is not tested. A note step counts as a decision since the queue's seal. After a reload with no `judged` and the queue's end not yet reconciled, that blocks the queue-end rules (AF1 'proposed again', D2-17, the force's end). None of the 41 mutations touches this line. `session.notes.test.ts` checks a note surviving a reload, but not the recovery branch (session.ts:2038 and 2043). Dropping the clause would not fail any test, and neither would adding a similar one elsewhere. Deciding either way is defensible, but the choice is unpinned.",
      "evidence": "Mutation list M1 to M41 has no entry for session.ts:255. In `session.notes.test.ts` the reload test (lines 61 to 107) reloads a session whose judge ran. That is not the branch where `now.judged === undefined && now.queueEndReconciled !== q`.",
      "fix": "Add a runner test in `session.reload.test.ts` or `session.notes.test.ts`. Build a session with a queue end that was not reconciled and has no `judged`. Put a `note` step on the stack after the seal. Reload and assert the queue-end rules are not applied (the 'proposed again' item stays as it was). Then run the same fixture with the note step removed and assert they are applied. Or drop the clause if the integrator prefers the notes-are-not-decisions reading."
    },
    {
      "id": "ADV-2j2-2",
      "severity": "minor",
      "where": "packages/core/src/review/view.ts:1465 to 1466 (the report's comment rule), packages/runner/src/run/session.ts:1790 (`openStage`)",
      "problem": "The user's Submit comment is never shown after a failed Submit queue that is then retried. The report shows a comment only when `seal.comment.stage === records.stage - 1`. `openStage` raises the stage only when `from === 'start'` or (`from === 'submit'` and no step failed). A Submit queue with a failed or cancelled step stays at stage S. The Retry queue's seal is `by: 'retry'`, so it never raises the stage either. After a successful Retry the stage is still S and the comment's stage is S, so the comment (given at S) never shows. This also contradicts N3 ('the next stage's report shows your comment') in that flow. The same happens if a Submit with no comment fails at stage 2: it becomes the newest Submit seal and hides stage 1's comment from the report that is still stage 2. The plan's D2-96 only argues the not-shown case for a failed queue still sitting at stage S. It does not address the retried-and-succeeded case.",
      "evidence": "session.ts:1790 `if (from === 'start' || (from === 'submit' && failed === undefined)) s.stage += 1;`. view.ts:1466 `submitSeal.comment.stage === records.stage - 1`. The view test 'the report of the stage after a Submit review …' only covers `at(1,[seal(1,'c')])` (failed, not retried), not a retry seal after the Submit seal.",
      "fix": "Show the comment of the newest Submit seal when either `comment.stage === stage - 1`, or `comment.stage === stage` and every later seal is `by: 'retry'` and the stage has no failed or cancelled step (no `heading` of kind step-failed). Alternatively keep the Submit comment in a session field written when the stage opens. Add a view test with `[submitSeal(1,'c'), retrySeal]` at stage 1 with no failed step (shown) and with a failed step (not shown)."
    },
    {
      "id": "ADV-2j2-3",
      "severity": "minor",
      "where": "packages/webview/src/state/session.ts:697 to 703 (`confirmSubmit`), packages/webview/src/run/review/ItemDetail.tsx RedoNote `save`, session.ts:394 (`decide` closes the menu)",
      "problem": "The text the user typed is dropped before the host answers. `confirmSubmit` sets `submitPanel: null`, and `RedoNote.save` calls `setEditing(null)` when the send succeeded. A refusal or conflict (stage changed, a step started, the item left to-be-redone, a stale rev) then gives only an error toast, and the comment or note is gone. Now that every decline and Submit takes free text, losing it is more costly than when only Shaky took a note. The decline menu has the same pattern (it was Shaky's before 2j2).",
      "evidence": "`confirmSubmit`: `set({ submitPanel: null }); const requestId = track(...); post(...)`. The result handler (session.ts:950 to 983) on a refusal only calls `errorToast(outcome)`. Nothing restores the draft.",
      "fix": "Remember the draft with the request (as `resend` does) and, on `!outcome.ok` other than needs-confirmation, put it back: reopen the Submit panel with the comment, reopen the note editor, and reopen the decline menu with its note. Or keep the panel and editor open until an ok result."
    },
    {
      "id": "ADV-2j2-4",
      "severity": "nit",
      "where": "packages/webview/src/state/session.ts:619 to 626 (`askMeInstead`) and `chooseDeclineOption` (line ~590)",
      "problem": "'Ask me instead' opens the menu with Shaky chosen and the note prefilled with telelean's own text, 'Ask me about: ‹choice›'. Before 2j2 Reject declined at once with no note. Now choosing Reject in that menu keeps the prefilled text in the note box (`{ ...menu, option }`), so telelean's sentence goes to Claude as the user's note on a Reject. The text is visible and editable before the confirm click, so this is a nit rather than a safety hole. 'Ask me about' on a Reject is just odd.",
      "evidence": "`chooseDeclineOption` keeps `note`. The Reject confirm sends `noteOf(menu.note)`.",
      "fix": "When the option changes from Shaky to another one and the note still equals the prefill (`REVIEW_TEXTS.askMeAbout(entry.text)`), clear it. Add a store test."
    },
    {
      "id": "ADV-2j2-5",
      "severity": "nit",
      "where": "packages/runner/src/run/session.ts:232 to 242 (`decisionsSince`), D2-97",
      "problem": "The decisions-since lines quote the notes of every decide or note step on the done stack, without checking that the note still exists. A note step on an item that has since returned to review (the sweep dropped `redo.note`) is still quoted as 'Note for Claude: ‹item›, The person's note: …'. Notes on declines are still quoted after an un-reject, and notes on a Reject of an item that was later set back. The lines are a faithful history and sit beside the 'Back to review' line, so this is not wrong. Claude can still read the note as current.",
      "evidence": "`decisionsSince(s)` reads only `s.stack.done`. The sweep (`dropStaleRedoNotes`) changes `items` but not the stack's `after`.",
      "fix": "Optional. Let `decisionsSince` take `s.items`, and for a note step quote the note only if the item still has `redo.note === a.after`, else write 'The person's note was withdrawn when the item left to be redone.' Or leave it and say so in D2-97."
    }
  ],
  "checks_run": [
    "Read verify_common.md, builder_rules.md and brief 2j2.md.",
    "Rebuilt 2j2-only source diff (c557f06 plus the 2j1 patch against the working tree) in the scratch folder, and read all of it: protocol, reducer, reconcile, records, types, view, texts, runner manager/review/session/prompts/types, extension boardSession, webview state/session, DeclineMenu, ItemDetail, SessionBar, StageReport and model/review.",
    "Traced every rebuild or removal of `redo` across core and runner. Each rebuild keeps the note (keepNote or copyRedo) except reconcile.ts:435, which only touches in-review items. Removal is swept at the end of `decide` and of reconcile. Undo restores the note through `itemStateOf` and `applyItemState`, and `decisionKey` includes it.",
    "Traced the note's gates (hidden, stale rev, status). The hidden check comes before the rev check, so no leak. `undoNote`, the Redo case and the view's `decidesHidden` (a note step on a hidden item is neither undone nor redone, and nothing names it) are covered.",
    "Traced Submit's comment from the store through the protocol, extension, `manager.submit`, `submitNow`, `queue-start` write, seal, `submitFeedback` and prompt. It is dropped when Submit leads to the end confirmation, and the replay after a crash keeps it. The report's stage rule against `openStage`'s stage increments, which led to finding 2.",
    "Checked that every writer of `decline.note` and `redo.note` takes user input only. Checked the REJECTED, SHAKY and TO BE REDONE quoting and the decisions-since lines against the stack.",
    "Judged the tests rule by rule against the builder's 41 mutations. Gap found: `decidedSinceSeal` (finding 1). Gap found: the report's comment after a retried Submit (finding 2).",
    "Ran under capped.sh, one at a time, with --no-cache and TMPDIR in scratch: core `test/review/notes.test.ts`, `view.test.ts` and `protocol.session.test.ts` (3 files, 98 passed); webview `store-session.test.ts` and `review.test.ts` (75 passed); runner `prompts.test.ts` (21 passed).",
    "Not run by me: the runner session tests (real Lean, slow), Playwright, and the extension suite."
  ]
}
````
