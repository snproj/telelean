# 02 — Unspoken constraints and the design decisions they force (Step 2)

*Answers Implementation step 2 (S48). Each decision cites the implied constraints (`IC-`) from `01_consolidated_idea.md` Appendix C, and the evidence behind it. **verified** means a research agent ran it on this machine (Lean 4.35.0 / Lake 5.0.0, VS Code 1.140, Claude Code 2.1.314). **documented** means it comes from official docs, with links in `03_architecture.md` §16.*

**How to respond.** The items marked **★** are the ones where I'd like your call before implementing. The quickest reply is "approve all ★ as recommended", plus any overrides by number. Everything else is a default I will apply unless you object.

---

## Summary of the ★ decisions

| # | Decision | My recommendation |
|---|---|---|
| D-1 ★ | How ASSUMPTIONs are encoded in Lean | Global `axiom`s. When a model or countermodel is needed, telelean *generates* the bundled-hypotheses view: a structure-like ∃-statement whose witness is a model, like your `paternalismFree` |
| D-2 ★ | A formalised but unproved GOAL/DERIVATION | `theorem g : S := by sorry`, following your own reading of `sorry` in S39. Code-less nodes stay comment-only |
| D-3 ★ | Where LLM-created vocabulary (`structure Cynder`, `isCharacter`) lives | A 4th kind, `DEFINITION`, shown as a collapsible "Vocabulary" group at the top of the Assumptions column |
| D-4 ★ | Definitions can hide assumptions | Any definition that a statement or proof relies on is a DEFINITION node, and you must endorse it |
| D-5 ★ | What the "these suffice" button means | *Strict.* The proof may use only the selected assumptions, plus Lean's 3 standard axioms and approved vocabulary. This is machine-enforced |
| D-6 ★ | May the LLM add assumptions? | Never. When the assumptions are insufficient, it reports the gap and proposes "ghost" assumptions. You adopt one only by writing your own reason |
| D-9 ★ | Markup details | `@@ telelean v1`, line-based `key: value` (not YAML). Required `id`. `kind:` replaces `type:`, with `type:` still accepted |
| D-10 ★ | Where the natural-language text lives | In the markup block, the single source of truth. Formalised nodes can get an auto-generated docstring mirror |
| D-13 ★ | What an arrow means | Two kinds. *Declared support*, from the button or drawn by you, is dashed. *Verified dependency*, computed by Lean, is solid. Mismatches are flagged |
| D-16 ★ | What the text box does | Adding a node never calls the LLM (as in your walkthrough). A 4th switch position, "Instruct", is for free-form requests to the AI |
| D-18 ★ | One-shot or two-phase LLM run | Two-phase: formalise → you sign off the *statements* → prove → final diff. Signed-off statements are frozen and machine-checked |
| D-23 ★ | How Claude is slotted in through your subscription | The Claude Agent SDK drives the *unmodified* Claude Code binary signed in as you. Personal use only, and telelean never touches credentials |
| D-28 ★ | Is an LSP the right design? | **Not now.** Core library + CLI/JSON export + in-process VS Code providers. Add a thin LSP later only if you want the markup in Neovim/Emacs |
| D-31 ★ | Headless integration tests | Optional `sudo apt install xvfb`. Without it, test runs pop up VS Code windows on your desktop |
| D-32 ★ | What is `mental_model/graph_representation/` for? | Question for you. I'd use `mental_model/` as the sample model workspace for the walkthrough |

---

## A. Logic and the Lean encoding

### D-1 ★ How ASSUMPTIONs are encoded (IC-1, IC-2, IC-21)
**Why it matters.** S5 calls assumptions "axioms", S7 requires that derivations need no new assumptions, and S28 asserts that a *selected subset* suffices. Lean must be able to tell exactly which assumptions each result rests on.

**Options.**
- **(a) Global `axiom`s for vocabulary and beliefs.**
  - Lean's `collectAxioms` / `#print axioms` returns *exactly and transitively* the assumptions each theorem uses (verified; standard axioms appear as `propext`, `Classical.choice` and `Quot.sound`, and sorry as `sorryAx`).
  - Promote/demote is a local edit: `axiom n : S` ↔ `theorem n : S := p`. Dependents compile unchanged (verified).
  - The new `lake comparator` (Lean 4.35) can enforce "only these axioms" (verified, about 3 s).
  - Risk: axioms are global, so an inconsistent belief set makes everything provable.
- **(b) Bundled hypotheses: `structure World where … ; theorem t (W : World) : …`.** This is the style of your `~/telelean_scripts/smoking.lean`.
  - Consistency is the existence of an instance (a model), and independence is shown by a model where the goal fails, as with your `adult_smoking_now_independent`.
  - Dependency tracking needs custom analysis, because `#print axioms` reports nothing (prototyped).
  - Selection must be enforced through statement shape rather than axiom whitelists.
  - Statements become heavier (`W.x` everywhere).
- **(c) Section `variable`s.** On 4.35 a hypothesis used only in a proof body is *not* included, which gives an error (verified). Ruled out.

**Recommendation: (a), with (b)'s strengths generated on demand.** For consistency or countermodel checks, telelean builds the "Ramsey sentence" `∃ vocabulary, A₁ ∧ … ∧ Aₙ` (and `… ∧ ¬G` for independence). A witness proved with no axioms is exactly an instance of the bundle structure, i.e. a model, like your `paternalismFree`. Both statements were prototyped, and for your walkthrough they certified that the three assumptions are consistent and do **not** entail the goal. You write and read the simple axiom style; the bundle is derived. If you'd rather author in the (b) style, I can support it as an alternative encoding later, at the cost above.

### D-2 ★ Formalised-but-unproved statements (IC-6, IC-24; S37, S39)
**Why it matters.** S39 rejects `sorry` for nodes *without* Lean code, because `sorry` "implies we do have a representation, but it's not inhabited yet". That description is exactly the formalised-but-unproved state.

**Options.**
- **(a)** `theorem g : S := by sorry`. Promotion to DERIVATION is just filling in the proof. `sorryAx` propagates transitively, so anything built on an unproved goal is honestly marked "conditional". `lake comparator` needs a theorem to compare.
- **(b)** A sorry-free uniform scheme: `abbrev g : Prop := S` plus `theorem g.holds : g` (or `axiom g.holds` for assumptions). This matches the `def` in your S37 example. The statement constant is stable across kinds, at the cost of boilerplate and some `simp` friction (verified).

**Recommendation: (a).** Code-less nodes remain pure comments (S38).

### D-3 ★ A fourth kind for vocabulary (IC-4, IC-23; S32)
**Why it matters.** S32's examples (`structure Cynder`, Prop `isCharacter`) are neither beliefs, derivations nor goals, and the panel has three columns.

**Recommendation.** A `DEFINITION` kind, shown as box-shaped cards in a collapsible **"Vocabulary"** group at the top of the Assumptions column, collapsed by default so your three sections stay as specified. Lean facts classify each vocabulary item automatically:
- Type formers and predicates are harmless signature.
- A constant of an uninterpreted type (`axiom Cynder : Character`) is an *existence commitment* and gets a badge.
- A Prop-valued axiom must be an ASSUMPTION node.
- Suspicious data axioms (e.g. of type `Empty`) are blocked.

Vocabulary introduced by the agent appears in the diff and needs your acceptance.

**Alternatives.** A separate 4th lane; chips on the nodes that use the vocabulary; hidden (not recommended, because hidden vocabulary is a hidden dependency).

### D-4 ★ Definitions carry meaning, so they need your endorsement (IC-3, IC-4, IC-21)
**Why it matters.** It was verified that an LLM can move one of your assumptions into a `def` body. The assumption then drops out of `#print axioms`, and the goal becomes true *by definition*. Facts written as definitions, like `uptake .child = 90` in your `smoking.lean`, are beliefs that axiom tracking cannot see.

**Recommendation.**
- Your concepts default to *uninterpreted* vocabulary.
- Every connection between concepts is either an ASSUMPTION or a proved DERIVATION.
- Any `def`/`abbrev`/`structure`/`inductive` that a statement or proof depends on becomes a DEFINITION node, requires your sign-off, and is drawn as a dependency.
- Closed-world encodings (an `inductive` listing exactly the characters you named) are a *pragmatic question the LLM must ask*, because they make facts like "Cynder ≠ Spyro" provable for free.

### D-5 ★ Meaning of the button's selection (IC-1, IC-31; S25, S28)
**Recommendation: strict.**
- The goal's proof may use only the selected assumptions, plus `propext`/`Classical.choice`/`Quot.sound` and approved vocabulary.
- `lake comparator` enforces this mechanically through `permitted_axioms`.
- If the proof needs more, the agent must ask ("add *X* to the selection?") or propose a new assumption.
- Selected DERIVATIONs act as lemmas, and their own footprints count.

The tray shows the obligation before the run, e.g. **"prove G from {A1, A2, A3}"**.

**Alternative.** "Any declared assumption". It is weaker, and it no longer tests the assertion you are making.

### D-6 ★ The LLM never adds assumptions; insufficiency is a first-class result (IC-10)
**Recommendation.**
- When the selection does not suffice, the run ends with status *insufficient* and a plain-language account of the gap.
- Candidate premises appear as dashed **ghost ASSUMPTION** nodes. You adopt one only by writing *your own* rationale; an LLM hint may be shown greyed out but cannot be submitted unedited.
- In v1.5 a kernel-checked countermodel is attached. This is exactly what your walkthrough needs: the bridge premise from §3 of doc 01.

### D-7 Inconsistent assumptions → vacuous proofs (IC-2)
**Default.**
- Every proved node always shows the exact set of assumptions it uses.
- A proved goal carries a "no consistency certificate" note until a model exists.
- A one-click "find a model" action (D-1's certificate) and a "try to derive False" probe arrive in v1.5. Neither blocks your work.

### D-8 Lean project defaults (IC-14, IC-15)
**Default.**
- `lakefile.toml` with `leanOptions = { autoImplicit = false, relaxedAutoImplicit = false }`. This was verified to matter: with Lean's default, a typo like `hasDarkPast cyndr` silently becomes `∀ {cyndr}, hasDarkPast cyndr`, a *much stronger* assumption, with no error.
- An exact toolchain pin, `leanprover/lean4:v4.35.0`, which is already installed, so elan never downloads.
- No Mathlib (see D-29).

---

## B. Representation

### D-9 ★ Markup syntax (IC-8, IC-19; S35–S37, S43)
**Recommendation.** Keep your sketch's look, made precise:

```
/-
@@ telelean v1
id: cynder-not-good
kind: GOAL
natural_name: Cynder would not be a good addition to the new Spyro game
premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past
origin: user
-/
theorem cynder_not_good : ¬ GoodAddition cynder newSpyro := by sorry
```

- **Line-oriented `key: value`, not YAML.** YAML's implicit typing was verified to mangle natural language: `NO` becomes `false`, `1.10` becomes `1.1`, and `PG games #1 rule` is silently truncated to `PG games`. Python and JS YAML parsers also disagree.
- **`id` is required.** It is a stable slug that edges, layout, diffs and scripts can refer to, independent of wording and Lean names. The extension generates it, and nobody renames it implicitly.
- **`kind:` instead of `type:`.** Inside a Lean file, "type" reads as the declaration's Lean type. `type:` stays accepted as an alias, with a hint.
- **Optional fields:** `rationale` (for an ASSUMPTION: why you hold it), `premises` (declared support), `lean` (explicit binding), `tags`, `origin` (user | agent), `session`, plus namespaced extension keys (`x.y`). An optional `---` line starts a Markdown body.
- **Versioning.** The version marker lets the markup grow (NFR-4). Unknown keys are preserved.
- **Binding.** A block binds to the declaration starting on the next non-blank line, the same rule Go uses for doc comments. A blank line means "code-less". An explicit `lean:` field handles multi-declaration nodes.

A ~600-line Python reference prototype with 20 tests already exists from the research (`../subagent_reports/research_workflow/artifacts/r4-markup-lsp/proto/`).

### D-10 ★ Where the natural-language text lives (IC-19, IC-29; S40)
**Why it matters.** You suggested the Lean docstring. But a `/-- … -/` docstring *must* be followed by a declaration (a dangling one is a parse error, verified), so code-less nodes cannot use one. Keeping the text in docstrings would also mean moving it every time a node gains or loses code.

**Recommendation.**
- The markup block is the single source of truth: `natural_name`, which is your words verbatim and never rewritten by the LLM (IC-29), plus an optional body.
- For formalised nodes, telelean can maintain an auto-generated docstring mirror (`/-- <natural_name> -/`), so Lean hovers and doc tools show your sentence.
- The block itself is a plain `/- -/` comment, so it works even when files don't compile.

### D-11 Kind is metadata, not file location (IC-15, IC-22)
**Default.**
- Promote/demote changes one line plus the justification (axiom ↔ proof ↔ sorry). Lean names and statements stay put, so nothing downstream breaks.
- Scaffold: `Model/Vocabulary.lean`, `Model/Main.lean` and `Model/Decisions.lean`, splitting by topic as the model grows.
- New code-less nodes are appended to an inbox file.
- The agent places code in dependency order, and Lean's import DAG forbids cycles (verified).
- Per-kind files were rejected because promotion would move code and break declaration order.

### D-12 Layout lives in a sidecar file (IC-9)
**Default.** Column order and collapsed groups are stored in `.telelean/layout.json`, keyed by id, and never in `.lean` files. This was verified to matter:
- Any edit to a comment makes the Lean server re-elaborate the rest of that file.
- Line-shifting edits trigger Lake rebuilds of every downstream module.

Commit the layout file. Session logs (`.telelean/sessions/`) contain your prompts and answers and are not committed by default.

### D-13 ★ What an arrow means (IC-5; S15)
**Recommendation: two edge kinds.**
- **Declared support** (dashed). Created by the "these suffice" button, or drawn by you from a card's port. It is stored as `premises:` on the conclusion and read as *joint* support; a multi-premise argument is drawn through a junction dot, as learnharness and GSN do.
- **Verified dependency** (solid). Computed from Lean after every build: the assumptions each result actually uses, plus the definitions and lemmas it references.

Mismatches are flagged: declared but unused ("removable premise"), and used but not declared.

Arrows between nodes in the same column are allowed, e.g. derivation → derivation; S15 only mentions cross-column arrows (one of the tensions in doc 01, Appendix D).

With many nodes, only the hovered or selected nodes get full curves. Other edges become short stubs, and each column shows "▲ n linked / ▼ n linked" buttons that scroll to hidden neighbours.

### D-14 Rationale is encouraged, not mandatory (S6 vs S24)
**Default.** In ASSUMPTION mode the add form shows a "Why do you believe this?" field. If you leave it empty, the node gets a "no rationale yet" badge. This is not blocking, since your walkthrough's 4th assumption has none.

### D-15 Status visuals (IC-6, IC-17; S41)
**Default.**
- **Blue aura** = has a Lean representation (your request).
- **Fill/glyph** = proof status: none · `sorry` · proved ✓ · fully grounded ✓✓ (its whole support chain is formal) · broken ✗ · stale.
- **Badge** = you signed off its formalisation.
- **Box shape** = DEFINITION.
- Status is never shown by colour alone; patterns and glyphs carry it too, so high-contrast themes work.
- Colours are VS Code theme colours you can override.

Note that leanblueprint uses blue for "ready to formalise" and green for "formalised". There will be a legend.

---

## C. Interaction and the LLM run protocol

### D-16 ★ What submitting the text box does (IC-7; S3, S4, S10, S18–S24)
**Recommendation.**
- **ASSUMPTION / DERIVATION / GOAL** modes create a comment-only node immediately. No LLM is involved, and no Lean is written, exactly as in your walkthrough. `natural_name` is your verbatim text.
- A 4th switch position, **Instruct**, sends a free-form request to the AI ("split *characters* into a structure"), handled by the same safety pipeline. Your phrase "*should be able to be* marked" implies that unmarked prompts exist.
- While the AI is asking you something, the box becomes **Reply**.

**Why not call the LLM on add?** Your words *are* the specification that the Lean will be judged against. Paraphrasing them would add an NL→NL gap before formalisation even starts.

### D-17 Gestures (tension in doc 01, Appendix D)
**Default.**
- **Click** selects; a visible checkbox lets you multi-select across columns.
- **Chevron** expands the card to show its Lean code, relations and status.
- **Double-click** opens the source beside the panel.
- **Drag within a column** re-orders. This touches layout only, never Lean.
- **Drag from a port** draws a declared-support arrow.
- **Drag across columns** changes kind, with these rules:
  - A→D: becomes "claimed" (unverified) until proved, and offers "Prove".
  - D→A: the proof is replaced by an axiom (undoable), and you are asked for a rationale.
  - G→D: allowed directly only if proved; otherwise "claimed".
  - →G: becomes `sorry` / a statement to prove.

Every gesture has a keyboard equivalent and a context menu.

### D-18 ★ One-shot or two-phase run (IC-3, IC-21; S27–S33)
**Why it matters.** In one shot, the agent's statements are shaped by what it managed to prove, and you review a fait accompli. In particular, it can weaken the goal.

**Recommendation: two phases in one session.**
1. **Formalise.** Vocabulary, assumption axioms, and the goal as `theorem … := by sorry`, with clarifying questions along the way.
2. **Statement sign-off.** You see your words next to each Lean statement. You can toggle "notation off", because misleading `notation` was verified to fool the pretty-printer. An *independent* plain-English back-translation comes from a fresh session that never saw your words.
3. **Freeze.** The signed-off statements are exported. Any later change to them is rejected by `lake comparator` (verified to catch a weakened goal and a silently altered assumption).
4. **Prove**, then show the **final diff**.

This is still "propose a diff, accept or feedback" (S31, S33). The first diff just contains statements only.

### D-19 Clarifying questions and recorded pragmatics (IC-12, IC-28, IC-30; S30)
**Default.**
- **When to ask.** The agent asks when the answer changes meaning or provability:
  - unstated bridging premises;
  - generic vs universal readings ("PG games *cannot* have…": a rule? a norm? a tendency?);
  - modality, quantifier scope, definite descriptions;
  - granularity ("model characters as entities?");
  - open vs closed world.
- **How much.** At most 3 questions per batch, and at most 2 batches before the first proposal.
- **Question cards** offer options with plain-language consequences, a recommended choice, "decide for me (and record it)", and free text. The cards highlight the nodes the question affects.
- **Answers are recorded** as `kind: DECISION` blocks in `Model/Decisions.lean`, so the unspoken context becomes explicit common ground. They are shown in a "Modeling decisions" drawer, fed to every later run, and revocable.

### D-20 GOAL → DERIVATION on proof (S16)
**Default.** Proposed inside the diff, only after the proof is gate-verified, and applied when you accept. It never happens silently.

### D-21 Accept granularity (IC-26)
**Default.**
- v1 is all-or-nothing, plus feedback ("accept, but drop X"), because Lean dependencies make piecewise application unsafe.
- v2 adds node-level partial acceptance via the dependency closure, followed by a re-check.

### D-22 Where the panel lives (IC-17)
**Default.** An editor-area tab (WebviewPanel) that restores after reload, because three columns need the width. A sidebar view was rejected as too narrow.

---

## D. The LLM harness and safety

### D-23 ★ Claude through your subscription (IC-11, IC-27, IC-34; S9)
**Recommendation.**
- Use the **Claude Agent SDK** (TypeScript), which drives the **unmodified Claude Code binary** signed in with your account.
- telelean never reads, copies or relays credentials.
- It strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN` from the child environment, because a stray key would silently switch you to metered API billing.
- It never uses `--bare` (verified: that mode never reads your login).
- It isolates the run from your global `~/.claude` settings, hooks and memory (`settingSources: []`).

**Policy, quoted.**
- The Agent SDK overview says: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."*
- The legal page says this does not *"prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription"*, and that plan limits *"assume ordinary, individual usage of Claude Code and the Agent SDK"*.

So a personal tool, run by you with your own login, sits in the documented lane. **Sharing telelean with others** would need per-user API keys or Anthropic's approval, and an API-key backend is planned as a separate option. The SDK's licence is proprietary ("All rights reserved"), which is fine for personal use; check it before redistributing.

The run also sends your beliefs and Lean files to Anthropic. That is expected, but worth stating (IC-34).

### D-24 Which Claude Code binary (IC-11)
**Default.** The SDK's own pinned native binary, which avoids version skew (about 330 MB in `node_modules`). A setting can point at the binary inside your VS Code Claude extension instead; that saves the download but drifts as that extension auto-updates. Both read the same login.

### D-25 Agent containment (IC-13, IC-27)
**Default.**
- The agent gets **no shell and no web**. It has only Read / Glob / Grep / Edit / Write, confined by a hook to a **shadow copy** of your workspace, plus telelean's own tools: `check_lean`, `ask_user`, `propose_formalization`, `propose_assumption`, `finish`.
- Every Lean build of agent-written code runs in a **bubblewrap sandbox**: no network, no `$HOME`, only the shadow writable, and a memory cap. This is needed because elaborating Lean *runs arbitrary code*: verified, an agent-written `#eval`/`run_cmd` wrote outside the project, listed `$HOME` and resolved DNS, and the sandbox contained all three.
- It **fails closed** if bubblewrap is unavailable. It is already installed.
- This design needs no `socat` and no sudo.

### D-26 Model, effort and caps
**Default.**
- `claude-opus-5-5` at effort **high**. Opus 5.5 defaults to *medium*, which hurts proofs.
- `xhigh` selectable for hard runs; `claude-fable-5-1` selectable if your plan exposes it.
- Per-run caps: 80 turns, 25 Lean checks, 20 minutes.
- The panel shows live tokens, an estimated cost (labelled an estimate), and the subscription rate-limit status.

### D-27 The verification gate (IC-21)
**Default.** The LLM is treated as untrusted; the Lean kernel and a deterministic gate decide. Each step below was exercised against a real cheating attempt during research.
- **G0 lint.** Rejects `#eval`, `run_cmd`, macros, `notation`, `elab`, `set_option debug.*`, `native_decide`, `implemented_by`/`extern`/`unsafe`, new imports, and `autoImplicit`.
- **G1** sandboxed build.
- **G2 `leanchecker`** kernel replay. It catches `debug.skipKernelTC` environment hacking, which fools `#print axioms` (verified).
- **G3 axiom audit.** Proved results use only allowed assumptions, contain no `sorry`, and vocabulary is classified.
- **G4 `lake comparator`** against the frozen sign-off.
- **G5 markup policy.** Your text is byte-identical, ids are stable, and the only automatic reclassification is G→D on proof.
- **G6 advisory flags.** "Proved from zero assumptions" (your `self_evident ?- yes`), unused selected assumptions, and new definitions on statement paths.

---

## E. Architecture and tooling

### D-28 ★ Is an LSP the right design? (IC-19, IC-20; S43)
**Answer: not as the first step.** The things you named are better served by:
1. a pure-TypeScript **core library** (markup grammar, graph model, validation, diff), which is the single source of truth;
2. a **CLI** that emits a **versioned JSON graph** (`telelean export --format-version 1`) for your graph-analysis scripts. Scripts want whole-graph snapshots, not an editor protocol; this is the same reasoning behind `cargo metadata` and LSIF/SCIP;
3. **in-process VS Code providers** for the markup inside Lean editors: diagnostics, hover showing your sentence, completion of node ids, go-to-node, rename, and a "Show in map" CodeLens.

It was verified, from VS Code 1.140's source, that these merge cleanly with the Lean extension's own features. The one rule: never register semantic tokens for Lean, because that would replace Lean's highlighting.

An LSP adds a process boundary and duplicated graph state. It buys only *markup editing help in other editors*, because the map itself is a VS Code webview. Argdown, the closest prior art, made the same layering choice.

**Revisit when** you, or a collaborator, want the markup in Neovim or Emacs: a thin LSP adapter over the same core is then a small addition. Lean-native markup (attributes) was rejected as the primary carrier: it needs a Lake dependency in every model, gives nothing when a file fails to compile, and its closest prior art (LeanArchitect) represents informal nodes with exactly the `sorry` placeholders you rejected.

### D-29 Mathlib (IC-14)
**Default.** Off. Core Lean has `simp`, `omega`, `decide`, `grind` and `exact?`, which is enough for commonsense models. Enabling Mathlib costs about 6.8 GB of disk plus slower checks and more RAM. An explicit "Enable Mathlib" action can come later.

### D-30 Lean integration strategy
**Default.**
- telelean runs its own `lake build`, plus a small compiled Lean **extractor** (about 0.5 s per run), for whole-project status. The Lean server only elaborates files that are open.
- It uses VS Code's stable diagnostics API for open editors.
- It treats the Lean extension's internal API as optional.

### D-31 ★ Headless integration tests
Running VS Code integration tests needs a display. With `sudo apt install xvfb` (one package), I can run them headless with `xvfb-run`. Without it, each test run opens a visible VS Code window on your desktop for a minute. Unit tests and webview tests (Playwright on your installed Chrome) need nothing extra.

### D-32 ★ The `mental_model/graph_representation/` folder
It exists and is empty. What is it for? I would use `mental_model/` as the sample model workspace: your Spyro walkthrough as a Lake project, opened by the development launch config. The extension's source would sit beside it under `packages/`. Tell me if you meant something else.

### D-33 Safety net before applying proposals
**Default.**
- Accept goes through VS Code's undoable `WorkspaceEdit`.
- If the model folder is a git repository, telelean also commits a snapshot before applying. This is a setting, and on by default.
- If the files changed while the agent ran, it 3-way merges them and re-runs the gate before applying.

### D-34 Reserved for later (from argument-mapping prior art)
**Default.** Reserve, but don't build yet:
- an optional `credence` field on assumptions (unset by default, never defaulting to 50%);
- an evidential `source` category for the rationale;
- challenge/defeater annotations;
- several alternative premise sets per goal.

These cover how real beliefs are held and contested (Toulmin's qualifier and rebuttal, GSN's confidence arguments), which plain monotonic Lean does not express.
