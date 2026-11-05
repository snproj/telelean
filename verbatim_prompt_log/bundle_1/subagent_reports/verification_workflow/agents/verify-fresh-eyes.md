# verify-fresh-eyes

**Verdict:** needs-work

## Summary
Not ready to approve as written, but close. One short pass fixes it; no redesign is needed.

The revision did clear every stale item in the brief:
- no fourth Instruct position;
- no DEFINITION or DECISION markup kinds (decisions now live in a sidecar file, as a ★ choice);
- `theorem … := by sorry` survives only as rejected option (a);
- `type:` is canonical;
- one-shot is the default run protocol;
- refresh builds are sandboxed;
- the 'fully grounded' status is gone.

Checks that passed:
- The ★ summary table matches all 16 ★ headings.
- D-23's policy quotes match the saved byte-exact pages, apart from one paraphrase (FE-19).
- D-25's model facts are correct (`claude-opus-5-5` exists, its default effort is medium, Fable 5.1 exists).
- The §15 undo command matches exactly the disclosed 9,028 files (449.8 MB).
- Appendix A's 55 sentences are still verbatim, and every ID it cites is defined (re-checked by script).

Sentence traceability:
- S25, S26, S31, S39 and S40 are honoured.
- S4 is honoured, but D-16 changes what the switch marks without saying so (FE-08).
- S15 is narrowed: arrows into an ASSUMPTION are not kept (FE-07).
- S37: your own block shape would be rejected, because `id` is required (FE-06).
- S16 is only partly honoured: under D-2(b) there is no Lean text for A→D before a proof, A→G or D→G (FE-01).

Three major problems:
1. The kind-change gap above (FE-01).
2. The statement freeze has no trigger since `propose_formalization` was removed (FE-02).
3. M2, where real use starts, is described differently in 02 and 03, and its acceptance test needs M3 features (FE-03).

Several items that DISPOSITIONS.md marks as fixed are unchanged:
- the `/-` escaping rule, which is still a no-op (FE-04);
- the 03 §3.3 Lean example, which still fails on Lean 4.35.0 (FE-05);
- D-1's 'no axioms' criterion (FE-16);
- D-13's edge-stub rule (FE-15).

I compiled the example in /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/verify/Ex33.lean, /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/verify/Ex33b.lean and /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/verify/Ex33c.lean, calling the toolchain's `lean` binary directly. ~/.elan/known-projects is unchanged.

## Problems
- **FE-01** [major] 02_design_decisions.md; 03_architecture.md § 02 D-11, D-17 (drop zones), D-2(b); 03 §4 'Kind changes'
  - quote: 03 §4: "Kind changes touch only `n.holds`: - A→D: `axiom` becomes `theorem` (needs a proof; "claimed" until proved)." / 02 D-11: "Names and statements stay put, so dependents never break." / 02 D-17: "Make Derivation: claimed until proved; 7 results become conditional"
  - problem: D-2(b) allows no `sorry` anywhere, so a `theorem` cannot exist without a proof. Between the drag and a proof, A→D can only:
- delete `axiom n.holds`, after which every dependent that uses it stops compiling (r2 says so itself: 'Under scheme B their references to n.holds break'); or
- rewrite each dependent as `theorem d.holds (h : n) : d`, which touches far more than `n.holds` and cascades to their dependents.

The three quoted claims cannot all be true. A→G and D→G (S16's 'etc etc', and offered by drop zones on every column) remove `.holds` the same way, and 03 §4 does not list them at all. 'Results become conditional' is left over from the sorry-based first draft (HCI-9). It also bites at M1, which ships drop-zone kind changes with no AI to supply a proof. This is where S16 is not actually honoured.
  - fix: Pick one rule and state it in D-2, D-11, D-17 and 03 §4. Recommended:
- Never remove a `.holds` that dependents use until its replacement exists.
- A→D runs 'Prove from …' (or waits for your own proof at M1). The card shows 'promotion pending' until the gate passes, then `axiom` becomes `theorem`.
- A→G and D→G preview the dependents that will break and need confirmation, or offer the explicit-hypothesis rewrite, listed in the drop zone and undoable.
- Limit 'dependents never break' to D→A, G→D and G→A, add rows for A→G, D→G and G→A, and fix the drop-zone example text.
- **FE-02** [major] 03_architecture.md; 02_design_decisions.md § 03 §8.3 Agent tools, §8.4 run protocol; 02 D-19(b)
  - quote: 03 §8.4: "Formalise ⇄ ask_user ─▶ G0–G3 + vocabulary rules ─▶ automatic Freeze ─▶ Prove ⇄ check_lean" / 02 D-19: "The freeze still prevents Claude from weakening statements after seeing what is hard to prove."
  - problem: In the first draft (r5 steps 3–4) the freeze fired when the agent called `propose_formalization`. The revision removed that tool (03 §8.3 lists only check_lean, ask_user, propose_assumption, finish and certify) but kept the freeze. Nothing now defines when formalising ends.

Two things depend on that point: G4, which is in M2, and the pause-when-risky setting. Worse, if check_lean will check `.holds` proofs before the freeze, Claude can try proofs first and then write statements shaped to what it managed to prove. r5 names exactly this as the drawback of one-shot. So D-19's guarantee only holds after a freeze point that nobody defines.
  - fix: Add an explicit boundary tool, e.g. `freeze_statements({targets})`:
- refused until G0–G3 and the vocabulary rules pass;
- it triggers the leanexport freeze and, when the setting is on, the risky-item pause.

Until it is called, check_lean rejects any `.holds` or other theorem body. Say what re-freezes (ghost adoption, a feedback turn) and that frozen statements cannot change afterwards. Reword D-19(b) to match.
- **FE-03** [major] 02_design_decisions.md; 03_architecture.md § 02 D-29 vs 03 §11; 03 §10 'Good enough to start using'; 02 D-16, D-19, D-28
  - quote: 02 D-29 M2: "tools `check_lean`/`ask_user`/`finish`" vs 03 §11 M2: "tools `check_lean`/`ask_user`/`propose_assumption`/`finish`"; 03 §10: "*Literal* reading: countermodel, then ghost adopted, re-freeze, proved" and "the real-Claude walkthrough succeeds"
  - problem: What you get at M2 (where real use starts) is inconsistent:
1. Ghost assumptions: 03 puts propose_assumption in M2 but 'ghosts' in M3; 02 has neither in M2. Attempts history and the report card are listed only in 03.
2. The walkthrough's literal branch needs a countermodel (the model finder, M3 per D-6) and ghost adoption (M3). Yet M2's 'start using' test is that 'the real-Claude walkthrough succeeds', and 01 §3 says a correct run 'asks, or proposes a ghost ASSUMPTION'.
3. D-16 routes feedback to the 'Ask Claude…' composer, which both tables put in M3, while M2 promises Feedback.
4. runLean (the sandbox and memory cap) first appears in M2; M0 is only a spike. But M1 already runs `lake build` refreshes, which D-28 and 03 §5 say are 'sandboxed and memory-capped'. That matters given your RAM history.
5. Some actions have no milestone at all: D-18's Delete, rewording a node from the board, and adding a missing rationale from the board, although S42 has you working mostly in the board. G6 is unplaced too.
6. D-19's centrepiece, the review that shows meaning before proof status (alignment, gloss, back-translation), is M3. At M2 you judge statements from the overlay and raw diff, which is r5's 'fait accompli' risk. D-19 doesn't say this.
  - fix: - Make the two milestone tables identical.
- Add a 'What M2 does and does not do' note to D-29. Normative branch: proved, then G→D. Literal branch: 'not proved', plus a ghost (if propose_assumption stays in M2) or a prose gap with 'add your own premise'. Countermodels arrive in M3.
- Split the §10 walkthrough row into M2 and M3 variants.
- Move runLean and the MemAvailable check to M1.
- Put the composer (at least for feedback), Delete and editing text or rationale into M1–M2.
- Either add a minimal 'You said / Lean says' review with a pp.all toggle to M2, or state the M2 limitation in D-19.
- **FE-04** [minor] 02_design_decisions.md; 03_architecture.md § 02 D-8 'Escaping'; 03 §3.1 'Escaping, done by the serializer'
  - quote: 02: "(`-/` as `-\/`, `/-` as `/-`)"; 03: "In values, `-/` becomes `-\/` and `/-` becomes `/-`."
  - problem: The rule still maps `/-` to itself. A serializer built from this text would write a raw `/-` inside your sentence, which comments out the rest of the file (R4 ran this). DISPOSITIONS marks C9 and RT-13 'accepted: Escaping rule corrected', but the rule for values is unchanged. R4's verified rule is `/-`; the backslash escape was probably lost when the doc was written. Separately, raw-text values (the §3.3 style) cannot carry JSON escapes at all.
  - fix: Write: 'If a value contains `-/` or `/-` (or starts with `"`), the serializer writes it as a JSON string, with `-/` as `-\/` and `/-` as `/-`; in the body, `-\/` and `/\-`.' Check that the literal backslash-u survives in the saved file, and correct the C9/RT-13 rows in DISPOSITIONS.
- **FE-05** [minor] 03_architecture.md; 02_design_decisions.md § 03 §3.3 example; 02 D-8 example
  - quote: abbrev cynder_dark_past : Prop := HasDarkPast cynder … abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro
  - problem: The one concrete Lean example does not compile. Verified with Lean 4.35.0, autoImplicit off:
- 'Unknown identifier `HasDarkPast`' and 'Unknown identifier `GoodAddition`': the vocabulary is declared after it is used.
- After reordering: 'Unknown identifier `newSpyro`'.
- `noncomputable opaque newSpyro : Game` then fails ('failed to synthesize … Nonempty instance for Game'), because `Game.exists` is missing.

C13(f) flagged this, and DISPOSITIONS marks C13 accepted. Smaller problems in the examples:
- D-8's example is a formalised GOAL with neither the pinned `lean:` (D-8's own rule) nor the docstring mirror (D-9).
- The '-- blank line: code-less node' comment sits on the line that is meant to be blank, which blurs the binding rule.
- The `stance: rule` node still shows the 'no rationale yet' badge, though 01 §3 says the stance chip 'lets you say so'.
  - fix: - Order it as Vocabulary.lean then Main.lean, or label it as excerpts in import order.
- Add `axiom Game.exists : Nonempty Game`, its instance, `noncomputable opaque newSpyro : Game`, and the new-spyro-pg node (or drop it from `premises`).
- Add `lean:` and the docstring to D-8's example.
- Move the blank-line annotation into prose.
- Decide whether rule-stance nodes get the badge.
- **FE-06** [minor] 02_design_decisions.md; 03_architecture.md § 02 D-8 Fields; 03 §3.2
  - quote: `id` is required: a stable slug, transliterated, with `n-<hex>` as the fallback for non-Latin text.
  - problem: The block you wrote in S37 has no `id`, and S42 says you will also edit the files directly. The schema keeps `type:` 'as in your sketch' but would reject the sketch itself. The validator list doesn't say what a missing id produces.
  - fix: Require `id` in what telelean writes, but accept blocks without one: derive it from natural_name, write it back on the next board edit or through a one-click quick fix, and report an info diagnostic, never an error.
- **FE-07** [minor] 02_design_decisions.md § D-13
  - quote: An arrow **into an ASSUMPTION** means "I think this follows from that". It stores no premises and offers "Prove from …" (A→D).
  - problem: S15 says you 'must be able to draw arrows from any node in one section to a node in another section'. Since nothing is stored, an arrow into the Assumptions column vanishes once you decline 'Prove from …'. That narrows S15 without saying so.

Two things are also left unstated:
- What a second 'These suffice' press on the same goal, with a different selection, does to `premises:`: replace them or merge them into the stored 'joint support'?
- Arrows drawn from a port later silently join the same joint argument; alternative premise sets are deferred to D-34.
  - fix: Either keep the arrow (e.g. stored as declared support, with a TL info 'assumption has declared support: prove it?') or flag in the ★ text that it is transient. State that a new press replaces `premises:` and earlier sets stay in attempts.jsonl (or that alternatives wait for D-34). Put the within-column question in the ★ summary row.
- **FE-08** [minor] 02_design_decisions.md; 01_consolidated_idea.md § 02 D-16; 01 App. B (LLM-7) and App. E
  - quote: The prompt box has **exactly Assumption | Derivation | Goal**, as in S4. Submitting creates a comment-only node with your verbatim words. **No LLM is involved and no Lean is written**
  - problem: S4 says 'The prompts' are marked as creating an ASSUMPTION, DERIVATION or GOAL, and S3 says you change the model 'more commonly by prompting an AI'. D-16 says 'as in S4' but changes what the switch marks: the node you add, never a prompt to Claude. Requests that do reach Claude ('Ask Claude…') carry no A/D/G mark.

LLM-7 is a 'must' in App. B and is retired only in App. E, so a reader of D-16 doesn't see the change. App. D #4's 'formalise on create' alternative was dropped instead of being offered.
  - fix: Add one sentence to D-16: 'This reads S4's switch as marking the node a prompt creates; prompting the AI (S3) happens through "These suffice" and "Ask Claude…", whose requests are unmarked. If you meant marked prompts to go to Claude, choose the alternative: a "formalise on Add" toggle.' Mark LLM-7 as superseded in App. B itself.
- **FE-09** [minor] 02_design_decisions.md § Summary of the ★ decisions; 'How to respond'; D-3, D-13, D-20, D-23
  - quote: The quickest reply is "approve the ★ recommendations", plus any overrides by number. … | D-23 ★ | … One short smoke test, with your permission |
  - problem: The quick reply approves questions the summary table doesn't show:
- D-3's actual question is missing from its row: should the presuppositions of constants in the selected statements be included automatically? ('I recommend yes.')
- D-13's question is missing too: were within-column arrows meant to be excluded?
- D-23 bundles a technical choice, accepting a policy risk, and permission to spend your quota. It's unclear whether 'approve ★' grants the smoke test.
- 'Storage (★)' (D-20) and 'Smoke test (★)' (D-23) can't be overridden 'by number'.
- D-3's sentence 'Existence assumptions that are used but not named must be selected explicitly' is hard to parse.
  - fix: Put each embedded question and its recommendation in its row. Give the smoke test its own yes/no line (D-23b), and say that no answer means no. Number the sub-items (D-20a, D-20b). Reword D-3's sentence: '…used by the proof but not mentioned in the selected statements…'.
- **FE-10** [minor] 02_design_decisions.md § D-18 Refine / supersede (with D-4 and gate G5)
  - quote: h1 stays on the board, re-proved as a DERIVATION from its refinement and shown collapsed under it ("h1 ⇐ refined by …"). Dependents compile unchanged.
  - problem: With D-4's default vocabulary, h1 is `HasDarkPast cynder`, and `cynder.past = "dark"` does not entail it. Re-proving h1 needs one of two routes, and D-18 shows neither:
- Make Character a structure and redefine HasDarkPast over its field. That needs your endorsement (D-4), and it changes the closure hash of h1 and of every node mentioning Character or HasDarkPast. G5's formal-immutability check then rejects the run unless all of those nodes are in its change set.
- Add a bridge `∀ c, c.past = "dark" → HasDarkPast c`. That is a new assumption, which you must adopt as a ghost (D-6).
  - fix: Name the default route. Recommended: a bridge ghost that you adopt, leaving the vocabulary unchanged. State that a Refine run's change set covers h1 and its statement closure for G5.
- **FE-11** [minor] 03_architecture.md; 02_design_decisions.md § 03 §2 interface TlNode; 03 §3.2 Fields; 02 D-20 'Indexicals'
  - quote: source?: 'observed' | 'reported' | 'inferred' | 'common'; … source: { file: string; range: Range; markupVersion: number };
  - problem: The node interface for S34 declares `source` twice, which TypeScript rejects as a duplicate identifier; the evidential chip collides with the file location. D-20 promises that 'Each user node records the date it was asserted', but no markup field, TlNode property or sidecar holds that date.
  - fix: Rename one of them (e.g. `loc` for the file location). Add an `asserted` ISO-date field to 03 §3.2 and TlNode, written when the node is added.
- **FE-12** [minor] 03_architecture.md; 02_design_decisions.md; 01_consolidated_idea.md § 03 §15 disclosure; 02 D-28; 01 App. A2 (M2 row)
  - quote: This repository already contains 27 research Lake projects, including live exploit probes.
  - problem: The probes are ordinary .lean files in a bundle you are invited to read:
- research_workflow/artifacts/r5-agent-protocol/lean-exp/exploits/X/BuildIO.lean (`run_cmd … IO.FS.writeFile`);
- sbx-shadow/X/Escape.lean (reads $HOME, runs `getent hosts example.com`);
- r2 exp/E3_escape.lean and r1 lean-probe/Probe.lean (`#eval IO.FS.writeFile`).

Opening one in VS Code makes the Lean extension run it, unsandboxed. The payloads are harmless, but nothing warns you; D-28 only stops telelean from scanning the folder. Separately, App. A2 says subagent_reports/ holds the reviewers' 'evidence files', but review_workflow/ has none; they are still only in the session scratchpad.
  - fix: Rename the research probes to *.lean.txt (as 03 §1 does for test fixtures), or add a warning to 03 §15 and the subagent_reports README. Copy the reviewers' evidence in (made inert), or correct App. A2.
- **FE-13** [minor] 01_consolidated_idea.md; 03_architecture.md § 01 §3 first bullet vs 03 §15 last bullet
  - quote: 01: "Your sketch `~/telelean_scripts/cynder.lean`, which I only read because your Lean server had it open" / 03: "I read `~/telelean_scripts/*.lean` (read-only) to understand your formalisation style."
  - problem: The two docs disagree about which of your files outside the project were read. 02 D-4 and D-10 also draw on smoking.lean, bayonetta.lean and the other sketches, so 01 understates it.
  - fix: Use one accurate statement in both places: how the folder was found, that all five sketches were read (read-only), and why.
- **FE-14** [nit] 02_design_decisions.md; 03_architecture.md § 02 D-28, D-33; 03 §4, §6, §12
  - quote: "telelean: Enable in this workspace" / `telelean: Initialize model here` / **telelean: Initialize Model Here** / "`telelean init` offers `git init` for model folders."
  - problem: There are four names for opting in and scaffolding. `telelean init` is the M4 CLI, so D-33's offer to run git init doesn't exist at M1. The run directions in 03 §12 don't say whether Enable is needed before Initialize.
  - fix: Use one command name. Say what Enable does differently (e.g. adds `.telelean/` to an existing project without scaffolding), and attach the git-init offer to the Initialize command.
- **FE-15** [nit] 01_consolidated_idea.md; 02_design_decisions.md § 02 D-21, D-18, D-13; 01 App. D #11/#13/#18, App. C header, App. E, App. B
  - quote: "Accept is all-or-nothing in v1"; "Anti-goals (M3/v1.5)"; App. D #13 "a chevron or double-click to expand"; App. D #11 "Allow `sorry` only temporarily"; App. C "IC-16 → D-10/D-28 (subjects, opt-in roots, multi-root workspaces)"
  - problem: Leftovers that survived the revision:
- 'v1' and 'v1.5' predate the M0–M4 milestones.
- App. D #13's double-click contradicts D-17 ('There is no double-click action').
- App. E says #11 'Now matches' D-2(b), but #11 still allows temporary `sorry`.
- #18 ('core library plus a CLI') predates D-27, where scripts read graph.json now and the CLI comes in M4.
- Neither D-10 nor D-28 covers several workspace folders or no folder open, so App. C's IC-16 claim is unbacked.
- NFR-5, PROC-11 and PROC-12 are used but missing from App. B.
- D-13's 'Other edges become stubs' still contradicts 03 §7's 'An edge with one end hidden becomes a stub' (C13(b), marked accepted).
  - fix: Replace v1/v1.5 with milestone names. Add #11, #13 and #18 to App. E. Add a multi-root sentence to D-28 (one board per opted-in root; Open Board asks which) or drop the claim. Add the three IDs to App. B. Align D-13 with 03 §7.
- **FE-16** [nit] 02_design_decisions.md § D-1 Recommendation
  - quote: A witness proved with no axioms is exactly an instance of the bundle structure, i.e. a model (prototyped).
  - problem: As a criterion, this rejects valid witnesses: a `decide`-checked Fin 2 countermodel depends on propext. LS-10(d) raised this; it is marked accepted but was not applied.
  - fix: Say 'proved using at most propext, Quot.sound and Classical.choice'.
- **FE-17** [nit] 03_architecture.md § §3.4 TL104 (with §2 'Building the graph' step 4 and §3.3)
  - quote: **TL104** a Prop axiom with no block (hidden assumption).
  - problem: Presupposition axioms such as `axiom Character.exists : Nonempty Character` are Prop axioms without a block by design, so TL104 fires on every one.
  - fix: Exempt the recognised presupposition form (`T.exists : Nonempty T` for a vocabulary sort T) from TL104.
- **FE-18** [nit] 02_design_decisions.md § D-6 Ghost assumptions vs D-15
  - quote: D-6: "Candidate premises appear as dashed ghost nodes" / D-15: "Line pattern is reserved for epistemic status in every mode: dashed means declared, solid means verified."
  - problem: Ghosts are Claude's suggestions, not your declarations, so drawing them dashed brings back the overloaded dashing that the HCI review (HCI-11) had removed.
  - fix: Give ghosts their own cue (translucent, with a 'Claude suggests' marker), or define dashed in D-15 as 'not verified / not adopted'.
- **FE-19** [nit] 02_design_decisions.md § D-23 'Our reading'
  - quote: and "an end user signing in to the unmodified Claude Code binary"
  - problem: The saved legal page reads 'an end user from signing in to the unmodified Claude Code binary'. This is a paraphrase in quotation marks, in a section billed as byte-exact. The other D-23 quotes match the saved sources.
  - fix: Quote it exactly, or drop the quotation marks.
