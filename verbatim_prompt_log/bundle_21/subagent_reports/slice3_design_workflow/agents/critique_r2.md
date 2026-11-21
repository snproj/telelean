# critique:r2

Agent `a0abbc6b24c872b82` of workflow `wf_d355dac3-0d9`. Verbatim output (JSON alongside).

- **summary:** I reviewed the round-2 slice-3 plan against: the user's own words (prompt20 lines 26–59; D3 in prompt21_midturn); spec §5, ES-2, RV-4/5, EN-2 and Appendix B; the slice-2 plan's §2/§2.9 contracts and its §8 builder entries; and the built code (review/items.ts, records.ts, reducer.ts, run/manager.ts, persist.ts, workspace/undo.ts and modelWorkspace.ts, confinement.ts).

**No blocker found, but 7 major and 10 minor problems remain**, most of them introduced or left by the round-1 fixes.

**Round-1 fixes that hold:** F1–F4 (the two-value rule, madeAt, accepted items checked like own freezes), F8, F12–F17 and F19–F21. Two exceptions inside those:
- F4's "own names included" is undone by step 3's exclusion rule (finding 9).
- F13's narrowings are logged, but the Undo path ignores D3-6 (finding 14).

**Round-1 fixes only partly fixed:**
- **F5 (the ids commit):** the claim "F holds every id" is broken by ordinary Rejects. Built 2a1 code attaches the `id:` write-back to the card's item (finding 6).
- **F6 (asking before changing frozen content):** the check before each decision's write misses Submit's take-out, which D3-42 widened (finding 3). Its dialog also cannot clear an accepted reason that D3-4 keeps on reconciled items (finding 4).
- **F11(3) (optional fields):** the optional contract fields fail open. This is the same pattern slice 2 removed in V2A-S5 (finding 5).
- **F18 (replaying the end):** `recover()` ignores ended runs (finding 15).
- **F10 / D3-44:** re-raised as user intent. D3-44 narrows FROZEN 1, although a sound and simple way to keep it exists, which the task's directive does not allow.

**New problems:**
- Freezing a card whose own text equals B's stores B's held content, not the version the person sees. The result is an immediate stage problem, and §5.3's own advice ("freeze it again") leads straight into it (finding 1).
- Back to review (D2-54), combined with whole-delta Undo (D3-22), can silently unfreeze freezes made in the end confirmation (finding 2).
- Some freezes made while Claude works can never be met. The two cases: the step's own ledger entries, which Claude cannot withdraw, and content already fixed by freeze_statements. The step then burns counted attempts and gives up (finding 7).

**Smaller points:**
- whole-model limits that fix Shaky content without an openItems exception;
- a race in run.json writes;
- Redo, decisionKey and confirmation gaps in the contracts;
- the one-subject invariant, which is not enforced under the preset;
- no fallback split for 3b;
- a simpler, item-based replacement for the planned-text check `frozenChangesOf`.
- **findings:**
  - [1]
    - **id:** R2-1
    - **severity:** major
    - **lens:** user-intent
    - **where:** §3.6 'Freeze' bullet ('A value equal to B's is stored as { from: 'base' }'); §2.2 OwnValue; §3.4 step 3 ('roots expected from B: heldMap(B, decls)'); §5.3 Undo refusal text
    - **problem:** An own freeze whose AddressValue equals B's is stored as { from: 'base' }, and §3.4 then takes its held map from B, not from the state the person saw.

meaningKey covers only a declaration's own Repr and its unprobed auxiliaries. So when card C's statement uses a vocabulary item V that a step changed, C's AddressValue still equals B's.

If the person freezes C 'at the version you see' (FZ-10):
- the next judge reports `held changed` on V, and Apply is disabled;
- accepting V's item does not clear it, because C's expectation is B's V;
- only Unfreeze, or rejecting V, does.

This is the typical whole-model flow: Claude changes a definition, and the person freezes a card that uses it. §5.3's own refusal text ('freeze it again to freeze its new version'), shown after an Undo of an Unfreeze, leads straight into the same failure.
    - **fix:** §3.6: replace the sentence with 'A value equal to B's whose held map also equals heldMap(B, decls) is stored as { from: 'base' }; otherwise as { from: 'state', commit, value, held }.'

Keep { from: 'base' } for §3.7's 'Keep them frozen at your version' and for FZ-10's 'your version'. Both mean B's text and meaning.

Test in 3b:
- a whole-model step changes V;
- the person freezes C, and no stage problem follows;
- a Reject of V's item then asks, listing 'V, held by C' (§3.7).
  - [2]
    - **id:** R2-2
    - **severity:** major
    - **lens:** soundness
    - **where:** §3.6 phases table (confirming: Freeze yes); §5.3 ('before and after are the whole FreezeDelta', D3-22); slice 2 D2-54 / §3.10 step 3 ('Back to review … with the session stack as it was before Submit'; round-1 C5 'restores the stack')
    - **problem:** Freeze actions are allowed in confirming, and each is a session-stack step whose Undo restores the whole FreezeDelta.

Slice 2's Back to review restores the stack as it was before Submit. Slice 2 can do that safely because nothing happens in confirming. Under slice 3, if 2f restores a pre-Submit stack snapshot, the freeze actions made in confirming leave the stack, but their effects stay. A later Ctrl+Z of an older freeze action, e.g. 'Freeze: X' made in the stage, then restores a FreezeDelta without them. That silently unfreezes Y, which the person froze in confirming (FROZEN 2–3, UN-4), and a later queue may then change Y. If 2f restores a session snapshot instead, those freezes are simply lost.

Any other change to own or standingCleared that is not on the stack has the same effect under the coarse delta.
    - **fix:** §5.3 / D3-22: FreezeDelta records only the keys the action changed: each key's standingCleared flag and its own freezes, before and after. Undo and Redo restore only those keys.

§3.6 or §5.4: add 'Back to review keeps the freeze actions made in confirming, on the stack and in effect. D2-54's "stack as before Submit" holds because Submit-to-confirming pushes nothing.'

Test in 3b and 3d:
- freeze X in a stage;
- Submit;
- freeze Y in confirming;
- Back to review;
- Undo 'Freeze: X': Y must still be frozen.
  - [3]
    - **id:** R2-3
    - **severity:** major
    - **lens:** soundness
    - **where:** §3.7 'Decisions that would change frozen content' (runs only before decisions' writes); §3.10 'Submit with whole-model steps' / D3-42 (widened take-out); slice 2 D2-57; §6.2 paths 19–22
    - **problem:** The whole-state check before a write runs only for decisions. Submit's take-out is a telelean write that reverts items' content to B with no frozen check. It covers D2-57's take-out and, under D3-42, every kept Shaky or to-be-redone item whenever a step of the queue opens the whole model.

Take a natural DO-3 use: 'decline this card Shaky but keep this field'. The person freezes one field of a Shaky item; no Versions dialog applies, since the item is not in review. At Submit, the take-out reverts that field. The step may leave it as found (the two-value rule), so the next stage gets a frozen problem and Apply is disabled.

So telelean changed frozen content without the person's answer, which §6.2's paths section says never happens.
    - **fix:** In planSubmit (D2-57's take-out in 3b for FROZEN; D3-42's widened one in 3c1), leave in ws/ every item whose take-out would change a frozen target or held name. Use the same rule as §3.7: on the take-out's planned files, or by the items' drafts.
- Such an item stays open to its own step (openItems), where the freeze wins (§3.5).
- The feedback turn lists the frozen part under SHAKY as 'kept: the person froze it'.
- The frozen content's held names keep what it rests on fixed, so D2-57's reason for taking it out does not arise.

Add path 23 to §6.2, with tests in 3b and 3d (narrow) and in 3c1 (whole model).
  - [4]
    - **id:** R2-4
    - **severity:** major
    - **lens:** implementability
    - **where:** §2.3 ItemRecord.frozen ('cleared only by the person's own later status change … or a cascade they confirmed'); D3-4; §3.7 decline dialog ('unfreeze removes every standing and own reason'); §2.9 frozenChangesOf (no text for { from: 'item' } entries)
    - **problem:** D3-4 keeps `frozen` on items that reconcile returns to review. D2-23 returns an accepted item together with its accepted dependents, all of them in review and still frozen.

RV-5's confirmation lists only accepted dependents. So when the person rejects the returned definition D, its returned dependents become to be redone (reverted) with no confirmation. They keep `frozen`, and each becomes a lasting `frozen (accepted)` stage problem that disables Apply.

§3.7 cannot help:
- 'Unfreeze them and decline' removes standing and own reasons only;
- frozenChangesOf defines no text expectation for { from: 'item' } entries.

The person has to find and Unfreeze each dependent by hand.
    - **fix:** §2.3 and §3.7: any cascade of the person's action that changes the status of an item with `frozen` lists that item in RV-5's confirmation ('frozen: you accepted it'), whatever its status. Confirming clears its `frozen`.

§2.9 frozenChangesOf:
- an accepted item's own content changes only when the action takes the item, which that list confirms;
- so compare only its stored held names, by HeldValue.text.

'Unfreeze them and decline' also clears `frozen` on listed items whose only reason is their Accept.

Test in 3b: a D2-23 return of an accepted definition with an accepted dependent, then a Reject of the definition. Expect one confirmation and no stage problem.
  - [5]
    - **id:** R2-5
    - **severity:** major
    - **lens:** soundness
    - **where:** §0 'New contract fields stay optional … Absent means no freezes'; §2.3 JudgeInput.freezes, BackstopInput.freezes, ReviewState.freezeAtAccept, StateJudgement.freezeAtAccept
    - **problem:** Absent fields turn FROZEN off silently, Apply's backstop included. That happens at any call site that forgets them, and there are many:
- check, freeze and gate;
- the finish's re-check;
- judge, and judge-apply's re-run;
- recover()'s pure stage judge;
- Undo's violates;
- finalCheck and its reuse path;
- writePremise and complete;
- Apply and its recovery.

Slice 2 removed exactly this pattern (fixer 2a, V2A-S5: 'nothing the runner may forget turns a check off'). A spy test covers only the paths it runs.
    - **fix:** Keep the fields optional in 3a so every package compiles, but close the gaps:
- judgeState always checks ItemRecord.frozen from `items`, whatever `freezes` holds.
- An Accept is refused when the stage judgement has no freezeAtAccept entry for the item ('not checked yet'), as V2A-S5 refuses an Accept without `judged`.
- 3d makes SessionCheckContext.freezes and the runner's Apply and backstop input required, so tsc finds every call site.
- judgeState('final') and applyBackstop refuse ('telelean could not read the session's freezes') when called for a session without `freezes`.

Tests in 3a (the refusals) and 3d.
  - [6]
    - **id:** R2-6
    - **severity:** major
    - **lens:** soundness
    - **where:** §3.10 'Ids'; §5.4 Apply ('F already holds every card's written id … Apply writes no id: line of its own'); D3-37; built core review/items.ts (V2A1-C1 writeBack pushed into the card item's fields); §3.10 'planItemRevert … a field Change → B's lines'
    - **problem:** Apply's design rests on 'F holds every id': Apply writes no id of its own, and kept freezes add only freezes.json lines.

But built 2a1 code attaches a derived `id:` write-back to the card's Formalize or Change item whenever that card has another change. A revert that restores the item's fields to B's (2b2's statement revert; 3c1's 'field Change → B's lines') therefore removes the ids commit's line. That happens on any Reject of such an item, the most common decision.

F then lacks that id, with two effects:
- A kept freeze on the card is keyed by a derived id, which D3-16 forbids. A hand edit of the sentence orphans it, and it fails open in the next session.
- A later whole-model sentence change renames the card mid-session, and is refused as unowned or deleted.
    - **fix:** §3.10 'Ids', and the revert work in 3b: add 'planItemRevert, the inverse merges and Submit's take-out never remove or change an `id:` line. On its own an `id:` line stays no difference (V2A1-C1), so content keys are unchanged.'

3e1's final check: every card that a kept freeze names has a written id in F; otherwise Apply refuses.

Tests:
- 3b: a Reject of a Formalize of a derived-id card keeps its `id:`;
- 3e1: the final-check rule.

Also state in D3-37 and the user guide that Apply writes `id:` lines into every file of the subject that holds a card without one, even files no accepted item touched.
  - [7]
    - **id:** R2-7
    - **severity:** major
    - **lens:** user-intent
    - **where:** §3.8 'Checks' and 'Filling now'; §2.8 tools (no withdrawal of ledger entries); §3.10 'After freeze_statements' (FrozenSnapshot.blocks); D3-6 (protects only targets); D3-19
    - **problem:** FZ-10 promises that a freeze made while Claude works costs Claude only an uncounted check. Two cases make compliance impossible.

(1) The step's own ledger entries:
- delete_card, remove_arrow, mark_proof_broken, and D3-38's propose_arrow into a non-target are re-applied by every normalise;
- Claude has no tool to withdraw one;
- so freezing that card, arrow, Dependencies or proof keeps failing. This is allowed, since D3-6 covers only targets.

(2) Content already fixed by freeze_statements:
- `statement-changed` (and FrozenSnapshot.blocks) forbids reverting a statement or block the step changed;
- so confirming 'Freeze it empty' on a fuzzy statement Claude already filled, or freezing a sentence a whole-model step changed, cannot be met. This happens in narrow FROZEN steps too.

In both cases only the first failure is fresh. The rest count, and the step gives up and rolls back to S₀.
    - **fix:** Add to §3.8 an early end:
- Trigger: a gate or finish whose blocking findings are all frozen or held findings on keys whose madeAt is later than the step's start.
- Condition: the step cannot meet them, because the value in its freeze commit differs and statement-changed fixes it, or one of its own ledger entries contradicts the table.
- Effect: the step ends at once as gave up, uncounted, rolled back to S₀, with the outcome 'You froze ‹x› after Claude's step had already changed it.'

'Filling now' adds: 'If Claude has already fixed its statements, its step ends without a result.'

Tool checks:
- proposeArrowProblems refuses an arrow whose Remove arrow item is accepted (RV-4);
- proofBrokenProblems refuses a card whose .holds is held.

Log the rule as a decision, with a 'withdraw' path for the ledger tools as its alternative.

Tests: 3d (the narrow fuzzy case) and 3e2 (delete_card, then a freeze of that card).
  - [8]
    - **id:** R2-8
    - **severity:** minor
    - **lens:** implementability
    - **where:** §3.10 'Step limits with wholeModel' (fixed list: 'the content of items declined Shaky … in a Submit queue they were taken out first'); D3-42
    - **problem:** The list fixes Shaky items' content relative to S₀ and has no openItems exception, unlike slice 2's preset limits. In a whole-model Submit step, that fixes the taken-out (B) content of the step's own Shaky items, which is exactly what D3-42's Submit step exists to rework. A builder cannot tell which reading is meant.
    - **fix:** Reword the item to: 'the content of items declined Shaky (and, from slice 4, Transform), except this step's own `openItems`'. Add a 3c1 test: a whole-model Submit step re-proposes its own Shaky Change.
  - [9]
    - **id:** R2-9
    - **severity:** minor
    - **lens:** soundness
    - **where:** §3.4 step 3 ('Names an entry covers itself are left out') vs §2.3 ItemRecord.frozen.held ('its own names included (so their meaningKey too)'); §3.3 accepted entries with expect { from: 'item' }
    - **problem:** An accepted item's covered targets are table entries whose decls are the item's own names, so step 3's exclusion drops those names from the held check. That contradicts F4's fix.

Step 1's content key (slice 2 §4.3) has no meaningKey. So a meaning-only change to accepted content is caught only by D2-41's approximation, at step purposes, at final and in the backstop.
    - **fix:** §3.4 step 3: 'Only names an entry compares through its own AddressValue (standing and own entries) are left out. An accepted item's frozen.held names, its own included, are always compared.' Add a 3a test: an instance placed before an accepted statement, with equal text, printed type and constants, is refused as `meaning` or `held changed`.
  - [10]
    - **id:** R2-10
    - **severity:** minor
    - **lens:** implementability
    - **where:** §3.6 'Writes' (during a step: a copy through writeStateChecked 'inside the run's chain …, and only when that write succeeds sets the in-memory session's freezes'); runner run/persist.ts writeState(text)
    - **problem:** RunFiles' chain takes ready-made text. Suppose a step write's run.json text was built from the in-memory session before the freeze's in-memory update, and was enqueued after the freeze write. It lands after the freeze write and puts run.json back without the freeze that was already acknowledged. A crash before the next write loses that freeze, although the person saw it and Claude may already have been told of it.
    - **fix:** State that run.json text is built inside the chain, when the write runs: writeState(() => text). Every write then serialises the in-memory session as it is at that moment. The freeze's chain task writes its copy and, on success, sets the in-memory freezes before the next task runs. Add a 3d test with a step write enqueued while the freeze write is pending.
  - [11]
    - **id:** R2-11
    - **severity:** minor
    - **lens:** implementability
    - **where:** §2.3 (decide SessionAction + freezes; ItemState gains frozen); §2.5 sessionFreeze/decideItems; §3.6 Versions; built core review/records.ts decisionKey
    - **problem:** Three contract gaps against slice 2's contracts and built code.

(1) The decide SessionAction's `request` ({ decisions, own }) does not record §3.7's `freeze` choice. A Redo of 'Unfreeze them and decline' therefore meets the freezes its Undo restored and is refused, so it can never be redone (UN-4).

(2) ItemState gains `frozen`, but slice 2's decisionKey compares ItemState in Undo's conflict check. The premise write's step 4 rewrites frozen.fingerprint and held, so an Undo of an Add premise's Accept would give `conflict`.

(3) One freeze can need several confirmations at once: Versions, Filling now, and RV-5's list. Yet sessionFreeze has only `confirmed`, with no field for the chosen version, and nothing says how a Versions dialog covering several items offers 'your version'.
    - **fix:** (1) The decide SessionAction's request gains `freeze?`, and Redo re-sends it.

(2) decisionKey ignores `frozen`, as it already ignores accepted.fingerprint.

(3) One needs-confirmation carries every list. Resending with `confirmed` means 'Claude's proposal' for every listed target. 'Your version' is offered only when exactly one item is involved, and goes through decideItems with freezeSubjects.
  - [12]
    - **id:** R2-12
    - **severity:** minor
    - **lens:** user-intent
    - **where:** D3-44 (§7.2 item 44); header; §3.1 'Frozen binds Claude only'
    - **problem:** The task's directive allows a narrowing only when no sound simple way exists. FROZEN 1 says frozen status is applied 'when the user manually edits a field', and D1 re-allowed board edits without withdrawing that.

D3-44's own alternative is simple and sound: the edit's plan adds a standing freeze, in the same plan and the same Undo step. D3-44's stated reasons are usability (freezes 'pile up') and a guess at when FROZEN 1 was written, not soundness. This reverses round 1's suggestion, on the directive's terms.
    - **fix:** Adopt the alternative for edits of existing text fields on the board: sentence, Why, stance and source. Leave out new cards (A|P box), arrows, kind changes and moves. The user guide explains how to lift these freezes (Unfreeze, or Unfreeze all other cards). Log 'board edits do not freeze' as the alternative.

If D3-44 is kept instead, reword it to say plainly that it narrows the user's explicit FROZEN 1 for usability, and list it first in the AP entry for the user's review.
  - [13]
    - **id:** R2-13
    - **severity:** minor
    - **lens:** soundness
    - **where:** §3.1 'One subject (D3-41) … in every step, the whole model open included'; enforced only in §3.10's whole-model list
    - **problem:** The invariant claims every step changes only its own subject's files, but only the whole-model limits enforce it.

Under the preset:
- slice 2's limits fix existing declarations only by D2-41's comparison (no meaningKey);
- they allow new declarations in any module, including another subject's, placed before that subject's standing-frozen statements;
- those statements are in no table.

The built gate rules have no file-scope rule either.
    - **fix:** Make the subject rule global: in every step, no new declaration, line or file outside the session's subject's root file and module directory, and existing-changed `other-subject` applies everywhere.

Or reword §3.1 to say that under the preset, other subjects' existing declarations are protected only by D2-41's comparison.
  - [14]
    - **id:** R2-14
    - **severity:** minor
    - **lens:** soundness
    - **where:** §5.3 Undo/Redo of freeze actions (only `violates` is checked); §3.6 'Not freezable' (D3-6, D3-45); UN-4 ('follows the same rules')
    - **problem:** Undo and Redo of freeze actions skip planFreeze's `left` rules. Example: an Undo of an Unfreeze of a target's proof, made while the results were shown, can restore a freeze while the results are hidden or the target's step is queued. D3-6 forbids freezing that by hand.

If `violates` is computed on the unmasked state, its answer also depends on the hidden proof (RV-6).
    - **fix:** §5.3: an Undo or Redo that would give a reason to a target that planFreeze would leave now is refused, with that target's text. `violates` is computed on the state the view shows (masked while the results are hidden). Add a 3b test with a hidden twin pair.
  - [15]
    - **id:** R2-15
    - **severity:** minor
    - **lens:** implementability
    - **where:** §5.4 ('recover() of an ended run whose board-step is not written makes it'); §2.2 SessionFreezes.end; §5.2 recover() upgrade; built runner run/manager.ts recover() (nonTerminal filter) and pruneRunDirs
    - **problem:** F18's replay does not fit the built runner:
- recover() looks only at non-terminal runs;
- prune may delete an ended run's directory before the replay.

Separately, §5.2 gives an upgraded slice-2 session an empty SessionFreezes. Items it accepted before the upgrade then have no `frozen`, so a whole-model step in that session could change them (RV-4).
    - **fix:** State the following:
- recover() also reads the newest ended session run whose freezes.end.written is false, and makes its board step once.
- pruneRunDirs keeps such a run directory.
- recover()'s upgrade sets `frozen` on every accepted record, from the recomputed stage judgement's freezeAtAccept.

Tests in 3e1 and 3d.
  - [16]
    - **id:** R2-16
    - **severity:** minor
    - **lens:** implementability
    - **where:** §1 table and 'fallback splits' bullet (3a, 3d, 3f only); §1.1 3b
    - **problem:** 3b is at least as large as 3a, and core runs one builder at a time, yet §1 gives it no fallback split. It carries:
- planFreeze, acceptCovers, frozenNeeds and both views;
- frozenChangesOf, planIdWrites and unfreezeRequestProblems;
- the reducer's freeze action, Accept's freeze, decisions over frozen content, and Undo and Redo with madeAt and the answer seal;
- reconcile and subjectGraph;
- set-freezes with A6;
- the whole protocol.
    - **fix:** Add a fallback split after the planner:
- 3b1: planFreeze, acceptCovers, frozenNeeds, the views, set-freezes with A6, and the protocol;
- 3b2: the reducer, reconcile, frozenChangesOf, planIdWrites and unfreezeRequestProblems.
  - [17]
    - **id:** R2-17
    - **severity:** minor
    - **lens:** simplicity
    - **where:** §3.7 'Decisions that would change frozen content'; §2.2 AddressValue.text / HeldValue.text; §2.9 frozenChangesOf
    - **problem:** The check builds a ProjectModel over a write's planned texts, using the head's stale facts. It also adds a second, text-only value system (AddressValue.text, HeldValue.text) beside key and approx.

None of that is needed. Ownership is total and disjoint (computeItems), and a decline's write restores B's version of exactly the items in its revert set. The same answer therefore follows from data already computed, and by meaning rather than by text.
    - **fix:** Replace the planned-text comparison with an item-based rule:
- For a decline and its cascade: list every frozen target or held name that the revert set's drafts provide (provides.decls, cards and arrows, and content.fields) whose expected value, compared by AddressValue or HeldValue key, differs from B's. `toBase` then always holds.
- Refuse un-reject, and the Undo or Redo of a decision, when an item they bring back provides one.
- Drop AddressValue.text, HeldValue.text and the planned model.
- Keep D3-36's gates for premise writes.
