# find:build

Agent `ab26bd7b5af6bcef6` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **summary:** Implementability review of the slice-5 plan. I checked it against slice 2's §2, §2.9 and §8 contracts, slice 3's and slice 4's hooks, and the code as built today (core edit/ids/build/parser/judge, runner ModelWorkspace/toolServer/manager, webview dialogs/dragGuard/BoardInput/vitest config). Most of the design maps onto real call sites: applyRecorded is the one write path, the extension watcher already covers .telelean/**, isSubjectSidecarFile keeps ids.json out of History, copyText exists, and graph.json picks node fields explicitly.

**Blocker (1):** none of the new rules has a source for the session's subject. JudgeInput and BackstopInput carry no subject. judgeState takes it from the first target, which is '' in slice-4 transform steps and in transform-only sessions. With '', S12 holding and the D5-8 forgery check switch off there without any error.

**Major (5):**
- Slice 5 relies on a "revalued.held" mechanism that slice 4 does not have. This contradicts slice 4's frozen-dependent rule, so a typed change to a held field always fails.
- Several functions the webview needs (DeletePlan.referencedBy, referencedBy and refProblems) only accept a ProjectModel, which the webview never has.
- The 5f1/5f2 tests need a DOM, but the webview has no DOM test harness, and installing one is not allowed.
- The instruction to stub every §2 function with a throwing stub would also make heldFields throw. Slice 3's check already calls it, so every judge test would fail from 5a to 5d.
- Raw-span markers and raw tokens in Claude-facing finding messages reach the person through the gate-attempt and notice detail views.

**Minor (14):** contract and test gaps. Signatures that don't match (planIdWrites vs writeSubjectIds). F1 needs changes in every planner's EditSession. Test fixtures that will break are not listed. An unreadable registry mid-session is not handled. namedIdsInText and TL112 use the wrong ids. takenIds avoids fewer ids than today's add-node. Ids are slugged from token text. The hidden-card test is impossible. The reference rule has no problem/backstop/final codes. The renderer's resolver goes stale and thrown tool errors skip it. The premise-window sentence conflicts with the adoption validator. The chip drag-stop mechanism won't work. CardRef has no name. The search ranking changes slice 4's matcher. Foreign vocabulary tokens in prose show "deleted card".

**Nits (2).**
- **findings:**
  - [1]
    - **id:** IMP-1
    - **severity:** blocker
    - **where:** §2.4 referenceFindings(i:{…subject…}), §2.5 heldFields/holdingMap/otherSubjectRefHolds/referenceHolds (all take subject), "judgeState runs referenceFindings among its global rules", "the backstop runs it on F"; slice 2 §2.7 JudgeInput and §2.9 BackstopInput
    - **problem:** Every new rule needs the session's subject, but JudgeInput and BackstopInput have no subject field and the plan never says where judgeState and applyBackstop get one. The built judgeState derives it from the first target: /home/zhengyew/telelean/packages/core/src/review/judge.ts:247-248, `firstTarget = scope?.target ?? ordered[0]?.target ?? ''` then `subject = current.nodes.get(firstTarget)?.node.subject ?? … ?? ''`. In slice 4's transform steps scope.target is `transform:<id>`, which is not a card. A transform-started session (claude-step or start-session) has no inferences at stage or final. In both cases subject is ''. With '', resolverOfModel resolves no card, referenceHolds and heldFields hold nothing, and referenceFindings checks no block. So FZ-4 bullet 2, RF-5 (a), S12 and D5-8 fail open, without any error, at gate, stage, final and backstop for those sessions.
    - **scenario:** 1. Card A is standing-frozen and reads "#[card:spyro-pg] is too strong".
2. The person selects spyro-pg and another card, and opens Transform cards… with one fuzzy Why. This is TR-15 claude-step: the queue's only step is transform:t1 and there are no inferences.
3. Claude rewords spyro-pg's sentence (open in the window) and writes `#[card:cynder-dark]` into the other card's Why.
4. judgeState(gate-other) gets subject '': heldFields(B,'',…) is empty and referenceFindings finds nothing.
5. The stage judge and finalCheck also get '' (no inferences), and applyBackstop has no subject at all.
6. Apply writes both changes into the person's files.
    - **fix:** 1. Add `subject: string` (required) to JudgeInput, BackstopInput and the runner's SessionCheckContext/finalCheck inputs, filled from the run's subject (RunStartRequest/PersistedRun), never derived from a target.
2. State in §2.4/§2.5 that referenceFindings, heldFields, holdingMap (freezeAtAccept) and otherSubjectRefHolds read it. Slice 3's other-subject rule should read it too.
3. Tests in 5c2/5d: a transform-only queue whose Claude step changes a held sentence, or adds a token, is refused at gate-other, stage, final and in the backstop.
4. Mutation check: deriving subject from targets must fail those tests.
  - [2]
    - **id:** IMP-2
    - **severity:** major
    - **where:** §3.6 last bullet ("revalues it like a held name (revalued.held with the field key)"), §2.5 ("slice 4's revalued.held"), §2.6, §3.7 ("listed as a warning only"), §6.1 5d S4 test; slice-4 plan §3.4, §3.11, §3.12
    - **problem:** Slice 5 relies on a slice-4 structure, `revalued.held`, that slice 4 does not have.
- Slice 4's revalue is a TransformFreeze on frozen keys only.
- Slice 4 says explicitly that it "revalues no held value (D4-21: holders are unfrozen, deleted or cascaded)".
- Slice 4's analysis makes "a dependent frozen by any other reason" a problem.
- Slice 5 instead calls a referrer of a changed field "a warning only" and says the typed change "revalues it like a held name", but held names are never revalued in slice 4.

No slice defines how a holder's expectation of a field key takes the person's typed value. Slice 3's step 3 therefore compares the holder's B-time expectation (from heldFields) with the new value and refuses.
    - **scenario:** 1. In a stage, card A is frozen and reads "#[card:b] is too strong".
2. The person opens a Transform on b and retypes b's sentence, with nothing for Claude, so the transform is queued.
3. Slice 5's analysis lists A as warning-only, so Submit is not blocked.
4. The transform step's typed write changes b.sentence.
5. At its gate-other judge, heldFields still expects A's hold of b.sentence at B's old value, which gives a `held` (changed) finding.
6. Every run ends with "Your transform … could not be carried out". 5d's test "a typed change to a held sentence passes and revalues" cannot pass on slice 4's contracts.
    - **fix:** Choose one and write it into §2.5/§3.6/§3.7.

(a) Slice 5 defines the revalue itself:
- A held key that has a TransformFreeze (pending or valued) is expected at that TransformFreeze's value in every holder's expectations except accepted ones: heldFields' standing, foreign, session-start and own-base holders, own {from:'state'} maps, and other TransformFreeze maps. For example: `heldFields(base, subject, entries, revalued: ReadonlyMap<HeldKey, HeldValue | {pending:true; text:string}>)`.
- Accepted holders leave accepted through slice 4's Submit cascade.
- Slice 4's "frozen dependent is a problem" rule does not apply to `reference`-via dependents.

(b) Follow D4-21: a frozen referrer of a changed field is a TR-13 dependent that must be unfrozen or trashed (a problem). Drop "revalued.held" and 5d's "passes and revalues" test.

Either way, remove `revalued.held` from §2.6's list of slice-4 requirements.
  - [3]
    - **id:** IMP-3
    - **severity:** major
    - **where:** §2.4 (DeletePlan.referencedBy; referencedBy(m: ProjectModel…); refProblems({model: ProjectModel…})), §3.7 board Delete, §4.3 CardDetails "Referred to by", §4.6 Delete dialog (5f2), slice 4's draft problems previewed in the webview
    - **problem:** DeletePlan never reaches the webview:
- The Delete dialog computes its own lists from the graph (/home/zhengyew/telelean/packages/webview/src/dialogs/Dialogs.tsx:182, `deleteDependents(dialog.id, { nodes, edges, order })`).
- The host only sends `dependents` on a needs-confirmation for broken Lean, and 2i keeps only that.

referencedBy and refProblems only accept a ProjectModel, which the webview never has. Yet three webview places need them: the dialog's "Referred to by ‹n› cards" line, CardDetails' "Referred to by" row, and slice 4's live draft-problem preview (slice 4 §4.1 runs analyseTransform in the webview, and slice 5 adds refProblems to it).
    - **scenario:** 1. 5c1 adds DeletePlan.referencedBy.
2. 5f2's builder must show "Referred to by 2 cards: …" in the Delete dialog.
3. No message carries DeletePlan and no graph-based function exists, so the builder either writes a second token scanner in the webview, which diverges from core, or shows nothing.
    - **fix:** 1. Add a graph/resolver-based core API: `referencedByIn(nodes: readonly Pick<TlNode,'id'|'subject'|'naturalName'|'rationale'>[], target)`, and refProblems over a RefResolver (plus subject, card, trashed, before). The ProjectModel forms become thin wrappers.
2. State that the dialog, CardDetails and slice 4's preview call these on the view's graph.
3. Either drop DeletePlan.referencedBy, or make planDeleteNode answer needs-confirmation listing the referrers unless confirmed. Say which.
4. Test that the webview list equals the core function on one fixture.
  - [4]
    - **id:** IMP-4
    - **severity:** major
    - **where:** §6.1 5f1 and 5f2 tests; §4.1 RefInput; §4.3
    - **problem:** The webview unit harness has no DOM, and the plan's 5f1/5f2 tests need one.
- /home/zhengyew/telelean/packages/webview/vitest.config.ts includes only `test/unit/**/*.test.ts` and runs in node ("Unit tests for the DOM-free parts").
- The repo has no jsdom, happy-dom or testing-library (root package.json), and installs are forbidden.

So these cannot be builder-run tests: RefInput's tests (`#` at a word start, never on paste or IME, Esc then Esc, Backspace past `#`, row click not committing InlineEdit, Ctrl+Z), RefText rendering, "pointerdown starts no drag", and 5f2's "DOM scan of panels, dialogs, toasts and menus". Playwright is integrator-only and runs only when RAM allows.
    - **scenario:** 5f1's builder tries to write "Esc keeps #query and a second Esc cancels the edit" or "a row click never commits InlineEdit" as a unit test and has no DOM. The tests end up as unrun drafts, so RF-1 and RF-3 ship unverified.
    - **fix:** 1. Put RefInput's logic in a DOM-free module, `webview/src/refs/inputModel.ts`: a pure reducer from (value, caret, inputType, isComposing, picker state, key) to (value, caret, picker state, insertion range).
2. Put RefText's chip segments and 60-character cuts in `refs/segments.ts`.
3. Unit-test each listed behaviour on those modules in node.
4. Move IME, paste, blur-commit, execCommand undo and pointerdown checks into `s5-refs.spec.ts` (integrator).
5. Replace the DOM scan with a source test: no `.naturalName` read in webview/src outside an allowlist of nameOf/RefText call sites. Optionally add `react-dom/server` renderToString checks of the dialogs.
  - [5]
    - **id:** IMP-5
    - **severity:** major
    - **where:** §0 ("5a writes every core module of §2 with stubs throwing NotImplementedError"), §2.5 heldFields ("the filled hook (3a's stub; signature adapted)"); slice 3 §3.4 step 3
    - **problem:** heldFields is not a new function. Slice 3's frozenFindings already calls 3a's hook, which returns [], on every judged state.

If 5a writes freeze/refs.ts with a throwing heldFields as §0 says, one of two things happens:
- freeze/index.ts exports the name twice, which is a compile error; or
- the live hook now throws, and every judgeState, backstop and frozen-check test in core and runner fails from 5a until 5d.

This contradicts §1's rule that each sub-slice ends compiling with its tests passing.
    - **scenario:** 5a's builder follows §0 literally. The slice-2/3 judge suites (about 1000 core tests, plus the runner's session suites) throw NotImplementedError("heldFields (slice 5d)").
    - **fix:** 1. Say that 5a moves slice 3's hook into freeze/refs.ts with the adapted signature, returning an empty ReadonlyMap and never throwing.
2. 5a updates the hook's single call site in the same sub-slice.
3. Only functions that nothing calls yet start as throwing stubs.
4. Record the signature change in §8.
  - [6]
    - **id:** IMP-6
    - **severity:** major
    - **where:** §3.4 raw spans, §2.8 CLAUDE_REF_TEXTS (rawSpan(token), rawSpan(S₀ value)), §2.7 Claude's text, I2, 5f2 DOM scan
    - **problem:** The raw spans (U+E000…U+E001 around stored text with raw tokens) are put into the Claude texts that core writes into GateFinding.message. Only the runner's Claude wrappers strip them.

But the runner also copies f.message into person-facing views:
- `GateAttemptView.failures[].detail = f.message` and notice `detail` (/home/zhengyew/telelean/packages/runner/src/run/manager.ts ~2261-2268);
- the webview shows that detail as `<pre>{notice.detail}</pre>` (RunPanel.tsx:206-209);
- slice 2 shows a session step's gate attempts once the results are shown (§3.12, StepView.activity).

The person would see private-use glyphs and raw `#[card:…]` tokens, against I2 and 5f2's own scan.
    - **scenario:** 1. Claude rewords a held sentence.
2. The gate's heldField text quotes ‹rawSpan(S₀ value)›.
3. After the queue, the person opens the step's attempts.
4. They read "#[card:spyro-pg] is too strong".
    - **fix:** 1. Add a core `renderForPerson(text, r)`: drop the markers and render in 'plain' style.
2. Require every runner path that copies a Claude-facing message into a view or sidecar to use it: GateAttemptView.detail, notices, attempts.jsonl records, the stage report.
3. Alternatively, keep markers out of GateFinding.message: give findings structured restore fields, and add the raw spans at the Claude choke point.
4. Add a 5e test: a held-field finding's attempt detail has no U+E000/U+E001 and no `#[card:`.
  - [7]
    - **id:** IMP-7
    - **severity:** minor
    - **where:** §1.1 5a ("Slice 3's planIdWrites becomes a call of writeSubjectIds, so there is one writer"), §2.2 writeSubjectIds
    - **problem:** The two signatures don't match:
- slice 3's `planIdWrites(m, subject, cards?): FileChange[]` returns whole-file changes, and its `cards` subset is used by the empty-Apply and Exit board step to write only the kept cards' ids (D3-16);
- `writeSubjectIds(session, m, subject): string[]` has no subset and needs the caller's EditSession.
    - **scenario:** 5a's builder rewrites planIdWrites through writeSubjectIds and drops `cards`. The Exit/empty-Apply board step now writes every derived id of the subject, which changes D3-16/D3-37 behaviour and slice 3's 3e1 tests. The other choice is to keep two writers.
    - **fix:** 1. Specify `writeSubjectIds(session, m, subject, cards?)`.
2. Define `planIdWrites(m, subject, cards?) = { const s = new EditSession(m); writeSubjectIds(s, m, subject, cards); return s.changes(); }`.
3. Say whether the end's board step keeps the kept-cards subset.
4. List the slice-3 tests that change.
  - [8]
    - **id:** IMP-8
    - **severity:** minor
    - **where:** §1.1 5a ("edit/planAction.ts: F1 at the end of every plan"), §2.2 writeSubjectIds ("skipping blocks the plan removes")
    - **problem:** F1 cannot be added at the end of planAction's dispatcher.
- Each planner builds its own EditSession and returns session.changes(): planAddNode, planEditNode, planDeleteNode, planChangeKind and planSetPremises in planAction.ts; add-arrows, remove-arrows, set-from-nothing and claim-pending in planArrows.ts; slice 3's set-freezes; slice 4's planTransform.ts.
- The dispatcher `plan()` only sees the finished FileChange[], and cannot map blocks again from that.
- EditSession's `removed` set is private (/home/zhengyew/telelean/packages/core/src/edit/session.ts).
    - **scenario:** 5a's builder edits only planAction.ts. F1 then never runs for arrow edits or apply-transform, so the sibling case (deleting A hands A's id to id-less B) comes back through those plans.
    - **fix:** 1. Add to 5a's files: `edit/planArrows.ts`; `edit/session.ts`, with either an accessor for removed blocks or a `changes({ writeIdsOf, lose })` hook that runs writeSubjectIds before keepOtherBindings; slice 3's freeze planner; slice 4's `edit/planTransform.ts`.
2. Add one F1 test per planner kind.
  - [9]
    - **id:** IMP-9
    - **severity:** minor
    - **where:** §0 "Slices 2–4 stay green … Known ones", §1.1 5a and 5b
    - **problem:** Two foreseeable test breakages are not listed:
- Core tests plan add-node with a PlanContext that has no `ids` (/home/zhengyew/telelean/packages/core/test/edit/helpers/scenarios.ts:15 and core/test/edit/arrows.test.ts:80). They are refused once 5a makes add-node require ids.
- 5b refuses in-session allocation without idsOf/recordIds. The runner's FakeWorkspace (/home/zhengyew/telelean/packages/runner/test/run/helpers/fakeServices.ts:170) and the extension's two fakes (extension/test/unit/fakes.ts:34, extension/test/suite/fakeWorkspace.ts:66) lack both. The plan also doesn't say whether a session start without recordIds is refused.
    - **scenario:** 5b's builder runs the runner suite. Every FakeWorkspace session test that writes an Add premise is refused with idsMissing, and possibly every session start too.
    - **fix:** 1. Add both to §0's known changes: 5a adds `ids` to the core CTX fixtures; 5b gives the three fakes idsOf/recordIds.
2. State whether a session start without recordIds is refused.
  - [10]
    - **id:** IMP-10
    - **severity:** minor
    - **where:** §2.2 recordIds ("logs and does nothing while the file is unreadable"), §1.1 5b ("records its id before the id is written anywhere"), D5-17
    - **problem:** If ids.json becomes unreadable during a session, recordIds silently does nothing. An in-session allocation then writes an id that was never recorded. D5-17 says allocation is refused in that case.
    - **scenario:** 1. The person hand-corrupts ids.json while the session waits in a stage.
2. They accept a premise; its write allocates x-2, recordIds only logs, and the card is written.
3. After they fix ids.json, a later allocation can give x-2 to another card.
    - **fix:** Every in-session allocation (premise write, add_card, slice 4's typed write) first checks idsOf(subject). When it is unreadable, the allocation is refused with TL203's text. A premise write then fails like an environment failure: taken back out, still accepted, still due. Add a 5b test.
  - [11]
    - **id:** IMP-11
    - **severity:** minor
    - **where:** §2.2 namedIdsInText ("the same, from one file's text"), §1.1 5a (markup/parser.ts TL112 text)
    - **problem:** Two parts of the core compute different ids for the same id-less block:
- the build suffixes derived ids project-wide, files in path order (/home/zhengyew/telelean/packages/core/src/project/build.ts:240-267);
- the parser derives ids within one file and emits TL112 with its own id as nodeId (markup/parser.ts:365-374).

So one file's text cannot give "the ids the build gave its cards". TL112's new promise ("telelean uses ‹id› and writes it with its next change") can name an id other than the one F1 writes, and attach to another card.
    - **scenario:** 1. Model/S/Inbox.lean has an id-less block "Cynder is dark"; the parser gives it cynder-is-dark.
2. Model/S/Main.lean has a block with `id: cynder-is-dark`.
3. The build gives the Inbox card cynder-is-dark-2.
4. TL112 says cynder-is-dark, with the nodeId of Main's card. F1 writes cynder-is-dark-2. namedIdsInText(Inbox) records cynder-is-dark.
    - **fix:** 1. Define namedIdsInText as written ids + premises entries + tokens + the parser's derived ids, and say it is an over-approximation.
2. Move TL112 into project/build.ts, using the build's node id.
  - [12]
    - **id:** IMP-12
    - **severity:** minor
    - **where:** §2.2 takenIds ("every card id of the project now, every id of registry[subject] and of every other readable registry…")
    - **problem:** takenIds avoids fewer ids than today's add-node. Today planAddNode avoids every block id of every file (/home/zhengyew/telelean/packages/core/src/edit/planAction.ts:43-44), including blocks outside any subject (TL120) and duplicate-id blocks (TL006). takenIds keeps only project cards plus the registries, and namedIds reads only the subjects' files.
    - **scenario:** 1. Model/Notes.lean, outside every subject, holds a block with `id: pg-rule`.
2. The person adds "PG rule" in subject S and the card gets pg-rule.
3. Later the person moves the Notes block into S: TL006, one card loses its id, and every reference to it.
    - **fix:** takenIds also treats every block id of every parsed file as taken, as add-node does today.
  - [13]
    - **id:** IMP-13
    - **severity:** minor
    - **where:** §2.2 ("Every new card id is deriveId(sentence, taken)")
    - **problem:** deriveId slugs the raw sentence, so a token's text becomes part of the new card's id.
    - **scenario:** In the A|P box the person types "#[card:spyro-pg] is too strong". slugOf gives card-spyro-pg-is-too-strong as the new card's id. Slice 4's typed new cards have the same problem.
    - **fix:** Derive the id from renderRefs(sentence, r, 'plain'), or from the sentence with its tokens removed. Add a test.
  - [14]
    - **id:** IMP-14
    - **severity:** minor
    - **where:** §6.1 5e ("decide refuses a premise Why naming no card, and one naming a hidden card, with the same text"); §1.1 5e
    - **problem:** The hidden-card half of this test cannot be built. An Add premise item is a Result's part, and slice 2 refuses any decision on a hidden item ("show them first", fixer 2a V2A-S2). So an Add premise Accept happens only while the results are shown, when the model the person sees is unmasked and no hidden card exists to name.
    - **scenario:** 5e's builder cannot construct a state where a premise Accept is allowed while some card is hidden.
    - **fix:** Keep only the "names no card" case in 5e. Put the hidden-card twin on slice 4's draft problems: a stage window opened while the results are hidden (masked), as an (S4) test.
  - [15]
    - **id:** IMP-15
    - **severity:** minor
    - **where:** §2.4 (GateFindingCode + 'reference'), §2.8 (the reference stage problem text), §2.4 "the backstop runs it on F"
    - **problem:** The rule has no typed place to report at stage, final or in the backstop:
- StateJudgement.problems' code union is unowned | no-longer-builds | facts | scc, plus slice 3's frozen;
- BackstopRefusal.code has no reference code;
- FinalCheckRule has no reference rule.
    - **scenario:** 5c2's builder must put a `reference` stage problem, a final-check failure and a backstop refusal somewhere. Without typed codes the end confirmation and the view cannot label them, so builders invent different codes or reuse `unowned`.
    - **fix:** In §2.4, add 'reference' to StateJudgement.problems' code, BackstopRefusal.code and FinalCheckRule, with the board sentence and the end confirmation's line. 5c2 writes them.
  - [16]
    - **id:** IMP-16
    - **severity:** minor
    - **where:** §2.7 Claude's text (renderingSession(inner, resolver), renderingToolHost(inner, resolver)), §1.1 5e
    - **problem:** (a) A resolver fixed when the session and tool host are wrapped ("once") goes stale, while §2.7 itself asks for the newest model of ws/.
(b) Tool refusals are thrown. /home/zhengyew/telelean/packages/runner/src/llm/toolServer.ts:171-174 turns them into "telelean ‹tool› failed: ‹message›", bypassing a wrapper that only maps returned results.
    - **scenario:** 1. A thrown error whose message quotes a sentence with a token reaches Claude raw.
2. After Claude's whole-model edit and a check, tool results are still rendered with the sentences from before.
    - **fix:** 1. Use `renderingSession(inner, () => RefResolver)` and `renderingToolHost(inner, () => RefResolver)`.
2. The tool-host wrapper catches thrown errors, renders their messages and rethrows.
3. Cover both in 5e's transcript scan.
  - [17]
    - **id:** IMP-17
    - **severity:** minor
    - **where:** §1.1 5c2 ("its validators in gate/adoption.ts (a premise's sentence)"), §3.5 'added' sources, §4.4 (slice 4's window: draft sentences and Whys); slice 4 D4-14 premise window
    - **problem:** The plan doesn't say whether the slice-4 premise window's sentence takes `#`. If it does, two things break:
- 5c2's token refusal sits in gate/adoption.ts, which also writes typed premises, so it refuses the person's typed premise sentence at its write;
- `added` counts only 'line' typed units and accepted.rationale, not slice 4's `premise` unit.
    - **scenario:** 1. The person transforms a suggested premise and types "#[card:new-spyro-pg] makes it PG".
2. They accept it.
3. The premise write fails in adoptionPlan.
4. If it were written anyway, `added` would refuse the card's natural_name.
    - **fix:** State whether the premise window's sentence takes `#`. If it does: refuse tokens only in the propose_assumption handler (5e), and let `added` count a live `premise` unit's naturalName on its written card's natural_name.
  - [18]
    - **id:** IMP-18
    - **severity:** minor
    - **where:** §4.3 ("On a card face a chip's pointerdown stops propagation, so it never starts a drag or a selection")
    - **problem:** A React stopPropagation stops none of the listeners that start drags and moves:
- dragGuard listens on the card in capture phase (webview/src/board/dragGuard.ts);
- BoardInput listens natively on `board` (bubble) and on `document` (capture) (BoardInput.ts:783-784).
All of these fire before React's root dispatch.
    - **scenario:** Pressing a chip on a canvas card and moving the pointer still moves the card through BoardInput.startMove, or drags a column card through pragmatic-dnd.
    - **fix:** Give chips `data-nodrag` (part of NO_DRAG_SELECTOR), which dragGuard and BoardInput.startMove already honour. The chip's React onClick stops the card's React click. Keep the pointer check in s5-refs.spec.ts.
  - [19]
    - **id:** IMP-19
    - **severity:** minor
    - **where:** §4.6 ("Every webview place that names a card in text uses nameOf"); slice 2 CardRef { id, type, sentence, wordedBy }
    - **problem:** Session views name cards through CardRef, which has no `name` field. nameOf(Pick<TlNode,'naturalName'|'name'>) therefore cannot apply at review rows, cascade dialogs or the end confirmation.
    - **scenario:** A cascade dialog lists a CardRef whose sentence holds a token. 5f2's builder has no name to show and prints the raw sentence, or improvises a resolver with the wrong (unmasked or Current) graph.
    - **fix:** Add `name?` to CardRef, filled by buildSessionView from the masked model. Or state that those sites render CardRef.sentence with resolverOfGraph(session.board.graph).
  - [20]
    - **id:** IMP-20
    - **severity:** minor
    - **where:** §1.1 5f1 and §4.2 searchRefs ("slice 4's sentence matcher, extended"); slice-4 plan §4.4 and 4k tests
    - **problem:** The two rankings differ:
- slice 4's CardSearch ranks word-prefix matches first, then substrings, case-folded;
- slice 5's searchRefs requires every query word, uses foldText, and ranks by word start, then position, then board order.
Extending the one matcher changes slice 4's Dependencies search and its 4k CardSearch tests, which §0's known changes don't list.
    - **scenario:** After 5f1, a multi-word Dependencies query that slice 4 matched as a substring no longer matches, and slice 4's ranking tests fail. Nobody has listed this as intended.
    - **fix:** List the slice-4 CardSearch tests that 5f1 changes, with the reason. Or keep slice 4's ranking as an option of the shared matcher for the Dependencies editor.
  - [21]
    - **id:** IMP-21
    - **severity:** minor
    - **where:** §2.3 ("the webview resolves every lean: token from graph.vocabulary"), §4.4 session prose (answers, Shaky notes, Instructions)
    - **problem:** graph.vocabulary holds another subject's item only when a card of this board uses or references it. A `#[lean:S2.X]` token in session prose naming an otherwise unused foreign item therefore shows "deleted card" to the person, while Claude's rendering, which resolves over the project model, gets the real name.
    - **scenario:** The person pastes a reference copied on S2's board into an answer to Claude. The chip reads "deleted card", while Claude reads "InGame [S2.InGame]".
    - **fix:** Add the Lean names referenced by the session's prose (answers, notes, Instructions) to the band's `wanted` set. Otherwise label an unresolved lean token "‹name› (not on this board)" instead of "deleted card".
  - [22]
    - **id:** IMP-22
    - **severity:** nit
    - **where:** §2.3 renderRefs/isMirrorOf, §2.8, §3.3, D5-11 ("reads ‹deleted card›")
    - **problem:** ‹…› means two things in the plan: placeholder notation everywhere, and literal characters in the 'plain' rendering and in isMirrorOf's regex. Texts are "used verbatim", so builders cannot tell whether chips and labels read "‹Cynder has a dark past›" or "Cynder has a dark past".
    - **scenario:** One builder renders labels with literal guillemets and another without. The mirror docstrings then fail isMirrorOf, and the 5f2 DOM scan expectations disagree.
    - **fix:** Mark the literal U+2039/U+203A explicitly in renderRefs and isMirrorOf, and state that chips and nameOf labels in UI text have none, or say which have them.
  - [23]
    - **id:** IMP-23
    - **severity:** nit
    - **where:** §1.1 5b ("The run's workspace interface (run/types.ts)"), §1.1 5a heading ("Core only"), §2.8 system prompt line, §0 FakeBackend rule
    - **problem:** Four small inaccuracies:
- The run uses ModelWorkspace from runner/src/workspace/types.ts; run/types.ts only imports it.
- 5a's heading says "Core only", but 5a also adds the runner's IDS_FROM_MODEL.
- The system prompt line omits `#[lean:NAME:FIELD]`.
- §0 says every cheat is also built in core/test/refs/cheats.test.ts, but cheats 6 and 7 are runner behaviour (5e, 5b).
    - **scenario:** A builder edits the wrong file, or a test that copies the system prompt line misses one token form.
    - **fix:** 1. Name workspace/types.ts in 5b.
2. Change 5a's heading to "Core, plus the runner stopgap".
3. Add `#[lean:NAME:FIELD]` to the system prompt line and its fixture.
4. Exempt cheats 6 and 7 from the core cheats file.
