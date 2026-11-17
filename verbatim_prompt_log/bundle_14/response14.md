**Your demo is ready, and M2 is finished with real Claude.** Every live run passed, in your actual snap VS Code.

| Live run (Opus 5.5, high effort) | What happened | Requests | Cost estimate | Time |
|---|---|---|---|---|
| Spyro walkthrough, normative | Claude asked what "cannot have" means → proved | 8 | $0.18 | 46 s |
| Spyro walkthrough, literal | not proved → suggested "a character can only be a good addition to a game that can contain them" → adopted → proved | 11 | $0.16 | 61 s |
| **Your demo path:** typed-in Socrates on a fresh folder, through the real extension UI | Claude built the vocabulary from scratch → proved first time | 6 | $0.14 | 52 s |
| **Your demo path:** typed-in penguin | not proved, with a clear explanation → suggested "All penguins are birds" → adopted → proved | 10 | $0.14 | 76 s |

All four together came to about $0.62 at API prices. Every proof passed the gate on its first attempt, and your 7-day window shows 7% used.

**Fixed along the way** (things the Spyro sample couldn't reveal):
- Accept refused cards you typed while Claude was working.
- Proofs that mention no constants were falsely rejected.
- The system prompt disagreed with the gate in four places.
- A run now refuses up front, before Claude is contacted, if the Lean sandbox can't start.

## Running the demo

The full guide is in [docs/DEMO.md](docs/DEMO.md).
1. **File → New Window.** Don't reload this window, which would restart this Claude Code session. The new window loads the current build.
2. **File → Open Folder** on a new empty folder, e.g. `~/telelean-demo/socrates`, and click **Trust**. telelean is disabled in Restricted Mode.
3. Run **telelean: Initialize Model Here** from the Command Palette and accept the defaults. The board opens.
4. In the A|D|G box at the bottom, type the assumptions with **A** and the goal with **G**, pressing Enter after each.
5. Click the first card, then Ctrl+click the rest, including the goal. Press **These suffice ▶**, then **Run with Claude**.
6. Answer Claude's questions if it asks any. In the review, click **Yes, I endorse it** on the "… exists" definition, then **Accept**. If the result is not proved, press **I hold this** on Claude's suggested premise, and a second round proves it.

**Tips:**
- Use the same word for the same thing across cards.
- Keep it to one or two reasoning steps.
- Avoid numbers and arithmetic.
- To see a suggested premise, leave one out on purpose: "Socrates is a human" ⊢ "Socrates is mortal".

**Two caveats:**
- **The sandbox only works in the snap VS Code.** Your Ubuntu only lets it create Lean's sandbox, so run the demo there, not in a VS Code started some other way.
- **The theory gaps from the report's §3.7 are still open,** such as the pre-freeze instance blind spot. They don't affect honest simple examples.

As you asked, I skipped the write-ups, the audit and the bundle logs this time. Nothing is left running.
