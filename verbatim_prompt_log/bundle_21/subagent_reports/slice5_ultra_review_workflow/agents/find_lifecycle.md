# find:lifecycle

Agent `aeb539adef31c746f` of workflow `wf_3842fba8-348`. Verbatim output (JSON alongside).

- **summary:** Lifecycle, persistence and undo review of the slice-5 plan.

What holds up:
- ids.json is monotonic and sits outside both Undo stacks. Undo, Redo and History revert never shrink it.
- Nothing slice 5 writes during a session (ids.json, decisions.json, run.json) moves the session base.
- No slice-5 state crosses from the board stack to the session stack or back.
- F1's `id:` lines travel with their own board step, so Undo stays consistent.

The real problems, 15 in all:

**Blocker (1).** A reference the person types in a transform holds nothing during its own transform step. The pending TransformFreeze carries text only, and slice 4's TransformScope still marks the referenced field open. So Claude can reword the target, and the queue-end held map then freezes Claude's version. This breaks FZ-4 bullet 2 and §14 item 3.

**Majors (3).**
- **Held revalue (`revalued.held`).** It does not exist in slice 4. As written, the person's own typed change to a field a frozen card references is refused at the transform step, while §3.7 shows it as a warning only.
- **Premise card ids.** The registry burns a premise card's id, so the Redo of its Accept (or a re-Accept) writes a new id. Later session-stack Redo steps then miss it: moves, freezes, queued transforms, copied tokens.
- **Allocation order.** Allocation happens at plan time, before the "record before write". It never sees ids the files still name (dangling `premises:` entries and tokens), so a hand deletion followed by an A|P add with the same sentence re-attaches the old arrow or token to the new card.

**Minors (11).**
- `heldFields`' memo key (literally per B, which goes stale after freeze actions).
- The `{ from: 'base' }` test for own freezes, and its effect on Exit keep ticks.
- In-memory registry freshness, and the registry shrinking on a git checkout.
- Sessions open at install, or whose ids.json was rolled back.
- A premise Accept's Why holds nothing until its write.
- Who owns a detach follow-on, and the freezes it creates.
- Tokens in one queued transform pointing at a card another queued transform trashes.
- The resolver for Claude's text lagging between steps and after a reload.
- Unreadable registries of other subjects.
- F1 being undone together with its first write (an unlisted residual).
- Exit's board step: one id writer or two.
- **findings:**
  - [1]
    - **id:** LC-1
    - **severity:** blocker
    - **where:** §3.6 (Holders; The person's own changes), §2.5 heldFields ('not revalued'), §2.6 (S4: TransformFreeze, transformScopeOf), §1.1 5d
    - **problem:** During a transform step, a sentence or Why the person typed has only a pending TransformFreeze (text only, slice 4 §3.11). heldFields skips it as revalued, and it has no stored held map until the queue end, so the references it adds hold nothing in the very step that writes them. Slice 4's TransformScope.open (open and fuzzy fields minus frozen keys) still lists a referenced field that the same window leaves open: copied Sentence and Why start open (TR-4). Claude is told it may change that field, and the step limits allow it. At the queue end the TransformFreeze takes its held map from the judged state, so it then holds Claude's rewording. Claude has changed the field a frozen card's sentence references: FZ-4 bullet 2 and §14 item 3 fail mechanically. The same open-but-held mismatch also hits fields held by standing, own or session-start holders, there fail-closed: Claude is told 'open', and every attempt is refused.
    - **scenario:** 1. In a stage, the person opens Transform cards… on A and T.
2. They type A's Why '#[card:t] is too strong', so A's Why becomes 'frozen: you typed it'.
3. They leave T's sentence open (its default) and write an instruction.
4. Submit review: the transform step's typed write commits A's Why, then Claude rewords T's sentence.
5. The gate passes, because T's sentence is open and A's pending TransformFreeze holds nothing.
6. The queue-end judge sets A's held map with Claude's wording. The frozen A now refers to a sentence the person never wrote.
7. If the person later Rejects Claude's change of T, A's hold raises a held problem against the person's own decline.
    - **fix:** Add to §3.6 and 5d, and to §2.6 as a requirement on slice 4:
(1) The typed write gives each TransformFreeze of a sentence or Why, alongside its pending text, held = holdingMap(the typed commit's model, subject, { decls: [], fields: [its target] }). The step's held check uses that map.
(2) transformScopeOf removes from `open` every field key held at the step's S₀: heldFields, own maps, accepted maps and the maps from (1). The transform turn lists those keys under HELD.
(3) The window shows such a field as 'held by “‹A›” (it refers to this)', not as open.
5d test: Claude's rewording of T in that step is a `held` finding, and A's queue-end value holds T's S₀ sentence.
  - [2]
    - **id:** LC-2
    - **severity:** major
    - **where:** §2.5 ('slice 4's revalued.held'), §3.6 'The person's own changes', §3.7 (warning only), §1.1 5d, §2.6
    - **problem:** Slice 4's plan has no `revalued.held`. It revalues only frozen keys that carry a TransformFreeze, and it says 'Slice 4 revalues no held value (D4-21)'. There, a frozen card that relies on what a transform changes is a blocking TR-13 dependent (unfreeze it, or delete it too). Slice 5 relies on a held revalue that does not exist, and at the same time lists a frozen referrer as 'a warning only' (§3.7).

As written, the person's own typed change to a field that a frozen card references fails at the transform step:
- the holder's expectation (B's value via heldFields, or a stored map) is not met;
- S₀, which is before the typed write, excuses nothing;
- the field's own TransformFreeze entry has no finding, so the `held` (changed) finding is not dropped.

A detach follow-on that rewrites a referrer which another frozen card references fails the same way. This refuses the person's own change (against FZ-1 and FZ-3 2e), and 5d's builder has nothing to map `revalued.held` to (§0's (S4) rule).
    - **scenario:** 1. R is standing-frozen; its Why reads '#[card:t] is too strong'.
2. In a session, the person transforms T's sentence (typed, no Claude).
3. The window shows §3.7's warning row only, and the person submits.
4. The no-Claude transform step is judged once: `held` on T's sentence (R holds it at B's value).
5. Result: 'Your transform “…” could not be carried out', and every Retry fails the same way.
    - **fix:** Define the revalue in slice 5 instead of citing slice 4. In effectiveFreezes/frozenFindings (5d): a held key (Lean name or field key) that a live TransformFreeze covers expects that TransformFreeze's value for every holder except accepted items. Accepted holders leave accepted through slice 4's Submit cascade, which already reads frozen.held by key.

Derive this at every judge and store nothing, so it disappears with the TransformFreeze on rollback, Retry, Unfreeze and the session's end.

Text changes:
- Replace 'revalued.held' in §2.5, §3.6 and 5d with this rule.
- Add to §2.6 that slice 4's TR-13 lists a frozen referrer whose referenced field changes as a warning, not as a blocking dependent.

Tests: the scenario passes; Claude's later change of T's sentence is refused; a rolled-back transform step leaves no revalue.
  - [3]
    - **id:** LC-3
    - **severity:** major
    - **where:** §3.2 Monotonic ('a replayed write allocates again and burns its first id'), §5 'Session stack: unchanged', §1.1 5b (premise adoption through the registry)
    - **problem:** The registry burns a premise card's id when the premise is taken out. Every later write of the same item then puts the card under a new id: the Redo of its Accept, or a fresh Accept after back to review or un-reject. Slices 2–3 re-derived the same id there, because planGhostAdoption avoids only ids in ws/ and record ids.

The session stack then stops restoring what it recorded against the first id:
- a `move` Redo on the Proposed view (positions are keyed by card id);
- the Redo of a freeze action whose subjects name the card;
- a queued transform whose draft holds `card:<old id>` (stale at Submit);
- tokens the person copied with Copy reference.

UN-4's Undo×n then Redo×n no longer returns to the same state, although no Claude step intervened.
    - **scenario:** 1. Accept premise P; it is written as card `foo`.
2. Move `foo` on the Proposed view, then queue a transform that includes it (`card:foo`).
3. Ctrl+Z three times: the queue, the move, then the Accept, which takes P out.
4. Ctrl+Shift+Z three times. The Accept's premise write allocates `foo-2`, because the registry holds `foo`.
5. The move's Redo sets a position for a card that no longer exists, and the queued transform names `card:foo` and is stale at Submit.
    - **fix:** In §3.2, §5 and 5b, give a premise item its card id once:
- Keep the id of its first write on the record (e.g. ItemRecord.cardId, set at that write's step 4, never cleared by a take-out).
- Reuse it in every later premise write of that item when no card in ws/ holds it. This is the same card coming back, as Undo of a take-out already does from `takenOut.card`.
- Allocate only for an item that was never written, and keep every other item's cardId out of allocations (via LC-5's `extra`).

Tests: Accept → move → Undo×2 → Redo×2 restores `foo` and its position; back to review then Accept keeps `foo`.
  - [4]
    - **id:** LC-4
    - **severity:** major
    - **where:** §2.2 takenIds; §3.2 Recorded ('nothing telelean made can name it'); §1.1 5b (the record inside applyRecorded)
    - **problem:** Allocation happens when the plan is made, from PlanContext.ids read before the write. The registry records the model's namedIds only inside applyRecorded, after planning. takenIds takes the project's current card ids, the registries and record ids, but not the ids that the current files still name without a card: `premises:` entries and card tokens left dangling by a hand deletion.

Any such id the registry never saw is given to the new card in the very write that would have recorded it, and the dangling arrow or token silently attaches to the new card. The registry misses an id when the card existed only before the subject's first post-install write, or was made by hand since telelean's last write. This contradicts I1, and §3.2's claim fails because telelean itself wrote the `premises:` entry.

Tokens in decisions.json answers are in no model file and are never recorded. A later card can take such an id, and a later session's Earlier answers would then render that new card's sentence.
    - **scenario:** 1. Subject S has X (`id: x`, written before slice 5) and C with `premises: [x]`.
2. After the install, no board write to S has happened, so ids.json lacks `x`.
3. The person deletes X's block in the editor; C's arrow now dangles.
4. They add 'X' with the A|P box. takenIds lacks `x`, so the new card gets `x`, and C's arrow now comes from the new card.
5. applyRecorded records `x` only afterwards.
    - **fix:** In §2.2, takenIds also takes:
- every id that namedIds(m, s) returns for every subject s of m (id lines, build ids, `premises:` entries, card tokens);
- the card ids named by tokens in the subject's decisions.json (or record those ids when an answer is written).

Then no allocation ever gives an id that telelean-written text still names. Correct §3.2's sentence. Test: the scenario gives `x-2`.
  - [5]
    - **id:** LC-5
    - **severity:** minor
    - **where:** §5 'Reload: nothing new'; §1.1 5b (a session's start records B; in-session allocations); D5-17, D5-18
    - **problem:** Only a session's start records B's namedIds. A session already open when slice 5 is installed never did this, and its earlier allocations were never recorded either (premise cards, add_card, typed new cards). A session whose ids.json is rolled back (a git checkout, D-12) or deleted (TL203's own advice) while it runs loses them as well. Its later allocations can then give a different card the id of a B card the session deleted, or of a premise card a decision took out (I1).
    - **scenario:** 1. A slice-4 session is open at the install.
2. Premise P1 'Foo' was written as `foo` and then taken out by a Reject.
3. After the reload, the person accepts premise P2 'Foo'. It is written as `foo`: the id is not in ws/ and not in ids.json.
4. A token the person copied while P1 existed now names P2.
    - **fix:** In 5b, every in-session allocation passes, as takenIds' `extra`:
- namedIds(B), from the base commit's model;
- every card id the session's run.json names: records' card/cardId, ledger premise, card and typed ids, and the stack's takenOut cards.

This is pure and needs no write at load, so AP-12 holds. It also covers a registry rolled back during the session. Test it with a slice-4 run.json fixture.
  - [6]
    - **id:** LC-6
    - **severity:** minor
    - **where:** §2.5 heldFields doc comment ('memoised per B')
    - **problem:** heldFields depends on `entries`. Those change with every freeze action, Undo, Redo, Unfreeze and startCleared change; only B is fixed. Read literally, 'memoised per B' caches the first call's result for the whole session. A sentence frozen later then holds nothing (S12 open), and an unfrozen holder keeps holding.
    - **scenario:** 1. The stage's first judge calls heldFields(B, S, entries) while no sentence is frozen. The result is empty and is cached on B.
2. The person freezes A's sentence '#[card:t] is too strong' (or Undoes an Unfreeze of it).
3. A whole-model step rewords T.
4. The cached result has no hold on T, so there is no `held` finding.
    - **fix:** In §2.5: memoise holdingMap(B, subject, { decls: [], fields: [t] }) per (B, target key), and recompute heldFields from `entries` on every call. 5d test on one B object: freeze → held; Unfreeze → not held; Undo → held again.
  - [7]
    - **id:** LC-7
    - **severity:** minor
    - **where:** §3.6 Holders, §2.5 holdingMap; slice 3 §3.6's `{ from: 'base' }` rule (R2-1) and §5.4's Exit keep rows (5d runner part)
    - **problem:** Slice 3 stores an own freeze as `{ from: 'base' }` when its value equals B's and its held map equals heldMap(B, decls). For a sentence or Why, decls is empty. Once 5d computes the state's map with holdingMap (field keys), that map never equals heldMap(B, []) = {}. So a frozen sentence that holds a reference is always stored as `{ from: 'state' }`, even when everything equals B.

FZ-8 and EN-2: Exit offers keep only for `{ from: 'base' }`, so such a freeze can never be kept at Exit.

If a builder keeps slice 3's map instead, the opposite error appears: a freeze made while the referenced field differs from B's is stored as base. heldFields then expects B's value and raises a false `held` problem, against FZ-10's 'the version you see'.
    - **scenario:** 1. In a stage where nothing changed, the person freezes A's sentence '#[card:t] is too strong'.
2. They Exit.
3. No 'keep frozen' row is offered for A's sentence.
    - **fix:** State in 5d: the `{ from: 'base' }` test compares the state's holdingMap(J, subject, { decls, fields: [target] }) with holdingMap(B, subject, { decls, fields: [target] }). Test both directions: equal → stored as base, and keep is offered at Exit; referenced field changed → stored as state.
  - [8]
    - **id:** LC-8
    - **severity:** minor
    - **where:** §2.2 Runner (5b) idsOf/recordIds; §1.1 5b ('reads every subject's ids.json at load and on its sidecar event')
    - **problem:** The plan does not say that recordIds updates what idsOf returns. Slice 3 needed an explicit re-read after telelean's own writes for freezes.json (its L10), because the watcher can lag, coalesce events or be excluded by files.watcherExclude. With a stale idsOf, an allocation made right after another can reuse the id just recorded. Separately, a re-read that finds a smaller or missing file (a git checkout, a deletion) makes the open window forget ids it recorded itself.
    - **scenario:** 1. The person copies the reference of premise card P1 (`foo`).
2. They set P1 back to review, which takes it out.
3. Before the watcher's event, they accept premise P2 'Foo'. idsOf lacks `foo`, so P2 is written as `foo`.
4. The copied token, pasted into a transform Why, now names P2.
    - **fix:** In §2.2:
- recordIds adds the ids to ModelWorkspace's in-memory registry before it resolves.
- While the window is open, the in-memory registry only grows: a re-read is unioned with it, and a file found smaller is rewritten with the union at the next record.

Test: two allocations with the same sentence and no watcher event between them give `foo` and `foo-2`.
  - [9]
    - **id:** LC-9
    - **severity:** minor
    - **where:** §3.6 Holders (accepted items through freezeAtAccept); §1.1 5e (the premise Accept's Why); slice 2 §3.8 (due writes)
    - **problem:** An Add premise's Accept copies heldAtJudge. That map was computed before the person typed the Why, since the card is not in ws/ yet. So the references in accepted.rationale hold nothing until the premise write's step 4 recomputes the map.

When that write fails (an environment or probe failure), the item stays accepted and its write stays due until a reload. Meanwhile a mid-stage Formalize with the whole model open can change the referenced field unheld, and step 4 later freezes Claude's version.
    - **scenario:** 1. Accept premise P with the Why '#[card:t] is why'.
2. Its write fails: '… telelean could not write it … Reload the window'.
3. The person runs Formalize with the whole model open, and Claude rewords T's sentence.
4. After the reload, the due write runs, and P's frozen.held now holds the reworded T.
    - **fix:** In §3.6, preferred: a mid-stage Formalize, Retry step and Submit review wait, with the stage problem's text, while an accepted Add premise is not written (its write due). Alternative: the Accept adds to frozen.held the holds of accepted.rationale's tokens, computed on the stage judgement's model, provided that fits D3-51. Test the failure path.
  - [10]
    - **id:** LC-10
    - **severity:** minor
    - **where:** §3.7 (A transform: detachRefs as a typed follow-on unit); §2.6 (S4: the typed write's follow-on edits, typedKeys)
    - **problem:** The plan does not say which typed item owns a referrer's detach unit. Slice 4 makes a trashed card's arrow removals part of that card's typed item. If the detach is owned by the referrer's own typed item instead:
- Rejecting the trash brings T back while R stays detached, so its reference is lost;
- Rejecting R's item restores a dangling token.

In addition, through slice 4's typedKeys every detached referrer's sentence or Why gets a TransformFreeze. It becomes 'frozen: you typed it' for the rest of the session and gets a keep tick at Apply, although the person typed nothing there.
    - **scenario:** 1. The person trashes T in a transform.
2. Unfrozen R's sentence '#[card:t] matters' is detached to '‹T's sentence› matters'.
3. R's sentence is now frozen for the session, so Claude may not reword it, and Apply offers to keep that freeze.
4. The person Rejects T's typed item: T returns, but R keeps the plain words.
    - **fix:** In §3.7:
- The detach units are owned by the trashed target's typed item, so one Reject restores T and every token it detached, as for its arrows.
- A detach unit gives a TransformFreeze only to a field that is frozen for another reason (to revalue it).
- EN-2 lists detaches under telelean's follow-on edits, not under 'what you typed'.

Test the Reject.
  - [11]
    - **id:** LC-11
    - **severity:** minor
    - **where:** §2.4 refProblems' `trashed`; §3.7; slice 4 §3.8 step 2 (each queued transform analysed again)
    - **problem:** refProblems' `trashed` covers only the transform's own trash. At Submit review, each queued transform is analysed alone, on the state before any of them runs. A transform queued later can therefore type a token to a card that an earlier queued transform trashes. The earlier step's detach runs before that token exists, so the session ends with a dangling reference written by the person's own transform. That goes against TR-13's 'inside a session nothing is ever left broken'.
    - **scenario:** 1. Transform 1 (queued) trashes T.
2. Transform 2, queued after it, types C's Why '#[card:t] explains it'.
3. At Submit, both analyses pass.
4. Step 1 trashes T and detaches nothing in C.
5. Step 2 writes C's Why with the token, which shows 'deleted card' from then on.
    - **fix:** In §2.4/§3.7: at Submit review, a queued transform is stale (§3.8's text) when its typed text holds a token to a card that any queued transform trashes. The text reads 'refers to “‹c›”, which the queued transform “‹label›” deletes'. The window's refProblems also refuses a token to a card that another queued transform holds in its trash. Test.
  - [12]
    - **id:** LC-12
    - **severity:** minor
    - **where:** §2.7 Claude's text (the resolver); §3.4; §1.1 5e
    - **problem:** 'The step's last check' exists only in memory. At the first turn of the second and later steps of a queue, the resolver falls back to the stage judgement's model, which is the state from before the queue (D2-63). After a reload, the Resume turn does the same. References then render the target's sentence as it was before earlier steps changed it, so Claude reads stale names (RF-2 d).
    - **scenario:** 1. A Submit queue runs two steps, and step 1 rewords T.
2. Step 2's first turn quotes C's Why '#[card:t] …' with T's old sentence.
3. The Resume turn after a reload in the middle of step 1 does the same.
    - **fix:** In §2.7, the resolver is:
1. the running step's newest check;
2. else its S₀ model, which the step already computes for its StepScope;
3. else the stage judgement's.

After a reload, use a markup-only model of ws/'s current files: no facts are needed, since card sentences come from the blocks and short names from the syntactic declarations. Test: the step-2 turn and the Resume turn render the current sentence.
  - [13]
    - **id:** LC-13
    - **severity:** minor
    - **where:** §2.2 takenIds ('every other readable registry'); D5-17; TL203 (§2.7)
    - **problem:** Allocation in subject S2 skips S1's registry while that file is unreadable (for example, git merge markers in the committed ids.json). S1's board stack can still bring back a card whose id the allocation has meanwhile given to an S2 card. The project then has two blocks with one id (TL006), and references and freeze records attach to whichever block wins.
    - **scenario:** 1. In S1: add 'Foo' (`foo`), then Undo.
2. S1's ids.json becomes unreadable.
3. In S2: add 'Foo'. It gets `foo`, because S1's registry is skipped and no `foo` is in the model.
4. In S1: Redo, which brings back a second `foo`.
    - **fix:** In §2.2/D5-17: takenIds refuses (TL203, naming that subject) while any registry of the model folder is unreadable, not only the subject's own. TL203's text says that no card can be added anywhere in the folder until it is fixed. Test.
  - [14]
    - **id:** LC-14
    - **severity:** minor
    - **where:** §3.2 F1 and 'No migration'; D5-4; D5-18
    - **problem:** F1's `id:` lines belong to the step that writes them. Undo or a History revert of a subject's first post-install write takes them all out again, and before that first write none exist at all. Until the next write, a hand deletion of A lets an id-less sibling with the same sentence derive A's id. That is exactly the case F1 exists for, so references and freeze records to A pass to the sibling. D5-18 lists only hand-written blocks and hand-written ids, not this case. Also, the first write's Undo spans every file of the subject, so a hand edit in any of them makes that Undo conflict.
    - **scenario:** 1. A (`id: cynder-dark`) and an id-less B with the same sentence.
2. The person edits a stance; F1 writes B's `id: cynder-dark-2`. Then they press Undo.
3. Later, A's block is deleted in the editor.
4. B now derives `cynder-dark`, and C's '#[card:cynder-dark]' shows B.
    - **fix:** Add this residual to D5-18 and to the guide: 'until telelean's first change to a subject, and after undoing it, deleting a card by hand can pass its id to an id-less card with the same sentence'. Alternatively, write a subject's missing ids as a board step of their own, labelled 'Write card ids', so that undoing the person's edit does not take them out.
  - [15]
    - **id:** LC-15
    - **severity:** minor
    - **where:** §1.1 5a ('planIdWrites … becomes a call of writeSubjectIds, so there is one writer'); slice 3 §5.4 (the board step after Exit or an empty Apply), D3-16
    - **problem:** planIdWrites(m, subject, cards?) writes only `cards` in two places: set-freezes (the frozen cards), and the board step after Exit or an empty Apply with keep ticks ('the id: of each kept derived-id card'). writeSubjectIds has no `cards` parameter, and the plan does not say whether those paths now write every derived id of the subject. If they do, Exit with one keep tick writes `id:` lines into every file of the subject, while its confirmation says 'your files are not changed'. If they do not, there are two writers, and F1's 'every plan that changes a model file' has an unstated exception.
    - **scenario:** Exit, with one keep tick, from a session on a subject whose 8 files hold id-less blocks. Under 'one writer', the board step writes `id:` lines into all 8 files.
    - **fix:** Say which. Either planIdWrites keeps its `cards` filter and §3.2 names the Exit/empty-Apply board step as an exception to F1, or it writes every id and EN-2's Exit text and the guide say so. Test the Exit board step's files.
