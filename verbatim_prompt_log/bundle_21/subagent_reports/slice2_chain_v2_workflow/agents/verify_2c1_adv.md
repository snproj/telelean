# verify:2c1:adv

Agent `aec13fc834f1d228b` of workflow `wf_ae5f1188-533`. Verbatim output (JSON alongside).

- **summary:** I traced 2c1 through the code and ran probe tests in my scratch dir. The base mask has four concrete ways to leak hidden content while the results are hidden (RV-6). All four come out of states the gate accepts, which I checked with judgeState probes, and no existing test covers any of them.
(1) baseMask/maskedNames hides a card's own statement and an AXIOM card's `.holds` whenever their ledger `created` phase is 'proof'. D2-43 gives that phase to every new declaration of a step that ends not proved without freeze_statements, and gate-other accepts such a finish. The card then shows as informal on the masked board, while computeItems lists its Formalize item, a meaning item the user must decide. In the proved outcome (which needs a freeze) the same card is formalized. So the board tells the user "not proved".
(2) maskFiles resets a pinned block's whole binding to `none` when the declaration right below the block is hidden. The user's own premise card then shows as informal, and its `.holds` appears as a "hidden assumption" (TL104).
(3) The working copy's TL013/TL014 parser hints survive the mask and name or reveal a hidden lemma below a code-less card.
(4) maskedCode keeps a hidden lemma's comment line, or an extra blank line, inside another card's code. The existing "spaced" test asserts that leaky output.
Minor gaps: maskedModel cannot receive endorsements or the lakefile, and maskFacts keeps the working copy's detail fields, including probe.detail.
Everything else checks out: the protocol validators, the host's `not-yet` default, endorsementHash and the parse/serialize functions, R2-1 (`indexOf` cannot land inside the whitespace-only lead), and AP30-1 r3 (unchanged). The builder's 106 mutations hold, and the full core suite passes in my run: 75 files, 1050 tests.
Effects outside my scratch dir: my first core vitest run had Vite write and delete a bundled config in packages/core/node_modules/.vite-temp, which is empty again. My later runs used `--configLoader runner`. I made no edits to the repo and no git changes.
The probe tests that reproduce each finding are in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/probe/; run them with /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/run.sh <file> --silent=false.
- **findings:**
  - [1]
    - **id:** ADV-1
    - **severity:** blocker
    - **where:** packages/core/src/review/mask.ts:52-54 (baseMask `drop`) and :86-91 (maskedNames); consumed by projectMaskOf/maskedModel and build.ts maskFiles
    - **problem:** The mask drops every name whose first ledger `created` entry is 'proof', including a card's own statement abbrev and an AXIOM card's `.holds`.

Why such names get 'proof': D2-43/§3.4 records a step's new declarations as 'statements' only when they are in its freeze commit. A step that formalises statements and then finishes not proved without calling freeze_statements has no freeze commit, so every new declaration gets 'proof'. A12 statements-only steps can end this way too. gate-other accepts such a finish (only gate-proved needs the freeze).

Why it matters: computeItems owns card-bound names through the card (`card:<id>`, a visible Formalize item, never part of a Result). The masked board therefore hides the statement of a card the user must decide. That card is a meaning item: belief b2/b3 for an AXIOM source, a statement item for the target. The card shows as informal, with no statement and no code.

In the proved outcome the freeze is mandatory, so the same names are 'statements' and the card is formalised. The masked board therefore tells the user "not proved" before the meaning items are decided (RV-6, §4.7: "statements and vocabulary from the working copy"). It also misleads: the board says the card has no statement while its Formalize item shows one.
    - **evidence:** Probes in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/probe/:

nofreezegate.test.ts:
- judge(FORMALISED, {purpose:'gate-other'}) with no freeze gives stepFindings [].
- judge(FORMALISED, {purpose:'stage', ledger:[created('Spyro.pg_no_dark_past','proof'), created('Spyro.pg_no_dark_past.holds','proof')]}) gives ok true and drafts ['card:pg-no-dark-past', 'proof:cynder-not-good']. card:pg-no-dark-past has no partOf, and its classesBeforeReveal is belief (b2, b3).

nofreeze.test.ts: mask.drop is ['Spyro.pg_no_dark_past', 'Spyro.pg_no_dark_past.holds']. The masked pg-no-dark-past is 'informal' with no statement and no code. With created … 'statements' on the proved state it is 'formalized' with Spyro.pg_no_dark_past.

nofreezetarget.test.ts: a code-less target `fz`, formalised and then not proved without a freeze. The stage judgement is ok with drafts card:fz and proof:fz. The masked fz is 'informal' with no statement. In the proved outcome it is 'formalized' with `abbrev fz …`.

No mask test has a card-bound name with a 'proof' created entry.
    - **fix:** In maskedNames (mask.ts:86), drop a name of `mask.drop` only when the working copy binds it to no card, or to a card in `mask.dropNodes`. Sketch:
`for (const name of mask.drop) { const owner = current.ownerOfDecl.get(name); if (owner === undefined || dropped.has(owner)) drop.add(name); }`
Keep adding what dropped premise cards own, as now.

Card statements, an AXIOM card's `.holds` and pins are their card's visible content (computeItems' card:<id>). A target's `.holds` stays covered by `holds` (absent/override). maskedModel's file filter follows automatically, since it reads projectMaskOf.

Alternative for the orchestrator: amend D2-43/§3.4 for 2d so that names bound to a card are always recorded as 'statements'. The mask should still not contradict computeItems' ownership.

Tests to add to mask.test.ts:
- a fuzzy AXIOM source (pg-no-dark-past) and a code-less target, each formalised at a not-proved finish without a freeze (`created … 'proof'` for the statement and `.holds`), give strip(graph) equal to the 'statements' ledger and to the proved outcome;
- the card stays formalised under the mask.

Mutation check: restoring the current drop must fail them.
  - [2]
    - **id:** ADV-2
    - **severity:** blocker
    - **where:** packages/core/src/project/build.ts:282-285 (maskFiles: `if (binding.adjacentDecl !== undefined) { … if (now === undefined) binding = { mode: 'none' }; … }`)
    - **problem:** When the declaration directly below a block is left out by the mask, maskFiles replaces the block's whole binding with `{ mode: 'none' }`, whatever the binding mode. For a pinned block (`lean: …`), adjacency plays no part in the binding: the pin binds the card in the working copy and in B. Claude can write a hidden proof-phase lemma (or anonymous instance) right below a pinned card's block, and the gate accepts it.

The masked board then unbinds the user's own card, which can be a selected premise of the question. The card shows as informal. Its statement and `.holds` become unowned declarations, listed as a 'definition' and an 'unmarked-axiom' with the flag `unmarked-assumption` and the warning TL104 ("a hidden assumption").

This gives a misleading status and badge on the user's own assumption (g). It also depends on the outcome: the lemma-free outcome shows the card formalised. That is a leak (b).
    - **evidence:** pinnedadj.test.ts and pinnedadj2.test.ts in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/probe/: PROVED is edited so that `theorem secret_below_pin : True := trivial` sits right after cynder-dark-past's block (`lean: Spyro.cynder_dark_past\n-/`).
- judge(…, {freeze: freezeOf(FORMALISED)}) at gate-proved gives stepFindings [].
- In the working copy the card is formalized, binding pinned.
- Masked, the card is 'informal', binding none, with no statement. The masked vocabulary gains 'Spyro.cynder_dark_past kind=definition' and 'Spyro.cynder_dark_past.holds kind=unmarked-axiom flags=unmarked-assumption'.
- Only with the lemma is there an extra diagnostic: TL104 "Spyro.cynder_dark_past.holds is a Prop-valued axiom without a card: a hidden assumption."

The builder's mutation BM-adjacent only covers a code-less (mode none) block. No test has a pinned block.
    - **fix:** Reset to `none` only for a block bound by adjacency:
`const now = index.get(binding.adjacentDecl); if (now !== undefined) binding.adjacentDecl = now; else if (binding.mode === 'adjacent') binding = { mode: 'none' }; else delete binding.adjacentDecl;`
For `pinned` and `none` the binding is kept and only the position hint goes. Better still, re-index it to the next kept declaration as the parser would (see ADV-3).

Test to add: a hidden lemma, and a hidden anonymous instance, written directly below a pinned card's block. Each gives a masked graph equal (strip) to the lemma-free one; the card stays formalised; there is no TL104 and no new vocabulary item.
  - [3]
    - **id:** ADV-3
    - **severity:** major
    - **where:** packages/core/src/project/build.ts:311 (maskFiles: `file.diagnostics.filter((d) => !inside(d.span.start))`), with the binding re-index at :282-295
    - **problem:** maskFiles removes only those markup diagnostics whose span starts inside a hidden span. Two parser hints sit on the block's marker instead, outside every hidden span:
- TL013, "This node is code-less, but `‹name›` follows after a blank line", when a hidden lemma follows a code-less block after a blank line;
- TL014, "The declaration after this block cannot be bound …", when a hidden anonymous instance, `mutual` or `example` sits directly below a code-less block.

The gap case changes no binding ('none' in both B and W), so the step limits accept it. Both hints therefore reach the masked graph. TL013 even names the hidden proof-phase declaration.

When B had a TL013 naming a visible declaration D and the hidden lemma was inserted before D, the masked view shows the hidden name in place of D. The builder's decision 10 ("no stage can hold that state") holds only for the adjacent re-binding, not for this gap case.
    - **evidence:** gaphint.test.ts / gaphintgate.test.ts in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/probe/: a code-less AXIOM card sky-blue, then a blank line and `theorem secret_gap_lemma : True := trivial`, on the proved walkthrough state.
- gate-proved with the freeze gives stepFindings [].
- The masked subjectGraph has 'TL013 sky-blue: This node is code-less, but `secret_gap_lemma` follows after a blank line: remove the blank line to attach it.', and JSON.stringify(graph) contains 'secret_gap_lemma'.

adjacentgate.test.ts: `instance : Inhabited Character := ⟨cynder⟩` directly below sky-blue's block.
- The gate gives stepFindings [].
- The masked graph keeps 'TL014: The declaration after this block cannot be bound (this declaration has no name …); the node stays code-less.' (B has none).
    - **fix:** In maskFiles, for each kept block whose `gapDecl` or `adjacentDecl` points at a left-out declaration:
1. Drop that block's TL013/TL014 diagnostics (code TL013/TL014 with the block's markerSpan).
2. Re-derive the hint and the indices from the next kept declaration, as the parser's bindBlock/findFollowingDecl would on the text with the hidden spans removed. In practice this is the hint B's parse of that block had.

Tests to add:
- a hidden lemma after a blank line below a code-less block;
- a hidden anonymous instance directly below one;
- a hidden lemma between a code-less block and the visible declaration B's TL013 named.
Each masked graph equals (strip) the lemma-free one, and its JSON never contains the hidden name.
  - [4]
    - **id:** ADV-4
    - **severity:** major
    - **where:** packages/core/src/project/build.ts:368-381 (maskedCode, non-override path: `gap = withoutHidden(...)`, `quiet … blankComments(gap.text)`); builder decision 3; mask.test.ts:371-391 asserts the spaced variant
    - **problem:** This is about a card that is not a target, whose statement and `.holds` have a hidden declaration between them. maskedCode removes the hidden spans with LeanOps' deletionEdit. That edit removes only the declaration's lines, plus one blank line when there are blanks on both sides. Two things therefore stay in the gap:
- a comment line written with the hidden lemma, which goes with the lemma under computeItems' attachment rule;
- a blank line on one side of the lemma.

Because blankComments counts the gap as quiet, the card's masked code is composed as one stretch that shows Claude's comment about the hidden proof, or an extra blank line. The lemma-free outcome shows B's tight code. So the card's code differs between outcomes, against §4.7's non-interference, and Claude's words about the hidden proof appear while the results are hidden.

The existing test compares the 'spaced' variant with the LeanOps-removal twin, not with B. It thereby asserts the leaky output.
    - **evidence:** between.test.ts / betweengate.test.ts in /tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/v2c1-adv/probe/, on the proved walkthrough state. Both variants pass gate-proved with the freeze (stepFindings []).
- Commented (`-- helper for the proof of cynder_not_good` plus `theorem secret_between : True := trivial` between `abbrev cynder_dark_past` and `axiom cynder_dark_past.holds`): masked code "/-- Cynder … -/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\n-- helper for the proof of cynder_not_good\naxiom cynder_dark_past.holds : cynder_dark_past".
- Spaced (`\ntheorem secret_between …\n`): masked code "…HasDarkPast cynder\n\naxiom cynder_dark_past.holds…".
- The not-proved outcome (no lemma): "…HasDarkPast cynder\naxiom cynder_dark_past.holds…".
    - **fix:** Compose such a card's code the way B composed it:
- When the card's statement and `.holds` have B's texts (the step limits keep them), use B's joint text between them (`codeJoint` on B's declarations, as `codeOverride.joined` already does for targets). For example, add per-card B joints to ProjectMask in projectMaskOf. Place the `.holds` refs at count(stmtText + joint) from the working copy's `.holds` start.
- If B had two pieces, use two pieces.
- For a card new in the session, also remove the comment lines attached to a left-out declaration (computeItems'/planItemRevert's attachment rule) before deciding that the gap is quiet.

Tests to replace/add in mask.test.ts: the commented and the spaced lemma inside another card's code each give that card's masked code and refs equal to B's, and strip(graph) equal to the lemma-free state.
  - [5]
    - **id:** ADV-5
    - **severity:** minor
    - **where:** packages/core/src/review/mask.ts:312-328 (maskedModel: `buildProjectModel({ files, fileHashes, facts, library: i.current.library, mask })`)
    - **problem:** The masked build gets neither `endorsements` (2c1's own new input) nor `lakefile`. ProjectModel keeps neither, so 2c2 cannot pass them through maskedModel's signature. Once 2f passes endorsements to the unmasked board, the hidden view's graph shows definitions the user endorsed at an earlier Apply as "needs your endorsement" again, and it drops TL110 (autoImplicit). Both change back when the results are shown. The plan says every derived datum the board shows comes from this one build (§4.7).
    - **evidence:** mask.ts:328 builds with { files, fileHashes, facts, library, mask } only. build.ts:595-603 reads `input.endorsements`, and build.ts:1101 reads `input.lakefile`. project/types.ts ProjectModel has no field for either.
    - **fix:** Add optional `endorsements` and `lakefile` to maskedModel's input (additive, recorded in §2.9's note) and pass them to buildProjectModel. Alternatively, keep them on ProjectModel.

Test to add: maskedModel with an endorsement of a definition that a card uses keeps the definition's and the card's flags exactly as the unmasked build of the same working copy does.
  - [6]
    - **id:** ADV-6
    - **severity:** nit
    - **where:** packages/core/src/review/mask.ts:239-244 (maskFacts return: `{ ...facts, build: { ...facts.build, messages }, check: { ...facts.check, probed }, decls }`)
    - **problem:** The masked facts keep the working copy's envelope: `probe.detail`, `detail`, `build.detail` and `check.detail`. `probe.detail` is "Lean's first error, with its line" (facts.ts:209). For a failed probe it can name or quote hidden proof material, which §4.7's last residual (A-V2B2-ADV-7) forbids while the results are hidden. Nothing reads these fields from the masked model today. They become a trap if 2c2 calls probeFailure() or a semantic summary on `maskedModel(...).facts`.
    - **evidence:** mask.ts:239-244 spreads `facts`. facts.ts:223-229: probeFailure includes `probe.detail` unless `{detail:false}`.
    - **fix:** In maskFacts, drop `detail` from `probe`, `build`, `check` and the envelope (or keep only `probe.status`). Add a test that a working copy whose probe failed with a detail naming a hidden lemma gives masked facts without that text.
- **checks_run:**
  - Read verify_common.md, builder_rules.md, brief 2c1.md, plan §1/§1.1, §2.2-§2.6, §2.9, §3.3-§3.5, §4.1-§4.12, §6.1 (2c1), §7.2 D2-18/D2-43, §8 builder 2c1 entry, spec EN-3
  - Diffed every 2c1 file against the builder's originals (b2c1/orig): mask.ts, build.ts, project/types.ts, paths.ts, protocol.ts, revert.ts, boardSession.ts, runRouting.test.ts, protocol.m2.test.ts; g0.ts and review/index.ts byte-identical
  - Traced the masked build end to end: FactsIndex matching, binding/ownership, maskedCode, refs, messages (containing), vocabulary, edges, externalUsers, subjectGraph/graphJson fields
  - Probe (scratch, vitest rooted in my scratch dir): created 'proof' card statements without freeze -> masked card informal (nofreeze, nofreezetarget); gate-other with no freeze and the stage judgement accept it (nofreezegate)
  - Probe: hidden lemma directly below a pinned block passes gate-proved; masked card unbound, TL104 hidden-assumption, new vocab items (pinnedadj, pinnedadj2)
  - Probe: hidden lemma after a blank line below a code-less block passes the gate; TL013 naming it reaches the masked graph; hidden anonymous instance directly below keeps TL014 (gaphint, gaphintgate, adjacentgate)
  - Probe: commented and spaced hidden lemma inside another card's code passes the gate; masked code shows the comment / an extra blank line vs B (between, betweengate)
  - Checked a lemma directly below a code-less block is refused by the gate (markup/formalised), as the builder said
  - Reviewed protocol validators and protocol.session tests against §2.4's table; host default `not-yet` and its routing test
  - Reviewed endorsements build logic, endorsementHash, parse/serialize and their tests; R2-1 revert fix (baseDeclPlace lead is whitespace only, so indexOf is safe)
  - Reviewed the builder's 106-mutation table for gaps (none covers pinned bindings, card-bound proof-phase names, parser hints, or comment lines in a card's gap)
  - Ran core vitest on mask/endorsements/protocol.session/revert: 4 files, 77 tests passed; full core suite (capped, one worker, --no-cache, --configLoader runner): 75 files, 1050 tests passed
  - Checked no repo files changed: probes and caches only in my scratch dir; one transient Vite bundled config written and deleted in packages/core/node_modules/.vite-temp by my first core run (folder empty)
