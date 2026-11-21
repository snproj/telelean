# recheck:r2

Agent `ac3e1c309efea33ac` of workflow `wf_16a1ea15-88d`. Verbatim output (JSON alongside).

- **summary:** I checked the three fixes against both plans, the runner and core code, and Lean 4.35's own source in ~/.elan. Read-only throughout: no builds, tests, Lean runs or git changes.

**AP30-1 r2: the order and list-scope parts are fixed, but the rule can still be bypassed, so it is re-raised below.**
- Slice 2 now says in every place that G0 runs first, before any Lean job, and that nothing is synced, built, probed, rendered or challenged when it finds anything. The places are §1.1 2b3b, §2.1 (the probe-file paragraph and "No Claude code runs at import"), §2.9 (the SessionCheckContext doc and the engine comment), D2-75 and a new §8 entry.
- The list rule now reads the same for `@[…]` and `attribute […] x`. 2b2 has the three new tests and 2b3b has the G0-first test with spies.
- The fixer's change for `writePremise` and `complete` (`{ ok: false }` with G0's message, no judgement) is sound. §3.8 already treats an `ok: false` without a meaning mismatch as a write that could not be made.
- At `stage` and `final`, a judgement without facts follows ADV-3's partial path. I checked `judge.ts`, `items.ts` and `reconcile.ts`: every declaration draft is `factsMissing`, records are kept, and there are no no-longer-builds reverts. So that path destroys nothing.
- Leaving builder 2b1b's G0 entry and S-F6 as written is fine, because §1.1 2b3b and the new §8 entry state they are superseded.
- Slice 3 also has the matching changes: D3-52, §2.1, and cheat 24's variant now run in 3d.

**AP30-7: rightly fixed by logging, which was the finding's own smallest option.** The condition is stated in slice 2's §2.1 (a new bullet), D2-75 and §7.4, and in slice 3's §2.1 and D3-52. The person's `mental_model` and the Spyro fixture import only their own modules.

**AP30-8: fixed in slice 3.**
- 3p adds a base-commit mode with `syncMirror(files?)`, no working-copy refusal and the clean-mirror cache dropped.
- §2.1 Base facts, §5.2 and 3d use it, and there are tests in 3p and 3d.
- Leaving slice 2 unchanged is right, because slice 2 runs `checkBase` only at a start.
- One gap remains: an engine cache is not cleared (re-raised below as minor).

**New problems from the fixes:** I found no new blocker or major problem.
- **findings:**
  - [1]
    - **id:** AP30-1
    - **severity:** major
    - **plan:** both
    - **where:** slice2-plan §2.1 'No Claude code runs at import' ("an attribute named `init` or `builtin_init`, by canonical name (`«init»` too)"); §1.1 2b2's G0 bullet; §6.1 2b2 'G0's `init` attribute' tests; §6.1 2b3a `probe-init`; D2-75. slice3-plan §6.2 cheat 24's AP30-1 variant; D3-52 ('Nor can model code run at import'). Lean 4.35: src/lean/Lean/Elab/Attributes.lean lines 57-58; src/lean/Init/Prelude.lean lines 5774-5790. Core markup/lexer.ts canonicalName.
    - **problem:** The rule matches attribute names by canonical name, and Lean does not resolve attribute names that way.

**How Lean reads the name.** On 4.35, `elabAttr` names a plain-identifier attribute (`Parser.Attr.simple`) by `attr[0].getId.eraseMacroScopes` (Attributes.lean lines 57-58). `Name.eraseMacroScopes` treats any name whose last component is `_hyg` as hygienic and cuts it before its `_@` component.

**The bypass.** So `@[init.«_@».x._hyg] def evil : IO Unit := …` attaches the `init` attribute, and so does `attribute [init.«_@».x._hyg] evil`. The tokenizer takes `«_@»` as a quoted name part, and the code needs only Init.
- Core `canonicalName` keeps `«_@»` (it is not a plain identifier part), so the canonical name is `init.«_@».x._hyg`, not `init`.
- The rule as written lets it through, and no 2b2 test catches it.
- G0 then finds nothing, so G0-first does not help.
- Claude's IO runs in every downstream module build and in the check job, with `<shadow>/.lake` writable. That is exactly AP30-1's attack: rewrite an `.olean` the probe job loads, or print forged Lean JSON messages. D2-75 and D3-52's claim that no Claude code runs at import is then false even for an Init-only model.

**Other names affected.** The same spelling gets `macro`, `implemented_by` and `csimp` past WORD_CODES when they are used as attribute names. For example, `@[macro.«_@».x._hyg Lean.Parser.Command.printAxioms] def m : Lean.Macro := …` registers a pure macro that rewrites the check file's `#print axioms` lines.

**Smaller gap.** G0 skips any line whose exact text B has. So an `init` placed on its own line that copies a line of B (for example a bare `  init`) is not judged.
    - **fix:** **2b2 rule (`gate/g0.ts`).** Change §2.1's rule and 2b2's bullet to:
- "G0 compares each attribute name after Lean's own `eraseMacroScopes`, applied to its canonical name: a name whose last component is `_hyg` is cut before its last `«_@»` component."
- "G0 also refuses, as `metaprogramming`, any identifier in Claude's lines that has a `«_@»` component or a final `_hyg` component: a hand-written hygienic name, which no model needs. Message: '… is a hygienic name, which is not allowed in the model files: rename it'." This one change closes the same spelling for `macro`, `implemented_by` and `csimp` as well.
- Optional hardening: judge an attribute list as a whole. If any line of an `@[…]` or `attribute […]` list is Claude's, an `init` or `builtin_init` in it is refused, even on a line whose text B also has.

**2b2 tests.** These are refused:
- `@[init.«_@».x._hyg] def x : IO Unit := pure ()`
- `@[simp, «init».«_@».M._hyg]`
- `attribute [local builtin_init.«_@».a._hyg] x`
- `@[macro.«_@».x._hyg Lean.Parser.Command.check] def m : Lean.Macro := fun s => pure s`

These pass: `x_hyg`, a binder named `hyg`, and `a.b`.

**2b3a `probe-init` control.** Add a second module that uses the hygienic spelling. The check job prints its forged line too, which pins the bypass as real on the pinned toolchain.

**Slice 3.** Cheat 24's `@[init]` variant gains the hygienic spelling (by hand in 3a, through the runner in 3d). D3-52 cites the macro-scope rule beside the `init` rule.
  - [2]
    - **id:** AP30-8
    - **severity:** minor
    - **plan:** slice3
    - **where:** slice3-plan §1.1 3p '`checkBase` on the base commit' ("drops the run's clean-mirror cache"); §5.2 'The upgrade'; §6.1 3p's base-commit-mode test. Runner gate/engine.ts: `commitModel` (cache key `${runDir}\0${commitId}\0facts`), `saveBaseFacts` (refreshes only `baseFactsCache`), and `runCheck`'s `commitModel(shadow, baseId, stored.facts)`.
    - **problem:** The base-commit mode is the first thing that replaces base-facts.json while the runner process is running. Slice 2 writes it only at a start, before any other engine call.

**The cache.** The engine's in-memory `models` cache keys B's facts-model by commit alone, never by which facts were used. `saveBaseFacts` refreshes only `baseFactsCache`. So once anything in the same load has built B's model from the old, keyless file, every later call gets that model back:
- slice 2's recompute of the stage judgement in `recover()` (D2-72), which runs before the upgrade and can only reach B's facts through the engine, since `loadBaseFacts` is private;
- or a check during a queue.

**The effect.** The calls that get the stale model are the step checks after a queue-time upgrade, the upgrade's own judge in a stage, and the final check. Comparisons with B then stay keyless for the rest of that window load:
- `{ from: 'base' }` standing values, `existing-changed` and `other-subject` fall back to printed text (S3-2's gap at steps);
- the final check refuses them as inexact;
- freezing again from the same stale model cannot clear it; only a reload does.

The 3p bullet names only the clean-mirror cache, and 3p's test checks the file's contents, not that the next judge uses B's new keys.
    - **fix:** Add to 3p's base-commit bullet (`gate/engine.ts`): "and evicts the engine's cached models of the base commit, every `models` entry for this run and that commit, so the next check, judge or final check builds B's model from the new base-facts.json." An alternative is for `commitModel` to key the facts-model by the stored facts' identity (their commit plus a hash or `checkedAt`), not by the commit alone.

Test in 3p, with a fake `refreshFacts`, a real shadow and one engine instance:
1. A judge builds B's model from keyless base facts.
2. The base-commit re-check replaces the file.
3. The next judge compares a declaration of B by meaningKey: exact, no inexact record.

In 3d, the upgrade during a queue then has a step check that compares with B by key.
