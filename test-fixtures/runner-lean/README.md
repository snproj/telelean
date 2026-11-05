# runner-lean fixtures

Used by `packages/runner/test/lean/` (the M0 sandboxed-Lean spike). Base project: `../spyro`.

## `overlays/<stage>/`

Files copied over a fresh shadow of `../spyro` to reproduce a run's stages. Each is a complete
replacement of `Model/Spyro/Main.lean`, so the differences are easy to read with `diff`.

| Stage | What a run would have left | Used for |
|---|---|---|
| `formalised` | Phase A done: the normative reading of `pg-no-dark-past` formalised (`abbrev pg_no_dark_past` + `axiom pg_no_dark_past.holds`); the goal has no proof | the frozen snapshot (comparator challenge) |
| `proved` | `formalised` + the honest proof `theorem cynder_not_good.holds` (the same proof as `../spyro/Check/Normative.lean`) | footprint test; comparator case (a), and case (c) with `new-spyro-pg` unselected |
| `weakened` | the goal abbrev itself weakened to `… ∨ True` (same name), then "proved" by `Or.inr trivial` | comparator case (b): caught by the closure comparison |
| `weakened-type` | the goal abbrev untouched, but the theorem stated as `cynder_not_good ∨ True` | comparator case (b'): caught by the statement comparison |
| `smuggled` | a new `axiom shortcut : cynder_not_good` used as the proof | comparator extra case (smuggled axiom) |
| `noisy-build-error` | `proved`, but the proof replaced by a type error, after an `#eval` whose output imitates comparator's own lines (`bwrap: Can't mkdir /root: …`, `Resolving dependencies`) | comparator: a failing build stays "rejected: build-failed", never "could not start" (the `#eval` only prints) |

If `../spyro/Model/Spyro/Main.lean` changes, regenerate these from it (only the lines shown by
`diff ../spyro/Model/Spyro/Main.lean overlays/formalised/Model/Spyro/Main.lean` are telelean's additions).

## `probes/*.lean.txt`

Deliberate sandbox probes (`#eval` code that writes into `$HOME`, lists `$HOME` and `/run`, and tries
DNS, TCP, the D-Bus socket and the abstract X11 socket). They are stored **inert** as `.lean.txt`:
never rename them to `.lean` here and never open them with a Lean server. The tests copy each one
into a sandboxed shadow as `Probe.lean` and elaborate it with `lake env lean` under `runLean`.
