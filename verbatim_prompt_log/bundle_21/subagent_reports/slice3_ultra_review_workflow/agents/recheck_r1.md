# recheck:r1

Agent `a942fc787357fcab0` of workflow `wf_84d1f5cb-1a7`. Verbatim output (JSON alongside).

- **summary:** I re-checked the 65 findings of ultra-review round 1 against the current plan and its sources: the user's own words (prompt20 FROZEN 1–5 and REVIEW 3, 5, 7, 8; prompt21 ¶5; the mid-turn answers D1 and D3, and message 3), spec §5, the slice-2 plan, and the built code. The code I read was runner semantic/checkFile.ts and refresh.ts, and core gate/g0.ts, rules.ts (G5) and adoption.ts, review/items.ts and review/types.ts.

**Fixes that hold.**
- **S3-1.** The isolated probe is sound in principle. Its `#eval` is elaborated without the model, and G0 bans `initialize` and `builtin_initialize`, so `importModules` runs no model code. The builder's first real-Lean check is the right gate.
- **S3-2 to S3-5.** S3-4 now states its residual.
- **L2–L12.**
- **IMP-1 to IMP-5.** IMP-2's skip condition fits slice 2's step 4 and `premiseDraftKey`. The completion's `.holds` belongs to T's Result, not to P's key.
- **IMP-7 to IMP-19.**
- **FID-4 and FID-6 to FID-12.**
- **U2–U19.**
- **Rejected parts.** S3-1's instance rule, IMP-3's context signature, and L2's reducer-in-the-chain and answer-path parts were rightly rejected.

**Re-raised.**
- **checks-S3-6, now major.** The fix makes only the names of walked auxiliaries canonical. Binder names inside the printed Exprs keep their macro scopes:
  - every non-dependent arrow's binder (this is why `intro` on `p → q` gives `a✝`);
  - `inst✝`;
  - the `x✝` of pattern-matching definitions;
  - binders from deriving handlers.

  After 3p, any command inserted above such a declaration in its module changes its meaningKey. As a result:
  - narrow Formalize steps and proof lemmas inserted mid-file fail `existing-changed`;
  - frozen, held and accepted statements that contain implications get `meaning` or `held` findings that cannot be fixed;
  - Add-premise writes (adoption inserts right before the target's block) fail.

  The Spyro fixture hides this, because no declaration below its insertion points carries a binder.
- **Minor re-raises:**
  - **FID-1.** A foreign freeze cannot be unfrozen anywhere during a session on the subject that owns the declaration. This narrows FROZEN 4 and FZ-6 without logging it, and Claude's unfreeze requests for it can never be granted.
  - **L1.** The upgrade's build judge and reconcile are not specified for a session that is mid-step or in confirming, and an interrupted step has no `startedAt`.
  - **FID-5.** The "Cancel step … Retry step" hint is shown for content that a narrow retry still cannot change.
  - **U1.** A proposed "−" arrow maps to its Remove arrow item, whose Accept covers nothing, so Freeze does nothing there.
  - **IMP-6.** Whole-model arrows into another target of the session are left undefined.

**No new blocker found.**
- **findings:**
  - [1]
    - **id:** checks-S3-6
    - **severity:** major
    - **where:** §2.1 meaningKey doc and D3-2 ("Before hashing, each such auxiliary is renamed by its place in the walk, macro scopes erased"); §3.5 (`existing-changed` compares meaningKey for every declaration of S₀, in every step); §3.4 and §3.7 (frozen `meaning`, `held`, and S3-5's premise-write rule); §6.1 3p tests; core gate/adoption.ts, which inserts a premise right before the target's block
    - **problem:** The fix makes only the names of walked auxiliaries canonical. Binder names inside every Expr the probe prints keep their macro scopes, and the derived `Repr Expr` prints them:
- Lean names the binder of every non-dependent arrow `a` plus the current macro scope (`elabArrow` uses `MonadQuotation.addMacroScope `a`; this is why `intro` on `p → q` yields `a✝`);
- anonymous instance binders are `inst✝`;
- the matched argument of a pattern-matching definition, `fun _ =>` binders and deriving-handler binders are hygienic too.

Each command, and each macro expansion, takes a fresh scope from the module-wide counter. So inserting any command above such a declaration changes its meaningKey, although nothing about its meaning changed. This hits arrow-typed vocabulary (`axiom InGame : Character → Game → Prop`), every rule statement with an implication, and lemmas such as `∀ c, A c → B c`.

After 3p:
- (a) `existing-changed` (meaningKey in every step, R2-13) refuses a narrow Formalize step whose new statement, pinned right below its card's block mid-file, or whose proof lemma lands above such a declaration;
- (b) frozen statements and held definitions with such binders get `meaning` or `held (changed)` findings that Claude cannot repair;
- (c) a premise write changes the key of the target's statement and of every later declaration, because adoption inserts the card right before the target's block. With the target's Formalize accepted (frozen.held holds its own names, R2-9), the write fails under S3-5's rule, since the write itself introduced the finding;
- (d) `other-subject` misfires when another subject reaches an unprobed auxiliary of this subject that shifts.

The Spyro fixture hides all this: no declaration below its fuzzy card or its target has a binder. So the slice-2 and slice-3 suites pass. 3p's "unrelated declaration added earlier in the module" test catches it only if the insertion lands above Vocabulary's arrow-typed axioms. Slice 2's printed comparison (`a✝`, without the number) never had this problem; meaningKey introduces it.
    - **scenario:** Setup: Vocabulary.lean declares `axiom InGame : Character → Game → Prop`. Main.lean holds, top to bottom: fuzzy card A (no statement), rule card R (`abbrev r : Prop := ∀ g c, IsPG g → InGame c g → ¬ HasDarkPast c`, `axiom r.holds : r`), then target T.
1. The person draws A → T and runs Formalize (narrow).
2. Claude writes `abbrev a : Prop := …` right below A's block, above R.
3. R's text, printed type and constant sets are unchanged. Its two arrow binders are now `a._@.Model.S.Main._hyg.(N+k)`, so R's meaningKey differs from S₀'s.
4. Every check fails `existing-changed` and counts. Claude is told R's meaning changed, cannot restore it, and the step gives up.

If R is standing-frozen, the same edit is also `frozen` (`meaning`). Later, accepting a "Claude suggests" premise for a target whose accepted statement has an implication fails at its write with "writing it would change frozen ‹T›".
    - **fix:** §2.1 and D3-2, built in 3p: before taking the Repr, the probe rewrites every Expr it prints (the declaration's type, a definition's value, constructor types, and each walked auxiliary) so that:
- every binder name (`lam`, `forallE`, `letE`) is `Name.anonymous`, or at least has `Name.eraseMacroScopes` applied. Binder names never carry meaning (de Bruijn indices do), and the text comparisons still catch renames;
- every `mdata` node is stripped.

Keep S3-6's renaming of auxiliaries, and add to D3-2: "binder names are not part of meaning".

Tests:
- 3p, with real Lean: Vocabulary holds an arrow-typed axiom, a pattern-matching definition, and a definition with an anonymous instance binder; Main holds a statement with an implication. All sit below an insertion point. Inserting an unrelated command above them, in each module, leaves every key unchanged.
- 3d (2f premise suite): a premise written before a target whose accepted statement contains an implication passes its write's judgement.
  - [2]
    - **id:** intent-FID-1
    - **severity:** minor
    - **where:** §2.2 SessionFreezes.foreign ("never unfrozen in this session … Those boards are read-only while the session runs"); §3.6 'Not freezable'; §3.9 request_unfreeze; §4.3 reasons; D3-41
    - **problem:** The fix enforces S1's freeze of S2's vocabulary in S2's sessions, but it makes the freeze impossible to lift for the whole session:
- the session refuses to unfreeze it ("Frozen on ‹S1›'s board: unfreeze it there.");
- S1's board is locked (RunElsewhere) while any session runs.

This narrows FROZEN 4 ("At ALL times … unfreeze … at any time") and FZ-6, and D3-41 does not log it as a narrowing. The refusal text points to an action the person cannot take. `unfreezeRequestProblems` accepts a request for such an item although no answer can grant it.
    - **scenario:** 1. On S1's board, the person freezes S2's `InGame` gloss.
2. The person starts a whole-model session on S2, and Claude calls request_unfreeze for the gloss.
3. Select them, then Unfreeze: disabled, "Frozen on S1's board: unfreeze it there." Switching to S1's board shows only the RunElsewhere lock.
4. Continue reports nothing unfrozen. In the stage it is the same.
5. The only way out is to end the session, unfreeze on S1, and start again.
    - **fix:** Choose one.

(a) Allow it:
- a session Unfreeze of a foreign key goes into a new `SessionFreezes.foreignCleared`, and the table drops it;
- FZ-8 restores it at the end;
- the end confirmation and Exit offer a row "keep unfrozen (on ‹S1›'s board)", whose tick removes the record from S1's freezes.json in Apply's change set or in Exit's board step.

(b) Log in D3-41 that this narrows FROZEN 4 and FZ-6 while the session lasts, and:
- change the text to "Frozen on ‹S1›'s board, which can't change during this session: unfreeze it there after the session ends.";
- make `unfreezeRequestProblems` refuse an item held only by foreign records, with a text for Claude: "‹x› was frozen on another subject's board and cannot be unfrozen in this session: say in gap what you need."

Either way, add tests in 3b and 3d.
  - [3]
    - **id:** lifecycle-L1
    - **severity:** minor
    - **where:** §5.2 'The upgrade' ("first runs `checkBase` and a judge with a build, as slice 2's own v1 conversion does"); §2.3 PersistedStep.startedAt; §3.8 'Times that survive a reload'; §2.1 the ‹why› for a value stored without a key
    - **problem:** (1) The upgrade copies slice 2's v1 conversion, which only converts runs that are in review (slice 2 §3.11). A slice-2 session reopened in another phase is not covered:
- **Interrupted mid-step:** a judge-apply on the mid-step head reconciles records against half a step's work, while slice 2 changes records only at a queue's end and at decisions (D2-62, D2-63). The interrupted step also has no `startedAt`, which `unmeetable`, the rollback and `fresh` now require.
- **Confirming:** neither the confirmation nor its check id, which now hashes the end table, is recomputed after the upgrade's judge.
- **Applying:** nothing says whether the upgrade waits for slice 2's Apply recovery.

(2) The stored-value text "unfreeze it and freeze it again" is also used when the value was stored without a key because its `meaningMissing` is `unwritable` or `too-large`. Freezing again cannot help there.
    - **scenario:** 1. Under slice 2's build, a session's Formalize step is running; slice 3's dist is installed, and the window reloads.
2. recover() upgrades the session: it is `judging`, a build judge runs on the interrupted step's head, and judge-apply's reconcile creates records for the step's partial statement items, or returns accepted ones to review, before Resume.
3. On Resume, the step's checks call `unmeetable` with no `startedAt`.
    - **fix:** §5.2, by phase:
- **stage:** as now;
- **interrupted step:** run only `checkBase`; set the step's `startedAt` from its step-start record (an upgraded session has no `madeAt` entries, so any earlier time works); leave the records alone and let the queue-end judge, which builds anyway, set `frozen` and `heldAtJudge`. No Accept is possible during a step anyway;
- **confirming:** after the upgrade's judge, run the final check again, which gives a new check id;
- **applying:** finish slice 2's Apply recovery first, then upgrade.

§2.1: for a stored value, ‹why› names the stored cause when it is permanent ("its name cannot be passed to Lean: rename it", "its elaborated form is over 2 MB").

3d test: an interrupted slice-2 step is upgraded, then resumed; its records are unchanged until the queue ends.
  - [4]
    - **id:** intent-FID-5
    - **severity:** minor
    - **where:** §3.9 ("every item must be frozen or held now … a target that only the step's limits fix is refused"); §3.9 and §4.6, the accepted row's hint ("Cancel step, return it to review, then Retry step"); D3-42 (Retry and Submit steps take their inference's options); §2.8 request refusal texts
    - **problem:** The validator refuses only items that the step's limits alone fix. A request for accepted content that a narrow step's limits also fix therefore passes, and the card tells the person to cancel, un-accept and retry.

A retried step takes its inference's options (D3-42), so it is narrow again. `existing-changed` still fixes the content, so the person cancels work and un-accepts for nothing. Claude's second request is then refused as "fixed by this step's question". This misleading hint is new with FID-5's fix.
    - **scenario:** 1. Stage 1: the person accepts vocabulary item V (a definition).
2. Stage 2: a narrow mid-stage Formalize for T runs, and Claude asks to unfreeze V.
3. The card reads "accepted: … Cancel step, return it to review, then Retry step."
4. The person cancels the step, returns V to review, and presses Retry step.
5. The retried step is narrow, and changing V fails `existing-changed`.
    - **fix:** §3.9: `unfreezeRequestProblems` refuses every item that the step's limits fix, whether frozen or not, with §2.8's "‹x› is fixed by this step's question … the person can open the whole model" text. The accepted row's hint then appears only for content that the step may change once it is unfrozen, for example a re-asked target's accepted proof.

Add a test in 3b.
  - [5]
    - **id:** ui-U1
    - **severity:** minor
    - **where:** §4.3 'What they act on' ("on Claude's proposed \"+\"/\"−\" arrow, which selects nothing, its review item"); §3.6 Expansion and Versions ("Delete, Remove arrow: yours only ('Freeze and reject the deletion')"); §3.7 Accept ("Delete, Remove arrow: nothing")
    - **problem:** For a "−" arrow, the item is a Remove arrow item, and `acceptCovers` of that is empty. So Freeze and Unfreeze in that menu have nothing to act on, and planFreeze disables them.

The person's natural intent there, keeping the arrow, is exactly what §3.6 already defines for the arrow target: "yours only (Freeze and reject the deletion)".
    - **scenario:** 1. In a whole-model stage, Claude's Remove arrow item shows X → T as "−".
2. The person right-clicks it and chooses Freeze: the entry is disabled.
3. They must Reject the item, then find the restored arrow and freeze it separately.
    - **fix:** §4.3: the menu target of a proposed "−" arrow is the arrow `{ kind: 'arrow', source, target }`, so Freeze offers "Freeze and reject the deletion" through `decideItems.freezeSubjects`. A "+" arrow keeps its item.

Add a test in 3f.
  - [6]
    - **id:** build-IMP-6
    - **severity:** minor
    - **where:** §2.8 propose_arrow ("accepts, with the whole model open, an arrow into any unfrozen proposition of the session's subject … (an Add arrow item, not part of a Result)"); §3.10 'Whole-model arrows' (computeItems: "part of a Result only when it goes into an inference's target"); D3-38; §6.1 3c1 tests
    - **problem:** "Any unfrozen proposition" includes the session's other targets, whose Dependencies Accept never freezes. For an arrow from T's step into another target T', computeItems makes it part of T''s Result, although T''s step never proposed it. That contradicts §2.8's "not part of a Result":
- the arrow is hidden and masked as a part of T''s Result;
- E(T') grows;
- an accepted Result of T' gains a dependency, and RV-11 returns it to review.

No rule designs this cross-inference case, and no test covers it.
    - **scenario:** 1. A whole-model session has targets T and T'; T''s Result is accepted in stage 1.
2. A re-ask of T runs with the whole model open, and T's step proposes X → T' before freeze_statements.
3. computeItems gives the arrow item partOf T' (hidden), with its origin T.
4. At the next judge, T''s accepted Result returns to review as "frozen (you accepted it)", with an arrow its proof never used.
    - **fix:** In D3-38, §2.8 and §3.10: whole-model arrows go only into propositions that are not targets of this session, so B.3 keeps `not-target` for an arrow into another target, and propose_arrow refuses it with a text.

Alternatively, define the case fully (whose Result it belongs to, its origin, its reveal, RV-11) and test it in 3c1.
