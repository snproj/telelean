import Model
namespace Spyro
-- what a run would add under the NORMATIVE reading of pg-no-dark-past
abbrev pg_no_dark_past : Prop := ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ GoodAddition c g
axiom pg_no_dark_past.holds : pg_no_dark_past
theorem cynder_not_good.holds : cynder_not_good :=
  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds
end Spyro
#print axioms Spyro.cynder_not_good.holds
