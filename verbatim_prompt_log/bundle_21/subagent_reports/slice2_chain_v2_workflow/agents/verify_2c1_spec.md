# verify:2c1:spec

Agent `a3d49709cf1377c6a` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I checked 2c1 against its §1.1 entry, the §2.4, §2.6, §2.9, §4.7 and §4.11 contracts, the §6.1 tests, the §8 log, RV-6/CM-6/EN-3 and AP-24 onward. I read the diffs only (the builder's orig/ copies, plus review/types.ts from after_slice_2b2.patch); I ran no build or test.

**What is right:**
- **Scope is covered:** baseMask/maskFacts follow §2.9's field rules. The build's mask option has absent/codeOverride (B's range)/drop/dropArrows/dropNodes. Endorsements: the input, endorsementsPath and endorsementHash. All 10 webview→host messages exist, with validators matching every §2.4 rule. Also there: the new LIMITS, the `session` light check, and SESSION_MESSAGE_TYPES inside RUN_MESSAGE_TYPES.
- **Carry-overs:** AP30-1 r3 was already done in g0.ts (unchanged, confirmed). R2-1 is fixed exactly as briefed, with tests; §4.11 and §8 are reworded.
- **Contracts and texts:** contract changes are additive and logged (BaseMask.restoreMarks, ProjectMask, maskedModel/projectMaskOf). The 2c2 not-yet default is pulled forward and logged. The §6.1 2c1 tests all exist.

**What is wrong:** the masked build, which is the RV-6 'meaning before proof' mechanism, has three leaks in states a passing step can reach or the plan explicitly anticipates:
- **(blocker)** A pinned card whose block is directly followed by a hidden lemma is unbound under the mask. The target's `.holds` then shows up in the vocabulary listing with Claude's whole proof as its code.
- **(major)** The target's `.holds` kind is read from the working copy's keyword whenever its masked facts can't be used.
- **(major)** Other cards' composed code keeps a hidden lemma's comments and extra blank lines. Two tests use the wrong oracle (LeanOps' removal instead of the not-proved twin), so they pass.

There are also three minor channels or gaps.
- **findings:**
  - [1]
    - **id:** V2C1-S1
    - **severity:** blocker
    - **where:** /home/zhengyew/telelean/packages/core/src/project/build.ts:282-286 (maskFiles), with /home/zhengyew/telelean/packages/core/src/markup/parser.ts:416 and /home/zhengyew/telelean/packages/core/src/project/build.ts:499, 557-573; /home/zhengyew/telelean/packages/core/src/project/vocabulary.ts:319-321
    - **problem:** In `maskFiles`, any block whose `binding.adjacentDecl` points at a left-out declaration gets `binding = { mode: 'none' }`, whatever its mode. Pinned blocks also carry `adjacentDecl` (parser.ts:416 spreads `...position` into the pinned binding). So a hidden lemma written directly below a pinned card's block (no blank line, before the card's docstring and abbrev) unbinds that card in the masked build: the build skips it at build.ts:499, so it shows as informal with no Lean.

No slice-2 rule refuses this layout:
- the card stays pinned to the same statement, so sessionRules' `binding` check (`bound()` unchanged) does not fire;
- computeItems' `lean.binding` check ('pinned' both) does not fire;
- G5 does not fire either (the block's lines are unchanged).

If the card is the target, its statement abbrev and its `.holds` are no longer owned. They become vocabulary candidates. The `.holds` gets B's facts (kind axiom), so it is classified `unmarked-axiom` with the `unmarked-assumption` flag, and its `VocabItem.code` is the working copy's text: Claude's full hidden proof.

This breaks RV-6 and §4.7 ('so no hidden proof text reaches a graph'). It also makes the hidden board misleading: the target looks unformalized, and a false hidden assumption appears. The not-proved twin shows the card bound and pending.
    - **fix:** In `maskFiles`, make a binding code-less only when `binding.mode === 'adjacent'` and its adjacent declaration is left out. For `pinned` and `none` blocks, keep `mode`, `statement` and `pinned`, and only re-index `adjacentDecl` (or delete it when it is left out), as is already done for `gapDecl`.

Add a test: a hidden proof-phase lemma written directly below the target's pinned block, and below a source's pinned block, gives `strip(graph)` equal to the not-proved twin's. No vocabulary item may exist for the target's statement or `.holds`, and the graph JSON must not contain the proof text. Add the mutation (pinned → none) to the mutation table.
    - **evidence:** build.ts:282-286: `if (binding.adjacentDecl !== undefined) { const now = index.get(binding.adjacentDecl); if (now === undefined) binding = { mode: 'none' }; ... }`. There is no mode check.

parser.ts:416: `return { mode: 'pinned', statement: names[0], pinned: names, ...position };`, so pinned bindings carry `adjacentDecl` = the next declaration with no blank line.

build.ts:466-483: a draft starts as `formal: 'informal'`, `lean: { binding: block.binding.mode }`.

build.ts:566: unowned declarations become vocabulary candidates. vocabulary.ts:240: an axiom of sort Prop becomes `unmarked-axiom`; vocabulary.ts:319-321: `code = c.file.text.slice(c.decl.span...)`, the working copy's text.

sessionRules.ts:542-556: the binding check compares only the bound statement. Its own message even tells Claude to put new declarations 'not directly below its block', but only when the statement changes.

The mask tests cover only the adjacent-mode case (mask.test.ts:612) and re-indexing (626). No pinned block is followed by a hidden declaration.
  - [2]
    - **id:** V2C1-S2
    - **severity:** major
    - **where:** /home/zhengyew/telelean/packages/core/src/project/build.ts:171-181 (holdsKind) and 524-530; /home/zhengyew/telelean/packages/core/src/review/mask.ts:206-211, 321; /home/zhengyew/telelean/packages/core/test/review/mask.test.ts:492-520
    - **problem:** Under the mask, a target's overridden `.holds` keeps the working copy's syntactic declaration (only its code is replaced by `codeOverride`). `holdsKind` reads `draft.holdsFacts?.kind` and, when there are no usable facts, falls back to `draft.holdsDecl?.decl.keyword`, which is the working copy's keyword.

So whenever B's masked facts for the `.holds` are not usable, the masked board shows the hidden outcome. The proved twin shows `justificationKind: 'theorem'`, `not-checked`, proof `none`; the not-proved twin shows `'axiom'`, `pending`. That is RV-6 broken, and AXIOMS-header 'pending' counts change too. Cases where the facts are not usable:
- the working copy has no facts at all. `maskedModel` deliberately builds this case, and §2.1/2b3b judge a stage that G0 refuses 'without facts';
- B's facts lack the `.holds` (mask.ts:207-211 emits nothing then);
- the file holding it is unchecked in the judged facts (its module failed, dependency-failed or not built);
- that file is stale: FactsIndex then requires `kindsAgree(W keyword 'theorem', B kind 'axiom')`, which fails.

Two tests claim otherwise without checking it:
- 'maskedModel builds such a state without facts, masked' (mask.test.ts:492) checks only the code and `dark_cynder`;
- 'B without facts: … (not checked, as in B)' (mask.test.ts:505) checks only the facts.
    - **fix:** Give the build B's kind of each overridden `.holds`. For example, add B's keyword to `ProjectMask.codeOverride[name]` (from B's DeclEntry). In `maskFiles`, replace the overridden declaration's `DeclInfo.keyword` with it, so that both `holdsKind`'s fallback and FactsIndex's `kindsAgree` read B's kind.

Add tests: maskedModel of PROVED1/PROVED2 gives the target `justificationKind: 'axiom'` and `proof: { kind: 'pending' }`, the same as the not-proved twin (STATEMENTS) built the same way, in each of three states:
- without facts;
- with B without facts;
- with the target's module `failed` in the working copy's facts.
    - **evidence:** build.ts:173-180: `const kind = draft.holdsFacts?.kind; … const keyword = draft.holdsDecl?.decl.keyword; if (keyword === 'axiom') return 'axiom'; if (keyword === 'theorem' || keyword === 'lemma') return 'theorem';`

build.ts:524: `const holdsDecl = syntactic.get(draft.holds)` reads the masked files, which keep W's overridden declaration.

mask.ts:321: `const facts = i.current.facts !== undefined ? maskFacts(i) : undefined;`.

factsIndex.ts: unchecked files use no facts; a stale file's by-name match requires `kindsAgree`, and unmatched facts of stale files are not usable.

build.ts:790-802: with `hk === 'theorem'` and no facts, the card is flagged 'not-checked' and the proof stays `none`; `lean.justificationKind = hk` (673).
  - [3]
    - **id:** V2C1-S3
    - **severity:** major
    - **where:** /home/zhengyew/telelean/packages/core/src/project/build.ts:320-335 (withoutHidden), 372-390 (maskedCode, other cards); /home/zhengyew/telelean/packages/core/test/review/mask.test.ts:371-391
    - **problem:** Builder decision 3 composes another card's code, when hidden declarations sit between its statement and `.holds`, by removing only the hidden declarations' spans with `deletionEdit` (each span's lines plus at most one blank line). Two kinds of session text survive into a visible card's `lean.code`:
- a `--` or `/- -/` comment Claude wrote with the lemma (directly above it, or below it). By AP-26/computeItems such a comment belongs to the lemma's item, the hidden Result. `blankComments` treats it as blank, so the gap still counts as 'quiet' and is joined into one stretch;
- extra blank lines. In the builder's own 'spaced' layout the masked code is `stmt\n\nholds` while B and the not-proved twin have `stmt\nholds` (line 390 admits only the tight case equals B).

Enclosing `namespace`/`end` lines around only hidden lemmas make the gap not quiet, so the code falls back to two pieces where B had one.

In every case the hidden view differs from the not-proved twin. In the comment case, hidden proof-material text reaches the graph, against §4.7's 'so no hidden proof text reaches a graph' and RV-6.

The test's oracle is 'as LeanOps' removal leaves the text', not the twin without the lemma. So it passes on exactly the layouts that leak.
    - **fix:** Compose such a card's code to read as B's:
- when the card's statement and `.holds` are B's and B joined them (`codeJoint` on B), give the build B's joint text through the mask (as `codeOverride.joined` does for targets, e.g. a per-card join), and place the `.holds` refs by its line count;
- otherwise, also leave out the comment lines, blank lines and enclosing lines that go with a left-out declaration (computeItems' `compareTexts` attachment rule, as `planItemRevert` step 3 does).

Change the test's oracle to the not-proved twin (`graphOf(modelOf(STATEMENTS))`). Add cases with a `-- …` comment above the lemma, one below it, and `namespace … end` around it.
    - **evidence:** withoutHidden (build.ts:320-335) deletes only `spans` from `Masking.hidden`, which are declaration spans and dropped block spans. markup/edits.ts:155-177 `deletionEdit` takes the span's lines plus one blank line at most; the scanner's declaration span holds docstring and attributes, not plain comments.

build.ts:377: `quiet = … && blankComments(gap.text).trim() === ''`, where `--` comments are blanked (project/text.ts:66-79).

mask.test.ts:379-387 compares against `applyLeanOps(remove-decl)`. Line 390: 'Written tight, that is B's code exactly' (tight only).
  - [4]
    - **id:** V2C1-S4
    - **severity:** minor
    - **where:** /home/zhengyew/telelean/packages/core/src/review/mask.ts:227-230; /home/zhengyew/telelean/packages/core/src/project/build.ts:130-141 (compareDiagnostics); docs/slice2-plan.md §4.7 and §2.9 (maskFacts bullet)
    - **problem:** B's messages for a target's overridden `.holds` are placed at the start of the working copy's `.holds` declaration. The step limits let a step move the target's `.holds` under openProof, e.g. a proof placed below a source declared later. Board diagnostics are sorted by range, and buildSessionView only strips `range`, keeping the order.

So when B's `.holds` carries a message and the step moved the `.holds` past another diagnostic, the order of the diagnostics array differs from the not-proved twin's. That tells the person the `.holds` was rewritten and moved, i.e. a hidden outcome. Typical B messages are a person's own proof with a linter or 'declaration uses sorry' warning, being re-asked.

The builder followed the plan's text; the channel is in the plan's placement rule.
    - **fix:** Place B's messages for an overridden `.holds` at a position that does not depend on where the working copy put it. Use the start of the target's statement declaration in the working copy: it never moves relative to visible content, and `containing()` still attaches the message to the card.

Amend §4.7 and §2.9 to say so. Add a test: a moved proved `.holds` with B's warning and a diagnostic between B's place and the new one gives the not-proved twin's diagnostic order.
    - **evidence:** mask.ts:227-230: `if (overrides.has(before.name)) { const start = now.decl.range.start; messages.push({ ..., range: { start, end: start } }); }`, where `now` is the working copy's declaration.

build.ts:1134 sorts diagnostics with `compareDiagnostics` (file, line, character, code, message).
  - [5]
    - **id:** V2C1-S5
    - **severity:** minor
    - **where:** /home/zhengyew/telelean/packages/core/src/review/mask.ts:282-294 (projectMaskOf derivedIds)
    - **problem:** `derivedIds` restores a derived id only for `touched` cards. Touched cards are the targets of ledger `arrow` entries, the cards in `restoreMarks`, and cards whose premises include a dropped premise card. Whether a card is touched depends on the hidden outcome.

Taking out a written premise drops its ledger entries but leaves the `id:` line it wrote. planItemRevert restores premises, follows_from and lean, but not a derived id, and computeItems treats the write-back alone as no difference. So a target with a derived id in B that had a premise written and taken out keeps a written id with B's pins.

In a later hidden stage:
- the twin where Claude proposed an arrow into it is touched, gets its derived id back, and shows TL112;
- the twin without the arrow is not touched, keeps the written id, and shows no TL112.

The twins' SessionView JSON differs.
    - **fix:** Drop the `touched` filter. Restore B's derived id for every card whose working-copy block wrote an id over B's derived id while its `lean:` pins equal B's. In slice 2 only telelean's ledger writes produce such a write-back, current or taken out. Add a test with a premise written and taken out, then a hidden arrow in one twin only.
    - **evidence:** mask.ts:283-285 builds `touched` from `dropArrows`, `restoreMarks` and premises pointing at dropped nodes.

revert.ts:316-341 sets only `premises`, `follows_from` and `lean`.

items.ts:808-811: a derived-id write-back is 'no difference on its own'.

§2.2: taking a premise out drops its `premise`, `mark-removed` and `completion` entries.
  - [6]
    - **id:** V2C1-S6
    - **severity:** minor
    - **where:** /home/zhengyew/telelean/packages/core/src/review/mask.ts:312-329 (maskedModel)
    - **problem:** `maskedModel` rebuilds the project from `{ files, fileHashes, facts, library, mask }` only. ProjectModel does not keep the build's other inputs, so any `endorsements` (new in this sub-slice, §2.6/EN-3) and the `lakefile` (TL110) the working copy was built with are lost.

The hidden board would then mark every definition 'needs your endorsement' and drop TL110, and both come back when the results are shown. That contradicts §4.7's 'statements and vocabulary from the working copy': these are not proof-derived data. It is not a leak, since both twins are equal, but the two views of the same working copy disagree.
    - **fix:** Add optional `endorsements` and `lakefile` to maskedModel's input (or an options object passed through to `buildProjectModel`), and record it in §2.9's note. Add a test: an endorsed definition stays unflagged under the mask.
    - **evidence:** mask.ts:328: `return buildProjectModel({ files, fileHashes, ...(facts ...), library: i.current.library, mask });`.

project/types.ts: ProjectModel has no endorsements or lakefile field. build.ts:595-603 reads `input.endorsements`; build.ts:1101 reads `input.lakefile`.
- **checks_run:**
  - Read verify_common.md, builder_rules.md and brief 2c1.md; read plan §0, §1/§1.1 (2c1 and 2c2 entries), §2.1-§2.9 contracts, §4.2, §4.7, §4.9, §4.11, §6.1 (2b2 and 2c1 tests), §8 (builder 2c1, fixer 2b2 r2 and related entries); spec RV-5, RV-6, RV-7, CM-6, EN-2, EN-3; 02_autopilot_decisions AP-24 to AP-30
  - Diffed every changed file against the builder's originals (scratchpad/b2c1/orig), and review/types.ts against after_slice_2b2.patch; confirmed g0.ts and review/index.ts are byte-identical (cmp); listed repo files newer than the builder's start marker
  - Checked protocol.ts against §2.4 rule by rule (formalize, decideItems, revealResult, sessionUndo/Redo, submitReview, endSession, retryStep, openSessionDiff, moveProposed, LIMITS, session light check, RUN_MESSAGE_TYPES/ES-9 routing via isRunRequest), and read the host default and routing test
  - Checked endorsementHash/endorsementsPath/parse/serialize and the build's endorsement logic against §2.6/D2-18; verified VocabItem.code and DeclEntry.text are the same scanner span; checked for an import cycle via review/hash.ts
  - Traced the masked build: maskFiles (bindings, mutual, derived ids, TL112 text versus parser), maskedCode/withoutHidden/deletionEdit/blankComments, holdsKind fallback, FactsIndex freshness and kindsAgree, parser bindBlock (pinned bindings carry adjacentDecl), vocabulary candidates and classify for unowned declarations, diagnostics sort and dedupe
  - Checked maskFacts field by field against §2.9 (hidden names, overrides, same-text axioms/usesSorry, messages moved or placed, envelope, probed count) and baseMask's lists against the ledger semantics (first created entry, B names, B arrows, premise cards, mark removals)
  - Verified the R2-1 fix against the brief's prescribed code and its 3 tests; verified AP30-1 r3 symbols and tests exist in g0.ts and g0.test.ts
  - Read mask.test.ts (28), endorsements.test.ts (7) and protocol.session.test.ts (15) against §6.1's 2c1 list and checked that each test's oracle matches its claim; read the builder's 106-row mutation table
  - Did not run builds or tests (read-only lens, as instructed)
