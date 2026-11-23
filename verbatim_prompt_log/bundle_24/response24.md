# Response 24 (final message of turn 24, 2026-11-22 ~19:15 SGT)

Each target card gets two separate questions, so it gets two items (RV-1: at most one item for a card's fields, and one for its proof).

- **Formalize “Socrates is mortal”** is about *meaning*: does Claude's Lean statement say what your sentence says?
- **Result “Socrates is mortal”** is about *proof*. It answers the question you asked when you pressed Formalize for dependencies: does "Socrates is mortal" follow from the two arrows you selected? It carries:
  - the verdict: **established**, **proved but not established**, or **not proved**;
  - the proof itself;
  - which of your arrows the proof used, and which it didn't need;
  - what it rests on;
  - flags such as "proved from nothing".

**Why they are separate.** You can agree with one and not the other. A formalization can be right while the proof leans on something you don't like, and you'd reject or Shaky the Result but keep the statement. The Result also depends on the Formalize items, its own and its premises' (RV-5), so it can only be accepted after them. Rejecting a Result keeps the previous proof and bars that exact proof. Shaky makes Claude try again at Submit.

**What "result after the review" means.** It's the placeholder that Results show while they're hidden. This is RV-6, "meaning before proof", which carries on your earlier decision D-19.
- **What's hidden:** until you have decided every statement and belief item, telelean hides each Result's verdict and everything derived from the proof.
- **Why:** knowing "it's proved" would tempt you to accept a formalization that's wrong. A wrong statement can even make a proof trivial. "Proved from nothing" exists to catch that case.
- **Why the row is always there:** every target gets a Result whether or not a proof was found, so the row's presence tells you nothing.
- **Show results** reveals them early and marks them "seen early".
- **The plural:** there is one Result per target, so a session with several targets has several Results. They are all revealed together, which is why the texts say "results".

In doorclose, the Result row still reads "◌ result after the review". That's because the presupposition and the two "to be redone" Formalizes count as undecided, the same dead end as before. Once those are decided, the Result appears with its verdict. With the 2j fix, it would also appear as soon as "to be redone" counts as finished. I still haven't looked at the verdict.

Nothing changed this turn; it's logged in `verbatim_prompt_log/bundle_24/`.
