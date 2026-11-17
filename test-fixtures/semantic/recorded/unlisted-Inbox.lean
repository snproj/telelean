namespace Demo

/-- Two plus two is four -/
abbrev two_plus_two_is_four : Prop := 2 + 2 = 4
theorem two_plus_two_is_four.holds : two_plus_two_is_four := by decide

theorem plain_mp : ∀ (p q : Prop), p → (p → q) → q := fun _ _ hp hpq => hpq hp

structure Pt where
  x : Prop
  y : Prop := x

inductive Col where
  | red
  | blue

def withWhere : Prop := aux
where aux : Prop := 1 = 1

/-- doc -/
@[simp] protected theorem prot_thm : 1 = 1 := rfl

private theorem priv_thm : 1 = 1 := rfl

example : 1 = 1 := rfl

instance : Inhabited Col := ⟨.red⟩

end Demo
