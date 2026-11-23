# Live Q&A during review: design note

*Draft for your approval, 2026-11-22. Nothing is built; this is for a later slice.*
- *What you asked for (turn 23): a box for asking Claude questions during review, through which Claude can't edit anything or cause any effect.*
- *When (turn 25): a later slice, after you approve this note.*
- *References: file:line is as of commit `c557f06`, though the 2j work in progress may move a few lines. Paths start at `packages/` unless they start with `docs/` or `scripts/`.*

## 1. Goal and non-goals

- **Goal:** while you review a stage, you type a question ("What does `Being.exists` commit me to?") and Claude answers in the review panel.
- **Non-goals:**
  - It changes nothing: no file, card, item, status, run record, Undo step or later Claude step.
  - It is not a way to instruct Claude; notes and Submit are.
  - It is not a chat with the Claude that did the steps (§3).

## 2. The no-effects guarantee, made mechanical

- **Today, each step runs your Claude Code CLI headless** (`runner/src/llm/claudeCli.ts:75–121`).
  - It has five file tools and telelean's tool server. The server speaks MCP, the protocol behind `check_lean`, `finish` and the other telelean tools.
  - A hook, a check the CLI runs before every tool call, keeps the file tools inside the run's copy `ws/` (`runner/src/llm/confinement.ts:115–147`).
  - bwrap, a Linux sandbox, wraps only the Lean processes, not Claude (`runner/src/lean/runLean.ts:1–23`).
- **A question starts a separate CLI process with nothing to call:**
  - `--tools=`: no built-in tools. This is the empty-list form already used for `--setting-sources=` (`claudeCli.ts:112–113`).
  - `--disallowedTools` naming every built-in tool.
  - `--strict-mcp-config` with no servers.
  - `--permission-mode dontAsk`: whatever isn't allowed is refused, without asking.
  - `--max-turns 1`.
  - `--no-session-persistence`: the CLI saves no conversation file.
  - Never `--resume`; an empty working folder.
- **Kept from today:** none of your Claude settings, the cleaned environment, and the subscription-only check (`runner/src/llm/env.ts:13–80`, `claudeCli.ts:465–493`).
- **The hook stays,** with a new policy mode that refuses every tool; today's guard still allows the file tools inside `ws/`, so this is a small code change (`runner/bin/telelean-path-guard.mjs:58–105`).
- **Flags to verify:** `--tools=`, `--no-session-persistence` and, for Option B, `--fork-session` appear nowhere in the repo yet. They are checked against your CLI's `--help` first, as the current flags were (`claudeCli.ts:97`).
- **telelean's own check:**
  - The CLI's first event names its tools and servers (`runner/src/llm/types.ts:102–114`).
  - If either list is not empty, or a tool call or a refused permission shows up (`runner/src/llm/streamJson.ts:245, 288–289`), telelean kills the process and drops the answer.
  - It then shows "Stopped: Claude tried to use a tool; nothing ran."
  - Without tools, anything Claude writes is only text. Text in your cards that reads like an instruction can't make anything happen either.
- **What telelean does with the output:**
  - It keeps the answer text and the usage figures.
  - It shows the text as plain text, marked as Claude's words (D-15; `webview/src/common/AgentText.tsx:1–33`).
  - It logs it (§7).
  - It never reads it as commands, and never puts it into a model file, a run record or a Claude turn.
- **One residue:** like every run, the CLI updates its own housekeeping files in your home folder. A bwrap sandbox around the CLI would need the network and your login folder, so I'd defer it as hardening.

## 3. Meaning before proof

While a stage's results are hidden, nothing you see may depend on whether a proof was found (RV-6; `docs/slice2-plan.md` §4.7, D2-61).
- **The masked view:** the host sends a view in which every proof-derived detail is as it was before the session (`core/src/review/view.ts:636–685`).
- **Its tests:** paired runs check that this view is byte-identical whether or not Claude proved the targets (`runner/test/run/session.twins.test.ts:67, 114`).
- **The catch:** the step's Claude conversation knows the outcome, because one conversation runs every step (`runner/src/run/session.ts:2–3`).

**Option A: a fresh Claude that sees what you see.**
- **What it gets:** a context rendered only from that masked view: cards, items, vocabulary, your decisions and notes, and the Claude questions you answered.
- **What it never gets:** the step conversation, Claude's withheld words, or even the step timings.
- **Tested by the same pairs:** the Q&A request must also be byte-identical in both twins.
- **When it works:** while the results are hidden too. After Show results, it also gets what the panel then shows.
- **Its limit:** it doesn't know why the stepping Claude chose something, and it is told to say so.

**Option B: continue the step conversation** in a copy without tools (`--resume … --fork-session`).
- **The gain:** Claude can discuss its own choices.
- **Meaning before proof:** that conversation knows the outcome. So asking while the results are hidden counts as Show results, and every Result is marked "seen early".
- **Cost:** several times more per question, because the whole conversation is re-read. The Socrates demo wrote about 12 k tokens to the cache (system prompt, tools and conversation; `docs/m2-live-report.md:52`).
- **A changed tool list:**
  - It defeats the prompt cache, Anthropic's reuse of a recent request's already-read beginning.
  - It may make the API refuse Claude's earlier hidden reasoning; I haven't verified this with the CLI.
  - Keeping the tools instead weakens "Claude cannot call a tool" to "the call is refused".

**Recommendation: A.**
- It keeps RV-6 without exceptions.
- It costs least.
- Its guarantee can be tested.

B could come later, offered only once the results are shown.

**Two refinements:**
- If the results are hidden again, answers given while they were shown are folded and left out of later requests.
- While the results are hidden, Claude is asked to discuss meaning, not whether the target follows. This one is an instruction, not a mechanism (question 4).

**Answers never reach later steps.**
- The Q&A has its own process and its own file.
- The step turns take no Q&A input (`runner/src/run/prompts.ts:216–418`). A test checks they are byte-identical with and without a thread.
- Only what you type into a note or the overall comment (2j) reaches Claude.

## 4. What Claude sees per question

- **Each request holds:**
  - a fixed system prompt of about 1 k tokens;
  - a snapshot of the panel as it is now;
  - the thread so far, as quoted text;
  - your question, and the item you had open.
- **Size:** about 3–5 k tokens for a model of doorclose's size. The live check measures it, and the box shows a rough count before you send.
- **Each question resends everything:** one process per question.
  - Nothing sits in memory between questions.
  - Each answer sees the current state.
- **Follow-ups:**
  - A follow-up within about 5 minutes (the usual cache lifetime; not measured here) may get its unchanged beginning from the prompt cache.
  - **New thread** starts small again.

## 5. Cost and consent

- **Every question is one Claude request on your plan.**
  - It is not billed per token, but it counts toward your usage limits.
  - At API list prices, a question on the default model (Opus 5.5, as the steps use) is roughly 4–6 US cents: my estimate, not measured. That is about a third of the whole live Socrates demo run, which cost $0.14 for 6 requests (`docs/m2-live-report.md:52`).
  - Each answer shows its tokens and the CLI's estimate.
- **First use:** a one-time dialog per model folder, like the run consent (`extension/src/logic/runs.ts:50–63`, `extension/src/vscode/host.ts:496–508`). It reads: "Ask Claude about this review? Each question is one request on your plan. telelean sends what the review panel shows and your question. Claude gets no tools: it can only answer." A no sends nothing and isn't remembered.
- **Stop** ends an answer at once: the process is killed, and the partial text is kept, marked "stopped".
- **Spending limit per question:** set with the existing `--max-budget-usd` (`claudeCli.ts:117`).

## 6. UI sketch

- **Where:** a folded section, "Ask Claude (answers only)", in the review panel, under the list and the item detail (`webview/src/run/RunPanel.tsx:397–421`). The item detail gets **Ask about this item**.
- **The thread:**
  - your questions, and Claude's answers with its marker;
  - each answer labelled with its stage and with "results hidden" or "results shown";
  - **Ask** (Ctrl+Enter), **Stop** and **New thread**.

  The review keys (A, D, ↑/↓) are off while you type.
- **Streaming:** the answer appears as it is written, from the CLI's partial-message events (`claudeCli.ts:100`, `streamJson.ts:333–334`).
- **While a step runs:** I'd disable the box, with "Claude is working on a step: ask when the stage opens". That matches the other review controls (D2-62, `core/src/review/texts.ts:89`).
  - Two Claude processes at once would share your plan's rate limit.
  - The panel then shows only a frozen copy of the stage anyway.
- **Submit, Formalize, Retry and Exit** first stop an answer that is still arriving.

## 7. Persistence and logs

- **The thread:** an append-only file of its own in the run folder, `session/qa.jsonl`. It is not in `run.json`, so it can't touch the session's records, its Undo stack or the view.
- **The transcript:** the exact text sent and every event go into `session/transcript.jsonl` as `qa-…` lines, like every turn (`runner/src/run/persist.ts:1–5`).
- **After a reload:** the thread comes back. An answer that the reload cut off is marked "interrupted" and is never resumed.
- **On Exit or Apply:** an answer still arriving stops. The thread stays in the run folder until the run is pruned; by default the newest 10 runs are kept (`telelean.run.keepRuns`; `runner/src/run/step.ts:1049–1051`).

## 8. Tests

- **Flags:** a unit test pins the exact command line and environment, as `runner/test/llm/argvEnv.test.ts:31` does for steps.
- **No-tools check:** the test suite's fake CLI (`runner/test/llm/fixtures/fake-claude.mjs`) gets two scripts: a first event that lists a tool, and an answer with a tool call.
  - Both must end "Stopped".
  - `ws/`, the shadow history, `run.json` and your files must be byte-identical before and after.
- **No effects:** a test runs a Q&A exchange with the FakeBackend, telelean's scripted stand-in for Claude (`runner/src/llm/fake.ts:1–12`). It must leave the records and the view unchanged, and the step turns byte-identical.
- **Masking:** each pair in `session.twins.test.ts` must render a byte-identical Q&A request while the results are hidden.
- **One paid live check, only with your OK:**
  - It needs a double opt-in, like the walkthrough script's (`scripts/walkthrough-claude.mjs:10–22`).
  - It asks 3 questions on a copy of a sample model, one of them inviting a tool.
  - It passes if the CLI reports no tools, the answers arrive, and nothing changes.

## 9. Effort

Scaled from slice 2 (about 0.7–1.2 M subagent tokens per sub-slice):
- **Q1, runner and core: ≈ 1.0–1.2 M.**
  - the context renderer;
  - the tool-less process and its checks;
  - the thread file, the RunManager calls and the protocol messages;
  - their tests.
- **Q2, extension and webview: ≈ 0.7–1.0 M.**
  - consent;
  - the box, streaming and Stop;
  - item tags;
  - the user guide.
- **Integration: ≈ 0.3–0.5 M.** The full suites, review and build, then the live check.

In all, ≈ 2–2.7 M. Option B would add about 0.5–1 M and a second paid check.

## 10. Questions for you

1. **A or B?**
   - (a) A.
   - (b) B.
   - (c) A now, B later and only once the results are shown.

   *I recommend (a); (c) only if A's answers feel too shallow.*
2. **Can you ask while a step runs?**
   - (a) No: the box is disabled, with the reason.
   - (b) Yes, about the stage as it was when the queue started.
   - (c) Only while the step waits for your answer to one of Claude's questions.

   *I recommend (a); (c) is a small addition.*
3. **Do answers ever reach later steps?**
   - (a) Never; only text you type into a note or the overall comment does.
   - (b) As (a), plus a **Quote in note** button that pastes a marked quotation.
   - (c) The thread goes with the next Submit automatically.

   *I recommend (a). (b) could come later; (c) would make the Q&A an effect.*
4. **"Does it prove it?" while the results are hidden:**
   - (a) Claude declines and points to Show results.
   - (b) Claude answers freely.

   *I recommend (a).*
5. **Effort for answers:**
   - (a) Medium: faster, and less of your plan (`docs/DEMO.md` suggests it for speed; not measured, and I have not checked it is Opus 5.5's own default).
   - (b) High, as the steps use.

   *I recommend (a), as a setting.*
6. **Consent:**
   - (a) Once per model folder, separate from the run consent.
   - (b) The run consent covers it.
   - (c) Confirm every question.

   *I recommend (a).*
