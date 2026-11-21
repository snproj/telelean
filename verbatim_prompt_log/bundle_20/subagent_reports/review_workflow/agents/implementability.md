# review:implementability

## Verdict

I reviewed this for implementability against the current code and for daily usability. The revision says what must hold, but it often says nothing about how today's engine can deliver it. That engine has one target per run and judges everything against B, the user's files at run start. Several clauses contradict each other, and one would break today's main flow.

**Blocker.** FZ-5's ban on new instances, as §17 mechanises it, refuses `instance : Nonempty T := T.exists`. The system prompt requires that line for every new constant. So every These suffice on a model without existing constants would fail.

**Gaps the implementer cannot close alone:**
- The gate's "new since B" rules (new-axiom, footprint) judge against one selection. So any second inference, or a transform after an inference, in the same session can never pass.
- Several goals per These suffice clash with the single-target engine at every layer.
- Transform steps have no defined checks, and nothing says what a proof written in one may rest on.
- If frozen content is stored as values, a hand edit, Undo or git change between sessions deadlocks the next session. Keyed by id or Lean name, a freeze silently vanishes or moves to another card.

**Contradictions:**
- RV-4's "Accept with its dependencies" against RV-7's one-by-one Accept for belief items.
- FZ-7's freeze-on-reject against DO-1: rejecting one formalisation leaves that premise unformalisable for the whole session.
- EC-2 against TR-15 on deleting a card that others rely on.

**Usability:**
- The ES-2 and ES-3 presets turn the frozen ring and the EN-2 freeze list into noise.
- ★D1(a) sends a typo fix through preflight (2 GiB free memory), a base check that refuses when Lean is broken, and a full Lean check.
- An accidental "Unfreeze all other cards" can be undone only from a toast that expires.
- A fuzzy Kind cannot be represented as a card, and it lets Claude choose beliefs.

**★D5.** Slice A has no visible effect, and slice B needs C's transform window. Shipping the review list first, on today's gate, would give value sooner with less risk. The cost estimate counts all of turn 9 (M1, M2 and the report, 25.5 M) as M2's cost; M2 alone was about 12.6 M.

## Findings

### F1 [blocker] (feasibility) — FZ-5, §17 (Enforcement), ES-2

**Problem.** FZ-5 forbids Claude to 'add Lean that changes how frozen Lean is read, such as a new instance', and §17 mechanises this as 'New instances and attributes are refused while anything is frozen'. ES-2 session-freezes every existing card, so this ban is on in every session. But the vocabulary recipe Claude is given requires a new instance for every new sort that gets a constant (`axiom T.exists : Nonempty T` plus `instance : Nonempty T := T.exists`); without it `noncomputable opaque c : T` does not elaborate. Scenario: a fresh model with code-less cards ('Cynder would not be a good addition to the new Spyro game'). Claude adds `axiom Character : Type`, `axiom Character.exists : Nonempty Character`, `instance : Nonempty Character := Character.exists`, `noncomputable opaque cynder : Character`; every check refuses the instance; after 3 attempts the step reverts. Every These suffice that needs a new constant fails, and `@[simp]` lemmas are refused too. As worded, 'changes how frozen Lean is read' is also not something a rule can decide.

**Evidence.** packages/runner/src/run/systemPrompt.ts:35 ('constants `noncomputable opaque c : T`, where T needs `axiom T.exists : Nonempty T` and `instance : Nonempty T := T.exists`'); spec_v2_part2.md §17 'New instances and attributes are refused while anything is frozen'; board-ui.md §1.4 (the presupposition instance is plumbing, hidden on the board); gate-accept.md §3.3 (default #print hides instance arguments).

**Suggested fix.** Replace FZ-5's last sentence with: 'Nor may Claude change what frozen or held Lean means by any other route (a new instance, coercion, notation or attribute): telelean compares the fully explicit form of each frozen and held declaration before and after, and refuses any difference.' In §17 replace the instance sentence with: 'Add fully explicit #print probes (set_option pp.explicit true in set_option pp.notation false in #print N) for frozen and held declarations to the generated facts file (packages/runner/src/semantic/checkFile.ts), so the meaning check rides on the existing Lean job; instances and attributes are not banned as such.'

### F2 [major] (feasibility) — ES-4, RV-9, RV-10, ES-3, ES-2 (several goals), §17 (Sessions are runs with rounds)

**Problem.** §17 maps a stage onto today's round, but today's rules judge what is 'new since B' (your files at run start) against ONE selection: new-axiom allows an axiom added since B only as the .holds of an ASSUMPTION in the current selection, and footprint holds every declaration added or changed since B to the current selection's permitted set. In a session, content from earlier stages stays 'new since B'. Scenario: stage 1 proves G1 from P1 (Claude writes `axiom p1.holds` and `theorem g1.holds`); in stage 2 you run a mid-stage These suffice for G2 from P3 (RV-9), or a transform: new-axiom refuses `p1.holds` (P1 is not selected now) and footprint refuses `g1.holds` (it rests on P1, outside G2's set). The stage can never pass: 3 attempts, then revert. Advancing B to 'base plus accepted items' instead would need that subset as a file state, which is the partial-application problem S4 warns about.

**Evidence.** packages/core/src/gate/rules.ts:267-300 (allowedHolds built from selection.premises only), 499-530 (footprint judges every added or changed declaration against one `permitted` derived from `selection`); run-engine.md §1.10 ('Protected mechanically: only B … and A'); gate-accept.md §6.2(g)(1).

**Suggested fix.** Add to ES-4 and §17: 'B stays your files at session start. Every declaration a step adds is recorded with that step and its selection; new-axiom and footprint judge each added declaration against the permitted set of the step that produced it, and a declaration a later step changes against the later step's set. Accepted content is protected by the frozen check (FZ-4), not by B.'

### F3 [major] (feasibility) — ES-2, RV-9, CM-4, CM-5, §11.2

**Problem.** ES-2 lets several goals be selected, 'each a separate inference with its own premises'. (1) 'Its own premises' is undefined: there is no UI for a premise set per goal, and a shared set contradicts 'its own'. (2) The run engine is single-target at every layer: Selection.target is one id, StartRunMessage carries one target, freeze_statements 'takes exactly the target', propose_assumption needs that target's freeze, and G4, the permitted set, the verdict and the G→D item are all per target. Proving several targets in one Claude step means rewriting all of them. (3) Today any non-target selected card is a premise, including a proved Goal; if every selected Goal becomes a target, 'prove G2 from A1 and the proved goal G1' can no longer be said. CM-5 still describes the tray as 'premises ⊢ goal'. (4) RV-9's mid-stage These suffice gets no preset: in a session started by a transform the target's Lean statement may be open, so Claude can reshape the target before fixing it, the very weakening ES-2 prevents at session start.

**Evidence.** packages/core/src/gate/types.ts:151-158 (Selection.target: string); packages/core/src/protocol.ts:159 (StartRunMessage {target}); packages/runner/src/run/manager.ts:1984 ('freeze_statements takes exactly the target'), 2094; board-ui.md §4 ('Several goals are selected: choose the target with ⊢.'; premises are all other selected cards); gate-accept.md §6.2(g).

**Suggested fix.** Replace ES-2's 'several goals' bullet with: 'Targets are the cards you mark with ⊢ (a single selected Goal is the target, as today). With several targets, Claude proves them one after another in the same session, one step each, each from the selected cards that are not targets; one target's proof may not use another. Every inference, including a mid-stage one (RV-9), applies this preset to its own target and premises.' This keeps one target per Claude step.

### F4 [major] (inconsistency) — RV-4, RV-7, ★D2, §11.5

**Problem.** RV-4 offers 'Accept with its N dependencies' (one click, N+1 items); RV-7 says each belief item needs its own Accept and 'a group Accept skips them'. In every These suffice session, 'Prove G' depends on the Formalize items of the selected ASSUMPTION premises, which RV-7 classes as belief items. Read one way, one click adopts several beliefs, breaking §11.5 and ★D2(a). Read the other way, the button skips them and so can never complete for a Prove item in the main flow. The implementer cannot pick.

**Evidence.** spec_v2.md RV-4 bullets 1-2 ('Prove G depends on Formalize G, on the premises' items'), RV-7 bullets 1-2 ('formalising an assumption' is a belief item; 'A group Accept skips them'), §11 item 5.

**Suggested fix.** Replace RV-4's second bullet with: 'An item can be accepted only once everything it depends on is accepted; until then Accept is disabled and says what is missing (e.g. Accept the 3 premises' formalisations first), with a link to each. Accept with its dependencies is offered only when none of the missing dependencies is a belief item.'

### F5 [major] (inconsistency) — FZ-7, DO-1, EC-1, FZ-2, EC-6

**Problem.** FZ-7 lists 'rejecting a change' among session freezes; DO-1 says a Reject keeps the previous content and forbids only the same proposal again; EC-1 says Reject 'keeps it frozen'. Together, a Reject freezes the card's previous content for the rest of the session, so Claude may make no change to it at all. For a Formalize item the previous content is an empty Lean statement, which FZ-2 keeps empty. Scenario: you Reject Claude's Lean for premise P because it is wrong. P can now never be formalised in this session, the goal cannot be proved from it, and EC-6 asks Claude to revise items it can no longer make work. What you meant ('not this one, try again') is Shaky, but nothing tells you.

**Evidence.** spec_v2.md FZ-7 bullet 2 ('by rejecting a change'), FZ-2, DO-1; spec_v2_part2.md EC-1, EC-6.

**Suggested fix.** Delete 'by rejecting a change,' from FZ-7. Add to DO-1: 'A Reject does not freeze the card: Claude may propose something else for it, but not the rejected proposal. For an Add, the card is not created and may not be proposed again; for a Delete, the card stays and Claude may not propose deleting it again.' Keep EC-1's 'keeps it frozen' only for cards you froze yourself.

### F6 [major] (feasibility) — ★D1, ES-9, TR-15, ES-3, ES-1, EN-2

**Problem.** Under the recommended ★D1(a), every field edit is a transform, and TR-15 runs a Claude-free transform as a session that 'goes straight to the end confirmation'. Starting a session today means the busy check, egress consent, preflight (toolchain, bwrap sandbox, at least 2 GiB free memory), a shadow copy, and a base check that fails when 'your files have Lean errors'; EN-2 then reruns every check. Consequences:
(1) On this low-RAM machine, fixing a typo can be refused for lack of memory.
(2) While your Lean is broken (for example mid hand-edit), no card text can be edited from the board; today edits work even in syntactic mode.
(3) Each typo costs a Lean build.
(4) ES-1 allows one session per model folder, so while any session is open (possibly for days, ES-6) no board edit is possible in any other subject.
(5) The EN-2 dialog lists every card ES-3 froze.
(6) A quick edit is no longer one Undo step with a toast (D-17).
★D1 states none of these costs.

**Evidence.** packages/runner/src/run/preflight.ts:84-116; packages/runner/src/run/index.ts:44 (minAvailableBytes 2 GiB); run-engine.md §1.2 step 8 (base check refuses on Lean errors); edit-model.md §2.3 (M1 edits go straight through ModelWorkspace, one undo entry each); design-rationale.md §1.9 (D-16), §1.8 (D-17).

**Suggested fix.** Whatever ★D1 decides, replace TR-15 with: 'A transform that needs nothing from Claude is applied at once by telelean's existing card actions (sentence, why, stance and source edits; kind changes with D-11 and its dependents dialog; deletes with theirs), one Undo step per transform, with no session, no consent and no Lean check before writing. Inside a session it joins the current stage as accepted items.' Add these costs to ★D1, and an option (d): '(a) for how you edit (always through the transform window), with TR-15 as above'. Recommend (c) or (d).

### F7 [major] (gap) — ES-3, ES-4, TR-1, TR-12, RV-8, §17 (transform-started sessions)

**Problem.** ES-4 says a step runs 'every check as today', but today's checks are defined against a target: readiness, not-proved, G4, the footprint's permitted set, freeze_statements (exactly the target), propose_assumption, and the finish statuses and verdicts. A transform-started session has none of these, and the spec does not say what a transform step may do to proofs. Scenario: you transform premise P (new Lean), and the unfrozen derivation D, proved from P, no longer builds. Claude can repair D's proof (from which permitted set?), delete it, or fail the build three times and revert the whole step. Separately, RV-8's 'Ask me instead' opens a mid-stage transform that holds only a question, but ES-3 and TR-1 assume one or more selected cards.

**Evidence.** run-engine.md §5.5 (RunStartRequest, preflight, set-premises, freeze_statements, propose_assumption, finish, readiness, G4, verdicts, lifecycle item, context bundle and the static system prompt all assume a target); gate-accept.md spec_interactions EDIT SESSIONS 1-3 (proposed per-stage rule sets).

**Suggested fix.** Add to ES-4: 'A step started by a transform writes no proofs. It runs G0, the build, new-axiom, the vocabulary shape rule, the markup rule and the frozen and held checks, but no readiness checks and no G4. A proof that no longer builds is removed by telelean and listed as an item Proof removed ‹card›; you re-prove with These suffice. The step finishes as done or cannot, with a reason.' Add to TR-1: 'A transform may hold no cards; it is then only instructions to Claude (today's Feedback).'

### F8 [major] (feasibility) — FZ-4, FZ-8, EN-3, EC-8, ES-7, §11.3, §17 (Storage, Enforcement)

**Problem.** FZ-4 keeps 'the frozen values' and checks the working copy 'against them'; §17 compares against 'telelean's frozen copy'.
- Stored values drift. If standing freezes store values, any change that is not Claude's (a hand edit in VS Code, Undo, History 'Revert to this', git checkout, your own Claude-free transform) makes the stored value disagree with your files. In the next session the working copy, made from your files, already 'changes' the frozen field. Claude cannot restore a value you removed, so: 3 attempts, revert, deadlock. The same happens at Apply after an Undo.
- Keys break. A derived, unwritten id changes when the sentence is hand-edited; a vocabulary declaration renamed by hand gets a new key; ids are reused after delete and re-add. A standing freeze then silently vanishes (so Claude may edit the card next session) or attaches to another card.
- The wording overclaims. 'Checks every state' is not true: states are judged at check_lean, the statement fixing, finish and Apply, and in between Claude's tools can write anything in ws/, because the path guard sees paths, not contents. The frozen content itself also sits in the working copy for Claude to read; only telelean's record is hidden.

**Evidence.** edit-model.md §1.4 caveats (a)-(b), §3.2 Option B ('baseDrift compares model files only'; 'The id caveats of §1.4 apply'); run-engine.md §3.5 (Confinement: no per-file, per-card or per-span write restriction); edit-model.md uncertainties ('never' read as: no judged, shown or applied state).

**Suggested fix.** Replace FZ-4's bullets with: 'telelean records which cards and fields are frozen, in its own files that Claude cannot see or change. What frozen content says is taken from your files when a session starts, and again at Apply, so your own edits, Undo, History and git always define it. Every state telelean judges (each check, the statement fixing, finish and Apply) must leave frozen and held content as it was there; a state that does not is refused, so changed frozen content is never shown to you or applied. Claude is told what is frozen, but nothing depends on its compliance.' Add to §17: 'Freezing a card whose id is not written writes its id first (one undoable edit). An entry whose card or Lean name no longer exists is listed under Frozen items not found, never dropped silently; deleting a card through telelean removes its entry.'

### F9 [major] (inconsistency) — TR-12, TR-3, TR-14, TR-15, EC-2, EN-2(2), FZ-3, RV-1 (Delete)

**Problem.** telelean's own edits touch other cards: a delete removes the card's id from every other card's premises: line and pins those cards; a D-11 kind change rewrites other cards' proofs; pins, id write-back and the docstring mirror also touch blocks. ES-3 session-freezes every non-selected card, and FZ-4 refuses any state that changes frozen content, so kind changes and deletes become impossible whenever a dependent exists.

The delete clauses also contradict each other:
- EC-2 lets you trash a card others rely on, 'and Claude must deal with the dependents'.
- TR-15 runs a transform with no fuzzy fields, no instructions and 'Claude may add cards' off without Claude, and makes its changes 'already accepted'.
- EC-2 also says a Delete can be accepted only when nothing rests on the card.
- EN-2 requires everything to build.

Scenario: you trash 'Cynder has a dark past', which the goal's proof uses, and submit. No Claude runs, the Delete counts as accepted in breach of EC-2, the build fails, and Apply is refused; only Exit remains. Today's delete dialog offers 'Delete anyway', which marks dependents broken.

**Evidence.** edit-model.md §2.1 cascades 1-7 (packages/core/src/edit/planAction.ts:193-198; planKind.ts:171-202, 234-284); packages/webview/src/dialogs/Dialogs.tsx header ('Delete anyway', card only).

**Suggested fix.** Add to FZ-3: 'Edits telelean makes mechanically because of your action (removing a deleted card from premises lists, D-11 rewrites, pins, ids, the docstring mirror) may touch frozen cards; TR-14 lists them before you submit, and they count as your change, not Claude's.' Replace EC-2's second sentence with: 'In a transform you may trash a card others rely on: TR-14 lists them and offers to rewrite them (D-11), to mark them broken (as today's Delete anyway), or, if you leave Claude a job, to let Claude repair the unfrozen ones. EN-2's final check then requires everything to build except what you chose to mark broken, which it lists.' EC-2's first sentence then applies only to Delete items that Claude proposes.

### F10 [major] (gap) — RV-1 (premise Claude proposes), RV-10, EN-1, ES-2, §16 row 1

**Problem.** Today 'I hold this' makes telelean write the card, append it to the goal's premises:, fix the statements again and start a proving round. The revision turns the suggestion into an Add item but never says what accepting it does. If it is only a status, then once every item is accepted the session ends (RV-10): the new belief is applied, the goal was never proved with it, and the report says not proved. Also undefined: does Claude write the premise into the working copy (a proof could then already rest on it, and new-axiom must be relaxed)? Or does it propose it as today, outside the files and gap-checked in a scratch file, which is what keeps 'closes the gap (checked)' true?

**Evidence.** run-engine.md §1.8 'Adopt a ghost' (planGhostAdoption, re-freeze, startNewRound('prove')); design-rationale.md §1.3 point 3 ('Without this, a session could end successfully with the suggestion accepted but the goal never re-proved').

**Suggested fix.** Add to RV-1: 'A premise Claude proposes stays outside the working copy, as today's suggestion does. Accepting its Add item makes telelean write it (worded by Claude) and add it to that goal's premises; at Submit review a step proves the goal with it.' Add to RV-10: 'The session ends only when every item is accepted and no accepted premise is still waiting to be used.'

### F11 [major] (gap) — ES-2, §11.2

**Problem.** ES-2 makes 'every empty Lean statement or Proof field of a selected card' fuzzy and freezes the selected cards' existing fields.
(1) A selected Derivation premise without a proof gets a fuzzy Proof field. That invites Claude to prove the premise too, from an undefined permitted set. And because a proof Claude writes never widens the permitted set (only your own proofs count), the premise would still be unusable for the goal: wasted quota.
(2) A target that already has a proof gets that proof frozen. These suffice with a different (for example smaller) premise set on an already-proved goal is then refused until you unfreeze it. Today this works, because the target's .holds is exempt from 'existing declarations unchanged'.

**Evidence.** gate-accept.md §3.1 (derivation footprints count only for the user's own unchanged proof; permitted.ts:61-76), §3.2 (T.holds exemption, rules.ts:113-116); board-ui.md §4 (re-running These suffice on a goal replaces its declared premises).

**Suggested fix.** Replace ES-2's first sub-bullet with: 'Claude may fill the selected premises' empty Lean statements, the target's Lean statement if it is empty, and the target's proof; an existing proof of the target may be replaced (shown as Prove ‹card›, replacing your proof). Premises' proofs stay as they are.'

### F12 [major] (gap) — FZ-5, FZ-6, EC-4, RF-5, §17 (held sets)

**Problem.** Held content can be released only by unfreezing its holders. Scenario: under ES-2 every card is session-frozen, so the vocabulary item HasDarkPast is held by every card that uses it, say 12. Claude asks to refine it. FZ-6's request card offers 'Select them', but the held item is not frozen and cannot be unfrozen. You must unfreeze the Lean statements of all 12 holders, which also lets Claude rewrite those 12 statements: far more than you meant. There is no way to say 'let this item change, keep their text, and show me whose meaning changed' (D-18's 'meaning changed by refinement'). The spec also does not say whether Claude's step waits for your answer. Implementation trap: a card's uses list contains only vocabulary (it passes through other cards' statements without listing them) and covers the statement, not the proof. A held set built from it misses the card statements a frozen statement mentions and everything a frozen proof uses.

**Evidence.** packages/core/src/project/build.ts:483-506 (uses collects vocabulary items only, starting from the statement); design-rationale.md §1.6 (D-18 'meaning changed by refinement').

**Suggested fix.** Add to FZ-6: 'For held content, the request names the frozen cards that hold it and offers Allow this change: that item may then change while its holders' text stays frozen, and each holder whose fully explicit meaning changes comes back for review in the next stage, marked meaning changed by ‹item›. Claude's step waits for your answer, like a question, with its clock paused.' Add to §17: 'Held sets are computed over declarations, from Lean's references of each frozen statement and proof, through card statements, definitions and lemmas, not from the uses list.'

### F13 [major] (other) — FZ-11, EN-2(3), ES-2, ES-3, FZ-8

**Problem.** Usability. ES-2 and ES-3 session-freeze every card outside the selection. So during a session nearly every card and vocabulary box wears FZ-11's ring and lock, while the few fields Claude may actually change carry no mark. The ring stops carrying information, and your standing freezes look the same as the preset. At the end, EN-2(3) must list 'which cards and fields become unfrozen'. Under the preset that is every card of the subject, each with a keep tick: for example 10 cards and 9 vocabulary items, with their fields, in every session's confirmation. The freezes that come from your own decisions are buried among them.

**Evidence.** spec_v2.md ES-2 ('everything else is session-frozen'), ES-3 ('Every non-selected card is session-frozen'), FZ-8, FZ-11, EN-2(3).

**Suggested fix.** Add to FZ-11: 'During a session the preset is shown once, as a banner (Everything except the selected cards is frozen for this session), and the board marks what Claude may change (open and empty fields) instead of ringing every card. Standing freezes keep their ring and lock.' Replace EN-2(3) with: 'the freeze changes that come from your decisions in this session (accepted items, your own Freeze and Unfreeze, fields you filled), each with a keep tick; the preset is summarised in one line (the other N cards return to how they were).'

### F14 [major] (other) — FZ-9, EC-9, FZ-8

**Problem.** Usability. Freeze changes can be undone only from their toast ('Otherwise Undo and History never change freezes'). But the toast's Undo and Ctrl+Z both post the workspace undo, which undoes the latest file action. A freeze toast therefore needs a separate path, and Ctrl+Z after an accidental Unfreeze all other cards undoes something else, for example your last session's Apply. Toasts also expire, and only the newest undoable toast keeps its button. After that, an accidental Unfreeze all other cards cannot be undone, and the standing freezes it removed are lost unless you remember them all; they are your data and kept nowhere else.

**Evidence.** packages/webview/src/toasts/Toasts.tsx:5-7 ('Undo on a toast posts the protocol's undo, which always undoes the latest action. So only the newest undoable …'); edit-model.md §2.4.

**Suggested fix.** Replace FZ-9's third bullet with: 'Each freeze change is an entry on the board's Undo stack (Ctrl+Z and its toast undo it) that changes no file and makes no History snapshot. Unfreeze all other cards asks first when it would remove standing freezes, saying how many.'

### F15 [major] (feasibility) — TR-4, CF-4, CF-5, TR-2, §17 (ids)

**Problem.** TR-4 makes every field of a new card fuzzy. That includes Kind (a field by CF-4) and, for a new vocabulary card, its Lean declaration and so its Lean name, which CF-5 makes its only identity.
(1) A block without type: is not a card (TL003). A draft with a fuzzy Kind cannot be written into the working copy, has no column in the window or on the Proposed board, and freezes or references to it have no key.
(2) If Claude fills Kind, Claude decides whether the card is an ASSUMPTION, i.e. Claude chooses a belief, and RV-7 is left to catch it.
(3) A new vocabulary card with no name cannot be frozen or referenced until Claude names it.
telelean's founding interaction is that you choose each card's kind yourself.

**Evidence.** packages/core/src/markup/parser.ts:358-361 (TL003: type and natural_name required); edit-model.md §1.5 (a vocabulary item's only identity is its Lean name); run-engine.md §5.5 (fuzzy required fields need a representation); design-rationale.md §2 item 9 (prompt1.md:5: the user marks ASSUMPTION/DERIVATION/GOAL with a UI switch).

**Suggested fix.** Add to TR-4: 'Two fields are never fuzzy: a new card's Kind, which you choose when you add it (as in the A|D|G box), and a new vocabulary card's Lean name. telelean gives each new card its id when you create it.' List this in §15 as a change to TRANSFORM 4.

### F16 [major] (feasibility) — ★D5

**Problem.** In this order, the slices are not each useful and testable on their own.
(1) Slice A has no visible effect. Today's gate already makes everything in your files immutable to Claude (the markup rule and 'existing declarations unchanged'), so a standing freeze changes nothing in any run until the gate is relaxed. A can be tested only as UI, and field selection gets built before any field can be opened to Claude.
(2) Slice B needs slice C: its decline options include Transform (DO-2 'opens the transform window'), and its mid-stage actions include Transform cards… (RV-9).
(3) B looks like the riskiest slice, because Shaky lets Claude change, split or delete your cards. But under ES-2's preset, Shaky can only touch Claude's own new content: your fields are frozen, and EC-1 forbids Shaky on frozen cards. Today's gate already allows that, so B can ship on today's gate, and B is the slice you would use daily.

**Evidence.** run-engine.md §1.7 and §1.10 (B and A protected; Claude's content from earlier rounds not); spec_v2_part2.md EC-1; spec_v2.md ES-2, DO-2, RV-9; fake backends for testing exist (packages/runner/src/llm/fake.ts, fakeScripts.ts).

**Suggested fix.** Reorder the slices:
1. B′: the review list, statuses, belief items, the stage report, Submit review (a structured Feedback), Exit, Apply, Reject and Shaky, for These suffice sessions. It runs on today's gate plus one new rule: accepted items stay as accepted across stages. DO-2 becomes an inline 'edit the Lean yourself' in the item's detail.
2. A′: standing and session freezes, the Context Menu, field selection and the frozen look, unfreeze requests, and the gate generalised from 'your files are immutable' to 'frozen and held content is immutable'.
3. C: the transform window, transform-started sessions and Claude-free transforms (★D1).
4. D: references.
B′ is testable with the fake LLM scripts, and the risky gate relaxation lands only after the review that catches its changes exists.

### F17 [minor] (fidelity) — ★D5

**Problem.** 'M2 took about 25 M subagent tokens over roughly a day' misreads the log. 25.5 M is all of turn 9: M1 (≈ 9.1 M), M2 (≈ 12.6 M) and the project report (≈ 3.8 M). M2 alone took ≈ 12.6 M tokens and ≈ 15.7 h of workflow time. The proposed work is larger than M2: it rewrites M2's review, generalises its gate, adds a target-less run kind and multi-stage sessions, and replaces M1's direct edits and their e2e tests. Verifying the session slices also needs real-Claude runs, i.e. quota, which you asked to save.

**Evidence.** verbatim_prompt_log/bundle_9/response9_modelinfo.md:18-27 (turn-9 workflow table: M2-A 4.93 M, M2-B 5.75 M, M2-C 1.94 M); bundle_18/prompt18.md:4 ('I need to save quota for now'); packages/webview/test/e2e/m1-edits.spec.ts, m1-drag.spec.ts (direct-edit tests that ★D1(a) removes).

**Suggested fix.** Replace the D5 cost sentence with: 'M2 alone took about 12.6 M subagent tokens and about 16 hours of workflow time (turn 9). This is larger: roughly 1.5–2.5 × M2, i.e. about 20–30 M subagent tokens over 2–3 days, plus a few real-Claude runs to verify the session slices, each announced with its quota before it runs.' Give a figure per slice.

### F18 [minor] (gap) — RV-5, RV-8, RV-10

**Problem.** Usability. RV-5 hides a proof's result 'until the statements it proves are accepted', and the revision drops today's Show result.
(1) To see whether the goal was proved, you must accept (and so session-freeze) every statement; to decline one afterwards you have to un-accept it. That is extra clicks and extra freezes.
(2) Once you decline a statement, the Prove item stays hidden for the rest of the stage, yet RV-10 makes you decide it before Submit review.
(3) When nothing was proved there is no Prove item, so the stage report's verdict has no reveal condition at all.
D-19 asks you to judge meaning first, which today means stepping past the statements, not endorsing them.

**Evidence.** review-ui.md §1.2 (reveal after the last statement step; Show result, title 'Show the proof result now'), §1.6.

**Suggested fix.** Replace RV-5 with: 'A Prove item's result and the stage report's verdicts stay hidden until every statement item they depend on has a decision (accepted or declined), or until you press Show result, which notes that you saw the result before judging the rest.'

### F19 [minor] (other) — RV-2, RV-6, RV-7, ★D2

**Problem.** Usability. The review list is what you will use every day, but its states are not specified.
(1) Size: a session over a subject easily gives 50-100+ items (a Formalize and a Prove per card, vocabulary sub-items, definitions), with no grouping, filter or keyboard path. The protocol caps review items at 200.
(2) Narrow windows: the run panel drops below the board, so the list and the detail cannot sit side by side.
(3) While a step runs: can you keep deciding items (FZ-10 suggests so), and how do the items Claude is changing look?
(4) Click cost: take a goal with 3 code-less premises, 5 vocabulary items, 1 presupposition and 1 definition. Today the minimum is 4 actions (open Definitions, 2 yeses, Accept). With RV-7 and ★D2(a) it is about 10-12 (5 belief items one by one, a group Accept, Prove, Submit review, Apply), before reading anything. D-19 rejected an option for 'roughly doubling' your actions, and ★D2 does not state this cost.

**Evidence.** packages/core/src/protocol.ts:271 (LIMITS.reviewItems = 200); review-ui.md §0 (RunPanel below the board when narrow), §1.9 (Accept needs only the definition yeses); design-rationale.md §1.1.

**Suggested fix.** Add to RV-2: 'The list groups items by card (a card's Formalize and Prove together), can be filtered to in review, and works from the keyboard (↑/↓ to move, A to accept, D to decline). The detail has Accept & next. On a narrow panel the detail replaces the list, with Back. While Claude works the list stays usable, and items it is changing show updating….' State the click counts in ★D2.

### F20 [minor] (other) — CM-1, CM-3, CM-4, CM-5

**Problem.** Usability.
(1) The Context Menu is in the top toolbar, while the tray that shows what These suffice will use stays at the bottom, and These suffice itself moves to the top. For the most frequent action, the eye jumps between the two.
(2) The toolbar wraps, so a row of icons that depends on the selection reflows the header on every click.
(3) Icons whose labels appear only on hover are slow to learn, and they conflict with D-15's 'never colour or icon alone'.
(4) Exit session, which discards a multi-stage session, sits among the selection actions.
(5) Today's tray behaviours lose their home: choosing the target with ⊢, Self-evident? (no premises), Add to its premises ▶ versus replacing them, and the warning that These suffice drops declared premises.
(6) Two empty hints compete: CM-1's and the tray's '…then press These suffice'.

**Evidence.** board-ui.md §4 (tray texts; SelectionTray.tsx:186-197, 246-251) and spec_interactions CONTEXT MENU (the toolbar wraps, board.css:67-81).

**Suggested fix.** Replace CM-5 with: 'The Context Menu is a fixed-height row under the toolbar: on the left the selection (premises ⊢ target, with ⊢, Self-evident?, Add to its premises ▶ and the drop warning, as in today's tray), then labelled buttons for These suffice, Transform cards…, Accept and Decline…, then icons with labels for the rest, overflowing into a … menu on narrow windows. The bottom tray goes. Exit session and Raw Lean diff… live in the session banner.'

### F21 [minor] (gap) — CM-2, FZ-9

**Problem.** CM-2 says single fields can be selected but not how. Today:
- a click on a card selects the card;
- clicks inside the expanded part never change the selection, so its buttons work;
- F2 edits the sentence;
- the Lean statement and the proof share one code box.
So a click on the sentence must mean either 'select the card' or 'select the sentence', and the spec does not say which. 'Esc to clear' competes with Esc closing popovers, dialogs, editors and RF-3's dropdown. Presupposition entries are plain chips that cannot be clicked, so they cannot be selected without new UI.

**Evidence.** board-ui.md §4 (CardDetails L335, decisions-log L136; a plain click selects only that card), §1.4 (presupposition chips not clickable); edit-model.md §1.3 (card code runs from the statement to .holds).

**Suggested fix.** Add to CM-2: 'A click selects the card. Each field has a small lock gutter: clicking it freezes or unfreezes that field directly; Alt-click selects the field (Ctrl+Alt-click adds it). The Lean box shows the statement and the proof as two fields. Esc closes whatever is open first and clears the selection only when nothing is open.'

### F22 [minor] (gap) — FZ-10, ES-4

**Problem.** A freeze you make while Claude works makes Claude's change fail 'at its next check'. That failure counts as one of Claude's 3 attempts. After 3, the step reverts to its last passing state, which may be the step's start, so one click can discard the whole step. Claude also learns of the freeze only when a check fails.

**Evidence.** run-engine.md §1.5-1.6 (3 attempts, then settleReverted to the newest gate-pass, freeze or base commit).

**Suggested fix.** Add to FZ-10: 'Claude is told of the new freeze in its next tool result, and a check that fails only because of a freeze made during the step does not count as an attempt.'

### F23 [minor] (gap) — DO-1, RV-9, RV-10, EC-6

**Problem.** (1) Rejects are carried out only at Submit review, by a Claude step, although reverting a rejected item needs no LLM. Every Reject therefore costs quota.
(2) Until Submit, the rejected content stays in the working copy. A mid-stage These suffice or Transform (RV-9) can build on what you already rejected, which then breaks at Submit.

**Evidence.** spec_v2.md RV-10 ('Otherwise a Claude step handles each declined item'); run-engine.md §1.8 (Feedback starts a Claude round); bundle_18/prompt18.md:4.

**Suggested fix.** Add to DO-1: 'telelean carries out a Reject at once: it restores the previous content in the working copy and re-checks; items that depended on it are marked (EC-6).' Replace RV-10's second bullet with: 'If any item is declined with Transform or Shaky, or marked by EC-6, a Claude step handles them and the next stage begins. Otherwise no Claude step runs, and the session ends once every remaining item is accepted.'

### F24 [minor] (other) — TR-4, TR-5, FZ-2, RV-3, EC-1, FZ-9

**Problem.** Usability. The model asks you to learn three field states (fuzzy, open, frozen), on top of held and standing-versus-session freezes. On review items it also offers both Freeze and Accept: both freeze, only Accept changes the status, and Freeze blocks Shaky (EC-1). Fuzzy and open differ only in whether the field is empty, which you can already see. The one bit that matters is whether Claude may change the field.

**Evidence.** spec_v2.md TR-4, FZ-7, FZ-9 (Freeze offered on review items), RV-3; spec_v2_part2.md EC-1.

**Suggested fix.** Replace TR-4 with: 'Each field has one lock toggle: locked (Claude may not change it) or unlocked. An unlocked empty field reads Claude fills this; an unlocked filled field shows its value. A new card's fields start unlocked; copied fields keep their lock.' Add to CM-4: 'On review items the Context Menu offers Accept and Decline…, not Freeze.'

### F25 [minor] (feasibility) — FZ-11

**Problem.** In high-contrast themes the selection is already drawn as an inner ring (an inset box-shadow of 2px). So FZ-11's high-contrast 'inner outline' looks like the selection, and when a frozen card is selected, the selection rule replaces the frozen ring. Outside high contrast, the aura and the diff halos also set box-shadow, so an inset ring must be combined with them in every combination, or one silently wins. The ring's colour is not specified, and the theme colours in use are all taken: blue aura and focus, purple, green and orange kinds, teal vocabulary, git diff colours and warning colours. A new colour must be contributed and added to the theme test's whitelist.

**Evidence.** packages/webview/src/styles/board.css:1567-1570 (high-contrast selected: box-shadow inset 0 0 0 2px), 349-351 (aura), 1472-1476 (aura with diff); board-ui.md §5 (theme.test.ts whitelists the contributed colours).

**Suggested fix.** Replace FZ-11's bullets with: 'A frozen card shows a lock badge in its top row and an inset ring in a new contributed colour telelean.frozen (default: the editor foreground at 60%), combined with the aura and diff halos through per-layer CSS variables. In high contrast: the lock badge and a frozen chip, no ring. The legend gets a frozen entry.'

### F26 [minor] (gap) — CF-2, TR-13

**Problem.** (1) TR-13's 'well-formed as far as can be checked before Claude fills the rest' cannot be decided: Lean you type may name vocabulary that Claude has yet to add.
(2) The single-term rule fits a statement or a proof term, not CF-2's vocabulary field 'its type, or its body for a definition'. A definition's body uses the binder names of its signature, and a structure or inductive has no single-term body.
(3) CF-2 says telelean writes an assumption's .holds. Today Claude writes it while formalising, and needs it to exist during its checks.

**Evidence.** packages/core/src/gate/g0.ts:278-321 (single-term rules; the statement form refuses top-level := and |); run-engine.md §1.7 (Claude writes .holds for selected ASSUMPTIONs before the freeze; missing-holds checks it).

**Suggested fix.** TR-13: '…must pass the single-term rule and elaborate in a scratch Lean file against the current vocabulary; unknown names are allowed and listed (Claude must define: …), and each becomes a vocabulary or definition item.' CF-2: 'Vocabulary: the whole declaration as one field, checked by the vocabulary-shape rule instead of the single-term rule, and its gloss.' CF-2's note: 'When you type an assumption's Lean statement, telelean writes its .holds; when Claude formalises one, Claude writes it and the gate checks that it states exactly the statement, as today.'

### F27 [minor] (gap) — RF-2, RF-5, EC-2, TR-14

**Problem.** (1) RF-2 says a reference to a deleted card shows 'deleted card', but ids are reused. Delete a card and later add the same sentence, and the same id is derived again, so old references silently point at the new card.
(2) The stored form appears wherever natural_name is copied. The Lean docstring mirror (D-9) and the context bundle Claude reads both get raw id tokens unless telelean renders them.
(3) EC-2 and TR-14 count only reliance in Lean. Deleting a card that another card's frozen sentence references changes that sentence's meaning ('deleted card is too strong') with no warning.

**Evidence.** edit-model.md §1.4 caveat (b), §4.2 (anchor caveats); packages/core/src/edit/planAction.ts:129-135 (docstring mirror); run-engine.md §3.2 (context bundle).

**Suggested fix.** Add to RF-2: 'telelean never reuses a card id within a subject (deleted ids are remembered), and renders references as the target's sentence in docstrings and in everything Claude reads.' Add to TR-14 and EC-2: 'Cards whose sentences reference the card count as relying on it.'

### F28 [minor] (gap) — CF-6

**Problem.** Marking each field as 'Claude's wording' needs storage that does not exist yet. Only the sentence carries provenance (worded_by, a block field the markup rule protects). Vocabulary glosses are always marked as yours, and nothing records who wrote a reason, stance, source or kind. A new markup field is a format change and rebuilds the file on every write (D-12). A sidecar goes stale after hand edits, Undo and git. The implementer cannot choose alone, and 'when you edit the text, it becomes yours' cannot be detected for hand edits in VS Code.

**Evidence.** edit-model.md §1.2 (worded_by covers only the sentence), §8 item 3 (glossBy always 'user', vocabulary.ts:333); design-rationale.md §1.6 (D-12).

**Suggested fix.** Add to CF-6: 'Provenance is kept in the block: worded_by for the sentence, as today, plus a new list field agent_fields naming the other fields Claude wrote; telelean removes a field from that list when you change it in a transform. Glosses Claude wrote are recorded in a sidecar keyed by Lean name. Hand edits in VS Code do not change provenance.' Mark this as a markup format change for your approval.

### F29 [minor] (inconsistency) — EC-5, RV-1, RV-4, §17 (Items)

**Problem.** RV-4's own example gives one card two pending items (Formalize G and Prove G). But EC-5 says that when 'the same card' is in two pending items, 'the newer proposal replaces the older item'. Keyed by card, an implementation would drop one of the two. RV-1 also does not say how a card whose sentence, Lean statement and proof all change splits into items, and §17's 'stable item ids across stages' depends on that.

**Evidence.** spec_v2.md RV-1, RV-4 bullet 1; spec_v2_part2.md EC-5, §17 'Items'.

**Suggested fix.** Add to RV-1: 'Each card has at most two items: one for its fields (Add, Change or Formalize) and one for its proof (Prove). An item's id is (card, kind), stable across stages.' In EC-5 replace 'The same card in two pending items' with 'A newer item with the same id'.

### F30 [nit] (feasibility) — DO-3, §13 S13

**Problem.** 'Identical … ignoring … the names of bound variables' needs alpha-equivalence. Comparing text cannot decide that; it needs Lean. Yet S13 already concedes that a reworded repeat passes, so the extra precision buys nothing. 'What it proposes in their place' is also undefined for splits and merges.

**Evidence.** run-engine.md §5.4 (needs a canonical form and a rule for which cards count as replacements; trivially evaded).

**Suggested fix.** Replace DO-3's definition with: 'Identical means: the multiset of (kind, sentence, Lean statement), with whitespace collapsed, over the shaky cards' successors (same ids) plus every card added in that step, equals that of the declined set.'

### F31 [nit] (feasibility) — EN-2(2), §17

**Problem.** EN-2 reruns all checks on the final result, including each goal's statement fixing and the G4 comparator, even when the final state is byte-identical to the last state the gate passed. Today's Accept without drift runs no Lean at all, because what is applied equals what was judged. On this low-memory machine each comparator job is slow.

**Evidence.** gate-accept.md §5 (Accept with no drift: no Lean check runs; the applied files are exactly the judged ones).

**Suggested fix.** Add to EN-2(2): 'The final check reruns only when the final state differs from the last state the gate passed (your edits since, telelean's Rejects, Claude-free transforms); otherwise it reuses that result.'

