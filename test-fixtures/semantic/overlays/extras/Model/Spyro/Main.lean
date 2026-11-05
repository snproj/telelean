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
theorem cynder_not_good.holds : cynder_not_good :=
  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds

-- Extras for the semantic-layer tests (see test-fixtures/semantic/README.md). Plain declarations, no #eval.

/-- Cynder would not be a good addition, or something false -/
abbrev d1 : Prop := ¬ GoodAddition cynder newSpyro ∨ False
/-- d1 holds if the goal does: a conditional proof -/
theorem d1.holds (h : cynder_not_good) : d1 := Or.inl h

abbrev a_statement_with_a_rather_long_name_so_that_types_wrap : Prop := HasDarkPast cynder
abbrev another_statement_with_a_long_name_so_types_wrap_too : Prop := IsPG newSpyro
/-- Both long-named statements -/
abbrev d3 : Prop := HasDarkPast cynder ∧ IsPG newSpyro
theorem d3.holds (h1 : a_statement_with_a_rather_long_name_so_that_types_wrap)
    (h2 : another_statement_with_a_long_name_so_types_wrap_too) : d3 :=
  ⟨h1, h2⟩

/-- Cynder has a dark past and the new Spyro game is PG -/
abbrev d0 : Prop := cynder_dark_past ∧ new_spyro_pg
theorem d0.holds : d0 := ⟨cynder_dark_past.holds, new_spyro_pg.holds⟩
/-- The new Spyro game is PG, by way of d0 -/
abbrev g2 : Prop := new_spyro_pg
theorem g2.holds : g2 := d0.holds.2

/-- An untracked lemma -/
theorem helper_lemma : HasDarkPast cynder := cynder_dark_past.holds
abbrev g3 : Prop := HasDarkPast cynder
theorem g3.holds : g3 := helper_lemma

theorem withSorry : GoodAddition cynder newSpyro := sorry

/-- A hidden assumption -/
axiom hidden : ∀ c : Character, HasDarkPast c
axiom c2 : Character
axiom P0 : Prop
axiom f : Character → Game

/-- dark past and PG -/
def darkAndPG (c : Character) (g : Game) : Prop := HasDarkPast c ∧ IsPG g
abbrev uses_def : Prop := darkAndPG cynder newSpyro

/-- A record with one field -/
structure Rec where
  /-- the past -/
  past : Prop

/-- A data instance -/
instance instInhabitedRec : Inhabited Rec := ⟨⟨True⟩⟩

private theorem secret_helper : True := trivial

end Spyro
