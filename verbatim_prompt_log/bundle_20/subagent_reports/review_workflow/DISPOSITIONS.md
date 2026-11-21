# Dispositions of the v2 review findings (turn 20)

Review workflow `wf_1c2263c7-4c5`: 4 reviewers (fidelity, logic, soundness, implementability), 108 findings. Each was decided by the main session while writing v3 (`user_requested_documents/01_edit_sessions_spec_proposal.md`).

- **accepted**: applied as proposed, or in equivalent wording.
- **partly**: applied with a different choice, explained in the note.

**Totals:** 91 accepted, 17 partly.

No finding was rejected outright. Where reviewers disagreed (e.g. whether Reject freezes; when results are revealed), one option was chosen, and the other finding is marked 'partly' or 'resolved the other way'.

## fidelity

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| F1 | major | RV-4, RV-7, RV-6, ★D2, §11.5 | accepted | RV-4's one-click 'Accept with its N dependencies' collides with RV-7's rule that each belief item is accepted on its own |
| F2 | major | FZ-7, DO-1, EC-1, FZ-2, §15 DECLINE 1 | accepted | FZ-7 makes 'rejecting a change' a session freeze |
| F3 | major | ES-9, FZ-11, TR-3, TR-8, DO-1, DO-3, RV-9, RV-6, §0, 'How to read it' | accepted | 'How to read it' defines 'yours' as 'your clause, reworded only' and 'changed' as 'differs in substance', and the user approves by number |
| F4 | major | ES-2, S1, ★D3, CF-2, §16 | accepted | S1 recommends ★D3 because the preset 'reproduce[s] today's protection exactly' |
| F5 | major | TR-15, DO-2, RV-9, RV-10, REVIEW 3 | accepted | TR-15 is not limited to the transform that starts a session |
| F6 | minor | §15, §16, RV-2, RV-6, CF-1..CF-6, FZ-3, ES-1, ES-5, ES-6, RV-9, TR-8, RF-4, EN-2 | accepted | §15 and §16 are the user's requested 'summary of the areas you have changed', but they are incomplete and in places wrong |
| F7 | minor | ES-8, FZ-7, FZ-8, EN-2, S11, §15 | accepted | The user's EDIT SESSIONS list has items 1–3 only; items 6–8 are under REVIEW STAGE |
| F8 | minor | §17 Enforcement, FZ-5, ES-2, ES-3 | accepted | §17 is labelled 'not for approval', yet it contains a rule the user will feel: 'New instances and attributes are refused while anything is frozen.' ES-2 and ES- |
| F9 | minor | RV-5, RV-3, S7, §16 | accepted | RV-5 says it 'keeps D-19's order', but it is stricter and drops an escape |
| F10 | minor | DO-3, RV-6 | accepted | The user's constraint is about 'the exact configuration of shaky cards' in a stage, and he explicitly allows that 'some might be the same' |
| F11 | minor | ★D1, ES-9, ES-1, TR-15, EN-2 | accepted | ★D1 calls option (c) 'Read it narrowly', but given ES-1 it is the literal reading |
| F12 | minor | EN-2, FZ-7, FZ-8, ES-2, ES-3, REVIEW 8 | accepted | The user asked that the end popup 'tell him which cards / card fields will be automatically frozen / unfrozen' |
| F13 | minor | CM-1, CM-4, FZ-9, RV-10, ES-4, EC-7 | accepted | CM-1, the user's own definition, makes the Context Menu depend on the selection: 'If nothing is selected, it should say Select some items…' |
| F14 | minor | ES-2, CM-5, RV-9, S8 | accepted | ES-2 says 'If you select several goals, each is a separate inference with its own premises', but does not say where 'its own premises' come from when the user m |
| F15 | minor | §11.1, §11.2 | accepted | The user wants 'proved' to mean proved from exactly what is shown, and §11 is not precise enough for that |
| F16 | minor | FZ-5, FZ-6, CM-3, RV-3 | partly | Partly: for held content I chose 'Allow this change' (FZ-5), so the held item may change while its holders stay frozen, and each holder's meaning change comes back for review. Unfreeze on a held item is not disabled. |
| F17 | minor | RV-9, DO-2, RV-8, EC-5 | accepted | The user's REVIEW 4 names the way to transform during a review: 'by declining multiple cards together and choosing the TRANSFORM option' |
| F18 | minor | RV-10, DO-1, EN-1, EC-6, RV-11 | accepted | RV-10 starts a Claude step whenever anything was declined |
| F19 | minor | ★D4, TR-3 | accepted | The user's sentence, 'drag a card into a trash section, where the card is still visible if he wants to drag it back, or delete it permanently', reads like a rec |
| F20 | minor | §1, FZ-8, RV-2, CF-5, FZ-11, FZ-12, TR-12, ★D5, §12-§13 | accepted | The revision runs to about 7,200 words (4,165 in spec_v2.md alone) and 70 clauses, against the original's 1,357 words |
| F21 | nit | RF-4, §14 | accepted | RF-4 is a decision ('your call, but not a ★') |
| F22 | nit | TR-4, FZ-11, CF-6 | accepted | The user asked that ''fuzzy' should be demarcated clearly for all affected fields' |

## logic

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| F1 | blocker | RV-7, §11.5, CF-4, CF-2, TR-4, TR-12, DO-3 | accepted | RV-7 decides which items are belief items by card kind |
| F2 | major | ES-2, §11.2, RV-1 (Add), RV-7, ES-5 | partly | Partly: a proposed premise stays outside the files until accepted (as proposed). On acceptance, telelean completes the proof mechanically from the checked conditional proof (soundness F7), with no extra Claude step. |
| F3 | major | RV-9, ES-2, ES-3, TR-4, S1, ★D3 | accepted | The revision says ES-2's preset (the selected goals' and premises' existing fields are frozen) is what closes S1 |
| F4 | major | RV-1, RV-2, RV-5, RV-8, §11.6 | accepted | The review list reveals the outcome before you judge the statements |
| F5 | major | RV-4, RV-7, RV-6, CM-3, RV-5 | partly | Partly: no cascading Accept at all. Accept stays disabled until dependencies are accepted ('Select them'). An explicit group Accept skips only RV-7 items; statement items you select yourself can be group-accepted. |
| F6 | major | RV-3, RV-4, §11.4, FZ-3, FZ-9 | accepted | RV-4 keeps the accepted items self-contained only when you Decline ('Declining an item that accepted items depend on asks you to return those to "in review"') |
| F7 | major | RV-3, FZ-6, FZ-7, FZ-8, EC-1, FZ-9 | accepted | A freeze is modelled as a single on/off bit, but it can come from five sources (FZ-7: starting a session, accepting an item, filling a transform field, rejectin |
| F8 | major | FZ-3, FZ-4, FZ-5, TR-12, ES-7, EC-8, EN-2.2 | accepted | FZ-3 lets you change frozen or held content yourself |
| F9 | major | ES-4, FZ-10, EC-3, §11.3 | accepted | 'The step rolls back to its last passing state' and 'A rollback never undoes your decisions' cannot both hold |
| F10 | major | ES-4, §16, §17 Enforcement, CF-3 | accepted | ES-4 says 'Every check runs as today (the gate), plus the frozen checks' |
| F11 | major | DO-1, DO-2, DO-3, RV-9, EC-5, EC-6 | accepted | Declined items wait for Submit review (DO-2: 'It runs at Submit review'), but a mid-stage step may change any unfrozen content |
| F12 | major | EC-6, RV-4, RV-10, DO-1..3 | accepted | Only Reject has a rule for pending dependents (EC-6), and even that leaves the dependent 'marked … and Claude must revise it' with no status |
| F13 | major | TR-15, RV-10, DO-2, RV-9, EN-1, EC-2, TR-14, RV-7, ★D1(a) | accepted | TR-15 has no conditions: every Claude-free transform's changes 'become items you have already accepted, and the session goes straight to the end confirmation' |
| F14 | major | EN-2.2, EN-3, §11.1, TR-12, EC-2, TR-3, ★D1(a) | accepted | EN-2 requires 'everything builds' on the final result, and its failure path is undefined |
| F15 | major | RV-1, RV-4, EC-5, RV-9 | accepted | RV-4's own example has two pending items for one card ('Prove G depends on Formalize G'), and a typical These-suffice step both formalises and proves the goal |
| F16 | major | FZ-7, DO-1, EC-1 | partly | Resolved the other way: Reject never freezes (fidelity F2, implementability F5). Claude may propose something different; Freeze stops all changes. |
| F17 | major | EC-1, FZ-10, FZ-9, FZ-2 | accepted | What Freeze freezes depends on which clause you read |
| F18 | major | FZ-6, ES-4, RV-9 | accepted | Unfreeze requests have no lifecycle |
| F19 | major | FZ-5, FZ-6, FZ-9, FZ-11, ES-2, EC-4 | accepted | Held content can be released only by unfreezing everything that holds it |
| F20 | major | ES-2, CM-4, CM-5, CF-2 | accepted | ES-2 never says which selected cards are goals |
| F21 | major | §17 Items, RV-1, ES-7, ★D1(a), EC-8 | accepted | Items are derived from 'the proposal's graph diff' |
| F22 | major | RV-10, EN-1, DO-1 | accepted | RV-10 and EN-1 end a session only when every item is accepted; any decline, including a Reject, starts a Claude step |
| F23 | minor | RV-9, ES-2, RV-8, §11.2 | accepted | Two gaps arise when one session holds several inferences |
| F24 | minor | RV-3, RV-1, EC-2, RV-4 | accepted | 'The content it produces' is undefined for several item kinds |
| F25 | minor | CF-3, §16 | accepted | CF-3 says premises:, ids and provenance are 'kept by telelean' |
| F26 | minor | ES-4, ES-6, ES-8, EC-7, EN-2 | accepted | Only Apply and Exit are defined as session ends |
| F27 | minor | EN-2.3, FZ-8, §15, EDIT SESSIONS 7 | accepted | (a) The keep ticks change the substance of EDIT SESSIONS 7 ('must be restored'), yet they are tagged '(keep ticks: new)' rather than '(changed: …)', and §15 lis |
| F28 | minor | §1 (Fuzzy), TR-4, TR-5, FZ-2, ES-2 | accepted | §1 defines Fuzzy as 'A field with no value yet, which Claude is to fill in' |
| F29 | minor | ES-3, TR-1, TR-15, FZ-7, §15 (EDIT SESSIONS 1 / INITIATING 2) | accepted | (a) ES-3 session-freezes non-selected cards when the window opens, yet 'cancelling it means no session starts' |
| F30 | minor | ES-1, CF-1, TR-11, FZ-7, FZ-9, EC-4, ★D1(a) | accepted | (a) CF-1 and TR-11 ('every card … transform it') include other subjects' vocabulary, which the board shows read-only |
| F31 | minor | FZ-8, EN-2.3, EN-3, §17 Storage | partly | Partly: card ids are never reused within a subject (RF-2), instead of keying by id plus date. Records whose card no longer exists are listed, never dropped silently (Appendix A6). |
| F32 | minor | RV-8, TR-1, TR-8, ES-3, RV-9, §16 (Feedback) | partly | Partly: 'Ask me instead' declines the affected items with Transform and a prefilled instruction (RV-10). Card-less transforms were not added. |
| F33 | minor | RV-1 (Add), DO-2, RV-9, TR-11 | accepted | RV-1 keeps the marks 'closes the gap (checked)' and 'may simply restate the goal' on proposed premises |
| F34 | minor | EC-9, FZ-9, RV-3 | accepted | 'Unfreeze all other cards' during a review un-accepts every accepted item outside the selection, because unfreezing returns items to 'in review' (RV-3) |
| F35 | minor | §11.1, §11.2 | accepted | §11.1 says 'Your files change only when a session ends successfully', which is false under ★D1(a): the A/D/G box writes directly, and so do Undo, History and ha |
| F36 | minor | RV-2, S1 | accepted | The badges cover 'belief' and 'changes your words', but not a change to your existing Lean, for example a GOAL's statement in a transform session where you left |
| F37 | minor | RV-9, DO-2, DO-1, EC-5, TR-15, §1 | partly | Partly: (1), (3), (4) and (5) accepted. (2) rejected: Reject stays uniform across Add, Change and Delete items. |
| F38 | nit | §1, EC-2, EC-5, EC-6, RV-5, RV-7, DO-1, DO-2, DO-3, TR-8, TR-10, RF-5, FZ-9 | accepted | Several terms are undefined or used inconsistently |

## soundness

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| F1 | blocker | FZ-5, RF-5, RV-1, TR-14, §17 (held sets), §11.3, §11.5 | accepted | FZ-5 holds only 'the vocabulary and definitions' a frozen card's Lean uses, and §17 computes that from `uses` |
| F2 | blocker | RV-7, RV-1, CF-4, TR-4, TR-12, ES-4, EN-2, §11.5, S6 | accepted | RV-7's list misses every way an existing name becomes an axiom |
| F3 | major | RV-5, RV-1 (Prove), RV-2, RV-8, ES-1, S7, §11.6 | partly | Partly: one neutral Result item per inference, as proposed. The reveal happens when every statement and belief item it depends on is decided (accepted or declined), or on Show result, per implementability F18 and fidelity F9, not only on acceptance. |
| F4 | major | ES-2, ★D3, S1, §16, FZ-2 | accepted | ★D3 asks the user to approve ES-2 because it 'reproduce[s] today's protection exactly' (S1; §16 'same protection by default') |
| F5 | major | CF-2, CF-3, CF-6, §1 (Derived information), FZ-1, FZ-4, TR-8, §16 | accepted | FZ-4 checks frozen fields, and §2 makes only Sentence, Kind, Why, Stance, Source, Lean statement and Proof into fields |
| F6 | major | RV-4, RV-3, EC-2, DO-1, DO-3, FZ-7, §11.4, S4, S9 | accepted | §11.4 ('the accepted items always form a self-contained whole') does not follow from RV-4 |
| F7 | major | ES-2 ('Claude may add cards'), RV-7 (last bullet), RV-1 (Add), ES-4, §11.2, S6 | accepted | ES-2 lets Claude add an ASSUMPTION card to close a gap, and RV-7 says a proof resting on it 'counts only once that item is accepted' |
| F8 | major | RV-1 (Vocabulary (N)), RV-7, CF-2 (Gloss), S2, S5 | accepted | RV-1 puts every changed plain vocabulary item (types, predicates, functions and constants, with their glosses) into the group-acceptable 'Vocabulary (N)' item,  |
| F9 | major | FZ-5 (second sentence), FZ-4, EN-2.2, ES-7, TR-8, §17 (meaning check; instance ban) | accepted | 'Nor may Claude add Lean that changes how frozen Lean is read' has no mechanism in any clause, though FZ-4 promises mechanical enforcement |
| F10 | major | CF-2, TR-4, ES-3, ES-4, FZ-12, RV-1 (Prove), §11.2 | partly | Partly: I chose option 1. Transform steps write no proofs (TR-14); proofs come from These suffice. |
| F11 | major | TR-4, RV-9, RV-7, RV-2, ES-2, S11 | accepted | Today the Lean of a card that existed before the run can never change (decisions-log: 'Otherwise Claude could point the goal at a new, weaker statement and free |
| F12 | major | ES-4, ES-7, TR-6, TR-13, TR-15, EC-3, §17, S10 | partly | Partly: the baseline is as proposed. In addition, a proof you accepted earlier in the session counts like yours for later inferences' permitted sets (logic F23); it never counts as your text for G0 or new-axiom. |
| F13 | minor | ES-2 (several goals), CM-5, RV-9, S8 | accepted | 'Each is a separate inference with its own premises' does not say how premises are assigned when one selection holds several goals; the tray shows a single 'pre |
| F14 | minor | RV-4, RV-7, RV-6 | accepted | 'Accept with its N dependencies' is a group Accept, and RV-7 says a group Accept skips belief items |
| F15 | minor | EC-8, ES-7, FZ-3, TR-14 | accepted | The user's own hand edits (ES-7) or transforms (FZ-3) of held content can change what accepted items mean, for example a change to HasDarkPast's body or gloss |
| F16 | minor | FZ-4, §11.3 | accepted | FZ-4 says telelean 'checks every state of Claude's working copy', but the gate judges states only at check_lean, statements-fixed, finish and Apply |
| F17 | nit | S2, S5 | accepted | S2's Lean is right |

## implementability

| id | severity | clauses | disposition | note |
|---|---|---|---|---|
| F1 | blocker | FZ-5, §17 (Enforcement), ES-2 | accepted | FZ-5 forbids Claude to 'add Lean that changes how frozen Lean is read, such as a new instance', and §17 mechanises this as 'New instances and attributes are ref |
| F2 | major | ES-4, RV-9, RV-10, ES-3, ES-2 (several goals), §17 (Sessions are runs with rounds) | accepted | §17 maps a stage onto today's round, but today's rules judge what is 'new since B' (your files at run start) against ONE selection: new-axiom allows an axiom ad |
| F3 | major | ES-2, RV-9, CM-4, CM-5, §11.2 | accepted | ES-2 lets several goals be selected, 'each a separate inference with its own premises' |
| F4 | major | RV-4, RV-7, ★D2, §11.5 | accepted | RV-4 offers 'Accept with its N dependencies' (one click, N+1 items); RV-7 says each belief item needs its own Accept and 'a group Accept skips them' |
| F5 | major | FZ-7, DO-1, EC-1, FZ-2, EC-6 | accepted | FZ-7 lists 'rejecting a change' among session freezes; DO-1 says a Reject keeps the previous content and forbids only the same proposal again; EC-1 says Reject  |
| F6 | major | ★D1, ES-9, TR-15, ES-3, ES-1, EN-2 | partly | Partly: TR-15 applies Claude-free transforms directly (one Undo step, no session), as proposed. ★D1 still recommends (a), with the literal reading (c) offered. |
| F7 | major | ES-3, ES-4, TR-1, TR-12, RV-8, §17 (transform-started sessions) | partly | Partly: transform steps write no proofs (accepted). A proof broken by a transform becomes a 'Proof broken' item rather than being removed. Card-less transforms were not added. |
| F8 | major | FZ-4, FZ-8, EN-3, EC-8, ES-7, §11.3, §17 (Storage, Enforcement) | accepted | FZ-4 keeps 'the frozen values' and checks the working copy 'against them'; §17 compares against 'telelean's frozen copy'.
- Stored values drift |
| F9 | major | TR-12, TR-3, TR-14, TR-15, EC-2, EN-2(2), FZ-3, RV-1 (Delete) | accepted | telelean's own edits touch other cards: a delete removes the card's id from every other card's premises: line and pins those cards; a D-11 kind change rewrites  |
| F10 | major | RV-1 (premise Claude proposes), RV-10, EN-1, ES-2, §16 row 1 | partly | Partly: the premise stays outside the files until accepted (accepted). Completion after acceptance is mechanical, so no Claude step is needed at Submit. |
| F11 | major | ES-2, §11.2 | accepted | ES-2 makes 'every empty Lean statement or Proof field of a selected card' fuzzy and freezes the selected cards' existing fields.
(1) A selected Derivation premi |
| F12 | major | FZ-5, FZ-6, EC-4, RF-5, §17 (held sets) | accepted | Held content can be released only by unfreezing its holders |
| F13 | major | FZ-11, EN-2(3), ES-2, ES-3, FZ-8 | accepted | Usability |
| F14 | major | FZ-9, EC-9, FZ-8 | accepted | Usability |
| F15 | major | TR-4, CF-4, CF-5, TR-2, §17 (ids) | accepted | TR-4 makes every field of a new card fuzzy |
| F16 | major | ★D5 | accepted | In this order, the slices are not each useful and testable on their own.
(1) Slice A has no visible effect |
| F17 | minor | ★D5 | accepted | 'M2 took about 25 M subagent tokens over roughly a day' misreads the log |
| F18 | minor | RV-5, RV-8, RV-10 | accepted | Usability |
| F19 | minor | RV-2, RV-6, RV-7, ★D2 | accepted | Usability |
| F20 | minor | CM-1, CM-3, CM-4, CM-5 | partly | Partly: the Context Menu stays a toolbar section as your CM-1 says (fixed height). The tray's controls move into it, and session controls go to the session bar. |
| F21 | minor | CM-2, FZ-9 | partly | Partly: a field is selected via its lock icon or Alt-click. Freezing still goes through the Context Menu (your FROZEN 2), so there is no direct lock toggle. |
| F22 | minor | FZ-10, ES-4 | accepted | A freeze you make while Claude works makes Claude's change fail 'at its next check' |
| F23 | minor | DO-1, RV-9, RV-10, EC-6 | accepted | (1) Rejects are carried out only at Submit review, by a Claude step, although reverting a rejected item needs no LLM |
| F24 | minor | TR-4, TR-5, FZ-2, RV-3, EC-1, FZ-9 | partly | Partly: your term 'fuzzy' is kept, defined as not frozen and empty; 'open' means not frozen and filled. Underneath it is one lock bit, as suggested. |
| F25 | minor | FZ-11 | accepted | In high-contrast themes the selection is already drawn as an inner ring (an inset box-shadow of 2px) |
| F26 | minor | CF-2, TR-13 | accepted | (1) TR-13's 'well-formed as far as can be checked before Claude fills the rest' cannot be decided: Lean you type may name vocabulary that Claude has yet to add. |
| F27 | minor | RF-2, RF-5, EC-2, TR-14 | accepted | (1) RF-2 says a reference to a deleted card shows 'deleted card', but ids are reused |
| F28 | minor | CF-6 | partly | Partly: provenance is kept minimal. Sentences only (worded_by), fixed so that your edit makes the sentence yours. No new markup field for now. |
| F29 | minor | EC-5, RV-1, RV-4, §17 (Items) | accepted | RV-4's own example gives one card two pending items (Formalize G and Prove G) |
| F30 | nit | DO-3, §13 S13 | accepted | 'Identical … ignoring … the names of bound variables' needs alpha-equivalence |
| F31 | nit | EN-2(2), §17 | accepted | EN-2 reruns all checks on the final result, including each goal's statement fixing and the G4 comparator, even when the final state is byte-identical to the las |

