# Response 23 (final message of turn 23, 2026-11-22 ~19:00 SGT)

Yes, I can see it. Your diagnosis is mostly right, with one correction: "to be redone" is already a real status. What's wrong is how it is counted, and the cause is two autopilot rules I added in slice 2, not your spec. I only read files; nothing has changed.

**What I see in doorclose**
The folder is `~/telelean-demos/doorclose` (with an s). The review state is in telelean's run file, `~/.config/Code/User/globalStorage/telelean.telelean/runs/doorclose-962c1d8e/rmwrlagnlf8b620/run.json`, which I only read.
- Your files are unchanged: two axioms and one proposition, nothing applied yet.
- The session is at stage 1, after 25 decisions:
  - **accepted:** the vocabulary terms `Being`, `Human` and `Mortal`, and the Formalize of "All humans are mortal";
  - **declined Shaky:** the vocabulary term `socrates`;
  - **in review:** the presupposition `Doorclose.Being.exists`, which you set back to review at 18:32;
  - **to be redone, content kept:** the Formalizes of "Socrates is a human" and "Socrates is mortal", both because of the presupposition.
  - The Result stays hidden, as it should, and I didn't look at its verdict.
- At 18:29 you set the presupposition back to review. That sent its accepted dependents back to "in review" with it (RV-5). You then declined it Shaky, and that made them "to be redone". (Strictly, it is a presupposition, a declaration item rather than a statement, but the same rules apply.)
- **Why Submit is closed now:**
  - The presupposition is in review.
  - Even once it's decided, the two Formalizes keep the results hidden, and Submit opens only while the results are shown.
  - The reason appears only as the Submit button's hover text: "The results are not shown yet: decide these statements to be redone (declined as Shaky, Claude redoes them), or show the results, first."
- **To get unstuck today:**
  1. Decide the presupposition.
  2. On each of the two Formalizes, press Back to review, then Decline → Shaky.

  Or press **Show results** in the stage report, which marks the results as seen early.

**Where the statuses are modeled**
- **Core** (pure TypeScript):
  - [types.ts:37](packages/core/src/review/types.ts#L37) defines `ItemStatus = 'in-review' | 'accepted' | 'declined' | 'to-be-redone' | 'withdrawn'`. The decline options are at line 39.
  - Each item record holds `decline` with an optional `note` ([:115](packages/core/src/review/types.ts#L115)) and `redo: { because, reverted }` ([:132](packages/core/src/review/types.ts#L132)). `redo` records the cause and whether the content was taken out.
- **The status tests:** [records.ts:20-29](packages/core/src/review/records.ts#L20-L29).
  - `isUndecided` is the rule that blocks you: an item counts as undecided while it is in review, or to be redone with its content kept.
- **The transitions:** [reducer.ts](packages/core/src/review/reducer.ts).
  - The rules are in its header comment.
  - `cascadeOut` ([:358](packages/core/src/review/reducer.ts#L358)) is Reject's cascade: the dependents become to be redone, with their content taken out.
  - `cascadeShaky` ([:374](packages/core/src/review/reducer.ts#L374)) is Shaky's: the dependents become to be redone, with their content kept.
  - Decline is at [:466](packages/core/src/review/reducer.ts#L466). It keeps the note only for Shaky ([:482](packages/core/src/review/reducer.ts#L482)).
  - Back to review is at [:526](packages/core/src/review/reducer.ts#L526). The per-item button rules are in `itemGates` ([:1342](packages/core/src/review/reducer.ts#L1342)).
- **The reveal rule** is [reveal.ts:36](packages/core/src/review/reveal.ts#L36), and **Submit's gate** is [view.ts:1419-1435](packages/core/src/review/view.ts#L1419-L1435).
- **The UI:**
  - In [ItemDetail.tsx:345-434](packages/webview/src/run/review/ItemDetail.tsx#L345-L434), only "in review" items get Accept and Decline. Every other status gets "‹status› · Back to review".
  - The note box is Shaky-only: [model/review.ts:435](packages/webview/src/model/review.ts#L435).
  - Submit's reason is only a hover title: [SessionBar.tsx:121-130](packages/webview/src/run/SessionBar.tsx#L121-L130).
- **What Claude receives at Submit:** [prompts.ts:359-379](packages/runner/src/run/prompts.ts#L359-L379). Its sections are ACCEPTED, REJECTED, SHAKY (notes quoted) and TO BE REDONE ("It relied on: …").

**Have you misunderstood anything? Only one thing**
- **"To be redone" is already official, and it records why.** No new status is needed. What's missing is that the UI never shows the reason: `redo.because` reaches the webview, but nothing displays it.
- **Your spec is on your side.** RV-3 says of "to be redone": "That status does not block Submit review" ([01_spec_v4.md:546](verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md#L546)).
  - The code keeps this only to the letter: Submit's own check ignores those items.
  - But two of my autopilot rules (AP-24) block Submit anyway:
    - AF4 (D2-61) counts a "to be redone" item whose content is kept as undecided, which keeps the results hidden;
    - D2-64 makes Submit wait for the results.
  - My reason was RV-6: "decided" means accepted or declined, and "to be redone" is neither. I worried you could see the results, set such a statement back to review, and then accept it knowing the proof works.
  - The plan's tests for 2e even check this exact behaviour (`docs/slice2-plan.md:2553`).
- **It happens only when the content is kept.** That means after a Shaky decline, or in two rarer cases: un-reject, and new items at a queue's end that depend on a Shaky one. After a Reject, the dependents' content is taken out. They don't block Submit, and Back to review is already refused for them (D2-60).
- **Back to review on them was intentional**, from RV-3's "You can change any item's status at any time". In practice it is only a detour: back in review, Accept stays refused while what they depend on isn't accepted (RV-5), so it only leads to Decline. It is also exactly the hole AF4 guards. So your two observations fit together.
- **One more gap your history shows.** When you set the presupposition back to review at 18:32, its dependents stayed "to be redone", for a reason that no longer holds.

**What I'd suggest**
1. **Fix "to be redone"** as a follow-up, "2j", before slice 3:
   - It counts as finished: it doesn't hide the results or block Submit.
   - It has no Back to review.
   - When its cause is set back to review or un-rejected, its dependents return to "in review" automatically. Not to "accepted", since RV-5 never accepts as a side effect.
   - The item shows its cause: "↻ to be redone: depends on ‹presupposition›, declined Shaky".
   - Submit's reason becomes visible text.

   This adds no new kind of leak. Items you decline as Shaky already count as decided, Claude may bring them back unchanged, and you can even reopen them after seeing the results. "To be redone" would be stricter than that, since it can't be reopened.

   It changes the meaning-before-proof logic, so it needs the full build-and-verify loop: roughly one sub-slice the size of 2i (≈ 0.7–1 M subagent tokens).
2. **Notes on every decline: agreed.**
   - The record already allows a note on any decline. Only the reducer, the message rules and the menu restrict it to Shaky. That restriction was my autopilot decision D2-13 ("until slice 4"), and its recorded alternative was "one note at Submit", which is your overall comment.
   - **Reject:** a note helps. Claude may not repeat a rejected version, and the note tells it what to change. It would be quoted under REJECTED.
   - **To be redone:** this status isn't your decision, so its note needs a small undoable action of its own. It would be quoted under TO BE REDONE.
   - **Transform:** yes, with the transform window in slice 4.
3. **Overall comment at Submit: small.**
   - It would be quoted at the top of the "Review submitted" turn and kept in the history.
   - One wrinkle: when Submit goes straight to the end confirmation, no Claude step reads it, so I'd hide the box then.
   - 2 and 3 together come to about half a sub-slice (≈ 0.5 M). They could go with 1 in 2j (≈ 1.5 M in all), or into slice 4.
4. **Live Q&A: I'd put it in a later slice, after a short design note for you to approve.**
   - **No effects:** this is enforceable mechanically. It would be a separate Claude call with no tools and no telelean tool server, on a read-only copy. telelean would keep only the answer text, and answers would not reach Claude's later steps unless you copy something into a note.
   - **Meaning before proof:** Claude's step conversation knows whether the proof worked. So while the results are hidden, the Q&A must start fresh and see only what you see. Otherwise, asking has to count as Show results (seen early). That choice is yours.
   - **Cost:** every question is a real Claude request. Building it is about two sub-slices (≈ 2–3 M subagent tokens), plus one paid live check.

Nothing has changed: no files, no run state, no downloads or installs. This turn used only my own loop, with no subagents: about 0.08 M output tokens and 7 M cache reads. It is logged in `verbatim_prompt_log/bundle_23/`. Which of 1–4 do you want, and in which slice?
