namespace Spyro

/-- characters -/
axiom Character : Type
/-- games -/
axiom Game : Type
/-- there is at least one character -/
axiom Character.exists : Nonempty Character
instance : Nonempty Character := Character.exists
/-- there is at least one game -/
axiom Game.exists : Nonempty Game
instance : Nonempty Game := Game.exists
/-- has a dark past -/
axiom HasDarkPast : Character → Prop
/-- is rated PG -/
axiom IsPG : Game → Prop
/-- would be a good addition to -/
axiom GoodAddition : Character → Game → Prop
/-- Cynder -/
noncomputable opaque cynder : Character
/-- the new Spyro game -/
noncomputable opaque newSpyro : Game

end Spyro
