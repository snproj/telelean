**Fake backend.** It's a scripted stand-in for the LLM, used only in tests (03 §8.1). It plugs into the same interface as the Claude backend, but instead of calling a model it replays a fixed script of steps against the shadow: "write this file, call `check_lean`, call `finish`". M2 needs it for three reasons:
- **No quota and no randomness.** The end-to-end walkthrough test can run on every change, free and with the same result every time. A real Claude run costs quota and behaves slightly differently each time.
- **It tests the real machinery.** Only the model is faked. The shadow, the sandboxed builds, the gate, the retry loop and the proposal logic all run for real.
- **It can misbehave on purpose.** A script can add its own axiom, leave a `sorry` or weaken the goal, so the tests can show that the gate catches each shortcut and that the retry-then-revert loop behaves. You can't make real Claude cheat on demand.

M0 already built it (`packages/runner/src/llm/fake.ts`). Real Claude is still used for the manual walkthrough before I call M2 usable.

**Ghost adoption.** A *ghost assumption* is a premise Claude proposes when your selected assumptions don't suffice. Your Cynder example under the literal reading is the case: "PG games can't include characters with dark pasts" doesn't give "Cynder would not be a good addition" without a bridging premise.
- Claude may never add beliefs itself (D-6). Instead it calls `propose_assumption` with the sentence, its Lean statement, and why it's needed. It must also supply a gate-checked proof that adding the premise really closes the gap.
- The premise appears on the board as a **ghost**: a translucent card marked "Claude suggests". It is not counted as one of your beliefs.
- **Adopting** it ("I hold this") turns it into a real ASSUMPTION node. The statements are re-frozen with it included, the proof goes through, and the goal is marked proved. Declining leaves the run at "not proved", and the attempt is kept either way.

**"Minimal"** is my reading of that M2 line, since the docs don't spell it out: in M2 you get adopt or decline, and nothing more. Editing the ghost's wording before adopting, and the countermodel that shows *why* your premises fall short, arrive in M3. Refining or superseding nodes generally is also M3.
