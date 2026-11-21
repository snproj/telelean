# find:lifecycle

Agent `a5cefa260b6fe41f3` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** Lens: lifecycle, persistence and Undo. I traced every piece of state the plan adds through session start, steps, Cancel, Retry, rollback, reload mid-step, a crash during Apply or the end, Exit, History restore, and Undo/Redo on both stacks: SessionFreezes, ItemRecord.frozen/heldAtJudge, freeze SessionActions, freezes.json, the `end` record, the `ids` commit, webview ticks and options. I checked the plan against slice 2's contracts and the built code (review/types.ts, workspace/undo.ts, modelWorkspace.ts, editApplier.ts, boardSession.ts).

No blocker found. 3 major, 8 minor and 1 nit.

**Base and stacks.** Nothing moves B itself:
- the ids live in ws/;
- base-facts.json is only re-derived from the fixed base commit.

The routing between the two stacks is consistent: board stack outside a session, session stack on the Proposed view and in session windows, the Current view disabled.

**Earlier fixes, re-checked.**
- Hold: R2-2 (per-key deltas; Back to review keeps the stack), R2-10, R2-14, F14's rows, F17.
- Do not fully hold:
  - F11(7) was narrowed. The in-memory update during a step now copies only `freezes`, so stack entries and seals are lost (L2). This also breaks R2-2's premise that every freeze change is on the stack.
  - R2-15's upgrade path stores held maps without meaningKey and sets no heldAtJudge. Upgraded sessions can then never Apply (L1).
  - F18's Apply recovery has no record of freezes.json's text before Apply, and no rule for when the model files and freezes.json disagree. A partial write can drop standing freezes (L3).
  - The end board step's replay merges stale ticks, and nothing orders the board step before a new start (L4).
  - F3/R2-7's `madeAt` logic needs a step start time, and `since`, that no one persists (L5).

**Smaller gaps:**
- the end confirmation: no Undo of freeze actions there, and the final check is not refreshed after a freeze change;
- the freeze action's records miss slice 2's `rev` and `endedForce`;
- stale keep ticks come back pre-ticked;
- refresh of the freezes cache before the start's snapshot;
- an `ids` commit lost in a crash at the start;
- Exit's dialog text.
- **findings:**
  - [1]
    - **id:** L1
    - **severity:** major
    - **where:** §5.2 recover()'s upgrade (R2-15); §2.1 'Missing meaningKey fails closed' and 'Base facts'; §2.3 ItemRecord.heldAtJudge ('set by reconcile, never by the runner'); §3.6 'Freeze' (J = base with base facts in the first queue)
    - **problem:** Some held maps and values are computed once and stored for good: an accepted item's `frozen.held`, `heldAtJudge`, and an own freeze's `value`/`held`. They take whatever facts the judgement had at that moment, so a missing meaningKey is stored permanently.

For a slice-2 session upgraded by `recover()` (the user's open session when slice 3's dist lands):
- The stage judgement is recomputed purely from slice 2's judged-facts.json, which has no meaningKey and gets no Lean job.
- Every accepted record therefore gets an inexact `frozen.held`.
- The final check then refuses forever with "telelean could not compare what ‹name› means in Lean: reload the window to check the base again". A reload only re-runs checkBase for base-facts.json. It never revalues stored maps.
- The upgrade also sets no `heldAtJudge` (by contract only reconcile may). An upgraded accepted item that the person puts back to review cannot be accepted again: "‹item› has not been checked yet: wait for the check to finish". Yet no check is due, because a back to review is records-only and makes no commit, so no judge runs.

Own freezes made on facts without meaningKey are stuck the same way. Examples: J = base facts in an upgraded session's first queue, or a module whose facts are missing.
    - **scenario:** 1. Under the slice-2 build: a session with items A and B accepted; the slice-3 dist is installed; reload.
2. recover() upgrades the session: A.frozen.held and B.frozen.held come from slice 2's judged-facts.json, all with exact:false.
3. The person submits; in confirming, the final check refuses 'could not compare what A's statement means … reload the window'.
4. Reload: same refusal.
5. The person puts A back to review and presses Accept: refused 'not checked yet', with no judge pending.
6. Only a decision that makes a commit (a Reject) triggers a judge with a build. Even after that, A's stored map from the upgrade stays inexact until it is re-accepted.

The session can never Apply without an obscure sequence of actions.
    - **fix:** §5.2, replace the upgrade sentence with:

"When base-facts.json or judged-facts.json lacks meaningKey, recover()'s upgrade first runs checkBase (base facts) and the judge with a build, as slice 2's v1 conversion does. The session is `judging` until both end. The upgrade then sets `frozen` on each accepted record from that judgement's freezeAtAccept, and reconcile sets `heldAtJudge` on every record from the same judgement (the upgrade's judge-apply covers accepted records too)."

§2.1: an own freeze or an Accept whose stored value or held map would have an inexact entry is refused at the action with "telelean is still checking what ‹x› means in Lean: try again after the check." Alternatively, keep storing it and make the final check's text for a stored inexact entry read "‹x› was frozen before telelean could compare its meaning: unfreeze it and freeze it again" (for an item: "put ‹item› back to review and accept it again"). Keep "reload the window" only for inexact base facts.

3d test: a slice-2 session with accepted items is upgraded, Submit, and the final check passes.
  - [2]
    - **id:** L2
    - **severity:** major
    - **where:** §3.6 'Writes' (during a step: '…and only when that write succeeds sets the in-memory session's `freezes` to it…'; 'The step's own later writes carry the new `freezes`'); §2.4 'During a step'; §5.3 'Seals' (answer); D3-22, D3-23; round-1 F11(7)
    - **problem:** During a step, a freeze action, its Undo or its Redo also changes the session stack: an entry is pushed onto (or moved between) `done` and `undone`, `undone` is cleared, and `nextAction` goes up by one. Answering a question or an unfreeze request pushes the `answer` seal.

The plan's during-step path copies only `freezes` into the in-memory session. Every later step write serialises the in-memory session, so the stack entry and the seal vanish from run.json at Claude's next tool call. As a result:
- `SessionView.undo` never names the freeze action (D3-23 fails);
- action ids can repeat;
- D3-22's guarantee that "every freeze change is on the stack" no longer holds, so a later per-key Undo meets keys it did not leave and is refused as `conflict`.

Round 1's F11(7) fix asked to swap the whole session object; the plan narrowed it to `freezes`.
    - **scenario:** 1. Claude's step runs; the person freezes X as action 7.
2. The checked run.json copy holds stack [queue seal, 7] and nextAction 8. In memory only `freezes` changes.
3. Claude's next tool call writes run.json from memory: stack [queue seal], nextAction 7.
4. The Undo button stays disabled during the step.
5. In the stage, the next decision gets id 7. OwnFreeze.action=7 now names that decision.
6. Undo of an older action that touched X is refused as `conflict`.

The same happens to the `answer` seal: after Continue, Undo can cross Claude's step (UN-5).
    - **fix:** §3.6 Writes, replace the sentence with: "…and only when that write succeeds replaces the in-memory session's `freezes`, `stack` and `nextAction` (every field the reducer's outcome changed) with the written copy's, before the chain's next task runs."

Add: "Undo and Redo of a freeze action during a step, and answering a question or an unfreeze request (its `answer` seal and its record in `freezes.requests`), go through the same checked chain task."

Also add: "The reducer runs inside that chain task, on the in-memory session as it is then. If the step has ended and a judge is due by then, the task refuses with 'Re-checking the working copy: freeze again in a moment.'"

3d test: freeze during a step, then a step write; Undo during the step succeeds, and after a reload the action and the seal are on the stack.
  - [3]
    - **id:** L3
    - **severity:** major
    - **where:** §5.4 Apply ('Apply's recovery … also compares freezes.json: with the planned text, applied; with the text before Apply, not; anything else, a notice'); §2.2 SessionFreezes.end (no pre-Apply text); slice 2 §3.10 step 7; extension editApplier.ts (WorkspaceEdit applied in steps, files saved one by one)
    - **problem:** F18's fix is incomplete in two ways.

(1) `end` records only the planned text, so recovery has no 'text before Apply' to compare with.

(2) There is no joint rule when the model files and freezes.json disagree. VS Code applies a WorkspaceEdit in steps: files created by the edit hit the disk at once, and edited files are saved one by one. A crash in that window can leave freezes.json written while the model files are still B, or the reverse.

Slice 2's rule then returns the session to confirming, because the model files equal B. But freezes.json already holds the kept changes: a ticked 'stays unfrozen' has already removed a standing record.

If the person then exits without ticks, nothing writes freezes.json again. The standing freeze is gone for good, against FZ-8 ('returns to its standing state as recorded at the session's start'). The next session does not hold it, and Claude may change that content.

The reverse partial write finishes as applied and silently drops the ticks.
    - **scenario:** 1. The person ticks 'stays unfrozen' on standing key K and presses Apply.
2. The change set's freezes.json edit is saved first, then the window crashes before the model files are saved.
3. Reload: the model files equal B, so the session goes back to confirming. freezes.json lacks K.
4. The person presses Exit with no ticks: nothing is written.
5. K's standing freeze is lost. In the next session Claude may change K's content, and Apply writes it.
    - **fix:** §2.2: add `before: string | null` to `SessionFreezes.end`: freezes.json's text when planApply read it, recorded with the planned text before Apply writes.

§5.4, replace the recovery sentence with: "Recovery decides applied or not applied by the model files, exactly as slice 2 does, then makes freezes.json follow:
- applied, and freezes.json equals `end.before`: telelean writes `end.freezes`;
- not applied, and freezes.json equals `end.freezes`: telelean writes `end.before` back;
- anything else: a notice naming the kept changes."

Also: "freezes.json is the last change of Apply's change set."

3e1 tests:
- a crash with only freezes.json written: back to confirming, with freezes.json restored;
- a crash with only the model files written: applied, with the kept freezes written.
  - [4]
    - **id:** L4
    - **severity:** minor
    - **where:** §5.4 'An empty Apply (D2-39) with ticks, and Exit with ticks' (the board step runs after 'the run.json write that ends the run'; recover() replays it 'merging the recorded changes with freezes.json as it is'); §2.2 `end.written`
    - **problem:** (1) Ordering. The run ends, which unlocks the board and lets a new start pass busyRefusal, before the board step runs. Nothing orders the board step before the person's next board action or a new session's start:
- a new session can snapshot freezes.json without the kept freezes;
- the step's `id:` writes then land in the person's files during that session, which is ES-7 drift: Apply is disabled and board Undo is locked;
- a board freeze made in between is overwritten if the step writes the planned text recorded at the run's end.

It also breaks the replay's 'at most one, before a new session can start'.

(2) Replay. The replay trigger is only `written: false`. If the step ran but `written: true` was never persisted (the window closed at once, or that run.json write failed), a later recover() merges the old `keep` into freezes.json as it is then, after the person changed it. That re-adds a freeze the person removed, or removes one they made again.

(3) A failure of the board step on the normal path is unspecified.
    - **scenario:** 1. Exit with 'stays unfrozen' ticked on K. The board step removes K, but the `written: true` write fails (it is only logged).
2. Later the person freezes K again on the board.
3. Days later a reload runs recover(), which sees `written: false` and removes K again, silently.

Or: right after the Exit, the person starts Formalize. The new session's base and snapshot are taken before the board step's `id:` and freezes.json writes land, so the new session shows 'Your files changed since the session started'.
    - **fix:** §5.4, replace with: "The board step runs before `end()` resolves and before the run's terminal state unlocks the board (the ES-9 lock and `startRun` wait for `written: true`). It merges `keep` with freezes.json as it is when it runs, and records the text it found as `end.before` in the run.json write that sets `written: true`. recover() replays it only when freezes.json still equals `end.before`. When the file equals the step's result, the step counts as done. Anything else gives a notice naming the kept changes ('freeze or unfreeze them again'), and the step is marked written. A board step that fails on the normal path gives the same notice."

3e1 tests:
- a failed `written` write followed by a board change: the replay changes nothing;
- a start right after Exit waits for the board step.
  - [5]
    - **id:** L5
    - **severity:** minor
    - **where:** §3.8 'Rollback' ('some `madeAt` later than the step's start'); §2.9 `unmeetable(… stepStartedAt …)`; §2.3 `JudgeInput.freezes.since`; §5.5 Reload; slice 2 PersistedStep (no start time)
    - **problem:** Three rules compare `madeAt` with step-local times that nothing persists:
- the rollback-to-S₀ rule;
- D3-50's early end (`unmeetable`);
- the `fresh` rule.

They need the step's start time and `since` (when Claude's last tool result was sent). Slice 2's PersistedStep has no start time, and the plan adds none. After a reload mid-step and Resume, these rules have no reference point. A fallback to the resume time, or an undefined `since`, gives wrong answers.
    - **scenario:** 1. A step starts at 10:00. Claude fills a fuzzy statement and calls freeze_statements.
2. At 10:05 the person freezes it empty (madeAt 10:05).
3. The window reloads at 10:06, and the person presses Resume.
4. The runner takes 10:06 as the step's start, so `unmeetable` misses the freeze. Claude's checks fail and count, the step gives up, and it rolls back to lastCommitSince (no madeAt after 'start'). That keeps Claude's fill, which becomes a stage problem, instead of D3-50's early end to S₀.

If `since` is undefined after the resume, every check that fails on a key with a madeAt may count as fresh forever, and Claude can loop until the cap.
    - **fix:** §2.3 or §5.5: "PersistedStep gains `startedAt` (ISO, written in the `step-start` record). The rollback rule and `unmeetable` read it."

Also: "`since` is persisted with the step's run.json writes. On Resume it is set to the time the resume turn is sent, since its FROZEN section tells Claude everything frozen then."

3d test: freeze during a step, reload, Resume. The step still ends early (or rolls back to S₀), and a later check failing on that freeze is counted.
  - [6]
    - **id:** L6
    - **severity:** minor
    - **where:** §3.6 phases table (confirming: freeze 'yes, at F'); §5.4 ('Keep ticks never change the final check's id'); slice 2 §3.10 (checkId = hash of F's files key and the statuses; Apply needs a pass for the same id)
    - **problem:** The final check's frozen part reads the end table. But checkId ignores freezes, so a freeze action in confirming neither re-runs the check nor invalidates it.

When the check failed on a frozen or held finding, its text tells the person to unfreeze. If they unfreeze in the end confirmation (allowed), the failure stays listed and Apply stays disabled until they go Back to review and submit again.

This is not a safety issue, because Apply's backstop re-reads the table. But the confirmation shows a stale state after the person's own action.
    - **scenario:** 1. In confirming, the final check fails with '“c” is frozen, but the working copy differs…'.
2. The person selects c and presses Unfreeze (allowed in confirming).
3. The row moves to the keep list, but the check still reads failed and Apply stays disabled.
    - **fix:** §3.6, confirming row: "After each freeze action, Undo or Redo in confirming, the runner re-runs the pure frozen part of the final check (frozenFindings on F with the new end table, and the inexact rule) and updates `confirmation`."

§5.4: "checkId also hashes the end table's keys and expectations, so Apply's 'the check passed for the same id' covers the freezes."
  - [7]
    - **id:** L7
    - **severity:** minor
    - **where:** §4.9 (slice 2 §5.13's Undo column unchanged: confirming 'after Back'); §3.6 phases table (confirming: Freeze yes); §5.3 'Back to review'; spec UN-1, UN-4, A5
    - **problem:** Freezing and unfreezing are allowed in the end confirmation, which is a session window, so UN-1 puts it on the session stack. But Undo there is still 'after Back' (slice 2). Ctrl+Z after an accidental 'Unfreeze all other cards' in the confirmation does nothing until the person leaves it, contrary to A5 and UN-4. This narrowing is not logged.
    - **scenario:** 1. In confirming, the person presses 'Unfreeze all other cards' by mistake. It removes 40 standing freezes from the table and adds 40 rows.
2. Ctrl+Z is disabled.
3. They must press Back to review, Undo, and Submit again, which re-runs the final check.
    - **fix:** §4.9: "In confirming, sessionUndo and sessionRedo act on the top action when it is a freeze action with no item changes (restoring no status, D3-35). They are refused while F's facts are rebuilt, and an Undo there also refreshes the check (L6)."

If that is not wanted, log it as D3-52 with this alternative.
  - [8]
    - **id:** L8
    - **severity:** minor
    - **where:** §2.3 freeze SessionAction (`changes: Array<{ item: string; before: ItemState; after: ItemState }>`; no `endedForce`); built core review/types.ts decide action (`changes` with `rev`, `endedForce?`); §6.1 3b ('Undo restores records and freezes exactly')
    - **problem:** An Unfreeze with un-accepts in a stage is a back to review with RV-5's cascade. Slice 2 records two things for such changes that the freeze action's record lacks:
- each change's `rev`, so an Undo gives `conflict` when the item got a newer proposal (D2-73);
- `endedForce`, because returning a statement item to review ends Show results' force, and Undo must put it back.

So Undo of such a freeze action can restore 'accepted' (with its `frozen`) on content the person never saw. It also leaves the results hidden although they were shown before the action.
    - **scenario:** 1. The results are forced shown while a statement item S is in review.
2. The person unfreezes card c with 'also un-accept'. Accepted statement item I returns to review, which ends the force.
3. Ctrl+Z: I is accepted again, but the force is not restored, so the results stay hidden.

Or: between the action and its Undo, a judge gives I rev+1. The Undo restores 'accepted' on rev+1 without the `conflict` that a decide action's Undo would give.
    - **fix:** §2.3: "The freeze SessionAction's `changes` take decide's shape `{ item, rev, before, after }`, and the action gains `endedForce?: SessionForce`. Undo checks `rev` (conflict) and restores the force, exactly as for decide."

3b test: Undo of an un-accepting Unfreeze restores the force, and refuses after a rev change.
  - [9]
    - **id:** L9
    - **severity:** minor
    - **where:** §4.7 ('Ticks default off (D3-33), are kept in the webview state per runId (ES-6)…'); §5.4 rows
    - **problem:** Keep ticks are stored per FreezeKey in webview state and never pruned. A row can disappear: Back to review, then Undo or a fresh freeze. When it appears again in a later confirmation it is already ticked, against D3-33's default-off. A stale 'stays unfrozen' tick then removes a standing freeze at Apply without a fresh tick.
    - **scenario:** 1. K is standing. The person unfreezes K, submits, and ticks 'stays unfrozen' on K's row.
2. Back to review; they freeze K again, so the row is gone.
3. Later they unfreeze K again and submit. K's row returns pre-ticked.
4. Apply removes K from freezes.json.
    - **fix:** §4.7: "Whenever `session` arrives, the webview drops ticks whose key has no row in `freezes.changes`. Back to review clears all ticks of the run."

3g test: a row that disappears and comes back is unticked.
  - [10]
    - **id:** L10
    - **severity:** minor
    - **where:** §1.1 3d ('modelWorkspace.ts reads freezes.json (on load, on its sidecar event, after an Apply and its Undo) … and exposes `freezes(subject)`'); §5.2 ('written with the session's first run.json write (the snapshot)')
    - **problem:** The listed refresh points leave out ModelWorkspace's own writes: perform (set-freezes and edit-node), Undo, Redo, and the end board step. The plan also does not say where the session's snapshot is read from.

The host's start waits only for the board queue (slice 1e: `await this.queue`). If `freezes(subject)` is refreshed only when the file watcher's event arrives later, a session started right after a board freeze snapshots the old file. The new standing freeze is then in no table during the session. Claude may change that content, and Apply keeps the record on disk while writing the change.
    - **scenario:** 1. The person freezes card A's sentence on the board, then at once selects arrows and presses Formalize (consent already given).
2. The start runs after the board queue drains, but before the watcher event updates the cache.
3. The snapshot lacks A.sentence, so a whole-model step may reword A.
4. The person accepts the change without noticing; Apply writes it under a standing freeze.
    - **fix:** §1.1 3d: "ModelWorkspace refreshes `freezes(subject)` inside `reread`, after every write it makes (perform, Undo, Redo, applyChanges, the end board step), not only on the watcher's event."

§5.2: "The snapshot is read from disk in `start`, after the board queue has drained, in the same step as the base commit."

3d test: freeze, then an immediate start; the snapshot holds the freeze.
  - [11]
    - **id:** L11
    - **severity:** minor
    - **where:** §1.1 3e1 ('after the `base` commit and before the first `step-start`, telelean writes the `id:` …; a session started before 3e1 gets it in its next `queue-start` write'); §3.10 'Ids'; slice 2 §2.6 recovery (ws/ back to `head`)
    - **problem:** The `ids` commit is made between `base` and the first `step-start`, but it is not a recorded write: there is no `inFlight` and no `head` update. A crash before the first step-start record makes recover() revert ws/ to `head`, which is the base, and the ids are gone.

The re-write is conditioned on the session's age ('started before 3e1'), so nothing writes them again. F then lacks ids, with two effects:
- Apply refuses kept freezes on derived-id cards;
- a whole-model sentence change of such a card changes its identity mid-session, the very thing D3-37 and R2-6 meant to prevent.
    - **scenario:** 1. A new session starts and the `ids` commit is made.
2. The window crashes before the first step's `step-start` run.json write.
3. recover() reverts ws/ to head (base); Resume starts the step with no ids.
4. Later a whole-model step rewords a derived-id card. Its id changes, and the gate refuses the step as unowned or as a CF-3 change.
    - **fix:** §3.10 'Ids': "The ids write is a recorded session write: inFlight, the files, the `ids` commit, then `head` and `PersistedSession.idsCommit` in one run.json write. Any `queue-start` write (and recover() before a Resume) makes it when `idsCommit` is absent, whatever the session's age."

3e1 test: a crash between the ids commit and the step-start record; after Resume, F holds every id.
  - [12]
    - **id:** L12
    - **severity:** nit
    - **where:** §4.7 'The Exit dialog (D2-36) lists the same rows with the Exit ticks only'; slice 2 §5.9 Exit text ('Your files are not changed … Exit cannot be undone'); §5.4 Exit with ticks (board step writing freezes.json and `id:` lines)
    - **problem:** With keep ticks, Exit is followed by a board step that writes freezes.json, and `id:` lines into the person's model files for kept derived-id cards. That step can be undone (D3-32).

The Exit dialog still says 'Your files are not changed … Exit cannot be undone', which then misstates what Exit does.
    - **scenario:** 1. The person ticks keep on a frozen field of a card whose id is derived, and presses Exit.
2. The dialog says the files are unchanged, but the card's file gains an `id:` line and a History snapshot is made.
    - **fix:** §4.7: "With ticks, Exit's dialog adds 'Keeping ‹n› freezes writes freezes.json and the id of ‹k› cards into your files, as one step you can undo.'"
