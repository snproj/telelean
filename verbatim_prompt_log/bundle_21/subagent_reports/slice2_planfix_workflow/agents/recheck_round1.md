# recheck:round1

Agent `a6fb39fa9cbf0d98c` of workflow `wf_aabed7c9-dbf`. Verbatim output (JSON alongside).

- **summary:** The slices you asked about (★D8 (a)):

1. **The new board**, with Formalize for dependencies running on today's all-or-nothing review. Built as:
   - 1a: two kinds of card (axiom and proposition);
   - 1b: arrows as board edits;
   - 1c1: the canvas and the columns above it;
   - 1c2: arrow gestures;
   - 1d: glows, bands and arrow looks;
   - 1e: Formalize for dependencies;
   - 1f: the Current view is read-only during a run;
   - 1g: end-to-end tests and the user guide.
2. **The review list**, which is the plan reviewed here. Built in this order:
   - 2a: contracts and the item model;
   - 2b1: judging;
   - 2b2: the backstop, taking content out, and the start checks;
   - 2c: meaning before proof, the session view and the messages;
   - 2b3: the type-constant probe and the runner engine;
   - 2d: sessions and steps;
   - 2e: review actions;
   - 2f: Add premise and the end;
   - 2g: the review panel and session bar, running beside 2b3 and 2d–2f;
   - 2h: the Proposed view in a session, Formalize, Undo, and retiring the old review.
3. **FROZEN**, including arrows.
4. **The transform window.**
5. **References.**

**Verdict on the revised plan**

Every finding from the first round now has plan text. The contracts I checked against the code agree with it: gate and run types, persistence, the shadow workspace, ActionOutcome, the protocol, `applyChanges`, adoption and the parser.

Seven of the round-1 fixes are incomplete, or create new problems:
- **S7:** the re-ask rule (D2-46) shows the outcome as soon as the step ends.
- **C2:** the Shaky rule (D2-48) blocks reworking anything two targets share.
- **S1:** the deferred premise write loses the user's hold-as choice.
- **S6:** the exception in start check 3 lets the source of Claude's arrow become a target.
- **I1:** allowing `open … in` on a declaration has no support in core's parser.
- **S8:** the four-write order has no exclusion between concurrent writes.
- **S3/S5:** the non-interference rule has holes (source positions, Lean messages, statement-phase definitions).

**New problems: 9 major, 12 minor, 1 nit**

Soundness (major):
1. A re-asked target's outcome is visible as soon as its step ends.
2. Skipping a step under A12 shows a hidden source's outcome, through missing Formalize items.
3. The masked graph keeps Lean's warnings and source positions, so the 2c test of identical views cannot pass.
4. The hold-as choice and its Why are not persisted, so a "pending proof" premise can be written as an axiom.
5. Writes to the working copy are not serialised: judge reverts against decisions, one `inFlight` slot, and a run.json write that hides its failures.
6. The source of Claude's accepted arrow can become a target, and the revealed Result then shows that target's outcome.

Implementability (major):
7. Shaky reworks across targets deadlock the Submit steps.
8. An accepted premise's content key changes when telelean writes it. It is then un-accepted, and Apply is refused.
9. Core's parser does not treat `open … in` as part of a declaration, so the new stray-command rule refuses exactly what the system prompt tells Claude to write.

Each finding gives concrete replacement text or tests. Only reading tools were used: nothing was built, tested or run, and no file was written.
- **findings:**
  - [1]
    - **id:** S1-reask-outcome-shown
    - **severity:** major
    - **where:** §3.2 'A re-asked target' (l.1013-1016); §3.4 last paragraph (l.1054); §3.5 hidden-Result bullet (l.1074); D2-46 (l.2138); 2d test (l.1900)
    - **problem:** D2-46 fixed round 1's S7, but it treats the two outcomes of a re-ask step differently as soon as the step ends.
- **With a proof:** the question is replaced, the step's new statement items stay, and T's Result gets a new, hidden version.
- **Without a proof** (or gave up, or skipped): ws/ goes back to S₀, so the new statement items vanish. InferenceView keeps the old question, and the old Result is revealed again (§3.5 ends the force, and pre is still the old step's). The stage report says "The new question for “T” was not proved: your earlier result stands."

So the user learns the outcome at once, and then reviews the new statement items knowing whether Claude proved T. This is the automation bias that RV-6 and D-19 exist to prevent. The leak is deterministic and happens on every re-asked target.
    - **fix:** Make the step's end look the same for both outcomes until R_T is revealed. Replace D2-46's text with:
- A re-ask step that passes, gives up or is skipped keeps its statement-phase content as items in every case. Without a proof, only T.holds, the step's proof material, its arrows and its premise drafts go back to S₀ (ES-2).
- T's Result is then hidden: its force ends, and pre(R_T) is taken from the re-ask step. InferenceView shows the question that was asked.
- Only at the reveal does the view show either the new version (proved), or the old question and old Result with their old statuses, plus the report line (not proved).
- Cancel and failure still go back to S₀ at once, since they have no outcome.

Keep the old version and its status on the record until the reveal. Add a re-ask pair (proved and not proved) to the twins of the 2c and 2e non-interference tests.
  - [2]
    - **id:** S2-a12-skip-shows-source-outcome
    - **severity:** major
    - **where:** §3.3 step 3 (l.1033-1036); §3.4 'skipped' row; §4.7 residual channels (l.1438-1440); D2-4 (l.2096)
    - **problem:** Under A12, T's step is skipped without contacting Claude whenever a source L, an earlier target of the same queue, has no `.holds`. So T's statement, and its sources' empty statements, are formalised only when L was proved.

Take the typical first session: a chain X → L → T of cards without Lean, both arrows selected. The visible list holds a Formalize(T) item exactly when L's hidden Result is "proved". T's step also goes from queued to ended without ever running, which the session bar and RunView.step show.

§4.7 lists only "a skipped step ends at once", as a timing residual. In fact the skip discloses R_L's outcome deterministically and lastingly, while L's own statements are still under review.
    - **fix:** Never skip the statement phase. When a source target of T's question has no `.holds` at S₀, run T's step in statements-only mode. The turn says that L was not proved, and asks Claude to:
- formalise the statements;
- call freeze_statements;
- finish not_proved naming L, with no proof attempt, under the gate-other rules.

T's Result then reads "not proved: “L” was not proved", as now. The visible items no longer depend on L's outcome; only the step's duration differs, which is the residual §4.7 already accepts. Revise D2-4 accordingly, or adopt its alternative and run the step normally. Add a chain pair (L proved and not proved, T without Lean) to the twins of the 2c and 2e non-interference tests.
  - [3]
    - **id:** S3-mask-keeps-messages-and-positions
    - **severity:** major
    - **where:** §4.7 'The masked model' (l.1417-1429) and 'Non-interference' (l.1430-1437); 2c tests (l.1871-1877); core/src/project/build.ts l.421-436 (Lean messages become `LEAN` board diagnostics, attached to the card whose statement or `.holds` range contains them)
    - **problem:** maskFacts replaces a hidden `.holds`'s facts and drops hidden names. The masked build, however, still sees two things that come from the real ws/ files.

(a) **Lean's messages.** `facts.build.messages` become board diagnostics carrying Lean's text, and a message inside T.holds is attached to card T. A linter warning in the hidden proof or in a hidden lemma ("unused variable `h`"; that linter is on by default) therefore shows on the board. Such a warning exists only when there is a proof.

(b) **Source positions.** Every position after hidden text in the same file moves with the proof's length: `TlNode.loc`, `VocabItem.loc` and diagnostic ranges.

Because of (b), the 2c and 2e tests that demand byte-identical SessionView JSON for proved and not-proved twins cannot pass as specified. They pass only if the generator never puts a proof before another declaration, and then (a) still leaks.
    - **fix:** In §4.7:
- maskFacts also drops every build or check message located in a hidden declaration: a hidden `.holds`, proof material, or a hidden premise card. A hidden `.holds` takes its own messages from its start facts.
- buildSessionView removes source positions from the masked graph: node and vocabulary `loc`, and diagnostic `range`. The Proposed view never opens ws/ (§5.10's "Open in editor" opens the user's file).
- The 2c twin generator varies the proof's length, places the proof before other cards in its file, and includes a proof with a linter warning.
  - [4]
    - **id:** S4-hold-as-not-persisted
    - **severity:** major
    - **where:** §2.2 ItemRecord.accepted (l.251-252) and StatusSnapshot (l.305); §2.9 PendingWrite.premises (l.823-824) and SessionWrite 'premise' (l.973); §3.6 'During a step' (l.1106-1111); §2.4 decideItems (`holdAs`, `rationale`)
    - **problem:** The user's hold-as choice (an axiom, or a proposition pending proof) and their one-line Why arrive in `decideItems`. No persisted record keeps them until telelean writes the card:
- ItemRecord, its `accepted` field and StatusSnapshot have no field for them;
- PendingWrite.premises.write and SessionWrite 'premise' carry only item ids;
- the ledger's `premise` entry, which does have `holdAs`, is written only after the adopt commit.

The main case of round 1's blocker fix (S1), an Add premise accepted during a step and written after it, therefore cannot be built as specified. The same holds for replaying that write after a crash, and for Redo of an undone premise Accept.

A builder who falls back on a default writes an AXIOM card where the user chose "pending proof". Under BD-6 the target can then glow green (established), although the user accepted the premise only as an unproved assumption.
    - **fix:** Add `holdAs?: 'axiom' | 'pending'` and `rationale?: string` to `ItemRecord.accepted`, for add-premise items. StatusSnapshot, and so the stack's Undo and Redo, then carries them. PendingWrite.premises.write and SessionWrite 'premise' read them from the record. ItemDetailView.heldAs shows the choice before the write ("written when Claude's step ends"). Add a 2f test: a pending-proof Accept made during a step, with a crash injected before the write, gives a PROPOSITION card with `axiom P.holds`.
  - [5]
    - **id:** S5-session-writes-not-serialised
    - **severity:** major
    - **where:** §2.6 write order (l.635-641); §3.6 Judging and 'A judged state that does not build' (l.1098-1105); D2-27 (l.2119); runner/src/run/persist.ts RunFiles.writeState and enqueue (l.105-108, l.148-155)
    - **problem:** D2-27 allows Accept and Decline while a judge runs, and the judge itself writes ws/ when it reverts items that no longer build. Both go through the four-write order, but the plan sets no exclusion between them, and `inFlight` has a single slot.

(a) **A stale revert.** A judge revert planned on state S1, after a Reject has moved ws/ to S2, fails in `writeFiles`, because its `before` texts no longer match. The plan does not say what happens then.

(b) **A lost decision.** Interleaved writes overwrite each other's `inFlight`. After a reload, recover() reverts ws/ to a `head` older than one committed write, and replays only the other write.

Separately, step 1 relies on run.json holding `inFlight` before any file changes. RunFiles.writeState, however, logs a failed write and resolves anyway, so the files are written even though step 1 never reached disk.
    - **fix:** Add to §2.6:
- Every SessionWrite of a session (decisions, pending writes, premise writes, completions, judge reverts) runs in one queue, from step 1 to step 4, with nothing interleaved.
- The judge's Lean job runs outside that queue. Its revert is planned inside the queue against the current head, and is dropped when the head is no longer the judged commit; a new judge is queued instead.
- Steps 1 and 4 use a run.json write that rejects on failure, and a failed step 1 aborts the write.

Add a 2e test: a Reject made while a judge runs that will revert an item.
  - [6]
    - **id:** S6-claude-arrow-source-becomes-target
    - **severity:** major
    - **where:** §4.12 check 3, last bullet (l.1561); §4.7 pre(R_T), Results bullet (l.1375); §4.8 E(T) (l.1445); D2-50 (l.2142-2146); §3.2 re-ask (l.1013-1015)
    - **problem:** Check 3 lets a new target L be the source of Claude's accepted arrow L → T, provided L → T is selected in the same request, which re-asks T. The queue runs L first. Until T's re-ask ends with a proof, D2-46 keeps T's old question, in which L appears only through E(T).

After L's step, RV-11 re-judges T. L's contribution changes from its claim (or the user's own proof) to its session proof, but only if L was proved. R_L is not in pre(R_T), because pre takes only the sources of Q(T). So the revealed R_T turns "updated", with a new Rests on "through L's proof", and its Accept says it "waits for a result that is not shown yet". Both show L's hidden outcome.

If T's re-ask then ends without a proof, this state persists. D2-50's invariant ("E(T)'s sources are never targets") is then broken for good, and §4.7's argument that nothing else can make one Result rest on another relies on it.
    - **fix:** Record on the inference the Claude arrows that a mid-stage request selected (check 3's exception). From that request on, their sources count as sources of T's question for pre(R_T) and cas(R_T), even while D2-46 keeps T's old question for B.1 and B.2. R_T is then hidden while R_L is. The user's own selection, unlike the arrow's visibility, does not depend on the outcome, so pre stays outcome-independent and does not flip back when the arrow item is hidden. Reword D2-50 to name the exception.

Add a 2b2/2e test:
1. Accept Claude's arrow L → T and reveal R_T.
2. Formalize X → L together with L → T.
3. After L's step, R_T is hidden, and the views are identical whether L was proved or not, including when T's re-ask ends without a proof.
  - [7]
    - **id:** I1-shaky-rework-across-inferences
    - **severity:** major
    - **where:** §3.3 step 2 (`openItems`, l.1030-1032); §3.6 Shaky (l.1093); §3.7 'Otherwise' (l.1130-1132); §4.9 step limits (l.1462-1465); D2-2 (l.2094); D2-48 (l.2140)
    - **problem:** Two decisions combine badly:
- Shaky keeps the declined content, and its dependents' content, in ws/ (D2-48).
- Submit runs one step per inference, and each step's limits open only that inference's own Shaky and to-be-redone items (D2-2).

So a Shaky item that another inference's content uses cannot be reworked. Example:
1. Targets T1 and T2 share a source S. S's Formalize item came from T1's step, and the user declines it as Shaky.
2. R_T1 and R_T2 become to be redone, with their proofs kept in ws/.
3. Submit queues a step for T1 (S's statement open) and one for T2.
4. In T1's step, T2's proof is fixed content. Once Claude changes S's statement, T2's proof no longer builds.
5. The build error is a global finding, so it counts against Claude, who may not touch T2's proof. After three attempts the step gives up.

If T2's step runs first (ties go by reading order), it re-proves T2 against the old S, and T1's step then breaks that proof the same way. The same happens to a vocabulary item or definition that another inference's statement uses.

DO-3 therefore works only within one inference. In the common case of a shared premise, the user can leave Shaky only by Reject or Exit.
    - **fix:** Before a Submit queue starts, take out every Shaky or to-be-redone item kept in ws/ that depends, directly or transitively, on an item that another inference's step in the queue opens:
- taking it out means reverting it, as one `decision` commit of the Submit;
- it becomes to be redone with `reverted: true`;
- its DO-3 set is still compared;
- its own step proposes it again.

Order the queue so that a step whose open items others depend on runs before those others (RV-5 order over the open items, then sources first). The alternative is RV-12's single Submit step, with every Shaky and to-be-redone item open (D2-2's alternative).

Add a 2e test: two targets share a source whose Formalize item is declined as Shaky; the rework changes the source's statement, and both targets are proved again.
  - [8]
    - **id:** I2-premise-key-changes-on-write
    - **severity:** major
    - **where:** §3.5 'Premise items' (l.1066) and 'a changed content key' (l.1069-1072); §4.3 (l.1292-1299); §3.8 Accept (l.1154-1158); §4.10 `content-changed` (l.1530); core/src/gate/adoption.ts l.122-138 (the written block gets `asserted`, `session`, `origin`, `worded_by`, the rationale, a derived id and possibly a different Lean name)
    - **problem:** A premise draft lives outside ws/. §4.3's content key hashes owned names, their texts and facts, owned field lines and the arrow, so a draft has nothing to hash, and the plan never defines a draft's key.

Once the premise is accepted and written, §3.5 computes its item from ws/. That item includes the new card's block lines (`asserted`, `session`, the rationale, and the id and Lean name that adoption chose), the card type that holdAs picked, the abbrev and `.holds` texts, the arrow and the mark removal. Its key therefore necessarily differs from the draft's.

Reconcile's "changed content key" rule then takes every accepted premise out of accepted, marked "updated", right after telelean writes it:
- re-accepting it would ask hold-as again and attempt a second write;
- leaving it unaccepted makes the backstop refuse Apply with `content-changed`.

The Add premise flow cannot complete as written.
    - **fix:** Define a premise draft's content key from its sentence, its whitespace-collapsed Lean statement and its target, and use the same key for DO-1's rejected premises.

In the SessionWrite 'premise', once the meaning-in-place check passes, set the record's `fingerprint` and `accepted.fingerprint` to the written item's key, in that write's step 4. This is safe because telelean wrote exactly the accepted draft and the render checked it. Reconcile then sees no change, and the backstop compares F with what was written. Keep the draft's key in `versions`.

Add a 2f test: an accepted premise stays accepted after its write and its completion, and Apply passes.
  - [9]
    - **id:** I3-open-in-not-declaration-text
    - **severity:** major
    - **where:** §2.8 system prompt (l.739); §4.9 `stray-command` (l.1491-1494); §4.2 (l.1265); core/src/markup/decls.ts parseHeader (l.202-232) and COMMAND_WORDS (l.53-89); core/src/gate/decls.ts DeclEntry.text (l.16-18)
    - **problem:** The plan tells Claude to put `open … in` on the declaration itself, and says that `open … in` written on a declaration is part of its text and content key.

Core's declaration scanner does not support this. parseHeader accepts only a docstring, `@[…]` attributes and modifiers before the keyword, and `open` is a command word. So:
- The idiomatic `open Classical in` on its own line above a theorem is a separate command outside every declaration. stray-command refuses it, with a message telling Claude to do exactly what it did.
- On one line, `open X in theorem foo …` is not recognised as a declaration at all, so the whole line is stray text.

Every attempt that follows the system prompt fails until the step gives up. No sub-slice lists markup/decls.ts, whose change would also reach G0, G5, normalisation and EditSession.
    - **fix:** Choose one of:
- (a) Treat `open … in` as a stray command too, and change §2.8's prompt line and §4.9's message to "write fully qualified names (e.g. `Classical.em`); no `open`". This is the smaller change.
- (b) Give 2a a parser change: scanDecls and parseHeader accept one or more `open … in` prefixes, on the declaration's line or the lines just above it, as part of its header and span. Add parser tests, and check that G0, G5, normalisation and EditSession still agree.

Either way, add a 2b1 test case showing that what Claude is told to write passes.
  - [10]
    - **id:** S7-step-start-records-not-persisted
    - **severity:** minor
    - **where:** §3.3 step 2 (l.1021-1024); §2.6 PersistedStep (l.606-627); §2.9 SessionCheckContext.items (l.936-937); §3.11 Resume
    - **problem:** §3.3 records two things on the step that PersistedStep has no field for:
- the item records as they were at S₀, which the step's own checks must judge with (§3.6);
- a re-asked target's `startHolds`, which moves to the inference only when the step ends with a proof.

After a reload during a step, Resume would judge with the current records instead. Suppose the user rejected an item during the step: the Reject is still pending, so the item's content is still in ws/, and the step limits keep it fixed. The resumed step's gate then reports `rejected-repeat` on content Claude may not change, and the step gives up.
    - **fix:** Add `startRecords: { items: ItemRecord[]; premises: PremiseDraft[]; rejectedArrows: ArrowEnds[] }` and `startHolds?: SessionInference['startHolds']` to PersistedStep. recover() and Resume build SessionCheckContext from them. Extend 2d's reload test with a Reject made during the step.
  - [11]
    - **id:** S8-hidden-result-shown-state
    - **severity:** minor
    - **where:** §4.7 'Status of a hidden Result' (l.1391-1402); §3.7 affected inferences (l.1130); §2.3 SessionView.submit.work (l.375); §3.6 accepted dependents (l.1094-1097)
    - **problem:** Three parts of the hidden-Result rules are left open.
- **The shown status.** The view shows rule 1's status, but ItemRecord has a single `status`, which the judge's rule-2 changes also overwrite. The reducer (2a) and buildSessionView (2c) are left to invent how to recover what to show.
- **Submit's plan.** §3.7 plans Submit steps from "the Shaky and to-be-redone items" without saying "visible". If hidden part items count (an arrow or `decl:` item of a hidden Result that a cascade or the judge made to be redone), `submit.work` and the step queue depend on the outcome.
- **Silent loss of an Accept.** Rule 3 keeps hidden Results out of cascade lists, so a Result accepted and later hidden again loses its Accept without RV-5's confirmation.
    - **fix:** Make three changes:
- Add `ItemRecord.shown?: { status: ItemStatus; reverted: boolean }`: the status as the user's own actions and rule-1 cascades left it. The reducer maintains it, and buildSessionView shows it while the Result is hidden, so a Result accepted and then hidden again still reads accepted.
- In §3.7, Submit's plan, its counts and its "nothing to be redone" test use visible items, plus hidden Results through `shown`.
- RV-5's confirmation lists a hidden Result accepted in `shown` by its label alone ("Result: “T” (not shown now)"). cas(R) and `shown` do not depend on the outcome, so this reveals nothing.
  - [12]
    - **id:** S9-statement-phase-decl-hidden-with-draft
    - **severity:** minor
    - **where:** §2.9 ItemDraft.partOfResult (l.809-810); §4.2 'Each draft carries' (l.1289) vs its proof-phase exception (l.1281); §4.7 'What is part of a Result' (l.1403-1406)
    - **problem:** §4.2 limits D2-42's exception to proof-phase declarations. partOfResult and §4.7, however, make every `decl:` item that only a Result's drafts reach part of that Result, statement-phase declarations included.

Take a definition Claude wrote before the freeze, which no card statement uses but T's premise draft does. It is hidden in the not-proved twin, where the draft exists, and visible in the proved twin, where there is no draft. Its visibility therefore shows the outcome.
    - **fix:** Restrict partOfResult and §4.7's bullet to proof-phase declarations, matching §4.2's exception. A statement-phase declaration is always its own visible item. Add this case to the 2c twin generator.
  - [13]
    - **id:** S10-host-sends-hidden-data
    - **severity:** minor
    - **where:** §3.12 (l.1229: "`frozen` is the current step's permitted summary"); §2.3 RunView of a session (l.504-511); §2.4 `openSessionDiff` (l.539); D2-5
    - **problem:** D2-5 makes the host send only masked data, but two paths still carry hidden outcomes.
- **RunView.frozen.permitted.** During T's step it shows a hidden source L's contribution: L appears in `unusable` without a `.holds`, and its session-proof footprint appears when L was proved. The webview does not render it today, but it is in every `run` message, and 2d's serialise-and-search test looks only for verdicts, proof text and lemma names.
- **openSessionDiff.** The raw diff shows every hidden proof, but the plan does not require the host to refuse a `reveal` list that leaves some hidden Result out.
    - **fix:** In a session, RunView.frozen keeps only `round` and `at`. The host answers `openSessionDiff` with `needs-confirmation`, giving the full list, unless `reveal` names every hidden Result. Extend 2d's test: RunView JSON is equal for proved and not-proved twins.
  - [14]
    - **id:** S11-force-survives-new-hidden-source
    - **severity:** minor
    - **where:** §4.7 'When a force ends' (l.1385-1390)
    - **problem:** A force ends only when a Result in pre(R) is "hidden again". Suppose the user forced R_T's reveal, and a mid-stage Formalize then makes S, a source of Q(T), a target. When S's step ends, pre(R_T) gains the new hidden Result R_S. R_S was never "hidden again", so R_T stays revealed. RV-11's update of R_T, with a new Rests on through S's proof, appears only if S was proved, so it shows R_S's outcome.
    - **fix:** Add a case to §4.7's list of when a force ends: "pre(R) gains a hidden Result (a source of Q(T) became a target)". Add a 2a reveal test.
  - [15]
    - **id:** S12-declined-arrow-left-in-question
    - **severity:** minor
    - **where:** D2-20 (l.2112); §3.2 re-ask (l.1014); §4.6 DO-0 (l.1355-1361); §4.9 B.2 allowed set (l.1499); spec §14.7
    - **problem:** A mid-stage Formalize may select Claude's accepted arrow L → T, and a proof then replaces T's question with one that contains L. If the user later declines that Add arrow item, DO-0 removes the arrow, but Q(T) still names L.

T's Submit step may then prove T from L with no arrow in ws/:
- B.2 passes, since L is in Q(T);
- rejectedArrows forbids proposing the arrow again;
- the backstop's B.2 passes on F too.

Apply then writes a proof that uses a card with no arrow into T. That breaks §14.7, and the board shows TL107 on the card.
    - **fix:** Q(T)'s sources count in B.1 and B.2 only while their arrow exists in the judged state. Declining a Claude arrow that a question selected also removes that source from the question: the Result becomes to be redone, and the stage report says so. Add a 2e test.
  - [16]
    - **id:** S13-claude-words-cross-steps
    - **severity:** minor
    - **where:** §4.7 'What is withheld' (l.1410-1416) and residual channels (l.1438-1440); D2-10; D2-22
    - **problem:** All steps share one Claude conversation (D2-22). So Claude's summary, gap, activity and tool results in a later step can mention an earlier step's outcome, for example "unlike T1, which I could not prove…".

These words are withheld only until their own Result is revealed, and that Result's reveal closure does not include unrelated earlier Results. Revealing R_T2 can therefore show R_T1's hidden outcome. §4.7 does not list this channel among the accepted residuals.
    - **fix:** Choose one, and state it in §4.7:
- Withhold a step's Claude words (summary, gap, Assumed without asking, activity) until the Results of that step and of every earlier step are revealed or forced.
- Or list the channel as an accepted residual in §4.7 and D2-10, and add a line to the system prompt: "never mention another target's outcome in your summary, gap or messages".
  - [17]
    - **id:** C1-ledger-after-rollback
    - **severity:** minor
    - **where:** §3.4 cancelled/failed row (l.1051); §3.2 re-ask (l.1015); 2d test 'dropped after a give-up rollback' (l.1902); §4.9 B.3 'exactly the ledger's arrows' (l.1472)
    - **problem:** Only the give-up and re-ask rules say that a step's ledger entries go with its rollback. Cancel step, a cap, a failure and Cancel of an interrupted step also return to S₀, and they would keep a ledger `arrow` entry whose arrow is no longer in ws/. B.3 requires the `premises:` differences to be exactly the ledger's arrows. Every later judged state would then fail B.3, and the session would show "did not pass" until it ends.
    - **fix:** State one rule. Every rollback (give-up, cancel, cap, failure, or a re-ask without a proof) drops, in the same write, the step's ledger `arrow` and `created` entries made after the rollback target. B.3 compares with the ledger arrows whose item is not declined. Add 2d tests for a cancel and a failure after a propose_arrow.
  - [18]
    - **id:** C2-reexport-source
    - **severity:** minor
    - **where:** §3.3 step 5 (l.1041); D2-19 (l.2111); runner gate/engine.ts freeze (the challenge is built from a copy of build/)
    - **problem:** D2-19 re-exports the challenge when E(T) grows after the freeze, but it does not say what the export is built from. Today's freeze copies build/, which at gate time holds the gated state. A challenge built from that state already contains any definition changed after the freeze. G4's `comparator-definition-mismatch`, the authoritative check, then can no longer catch such a change; only the facts-based `statement-changed` still would.
    - **fix:** In §3.3 step 5, build the re-export from the step's freeze commit (its frozen/<n> copy), changing only `permittedAxioms`. Add a 2b3 test: a definition changed after the freeze still fails G4 after a re-export.
  - [19]
    - **id:** I4-reducer-contract-gaps
    - **severity:** minor
    - **where:** §2.9 ReviewState (l.828-839) and ReviewOutcome's needs-confirmation `reveal` (l.854); §2.2 SessionAction (l.307-313); §2.3 SessionView.undo (l.370); §4.6 table (l.1344-1353)
    - **problem:** Three gaps in the reducer's contract:
- **pre(R) and cas(R) are missing.** reduceReview must compute the reveal closure for `needs-confirmation.reveal`, end forced reveals, and apply rule 1 over cas(R). ReviewState carries neither set, nor the inferences and step order needed to compute them.
- **Stack steps have no identity.** `undo.step`, `sessionUndo.step` and `PendingWrite.step` can only be stack depths. After an Undo and a new action, the new action has the old one's depth, so a stale `sessionUndo` undoes the wrong action.
- **A missing row.** The table has no row for the user setting a to-be-redone item back to review. RV-3 allows it, but for a reverted item "in review" would claim content that is not in ws/.
    - **fix:** Make three changes:
- ReviewState gains `waiting: Record<resultId, { pre: string[]; cas: string[] }>`, filled from reveal.ts.
- SessionAction gains `id: number` from a session counter; `undo.step`, `sessionUndo` and PendingWrite use it.
- Add a table row: "to be redone → in review" is allowed when the item is not reverted. When it is reverted, it is refused with "Its content was taken out: un-reject what took it out, or let Claude redo it at Submit review."
  - [20]
    - **id:** I5-endorsements-read-and-hash
    - **severity:** minor
    - **where:** §2.6 Sidecars, endorsements (l.648); §1.1 2c (l.121) and 2f (l.142-148); 2f test 'core stops flagging'
    - **problem:** Core's build is to drop `definitional-choice` for an endorsed definition, matched by name and text hash, and 2f writes those hashes at Apply. Two pieces have no owner:
- No sub-slice makes the runner's ModelWorkspace read endorsements.json (on load, on file change, and after an Apply or its Undo) and pass it to buildProjectModel, so 2f's "core stops flagging" test cannot pass.
- No core export gives the hash function. 2f, which changes no core file, would have to duplicate core's normalising and hashing.
    - **fix:** 2c exports `endorsementHash(text)` (or `endorsementOf(decl)`) beside `endorsementsPath`. Add reading endorsements.json to 2f's modelWorkspace.ts work, with a test that Undo of an Apply makes the flag return.
  - [21]
    - **id:** I6-2a-size
    - **severity:** minor
    - **where:** §1 table (l.70); §1.1 2a (l.91-100); §6.1 2a tests (l.1802-1831)
    - **problem:** 2a now holds:
- the shared contracts, `texts.ts` with every quoted text, the index file and the stubs;
- closures, computeItems with every ownership rule, content keys and the reconcile rules;
- RV-7 classes, and RV-5 dependencies with cycles (SCCs);
- the whole reducer: cascades, groups, the stack, seals, pending writes and rule 1;
- the reveal rules.

That is at least as large as round 1's 2b, which the plan split. Unlike 2b3, 2d and 2g, 2a has no fallback split point, and every later sub-slice waits for it.
    - **fix:** Give 2a a split point in §1:
- 2a1: contracts, stubs, texts, closures, computeItems, content keys and reconcile;
- 2a2: classify, deps, the reducer and reveal.

They run one after the other, under §0's rule of one builder at a time in core.
  - [22]
    - **id:** N1-check-context-for-session-judges
    - **severity:** nit
    - **where:** §2.9 runner `judge` and `finalCheck` (l.946-954); §2.7 JudgeInput.stage (l.674); runner/src/gate/engine.ts validateContext (l.124-135)
    - **problem:** For a stage or final judge, `judge(ctx)` and `finalCheck(ctx)` take a CheckContext whose single-target `selection`, `stage` and `round` the engine requires and validates today. JudgeInput.stage is required too. None of these has a meaning for these judges, and the plan does not say what to pass.
    - **fix:** State that for purposes `stage` and `final`, CheckContext's selection, stage and round are the active step's (otherwise the first inference's), and that judgeState ignores them. Alternatively, relax validateContext when `session` is set.
