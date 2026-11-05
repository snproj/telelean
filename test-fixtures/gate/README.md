# gate fixtures

Used by `packages/runner/test/shadow/` and `packages/runner/test/gate/` (M2 WP2: the run's shadow and the Lean check
engine). Base project: `../spyro` (its model and project files only; `Check/` never enters a shadow). Builds only ever
happen in scratch copies, never here.

## `edits.json`

Named edit scripts, applied to a run's working copy (`ws/`) the way Claude's Edit tool would
(`{ path, oldString, newString }`; each `oldString` must occur exactly once; `oldString: null` creates a file).
Text with forbidden commands lives in inert snippets (`newStringFile`, see below).

| Script | What Claude would have done | Used for |
|---|---|---|
| `formalise-normative` | `pg_no_dark_past` with `¬ GoodAddition c g` + its `.holds` axiom, below its block (no pin: normalisation adds it) | freeze, honest proof |
| `formalise-literal` | `axiom InGame` in Vocabulary + `pg_no_dark_past` with `¬ InGame c g` (plan section 0, fact 1) | ghost check, adopted ghost |
| `formalise-definition` | `def InGame … := GoodAddition c g` + the literal statement (fact 5) | flagged definition |
| `prove-normative` | the honest proof `theorem cynder_not_good.holds` | gate passes; `unselected`, `status-mismatch` |
| `adopt-ghost` | the block and declarations `planGhostAdoption` writes for the literal ghost (fact 3), before the target's block | literal + adopted ghost |
| `prove-literal-adopted` | the proof through the adopted ghost (fact 3) | gate passes |
| `cheat-axiom` | `axiom shortcut : cynder_not_good` used as the proof | `new-axiom` (+ `footprint`) |
| `cheat-sorry` | `:= sorry` (snippet) | G0 `sorry`, no Lean |
| `cheat-weakened-abbrev` | the target abbrev weakened to `… ∨ True` | `existing-changed` |
| `cheat-weakened-type` | `theorem cynder_not_good.holds : cynder_not_good ∨ True` | `not-proved` |
| `cheat-vocabulary-redefined` | `axiom GoodAddition` turned into a `def` (fact 6) | `existing-changed` |
| `cheat-edited-words` | `natural_name` of cynder-dark-past edited | `markup` |
| `cheat-eval` | `#eval 1` (snippet) | G0 `hash-command`, no Lean |
| `rebind-target` | the target's `lean:` pin re-pointed to a new `abbrev cynder_not_good_weak : Prop := True` | `markup`, freeze refused |
| `lemma-unselected` | `theorem helper : new_spyro_pg := new_spyro_pg.holds` | `footprint` in a `not_proved` round |
| `shape-violation` | a constant declared as `axiom someone : Character` (TL111) | freeze refused (`vocabulary-shape`) |
| `stray-notes` | a stray `Model/Spyro/notes.md` | G0 `bad-path` (counted) |

## `snippets/*.lean.txt`

Inert replacement texts holding forbidden commands (`sorry`, `#eval`). Never rename them to `.lean` and never open
them with a Lean server: the tests only ever put their text into a scratch working copy, where G0 refuses it before
any Lean process starts.

## `overlays/<name>/`

Files copied over the Spyro base before a shadow is made (the user's own files at run start).

| Overlay | What it is | Used for |
|---|---|---|
| `slow` | `Model/Spyro/Slow.lean`: 150 small `decide` proofs (about 12 s to build with 4 Lean threads), imported by `Model.lean` | the job timeout (`budget`) and cancellation tests |
| `broken-other` | a second subject `Other` whose module has a Lean error (`Model/Other/Main.lean` line 3) | `checkBase` problems naming file and line |
| `pending` | normative formalisation pinned; the target is a DERIVATION whose `.holds` is still an axiom (D-11 pending promotion) and a lemma without a card uses it | the freeze copy drops both |
| `proved-derivation` | normative formalisation pinned; the target is a DERIVATION already proved | the freeze copy drops the existing proof |
