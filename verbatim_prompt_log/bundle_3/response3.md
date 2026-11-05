Yes. The vocabulary view is designed and scheduled for M1; the M0 board left it out on purpose. The board you installed only covered the risky parts (columns, arrows, drag, selection), and its report lists "vocabulary group" as not yet implemented.

**What the design specifies** (02 D-3, 03 §7):
- **A collapsible Vocabulary group at the top of the Assumptions column**, built from the Lean declarations rather than from markup. For Spyro it would hold:
  - the types `Character` and `Game`;
  - the predicates `HasDarkPast`, `IsPG` and `GoodAddition`;
  - the constants `cynder` and `newSpyro`.
- **Box-shaped vocabulary items**, so they don't read as beliefs. Each shows a plain-language gloss taken from its docstring, styled as Claude's wording until you rewrite it.
- **Presupposition chips** such as "assumes characters exist", for the `Character.exists` axioms. These also appear in the tray when you select premises.
- **When a proposal adds vocabulary**, the group expands with a "+3 new" badge, so new terms don't slip in unnoticed.

**A gap you've spotted.** The design shows the vocabulary as a list, but it never says how a card connects to the terms its Lean uses. Even with the group in place, `HasDarkPast` in an expanded card would still mean scrolling up to find it. I'd add two things in M1:
- a small "uses: HasDarkPast, cynder" line on each formalised card;
- hovering an identifier in the expanded Lean shows its gloss, and clicking it highlights the item in the Vocabulary group.

It's a small addition. Say if you want it, or prefer something else.

As you asked, I changed nothing. That includes not starting a log bundle for this message, which the standing logging rule would normally do; I can add it later if you want it recorded.
