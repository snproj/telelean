# Lean checks of the safety examples (turn 20)

Run by the main session on 2026-11-18 with `~/.elan/toolchains/leanprover--lean4---v4.35.0/bin/lean -j1 -M 1024`, under `systemd-run --user --scope -p MemoryMax=1500M -p MemorySwapMax=0`, in the session scratchpad. The files are renamed `*.lean.txt` so that opening them never elaborates anything.

- `Examples.lean.txt` (S2, dot form): `theorem s2_dot : cynder_not_good := cynder_dark_past.holds.elim` typechecks (no output, exit 0) once `HasDarkPast` is `def HasDarkPast (_ : Character) : Prop := False`.
- `Examples2.lean.txt`:
  - S2, explicit form `False.elim cynder_dark_past.holds`: `#print axioms` = [Classical.choice, Character, Game, GoodAddition, Character.exists, Game.exists, cynder_dark_past.holds]. The only belief used is the (frozen) premise, whose text never changed.
  - S5, the `InGame` definition cheat: `#print axioms Spyro2.cynder_not_good.holds` = [Classical.choice, Character, Game, GoodAddition, HasDarkPast, IsPG, Character.exists, Game.exists, cynder_dark_past.holds, new_spyro_pg.holds, pg_no_dark_past.holds]: exactly the three selected premises plus vocabulary and presuppositions.
  - S1, the weakened goal `¬ GoodAddition cynder newSpyro ∨ True`: proved by `Or.inr trivial` with no premises at all.

A first attempt with `ulimit -v 2000000` aborted inside Lean ("failed to create thread: Resource temporarily unavailable"). No core file was kept (`ulimit -c` 0; `/var/crash` empty), but apport appended to `/var/log/apport.log` at 19:53 +0800.
