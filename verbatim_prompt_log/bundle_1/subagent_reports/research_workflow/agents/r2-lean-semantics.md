# r2-lean-semantics: R2: Lean 4 (4.35.0) semantics and machine-checking for ASSUMPTION / DERIVATION / GOAL nodes in the telelean mental-model extension

## Summary
All experiments ran locally on Lean 4.35.0 / Lake 5.0.0, with every project pinned to leanprover/lean4:v4.35.0 and no Mathlib. Files are under /tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/research/r2-lean-semantics/ (abbreviated $R2 below; it always means this absolute path). The harness blocked writing REPORT.md, so this structured output is the report. It is self-contained, and the experiment files are listed in the findings.

Assumptions should be global `axiom`s. This is the only encoding where Lean itself reports exactly which assumptions a derivation uses, transitively: `#print axioms` / `Lean.collectAxioms`. Changing a node's kind is a local edit (`axiom n : S` ↔ `theorem n : S := p`), and dependents compile unchanged.
- Structures/classes give consistency as "construct an instance", but dependency tracking then needs custom code.
- Section variables are not included when used only in a proof body (an error on 4.35). Kind changes alter every dependent's arity.
- `opaque` is conservative, so it suits vocabulary only.

Goals and unproved derivations should be a Prop-valued `abbrev` (no sorry), with the proof as a separate `theorem n.holds`. A uniform scheme fits all kinds: `abbrev n : Prop := S` plus `axiom n.holds` for an assumption, `theorem n.holds` for a derivation, nothing for a goal. Node status then follows mechanically: informal → formalized → assumed/proved, plus error flags.

Anti-cheating is mostly solved by tools bundled with 4.35.
- `#print axioms` catches sorry/admit, new axioms, and debug.byAsSorry/proofAsSorry.
- It also catches native_decide and bv_decide. In 4.35 these add a per-use axiom `<decl>._native.native_decide.ax_N_M`; Lean.ofReduceBool and Lean.trustCompiler were removed (#14953).
- It does NOT catch a kernel bypass via `set_option debug.skipKernelTC true` plus a metaprogram: the axiom list stays empty.
- `leanchecker` (about 1.5 s) catches that bypass. So does the new `lake comparator`, which runs in a bwrap sandbox. It checks that the solution's theorems have the same statements as a frozen challenge, comparing the transitive closure of each statement's dependencies. It also checks that only explicitly permitted axioms are used (the user's assumptions can be listed) and replays the export through the kernel. Every cheat I tried was rejected in about 3 s.
- Freeze the approved state with `leanexport` and pass `--challenge-from-export`. Without that, tampering with a shared assumption file went undetected; with it, it was rejected.
- LLM-written Lean executes at build time (`#eval` wrote a file during `lean`), so a pre-build denylist or a sandbox is needed.
- Misleading `notation` fools the pretty-printer, and the default `autoImplicit=true` silently turns typos into quantified variables.

Extraction is cheap and robust. A compiled `lake exe` extractor emits JSON per declaration in about 0.5 s for the toy project (kind, type, alpha-invariant hash, docstring, range, direct dependencies, axioms, sorry flags, axiom classification). `lake build` costs about 0.35–0.45 s per file; the module system limits rebuilds after proof, comment or docstring edits to the edited file only. Files that don't compile can still be elaborated in-process to get a partial environment.

Markup and setup:
- Put metadata in plain `/- @@ telelean -/` comments, which Lean never parses. A dangling `/--` docstring is a parse error, and raw YAML inside a docstring breaks under `doc.verso`.
- A Lean-native attribute/environment-extension markup works (prototyped), but needs a Lake dependency and yields nothing when a file fails to compile. Keep it optional.
- Use lakefile.toml, an exact toolchain pin, and autoImplicit=false. Make Mathlib optional and off by default.
- Consistency of assumptions can be certified by a generated ∃-statement whose proof is a model (prototyped).

Side effects outside my scratch dir:
- An accidental `lake new … math-lax` downloaded about 450 MB (9,028 .ltar files) into ~/.cache/mathlib. Not deleted. Undo: `find ~/.cache/mathlib -maxdepth 1 -type f -newermt '2026-11-01 01:32' -delete`.
- elan appended 8 scratch-path lines to ~/.elan/known-projects.

No toolchain was installed.

## Recommendations
- **How to encode ASSUMPTION nodes** → Use global `axiom`s. Canonical uniform scheme B: `abbrev n : Prop := S` (statement) plus `axiom n.holds : n` (justification). Scheme A (`axiom n : S`) is acceptable if the user prefers raw-Lean readability. Keep the WHY annotation and natural-language text in the docstring and markup.
  - rationale: This is the only encoding where Lean itself (collectAxioms / #print axioms) reports exactly which assumptions each derivation uses, transitively. Kind changes are local edits with stable names and types, so dependents compile unchanged (verified in E16). It is also the most natural style for LLMs and the most readable.
  - alternatives: Structure/class bundle: built-in consistency via an instance, but dependency tracking needs custom code and everything is written W.x; use it only as a generated artifact. Section variables: body-only use errors on 4.35, and kind changes alter arities. opaque: conservative, vocabulary only.
- **How to encode GOALs and unproved DERIVATIONs without sorry** → Statement-only nodes are `abbrev n : Prop := S`. A proof is added as `theorem n.holds : n := …`. A goal becomes a derivation when n.holds exists and passes the checks. Instruct the LLM to start proofs with `show S`/`unfold n`, or to include statement names in simp sets. Optionally mark statement abbrevs @[simp] (untested).
  - rationale: No sorryAx appears, and the statement is type-checked. abbrev is reducible, so decide, intro, apply, rw, grind and omega see through it (verified). The statement constant never changes when its kind changes, which makes fingerprinting and comparator locks stable.
  - alternatives: `theorem n : S := sorry`: the user rejected this, and it pollutes axiom checks. A plain `def`: decide fails through it, and under the module system it is not unfoldable without @[expose].
- **Node status lattice and detection** → States:
- L0 informal: markup only (from source text).
- L1 formalized: the statement elaborates with no sorryAx or synthetic sorry.
- L2a assumed: n.holds is an axiom; legal only for ASSUMPTION.
- L2b proved: n.holds is a kernel-checked theorem, without sorryAx, whose collectAxioms ⊆ std ∪ Allowed(n).
Allowed(n) = the selected assumptions plus approved SUPPORT axioms when produced by the 'these suffice' button; otherwise all assumptions plus support.
Orthogonal flags: broken, sorry, illegal-axiom, kernel-rejected, statement-changed, depends-on-broken, stale, no-consistency-certificate.
  - rationale: Every state is computable from the extractor JSON (isStatementDef, kind, axioms, usesSorry, syntheticSorry), diagnostics, and leanchecker/comparator results. The prototype #telelean_status already prints these states.
  - alternatives: Trusting the LLM's claims, or using only the warning text 'declaration uses sorry'. That warning is not transitive, so it misses dependents of sorried lemmas.
- **How to classify and display vocabulary/support declarations** → Allow `axiom` (or `opaque`) for uninterpreted types, predicates and constants. Classify by type shape with the extractor's classifyAxiom: proposition, type-former, constant-of-uninterpreted-type (badge 'asserts existence'), constant-of-inhabited-type, data-suspicious. Conservative definitions (def/abbrev/structure/inductive) are marked 'defined'. Block data-suspicious axioms, and any proposition axiom not attached to an ASSUMPTION node. LLM-introduced vocabulary appears in the diff and requires approval.
  - rationale: `axiom Cynder : Character` is an existence commitment, which is substantive together with Prop assumptions. `axiom e : Empty` or `PLift (1=2)` is inconsistent or smuggles a proposition. The classifier detects these (verified on Sus.lean).
  - alternatives: Use opaque everywhere for vocabulary. That gives cleaner #print axioms, but constants need the NonemptyType pattern or an explicit Nonempty axiom plus noncomputable.
- **Anti-cheating pipeline for LLM proposals** → 1. TypeScript pre-scan of changed files, with a comment/string-aware lexer. Deny #eval, #exit, run_cmd, run_tac, elab, elab_rules, macro, macro_rules, syntax, declare_syntax_cat, initialize, import Lean (or any non-project import), set_option debug.*, implemented_by, extern, unsafe, native_decide, +native, bv_decide. Allow notation only after review.
2. Run `lake build`, ideally in bwrap.
3. Run the extractor and apply JSON policy: an unfiltered axiom inventory, a per-node Allowed set, sorry flags, statement fingerprints, implementedBy/extern/unsafe flags.
4. Run `lake env leanchecker <Lib>` (about 1.3 s).
5. To accept a goal proof, run `lake comparator --challenge-from-export=.telelean/approved.ndjson` with permitted_axioms = std + the selected assumption justifications + approved support axioms (about 3 s); optionally add --paranoid.
6. Show statements both with and without notation (pp.notation false).
  - rationale: #print axioms misses kernel bypass (skipKernelTC); leanchecker and comparator catch it. Comparator compares the statement closure exactly, so redefinitions and changed statements are caught. The frozen export stops tampering with shared files. The pre-scan stops build-time code execution.
  - alternatives: #print axioms alone is insufficient. `lake check` rejects all user axioms and takes 144 s. pp-string comparison of statements is fooled by binder names and notation.
- **How to detect changed goal or assumption statements** → For acceptance, use comparator's exact comparison against a frozen export. For live change highlighting, use Expr.hash of the elaborated type plus the hashes of every non-proof constant reachable from it (definition values, axiom types, constructors). Invalidate stored fingerprints on toolchain change.
  - rationale: Expr.hash and == are alpha-invariant and stable across processes (verified). A closure is needed because redefining vocabulary changes meaning without changing the goal's own Expr. Definitional reformulations count as changes, which is good for review.
  - alternatives: Pretty-printed strings: they vary with binder names and notation. pp.all strings: they vary with binder names.
- **How the extension gets Lean semantic data** → Ship a small Lean tool package matched to the toolchain:
- a compiled `telelean-extract` exe (importModules plus MetaM, JSON out, about 0.5 s);
- a frontend mode (Parser.parseHeader → processHeader → IO.processCommands) for files that fail to build, which yields a partial environment.
Get diagnostics with `lake lean <file> -- --json`, which applies lakefile leanOptions (`lake env lean` does not). Columns are codepoints, so convert to UTF-16. Later, consider a long-lived helper that keeps the environment loaded and answers JSON-RPC queries; this is where graph-analysis services or LSP-like features could live.
  - rationale: Measured: build about 0.35–0.45 s per file, extraction 0.45–0.6 s, frontend elaboration 0.7 s. All data needed for nodes, edges, status and anti-cheat flags is available.
  - alternatives: `lean --run Extract.lean` (about 3 s per run, no compile step). Querying the Lean language server via custom RPC (requires the Lean-side package and widget plumbing).
- **Markup carrier for node metadata** → Put metadata in a plain `/- @@ telelean ... -/` comment directly above the declaration (or above its docstring). Include an explicit `lean: <Decl.Name>` link and a stable `id`. Put the natural-language text in the `/-- -/` docstring. Code-less nodes are plain comments only, never `/--`. If metadata must go in a docstring, use a fenced code block.
  - rationale: Plain comments are never parsed by Lean: they work when files don't compile, have no code, or use doc.verso. A dangling docstring is a parse error. Raw YAML in a docstring breaks under doc.verso (verified). Docstrings reach the .olean for hovers and the extractor. Decl ranges start at the docstring, so blocks can be matched by position.
  - alternatives: Metadata inside docstrings (Markdown mode only). A Lean-native attribute or command (requires a dependency; nothing when broken).
- **Whether to adopt Lean-native markup (attribute plus environment extension)** → Not as the source of truth. Optionally provide the Telelean Lean package for #telelean_status, consistency-statement generation and the extractor. Keep comments authoritative.
  - rationale: The prototype works (verified), but it needs a Lake dependency per project and toolchain, gives no data for files that fail to compile, and parse errors in attributes break declarations.
  - alternatives: Comment-only (recommended); attribute-only (rejected).
- **Guarding against inconsistent assumptions** → Generate a consistency statement (∃ over the abstracted axioms, with defs delta-expanded), per goal over the axioms in collectAxioms(goal.holds) or over the whole model. Ask the LLM or user for a model proof. Accept it only if its axioms ⊆ {propext, Classical.choice, Quot.sound}. Show 'no consistency certificate' as a warning on proved goals. Also run a cheap LLM red-team pass ('derive False from these').
  - rationale: Lean cannot decide consistency. A model is a sound certificate. Constant interpretations (Unit types, True/False predicates) usually suffice for commonsense models. grind failed to refute an obviously inconsistent set, so automation is only a heuristic.
  - alternatives: Use the structure encoding everywhere (verbose, and dependency tracking needs custom code). Ignore the issue (proofs may be vacuous).
- **Lake project scaffold for a fresh workspace** → Use lakefile.toml with `[leanOptions] autoImplicit = false, relaxedAutoImplicit = false` and a single [[lean_lib]] MentalModel. Set lean-toolchain to the exact `leanprover/lean4:v4.35.0`, never `stable`. Add a root MentalModel.lean maintained by the extension, topic-based model files (kind is metadata, not file location), a .telelean/ folder for approved exports and fingerprints, and a .gitignore containing /.lake. Run one `lake build` to create lake-manifest.json, which comparator and check need. Optionally use the module system with the header `module` / `public import ...` / `@[expose] public section`.
  - rationale: TOML is declarative and editable from TypeScript, and 0.55 s faster per Lake call. The exact pin avoids elan downloads and Mathlib mismatches. autoImplicit=false stops typos silently becoming quantified variables. The module system confines rebuilds after proof, comment or docstring edits to the edited file (verified). Kind-based files would force declaration moves and import fixes on every promote or demote.
  - alternatives: lakefile.lean (slower, executes code). Files per kind (bad for promote/demote). No module system (simpler for LLM output; slower incremental builds).
- **Mathlib** → Optional and off by default. Provide an explicit 'Enable Mathlib' action: add `[[require]] name="mathlib" scope="leanprover-community" rev="v<lean version>"`, then run lake update and `lake exe cache get` with progress UI and a disk-space warning. Be aware that Mathlib's post_update hook auto-downloads the cache unless MATHLIB_NO_CACHE_ON_UPDATE=1.
  - rationale: Mental models mostly need uninterpreted vocabulary. Core has simp, simp_all, omega, decide, grind and exact?. Mathlib costs about 6.8 GB on disk plus about 450 MB of user-wide cache (verified), and per-file import time and RAM are significant (not measured).
  - alternatives: Always include Mathlib (heavy). Never support it (blocks quantitative models: reals, probability, orders; and tactics such as tauto).
- **Sandboxing builds of LLM-written Lean** → Run the extension's builds of unaccepted proposals inside bwrap: comparator already does this, and /usr/bin/bwrap 0.9.0 works here. Write proposals to a shadow copy or worktree so the Lean language server doesn't elaborate them in the user's editor before the pre-scan passes.
  - rationale: #eval/run_cmd/initialize execute arbitrary IO during elaboration (verified file write).
  - alternatives: Denylist pre-scan only (weaker). No protection (unsafe).

## Design decisions for user
- **Q:** Uniform 'statement + justification' Lean encoding (abbrev n : Prop := S plus axiom/theorem n.holds), or the direct encoding (axiom n : S / theorem n : S := p / abbrev for goals)?
  - why: The uniform scheme gives stable names and statements across every kind change (assumption/derivation/goal), clean statement locks, and goals without sorry. The direct scheme reads more naturally in raw Lean, but changing a goal's kind changes what the name denotes (a Prop vs a proof).
  - options: A) direct; B) uniform abbrev+holds; C) direct for assumptions/derivations and abbrev+holds only for goals
  - recommended: Uniform scheme B, with the extension hiding the boilerplate (users mostly work in the panel).
- **Q:** When the user presses 'these assumptions suffice to prove this goal', must the proof use ONLY the selected assumptions, or any declared assumption?
  - why: It sets the per-node Allowed axiom set used by the extractor policy and by comparator's permitted_axioms. The strict version matches the button's meaning ('I assert these suffice') and reveals hidden dependencies.
  - options: strict-selected; any-declared; strict with an explicit 'also used' disclosure
  - recommended: Strict: selected assumptions + approved vocabulary + propext/Classical.choice/Quot.sound. If the proof needs more, the LLM must say so and propose them as new ASSUMPTION nodes.
- **Q:** Should the LLM be allowed to introduce new vocabulary axioms (e.g. axiom Cynder : Character, a predicate isCharacter) as part of a proof diff?
  - why: Constants of uninterpreted types are existence commitments, which are substantive together with assumptions. Type formers and predicates are harmless. Comparator rejects any axiom not in permitted_axioms, so new vocabulary has to be approved (added to the challenge) first, or be a definition.
  - options: auto-accept type formers and predicates and require approval for constants; require approval for all; forbid (force definitions)
  - recommended: Allowed, but every new vocabulary item appears as a SUPPORT node in the diff and needs acceptance. Existence-commitment constants get a badge. Proposition-typed or data-suspicious axioms are always blocked unless explicitly turned into ASSUMPTION nodes.
- **Q:** Should a goal count as 'proved' only when its used assumptions also have a consistency certificate (a model)?
  - why: With axioms, inconsistent assumptions make every goal provable vacuously. A certificate costs an extra LLM step but makes the 'proved' state trustworthy.
  - options: require certificate; warn only; ignore
  - recommended: Do not block. Show a 'no consistency certificate' warning on proved goals and offer a one-click 'find a model' LLM action. Run a cheap red-team 'derive False' check after assumptions change.
- **Q:** Enable Lean's module system (module + @[expose] public section) in new workspaces?
  - why: Edits to proofs, comments and docstrings then rebuild only the edited file, versus all dependents in plain mode (measured 0.5 s vs 1.6 s for 3 files; the gap grows with model size). The cost is a 3-line header convention the LLM must follow, and confusing 'cannot unfold' errors if @[expose] is forgotten.
  - options: off; on; on for large models only
  - recommended: Start without it for the MVP. Make it a workspace option, and switch it on by default once the LLM prompts are tuned.
- **Q:** Mathlib: optional and off by default, or always on?
  - why: Mathlib adds about 6.8 GB on disk, about 450 MB of user-wide cache, and seconds of import time per check. Commonsense models rarely need it, but quantitative ones (ages, probabilities, orders) benefit.
  - options: off by default; on by default; never
  - recommended: Optional, off by default, behind an explicit 'Enable Mathlib' action.
- **Q:** May model files contain notation, macros or metaprograms (elab/#eval/import Lean)?
  - why: Notation can disguise statements in every pretty-printed view. Metaprograms run arbitrary code at build time and can bypass the kernel with debug.skipKernelTC.
  - options: forbid all; allow notation only; allow everything with sandboxed builds
  - recommended: Forbid them in LLM output (pre-scan denylist). User-written notation can be allowed after an explicit opt-in, and the review UI always offers a pp.notation false view.

## Software needed
- Lean 4 toolchain via elan leanprover/lean4:v4.35.0 (already installed; elan 4.2.3) — Elaboration, kernel checking and #print axioms. The extractor is written against 4.35 APIs. — install: Already installed. Pin projects with lean-toolchain = leanprover/lean4:v4.35.0. — required=True
- Lake 5.0.0 (bundled with 4.35.0) — Builds; `lake lean <file> -- --json` diagnostics; `lake comparator` for statement-locked, axiom-whitelisted acceptance of LLM proofs; `lake env leanchecker`. — install: Bundled with the toolchain. — required=True
- leanchecker / leanexport (lean4export 3.1.0) bundled with 4.35.0 — Kernel replay to detect environment hacking; freezing approved challenge exports (NDJSON). — install: Bundled in ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin. — required=True
- bubblewrap (bwrap) 0.9.0 (already at /usr/bin/bwrap; works with unprivileged user namespaces here) — Sandbox required by `lake comparator` / `lake check`; also usable to sandbox the extension's own builds of LLM output. — install: Already installed. COMPARATOR_BWRAP overrides the path. — required=True
- External kernels lean4lean, nanoda_bin, con-leche, con-ron, leanchecker-paranoid bundled with 4.35.0 — Optional extra assurance through `lake comparator --paranoid`. — install: Bundled. — required=False
- Mathlib tag v4.35.0 (commit 56a005855ea17e0b0958f73ec801ae140b0a1679) — Optional: quantitative or mathematical modeling and extra tactics (tauto etc.). — install: Add [[require]] name="mathlib" scope="leanprover-community" rev="v4.35.0" to lakefile.toml, then lake update and lake exe cache get (about 6.8 GB plus about 450 MB in ~/.cache/mathlib). Only on explicit user request. — required=False
- telelean Lean tool package (to be written; prototypes at $R2/mm/Extract.lean and $R2/telelean-lean) matched to the pinned toolchain — JSON extractor exe, frontend extraction for broken files, consistency-statement generator, optional #telelean_status. — install: Build with lake inside the extension's storage, or as a path dependency. The compiled exe is about 231 MB. — required=True

## Risks
- Accidental side effects already happened: about 450 MB (9,028 files) were added to ~/.cache/mathlib by Mathlib's post_update hook, and 8 lines were added to ~/.elan/known-projects. Undo commands are in the findings; I did not delete anything outside scratch.
- LLM-written Lean is executable at build and edit time (#eval, run_cmd, macros, initialize). Building or opening unaccepted proposals without a pre-scan or sandbox gives the LLM arbitrary code execution, including via the lean4 VS Code extension's server.
- #print axioms alone misses kernel bypass (debug.skipKernelTC + metaprogram). leanchecker or comparator must be part of the acceptance path.
- Without a frozen challenge export, comparator cannot detect tampering with shared vocabulary or assumption files: both sides import the same tampered file (verified).
- Misleading notation changes what the pretty-printer shows everywhere. Statement review must offer a pp.notation false view, or notation must be forbidden in LLM output.
- The default autoImplicit=true turns typos into universally quantified statements. Projects must set autoImplicit=false, and tools must use lake lean or lake build (not lake env lean), which ignores lakefile leanOptions.
- Inconsistent assumptions make every derivation vacuously provable. Model certificates mitigate this but take effort, and automation such as grind is unreliable at finding contradictions.
- Formalization faithfulness (does the Lean statement mean the user's sentence?) cannot be checked mechanically. It needs human review, ideally helped by back-translation.
- doc.verso is opt-in today but used widely in Lean core. Any design that puts raw YAML in docstrings would break if it becomes the default.
- Lean API drift: the extractor hit several renames on 4.35 (getReducibilityStatus monadic, ModuleIdx = Nat, levelZero deprecated, ofReduceBool removed). The extractor must be versioned per toolchain, and upgrades need testing.
- Expr.hash is 32-bit, non-cryptographic and Lean-version-specific. Use it for change highlighting only, not as a security boundary.
- Module system: plain defs are not unfoldable downstream unless exposed. An LLM forgetting the `@[expose] public section` header produces confusing errors.
- The compiled extractor binary is large (231 MB) and toolchain-specific. Distributing or building it per toolchain is a packaging concern.
- Performance with Mathlib (import time, RAM per extraction and build process) is unmeasured.

## Open questions
- Where should frozen 'approved' challenge exports live: in the workspace (.telelean/approved.ndjson, about 1 MB each), or regenerated from a git commit of the approved state? This depends on whether the extension manages git for the user.
- Ship the Lean tool package (extractor, consistency generator) as a prebuilt per-toolchain binary in extension storage (231 MB), build it on first use (about 4 s), or fall back to `lean --run` (about 3 s per call)?
- Should the long-lived Lean helper process (environment kept loaded, incremental re-elaboration, JSON-RPC) also be the backend for the user's question about an LSP for the markup? That decision belongs to the architecture agents. From the Lean side, all data needed is available through the extractor APIs listed here.
- How should the panel present 'depends on broken/unproved node' for derivations whose supporting goal was demoted? Under scheme B their references to n.holds break, which is semantically correct.
- Is per-goal consistency (only the axioms the proof uses) sufficient for the user, or do they want whole-model consistency?
- The user has existing Lean files open in VS Code at ~/telelean_scripts/ (cynder.lean, bank.lean, bayonetta.lean, smoking.lean; seen in the process list, not read). Design agents may want to ask whether these reflect the intended formalization style.
- Mathlib import cost (time and RAM per extraction and build) was not measured, to avoid another download. Measure it if Mathlib support is prioritized.

## Findings
- [verified-locally] Global axioms give exact, transitive per-assumption dependency tracking via #print axioms / Lean.collectAxioms.
  - evidence: Test file $R2/exp/E1_axioms.lean (0.43 s). Setup: vocabulary axioms (Character, Game, Cynder, newSpyro, HasDarkPast, IsPG, GoodAddition) and assumptions (cynder_dark, spyro_pg, pg_no_dark, unused_assumption), then `theorem cynder_not_good : ¬ GoodAddition Cynder newSpyro := pg_no_dark _ _ spyro_pg cynder_dark`.
- `#print axioms cynder_not_good` → `'cynder_not_good' depends on axioms: [Character, Cynder, Game, GoodAddition, HasDarkPast, IsPG, cynder_dark, newSpyro, pg_no_dark, spyro_pg]`.
- A theorem using it through an intermediate lemma plus `unused_assumption` lists exactly those axioms plus `unused_assumption`.
- Signature (vocabulary) axioms also appear, so the tool must classify them (see the vocabulary-classification finding).
  - source: $R2/exp/E1_axioms.lean; API Lean.collectAxioms in ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/Lean/Util/CollectAxioms.lean
- [verified-locally] How the standard axioms and sorryAx appear in #print axioms on 4.35.
  - evidence: From $R2/exp/E1_axioms.lean:
- Classical.em → [propext, Classical.choice, Quot.sound]
- funext → [Quot.sound]
- propext → [propext]
- `by decide` and `rfl` → does not depend on any axioms
- `by simp` → [propext]
- `by omega` → [propext, Quot.sound]
- `by grind` → adds propext, Classical.choice, Quot.sound (E14)
- `sorry`, `by admit`, or a lemma that uses a sorried lemma → [..., sorryAx]. The 'declaration uses sorry' warning appears only at the direct use; #print axioms reports it transitively.
  - source: $R2/exp/E1_axioms.lean, $R2/exp/E14_tactics.lean
- [documented] In 4.35 collectAxioms reads the kernel-checked environment (env.checked) and uses a per-module precomputed extension (exportedAxiomsExt) for imported constants, so collection never crosses module boundaries.
  - evidence: Source comments in CollectAxioms.lean: 'Take constants from the kernel env' (env.checked.get.find?). exportedAxiomsExt is computed by exportEntriesFnEx when the .olean is written. The order of the result is sorted within a module but can differ across modules (one #print axioms listed sorryAx first).
  - source: ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/Lean/Util/CollectAxioms.lean
- [verified-locally] Structure/class-bundled assumptions: consistency = constructing an instance (a model), but #print axioms reports nothing, so dependency tracking needs custom projection analysis.
  - evidence: $R2/exp/E4_structure.lean:
- `structure World where Character : Type ... cynder_dark : HasDarkPast Cynder ...` with `theorem World.cynder_not_good (W : World) ...` → 'does not depend on any axioms'.
- `def World.model : World where Character := Unit ... GoodAddition _ _ := False ...` → no axioms (a model).
- A custom transitive projection analysis ($R2/exp/E4b_structure_deps.lean) printed `World.goal uses fields: [World.Cynder, World.dark_villain, World.IsVillain, World.cynder_dark]`.
- `variable [Assumptions]` is auto-included even when not mentioned: `@t1 : ∀ [Assumptions], HasDarkPast Cynder`.
  - source: $R2/exp/E4_structure.lean, $R2/exp/E4b_structure_deps.lean
- [verified-locally] Section variables on 4.35: a hypothesis used only in a theorem's proof body is not included (error). `include` is required, and defs still include body-mentioned variables.
  - evidence: $R2/exp/E5_variables.lean:
- Body-only use: `error(lean.unknownIdentifier): Unknown identifier `pg_no_dark``.
- `include cynder_dark spyro_pg pg_no_dark in theorem goal_b ...` makes them explicit arguments: goal_b : ∀ (Character Game : Type) ..., HasDarkPast Cynder → IsPG newSpyro → (∀ g c, ...) → ¬GoodAddition Cynder newSpyro.
- A def includes the variables used in its body.
- An unused `include` triggers linter.unusedSectionVars.
- The rule was introduced in Lean 4.11.0.
  - source: $R2/exp/E5_variables.lean; https://blog.lean-lang.org/blog/2024-9-1-lean-4110
- [verified-locally] `opaque` gives conservative uninterpreted vocabulary (no axioms), but a constant of an uninterpreted type needs a Nonempty instance. A data axiom of an empty type is inconsistent.
  - evidence: $R2/exp/E6_opaque.lean:
- `opaque Character : Type` and `opaque HasDarkPast : Character → Prop` → no axioms.
- `opaque Cynder : Character` → error: failed to synthesize 'Inhabited' or 'Nonempty' instance for Character.
- The NonemptyType pattern needs `noncomputable opaque` and then depends on [Classical.choice].
- An explicit `axiom Character.nonempty : Nonempty Character` gives Cynder' axioms [Character.nonempty, Classical.choice].
- Opaque values never unfold (rfl fails; decide stuck at five.beq 5).
- `opaque cheat : False` is rejected.
- `axiom bad : Empty` then `theorem f : False := nomatch bad` → [bad].
  - source: $R2/exp/E6_opaque.lean
- [verified-locally] With the axiom encoding, promoting an assumption to a derivation is a local edit: dependents compile unchanged and their axiom sets update.
  - evidence: $R2/exp/E16_kind_before.lean → E16_kind_after.lean: replaced `axiom spyro_pg : IsPG newSpyro` with `theorem spyro_pg : IsPG newSpyro := all_spyro_pg _ spyro_is_spyro`. The dependent `uses_pg` was textually unchanged.
- before: 'uses_pg' depends on axioms: [Game, IsPG, newSpyro, spyro_pg]
- after: [Game, IsPG, IsSpyroGame, all_spyro_pg, newSpyro, spyro_is_spyro]
  - source: $R2/exp/E16_kind_before.lean, $R2/exp/E16_kind_after.lean
- [verified-locally] A GOAL or unproved DERIVATION can be formalized without sorry as a Prop-valued abbrev. The proof is a separate theorem whose type is the abbrev. Use abbrev rather than def because `decide` cannot see through a plain def.
  - evidence: $R2/exp/E7_goals.lean:
- `def goal_cynder : Prop := ¬ GoodAddition Cynder newSpyro` → axioms [Character, Cynder, Game, GoodAddition, newSpyro] (no sorryAx).
- `theorem goal_cynder.holds : goal_cynder := pg_no_dark _ _ spyro_pg cynder_dark` works.
- Through a def: term mode, intro, `rw [eqD.holds]` and exact-by-defeq all work, but `by decide` → 'failed to synthesize Decidable eqD'. It works for abbrev.
  - source: $R2/exp/E7_goals.lean
- [verified-locally] Uniform scheme (statement `abbrev n : Prop := S` plus `axiom|theorem n.holds : n`) works with common tactics. The one friction point is simp/simp_all on abbrev'd goals or hypotheses.
  - evidence: $R2/exp/E17_uniform.lean and E17b.lean:
- These succeed: term application, apply, intro, `grind [x.holds..]`, `rw [eq.holds]`, `simp [eq.holds]`, `have := h.holds; omega`.
- `simp [pg_no_dark.holds, spyro_pg.holds, cynder_dark.holds]` on goal `cynder_not_good` → 'simp made no progress'. `simp_all` with abbrev'd hypotheses → 'simp_all made no progress'.
- Workarounds that succeed: `simp [cynder_not_good, pg_no_dark.holds, ...]`, or `simp only [stmt names] at *` followed by exact.
- Abbrev-typed lemmas work fine as simp lemmas on an unfolded goal.
- Output: 'cynder_not_good.holds' depends on axioms [..., cynder_dark.holds, pg_no_dark.holds, spyro_pg.holds].
  - source: $R2/exp/E17_uniform.lean, $R2/exp/E17b.lean
- [verified-locally] A declaration with an elaboration error is still added to the environment with a synthetic sorry. Expr.hasSyntheticSorry distinguishes it from an explicit sorry and from a dependent of a broken node.
  - evidence: $R2/exp/E7_goals.lean: `broken` → [..., pg_no_dark, sorryAx].
$R2/mm/FrontendExtract.lean on BrokenModel.lean:
- `MM.broken: sorryAx=true syntheticSorry=true`
- `MM.refs_broken: sorryAx=true syntheticSorry=false`
- before_error and after_error are clean
  - source: $R2/exp/E7_goals.lean, $R2/mm/FrontendExtract.lean
- [verified-locally] In 4.35 native_decide, `decide +native` and bv_decide add a per-use auxiliary axiom. Lean.ofReduceBool, Lean.reduceBool, Lean.ofReduceNat and Lean.trustCompiler no longer exist.
  - evidence: $R2/exp/E2_native.lean:
- `#print nd_ex` → `of_decide_eq_true nd_ex._native.native_decide.ax_1_1`
- `#print nd_ex._native.native_decide.ax_1_1` → `axiom nd_ex._native.native_decide.ax_1_1 : decide (2 + 2 = 4) = true`
- `decide +native` → [nd2._native.decide.ax_1_1]
- `decide +kernel` → no axioms
- `Unknown identifier `Lean.ofReduceBool``
Implementation: Lean.Meta.nativeEqTrue in src/lean/Lean/Meta/Native.lean uses addDecl (.axiomDecl ...) with name mkAuxDeclName (`_native ++ tacticName ++ `ax). The release notes record the removal (#14953).
  - source: $R2/exp/E2_native.lean; https://lean-lang.org/doc/reference/latest/releases/v4.35.0/ ; https://lean-lang.org/doc/reference/latest/Axioms/
- [verified-locally] @[implemented_by] combined with native_decide can prove False, but the result is visible through the auxiliary axiom.
  - evidence: $R2/exp/E2_native.lean: `@[implemented_by realF] def logicalF (n : Nat) : Bool := true` where realF returns false.
- `theorem logical_ok : logicalF 0 = true := rfl` → no axioms.
- `theorem lie : logicalF 0 = false := by native_decide` → [lie._native.native_decide.ax_1_1].
- `theorem contradiction : False` → [lie._native.native_decide.ax_1_1].
  - source: $R2/exp/E2_native.lean
- [verified-locally] #print axioms does NOT detect a kernel bypass via `set_option debug.skipKernelTC true` plus a metaprogram calling addDecl. leanchecker and lake comparator do detect it.
  - evidence: $R2/exp/E3_escape.lean: `elab "add_bad " n:ident : command => liftCoreM do addDecl (.thmDecl {name := n.getId, levelParams := [], type := mkConst ``False, value := mkConst ``True.intro})`.
- Without the option: (kernel) declaration type mismatch.
- With the option: accepted. 'bad2' does not depend on any axioms, and `theorem everything : 1 = 2 := absurd bad2 id` → 'does not depend on any axioms'.
- `lake env leanchecker Solution` → 'leanchecker found a problem in Solution ... while replaying declaration 'MM.bad': (kernel) declaration type mismatch' (1.55 s, exit 1).
- lake comparator → 'Lean default kernel rejected the solution'.
- Mechanism: debug.skipKernelTC routes Kernel.Environment.addDecl to addDeclWithoutChecking (src/lean/Lean/AddDecl.lean).
  - source: $R2/exp/E3_escape.lean; $R2/mm (leanchecker/comparator runs); https://lean-lang.org/blog/2024-8-1-lean-4100
- [verified-locally] debug.byAsSorry and debug.proofAsSorry turn proofs into sorryAx, which #print axioms catches. Full list of debug.* options in 4.35.
  - evidence: $R2/exp/E3_escape.lean: 'bas' depends on axioms: [sorryAx]; 'pas' depends on axioms: [sorryAx].
Options found by grep: debug.skipKernelTC, debug.byAsSorry, debug.proofAsSorry, debug.terminalTacticsAsSorry, debug.autoTry.showEdits, debug.definition.wf.replaceRecApps, debug.moduleNameAtTimeout, debug.rawDecreasingByGoal, debug.simp.check.have, debug.tactic.simp.checkDefEqAttr, debug.tactic.try.onlyUserSuggestions.
  - source: $R2/exp/E3_escape.lean; grep of src/lean/Lean for register_builtin_option debug.
- [verified-locally] Elaborating a Lean file executes arbitrary code at build time, so LLM-written files are an execution vector.
  - evidence: `#eval IO.FS.writeFile "pwned_by_eval.txt" "written at elaboration time\n"` in $R2/exp/E3_escape.lean created $R2/exp/pwned_by_eval.txt during a plain `lean E3_escape.lean`. No `import Lean` is needed: IO is in Init.
  - source: $R2/exp/E3_escape.lean, $R2/exp/pwned_by_eval.txt
- [verified-locally] A misleading global `notation` disguises terms in all pretty-printing. Only pp.notation false reveals the real term.
  - evidence: $R2/exp/E12_notation.lean: `notation "cynder_has_dark_past" => True; theorem looks_substantive : cynder_has_dark_past := trivial`.
- `#check looks_substantive` → `looks_substantive : cynder_has_dark_past`
- With pp.notation false → `looks_substantive : True`
- Raw Expr → `Lean.Expr.const `True []`
- `#check (True : Prop)` → `cynder_has_dark_past : Prop`
  - source: $R2/exp/E12_notation.lean
- [verified-locally] autoImplicit (default true on 4.35) turns a typo in a statement into an implicitly quantified variable. Setting it false in lakefile [leanOptions] fixes this for lake build and lake lean, but not for `lake env lean`.
  - evidence: $R2/exp/E13_autoimplicit.lean: `theorem typo_stmt : IsPG newSpryo := sorry` → `@typo_stmt : ∀ {newSpryo : Game}, IsPG newSpryo`. With autoImplicit false → Unknown identifier `newSpryo`. Defaults: autoImplicit and relaxedAutoImplicit are both true (src/lean/Lean/Elab/AutoBound.lean).
$R2/mm4 with `[leanOptions] autoImplicit = false`:
- `lake build` → error
- `lake lean Model/Typo.lean` → error
- `lake env lean Model/Typo.lean` → only the sorry warning (options not applied)
  - source: $R2/exp/E13_autoimplicit.lean, $R2/mm4/lakefile.toml
- [verified-locally] Expr.hash and Expr == (eqv) are alpha-invariant (they ignore binder names) and stable across processes. pp strings are not. A definitional reformulation counts as a change.
  - evidence: $R2/exp/E11_hash.lean:
- s1 (∀ g c ...) vs s2 (∀ x y ...): hash 3097858057 vs 3097858057; BEq=true; equal(strict)=false; ppAll same=false; defeq=true.
- s1 vs s3 (¬P vs P → False): different hash, BEq=false, defeq=true.
The extractor run interpreted and compiled produced identical typeHash and pp.all hashes for 22 of 22 declarations. Expr.hash is 32-bit and non-cryptographic.
  - source: $R2/exp/E11_hash.lean, $R2/mm/extract_out.json vs $R2/mm/extract_exe2.json
- [verified-locally] `lake check` (new in Lake 5.0.0) builds, exports and kernel-replays the project in a bwrap sandbox, and rejects any non-standard axiom. It cannot permit user axioms and is slow (replays Init).
  - evidence: On $R2/mm: 143.6 s wall, exit 1. Output: 'Axiom 'MM.Character' is not permitted; it is used by 'MM.HasDarkPast' ... Axiom 'sorryAx' is not permitted ... Lean default kernel accepts the solution'. `--paranoid` adds leanchecker-paranoid, lean4lean, nanoda, con-leche, con-ron. Requires lake-manifest.json and bwrap.
  - source: lake help check; https://lean-lang.org/doc/reference/latest/releases/v4.35.0/
- [verified-locally] `lake comparator` (Lake 5.0.0) checks that solution theorems have the same statements as a challenge, comparing the full transitive closure of each statement's dependencies. Only permitted axioms (which can include user assumptions) may be used, and the solution is replayed through the kernel inside a bwrap sandbox. It caught every cheat tried, in about 3 s.
  - evidence: Config $R2/mm/comparator.json: challenge_module Challenge, solution_module Solution, theorem_names [MM.cynder_goal], permitted_axioms = std + the user vocabulary and assumption axioms. Results:
- honest → 'Your solution is okay!' (3.30 s)
- changed statement → 'Challenge and solution theorem statement do not match: 'MM.cynder_goal''
- new axiom → 'Illegal axiom detected: 'MM.cheat''
- sorry → 'Illegal axiom detected: 'sorryAx''
- native_decide → 'Illegal axiom detected: 'MM.arith._native.native_decide.ax_1_1''
- skipKernelTC → 'Lean default kernel rejected the solution' (5.11 s)
Semantics (lake/Lake/Check/Compare.lean): targets and permitted axioms need equal ConstantVal; a worklist compares every reachable constant by full ConstantInfo equality; checkAxioms walks the proofs; the export is replayed with `leanchecker --silent --from-export`. Sandbox: '/' read-only, home dirs covered, only .lake writable, no network during build/export/kernels.
  - source: $R2/mm/comparator.json, $R2/mm/Challenge.lean, $R2/mm/Solution.lean; lake help comparator; ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/lake/Lake/Check/Compare.lean; https://github.com/leanprover/comparator
- [verified-locally] The challenge must be frozen as an export of the approved state. If challenge and solution import the same live files, tampering with a shared assumption file goes undetected.
  - evidence: Edited MentalModel/Assumptions.lean so that `axiom spyro_pg : IsPG newSpyro ∧ True`, and used a solution relying on it.
- Live challenge → 'Your solution is okay!'.
- With `lake comparator --challenge-from-export=challenge.ndjson` (exported before tampering) → 'Challenge and solution theorem statement do not match: 'MM.spyro_pg''.
Export command: `lake env leanexport Challenge -- MM.cynder_goal propext Quot.sound Classical.choice <user axioms> Quot Quot.mk Quot.lift Quot.ind Nat.add ... outParam` (the same targets Lake uses: primitiveTargets and builtinTargets in Lake/CLI/Check.lean). Took 0.79 s; output 1.0 MB, 18,582 NDJSON lines.
  - source: $R2/mm/challenge.ndjson; ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/LeanExport.lean
- [verified-locally] The 4.35.0 toolchain bundles independent checkers and an exporter. bubblewrap is installed and works.
  - evidence: ~/.elan/toolchains/leanprover--lean4---v4.35.0/bin contains leanchecker, leanchecker-paranoid, lean4lean, nanoda_bin (0.4.19), leanexport (lean4export 3.1.0), con-leche, con-ron, leanir.
- leanchecker usage: `leanchecker [ModulePrefix]` (replay from imports), `--fresh` (replay all; 62.7 s for the toy project), `--from-export file.ndjson`.
- /usr/bin/bwrap is bubblewrap 0.9.0; `bwrap --ro-bind / / --dev /dev --proc /proc --unshare-net true` exits 0.
- Release notes #15130, #15099, #15048, #14884 confirm the bundling.
  - source: ls of toolchain bin; ~/.elan/toolchains/leanprover--lean4---v4.35.0/src/lean/LeanChecker.lean; https://lean-lang.org/doc/reference/latest/releases/v4.35.0/
- [verified-locally] A JSON extractor using importModules plus MetaM is easy to write and fast. A compiled lake exe takes about 0.5 s for the toy project.
  - evidence: $R2/mm/Extract.lean is run as `lake exe telelean-extract MentalModel` (lakefile: [[lean_exe]] name="telelean-extract" root="Extract" supportInterpreter=true). Core calls: initSearchPath (← findSysroot); enableInitializersExecution; importModules #[{module := root}] {} (loadExts := true); then (MetaM.run' ...).toIO ctx {env}.
Per declaration it emits:
- name, module, kind (axiom/def/abbrev/theorem/opaque/structure/class/inductive/constructor)
- type (ppExpr), typeHash (Expr.hash), typePpAllHash, valuePpAllHash for defs
- typeIsProp, isStatementDef, axiomClass
- doc (findDocString?), range and selectionRange (findDeclarationRanges?)
- directDeps (getUsedConstants of type and value, restricted to project constants)
- axioms, userAxioms, nonStandardAxioms (collectAxioms)
- usesSorry, syntheticSorry
- isUnsafe, isPartial, implementedBy (Compiler.getImplementedBy?), extern (isExtern), isInstance
Timings:
- compiled: 0.56–0.59 s wall (import 208 ms, extract 39 ms, RSS 475 MB); 0.45 s when calling the binary directly; binary 231 MB; building it took 4.19 s
- `lake env lean --run Extract.lean`: 3.26 s (import 676 ms, extract 264 ms)
The noise filter missed `noConfusionType`, which needs an extra rule.
  - source: $R2/mm/Extract.lean, $R2/mm/extract_out.json
- [verified-locally] Several Lean API details changed by 4.35 and matter for the production extractor.
  - evidence: Compile errors and fixes while writing the extractor:
- getReducibilityStatus is monadic; use getReducibilityStatusCore env n for the pure version.
- ModuleIdx is Nat; ⟨i⟩ is invalid.
- levelZero is deprecated; use Level.zero.
- Core.Context extends Core.Context.Cold.
- importModules signature: (imports) (opts) (trustLevel := 0) (plugins := #[]) (leakEnv := false) (loadExts := false) (level := OLeanLevel.private) (arts := {}).
- docStringExt and declRangeExt export `exported := #[]` (server and private only), so the default .private level is needed. This was verified working for both non-module and module-system files.
- Messages carry error codes such as error(lean.unknownIdentifier).
  - source: $R2/mm/Extract.lean; src/lean/Lean/Environment.lean, Lean/DocString/Extension.lean, Lean/DeclarationRange.lean
- [verified-locally] Build timings for the 3-file toy project. Lake has early cutoff, but in non-module mode any edit that shifts declaration positions or changes a docstring rebuilds all dependents.
  - evidence: $R2/mm:
- fresh lake build: 1.58 s (per module 345–409 ms)
- no-op: 0.17 s
- leaf edit: 0.98 s
- comment at top of Vocabulary.lean: 1.58 s (all dependents)
- trailing comment (no position shift): 0.48 s (only that file)
- docstring edit: 1.59 s (all dependents)
- `lean --json` on a small file: about 0.5 s
- `lake lean F -- --json`: 0.52 s
  - source: $R2/mm
- [verified-locally] Module system (`module` + `@[expose] public section`): proof-only, comment-only and docstring-only edits rebuild only the edited file. Statement changes and new axiom dependencies still propagate. Without @[expose], plain defs are not unfoldable downstream.
  - evidence: $R2/mm3:
- proof-only edit: 0.51 s (only B rebuilt)
- statement edit: 1.19 s (dependents rebuilt)
- top comment: 0.50 s; docstring edit: 0.59 s (only A)
- proof-only edit that adds Classical.em: 1.29 s; C rebuilt and C's axioms now include Classical.choice
Without @[expose]: `theorem pD : stmtD := cynder_dark` → Type mismatch; `unfold stmtD` → failed. abbrev and @[expose] def work.
With `@[expose] public section`: everything unfolds and a proof-only edit still takes 0.49 s.
Outputs gain .olean.server, .olean.private, .ir, .ir.sig. The extractor works unchanged (docstrings, ranges, axioms).
  - source: $R2/mm3
- [verified-locally] `lean --json` emits JSON Lines diagnostics. Columns are 0-based Unicode codepoints, not UTF-16 units.
  - evidence: Fields: caption, data, endPos{line,column}, fileName, isSilent, keepFullRange, kind, pos{line,column}, severity. kind is e.g. "hasSorry", "lean.unknownIdentifier._namedError" or "[anonymous]". Example: {"data":"declaration uses `sorry`","kind":"hasSorry","pos":{"column":8,"line":4},"severity":"warning",...}. In $R2/exp/E15_lexical.lean, `rfl` after 𝔽 was reported at column 28: codepoints 28, UTF-16 29, UTF-8 31. Exit code is 1 on errors.
  - source: $R2/exp/E9_codes.lean, $R2/exp/E15_lexical.lean
- [verified-locally] Files that fail to compile (so no .olean) can still be elaborated in-process to get a partial environment with every declaration.
  - evidence: $R2/mm/FrontendExtract.lean: Parser.mkInputContext; Parser.parseHeader; processHeader header {} messages inputCtx; IO.processCommands inputCtx parserState (Command.mkState env messages {}); then iterate env.constants.map₂. All 4 theorems of the broken file were found, plus the error message. Elaboration took 695 ms (2.5 s total via lean --run).
  - source: $R2/mm/FrontendExtract.lean; src/lean/Lean/Elab/Frontend.lean
- [verified-locally] A dangling `/-- doc -/` is a parse error. Plain `/- -/` and `/-! -/` comments can stand alone, block comments nest, and a docstring can be separated from its declaration by a plain comment.
  - evidence: $R2/exp/E8a/E8b/E8d:
- docstring followed by #check → "unexpected token '#check'; expected '#guard_msgs', 'abbrev', 'add_decl_doc', 'axiom', ... 'theorem' or 'unif_hint'"
- at EOF → "unexpected end of input; expected ..."
- two docstrings in a row → "unexpected token '/--'; expected ..."
- `/- a /- b -/ c -/` is fine
- `/-- doc -/ /- @@ telelean ... -/ def y` attaches the docstring to y
  - source: $R2/exp/E8a_doc_dangling.lean, E8b_doc_eof.lean, E8d_doc_then_doc.lean, E8c_doc_verbatim.lean
- [verified-locally] In the default Markdown mode, findDocString? returns docstring text, including an embedded @@ telelean block, verbatim up to leading-space normalization.
  - evidence: $R2/exp/E8c_doc_verbatim.lean: a block with quotes, colons, brackets, braces and backticks came back intact: "Cynder is a character who has a dark past.\n\n@@ telelean\nid: assumption.cynder_dark\n...tags: [lore, characters]\n  indented: line with `code`, a {brace}, a colon: and a \"quote\"\n".
- String.removeLeadingSpaces strips the first line's leading spaces and the common indentation of later lines.
- Trailing spaces before -/ are kept.
- Field and constructor docs work.
- Module docs come from getMainModuleDoc / getModuleDoc?.
- findDocString? can append tactic-extension and recommended-spelling text; use findSimpleDocString? or findInternalDocString? for raw text.
  - source: $R2/exp/E8c_doc_verbatim.lean; src/lean/Lean/DocString.lean, Lean/DocString/Extension.lean
- [verified-locally] With `set_option doc.verso true`, a raw YAML-like @@ telelean block in a docstring fails to parse and the docstring is lost. A fenced code block survives. doc.verso defaults to false in 4.35.
  - evidence: $R2/exp/E8e_verso.lean:
- "error: expected link target '(url)' or '[ref]' (use '\[' for a literal '[')" and "error: '['; expected '![', '$$', '$', '*', '[', '[^', '_', '`' or '{'"; then `[verso] findDocString? = some ""`.
- A fenced ``` block is returned intact.
- Verso renders roles ({name}`x` → `x`).
- Options doc.verso and doc.verso.module both default to false (src/lean/Lean/DocString/Extension.lean). Lean core sets doc.verso true in many of its own files.
  - source: $R2/exp/E8e_verso.lean; https://lean-lang.org/doc/api/Lean/DocString/Add.html
- [verified-locally] A Lean-native markup works: attribute @[telelean kind "name" (why := ...)], a telelean_node command for code-less nodes, an environment extension readable from .olean, and #telelean_status. It needs a Lake dependency and gives no data when a file fails to compile.
  - evidence: Library $R2/telelean-lean/Telelean/Basic.lean uses SimplePersistentEnvExtension, registerBuiltinAttribute and a command_elab. User project $R2/mm2 requires it via `[[require]] name="telelean" path="../telelean-lean"`.
#telelean_status printed:
- '[assumption] a.fans_like_dragons ... -- natural-language-only'
- '[goal] MM.not_dark_and_good ... -- statement-formalized (Prop def, unproved)'
- '[derivation] MM.cynder_not_good ... -- proved'
- '[derivation] MM.sneaky_use ... -- proved-using-undeclared-axioms #[MM.sneaky]'
$R2/mm2/ReadNodes.lean read all nodes as JSON from the .olean. nodeExt.getState already includes imported entries; my first version double-counted them. The docstring is not available at attribute time (afterTypeChecking).
  - source: $R2/telelean-lean/Telelean/Basic.lean, $R2/mm2/Model/Cynder.lean, $R2/mm2/ReadNodes.lean
- [verified-locally] Consistency of the axioms can be certified mechanically: generate ∃ x1..xn, True by abstracting the axioms and opaques, then require a proof that uses only standard axioms. Reusing the axioms themselves as the 'model' is detected.
  - evidence: `#telelean_consistency_statement MM.Consistent for MM` (mkConsistencyProp: deltaExpand project defs, Expr.replace const→fvar, mkAppM ``Exists) produced `∃ Character Game Cynder newSpyro HasDarkPast IsPG GoodAddition cynder_dark spyro_pg pg_no_dark sneaky, True`.
- `theorem consistent : Consistent := ⟨Unit, Unit, (), (), fun _ => True, fun _ => True, fun _ _ => False, trivial, trivial, fun _ _ _ _ h => h, fun h => h, trivial⟩` → 'does not depend on any axioms' (a valid certificate).
- consistent_cheat, which reuses the axioms → depends on the user axioms (rejected).
- Limitations: universe-polymorphic axioms, and structures whose fields mention axiomatized types.
  - source: $R2/telelean-lean/Telelean/Basic.lean, $R2/mm2/Model/Cynder.lean
- [verified-locally] grind is not a reliable automatic inconsistency detector. A simple manual combination of simp_all with the assumptions works.
  - evidence: $R2/exp/E10_inconsistency.lean, with a1: ∀ c, HasDarkPast c; a2: ∀ c, IsDragon c → ¬HasDarkPast c; a3: IsDragon Cynder.
- `by grind [a1, a2, a3]` → '`grind` failed' (its e-matching patterns had no ground HasDarkPast term to trigger on).
- `have := a2 Cynder a3; simp_all [a1]` → proves False.
- `theorem anything (P : Prop) : P := absurd (a1 Cynder) (a2 Cynder a3)` shows vacuity.
  - source: $R2/exp/E10_inconsistency.lean
- [verified-locally] Core 4.35 without Mathlib has grind, exact?, simp_all, omega and decide. tauto and aesop are not available.
  - evidence: $R2/exp/E14_tactics.lean: grind proved the Cynder goal. exact? suggested 'exact t_grind'. `tauto` and `aesop` → 'unknown tactic'.
  - source: $R2/exp/E14_tactics.lean
- [verified-locally] lakefile.toml is the lake new default and is faster than lakefile.lean. [leanOptions] maps to package leanOptions.
  - evidence: `lake new X lib.toml` creates lakefile.toml (name, version, defaultTargets, [[lean_lib]]), lean-toolchain `leanprover/lean4:v4.35.0`, .gitignore `/.lake`, a CI workflow, and runs git init.
- No-op build: TemplLib (TOML) 0.17 s vs TemplLeanCfg (lakefile.lean) 0.74 s.
- `lake translate-config lean` produced `package mentalmodel where leanOptions := #[⟨`autoImplicit, false⟩, ...]` and renamed the original to lakefile.toml.bak.
  - source: $R2/TemplLib, $R2/TemplLeanCfg, $R2/mm4
- [verified-locally] The Mathlib template details, and the side effects of its post_update hook.
  - evidence: `lake new X math-lax.toml` creates `[[require]] name = "mathlib" scope = "leanprover-community" rev = "v4.35.0"` and `[leanOptions] pp.unicode.fun = true`, then immediately runs lake update.
- Mathlib tag v4.35.0 resolved to commit 56a005855ea17e0b0958f73ec801ae140b0a1679, whose lean-toolchain is leanprover/lean4:v4.35.0.
- Mathlib's lakefile has a post_update hook that runs the cache tool unless MATHLIB_NO_CACHE_ON_UPDATE=1.
- It built and ran the `cache` executable, which downloaded about 450 MB into ~/.cache/mathlib; the package directory reached about 6.8 GB.
- Per-file `import Mathlib` cost was not measured.
  - source: accidental run, recorded before deleting $R2/TemplMath; mathlib lakefile.lean lines 187-193
- [verified-locally] Lexical rules a TypeScript @@ telelean comment parser must follow.
  - evidence: $R2/exp/E15_lexical.lean:
- String literals in code hide comment markers ("/- ...", "-/ ...", r#"..."#, '/' all compile).
- Inside a block comment, quotes mean nothing: `/- ... "a string with -/ inside" ? -/` ends at the first -/, and the rest becomes code ('unterminated string literal').
- Block comments nest.
- `--` inside a block comment is plain text.
  - source: $R2/exp/E15_lexical.lean
- [verified-locally] The axiom classifier separates propositions, type formers, existence commitments, harmless data constants and suspicious data axioms.
  - evidence: Extractor output:
- MM.Character and MM.HasDarkPast → type-former
- MM.Cynder → constant-of-uninterpreted-type
- MM.cynder_dark → proposition
- Sus.natAx : Nat → constant-of-inhabited-type
- Sus.emptyAx : Empty and Sus.dataHidingProp : PLift (1 = 2) → data-suspicious
- Sus.propAx : 1 = 2 → proposition
Other flags: logicalF implementedBy=Sus.realF, unsafeF isUnsafe=True, externF extern=True, lie nonStd=[Sus.lie._native.native_decide.ax_1_1]. A partial def appears as an opaque constant (isPartial=false).
Caveat: the noise filter (isInternalDetail) hides the _native auxiliary axiom from the decl list, so the axiom inventory must be unfiltered.
  - source: $R2/mm/Sus.lean, $R2/mm/sus.json, $R2/mm/extract_out.json
- [verified-locally] Lake 5.0.0 command set relevant to the extension, and `lake lean` semantics.
  - evidence: `lake help` lists: new, init, build, query, exe, check-build, test, lint, clean, shake, comparator, check, env, lean, update, pack, unpack, upload, cache, script, run, translate-config, serve.
- `lake lean <file> [-- <args>]` builds the file's imports, then runs lean with the package's Lean arguments (including leanOptions).
- Build flags include --no-build, --fail-fast, --no-cache, --keep-toolchain.
  - source: lake help; lake help lean; lake help build
- [verified-locally] Side effects outside the scratch dir occurred and are disclosed here.
  - evidence: (1) The accidental `lake new TemplMath math-lax.toml` led Mathlib's post_update hook to build and run Mathlib's cache executable. It added 9,028 .ltar files (about 450 MB, mtime 2026-11-01 01:33–01:34) to ~/.cache/mathlib, which already held about 17k files from July. Not deleted. Undo: find ~/.cache/mathlib -maxdepth 1 -type f -newermt '2026-11-01 01:32' -delete.
(2) The elan proxy appended 8 lines containing r2-lean-semantics to ~/.elan/known-projects.
No toolchain was installed (elan toolchain list unchanged). The 7.2 GB clone in scratch was deleted.
  - source: ls/find on ~/.cache/mathlib and ~/.elan/known-projects