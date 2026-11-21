# Dispositions of the final verification findings (turn 20, v3 → v3.1)

Workflow `wf_c92e0098-2e1`: 2 verifiers (consistency, soundness), 26 findings. All were applied to `user_requested_documents/01_edit_sessions_spec_proposal.md`, one partly.

## consistency

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| C1 | major | RV-1 (Prove, Result, Add), RV-2, RV-4, RV-6, RV-11, RV-12, §8, Part 3 S7, §11.6, biggest change 3 | applied | Prove merged into Result (RV-1); Result decline options (§8 preamble); proposed premises appear only on reveal. |
| C2 | major | ES-2 (Preset; "The same preset applies to every inference"), RV-9, FZ-7, FZ-3, FZ-2, RV-12, ES-3, S1, S11 | applied | The preset is defined against the session's start: "everything that existed when the session started is session-frozen", with exceptions for "each sel |
| C3 | major | FZ-4 (both bullets), RF-5, Appendix B (Held sets), ES-2 (exceptions), Part 3 S1 ("keeps today's protection") | applied | FZ-4 holds "other cards' statements and proofs" that frozen Lean relies on |
| C4 | major | FZ-3 (2nd and 3rd bullets), ES-7, RV-1 (last bullet), RV-4, FZ-10, Appendix A4, Appendix B (Backstop at Apply) | applied | The frozen record and the working copy are fed from different sources:
- FZ-3 takes what frozen content says "from your files when the session starts, |
| C5 | major | FZ-5 (Allow this change), FZ-3 (3rd bullet), §11.3, Appendix B (Backstop at Apply), RV-1/RV-4 (no "meaning changed" item | applied | Superseded by soundness F5's fuller version (FZ-5, Appendix B backstop). |
| C6 | major | RV-8, RV-5, RV-6, RV-7, DO-1, DO-3, §11.4, biggest change 2 | applied | RV-8 takes "every selected item whose dependencies are accepted or in the selection, except the items of RV-7" |
| C7 | major | TR-13 ("mark them broken"), TR-14 ("accept it as broken"), EN-2 ("any breaks you chose (TR-13), listed as expected"; "If | applied | Today, "mark broken" leaves declarations that do not compile (edit-model map: "they stop compiling") |
| C8 | major | ES-3, TR-15, ★D1 (a), CM-4, Part 4 (EDIT SESSIONS 1 and INITIATING 2 rows) | applied | ES-3 starts the session "when the transform window opens" |
| C9 | major | RV-9, RV-12, EN-1, TR-15 ("inside a session, as items already accepted in the current stage"), CM-4, biggest change 4 | applied | RV-9 lets you start a transform from the Context Menu during a stage, queued until Submit review |
| C10 | minor | How to read it; tags of RV-3, RV-8, RV-9, EN-1, TR-10, ES-3; Part 4 | applied | "How to read it" says that "yours" means reworded only, and that every changed or new clause is in Part 4 with its reason |
| C11 | minor | Biggest changes 1–5, FZ-11 (banner text), Appendix C Q3 (last bullet) | applied | - **Line 1** says These suffice "freezes everything you didn't select" |
| C12 | minor | ES-4, EN-2, ES-3, FZ-9 | applied | Three session-walk outcomes are undefined:
- **(a)** ES-4 says Cancel step, a cap or an environment failure "returns you to the previous stage" |
| C13 | minor | TR-4, TR-5, ES-2, FZ-9, TR-12, TR-15, Part 3 S10 | applied | (a) The Proof field's states contradict each other:
- TR-4 says "a new card's fields start fuzzy" and also "A Proof field is never fuzzy".
- TR-5 says |
| C14 | minor | RV-3, DO-1, FZ-7, CF-1, TR-10, CF-4, RV-1, ★D1 (c), S9, FZ-8, ES-1 | applied | Several blanket statements are contradicted elsewhere:
- **(a)** RV-3 says "You can change any status until you submit" |
| C15 | minor | ★D5 (a), slice 1; RV-4; RV-5; §11.5; S4 | applied | Slice 1 is "the review list, statuses, belief items, Result items, …, Exit and Apply, for These suffice sessions |

## soundness

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| F1 | blocker | TR-15 (inside a session), DO-2, RV-8, RV-7 last line, TR-4, Appendix B (Baseline, Backstop), §11.4, §11.5, §11.6 | applied | Blocker closed: TR-15 inside a session, DO-2, Appendix B baseline. |
| F2 | major | RV-1 (Prove, Result, 'at most two items'), RV-2, RV-6, §11.6, S7 | applied | Overlaps consistency C1; also hides whether a proof exists (RV-6). |
| F3 | major | §11.5, Appendix B (Backstop at Apply), RV-7 bullet 4, RV-1 (Vocabulary (N)), ES-7, EN-2 (reuse), ★D2 cost | applied | As written, the backstop contradicts what RV-1 and RV-7 allow to be accepted as a group |
| F4 | major | RV-7 ('changes what is proved'), RV-4, TR-4, TR-13, CF-6 | applied | When Claude rewords the sentence of a formalised DERIVATION or GOAL, the result is a plain Change that can be group-accepted |
| F5 | major | FZ-5 (Allow this change), FZ-3, RV-5, DO-1, Appendix B (meaning comparison, Backstop), §11.3 | applied | Applied as written; replaces the C5 wording. |
| F6 | minor | CF-3, CF-4, TR-4, TR-7, DO-3, Appendix B (Replaced) | applied | Two promises have no mechanism behind them: 'Claude never changes the Kind of an existing card' and 'must stick to the cards in the window' |
| F7 | minor | RV-1 (Add: proposed premise, mechanical completion), RV-6, RV-11 | applied | Three gaps in the mechanical completion of a proof |
| F8 | minor | ES-2 (target's Proof open, 'stays exactly as it was'), FZ-4, Appendix B (Kept/Replaced), S1 | partly | Partly: (2) applied (Appendix B, Kept: a target's `.holds` stays byte-identical in a step that does not finish proved). (1) resolved the other way, per consistency C3: proofs are not held (proof irrelevance), so a target's open Proof may be replaced. The Result lists the frozen cards whose Rests on changes. |
| F9 | minor | TR-15 (outside a session), TR-12, TR-13 | applied | Outside a session, TR-15's "no Lean check before writing" contradicts TR-12, which elaborates typed Lean in a scratch file |
| F10 | minor | RV-8, RV-5, §11.4, FZ-1, TR-15 (follow-on edits), ES-7 | applied | §11.4 (the accepted items always form a self-contained whole) can fail in two ways |
| F11 | minor | §11.2 | applied | The list in §11.2 is not the permitted set the mechanism actually uses, so 'resting on exactly what it lists' is false at the edges |

