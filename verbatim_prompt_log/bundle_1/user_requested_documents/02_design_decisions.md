# 02 — Unspoken constraints and the design decisions they force (Step 2)

*Answers Implementation step 2 (S48). Each decision cites the implied constraints (`IC-`) from `01_consolidated_idea.md` Appendix C, plus the mid-turn prompts (M1–M4).*

*How this version came about:*
- *seven independent reviewers examined the first draft* (`../subagent_reports/review_workflow/`; 85 issues, each with a disposition in its `DISPOSITIONS.md`);
- *two fresh verifiers then checked the revision* (`../subagent_reports/verification_workflow/`; 38 problems, all fixed here, see its `DISPOSITIONS.md`).

**Evidence labels.**
- **ran** — executed on this machine: Lean 4.35.0 / Lake 5.0.0, VS Code 1.140, bubblewrap 0.9.
- **read** — taken from source code or typings.
- **documented** — official docs or CLI help; policy pages saved byte-exact in `../subagent_reports/policy_sources/`.
- **designed** — not yet exercised; it becomes evidence once the exploit fixtures exist.

**How to respond.** Items marked **★** need your call; everything else is a default. The quickest reply is "approve the ★ recommendations", plus overrides by number, e.g. "D-17: click expands". **D-23b (the smoke test) is a separate yes/no; if you don't answer it, the answer is no.**

---

## Summary of the ★ decisions

| # | Question | My recommendation |
|---|---|---|
| D-1 ★ | How are your beliefs encoded in Lean? | Global `axiom`s, which give exact per-result assumption sets. Models and countermodels are generated as Ramsey sentences, the bundled-hypotheses view of your `smoking.lean` |
| D-2 ★ | A formalised but unproved statement | Your S37 style: `abbrev n : Prop := S`, plus `n.holds` (an `axiom` for an assumption, a `theorem` for a derivation, absent for a goal). **No `sorry` in your files** |
| D-3 ★ | (a) Vocabulary rules; (b) should the *presuppositions* of the constants named in the selected statements (e.g. "characters exist") count automatically? | (a) Strict data-type rules, computed from Lean, with no new markup type. (b) **Yes**, shown in the tray and the review, never hidden. Existence assumptions that a proof uses but your statements don't mention must be selected explicitly |
| D-4 ★ | Which modelling style should Claude default to? | Uninterpreted vocabulary. Your records/frames/degree-and-threshold style when you choose it, through a footprint-preserving pattern. Definitions on a statement path need your endorsement |
| D-10 ★ | One mental model per project, or several? | Several **subjects** per project (module subtree + namespace), with a subject picker |
| D-13 ★ | (a) What an arrow means; (b) may arrows run within a column (D→D)? | (a) Declared support (dashed, stored) vs Lean-verified dependency (solid); arrows into assumptions are kept as declared support. (b) **Yes** |
| D-16 ★ | The text box | Exactly **A \| D \| G**: the switch marks the node you add, and adding never calls the LLM. Prompts to Claude go through "These suffice" and a separate "Ask Claude…" composer |
| D-17 ★ | Click and drag (S25 "click on the goal" vs S40 "click … expand") | Click **selects**; a chevron expands. Changing a node's kind uses drop zones that preview the impact, with in-board Undo |
| D-18 ★ | Node lifecycle | Delete / suspend / **refine-supersede** (like your "h1 is actually …") / merge; attempts history |
| D-19 ★ | Run protocol | **One-shot**: one diff at the end, as in S31. An explicit freeze sits between formalising and proving, and the end review shows meaning before proof status |
| D-20 ★ | (a) Where are your answers to Claude's questions kept? | (a) `.telelean/decisions.json` (sidecar), not markup blocks in your Lean files. Questions are tagged by phenomenon and have no pre-selected answer |
| D-23 ★ | (a) How Claude is driven. **(b) May I spend a little of your quota on one short smoke test in M0? (yes/no)** | (a) Agent SDK driving the *unmodified* binary under your login, with a CLI stream-json backend as fallback. Personal use only. (b) Your call |
| D-27 ★ | Is an LSP the right design? | **Not now.** A core library, plus a `.telelean/graph.json` snapshot for scripts; CLI and editor features in M4 |
| D-29 ★ | When do you start using it? | **M1** map without AI → **M2** one-shot "These suffice" (*start real use*) → M3 faithfulness → M4 integration |
| D-31 ★ | Headless integration tests | `sudo apt install xvfb`, or the installed Xephyr, or visible windows |
| D-32 ★ | `mental_model/graph_representation/`? | Question for you. I'd make `mental_model/` the sample model workspace |

Defaults you are unlikely to want changed, because they follow your text or protect soundness:
- your `type:` field is kept;
- the selection's meaning is strict (D-5);
- the LLM never adds beliefs (D-6);
- `autoImplicit` is off (D-7);
- every Lean process runs sandboxed, and telelean is opt-in per folder (D-24, D-28).

---

## Prototype profile (personal use): what the first versions include, and what is deferred

*Added after your mid-turn prompt 5.* telelean is a prototype for your own use, and Claude is a cooperative assistant, not an attacker. Most of the security detail that the review rounds surfaced therefore matters only against a deliberately misbehaving model, or for a tool shared with others. The prototype (M1–M2) keeps only what makes the tool's central claim true, plus safety that costs almost nothing. The central claim is: **"proved" means proved from exactly the assumptions you selected.**

**Kept in the prototype.** These are about *integrity*, not security. An LLM asked to "prove the goal" does sometimes take shortcuts, and these checks are what stop the board from lying to you:
1. **Footprint check.** Lean's `#print axioms` must show only your selected assumptions, Lean's 3 standard axioms, plain vocabulary, and the presuppositions (D-5).
2. **No `sorry`** in anything shown as proved.
3. **Statement unchanged.** Claude proves exactly the statement you see in the review, so it cannot quietly weaken the goal. This uses `lake comparator`, which is built into Lean 4.35 and takes about 3 s.
4. **Simple vocabulary rule.** Claude may add only plain types (`axiom T : Type`), predicates (`… → Prop`) and named constants. Any definition or structure is shown to you for a yes/no, because definitions can quietly encode beliefs.
5. **No shell for Claude.** It edits a copy of your model files, and nothing touches your files until you accept the diff.
6. **Lean builds run under a memory cap** (your RAM history) **in a basic sandbox**: no network, home folder hidden. Lean files can execute code while they compile, so this is one small wrapper around the already-installed `bwrap` + `systemd-run`.
7. **Opt-in per folder.** telelean only switches on in folders you initialise.

**Deferred to an optional hardening milestone (H)**, to do if you ever share telelean or want belt-and-braces:
- symlink-proof confinement of Claude's file tools (realpath, `O_NOFOLLOW`);
- the fully audited sandbox profile (mount allowlist, D-Bus/keyring socket isolation);
- the complete vocabulary data-type rule for exotic types (`Subtype`, `Sigma`, `Sort u`);
- kernel replay (`leanchecker`) against environment hacking;
- formal-immutability checks on untouched nodes (G5's second half);
- the full exploit-fixture test suite.

Sections D-3, D-24 and D-26 below describe the *full* design. Each says which parts belong to the prototype.

---

## A. Logic and the Lean encoding

### D-1 ★ How beliefs are encoded (IC-1, IC-2)
**Why it matters.** S5 calls assumptions axioms, S7 forbids derivations that need new assumptions, and S28 asserts that a *selected subset* suffices. Lean must be able to say exactly which beliefs each result rests on.

**Options.**
- **(a) Global `axiom`s.**
  - `Lean.collectAxioms` gives each theorem's exact, transitive assumption set (ran). On the corrected walkthrough example (03 §3.3), the goal's proof yields exactly: `Classical.choice`, the signature axioms, the presuppositions `Character.exists`/`Game.exists`, and the three `….holds` assumptions (ran).
  - `lake comparator` enforces "only these axioms". It rejects a proof that uses a declared but unselected assumption (ran).
  - Risk: an inconsistent belief set makes everything provable (handled in D-6).
- **(b) Bundled hypotheses**, `structure World …; theorem t (W : World) : …`, the style of your `smoking.lean`. A model is an instance, as with your `paternalismFree`. Dependency tracking needs custom analysis, and the selection must be enforced through statement shape.
- **(c) Section `variable`s.** Ruled out: on 4.35 a hypothesis used only in a proof body is not included (ran).

**Recommendation: (a), with (b)'s strengths generated.** For consistency or independence, telelean builds the Ramsey sentence `∃ vocabulary, A₁ ∧ … ∧ Aₙ` (and `… ∧ ¬G`). A witness proved using at most `propext`, `Quot.sound` and `Classical.choice` is exactly an instance of the bundle structure, i.e. a model (prototyped). You author in the simple style; the bundle is derived.

### D-2 ★ Formalised-but-unproved statements (IC-6, IC-24; S37, S39) — *changed after review*
**Options.**
- **(a)** `theorem g : S := by sorry`. Conventional, and your S39 wording fits it colloquially. But formally `sorry` *inhabits* `S` via `sorryAx`: it asserts the goal, and other proofs can use it, flagged only anonymously.
- **(b) Statement + justification.** `abbrev n : Prop := S` for every formalised node, plus `n.holds`: `axiom n.holds : n` for an ASSUMPTION, `theorem n.holds : n := …` for a DERIVATION, and nothing for a GOAL.
  - This matches the `def cynder_not_ …` of your S37 example and the Lean-semantics research's verified recommendation.
  - **Your files contain no `sorry`.** The comparator's internal challenge module, which telelean generates, does contain one (D-26).
  - A derivation that rests on an unproved node must say so: `theorem d.holds (h : g) : d`.
  - **Costs:**
    - two declarations per node;
    - a little `simp` friction (`unfold n` first, ran);
    - kind changes that remove a `.holds` used by others need care (D-11).

**Recommendation: (b).** Code-less nodes remain pure comments (S38).

### D-3 ★ Vocabulary rules and presuppositions (IC-4, IC-23; S32) — *tightened after two rounds of verified exploits*
**Why it matters.** Vocabulary can smuggle beliefs. All of the following were accepted by `lake comparator` (ran):
- a Type-valued record with a Prop field, whose `Nonempty` instance was proved from the very assumption being hidden;
- universe-polymorphic `Character : Sort u` instantiated at `Prop`;
- `axiom Character : Prop`, whose inhabitants are then all equal by proof irrelevance;
- a constant of type `{g : Game // IsPG g}`, whose existence presupposition *is* the belief.

**Recommendation.**
- **Computed, not marked up.** Vocabulary needs no new markup type. The board shows it, derived from Lean, in a collapsible **Vocabulary** group at the top of the Assumptions column. The group expands with a "+3 new" count whenever a proposal adds vocabulary, so S32's new nodes stay visible. Glosses come from the docstrings, styled as *Claude's wording* until you rewrite them.
- **The data-type rule** (enforced by G3, D-26). *The prototype enforces the simple shape check: new axioms must be `T : Type`, predicates ending in `Prop`, constants, or your assumptions. Anything else goes to you for a yes/no. Rule 2's exotic-type cases arrive with hardening (H).*
  1. Sort axioms are 0-ary `axiom T : Type` only: no `Sort u`, no universe parameters, and no `axiom T : Prop` used as a sort.
  2. Every predicate's binders, every constant's type, and every field or parameter of an endorsed structure or inductive must be a **data type**. That means those sorts, function types between them, or data-only structures and inductives. No `Subtype`, `Sigma`, `PLift`, Prop fields, or `Prop`-indexed families.
  3. Predicates and relations end in `Prop`: `axiom HasDarkPast : Character → Prop`.
  4. Any other Prop-valued axiom is a belief, i.e. an ASSUMPTION.
- **Constants** are `noncomputable opaque cynder : Character`, which needs a `Nonempty Character` instance.
- **Presuppositions.** telelean generates the existence axiom `axiom Character.exists : Nonempty Character`, plus its instance, *only* for 0-ary data sorts.
  - This is a **presupposition** in the linguist's sense: naming "Cynder" presupposes that characters exist. Making it explicit is presupposition accommodation.
  - It has a computed role, `presupposition`: no markup block, id `presup:Spyro.Character.exists`, exempt from the hidden-assumption warning and from D-2's form.
  - The chip reads "assumes characters exist", because it covers every character, not just Cynder.
- **Approval.** "Pure signature" auto-approval applies only to items that satisfy rules 1–3. Presuppositions created during a run are always listed in the end review and never auto-approved.
- **(b) The ★ question.** Should the presuppositions of constants that occur in the selected statements count automatically? I recommend yes. The tray and the review show them: "prove G from {A1, A2, A3} + presupposes: characters exist, games exist".

### D-4 ★ Modelling style and definitions (IC-3, IC-4, IC-21)
**Why it matters.** Definitions carry meaning. An LLM can move a belief into a `def` body; it then drops out of `#print axioms`, and the goal holds *by definition* (ran). Your own models use structured data: `cynder: Character { past: "dark" }`, `uptake .child = 90`, `structure Ethics`.

**Recommendation.**
- **Default to uninterpreted vocabulary.** It is faithful and decides nothing for you.
- **Your records style, when you choose it,** uses a **footprint-preserving pattern**. The structure is signed-off vocabulary obeying D-3 rule 2, the instance is an `opaque` constant, and each fact is an ASSUMPTION over its fields: `abbrev cynder_past : Prop := cynder.past = "dark"` + `axiom cynder_past.holds : cynder_past`. That way "Cynder has a dark past" stays in every footprint that uses it.
- **Gradable terms** use *degree + threshold*, your `highChance ≤ risk a o`, with the threshold as a node carrying a rationale.
- **Levels of detail (S30).** Formalisation can be gradual. A coarse first level keeps *your own phrase* as the predicate, `axiom «is a bad character to include in the» : Character → Game → Prop`, as in your cynder.lean. A "refine one level" action deepens it (D-18).
- **Closed-world choices** (an `inductive` listing exactly the characters you named) are recorded as DECISIONs (D-20).
- **Endorsement.** Any definition in the *statement closure* of a goal, a selected assumption, or vocabulary needs your endorsement: `def`, `abbrev`, `structure`, `inductive`, instances, coercions. Proof-only definitions are conservative and need none. Notation is not allowed in model files (G0).
- **Question for you.** Should Claude default to your records style instead?

### D-5 Strict selection, and the obligation shown in the tray (IC-1, IC-31; S25, S28)
**Default: strict.**
- **The permitted set**, computed from the frozen snapshot (D-19) and passed to `lake comparator` (ran):
  - Lean's three standard axioms;
  - signature axioms (D-3 rules 1 and 3);
  - the selected assumptions;
  - the presuppositions of constants that occur in the selected statements (D-3b);
  - the footprints of selected derivations, which act as lemmas.
- No new axiom may appear after the freeze (ran).
- **Zero premises** is allowed, labelled **"Self-evident?"**, your `self_evident ?-`.
- **The tray** has an explicit **⊢ target** slot and shows the expanded obligation. For informal selections, presuppositions appear once Claude has formalised the statements, in the review.

### D-6 The LLM never adds beliefs; answers are certified (IC-2, IC-10, IC-21)
**Default.**
- **Proved** results show the exact footprint.
- **The finite model finder (M3)** tries small interpretations: sorts as `Fin 1`/`Fin 2`, predicates as truth tables. The kernel checks the witness with `decide`. It certifies consistency of the footprint and *non-vacuity*. Until then a proof is labelled "proved (consistency unchecked)".
- **Insufficient** is reported only with a kernel-checked countermodel (M3), phrased as an answer: "No — here is a situation where all of them hold and the goal fails: …". Without one, the result is just "**not proved**".
- **Inconsistent**: the footprint of a proof of `False` is shown as *an* inconsistent subset (minimisable).
- **Ghost assumptions (M2)** are Claude's candidate premises.
  - Each must come with a gate-checked proof that it closes the gap, and a ghost that alone entails the goal is flagged.
  - They are drawn **translucent with a "Claude suggests" marker**. Dashing is reserved for *your* declared support.
  - You adopt one with "I hold this". A rationale is encouraged but not required, and Claude's suggested wording stays marked as Claude's.

### D-7 Lean project defaults (IC-14, IC-15)
**Default.**
- **Options.** `lakefile.toml` with `autoImplicit = false` and `relaxedAutoImplicit = false`. Lean's default silently turns a typo like `hasDarkPast cyndr` into `∀ {cyndr}, …` (ran).
- **Toolchain.** The exact pin `leanprover/lean4:v4.35.0`, which is also the **floor**: comparator and leanexport exist only from 4.35 (ran). Projects on other toolchains get the board in syntactic mode.
- **No Mathlib.**
- **Limits.** Agent code may not raise `maxHeartbeats` or other limits, and each declaration gets a time and memory budget (D-26).
- **Tests and tools** call the toolchain's own `lake` rather than elan's proxy, so nothing is written to `~/.elan/known-projects` (ran).

---

## B. Representation

### D-8 Markup syntax (IC-8, IC-19; S35–S37, S43) — *your `type:` kept*

```
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

- **Format.** Line-oriented `key: value`, **not YAML**. YAML's implicit typing mangles natural language: `NO` becomes `false`, and `PG games #1 rule` is truncated (ran).
- **Fields.**
  - `type` is canonical, as in your sketch; `kind` is accepted silently.
  - `id` is written by telelean: a stable, transliterated slug, with `n-<hex>` as the fallback for non-Latin text.
  - **A block without an `id`, like your S37 sketch, is accepted.** telelean derives one, writes it back on the next edit or through a quick fix, and reports only an info diagnostic.
  - Optional fields: `rationale`, `premises`, `lean` (explicit binding), `asserted` (ISO date, written when you add the node), `stance` and `source` (D-14), `supersedes` and `refines` (D-18), `tags`, `origin`, `session`, `worded_by`.
- **Language.** Sentences may be in any language, and back-translations are produced in the sentence's own language.
- **Version marker.** `@@ telelean v1` is optional; absent means v1, with no nagging.
- **Escaping.** A value that contains a comment delimiter, or starts with a quote, is written as a JSON string:
  - `-/` is written as `-\/`;
  - `/-` is written as `\u002f-`, i.e. backslash, `u`, `0`, `0`, `2`, `f`, then `-`.
  - In the Markdown body, `-\/` and `/\-` are used instead.
  - A stray `/-` would comment out the rest of the file (ran). Round-trip tests write sentences containing both delimiters and check that the file still compiles.
- **Binding.** By adjacency (the next declaration; a blank line means code-less). Once a node is formalised, telelean **pins** the binding with a fully-qualified `lean:`.

### D-9 Where the natural-language text lives (IC-19, IC-29; S40) — *docstring mirror on*
**Default.**
- The block is the source of truth, because code-less nodes cannot have docstrings: a dangling `/-- -/` is a parse error (ran).
- **Following your S40 suggestion**, formalised nodes get a generated docstring `/-- <natural_name> -/`, so Lean's own hover shows your sentence. The gate checks that it matches.

### D-10 ★ Subjects: several mental models per project (S2 "about a subject")
**Why it matters.** Your `~/telelean_scripts/` holds five subjects with cross-references (bayonetta: "compare cynder.lean"). In one shared namespace, two subjects that both declare `Character` break the whole build (ran).

**Recommendation.** A subject is a module subtree plus a namespace: `Model/<Subject>/{Vocabulary,Main,Inbox}.lean` under `namespace <Subject>`.
- The board has a **subject picker**.
- Selections and agent context stay within one subject.
- One subject reuses another only through an explicit import.
- A `contrasts:` relation is reserved.

### D-11 Kind changes and file placement (IC-15, IC-22; S16) — *rules for D-2(b)*
**Default.** Kind is metadata, not location: the `type:` line changes, statements and names stay put, and only `n.holds` is affected. **telelean never removes a `.holds` that others use until its replacement exists.**

| Change | What happens in Lean | Dependents |
|---|---|---|
| G→D | `theorem n.holds` is added once proved | unaffected |
| G→A | `axiom n.holds` is added; you supply the reason | unaffected |
| D→A | `theorem n.holds` becomes `axiom n.holds`; the proof is archived in `.telelean/attic/` | unaffected |
| A→D | **promotion pending**: `axiom n.holds` stays, tagged *claimed*, until a proof exists (via "Prove from …", or your own); then `axiom` becomes `theorem` | unaffected while pending; flagged as resting on a claimed node |
| A→G, D→G | `n.holds` must go. The drop zone first lists the dependents and offers: rewrite them to take an explicit hypothesis `(h : n)` (mechanical, undoable), or keep them as "broken: depends on unproved n" | need your confirmation |

New code-less nodes go to the subject's `Inbox.lean`. The agent places code in dependency order, and the import DAG forbids cycles (ran).

### D-12 Sidecar files (IC-9)
**Default.** Everything that is not a node lives in `.telelean/`, never in `.lean` files. Comment edits re-elaborate files, and line shifts rebuild dependents (ran).

| File | Contents | Committed? |
|---|---|---|
| `layout.json` | Column order | yes |
| `decisions.json` | Recorded answers (D-20) | yes |
| `attempts.jsonl` | Every "These suffice" press with its verdict | yes |
| `signoffs.json` | Faithfulness sign-offs (D-19) | yes |
| `wording.jsonl` | Every past wording of your sentences, with dates | yes |
| `attic/` | Archived proofs | yes |
| `frozen/` | Run freezes | no |
| `sessions/` | Prompts and answers | no |
| `graph.json` | Export for scripts | no |

### D-13 ★ What an arrow means (IC-5; S15)
**Recommendation.**
- **Declared support** (dashed). Created by the "These suffice" button or by dragging from a card's port, and stored as `premises:` (joint support, drawn through a junction dot).
  - It is kept on **any** node, including an ASSUMPTION, where it shows the hint "you think this follows from that — prove it?" (A→D).
  - A new "These suffice" press on the same goal *replaces* `premises:`, and earlier sets stay in `attempts.jsonl`. Alternative premise sets come later (D-34).
- **Verified dependency** (solid), computed from Lean after each build.
- **Mismatches are flagged**, e.g. "declared but unused" and "used but not declared".
- **(b) Within-column arrows** (D→D) are allowed. S15 only mentioned arrows between sections; tell me if you meant to exclude them.
- **With many nodes:** hovered or selected nodes get full curves; an edge with one end off-screen becomes a stub with a "▲ n linked / ▼ n linked" button; edges with both ends off-screen are hidden.

### D-14 Rationale, stance and evidentials (S6 vs S24)
**Default.**
- A rationale is **encouraged everywhere and never blocking**, for your nodes and adopted ghosts alike.
- **Stance chips** at entry: *I believe it* / *It's a rule or definition* / *Supposing, for argument*. The prompt adapts: "Why do you believe it?" / "Where does the rule come from?" / "What are you exploring?". A node with nothing filled in gets a "no reason yet" or "no source yet" badge.
- **Evidential chips** for the source: observed / reported / inferred / common knowledge. Your rationales "familiar with gaming lore" and "known from gaming news" are evidentials.

### D-15 Status model and visuals (IC-6, IC-17; S41)
**Default.** Status is a product, not a ladder:
- formal ∈ {informal, formalised, ill-formed};
- proof ∈ {none, assumed, pending-promotion, conditional on named nodes, proved};
- certificates (consistency, non-vacuity, independence) ∈ {none, ✓, refuted};
- flags.

How it is shown:
- **Blue aura** = formalised, as you asked.
- One proof glyph, plus certificate badges.
- **Line pattern means epistemic status in every mode**: dashed = declared by you, solid = verified by Lean, translucent = suggested by Claude.
- Diffs are shown by colour plus a +/−/~ glyph.
- Your words appear plain; Claude's words appear italic, with a marker.
- Never colour alone, and colours are themeable. There is a legend, because leanblueprint uses blue for "ready to formalise".

---

## C. Interaction and the run protocol

### D-16 ★ The text box (IC-7; S3, S4, S10, S18–S24)
**Recommendation.**
- The prompt box has **exactly Assumption | Derivation | Goal**. Submitting creates a comment-only node with your verbatim words. **No LLM is involved and no Lean is written**, as in your walkthrough.
- The submit button names its effect ("Add assumption").
- This reads S4's switch as marking *the node a prompt creates*. Prompting the AI (S3) happens through "These suffice", "Formalise", and a separate **"Ask Claude…"** composer, whose requests are unmarked. Each clarifying question is answered inside its own card, so the A/D/G box keeps working during a run.
- *If you meant that marked prompts go straight to Claude,* choose the alternative: a "formalise on Add" toggle.

### D-17 ★ Click and drag (S2, S16, S25, S40)
**Recommendation.**
- **Click selects** a card for the tray (S25). A **chevron** expands it to show the Lean code, relations, footprint, attempts and wording history (S40). There is no double-click action; "Open in editor" is a button.
- **Within a column**, dragging re-orders; layout only.
- **Changing kind is deliberate.** During a drag, labelled drop zones appear, each stating the impact computed per D-11. For example:
  - "Make Derivation: promotion pending until proved";
  - "Make Goal: 3 dependents need a hypothesis rewrite".

  Dropping elsewhere cancels, and "Move to ▸" is also in the context menu.
- **In-board Undo/Redo** (Ctrl+Z while the board has focus) works from recorded inverse edits, and every semantic edit shows an Undo toast. Edits are saved immediately.

The alternative, click = focus/expand with a checkbox to select, needs your call, because S25 and S40 both say "click".

### D-18 ★ Node lifecycle (IC-10; your cynder.lean revisions)
**Recommendation.**
- **Delete.** Removes the block, and optionally the declaration, after a confirmation that lists the affected dependents.
- **Suspend.** Excludes an assumption for *what-if* exploration without deleting it.
- **Refine / supersede**, your "h1 is actually … superseding h1":
  - The "Refine…" action, which you can also type as `h1 is actually …` into "Ask Claude…", starts a run scoped to that node.
  - **By default the vocabulary stays unchanged.** The refined fact becomes an ASSUMPTION (`abbrev cynder_past : Prop := cynder.past = "dark"` + `axiom cynder_past.holds : cynder_past`) and **inherits h1's rationale**.
  - h1 is re-derived through a **bridge** (`∀ c, c.past = "dark" → HasDarkPast c`). The bridge is a new belief, so Claude proposes it as a ghost for you to adopt.
  - h1 then stays on the board, collapsed under its refinement ("h1 ⇐ refined by …"), and dependents compile unchanged. The new block carries `supersedes: h1`.
  - The alternative is to redefine the vocabulary (e.g. `HasDarkPast c := c.past = "dark"`). That needs your endorsement, and it changes the meaning of every node whose statement closure mentions it. All of those nodes are listed in the review as "meaning changed by refinement", and the gate's immutability check is authorised for exactly that set. This pattern is re-verified in M3.
- **Merge.** Re-points premises, layout and decisions.
- **Attempts history.** Every "These suffice" press is kept with its verdict.
- **Anti-goals (M3).** A statement that "should NOT follow"; if it becomes provable, telelean reports over-generation, as in your smoking.lean §6.

The agent may propose deletions, merges or kind changes only when an "Ask Claude…" request asked for them, and each one is confirmed separately.

### D-19 ★ Run protocol: one-shot with an explicit freeze (IC-3, IC-21; S27–S33) — *changed after review*
**Options.**
- **(a)** Pause mid-run for you to sign off the statements, then prove. This roughly doubles the walkthrough's user actions, mostly low-risk ✓/✗.
- **(b) One-shot.** Claude formalises and then calls `freeze_statements`. The gate refuses that call until the lint, build, audit and D-3 vocabulary rules pass; the call then exports the exact snapshot. **Before the freeze, `check_lean` rejects any proof body.** Claude then proves against the frozen statements, and you get **one diff at the end**, as S31 describes. A re-freeze happens only when you adopt a ghost or send feedback.
- **(c) Hybrid.** Like (b), but pause at the freeze when something risky appears: a content-bearing or closed-world definition, a new presupposition, or a back-translation mismatch.

**Recommendation: (b)**, with (c) available as a setting, and a "Formalise first" action for statements without proofs.

**The end review shows meaning before proof status.** For each new or changed statement:
- **M2:** your sentence beside the Lean statement, with a "fully explicit" toggle (no notation, explicit universes and coercions) and the statement closure.
- **M3 adds:**
  - **aligned spans**: which of your words became which symbol, with unaligned words flagged, e.g. "not represented: *would*";
  - a deterministic plain-English **gloss** generated from the Lean term;
  - an independent LLM back-translation.

Proof results are revealed afterwards, which counters automation bias. Pure signature items that satisfy D-3 are auto-approved but revocable. A sign-off binds to your wording, the statement, its closure and the decisions in force; it goes stale when any of these changes, and says which side changed.

### D-20 ★ Clarifying questions and recorded decisions (IC-12, IC-28, IC-30; S30)
**Recommendation.**
- **Tagging.** Each question carries a *phenomenon* tag: enthymeme, genericity, modal flavour/force, contrary vs contradictory negation, presupposition, scalar item, vagueness/gradability, evaluative standard, indexical, word sense, tense, granularity, closed world.
- **No pre-selected answer.** Claude's guess is revealed only after you answer. "Decide for me" stays an explicit delegation.
- **"Leave it open"** (keep it uninterpreted) is always an option, and choosing it is recorded.
- **Defeasibility.** A *tendency* reading is made explicit with an `¬ Abnormal g c` guard, plus an assumption "no exception applies here", which you endorse.
- **Indexicals** like "new" stay interpretable through the node's `asserted:` date.
- **Scope.** You choose it per answer: this run, these nodes, or the whole subject.
- **Unasked choices.** Every interpretive choice Claude made *without* asking is listed under "Assumed without asking", with "Ask me instead". It is not common ground until you acknowledge it.
- **(a) Storage.** `.telelean/decisions.json`, recording who decided and who worded it. Decisions show as ⚑ chips on affected cards and in a drawer. Revoking one marks the affected formalisations stale. The alternative is DECISION markup blocks inside your Lean files.
- **Budget.** At most 3 questions per batch by default, adjustable.

**Walkthrough.** The first question is the modality of "PG games *cannot have* …" (literal vs normative; doc 01 §3).

### D-21 Accepting, feedback and hand edits (S3, S16, S33, S42)
**Default.**
- A proved GOAL→DERIVATION is proposed in the diff, never made silently.
- Accept is all-or-nothing (node-level partial accept comes later). Feedback continues the same Claude session.
- **Hand edits are authoritative.** Editing a statement or sentence yourself marks its sign-off stale and drops it from any frozen set, with a "Re-sign" action. Lean you write counts as signed off by you.
- If files changed during a run, telelean 3-way merges, re-runs the gate, and only then applies.

### D-22 Where the board lives (IC-17)
**Default.** An editor-area tab that restores after a reload.

---

## D. The harness and safety

### D-23 ★ How Claude is driven, and the subscription policy (IC-11, IC-27, IC-34; S9)
**(a) Options.**
- **(i) Claude Agent SDK** (TypeScript), driving the **unmodified** Claude Code binary signed in with your account. In-process tools and hooks, typed events, resume. ESM-only and proprietary, with its own pinned binary (about 330 MB).
- **(ii) The Claude Code CLI in headless `-p` stream-json mode**, the learnharness pattern, using your installed binary. Tools are served by a loopback MCP server, and hooks run as commands.

**Recommendation: (i), with (ii) as a fallback** behind the same interface; the M0 spike confirms (i). Both routes share the same safeguards:
- **realpath confinement of every file-tool path.** For (ii), the guard is installed as a command PreToolUse hook via `--settings`, or the CLI runs inside bwrap; telelean fails closed if neither is active;
- never `--bare`, which never reads your login (documented: `claude --help`);
- API-key and cloud-provider variables stripped, so you are never billed per token by accident;
- auto-memory and claude.ai MCP servers disabled;
- `settingSources: []`, which turns off your user/project settings, hooks and CLAUDE.md. Managed policy is still read;
- telelean never touches your credentials.

**Policy, quoted byte-exact** (retrieved 2026-11-01; saved in `../subagent_reports/policy_sources/`):
- Agent SDK overview: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."*
- Legal & compliance: *"Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK."* Also: *"Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication …"* And: *"Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription …"*
- Consumer Terms §3 (effective Oct 8, 2025), listing prohibited uses: *"Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise."*

**Our reading — not legal advice, and your call.** A personal, human-in-the-loop tool sits within what these pages explicitly contemplate. You trigger every run, answer its questions, and it drives the unmodified binary under your own login. The legal page anticipates "ordinary, individual usage of … the Agent SDK", and allows an end user "signing in to the unmodified Claude Code binary". The tension with "automated or non-human means" is real, though, and the caps (D-25) keep usage ordinary.

**Sharing telelean** needs the API-key backend, or Anthropic's written confirmation (contact sales is linked on the legal page). The SDK is governed by Anthropic's Commercial Terms, so don't vendor or publish it.

**Egress.** Each run sends the subject's node index, vocabulary, decisions and the files Claude reads to Anthropic. The back-translation sends the statements again. A setting can narrow the index.

**(b) Smoke test — yes/no.** May I spend a little of your quota during M0 on one short headless run? It would confirm that your login is reused with the variables stripped, that a long blocking tool wait works, and that file confinement holds. No answer means no.

### D-24 Containment (IC-13, IC-27) — *rebuilt after verified escapes; profile re-verified*
**Prototype:** no shell for Claude, a copy of the model files, diff review before applying, and a basic memory-capped `runLean` sandbox. **Hardening (H):** everything else below.

**Default (full design).**
- **The agent's file tools are confined by resolved path.** The agent has only Read / Glob / Grep / Edit / Write plus telelean's tools: no shell and no web. These tools run *outside* any sandbox, so the guard:
  - canonicalises every path, glob base and grep root (`realpath`) and requires it to resolve inside `realpath(shadow)`;
  - rejects absolute Glob patterns and any `..` segment;
  - tests for dotfiles on path segments *relative to the shadow*;
  - opens new files via the `realpath` of their parent, with `O_NOFOLLOW` on the final component.

  A pattern-based guard was escaped by a symlink during review (ran).
- **Only model files are agent-visible.** Symlinked entries are refused when the shadow is built. `.lake/` and `.telelean/` are hidden from agent tools, and the proposal builder refuses anything that is not a regular file.
- **One `runLean` wrapper is used for every Lean-family process**: build, `lake lean --json`, extractor, leanchecker, leanexport, comparator. It runs `systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0` around **bwrap**, with:
  - an allowlist of mounts (`/usr`, `/etc`, `~/.elan` read-only);
  - **no host `/run`**, `--clearenv`, no network;
  - the shadow's sources read-only, its `.lake/build` writable, and the real `.lake/packages` bound read-only at the shadow's own path;
  - `--dir /root --dir /run/user --dir /var`, so that `lake comparator`'s own nested sandbox can start. Without these, every solution would be "rejected"; with them, comparator ran under the profile (ran by the verifier).

  It **fails closed** without bwrap or `systemd-run --user`. The first profile left the D-Bus session bus and the keyring reachable (ran); the current one does not (ran).
- **Your own workspace refreshes run in the same sandbox,** with sources read-only, `.lake/` writable and `.git` masked, because accepted code was written by the LLM. At Accept, a one-time warning explains that the Lean extension's server, which telelean cannot sandbox, will elaborate accepted code when you open those files.
- **The extractor's one-time compile** uses its own runLean variant: a writable tool directory and no shadow.
- **Optional hardening, spiked in M0:** run the Claude Code process itself in bwrap, with network on and `$HOME` masked except `~/.claude` and the shadow.

### D-25 Model, effort and caps
**Default.**
- `claude-opus-5-5` at effort **high** (Opus 5.5 defaults to medium). `xhigh` and Fable 5.1 are selectable.
- Caps: 80 turns, 25 Lean checks, and 20 minutes of **agent-active** time. The clock pauses while a question waits for you. 120 s per Lean job, plus per-declaration time and memory budgets.
- **Closing the board** doesn't stop a run: the extension host keeps it, and the question is still waiting when you reopen.
- **A window reload or extension restart** ends the Claude process. On resume (`sessionId`), your answer is delivered as the next user turn after Claude Code's interrupted-tool marker. This is part of the M0 spike.
- The panel shows tokens, the cost *estimate*, and the rate-limit status.

### D-26 The verification gate (IC-21)
**Prototype:** G0 as a simple denylist, G1, G3 (footprint, no sorry, the simple vocabulary rule), G4, and G5's markup half. **Hardening (H):** G0 as a parser-checked allowlist, G2, G5's formal-immutability half, the full D-3 data-type rule, and the exploit fixtures. G6 flags and certificates arrive with M3.

**Default (full design).**

| Step | What it does | Status |
|---|---|---|
| **G0** | Allowlist of top-level commands, checked with Lean's own parser: comments, `namespace`/`section`/`end`/plain `open`; D-3 axiom forms; `theorem`/`abbrev`/`def`/`structure`/`inductive`/`opaque`; and **`instance`**, limited to the `Nonempty T` instance for a presupposition or an endorsed instance, never with a `priority`. Token denylist as defence in depth (`initialize`, `#eval`, `run_cmd`, macros, `notation`, `native_decide`, `debug.*`, limit changes, new imports) | designed |
| **G1** | Sandboxed build, with per-declaration budgets | designed |
| **G2** | `leanchecker` kernel replay; catches `debug.skipKernelTC` hacks | ran |
| **G3** | Footprints ⊆ the permitted set (D-5); D-3 data-type rules; no `sorryAx` in proved nodes; initializers never run | partly ran |
| **G4** | `lake comparator` against the freeze. **The freeze is the exact snapshot plus a telelean-generated challenge module** declaring `theorem n.holds : n := sorry` per target; the statement abbrevs are left untouched. A sandbox start-up failure is reported as "could not start", never as "rejected" | ran: catches a weakened goal, a changed assumption, a smuggled axiom, an unselected assumption |
| **G5** | Markup policy (your words byte-identical, ids stable, lifecycle changes only as confirmed items) plus **formal immutability**: every node formalised before the run and outside its change set keeps the same pinned names, kind, proof status and closure hash | designed |
| **G6** | Flags (self-evident, unused premises, definitions on statement paths); model-finder certificates | designed |

The exploit fixtures, including the new `PropSort` and `PresupSmuggle` cases, turn "designed" into "ran".

---

## E. Architecture, scope and tooling

### D-27 ★ Is an LSP the right design? (IC-19, IC-20; S43)
**Answer: not now.**
- **Now:** a pure-TypeScript **core library** is the single source of truth. From M1 the extension writes **`.telelean/graph.json`**, with a versioned schema, after every refresh, and your graph-analysis scripts read that file.
- **M4:** a CLI (`telelean export|check`) and in-process Lean-editor features: hover with your sentence, id completion, go-to-node, rename. These merge cleanly with the Lean extension, as long as telelean never registers semantic tokens (read).

An LSP adds a process boundary and duplicated graph state, and buys only markup-editing help in *other* editors, since the map is a VS Code webview. Argdown made the same layering choice.

**Revisit** if you want the markup in Neovim or Emacs; a thin adapter over the same core is then a small addition. Lean-native attributes were rejected as the primary carrier: they need a Lake dependency, give nothing when a file fails to compile, and their prior art (LeanArchitect) uses the `sorry` placeholders you rejected.

### D-28 Where telelean switches on (M1 — your RAM history)
**Default.**
- **Opt-in per folder.** telelean activates only where `.telelean/` exists. **"telelean: Initialize Model Here"** creates it: it scaffolds an empty folder, or just adds `.telelean/` to an existing Lake project, and offers `git init`.
- **Multi-root workspaces** get one board per opted-in root, and "Open Board" asks which one.
- **Refreshes** run only while that project's board is open: sandboxed, memory-capped, with a MemAvailable check before each spawn and a "paused: low memory" badge.
- Mathlib projects need explicit opt-in.
- `verbatim_prompt_log/`, `test-fixtures/` and `.lake/` are excluded by default.

### D-29 ★ Milestones: when you can start using it (S52)
**Recommendation** (identical to 03 §11):

| Milestone | What you get |
|---|---|
| **M0** (1–2 days, spikes) | SDK in the extension host; the basic runLean wrapper (memory cap + sandbox), with `lake comparator` running under it; the board prototype in a real webview; resuming after a reload during a pending question; one smoke test if D-23b = yes |
| **M1 — map without AI** (first usable) | Core library; runLean + memory guard; Initialize command; board (3 columns, vocabulary group, cards, expand-to-Lean, aura and glyphs, declared + verified arrows); A/D/G box with stance and why; edit text/rationale; delete; drag re-order; kind changes per D-11 (A→D stays pending until you write a proof); Undo; tray; refresh via build + check file; `graph.json` |
| **M2 — one-shot "These suffice"** (**start real use here**) | Shadow + Claude (SDK) + fake backend; tools `check_lean`/`ask_user`/`freeze_statements`/`propose_assumption`/`finish`; freeze + gate G0–G5 (extractor with closure hashes); minimal review (sentence beside Lean, explicit toggle); proposal overlay + raw diff + report card; Accept / Feedback (text field) / Discard; minimal ghost adoption; attempts history |
| **M3 — faithfulness** | Full review (alignment, gloss, back-translation); model finder (consistency, non-vacuity, countermodels); DECISIONs; refine/supersede/merge/suspend; Formalise-first; full "Ask Claude…"; anti-goals; pause-when-risky |
| **M4 — integration** | Lean-editor features; CLI + JSON Schema; Shiki and accessibility polish; full test-electron suite; optional VSIX; Mathlib opt-in |
| **H — hardening** (optional, any time after M2) | The deferred items of the prototype profile above: symlink-proof file-tool guard, audited sandbox profile with socket isolation, full vocabulary data-type rule, `leanchecker`, formal immutability, exploit-fixture suite |

**What M2 does and doesn't do on your walkthrough:**
- *Normative* reading: the goal is proved, then G→D is proposed.
- *Literal* reading: the run ends **"not proved"**, with a ghost premise you can adopt (re-freeze, then proved). The kernel-checked countermodel arrives in M3.

I'll report "good enough to start using" at M2, with directions.

### D-30 Mathlib
**Default.** Off. Core Lean has `simp`, `omega`, `decide`, `grind` and `exact?`.

### D-31 ★ Headless integration tests
**Choose one:**
- (a) `sudo apt install xvfb`, so tests run invisibly (recommended);
- (b) the already-installed **Xephyr**, which keeps test windows inside one nested window;
- (c) visible test windows.

Unit tests, the walkthrough test (it runs without a display) and webview tests need nothing extra.

### D-32 ★ The `mental_model/graph_representation/` folder
It exists and is empty. What is it for? My suggestion is to make `mental_model/` the sample model workspace (your Spyro walkthrough as subject `Spyro`), possibly as its own git repository.

### D-33 Snapshots and history
**Default.**
- Before applying a proposal, telelean records a snapshot as a **private git ref** (`refs/telelean/snapshots/<run>`). It never touches your branch, index or hooks.
- The Initialize command offers `git init`.
- A History drawer shows accepted changes, including former goals.

### D-34 Reserved for later
**Default.** These are deferred:
- optional `credence` (never defaulting to 50%);
- defeaters and challenges;
- alternative premise sets per goal;
- short handles (h1, h2);
- a typed query syntax mirroring your sketches (`from [h1, h2] ?- g`, `self_evident ?- g`).
