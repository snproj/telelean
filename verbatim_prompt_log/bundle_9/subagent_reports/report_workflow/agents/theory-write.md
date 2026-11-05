# theory:write (agent a8e3c88532bf81e6c)

## markdown
# Part 3: The Lean system

**Scope.** This part describes the logic telelean implements today, at milestones M1 (the board, no AI) and M2 (one-shot "These suffice"), as the code in `packages/core` and `packages/runner` does it. It is written for a reader with a formal-methods background who may want to review or change the system. Where the design documents say something different (02 design decisions, 03 architecture, `docs/design-amendments.md`, `docs/m1-plan.md`, `docs/m2-plan.md`), the difference is stated.

**Evidence.** The evidence is of three kinds:
- unit tests on hand-made Lean facts;
- integration tests that run Lean 4.35 on the Spyro sample with a scripted (fake) Claude;
- the Lean outputs quoted in 3.8, re-run for this report in scratch copies.

**The walkthrough with the real Claude has not been run.**

**Notation.**
- *E*: a built Lean environment (every module of the model).
- *Ax(c)*: the axioms that constant *c* depends on, as `#print axioms c` prints them (Lean's `collectAxioms`). These are all the `axiom` declarations reachable from *c*'s type and value, transitively, through definitions, theorems and the values of opaque constants. Only axioms appear; theorems never do.
- *⌜e⌝*: the text Lean prints for *e* with `pp.fullNames true`, with every run of whitespace collapsed to one space. Several checks compare these texts rather than Lean terms; the places where this matters are pointed out.
- *STD* = {`propext`, `Classical.choice`, `Quot.sound`}: Lean's standard axioms, treated as part of the logic.
- For a card *v* whose statement is named *n*: *H_v* = `n.holds`.
- States of a run:
  - *B*: the user's files when the run started, with the Lean facts of a base build;
  - *R*: the files when the current round began;
  - *S*: Claude's working copy now;
  - *F*: the round's freeze;
  - *A*: the working copy at the newest ghost adoption.
- The selection: target *T*, selected premises *P* (possibly empty), adopted ghosts *G*.

**The central claim** (02, "Prototype profile"): *"proved" means proved from exactly the assumptions you selected.* Precisely: Lean accepts a theorem `T.holds : T` whose axiom set lies inside a *permitted set*. That set is computed from the selection plus fixed logical and vocabulary axioms, and the proof is checked against statements frozen before any proof existed. Section 3.4 makes this precise for the board and 3.6 for runs; 3.7 says what it does not cover. Above all, it does not cover whether the Lean says what your sentence says.

---

## 3.1 The objects

**Cards.** A card is a comment block in a model Lean file:

```lean
/-
@@ telelean v1
id: cynder-not-good
type: GOAL
natural_name: Cynder would not be a good addition to the new Spyro game
premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past
asserted: 2026-11-01
lean: Spyro.cynder_not_good
-/
/-- Cynder would not be a good addition to the new Spyro game -/
abbrev cynder_not_good : Prop := ¬ GoodAddition cynder newSpyro
```

The block is line-oriented `key: value` text, not YAML. Its fields:
- `id`: a stable identity. When absent it is derived from the sentence (TL112).
- `type`: ASSUMPTION, DERIVATION or GOAL (`kind` is accepted as an alias).
- `natural_name`: the user's sentence. It is the specification. telelean never rewrites it, and the run gate refuses any change to it.
- `rationale`, `stance` (believe / rule / supposing), `source` (observed / reported / inferred / common), `asserted` (a date, so that indexicals such as "new" stay interpretable), and free notes after `---`.
- `premises`: declared joint support (see 3.4).
- `lean`: the pinned binding (see 3.2).
- `origin`, `session`, `worded_by`: provenance. `worded_by: agent` marks Claude's wording.
- `supersedes`, `refines`, `tags`: kept as written; they have no logical effect yet.

**The three kinds.** Kind is metadata (the `type:` line), not a location in a file:
- **ASSUMPTION**: something held. Formally an axiom.
- **DERIVATION**: something claimed to follow. Formally a theorem; until it has one, it is "pending".
- **GOAL**: something one wants to know follows. It is never taken as given, so it has no `.holds` at all.

**Subjects.** A subject is a module subtree with its own namespace:
- `Model/<S>.lean` imports `Model/<S>/Vocabulary.lean`, `Inbox.lean` (where new comment-only cards go) and `Main.lean`;
- `Model.lean` imports every subject.

Consequences:
- Two subjects can both declare `Character` without a clash.
- Ids are unique across the project.
- Premises stay within one subject (TL121; runs refuse premises from another subject).
- One subject uses another only through an explicit `import`.
- A file that the library root does not import is never checked by Lean (TL118).

**Sentence and Lean.** A card always has a sentence and optionally a Lean statement. The statement is one *interpretation* of the sentence, and nothing in the system checks that it is the right one (see 3.7). The statement's docstring mirrors the sentence (D-9), so Lean's own hover shows the user's words.

**Cards without code.** A block with no declaration bound to it is a pure comment: status `informal`, no Lean meaning, no logical effect. It can be selected as a premise, but it contributes nothing unless Claude formalises it in that run (see 3.6).

**Stance and rationale have no logical effect.** Lean, the statuses and the gate never read them. A "supposing, for argument" assumption is a global axiom exactly like a belief: telelean has no scoped suppositions and no discharge of hypotheses. Both fields are shown on the board: a missing rationale gives the info chip "no reason yet", or "no source yet" for stance `rule` (TL011). Both are also sent to Claude as context.

**Declared premises.** `premises:` is the user's claim that these cards jointly support this one (drawn as dashed arrows).
- It is written by "These suffice", which declares exactly the selection as an undoable edit, and by ghost adoption.
- Claude may never change it.
- It is compared with what Lean's proof actually uses (see 3.4).
- Checks: TL007 (dangling premise), TL015 (premise cycle), TL121 (premise in another subject).

---

## 3.2 The encoding

| Card state | Lean (D-2(b)) |
|---|---|
| no code (any type) | the comment block only |
| formalised | `abbrev n : Prop := S` (a `def n : Prop := S` is accepted too) |
| ASSUMPTION | the statement plus `axiom n.holds : n` |
| DERIVATION, proved | the statement plus `theorem n.holds : n := p` |
| DERIVATION, pending (after A→D) | the statement plus `axiom n.holds : n` |
| GOAL | the statement and no `n.holds` |
| conditional derivation | `theorem d.holds (h : g) : d := …` |

**Why two declarations.** The abbrev carries *meaning*: it is a definition and commits to nothing. `n.holds` carries *commitment*: an axiom means held, a theorem means derived, and its absence means open. Three things follow:
1. The user's files never need `sorry`. A `theorem g : S := by sorry` would assert S through `sorryAx`, and other proofs could use it.
2. Beliefs appear by name in every footprint, as `….holds` axioms.
3. Kind changes touch only `n.holds` (see 3.5).

**Exact forms required.** These are checked from Lean's facts:
- **The statement** must be a Prop-valued abbrev or def: Lean's `#print` shows kind `def` and `#check` shows type `Prop`. If a block is bound to anything else (an axiom, a theorem, a definition whose type is not `Prop`), the card is `ill-formed` (TL113). telelean deliberately does not guess.
- **`n.holds` must state exactly n.** Either ⌜type(n.holds)⌝ = ⌜n⌝, or, for a conditional derivation, ⌜n₁ → … → n_k → n⌝ where every nᵢ is exactly the statement name of some card. Otherwise the card shows ".holds says something else" (TL114) and is not proved.
  - This compares printed text, not terms. `theorem n.holds : ¬ GoodAddition cynder newSpyro` states the unfolded proposition. It is definitionally equal to `n`, and Lean accepts it, but telelean reports a mismatch.
- **`n.holds` is found by name** anywhere in the project; by convention it sits right after the statement. A `.holds` of another kind, such as a def that proves the statement, is treated like a theorem.

**Conditional derivations.** `theorem d.holds (h : g) : d := …` says "d follows if g does", for an unproved g. The card is *conditional on g* and never `proved`. The A→G rewrite of D-11 produces exactly this form (see 3.5).

**Vocabulary declarations** need no markup; telelean computes them:

```lean
axiom Character : Type                              -- a sort
axiom HasDarkPast : Character → Prop                -- a predicate (any arity ≥ 0)
noncomputable opaque cynder : Character             -- a named constant
noncomputable opaque f : Character → Game           -- a function
axiom Character.exists : Nonempty Character         -- the sort's presupposition
instance : Nonempty Character := Character.exists   -- plumbing, not listed
```

**Presuppositions.**
- **Where they come from.** Lean accepts `opaque cynder : Character` only with an inhabitant of `Character`, which the instance provides from `Character.exists`. So every statement that mentions `cynder` depends on `Character.exists` (and on `Classical.choice`). In linguistic terms, naming Cynder presupposes that characters exist, and the presupposition is visible in Lean's axiom lists. Re-run for this report: `#print axioms Spyro.cynder_dark_past` gives `[Classical.choice, Spyro.Character, Spyro.HasDarkPast, Spyro.Character.exists]`.
- **Per card.** presup(x) := Ax(statement of x) ∩ {presupposition axioms}. A statement over sorts and predicates only (`∀ g c, …`) presupposes nothing.
- **Their role in proofs.** Presuppositions are the only existence assumptions a proof may use without the user selecting a card for them. Even then, only the sorts mentioned by the target's statement or a selected premise's statement count (see 3.6).

**Naming and binding.** A block binds to its statement declaration:
1. by `lean:` (pinned, fully qualified; the first name is the statement), which always wins;
2. otherwise by adjacency: the next declaration with no blank line in between. A docstring, attributes, modifiers and comments may sit in between. A blank line, another block or the end of the file means the card has no code. `example` and `mutual` cannot be bound (TL014).

Further rules:
- A declaration belongs to at most one card (TL017).
- Whenever telelean edits a block that is bound by adjacency, it writes the pin, so that a declaration inserted later cannot silently rebind the card.
- In runs, normalisation pins every statement formalised in that run (see 3.6).

**Project defaults.**
- `autoImplicit = false` and `relaxedAutoImplicit = false`. Otherwise a typo such as `HasDarkPast cyndr` silently becomes a universally bound variable. TL110 warns when they are on.
- The toolchain is exactly `leanprover/lean4:v4.35.0`. Other toolchains get the board in "syntactic mode" (cards read from the text only) and no runs.
- No Lake dependencies (no Mathlib).

---

## 3.3 The vocabulary discipline

Every declaration bound to no card is *vocabulary*. It is classified from Lean's facts: the type from `#check`, the kind from `#print`, and the sort of the type from `#check type_of%`. The classification is a "simple shape check" (02 D-3, prototype profile). Below, "sort" always means a project sort, i.e. an `axiom T : Type`.

| Declaration | Classified as | Accepted shape |
|---|---|---|
| `axiom T : Type` | sort | exactly `Type`: no arguments, no universe parameter |
| `axiom X : Nonempty T`, T a sort | presupposition (attached to T) | |
| `instance : Nonempty T := <T's presupposition>` | plumbing, not listed | |
| an axiom whose type is a proposition (`type_of%` gives `Prop`) | unmarked axiom: a hidden assumption (TL104) | never vocabulary |
| `axiom` or `opaque P : T₁ → … → Tₙ → Prop` | predicate (n ≥ 0, so `axiom P : Prop` is a propositional symbol) | every Tᵢ a sort, no implicit or instance binders; otherwise TL111 |
| `opaque c : T`, `opaque f : T₁ → … → T`, all sorts | constant, function | declaring it with `axiom` instead: TL111 |
| any other axiom or opaque (`Empty`, `PLift False`, `Type 1`, `Sort u`, a type that is not a sort) | other | TL111; never part of the signature |
| def, abbrev, structure, inductive, class, any other instance | definition | a question for the user when it lies on a statement path |
| a theorem without a card | lemma | used in proofs only |

**What the gate forbids, and the smuggling attack each prohibition blocks.** These rules apply to vocabulary added in a run. Several attacks were found and verified with real Lean during the design reviews.

- **A new axiom whose type is a proposition**, other than the `.holds` of a selected assumption (rule `new-axiom`). *Blocks:* Claude simply asserting the goal (`axiom shortcut : cynder_not_good`) or a missing premise.
- **An axiom written directly below a card's block** (`new-axiom`, token `statement`). Such an axiom is never part of the signature. *Blocks:* found by the M2 verification with real Lean: `axiom side_goal : Empty` under a selected GOAL card without code becomes that card's "statement", and an inhabitant of `Empty` proves anything.
- **An axiom of a type that fits no vocabulary shape** (`Empty`, `PLift False`, `Type 1`, `Sort u`; rule `vocabulary-shape`). Such axioms are never part of the signature. *Blocks:* types that are not propositions but still carry one, which prove anything; a universe-polymorphic `Character : Sort u` instantiated at `Prop`.
- **Predicates, constants and functions whose argument or value types are not sorts** (`vocabulary-shape`). *Blocks:*
  - `axiom Character : Prop` used as a sort (all its inhabitants are equal by proof irrelevance). Alone it is a harmless propositional symbol, but every predicate or constant over it is refused.
  - A constant `{g : Game // IsPG g}`, whose existence presupposition *is* the belief.
  - A predicate over `PLift p`.
- **Constants and functions declared with `axiom`** (`vocabulary-shape`). *Blocks:* a silent existence assertion. An axiom constant of type T implies `Nonempty T` without T's presupposition showing in any footprint.
- **Definitions on a statement path** become questions; Accept needs an explicit "yes" to each. *Blocks:* a belief tucked into a definition body. In the literal reading of 3.8, `def InGame c g := GoodAddition c g` makes the literal statement say the normative one, and the proof's footprint stays clean. **The gate lets this through on purpose** (a definition may be legitimate); the user's "yes" is the check.
- **Declarations that existed before the run must stay unchanged** (`existing-changed`). *Blocks:* turning existing vocabulary into a definition that makes the goal easy. With `def GoodAddition c _ := ¬ HasDarkPast c`, the proof's footprint lies *inside* the permitted set, so a footprint check alone would pass it.
- **Presuppositions created in a run** are always definition questions, never approved automatically. *Blocks:* a new existence commitment slipping in unnoticed.

**Deferred to milestone H (hardening):**
- The full data-type rule. Structures and inductives with propositional fields, `Subtype`, `Sigma`, `PLift`, and families indexed by propositions are today only questions to the user.
- Restrictions on instances: there is no allowlist, and instance priorities are allowed.

---

## 3.4 Lean facts and statuses

**Facts.** While the board is open, every save triggers a Lean refresh, and every check in a run does the same in Claude's copy. A refresh builds the model in a sandbox and feeds Lean a generated check file. For every declaration it asks:
- `#check @N`: the type;
- `#print N`: the kind, attributes and value (proofs elided);
- `#print axioms N`: the footprint;
- `#check type_of% @N`: the sort of the type.

Lean's `.ilean` index adds positions and the references between declarations.

Facts belong to one version of each file:
- **fresh**: the file's hash equals the hash the build saw;
- **stale**: the file changed since. Its declarations keep their previous facts by name, as long as each declaration's keyword is unchanged;
- **unchecked**: its module failed, was not built, or is unknown. No facts.

**Footprints.** The footprint of a card is computed from Ax(H_v). Because Ax lists only axioms, the cards that appear in it are exactly those whose `.holds` is an axiom:
- assumed assumptions;
- pending derivations;
- goals asserted as axioms.

A derivation proved by a theorem never appears; its own assumptions do. The board maps each axiom in Ax(H_v) as follows:
- a standard axiom: dropped;
- a sort, a predicate, or a constant or function declared `opaque`: dropped (these are symbols, not beliefs);
- a card's `.holds`: that card's id;
- a presupposition: `presup:<name>`;
- `sorryAx`: the status "uses sorry";
- anything else (an unmarked axiom whose type is a proposition, a constant declared with `axiom`, an axiom outside the subjects): `axiom:<name>`, with warning TL103.

**Statuses** are a product of dimensions, not a ladder (D-15): formal × proof × flags. Certificates exist in the data model but are always `none` until M3.
- **formal:**
  - `informal`: no code;
  - `formalized`;
  - `ill-formed`: TL101 (statement not found), TL113 (not a Prop abbrev or def), or a Lean error inside the card's statement or `.holds`.
- **proof**, depending on the card's type and on its `n.holds`:

| type \ `n.holds` | absent | axiom | theorem, no sorry | theorem using sorry |
|---|---|---|---|---|
| ASSUMPTION | none, `missing-holds` (TL117) | assumed | proved or conditional, `provable-assumption` (TL106) | none, `uses-sorry` |
| DERIVATION | none | pending-promotion, `claimed` | proved or conditional | none, `uses-sorry` (TL115) |
| GOAL | none | assumed, warning TL116 ("make it an Assumption?") | proved or conditional, `proved-goal` (TL105) | none, `uses-sorry` |

Two further cases:
- A theorem whose type is neither *n* nor n₁ → … → n is `none` with `holds-mismatch` (TL114).
- A theorem that Lean has no facts for is `none` with `not-checked`. **The board never shows "proved" without Lean.**

**"Proved", precisely (the board, any card).**

> proved(v) ⟺ (1) Lean has facts for H_v (fresh, or kept from a stale file); (2) H_v is not an axiom; (3) ⌜type(H_v)⌝ = ⌜n⌝; (4) `sorryAx` ∉ Ax(H_v).

The formal content is that E ⊢ H_v : n, and that the non-logical assumptions this derivation uses are exactly Ax(H_v) \ STD. The kernel treats an axiom as a constant with a type and no value. So a proof that uses the axioms a₁ : τ₁, …, a_k : τ_k stays valid when they are replaced by bound variables. Hence proved(v) yields the closed theorem ∀ (a₁ : τ₁) … (a_k : τ_k), n, with definitions unfolded, in Lean's logic with STD.

In words: *n holds in every interpretation of the sorts, predicates and functions in its footprint in which the footprint's presuppositions and the statements of its footprint cards hold.* Named constants are `opaque`, and the kernel never unfolds an opaque constant, so no proof can depend on which element a name denotes. Footprints are exact and transitive (D-1).

> conditional(v; u₁ … u_k) ⟺ the same, with ⌜type(H_v)⌝ = ⌜n_{u₁} → … → n_{u_k} → n⌝; it certifies ⊢ n_{u₁} → … → n_{u_k} → n with the given footprint.

**The other values.**
- **assumed**: H_v is an axiom. If that axiom does not state n, the card stays "assumed" but gets TL114, and it cannot serve as a premise.
- **pending-promotion** (flag `claimed`): a DERIVATION whose H_v is still an axiom, after A→D. Proofs that rest on it get `rests-on-claimed`.
- **not-checked**: no usable facts.
- **stale**: the last known status, dimmed.
- **broken**: exists in the data model and in the board's chip list, but **the current code never computes it** (and likewise `unselected-used`, `depends-on-removed`, `signoff-stale`). The user guide (section 7) lists a "broken" chip, so code and docs disagree here.
  - What actually happens: D-11's "keep them, marked broken" removes a `.holds`, and the declarations that used it fail to compile. They then show as `ill-formed` (a Lean error inside the card) or `not checked` (their module failed).
  - Lean's unit of failure is the module, so one broken proof leaves every card of that module, and of the modules that import it, without fresh facts.

**Flags that depend on other cards.**
- `self-evident`: proved, and the footprint contains no card and no `axiom:` entry. The card is proved from presuppositions alone.
- `existence-commitment` (TL108): the footprint contains a presupposition that neither the card's own statement nor the statement of any footprint card presupposes.
- TL102: the proof is conditional, or its footprint contains a goal asserted as an axiom.
- `definitional-choice`: the statement closure uses a definition (D-4).

**Arrows.**
- **declared** (dashed): u ∈ premises(v).
- **verified** (solid): v is proved or conditional, and u ∈ direct(v) ∪ on(v).
  - direct(v) is the set of cards reached from H_v's references in Lean's index. The search follows references through declarations that belong to no card (lemmas, definitions) and stops at the first card `.holds`.
  - Arrows from a conditional proof's hypotheses are marked conditional.
  - They come from references on purpose: a goal proved through a derivation gets the arrow from that derivation, whereas its footprint shows only the derivation's assumptions.
- **lean-ref**: v's statement mentions u's statement.

**Mismatch flags** (only when v is proved or conditional) are judged at the level of assumptions. Let closure(v) be the transitive closure of direct ∪ on, and let rests(x) = {x} unless x is proved or conditional, in which case rests(x) = the footprint cards of x ∪ on(x).
- `declared-unused` (TL109, a hint) on p ⇢ v when p ∉ closure(v).
- `used-undeclared` (TL107, a warning) on u → v when u ∉ premises(v) and rests(u) ⊄ ⋃_{p ∈ premises(v)} rests(p).

**References versus footprints.** References are what the source mentions; the footprint is what the kernel term uses. They normally agree. A constant that automation puts into a proof term without the source naming it can, however, give a footprint entry without an arrow. **The footprint is authoritative.**

---

## 3.5 Kind changes (D-11)

**Principle.** Only the `type:` line and `n.holds` change; statements and names never do. A `.holds` that other declarations use is never removed without an explicit and complete confirmation.

Write H = `n.holds`. Its *users* are:
- the declarations whose references reach H, transitively, across the whole project: other cards' proofs, lemmas without a card, other subjects' proofs;
- while some file is stale, also the declarations found by a textual scan;
- for an axiom H, also every declaration whose Ax contains H although no reference shows it (for example a use through notation).

| change | no code | H absent | H axiom | H theorem |
|---|---|---|---|---|
| G→D | type only | type only ("counts as derived once proved") | type only: now pending promotion | type only ("already proved") |
| G→A, D→A | type only | type plus `axiom n.holds : n` | type only | theorem becomes axiom; the proof is archived in `.telelean/subjects/<S>/attic/` |
| A→D | type only | type only | type only: pending promotion (`claimed`) | type only |
| A→G, D→G | type only | type only | no users: H removed; users: confirm | the same, with the proof archived |

**Effects on dependents, read logically.**
- **G→A, G→D, A→D, and D→A of a non-conditional H.** The users' types do not change, so the users stay valid.
  - G→A introduces a new axiom (a belief the user supplies; the drop asks for an optional reason).
  - D→A trades a proof for an axiom of the same type. The users keep compiling, but their footprints now contain `n.holds` instead of n's assumptions.
  - A→D keeps the axiom and marks it claimed: "never remove a `.holds` that others use until its replacement exists". The card becomes proved once a theorem replaces the axiom, written by hand or by "These suffice" with this card as target.
- **A→G and D→G remove H**, since a goal is never taken as given. When H has users, the user chooses one of two options:
  - **Rewrite** (needs fresh facts for every touched file).
    - Every user d becomes `theorem d (h_n : n) … : …`, with the new hypothesis as its *first* binder.
    - Occurrences of H inside d are replaced by `h_n`.
    - Occurrences of another rewritten user c inside d become `(c h_n)`.
    - Logically this is →-introduction, discharging the axiom, applied to everything that depended on it. Cards whose `.holds` is rewritten become *conditional on n*.
    - The rewrite is refused, and "mark broken" must be chosen instead, in three cases: a user is not a theorem (a def or instance cannot take a hypothesis without changing its type); a use of an axiom H is invisible to the references; or H's type is not of the form `… → n`.
  - **Mark broken**: remove H; the users stop compiling (see 3.4).
- **A conditional H** (`theorem n.holds (h : a) : n`).
  - G→A and D→A replace it by `axiom n.holds : n`, which takes no argument. Its direct users must change: "rewrite" drops the arguments, turning `(n.holds h)` into `n.holds` (the hypothesis is instantiated by the new axiom).
  - The A→G and D→G rewrite replaces every whole application `(n.holds h …)` by the new hypothesis `h_n`.

**Preview and plan.**
- The drop-zone text is computed from the board's graph alone: `proofDependents` follows verified arrows transitively.
- The host then re-plans with the Lean facts across the whole project. It refuses with `needs-confirmation`, listing every dependent, when the dependents the user confirmed do not cover all the ones it finds.

---

## 3.6 The "These suffice" judgement (M2)

### Inputs and preflight

The inputs are P (possibly empty: the tray's "Self-evident?" button, which declares nothing) and T. Before anything else happens, preflight refuses the run unless all of the following hold:
- T is a GOAL or DERIVATION of the board's subject. An ASSUMPTION is held, not proved: make it a Derivation first.
- Every premise is a card of the subject, and T ∉ P.
- No other run of this model folder is active.
- The toolchain is v4.35.0 and the project has no Lake dependencies.
- The sandbox is available, and there is enough free memory.

Then, in order:
1. telelean declares P as T's `premises:`, as an undoable M1 edit. This step is skipped when P is empty or unchanged.
2. It copies the model files into a private working copy.
3. It builds the user's files once. **Lean errors anywhere end the run before Claude is contacted**, because Claude may not change the user's files. This build's facts become B's facts.

### The protocol of one round: formalise, freeze, prove

1. **Formalise.** Claude may:
   - add vocabulary;
   - write statements for T and for selected premises that have none;
   - write `axiom p.holds : p` for selected ASSUMPTIONs;
   - ask the user questions.

   It may write no proofs (rule `proof-before-freeze`).
2. **Freeze** (`freeze_statements([T])`). The freeze rules run. If they pass, telelean records:
   - **the permitted set Perm(F)**;
   - **a snapshot**: every declaration of the subject's modules except theorems, each with its printed kind, type and value; and every axiom of the project;
   - **the challenge for G4**: a copy of the working copy without `T.holds` and everything that uses it, plus a generated module containing `theorem T.holds : T := sorry`. This is the only `sorry` telelean ever writes. The copy is built and exported with `leanexport`.

   Only then is the `freeze` commit made.
3. **Prove.** Proofs are now allowed. No new axiom may be added, and the frozen declarations must stay unchanged. Claude may suggest a missing premise with `propose_assumption`.
4. **Finish** (`finish(status)`). telelean normalises the working copy, then runs the gate on exactly one committed state.

**Rounds.**
- A run's rounds are the first round, each Feedback (back to formalising; a new freeze is needed before "proved"), and each ghost adoption (frozen again at once, with the ghost selected).
- Caps and gate attempts count per round.

### The permitted set

```
Perm(F) = ( STD ∪ Sig ∪ Sel ∪ Pre ∪ DF ) \ { T.holds, sorryAx }

STD = { propext, Classical.choice, Quot.sound }
Sig = { a axiom of the frozen project | a is bound to no card, the sort of type(a) ≠ Prop, and
          a is vocabulary of kind sort, predicate, function or constant,
          or a is no vocabulary item and lies outside every subject's modules (the library root) }
Sel = { p.holds | p ∈ P ∪ G, p has a statement, p.holds is an axiom, and type(p.holds) is exactly p }
Pre = ⋃ { presup(x) | x ∈ {T} ∪ P ∪ G }          (every selected card counts, usable or not)
DF  = ⋃ { Ax(d.holds) \ {sorryAx} | d ∈ P ∪ G, d.holds is not an axiom, d is proved (not conditional),
          T.holds ∉ Ax(d.holds), and the proof is the user's own: d had the same statement in B
          and d.holds has the same source text as in B (Ax taken from B's facts when B has facts) }
unusable = the selected cards that contribute to neither Sel nor DF
```

**Notes on the formula.**
- **The beliefs it admits.** The only beliefs in Perm(F) are the selected `.holds` axioms and the axioms that the user's own proved selected cards rest on.
  - Sel does not depend on the card's type: an assumption, a pending derivation (its claim) and a goal asserted as an axiom all contribute their axiom.
  - A selected GOAL or DERIVATION that has no proof, or only a conditional one, contributes nothing except its presuppositions.
- **Only proofs the user already had contribute.** A proof that Claude writes or changes for a selected premise never widens the set it is itself judged against, and does not widen the next freeze after Feedback either (decisions-log 27). Claude may still prove such a premise and use it as a lemma, but that lemma's own footprint must then lie inside Perm(F).
- **Selecting a proved derivation d permits the assumptions d rests on, not merely d's statement.** "Proved from {d}" therefore certifies that T follows from d's assumptions. The proof need not even pass through d; the report card then lists d as unused. Since d's assumptions entail d, this is a weaker claim than "T follows from d".
- **The target's own `.holds` is never permitted.** A target with pending promotion cannot use its own claim, and a selected derivation that rests on that claim is unusable.
- **The signature trusts the user.**
  - It is project-wide, not limited to the run's subject.
  - It includes the user's own constants declared with `axiom` (an existence claim, which the shape rule refuses for new vocabulary).
  - It includes non-Prop axioms that the user wrote in the library root. Claude cannot edit that file (G0, `outside-subject`).
  - The board shows such axioms as `axiom:` with TL103, while the gate accepts them.
- **No freeze.** In a round that finishes without a freeze, the footprint rule uses the same formula computed over S, with B.
- **Zero premises ("Self-evident?").** Perm(F) = STD ∪ Sig ∪ presup(T).
- **Spyro, normative reading, all three selected:** 13 names (3 standard axioms, 5 signature symbols, 2 presuppositions, 3 selected `.holds`).

### What a "proved" verdict guarantees

Suppose a round ends with verdict `proved`. Let Σ, Π and Α be the parts of Ax(T.holds) that lie in Sig, in Pre and in Sel ∪ DF. Then, in Lean's logic with STD:

> ⊢ ∀ Σ, (⋀ Π) → (⋀ Α) → T

This holds for three reasons:
- the axiom constants can be abstracted (see 3.4);
- G4 compares the types of the permitted axioms, and of T.holds, together with the closures of those types, against the freeze;
- G3 holds every other declaration Claude added to Perm(F).

So the types in Α are the *frozen* statements of the selected premises (and of the assumptions behind the selected user-proved derivations), and the conclusion is T's frozen statement.

In words: *in every situation (every interpretation of the vocabulary) where the named things exist, where the selected premises hold as formalised, and where the assumptions behind any selected derivation hold, the target holds as formalised.* For P = ∅: T, as formalised, is a truth of classical higher-order logic with choice, given the existence of the sorts it mentions (and given the signature, which the user trusts; see above).

### The gate

**Purposes.** Rules are evaluated for one of four purposes:
- `check` (`check_lean`): everything is reported, nothing is blocked;
- `freeze`;
- `gate-proved`: `finish` with status `proved`;
- `gate-other`: `finish` with `not_proved`, `insufficient`, `inconsistent` or `lean_errors`.

**Order.**
1. **G0** looks at text only. Any G0 finding stops the check there: Lean never elaborates text that fails G0.
2. **G1** runs one sandboxed build and the check file.
3. **G3, G5** and the readiness and stage rules run on S with fresh facts.
4. **G4** (the comparator) runs only when there is no finding at all, the status is `proved`, and the round has a freeze.

**Environment failures.** If the sandbox cannot start, memory is low, the job is cancelled or the working copy is unusable, the outcome is "environment". It is not a finding and does not count as an attempt.

**Fail-closed.** If the build had errors and no rule reported one, the engine adds a `build` finding itself.

Each rule below is stated as an invariant that S must satisfy, followed by the attack it blocks.

**G0: text, on changed paths only.** Only the lines Claude wrote are judged. A token on a line whose exact text also occurs in B's version of the file, up to the number of times it occurs there, counts as the user's own. Comments, strings, docstrings and blocks never count.
- `hash-command`: no `#X` except `#check` and `#print`. *Blocks:* `#eval` (code running during elaboration) and `#exit` (which hides the rest of a file from Lean).
- `metaprogramming`: none of `initialize`, `builtin_initialize`, `run_cmd`, `run_elab`, `run_meta`, `run_tac`, `macro`, `macro_rules`, `syntax`, `notation`, `infix`, `infixl`, `infixr`, `prefix`, `postfix`, `elab`, `elab_rules`, `declare_syntax_cat`, `declare_simp_like_tactic`. *Blocks:* code execution during elaboration, and new syntax that changes what existing text means.
- `native-code`: none of `native_decide`, `bv_decide`, `implemented_by`, `extern`, `csimp`; no `native` token anywhere; no `ofReduceBool`, `ofReduceNat`, `reduceBool`, `reduceNat`, however qualified. *Blocks:* proofs that trust compiled code instead of the kernel.
- `unsafe`: no `unsafe`, no `partial`. *Blocks:* code that the kernel does not check as logic.
- `set-option`: no `set_option` at all. *Blocks:* raised limits; `debug.skipKernelTC`, a kernel bypass that fools `#print axioms`; switching `autoImplicit` back on.
- `sorry`: no `sorry`, no `admit`.
- `import`: only modules of the project's library. *Blocks:* code or axioms from outside the project.
- `project-file`: the lakefile, `lean-toolchain` and `lake-manifest.json` stay unchanged. *Blocks:* changed options, toolchain or dependencies.
- `deleted-file`, `outside-subject`, `bad-path`: no file is deleted; only `<library>/<S>.lean` and `<library>/<S>/**` change; a new file is a Lean module of the subject, with identifier path components. *Blocks:* edits to other subjects and to the trusted library root; stray files.

**G1: the build.**
- `build`: the build has no Lean error (the finding carries the whole message, with `file:line:col`), and every changed or new file is imported by the library (otherwise Lean would never check it).
- `budget`: every Lean job stays within `telelean.run.leanJobSeconds` and the memory cap. A violation counts against Claude. Per declaration, only Lean's default heartbeat limit applies, and it cannot be raised because `set_option` is forbidden.

**G3: the semantic rules.**
- `new-axiom` (every purpose).
  - *Invariant:* before the freeze, every axiom not known in B is either the `.holds` of a selected ASSUMPTION or adopted ghost, or vocabulary of its own (bound to no card and not an unmarked axiom). After the freeze, no axiom lies outside F's list.
  - *Blocks:* asserting the goal or a premise; an axiom directly below a card's block used as its "statement"; the `.holds` of a card that is not a selected assumption; new vocabulary after the freeze.
- `existing-changed` (every purpose).
  - *Invariant:* every named declaration of B other than T.holds still exists, with the same source text (docstring and attributes included). When B has facts, each also keeps its printed type and value.
  - *Blocks:* weakening a statement under its own name; turning a vocabulary axiom into an easy definition (whose footprint looks clean); rewriting a gloss; an `open … in`, a section `variable` or a new instance that changes what unchanged text elaborates to. This text-and-meaning comparison stands in for the formal immutability (closure hashes) that 02 and 03 designed and deferred to H.
- `not-proved` (gate-proved).
  - *Invariant:* T is proved in the sense of 3.4: its `.holds` exists, is not an axiom, has no sorry, states T exactly, takes no hypotheses, and was checked by Lean.
  - *Blocks:* a weakened theorem type (`cynder_not_good ∨ True`); a conditional proof; an asserted axiom.
- `status-mismatch` (gate-other).
  - *Invariant:* no non-axiom `T.holds` was added or changed in the run.
  - *Blocks:* a proof of the target that never went through the freeze and G4 reaching the user's files under the label "not proved".
- `statement-changed` (after the freeze: check in the prove stage, and both gates).
  - *Invariant:* every frozen declaration except T.holds keeps its printed kind, type and value.
  - An early warning; G4 is authoritative.
- `footprint` (check in the prove stage and both gates; its "no facts" and "example" variants apply in every purpose).
  - *Invariant:* for every judged declaration d, Ax\*(d) ⊆ Perm if d is a proof, and Ax\*(d) ⊆ Perm ∪ {all presuppositions} otherwise.
  - *Judged declarations:*
    - T.holds;
    - every named declaration added or changed in the run, of any kind: theorem, def, abbrev, instance, opaque, structure, class, inductive (axioms are judged by `new-axiom` instead);
    - every name that only Lean reports inside such a declaration: structure fields, `where` and `let rec` declarations.
  - Ax\* is Ax, plus, for a structure or class, the axioms of the constants its source mentions. The reason: Lean keeps a field's default value in an auxiliary declaration that `#print axioms` does not follow.
  - *Fails closed:* a judged declaration that Lean reports nothing about (for example a `private` one) is a finding. So is an `example` added after the freeze: it has no name, so nothing can check it.
  - *Blocks:*
    - a proof that rests on an unselected assumption;
    - a lemma that rests on one, in a "not proved" round;
    - a proof carried by something that is not a theorem: `def h : PLift p := ⟨p.holds⟩`, an `Inhabited (PLift p)` instance, a field whose default is `p.holds`;
    - private lemmas;
    - examples.
- `sorry-axiom` (every purpose).
  - *Invariant:* no declaration of a changed file depends on `sorryAx`, except the user's own unchanged declaration that already used sorry in B.
  - *Blocks:* sorry reached by other routes, for example Claude's proof using the user's unfinished lemma.
- `vocabulary-shape` (every purpose).
  - *Invariant:* every vocabulary item not known in B passes the shape rule and is not of kind `other`.
  - *Blocks:* the attacks of 3.3.

**G5: markup** (every purpose).
- *Invariant:*
  - Every block of B is still present, in the same file.
  - Its `natural_name` and `rationale` are byte-identical.
  - Its other fields are unchanged: `type`, `premises`, `stance`, `source`, `asserted`, `supersedes`, `refines`, `tags`, `origin`, `session`, `worded_by`. So are its markup version, its extension fields and its notes.
  - Its `id` is unchanged, or is the derived id that telelean wrote back.
  - A `lean:` line is never changed or removed. It is added only to T or a selected card that had no binding in B, naming the new declaration directly below the block.
  - Every card bound in B stays bound to the same statement, and no unselected card becomes bound.
  - No new block appears except telelean's adopted ghosts, which must equal their text at A.
  - T's `premises:` may change only by telelean appending the ids of adopted ghosts.
- *Blocks:*
  - editing the user's words;
  - re-pointing the target's pin at a new, weaker abbrev and freezing that;
  - formalising cards outside the selection;
  - lifecycle changes (type changes, deletions) made by the agent;
  - Claude adding beliefs as new cards.

**Readiness and stage rules.**
- `not-formalised` (freeze and gate-proved).
  - *Invariant:* T, every selected ASSUMPTION and every adopted ghost is bound to an existing Prop abbrev or def.
  - In every purpose: a selected card that had no binding in B must not become bound to something else (token `malformed`). A card left without code is still fine: "could not formalise" is an honest outcome.
  - *Blocks:* freezing a target that has no statement; an axiom used as a card's statement.
- `missing-holds` (freeze and gate-proved).
  - *Invariant:* every formalised selected ASSUMPTION and every ghost has a `.holds` axiom stating exactly it.
  - *Blocks:* a premise that cannot be used, or that asserts something other than its statement.
- `proof-before-freeze` (check in the formalise stage, and freeze, while the round has no freeze; its "example" variant applies in every purpose until the freeze).
  - *Invariant:* nothing added or changed since R is a proof (a theorem, or a Prop-valued def, abbrev, instance or opaque, apart from the presupposition instance). No other added declaration rests on more than the vocabulary layer (STD, the signature, presuppositions): a *carrier*. No example has been added.
  - *Blocks:* choosing the statements to fit a proof that has already been found (the reason D-19 puts an explicit freeze between formalising and proving), including proofs hidden inside definitions.
- `not-frozen` (gate-proved).
  - *Invariant:* the round has a successful freeze.
  - *Blocks:* a claim of "proved" with nothing frozen for G4 to compare against.

**Flagged definitions** are questions, never failures. They are:
- every new definition on a statement path: in the statement closure of T, a selected premise or a ghost; used by a card's statement; flagged `definitional-choice`; or referred to by a vocabulary item that is not itself a definition or lemma;
- every new presupposition.

### The comparator's role (G4)

`lake comparator` (built into Lean 4.35) runs in the build mirror against the frozen export. Its configuration:
- `theorem_names` = [T.holds];
- `permitted_axioms` = Perm(F);
- `definition_names` = [] (empty).

**What it establishes.** This is per telelean's classification of comparator's messages and the M0 and runner tests:
- T.holds exists in the solution and is a theorem.
- Its type is identical to the frozen one, as a Lean term.
- The constants that type depends on (T's abbrev and its closure) are identical to the frozen ones, and so are the stated types of the permitted axioms. So neither the target nor a premise can be weakened or retyped under its own name.
- T.holds uses no axiom outside Perm(F).
- Lean's kernel re-checks the solution's export.

**Tested rejections.** The tests show it rejecting:
- a goal abbrev weakened under the same name (definition mismatch);
- a theorem stated as `cynder_not_good ∨ True` (statement mismatch);
- an unselected assumption, and a smuggled axiom (illegal axiom).

The M0 spike also showed it rejecting a retyped assumption, a missing proof, a vocabulary symbol turned into a definition, and `sorry`.

**Why it is needed in addition to G3.** G3 compares printed text, and only the user's own declarations. G4 compares terms against the freeze, so it also covers statements that Claude formalised in this run. Its kernel replay does not trust the build's environment.

**What it does not do.**
- It judges only T.holds; other declarations are G3's job.
- It runs only for status `proved`.
- It enforces whatever Perm(F) telelean computed, so `permitted.ts` is part of the trusted base.
- A sandbox start-up failure is reported as "could not start" (environment), never as "rejected".

### Normalisation

Before every gate, and after every revert, telelean (not Claude) normalises the files. For T, the selected premises and the ghosts whose statement declaration is new since B and well-formed, it:
- writes the pin (and a derived id that was missing);
- sets the statement's docstring to the escaped sentence (D-9).

It is idempotent and is committed as `normalise`. Its purpose: blocks can then be required to stay byte-identical (G5), Claude never edits blocks, and an accepted formalisation is always pinned.

### The retry loop, the revert and the outcomes

- **Attempts.** An attempt is one `finish` call in a round. The cap is `telelean.run.maxGateAttempts`: default 3, allowed range 1–10.
- **Pass.** telelean commits exactly the judged files as `gate-pass`. Edits Claude makes after `finish` are discarded when its turn ends. The proposal is built from that state.
- **Fail below the cap.** The board shows a notice ("Attempt 1 didn't pass: …"), and Claude receives the exact findings and retries.
- **Fail at the cap ("gave up").** telelean reverts the working copy to the newest *passing* commit: `gate-pass`, `freeze` or `base`. It normalises that state, re-checks it (not counted), and builds the proposal from it. That proposal often holds the formalisation without a proof, which the user can still accept.
- **No finish.** A turn that ends without `finish` gets one reminder. If the next turn also ends without it, the round ends as "no-finish", with the same revert. Reaching the turn or time cap ends it as "cap-reached", likewise.
- **Environment failure in the gate.** It is retried once after 30 s; a second one ends the run as failed.
- **Invariant:** *what the proposal shows is always a judged state.*

**Verdicts.**
- `proved`.
- `not-proved`: a finish with `not_proved` or `lean_errors`.
- `insufficient` and `inconsistent`: these are Claude's claims. They are judged with the gate-other rules only, shown as "not proved" and "Claude reports a conflict (unverified until M3)" respectively, because countermodels and consistency checks are M3.
- `gave-up`, `no-finish`, `cap-reached`.
- `cancelled`, `failed`.

### Ghost premises (suggested missing premises)

`propose_assumption(natural_name, lean_statement, why_needed, proof, lean_name?)` is allowed only after the freeze. The suggestion is checked in four steps:
1. **The single-term rule** (text only, before Lean runs). The statement and the proof may contain:
   - no G0 token;
   - no comment delimiter;
   - no `#` command;
   - no command keyword: `axiom`, `theorem`, `lemma`, `def`, `abbrev`, `example`, `instance`, `structure`, `class`, `inductive`, `opaque`, `namespace`, `section`, `end`, `universe`, `variable`, `import`, `attribute`, `mutual`, `deriving`, `noncomputable`, `private`, `protected`, `open`, `export`, `omit`, `include`, `@[`.

   In addition, the statement may have no `:=` or `|` outside brackets, and its brackets must balance. *Blocks:* text that closes the generated declaration and starts another one. The design reviewer showed that an injected `axiom evil : False` made an unpinned check pass.
2. **A clean check.** The working copy must pass a check first.
3. **A scratch check** on Lean's standard input. Nothing is ever written into the files:

   ```lean
   import Model
   namespace Spyro
   abbrev telelean_ghost_stmt : Prop := <statement, whitespace collapsed>
   theorem telelean_ghost_check : telelean_ghost_stmt → Spyro.cynder_not_good :=
     <proof>
   end Spyro
   #print axioms Spyro.telelean_ghost_check
   ```

   It passes iff Lean reports no error at all, Ax(`telelean_ghost_check`) ⊆ Perm(F), and `sorryAx` is not among those axioms. So the gap proof establishes **⊢ Ghost → T from the frozen selection**: the ghost is a *sufficient* missing premise relative to P. It need not be minimal, plausible or faithful.
4. **`aloneEntails`.** If none of the selected `.holds` axioms (nor the `.holds` axioms inside derivation footprints) occurs in that axiom list, the ghost gives the goal without the selection. The card then says "gives the goal on its own (it may simply restate it)".

**Adoption ("I hold this", possible only in review).**
1. telelean writes, right before T's block:
   - a new ASSUMPTION card (`worded_by: agent`, `origin: agent`, `session`, `asserted` today, the user's optional reason);
   - its docstring;
   - `abbrev <name> : Prop := <the checked text>`;
   - `axiom <name>.holds : <name>`.
2. It appends the new id to T's `premises:`.
3. It re-parses the result to make sure exactly that card appeared and no other binding changed.
4. It freezes again with the ghost selected. Perm grows by the ghost's `.holds` and its presuppositions. If the freeze is refused, the adoption is undone.
5. A new round starts, in the prove stage.

Claude must then prove T and pass the whole gate, G4 included; the gap proof is not reused. Nothing reaches the user's files before Accept, and the card stays marked as Claude's wording.

### Accept and its re-check

- **Preconditions.** Every definition question must be answered "yes"; a "no" is Feedback. The lifecycle item "Make the target a Derivation" (offered only for a target that is a proved GOAL; recommended) is optional.
- **No drift** (the user's model files are unchanged since the run started). The judged state's diff, plus the ticked lifecycle items, is applied as **one history entry and one undo step**.
- **Drift.** Claude's changes are rebased onto the user's current files, with patches that allow no fuzz and use 3 lines of context. An edit of the user's within 3 lines of one of Claude's counts as an overlap, and Accept is refused. On success telelean:
  - normalises;
  - re-freezes, if the verdict is `proved`;
  - re-runs the gate with B := the user's files at Accept. The user's own edits are therefore never judged as Claude's. There are no B facts at this point, so the "meaning" part of `existing-changed` does not run.

  Any failure refuses Accept and keeps the proposal open; on success exactly the re-checked files are applied.
- **Lifecycle items.** The only one is GOAL → DERIVATION of a target that is still proved. It changes only the `type:` line.

### Questions and decisions

- **`ask_user`.** Claude can ask 1–3 questions at a time. Each question has:
  - a phenomenon tag: enthymeme, genericity, modality, negation, presupposition, scalar, vagueness, evaluative-standard, indexical, word-sense, tense, granularity, closed-world or other;
  - 2–4 options, each with its plain consequence;
  - the answer types "own words", "leave it open" and "decide for me".

  Claude's own guess is withheld until the user answers. Each answer has a scope: this run, these cards, or the whole subject. Claude's clock pauses while a question waits.
- **Where answers go.** They are recorded in `.telelean/subjects/<S>/decisions.json`. Answers with scope "subject", or with scope "these cards" when a card in the selection is affected, are sent to later runs as "earlier answers in force".
- **They have no formal effect.** Nothing checks that a formalisation follows an answer. The same holds for `assumed_without_asking`: Claude's list of interpretive choices it made without asking, shown with "Ask me instead".
- **What does gate Accept:**
  - the definition questions (a "yes" to each is required);
  - the review, which shows each new or changed statement beside its sentence, in pretty and fully explicit form, with its closure, before the proof result is revealed;
  - the lifecycle ticks;
  - new vocabulary, which is approved automatically but can be revoked through Feedback.

---

## 3.7 What is not guaranteed

1. **Faithfulness.** The gate guarantees "proved from the selected premises *as formalised*" (A2).
   - **The risk.** Claude writes the Lean for the target when it has none, for every selected assumption that has none, and for any new vocabulary. These formalisations are frozen and become the meaning of the user's words. A too-strong premise (for example `∀ c g, ¬ GoodAddition c g` for "PG games cannot have characters with dark pasts") or a too-weak target makes the proof valid and worthless, and the gate cannot see it.
   - **The safeguards:**
     - Claude is told to ask before formalising when a reading changes the result;
     - the review shows meaning before proof status;
     - definitions on statement paths need a "yes";
     - statements that the user formalised before the run cannot be changed by the run (`existing-changed`, `markup`, G4).
   - **Still to come.** Back-translation, alignment and glosses arrive in M3.
2. **Consistency and vacuity.**
   - Nothing checks that the selected premises are consistent. If they are not, every target is "proved" (from a contradiction), and the footprint is then an inconsistent subset of the premises. Proved results are labelled "consistency unchecked".
   - Non-vacuity is not checked either.
   - "Insufficient" and "inconsistent" are unverified claims.
   - The model finder and Ramsey-sentence certificates (D-1, D-6) are M3.
   - One consequence of the design limits the damage: beliefs are global axioms, but footprints confine the effect of an inconsistency elsewhere in the model to the proofs that actually use it.
3. **What Lean decides, and what TypeScript bookkeeping decides.**
   - **Lean decides:** whether each file elaborates and the kernel accepts it; every printed type, value, kind and axiom list; the references between declarations; and G4's term-level comparison against the freeze, its axiom check for T.holds and its kernel replay.
   - **TypeScript decides, and is trusted:**
     - which declaration is which card's statement (binding);
     - the vocabulary classification (it parses printed types into arrow parts);
     - the partition of axiom lists into signature, beliefs and presuppositions;
     - the permitted set itself;
     - "states exactly n" (text equality);
     - every text comparison (`existing-changed`, `statement-changed`, examples, the "user's own proof" test);
     - the G0 lexer and its line-multiset rule (a heuristic for "Claude's lines", not a proof of absence);
     - the markup comparison;
     - what counts as a proof;
     - the single-term rule;
     - normalisation, adoption and Accept's merge.

     A bug in `permitted.ts` or `rules.ts` could let a wrong verdict pass. The safeguards are a positive and a negative test for every rule, tests on recorded real facts, and end-to-end cheat scripts.
4. **Examples.** An `example` has no name, so Lean's facts say nothing about it. Examples are therefore not checked but refused: every one Claude adds, in every purpose. The user's own examples are neither judged nor touched.
5. **The opt-in `telelean.run.reuseLeanBuild` (off by default).**
   - With the setting off, every run builds from scratch, and nothing of the user's build enters a run.
   - When it is on, a run starts from what the user's `.lake/build` held right after the board's last successful refresh, untouched since. Correctness then rests on Lake's per-module trace check.
   - The residual risk: Lake 4.35 takes no build lock. Two Lake builds writing the same module at the same moment could leave an output that Lake wrongly trusts (in the user's own `.lake/build` too), and the run's facts and the comparator's build would read it.
6. **The prototype sandbox and the deferred hardening.**
   - **What exists:**
     - every Lean process runs under `systemd-run` (memory cap, no swap) and `bwrap` (no network, home folder hidden, sources read-only);
     - Claude has no shell, and its file tools are confined to the working copy by a path-guard hook;
     - nothing reaches the user's files before Accept.
   - **Not done** (milestone H):
     - symlink-proof confinement (`realpath`, `O_NOFOLLOW`);
     - an audited mount allowlist with socket isolation;
     - the full data-type rule;
     - a G0 allowlist checked by Lean's parser. Today G0 is a lexical denylist: instances, `attribute`, `open` and instance priorities are not restricted;
     - `leanchecker` replay (G2);
     - formal immutability of untouched cards through closure hashes (the second half of G5; the planned facts extractor does not exist);
     - the exploit-fixture suite.
   - `#print axioms` trusts the environment. The kernel-bypass option is forbidden by G0, and the comparator replays T.holds's export in the kernel.
   - The system is not hardened against a deliberately adversarial model (personal prototype). The VS Code Lean extension, which is not sandboxed, elaborates accepted code whenever the user opens those files.
7. **Other limitations found in the code.**
   - **The exemption for T.holds is broader than D-11 needs.** In a round that finishes with any status other than `proved`, Claude can delete the user's *existing* proof of T, or turn it into `axiom T.holds : T`, without any finding:
     - `existing-changed` and `new-axiom` both exempt T.holds by name;
     - `status-mismatch` looks only for a `.holds` that is not an axiom.

     After Accept, the board would show the goal "assumed" (TL116); the diff shows the change. This was checked with the real rules on hand-made facts in a scratch probe, not with a repository test.
   - **Text instead of terms.**
     - A `.holds` type that is only definitionally equal to n counts as a mismatch.
     - The meaning check compares Lean's default printing, which hides implicit and instance arguments. So a change in elaboration that prints identically is invisible to it, for example a new instance found by type-class resolution before the freeze.
     - Instances found implicitly are not identifier references, so they do not enter a statement's closure, and they are not flagged as definitions.
     - After the freeze, G4's term comparison covers the target's closure.
   - **Proved derivations stand for their assumptions:** selecting a proved derivation permits the assumptions it rests on (see 3.6).
   - **Module granularity:** one Lean error makes every card of that module, and of the modules that import it, "not checked".
   - **No logical scoping:** suppositions are axioms. Decisions are advice to Claude, not constraints.
   - **Not yet implemented** (M3 or later):
     - more than one target per run;
     - partial Accept;
     - lifecycle items other than G→D;
     - refine, supersede, merge, suspend;
     - Formalise-first;
     - "Ask Claude…";
     - anti-goals.
   - **Resource budgets per declaration are not measured.** Only Lean's default heartbeat limit, the time limit per Lean job and the memory cap apply.

---

## 3.8 Worked example: the Spyro sample

**The starting point.** The sample (`mental_model/`) has this vocabulary:

```lean
axiom Character : Type
axiom Game : Type
axiom Character.exists : Nonempty Character
instance : Nonempty Character := Character.exists
axiom Game.exists : Nonempty Game
instance : Nonempty Game := Game.exists
axiom HasDarkPast : Character → Prop
axiom IsPG : Game → Prop
axiom GoodAddition : Character → Game → Prop
noncomputable opaque cynder : Character
noncomputable opaque newSpyro : Game
```

In `Main.lean`:
- "PG games cannot have characters with dark pasts" is an ASSUMPTION without code, with stance `rule`.
- `cynder_dark_past := HasDarkPast cynder` and `new_spyro_pg := IsPG newSpyro` are assumed, with `.holds` axioms.
- The goal is `cynder_not_good := ¬ GoodAddition cynder newSpyro`, unproved.

On the board:
- pg-no-dark-past is `informal`, with "no source yet";
- the two other assumptions are `assumed`;
- the goal is formalised and unproved;
- three declared arrows point into the goal, and there are no verified arrows.

**The run.** The user selects the three assumptions and the goal and presses These suffice: P = {cynder-dark-past, new-spyro-pg, pg-no-dark-past}, T = cynder-not-good. Claude asks one question (tag: modality): "Does 'cannot have' state a rule about what PG games should not include (normative), or that a PG game is unable to contain such a character (literal)?" A rule is deontic modality; the literal reading is about possibility.

**Reading A, normative** (the scripted run, `normative.json`).

1. Claude writes, directly below the block:

   ```lean
   /-- PG games cannot have characters with dark pasts -/
   abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   The axiom is allowed because pg-no-dark-past is a selected ASSUMPTION.
2. `check_lean` passes; `freeze_statements` succeeds. Perm(F) has 13 names:
   - `propext`, `Classical.choice`, `Quot.sound`;
   - the signature: `Character`, `Game`, `HasDarkPast`, `IsPG`, `GoodAddition`;
   - the presuppositions `Character.exists` and `Game.exists`, contributed by the target's statement and the two formalised premises (`pg_no_dark_past` presupposes nothing);
   - the three selected `.holds`.
3. Claude proves:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good :=
     pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds
   ```

   Re-run for this report:

   ```
   'Spyro.cynder_not_good.holds' depends on axioms: [Classical.choice, Spyro.Character, Spyro.Game,
    Spyro.GoodAddition, Spyro.HasDarkPast, Spyro.IsPG, Spyro.Character.exists, Spyro.Game.exists,
    Spyro.cynder_dark_past.holds, Spyro.new_spyro_pg.holds, Spyro.pg_no_dark_past.holds]
   ```

   These 11 names lie inside the 13 permitted ones.
4. Normalisation adds `lean: Spyro.pg_no_dark_past` to the block.
5. The gate:
   - G0 is clean, and G1 builds.
   - G3: the only new axiom is a selected `.holds`; no pre-existing declaration changed; T is proved with its exact type; its footprint lies inside Perm.
   - G5: only telelean's pin was added.
   - G4: the comparator accepts.
6. The report card:
   - verdict proved;
   - footprint: the three cards plus `presup:Spyro.Character.exists` and `presup:Spyro.Game.exists` ("assumes characters exist", "assumes games exist");
   - no unused premise;
   - "consistency unchecked";
   - lifecycle item "Make it a Derivation", recommended.
7. Accept writes the formalisation, the proof and `type: DERIVATION`.

**What was certified:** ⊢ for all sorts Character and Game, all predicates HasDarkPast, IsPG and GoodAddition, and Cynder and the new game (with characters and games existing): (∀ g c, IsPG g → HasDarkPast c → ¬ GoodAddition c g) → HasDarkPast cynder → IsPG newSpyro → ¬ GoodAddition cynder newSpyro. The proof is a single application. **The content of the result lies entirely in the formalisation of the rule, and that formalisation is Claude's reading of the user's sentence.** This is why the review shows meaning before proof status.

**Reading B, literal** (`literal.json`).

1. Claude adds a predicate to `Vocabulary.lean` and formalises the rule literally:

   ```lean
   /-- is in -/
   axiom InGame : Character → Game → Prop
   abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ InGame c g
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   `InGame` is a predicate over sorts, i.e. pure signature: the review lists it as new vocabulary, which can be revoked. Perm(F) now has 14 names, since `InGame` joins the signature.
2. **The goal does not follow.** Make both sorts a one-element type, make IsPG, HasDarkPast and GoodAddition true everywhere, and make InGame false. Then every premise holds and the goal fails. For this report the refutation of the generalised statement was checked in a scratch file (telelean M2 cannot produce this; M3's model finder is meant to):

   ```lean
   example : ¬ (∀ (Character Game : Type) (cynder : Character) (newSpyro : Game)
       (HasDarkPast : Character → Prop) (IsPG : Game → Prop) (GoodAddition InGame : Character → Game → Prop),
       (∀ g c, IsPG g → HasDarkPast c → ¬ InGame c g) → HasDarkPast cynder → IsPG newSpyro →
       ¬ GoodAddition cynder newSpyro) := by
     intro h
     exact h Unit Unit () () (fun _ => True) (fun _ => True) (fun _ _ => True) (fun _ _ => False)
       (fun _ _ _ _ h => h) trivial trivial trivial
   ```
3. Claude proposes a missing premise:
   - the sentence "A character who cannot be in a game would not be a good addition to it";
   - the statement `∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g`;
   - the proof `fun h => h cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)`.

   The scratch check passes. Re-run: Ax(`telelean_ghost_check`) is the 11 names above plus `Spyro.InGame`, 12 in all, inside the 14 permitted. The suggestion does not give the goal on its own, because it uses the three selected `.holds`.
4. Claude finishes `not_proved`; the gate-other rules pass. The verdict is "not proved", with a "Claude suggests" card.
5. "I hold this" writes the following. This is the exact text of `planGhostAdoption`, generated for this report:

   ```lean
   /-
   @@ telelean v1
   id: a-character-who-cannot-be-in
   type: ASSUMPTION
   natural_name: A character who cannot be in a game would not be a good addition to it
   asserted: 2026-11-02
   lean: Spyro.not_in_game_not_good
   origin: agent
   session: <run id>
   worded_by: agent
   -/
   /-- A character who cannot be in a game would not be a good addition to it -/
   abbrev not_in_game_not_good : Prop := ∀ (c : Character) (g : Game), ¬ InGame c g → ¬ GoodAddition c g
   axiom not_in_game_not_good.holds : not_in_game_not_good
   ```

   The target's `premises:` becomes `cynder-dark-past, new-spyro-pg, pg-no-dark-past, a-character-who-cannot-be-in`.
6. telelean freezes again (15 permitted names). In round 2 Claude proves:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good :=
     not_in_game_not_good.holds cynder newSpyro (pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds)
   ```

   Re-run: the footprint is the 12 names plus `Spyro.not_in_game_not_good.holds`. The verdict is proved, and the adopted card stays marked as Claude's wording.

**What the gate catches on this example.** These are the cheat scripts, run end to end with real Lean (`walkthrough.e2e.test.ts`):

| What Claude does | Outcome |
|---|---|
| `axiom shortcut : cynder_not_good` | `new-axiom` |
| `:= sorry` | G0 `sorry`; Lean is not run |
| target abbrev weakened to `… ∨ True` | `existing-changed` (G4 would report a definition mismatch) |
| theorem stated as `cynder_not_good ∨ True` | `not-proved` (G4: statement mismatch) |
| new-spyro-pg not selected, honest proof | `footprint`, naming `new_spyro_pg.holds` (G4: illegal axiom) |
| target's `lean:` re-pointed at `abbrev … := True` before the freeze | `markup`; the freeze is refused |
| `axiom GoodAddition` turned into `def GoodAddition c _ := ¬ HasDarkPast c` | `existing-changed` (its footprint lies inside Perm) |
| a belief tucked into `def InGame c g := GoodAddition c g` under the literal statement | **passes the gate** as a definition question; Accept is refused until the user says "yes" |
| `#eval 1` next to the honest proof | G0 `hash-command` |
| a proof written before the freeze | a check violation; the freeze is refused |
| a PLift def, an Inhabited instance, a structure default resting on unselected new-spyro-pg | `proof-before-freeze` (carrier) before the freeze; `footprint` after it |
| `example : PLift new_spyro_pg := ⟨new_spyro_pg.holds⟩` | `proof-before-freeze`, then `footprint` (token `example`) |
| `axiom side_goal : Empty` below a selected GOAL card without code | `new-axiom` (statement), `not-formalised` |
| the user's sentence edited | `markup` |

---

## 3.9 Where each rule lives and how to change it

Paths are relative to `packages/`. "Code" means a change in that file plus its tests. Many rules have one positive and one negative test in `core/test/gate/rules.test.ts`, and the runner tests and cheat scripts pin the outcomes.

| Rule or mechanism | Where it lives | How to change it |
|---|---|---|
| Statement form (Prop abbrev/def), `.holds` naming | `core/src/project/build.ts` `isPropStatement`, `holdsKind`; `core/src/facts.ts` `HOLDS_SUFFIX`, `holdsName` | code |
| Binding (pin before adjacency) | `core/src/markup/parser.ts` `bindBlock`, `findFollowingDecl` | code |
| Proof-status table, "states exactly n", conditional | `build.ts` (status section of `buildProject`); `core/src/project/text.ts` `splitTopLevelArrows`, `normalizeWhitespace` | code |
| Footprint partition, TL103 | `build.ts` (footprint loop, `harmless`) | code |
| Standard axioms | `core/src/facts.ts` `STANDARD_AXIOM_NAMES`, and `runner/src/lean/comparator.ts` `STANDARD_AXIOMS` | code (keep both lists equal) |
| Flags (self-evident, existence commitment, rests on claimed, TL102) | `build.ts` (flags section) | code |
| Fresh, stale and unchecked facts | `core/src/project/factsIndex.ts` `FactsIndex`, `kindsAgree` | code |
| Arrows and mismatch flags | `core/src/project/edges.ts` `computeEdges`, `directUses` | code |
| Vocabulary shape rule, presupposition recognition | `core/src/project/vocabulary.ts` `classify`, `buildVocabulary`; `build.ts` `isPresupposition` | code |
| Lean probes and printing options | `runner/src/semantic/checkFile.ts` `generateCheckFile`, `parseCheckOutput` | code |
| D-11 drop-zone previews | `core/src/kindChange.ts` `kindChangeImpact`, `proofDependents` | code |
| D-11 plans (rewrite, mark broken, conditional proofs) | `core/src/edit/planKind.ts` `planKind`, `holdsArguments`; `core/src/edit/dependents.ts` `usersOf`, `axiomListUsers`; the edit operations in `core/src/markup/leanOps.ts` | code |
| Run preflight (target kinds, toolchain) | `runner/src/run/preflight.ts` `preflight`; `core/src/paths.ts` `PINNED_TOOLCHAIN_NAME` | code |
| G0 token denylist | `core/src/gate/g0.ts` `WORD_CODES`, `NATIVE_CONSTANTS`, `HASH_ALLOWED`, `scanForbiddenText` | code |
| G0 file rules | `g0.ts` `checkChangeSet`, `PROJECT_FILES`, `inSubjectScope`, `isSubjectModulePath` | code |
| Permitted set | `core/src/gate/permitted.ts` `permittedAxioms`, `signatureAxioms`, `SIGNATURE_KINDS`, `contribution`, `footprintSinceBase` | code |
| The freeze record | `permitted.ts` `snapshotOf` | code |
| G1, G3, G5, readiness and stage rules | `core/src/gate/rules.ts` `evaluate` (one section per rule code), `markupFindings`, `COMPARED_FIELDS`, `flagged`, `footprintOf`, `SOURCE_REF_KINDS`, `G3_ORDER`, `LATE_ORDER` | code |
| What counts as a proof; the presupposition instance | `core/src/gate/decls.ts` `isProof`, `isPresuppositionInstance` | code |
| Gate order, fail-closed build, when G4 runs | `runner/src/gate/engine.ts` `runCheck`, `gateNow`; `runner/src/gate/findings.ts` `buildErrorFindings`, `classifyFacts` | code |
| Freeze challenge (removal closure, the `sorry` module) | `engine.ts` `freezeNow`, `removalClosure`; `comparator.ts` `freezeChallenge`, `generateChallengeModule` | code |
| Comparator configuration and verdicts | `engine.ts` `compare`; `comparator.ts` `runComparator`, `classifyComparatorRun`; `findings.ts` `comparatorFindings` | code |
| Normalisation | `core/src/gate/normalise.ts` `normalisation`; `engine.ts` `normalise` | code |
| Ghost single-term rule | `g0.ts` `termProblems`, `GHOST_COMMAND_WORDS` | code |
| Ghost check | `engine.ts` `checkGhostNow`; `runner/src/gate/scratch.ts` `ghostScratchSource`, `readGhostScratch` | code |
| Ghost names and adoption | `runner/src/run/manager.ts` `ghostName`, `adoptGhostNow`; `core/src/gate/adoption.ts` `adoptionPlan` | code |
| Gate attempts per round | `manager.ts` `toolFinish` | setting `telelean.run.maxGateAttempts` (3; range 1–10) |
| Other caps | `manager.ts` | settings `telelean.run.maxTurns` (80), `telelean.run.maxChecks` (25), `telelean.run.maxAgentMinutes` (20), `telelean.run.leanJobSeconds` (120), `telelean.memory.capGiB` (4), `telelean.memory.minAvailableGiB` (2) |
| Revert targets | `runner/src/shadow/types.ts` `PASSING_COMMIT_KINDS`; `manager.ts` `settleReverted` | code |
| Retry after an environment failure | `manager.ts` `ENVIRONMENT_RETRY_MS` (30 s) | code |
| Finish status to verdict; the status Accept re-checks with | `manager.ts` `verdictOfStatus`, `statusForRegate` | code |
| Accept: definition approvals, re-check after drift | `manager.ts` `acceptNow`; `runner/src/proposal/service.ts` `planAccept`, `MERGE_CONTEXT_LINES` (3) | code |
| Lifecycle items | `service.ts` `build`; `normalise.ts` `lifecycle` | code |
| Report card (footprint, unused premises, self-evident) | `service.ts` `reportCard` | code |
| What Claude is told | `runner/src/run/systemPrompt.ts`; `runner/src/run/prompts.ts` `renderContextBundle` | code; the system prompt is pinned by `runner/test/run/prompts.test.ts` against `docs/m2-plan.md` section 5.1 and a fixture, so change all three. Setting `telelean.run.contextScope` (subject or neighbourhood) |
| Model and effort | the Claude backend | settings `telelean.model`, `telelean.effort` |
| Reuse of the user's Lean build | `runner/src/shadow/seed.ts` | setting `telelean.run.reuseLeanBuild` (off) |
| Decisions in force for later runs | `core/src/proposal/sidecars.ts` `inForce` | code |

*How this part was checked.* The statements above were derived from the code and tests named in the table. The Lean outputs in 3.8, the adoption text and the T.holds probe in 3.7 were re-run in scratch copies, outside the repository, with toolchain 4.35.0. One probe command was run by mistake in the repository root: it created a file `p2.lean` there, which was deleted at once after its content was confirmed to be the probe text. Nothing else in the repository changed.

## claims
- **claim:** Footprints are Lean's #print axioms lists (collectAxioms), obtained from a generated check file run with pp.fullNames true and pp.proofs false, one #check/#print/#print axioms/#check type_of% probe per declaration, attributed by line.
  - **where:** packages/runner/src/semantic/checkFile.ts:generateCheckFile, parseCheckOutput; packages/runner/src/lean/footprint.ts:parseAxiomsMessage
- **claim:** A card's statement must be a Prop-valued abbrev/def (facts kind def, type Prop); anything else bound to the block is ill-formed (TL113); a missing declaration is TL101.
  - **where:** packages/core/src/project/build.ts:isPropStatement and the formal section of buildProject
- **claim:** n.holds states n only if its printed, whitespace-normalised type equals n's full name, or is n1 -> ... -> nk -> n with every ni exactly a card's statement (conditional); otherwise TL114 holds-mismatch. This is a text comparison, not definitional equality.
  - **where:** packages/core/src/project/build.ts (proof section); packages/core/src/project/text.ts:splitTopLevelArrows, normalizeWhitespace
- **claim:** proved = Lean facts for n.holds exist, it is not an axiom, its type is exactly n, sorryAx is not in its axioms; a theorem without facts is shown 'none' + not-checked, never proved.
  - **where:** packages/core/src/project/build.ts (proof section, holdsFacts checks)
- **claim:** A DERIVATION whose .holds is an axiom is pending-promotion with flag claimed; a GOAL whose .holds is an axiom is 'assumed' with warning TL116; an ASSUMPTION with a theorem .holds is proved/conditional with provable-assumption (TL106); a proved GOAL gets proved-goal (TL105).
  - **where:** packages/core/src/project/build.ts (proof section)
- **claim:** Board footprint partition: standard axioms, sorts, predicates and opaque-declared constants/functions are dropped; a card's .holds maps to the card id; presuppositions to presup:<name>; anything else (including axiom-declared constants) to axiom:<name> with TL103.
  - **where:** packages/core/src/project/build.ts (footprint loop, 'harmless')
- **claim:** self-evident requires a proved card whose footprint has no card and no axiom: entry; existence-commitment (TL108) is a presupposition in the footprint not presupposed by the card's or its footprint cards' statements.
  - **where:** packages/core/src/project/build.ts (flags section)
- **claim:** The status flags 'broken', 'depends-on-removed', 'unselected-used' and 'signoff-stale' are defined and displayed but never set by core; the user guide's 'broken' chip therefore never appears.
  - **where:** packages/core/src/project/build.ts (FLAG_ORDER only, no setter); packages/core/src/model.ts:StatusFlag; packages/webview/src/model/cardData.ts; docs/user-guide.md section 7
- **claim:** Verified arrows come from .ilean references followed through declarations that belong to no card until a card's .holds is reached, not from footprints; mismatch flags (TL109 declared-unused, TL107 used-undeclared) are judged at the assumption level.
  - **where:** packages/core/src/project/edges.ts:directUses, computeEdges
- **claim:** Stale files keep a declaration's previous facts by name while its keyword agrees with the facts' kind; files of failed, dependency-failed or not-built modules get no facts.
  - **where:** packages/core/src/project/factsIndex.ts:FactsIndex, kindsAgree
- **claim:** Vocabulary classification: sort = axiom of type exactly Type; presupposition = axiom 'Nonempty T' for a project sort T; an axiom whose sort is Prop = unmarked-axiom (TL104); predicates, constants and functions only over sorts, without implicit binders; constants/functions declared with axiom are shape violations; everything else 'other' (TL111); defs/structures/inductives/classes/instances = definition; theorems = lemma.
  - **where:** packages/core/src/project/vocabulary.ts:classify, buildVocabulary
- **claim:** A card's presuppositions are the presupposition axioms in the #print axioms list of its statement; statements naming an opaque constant depend on its sort's existence axiom and Classical.choice (re-run: cynder_dark_past depends on Classical.choice, Character, HasDarkPast, Character.exists).
  - **where:** packages/core/src/project/build.ts (lean.presupposes); scratch Lean run on a copy of mental_model
- **claim:** Stance and rationale have no logical effect: they only shape the TL011 message and are passed to Claude as text in the context bundle.
  - **where:** packages/core/src/markup/values.ts:noRationaleMessage; packages/runner/src/run/prompts.ts (context bundle)
- **claim:** D-11 plans: G->A/D->A add an axiom or turn the theorem into an axiom (proof archived); A->D keeps the axiom (pending promotion); A->G/D->G remove .holds, and with users need a confirmed choice. 'rewrite' adds (h_n : n) as each user's first binder and applies it to other rewritten users; it is refused for non-theorem users, invisible axiom uses or non-arrow types and needs fresh facts; confirmedDependents must cover every dependent found.
  - **where:** packages/core/src/edit/planKind.ts:planKind; packages/core/src/edit/dependents.ts:usersOf, axiomListUsers; packages/core/src/kindChange.ts:kindChangeImpact
- **claim:** For a conditional .holds, G->A/D->A require drop-arguments on its direct users, and the A->G/D->G rewrite replaces whole applications (n.holds h ...) by the new hypothesis.
  - **where:** packages/core/src/edit/planKind.ts:planDropArguments, holdsArguments; packages/core/src/markup/types.ts:LeanOp
- **claim:** Run targets must be GOAL or DERIVATION cards of the subject, every premise a card of the subject, the target not among the premises; toolchain v4.35.0 without Lake dependencies, sandbox and memory are checked before anything is created.
  - **where:** packages/runner/src/run/preflight.ts:preflight, selectionProblem, toolchainProblem
- **claim:** Before Claude is contacted, the user's files are built once; Lean errors end the run, and on success B's facts are saved for the meaning check.
  - **where:** packages/runner/src/gate/engine.ts:checkBaseNow; packages/runner/src/run/manager.ts:doStart
- **claim:** Perm(F) = (STD + signature + selected + presuppositions + derivation footprints) minus T.holds and sorryAx.
  - **where:** packages/core/src/gate/permitted.ts:permittedAxioms
- **claim:** The signature is every axiom of the frozen project bound to no card whose sort is not Prop and that is vocabulary of kind sort/predicate/function/constant, or a non-vocabulary non-Prop axiom outside every subject's modules (the library root).
  - **where:** packages/core/src/gate/permitted.ts:signatureAxioms, SIGNATURE_KINDS
- **claim:** Any selected card (any type) whose .holds is an axiom stating exactly its statement contributes that axiom; derivation footprints come only from proved, non-conditional, non-circular proofs whose statement and .holds source text are unchanged since B (B's axiom list when B has facts).
  - **where:** packages/core/src/gate/permitted.ts:contribution, footprintSinceBase
- **claim:** Selecting a proved derivation adds the axioms its proof rests on (its assumptions' .holds) to the permitted set, not just its statement.
  - **where:** packages/core/test/gate/permitted.test.ts ('a selected proved derivation adds its footprint (it acts as a lemma)')
- **claim:** For the Spyro normative reading with all three premises selected, the permitted set has exactly 13 names; with zero premises it is STD + signature + the target's presuppositions.
  - **where:** packages/core/test/gate/permitted.test.ts ('exactly the 13 names', 'zero premises')
- **claim:** Gate order: G0 (text) short-circuits before any Lean process; then one build plus check file (G1), then G3/G5/readiness/stage rules; G4 runs only when there is no finding, the status is proved and the round has a freeze; build errors without a rule finding are added fail-closed.
  - **where:** packages/runner/src/gate/engine.ts:runCheck, gateNow; packages/runner/src/gate/findings.ts:buildErrorFindings
- **claim:** G0 judges only paths that differ from B and only Claude's lines (a line-multiset comparison with B's version of the file), using the Lean lexer so comments, strings and blocks never count.
  - **where:** packages/core/src/gate/g0.ts:scanForbiddenText, checkChangeSet
- **claim:** G0 forbids # commands other than #check/#print, metaprogramming keywords, native-code tokens (including any 'native' and ofReduceBool-like constants), unsafe/partial, any set_option, sorry/admit, non-project imports, project-file changes, deletions, edits outside the subject and badly named new files.
  - **where:** packages/core/src/gate/g0.ts:WORD_CODES, NATIVE_CONSTANTS, HASH_ALLOWED, PROJECT_FILES, isSubjectModulePath
- **claim:** new-axiom: before the freeze every axiom not known in B must be a selected ASSUMPTION's or ghost's .holds or vocabulary of its own (bound to no card, not an unmarked axiom); after the freeze no axiom outside the frozen list.
  - **where:** packages/core/src/gate/rules.ts:evaluate (new-axiom section, notVocabulary, allowedHolds)
- **claim:** existing-changed: every declaration of B except T.holds keeps its source text (docstring included) and, with B's facts, its printed type and value; the meaning check uses default pretty-printing (pp.fullNames, no pp.explicit).
  - **where:** packages/core/src/gate/rules.ts (existing-changed section); packages/runner/src/semantic/checkFile.ts:generateCheckFile
- **claim:** footprint judges T.holds and every declaration added or changed in the run, of any kind, plus names only Lean reports inside them; proofs must rest on Perm, other declarations on Perm plus presuppositions; structures/classes also answer for constants their source mentions; declarations without facts and examples after the freeze fail closed.
  - **where:** packages/core/src/gate/rules.ts (footprint section, footprintOf, SOURCE_REF_KINDS)
- **claim:** proof-before-freeze refuses proofs (theorems or Prop-valued defs/instances/opaques except the presupposition instance) and carriers (other declarations resting beyond STD, signature and presuppositions) added since the round start; every example added since B is refused in every purpose.
  - **where:** packages/core/src/gate/rules.ts (proof-before-freeze and examples sections); packages/core/src/gate/decls.ts:isProof, isPresuppositionInstance
- **claim:** The markup rule keeps every block of B in its file with byte-identical natural_name/rationale and unchanged fields, never changes or removes a lean: line, keeps every binding of B, forbids formalising unselected cards and new blocks except telelean's ghosts, and allows T's premises to change only by telelean's appended ghost ids.
  - **where:** packages/core/src/gate/rules.ts:markupFindings, COMPARED_FIELDS, adoptedPremises
- **claim:** Readiness rules (not-formalised, missing-holds) apply to freeze and gate-proved only; the 'malformed' variant of not-formalised applies in every purpose; not-proved applies to gate-proved, status-mismatch to gate-other.
  - **where:** packages/core/src/gate/rules.ts (readiness, not-proved, status-mismatch sections)
- **claim:** statement-changed compares, after the freeze, every frozen non-theorem declaration of the subject (printed kind, type, value) except T.holds; the frozen snapshot also lists every axiom of the project.
  - **where:** packages/core/src/gate/rules.ts (statement-changed section); packages/core/src/gate/permitted.ts:snapshotOf
- **claim:** The freeze copy drops T.holds and every declaration that transitively uses it, adds the generated module 'theorem T.holds : T := sorry', builds and exports it with leanexport; the freeze commit is made only after a successful export.
  - **where:** packages/runner/src/gate/engine.ts:freezeNow, removalClosure; packages/runner/src/lean/comparator.ts:freezeChallenge, generateChallengeModule
- **claim:** G4 runs lake comparator with theorem_names [T.holds], permitted_axioms = Perm(F) and empty definition_names; rejection reasons are classified from stderr, and start-up failures are 'could not start' (environment), never 'rejected'.
  - **where:** packages/runner/src/gate/engine.ts:compare; packages/runner/src/lean/comparator.ts:runComparator, classifyComparatorRun; packages/runner/src/gate/findings.ts:comparatorFindings
- **claim:** The comparator is tested to accept the honest proof and reject a weakened goal abbrev (definition mismatch), a weakened theorem type (statement mismatch), an unselected assumption and a smuggled axiom (illegal axiom).
  - **where:** packages/runner/test/lean/comparator.test.ts
- **claim:** Normalisation pins lean: and writes derived ids and docstrings only for statements of T, premises and ghosts that are new since B and well-formed; it is committed as 'normalise' before every gate.
  - **where:** packages/core/src/gate/normalise.ts:normalisation; packages/runner/src/gate/engine.ts:normalise; packages/runner/src/run/manager.ts:runGate
- **claim:** Gate loop: attempts per round capped by maxGateAttempts (default 3); at the cap the working copy reverts to the newest gate-pass, freeze or base commit, is normalised and re-checked; edits after a passing finish are discarded; environment failures are retried once after 30 s.
  - **where:** packages/runner/src/run/manager.ts:toolFinish, settleAccepted, settleReverted, ENVIRONMENT_RETRY_MS; packages/runner/src/shadow/types.ts:PASSING_COMMIT_KINDS
- **claim:** Finish statuses map to verdicts: proved; not_proved and lean_errors to not-proved; insufficient and inconsistent are Claude's claims judged only by the gate-other rules.
  - **where:** packages/runner/src/run/manager.ts:verdictOfStatus; packages/core/src/run.ts:RunVerdict
- **claim:** Ghost check: single-term text rule, a clean check of the working copy, then a scratch file 'theorem telelean_ghost_check : telelean_ghost_stmt -> T' on Lean's stdin that must have no errors, axioms inside the frozen Perm and no sorryAx; aloneEntails = no selected .holds among its axioms.
  - **where:** packages/runner/src/gate/engine.ts:checkGhost, checkGhostNow; packages/runner/src/gate/scratch.ts:ghostScratchSource, readGhostScratch; packages/core/src/gate/g0.ts:termProblems
- **claim:** Adoption writes the ghost card (worded_by agent), its docstring, abbrev and .holds axiom right before T's block, appends its id to T's premises, re-parses to confirm no other binding changed, then re-freezes with the ghost selected and starts a new prove-stage round.
  - **where:** packages/core/src/gate/adoption.ts:adoptionPlan; packages/runner/src/run/manager.ts:adoptGhostNow
- **claim:** Accept requires every definition question approved; it re-checks only when the user's files drifted, with B = the user's files at Accept (no facts), re-freezing only for a proved verdict; patches use 3 context lines and no fuzz.
  - **where:** packages/runner/src/run/manager.ts:acceptNow, statusForRegate; packages/runner/src/proposal/service.ts:planAccept, MERGE_CONTEXT_LINES
- **claim:** The only lifecycle item is GOAL -> DERIVATION of a target that is still proved, changing only the type: line.
  - **where:** packages/core/src/gate/normalise.ts:lifecycle; packages/runner/src/proposal/service.ts (build)
- **claim:** Decisions in force for later runs are those with scope subject, or scope nodes touching the selection; they are only text in the context bundle, with no formal effect.
  - **where:** packages/core/src/proposal/sidecars.ts:inForce; packages/runner/src/run/manager.ts:contextBundle
- **claim:** Gap found: in a round finishing with any status but proved, deleting the user's existing proof of T, or turning it into 'axiom T.holds : T', produces no finding, because existing-changed and new-axiom exempt T.holds by name and status-mismatch only looks for non-axiom proofs.
  - **where:** packages/core/src/gate/rules.ts (exempt set in existing-changed; inBase skip in new-axiom; status-mismatch); scratch probe running evaluateRules with packages/core/test/gate/helpers/spyroRun.ts
- **claim:** The signature admits the user's own axiom-declared constants (and non-Prop axioms of the library root), while the board's footprint shows them as axiom: entries with TL103.
  - **where:** packages/core/src/gate/permitted.ts:signatureAxioms vs packages/core/src/project/build.ts ('harmless'); docs/decisions-log.md section 27
- **claim:** No leanchecker replay (G2), no facts extractor and no closure hashes exist; G0 is a lexical denylist (instances, attribute, open and priorities are not restricted).
  - **where:** packages/runner/src/lean/toolchain.ts (leanchecker only as a type); packages/core/src/gate/g0.ts; docs/m2-plan.md section 1.5
- **claim:** telelean.run.reuseLeanBuild defaults to off, so a run builds from scratch; when on, correctness rests on Lake's per-module check.
  - **where:** packages/extension/package.json (contributes.configuration); packages/runner/src/shadow/seed.ts; packages/runner/src/run/manager.ts:doStart (copyBuild)
- **claim:** Worked example, re-run with Lean 4.35 in scratch copies: the normative proof's footprint has 11 names; the literal ghost check has 12; the proof after adoption has 13 (adds Spyro.not_in_game_not_good.holds); the generalised literal argument is refuted by a one-element countermodel.
  - **where:** scratch copies of mental_model with the edits of test-fixtures/walkthrough/normative.json and literal.json; docs/m2-plan.md section 0 facts 2, 3, 7
- **claim:** The system prompt is pinned byte-exactly to docs/m2-plan.md section 5.1 and a fixture by a test, so changing what Claude is told means changing all three.
  - **where:** packages/runner/src/run/systemPrompt.ts; packages/runner/test/run/prompts.test.ts
- **claim:** Process note (not a claim about telelean): one probe command ran by mistake in /home/zhengyew/telelean and created p2.lean there; it was verified to be the probe text and deleted immediately; Lake wrote nothing (no .lake, no manifest); only the root directory's modification time changed; ~/.elan/known-projects stayed at 37 lines.
  - **where:** this job's scratch commands (report-part3)

