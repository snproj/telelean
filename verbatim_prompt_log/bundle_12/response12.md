**In short: there is no "reading" field that Lean or the gate uses.** Readings are handled in two places, and neither changes the Lean encoding by itself.

## 1. What you can say when adding an assumption (optional)

The A|D|G box's second row offers three things for an ASSUMPTION:
- **Stance:** "I believe it" (`believe`), "It's a rule or definition" (`rule`), "Supposing, for argument" (`supposing`).
- **Source:** observed / reported / inferred / common knowledge.
- **Why:** a free-text rationale.

These are saved in the card's block as `stance:`, `source:` and `rationale:`, and passed to Claude in the run's context. In the Spyro sample, "PG games cannot have characters with dark pasts" is tagged `stance: rule`.

They are **only context.** No gate rule, status or encoding depends on them: every assumption becomes `axiom n.holds : n` whatever its stance. Note also that stance is your *attitude* to the sentence, not a disambiguation of its *content*. A sentence you mark as "a rule" can still be read literally ("PG games can't *include* such characters") or normatively ("such characters aren't *good additions*"). So the normative/literal question stays open even with `stance: rule`.

## 2. Claude asks, tagged by phenomenon

The system prompt tells Claude to ask with `ask_user` before formalising whenever a sentence has readings that would *change the result*, and to skip differences that don't matter. Any interpretive choice it makes without asking must be listed in `finish` (`assumed_without_asking`), which you see in the review.

Each question carries one of **14 phenomenon tags**. The tags are fixed in `core/src/run.ts` (`PHENOMENA`), mirrored in the tool schema, and the build checks that the two lists agree. The glosses and examples below are mine; the code has only the tag names.

| Tag | What it's about | Spyro example |
|---|---|---|
| `modality` | the force of "can/cannot/must": rule (deontic), impossibility, or likelihood | **normative vs literal "cannot"** |
| `genericity` | generic claims: all, typically, or by default? | "PG games …" |
| `negation` | strength and scope of a negation | "not a good addition" vs "a bad addition" |
| `presupposition` | what a sentence takes for granted | that the new Spyro game exists |
| `enthymeme` | an unstated premise the argument relies on | the bridge from "can't be in it" to "not a good addition" |
| `scalar` | scale words and their implicatures (some/most/all, good/great) | "good addition" |
| `vagueness` | borderline cases | what counts as a "dark past" |
| `evaluative-standard` | good by whose standard, for what purpose | "good" for players? for the rating? |
| `indexical` | context-dependent words | "the new game" |
| `word-sense` | which sense of a word | "have" = include, depict, or mention |
| `tense` | when it holds | "explores a dark past" |
| `granularity` | how fine-grained the model is | character vs portrayal |
| `closed-world` | whether unstated things count as false | |
| `other` | anything else | |

**On the board,** a question card shows 2–4 options, each with its plain consequence, plus free text and "Leave it open". Claude's own guess is revealed only after you answer.

**Your answer is recorded** in `.telelean/decisions.json` with a scope:
- **this run:** never reused;
- **these nodes:** reused whenever a later run involves them;
- **the whole subject:** always reused.

Later runs receive them as "earlier answers in force".

## How a reading ends up in Lean

There is **no modal or deontic logic**. A reading is encoded through **which predicates the statement uses**:
- **Normative:** `∀ g c, IsPG g → HasDarkPast c → ¬ GoodAddition c g`. The normativity sits inside the predicate `GoodAddition`, so the goal follows in one step.
- **Literal:** `∀ g c, IsPG g → HasDarkPast c → ¬ InGame c g`. This uses a different predicate, so the goal doesn't follow and a bridging premise is needed.

The choice of reading therefore becomes a choice of vocabulary, and entailment follows from that. **Nothing machine-checks that the Lean matches the reading you chose.** That faithfulness rests on your review, where each sentence is shown beside its Lean (report §3.7).

## Things you may want to change

- Stance has no formal effect. For example, `supposing` could become a hypothesis instead of an axiom, and `rule` conflates norms with definitions.
- The chosen reading lives in `decisions.json`, not on the card itself. The M3 design adds DECISION cards to the board.
- The phenomenon list and the "when to ask" rule are easy to edit: `core/src/run.ts` and `runner/src/llm/types.ts` for the list, and `runner/src/run/systemPrompt.ts` (rule 2) for when to ask.
