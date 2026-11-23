# Subagent report: verify:2j1:adv (agent a09fa0f5e53d7f668, workflow wf_93090c56-47b)

Meta: {"agentType": "workflow-subagent", "isBuiltIn": true, "description": "verify:2j1:adv", "workflowPhase": "Verify", "spawnDepth": 1, "requestShape": "foreground", "requestNonInteractive": true, "model": "sonnet", "pickedEffortModel": "claude-opus-5-5", "inWorkflowRun": true}

Verbatim return value:

````
{
  "summary": "Adversarial pass on 2j1: no safety-rule breach found (no auto-return lands on accepted; hidden Results stay silent in events, cause texts and cascade entries; Back to review is refused for every item to be redone, in both itemGates and backToReview; kinds/arrows untouched; Undo/Redo/reload keep `kind`). I found one real defect in the automatic return (a returning Shaky item wrongly releases its own dependents, leaving an item in review under a declined Shaky dependency) and one misleading dead end (an item un-rejected after its cause came back stays to be redone, with a cause line that says the cause is in review). Both were reproduced in a scratch copy of core; the first fix passes the existing redo, reducer and reveal tests there. Mutation spot checks on 4 reducer conditions (cascadeKind, the `out` check, and the two `listed` filters of the return events) were all killed by the builder's tests. The repository was not touched.",
  "findings": [
    {
      "id": "ADV-1",
      "severity": "major",
      "where": "packages/core/src/review/reducer.ts:680 (`const up = (id) => sources.has(id) || back.has(id)`), used by `down`/`holding`/`kept` at 681-698 and by the final loop at 700-730",
      "problem": "An item that returns to declined Shaky (a Shaky item a Reject cascade took out) is counted as 'up' (holding nothing down) for the items that are to be redone because of it. So its dependents come back to in review although the item they depend on is declined Shaky again. A Shaky decline must keep its dependents to be redone (cascadeShaky, D2-48); `holdsUp` (in review or accepted, in ws/) is bypassed for any id in `back`, whatever status it ends in.",
      "evidence": "Scratch reproduction (core copy in v2j1-adv/p/core; test /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/v2j1-adv/t/adv1.test.ts). Items P, X (depends on P), Y (depends on X). Decline X Shaky, then Reject P. After: P declined, X and Y to be redone, Y.redo = {because:[X,P], reverted:true, kind:'cascade'}. Un-reject P gives {P:'in-review', X:'declined' (shaky kept), Y:'in-review', Y.redo undefined}. Expected: Y stays to be redone, because [X]. Consequences: wrong status, glow and Submit counts; Y is in review under a declined dependency, which only the next queue's RV-3 would catch; Submit stays blocked until the user decides Y. Accept stays refused (RV-5), so nothing is accepted wrongly.",
      "fix": "Count a returner as up only when it ends in review: `const up = (id) => sources.has(id) || (back.has(id) && w.byId.get(id)?.decline?.option !== 'shaky')`. Y then has `down(X)` true (declined, not holdsUp), stays to be redone, and gets because [X], reverted false (the merge brings its content back). In the scratch copy the existing redo, reducer, reveal and view tests pass with this change, and the reproduction gives Y: to-be-redone, because [X], reverted false. Add this test to redo.test.ts: 'a Shaky item that comes back to declined Shaky keeps its own dependents to be redone', with the items and steps above, asserting statuses, Y.redo and an Undo/Redo round trip."
    },
    {
      "id": "ADV-2",
      "severity": "minor",
      "where": "packages/core/src/review/reducer.ts:591 (backToReview, declined case) with releaseReturned:656-730",
      "problem": "An item that was Rejected by the user while it was a cascade casualty keeps its leftover `redo` (decline() keeps `redo` when reverted). If its cause is un-rejected first and the item is un-rejected afterwards, it lands on 'to-be-redone' with because [P]. P is in review and holds up, yet nothing releases it, because the item is only a candidate when reached from a source in the same request. Back to review is refused for it by D2. The cause line then reads 'it depends on P, in review', which is misleading (g), and the user's only ways out are Decline or Undo.",
      "evidence": "Scratch: P, X depends on P. Reject P, Reject X, un-reject P (X stays declined), then un-reject X. Result: X 'to-be-redone', redo {because:[P], reverted:true, kind:'cascade'}, P in review; itemGates review gate = redoneByClaude. The other order (un-reject X, then P) returns X to in review. The builder's D2-78 note covers only the case of an item kept out by a second Reject, not this one. Spec D3 says an item returns when what took it down comes back.",
      "fix": "In `releaseReturned`, also treat an item that this request un-declined into 'to-be-redone' (kind cascade, from `w.unDeclined`) as a candidate when every id in its `because` holds up and nothing else keeps it down. Or, at least, add the one-line behaviour to D2-78 and a test that fixes it. Alternatively, drop a `because` entry that holds up from the leftover `redo` at the un-decline, and say so in the cause line."
    },
    {
      "id": "ADV-3",
      "severity": "nit",
      "where": "packages/webview/src/model/sessionBoard.ts:98 (`proposedOpen`)",
      "problem": "The board still draws an arrow item to be redone as Claude's proposal 'still undecided' (open), while D1 says a to-be-redone item is finished for the review. This is consistent with 'Claude proposes it again', but not with D1's wording, and no test pins either reading.",
      "evidence": "`proposedOpen` returns true for 'in-review' and 'to-be-redone'; 2j1 changed neither the function nor its tests.",
      "fix": "Confirm with the user which they want, or add a comment citing D2-76. Change nothing else without a user decision."
    },
    {
      "id": "TEST-1",
      "severity": "minor",
      "where": "packages/core/test/review/redo.test.ts (the D3 describe)",
      "problem": "The key condition of ADV-1 is untested: no test has an item that comes back as declined Shaky with dependents of its own that are to be redone because of it. The existing Shaky-return test (line 154) has none, so removing the Shaky exemption passes every test. The B-order case (ADV-2) is untested too.",
      "evidence": "My own mutants and probes: the existing tests pass with `up` left as it is, and the fixed `up` also passes them, so nothing distinguishes the two.",
      "fix": "Add the ADV-1 test above, and for ADV-2 a test 'un-reject P, then un-reject X: X comes back in review (or its stuck state is asserted and documented)'."
    }
  ]
}
````
