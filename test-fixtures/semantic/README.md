# semantic fixtures

Used by `packages/runner/test/semantic/` (WP3, the M1 semantic layer: `lake build` + `.ilean` + check file →
`LeanFacts`). Base project: `../spyro`. Plain, trusted Lean files: no `#eval`, no `.telelean/config.json`.
Tests always copy `../spyro` to a scratch directory (`$TELELEAN_TEST_TMP`) and apply an overlay there; nothing is
ever built here.

## `overlays/<name>/`

Files copied over a scratch copy of `../spyro` (complete replacements of the files they contain).

| Overlay | What it is | Used for |
|---|---|---|
| `build-error` | the `proved` stage of `../runner-lean`, but the goal's proof uses the wrong assumption: a type error with a multi-line message | AT3.2: `Model.Spyro.Main` failed, the root `Model` dependency-failed, Vocabulary fresh |
| `extras` | the `proved` stage plus: a conditional theorem `d1.holds (h : cynder_not_good) : d1`; a two-hypothesis conditional `d3.holds` whose `#check` output wraps; a derivation used by a proof (`d0.holds`, `g2.holds : g2 := d0.holds.2`); a proof through an untracked lemma (`g3.holds := helper_lemma`); a sorry theorem `withSorry`; a hidden assumption `axiom hidden : ∀ c : Character, HasDarkPast c`; `axiom c2 : Character`, `axiom P0 : Prop`, `axiom f : Character → Game`; a def used by a statement abbrev (`darkAndPG`, `uses_def`); a structure with a documented field (`Rec.past`); a data instance (`instInhabitedRec`); a private theorem (skipped); and `Model/Spyro/Orphan.lean`, imported by nothing (`not-built`) | AT3.3 |
| `nonbmp-error` | `../spyro` plus a line with a non-BMP character (`𝔸`, two UTF-16 units) before an unknown identifier | AT3.9: Lean says column 30 (code points), the facts say character 31 (UTF-16) |
| `toolchain` | `lean-toolchain` = `leanprover/lean4:v4.34.0` | AT3.6: `unsupported-toolchain`, nothing spawned |
| `manifest-package` | a `lake-manifest.json` listing one package (`mathlib`; the file is only read, nothing is fetched) | AT3.11: `unsupported-project` |

The "missing manifest" case of AT3.11 has no overlay: the test deletes `lake-manifest.json` from its scratch copy.

## `recorded/`

Real outputs of Lake 5.0 / Lean 4.35.0 (toolchain `leanprover/lean4:v4.35.0`), captured on 2026-11-01 from
scratch copies of these fixtures, used as parser inputs by the unit tests. Absolute paths in `trace:` lines were
replaced by `/work/model` (the project) and `/home/user` (the home folder); nothing else was edited.

| File | Captured from |
|---|---|
| `lake-build-error.{stdout,stderr}.txt` | `lake build Model` on `build-error`: `✖ … Building`, a `trace:` line, a multi-line error, the failures list, `error: build failed` |
| `lake-extras-built.stdout.txt`, `lake-extras-replayed.stdout.txt` | the first and the second `lake build Model` on `extras`: `⚠ … Built` / `⚠ … Replayed` with the stored "declaration uses `sorry`" warning |
| `lake-missing-import.{stdout,stderr}.txt` | `../spyro` with `import Model.Spyro.Missing` added to `Main.lean`: `Running job computation`, file-only messages (`bad import`), a continuation line, four failures |
| `lake-lakefile-error.stderr.txt` | a truncated `lakefile.toml` (nothing on stdout) |
| `lake-nonbmp-error.{stdout,stderr}.txt` | `lake build Model` on `nonbmp-error` |
| `spyro-Vocabulary.ilean.json`, `spyro-Main.ilean.json` | `.lake/build/lib/lean/Model/Spyro/*.ilean` after building `../spyro` |
| `extras-Main.ilean.json` | the same for `extras` (structure field reference with a parent, `_private.` names, `And.right` on `d0.holds.2`) |
| `unlisted-Inbox.lean` + `unlisted-Inbox.ilean.json` | (turn 13) a one-module project `Model` → `Model.Demo.Inbox` with that source, built with the toolchain's `lake` in a scratch directory on 2026-11-10: declarations whose source mentions no constant (`abbrev two_plus_two_is_four : Prop := 2 + 2 = 4`, `theorem plain_mp : ∀ (p q : Prop), p → (p → q) → q := …`) are missing from `decls` but have a parent-less `definition` in `references`; also an `example` (`Demo._example`), a private theorem, a structure, an inductive, a `where` declaration and an anonymous instance |
| `check-spyro.lean` + `check-spyro.jsonl` | a check file in the generator's shape for the 16 declarations of `../spyro` plus `Spyro.nonexistent`, and `lake env lean --stdin --json`'s output |
| `check-extras.lean` + `check-extras.jsonl` | the same for 16 declarations of `extras` (imports `Model.Spyro.Vocabulary`, `Model.Spyro.Main`, `Model`) |
| `spyro-facts.json`, `extras-facts.json` | the `LeanFacts` that `refreshLeanFacts` returns for `../spyro` and for `extras` (sandboxed, in place), with times set to the epoch, durations to 0 and memory peaks removed. Real facts for core's tests and the integrator; `refresh.test.ts` checks them on every run and rewrites them when `UPDATE_SEMANTIC_RECORDINGS=1` |

If `../spyro` or an overlay changes, regenerate the affected recordings the same way (with the toolchain's own
`lake`, never the elan proxies, in a scratch copy); the two `*-facts.json` files come from
`UPDATE_SEMANTIC_RECORDINGS=1 npx vitest run test/semantic/refresh.test.ts` in `packages/runner`.
