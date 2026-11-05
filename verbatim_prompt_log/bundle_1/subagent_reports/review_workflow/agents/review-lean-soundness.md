# review-lean-soundness

## Summary
The logical core is well chosen, and the parts I re-checked on Lean 4.35.0 hold up (experiments in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/review/lean-soundness/p1):
- **Selection, direct use.** `lake comparator` rejects a proof that uses a declared but unselected assumption ('Illegal axiom detected: T.cynder_dark'). The research never tested this case.
- **New axioms after the freeze.** Any axiom added in phase B is rejected, whichever way permitted_axioms is computed.
- **Statement closure.** Reading Compare.lean: definitions and instances reachable from the frozen statement are compared by full ConstantInfo equality, and permitted axioms are compared by type.
- **D-2 and comparator.** A challenge containing `by sorry` works with a sorry-free solution.
- **Instance-typed axioms.** `Subsingleton` is classified as a proposition, `Inhabited` is blocked, and `Decidable` is harmless classically.
- **Other constructs.** opaque, implemented_by, partial and `decreasing_by sorry` all show up as opaque constants, auxiliary axioms or sorryAx.

The holes are at the edges of what the gate treats as 'vocabulary' and as 'in scope':
1. **Blocker.** D-5's strict selection is not actually enforced by machine as specified. Every selection permits all approved vocabulary, but data axioms are premises. I built a Type-valued record with a Prop field and gave it a Nonempty instance proved from the unselected A1. lake comparator then accepted a proof whose footprint omits A1. r2's classifier, which 03 §5 follows, labels the record axiom harmless.
2. **Sort u vocabulary.** It collapses distinct individuals through proof irrelevance, and the pretty-printer hides it (verified).
3. **Other nodes unprotected.** G4/G5 only protect the frozen targets of the current run. Bindings and statements of all other nodes can change, including the meaning of unchanged text through instance priority (verified).
4. **Sign-off comes first.** The sign-off happens before any gate step, and 'notation off' still hides instances (verified).
5. **No semantic certificates in v1.** 'Insufficient' is only the LLM's claim, and vacuous proofs pass. A finite model finder checked by `decide` is feasible today (verified).

Several 'verified' attributions also overstate the evidence:
- The walkthrough's non-entailment holds for only one of the two formalisations in the research.
- G0 and G5 were never exercised.
- The extractor's loadExts setting and performance figures come from a different configuration than the one specified.

Recommended direction:
- Ban data axioms. Make constants `noncomputable opaque`, backed by Prop existence assumptions; I verified this restores A1 in the footprint.
- Allow monomorphic sorts only.
- Protect every formalised node with a closure-hash immutability check.
- Use an allowlist checked by Lean's parser instead of a token denylist.
- Run the gate before sign-off, and render statements with explicit instances and universes.

## Issues
- **LS-1** [blocker] doc 02 § D-3, D-5 (also 03 §4 DEFINITION row, §5 axiom classes, §8.5 G3/G4)
  - problem: D-5 says the button's selection is enforced by machine. But G4 sets permitted_axioms = 'the 3 standard + vocabulary + the selected assumptions', so every selection admits all approved vocabulary. Vocabulary data axioms are premises: `axiom c : T` asserts Nonempty T. When T carries propositional content, the data axiom silently stands in for an unselected ASSUMPTION and hides it from the footprint. Examples: a Type-valued record, Subtype, Sigma or PLift with a Prop component, or a sort former with a Prop parameter such as `Reported : Prop -> Type`. 03 §5 follows r2's classifier. r2 calls such an axiom harmless ('constant-of-inhabited-type') because it synthesises Nonempty T in the untrusted model environment, where the agent's own instance is proved from the very assumption being smuggled. D-3's four classes do not cover this case at all. Plain existence commitments, such as `spyro : Character` used to discharge an existential, are also unselected premises. So the tray's 'prove G from {A1,A2,A3}' misstates the obligation, and the agent can add new assumptions disguised as vocabulary, contrary to S7.
  - evidence: VERIFIED (Lean 4.35.0, scratch p1). Setup: A1 `cynder_dark` unselected; A2 `spyro_pg` and A3 `pg_no_dark` selected. The agent adds `structure CynderProfile : Type where dark : HasDarkPast cynder`, `instance : Nonempty CynderProfile := <<cynder_dark>>` and `axiom cynderProfile : CynderProfile`. Proof: `pg_no_dark _ _ spyro_pg cynderProfile.dark`.
- #print axioms gives [T.Character, T.Game, T.GoodAddition, T.HasDarkPast, T.IsPG, T.cynder, T.cynderProfile, T.newSpyro, T.pg_no_dark, T.spyro_pg]. cynder_dark is absent, and G6's zero-assumption flag does not fire.
- lake comparator with permitted = std + all vocabulary + {spyro_pg, pg_no_dark}: 'Lean default kernel accepts the solution / Your solution is okay!', exit 0. Control solution that uses cynder_dark directly: 'Illegal axiom detected: T.cynder_dark', exit 1.
- Classifiers: r2's (copied verbatim from r2 Extract.lean) says cynderProfile = constant-of-inhabited-type; r5's Audit says nonsignature. For `axiom Reported : Prop -> Type` and `axiom reportedPG : Reported (IsPG newSpyro)`: r2 says constant-of-uninterpreted-type, r5 says symbol. Both treat it as harmless, yet with a selected 'what gaming news reports is true' it replaces the unselected A2.
- Without the explicit `: Type`, Lean puts the record in Prop and both classifiers say proposition.
- Fix verified (Opq.lean): with `axiom characters_exist : Nonempty Character` and `noncomputable opaque cynderProfile : CynderProfile`, the same proof's footprint includes cynder_dark, characters_exist, games_exist and Classical.choice.
- Phase-B axiom: if permitted is taken from the frozen sign-off, the result is 'Illegal axiom detected: T.newVocab'. If it is recomputed from the post-run audit, the challenge export fails with 'PANIC ... Constant T.newVocab not found in environment', exit 1.
  - fix: Make the rule structural rather than dependent on a classifier.
1. Forbid data axioms. Allowed axioms are: (a) monomorphic sort formers with data-only binders; (b) predicates or relations ending in Prop; (c) Prop axioms, which are ASSUMPTIONs.
2. Write constants as `noncomputable opaque c : T`. Express existence as a Prop ASSUMPTION `axiom T_exists : Nonempty T` plus an instance, so existence commitments appear in footprints and can be selected.
3. permitted_axioms = std ∪ (a) ∪ (b) ∪ selected ASSUMPTIONs ∪ footprints of selected DERIVATIONs. Compute it only from the frozen sign-off snapshot, and forbid any new axiom in phase B.
4. Make the tray show the expanded obligation, including existence assumptions.
5. If data axioms are kept anyway, decide inhabitation only in r5's trusted Init-only environment. Treat any data axiom whose type mentions a Prop or a proof as an ASSUMPTION.
6. Add both exploits to test-fixtures/exploits.
7. Make the Ramsey generator abstract opaque constants too.
- **LS-2** [major] doc 03 § §4 DEFINITION row; §8.5 G3; 02 D-3 ('type formers ... are harmless signature')
  - problem: Nothing forbids universe-polymorphic vocabulary. With `axiom Character : Sort u`, the agent can instantiate at u = 0, for example `GoodAddition : Character.{0} -> Game -> Prop`. Every character is then a proof of the same Prop, so proof irrelevance makes `cynder = spyro` hold by rfl, and a goal about Cynder follows from an assumption about Spyro. The default pretty-printer, the 'notation off' toggle and both research classifiers present this as ordinary signature. G6 does not fire, because an assumption is used.
  - evidence: VERIFIED (U.lean). Setup: `axiom Character : Sort u`; `cynder, spyro : Character.{u}`; `GoodAddition : Character.{0} -> Game -> Prop`; selected `spyro_not_good : ¬ GoodAddition spyro newSpyro`.
- `theorem cynder_not_good : ¬ GoodAddition cynder newSpyro := spyro_not_good` is accepted, and so is `(cynder : Character.{0}) = spyro := rfl`.
- #check prints '¬GoodAddition cynder newSpyro'. pp.notation false prints 'Not (GoodAddition cynder newSpyro)'. Only pp.universes shows 'cynder.{0}'.
- #print axioms cynder_is_spyro gives [Character, cynder, spyro], with zero Prop assumptions.
- Classifiers: Character = type-former / sort-former; cynder = constant-of-uninterpreted-type / symbol.
- r2 already notes that the Ramsey generator does not support universe-polymorphic axioms.
  - fix: G3 should reject any axiom, or any opaque or def on a statement path, that has universe parameters or whose sort can be instantiated to Prop: `Sort u`, `Sort (max ..)`, `Sort (imax ..)`, or a sort former whose codomain is Prop. Require `Type`. Render sign-off statements with pp.universes. Add a fixture for this exploit.
- **LS-3** [major] doc 03 § §8.5 G4/G5; §3.1 binding (adjacency, 'lean:' resolved relative to namespace); §5 'alpha-invariant type hash'; §2 'signoff-stale'
  - problem: G4 compares only this run's theorem_names and permitted axioms. G5 checks only NL bytes, ids and deletions. Everything else the agent may edit in the shadow is unprotected:
(a) Inserting a declaration between a GOAL's block and its theorem, deleting or renaming the theorem, or editing `lean:` or the surrounding namespace rebinds the node. An unrelated GOAL can end up bound to `theorem x : True` and be offered as G->D.
(b) Unrelated ASSUMPTION or DERIVATION statements can be weakened or strengthened.
(c) Proved nodes can be regressed to sorry, since G1 allows sorry on formalised-unproved nodes.
(d) An instance, notation or coercion added in an imported file changes the elaborated meaning of unchanged user text downstream.
The only defence is a post-hoc 'signoff-stale' flag keyed on each declaration's own type hash. That misses changes to definitions on the statement path.
  - evidence: VERIFIED (Prio.lean). With `instance honest : LE Rating := <ratedAtMost>`, the text `r ≤ pg` elaborates to '@LE.le Rating honest r pg'. After an agent-added `instance (priority := high) agentInst : LE Rating := <fun _ _ => True>`, identical text elaborates to '@LE.le Rating agentInst r pg'. Default pretty-printing shows 'r ≤ pg' both times. Compare.lean (read) seeds its worklist only from theorem_names ++ permitted_axioms ++ primitives, so declarations outside the run are never compared. r2 recommended a closure hash precisely because 'redefining vocabulary changes meaning without changing the goal's own Expr'.
  - fix: Add a G5 'formal immutability' check against the base snapshot. For every node formalised in the base and not in this run's signed-off change set, these must be identical: bound fully-qualified names, declaration kind, proof status (no regression from proved), and the statement-closure hash. The closure hash covers Expr.hash of the type plus every reachable non-proof constant. Treat a difference as a rejection; for Instruct or refactor runs, require re-sign-off instead. Allow G->D only for this run's targets verified by the comparator. Once a node is formalised, pin its binding by writing an explicit FQN `lean:` instead of relying on adjacency.
- **LS-4** [major] doc 03 § §7 statement sign-off view; §8.3 propose_formalization; §8.4 run protocol; 02 D-18 ('notation off' toggle); §11 (skeleton deferred to v1.5)
  - problem: Phase-A sign-off is the only defence against meaning-smuggling, but:
(a) No gate step runs before it (Formalize -> Sign-off -> Freeze; G0-G6 run only at finish). Notation, macros, Sort-u vocabulary, data axioms and definitions on the statement path reach the user unclassified.
(b) 'Notation off' sets only pp.notation false. That still hides instance arguments, coercions, universe levels and the bodies of definitions on the path.
(c) The deterministic logic skeleton is deferred to v1.5, which leaves only an LLM back-translation.
(d) The freeze is not specified to export exactly the snapshot the user saw.
  - evidence: VERIFIED (U.lean, namespace I). With `instance : LE Rating := <fun _ _ => True>` and `theorem spyro_at_most_pg : rating newSpyro ≤ pg := trivial`:
- #check prints 'rating newSpyro ≤ pg'.
- pp.notation false prints 'LE.le (rating newSpyro) pg', so the instance is still hidden.
- pp.explicit prints '@LE.le Rating instLERating (rating newSpyro) pg'.
  - fix: propose_formalization should first run G0-G3 plus the vocabulary policy (LS-1, LS-2) and refuse to open sign-off on any violation. Show each statement in three forms:
- the default pretty-print;
- a fully explicit view (pp.explicit, pp.universes, pp.coercions false, pp.fullNames, pp.notation false);
- the statement closure: every non-axiom constant reachable from the statement, with its kind and body.
Move the deterministic Expr->English skeleton into v1. Define the freeze as an export of the content-hashed snapshot that was displayed, completed before the tool returns.
- **LS-5** [major] doc 02 § D-6, D-7; 03 §8.6 failure modes, §11 roadmap (certificates in v1.5)
  - problem: v1 certifies nothing semantic.
(a) 'Insufficient' is just the agent's finish() status. 'No proof found' is reported as 'selection does not suffice', contradicting IC-21 and the untrusted-LLM principle.
(b) A proof from an inconsistent footprint passes G0-G6 with only a passive note. For example, the natural mis-scoping A3 := ∀ g c, IsPG g -> ¬HasDarkPast c makes {A1, A2, A3} inconsistent, so every goal is 'proved' using three selected assumptions.
(c) Vacuous goals, whose antecedent is unsatisfiable together with the footprint, are not detected at all.
(d) Ghost assumptions are checked neither for actually closing the gap nor for circularity, i.e. a ghost that is the goal or alone entails it.
  - evidence: VERIFIED (Finite.lean). The walkthrough independence statement (r5's formalisation) is proved by `<Fin 2, Fin 2, 0, 0, fun c => c = 0, fun g => g = 0, fun _ _ => False, fun _ _ => True, by decide>`. #print axioms gives [propext], about 0.4 s. So finite countermodels checked by the kernel need no LLM and fit in v1. Item (b) is immediate from the logic (not run). r2: grind failed to refute an inconsistent set, but simp_all worked.
  - fix: Add a deterministic finite model finder in v1. It interprets sorts as Fin 1 or Fin 2, predicates as truth tables and constants as elements, then kernel-checks the witness with `decide`. Use it for:
- footprint consistency before showing 'proved';
- independence: show 'insufficient (countermodel)', otherwise only 'not proved';
- non-vacuity: the footprint holds together with an instance of the goal's antecedent.
Fall back to the LLM's certify() only when the search fails. A ghost assumption must come with a gate-checked proof of G from selection ∪ {ghost}. Flag a ghost that alone entails G or is alpha-equivalent to G.
- **LS-6** [major] doc 01 § §3 first bullet; 02 D-1 recommendation, D-6; 03 §10 end-to-end walkthrough
  - problem: 01 §3 presents as mechanically checked that 'the three assumptions, as stated, do not entail the goal', and the acceptance test is built on asking for the bridge. Natural-language sentences have no kernel-checked entailment; the countermodel holds for one formalisation only. Which reading is right is exactly the pragmatic question S30 wants the LLM to surface.
  - evidence: From the reports and artifacts:
- r5 CertIndependence.lean formalises S24 as `∀ g c, IsPG g -> HasDarkPast c -> ¬ AppearsIn c g`, so a bridge is needed.
- r2 E1 formalises the same sentence as `... -> ¬ GoodAddition c g` and proves `cynder_not_good := pg_no_dark _ _ spyro_pg cynder_dark` directly from the three assumptions.
- The user's ~/telelean_scripts/cynder.lean bridges the rating straight to the goal: `(c.past = 'dark' ∧ g.rating = 'PG') -> ... @ goal`.
  - fix: Reword the claim: under the literal reading of 'cannot have' ('does not include') a bridge is needed, and a countermodel checked by the kernel exists; under a suitability or deontic reading the goal follows directly. Make this a canonical ask_user modality card. Exercise both branches in the FakeBackend walkthrough. Record the user's answer as a DECISION.
- **LS-7** [major] doc 02 § D-2 (and summary row 'following your own reading of sorry in S39'); 01 §3 third bullet; 03 §4
  - problem: `theorem g : S := by sorry` does not leave S uninhabited. It inhabits S with sorryAx, i.e. it asserts the goal, and downstream proofs can use it. The faithful encoding of 'a representation, not inhabited yet' is a Prop with no proof term, which is S37's own `def`, i.e. option (b). r2 recommended and verified option (b); the doc reverses that without saying so. The reasons given for (a) are weak:
- The comparator does not need sorry in the user's files. It compares theorem_names by ConstantVal only, so a generated challenge module containing `theorem g.holds : g := sorry` suffices.
- 'Honestly marked conditional' is coarse. sorryAx is anonymous, so 'conditional on which goals' is lost, and A->D promotion turns every dependent's footprint into sorryAx.
The doc also never separates sorry in a statement's type (not formalised) from sorry in its proof.
  - evidence: From the reports and the source:
- r2 recommended scheme B and noted that `theorem n : S := sorry` 'the user rejected ... pollutes axiom checks'.
- r2 E7/E17 verified abbrev + `.holds`, with simp friction as the only cost.
- Compare.lean: theorem targets are compared by toConstantVal only.
- r2 E1: 'a lemma that uses a sorried lemma -> [..., sorryAx]'.
  - fix: Present D-2 openly as reversing the research recommendation, including the point that sorryAx asserts the goal.
- If (a) is kept: add conditionalOn, the theorems in the dependency closure whose own value contains sorryAx. Count a node as formalised only if its type contains no sorry. Allow sorry only in the proof body of node-bound GOAL theorems or claimed DERIVATION theorems.
- If (b) is chosen: keep `axiom a : S` for assumptions, use `abbrev g : Prop := S` plus `theorem g.holds : g` for goals and derivations, and generate the comparator challenge automatically.
- **LS-8** [minor] doc 02 § D-4; 03 §7 sign-off flags, §14 'sign-off fatigue'
  - problem: D-4 demands sign-off for any def, abbrev, structure or inductive that 'a statement or proof depends on'. Declarations used only in proofs are conservative (they can be unfolded away) and cannot change what is proved. Because G4 pins the statement closure, every phase-B definition is necessarily proof-only, so sign-off on them only adds fatigue. Meanwhile the list omits the meaning-bearing kinds: instance (including priority), class, opaque, coercions, and declarations generated by deriving.
  - evidence: Compare.lean compares the statement closure by full ConstantInfo, so after the freeze new definitions cannot reach a statement. Prio.lean shows that instances change meaning.
  - fix: Limit sign-off to the statement closure of goals, selected assumptions and vocabulary, which is exactly what G4 pins. Cover every declaration kind there, including instances, classes, opaques, coercions and deriving-generated declarations (shown grouped). Show proof-only declarations in the diff without sign-off. State that no definition sign-off is needed after the freeze.
- **LS-9** [minor] doc 03 § §8.5 G0; 02 D-27 G0
  - problem: G0 is a TypeScript token-scan denylist. Lean accepts spellings a text scan will not anticipate. 03's list is also a subset of r5's: it omits #exit, run_tac, run_elab, run_meta, syntax, macro_rules, declare_syntax_cat, initialize, @[csimp], partial and maxHeartbeats 0, and it does not mention infix, prefix, postfix or instance priority. Kernel replay and the comparator keep proofs sound, but anything G0 misses that affects parsing or pretty-printing corrupts what the user signs off.
  - evidence: VERIFIED (Lex.lean): `set_option «debug».proofAsSorry true in theorem t1 ...` is accepted, and t1 depends on [sorryAx], so a regex on 'debug.' misses it. r5 itself says 'The lint is only defense in depth'.
  - fix: Use a positive allowlist of command kinds, checked by Lean's own parser through the extractor's frontend mode:
- namespace, section, end, and plain open (no renaming, hiding or export);
- axiom, restricted per LS-1 and LS-2;
- theorem, def, abbrev, structure, inductive and instance, with sign-off per LS-8;
- comments and attribute [simp];
- a fixed allowlist of options.
Keep the TypeScript scan only as a pre-filter.
- **LS-10** [minor] doc all § 02 D-27 and 03 §8.5 'each verified against a real exploit'; 03 §5 extractor; 03 §4 '(or opaque)'; 02 D-1 'witness proved with no axioms'
  - problem: Several 'verified' labels overstate the evidence:
(a) No G0 lint or G5 policy was ever implemented. The research showed that the exploits work, not that a lint catches them, and G1 had no exploit at all.
(b) 03 §5 specifies loadExts := false. The measured extractor (0.5 s, 475 MB, 231 MB binary) ran with loadExts := true and enabled initializers, and its Nonempty-based classes need instance synthesis, which fails without loadExts.
(c) `opaque c : T` fails for an uninterpreted T.
(d) Certificates may use Lean's three standard axioms, not 'no axioms'.
(e) Strict selection against a declared but unselected assumption was never tested; every research comparator config permitted all assumptions.
  - evidence: From the artifacts and reports:
- r5 artifacts contain no lint; exploits/X are attacks only.
- r2 Extract.lean calls enableInitializersExecution and uses loadExts := true.
- r5: 'Without loadExts, type-class synthesis fails'.
- r2 E6 and r5 ProbeOpaque: 'failed to synthesize Inhabited or Nonempty instance'.
- My Finite.lean certificate depends on [propext].
- I verified (e) myself: 'Illegal axiom detected: T.cynder_dark'.
  - fix: Relabel G0, G1 and G5 as 'designed, not yet exercised', and let the exploit fixtures in §10 be the evidence. Specify the extractor as an untrusted import with loadExts := false, plus r5's trusted Init environment for any instance query, then re-measure it. Fix the §4 row. Change 'no axioms' to 'only the three standard axioms'. Cite the strict-selection test.
- **LS-11** [minor] doc 03 § §8.4 sandbox caps (4 GB / 120 s); §5 unsandboxed real-workspace refresh; §8.5 G0
  - problem: Agent code is not forbidden to raise maxHeartbeats, maxRecDepth or synthInstance limits. A proof needing about 3.5 GB or about 100 s passes the gate. After acceptance it is elaborated unsandboxed and without a cap by every semantic refresh and by the VS Code Lean server, which is risky on a machine that has crashed from memory exhaustion before.
  - evidence: Not run. 03 §8.4 sets MemoryMax=4G with a 120 s timeout. 03 §5 says the refresh 'needs no extra sandbox'. r5's lint list included 'maxHeartbeats 0'; 03's does not.
  - fix: Forbid raising any limit, so the default of 200000 heartbeats applies. Have G1 record per-declaration time and peak RSS, and reject anything over a usability budget such as 10 s or 1.5 GB per file. Run the real-workspace refresh under the same memory cap.
- **LS-12** [minor] doc 03 § §2.1 DerivedStatus; 02 D-15; §3.4 TL102
  - problem: The status model is not a well-defined lattice:
- 'Fully grounded ✓✓' has no logical meaning, since every proof footprint is formal by construction.
- There is no conditional-on-goals state.
- There is no 'self-evident' state for zero-assumption proofs (cf. the user's `self_evident ?-`).
- assumptionsUsed does not separate assumptions from existence commitments.
- 'Insufficient' does not distinguish certified from uncertified, and non-vacuity is not tracked.
- TL102 makes 'DERIVATION depends on sorry' an error, while D-17 treats the same state as the normal 'claimed'.
  - evidence: From reading 03 §2, D-15, D-17 and TL102.
  - fix: Model status as a product:
- formal ∈ {informal, formalised, ill-formed};
- proof ∈ {none, conditional(Gs), proved(F)};
- certificates for consistency(F), non-vacuity and independence, each ∈ {none, ✓, refuted};
- flags: self-evident, unselected-used, signoff-stale.
Define ✓✓ as proved(F) plus consistency plus non-vacuity. Downgrade TL102 to 'info: claimed'.
- **LS-13** [minor] doc 02 § D-1, D-4; 03 §11 (v1.5 Ramsey certificates)
  - problem: The user's own sketches realise assumptions as structured data:
- cynder.lean: 'h1 is actually cynder instance_of Character {past: dark} ... superseding h1';
- smoking.lean: closed-world inductives, the fact uptake .child = 90, and `structure Ethics`.
Under D-4 such facts drop out of every footprint, G6 calls the goal self-evident, and strict selection cannot see them. The Ramsey generator refuses structures over vocabulary. `axiom cynder : Character` over a user structure is rejected by r5's classifier and accepted by r2's only via instance search. The user is never offered a sound way to keep this style.
  - evidence: Evidence:
- ~/telelean_scripts/cynder.lean and smoking.lean.
- The r5 Ramsey.lean header: 'unsupported ... inductive types over vocabulary'.
- r5's classifier rejects data axioms of non-Init types as nonsignature.
  - fix: Offer an explicit pattern that preserves the footprint:
- `structure Character where past : String`, signed off;
- `noncomputable opaque cynder : Character`, with existence as an assumption per LS-1;
- the ASSUMPTION `axiom cynder_past : cynder.past = 'dark'`.
The panel can still show this as 'h1 is actually ...'. Extend the certificate and finite-model tooling to structures. Make this a ★ question for the user.
- **LS-14** [nit] doc 03 § §8.6 Inconsistent; 02 D-7
  - problem: 'The conflict set (the assumptions used in a proof of False)' is an inconsistent subset, not necessarily a minimal one.
  - fix: Call it 'an inconsistent subset'. Offer minimisation by deletion, re-checking with each member removed, to obtain a minimal unsatisfiable core.

## Strengths
- The trusted base is right: the kernel replay done by leanchecker and comparator sits under collectAxioms footprints, not #print axioms alone, and skipKernelTC is caught.
- Freezing via --challenge-from-export is correct. r2 showed that a live challenge misses tampering, and Compare.lean pins the whole statement closure, including defs and instances, by full ConstantInfo equality.
- The strict-selection mechanism works for direct use, verified: 'Illegal axiom detected: T.cynder_dark'. An axiom added after the freeze is rejected whichever way permitted_axioms is computed.
- D-2's sorry interplay with the comparator is sound: the challenge contains `by sorry`, and the solution must use legal axioms only.
- Good defaults: uninterpreted vocabulary first, closed-world encodings treated as a pragmatic question, autoImplicit=false, no Mathlib, sandboxed agent builds, and two-phase sign-off with an independent back-translation.
- Instance-typed axioms are handled correctly by both research classifiers, verified: Subsingleton -> proposition, Inhabited -> blocked, Decidable -> classically harmless.
- Ramsey or finite-model certificates suit the commonsense fragment well. A decide-checked Fin 2 countermodel needs only propext.

## Questions the docs should ask the user
- Should existence commitments ('there is a character called Cynder') be assumptions you select, or background signature that is always permitted?
- `sorry` asserts a goal via sorryAx, which lets other proofs use it. Do you still want it for formalised-but-unproved goals, or your S37 style `def/abbrev g : Prop := S` with the proof as `g.holds`?
- When an assumption is realised as a structure (cynder.lean's 'h1 is actually cynder instance_of Character {past: dark}'), should it still count as that assumption in footprints and selections?
- For 'PG games cannot have characters with dark pasts': does 'cannot have' mean 'may not include', in which case a bridge is needed, or 'is not a good fit for', in which case the goal follows? Should modal or generic sentences always trigger a question?
- Should goals without a consistency or non-vacuity certificate be shown as 'proved', or as 'proved (not checked for vacuity)' until a model is found?
- Do you want classical reasoning (Classical.choice in a footprint) flagged, or is classical logic the intended default?
- May model files contain your own notation or macros (as in kopiteh.lean)? They change what the sign-off view shows; if allowed, should sign-off always add a fully explicit rendering?
- Is it acceptable to forbid universe-polymorphic vocabulary (`Sort u`) entirely?
