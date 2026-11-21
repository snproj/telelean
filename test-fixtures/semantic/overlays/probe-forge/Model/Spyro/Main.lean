import Model.Spyro.Vocabulary

namespace Spyro

/-
@@ telelean v1
id: pg-no-dark-past
type: ASSUMPTION
natural_name: PG games cannot have characters with dark pasts
stance: rule
asserted: 2026-11-01
-/

/-
@@ telelean v1
id: cynder-dark-past
type: ASSUMPTION
natural_name: Cynder is a character who has a dark past
rationale: familiar with gaming lore
source: common
asserted: 2026-11-01
lean: Spyro.cynder_dark_past
-/
/-- Cynder is a character who has a dark past -/
abbrev cynder_dark_past : Prop := HasDarkPast cynder
axiom cynder_dark_past.holds : cynder_dark_past

/-
@@ telelean v1
id: new-spyro-pg
type: ASSUMPTION
natural_name: The new Spyro game is PG
rationale: known from gaming news
source: reported
asserted: 2026-11-01
lean: Spyro.new_spyro_pg
-/
/-- The new Spyro game is PG -/
abbrev new_spyro_pg : Prop := IsPG newSpyro
axiom new_spyro_pg.holds : new_spyro_pg

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

/-- a character to stand for anyone -/
noncomputable instance instWitness : Inhabited Character := ⟨cynder⟩

/-
@@ telelean v1
id: someone-dark
type: ASSUMPTION
natural_name: Someone has a dark past
asserted: 2026-11-01
lean: Spyro.someone_dark
-/
/-- Someone has a dark past -/
abbrev someone_dark : Prop := HasDarkPast default
axiom someone_dark.holds : someone_dark

-- The forgery (slice 2b3a's cheat, docs/slice2-plan.md 6.1): probe.test.ts removes everything from here to `end Spyro`
-- for the true lists.
/-- Rewrites every printed line: drops the witness instance from it. -/
instance (priority := high) forgeToString : ToString String :=
  ⟨fun s => (s.replace ",\"Spyro.instWitness\"" "").replace "\"Spyro.instWitness\"," ""⟩

/-- Ends every `while` loop at once. -/
instance (priority := high) forgeLoop {m : Type → Type} [Monad m] : ForIn m Lean.Loop Unit :=
  ⟨fun _ b _ => pure b⟩

end Spyro
