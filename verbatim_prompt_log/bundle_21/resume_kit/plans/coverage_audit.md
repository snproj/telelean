# Spec v4.1 coverage audit

2026-11-19. A read-only audit of the spec (`verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md`) against the code and the slice plans. It is built from the mappers' rows (873) and the gap check's verdicts (17). Nothing was built, tested or changed.

Where things stand: slice 1 is done (docs/slice1-plan.md §8). Slice 2 is being built (docs/slice2-plan.md; its §8 change log reaches 2b1a). The slice-3 plan is under review, and slices 4 and 5 are not planned yet. So rows marked "planned" can still move.

**How to read the statuses**
- `built`: in the code now.
- `planned-2`: in docs/slice2-plan.md.
- `planned-3`: in the slice-3 plan.
- `slice-4`: belongs to the transform window, not yet planned.
- `slice-5`: belongs to references, not yet planned.
- `narrowed`: covered, but in a narrower form set by a logged decision.
- `contradicted`: built or planned differently from the spec, with no decision logged.
- `unassigned`: in no slice and no decision.
- `out-of-scope`: not a v4 obligation.
- **Gn** marks real gap n (section 2).

**Abbreviations**
- plan1 = docs/slice1-plan.md; plan2 = docs/slice2-plan.md; plan3 = /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/plans/slice3-plan.md.
- "plan1 §8 1e" means the slice-1 change log, sub-slice 1e (builder or fixer pass).
- core/, runner/, webview/ and extension/ stand for packages/‹name›/src/.
- AP-n entries are in 02_autopilot_decisions.md. D2-n and D3-n are the plans' decisions. ★Dn are your decisions in spec Part 2.

## 1. Summary

The mappers produced 873 rows. Several mappers mapped the same Appendix A edge cases, so those 82 rows were merged into 39 lines. That leaves **830 requirements**. The gap check reclassified two unassigned rows. §14 item 2 bullet 4 ("named in report") turned out to be covered by built code. S20 ("future work") is M3 work, not a v4 obligation.

**Headline.** Of the 830 requirements:
- 297 (36 %) are built.
- 383 (46 %) are planned in slices 2 and 3.
- 88 (11 %) wait for slices 4 and 5.
- 46 (6 %) are covered in a narrower form by logged decisions.

The other 16 are 15 real-gap rows and the one out-of-scope row. The 15 rows are **13 distinct issues**: 2 for slice 2, 6 for slice 3, and 5 that need a decision logged.

### Counts per status

| Status | Requirements | Share |
|---|---:|---:|
| built | 297 | 35.8 % |
| planned-2 | 231 | 27.8 % |
| planned-3 | 152 | 18.3 % |
| slice-4 | 73 | 8.8 % |
| slice-5 | 15 | 1.8 % |
| narrowed | 46 | 5.5 % |
| contradicted | 11 | 1.3 % |
| unassigned | 4 | 0.5 % |
| out-of-scope | 1 | 0.1 % |
| **total** | **830** | |

The same counts for the 873 raw rows, before the merge and the reclassification:

| built | planned-slice2 | planned-slice3 | for-slice4 | for-slice5 | narrowed-by-decision | contradicted | unassigned |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 317 | 240 | 165 | 73 | 15 | 46 | 11 | 6 |

### Counts per spec section

| Spec section | Reqs | built | planned-2 | planned-3 | slice-4 | slice-5 | narrowed | contradicted | unassigned | out-of-scope |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| §1 Terms | 26 | 12 | 8 | 3 | 2 | 1 | – | – | – | – |
| §2 Cards and fields (CF) | 41 | 23 | 2 | 10 | 3 | 1 | 1 | – | 1 | – |
| §3 The board (BD) | 63 | 57 | 2 | 2 | – | – | – | 2 | – | – |
| §4 Arrows and dependencies (AR) | 50 | 38 | 7 | 2 | – | – | 1 | 1 | 1 | – |
| §5 FROZEN (FZ) | 84 | – | 2 | 63 | 4 | 1 | 14 | – | – | – |
| §6 Selection and the Context Menu (CM) | 49 | 31 | 5 | 7 | 2 | 1 | – | 3 | – | – |
| §7 Edit sessions (ES) | 69 | 22 | 24 | 11 | 7 | – | 4 | 1 | – | – |
| §8 Transform (TR) | 45 | 4 | – | 1 | 38 | – | 2 | – | – | – |
| §9 Review stage (RV) | 111 | 2 | 76 | 15 | 5 | – | 13 | – | – | – |
| §10 Decline options (DO) | 18 | – | 13 | 2 | 1 | – | 2 | – | – | – |
| §11 Ending a session (EN) | 17 | 1 | 11 | 3 | 1 | – | 1 | – | – | – |
| §12 Undo and redo (UN) | 35 | 7 | 18 | 6 | 2 | – | 2 | – | – | – |
| §13 Reference system (RF) | 10 | – | – | – | – | 10 | – | – | – | – |
| §14 Guarantees | 36 | 19 | 9 | 1 | 1 | – | 3 | 2 | 1 | – |
| Part 3 Safety issues (S1–S22) | 69 | 26 | 25 | 11 | 4 | 1 | – | – | 1 | 1 |
| Appendix A Edge cases (A1–A29, merged) | 39 | 22 | 6 | 10 | – | – | – | 1 | – | – |
| Appendix B Checks | 68 | 33 | 23 | 5 | 3 | – | 3 | 1 | – | – |
| **Total** | **830** | **297** | **231** | **152** | **73** | **15** | **46** | **11** | **4** | **1** |

How the slices split:
- Slice 2 is the bulk of §9 Review, §10 Decline options, §11 Ending and §12 Undo.
- Slice 3 is almost all of §5 FROZEN.
- Slice 4 is §8 Transform plus 35 transform hooks elsewhere.
- Slice 5 is §13 References plus 5 hooks elsewhere.

## 2. Real gaps

The gap check confirmed 15 of the 17 candidate rows (11 contradicted, 4 unassigned) as real gaps. They come to 13 issues, ordered by where they must go next: slice 2 (being built), slice 3 (plan under review), then decisions to log.

| Gap | Clause(s) | Requirement | Recommended slice | Why, and the fix |
|---|---|---|---|---|
| **G1** | §14 item 2 bullet 1 (History provenance), unassigned | History records where the arrows you accepted from Claude came from. | **Slice 2 (2f)** | After Apply, nothing durable says that an arrow came from Claude. Apply's history entry has only a label (D2-67). AttemptRecord.premises holds the question, not E(T) (core/run.ts:590-612). The ledger lives in run.json, which pruneRunDirs deletes once keepRuns newer runs exist (runner/shadow/index.ts:231-244). Slice 2 is the first slice that writes Claude's arrows into your files, and 2f is not built yet. **Fix in 2f:** Apply records each accepted Add arrow and each Add premise's arrow, with its run and step. That can be an optional arrows field on the attempt records written at the end (D2-11), or the history entry. Slice 3's Remove arrow extends it later. |
| **G2** | §14 item 9 (apply), contradicted. Also AR-3 bullet 3 (blocks Apply: "only implied"; blocks Formalize: scope) | A cycle you wrote by hand blocks Formalize and Apply, naming the cycle. | **Slice 2 (a plan fix, before 2b2)** | The start check refuses only cycles through the question's own cards (core/formalize.ts:108-114, 141; webview/board/contextActions.ts:89). plan2 §4.9 B.3 and §4.10 never count a cycle already in B, and §4.12 check 6 states no scope. So a session can start, and Apply can go ahead, over a TL015 cycle elsewhere in the subject. Apply cannot sensibly refuse mid-session: the base is fixed and the board locked, so only Exit would get past it. **Fix:** state check 6 as "any cycle of drawn and solid arrows in the session's subject blocks Formalize, naming it". formalizeStartProblems (core/review/formalize.ts) is still a stub. Then "a cycle already in B is never counted" stays correct. *(Alternative: log the question-only scope as an AP decision.)* |
| **G3** | CM-3 sentence 1 (freeze actions), contradicted in plan3 | An action that fits only some of the selected items is shown disabled, with the reason on hover. | **Slice 3 (fix the plan now)** | plan3 §4.3 enables the four freeze actions whenever anything selected is freezable. It freezes that part and returns the rest as `left` (§2.9 FreezePlan.left; §2.4 freeze.left), and §4 never says how `left` reaches you. Only D3-6 and D3-30/R2-11 log partial cases. So a provisional card or an unaccepted draft (D3-45) in the selection is skipped silently, and you may believe it is frozen. **Fix:** outside the D3-6 and D3-30 cases, disable the action with left's reasons on hover. *(Or log a D3 decision for partial freezing, requiring the result, a toast or a dialog, to name every left item and why.)* |
| **G4** | ES-9 bullet 5 (card-only Delete), contradicted, and S9 fix (card-only Delete gone), unassigned | Today's "Delete card only, keep Lean" goes. It leaves `axiom ….holds` behind as an unmarked axiom, a hidden belief, and S9 is a safety fix. | **Slice 3 (3b and 3f)** | It is still offered end to end: webview/dialogs/Dialogs.tsx:187, 227, 280; core/edit/planDelete.ts:23-35 (keepLean); core/actions.ts:62; core/protocol.ts:145, 674. docs/user-guide.md:122 documents it. No plan removes it (plan2's 2h retirement list does not), and no decision keeps it. 3b already changes delete-node (A6), and 3f already edits Dialogs.tsx. **Fix:** remove the button and its warning, make delete-node always remove the Lean (refuse or drop keepLean), and update the guide. "Delete anyway" stays (ES-9, TR-13). S9's other half, handling dependents, is TR-13 in slice 4. |
| **G5** | CF-6 (your edit makes it yours), unassigned | When you edit a sentence Claude wrote, it becomes yours, and its Claude mark (italic) goes. | **Slice 3 (3b); slice 4 for the window** | planEditNode (core/edit/planAction.ts:85-124) sets only the edited field and never touches worded_by. So an "I hold this" or Add premise sentence (worded_by: agent, core/gate/adoption.ts:133) stays italic as Claude's (webview/board/NodeCard.tsx:168), and unendorsed (core/project/build.ts:765), after you rewrite it. No decision records this. docs/user-guide.md:304 already claims the mark goes, and plan3 §3.10 covers only the converse. **Fix in 3b,** which already changes edit-node for D3-44: an edit of the sentence on a worded_by: agent block also writes worded_by: user (or drops the line), in the same plan and Undo step. Slice 4 must do the same for a sentence typed in the window. |
| **G6** | AR-7 bullet 4 (naming frozen arrows), unassigned | Before a proposition moves to AXIOMS, the drop zone names the frozen arrows that will be removed. | **Slice 3 (3f and 3b)** | plan3 never mentions the drop zone, Move to axioms or kindChangeImpact, and the built text gives only a count: "Its N incoming arrows are removed." (core/kindChange.ts:139-144). **Fix in 3f:** the drop zone and the Move to axioms dialog name the incoming arrows that will be removed and mark the frozen ones from graph.freezes. Only standing freezes apply, since ES-9 forbids P→A in a session. **Related, for 3b:** plan3 §2.6 (A6) drops freeze records only on delete-node and remove-arrows. A change-kind P→A, and an add-arrows that replaces a frozen mark (A22), should also drop the records of what they remove. Otherwise those records linger under "Frozen items not found" and silently re-freeze an arrow drawn again later. Slice 4's TR-11 must show the same impact. |
| **G7** | BD-7 bullet 6 (definitions chip), contradicted | When the proof also relies on definitions or presuppositions, the band carries a chip naming them. | **Slice 3 (3f)** | webview/board/band.ts:98-104 puts "also by definition: …" and "also presupposes: …" in the band's tooltip, as plan1 §4 chose (unlogged). It takes definitions from node.lean.uses, the target's own statement closure (core/project/build.ts:486-509), not from what the inference relies on. So it misses S5's InGame case, where only the premise mentions InGame. Presuppositions are right, since they come from the footprint. **Fix in 3f,** which already adds EdgeEngine badges: draw a chip on the band. Take definitions from the statement closures of v and of every card in direct(v), plus what the proof's own non-card lemmas reach (plan2's review/closure.ts reach in "uses" mode, stopping at cards' .holds). Slice 2's stage report and Result reuse bandsOf (plan2 §5.4), so they gain it too. *(If the tooltip stays, log that, but still widen the source.)* |
| **G8** | CM-7 bullet 4b, contradicted | Everywhere except over text fields and selected text, telelean's menu replaces VS Code's default webview menu. | **Slice 3 (3f)** | The contextmenu listener sits on the board element only (webview/board/BoardInput.ts:668-686, 791), and builder 1c1 left the Vocabulary/Definitions band with VS Code's menu, unlogged. plan3 §4.2 adds menus on vocabulary items only. So the band's background, headers, collapsed line and divider still open Cut/Copy/Paste. **Fix in 3f,** which already edits BoardInput.ts and adds the band's item menus: extend the suppression to the band, keeping VS Code's menu over text. *(If no telelean menu is wanted on the band's background, log a one-line decision instead.)* |
| **G9** | BD-3 Placement (A\|P box card not stored) and B.7 writers, contradicted (2 rows) | Positions are written only by moves and Tidy layout. A card from the A\|P box is placed without storing its position. | **Decision (an AP entry)** | add-node stores the position with the add, in its own Undo step (core/edit/planAction.ts:72-80; plan1 §2.4, builder and fixer 1c1). Kind changes and deletes also write layout.json, by dropping a stored position. The spec contradicts itself here. BD-8 ("next to the selected card") and CM-7 ("at the clicked point") cannot survive a reopen unless the position is stored, so storing is right. **Log:** a proposition added from the A\|P box or "New proposition here" stores its position with the add, in one Undo step. Opening a board still writes nothing, and kind changes and deletes drop a stored position. The same entry should correct AP-19 ("stored only when you move a card") and docs/user-guide.md:66. |
| **G10** | AR-6 bullet 1 (next to its source), contradicted | An axiom that an arrow (or the mark) makes a proposition moves next to its new source. | **Decision (an AP entry), or a small fix joined to G9** | core/edit/planArrows.ts:126-130 appends it last in the propositions' order and drops its stored position. The layered placement (webview/board/canvas/placement.ts:103-140) then puts it one layer right of its sources, below every other unplaced card of that layer, so it can land far from its source. "Next to its new source" is the spec's own elaboration: T21 ¶11 says only "transferred to the canvas". The generic rule keeps sources left of targets, and no slice 2–5 touches placement. **Log it.** *(Alternative: the board sends a position beside the source with add-arrows or set-from-nothing on an axiom, stored in the same plan, folded into G9's decision.)* |
| **G11** | A19 (an old axiom's arrows shown), contradicted | An old axiom block with premises: stays an axiom. Its arrows show as "declared before v4" and cannot be selected. | **Decision (an AP entry), plus a cheap fix** | core/project/subjectGraph.ts:64-66 drops every declared edge into an AXIOM card, so the arrows are not drawn at all (TL122, core/project/build.ts:56). The only trace is the card chip, whose tooltip gives just a count (webview/model/cardData.ts:210-217). So you choose "Make it a proposition (pending)" or "Drop these arrows" without seeing which cards are involved. This was a builder 1b choice, not a decision. It is an old-files edge case, BD-5 has no look for arrows into an axiom, and no later slice touches it. **Log it,** and name the sources in the chip's tooltip or the details row. |
| **G12** | CM-3 sentence 1 (built menus), contradicted | An action that fits only some of the selected items is shown disabled, with the reason on hover. | **Decision (an AP entry); 3f applies the same rule to the freeze actions (G3)** | webview/board/contextActions.ts disables card actions only when several cards are selected (228-236). Beside selected arrows or marks, one card's actions stay enabled (223-226), and Formalize ignores selected cards (78-97; plan1 §5, builder 1e); plan2 §5.11 keeps this. CM-3 is a rule the spec's author added, and the risk is low: the summary shows every selected item, and Formalize's tooltip names its exact question. The literal rule would disable Formalize whenever a selection rectangle also takes cards, and CM-7 itself keeps a card's actions beside a multi-card selection. **Log:** an action applies to the part of a mixed selection it fits and says so in its label or tooltip (Delete follows AR-1). |
| **G13** | §14 item 2 bullet 4 (signature), contradicted | The signature is every non-Prop axiom no card owns, including your own shape-breaking ones and those in the library root. | **Decision (an AP entry): keep the code** | core/gate/permitted.ts:35-47 (signatureAxioms) keeps library-root axioms. It excludes subject-module axioms of vocabulary kind `other` (for example `axiom weird : Empty`), so a Claude proof that uses one is refused (footprint). This was an M2 fixer choice, reused unchanged by plan2 §4.8, and never logged for v4. It fails closed, since such an axiom proves anything through Empty.elim, so keep it and log it. **To reverse:** add `other` to SIGNATURE_KINDS for subject modules. The board and report would then name such axioms as `axiom:` entries with TL103. |

**Checked, and not gaps (2)**
- §14 item 2 bullet 4 ("named in report") is covered, now `built`. core/project/build.ts:607-634 marks every such footprint axiom as an `axiom:‹name›` entry with TL103, and the report's Rests on names each one (webview/run/ReportCard.tsx:95-98; CardDetails.tsx:206). The band and the chip add "hidden assumption" (band.ts:89; model/cardData.ts:276). Library-root declarations are never vocabulary, so they are named, not permitted silently. *Reminder for slice 2:* InferenceJudgement.restsOn (core/review/types.ts:378, due in 2b1b) should keep this footprint convention (card ids, `presup:`, `axiom:`), so that the Result's Rests on names them too.
- S20 ("future work"), now `out-of-scope`. The model finder is M3 work. v4's fix for now, saying "consistency unchecked", is built (band.ts:46; core/run.ts:446) and planned (plan2 §5.4).

## 3. Contradictions

All 11 contradicted rows (10 issues) are real gaps above. Each is built, or planned, differently from the spec, and none has a decision logged.

| Clause | The spec says | What is built or planned instead | Gap |
|---|---|---|---|
| BD-3 Placement (A\|P box) and B.7 writers | Only moves and Tidy layout write positions. | add-node stores the position of a card from the A\|P box, in the add's own Undo step. Kind changes and deletes drop stored positions. | G9 (decision) |
| BD-7 bullet 6 | A chip on the band names the definitions and presuppositions the proof relies on. | Tooltip lines only. Definitions come from the target's own statement closure. | G7 (slice 3) |
| AR-6 bullet 1 | The new proposition moves next to its new source. | Its position is dropped, and the generic layered placement puts it. | G10 (decision) |
| A19 (an old axiom's arrows) | The arrows are shown as "declared before v4" and cannot be selected. | They are not drawn. Only a chip shows, with a count. One mapper marked the combined clause built; the gap check confirms the arrows are not drawn. | G11 (decision) |
| CM-3 sentence 1 (built menus) | An action that fits only part of the selection is disabled, with the reason. | Such actions act on the part they fit: Formalize ignores selected cards, and one card's actions stay enabled beside selected arrows. | G12 (decision) |
| CM-3 sentence 1 (freeze actions, plan3) | The same rule. | Only the freezable part is frozen; the rest is returned as `left` and never shown. | G3 (slice 3 plan) |
| CM-7 bullet 4b | telelean's menu everywhere except over text. | The Vocabulary/Definitions band keeps VS Code's menu. | G8 (slice 3) |
| ES-9 bullet 5 (also S9) | The card-only Delete goes. | It is still offered end to end. | G4 (slice 3) |
| §14 item 2 bullet 4 (signature) | The signature includes your own shape-breaking non-Prop axioms. | Subject-module axioms of kind `other` are excluded (stricter, fails closed). | G13 (decision) |
| §14 item 9 (apply) | Apply is refused over a cycle; AR-3 says any hand-written cycle blocks Formalize and Apply. | The start check covers only cycles through the question, and a cycle already in B is never counted. | G2 (slice 2) |

**Smaller departures in the mappers' notes.** These were not escalated, and no gap verdict was asked for them.
- CM-1 c: on a board with no cards, the section shows the first-step hint instead of "Select some items to see possible actions here." Small and unlogged.
- BD-7 bullet 3: the band's ✓ is stricter than the spec. It also needs an elaborated direct(v), nothing unseen, no TL114, and the whole band drawn. This fails safe.
- CM-7 bullet 1: a press that ever moved 4 px stays a drag even if it comes back. Slightly stricter than the spec.
- BD-3 automatic placement: fixer 1c1 accepted that, in the Proposed view, a changed card that grows may touch the next card.
- AR-7 bullet 4: the drop zone gives the removed arrows only as a count. G6 covers this.
- FZ-10 bullet 2: plan3 §3.6 offers only one version for some item kinds. Add, Add arrow, Proof broken and new vocabulary offer only the proposal; Delete and Remove arrow offer only yours. This is not logged as a decision.
- FZ-4 para 3b: the Result lists every card whose basis changes but does not mark which of them are frozen, and slice 3 adds nothing for that.
- AR-5 bullet 6: plan3's D3-38 (with the whole model open, Claude may add arrows into any unfrozen proposition) does not say whether cards whose question is their mark are excluded.
- A25: plan3 does not spell out the dependent target's "‹card› was not proved" report.
- A2, A23: plan3 does not cite them, though it commits to their mechanism. A2 relies on Claude asking, with the 3-attempt cap to stop retries.
- RF-2 (b): card ids are sentence slugs (core/markup/ids.ts slugOf), so a deleted card's id comes back for a new card with the same sentence. Slice 3 keys standing freezes by card id (D3-16), so a hand-deleted card's freeze record could attach to that new card. This bites in slice 3, before slice 5.
- Docs out of step: docs/user-guide.md:66 (G9), :122 (G4) and :304 (G5), and AP-19's wording (G9).

## 4. Requirements narrowed by decisions

All 46 `narrowed` rows, grouped by decision, so you can review them in one place. Reversing a decision restores the clauses in its row.

| Decision(s) | Clauses narrowed | What you get instead |
|---|---|---|
| D3-1 | FZ-3 bullet 2a (start); FZ-7 reason 2; ES-2 last bullet (starting inference); EN-2 Apply bullet 5 | Formalize sessions make no binding session-start freezes. Each step's preset is enforced as step limits at its S₀ (plan2 §4.9). The start is recorded only for EN-2's line, which reads "Claude's step limits end with the session; your other freezes return to how they were." Start freezes would become real only in sessions started by Transform (slice 4). |
| D3-9 | FZ-3 bullet 3c; FZ-5 bullets 4b, 4c, 4d; RV-7 belief 5; §14 item 3 (FZ-5 exception); App B Backstop (FZ-5 held change) | There is no "Allow this change" and there are no "meaning changed by X" items; RV-7's b5 stays unused. Held content changes only after you unfreeze what holds it, and X's own item lists the statements that rely on it. |
| D3-5, D3-48 | FZ-3 bullet 3 | At a step's checks, a difference the step found at its S₀ may stay but not grow. At the stage, such differences, and the judge's reverts of frozen content, become stage problems that disable Apply. The final check and Apply refuse them. |
| D3-4 | FZ-7 para 2; RV-4 header | The "accepted" freeze ends only by your own status change, an Unfreeze that covers it, or a cascade you confirmed. telelean's automatic returns to review (D2-23, RV-11) keep it frozen. |
| D3-7, D3-35 | FZ-7 para 3 | Unfreezing accepted content works only in a stage. It is refused while a step runs and in the end confirmation. |
| D3-6, D3-7, D3-8, D3-45, D3-46 | FZ-9 para 1 (time) | You can freeze while a step runs (at J), except: <br>– not while telelean re-checks (D3-8) or while Apply writes (D3-46); <br>– not a target's Proof, Dependencies or mark while results are hidden or its step is queued or running (D3-6); <br>– "your version" and un-accepting wait for the step's end (D3-7); <br>– an unaccepted "Claude suggests" premise cannot be frozen (D3-45). |
| D3-21, D3-16 | FZ-9 bullet 4b | A board freeze writes freezes.json, which counts as no model file. Freezing a card whose id is derived first writes its `id:` line, which is a model-file change with a History snapshot. |
| D3-50 | FZ-10 bullet 1c | Some freezes the step cannot meet: content that freeze_statements already fixed, or that the step's own ledger entries write. Such a freeze ends the step at once as given up, uncounted, rolled back to S₀. |
| D3-7, D3-30 | FZ-10 bullet 2 | "Your version" is refused while a step runs and offered only when one item is involved. Separately, plan3 §3.6 offers one version only for some kinds, which is not logged. |
| D3-27 | FZ-11 bullet 5b | The "may change" chips show only while a narrow (preset) step runs. |
| D3-41, D3-12 | ES-2 Open the whole model, bullet 1 | More stays fixed than the spec says: other subjects, everything after freeze_statements, other Results' proof material, other targets' Claude arrows and premises, and Shaky content. |
| D3-11, D3-14, D3-41, D3-12 | ES-2 Open the whole model, bullet 2 | remove_arrow works only on your arrows that no question selects. delete_card is restricted. Changes stay within the session's subject and come only before freeze_statements. |
| D3-36 | RV-1 Add premise, sub-bullet 3 | No unfreeze request is made automatically. A premise into frozen Dependencies is refused when proposed, or its Accept waits until you unfreeze ("Select them"). |
| D3-47 | TR-14 (c) | A Proof broken card can be re-proved only after Apply, not in the session that broke it. |
| D2-15 (kept for slice 4 by plan3 §3.12; D3-49) | CF-3 bullet (Shaky split); DO-3 bullet 1 sentence 2; TR-7 (c) | Shaky steps re-propose content only: no new cards, no splits, no merges. |
| D2-2, D2-57 | DO-3 bullet 1 sentence 1; RV-12 bullet 3 | Shaky and to-be-redone items are reworked one step per affected inference, after taking out items that other steps' items depend on, not in one step. |
| D2-61 (AP-24 #1; replaces the withdrawn D2-6) | RV-6 bullet 1; RV-6 bullet 2 | There is one reveal per stage. Every Result waits for every undecided meaning item, and Show results shows them all. The Proposed view masks to the session base B, not to each step's start. This hides more than RV-6 asks. |
| D2-61, D2-64 | RV-3 bullet 2 sentence 2 (Submit) | Submit needs the results shown. A statement to be redone whose content is kept keeps them hidden until you decline it as Shaky or show the results. |
| D2-64, D2-27 | RV-12 sentence 1 | Submit also needs the results shown, no step running or queued, and nothing being re-checked. |
| D2-62, D2-8 (AP-24 #2) | RV-3 bullet 1 sentence 2 | No status changes while Claude's step runs, none on hidden Results or their parts, and none while confirming (go Back to review first). |
| D2-62, D3-23, D3-8 | UN-4 para 2c | While a step runs, only freeze actions can be undone or redone, with madeAt set to now, so FZ-10's "fresh" rule applies. Decisions wait for the step's end, and nothing can be undone while telelean re-checks. |
| D2-65, D2-63, D2-53, D2-20 | RV-9 bullet 1 sentences 1-2; AR-8 bullet 3 (hidden result) | Mid-stage Formalize waits until the results are shown, so there is no per-source "result not shown yet" dialog. Its items join after the queue ends. It refuses targets with Shaky items or with arrows still in review. |
| D2-54 | UN-5 bullet 1a | Submit seals the stack only when it queues Claude steps. Going to the end confirmation does not seal. |
| D2-13 | RV-10 bullet 2 | Until slice 4, "Ask me instead" is a Shaky decline of the step's statement items, with "Ask me about: …" prefilled. |
| D2-31 | RV-1 Vocabulary (N), sentences 1-2 | Each term is its own item, grouped under "Vocabulary (N)" with "k of N accepted". |
| D2-44 | RV-1 Result, sentence 1 | An inference whose step never ended has no Result. Submit drops it, and the confirmation lists it as "not run". |
| D2-36 | ES-6 sentence 3 (Exit confirmation) | Exit's confirmation is a dialog that is not saved. Only the Apply confirmation survives a reload. |
| D2-26 | §14 item 4 (cycles of items) | Items in a dependency cycle are accepted one by one, so mid-stage an accepted item can rest on another still in review. Submit and Apply need the whole cycle accepted. |
| D2-69, D3-31 | §14 item 6 (side channels) | These residual hints are accepted: step durations, Claude's questions, later visible content in the same queue, Lean name clashes, and the words of unfreeze requests. |
| D2-24 | App B Backstop (exempt) | Stricter than the spec: the exempt declarations need no Accept of their own, but must still belong to an accepted item. |
| AP-21 | B.2 fallback gap | When the facts come only from the source text, a card reached only through a simp lemma (whose basis other cards explain) escapes the board's cross-check. In that mode no band gets a ✓, and the gate refuses ("source-only"). |

## Scope of slices 4 and 5

No real gap is recommended for slice 4 or 5 outright. G4, G5 and G6 each have a half that slice 4 must carry (listed below).

### Slice 4: the transform window (73 requirements, plus follow-ups)

Every `slice-4` row, grouped:
1. **Opening the window, and sessions:**
   - §1 Transform; CF-1 (transform); CM-3 bullet 1b (the "Transform cards…" button).
   - CM-4 row 3: starts a session (ES-3), or is queued (RV-9).
   - ES-3: the provisional session with the non-selected cards session-frozen; submit unchanged, needs Claude, changed without Claude; Cancel.
   - ES-9 bullet 3 (transforms): changes during a session go through Transform, queued until Submit.
   - RV-9 bullet 2; RV-12 bullet 1 (transforms needing no Claude run first, as accepted items).
   - UN-4 bullet 4a (queueing or dropping a transform is a session step).
   - ES-6 sentence 3 (drafts survive a reload); EN-2 Apply bullet 2 (what you typed is shown separately).
   - FZ-11 bullet 5a (the "Everything except the selected cards is frozen" banner).
2. **Drafts and fields:**
   - TR-1 (a, b); TR-2 (a, b, c); TR-3 (a, b, c) (the trash).
   - TR-4: fuzzy and open fields; starting states for new and copied cards; fuzzy Dependencies; the Proof field. S11's copied Lean starts frozen.
   - TR-5; TR-6; TR-9 (a, b); TR-10 (a, c); CF-1 exception (TR-10).
   - UN-4 bullet 4b (text fields keep their own undo); §1 Fuzzy.
3. **Kind:** TR-11 (window); CF-4 bullet 1 (in a transform); §14 item 10 (transform).
4. **Freezes:**
   - FZ-3 bullet 2e: your edit becomes the frozen value (plan3 §3.12's `revalue` hook).
   - FZ-7 reason 4: the `transform` reason, already typed.
   - FZ-9 para 1: freezing inside the window.
5. **Claude's part:**
   - TR-7 (a, b): the "Claude may add cards" checkbox, and plain vocabulary always allowed. TR-8: the Instructions box.
   - TR-15: the needs-Claude test; direct application outside a session (one Undo step, TR-12 checks only); application at Submit inside one; copied content stays Claude's; follow-on edits count as yours.
   - B.3 (transform); App B Baseline (transforms, copied content); RV-7 bullet 5 (what you typed counts as accepted); RV-5 bullet 3 (your change takes accepted dependents out).
6. **Checks and safety:**
   - TR-12 (a, b, c) and S10: typed Lean is checked.
   - TR-13 bullet 1, "nothing left broken" and bullet 2; S9 (dependents).
   - TR-14 (a, b, d) and S8: transform steps write no proofs. A broken proof becomes a Proof broken item, reusing plan3 §3.10's item kind and mark_proof_broken. "Make it pending" is deferred here by D3-10.
7. **Decline routes:** RV-8 bullet 2 and DO-2 (Decline → Transform, enabled after D2-14's interim); TR-9 (b).

Follow-ups and conditional items:
- **G5:** a sentence you type in the window must become yours (worded_by).
- **G6:** TR-11's kind-change impact must name the frozen arrows it removes.
- **G4:** S9's other half (dependents handled, TR-13) is the slice-4 row S9 fix (dependents).
- **D3-43 fallback:** if 3c2 or 3e3 keeps a blocker or major finding, Formalize's "Claude may add cards" moves here beside TR-7 (a). That brings CM-4 row 2c, ES-2's "Claude may add cards" bullets 1-2, the CF-3 case, RV-1 Add ‹card›, DO-0 bullet 2 sub-bullet 2 and A25.
- **D2-13:** RV-10 bullet 2's "Ask me instead" should become a Transform decline with "Ask me about: …" prefilled.
- **D2-15** stays in slice 4 (plan3 §3.12). TR-7 (c), DO-3 bullet 1 sentence 2 and CF-3 (Shaky split) stay narrowed unless you reverse it.
- **D3-1:** sessions started by Transform are where session-start freezes (FZ-3 bullet 2a, FZ-7 reason 2) become real. plan3 §3.12 leaves the hooks: the `session-start` and `transform` reasons, `revalue`, and the banner.
- **Slice-4 parts of rows mapped elsewhere:**
  - RV-6 bullet 4 (TR-13's lists leave out hidden items).
  - RV-9 bullet 1 sentence 3 (cards declined with Transform count as frozen).
  - EN-1 sentence 1 and EN-2 sentence 1 (the transform conditions).
  - A2 and A3 (typed Lean that names undefined things; instructions).
  - TR-13 "Delete anyway" for transforms applied directly.
  - The first transform-made cases of Change items, RV-7's "changes what is proved" 2, RV-1 Result sub-bullet 5 and S11's own-Accept rule.
- **Needs references (slice 5) first, or a stub:** TR-4 fuzzy Dependencies (a list of # references), TR-8 (# in the instructions), TR-10 (c) (other subjects' vocabulary can be referenced), and TR-2 (c) (new ids must respect RF-2's never-reused ids).

### Slice 5: references (15 requirements)

- §1 Reference; CF-1 (reference with #).
- RF-1 (a, b): the # dropdown, chips that reveal their target.
- RF-2 (a–d): stable ids, never reused; the current name, or "deleted card"; the target's sentence in Lean docstrings and in everything Claude reads.
- RF-3: no dropdown in Lean fields; Esc leaves a plain #.
- RF-4: no short numbers; search by sentence. The webview has no sentence search today.
- CM-4 row 10: Copy reference.
- FZ-4 bullet 2, RF-5 (a) and S12: references hold their targets. plan3's heldFields() hook returns [] until then.
- RF-5 (b): TR-13 warns about references. This needs slice 4's TR-13.

Notes:
- RF-2 (b) is at risk already in slice 3, because freezes are keyed by sentence-slug ids (section 3).
- ES-9 bullet 2 lists "copy references" among the actions still possible during a session.

## 5. Full matrix

One line per requirement, grouped by spec section. Appendix A merges the rows that several mappers gave the same edge case; "(n rows)" says how many were merged.

### §1 Terms (26)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| Card | built | Anything on the board is a card: axiom, proposition or vocabulary. | core/model.ts:25; webview/board/AxiomsColumn.tsx, PropositionCanvas.tsx, Vocabulary.tsx; plan1 §8 1a, 1c1 |
| Axiom | built | An axiom card is held, sits in AXIOMS, has a Lean `axiom .holds`; replaces ASSUMPTION. | core/model.ts:25, :35-44; webview/board/AxiomsColumn.tsx; plan1 §2.1-2.3, §8 1a |
| Proposition | built | On the canvas; .holds is a theorem (proved), a Lean axiom (pending) or missing (unproved); replaces DERIVATION and GOAL. | plan1 §2.1, §8 1a; webview/board/PropositionCanvas.tsx |
| Arrow | built | X → Y: Y follows at least in part from X; dotted while declared, solid once a checked proof of Y uses X. | webview/board/edges.ts:93; plan1 §8 1c1, 1d |
| Dependencies | built | Incoming arrows form one field; "follows from nothing" is the explicit empty set. | core/markup/types.ts:90-91; plan1 §2.1-2.2, §8 1a-1b · as a freezable field: plan3 §2.2 |
| Band | built | The green band binds the arrows a checked proof uses, which together suffice. | webview/board/band.ts:73; plan1 §8 1d |
| Established | built | Proved, resting only on axiom cards, presuppositions and definitions, never on pending, facts current; green glow. | core/project/build.ts:927; webview/model/cardData.ts:147; plan1 §8 1a, 1d, fixer 1d |
| Axiom vs Lean axiom | built | "Axiom" names the card; "Lean axiom" names an axiom declaration. | webview/board/AlsoAssumed.tsx:2-47; plan1 §8 1a · wording convention in the UI texts |
| direct(v) | built | The cards whose .holds v's checked proof uses directly, from Lean's elaborated proof. | core/project/edges.ts:160; plan1 §8 1d |
| Field | planned-3 | An editable part of a card, selectable on its own. | plan3 §2.2, §4.2 |
| Frozen | planned-3 | A frozen field, card or arrow is one Claude may not change. | plan3 §2.2-§3.6, §4 |
| Held | planned-3 | Content that frozen content relies on; Claude may not change it either. | plan3 §3.2, §3.4 step 3, §4.5 · holding through # is slice 5 (heldFields returns []) |
| Fuzzy | slice-4 | An empty field Claude is asked to fill (TR-4). | plan1, plan2 "not in slice" · ES-2's empty statements already filled (plan2 §2.7); plan3 §4.5 "Claude fills this" chips |
| Edit session | planned-2 | A sequence of Claude steps and review stages on a private copy of the model. | plan2 §3.1-§3.13 (2d-2f) · slice 1: the run is the session |
| Claude step | planned-2 | One stretch of Claude's work inside a session. | plan2 §3.3-§3.4 (2d) |
| Formalize for dependencies | built | Replaces "These suffice": select arrows; Claude formalises and proves what they claim. | webview/header/ContextSection.tsx; webview/board/contextActions.ts:78; core/formalize.ts:125; plan1 §8 1e · one target (AP-9); several: plan2 §3.2, §4.12 |
| Inference | built | One Formalize target with its question (the selected arrows into it). | plan1 §8 1e · several per session: plan2 §2.2, §4.12 |
| Review stage | planned-2 | Your pass over the proposed changes, one review item per change. | plan2 §3.5, §5.3-§5.6 (2c2, 2g) |
| Belief / proof-changing item | planned-2 | They need their own Accept (RV-7). | plan2 §4.4 (classify, built 2a2), §5.5 (2g) |
| Arrow item | planned-2 | A review item for an arrow Claude adds or removes. | plan2 §2.8 (D2-1), §4.2, §5.6 · Remove arrow items only in plan3 §3.10 (3c1) |
| Transform | slice-4 | The Transform window: propose turning a set of cards into another set. | plan1, plan2, plan3 "not in slice" |
| Context Menu | built | The toolbar section shows the selection's actions; a right click opens them at the cursor. | webview/header/ContextSection.tsx; webview/board/menu.ts; BoardInput.ts:462; plan1 §8 1c1, 1e |
| Session bar | planned-2 | The bar above the board holds the active session's controls. | plan2 §5.8 (2g) |
| Undo stacks | planned-2 | Two stacks (board: files and standing freezes; session) that never share a step. | plan2 §4.6 (reducer 2a2), §5.12 (2h); plan1 §8 1f · standing freezes on the board stack: plan3 §5.1 (D3-21) |
| Reference | slice-5 | A link to a card or field, typed with #. | plan1, plan2, plan3 "not in slice" |
| Apply | planned-2 | Writes a finished session's changes to your files; replaces today's Accept. | plan2 §3.10 (2f), §5.9, §5.14 |

### §2 Cards and fields (41)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| CF-1 (select a card) | built | Every axiom and proposition card can be selected. | webview/state/store.ts (clickCard, selectArea); webview/board/gestures.ts:218; plan1 §8 1b, 1c2 |
| CF-1 (select a vocabulary card) | planned-3 | Vocabulary cards can be selected like any card. | plan3 §4.2 (selectedVocab) |
| CF-1 (select any field) | planned-3 | Any single field of any card can be selected. | plan3 §4.2, §4.5 lock slots |
| CF-1 (freeze/unfreeze any card) | planned-3 | Every card, vocabulary included, can be frozen and unfrozen. | plan3 §3.6, §4.3, §2.2 · D3-6, D3-45, D3-46 narrow when |
| CF-1 (reference with #) | slice-5 | Every card can be referenced with #. | plan1, plan2, plan3 "not in slice" |
| CF-1 (transform) | slice-4 | Every card can be transformed. | plan1, plan2, plan3 "not in slice" |
| CF-1 exception (TR-10) | slice-4 | Vocabulary from other subjects cannot be transformed. | plan1, plan2, plan3 "not in slice" · D3-41 already keeps it unchangeable by Claude; it can be frozen (plan3 §2.2) |
| CF-2 table (Axiom) | planned-3 | Fields: Sentence, Kind, Why, Stance, Source, Lean statement. | plan3 §2.2 CARD_FIELDS, D3-20 · board edits today: Sentence/Why/Stance/Source (core/edit/planAction.ts:85), Kind by drag; Lean only in the editor; TR-6 in slice 4 |
| CF-2 table (Proposition) | planned-3 | The axiom's fields plus Dependencies and Proof. | plan3 §2.2 (8 fields), D3-20 · Dependencies edited by drawing (built); no Proof editor |
| CF-2 table (Vocabulary) | planned-3 | The whole Lean declaration and its Gloss. | plan3 §2.2 VocabField, §4.5 · no board edit of vocabulary; transform editing in slice 4 |
| CF-2 bullet (Proof states) | built | A Proof is empty, pending (an axiom .holds, counts as no proof) or proved (a theorem). | plan1 §2.1, §8 1a · plan2 §4.4 c1 treats pending as no proof |
| CF-2 bullet (axiom .holds) | built | An axiom's .holds is not its own field and must state exactly its Lean statement. | TL114 (core/project/build.ts; webview/board/band.ts:92-93) |
| CF-2 bullet (Dependencies storage) | built | Stored as declared premises, or the "follows from nothing" mark. | core/markup/types.ts:90-91; core/edit/planArrows.ts:132, :258; plan1 §2.2, §8 1b |
| CF-3 (never changed by Claude; every check verifies) | built | Data telelean keeps is never changed by Claude, and every check verifies it. | core/gate/rules.ts:76 (COMPARED_FIELDS), :1151-1270 (G5) · sessions: plan2 §4.9, §4.10; plan3 §3.9 |
| CF-3 bullets (covered data) | built | Id, dates, provenance, Kind, lineage, tags, notes, extension data, Lean pin and binding. | core/gate/rules.ts:76, :1255-1262, :1263ff |
| CF-3 bullet (position on the board) | built | A card's position is kept data, never changed by Claude. | runner/shadow/types.ts:7; runner/proposal/service.ts:100; plan2 §2.6, D2-33 |
| CF-3 bullet (declared premises) | planned-2 | Claude changes Dependencies, when not frozen, only through review items. | plan2 §2.8 (D2-1), §4.9 B.3 · removals only plan3 §3.10 (AP-14 b, D3-14) |
| CF-3 bullet (when Claude adds cards) | built | New cards only for a proposed premise, with "Claude may add cards", for a Shaky split, or as vocabulary. | core/gate/rules.ts:1151 (G5); core/gate/adoption.ts:133; plan2 §4.9 |
| CF-3 bullet (case "Claude may add cards") | planned-3 | With the switch on, Claude may add cards. | plan3 §3.10 (3c2, 3e3), D3-13; D2-12 · D3-43 fallback may move it to slice 4 |
| CF-3 bullet (case Shaky split) | narrowed | Claude may add cards when it splits a Shaky card. | D2-15 (plan2 §3.7); plan3 §3.10, §3.12 (D2-15 stays in slice 4) |
| CF-3 bullet (Lean statement = 3 things) | planned-3 | Binding + full text of the bound declaration + its meaning in Lean. | plan3 §2.1 meaningKey (D3-2), §3.2 · D2-41 compares meaning only approximately meanwhile |
| CF-4 (Kind only you change) | built | Kind is a field, and only you change it. | core/gate/rules.ts:76 (G5 type); plan1 §2.4; plan3 §2.2 |
| CF-4 bullet 1 (drag into AXIOMS) | built | By dragging a proposition into the AXIOMS column. | webview/board/gestures.ts:393; plan1 §8 1c2 |
| CF-4 bullet 1 (arrow or mark into an axiom) | built | By drawing an arrow into an axiom or marking it "follows from nothing". | core/edit/planArrows.ts:132-175, :258; plan1 §8 1b |
| CF-4 bullet 1 (in a transform) | slice-4 | In a transform (TR-11). | plan1, plan2, plan3 "not in slice" |
| CF-4 bullet 2 (D-11, impact first) | built | Carried out by D-11, impact shown first. | core/kindChange.ts:146; core/edit/planAction.ts:189; plan1 §8 1a, 1b, 1c2 |
| CF-4 bullet 3 (never changes Kind) | built | Claude never changes an existing card's Kind. | core/gate/rules.ts:76 · also plan2 §4.9 B.4, plan3 §3.10 |
| CF-4 bullet 3 (no arrow into an axiom) | planned-2 | Claude never adds an arrow into an axiom. | plan2 §4.9 proposeArrowProblems, §4.10 · slice 1: Claude adds no arrows |
| CF-4 bullet 3 (no column/canvas moves) | built | Claude never moves a card between the column and the canvas. | G5 type (core/gate/rules.ts:76); layout out of Claude's reach (runner/shadow/types.ts:7) |
| CF-4 bullet 3 (no proof→axiom) | built | Claude never turns a proof into an axiom. | core/gate/rules.ts:476-551 (new-axiom), status-mismatch (plan1 §8 fixer 1e) · explicit in plan2 §4.9 B.4 |
| CF-4 bullet 3 (can ask) | built | Claude can ask you to change a kind. | runner/llm/toolSchemas.ts:141 (ask_user) · a generic question only |
| CF-5 (computed from Lean) | built | Vocabulary stays computed from Lean (D-3). | core/project/vocabulary.ts |
| CF-5 (identified by Lean name) | built | A vocabulary card is identified by its Lean name. | VocabItem.name (core/model.ts) · plan3 §2.2 keys its freezes by name |
| CF-5 (box look) | built | Box look in the Vocabulary/Definitions column, not read as a belief. | webview/board/Vocabulary.tsx:176; plan1 §8 1c1 |
| CF-6 (Claude's wording) | built | Every sentence Claude writes is marked as Claude's wording (italic). | webview/board/NodeCard.tsx:168, :273; core/gate/adoption.ts:133 · plan3 §3.10 writes worded_by: agent |
| CF-6 (your edit makes it yours) | unassigned | Editing a sentence Claude wrote makes it yours. | **G5** core/edit/planAction.ts:85-125 never touches worded_by; no plan |
| CF-7 (never edited) | built | Derived information (status, glows, bands, Used by, Uses, Rests on, attempts) can never be edited. | core/project/build.ts, webview/model/cardData.ts; no edit path |
| CF-7 (never frozen) | planned-3 | Derived information can never be frozen. | plan3 §3.6 |
| CF-7 bullet 2 (solid declared arrow) | built | A declared arrow a proof uses stays in Dependencies: solid, selectable, deletable, formalizable. | webview/board/gestures.ts:33; plan1 §8 1c2, 1e |
| CF-7 bullet 2 (solid declared arrow frozen) | planned-3 | It can still be frozen. | plan3 §2.2 · D3-6 limits a target's Dependencies while results are hidden |
| CF-7 bullet 3 (TL107 arrows) | built | Only an arrow a proof uses without a declaration (TL107) is purely derived. | webview/board/gestures.ts:33; plan1 §8 1c2 · plan3 §3.6 excludes warning arrows from freezing |

### §3 The board (63)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| BD-1 bullet 1 (layout) | built | Vocabulary and Definitions side by side on top, each scrolling; AXIOMS left below; the canvas fills the rest. | webview/board/Board.tsx, Vocabulary.tsx, AxiomsColumn.tsx, PropositionCanvas.tsx; plan1 §8 1c1 |
| BD-1 bullet 2 (divider) | built | The top/bottom divider can be dragged. | plan1 §8 1c1 (topSplit) |
| BD-1 bullet 3 (collapse) | built | The top collapses to one line that keeps its counts and flags. | webview/board/vocabularyBand.ts:35; plan1 §8 1c1 |
| BD-1 bullet 4 (Definitions column) | built | Holds def, abbrev, structure, inductive, class and instance. | webview/board/vocabularyBand.ts:1-17 |
| BD-1 bullet 5 (Vocabulary column) | built | Holds Types, Predicates & relations, Functions, Constants, Presuppositions, Lemmas, Unmarked axioms, Other. | webview/board/vocabularyBand.ts:4-12 |
| BD-1 bullet 6 (other subjects) | built | Other subjects' items used here are shown read-only. | core/project/subjectGraph.ts:44-47 |
| BD-1 bullet 7 (AXIOMS header) | built | "also assumed: K pending claims, N existence assumptions, M hidden assumptions", each linking. | webview/board/AlsoAssumed.tsx:2-47, assumed.ts; plan1 §8 1c1, fixer 1d |
| BD-1 bullet 7 (endorsement flag) | built | Definitions that need your endorsement are flagged. | webview/board/Vocabulary.tsx:40; plan1 §8 1c1 · recorded at Apply: plan2 §2.6 (D2-18) |
| BD-2 | built | AXIOMS holds axiom cards only, in your order (drag or Alt+↑/↓), scrolling. | webview/board/NodeCard.tsx:193; AxiomsColumn.tsx; plan1 §8 1a, 1c1 · ghosts and Add-premise drafts (D2-35) show at the top as non-cards |
| BD-3 (canvas) | built | The canvas holds proposition cards, placed freely. | webview/board/PropositionCanvas.tsx; plan1 §3, §8 1c1 |
| BD-3 Zoom (wheel) | built | The wheel zooms about the cursor. | webview/board/canvas/view.ts:40-71; CanvasView.ts:149 |
| BD-3 Zoom (Ctrl+wheel/pinch) | built | Ctrl+wheel (a pinch) zooms the same way. | canvas/view.ts:44 |
| BD-3 Zoom (range) | built | Zoom range about 10 %–400 %. | canvas/view.ts:34-35, :54 |
| BD-3 Pan | built | Right-drag pans; two-finger scroll zooms; on a trackpad pan with right-drag or keys. | webview/board/BoardInput.ts:462; plan1 §8 1c1 |
| BD-3 Left button (move) | built | Dragging a card moves it. | plan1 §8 1c1 (moveCards) |
| BD-3 Left button (rectangle) | built | Dragging on empty canvas selects the cards and arrows inside a rectangle. | webview/board/gestures.ts:218; plan1 §8 1c2, fixer 1g |
| BD-3 Left button (handle) | built | Dragging from a card's handle draws an arrow. | gestures.ts:301; BoardInput.ts:343 |
| BD-3 Keyboard (Tab) | built | Tab moves between cards; the canvas follows focus. | plan1 §8 1c1, fixer 1c1 |
| BD-3 Keyboard (+/− and arrow keys) | built | + and − zoom; arrow keys pan while the canvas has focus. | BoardInput.ts:33, :705-709 |
| BD-3 Keyboard (toolbar) | built | Fit all and Zoom to selection in the toolbar. | webview/board/CanvasToolbar.tsx:52-62 |
| BD-3 Placement (automatic) | built | Cards with no stored position are placed (sources left, no overlap, measured sizes), unstored; opening writes nothing. | webview/board/canvas/placement.ts:1-16, :103; plan1 §8 1c1, fixer 1c1; AP-12 · fixer 1c1 trade-off: a growing changed card in the Proposed view may touch the next |
| BD-3 Placement (A\|P box card not stored) / B.7 | contradicted | A new A\|P-box card is placed without storing; only moves and Tidy layout write positions. | **G9** plan1 §2.4, §8 1c1: the add stores the position in layout.json |
| BD-3 Placement (move stored) | built | Moving a card stores its position, one Undo step. | core/edit/planArrows.ts:316; plan1 §8 1b, 1c1 |
| BD-3 Placement (Tidy layout) | built | Tidy layout re-places the selected cards (all if none) and stores them, one Undo step. | canvas/placement.ts:145; CanvasToolbar.tsx:77 |
| BD-3 Placement (layout only) | planned-2 | Positions never appear in a review or a session diff. | plan2 §4.3, §3.10 step 4, D2-33 · the slice-1 part is built |
| BD-3 Expanding a card | built | Expanding opens details over the cards below, raised, moving nothing. | plan1 §8 1c1 |
| BD-3 Reveal | built | "Show on board" and every reveal pan and zoom to the card. | plan1 §8 1c1 |
| BD-4 | built | Arrows across the two parts follow column scrolling and canvas pan and zoom. | webview/board/EdgeEngine.ts, geometry.ts; plan1 §8 1c1 |
| BD-4 bullet 1 (column ends) | built | Scrolled-out ends stop at the column's top or bottom with "▲/▼ n linked" badges. | plan1 §8 1c1 |
| BD-4 bullet 2 (canvas edges) | built | Cut-off arrows stop at the edge; edge badges pan to the nearest hidden card. | plan1 §8 1c1 |
| BD-5 (never colour alone) | built | Arrow looks never rely on colour alone. | webview/board/edges.ts:113-141 |
| BD-5 row 1 (dotted) | built | Dotted (round dots): declared by you. | plan1 §8 1c1, 1d |
| BD-5 row 2 (solid) | built | Solid: used by a checked proof of its target. | edges.ts:93 |
| BD-5 row 3 (hollow head) | built | Hollow head: the proof takes the source as a hypothesis. | edges.ts:96, :137 |
| BD-5 row 4 (translucent +/−) | planned-2 | Claude's proposed arrow is translucent with "+" or "−", in the Proposed view and review only. | plan2 §5.10 (2h), D2-34 · drawn only while results are shown; "−" items from plan3 §3.10 |
| BD-5 row 5 (lock badge) | planned-3 | A frozen arrow has a lock badge. | plan3 §4.5 (3f) |
| BD-5 row 6 (warning colour) | built | A proof's use of a card with no drawn arrow: solid, warning colour (TL107). | edges.ts:10, :52, :97; plan1 §8 1d |
| BD-5 row 7 (mentions) | built | Thin mention arrows only while an end is hovered or selected; not selectable. | edges.ts:31-32, :64-70; EdgeEngine.ts:113 |
| BD-5 tail (unused declared arrow) | built | A dotted arrow into a proved card from outside direct(v) stays dotted, "not used by the current proof", never removed, no warning. | edges.ts:12, :61; plan1 §8 1d |
| BD-6 (blue glow) | built | A card with a Lean statement has the blue glow. | webview/model/cardData.ts:147 |
| BD-6 (green glow conditions) | built | Green glow and "✓ established" only on established cards (all conditions). | core/project/build.ts:927; cardData.ts:245-249; plan1 §8 1a, 1d, fixer 1d |
| BD-6 (green replaces blue) | built | Green replaces blue. | cardData.ts:150 |
| BD-6 (proved, not established) | built | Proved but not established keeps blue, with a chip saying why. | cardData.ts:258-277 · also TL102 (AP-16) |
| BD-6 (pending) | built | A pending proposition shows "pending proof". | cardData.ts; plan1 §8 1a |
| BD-6 (out of date) | built | Out-of-date facts: last status dimmed, never green. | cardData.ts:131, :143-150 |
| BD-6 (axioms) | built | Axioms never glow green; one whose .holds is a theorem shows "has a proof". | cardData.ts:181 |
| BD-7 bullet 1 | built | A checked proof's band binds the drawn arrows into v whose sources are in direct(v). | webview/board/band.ts:73-83; plan1 §8 1d, fixer 1d |
| BD-7 bullet 2 | built | direct(v) from the elaborated proof (simp lemmas and instances count), after every check, never from Claude. | core/project/edges.ts:160; plan1 §8 1d |
| BD-7 bullet 3 (complete band) | built | ✓ and "Together these suffice … consistency unchecked" only when complete (all of direct(v) arrowed, no hypothesis, no hidden assumption). | band.ts:46, :86-98 · stricter: also elaborated direct(v), nothing unseen, no TL114, whole band drawn |
| BD-7 bullet 4 (open band) | built | Otherwise no ✓, naming what lies outside; hollow-head arrows inside. | band.ts:86-98 |
| BD-7 bullet 5 (sufficiency only) | built | The band claims joint sufficiency, not necessity or consistency. | band.ts:13-14, :46, :98 |
| BD-7 bullet 6 (definitions chip) | contradicted | A chip on the band names the definitions or presuppositions the proof relies on. | **G7** band.ts:99-104: tooltip lines; definitions from the statement closure (lean.uses) |
| BD-7 bullet 7 | built | The band is drawn even when proved but not established. | band.ts:74 |
| BD-7 bullet 8 (proved from nothing) | built | Proof from nothing: band on the ∅ mark; with no mark, no band and the chip "proved from nothing". | band.ts:83-84; cardData.ts:187 |
| BD-7 bullet 9 | built | No band from out-of-date facts; at most one band per proposition. | band.ts:75-79 |
| BD-8 (A\|P box stays) | built | The A\|P box replaces the A\|D\|G box and stays. | plan1 §8 1a |
| BD-8 bullet 1 (where new cards go) | built | Axiom to the column; proposition to the canvas, in view, next to the selected card. | canvas/placement.ts:13-14, :166-183; plan1 §8 1c1, fixer 1c1 |
| BD-8 bullet 1 (disabled in a session) | built | The A\|P box is disabled during a session. | plan1 §8 1f · lock kept in plan2 §3.1 |
| BD-8 bullet 2 | built | Your words verbatim; no Claude, no Lean. | core/edit/planAction.ts (add-node) |
| BD-9 bullet 1 (stripes) | built | Axiom stripe keeps the Assumption colour; proposition takes the Goal colour. | plan1 §2.8, §8 1a |
| BD-9 bullet 2 (green reserved) | built | Green only for what Lean checked; the green Derivation stripe goes. | plan1 §2.8, §8 1d |
| BD-9 bullet 3 (legend) | built | Legend: declared, verified by Lean, conditional, mismatch, formalised, established, band, pending proof. | webview/header/legend.ts:7-41; plan1 §8 1d, fixer 1g |
| BD-9 bullet 3 (legend "frozen") | planned-3 | The legend also lists "frozen". | plan3 §4.5 (3f) |

### §4 Arrows and dependencies (50)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| AR-1 (handle) | built | Draw an arrow by dragging from the handle (on hover, right edge) to another card. | webview/board/BoardInput.ts:343; gestures.ts:301; plan1 §8 1c2 |
| AR-1 (Draw arrows from the selection) | built | Or select cards, right-click the target, Draw arrows from the selection. | webview/board/menu.ts:171-181; plan1 §8 1c1, 1c2 |
| AR-1 bullet 2 (Delete) | built | Delete removes selected arrows and marks, with A16's confirmation when a proof uses one. | gestures.ts:434; core/edit/planArrows.ts:191-229; core/kindChange.ts:83 |
| AR-1 bullet 2 (cards never with arrows) | built | Cards are never deleted with arrows; the card dialog opens only with no arrow or mark selected. | gestures.ts:434; plan1 §8 1b, 1c2 |
| AR-1 bullet 3 (Undo and History) | built | Each change is one Undo step and one History entry. | plan1 §8 1b, 1f |
| AR-1 bullet 3 (not in a session) | built | None of these during a session. | gestures.ts:458 (gestureGate); plan1 §8 1f, 1c2, 1d · kept in plan2 §3.1, §5.10 |
| AR-2 (target is a proposition) | built | Y must be a proposition; drawing into an axiom makes it one. | core/edit/planArrows.ts:139-160 |
| AR-2 (one per pair) | built | One arrow per pair. | planArrows.ts:144 |
| AR-2 (one subject) | built | Arrows stay within one subject. | planArrows.ts:107; core/project/build.ts:681 (TL121) · Claude: plan2 §4.9; D3-41 |
| AR-2 (no vocabulary ends) | built | Both ends are axiom or proposition cards. | planArrows.ts:102 |
| AR-3 (refused, cycle named) | built | An arrow that would close a cycle is refused, naming the cycle. | planArrows.ts:85-92 |
| AR-3 bullet 1 (drawn + solid) | built | Cycles are checked over drawn arrows plus checked proofs' solid arrows. | planArrows.ts:43; AP-13 |
| AR-3 bullet 2 (follow-on edits, Claude, every judged state) | planned-2 | The cycle rule holds for follow-on edits and Claude's proposals on every judged state. | plan2 §4.9 B.3, §2.7, §4.10 · slice 1 checks an old axiom's pre-v4 premises (planArrows.ts:141) |
| AR-3 bullet 3 (TL015 shown) | built | A cycle already in your files is shown (TL015). | core/project/build.ts:681 |
| AR-3 bullet 3 (blocks Formalize) | built | A hand-written cycle blocks Formalize, named, until you remove an arrow. | core/formalize.ts:30, :108; contextActions.ts; plan1 §8 1e · only when the target or a source lies on the cycle (see G2) |
| AR-3 bullet 3 (blocks Apply) | planned-2 | A hand-written cycle blocks Apply, named. | plan2 §4.10 (backstop cycle) · only implied: §4.9 never counts a cycle already in B (see G2) |
| AR-3 bullet 3 (not a failed attempt) | built | A hand-written cycle never counts as a failed Claude attempt. | plan1 §8 1e · sessions: plan2 §4.9 |
| AR-4 | built | The arrows into a proposition are its Dependencies, stored as premises:. | core/markup/types.ts:90; planArrows.ts:132 |
| AR-4 bullet 2 (you write by drawing) | built | You write Dependencies by drawing; a run no longer writes premises:. | plan1 §2.6, §8 1e |
| AR-4 bullet 2 (Claude proposes items) | planned-2 | Claude proposes Dependencies changes as review items. | plan2 §2.8, §5.6 · removals plan3 §3.10 (AP-14 b, D3-14) |
| AR-5 bullet 1 (mark from Context Menu) | built | A proposition with no incoming arrows can be marked "follows from nothing". | contextActions.ts, menu.ts; planArrows.ts:258; plan1 §8 1b, 1e |
| AR-5 bullet 1 (storage) | built | Stored as its own field, follows_from: nothing, as kept data. | core/markup/types.ts:91; core/gate/rules.ts:76; plan1 §2.2, §8 1a; AP-15 |
| AR-5 bullet 2 (∅ stub) | built | Shown as a short "∅" stub arrow. | plan1 §8 1c1, fixer 1c1 |
| AR-5 bullet 2 (select, formalize) | built | The mark can be selected like an arrow and formalized. | plan1 §8 1c2, 1e |
| AR-5 bullet 2 (freeze the mark) | planned-3 | The mark can be frozen. | plan3 §2.2, §4.5 · D3-6: not while results are hidden |
| AR-5 bullet 3 | built | Drawing an arrow into the card removes the mark; Undo restores it. | planArrows.ts:156-157 |
| AR-5 bullet 4 | built | With neither arrows nor the mark, nothing can be formalized. | core/formalize.ts:22; contextActions.ts:78 |
| AR-5 bullet 5 | built | Only you set or remove the mark; Claude can ask. | core/gate/rules.ts:76, :1207-1211; ask_user · plan2 §4.9 G5 |
| AR-5 bullet 6 (no Claude arrows into mark targets) | planned-2 | For a target whose question is its mark, Claude adds no arrows, only premises. | plan2 §2.7 (openArrows false), §4.9, §2.8 · plan3 D3-38 (whole model) silent on marked cards |
| AR-5 bullet 6 (accept removes mark) | built | Accepting such a premise also removes the mark, as part of your Accept. | core/gate/adoption.ts:146; plan1 §8 fixer 1a · sessions: plan2 §3.8 |
| AR-5 bullet 6 (item text) | planned-2 | The premise item says "replaces follows from nothing". | plan2 §5.6; core/review/texts.ts:265 (2a1) |
| AR-5 bullet 6 (frozen mark) | planned-3 | A frozen mark blocks premise items; Claude asks to unfreeze instead. | plan3 §2.8, §3.7, D3-36 |
| AR-6 (no drag onto canvas) | built | You cannot drag an axiom onto the canvas. | webview/board/PropositionCanvas.tsx:216; DropZone.tsx; plan1 §8 1a, 1c1 |
| AR-6 bullet 1 (becomes a proposition) | built | An arrow from another card, or the mark, makes the axiom a proposition on the canvas. | planArrows.ts:132-175, :258 |
| AR-6 bullet 1 (next to its source) | contradicted | The new proposition moves next to its new source. | **G10** planArrows.ts:126-130 drops the position; placement.ts:103 puts it one layer right, first free slot |
| AR-6 bullet 2 (by .holds) | built | An axiom .holds stays (pending); none gives unproved; a theorem gives proved. | core/kindChange.ts:223-246; plan1 §8 1b |
| AR-6 bullet 3 (impact first) | built | The gesture states the impact before you let go. | gestures.ts:337 (drawHint); plan1 §8 1b, 1c2 |
| AR-7 (how) | built | Drag a proposition into AXIOMS, or choose Move to axioms. | gestures.ts:393; menu.ts; plan1 §8 1b, 1c2 |
| AR-7 bullet 1 | built | It loses its incoming arrows and any mark, and becomes an axiom. | core/edit/planAction.ts:189-219, :269; plan1 §8 1a |
| AR-7 bullet 2 | built | Its proof is replaced by axiom n.holds, kept in History; Undo restores it. | core/kindChange.ts:204-210; planAction.ts:201 |
| AR-7 bullet 3 | built | Its outgoing arrows stay. | planAction.ts:189 |
| AR-7 bullet 4 (drop-zone impact) | built | The drop zone first states the removed arrows, the dropped proof, and how many cards rest on it. | core/kindChange.ts:139-143, :171-210; DropZone.tsx; plan1 §8 1c2 · arrows as a count only |
| AR-7 bullet 4 (naming frozen arrows) | unassigned | The drop zone names the frozen arrows that will be removed. | **G6** plan3 never mentions the drop zone |
| AR-8 (unproved source allowed) | built | A proposition with neither proof nor pending claim can be an arrow's source. | planArrows.ts:97-108 |
| AR-8 (asks first) | built | Formalizing an arrow out of such a source first asks you (★D7 b). | plan1 §8 1e; AP-1 |
| AR-8 bullet 1 (mark pending) | built | With a Lean statement: "Mark it pending, or cancel?"; your edit, one Undo step, before the step. | planArrows.ts:297 (claim-pending); plan1 §8 1e |
| AR-8 bullet 1 (in a session) | planned-2 | In a session: "Select the arrows into ‹source› too" or Cancel; no marking. | plan2 §5.11 (2h), §4.12 check 4 |
| AR-8 bullet 2 (no Lean statement) | planned-2 | No Lean statement: prove it first; offers "Select the arrows into ‹source› too" and Cancel. | plan2 §5.11 item 3 · slice 1 offers Cancel only (AP-10) |
| AR-8 bullet 3 (hidden result) | narrowed | If the source's Result is hidden, the dialog says so, with Show result or Cancel. | D2-65 (plan2 §4.12 check 2, §5.11): Formalize disabled until the stage's results are shown |
| AR-8 bullet 4 | built | Pending claims only by telelean at your choice; Claude never writes a Lean axiom .holds for a proposition. | core/gate/rules.ts:520-527 · explicit in plan2 §4.9 B.4 |

### §5 FROZEN (84)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| FZ-1 sentence 1 | planned-3 | Claude cannot change a frozen field. | plan3 §3.4 (token field), §3.5, §1.1 3a; cheat 1 |
| FZ-1 sentence 1b | planned-3 | Claude cannot delete a card that has any frozen field. | plan3 §3.4 token deleted; §2.8, §3.10 (3c1, 3e2); cheat 8 · Claude deletes cards only with the whole model open |
| FZ-1 sentence 2 | planned-3 | Freezing a card freezes all its fields, Dependencies included. | plan3 §3.6, §2.2 CARD_FIELDS; D3-20 (all eight fields, even on an axiom) |
| FZ-1 sentence 3 | planned-3 | Frozen binds Claude only: you can change a frozen field, and it stays frozen. | plan3 §3.1, §2.6; D3-44 · "becomes your version" is slice 4 (§3.12 revalue); D3-44 also freezes a board-edited sentence, Why, stance or source |
| FZ-1 bullet | planned-3 | Freezing a card does not freeze the arrows out of it. | plan3 §3.6, §3.2 |
| FZ-2 | planned-3 | Freezing an empty field means "keep it empty". | plan3 §3.2, §3.4 keep-empty, §3.10, §4.3, §4.5; cheat 2 |
| FZ-3 bullet 1 | planned-3 | What is frozen lives in telelean's own files, which Claude can neither see nor change. | plan3 §2.2 (freezes.json), §3.1, §5.2, §2.4; cheat 16 |
| FZ-3 bullet 2a | planned-3 | A standing freeze's frozen value is your files' value. | plan3 §3.3, §2.2 |
| FZ-3 bullet 2a (start) | narrowed | A session's starting freeze's value is your files' value. | D3-1: Formalize sessions make no binding start freezes; step limits (plan2 §4.9) enforce the preset; Transform-started sessions are slice 4 |
| FZ-3 bullet 2b | planned-3 | An accepted item's frozen value is the content you accepted. | plan3 §3.7, §3.3, §3.4 step 1; D3-4, D3-51 |
| FZ-3 bullet 2c | planned-3 | Your own freeze in a session keeps the value shown when you froze it. | plan3 §3.6, §3.8; D3-5 |
| FZ-3 bullet 2d | planned-2 | A step's limits use each value as it was at the step's start. | plan2 §4.9 (D2-41; 2b1b, not built); plan3 §3.5 · slice 1's run: M2 gate and G5 against the run's base |
| FZ-3 bullet 2e | slice-4 | Changing frozen content yourself in a transform makes your version its frozen value (TR-15). | plan3 §0, §3.12 (revalue hook) |
| FZ-3 bullet 3 | narrowed | Every judged state must leave frozen and held content at its frozen value, else it is refused. | D3-5, D3-48: a difference found at S₀ may stay but not grow; at the stage it becomes a stage problem that disables Apply; the final check and Apply refuse |
| FZ-3 bullet 3b | planned-3 | Text is compared directly; meaning is compared in Lean. | plan3 §2.1 (meaningKey, probe 3p), §3.2, §3.4; D3-2 · without a meaningKey: D2-41 fallback, and the final check and Apply fail closed |
| FZ-3 bullet 3c | narrowed | The one exception is a provisional meaning change allowed under FZ-5. | D3-9: no "Allow this change"; held content changes only after you unfreeze its holders |
| FZ-3 bullet 4 | planned-3 | Claude is told what is frozen; nothing depends on whether it complies. | plan3 §2.8, §3.1, §3.5 |
| FZ-4 bullet 1 | planned-3 | Claude may not change what frozen Lean relies on after elaboration (statements, definitions, lemmas, vocabulary, instances, coercions). | plan3 §3.4 step 3, §3.2, §2.3 token held; D3-3; cheats 5, 6 · D3-3 also keeps held non-theorem text |
| FZ-4 bullet 1b | planned-3 | For a .holds only its type is held, never the proof. | plan3 §3.2, §3.4 step 3; D3-3 |
| FZ-4 bullet 2 | slice-5 | The field a frozen card's sentence or Why references with # is held. | plan3 §0, §3.4 step 3 (heldFields() returns []) |
| FZ-4 para 2 | planned-3 | Other changes to frozen Lean's meaning (an instance, an open, an attribute) are caught by the meaning check. | plan3 §2.1, §3.4, §6.1; cheat 7 · an open is also plan2's stray-command |
| FZ-4 para 3a | planned-3 | Held never overrides ES-2's exceptions (a target's Proof, fuzzy statements, Dependencies open for additions). | plan3 §3.4 step 3, §6.1 3a |
| FZ-4 para 3b | planned-2 | The Result lists any frozen card whose Rests on changes. | plan2 §2.3 basisChanged, §5.6 · lists every such card, frozen ones not marked; plan3 adds nothing |
| FZ-4 para 4 | planned-3 | Held items show a chain mark: "held by ‹card›". | plan3 §4.5, §2.4 |
| FZ-5 para 1 | planned-3 | Claude must ask before changing frozen or held content. | plan3 §2.8 (request_unfreeze), §3.9, §3.5 |
| FZ-5 bullet 1 | planned-3 | A request card says what and why, with Select them, Continue and Keep frozen. | plan3 §3.9, §4.6 (3g), §2.4 |
| FZ-5 bullet 2a | planned-3 | The step pauses while a request is open. | plan3 §3.9 |
| FZ-5 bullet 2b | planned-3 | Continue says exactly which items are now unfrozen; Keep frozen says none are. | plan3 §3.9; D3-24 (Keep frozen only while all are still frozen or held) |
| FZ-5 bullet 3 | planned-3 | A request still open when its step ends is listed in the stage report. | plan3 §3.9 (withdrawn), §2.4, §4.6 |
| FZ-5 bullet 4a | planned-3 | For held content, the request names what holds it. | plan3 §2.4 (holders), §3.9 |
| FZ-5 bullet 4b | narrowed | "Allow this change" on a held item X exempts it, comparing holders with X's new version. | D3-9: not built; unfreeze what holds X instead (plan3 §3.9) |
| FZ-5 bullet 4c | narrowed | Every frozen card holding X gets a "meaning changed by X" item (a belief item for axioms). | D3-9: RV-7's b5 unused; X's item lists the statements relying on it |
| FZ-5 bullet 4d | narrowed | X is accepted only after all its "meaning changed" items; declining one declines X. | D3-9 |
| FZ-6 | planned-3 | Only you unfreeze (select, Unfreeze); Claude may then change it only because it is unfrozen. | plan3 §3.1, §3.6, §4.3, §3.9 |
| FZ-7 para 1 | planned-3 | A field can be frozen for several reasons and stays frozen while any remains. | plan3 §2.2 FreezeReason, §3.3, §2.4 |
| FZ-7 reason 1 | planned-3 | Reason "standing": you froze it outside a session. | plan3 §2.2, §2.6, §3.3, §5.1 · D3-44 also adds standing reasons on board edits |
| FZ-7 reason 2 | narrowed | Reason: the session's start froze it. | D3-1: no binding start reason for Formalize sessions; `session-start` is a slice-4 type |
| FZ-7 reason 3 | planned-3 | Reason: you accepted an item that covers it. | plan3 §3.7, §3.3 |
| FZ-7 reason 4 | slice-4 | Reason: you filled it in a transform. | plan3 §0, §2.2 (typed, never made), §3.12 |
| FZ-7 reason 5 | planned-3 | Reason: you froze it during the session. | plan3 §2.2 (yours), §3.6 |
| FZ-7 para 2 | narrowed | Changing an item's status removes only that item's reason. | D3-4: ends only by your status change, an Unfreeze or a confirmed cascade; automatic returns to review (D2-23, RV-11) keep it |
| FZ-7 para 3 | narrowed | Unfreeze removes every reason; an accepted item covering it returns to "in review". | D3-7, D3-35: in a stage only; refused while a step runs and in the end confirmation |
| FZ-8 para 1 | planned-3 | When a session ends, every card and field returns to its standing state from the start. | plan3 §5.4, §2.2, §3.1, §5.2 (3e1) |
| FZ-8 bullet 1 | planned-3 | Session reasons disappear; unfreezes of standing freezes are undone. | plan3 §5.4, §2.4 |
| FZ-8 bullet 2 | planned-3 | Cards created in the session end up unfrozen. | plan3 §5.4 (D3-33) |
| FZ-8 bullet 3 | planned-3 | Except what you tick "keep" in the end confirmation. | plan3 §4.7, §5.4, §2.5; D3-32, D3-33 · Exit offers keep only for values equal to your files' |
| FZ-8 bullet 4 | planned-3 | Apart from your own actions, a session's end is the only time freezes change. | plan3 §3.1 (property test) |
| FZ-9 para 1 | planned-3 | Wherever shown: select, then Freeze, Unfreeze, Freeze or Unfreeze all other cards. | plan3 §4.3, §4.2 (3f) |
| FZ-9 para 1 (Proposed view) | planned-3 | Freezing works in the Proposed view. | plan3 §4.1; relies on plan2 §5.10 (2h) |
| FZ-9 para 1 (Current view, no session) | planned-3 | Freezing works on the Current view outside a session. | plan3 §4.1, §2.5, §2.6, §5.1 |
| FZ-9 para 1 (review items) | planned-3 | Freezing works from review items. | plan3 §3.6, §4.2; D3-30, D3-34 · hidden Results not selectable (D3-6); an unaccepted "Claude suggests" premise not freezable (D3-45) |
| FZ-9 para 1 (transform window) | slice-4 | Freezing works in the transform window. | plan3 §0 |
| FZ-9 para 1 (end confirmation) | planned-3 | Freezing works from the end confirmation. | plan3 §4.7, §3.6; D3-35 |
| FZ-9 para 1 (request cards) | planned-3 | Freezing works from request cards. | plan3 §4.6, §3.9 |
| FZ-9 para 1 (time) | narrowed | The freeze actions work at any time, even while Claude works. | D3-6, D3-7, D3-8, D3-45, D3-46: see section 4 |
| FZ-9 bullet 1 | planned-3 | Exception: the Current view during a session, where nothing can change. | plan3 §4.1, §2.5 · slice 1's run lock already refuses board edits (webview/state/store.ts:670-672; extension/logic/boardSession.ts:409-425) |
| FZ-9 bullet 2 | planned-3 | "All other cards": every card containing none of the selected items; an arrow or mark counts as in both its end cards. | plan3 §3.6 |
| FZ-9 bullet 3a | planned-3 | Unfreeze all other cards asks first if it removes standing freezes, saying how many. | plan3 §4.4, §2.6; D3-25 (always asks) |
| FZ-9 bullet 3b | planned-3 | It leaves accepted content frozen unless you tick "also un-accept". | plan3 §3.6, §4.4 · the tick only in a stage (D3-7, D3-35) |
| FZ-9 bullet 4a | planned-3 | Freeze changes go on the Undo stack of the view you make them in. | plan3 §5.1, §5.3, §4.9; D3-21, D3-22 |
| FZ-9 bullet 4b | narrowed | Freeze changes change no file and make no History snapshot. | D3-21, D3-16: a board freeze writes freezes.json; a derived id first gets its id: line (model file, History snapshot) |
| FZ-10 para 1 | planned-3 | Freezing while Claude works freezes the version you see. | plan3 §3.8, §3.6, §2.5; D3-5 |
| FZ-10 bullet 1a | planned-3 | Claude is told in its next tool result. | plan3 §2.8, §3.8 |
| FZ-10 bullet 1b | planned-3 | A check that fails only because of such a freeze is not one of Claude's attempts. | plan3 §3.8, §3.4 step 5; D3-19 |
| FZ-10 bullet 1c | narrowed | Such a freeze costs Claude only an uncounted check. | D3-50: a freeze the step can no longer meet ends the step as given up, uncounted, rolled back to S₀ |
| FZ-10 bullet 2 | narrowed | Freezing a card with an item in review asks: Claude's proposal (stays in review) or yours (rejects it). | D3-7, D3-30: "your version" refused while a step runs, one item only · plan3 §3.6's one-version kinds are unlogged |
| FZ-10 bullet 3 | planned-3 | Rejecting an item whose proposal you froze first asks whether to unfreeze it. | plan3 §3.7, §4.4; D3-48 |
| FZ-10 bullet 4 | planned-3 | Freezing an empty field Claude is filling asks you to confirm. | plan3 §3.8, §4.4 |
| FZ-11 bullet 1 | planned-3 | A frozen card: an inner aura in telelean.frozen (never blue or green), plus a lock badge. | plan3 §4.5 (3f); D3-26, D3-20 · partly frozen: field locks and a chip, no aura |
| FZ-11 bullet 2 | planned-3 | The frozen look never uses dashing or translucency. | plan3 §4.5 |
| FZ-11 bullet 3a | planned-3 | A frozen field shows a small lock. | plan3 §4.5 |
| FZ-11 bullet 3b | planned-3 | A frozen arrow has a lock badge at its middle. | plan3 §4.5 (through plan2 §5.10 setBadges) |
| FZ-11 bullet 3c | planned-3 | Frozen Dependencies: a lock where the arrows enter, and a "dependencies frozen" chip. | plan3 §4.5 |
| FZ-11 bullet 4a | planned-3 | In high-contrast themes a lock badge and a "frozen" chip replace the aura. | plan3 §4.5 |
| FZ-11 bullet 4b | planned-3 | The legend gets a "frozen" entry. | plan3 §4.5 |
| FZ-11 bullet 5a | planned-3 | In a session the starting freezes show as one banner, worded by how it started. | plan3 §4.5 (3g); D3-1 |
| FZ-11 bullet 5a (transform) | slice-4 | Banner "Everything except the selected cards is frozen" for Transform-started sessions. | plan3 §0, §3.12 (hook) |
| FZ-11 bullet 5b | narrowed | During a session the board marks what Claude may change. | D3-27: "may change" chips only while a narrow (preset) step runs |
| FZ-11 bullet 5c | planned-3 | During a session, standing freezes and your own keep their aura. | plan3 §4.5; D3-27 |
| FZ-12 | planned-3 | "Statements frozen before proving" becomes "statements fixed", with its own icon. | plan3 §3.12 (3d, 3g); D3-17 · code still says "Statements frozen" (runner/gate/engine.ts:626, run/manager.ts:2042, llm/toolSchemas.ts:250) |
| FZ-13 bullet 1a | planned-3 | Selected arrows can be frozen; Claude may then not remove them. | plan3 §2.2, §3.4, §2.8; cheat 3 |
| FZ-13 bullet 1b | planned-3 | A frozen "follows from nothing" mark means no premise item may replace it. | plan3 §2.8, §3.7, §3.4; D3-36 |
| FZ-13 bullet 2 | planned-3 | Frozen Dependencies: Claude may neither add nor remove arrows into the card, nor change its mark. | plan3 §3.2, §3.4, §2.8, §3.6, §4.5; cheat 4 |
| FZ-13 bullet 3 | planned-3 | Reasons, values, Undo and the rest of §5 apply to arrows, marks and Dependencies. | plan3 §2.2, §3.3, §5.1, §5.3 |

### §6 Selection and the Context Menu (49)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| CM-1 a | built | A toolbar section "Context Menu" shows the actions that fit the selection. | webview/header/ContextSection.tsx:89-170; Header.tsx:118-137; plan1 §8 1e |
| CM-1 b | built | Fixed height, so the toolbar does not reflow. | webview/styles/board.css:1153-1160; ContextSection.tsx:2-4 |
| CM-1 c | built | Nothing selected: "Select some items to see possible actions here." | contextActions.ts:36; ContextSection.tsx:89-95 · an empty board shows the first-step hint instead (unlogged, small) |
| CM-2 a1 | built | You can select cards. | webview/state/store.ts:1767-1777 |
| CM-2 a2 | planned-3 | You can select vocabulary cards. | plan3 §4.2 (3f) |
| CM-2 a3 / bullet 1 | planned-3 | You can select single fields, by the lock icon or Alt-click. | plan3 §4.2, §4.5 (D3-28) · item-detail slots in 3g |
| CM-2 a4 / bullet 2 | built | Clicking selects an arrow; its hit area is wider than the line. | webview/styles/board.css:1009-1015; EdgeEngine.ts:602-608; gestures.ts:33; store.ts:2138-2154 |
| CM-2 a5 | built | You can select "follows from nothing" marks. | store.ts:2156-2168; plan1 §8 1c2 |
| CM-2 a6 | planned-2 | You can select review items. | plan2 §5.2, §5.5 (2g) |
| CM-2 bullet 3 | built | Ctrl adds to the selection; a selection may mix kinds. | store.ts:1767-1777, 2138-2168, 2239-2256 · fields and vocabulary join in plan3 §4.2; the board selection wins for freezes (D3-34) |
| CM-2 bullet 4 | built | The canvas rectangle selects the cards and arrows inside. | gestures.ts:218; store.ts:2239-2256; plan1 §8 1c2 |
| CM-2 bullet 5; CM-4 row 5 | built | "Select incoming arrows" selects every arrow into a card. | menu.ts:186; store.ts:2188-2204 (the mark too) |
| CM-2 bullet 6 | built | Esc closes what is open first, then clears the selection. | webview/main.tsx:99-118; model/format.ts:102-107; common/Popover.tsx:110 |
| CM-2 (Proposed view) | planned-2 | Selection works in the Proposed view. | plan2 §5.10 (2h) · in slice 1 the Proposed view selects nothing |
| CM-3 sentence 1 (built menus) | contradicted | An action that fits only some selected items is disabled, with the reason on hover. | **G12** contextActions.ts:78-97, 214-239: in mixed selections Formalize and one card's actions act on their part |
| CM-3 sentence 1 (freeze actions) | contradicted | The same rule for the four freeze actions. | **G3** plan3 §4.3, §3.6, §2.4: freezes the freezable part, the rest returned as `left` |
| CM-3 bullet 1a | built | Formalize for dependencies is a labelled button. | ContextSection.tsx:133-143 |
| CM-3 bullet 1b | slice-4 | Transform cards… is a labelled button. | plan1 header; plan3 §0 |
| CM-3 bullet 1c | planned-2 | Accept and Decline… are labelled buttons. | plan2 §5.7 (2h) · their form is unspecified; always a group Accept (D2-32) |
| CM-3 bullet 2 | built | The other actions are icons, labelled on hover. | ContextSection.tsx:112-125; contextActions.ts:186-211 · freeze icons in plan3 §4.3 |
| CM-3 bullet 3 | built | On a narrow window, extra actions overflow into "…". | ContextSection.tsx:64-79, 149-167; contextActions.ts:242-245 |
| CM-4 row 1 | planned-3 | Freeze, Unfreeze and the "all other cards" pair apply to cards, fields, arrows and marks. | plan3 §4.3, §3.6 (3f) |
| CM-4 row 2a | built | Formalize applies to arrows into propositions and to marks. | contextActions.ts:78-97; ContextSection.tsx:133-143; menu.ts:208-211 · one target (AP-9); several: plan2 §5.11 |
| CM-4 row 2b | planned-3 | Formalize's ▾ offers Open the whole model. | plan3 §4.8, §3.10 (3e2); deferred by D2-12 |
| CM-4 row 2c | planned-3 | Formalize's ▾ offers Claude may add cards. | plan3 §4.8, §3.10 (3c2, 3e3); D2-12 · D3-43 fallback to slice 4 |
| CM-4 row 3 | slice-4 | Transform cards… starts a session if none is active (ES-3), else is queued (RV-9). | plan1, plan2 headers; plan3 §0 |
| CM-4 row 4 | built | Follows from nothing / Remove it: on a proposition with no incoming arrows or an axiom, outside a session. | menu.ts:182-194, :167; contextActions.ts:174-184 |
| CM-4 row 6 | built | Draw arrows from the selection, on the target's menu, outside a session. | menu.ts:180-181; store.ts:2082; plan1 §8 1c2 |
| CM-4 row 7 | built | Delete removes the selected arrows and marks, outside a session. | contextActions.ts:219-221; menu.ts:219-248; store.ts:2206-2237 |
| CM-4 row 8 | built | Move to axioms applies to propositions, outside a session. | menu.ts:188; contextActions.ts:179 |
| CM-4 row 9 | planned-2 | Accept / Decline… apply to review items. | plan2 §5.7, §5.10 · always a group Accept (D2-32) |
| CM-4 row 10 | slice-5 | Copy reference applies to cards and fields. | plan1, plan2 headers; plan3 §0 |
| CM-4 row 11 | built | Show on board / Open in editor apply to cards. | menu.ts:195-197; contextActions.ts:182-183 |
| CM-4 para 2 | built | The tray controls go: ⊢, "Self-evident?", "Add to its premises ▶", the dropped-premises warning. | plan1 §8 1e, 1g |
| CM-5 | built | The bottom tray goes; its summary moves into the section as "N arrows into M propositions". | contextActions.ts:107-130; ContextSection.tsx:130-132 |
| CM-6 | planned-2 | Session bar above the board: Submit review, Exit session, Cancel step / Resume, Raw Lean diff…, Current \| Proposed. | plan2 §5.8, §1.1 2g · today's ProposalBanner still has M2's Accept, Feedback, Discard |
| CM-7 para 1 | built | A right click without movement opens the actions for what is under the cursor. | BoardInput.ts:462-470, 558-566; menu.ts:214-258; ContextMenu.tsx |
| CM-7 bullet 1 | built | "Without movement" means under 4 px between press and release. | canvas/gesture.ts:8 (CLICK_SLOP 4); BoardInput.ts:558-566 · stricter: a press that ever moved 4 px stays a drag |
| CM-7 bullet 2a | built | The thing under the cursor: a card, an arrow, a mark or the empty canvas. | menu.ts:27-33, 214-258 |
| CM-7 bullet 2b | planned-3 | The thing under the cursor can be a field. | plan3 §4.2 |
| CM-7 bullet 2c | planned-3 | A right click on a vocabulary card opens telelean's menu. | plan3 §4.2 · in slice 1 the band keeps VS Code's menu |
| CM-7 bullet 2d | built | The thing is selected first, unless already in the selection. | menu.ts:45-64; store.ts:2170-2186 |
| CM-7 bullet 2e | built | Right click on a card with others selected keeps the selection, offering Draw arrows from the selection plus its actions. | menu.ts:49-51, 180-181 |
| CM-7 bullet 2f | built | A right click on empty canvas keeps the selection. | menu.ts:61-62 |
| CM-7 bullet 3 | built | Empty canvas: New proposition here (placed at the point), Fit all, Tidy layout. | menu.ts:249-255; store.ts:1990; plan1 §8 1c1 |
| CM-7 bullet 4a | built | Over a text field or selected text, VS Code's menu stays. | BoardInput.ts:107-117, 671-673 |
| CM-7 bullet 4b | contradicted | Everywhere else telelean's menu replaces VS Code's. | **G8** BoardInput.ts:671-690, 791: listener on the board element only; the Vocabulary/Definitions band keeps VS Code's menu |
| CM-7 bullet 5; A21 | built | A right-drag only pans: no selection, no menu, even ending on a card. | BoardInput.ts:520-524, 558-566; plan1 §8 1c1; e2e s1-canvas |
| CM-7 bullet 6 | built | The toolbar's Context Menu section stays. | Header.tsx:118-137 |

### §7 Edit sessions (69)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| ES-1 sentence 1 | built | At most one session per model folder, on one subject. | extension/logic/runs.ts:169; core/run.ts:143; plan2 §3.1, §4.12 check 1 · slice 1: the run is the session; D3-41 |
| ES-1 sentence 2 | built | During a session: Current (your files, not editable) and Proposed (the working copy) views. | webview/run/ProposalBanner.tsx:3; plan2 §5.8, §5.10 · slice 2 makes Proposed the stage's copy, base-masked while hidden |
| ES-2 The question, bullets 1-3 | built | Formalize on selected drawn arrows or marks: each head a target, its question exactly its selected arrows. | core/formalize.ts:125; contextActions.ts:78; runner/run/manager.ts:871; plan2 §2.2, §4.12 · one target in slice 1 (AP-9) |
| ES-2 The question, bullet 4 | built | Warning and mention arrows cannot be selected for Formalize; a warning arrow offers "Draw this arrow". | gestures.ts:26-35, 215; menu.ts:235; plan2 §5.10 |
| ES-2 Several targets, bullet 1 | planned-2 | Several targets per session, sources first, one step each. | plan2 §3.2-§3.3, §4.12 formalizeOrder; D2-63; AP-9 · formalizeOrder still a stub |
| ES-2 Several targets, bullet 2 (first half); RV-11 sentence 1 | planned-2 | Every step re-judges every inference on the current state. | plan2 §3.3, §3.5, §4.9, §3.6 · effects applied once at the queue's end (D2-63, AP-24); judgeState a stub until 2b1b |
| ES-2 Several targets, bullet 2 (second half) | planned-2 | Apply re-judges every inference on the final state. | plan2 §3.10 step 2, §4.10 |
| ES-2 Several targets, bullet 3 (sentence 1) | planned-2 | A target may use another target only through a selected arrow. | plan2 §4.8, §4.9, §4.12 check 3; D2-50 |
| ES-2 Several targets, bullet 3 (sentence 2) | planned-2 | A source proved earlier in the session contributes its footprint as judged now; the new Result depends on it. | plan2 §4.8, §4.5 rule 2; core/review/deps.ts:93 (2a2); D2-48 · permittedFor a stub (2b1b) |
| ES-2 Several targets, bullet 4 | planned-2 | A source with neither a proof nor a pending claim follows AR-8. | plan2 §4.12 check 4, §5.11, §3.3 (A12, D2-4) · outside sessions built (core/formalize.ts:145) |
| ES-2 Preset (main) | planned-2 | In each step, everything existing at its start is frozen for that step at its value then. | plan2 §2.7, §3.3, §4.9 (D2-41), G5 against S₀; plan3 §3.5 · slice 1: core/gate/rules.ts:568, 1252; D3-1 (step limits, not freeze reasons) |
| ES-2 Preset, exception 1 | planned-2 | The empty Lean statement of each card at either end of a selected arrow is fuzzy. | plan2 §2.7 fuzzyStatements, §3.3; D2-21 (not at the source of Claude's own arrow) |
| ES-2 Preset, exception 2 (open proof) | planned-2 | Each target's Proof is open: fill it, prove a pending one, or replace it ("replaces your proof"). | plan2 §2.7 openProof, §2.2, §5.6; core/gate/rules.ts:698 · slice 1 replaces without the label; plan3 §0: not a proof whose Result was accepted |
| ES-2 Preset, exception 2 (no proof) | built | A step that does not end in a proof leaves the target's Proof exactly as it was. | core/gate/rules.ts:198-200, 319; plan1 §8 fixer 1e; plan2 §4.9, §3.2 (D2-46) |
| ES-2 Preset, exception 3 | planned-2 | A target's Dependencies are open for additions only; for a mark-questioned target, premises only. | plan2 §2.8 (D2-1), §2.7 openArrows, §4.9 · slice 1 adds no Claude arrows (★D8 a, AP-2) |
| ES-2 Preset, "A standing freeze always wins" | planned-3 | A standing freeze always wins over fuzzy and open. | plan3 §3.5, §3.11 (D3-18) |
| ES-2 Preset, protected cards (S1) | built | At the selected arrows, your sentences and existing Lean statements stay frozen. | core/gate/rules.ts:568, 1252; plan2 §4.9, §6.2 S1 |
| ES-2 Preset, last sentence | planned-3 | Unfreeze removes FZ-7 reasons only; it does not lift a step's preset. | plan3 D3-1, §2.8 (request_unfreeze refusal) |
| ES-2 Open the whole model (switch) | planned-3 | Formalize offers an "Open the whole model" switch. | plan3 §4.8 (3e2), §2.5, §3.10; D2-12 |
| ES-2 Open the whole model, bullet 1 | narrowed | The preset then fixes only standing freezes, the selected arrows, kept data and non-target Proofs. | D3-41, D3-12: more stays fixed (section 4) |
| ES-2 Open the whole model, bullet 1 (Proof broken) | planned-3 | A non-target proof the change breaks becomes a Proof broken item, re-provable later. | plan3 §3.10, §2.8 mark_proof_broken; D3-10, D3-47 · Claude must mark it; re-proving after the session; "make it pending" in slice 4 |
| ES-2 Open the whole model, bullet 2 | narrowed | Claude may change any other card, arrow, definition or vocabulary, and remove an arrow no proof uses. | D3-11, D3-14, D3-41, D3-12: limits in section 4 |
| ES-2 Open the whole model, bullet 3 | planned-3 | Every change comes back as an item; belief and proof-changing items need their own Accept. | plan3 §3.10; plan2 §4.4 |
| ES-2 Open the whole model, bullet 4 (reset) | planned-3 | The switch resets to off after each session. | plan3 §4.8; D3-29 (stays on for the session's later Formalizes) |
| ES-2 Open the whole model, bullet 4 (label, banner) | planned-3 | While on, the button reads "Formalize for dependencies (whole model)", and the banner says so. | plan3 §4.8, §4.5 |
| ES-2 Claude may add cards, bullets 1-2 | planned-3 | A switch (off by default) lets Claude add intermediate targets with empty questions; none used unproved. | plan3 §3.10 (3c2, 3e3), §4.8; D3-13 · D3-43 fallback to slice 4 |
| ES-2 Claude may add cards, bullet 3 | built | With it off, intermediate steps stay Lean lemmas (Vocabulary column). | slice 1 Vocabulary band; plan2 §7.3, §4.2 (D2-43), §4.7 · in sessions hidden until the reveal |
| ES-2 Claude may add cards, bullet 4 | built | Either way, Claude may propose missing premises. | slice 1 "Claude suggests" ghosts (plan1 §2.6); plan2 §3.8 |
| ES-2 last bullet (starting inference) | narrowed | The starting inference's preset is also the session's starting freezes (FZ-7 reasons). | D3-1: no binding start reasons; recorded only for EN-2's line (plan3 §2.2) |
| ES-2 last bullet (mid-stage inference) | planned-2 | A mid-stage inference's preset only limits its step; no FZ-7 reason. | plan2 §2.7, §3.2, §3.3; plan3 D3-1 |
| ES-3 bullet 1 | slice-4 | Transform cards… with no session opens the window and a provisional session freezing every non-selected card. | plan2 header; plan3 header, §3.12 |
| ES-3 Submit transform, unchanged | slice-4 | Submitting unchanged continues with an empty first stage and no Claude step. | plan2, plan3 headers |
| ES-3 Submit transform, needs Claude | slice-4 | A transform that needs Claude (TR-15) starts the first Claude step. | plan2, plan3 headers |
| ES-3 Submit transform, changed, no Claude | slice-4 | Changed, no Claude needed: drop the provisional session, undo its freezes, apply directly as one Undo step. | plan2, plan3 headers |
| ES-3 Cancel | slice-4 | Cancel drops the provisional session; it confirms only if freezes changed. | plan2, plan3 headers |
| ES-4 bullet 1 (private copy) | built | Claude works on the session's private copy. | runner shadow ws/ (M2); plan2 §3.1 |
| ES-4 bullet 1 (statements fixed) | built | Within a step, statements are fixed before proving. | core/run.ts (freeze_statements, M2); plan2 §2.8, §3.3 · rename (FZ-12) in plan3 §3.12 |
| ES-4 bullet 1 (checks) | planned-2 | Every Appendix B check runs, with up to 3 attempts. | plan2 §3.3, §4.8-§4.10; runner/run/manager.ts:1087 · slice 1: today's checks plus B.2 for one target |
| ES-4 bullet 2 | planned-2 | After a failed attempt, roll back to the newest passing state no older than your latest decision. | plan2 §3.4, §3.1; D2-62 |
| ES-4 bullet 3 | planned-2 | With no such state: "Claude's step did not pass: …"; Decline, Unfreeze, Formalize, Exit, no Accept. | plan2 §3.4, §3.6, §5.8; core/review/reducer.ts:297 (2a2); Unfreeze: plan3 §3.6 |
| ES-4 bullet 4 (cancel, caps, failure) | planned-2 | Cancel step, a cap or an environment failure returns to the previous stage, marked, with Retry step. | plan2 §3.4, §2.5, §5.8; D2-29, D2-55, D2-63 (rest of the queue "not run") |
| ES-4 bullet 4 (first step) | planned-2 | For the first step: an empty stage with the mark, Retry step and Exit session. | plan2 §3.4 |
| ES-4 bullet 5 | planned-2 | A step never ends the session. | plan2 §2.5, §3.4 |
| ES-4 bullet 6 (questions) | built | Claude may ask questions, which pause the step. | runner/run/manager.ts:1065, 1330; plan2 §2.4 (D2-74) |
| ES-4 bullet 6 (unfreeze requests) | planned-3 | Claude may make unfreeze requests, which pause the step. | plan3 §3.9, §2.8, §4.6 |
| ES-5 sentence 1 | built | A session changes your files only when it ends successfully. | runner run/manager.ts (accept path); plan1 §8 1f; plan2 §3.1, §6.1 2f |
| ES-5 bullet 1 | built | Your arrows are already in your files; nothing writes premises at the start. | runner/run/manager.ts:871 (1e) |
| ES-5 bullet 2 | planned-2 | Arrows you accept from Claude are written at Apply. | plan2 §2.8, §3.10 step 4 |
| ES-6 sentence 1 | built | A session survives a window reload. | runner/run/manager.ts:1786 (run.json v1); plan2 §3.11, §2.6; D2-72 |
| ES-6 sentence 2 | built | A running step is interrupted by a reload and can be resumed. | manager.ts:1070, 1403, 1448; plan2 §3.11; D2-55 |
| ES-6 sentence 3 (stages, end confirmation) | planned-2 | Stages and an open end confirmation come back after a reload. | plan2 §3.11, §2.6, §6.1 2d |
| ES-6 sentence 3 (Exit confirmation) | narrowed | An open Exit confirmation comes back after a reload. | D2-36: Exit's confirmation is a dialog that is not saved |
| ES-6 sentence 3 (transform drafts) | slice-4 | Transform drafts come back after a reload. | implied; no plan names it |
| ES-7 bullet 1 (base) | built | The base is your files at the session's start; it never moves. | manager.ts:146, 1677-1688; plan1 §8 1f; plan2 §3.1, §1.1 2f |
| ES-7 bullet 1 (items); RV-1 last bullet | planned-2 | Every item is computed between the base and the working copy. | plan2 §3.1, §4.2; core/review/items.ts:610 (2a1) |
| ES-7 bullet 3 (watch, notice) | planned-2 | telelean watches your files; the bar says "Your files changed since the session started" and lists them. | plan2 §3.9, §5.8 · no live watcher in slice 1 (AP-18) |
| ES-7 bullet 3 (Apply); EN-2 last bullet; A4 | planned-2 | While your files differ from the base, Apply is disabled until they match or you Exit; nothing merged. | plan2 §3.9, §3.10 step 4, §5.9 · built analogue: manager.ts:1680-1688 (Accept refuses) |
| ES-7 bullet 4 (no merge) | built | telelean never merges such changes into the session. | manager.ts:1680-1688; plan1 §8 1e, 1f; plan2 §1.1 2f, §3.1 |
| ES-7 bullet 4 (steps go on) | planned-2 | Claude's steps keep working on the private copy while the files differ. | plan2 §3.9 |
| ES-8 | planned-2 | Exit session, at any time, discards the work after EN-2's confirmation. | plan2 §3.10 step 6, §5.9, §2.4-§2.5 (D2-74), D2-36 · slice 1 has M2's Cancel and Discard |
| ES-9 bullet 1 (edits); ES-7 bullet 2 | built | During a session no board of the folder can be edited (fields, arrows, kinds, add, delete, move, Undo, Redo, History revert). | core/run.ts:140-145; extension/logic/boardSession.ts:410-425; store.ts:664-686; plan1 §8 1f |
| ES-9 bullet 1 (freezing) | planned-3 | No freezing or unfreezing on the Current view during a session. | plan3 §4.1, §2.5 |
| ES-9 bullet 1 (scope) | built | The lock covers every subject of the model folder. | boardSession.ts:417-425; AP-14 (i); plan2 §5.8 |
| ES-9 bullet 2 | built | You can still look: select, expand, pan, zoom, copy references, open in the editor. | plan1 §8 1f, 1c2 · Copy reference itself is slice 5 |
| ES-9 bullet 3 (transforms) | slice-4 | Changes you want go through Transform cards…, queued until Submit review. | plan2, plan3 headers |
| ES-9 bullet 3 (freezes) | planned-3 | During a session, freezes are made on the Proposed view. | plan3 §4.1 |
| ES-9 bullet 4 | built | In the Proposed view the handle, Draw arrows, Delete, Follows from nothing and Move to axioms are disabled, with the reason. | menu.ts:125, 171-174, 181-190; contextActions.ts:220; plan1 §8 1d; plan2 §5.10 |
| ES-9 bullet 5 (outside a session) | built | Outside a session the board stays directly editable, with the arrow actions added. | plan1 §8 1b, 1c2 |
| ES-9 bullet 5 (card-only Delete, S9) | contradicted | Today's "card only" Delete goes; a board Delete never leaves the card's Lean behind. | **G4** webview/dialogs/Dialogs.tsx:227, 280; core/actions.ts:58-62 (keepLean); docs/user-guide.md:122 |

### §8 Transform (45)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| TR-1 (a) | slice-4 | The window shows draft cards that start as exact copies of the selected cards. | AP-2 · nothing built; plan3 §3.12 adds only hooks |
| TR-1 (b) | slice-4 | Submitting the window unchanged changes nothing. | AP-2 |
| TR-2 (a) | slice-4 | You can create new cards of any kind, vocabulary included. | AP-2 · the board's A\|P box adds only axioms and propositions, outside sessions |
| TR-2 (b) | slice-4 | A new card's Kind (or a vocabulary card's Lean name) is chosen at creation, never fuzzy. | AP-2 |
| TR-2 (c) | slice-4 | telelean gives each new card its id. | AP-2 · must respect RF-2's never-reused ids |
| TR-3 (a) | slice-4 | A card dragged to the trash stays visible there and can be dragged back. | AP-2 |
| TR-3 (b) | slice-4 | Everything in the trash is deleted when the result is applied. | AP-2 |
| TR-3 (c) | slice-4 | No separate "delete permanently" (★D4 a). | AP-2 · none exists today |
| TR-4 bullet 1 (fuzzy) | slice-4 | An unfrozen empty field is fuzzy: "Claude fills this", its own icon, no italics, dashing or translucency. | AP-2 |
| TR-4 bullet 2 (open) | slice-4 | An unfrozen filled field is open: Claude may change it if the transform needs it. | AP-2 |
| TR-4 starting states (new card) | slice-4 | A new card's fields start fuzzy, except Kind and Lean name (chosen) and Proof (empty, keep-empty). | AP-2 |
| TR-4 starting states (copied card) | slice-4 | Copied card: Sentence, Why, Stance, Source open; Lean statement, Dependencies, Proof frozen; empty fields keep-empty. | AP-2; plan3 §2.2 (reason `transform` typed), §3.12 · also S11's fix |
| TR-4 fuzzy Dependencies | slice-4 | Fuzzy Dependencies ask Claude to propose; edited as a list of # references or the mark. | AP-2 · needs slice 5's # references |
| TR-4 Proof field | slice-4 | A Proof is never fuzzy: keep or clear it; clearing leaves the card unproved, never pending. | AP-2 |
| TR-5 | slice-4 | Typing in a field freezes it (a session freeze); clearing it makes it fuzzy. | D3-44; plan3 §2.2 |
| TR-6 | slice-4 | Only the CF-2 fields can be edited in the window. | AP-2 |
| TR-7 (a) | slice-4 | A "Claude may add cards" checkbox (default off). | AP-2; D3-43 · Formalize's switch of the same name may join it |
| TR-7 (b) | slice-4 | New plain vocabulary is always allowed and reviewed. | AP-2 · plan2 §4.2 already makes vocab: items |
| TR-7 (c) | narrowed | Splitting a Shaky card is always allowed and reviewed. | D2-15; plan3 §3.12 (D2-15 stays in slice 4) |
| TR-8 | slice-4 | An Instructions box takes prose for Claude, with # references. | AP-2; D2-13 interim · # references are slice 5 |
| TR-9 (a) | slice-4 | Submit transform finishes the window. | AP-2 |
| TR-9 (b) | slice-4 | Cancel closes without changes; a decline-Transform's item returns to "in review". | D2-14 (Transform disabled in the decline menu until slice 4) |
| TR-10 (a) | slice-4 | Any card can be transformed, vocabulary and proposed cards included. | AP-2 |
| TR-10 (b) | planned-3 | Other subjects' vocabulary can be frozen. | plan3 §2.2, §3.6 |
| TR-10 (c) | slice-4 | Other subjects' vocabulary cannot be transformed (it can be referenced). | AP-2; D3-41 · referencing is slice 5 |
| TR-11 (board) | built | Outside the window, Kind changes only through your board gestures, by D-11, impact shown. | plan1 §8 1a, 1b, 1c2; core/kindChange.ts; core/edit/planArrows.ts |
| TR-11 (window) | slice-4 | In a transform, Kind changes only through the window's Kind field, by D-11, impact shown. | AP-2 |
| TR-11 (empty Dependencies) | built | Emptying Dependencies never changes Kind. | plan1 §8 1b; core/gate/rules.ts (G5 type) · Claude's removals: plan3 §3.10 |
| TR-11 (Claude) | built | Claude never carries out a kind change. | core/gate/rules.ts COMPARED_FIELDS type; plan2 §4.9, §4.10 |
| TR-12 (a) | slice-4 | Typed Lean must pass the single-term rule or the vocabulary shape rule. | AP-2 · rules exist (core/gate/g0.ts:231; core/project/vocabulary.ts), not applied to typed Lean |
| TR-12 (b) | slice-4 | Typed Lean must elaborate in a scratch file against the current vocabulary. | AP-2 · runner/gate/scratch.ts exists for ghosts |
| TR-12 (c) | slice-4 | Names that do not exist yet are allowed and listed "Claude must define: …". | AP-2 |
| TR-13 bullet 1 | slice-4 | Deleting or changing a relied-on card lists dependents (frozen ones marked); offers rewrite, delete too, or leave to Claude. | AP-2 |
| TR-13 (nothing left broken) | slice-4 | Inside a session nothing is ever left broken. | AP-2 · plan3 §3.10 does it for whole-model changes (Proof broken, D3-10) |
| TR-13 (Delete anyway) | built | "Delete anyway" (dependents marked broken) only for direct edits outside a session. | webview/dialogs/Dialogs.tsx:218-224; plan1 §8 1f · transforms applied directly: slice 4 |
| TR-13 bullet 2 | slice-4 | The window warns when you change a sentence whose Lean stays frozen. | AP-2 |
| TR-14 (a) | slice-4 | A transform step writes no proofs. | AP-2 · also S8's fix |
| TR-14 (b) | slice-4 | A proof the transform breaks becomes a "Proof broken ‹card›" item. | AP-2 · reuse plan3 §3.10's item kind and mark_proof_broken |
| TR-14 (c) | narrowed | A Proof broken card can be re-proved with Formalize. | D3-47: only after Apply, not in the session that broke it |
| TR-14 (d) | slice-4 | Or made pending: its proof replaced by axiom ….holds, a belief item with its own Accept. | D3-10 |
| TR-15 (needs-Claude test) | slice-4 | Needs Claude iff: a fuzzy field, instructions, the add-cards tick, open Lean on a changed sentence, undefined names, or dependents left to Claude. | AP-2 |
| TR-15 (outside a session) | slice-4 | Otherwise, outside a session: direct edits, one Undo step; TR-12's checks only, no build or full gate. | AP-2 |
| TR-15 (inside a session) | slice-4 | Inside a session it applies at Submit review; only what you typed and follow-on edits count as yours. | AP-2 |
| TR-15 (copied content) | slice-4 | Content copied from Claude's proposal stays Claude's: same item and class, "updated" if you changed it. | AP-2 · also DO-2 and the Appendix B baseline |
| TR-15 (follow-on edits) | slice-4 | telelean's follow-on edits may touch frozen cards; they count as your change, and TR-13 lists them. | plan3 §3.12 hooks (reason `transform`, `revalue`) |

### §9 Review stage (111)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| RV-1 main, sentences 1-2 | planned-2 | A card has at most two items (fields; proof); arrows have their own. | plan2 §2.2, §4.2; core/review/keys.ts:16-22, items.ts:610 (2a1) |
| RV-1 main, sentence 3 | planned-2 | Each item keeps its id from stage to stage. | plan2 §2.2 (D2-31, AF7), §3.5; core/review/hash.ts:111 |
| RV-1 main, sentence 4 | planned-2 | A newer proposal updates its item in place: back in review, "updated", the previous one viewable. | plan2 §3.5, §2.3, §5.6; core/review/reconcile.ts:135-245 (2a2) |
| RV-1 Add ‹card› | planned-3 | A new card Claude adds is an Add item. | plan3 §3.10 (3c2, 3e3) · D3-43 fallback; never from Shaky splits (D2-15) |
| RV-1 Add premise | planned-2 | A missing premise Claude proposes, with its arrow into the target, is one item. | plan2 §3.8, §2.2 · slice 1: "Claude suggests" ghost with "I hold this" |
| RV-1 Add premise, sub-bullet 1 (outside ws/) | planned-2 | It stays outside the working copy until you accept it. | plan2 §3.1, §3.8 · exception: an adopted ghost of a converted v1 run (D2-16) |
| RV-1 Add premise, sub-bullet 1 (scratch check) | built | A scratch check that question plus premise prove the target ("closes the gap (checked)"; "may simply restate the target"), B.2 included. | runner/gate/engine.ts:809, 840; webview/run/GhostSuggestion.tsx:57, 61; plan2 §3.8, §5.6 |
| RV-1 Add premise, sub-bullet 1 (re-check) | planned-2 | It is re-checked whenever something it relies on changes. | plan2 §3.8, §3.5 |
| RV-1 Add premise, sub-bullet 2 | planned-2 | Part of the target's result; it appears only when that Result is revealed. | plan2 §4.2, §4.7 · revealed with the whole stage (D2-61) |
| RV-1 Add premise, sub-bullet 3 | narrowed | Into frozen Dependencies it comes with an unfreeze request, accepted only after you allow it. | D3-36: no automatic request; refused when proposed, or the Accept waits until you unfreeze |
| RV-1 Add premise, sub-bullet 4 | planned-2 | Accepting asks how you hold it (axiom, or proposition pending proof); always a belief item. | plan2 §3.8, §5.6, §4.4 b1; core/review/classify.ts:158 |
| RV-1 Add premise, sub-bullet 5 (write) | planned-2 | telelean writes the card (Claude's wording) and its arrow, with no extra Claude step. | plan2 §3.8, D2-71 · slice 1's "I hold this" does it as an axiom only |
| RV-1 Add premise, sub-bullet 5.1 | planned-2 | The written premise is re-checked; a different explicit form returns it to review, "meaning differs in place". | plan2 §3.8 (engine.writePremise) |
| RV-1 Add premise, sub-bullet 5.2 | planned-2 | telelean completes and checks the target's proof; until then "completion not checked". | plan2 §3.8; D2-56, D2-71 (a failed completion is taken out, with Retry step) |
| RV-1 Add premise, sub-bullet 5.3 | planned-2 | The target's Result then returns to review, "updated". | plan2 §3.8 |
| RV-1 Add premise, sub-bullet 5.4 | planned-2 | A second accepted premise leaves the first completion standing and is listed as unused. | plan2 §3.8 |
| RV-1 Add arrow | planned-2 | An arrow Claude adds is its own item. | plan2 §2.8 (D2-1), §2.2, §4.2 |
| RV-1 Remove arrow | planned-3 | An arrow Claude removes is its own item. | plan3 §2.8, §3.10; D3-14 · whole model only |
| RV-1 Add/Remove arrow, sentence 2 | planned-2 | An added arrow into a target is part of that target's result. | plan2 §4.2, §4.7 |
| RV-1 Add/Remove arrow, sentence 3 | planned-3 | Arrows removed with a deleted card belong to its Delete item. | plan3 §3.10 |
| RV-1 Change ‹card› (fields) | planned-3 | A Change item shows field by field, before → after. | plan3 §3.10; plan2 §2.3, §5.6 · no slice-2 step produces Change items |
| RV-1 Change ‹card› (mentions) | planned-3 | A Change item lists every card whose statement or proof mentions what it changes. | plan2 §2.3 mentionedBy, §5.6; produced from plan3 §3.10 |
| RV-1 Formalize ‹card› | planned-2 | A Formalize item fills an empty Lean statement and changes nothing else. | plan2 §4.2, §4.9; core/review/items.ts (2a1) |
| RV-1 Delete ‹card› | planned-3 | A Delete item deletes the card, its Lean and its arrows; never leaves a .holds behind. | plan3 §2.8, §3.10; D3-14 |
| RV-1 Vocabulary (N), sentences 1-2 | narrowed | New plain vocabulary is one item with sub-items ("k of N accepted"). | D2-31: each term its own item, grouped under "Vocabulary (N)" |
| RV-1 Vocabulary (N), sentences 3-4 | planned-2 | Changes to vocabulary, definitions and presuppositions get own items; a helper instance belongs to its presupposition. | plan2 §4.2, §2.2; core/review/items.ts (2a1) · changes to existing vocabulary only arise with the whole model (slice 3) |
| RV-1 Result, sentence 1 | narrowed | One Result item per inference, always present. | D2-44: none for an inference whose step never ended ("not run") |
| RV-1 Result, sub-bullet 1 | planned-2 | A revealed Result shows the verdict, the proof ("replaces your proof"), the band and what it rests on. | plan2 §2.3, §5.6 |
| RV-1 Result, sub-bullet 2 | planned-2 | Verdict: established; proved but not established (with BD-6's chip); or not proved. | plan2 §2.3, §5.6 |
| RV-1 Result, sub-bullet 3 | built | "Proved from nothing" is a flag: "check what the statement says". | webview/run/ReportCard.tsx:107-111; core/review/texts.ts:68-73 (2a1); plan2 §2.2, §5.6 |
| RV-1 Result, sub-bullet 4 | planned-2 | Selected arrows the proof did not need are listed "not needed" and stay dotted. | plan2 §2.3, §5.4, §5.6 · slice 1: "Not used by the proof" (ReportCard.tsx:113) |
| RV-1 Result, sub-bullet 5 | planned-2 | If the session changed the target's statement: "proves a statement changed in this session". | plan2 §2.2, §4.4 c2 · reachable from slices 3 and 4 |
| RV-1 Proof broken ‹card› | planned-3 | A broken proof becomes a Proof broken item (TR-14). | plan3 §3.10 (mark_proof_broken); D3-10, D3-47; plan2 §5.6 · "make it pending" in slice 4 |
| RV-2 sentence 1, bullet 1 | planned-2 | The review list is the status table, grouped by card, arrow items under their target. | plan2 §5.5, §2.3 |
| RV-2 bullet 2 (rows) | planned-2 | Each item shows its label, status and badges (belief, changes what is proved, depends on N). | plan2 §5.5 |
| RV-2 bullet 2 (header) | planned-2 | Counts at the top, with an "in review" filter. | plan2 §5.5 |
| RV-2 bullet 3 | planned-2 | Back/Next or ↑/↓ cycle items; A accepts, D declines; Accept & next. | plan2 §5.5, §5.6; D2-37 (Shift+A) |
| RV-2 bullet 4 (detail) | planned-2 | The detail shows your sentence above its Lean, a Fully explicit toggle, and what the Lean uses. | plan2 §5.6, §3.12, §2.3 |
| RV-2 bullet 4 (arrow item) | planned-2 | An arrow item's detail shows both cards' sentences. | plan2 §5.6 |
| RV-2 bullet 4 (narrow panel) | planned-2 | On a narrow panel the detail replaces the list. | plan2 §5.5 |
| RV-3 bullet 1, sentence 1 | planned-2 | Items start in review, then become accepted or declined (with an option). | plan2 §2.2, §3.5, §4.6; core/review/reducer.ts:1210 · D2-17 adds "withdrawn" |
| RV-3 bullet 1, sentence 2 | narrowed | You can change any item's status at any time in the session. | D2-62, D2-8 (AP-24 #2): not during a step, not hidden Results, not while confirming |
| RV-3 bullet 2, sentence 1 | planned-2 | "To be redone" when something it depends on is declined. | plan2 §3.6, §4.6, §3.5; D2-28; reducer (2a2) |
| RV-3 bullet 2, sentence 2 (Submit) | narrowed | "To be redone" does not block Submit review. | D2-61, D2-64: Submit needs the results shown (section 4) |
| RV-3 bullet 2, sentence 2 (redo) | planned-2 | The next step proposes a to-be-redone item again. | plan2 §3.7, §3.5 |
| RV-3 bullet 3 | planned-2 | Markers "updated" and "no alternative found". | plan2 §2.2, §3.5; core/review/texts.ts:54 |
| RV-4 header | narrowed | Accept freezes the item's content as a session freeze until its status changes. | D3-4: ends only by your own status change, an Unfreeze or a confirmed cascade · slice 2's Accept freezes nothing |
| RV-4 bullet 1 | planned-3 | Accepting Add freezes every field of the new card; Add premise, those plus its arrow. | plan3 §3.7 acceptCovers |
| RV-4 bullet 2 | planned-3 | Accepting Add arrow freezes the arrow. | plan3 §3.7 |
| RV-4 bullet 3 | planned-3 | Accepting Change or Formalize freezes sentence and Lean together, plus other changed fields. | plan3 §3.7 |
| RV-4 bullet 4 | planned-3 | Accepting a Result freezes the proof. | plan3 §3.7 |
| RV-4 bullet 5 | planned-3 | Accepting Delete or Remove arrow freezes nothing, but Claude may not re-add it. | plan3 §3.4 step 1, §3.7, §2.8; D3-50 |
| RV-4 bullet 6 | planned-3 | Accepting vocabulary freezes each term. | plan3 §3.7 |
| RV-5 edge 1 | planned-2 | I depends on J when I's elaborated Lean mentions what J adds or changes. | plan2 §4.5 rule 1, §4.1; core/review/deps.ts:93 (2a2) |
| RV-5 edge 2 | planned-2 | A Result depends on what its inference uses, including an arrow item its proof uses. | plan2 §4.5 rule 2; deps.ts (2a2) |
| RV-5 edge 3 | planned-2 | An arrow item depends on the item that adds a card at either end. | plan2 §4.5 rule 3; deps.ts:128 · fires once slice 3 adds cards |
| RV-5 edge 4 | planned-2 | An added arrow that would close a cycle depends on the item removing another. | plan2 §4.5 rule 4; deps.ts:138 · fires with slice 3's Remove arrow (A17) |
| RV-5 edge 5 | planned-2 | A Delete or Change depends on the items removing other mentions of its subject. | plan2 §4.5 rule 5; plan3 §3.10 · Change and Delete exist from slice 3 |
| RV-5 bullet 2 | planned-2 | Accept is enabled only when everything it depends on is accepted; otherwise it lists what is missing (Select them). | plan2 §4.6, §2.3, §5.6; reducer.ts:1232 · D2-26: cycle members one by one |
| RV-5 bullet 2 (side effects) | planned-2 | Nothing is ever accepted as a side effect. | plan2 §3.1, §4.6 |
| RV-5 bullet 3 (decline, status change) | planned-2 | Leaving "accepted" lists the accepted dependents and takes them along; cancelling cancels. | plan2 §3.6, §4.6; D2-64; reducer.ts:739 · on a decline they become "to be redone" (D2-28) |
| RV-5 bullet 3 (unfreeze) | planned-3 | An item leaves "accepted" when its content is unfrozen, with the same list. | plan3 §3.6, §4.4 · only in a stage (D3-7, D3-35) |
| RV-5 bullet 3 (your change) | slice-4 | An item leaves "accepted" when you change its content or dependencies (transform, D-11 follow-on). | implied; no plan names it |
| RV-5 bullet 4 | planned-2 | The accepted items always form a self-contained whole. | plan2 §4.6, §3.5, §4.10 |
| RV-6 bullet 1 | narrowed | Each Result stays neutral until what it depends on is decided or revealed, or Show result. | D2-61 (AP-24 #1): one reveal per stage (section 4) |
| RV-6 bullet 1 (seen early) | planned-2 | Show result notes that you saw the result early. | plan2 §4.7, §5.6 · not while a step runs (D2-62) |
| RV-6 bullet 2 | narrowed | Until then the Proposed view shows derived data as if the target's .holds were as at the step's start. | D2-61 (D2-6 withdrawn): masks to the base B · slice 1d's overlay leaks go in slice 2 (plan2 §7.3) |
| RV-6 bullet 3 (verdict, proof) | planned-2 | Until revealed, hide the verdict, the proof and what it rests on. | plan2 §4.7, §2.3; D2-5 |
| RV-6 bullet 3 (Claude's proposals) | planned-2 | Until revealed, hide the premises and arrows Claude proposes into the target. | plan2 §4.7 |
| RV-6 bullet 3 (report) | planned-2 | Until revealed, hide the report's verdicts, Claude's summary and "Assumed without asking". | plan2 §4.7; D2-10 |
| RV-6 bullet 3 (lemmas) | planned-2 | Hide new lemmas and proof-only declarations until every Result using them is revealed. | plan2 §4.7; D2-43 |
| RV-6 bullet 3 (proof exists) | planned-2 | Until revealed, hide whether a proof exists at all, everywhere. | plan2 §4.7, §6.1 2c2, 2e |
| RV-6 bullet 4 (counts) | planned-2 | Counts, badges, missing lists and TR-13's lists leave out hidden items and proofs. | plan2 §2.3, §4.5 · TR-13's lists come with slice 4 |
| RV-6 bullet 4 (raw diff) | planned-2 | Raw Lean diff… counts as Show result for every Result it shows. | plan2 §2.4, §5.8 · slice 1 opens it without counting (plan2 §7.3 leak 4) |
| RV-6 bullet 5 | planned-2 | The result is hidden again if any of those items returns to review. | plan2 §4.7, §3.5; core/review/reveal.ts (2a2) |
| RV-7 header | planned-2 | Group Accept skips items that need their own Accept, and says so. | plan2 §4.6, §5.5; D2-32; reducer.ts:211 |
| RV-7 belief 1 | planned-2 | Belief: adds an axiom card, or a premise accepted as pending. | plan2 §4.4 b1; classify.ts:158-161 |
| RV-7 belief 2 | planned-2 | Belief: formalises an axiom, or changes an axiom's sentence or Lean. | plan2 §4.4 b2; classify.ts:163 |
| RV-7 belief 3 | planned-2 | Belief: adds or changes any Lean axiom. | plan2 §4.4 b3; classify.ts:165-172 · D2-40: no new unmarked Prop axiom at all |
| RV-7 belief 4 | planned-2 | Belief: a definition, instance, coercion or vocabulary change in a statement's elaborated closure (not new plain vocabulary). | plan2 §4.4 b4, §4.1; D2-30, D2-42, D2-25; classify.ts:177 |
| RV-7 belief 5 | narrowed | Belief: an axiom's "meaning changed" item (FZ-5). | D3-9: no such items; b5 unused |
| RV-7 belief, last line | planned-2 | Items are classified by their effect in Lean, never by column. | plan2 §4.4, §4.10 |
| RV-7 changes what is proved 1 | planned-2 | Changes a Lean statement or proof existing at the start, or the statement a Result proves. | plan2 §4.4 c1, c2 |
| RV-7 changes what is proved 2 | planned-2 | Changes the sentence of a card with Lean: "sentence and Lean may disagree". | plan2 §4.4 c3, §2.2, §5.6 · arises from slices 3 and 4 |
| RV-7 changes what is proved 3 | planned-2 | Adds an arrow into a proposition ("adds no new basis" when it does not). | plan2 §4.4 c4 (AF8); classify.ts:140 |
| RV-7 bullet 3 | planned-2 | Every Add arrow into a proposition changes what is proved; removing an arrow is not RV-7. | plan2 §4.4; plan3 §3.10 |
| RV-7 bullet 4 | planned-2 | Classes are recomputed on every judged state; an accepted item that becomes RV-7 returns to review. | plan2 §3.5, §4.6; D2-23; core/review/reconcile.ts |
| RV-7 bullet 5 | slice-4 | Content you typed yourself counts as accepted by you. | implied (TR-15); no plan names it |
| RV-8 sentence 1 | planned-2 | Select several items and Accept or Decline them together. | plan2 §5.5, §5.7 |
| RV-8 bullet 1 | planned-2 | Group Accept takes every non-RV-7 item whose dependencies are met, and lists what it left. | plan2 §4.6, §5.5; reducer.ts:211 · hidden Results left out (D2-8) |
| RV-8 bullet 2; §10 preamble (group) | planned-2 | Group Decline applies one option to every item, and plain Decline to arrow items. | plan2 §4.6, §5.7; reducer.ts:249 |
| RV-8 bullet 2 (Transform) | slice-4 | Decline → Transform opens one window for all the selected items. | D2-14; plan2 §5.7 (shown disabled) |
| RV-9 bullet 1, sentences 1-2 | narrowed | Formalize at any point in a stage: the step runs at once, its items join the stage. | D2-65, D2-63, D2-53, D2-20 (section 4) |
| RV-9 bullet 1, sentence 3 | planned-2 | Cards declined with Transform or Shaky count as frozen for it. | plan2 §4.12 checks 3, 5 (D2-53), §4.9; plan3 §3.10 · the Transform part is slice 4 |
| RV-9 bullet 1, sentence 4 | planned-2 | Mid-stage Formalize is disabled while a step runs. | plan2 §3.2, §5.11; D2-62 |
| RV-9 bullet 2 | slice-4 | Transforms started during a stage wait until Submit review. | transform window: slice 4 |
| RV-10 sentence 1 | planned-2 | The stage report sits above the list. | plan2 §5.3, §5.4 |
| RV-10 contents 1 | planned-2 | It contains Claude's summary. | plan2 §5.4 (D2-10) · slice 1's report card has it |
| RV-10 contents 2 | planned-2 | For each revealed target: the verdict, the band, what it rests on. | plan2 §5.4, §2.3 |
| RV-10 contents 3 | planned-2 | Selected arrows that were not needed. | plan2 §5.4 |
| RV-10 contents 4; A10 last sentence | planned-2 | What is missing, including drawn but unselected arrows ("select ‹card› → ‹target› too"). | plan2 §5.4 · built for one run: webview/model/run.ts:555 |
| RV-10 contents 5 | planned-2 | "Consistency unchecked". | plan2 §5.4 · slice 1's report card shows it |
| RV-10 contents 6 | planned-3 | Open unfreeze requests. | plan3 §2.4, §3.9, §4.6 |
| RV-10 bullet 2 | narrowed | "Assumed without asking" lists Claude's choices, each with Ask me instead (a Transform decline). | D2-13: a Shaky decline with the note prefilled until slice 4 |
| RV-11 sentence 2 | planned-2 | A Result whose verdict or dependencies changed returns to review, "updated", hidden again. | plan2 §3.5; core/review/reconcile.ts:139, 172 |
| RV-11 sentence 3 | planned-2 | A proof accepted earlier counts like yours for later inferences, whose reports show it. | plan2 §4.8 (D2-48), §5.4 |
| RV-12 sentence 1 | narrowed | Submit review is enabled once nothing is "in review". | D2-64, D2-27: also needs the results shown, no step running or queued, nothing re-checking |
| RV-12 bullet 1 | slice-4 | Queued transforms needing no Claude are carried out first, as accepted items. | implied; no plan names it |
| RV-12 bullet 2 | planned-2 | All accepted or rejected, nothing to redo, no transform for Claude: to the end confirmation, no Claude step. | plan2 §3.7 (D2-54), §3.6 |
| RV-12 bullet 3 | narrowed | Otherwise one Claude step handles transforms, Shaky and to-be-redone items; accepted items carry over. | D2-2, D2-57: one step per affected inference |
| RV-13 | planned-2 | A step that proposes nothing says so, with Claude's reason. | plan2 §3.4, §5.4, §2.3 · shown with the results (D2-10) |

### §10 Decline options (18)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| §10 preamble (option required) | planned-2 | A decline must pick one option. | plan2 §2.4, §5.7 |
| §10 preamble (Results) | planned-2 | On a Result: Reject (keeps the previous proof; that proof barred) or Shaky; no Transform. | plan2 §5.7 |
| DO-0 bullet 1, sentence 1 | planned-2 | Arrow items have no options: Decline puts the arrow back or takes it away at once. | plan2 §4.6, §5.7, §5.5; reducer (2a2) · "put back" applies to slice 3's Remove arrow |
| DO-0 bullet 1, sentence 2 | planned-2 | Claude may not propose that exact arrow again in the session. | plan2 §2.2 rejectedArrows, §4.9; reducer.ts:479 |
| DO-0 bullet 2, sub-bullet 1 | planned-2 | Declining an arrow makes every Result whose proof uses it "to be redone". | plan2 §4.6; D2-59; reducer.ts:483 |
| DO-0 bullet 2, sub-bullet 2 | planned-3 | Any card Claude added at either end is declined, with its items. | plan3 §3.10 (3c2) · D3-43 fallback |
| DO-0 bullet 2, last line | planned-2 | Your own cards are never declined by it. | plan2 §4.6; plan3 §3.10 |
| DO-0 bullet 3 | planned-2 | An Add premise carries its arrow; declining it declines both. | plan2 §4.6, §3.8 |
| DO-1 bullet 1 | planned-2 | Reject restores the previous version in the working copy at once. | plan2 §3.6 (planItemRevert), D2-28 · planItemRevert is a 2b2 stub |
| DO-1 bullet 2, sentences 1-2 | planned-2 | Claude may not propose that exact thing again; exact repeats are checked. | plan2 §4.9 (D2-66), §3.7, §4.3 |
| DO-1 bullet 2, sentence 3 | planned-2 | A reworded repeat comes back as the same item, "updated"; the rejected version stays listed. | plan2 §3.5 (D2-70), §2.3 |
| DO-1 bullet 3 | planned-3 | Reject does not freeze the card; to stop all changes you also Freeze it. | plan3 §3.6 · slice 2's Reject freezes nothing |
| DO-1 bullet 4 | planned-2 | Rejected items are listed under "Rejected in this session", where you can un-reject them. | plan2 §2.3, §3.6, §5.7; reducer.ts:532-544 · refused after a newer version, on a conflict, or for a hidden Result |
| DO-2 | slice-4 | Transform opens the window on the proposal beside the previous version; Claude's fields stay marked, not accepted by submitting. | D2-14; plan2 header, §5.7 |
| DO-3 bullet 1, sentence 1 | narrowed | All items marked Shaky in a stage are taken together. | D2-2, D2-57: reworked per affected inference, one step each |
| DO-3 bullet 1, sentence 2 | narrowed | Claude may keep, change, remove, split or merge those cards. | D2-15 (plan2 §3.7; plan3 §3.10, §3.12, D3-49): content only |
| DO-3 bullet 2 | planned-2 | The new set must not be identical to the declined set; telelean checks. | plan2 §3.7, §4.3 |
| DO-3 bullet 3 | planned-2 | If Claude finds no different arrangement, the items come back "no alternative found". | plan2 §2.8, §3.5; reconcile.ts:271 |

### §11 Ending a session (17)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| EN-1 sentence 1 | planned-2 | Success: you submit a stage with every item accepted or rejected and no transform for Claude queued. | plan2 §3.7, §3.10 · the transform condition comes with slice 4 |
| EN-1 sentence 2 | planned-2 | Otherwise the session ends by Exit session. | plan2 §3.10 step 6, §3.13 |
| EN-2 sentence 1 | planned-2 | A confirmation always comes first (except Cancel in the session-starting window with no freeze change). | plan2 §3.10, §5.9; D2-36 · the ES-3 exception comes with slice 4 |
| EN-2 Apply, bullet 1 | planned-2 | Apply's confirmation shows the changes, each as a link. | plan2 §5.9 |
| EN-2 Apply, bullet 2 | slice-4 | It shows, separately, what you typed yourself in transforms. | implied; plan2's EndConfirmationView has no such section |
| EN-2 Apply, bullet 3 | planned-2 | It shows the final check on exactly the final state; the backstop always runs. | plan2 §3.10 step 2, §4.10, §5.9 |
| EN-2 Apply, bullet 4 | planned-3 | It shows the freeze changes your decisions caused, each with a keep tick. | plan3 §4.7, §5.4; D3-33 |
| EN-2 Apply, bullet 5 | narrowed | It summarises the starting freezes in one line ("the other N cards return to how they were"). | D3-1: no starting freezes; the line names step limits instead |
| EN-2 Exit (text) | planned-2 | "discards N accepted items and M items in review; your files are not changed". | plan2 §5.9 |
| EN-2 Exit (freeze list) | planned-3 | Exit shows the same freeze list, with keep ticks only for content in your files. | plan3 §4.7, §5.4 |
| EN-2 bullet "Back to review" | planned-2 | Every confirmation has Back to review, changing nothing. | plan2 §3.10 step 3, §5.9 (D2-54); plan3 §5.3 (R2-2) · freezes made while confirming stay |
| EN-2 bullet "final check fails" | planned-2 | If the final check fails, Apply is disabled, the failures listed, nothing applied. | plan2 §3.10 step 3, §5.9 |
| EN-3 sentence 1 (history) | planned-2 | Apply writes one history entry and one Undo step. | plan2 §3.10 step 4 (D2-67), §6.1 2f · D2-39: an empty Apply only records the outcome |
| EN-3 sentence 1 (freezes) | planned-3 | Apply then restores the freezes, except those ticked keep. | plan3 §5.4; D3-32 |
| EN-3 sentence 2 | planned-2 | Apply records accepted definitions and presuppositions as endorsed. | plan2 §2.6 (D2-18), §3.10 step 4 |
| EN-4 sentence 1 | planned-2 | Exit discards the working copy. | plan2 §3.10 step 6 · slice 1's Discard does this |
| EN-4 sentence 2 | built | Your answers to Claude's questions stay recorded. | runner/run/manager.ts:1228-1369 (decisions.json); plan2 §3.10 step 6 |

### §12 Undo and redo (35)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| UN-1 bullet 1a | built | The board stack holds your edits to your files: in-board Undo per subject, 100 steps, History behind it. | runner/workspace/undo.ts:1-98; modelWorkspace.ts:885-928 |
| UN-1 bullet 1b | planned-3 | The board stack also holds your standing freezes. | plan3 §5.1, §2.6; D3-21 |
| UN-1 bullet 2 | planned-2 | The session stack holds your actions in the session. | plan2 §4.6, §2.2, §2.6 (2e, 2h) · core reducer built (core/review/reducer.ts:832-1224) |
| UN-1 bullet 3 | planned-2 | Ctrl+Z, Ctrl+Shift+Z and the buttons act on the stack of the view you are in. | plan2 §5.12, §5.5; D2-38 · today they act on the board stack; the Proposed view posts nothing (PROPOSED_NO_UNDO, removed in 2h) |
| UN-1 bullet 4 (board) | built | The board stack's Undo/Redo tooltip names the step. | webview/state/store.ts:702-710 |
| UN-1 bullet 4 (session) | planned-2 | The session stack's tooltip names the step ("Undo: Accept ‹item›"). | plan2 §2.3, §5.12; plan3 §4.9 |
| UN-1 bullet 5 | planned-2 | The two stacks never share a step; an action on one never changes the other. | plan2 §4.6, §5.12; plan3 §5.1, §5.3 · the board stack's lock during a run is built (1f) |
| UN-2 bullet 1 | built | Each board edit is one Undo step (text fields, kind, arrows and mark, add, delete, moves). | runner/workspace/modelWorkspace.ts:885-899; plan1 §2.4, §8 1f; AP-12 |
| UN-2 bullet 1 (freezes) | planned-3 | Freezing or unfreezing outside a session is one board step. | plan3 §5.1, §2.6; D3-21, D3-16 · D3-44: a text edit carries its new standing freeze in the same step |
| UN-2 para 2 | planned-2 | Each Apply is one board step, so one Undo takes back a whole session. | plan2 §3.10 step 4 (D2-67), §5.9; plan3 §5.4 (D3-32) · D2-39: an empty Apply adds no step |
| UN-2 para 3 | built | Undo refuses a step whose files changed since, pointing to History. | modelWorkspace.ts:912-913 · for freeze steps a different text (D3-15, plan3 §5.1) |
| UN-3 para 1 | built | While a session is active the board stack can neither undo nor redo. | extension/logic/boardSession.ts:166-167, 409-425; core/run.ts:140-143; store.ts:670-685; plan1 §8 1f; AP-18 · History revert locked too |
| UN-3 bullet 1 | built | On the Current view Undo and Redo are disabled, with the reason. | store.ts:696-710; Header.tsx:82-113; main.tsx:99-125 · new text in plan2 §5.12 |
| UN-3 bullet 2 | planned-2 | The board stack unlocks when the session ends, with Apply as its newest step. | plan2 §3.10 step 4 · D2-39: an empty Apply adds no step |
| UN-4 bullet 1 | planned-2 | An item's status change, with its cascade, is one session step. | plan2 §4.6, §3.6, §5.12 · core: reducer.ts:832, 1060, 1188 |
| UN-4 bullet 2 | planned-2 | Show result is one step; undoing it hides the result again, but the seen-early note stays. | plan2 §4.6, §4.7 · core: reducer.ts:940; D2-61 (one reveal per stage) |
| UN-4 bullet 3 | planned-3 | Freezing and unfreezing are session steps. | plan3 §5.3 (3b), §4.9 (3g); D3-22 |
| UN-4 bullet 4a | slice-4 | Queueing or dropping a transform is a session step. | plan2 header; plan3 §0 |
| UN-4 bullet 4b | slice-4 | Inside the transform window, text fields have their own undo while you type. | plan3 §0 · board text fields already do (main.tsx:111) |
| UN-4 bullet 5 | planned-2 | Moving cards on the Proposed view is a session step. | plan2 §4.6, §5.10, §5.12; D2-33 · core: reducer.ts:979 |
| UN-4 para 2a | planned-2 | Undoing an action equals doing its inverse by hand, with RV-5's list of dependents. | plan2 §3.6, §4.6; D2-73 · core: reducer.ts:1060-1186 |
| UN-4 para 2b | planned-3 | Undoing a freeze action follows FZ-7's reasons, as by hand. | plan3 §5.3; D3-22 · D3-48: an Undo or Redo that would change frozen content is refused |
| UN-4 para 2c | narrowed | Undoing while Claude works follows FZ-10. | D2-62, D3-23, D3-8: only freeze actions during a step (section 4) |
| UN-5 para 1 | planned-2 | Anything that starts or feeds a Claude step seals the session stack. | plan2 §4.6, §3.2, §3.4, §3.7, §5.12 · core: reducer.ts:1003-1007, 1064; texts.ts:104-105 |
| UN-5 bullet 1a | narrowed | Submit review seals the stack. | D2-54: only when it queues Claude steps |
| UN-5 bullet 1b | planned-2 | A mid-stage Formalize seals the stack. | plan2 §3.2, §4.6 |
| UN-5 bullet 1c | planned-2 | Retry step seals the stack. | plan2 §3.4, §4.6 |
| UN-5 bullet 1d | planned-3 | Answering a question seals the stack. | plan3 §2.3 (SealBy answer), §5.3; D3-23 · slice 2 adds none (AP-24): the queue's seal covers it |
| UN-5 bullet 1e | planned-3 | Answering an unfreeze request seals the stack. | plan3 §3.9, §5.3; D3-23 |
| UN-5 bullet 2 | planned-2 | Earlier decisions can still be changed directly (RV-3). | plan2 §3.6, §4.6; core/review/texts.ts:105 |
| UN-5 bullet 3 | planned-2 | While a step runs, use Cancel step; after it, decline its items. | plan2 §2.5, §3.4, §5.8; D2-55 |
| UN-6 para 1 | planned-2 | When the session ends, its stack is discarded. | plan2 §4.6, §3.10 step 4 |
| UN-6 bullet 1 | planned-2 | Exit cannot be undone, and its confirmation says so. | plan2 §5.9, §4.6 |
| UN-6 bullet 2 | planned-2 | Apply can be undone, as one board step. | plan2 §3.10 step 4, §5.9; D2-67 · D2-39; plan3 §5.4 (D3-32) |
| UN-7 | built | Hand edits in VS Code use the editor's undo; telelean's stacks never contain them. | modelWorkspace.ts:885-899, 957-959, 986-988, 1084-1090 |

### §13 Reference system (10)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| RF-1 (a) | slice-5 | Typing # in any prose field opens a dropdown of cards and fields, filtered as you type. | AP-2; plan1, plan2, plan3 "not in slice" |
| RF-1 (b) | slice-5 | Picking inserts a "Card › Field" chip; clicking it reveals the target. | AP-2 |
| RF-2 (a) | slice-5 | Stored by stable id (card id, or a vocabulary card's Lean name), plus an optional field. | AP-2 |
| RF-2 (b) | slice-5 | telelean never reuses a card id within a subject. | AP-2 · not true today: ids are sentence slugs (core/markup/ids.ts slugOf); slice 3 keys standing freezes by id (D3-16) |
| RF-2 (c) | slice-5 | A reference shows its target's current name; a deleted target shows "deleted card". | AP-2 |
| RF-2 (d) | slice-5 | In Lean docstrings and everything Claude reads, references appear as the target's sentence. | AP-2 |
| RF-3 | slice-5 | # opens no dropdown in Lean fields; Esc leaves a plain #. | AP-2 |
| RF-4 | slice-5 | No short numbers; you find cards by searching their sentences (★D6 a). | AP-2 · no sentence search in the webview today |
| RF-5 (a) | slice-5 | A frozen card's references hold their targets (FZ-4). | plan3 §3.4 step 3 (heldFields() returns []) · also S12's fix |
| RF-5 (b) | slice-5 | TR-13 warns about references as reliance. | AP-2 · needs slice 4's TR-13 |

### §14 Guarantees (36)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| §14 item 1 (a) | built | A session's changes reach your files only when it ends successfully. | plan1 §8 1f; plan2 §3.1, §3.10 · re-done for multi-stage sessions in slice 2 |
| §14 item 1 (b) | built | Only as a state that passed every check. | runner/run/manager.ts:1677-1688; plan2 §3.10 steps 2-4 |
| §14 item 2 (proved) | built | "Proved": Lean checked it, no sorry, resting on exactly what it lists. | core/gate/rules.ts (notProved, sorryAxiom, footprint findings); runner G4 · per inference: plan2 §4.9 |
| §14 item 2 bullet 1 (sources) | planned-2 | The permitted list: sources of the selected arrows, plus arrows you accepted from Claude. | plan2 §4.8 (Q(T) ∪ E(T)) · built for the selected arrows: core/gate/permitted.ts:84-122, core/formalize.ts:125 |
| §14 item 2 bullet 1 (accepted arrows yours) | planned-2 | Arrows you accepted from Claude become yours. | plan2 §3.10, §4.8; D2-20, D2-34 |
| §14 item 2 bullet 1 (History provenance) | unassigned | History records where accepted Claude arrows came from. | **G1** Apply's entry is a label only (D2-67); AttemptRecord (core/run.ts:590) holds the question; the ledger lives only in run.json |
| §14 item 2 bullet 2 | built | A proved source contributes its basis; an axiom or pending source its claim (pending marked). | core/gate/permitted.ts:50-76; core/project/build.ts:653-656 (TL102); plan2 §4.8 |
| §14 item 2 bullet 3 | built | Lean's standard axioms (propext, Classical.choice, Quot.sound) are permitted. | core/gate/permitted.ts:113 |
| §14 item 2 bullet 4 (signature) | contradicted | The signature is every non-Prop axiom no card owns, shape-breaking and library-root ones included. | **G13** core/gate/permitted.ts:35-47 excludes subject-module axioms of kind `other` (stricter, fails closed); plan2 §4.8 reuses it |
| §14 item 2 bullet 4 (named in report) | built | Each signature axiom that is not a plain sort, predicate, function or constant is named in the report. | reclassified from unassigned by the gap check: core/project/build.ts:607-634 (axiom: entries, TL103); webview/run/ReportCard.tsx:95-98; band.ts:89; cardData.ts:276 |
| §14 item 2 bullet 5 | built | The existence presuppositions of the statements involved are permitted. | core/gate/permitted.ts:95, 101; plan2 §4.8 |
| §14 item 3 (data telelean keeps) | built | Claude never changes the data telelean keeps, and telelean checks this itself. | core/gate/rules.ts COMPARED_FIELDS, markupFindings (G5); .telelean/ outside ws/; plan2 §4.9, §4.10 |
| §14 item 3 (frozen and held) | planned-3 | Claude never changes frozen or held content, and telelean checks this itself. | plan3 §3.2-§3.5; D3-2, D3-3, D3-51 |
| §14 item 3 (FZ-5 exception) | narrowed | The one exception is a change you allow under FZ-5, with your Accept. | D3-9 |
| §14 item 4 | planned-2 | The accepted items always form a self-contained whole. | plan2 §4.5, §4.6, §3.7, §4.10; core/review/deps.ts, reducer.ts (2a2, not wired in) · slice 1's all-or-nothing Accept avoids the problem |
| §14 item 4 (cycles of items) | narrowed | No accepted item rests on one that is not accepted. | D2-26: dependency-cycle items accepted one by one |
| §14 item 5 (a) | planned-2 | Nothing becomes assumed without your individual Accept. | plan2 §4.4 (classify.ts:108), §4.6 (D2-32), §4.10 |
| §14 item 5 (b) | planned-2 | Apply checks this again, never reusing an earlier result. | plan2 §3.10 step 4, §4.10, §6.1 2f · core/review/backstop.ts still a stub |
| §14 item 6 | planned-2 | You judge what statements mean before you see whether they were proved, unless you Show result. | plan2 §4.7 (D2-61, D2-5, D2-10), §5.10 · slice 1's leaks listed in plan2 §7.3 |
| §14 item 6 (side channels) | narrowed | Nothing tells the outcome before the reveal. | D2-69, D3-31: residual channels accepted |
| §14 item 7 (arrows) | planned-2 | In every judged state, every card a proof uses directly has a drawn arrow into it. | plan2 §4.9 (B.2), §3.10, §4.10; D2-59 · built for the run's target: core/gate/rules.ts undeclaredPremiseFindings |
| §14 item 7 (band) | built | Each band shows exactly the arrows whose sources the proof uses directly. | webview/board/band.ts:73-106 |
| §14 item 7 (computed from Lean) | built | direct(v) and the band come from Lean's elaborated proof, never from Claude. | core/project/edges.ts:160; runner/semantic/checkFile.ts; plan1 §8 1d · without the probe: no ✓, and the gate refuses "source-only" |
| §14 item 7 (hand proofs, deleted arrows) | built | The board flags each missing arrow (TL107), and the band loses its ✓. | core/project/edges.ts:362-372; band.ts:87 |
| §14 item 8 | built | The green glow appears only on established cards. | core/project/build.ts:927-948; cardData.ts:147-150 |
| §14 item 9 (never writes) | built | telelean never writes a cycle of arrows. | core/edit/planArrows.ts:84-92; plan2 §4.9, §4.10 · in slice 1 Claude adds no arrows |
| §14 item 9 (formalize) | built | telelean refuses to formalize over a cycle. | core/formalize.ts:108-142; AP-13; plan2 §4.12 check 6 · only when the target or a source lies on the cycle (see G2) |
| §14 item 9 (apply) | contradicted | telelean refuses to apply over a cycle. | **G2** plan2 §4.9 B.3 and §4.10 never count a cycle already in B; check 6's scope is unstated |
| §14 item 9 (flagged) | built | A cycle you write by hand is flagged (TL015). | core/project/build.ts:730 |
| §14 item 10 (only you) | built | Only you change a card's kind; Claude never does. | core/gate/rules.ts (G5 type); plan2 §4.9, §4.10; plan3 §3.10 |
| §14 item 10 (board ways) | built | By dragging, by an arrow into an axiom, or by the mark. | plan1 §8 1a, 1b, 1c2 |
| §14 item 10 (transform) | slice-4 | You can also change a kind in a transform. | AP-2; TR-11 |
| §14 item 11 (base) | built | During a session its base never changes. | plan1 §8 1f; plan2 §3.1 |
| §14 item 11 (drift) | built | Nothing is applied while your files differ from the base. | runner/run/manager.ts:1677-1688; plan2 §3.9, §3.10 |
| §14 item 11 (two stacks) | planned-2 | Undo never reaches from one view's stack into the other's. | plan2 §5.12 (D2-38), §4.6 · the board stack's lock is built (1f) |
| §14 item 11 (Claude step) | planned-2 | Undo never reaches back past a Claude step. | plan2 §4.6 (D2-54), §3.6; core/review/reducer.ts:1006 (2a2); plan3 D3-23 |

### Part 3 Safety issues S1–S22 (69)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| S1 fix (preset) | planned-2 | ES-2's preset applies to every inference, mid-stage ones included. | plan2 §2.7, §3.2-§3.3, §4.9 (D2-41) · built for slice 1's target (core/gate/rules.ts existingChangedFindings, G5); mid-stage waits for the reveal (D2-65) |
| S1 fix (difference 1) | planned-2 | Claude may propose premises as items. | plan2 §3.8 · slice 1 keeps ghosts |
| S1 fix (difference 2) | built | A step that fails to prove the target never deletes your existing proof. | core/gate/rules.ts statusMismatchFindings (plan1 §8 fixer 1e); plan2 §4.9 |
| S2 fix (held) | planned-3 | FZ-4 holds everything frozen Lean relies on after elaboration. | plan3 §3.2, §3.4 step 3; D3-3; cheat 5 |
| S2 fix (meaning) | planned-3 | FZ-3 compares meaning in Lean. | plan3 §3.4-§3.5; D3-2; cheat 7 |
| S3 fix | planned-3 | Freezes live in telelean's own files; Claude's copy never contains them. | plan3 §3.1; cheat 16 |
| S4 fix (RV-5) | planned-2 | RV-5 enforces item dependencies. | plan2 §4.5-§4.6 (deps.ts, reducer.ts built in 2a2, not wired in), §6.2 S4 |
| S4 fix (EN-2) | planned-2 | EN-2 reruns every check on the exact final state. | plan2 §3.10 step 2 |
| S5 fix (own items) | planned-2 | Definitions and presuppositions get their own items. | plan2 §2.2, §4.2 (items.ts, 2a1) |
| S5 fix (own Accept) | planned-2 | Each of them needs its own Accept. | plan2 §4.4 b3, b4 (classify.ts, 2a2), §4.6, §4.10; D2-30; §6.2 S5 |
| S6 fix (premises outside) | built | Premises Claude proposes stay outside your files until you accept them. | slice 1 ghosts (plan1 intro); plan2 §3.1, §3.8 |
| S6 fix (classification) | planned-2 | Belief items are classified by their effect in Lean. | plan2 §4.4 (classify.ts, 2a2); D2-30, D2-25 |
| S6 fix (no kind change, no proof made an axiom) | built | Claude never changes a Kind and never replaces a proof with an axiom. | core/gate/rules.ts markupFindings, existingChanged, statusMismatch, notProved findings; plan2 §4.9 |
| S6 fix (backstop) | planned-2 | Apply's backstop checks that new or changed axioms, definitions and instances were individually accepted. | plan2 §4.10 |
| S7 fix (Result item) | planned-2 | One Result item per inference, always present, neutral, carrying the proof. | plan2 §4.2 (items.ts:901-913, 2a1), §4.7 (D2-61) · D2-44 |
| S7 fix (premises after reveal) | planned-2 | Proposed premises appear only when the Result is revealed. | plan2 §4.7, §3.8 |
| S8 fix (transform) | slice-4 | Transform steps write no proofs. | AP-2; TR-14 |
| S8 fix (Formalize only) | built | Proofs come only from Formalize, each with its question, fixed statements and a comparator check. | slice 1 runs (freeze_statements, G4); plan2 §3.1, §3.3; plan3 §3.10 · premise completions gated as gate-proved (plan2 §3.8) |
| S9 fix (Delete item) | planned-3 | A Delete removes the card, its Lean and its arrows; never leaves a .holds. | plan3 §3.10; D3-14 · the board already offers "Delete card and its Lean code" |
| S9 fix (card-only Delete gone) | unassigned | Today's "card only" Delete, which leaves `axiom ….holds` behind, goes from the board. | **G4** webview/dialogs/Dialogs.tsx:227, 280; core/edit/planDelete.ts keepLean; docs/user-guide.md:122; no plan removes it |
| S9 fix (dependents) | slice-4 | A deleted card's dependents are handled (TR-13). | AP-2 |
| S10 fix | slice-4 | TR-12 checks the Lean you type. | AP-2 |
| S11 fix (copied Lean frozen) | slice-4 | Copied Lean starts frozen in a transform. | AP-2; TR-4 |
| S11 fix (preset) | planned-2 | Every inference, mid-stage ones included, uses ES-2's preset. | plan2 §3.2-§3.3, §4.9 |
| S11 fix (own Accept) | planned-2 | A change to existing Lean is a "changes what is proved" item with its own Accept. | plan2 §4.4 c1 (classify.ts, 2a2) · first occurs in slice 3 or 4 |
| S12 fix | slice-5 | A frozen card's references hold their targets (RF-5). | plan3 §3.4 step 3 (heldFields() returns []) |
| S13 | planned-2 | Repeats are checked exactly only; a reworded repeat comes back as an item. | plan2 §4.3, §4.9 rejected-repeat, §3.5 |
| S14 fix (elaborated direct) | built | direct(v) from the elaborated proof term, following unowned declarations, cross-checked against the footprint. | core/project/edges.ts:160, 283-296; runner value probe; plan1 §8 1d |
| S14 fix (band) | built | The band is computed from Lean after every check, with its ✓ only when complete. | webview/board/band.ts; core/project/build.ts (status.direct) |
| S14 fix (new check) | planned-2 | Every directly used card needs an arrow on every judged state; Claude proposes arrow items for extras. | plan2 §4.9 B.2, §2.8, §6.2 S14 · built for the run's target: core/gate/rules.ts undeclaredPremiseFindings |
| S14 fix (sufficiency only) | built | The band claims sufficiency and nothing more. | band.ts:46, 98 |
| S15 fix (existing arrows kept) | built | The preset keeps every existing arrow. | core/gate/rules.ts COMPARED_FIELDS premises (G5); plan2 §4.9 |
| S15 fix (only into targets) | planned-2 | In a Formalize step Claude adds arrows only into the targets. | plan2 §4.9 (not-target), §2.8 |
| S15 fix (whole model) | planned-3 | Even with the whole model open, the selected arrows stay. | plan3 §3.10, §2.8 |
| S15 fix (own Accept) | planned-2 | Each added arrow a proof uses is a "changes what is proved" item with its own Accept. | plan2 §4.4 c4 (classify.ts, 2a2) |
| S15 fix (revealed with Result) | planned-2 | An added arrow is revealed with the target's Result. | plan2 §4.7 |
| S15 fix (Result after arrow) | planned-2 | The Result can be accepted only after the arrow item. | plan2 §4.5 rule 2 (deps.ts, 2a2) |
| S15 fix (DO-0) | planned-2 | Declining an arrow takes down what rests on it. | plan2 §4.6 (reducer, 2a2); D2-59 · declining a card Claude added: plan3 3c2 (D3-43 may move it) |
| S15 fix (look) | planned-2 | Claude's arrows are translucent with "+" until accepted, never dotted like yours. | plan2 §5.10; D2-34 |
| S16 fix (two signals) | built | The band certifies the inference; the green glow certifies the card. | band.ts; core/project/build.ts:927-948 |
| S16 fix (rests on pending) | built | A card resting on a pending one says so and has no green glow. | core/project/build.ts:653-656 (TL102); webview/model/cardData.ts |
| S16 fix (circularity, arrows) | built | A pending claim is never usable in its own proof, and only through an arrow. | core/gate/permitted.ts:57, 111; core/gate/rules.ts undeclaredPremiseFindings |
| S16 fix (out-of-date facts) | built | No green glow or band from out-of-date facts; the last status shows dimmed. | band.ts:75, 79; cardData.ts:147-150; core/project/build.ts (stale) |
| S17 fix | built | ★D7 (b): formalizing an arrow out of an unproved proposition asks you first. | AP-1, AP-10; plan1 §8 1e; core/formalize.ts:117, 125 |
| S17 fix (in a session) | planned-2 | In a session only "Select the arrows into ‹source› too" or Cancel; no pending mark. | plan2 §4.12 check 4, §5.11 |
| S18 fix (only you set the mark) | built | Only you set the "follows from nothing" mark. | core/edit/planArrows.ts (set-from-nothing); core/gate/rules.ts COMPARED_FIELDS follows_from |
| S18 fix (statements frozen) | built | The preset keeps existing statements frozen. | core/gate/rules.ts existingChangedFindings; plan2 §4.9 |
| S18 fix (own Accept) | planned-2 | Changed statements and definitions are own-Accept items. | plan2 §4.4 c1, c2, b4 (classify.ts, 2a2) |
| S18 fix (proved from nothing) | built | Any Result proved without a single arrow says "proved from nothing: check what the statement says". | runner/proposal/service.ts:257; webview/run/ReportCard.tsx:110; cardData.ts:187; plan2 §2.2, §5.6 |
| S19 fix (no arrow into an axiom) | built | Claude never adds an arrow into an axiom. | G5 (slice 1: no Claude arrows); plan2 §4.9, §4.10 |
| S19 fix (no moves) | built | Claude never moves cards between the column and the canvas. | core/gate/rules.ts markupFindings (type); layout.json under .telelean/ |
| S19 fix (no mark changes) | built | Claude never changes the "follows from nothing" mark. | core/gate/rules.ts COMPARED_FIELDS follows_from; plan2 §4.9 |
| S19 fix (can ask) | built | Claude can ask you to make such changes. | Claude's questions (answerQuestions, kept in plan2 §2.4) |
| S19 fix (impact first) | built | Your own drags and arrows state their impact before you let go. | plan1 §8 1b, 1c2 |
| S20 fix (consistency unchecked) | built | The band's tooltip and the stage report keep saying "consistency unchecked". | band.ts:46, 98; webview/run/ReportCard.tsx:126; plan2 §2.3, §5.4 |
| S20 (future work) | out-of-scope | A consistency check (M3's model finder). | not a v4 obligation (gap check): the spec defers it to M3; plan2 and plan3 list it outside their slices |
| S21 fix (items) | planned-3 | With the whole model open, every change is a belief or proof-changing item with its own Accept, before → after. | plan3 §3.10; plan2 §4.4, §5.6 |
| S21 fix (Result hidden) | planned-3 | The target's Result stays hidden until those items are decided. | plan2 §4.7 (D2-61); plan3 §3.10; D3-12 |
| S21 fix (changed-statement flag) | planned-2 | The Result says "proves a statement changed in this session". | plan2 §2.2, §4.4 c2, §5.6 |
| S21 fix (freezes, selected arrows) | planned-3 | Your standing freezes and the selected arrows still hold. | plan3 §3.5, §3.10 |
| S21 fix (non-target proofs) | planned-3 | Non-target proofs stay closed; one broken by a model-wide change becomes Proof broken. | plan3 §3.10; D3-10 |
| S21 fix (arrow removal) | planned-3 | Claude may remove an arrow only if no proof uses it. | plan3 §3.10; D3-14 |
| S21 fix (switch resets) | planned-3 | The switch resets to off after each session. | plan3 §3.10; D3-29 |
| S22 fix (board stack locked) | built | The board stack is locked during a session. | plan1 §8 1f |
| S22 fix (sealed) | planned-2 | The session stack is sealed at every Claude step. | plan2 §4.6 (D2-54); core/review/reducer.ts:1006 (2a2); plan3 D3-23 |
| S22 fix (discarded) | planned-2 | The session stack is discarded when the session ends. | plan2 §4.6, §3.10 |
| S22 fix (Current view) | built | The Current view cannot be edited during a session. | plan1 §8 1f |
| S22 fix (base) | built | The base never moves. | plan1 §8 1f |
| S22 fix (Apply waits) | built | Apply waits while your files differ from the base. | runner/run/manager.ts:1677-1688; plan2 §3.9 |

### Appendix A Edge cases A1–A29 (39 lines from 82 rows)

A4 is mapped under §7 (ES-7 bullet 3, Apply). A21 is also covered by §6 (CM-7 bullet 5).

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| A1 | planned-2 | Rejecting an item that an item in review depends on makes that one "to be redone". | plan2 §3.6, §4.6, §6.1 2e; core/review/reducer.ts (2a2) |
| A2 | planned-3 | Frozen Lean no longer builds once Claude filled the rest: Claude makes an unfreeze request instead of retrying; the stage reports it. | plan3 §3.9, §2.8, §2.4 StageReportView.requests · 2 rows; not cited: relies on Claude asking and the 3-attempt cap; the usual trigger comes with slice 4 |
| A3 | planned-3 | An instruction that needs frozen content changed gets an unfreeze request; if kept frozen, the stage reports it could not be followed. | plan3 §2.4 ("kept-frozen"), §3.9 · 3 rows; reports the request, not the instruction; instructions (TR-8) are slice 4 |
| A5 | planned-3 | Ctrl+Z after an accidental "Unfreeze all other cards" restores the freezes and statuses together. | plan3 §5.3, §5.1 · 2 rows |
| A6 (not found) | planned-3 | A freeze record whose card no longer exists is listed under "Frozen items not found". | plan3 §2.2, §2.4, §3.3, §4.5, §5.1, §5.5 |
| A6 (record removed) | planned-3 | Deleting a card through telelean removes its freeze record. | plan3 §2.6, §5.4 · see G6 for kind changes and replaced marks |
| A7 | built | Only the selected arrows into a target form its question; the others stay dotted, whatever the result. | core/formalize.ts:125; webview/board/contextActions.ts:87; core/gate/rules.ts:886; runner/run/manager.ts:871; plan1 §5, §8 1d, 1e · 4 rows |
| A8 | built | If the proof uses fewer arrows than selected, the band binds those it uses; the rest are "not needed" and stay dotted. | webview/board/band.ts:82; webview/run/ReportCard.tsx:113-121; plan2 §2.3, §5.4 · 3 rows |
| A9 | built | A proof that uses none of the selected arrows is flagged "proved from nothing". | webview/run/ReportCard.tsx:107-111; runner/proposal/service.ts:257; core/run.ts:448; plan1 §8 fixer 1e · 3 rows |
| A10 (slice 1) | built | In slice 1 Claude finishes not proved, naming the card; the report offers "Draw (or select) the arrow…"; no existing card is proposed as a premise. | webview/model/run.ts:555; runner/run/systemPrompt.ts:16; B.2 (plan1 §8 1e) · 3 rows; "never proposes" is a prompt rule, and B.2 refuses using one |
| A10 (drawn, not selected) | built | An arrow you drew but did not select is listed "select ‹card› → ‹target› too". | webview/model/run.ts:555-578; plan1 §8 1e · 3 rows; plan2 §5.4 adds "Select these arrows" |
| A10 (from slice 2) | planned-2 | From slice 2, Claude proposes an arrow item for a card it needs. | plan2 §2.8, §4.9, §6.2 S14; D2-21 (only from a card with a .holds) · 3 rows |
| A10 (frozen Dependencies) | planned-3 | If the target's Dependencies are frozen, Claude makes an unfreeze request instead. | plan3 §2.8 (propose_arrow refuses), §3.9; D3-36 · 4 rows |
| A11 (replacement) | built | A passing new proof of an already proved target replaces the old one, and the band moves. | plan1 §8 fixer 1e |
| A11 (label, basis list) | planned-2 | The Result says "replaces your proof" and lists the cards whose basis changes. | plan2 §2.3 (flag, previousProof, basisChanged), §5.6; core/review/texts.ts:70 · 3 rows |
| A12 | planned-2 | Chain X → L → A: L is proved first; if L fails, A reports "L was not proved", and ★D7 applies to A retried alone. | plan2 §3.3 item 3, §4.12 (formalizeOrder, check 4), §5.11; D2-4 · 3 rows |
| A13 | built | A pending proposition dragged into AXIOMS becomes an axiom again, keeping its axiom n.holds. | core/kindChange.ts:212-213; core/edit/planAction.ts:189 |
| A14 | built | A proved proposition others use, moved to AXIOMS: their proofs still build; established stays established. | core/kindChange.ts:204-210; core/project/build.ts:927 |
| A15 | built | An arrow into an axiom that proofs use makes it pending; dependents lose green; the gesture says how many first. | core/edit/planArrows.ts:113-122; core/kindChange.ts:227-237; plan1 §8 1b, fixer 1a |
| A16 | built | Deleting an arrow a proof uses: a TL107 warning arrow, a band without ✓, and the confirmation says so. | core/edit/planArrows.ts:225-229; core/kindChange.ts:83-97; core/project/edges.ts:362-372; plan1 §8 1b, 1d · 2 rows |
| A17 | planned-3 | If a proposal removes A → Z and adds Z → A, declining the removal declines the addition. | core/review/deps.ts:138 (rule 4, built in 2a2, idle until Remove arrow items exist); plan3 §3.10, §6.1 (3c1) · 3 rows |
| A18 | built | Arrows between subjects are not allowed (TL121). | core/edit/planArrows.ts:107; core/project/build.ts:681, 693; plan2 §4.9; D3-41 · 2 rows |
| A19 (aliases) | built | In old files ASSUMPTION reads as an axiom; DERIVATION and GOAL read as propositions. | core/model.ts:35-48; core/markup/parser.ts:233-234; plan1 §2.2, §8 1a · 2 rows |
| A19 (old pending) | built | An old DERIVATION or GOAL whose .holds is a Lean axiom reads as pending. | plan1 §8 1a, fixer 1a (core/run.ts upgradeLegacyProposal) · 2 rows |
| A19 (no rewrite) | built | Nothing in an old file is rewritten until you change that card's kind. | plan1 §2.2 |
| A19 (old axiom's arrows shown) | contradicted | An old axiom block with premises: shows its arrows as "declared before v4". | **G11** core/project/subjectGraph.ts:64-66 drops them; only a chip (TL122, core/project/build.ts:56) · one mapper marked the combined clause built |
| A19 (old axiom's arrows not selectable) | built | Those arrows cannot be selected. | webview/state/store.ts:2140-2145, 2188-2191; plan1 §8 1b |
| A19 (chip offers) | built | A chip on such an axiom offers "Make it a proposition (pending)" or "Drop these arrows". | plan1 §8 1b, 1c1; webview/model/cardData.ts:210-217 |
| A20 | built | A hand-written proof using a card with no arrow: a warning arrow, never inside a band; no ✓ until you draw it. | webview/board/edges.ts:52; band.ts:82, 87; core/project/edges.ts:362-372 · 2 rows |
| A21 | built | A right-drag that ends on a card only pans: no selection change, no menu. | webview/board/BoardInput.ts:462; plan1 §8 1c1 |
| A22 (mark goes) | built | Drawing an arrow into a marked card removes the mark; Undo restores it. | core/edit/planArrows.ts:156-159 (same plan) · 2 rows |
| A22 (even if frozen) | planned-3 | The mark goes even if frozen, because freezes bind only Claude. | plan3 §3.1 · 2 rows; see G6 (drop the mark's freeze record) |
| A23 | planned-3 | With the whole model open, changing something under a standing freeze needs an unfreeze request. | plan3 §3.10, §3.9, §2.8 · 2 rows; not cited, but the mechanism is committed |
| A24 | built | telelean places only cards with no stored position; Tidy layout moves only the selected cards. | webview/board/canvas/placement.ts:5, 142-145; menu.ts:250-254 · 2 rows |
| A25 | planned-3 | With "Claude may add cards" on, an unproved intermediate's Result says so; targets needing it report "‹card› was not proved". | plan3 §3.10, §6.1, §6.2 cheat 14; D3-13 · 3 rows; the dependent's report is not spelled out; D3-43 fallback |
| A26 | planned-2 | A premise accepted as pending leaves the target proved but resting on pending, with no green glow until it is proved. | plan2 §3.8 (holdAs), §5.6; the glow rule is built (core/project/build.ts:927-948) · 3 rows |
| A27 | built | Ctrl+Z on the Current view during a session does nothing, and the disabled Undo says why. | webview/state/store.ts:679-710; main.tsx:99-125; header/Header.tsx:82-113; plan1 §8 1f · 2 rows |
| A28 | planned-2 | After Claude's next step Ctrl+Z stops at the step; to take an Accept back, set the item to "in review". | plan2 §3.6, §4.6, §5.12; core/review/reducer.ts:1064; texts.ts:104-105 · 2 rows |
| A29 | built | A card used only through a @[simp] lemma or an instance is still found in direct(v). | core/project/edges.ts:160; plan1 §8 1d (valueProbe.test.ts, direct.test.ts) · 2 rows |

### Appendix B Checks (68)

| Clause | Status | Requirement | Where · note |
|---|---|---|---|
| App B Kept (G0) | built | G0, the forbidden-text scan, is kept. | core/gate/g0.ts; plan2 §4.9; D2-52 |
| App B Kept (build) | built | The build (G1) is kept. | runner G1; core/gate/rules.ts buildFindings; plan2 §4.9 |
| App B Kept (sorry, example) | built | No sorry and no example are kept. | core/gate/rules.ts sorryAxiomFindings, exampleFindings, proofBeforeFreezeFindings; plan2 §4.9 |
| App B Kept (shape rule) | planned-2 | The vocabulary shape rule also applies to changed items. | plan2 §4.9 · slice 1 judges new items only; existing-changed refuses changed ones |
| App B Kept (definition questions) | planned-2 | The definition questions also cover changed definitions and items that change kind. | plan2 §4.2, §4.4 b4, §4.10; D2-18 · first occur with the whole model (plan3 §3.10) |
| App B Kept (per inference) | planned-2 | Per inference: footprint within its permitted set, statements fixed, Lean's comparator (G4). | plan2 §3.3 (D2-19), §4.9, §3.10 step 2 · built for one target |
| App B Kept (status-mismatch) | built | In a step that does not finish proved, each target's .holds stays byte-identical. | core/gate/rules.ts statusMismatchFindings (plan1 §8 fixer 1e); plan2 §4.9 |
| App B Replaced (frozen and held check) | planned-3 | The old unchanged-declarations and untouched-words checks become the frozen and held check. | plan3 §3.2-§3.5; D3-2, D3-3 · meanwhile plan2's step limits (D2-41) |
| App B Replaced (type:) | built | Claude may not change an existing block's type:. | core/gate/rules.ts COMPARED_FIELDS, markupFindings; plan2 §4.9 |
| App B Replaced (new blocks) | built | Claude adds a block only for a premise, with "Claude may add cards", for a Shaky split, or as vocabulary. | core/gate/rules.ts markupFindings; plan2 §4.9; plan3 §3.10 (3c2) · Shaky splits disallowed (D2-15); add_card may fall back to slice 4 (D3-43) |
| App B Generalised (new-axiom) | planned-2 | An axiom is new unless your files had one of that name and type at the session's start. | plan2 §4.9 (token type-changed) · slice 1 compares by name; existing-changed catches type changes |
| App B Generalised (producing inference) | planned-2 | Each declaration Claude adds is judged against the permitted set of the inference that produced it. | plan2 §4.9; D2-43 |
| App B Generalised (accepted content) | planned-3 | Accepted content is protected by the frozen check, not by the baseline. | plan3 §3.4 step 1, §3.7; D3-4 · meanwhile: step limits and the accepted content key at Apply (plan2) |
| B.1 Q(T) | built | The question Q(T) is the set of selected arrows into T. | core/formalize.ts:125; plan1 §5; plan2 §2.2 · one target in slice 1 (AP-9) |
| B.1 E(T) | planned-2 | Claude's answer may add arrows E(T), each an item. | plan2 §2.8 (D2-1), §4.2, §4.8 |
| B.1 claim | built | A source contributes its .holds if it is an axiom or pending. | core/gate/permitted.ts:50-59; plan2 §4.8 |
| B.1 own or accepted proof | planned-2 | A source proved by your proof, or by a proof accepted in the session, contributes its footprint. | plan2 §4.8 · own-proof half built: permitted.ts:67-76 |
| B.1 session proof in review | planned-2 | A session proof still in review contributes its footprint as judged now; the new Result depends on it. | plan2 §4.8, §4.5 rule 2 (deps.ts, 2a2); D2-48 (also Shaky and to-be-redone ones not taken out) |
| B.1 no .holds | built | A source with no .holds contributes nothing (AR-8). | permitted.ts:50-59; plan2 §4.8 |
| B.1 exclusions | built | T's own .holds and sorryAx are excluded. | permitted.ts:111 |
| B.2 subset | planned-2 | direct(T) must be a subset of the sources of Q(T) ∪ E(T). | plan2 §4.9 (D2-59) · built for Q and adopted ghosts: core/gate/rules.ts undeclaredPremiseFindings |
| B.2 elaborated walk | built | direct(T) comes from the elaborated proof by a Lean probe, walking unowned declarations up to cards. | runner/semantic/checkFile.ts; core/project/edges.ts:160; plan1 §8 1d |
| B.2 no .ilean | built | .ilean references are not used; directUses is only a fallback, and then no band has a ✓. | core/project/edges.ts; band.ts:95; core/gate/rules.ts ("source-only") |
| B.2 cross-check | built | Every card in T's footprint is in direct(T) or its basis; otherwise refused in a session, or no ✓ on the board. | core/project/edges.ts:283-296; core/project/build.ts (TL123); band.ts:94; gate token "unseen" |
| B.2 fallback gap | narrowed | No proof rests on a card that no arrow shows. | AP-21: a known gap on source-text facts (section 4) |
| B.2 every judged state and Apply | planned-2 | B.2 on every judged state, and at Apply for every proposition whose proof or Dependencies changed. | plan2 §4.9, §3.10 step 2, §4.10 · slice 1 checks the target only |
| B.2 premise checks | built | The Add premise scratch check and its completion run B.2 too. | runner/gate/engine.ts:840; plan1 §8 1e; plan2 §3.8 |
| B.3 acyclic | planned-2 | The final arrow graph is acyclic. | plan2 §4.9, §4.10 · built for your arrows: core/edit/planArrows.ts:84-92; a cycle already in B is not counted (G2) |
| B.3 into targets | planned-2 | Under the preset, Claude adds arrows only into the targets. | plan2 §4.9, §2.8; D2-21, D2-50 · slice 1: none |
| B.3 whole model | planned-3 | With the whole model open, Claude adds arrows into any unfrozen Dependencies. | plan3 §2.8, §3.10; D3-38 |
| B.3 transform | slice-4 | In a transform, Claude adds arrows into unfrozen Dependencies. | AP-2 |
| B.3 into an axiom | planned-2 | Claude never adds an arrow into an axiom card. | plan2 §4.9, §4.10 |
| B.3 removals | planned-3 | Claude removes only unfrozen, unselected arrows that no proof uses. | plan3 §3.10, §2.8; D3-14 · no removals in slice 2 |
| B.3 follows from nothing | built | Claude never sets or removes the mark; it goes only when you accept a premise; follows_from itself is compared. | core/gate/rules.ts COMPARED_FIELDS; core/gate/adoption.ts:147-150; plan1 §8 fixer 1a; plan2 §4.9, §3.8, §4.10 |
| B.4 type: | built | Claude never changes type:. | core/gate/rules.ts markupFindings (G5) |
| B.4 proving pending | built | Proving a pending target replaces axiom T.holds by theorem T.holds of identical type. | core/gate/rules.ts notProvedFindings; runner G4; TL114; plan2 §4.9 |
| B.4 other changes | built | Any other change of a .holds between axiom and theorem is refused. | core/gate/rules.ts existingChanged, statusMismatch, notProved findings; plan2 §4.9, §4.10 |
| B.4 pending claims | built | Claude never writes a Lean axiom .holds for a proposition; telelean writes pending claims at your choice. | core/gate/rules.ts newAxiomFindings; core/edit/planArrows.ts:297; plan2 §4.9, §3.8 · the RV-1 pending premise comes in slice 2, TR-14's in slice 4 (D3-10) |
| B.5 established | built | established(v): proved with no hypotheses, sorry or axiom: entry; footprint only axiom cards, none pending; no mismatch; facts current. | core/project/build.ts:927-948 |
| B.5 band | built | band(v): drawn arrows into v whose source is in direct(v); complete (✓) only when all arrowed, no hypothesis, no axiom: entry. | webview/board/band.ts:73-106 · also open for TL114, unseen uses, source-only facts |
| B.5 out-of-date facts | built | No band is drawn from out-of-date facts. | band.ts:75, 79 |
| B.5 TL107 | built | TL107 fires for every card in direct(v) with no drawn arrow. | core/project/edges.ts:362-372; plan1 §8 1d |
| B.5 TL109 | built | TL109 no longer uses the warning colour. | core/project/edges.ts:360; plan1 §8 1d |
| B.5 TL102 | built | "Rests on a goal asserted as an axiom" becomes "rests on pending". | core/project/build.ts:653-656; AP-16 |
| B.6 kinds | built | type: accepts AXIOM and PROPOSITION; old names read as aliases, rewritten only by a kind change. | core/model.ts:44-48; core/markup/parser.ts:233-234; AP-11 |
| B.6 field | built | follows_from: nothing is its own field, kept data. | parser.ts:243-245; G5; AP-15 |
| B.6 errors | built | Any other follows_from value, or the mark with arrows, is a markup error; the mark is then ignored. | parser.ts:180-185 (TL023), 245 (TL022) |
| B.6 premises | built | A premises: line with no valid id is never the mark; no premises: line means none declared. | plan1 §2.2 |
| B.6 codes | built | TL116 and TL105 go; TL106 stays, as "has a proof". | core/project/build.ts:640; plan1 §8 1a |
| B.7 storage | built | Canvas positions live in the subject's layout file; the column order stays as today. | core/layout.ts:27, 56-82; AP-12 |
| B.7 writers | contradicted | Positions are written only by moves and Tidy layout, each one Undo step. | **G9** add-node.position (plan1 §2.4, §8 1c1); kind changes and deletes drop positions |
| App B Base (fixed) | built | The diff base is your files at the session's start, and it never moves. | plan1 §8 1f; plan2 §3.1 |
| App B Base (watcher) | planned-2 | A file watcher compares the files with the base; any difference disables Apply. | plan2 §3.9, §5.8; AP-18 · slice 1 refuses at Accept only |
| App B Baseline (transforms) | slice-4 | The baseline is the base plus your transform edits and follow-ons, committed with facts rebuilt. | AP-2; plan2 §3.1 (the baseline is B) |
| App B Baseline (copied content) | slice-4 | Content copied from Claude's proposal never joins the baseline nor counts as your proof. | AP-2 |
| App B Baseline (Claude's text) | built | Claude's content never counts as your text (G0, new-axiom). | core/gate/g0.ts, core/gate/rules.ts newAxiomFindings; plan2 §3.1 |
| App B Baseline (accepted proof) | planned-2 | A proof you accepted counts as yours only for later inferences' permitted sets (RV-11). | plan2 §4.8, §3.1 |
| App B Backstop (list) | planned-2 | At Apply, list each declaration that is new or changed relative to the baseline. | plan2 §4.10 ("unowned") · core/review/backstop.ts a stub |
| App B Backstop (a) | planned-2 | Every new or changed Lean axiom (except shape-passing new sorts, predicates, constants, functions) is individually accepted. | plan2 §4.10; D2-40 |
| App B Backstop (b) | planned-2 | Every definition, instance or coercion in a statement's elaborated closure is individually accepted. | plan2 §4.10, §4.1; D2-30, D2-25 |
| App B Backstop (c) | planned-2 | Every existing name whose kind, type or value changed is individually accepted. | plan2 §4.10 |
| App B Backstop (exempt) | narrowed | Exempt: helper instances, unreached lemmas and definitions, an accepted Result's axiom-to-theorem change. | D2-24: stricter, they must still belong to an accepted item |
| App B Backstop (individually) | planned-2 | "Accepted individually": by its own Accept where RV-7 requires one, otherwise accepted as an item. | plan2 §4.10; D2-32 |
| App B Backstop (frozen terms) | planned-3 | Every frozen and held declaration still elaborates to its frozen term. | plan3 §3.5; D3-2, D3-51 |
| App B Backstop (FZ-5 held change) | narrowed | A held item changed under FZ-5 passes only with all its "meaning changed" items accepted. | D3-9: no such changes exist |
| App B Backstop (arrows) | planned-2 | Every final arrow is yours, individually accepted, or an accepted removal. | plan2 §4.10; plan3 §3.10 |
| App B Backstop (B.2, B.3) | planned-2 | B.2 and B.3 hold on the final state. | plan2 §4.10; D2-59 |
| App B Backstop (refusal, never reused) | planned-2 | Otherwise Apply is refused, naming the declaration or arrow; the backstop is never reused. | plan2 §4.10, §3.10 step 4, §6.1 2f |
