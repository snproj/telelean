# refute:intent

Agent `a494b2278ff040c62` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **verdicts:**
  - [1]
    - **id:** FID-1
    - **real:** True
    - **severity:** major
    - **reason:** The finding holds; I lowered it from blocker to major.

Why it holds:
- S1's board shows S2's vocabulary that S1's cards use (core project/subjectGraph.ts, `foreignVocabulary`).
- §2.2's vocab target allows any subject's name (TR-10).
- set-freezes and `EditPlan.freezes` write only the board's own subject's freezes.json (§2.6).
- An S2 session snapshots only S2's file (§2.2, §3.1, §3.3), and S2's `boardFreezesView` gets only S2's records. S2's board therefore shows no lock on the name.
- The only other guard is the `other-subject` rule (§3.5). It compares `heldValue`, which leaves out the docstring (§3.2), and only for S2 declarations that S1 reaches in B.
- With the whole model open (3c1/3e2), S2 vocabulary may change subject only to the frozen and held check. So a gloss frozen on S1's board can be rewritten: every judged state and the backstop pass it. If S1 later stops using the name, its definition can be rewritten too, and the record shows nowhere: it is still found, so A6's `notFound` does not list it.
- §3.1's and D3-41's claim that no other subject's standing freeze can be broken is false here. Earlier rounds did not raise this; it is a gap in F1's fix.

Why not a blocker:
- It needs a freeze of another subject's vocabulary, then a whole-model session on the subject that owns it.
- The preset already keeps declaration text in narrow steps.
- The change still arrives as a visible vocabulary item that needs the person's Accept.
- It still breaks FZ-3's mechanical check and FROZEN 2, so it is major.

Simplest fix, the critic's read-only alternative:
- At session start, also snapshot, from every other subject's freezes.json, the records naming the session subject's declarations, expected at B and not unfreezable in this session.
- Show them on the owning subject's board.
- Correct §3.1 and D3-41.
- Add cheat 24.
  - [2]
    - **id:** FID-2
    - **real:** False
    - **severity:** nit
    - **reason:** D3-44 is a defensible choice, already logged, not a defect.
- It follows the literal text of the user's FROZEN 1: the status is applied "when the user manually edits a field".
- The user's D1 answer made such edits possible on the board again without restricting FROZEN 1.
- FROZEN 3 then makes a freeze made outside a session last until the person unfreezes it.
- The critic's view, that FROZEN 1 meant only transform edits, is a guess about intent, not a contradiction. Round 1 chose that view and R2-12 reversed it.
- §7.2 logs the choice as an AUTOPILOT DECISION, with round 1's reading as the alternative and how to reverse it. The user can flip it later.

On clearing a field:
- TR-5's "clearing makes it fuzzy" and TRANSFORM 4 are rules of the transform window. On the board there is no fuzzy state.
- A frozen emptied field is FZ-2's keep-empty. That is stricter for Claude, not unsafe.

The effects are visible:
- a lock appears at once, and "— kept empty 🔒" on an emptied field;
- the session banner shows "‹k› standing";
- the user guide's Frozen section says how to lift these freezes.

★D3's "easy way" is met as the spec already settles it:
- Open the whole model keeps standing freezes (AP-14 d).
- Unfreeze all other cards lifts them, also during a running step. In a session it is temporary: the keys go into `standingCleared`, and FZ-8 restores them at the end.

At most a nit: D3-44 could name "clearing a field lifts its freeze" as a second alternative.
  - [3]
    - **id:** FID-3
    - **real:** False
    - **severity:** nit
    - **reason:** Neither part of the claim survives.

"No AUTOPILOT DECISION tells the user" is false:
- D2-15 is slice 2's logged AUTOPILOT DECISION: a Shaky step makes no new cards, splits or merges. Its alternative is "allow splits now, without the transform rules".
- D3-14 logs "delete in Shaky steps (DO-3, with D2-15 lifted)" as its alternative.

"No slice ever delivers" depends on reading §3.12's hook line "D2-15 stays" as a rule binding slice 4:
- D2-15's own alternative ties splits to the transform rules.
- TR-7 ("Splitting a Shaky card is always allowed") is in the TRANSFORM section, which ★D8 puts in slice 4.
- The slice-3 brief does not list Shaky splits among what slice 2 deferred to slice 3.

Removal is partly delivered already:
- A Submit step can leave a Shaky proposal out; DO-3's not-identical check passes.
- Whole-model Submit steps keep the switches and rework their own Shaky items "with the tools if needed" (D3-42; 3e2 tests a Shaky Delete reworked with the tools).
- Nothing in D3-14's `delete_card` rules excludes a card declined Shaky.

This is not a safety issue. One nit remains: reword §3.12's line to "D2-15 holds until slice 4, which lifts it with TR-7".
  - [4]
    - **id:** FID-4
    - **real:** True
    - **severity:** minor
    - **reason:** Only part survives, as minor; the claimed regression does not.

Without the probe there are no valueConsts or typeConsts, which come from the same `#eval`. Slice 2 already refuses Apply in that case:
- D2-25 names "a failed probe" and refuses Apply "until a fresh build provides them".
- §4.10's `facts` code fires, because R_stmt (the meaning closure of every card statement) needs typeConsts.
- Since slice 1e, B.2's `source-only` even ends proving steps as `environment` in this mode (runner gate/findings.ts, `unseenProofEnvironment`).
- So "slice 2 could Apply such sessions" is false.
- D3-2 already logs the stricter-than-Appendix-B fallback, with the printed comparison as its alternative.

What survives:
- §2.1 re-runs checkBase "when base-facts.json lacks meaningKey", with no bound. Without the probe, or with a Repr over 2 MB, the base check then runs at every judge, which matters on this RAM-tight machine.
- "reload the window to check the base again" cannot help in either case.
- A declaration whose Repr is over 2 MB is a narrow real regression, unlikely in belief models.

Fix:
- Re-check the base at most once per session, recorded in run.json.
- Make the refusal name the failed probe or the oversized declaration.
- Do not add an Apply path for models without the probe: it would undo D2-25.
