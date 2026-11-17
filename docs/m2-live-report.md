# M2 live report: real Claude on the walkthrough and the demo (turn 13)

*Written 2026-11-13 (turn 15) about the work of turn 13, 2026-11-10. During turn 13 you asked to skip the write-ups until the demo worked; this is that write-up. Times are UTC (the machine's clock runs at UTC−8). The code described is the working tree of 2026-11-13: turn 13's changes, uncommitted, on top of your commit "initial generation" of 2026-11-05. The project report (`docs/project-report.md`) is updated to match. Checked again against the transcripts and the code on 2026-11-16 (turn 16), which added the output-token finding (2.1) and the current Claude Code version (section 6).*

## In brief

- **The real-Claude walkthrough of `docs/m2-plan.md` §12 passed both readings** on a copy of the Spyro sample. Normative: two questions, proved in round 1, Accept made the goal a Derivation. Literal: one question, not proved, Claude suggested the missing premise, the scripted user adopted it, and round 2 proved the goal.
- **The demo passed twice, live, through the real extension UI** in your own snap VS Code (1.145.2), each on a fresh empty folder: "Socrates is mortal" (proved in round 1) and "Tweety can fly" (not proved, with the suggested premise "All penguins are birds"; adopted; proved in round 2). In both, Claude built the vocabulary from nothing.
- **Every one of the 6 rounds passed telelean's gate at its first attempt.** The four sessions took 35 requests and about 4 minutes of wall time, and Claude Code estimated $0.63 at API list prices. The plan had estimated 30–55 requests and 10–30 minutes for the walkthrough alone.
- **Turn 13 also fixed problems the Spyro sample could not reveal** (section 5). Playing the demo's path, a freshly typed model, with a scripted Claude found most of them: Accept refused cards typed while Claude worked; Lean's index hides some declarations, which the gate then refused; a misleading message for a blank line; four lines of the system prompt that disagreed with the gate; and wrong advice after a conflict. Running the tests in your snap VS Code found one more: a run could start Claude where Lean's sandbox cannot run.
- **The machine matters** (section 6): on this Ubuntu, Lean's sandbox works only inside the VS Code snap, a fresh folder must be trusted, and the demo belongs in a new window.
- **What this does not show** (section 4): that the formalisations say what the sentences mean. The penguin run is the plain example: the gate certified "Tweety can fly" from "All birds can fly", read with no exceptions. It also does not show the paths that never came up live (failed checks, Feedback, Cancel, resume), and it is one run per example.

## 1. Setup

| | |
|---|---|
| Model and effort | `claude-opus-5-5` (Opus 5.5), effort high: the extension's defaults. Caps at their defaults (per round: 25 Lean checks, 80 turns, 20 minutes, 3 check attempts) |
| Claude Code | 2.1.322, the binary of the VS Code Claude Code extension (`~/.vscode/extensions/anthropic.claude-code-2.1.322-linux-x64/resources/native-binary/claude`), logged in with your claude.ai subscription |
| Lean | `leanprover/lean4:v4.35.0`, every job sandboxed as always |
| Machine | Ubuntu 24.04.5, kernel `apparmor_restrict_unprivileged_userns=1`. The runs were started from the main session's shell, which runs inside the snap VS Code, so they had its AppArmor label `snap.code.code (complain)` (section 6) |
| Walkthrough | `scripts/walkthrough-claude.mjs --live` (both opt-ins: `--live` and `TELELEAN_WALKTHROUGH_LIVE=yes`), one reading per invocation. Each reading gets its own copy of `mental_model/` with its own git repository; the script drives the RunManager directly, without VS Code |
| Demo | `packages/extension/scripts/demo-driver.mjs --live --vscode snap` (both opt-ins: `--live` and `TELELEAN_DEMO_LIVE=yes`). It starts your installed snap VS Code 1.145.2 (snap revision 278) through the snap's own `electron-launch`, headless under xvfb, with telelean loaded from `packages/extension`. VS Code's user data, extensions, XDG folders and the snap's per-user folders stay in the run's work folder; HOME is the real one, because Claude Code's login lives there. The driver then works the UI like a user: a fresh empty folder, **telelean: Initialize Model Here** through the Command Palette (subject `Demo`), the cards typed in the A\|D\|G box, the selection, **These suffice ▶**, the real consent dialog, the review, Accept, and a wait for Lean's check of the accepted files |

**Pre-checks, before anything spent quota:**
- the two runner test files that spawn the live scripts to show that live mode refuses (`walkthroughScript.test.ts`, `smokeScript.test.ts`): 11/11 passed;
- `walkthrough-claude.mjs --dry-run`: both readings passed with the FakeBackend and real Lean;
- `--dry-run --binary-check`: it found Claude Code 2.1.322 and printed the command line telelean would use. `claude --help` listed every flag on that line except `--system-prompt-file` and `--max-turns`, which its help text does not show. The four live sessions then ran with both flags.

**Order (2026-11-10, UTC).** The walkthrough ran on the code as it was; the fixes of section 5 came after it; the demo ran on the rebuilt extension, which had all of them.

| Time | What |
|---|---|
| 16:38 | turn 13 starts: "a minimal prototype for demo purposes with a real Claude backend as soon as possible" |
| 16:41–16:42 | walkthrough, normative reading (live) |
| 16:42 | the demo-readiness workflow starts, with no real Claude: three agents in parallel (fresh-model, snap-vscode, demo-driver), then an integrator |
| 16:43–16:44 | walkthrough, literal reading (live) |
| 17:09–18:03 | the fixes of section 5 land in the sources |
| 18:05 | the integrator rebuilds the extension bundle that VS Code loads |
| 18:35 | the workflow ends; every suite passes (section 7) |
| 18:36 | live demo: Socrates |
| 18:37–18:38 | live demo: the penguin |

## 2. Results

### 2.1 The four runs

| Run | Rounds | Questions | Gate | Requests | Cache read | Cache write | Output tokens | CLI cost estimate | Wall time |
|---|---|---|---|---|---|---|---|---|---|
| Walkthrough, normative | 1: proved | 2 | passed at attempt 1 | 8 | 76,240 | 13,686 | 2,924 | $0.183 | 46 s |
| Walkthrough, literal | 2: not proved; suggestion adopted; proved | 1 | passed at attempt 1, both rounds | 11 | 128,804 | 7,510 | 3,886 | $0.164 | 61 s |
| Demo, Socrates | 1: proved | 0 | passed at attempt 1 | 6 | 47,221 | 11,704 | 1,913 | $0.141 | ~52 s |
| Demo, penguin | 2: not proved; suggestion adopted; proved | 0 | passed at attempt 1, both rounds | 10 | 102,775 | 6,848 | 3,388 | $0.143 | ~76 s |
| **All four** | 6 | 3 | 6 of 6 at the first attempt | **35** | 355,040 | 39,748 | 12,111 | **$0.632** | ~4 min |

- **Where the numbers come from.** Requests and tokens are from Claude Code's own transcript of each session (uncached input was 74 tokens in all). The cost is the CLI's own estimate at API list prices, as telelean recorded it from the CLI's result; a subscription is not billed per token, but the runs use the plan's usage.
- **telelean's own count of output tokens is far too low.** telelean's usage record agreed with the transcripts on requests, uncached input, cache reads and cache writes. But it counted 141, 143, 111 and 142 output tokens for the four runs, where the transcripts record 2,924, 3,886, 1,913 and 3,388. That record is what the run panel's status line ("12 in · 111 out"), the report card, `attempts.jsonl` and the scripts' summaries show. telelean adds up the usage the CLI's stream reports with each message, and in these runs those figures held only a small part of each message's output. This was found on 2026-11-16 while checking this report; it is not fixed (section 9).
- **Wall time.** For the walkthrough, the script's time per reading: copy, Lean refresh, run, Accept and the final refresh. For the demo, the driver's time from VS Code's start to Lean's check after Accept.
- **Rate limits.** Both scripts cancel a run at the first usage-limit status that is not "allowed"; none was cancelled. Your plan's 7-day usage window showed 4% used after the walkthrough and 7% after the demo. That figure covers everything the plan did in the window, including the Claude Code sessions that did the work, not only these runs.

### 2.2 Walkthrough, normative reading

The selection is the sample's: target "Cynder would not be a good addition to the new Spyro game", premises "PG games cannot have characters with dark pasts" (no Lean yet, stance *rule*), "Cynder is a character who has a dark past" and "The new Spyro game is PG".

1. **Question 1** (tag *word-sense*): *"In "PG games cannot have characters with dark pasts", what does "cannot have" mean for the goal about Cynder being a good addition?"* The options were "Such a character would not be a good addition" (the goal then follows) and "Such a character is never actually in the game" (a new "appears in" relation; the goal would need a further premise). The script answers every question that mentions "cannot" in its own words: *"I mean it as a rule: PG games should not include characters with dark pasts. I do not mean it is impossible for a PG game to contain one."*
2. **Question 2** (tag *enthymeme*): *"Should "PG games should not include characters with dark pasts" be read as saying such a character would not be a good addition to a PG game?"* (options "Yes, same thing" / "No, 'should not include' is separate"). The script answers every other question with **Decide for me**. Claude chose "Yes" and listed that choice under "assumed without asking".
3. **Formalisation**, directly below the rule's block in `Main.lean`:

   ```lean
   /-- PG games cannot have characters with dark pasts -/
   abbrev pg_no_dark_past : Prop :=
     ∀ (c : Character) (g : Game), IsPG g → HasDarkPast c → ¬ GoodAddition c g
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   One `check_lean` passed; `freeze_statements` returned 13 permitted names, the same set as the scripted run of project-report §3.8.
4. **Proof**, after the freeze; `check_lean` reported its footprint, the same 11 names as the scripted run:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good :=
     pg_no_dark_past.holds cynder newSpyro new_spyro_pg.holds cynder_dark_past.holds
   ```
5. **`finish(proved)`**; the gate passed at attempt 1. The script accepted with the recommended "Make Derivation". After Accept the copy's refresh showed the goal proved, a DERIVATION, resting on the three premises plus the presuppositions `Spyro.Character.exists` and `Spyro.Game.exists`. These are exactly the pass criteria of m2-plan §12.2 step 4.

### 2.3 Walkthrough, literal reading

1. **Question** (tag *word-sense*): *"In "PG games cannot have characters with dark pasts", what does "have" mean?"*, with the options "Feature in the game" and "Not a good addition". The scripted answer: *"I mean it literally: a PG game cannot contain a character with a dark past at all."*
2. **Formalisation.** One new relation in `Vocabulary.lean`, then the rule:

   ```lean
   /-- can contain (the game is allowed to contain the character) -/
   axiom CanContain : Game → Character → Prop
   ```
   ```lean
   /-- PG games cannot have characters with dark pasts -/
   abbrev pg_no_dark_past : Prop :=
     ∀ (g : Game) (c : Character), IsPG g → HasDarkPast c → ¬ CanContain g c
   axiom pg_no_dark_past.holds : pg_no_dark_past
   ```

   The freeze returned 14 permitted names (`CanContain` joins the signature).
3. **Suggested premise** (`propose_assumption`): *"A character can only be a good addition to a game that can contain them"*, `∀ (c : Character) (g : Game), GoodAddition c g → CanContain g c`, with the gap proof `fun h hg => pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds (h cynder newSpyro hg)`. telelean's scratch check confirmed that it closes the gap; its Lean name, derived from the sentence, is `a_character_can_only_be_a`.
4. **`finish(not_proved)`** with the gap *"Nothing links what a game can contain with which characters would be good additions to it."* The gate passed.
5. **Adoption.** The script pressed the equivalent of **I hold this** ("it seems obvious to me"). telelean wrote the card into the working copy before the target's block, worded by Claude, declared it on the target and froze again. Round 2's proof:

   ```lean
   theorem cynder_not_good.holds : cynder_not_good := fun hg =>
     pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds
       (a_character_can_only_be_a.holds cynder newSpyro hg)
   ```

   Its footprint is 13 names: the normative 11, plus `CanContain` and the adopted card's `.holds`. The gate passed at attempt 1; after Accept the goal was proved and a DERIVATION, and the adopted card an Assumption worded by Claude (m2-plan §12.2 step 5).

### 2.4 Demo: Socrates, on a fresh folder

The driver typed A "All humans are mortal", A "Socrates is a human" and G "Socrates is mortal" into a model just made by Initialize (no vocabulary at all), selected all three and pressed **These suffice ▶**.

- **No question.** Claude read "All humans are mortal" as a rule without exceptions and said so under "assumed without asking", together with its choice of one sort for everything.
- **Vocabulary, created from nothing** (`Model/Demo/Vocabulary.lean`):

  ```lean
  /-- Beings (things that may be human or mortal). -/
  axiom Being : Type
  axiom Being.exists : Nonempty Being
  instance : Nonempty Being := Being.exists

  /-- `Human x`: x is a human. -/
  axiom Human : Being → Prop
  /-- `Mortal x`: x is mortal. -/
  axiom Mortal : Being → Prop

  /-- Socrates. -/
  noncomputable opaque socrates : Being
  ```
- **Statements and proof** (`Model/Demo/Inbox.lean`, each directly below its card's block; the docstrings that repeat the cards' sentences are left out here):

  ```lean
  abbrev all_humans_are_mortal : Prop := ∀ x : Being, Human x → Mortal x
  axiom all_humans_are_mortal.holds : all_humans_are_mortal
  abbrev socrates_is_a_human : Prop := Human socrates
  axiom socrates_is_a_human.holds : socrates_is_a_human
  abbrev socrates_is_mortal : Prop := Mortal socrates
  theorem socrates_is_mortal.holds : socrates_is_mortal :=
    all_humans_are_mortal.holds socrates socrates_is_a_human.holds
  ```
- **The checks.** The freeze permitted 9 names; the proof rests on the two premises and the presupposition `Demo.Being.exists`. The gate passed at attempt 1 and flagged `Demo.Being.exists` as the one definition question; the driver answered **Yes, I endorse it** (its default). After Accept, Lean re-checked the files and the goal was proved.

### 2.5 Demo: the penguin

A "All birds can fly", A "Tweety is a penguin", G "Tweety can fly", in a fresh folder.

- **No question.** Claude again chose the strict reading of "All birds can fly" and listed it under "assumed without asking", with "penguin" as its own predicate, because no card says penguins are birds.
- **Vocabulary:** `axiom Animal : Type` with `Animal.exists` and its instance; `Bird`, `Penguin`, `CanFly : Animal → Prop`; `noncomputable opaque tweety : Animal`.
- **Statements:** `all_birds_can_fly := ∀ x : Animal, Bird x → CanFly x` and `tweety_is_a_penguin := Penguin tweety`, each with its `.holds`, and `tweety_can_fly := CanFly tweety`.
- **Round 1: not proved.** Gap: *"Nothing in the premises says Tweety is a bird."* Suggested premise: *"All penguins are birds"*, `∀ x : Animal, Penguin x → Bird x` (Lean name `all_penguins_are_birds`, gap proof `fun h => all_birds_can_fly.holds tweety (h tweety tweety_is_a_penguin.holds)`), checked by telelean to close the gap.
- **Round 2,** after **I hold this**:

  ```lean
  theorem tweety_can_fly.holds : tweety_can_fly :=
    all_birds_can_fly.holds tweety (all_penguins_are_birds.holds tweety tweety_is_a_penguin.holds)
  ```

  The footprint is the three cards plus `Demo.Animal.exists`. The gate passed at attempt 1 in both rounds; the driver endorsed `Demo.Animal.exists` and accepted, and Lean re-checked the files with the goal proved.
- **Claude's own warning,** in its summary: *"Under that reading the cards conclude that a penguin can fly, which isn't true of real penguins. If you meant "birds typically fly", that card would need to be weaker."*

### 2.6 Against the plan's estimate

m2-plan §12.3 estimated the walkthrough before anything had been measured.

| Both readings together | Estimate | Measured |
|---|---|---|
| Requests | 10–20 (normative) and 20–35 (literal) | 8 and 11 |
| Cache-read tokens | 0.5–1.5 M | 205,044 |
| Cache-write tokens | 50–150 k | 21,196 |
| Output tokens | 20–60 k | 6,810 |
| Wall time per reading | 5–15 minutes | 46 s and 61 s |

## 3. What the runs show

- **The harness works with the real CLI.** telelean's way of driving Claude Code (stream-json, its MCP tool server, the path guard, the subscription and hook checks before the first prompt) carried four complete sessions on Claude Code 2.1.322. Until turn 13 it had met only a node test double, recorded streams of 2.1.314, and M0's eight-request smoke test with a stub tool host.
- **The protocol works with a real model.** Claude used the tools as the system prompt asks: questions before formalising (walkthrough), `check_lean`, one freeze per round, proofs only after it, `propose_assumption` with a gap proof, and `finish` with an honest status. All of it was accepted at the first attempt.
- **A fresh model works.** On an empty folder Claude created sorts with their existence presupposition and instance, predicates and opaque constants exactly in the shapes the gate accepts, and put the statements directly below the cards' blocks in `Inbox.lean`.
- **The suggestion path works end to end:** the suggestion, telelean's scratch check, adoption, the second freeze and the round-2 proof, twice.
- **The extension's live path works in your own VS Code:** Initialize on an empty folder (palette, subject input, git dialog), typed cards, the consent dialog, finding Claude Code, the preflight (including turn 13's sandbox probe), the run panel, the review with a definition approval, I hold this, Accept and Lean's re-check.
- **It is cheap and quick:** about $0.14–$0.18 per run at API list prices, under a minute and a half each.

## 4. What the runs do not show

- **That the formalisations are faithful.** The gate certifies "proved from the selected premises *as formalised*" (project report §3.7 item 1); the runs show its limits:
  - **The penguin.** Read with no exceptions, "All birds can fly" plus the adopted "All penguins are birds" proves "Tweety can fly", which is false of real penguins. The proof is valid; the premise, as formalised, is what is wrong. Claude said so in its summary and under "assumed without asking"; nothing else in telelean would have.
  - **No questions in the demo.** In both demo runs Claude asked nothing: it chose the strict reading of "All …" and listed it under "assumed without asking". The dry run's scripted Claude asks a genericity question here, so the dry run is no guide to when the real one asks.
  - **The literal reading.** The scripted answer said a PG game *cannot contain* such a character *at all*. Claude glossed its new relation as permission ("the game is allowed to contain the character") and listed "'cannot have' as 'is not allowed to contain'" under "assumed without asking". Nothing checks that a formalisation follows an answer (§3.6, "Questions and decisions").
- **A human's review.** Every answer, every definition approval, every adoption and every Accept came from a script: the walkthrough's fixed answers, and the driver's defaults (option 1, **Yes, I endorse it**, **I hold this**, Accept). Nobody read the statements before accepting.
- **Paths that never came up live:**
  - the gate failing, Claude retrying, the give-up and the revert (every round passed at its first attempt);
  - Feedback, Cancel, a window reload and `--resume`, usage-limit warnings;
  - a real model attempting any of the cheats (the cheat catalogue is played by the FakeBackend only);
  - the board-edit merge, the `.ilean` fix and the blank-line findings of section 5 (none was needed in these runs);
  - the "Self-evident?" button, "Leave it open", and a "No" to a definition;
  - other models or efforts, larger models, and the 1.140.0 test build (the live demo ran in the snap).
- **Repeatability.** Each example ran once, and model behaviour varies from run to run.
- **The walkthrough ran on the code before turn 13's fixes;** it bundles the runner from the sources when it starts. It did not need any of them. The demo ran with all of them.

**Smaller observations from the transcripts.**
- In the Socrates run Claude rewrote `Inbox.lean` and `Vocabulary.lean` whole with Write instead of editing them. It reproduced every block byte for byte, so the markup rule (G5) passed. That rule, not the choice of tool, is what protects your words.
- The first message's example of a presupposition is the fixed text "there is at least one character" in every run, also for a model about humans or animals. This is cosmetic; it confused nothing.

## 5. Turn 13's fixes

All were found without real Claude. The fresh-model agent wrote FakeBackend scripts in which a well-behaved Claude follows the system prompt on a freshly initialised model with typed cards: the demo's path, which the Spyro sample never takes. They ran against the real RunManager, gate (with sandboxed Lean), proposal service and Accept. The snap agent ran the VS Code suites in your snap VS Code. The integrator applied the reports, rebuilt and re-ran everything.

### 5.1 Lean's index hides some declarations: a false rejection

- **Symptom.** Lean 4.35's `.ilean` index leaves some top-level declarations whose source mentions no constant out of its declaration table (`decls`). Examples: `abbrev two_plus_two_is_four : Prop := 2 + 2 = 4`, `theorem t : 2 + 2 = 4 := by decide`, and `theorem plain_mp : ∀ (p q : Prop), p → (p → q) → q := …`. Yet `abbrev q : Prop := True` and `axiom P0 : Prop` are listed, so the exact rule is unknown. telelean's facts then lacked these declarations, and check, freeze and the gate refused them fail-closed: *"Lean reported nothing about …"*. Arithmetic or purely logical examples, and generic helper lemmas, could not pass.
- **Change.** Such a declaration still has a `references` entry for itself whose definition has no parent. Runner `semantic/ilean.ts` now reports it as `unlisted`, skipping `example` (`<namespace>._example`) and private names. `semantic/refresh.ts` (`declDrafts`) takes its full range, docstring and keyword from core's declaration scanner, the one the board uses. It keeps the declaration only when the source declares that name, so a name Lean generates (for example by `deriving`) never appears. From then on the check file probes it like any other declaration.
- **Why this is safe.** The facts (type, kind, value, axioms) still come from Lean's own `#check`, `#print` and `#print axioms`; only the source range comes from telelean's scanner. The recorded Spyro and extras facts did not change.
- **Tests.** Two new cases in `ilean.test.ts` on an `.ilean` recorded from Lean 4.35 (`test-fixtures/semantic/recorded/unlisted-Inbox.*`). Fresh scenario (g), `arith.json`, fails without the fix ("Lean reported nothing about Demo.two_plus_two_is_four") and passes with it.

### 5.2 Accept refused cards typed during a run (demo-breaking)

- **Symptom.** Accept merges Claude's changes onto your current files with a 3-line-context patch and no fuzz, so an edit of yours within 3 lines of one of Claude's is a conflict. On a freshly typed `Inbox.lean` every card sits within 3 lines of Claude's formalisation. A card added with the A|D|G box, or a reason written on a card, while Claude worked therefore refused the Accept. The board does not lock editing during a run, and it asks for a reason on every assumption. All three exploratory cases were conflicts.
- **Change** (runner `proposal/files.ts`: `mergeFile`, new `boardEditsOf`). When the plain patch cannot be placed, the board's own edits are taken out of your text:
  - **added cards:** a run of new comment-only blocks (an id the base does not have, `id:` written, no `lean:`, bound to nothing) that ends the file's namespace, which is where the A|D|G box puts them;
  - **reasons:** `rationale:` written, changed or removed on an existing card, where the block reads exactly as at the start once its rationale is set back.

  Claude's patch is applied to the rest, and the edits are put back by card id: reasons with the field editor, cards at the end of the namespace. The result must read exactly as you wrote it, or it is a conflict. **Every other edit within 3 lines is still a conflict**, above all a changed sentence next to Claude's formalisation of it. As before, Accept then normalises, re-freezes (for a proved round) and re-runs the gate on the merged files, with your files at Accept as the base.
- **Tests.** `boardEdits.test.ts` (6 tests). Fresh scenario (b) adds a card and a reason while Claude works, and Accept keeps both. The existing conflict tests of `accept.test.ts` still pass.

### 5.3 A misleading message for a blank line

- **Symptom.** If Claude's statement is separated from a selected card's block by one blank line, the block binds nothing (TL013). check and freeze then called the assumption's `.holds` *"a Prop-valued axiom (a belief) … propose a missing premise with propose_assumption instead"*, and the card one that *"has no Lean statement"*. Claude could have deleted the very axiom it needed.
- **Change** (core `gate/rules.ts`, `gate/describe.ts`). A chosen card left without code only by such a gap now gets `new-axiom` and `not-formalised` findings with the token `detached`. They say to remove the blank line and keep the axiom; the board's sentence is *"it left a blank line between “…” and its Lean statement"*. The codes and the verdicts are unchanged.
- **Tests.** Core `rules.test.ts` and `describe.test.ts`. Fresh scenario (h), `variants.json`, makes the mistake on purpose: one failed check and one refused freeze, both naming the blank line, then fixed.

### 5.4 The system prompt disagreed with the gate in four places

The four lines (runner `run/systemPrompt.ts` and `docs/m2-plan.md` §5.1, which a test keeps identical):
1. **Step 3** now says where typed cards are: *"cards typed on the board sit in the subject's Inbox.lean: formalise them there"*.
2. **Step 3** also says how a selected Goal or Derivation premise without Lean is used: *"may be formalised the same way (no `.holds` axiom) and proved after the freeze"*. The gate already accepted that.
3. **Step 5** allows the proof *"(or lower in the file, below everything it uses)"*. When the goal is typed before its premises, a proof "right after the target's statement" does not build, because the premises' `.holds` come later in the file; that cost a check.
4. **The vocabulary rule** lists propositions `axiom P : Prop`, which the gate accepts. It says *"The person confirms each new `T.exists`"*, and that only *other* definitions and instances are questions. The old line said every `instance` is a question, which contradicted the required presupposition instance.

### 5.5 A run could start Claude where Lean's sandbox cannot run

- **Symptom** (snap agent). This kernel restricts unprivileged user namespaces through AppArmor. An unconfined `bwrap` fails with *"setting up uid map: Permission denied"* (and *"loopback: Failed RTM_NEWADDR: Operation not permitted"*). The preflight only checked that the programs exist, so outside the snap VS Code a run would pass it, start Claude (spending quota), and then fail at its first Lean job.
- **Change** (runner `lean/runLean.ts`, `run/preflight.ts`).
  - `checkUserNamespaces()` runs `bwrap` once, with the real profile's namespace flags and system mounts, on `/usr/bin/true`. It runs straight from the extension host, whose AppArmor label a run's `bwrap` inherits, and caches a success.
  - The run preflight calls it after the tools check. A failure refuses the run before anything is sent: *"Lean's sandbox is not available, so telelean cannot check Claude's work: bwrap cannot set up the sandbox here (…)"*. When the sysctl is 1 it adds: *"this kernel lets only some programs create user namespaces (AppArmor: kernel.apparmor_restrict_unprivileged_userns=1): run telelean in the VS Code snap, whose processes may create them, or give bwrap an AppArmor profile that allows it"*.
  - The same sentence is appended when any Lean job's `bwrap` fails that way, so the board's "Lean: off" reason ("sandbox unavailable: …") explains it too.
- **Tests.** `userns.test.ts` (6 tests), and the host-environment suite asserts the probe in the snap and in the test build.

### 5.6 Wrong advice after a conflict

- **Symptom.** Both Accept refusals, an overlap and a failed re-check after drift, advised *"Discard, or Feedback to redo it on your current files"*. Feedback continues on Claude's working copy; it never moves onto your files, so the next Accept met the same conflict.
- **Change.** *"…; Discard, or undo those edits and Accept again."* (`proposal/files.ts`) and *"… Discard, or undo your edits since the run started and Accept again."* (`run/manager.ts`). The test, the user guide, the plan's §7.1 and the project report say the same. Feedback itself still does not rebase (section 9).

### 5.7 New: the demo, its driver and `npm run demo`

- **`docs/DEMO.md`:** the five-minute demo with your own example (new window, fresh trusted folder, Initialize, typing cards, These suffice, answering, the review, Accept or I hold this), what to expect with measured timings, tips for good examples, and troubleshooting.
- **`packages/extension/scripts/demo-driver.mjs`** (with `demo-ui.mjs` for the workbench and board over the DevTools protocol, and `demo-vscode.mjs` for the isolated instance) plays the whole demo in a separate VS Code window. It prints a JSON summary (verdicts, questions and answers, suggestions, the final Lean, statuses after Accept, times, usage) and saves screenshots. Its modes:
  - `--dry-run` (the default): VS Code's Test mode, the only mode in which a backend other than the real Claude can be installed. An agent inside VS Code (`test/demo/agent.ts`) installs a scripted "Claude" (`test/demo/demoClaude.ts`), answers in advance the git and consent questions Test mode never shows, and runs Initialize with arguments, since Test mode has no folder picker. Everything else goes through the board. The scripted Claude handles syllogisms and chains, with a genericity question whose answer changes the result, and anything else as whole sentences joined by a linking premise; real Lean and the real gate judge its work.
  - `--rehearse`: the exact live path in Development mode (palette, folder pick, subject input, git dialog, the real consent dialog) up to the run's start, which the quota tripwire must then refuse before any Claude binary is looked up.
  - `--live`: the same, then the real run. It needs both `--live` and `TELELEAN_DEMO_LIVE=yes`, refuses while `TELELEAN_NO_REAL_CLAUDE` is armed, uses the real HOME (Claude Code's login), and cancels at the first usage-limit warning unless `--continue-on-rate-warning`.
- **Defaults:** option 1 for each question; **Yes, I endorse it** for definitions (`--no-approve-definitions` stops instead); **I hold this** on a gap-closing suggestion (`--no-adopt`); Accept (`--end discard`). `--vscode test-build|snap|<binary>` chooses the VS Code.
- **`npm run demo`** (in `packages/extension`) runs the driver.

### 5.8 New: the VS Code suites in your own snap VS Code

- **`npm run test:smoke:snap`** (`scripts/smoke.mjs --snap`, with `scripts/snap-env.mjs`) runs the smoke and end-to-end instances in your installed snap VS Code instead of the downloaded 1.140.0 build. It starts the snap through its own `electron-launch` with the variables `snap run` sets, and keeps the snap's per-user folders in the isolated HOME. Running `snap run` itself would always use the real `~/snap/code`, because snapd takes the home folder from the password database.
- **New host-environment suite** (`test/suite/hostEnv.test.ts`, in both modes). It records what the extension host inherited, then checks the Lean sandbox (tools, the userns probe, a sandboxed `lean --version`), that Claude's cleaned environment keeps no snap variable or path, and the path guard's self-test under the chosen hook runtime and under the Electron-as-Node fallback.
- **`smoke.mjs`** now reports the AppArmor label and cgroup it ran under, warns when it runs unconfined on a userns-restricted kernel, watches `~/.vscode` and (snap mode) `~/snap/code` as well, and removes a Chromium shared-memory file its own instance left in `/dev/shm` that no process uses.
- **A harness leak, fixed.** The test instances inherited the variables of a Claude Code session that started them (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, a messaging socket and token, …); they now drop every `CLAUDE*`, `MCP_*` and `AI_AGENT` variable.
- No snap-specific failure needed a fix in the extension itself.

### 5.9 New: nine fresh-model scenarios

`packages/runner/test/run/fresh.e2e.test.ts` plays `test-fixtures/fresh/*.json`. Each starts from an empty folder: Initialize, the board's own add-card actions, These suffice, the real RunManager and gate with sandboxed Lean, Accept, a refresh and the board's statuses.
- (a) Socrates, with Undo and Redo, then Plato in the same model;
- (b) a chain with a named lemma and a tactic proof, plus a card and a reason typed while Claude works;
- (c) the penguin, with a question, a suggestion and adoption;
- (d) "Self-evident?" that is not;
- (e) the goal typed first;
- (f) a propositional example with a Derivation target;
- (g) arithmetic, self-evident;
- (h) honest variants a real Claude may write;
- (i) an intermediate step typed as a Derivation and selected.

A well-behaved Claude is never refused, apart from the mistakes the scripts make on purpose.

## 6. Environment findings

1. **Lean's sandbox works only inside the VS Code snap on this machine.** With `kernel.apparmor_restrict_unprivileged_userns=1` (Ubuntu 24.04), `bwrap` may create its user namespaces only under an AppArmor profile that allows it. The snap VS Code's processes, and everything they start, run as `snap.code.code (complain)`, which does. In a VS Code started any other way, in a script started from GNOME Terminal or over ssh, and in a transient systemd service, `bwrap` fails. The preflight now says so before a run starts (5.5); the board's checks have always failed closed ("Lean: off").
2. **A fresh folder must be trusted.** telelean does not run in Restricted Mode (`untrustedWorkspaces.supported: false`), so its commands are missing until you trust the folder. The test instances run with workspace trust off, so no automated test covers this; the demo driver's `--rehearse` and `--live` do.
3. **Open the demo in a new window** (File → New Window). **Developer: Reload Window** also restarts everything else running in that window, including a Claude Code session there.
4. **Your VS Code is the snap 1.145.2** (Electron 43.8.3, revision 278), newer than the 1.140.0 test build; both pass every suite. The extension host's environment holds the snap's variables (`SNAP*`, `GTK_*`, `GDK_*`, `LOCPATH`, `ELECTRON_RUN_AS_NODE=1`, …). telelean's cleaning removes all of them from Claude Code's environment, and the hook runtime it picks there is `~/.local/bin/node`.
5. **Claude Code** was 2.1.322 for every run. As of 2026-11-13, 2.1.323 was installed as well. On 2026-11-16 the VS Code Claude Code extension, which updates itself, was at 2.1.325 (installed 2026-11-15), and 2.1.322 and 2.1.323 were gone. telelean looks first at the copy the running Claude Code extension uses, then at the installed ones, newest first, and requires only 2.1.295 or newer, so the next run uses 2.1.325. The flags telelean passes were last compared with Claude Code's help text on 2.1.322 (section 1); `node scripts/walkthrough-claude.mjs --dry-run --binary-check` finds the current binary and prints the command line without spending quota.
6. **Harmless noise:** VS Code 1.145.2 prints an "InstantiationService has been disposed" stack when the raw-diff tab closes (VS Code's own bug). Once, a test instance left a Chromium file in `/dev/shm` at shutdown; `smoke.mjs` now cleans that up (5.8).

## 7. Verification after the fixes

The integrator's runs, 2026-11-10, with no real Claude (the tripwire armed throughout):

| Suite | Result |
|---|---|
| core (`npm test`) | 48 files, 500/500 passed |
| runner (`npx vitest run`, real sandboxed Lean, 816 s) | 58 files: 566 passed, 1 skipped, 0 failed. This includes the prompt test against m2-plan §5.1, `fresh.e2e` (9), `walkthrough.e2e` (both readings and all 20 cheat scripts), `integration/m2flow`, `proposal/accept`, `boardEdits` (6), `userns` (6), and the two script tests that were not run before turn 13 |
| webview | 130 unit tests; 81 Playwright tests |
| extension | type check clean; 180 unit tests (21 files) |
| VS Code suites | 40 smoke + 21 end-to-end tests in the 1.140.0 test build, and the same in the snap 1.145.2; no isolation failure |
| demo driver | `--dry-run` (Socrates, test build) passed in 33 s; `--rehearse --vscode snap` passed in 16 s, refused by the tripwire as designed; `--dry-run --vscode snap --answer 2` (not proved, then I hold this, then proved) passed in 44 s |
| walkthrough dry run | both readings passed |

**The gate stayed sound:** every cheat script still fails as it should, as do core's premise-cheat and carrier tests. Counts are quoted from the reports and were not re-run for this write-up.

## 8. Evidence, and what the live runs touched

- **Claude Code's transcripts** of the four sessions are in `~/.claude/projects/`, in four folders named after the runs' working copies (`…-turn13-live-normative-…`, `…-live-literal-…`, `…-live-demo-1-…`, `…-live-demo-2-…`). They are copied, with your email address redacted, to `verbatim_prompt_log/bundle_13/evidence/live_claude_sessions/`. The exact Lean, questions and usage above come from them.
- **The four agents' reports** are in `verbatim_prompt_log/bundle_13/subagent_reports/demo_readiness_workflow/`.
- **Lost:** the scripts' `summary.json` files, the runs' own folders (telelean's `transcript.jsonl`, `run.json`) and the driver's screenshots. They were in the session's scratch folder under `/tmp`, which a reboot on 2026-11-12 removed. The wall times in 2.1 are the ones the main session reported on 2026-11-10.
- **Outside the scratch folder,** the live runs touched what any Claude Code session touches: Claude Code read its login in `~/.claude/` and wrote its session transcripts (above), and, as in any session, its own state file `~/.claude.json`. The demo's VS Code kept its profile, extensions, XDG folders and the snap's per-user folders in the work folder. As always, telelean ran Lean through the toolchain's own binaries, never elan's proxies.

## 9. Still open after turn 13

- **Feedback after an overlap conflict still does not rebase** onto your files; only the advice changed (5.6).
- **Vocabulary over Lean's built-in types is refused** by the simple shape rule (D-3), for example `noncomputable opaque age : Person → Nat` or `axiom Even : Nat → Prop`. Numeric examples need predicates over sorts; statements may still use numerals.
- **Every new sort's existence presupposition (`T.exists`) needs "Yes, I endorse it" before Accept.** This is by design; the demo guide says so.
- **The exact rule** by which Lean 4.35 leaves declarations out of the `.ilean` table is unknown; telelean recovers every top-level declaration with the observed pattern (5.1).
- **The paths of section 4** have not met the real Claude.
- **The theory gaps of project-report §3.7 are unchanged:** the target's `.holds` exemption, the pre-freeze instance blind spot, and the freeze discipline holding per round only.
- **Earlier open items are unchanged:** the `reuseLeanBuild` wording, the suggestion's Lean-name chip, cosmetic test titles (project report A.2), and the open decision on where "Raw Lean diff…" opens.
- **Test hygiene:** `runner/test/workspace/helpers.ts` leaves an empty `/tmp/telelean-ws-tests-*/tmp` per test file when `TELELEAN_TEST_TMP` is unset.
- **telelean's output-token count is far too low with the real CLI** (2.1): the run panel, the report card, `attempts.jsonl` and the scripts' summaries showed 111–143 output tokens per run, where Claude Code's transcripts record 1,913–3,886. Requests, the other token counts and the cost estimate agree with Claude Code's own record. Found on 2026-11-16; not fixed.
- **Claude Code has moved on to 2.1.325** (section 6, item 5): the live results above are for 2.1.322.
