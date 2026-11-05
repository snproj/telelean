import Model.Spyro.Main

namespace Other

/-
@@ telelean v1
id: other-dark
type: DERIVATION
natural_name: Somebody in the Spyro games has a dark past
asserted: 2026-11-02
lean: Other.other_dark
-/
/-- Somebody in the Spyro games has a dark past -/
abbrev other_dark : Prop := Spyro.cynder_dark_past
theorem other_dark.holds : other_dark := Spyro.cynder_dark_past.holds

end Other
