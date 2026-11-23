# Subagent report: verify:2j2:fc (agent ae07b03bffc2463ed, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "verify:2j2:fc", "workflowPhase": "Verify", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "sonnet", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
{
  "summary": "2j2 is faithful to the user's N1–N5 design and to the plan, and the diff has no blocking, major or correctness defects. I found only minor and nit issues. R1-1 is fixed and tested. Every one of the builder's verification claims reproduced when I ran it (summary lines in checks_run). I did not run Playwright, as instructed. I read the full 2j2-only diff and checked the safety properties below, and found no violation of any.\n\n- **Note kept for every option.** The note is kept by the reducer for every decline option, and the protocol allows it with any decline. `copyDecision` carries it, so Undo and Redo restore it.\n- **Note on an item to be redone (`redo.note`).**\n  - Every rule that rebuilds `redo` while the item stays to be redone keeps it: the reducer's cascades, the judge's take-out, Submit's take-out and the premise re-checks.\n  - The sweep drops it only when the item leaves that status, and it runs before the effects are recorded, so Undo restores it.\n  - The three other `redo = {…}` sites are on items that are not yet to be redone, so they have no note to keep.\n- **No result leaks.** A hidden Result's row is neutral and carries no `redo` or note, and the `note` action and its Undo and Redo refuse a hidden item. A note step on an item hidden now gets no Undo or Redo label.\n- **Rev is only the content version.** It changes only in reconcile, so a note step's rev check works as a stale-view guard.\n- **Records-only write.** The note action writes no ws/ change and starts no judge.\n- **Comment on Submit.**\n  - It is kept on the seal as `{text, stage}` and in the `queue-start` write.\n  - The crash replay reads `write.comment`.\n  - The report shows it only when the seal's stage is one below the current stage.\n  - A Submit that leads to the end confirmation drops it, and the panel never opens there.\n- **Feedback turn and decisions-since lines.** The comment line sits right after the first line. REJECTED, SHAKY and TO BE REDONE quote their notes, and the decisions-since lines quote declines' and note steps' notes. The golden file is unchanged and passes.\n- **Old sessions.** All new fields are optional and there is no version bump. The N5 test loads an old run.json.\n- **Plan and user guide.** No sentence states the old Shaky-only rule except D2-13, which is historical. The §6.1 tests exist and test what they claim, apart from one weak assertion (F2).",
  "findings": [
    {
      "id": "F1",
      "severity": "minor",
      "where": "packages/webview/src/board/runAction.ts:45 (the board's right-click 'decline-item'); docs/user-guide.md 10.11; plan D2-94",
      "problem": "Right-clicking an arrow item on the board and choosing Decline calls declineItem(item,'plain') and declines at once, with no Note for Claude box. N1 says every decline, including an arrow item's single Decline, takes an optional note in the decline menu. D2-94 and the user guide document only the list's D key as the no-note shortcut. The board path is not mentioned, so the one-click bypass is wider than recorded.",
      "fix": "Either have the board's arrow decline open the arrow-only decline menu, which now opens with Decline already chosen. Or record the board's right-click arrow Decline next to the D key in D2-94, plan 5.5 and user-guide 10.11, so the bypass is a documented choice."
    },
    {
      "id": "F2",
      "severity": "minor",
      "where": "packages/runner/test/run/session.notes.test.ts, first test, last assertion (about line 112), and the 'judging' assertion",
      "problem": "The last assertion, `record(b, RESULT).status === 'to-be-redone' || record(b, RESULT).redo?.note === undefined`, is almost a tautology. It would pass if the note survived while the item was left to be redone, and it does not prove the note went when the item came back into review. `expect(session().judging).toBe(false)` is also a weak check that no judge was queued.",
      "fix": "After `settled(b)`, assert the real outcome. If the Result is in review, check `redo` is undefined. If it is still to be redone, check the note is the one sent. Check for a queued judge by reading the stack or head instead of the `judging` flag."
    },
    {
      "id": "F3",
      "severity": "minor",
      "where": "packages/runner/test (none); packages/runner/src/run/session.ts finishQueueStart (about line 1493) and its replay (about line 1990)",
      "problem": "D2-96 says the comment is kept in the `queue-start` write so that a replay after a crash seals it the same. The code does that, because the replay passes the persisted write to `finishQueueStart`. No test crashes mid-queue-start and checks the replayed seal still carries the comment. The §6.1 'reload mid-way' edge case is covered only for the note step, not for the comment.",
      "fix": "Add a runner test, or extend an existing in-flight queue-start recovery test in session.reload.test.ts, that submits with a comment, interrupts after step 1 of the write, recovers, and asserts the seal holds `comment: {text, stage}`."
    },
    {
      "id": "F4",
      "severity": "minor",
      "where": "packages/runner/test/run/fixtures/sessions/submit-feedback-turn.txt and session.submit.test.ts",
      "problem": "The brief says to update the golden files for the new turn format. The golden scenario has only a Shaky note, so the new lines are not pinned exactly: the overall-comment line, REJECTED's note, TO BE REDONE's note and a Shaky item to be redone with both notes. They are checked only with toContain or startsWith in session.notes.test.ts and prompts.test.ts, which would miss a stray blank line or reordering between sections.",
      "fix": "Add a second golden file, or extend the existing scenario, with a comment, a rejected arrow with a note, and a to-be-redone item with a note, and compare the whole text."
    },
    {
      "id": "F5",
      "severity": "nit",
      "where": "docs/slice2-plan.md 2.8 and D2-92 N4 and D2-97 versus packages/runner/src/run/prompts.ts quoted()",
      "problem": "The plan and the brief show the notes in curly quotes, 'The person's overall comment: “…”' and 'The person's note: “…”'. The code, the golden file and every new test use straight quotes, following SHAKY's existing quoting. Straight quotes are right for consistency, but a later builder following the plan text would produce a different format.",
      "fix": "State in §2.8 and D2-97 that the notes are quoted with straight quotes, as SHAKY always was, and fix the examples."
    },
    {
      "id": "F6",
      "severity": "nit",
      "where": "packages/webview/src/state/session.ts confirmSubmit (about line 700)",
      "problem": "confirmSubmit sets submitPanel to null before the host answers. If the host refuses the Submit (a stale stage, a conflict), the comment the person typed is lost and they must retype it. The decline menu behaves the same way, so it matches existing practice.",
      "fix": "Optional: keep the typed comment in the panel until the answer is ok, and close it on success only."
    },
    {
      "id": "F7",
      "severity": "nit",
      "where": "docs/slice2-plan.md D2-13 (line 2833) and docs/user-guide.md line 316",
      "problem": "D2-13 still reads as the current rule, with no pointer to D2-92 superseding it. Separately, the user guide's 'You can still decline it' for an item to be redone, left over from 2j1 and not changed by 2j2, contradicts the plan's footer description (5.6: 'no Decline button').",
      "fix": "Append '(superseded by D2-92, 2j2)' to D2-13. Check whether a to-be-redone item can still be declined, and make the guide and the plan agree."
    }
  ]
}
````
