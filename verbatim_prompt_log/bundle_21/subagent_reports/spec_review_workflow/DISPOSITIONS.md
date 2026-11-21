# What happened to each finding of the spec v4.0 review (turn 21)

Three read-only reviewers checked v4.0 (`reviewed_spec_v4.0.md`, in this folder): fidelity and consistency (F1–F29), soundness (S-1 to S-18), and implementability with a slice-1 code map (V4-I01 to V4-I21). Their full reports are in `agents/`. The result is v4.1, saved as `user_requested_documents/01_spec_v4.md`.

Severities, as the reviewers gave them: 2 blockers (S-1, V4-I01), 23 major, 43 minor, 1 nit.

## Fidelity and consistency

| Finding | Disposition | Where |
|---|---|---|
| F1 the third mid-turn message: base must not move, Current uneditable | Applied. It was already folded in after v4.0 was handed to the reviewers. The whole model folder is locked; freezes during a session are made on the Proposed view only (a stricter reading than F1's "freezing stays available" on Current). | ES-1, ES-7, ES-9, RV-1, RV-5, FZ-3, EN-2, A4, B |
| F2 undo/redo with separate stacks | Applied (already folded in): §12 UN-1 to UN-7, with Redo. | §12 |
| F3 the transitive glow leaks results | Applied | RV-6 |
| F4 band overclaims; TL107 coverage exemption | Applied | BD-7, B.5 |
| F5 §13.7 unconditional; removals of used arrows | Applied | §14.7, B.3, BD-5 |
| F6 solid arrows could not be frozen | Applied | CF-7 |
| F7 Claude's arrows into a card marked "follows from nothing" | Applied | AR-5, ES-2, FZ-13, B.3 |
| F8 whole model: proofs of non-targets with no question | Applied, in the soundness reviewer's stricter form (S-7): non-target proofs stay closed | ES-2, S21 |
| F9 the AR-8 dialog's open cases | Applied | AR-8 |
| F10 "unless you unfreeze arrows" was false | Applied | Part 4 ¶3, ES-2 |
| F11 the autopilot log omitted clause-level departures | Applied | Part 2; `02_autopilot_decisions.md` AP-14 |
| F12 TR-13's "Delete anyway" | Applied | TR-13 |
| F13 untagged departures (AR-6, AR-2, the premise's arrow) | Applied | AR-6, AR-2, Part 4 ¶6 |
| F14 whole-model switch keeps standing freezes, untagged | Applied | ES-2, Part 2 |
| F15 right click replaced the selection | Applied | CM-7 |
| F16 FZ-4 and FZ-9 lists did not cover arrows | Applied | FZ-4, FZ-9 |
| F17 verdicts neither exclusive nor complete | Applied | RV-1, BD-7 |
| F18 AXIOMS header missed pending claims | Applied | BD-1 |
| F19 intermediate cards Claude adds | Applied | ES-2, A25 |
| F20 old ASSUMPTION blocks with `premises:` | Applied | A19 |
| F21 status header out of date | Applied | header, Appendix D |
| F22 the default VS Code menu | Applied | CM-7, Part 4 ¶8 |
| F23 a needed arrow that exists but was not selected | Applied | A10, RV-10, §14.2 |
| F24 arrow actions in the Proposed view; Dependencies in the window | Applied | ES-9, TR-4 |
| F25 dotted vs dashed | Applied: arrows are drawn as dots now (Terms, BD-5) | Terms, BD-5 |
| F26 "✓ proved" on established cards | Applied: "✓ established" | BD-6, BD-9 |
| F27 "pending item", "Dependencies" title, "claimed" | Applied | FZ-10, EN-2, A1, RV-5 |
| F28 axiom card vs Lean axiom | Applied | Terms, B.5, Backstop |
| F29 small leftovers | Applied | Part 3, RV-1, §14.10, CM-4, BD-8, A13, RV-4, AR-4 |

## Soundness

| Finding | Disposition | Where |
|---|---|---|
| S-1 (blocker) direct(v) from source references misses elaborated constants | Applied: direct(v) comes from the elaborated proof term, with a footprint cross-check; `.ilean` refs are only a fallback, and then no band gets its ✓. Implementation: a facts extension shared by 1d and 1e (`docs/slice1-plan.md` §8). | BD-7, B.2, B.5, S14, A29 |
| S-2 band says "suffice" when it does not | Applied: complete (✓) and open bands | BD-7, A16, A20 |
| S-3 stale facts | Applied | BD-6, BD-7, B.5, S16 |
| S-4 the Proposed view leaks results through other cards | Applied | RV-6 |
| S-5 reveal not transitive; AR-8 dialog leaks | Applied | RV-6, AR-8 |
| S-6 an item's class fixed at proposal time | Applied: recomputed on every judged state; every Add arrow is a proof-changing item | RV-7, Backstop |
| S-7 whole model / transforms: non-target proofs, removing used arrows | Applied | ES-2, B.2, B.3, S21 |
| S-8 header omits pending claims | Applied | BD-1 |
| S-9 TL114 still established | Applied | BD-6, B.5 |
| S-10 who writes pending claims | Applied | AR-8, B.4, ES-2 |
| S-11 TR-11 let Kind follow from Dependencies | Applied | TR-11 |
| S-12 the empty-list encoding collides | Applied: own field `follows_from: nothing` (AP-15) | AR-5, B.6 |
| S-13 old axioms with premises | Applied | A19 |
| S-14 cycles only over dotted arrows | Applied | AR-3, §14.9 |
| S-15 the switch stays on | Applied: resets after each session | ES-2 |
| S-16 target via its mark open for arrows | Applied | AR-5, ES-2 |
| S-17 Add premise into frozen Dependencies | Applied | RV-1 |
| S-18 arrow provenance lost | Applied in its simpler form: accepted arrows become yours, and History records their origin; no `arrows_from_claude:` field | §14.2 |

## Implementability

| Finding | Disposition | Where |
|---|---|---|
| V4-I01 (blocker) several targets on today's single-target machinery | Applied: one target per Formalize in slice 1 (AP-9). For slice 2, ES-2 now states the session rules (re-judging every inference each step and at Apply, dependent Results). | ES-2, B.1 |
| V4-I02 right-click target with a selection | Applied | CM-7 |
| V4-I03 Mark pending for an unformalised source | Applied: refused (AP-10) | AR-8 |
| V4-I04 slice 1's Context Menu contents | Applied, in the plan (`docs/slice1-plan.md` §5) | plan |
| V4-I05 positions storage and Undo | Partly: positions stay in `layout.json`, and moves are Undo steps (AP-12); placement is computed, not stored. The separate positions file was not adopted. | BD-3, B.7, AP-12 |
| V4-I06 old ASSUMPTION blocks with premises | Applied | A19 |
| V4-I07 slice 1: a proof needs an unselected card | Applied | A10 |
| V4-I08 cycles: solid arrows, hand-made cycles | Applied | AR-3, AP-13 |
| V4-I09 band definitions | Applied | B.5, BD-5, BD-7 |
| V4-I10 2-D off-screen badges | Applied | BD-4 |
| V4-I11 §13.7 and §13.9 overclaim | Applied | §14.7, §14.9 |
| V4-I12 RV-6's hidden set | Applied | RV-6 |
| V4-I13 established on stale facts | Applied | BD-6, B.5 |
| V4-I14 Delete with a mixed selection | Applied | AR-1 |
| V4-I15 context menu over text | Applied | CM-7, B canvas notes |
| V4-I16 directUses stops at other card-bound declarations | Applied | B.2 |
| V4-I17 expanding a card on the canvas | Applied | BD-3 |
| V4-I18 New proposition here | Applied | CM-7 |
| V4-I19 AR-6 for axioms without an axiom `.holds` | Applied | AR-6 |
| V4-I20 which arrows can be selected for Formalize | Applied | ES-2 |
| V4-I21 split slice 1 | Applied: sub-slices 1a–1f, each with its own patch | plan §1 |
