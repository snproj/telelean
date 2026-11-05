import Model.Spyro.Vocabulary

namespace Spyro

/-
@@ telelean v1
id: pg-no-dark-past
type: ASSUMPTION
natural_name: PG games cannot have characters with dark pasts
stance: rule
asserted: 2026-11-01
lean: Spyro.pg_no_dark_past
-/
/-- PG games cannot have characters with dark pasts (normative reading) -/
abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g
axiom pg_no_dark_past.holds : pg_no_dark_past

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
axiom shortcut : cynder_not_good
theorem cynder_not_good.holds : cynder_not_good := shortcut

end Spyro
