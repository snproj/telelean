# Subagent report: verify:2j1:fc (agent a9c0c25f9d1a8f072, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "verify:2j1:fc", "workflowPhase": "Verify", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "sonnet", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
{
  "summary": "2j1 follows the user's D1–D7 closely. I found one real correctness bug in the automatic return and a few stale old-rule sentences in the plan. Every typecheck and unit-test run I did passes (core, webview, extension, and the two runner files the change touches); I did not run Playwright or the real-Lean e2e tests.\n\nThe bug (major): a returning item that keeps a Shaky decline is treated as having stopped holding down its own dependents. Probe: Y depends on D, D depends on V. Decline D as Shaky, then Reject V, then un-reject V. D correctly comes back to declined Shaky, but Y comes back to in review while D is still declined Shaky. D3 says an item returns only when nothing else keeps it down. I confirmed a fix on a scratch copy (see the finding).\n\nFidelity to the DESIGN, item by item:\n- D1: `isUndecided` is now \"in review\" only. The reveal, the force ending in the reducer and in reconcile, ADV-1's `decided` force, and Submit's gate all follow. `submitResultsHidden` is gone, and the hidden-results branch is kept only as a fail-closed guard.\n- D2: refused in both `backToReview` and `itemGates` with the new `redoneByClaude` text. Accept stays refused and Decline stays open. The webview footer shows the cause lines and the sentence, with no link and no Decline button.\n- D3: the return is transitive and writes no new files. Un-reject brings back the content as before, and Undo and Redo go through the touched-record stack. Two causes, DO-0's `question` kind, the non-cascade kinds, silence for hidden Results, and the force ending again all behave as the brief says. Apart from the bug above, the same-request guard (D2-87) and the greatest-fixpoint logic look sound.\n- D4, D5, D6, D7: the cause is built in core (`redo.why`) and shown in the detail and as the row tooltip. Submit's reason is text in the session bar. D2-76 is in §7.2 with the amended RV-3. Old sessions load unchanged: the `kind` field is additive and there is no validator.\n\nSafety properties: nothing is accepted by a side effect, no state is applied that no check judged, and `kind` is part of the decision key so Undo records every change. I found no violation of the other safety rules.",
  "findings": [
    {
      "id": "F1",
      "severity": "major",
      "where": "packages/core/src/review/reducer.ts, releaseReturned, `const up = (id: string) => sources.has(id) || back.has(id);` (about line 379)",
      "problem": "A returning item that keeps a Shaky decline (it goes back to declined Shaky) counts as \"up\", so the items that rest on it are released too. It still holds them down, because a Shaky decline makes its dependents to be redone. The dependent comes back to in review while its dependency is still declined Shaky, which breaks D3's \"nothing else keeps the item to be redone\". Reconcile's RV-3 only handles new or updated items, so nothing repairs it afterwards.",
      "evidence": "Scratch test: items V (vocabulary), D (declaration, depends on V), Y (declaration, depends on D). Decline D as Shaky, which makes Y to be redone with because [D]. Reject V, which gives D to-be-redone and reverted with its Shaky decline kept, and Y reverted with because [D, V]. Un-reject V. Result: D is declined (Shaky) and Y is in-review with no `redo`. Y should stay to be redone because of D. Before 2j1, D2-60 left Y out in this order. No test in redo.test.ts or reducer.test.ts covers a dependent of a returning Shaky item.",
      "fix": "Make a returning item that keeps a Shaky decline not count as up for others: `const up = (id) => sources.has(id) || (back.has(id) && (w.byId.get(id) as ItemRecord).decline?.option !== 'shaky');`. Then `down` and `holding` keep Y, and Y's `because` keeps D. I applied this to a scratch copy under .../scratchpad/v2j1-fc/pk/core2; the probe then leaves Y to be redone with because [D], and redo.test.ts (25) and reducer.test.ts (67) still pass there. Add a test for the case: a Shaky item returned by an un-reject, and its dependent, which must stay to be redone."
    },
    {
      "id": "F2",
      "severity": "minor",
      "where": "docs/slice2-plan.md §6.1: 2a2's list (about lines 2419–2420, 2434), 2c2's list (about line 2493), and §1.1's 2a2 entry (about line 114)",
      "problem": "Old-rule sentences are left untagged. Line 2420 says a statement to be redone with its content kept keeps the results hidden (AF4). Line 2434 says to be redone → in review is allowed when not reverted. Line 2493 says a statement to be redone keeps the results hidden, with Submit's gate text. Line 114 says `resultsState` handles the undecided items to be redone (AF4). Only the 2e test (line ~2585) was marked superseded. A later builder reading those lists could implement the old rule.",
      "fix": "Append \"(superseded by 2j1, D2-76)\" to each of those sentences, as was done for the 2e test."
    },
    {
      "id": "F3",
      "severity": "nit",
      "where": "docs/slice2-plan.md §6.1 2j1 entry, the D7 bullet",
      "problem": "It says the old session's items to be redone have \"their cause back in review\". The runner test (session.reload.test.ts, D7) builds the case with the cause accepted since, which is also what the user's demo sessions look like.",
      "fix": "Reword to \"their cause no longer declined (accepted or back in review)\"."
    },
    {
      "id": "F4",
      "severity": "nit",
      "where": "packages/core/src/review/view.ts, `redoReason` (judge branch), and the cause list of `cascadeShaky`",
      "problem": "A judge-kind item that also gets a Shaky cause added to `because` (D2-80) reads \"something it depends on no longer builds or passes its checks\" in its detail and tooltip. That is inaccurate when the listed cause is a Shaky decline.",
      "fix": "Low impact. If wanted, name the listed causes of `kind: 'judge'` records that are declined or Shaky with a `redoDependsOn` line before the judge's reason."
    }
  ]
}
````
