# map:run-engine

# Run engine map (runner side): how a "These suffice" run works, end to end

Sources read in full: `packages/runner/src/run/{manager.ts, types.ts, prompts.ts, systemPrompt.ts, persist.ts, preflight.ts, backend.ts, index.ts}`, `packages/runner/src/llm/toolSchemas.ts`, `packages/core/src/run.ts`, `packages/core/src/gate/rules.ts`, `packages/core/src/gate/types.ts`, `packages/runner/src/gate/types.ts`, `packages/runner/src/proposal/{service.ts, types.ts}`, `packages/runner/src/shadow/types.ts`, `packages/runner/src/llm/types.ts`.
Read in part: `runner/src/gate/engine.ts` (runCheck, freeze, normalise, gate, renderStatements), `shadow/workspace.ts` (lastCommit, revertTo), `llm/claudeCli.ts` (tool allowlist, CLI args), `llm/confinement.ts`, `llm/toolServer.ts`, `llm/fake.ts`, `llm/fakeScripts.ts`, `core/src/gate/{adoption.ts, permitted.ts, g0.ts}`, `core/src/proposal/{diff.ts, index.ts}`, and a few extension/webview files, only to quote exact UI strings.
Docs compared: `docs/m2-plan.md` §2–§7 and `verbatim_prompt_log/bundle_1/user_requested_documents/02_design_decisions.md` (D-19, D-20, D-21). Where docs and code differ, the code is authoritative (§8 lists the differences).

---

## 0. Summary

- A **run** is one Claude Code session that proves one target card from a fixed selection of premises.
- The run is split into **rounds**:
  - round 1 starts at "These suffice";
  - every Feedback starts a new round;
  - every ghost adoption starts a new round.
- Each round ends in exactly one **proposal** (state `review`), or the run fails or is cancelled.
- Claude works only in a private shadow copy (`ws/`). Its file tools can write anything under `ws/`.
- All protection is **detective, not preventive**. A non-LLM gate judges the files at `check_lean`, `freeze_statements` and `finish`. A state that breaks a rule never reaches a proposal: there are 3 gate attempts per round, then a revert to the last passing state.
- Today the gate protects **everything that existed in the user's files at run start** (B). It also protects telelean's own adopted-ghost text (A).
- It protects **nothing Claude wrote in an earlier round**.
- There is **no per-card or per-field protection status** that the user controls.
- **Accept is all-or-nothing and terminal (D-21).** Only these parts of a proposal are decided per item:
  - definition questions: every one needs a yes;
  - lifecycle ticks (G→D);
  - ghosts: "I hold this" or "No".

---

## 1. The run state machine

### 1.1 States and stages (core/src/run.ts)
- `RunState` (core/src/run.ts:108-124):
  - `starting`
  - `working`
  - `waiting-for-answer`
  - `gate`
  - `review`
  - `interrupted`
  - `accepted`, `discarded`, `cancelled`, `failed`: the terminal states (`TERMINAL_RUN_STATES` :126).
- `RunStage` (:133): `formalise` (before `freeze_statements`) or `prove` (after it).
- `RunVerdict` (:136-153), how a round ended: `proved`, `not-proved`, `insufficient`, `inconsistent`, `gave-up`, `cap-reached`, `no-finish`, `cancelled`, `failed`.
- The agent-active clock runs only in `working` and `gate` (manager.ts:536-544). It is paused in `waiting-for-answer`, `review` and `interrupted`.

### 1.2 Start (manager.ts:821-974; preflight.ts; extension boardSession.ts:342-349)
1. **Extension.**
   - It refuses at once while any run of the root is active. Exact texts, extension/src/logic/runs.ts:169-181:
     - `Claude's proposal for "<S>" is waiting for your review: Accept, Feedback or Discard it first.`
     - `Claude is already working on "<S>" in this model: wait for it to finish, or Cancel it first.`
   - It then asks for egress consent (once per root) and calls `manager.start({subject, target, premises})`.
2. **startLock** (821-833): `Another run of this model folder is starting.`
3. **Preflight** (preflight.ts:85-116), in this order:
   - busy;
   - selection: the target must be a GOAL or DERIVATION card. For an assumption the refusal is `"<sentence>" is an Assumption, something you hold: make it a Derivation first (D-11), then prove it.` Each premise must be a card, and the target must not be among its premises;
   - workspace M2 members;
   - toolchain: `leanprover/lean4:v4.35.0` and no Lake dependencies;
   - sandbox: bwrap and user namespaces;
   - memory.
   - A refusal creates, declares and spends nothing.
4. **Backend**: the factory runs once; it only calls `claude --version`.
5. **set-premises** (857-866).
   - Runs when the premises are non-empty and differ from the target's declared `premises:`.
   - It is an M1 undoable action that writes the user's REAL file now, before the shadow exists.
   - Nothing in the run engine ever undoes it: not Discard, Cancel or failure. Only the user's Undo or History does.
6. **Shadow** (868-888):
   - `ws/` holds the model files as the board sees them (open buffers first) plus the project files;
   - git commit `base`, labelled "Your files at the start of the run";
   - `build/` is the Lean mirror;
   - `.telelean`, `.lake` and `.git` never enter `ws/` (shadow/types.ts:4-13).
7. **PersistedRun** (890-924):
   - `view` (round 1, `starting`);
   - `selection {subject, target, premises, adoptedGhosts: []}`;
   - `freezes[]`, `ghosts[]`, `gateAttempts[]`, `clocks`.
   - Activity: `Started "These suffice" for “<sentence>” with N premises.` (927).
8. **Base check** (930-949): one Lean job of the user's files, not counted.
   - Lean errors: the run fails with `your files have Lean errors (…); fix or save them, then start again`.
   - Environment problem: the run fails with `telelean could not run Lean on your files (…); nothing was sent to Claude`.
9. **Session** (951-959, openSession 627-652):
   - cwd = `ws/`;
   - static `SYSTEM_PROMPT`;
   - `--max-turns` = maxTurns;
   - the tool host;
   - a new session id.
10. **Round 1**: the first user turn is the context bundle (prompts.ts:192-241). Stage `formalise`, state `working`. Outcome label: `Claude is working on “<sentence>”`.

### 1.3 Turns, rounds and caps
- **Round**: one user-initiated stretch of Claude work, i.e. round 1, each Feedback, each adoption. Docs: core/src/run.ts:155, 285-286.
- **Turn loop**: `runRound` (1008-1022) loops `runTurn` (sends one user turn and collects events until `result`), then `endOfTurn` decides the next turn.
- **Caps, per round** (`DEFAULT_RUN_CAPS`, core/src/run.ts:169-175):

  | Cap | Default | What counts |
  |---|---|---|
  | maxTurns | 80 | model responses, deduplicated by message id (onSessionEvent 678-685) |
  | maxChecks | 25 | `check_lean`, `freeze_statements` and `propose_assumption` count 1 each, unless environment |
  | maxAgentMs | 20 min | agent-active time |
  | leanJobMs | 120 s | per Lean job |
  | maxGateAttempts | 3 | `finish` calls |

  - Usage totals accumulate over the whole run.
- **Cap hit** (580-603):
  - Notice `Claude reached this round's limit of 80 turns; telelean stopped it.` (or `… of 20 minutes of work; …`).
  - The session is interrupted once the current tool call returns (`toolCall` 605-613).
  - The round ends `cap-reached`.
- **Check budget** used up: tool error `check budget used up (25 of 25): call finish` (1890-1894).

### 1.4 Claude's tools and their state guards (manager.ts:1859-2258)
- **Common guard**: `assertCanAct` (1882-1888). Outside `working`:
  - `The run is complete; stop here.`
  - `another question is waiting for the person; wait for the answer`
- **check_lean** (1940-1969):
  - validates `files` (inside `ws/`, `.lean`, existing);
  - runs `engine.check`, rule purpose `check`;
  - returns `CheckResult` {ok, diagnostics, footprints, violations, stage, checksLeft, environment?};
  - never blocks: violations are reported.
- **freeze_statements** (1981-2016):
  - allowed only in stage `formalise`; otherwise `already frozen in this round; statements change only after the person's feedback`;
  - targets must be exactly the target, by id or statement name; otherwise `freeze_statements takes exactly the target: ["<id>"]`;
  - runs `engine.freeze`, which applies the readiness rules and then commits `freeze`, labelled `Statements frozen (round N)` (engine.ts:617);
  - pushes a FreezeRecord, sets stage `prove` and `view.frozen = {round, at, permitted}`;
  - activity `freeze_statements: statements frozen (round N)`;
  - reply: `Statements frozen (snapshot freeze-N). Now prove them unchanged.\nYour proofs may rest only on these axioms (anything else fails the gate): …` (toolSchemas.ts:248-256).
- **ask_user** (2018-2064):
  - 1-3 questions; unknown `affectedNodes` are dropped;
  - Claude's guesses stay in `p.pendingAsk` and never reach `view` (D-20);
  - state `waiting-for-answer`; the call blocks until `answer()`, which records decisions.json.
- **propose_assumption** (2092-2140):
  - needs stage `prove` and this round's freeze; otherwise `freeze first; the gap is judged against the frozen statements`;
  - `engine.checkGhost` applies the single-term rule, then a scratch file `(stmt) → target := proof` whose axioms must lie in the permitted set, with no sorry;
  - on success it records `ghost-<n>` (state `suggested`, `closesGap: true`, `aloneEntails`, lean name from `ghostName` 2066-2090);
  - reply: `telelean checked that it closes the gap and shows it to the person as a suggested premise (statement name X if adopted). They may adopt it after your turn ends; do not write it into the files.`
- **finish** (2185-2258):
  - stores `lastFinish` and sets state `gate`;
  - activity `finish(<status>): telelean runs the checks (attempt k of 3).`;
  - `runGate` (2142-2158) runs `engine.normalise`, which commits `normalise` with telelean's `lean:` pins and docstring mirror for statements new in the run;
  - then `engine.gate` with purpose `gate-proved` when the status is `proved`, otherwise `gate-other`. It runs G0, G1, G3, G5 and the readiness rules; G4 (lake comparator against this round's freeze) runs only when the status is `proved`, a freeze exists and nothing else failed.

### 1.5 The gate loop (A2)
- **Environment outcome** (sandbox, memory, mirror sync):
  - notice `telelean could not run the checks (…); it tries again in 30 seconds. This is not Claude's fault and not counted.`;
  - one retry;
  - environment again: round outcome `environment`, and the run **fails** (endOfTurn 1060-1063).
- **Pass**:
  - `commitGatePass` (2174-2183) makes sure `ws/` equals the judged commit, then commits `gate-pass`, labelled `Checks passed (round N, attempt k)`;
  - verdict from the status (`verdictOfStatus` 191-202: `not_proved` and `lean_errors` both mean `not-proved`);
  - reply `Gate passed. The run is complete; stop here.`
- **Fail, attempt < 3**:
  - a `GateAttemptView` is recorded;
  - notice `Attempt k didn't pass: <plain sentence>. Asking Claude to retry.`;
  - reply `Gate failed (attempt k of 3):\n- <check>: <exact message>\nFix these and call finish again.`
- **Fail at attempt 3**:
  - outcome `give_up`, verdict `gave-up`;
  - notice `Claude's attempts didn't pass the checks 3 times: … telelean reverted its working copy to “<label>”.`;
  - reply `… Stop now and call no more tools. The user has been told; the workspace copy will be reverted.`

### 1.6 End of a turn (endOfTurn 1041-1084)
- **The CLI died mid-turn.**
  - If a question is waiting, it stays, and answering resumes the session.
  - Otherwise the state becomes `interrupted` with the notice `Claude stopped unexpectedly (…). Resume continues the same session.`
- **Outcome accept**: `settleAccepted` (1087-1098).
  - If `ws/` changed after the gate-pass commit, `ws/` is reverted (`Discarded edits made after finish`) with the notice `Changes made after finish were discarded: the proposal shows exactly the files the checks passed.`
  - The proposal is then built from the passing gate's check.
- **give_up, cap, or no finish** (first time: `NUDGE_TURN` plus the activity `Claude ended its turn without calling finish; telelean asked it to finish.`; second time: no-finish):
  - `settleReverted` (1101-1129) reverts `ws/` to the newest commit of kind `gate-pass`, `freeze` or `base`;
  - that commit can be from **any round**: `lastCommit` has no round filter (shadow/workspace.ts:321-328);
  - notice `telelean reverted Claude's working copy to “<label>” (<reason>).`; a revert to `base` resets the stage to `formalise`;
  - normalise, re-check (not counted), then the proposal with `reverted`.
- **buildProposal** (1146-1208):
  - state `review`;
  - activity `Round N ended: <verdict>. The proposal is ready for review.`;
  - one AttemptRecord is appended.

### 1.7 What Claude may write, before and after the freeze (as enforced by core/src/gate/rules.ts)

**Before the freeze** (stage `formalise`):
- Claude may:
  - formalise the target and the selected premises that have no Lean, directly below their block;
  - write a `.holds` axiom only for selected ASSUMPTION cards;
  - add vocabulary of the allowed shapes (`vocabulary-shape` 601-614);
  - add definitions, which become questions for the user when they lie on a statement path;
  - add new modules of the subject.
- Proofs are refused (`proof-before-freeze` 710-750), including proofs carried inside definitions (`carrier`) and any `example`.

**After the freeze** (stage `prove`):
- Claude may add theorems and lemmas, including `theorem T.holds`, and non-axiom declarations that rest only on the permitted set.
- Every non-theorem declaration of the subject is frozen by kind, type and value (`snapshotOf`, core/src/gate/permitted.ts:125-145; `statement-changed` 466-497). G4 is authoritative for the target.
- No axiom at all may be added (`new-axiom` 'after-freeze').
- `example` is not allowed.
- No re-freeze is possible.

**In both stages:**
- G0 (`checkFileChanges`): only the subject's `.lean` files may change; project files may not change, files may not be deleted, forbidden tokens are refused.
- G5 markup (836-1033):
  - every field of every B block stays byte-identical: `natural_name`, `rationale`, `type`, `premises`, `stance`, `source`, `asserted`, `supersedes`, `refines`, `tags`, `origin`, `session`, `worded_by` (:60), plus version, extensions, body, `id:` and `lean:` lines;
  - no blocks may be added, removed or moved;
  - an unselected card may not become formalised ('formalised');
  - a card formalised in B keeps its statement ('binding').
- `existing-changed` (343-383): every declaration of B keeps its text and its elaborated type/value. The only exception is the target's `.holds`.
- `new-axiom` (267-341): only the person adds beliefs.
- `footprint` (499-587): everything added rests only on the permitted set.

### 1.8 Review actions (all serialised by `exclusive`, 437-449: `telelean is still handling your previous action (…).`)

**Accept** (1641-1750)
- Preconditions:
  - state `review` and the current `proposalId`; otherwise `That proposal was replaced; review the current one.`;
  - **every** definition id approved; otherwise `Answer every definition question: a “no” is feedback.`;
  - every lifecycle id known.
- `planAccept` applies a 3-way patch base→shown onto the real files, then the ticked lifecycle items.
- If the user's files drifted during the run:
  - commit `accept-base` (the user's files) and `rebase`;
  - normalise, re-freeze (status proved) and re-gate with B = the accept-base commit;
  - on failure, restore `ws/` and refuse: `Accept was refused: Claude's changes, applied to your current files, did not pass the checks (…). Discard, or undo your edits since the run started and Accept again.`
- `proposals.apply` calls `workspace.applyChanges` (history kind `accept-proposal`, one Undo step).
- Notice: `Accepted: <label>. Undo reverts it.` or `Recorded: <label> (no file changed).`
- End: `endRun('accepted')`.

**Feedback** (1486-1506)
- Only in `review`; otherwise `Feedback is possible once Claude has finished its round.`
- Must not be blank; otherwise `Write what Claude should change.`
- Steps:
  - the attempt is resolved `superseded`;
  - `roundStartCommit` = the shadow's head;
  - `startNewRound('formalise')` (1509-1522): round+1, counters and clock reset, the proposal is withdrawn, verdict and error cleared, **`view.frozen` cleared**;
  - notice `Round N: your feedback was sent to Claude.`;
  - the session continues (resumed by id if closed) with `feedbackTurn`.

**Adopt a ghost** (1526-1613)
- Only in `review`, for a `suggested` ghost.
- Core `planGhostAdoption` writes:
  - a block with `worded_by: agent`, `origin: agent`, `session: <runId>`, `asserted: today`, and the user's rationale if given;
  - the abbrev and `axiom .holds`, before the target's block;
  - the ghost's id, appended to the target's `premises:`.
- Then commit `adopt` (A), then `engine.freeze` with `adoptedGhosts + id`.
- If the freeze fails:
  - revert with `Adoption undone: the statements could not be frozen with it`;
  - notice `“…” could not be adopted: <why>.`;
  - the run stays in review.
- If it succeeds:
  - the attempt is resolved `superseded`;
  - `startNewRound('prove')`; the freeze is pushed; the ghost is marked `adopted`;
  - notice `You adopted “…” as an assumption; Claude now proves the goal with it (round N).`;
  - `adoptionTurn` is sent.

**Reject a ghost** (1615-1628)
- The runner allows it in any non-terminal state; the webview enables "No" only in review (GhostSuggestion.tsx:19).
- `state = 'rejected'`; activity `You declined ghost-n: “…”.`
- **Claude is not told, and no round starts.**

**Discard** (1455-1473)
- Only in `review` or `interrupted` ("Stop"); otherwise `Only a finished round (or an interrupted run) can be discarded; Cancel stops a working run.`
- The attempt is resolved `discarded`, then `endRun('discarded')`.
- Labels: `Proposal discarded` / `Run stopped`.

**Cancel** (1402-1428)
- Any non-terminal state.
- Interrupt, cancel the run's Lean jobs, record the attempt.
- Notice `You cancelled the run. Its working copy and transcript are kept until old runs are pruned.`

**Resume** (1430-1453)
- Only for `interrupted`; notice `Claude resumed the run.`
- Sends any undelivered answers, otherwise `resumeTurn`.

**Dismiss** (1475-1482): terminal runs only.

### 1.9 How a run ends
- `endRun` (1263-1287):
  - `ended = true`;
  - the clock stops and Lean jobs are aborted;
  - a pending ask is rejected;
  - questions, proposal and `canResume` are cleared;
  - the session is closed and run.json persisted;
  - old run directories are pruned (`keepRuns` 10; non-terminal runs are never pruned).
- `recover()` (1761-1815):
  - older non-terminal runs are marked `failed` with `superseded by a newer run`;
  - `working`, `gate` and `starting` become `interrupted`, or `failed` with `the editor reloaded before Claude had started`;
  - `waiting-for-answer` and `review` come back as they were.
- `dispose()` (1822-1855) persists `interrupted` with `The editor closed while Claude was working.`

### 1.10 What is kept, and what is protected, across rounds
**Kept:**
- the same Claude session, so Claude remembers the conversation;
- `ws/` as the previous round left it (after the reset or revert at the end of that turn);
- the shadow's git history;
- the selection: target and premises are fixed for the whole run, and only adoption appends to `adoptedGhosts`;
- every ghost, in any state. An old `suggested` ghost stays adoptable;
- answers, notices, activity, usage;
- the `freezes[]` history. The previous round's freeze is **not** in force any more: `currentFreeze` needs `last.round === view.round` (730-734);
- `lastFinish`, which is never cleared.

**Protected mechanically:** only B (the user's files at run start; engine.ts:404-405) and A (the adopted-ghost text at the newest `adopt` commit; rules.ts:384-407, 1003-1031).

**Not protected:** anything Claude wrote in an earlier round (its statements, vocabulary, definitions, lemmas and proofs). In a Feedback round Claude may rewrite all of it.

---

## 2. What a proposal is

`ProposalView` (core/src/run.ts:452-471) is built by `ProposalServiceImpl.build` (runner/src/proposal/service.ts:144-208). Its inputs:
- the shown state: `ws/` now (exactly the gate-pass files, or the reverted and normalised state);
- the check of exactly that state, including the Lean facts;
- the run's ghosts, this round's gate attempts, the flagged definitions, usage and `lastFinish`.

| Part | Type (core/src/run.ts) | How it is computed |
|---|---|---|
| runId, proposalId `p<n>`, round, subject | :452-458 | `proposalId` is new at every rebuild, and Accept names it (manager.ts:1176-1177) |
| graph | `TlGraph` | `buildProjectModel` over `ws/` files plus facts, then `subjectGraph`. The layout is the current board's columns, and the attempts are copied (service.ts:155-164) |
| diff | `GraphDiff` :343-349 | `diffGraphs(live board now, proposed)`: nodes added, changed (fields `sentence`, `type`, `statement`, `proof`, `premises`, `status`, `binding`, `fields`) or removed; vocabulary added, changed or removed; edges; counts (core/src/proposal/diff.ts:56-104) |
| files | `ProposalFile[]` :326-331 | base → shown, with +/− line counts |
| review: StatementReview | :352-367 | One per node of the proposed graph whose statement abbrev is new or changed against B (service.ts:211-239). Fields: sentence, `wordedBy` (from provenance; `agent` for adopted ghosts), `leanName`, `pretty` (`#print`), `explicit` (pp options, runner gate/scratch.ts:112), closure from `lean.uses` (vocabulary kind, type and gloss, or a card's sentence), `change` new or changed. Under the current rules B statements cannot change, so in practice these are **formalisations** |
| review: VocabularyReview | :370-373 | ONE item listing the new pure-signature vocabulary (sort, predicate, function, constant; service.ts:59, 256-263) not declared in B. Auto-approved; "revocable" only through Feedback |
| definitions | `DefinitionQuestion[]` :381-393 | `d1…` from the gate's `flaggedDefinitions` (rules.ts:807-834). Covers new `definition` vocabulary on a statement path (in a chosen card's `uses`, `usedBy`, a `definitional-choice` flag, or referenced by signature vocabulary) and **every** new presupposition `axiom T.exists : Nonempty T`. Accept needs a yes for each |
| lifecycle | `LifecycleItem[]` :396-407 | At most `l1`: GOAL→DERIVATION, `recommended: true`, reason `Lean proved it from the selected premises`. Only when the verdict is `proved` and the proposed target is a proved GOAL (service.ts:184-188). Applied only if ticked (planAccept 358-375) |
| ghosts | `GhostView[]` :235-254 | Every ghost of the run, from any round and in any state |
| report | `ReportCard` :421-449 | verdict; target; footprint (when proved: card ids, `presup:<name>`, `axiom:<name>`); unusedPremises; consistency `unchecked`; selfEvident; Claude's summary, gap, conflict and assumedWithoutAsking (from `lastFinish`); this round's gateAttempts; usage; durations; `reverted` (service.ts:265-291) |
| baseChanged, empty | :467-470 | drift is non-empty; no file changed |

**Presuppositions** appear in three places:
- `DefinitionQuestion` kind `presupposition`, which needs a yes;
- `RunView.frozen.permitted.presuppositions`;
- footprint ids `presup:<name>`.

**Sidecars:**
- One `AttemptRecord` per round end (manager.ts:1212-1242), plus `AttemptResolution` lines `accepted`, `discarded` or `superseded` (core/src/run.ts:481-516), in `.telelean/subjects/<S>/attempts.jsonl`.
- `decisions.json` holds the answered questions, with scope `run`, `nodes` or `subject`. Decisions in force are injected into later runs as `EARLIER ANSWERS IN FORCE`.

**Choices the user makes per item today:**
- definition yes/no: all must be yes, and a no opens Feedback prefilled with `I don't endorse the definition \`X\` (“gloss”): `;
- lifecycle ticks;
- ghosts: "I hold this" or "No".

**Choices that are only prefilled Feedback:**
- the vocabulary `Revoke…` button: `Please don't add the vocabulary item \`X\` (“gloss”): `;
- `Ask me instead` on an assumption made without asking: `You assumed this without asking: “…”. Please ask me about it instead of assuming it.`

Statements have no accept or decline at all. The step only asks `Does the Lean say what the sentence says?`

---

## 3. Everything Claude is told

### 3.1 System prompt
Static and byte-identical across runs, for the prompt cache (systemPrompt.ts:13-44).
- **Task**: `Your task in this run: decide whether the TARGET card follows from exactly the SELECTED premises, by formalising faithfully and proving in Lean.`
- **Context**: `Your working directory is a private copy of their Lean project. Nothing you write reaches their files unless they accept it after reviewing it.`
- **Workflow**: 1 read; 2 ask with ask_user before formalising when a reading changes the result; 3 formalise the target and the selected ASSUMPTIONs directly below their block; 4 check, then `freeze_statements` with the target's id; 5 prove `T.holds`; 6 finish, or `not_proved` plus `propose_assumption`; 7 stop after finish.
- **Rules** (verbatim, lines 34-41):
  - `Their words are the specification. Never change any field of a block (including \`lean:\` lines), never add or delete blocks, never change a declaration that existed before the run (except the target's \`.holds\`), and formalise no card other than the target and the selected premises.`
  - `Vocabulary may only be: sorts …; propositions \`axiom P : Prop\`; predicates …; constants \`noncomputable opaque c : T\`, where T needs \`axiom T.exists : Nonempty T\` …; functions …. The person confirms each new \`T.exists\`. Any other \`def\`, \`structure\`, \`inductive\` or \`instance\` is shown to the person as a question: avoid them, and never encode a belief in a definition.`
  - `Besides vocabulary, the only axioms you may add are the \`.holds\` of selected ASSUMPTION cards you formalise. A missing premise is proposed with propose_assumption, never written into the files. Everything you add may rest only on the selected premises …`
  - the forbidden-text and forbidden-files list;
  - `After freeze_statements, do not change the frozen statements or the vocabulary. Proofs are rejected before the freeze.`
  - `Lean 4 core only, no Mathlib … autoImplicit is off. Stay in the subject's namespace.`
  - `In finish, list every interpretive choice you made without asking in assumed_without_asking ([] if none).`
  - `Be brief …`

### 3.2 The first turn: the context bundle (prompts.ts:192-241)
- `Run: "These suffice" for the subject S (namespace S; the subject's folder is …/, its root module …).`
- `TARGET`: id, type, sentence, and its Lean, or `No Lean yet (its block is in <file>, line n)`, plus its status.
- `SELECTED PREMISES (prove the target from exactly these)`: stance, asserted, rationale, source, Lean, and status. The status is one of: assumed (axiom …), proved, promotion pending, `assumed, but its axiom … is missing (add it)`, or `not usable as a premise: no proof yet`. With no premises: `(none: the person asks whether the target is self-evident: …)`.
- `Allowed besides these: Lean's standard axioms, the vocabulary, and the existence presuppositions … freeze_statements tells you the exact list.`
- `OTHER CARDS OF THIS SUBJECT (context only; never use them as premises)`, for the whole subject or its neighbourhood (`telelean.run.contextScope`).
- `VOCABULARY`
- `EARLIER ANSWERS IN FORCE`
- `BUDGET: 25 Lean checks, 80 turns and 20 minutes of work for this run; …`

### 3.3 Later turns (prompts.ts:246-281; toolSchemas.ts:180-186)
- **Feedback**: `Feedback from the person on your previous result:\n"<text>"\nThis starts a new round. Your earlier changes are still in the files. If statements need to change, revise them, then call check_lean and freeze_statements again before proving: finish with status proved needs a freeze in this round. Budget for this round: …`
- **Adoption**: `The person adopted your suggestion as an assumption:\n- <id> (ASSUMPTION, worded by you): "<sentence>"\n  Lean: <name> := <stmt>; axiom <name>.holds (telelean wrote it right before the target's block).\nThe statements are frozen again with it selected, so you may use <name>.holds. Prove the target now and call finish. …`
- **Resume**: `The session was interrupted (the person's editor reloaded) … the statements are <frozen | not frozen yet>. Continue the run from where you were.`
- **Nudge**: `You ended your turn without calling finish. Call finish now: …`
- **Answers after a reload**: `renderAnswersAsUserTurn`.

### 3.4 Tool descriptions and results
- Tool descriptions: toolSchemas.ts:105-127. For example, the finish description says `Programmatic checks then run (only selected premises used, no sorry, statements unchanged, their words untouched).`
- Result renderings: toolSchemas.ts:188-265.
- Gate failures go back to Claude as exact finding messages (`- <check>: <message>`).

### 3.5 Mechanical versus prompt-only

| Instruction | Enforced mechanically? | Where |
|---|---|---|
| Never change any block field or `lean:` line | YES (detective) | G5, rules.ts:912-972 |
| Never add, delete or move blocks | YES | G5, rules.ts:899-907, 1003-1031 |
| Never change a pre-run declaration, in text or meaning | YES | `existing-changed`, rules.ts:343-383 |
| Formalise only the target and the selected premises | YES, for bindings: a declaration directly below, or a pin | G5 'formalised' / 'binding', rules.ts:973-1000 |
| Only the selected ASSUMPTION `.holds` as new axioms; no beliefs | YES | `new-axiom`, rules.ts:267-341 |
| Missing premise only through propose_assumption | YES (new-axiom plus G5 'block') | as above |
| Everything rests only on the selected premises | YES | footprint rules.ts:499-587; G4 comparator; permitted set (permitted.ts) |
| Vocabulary shapes | YES | `vocabulary-shape` 601-614 |
| The person confirms each new `T.exists`; defs are questions | YES, as user gates: Accept needs every yes | `flagged` 807-834; manager.ts:1651 |
| "Never encode a belief in a definition" | PARTLY: defs that carry proofs fail the footprint/carrier rules; a def that bakes a belief into its *meaning* is caught only by the user's yes, and only when it lies on a statement path | rules.ts:499-587, 710-750, 807-834 |
| Forbidden tokens and files; project files; imports | YES | G0 (core/src/gate/g0.ts:137-222) |
| No proofs before the freeze; frozen statements unchanged; finish(proved) needs a freeze | YES | rules.ts:710-750, 466-497, 782-790; G4 |
| Remove the proof when not proved | YES | `status-mismatch` 446-464 |
| The ghost is one proposition using existing vocabulary | YES | `ghostTextProblems` plus the scratch check (engine.ts:722-…) |
| Edits after finish are discarded | YES | settleAccepted 1087-1098; assertCanAct |
| Ask before formalising; do not ask needlessly | NO (prompt only) | systemPrompt.ts:22 |
| Formalise *faithfully* | NO: only the user's statement review | Review step |
| assumed_without_asking, summary and gap are honest | NO: the field is required, its content unverified | schema toolSchemas.ts:70-73 |
| insufficient / inconsistent claims | NO: unverified in M2 | core/src/run.ts:141-143 |
| "Stay in the subject's namespace" | NO rule found in core/src/gate (grep) | — |
| Ghost is "plausibly held" | NO: only "closes the gap" is checked | — |
| Feedback text, instructions | NO: free text in a user turn | prompts.ts:246 |

**Confinement** (claudeCli.ts:75-77, 106-109; confinement.ts):
- Claude has `Read`, `Glob`, `Grep`, `Edit` and `Write`, confined to `ws/` by a PreToolUse path guard and the CLI's own fences.
- `Bash`, `WebFetch`, `WebSearch`, `Agent`, `AskUserQuestion` and `NotebookEdit` are disallowed.
- Hidden segments (`.lake`, `.telelean`, `.git`) and dot-entries are denied.
- **No per-file, per-card or per-span write restriction exists.** The guard decides on tool names and paths only.

---

## 4. Existing pieces that resemble the spec's concepts

- **Per-item accept/decline.**
  - Definition questions: yes/no per item, but all must be yes.
  - Lifecycle ticks.
  - Ghosts: adopt (starts a new round) or "No" (marks it; Claude is not told).
  - Vocabulary "Revoke…" and "Ask me instead" only prefill Feedback.
  - Statements have no per-item status.
  - The closest **designed but unbuilt** concepts are the D-19 sign-offs (`signoffs.json`, M3) and D-21's "frozen set" (see §8).
- **"Do not create X again" memory.** None.
  - A rejected ghost is not reported to Claude.
  - Claude can re-propose it: it gets a new `ghost-<n>` id, and `ghostName` suffixes `_2`.
  - The only memories are the session's conversation and decisions.json (answers in force, injected into later runs).
- **Regenerating a subset.** None. Feedback lets Claude change anything that is not in B or A.
- **Protecting user-chosen content.** Only uniformly: all of B, always (G5, `existing-changed`). There is no subset the user chooses, and nothing Claude produced can be locked.
- **A second "These suffice" within one run.** None.
  - The selection is fixed per run; adoption only appends ghosts.
  - The tray is disabled during a run ("Claude's proposal … is waiting for your review: accept, give feedback or discard it first.", webview/src/model/run.ts:46-58).
  - `StartRunMessage` takes ONE target.
- **Multi-round sessions.** Yes: rounds through Feedback and adoption, in the same CLI session (resumable by id), with caps per round, one proposal per round, and attempts resolved `superseded`.

---

## 5. What would need to change

### 5.1 A multi-stage edit session with per-item statuses
- **core/src/run.ts and protocol.ts**:
  - a session view: kind (`these-suffice` or `transform`), a stage index (≈ today's `round`), and items with stable ids and `in-review | accepted | declined` plus a decline option;
  - Add, Change, Delete and Formalize card items, and one vocabulary item;
  - new messages: set statuses (one or many), submit review, exit, transform, freeze/unfreeze.
- **Stable item ids across stages are a prerequisite.** Today `d<n>`, `l<n>` and `p<n>` are per proposal, `ghost-<n>` per run, and StatementReview is keyed by nodeId. A card without a written `id:` takes the id derived from its sentence (core/src/markup/parser.ts:352), so a card Claude creates or rewords would change id. telelean must write explicit ids.
- **manager.ts**:
  - `review` must stop meaning "Accept or Feedback, then end";
  - "Submit review" becomes a structured Feedback: `startNewRound` plus a turn generated from the statuses;
  - accepted items join a session frozen set that the gate holds Claude to;
  - when every item is accepted, the existing all-or-nothing Accept path applies the whole state (drift rebase, re-gate, history snapshot). This keeps D-21 atomicity and "only judged states are applied";
  - Exit must also undo the start's `set-premises`, or move that declaration into the final apply.
- **Proposal service**: derive the items from GraphDiff and the block diff. Keep definitions and presuppositions as separate items that each need an explicit yes; do not fold them into "one vocabulary item". Map lifecycle G→D to a Change item. Keep the report hidden until the statements have been judged (D-19).

### 5.2 Claude MECHANICALLY forbidden from editing frozen cards or fields
- **The authoritative layer has to be detective**: a new `RuleInput.frozen` with reference texts and facts per card and per field.
  - Block fields map to G5's raw lines.
  - A "Lean definition" maps to the statement declaration's text and docstring, plus its `.holds`, plus the elaborated type/value (meaning), and **its closure**.
  - Check it in every purpose, so `check_lean` reports violations early, freeze and finish refuse, and the retry and revert loop applies.
- **Optionally, a preventive layer**: a PreToolUse simulation of Edit/Write in `bin/telelean-path-guard.mjs`. This is harder and still needs the gate.
- **Where the frozen set lives**:
  - The source of truth must stay outside `ws/` and outside Claude's reach: runner memory, run.json, and a `.telelean` sidecar for the global status.
  - Claude cannot read `.telelean`, and `.telelean` is never copied into `ws/`.
- **"Ask to unfreeze"** needs a new MCP tool (like `ask_user`) that only *requests* an unfreeze. The user unfreezes through a board action.
- **Snapshot per round**: the gate should use the frozen set as of the start of the round, or a user freeze/unfreeze should interrupt the round. Otherwise Claude is charged for a change made mid-turn.
- **Normalisation**: `engine.normalise` (telelean, not Claude) writes `lean:` pins and docstrings. Decide whether that may touch a frozen card.
- **Two cautions:**
  - Today *every* user card is effectively frozen against Claude. The spec's FROZEN therefore mainly **relaxes** protection for unfrozen user content, and must make every such change a review item.
  - Accepting X while X's closure (the vocabulary, definitions or other statements it mentions) stays unfrozen lets X's *meaning* change with its text unchanged. The D-19 freeze guards against this today with `statement-changed` over all subject declarations and the G4 comparator. Per-item freezing needs the same guard.

### 5.3 Blacklists
- Store them in session state (PersistedRun) and list them in the next round's turn.
- Mechanical checks are possible only for exact identity, e.g. (type, collapsed `natural_name`) or collapsed Lean statement:
  - a G5-like finding on a new block;
  - a check in `toolProposeAssumption` (manager.ts:2092).
- Rephrasings can't be caught except by a Lean equivalence check run by telelean in its scratch file.

### 5.4 "Shaky" regeneration: "not the exact same configuration"
- Needs a canonical form of the shaky set, e.g. a multiset of (type, collapsed sentence, collapsed statement), and a rule for which cards count as replacements.
- A round-end check would raise a finding, and Claude retries.
- Weaknesses:
  - it is trivially satisfied by cosmetic edits;
  - it can force a worse result when the old configuration was right, so it needs an escape;
  - accepted cards may depend on the shaky ones.

### 5.5 A run started from a TRANSFORM
- `RunStartRequest`, the preflight selection rule, `set-premises`, `freeze_statements` (exactly the target), `propose_assumption` (needs the target's freeze), the finish statuses, readiness, G4, the verdicts, the lifecycle item, the context bundle and the static system prompt's task sentence **all assume a target**.
- A transform needs:
  - a new run kind;
  - a finish like `done` / `cannot`;
  - a gate purpose without readiness or G4;
  - the transform's user-filled values written into the shadow by telelean before Claude starts (like adoption: commit kind plus a reference model that G5 holds them to);
  - placeholders for fuzzy fields. `type` and `natural_name` are required fields (TL003, parser.ts:358-361), so a fuzzy sentence needs a representation;
  - trashed cards deleted through D-18 with dependents;
  - G5 'block' made conditional on "may add cards", where a Claude-created ASSUMPTION's `.holds` is never permitted in a proof until the user accepts **and selects** it;
  - the prose instructions in the first turn (prompt-only).
- The task sentence must move out of the static system prompt, or a second static prompt is needed (prompt cache).

### 5.6 "These suffice" during a session (REVIEW STAGE 5)
- Needs a selection per round (today: per run), possibly several targets (today: one; `freezeChallenge` takes an array, but rules and manager are single-target), and a new freeze in that round.
- What happens to the open stage's items? The current proposal is withdrawn by `startNewRound`.

---

## 6. Naming collisions to resolve in the spec

- **FROZEN** (the spec's user-controlled per-card/per-field status) versus the existing D-19 statement freeze:
  - `freeze_statements`, `RunView.frozen`, `FreezeRecord`, stage `prove`;
  - user-visible texts: `freeze_statements: statements frozen (round N)`, `telelean reverted Claude's working copy to “Statements frozen (round 1)” (…)`, and G4's tooltip `Lean compares the proved statement with the one frozen before the proof` (webview/src/model/run.ts:366);
  - D-21's "frozen set" (M3).
- **Edit session** versus:
  - the Claude CLI session (`sessionId`, `--resume`, "Resume continues the same session");
  - the block field `session:` (the run id on adopted ghosts);
  - core/src/edit/session.ts, an internal file-editing helper.
- **Review stage** versus round / state `review` / the Review stepper.
- **Accept**: the spec's per-item status versus today's terminal, undoable apply.
- **Decline** versus the ghost's "No" (`rejectGhost`) and the definition's "No…".
- **"its definition is FROZEN"** (REVIEW STAGE 3) versus Lean definitions / DefinitionQuestion / the Vocabulary "Definitions" section.

## 7. Things noticed in the code (from reading; not executed)

1. **`lastFinish` is never cleared per round** (manager.ts:2191; startNewRound 1509-1522). A no-finish or cap round's report card (Claude's summary, gap, assumed-without-asking) and its attempts.jsonl summary show the **previous round's** finish arguments.
2. **Ghosts suggested in an earlier round stay `suggested` and adoptable after Feedback changed the statements.** Their `closesGap` and `aloneEntails` flags were computed against the old freeze. Soundness is unaffected: adoption re-freezes and the gate judges the new proof.
3. **`feedbackTurn` says "Your earlier changes are still in the files."** even after a give-up, cap or no-finish revert.
4. **A failing Feedback round may revert to an earlier round's passing commit**, because there is no round filter.
5. **StatementReview `changed` is practically unreachable**, because B statements are immutable.
6. **Discard, Cancel and failure leave the start's `set-premises` declaration in the user's file.** It can be undone through Undo or History.
7. **The context bundle says "for this run"** although the caps apply per round.
8. **The runner accepts `rejectGhost` in any non-terminal state**; the UI allows it only in review.

## 8. Docs versus code
- m2-plan §2, §4 and §7 match the code on every transition and text checked: start order, base check, the tool guards' wording, the gate loop, the settle paths, Feedback, adoption, Accept with drift, and recovery.
- Built in the docs but not in the code:
  - D-19's sign-offs ("binds to your wording, the statement, its closure and the decisions in force; it goes stale when any of these changes");
  - D-21's "Hand edits are authoritative … drops it from any frozen set, with a 'Re-sign' action";
  - D-19 option (c), "pause at the freeze when something risky appears".
  - These are M3 or later (m2-plan.md:113). They are the nearest designed relatives of the spec's accepted/frozen items.
- Design constraints the spec touches:
  - D-21: "Accept is all-or-nothing (node-level partial accept comes later)";
  - IC-26: "Diffs … applied atomically, and be reversible".

## spec_interactions

- **EDIT SESSIONS 1** — current: There is no transform entry point. A run always starts from startRun(target, premises) (core/src/protocol.ts StartRunMessage), after egress consent and preflight. RunStartRequest needs ONE target, and preflight refuses an ASSUMPTION target (preflight.ts:45-58).
  - files: runner/src/run/types.ts:127-139; preflight.ts:45-58; manager.ts:835-974; prompts.ts:192-241; systemPrompt.ts:18; llm/toolSchemas.ts:45-75
  - conflict/gap: A session started by 'transform cards' has no target. The context bundle, the static system prompt task ('decide whether the TARGET card follows…'), freeze_statements (exactly the target), propose_assumption, the finish statuses, readiness, G4, the verdicts and the lifecycle G→D item are all target-centric, so a new run kind is needed. Also ambiguous: is INITIATING 2's 'initiate edit session' the same as the 'transform cards' button?
  - safety: Egress consent, preflight and the base check must still come before any prompt. The user-filled transform values must be written by telelean, not Claude, and held byte-identical.
- **EDIT SESSIONS 2** — current: For 'These suffice', Claude only formalises the code-less target and the selected cards (directly below their blocks), adds vocabulary or definitions, and proves. It may never add, delete or change cards or the user's declarations (G5, existing-changed).
  - files: core/src/gate/rules.ts:343-383, 836-1033; runner/src/gate/engine.ts:393-469
  - conflict/gap: A transform requires Claude to create, fill and change cards, which the current G5 and existing-changed rules forbid outright. These rules must change from 'everything in B is immutable' to 'everything frozen is immutable, and every other change is a review item'.
  - safety: High. 'Their words are the specification' is today the global guarantee; relaxing it needs provenance (worded_by: agent, D-15) and an explicit accept for every change.
- **EDIT SESSIONS 3 / REVIEW STAGE 1-2** — current: A round ends in state 'review' with one ProposalView: StatementReview per new statement (in practice formalisations, which map to 'Formalize'), ONE VocabularyReview (pure-signature only), DefinitionQuestions, at most one lifecycle item (G→D), ghosts and the report card. The stepper labels are 'Statement N', 'New vocabulary', 'Definitions', 'Result', 'Card changes'.
  - files: core/src/run.ts:352-471; runner/src/proposal/service.ts:144-291; webview/src/model/run.ts:470-500
  - conflict/gap: 'Add' and 'Delete' items cannot arise today, and 'Change' items are practically unreachable (B statements are immutable). The spec's list does not say where these go: definition and presupposition questions (each needs its own yes), the report card (D-19 hides the result until the statements are judged) and lifecycle G→D. 'One item for all the vocabulary' must not absorb definitions or presuppositions.
  - safety: 'A definition can quietly carry a belief, so Accept needs your yes for each' (Review.tsx:162) must survive. So must 'meaning before proof status'.
- **REVIEW STAGE 3-4 (accept = FROZEN for the session)** — current: Accept is all-or-nothing and terminal (D-21; manager.ts:1641-1750). Per-item decisions exist only for definitions (all must be yes), lifecycle ticks and ghosts (adopt or reject). Statements have no accept/decline.
  - files: manager.ts:1641-1750; core/src/gate/permitted.ts:125-145; rules.ts:466-497
  - conflict/gap: Per-item statuses need stable item ids across stages; Claude-created cards get ids derived from their sentence (parser.ts:352). Applying all-accepted states only (REVIEW 6) keeps D-21 atomicity. But accepting X while its closure is unaccepted lets X's meaning change under unchanged text, so an accepted item must freeze its closure or reopen when the closure changes.
  - safety: High (meaning drift of accepted statements; the D-19 freeze and G4 guard this today only within a round).
- **REVIEW STAGE 5 (These suffice during an active session)** — current: Refused while any run is active: 'Claude's proposal for "<S>" is waiting for your review: Accept, Feedback or Discard it first.' (extension/src/logic/runs.ts:169-181). The tray buttons are disabled. The selection (target and premises) is fixed per run; only ghost adoption appends adoptedGhosts. One target only.
  - files: manager.ts:1509-1522, 1981-2016, 2018-2064; core/src/protocol.ts StartRunMessage
  - conflict/gap: Needs a selection per round, possibly several targets ('some goals'), a new D-19 freeze in that round, and withdrawal or retention of the open stage's items (startNewRound withdraws the proposal). 'May ask the user to unfreeze' needs a new request tool (ask_user only asks about meaning). The frozen set must be snapshotted per round, because the user can freeze or unfreeze at any time (FROZEN 4-5) while Claude works.
  - safety: The permitted set must come from the user's explicit selection only, never from 'accepted' cards implicitly.
- **REVIEW STAGE 6 (submit review / exit cancels all)** — current: Feedback (free text) starts round+1 in the same session with caps reset, stage formalise, the previous freeze no longer in force, and the attempt resolved superseded. Nothing Claude wrote earlier is protected; only B and A are. Discard ends the run, but the start's set-premises declaration stays in the user's real file (manager.ts:857-866).
  - files: manager.ts:1455-1522; prompts.ts:246-253
  - conflict/gap: 'Submit review' becomes a structured Feedback whose turn is generated from the item statuses, with accepted items as a gate input. 'Exit cancels all changes' conflicts with set-premises being written to the real file at start: undo it on exit, or apply it only with the final Accept.
  - safety: Medium (an unexpected change left in the user's files after exiting).
- **REVIEW STAGE 7 / FROZEN 3 (restore frozen statuses at session end)** — current: No per-card frozen status exists. Run state lives in run.json; recover() marks older non-terminal runs failed and reloads the newest; dispose() persists 'interrupted'.
  - files: manager.ts:1263-1293, 1761-1855; run/persist.ts
  - conflict/gap: The pre-session statuses must be stored durably outside ws/ and restored on every terminal path (accepted, discarded, cancelled, failed, 'superseded by a newer run' in recover()).
  - safety: The storage must be unreachable for Claude: .telelean is a denied hidden segment and is never copied into ws/.
- **DECLINE OPTIONS 1 (blacklist)** — current: No mechanism. A rejected ghost is only marked 'rejected' (manager.ts:1615-1628); Claude is not told and can re-propose it, getting a new id and an '_2' name (ghostName 2066-2090).
  - files: manager.ts:2066-2140; core/src/gate/rules.ts:1003-1018
  - conflict/gap: Needs an identity criterion (exact type plus collapsed sentence, or collapsed Lean statement); rephrasings are not detectable mechanically. Enforce with a gate finding on new blocks plus a check in propose_assumption, and list the entries in the next turn.
  - safety: Low for soundness; it is a usability rule.
- **DECLINE OPTIONS 2 (adjust = TRANSFORM)** — current: No such channel. Only free-text Feedback, or prefilled Feedback ('Revoke…', 'No…', 'Ask me instead').
  - files: manager.ts:1526-1613 (adoption pattern); core/src/gate/adoption.ts
  - conflict/gap: A transform during a session means telelean writes the user's adjusted card into the shadow (like ghost adoption: commit plus a reference model), then a new round.
  - safety: User-typed values must be held byte-identical against Claude.
- **DECLINE OPTIONS 3 (shaky; not the exact same configuration)** — current: Nothing compares configurations across rounds. After Feedback, Claude may reproduce or alter anything not in B or A.
  - files: manager.ts:1486-1522
  - conflict/gap: Needs a canonical form of the configuration and a rule for which new cards replace the shaky set. Exact-equality checks are trivially evaded and may force a worse result, so an escape is needed. 'Claude can do what it wishes' (including delete or split) conflicts with accepted cards that depend on shaky ones.
  - safety: Medium: deleting or changing a shaky card can break or re-mean accepted cards.
- **TRANSFORM 4 (fuzzy fields autofilled by Claude)** — current: Claude may never set or change any block field (G5 COMPARED_FIELDS rules.ts:60). type and natural_name are required (TL003, parser.ts:358-361). Without an id: line the id is derived from natural_name.
  - files: core/src/markup/parser.ts:350-361; core/src/gate/rules.ts:836-1000
  - conflict/gap: Needs a placeholder representation for fuzzy required fields, with telelean writing explicit ids. G5 must allow Claude to fill exactly the fuzzy fields of transform cards. A Claude-filled sentence must carry worded_by: agent (D-15) and be its own review item.
  - safety: High: a Claude-worded sentence must never look like the user's words.
- **TRANSFORM 5 (user-filled field = FROZEN)** — current: All of the user's existing words and declarations (B) are already immutable to Claude. User Lean must build (base check) and is not G0-scanned (it is the user's own text).
  - files: runner/src/gate/engine.ts:438-440; core/src/gate/rules.ts:384-407, 1003-1031
  - conflict/gap: For NEW transform cards, the user-filled fields must be written by telelean before Claude starts and protected like the 'adopted' model A (rules.ts:384-407).
  - safety: The analogue of telelean-written ghost text: it must equal what telelean wrote.
- **TRANSFORM 6 (may add cards checkbox)** — current: G5 'block' forbids any new block except telelean's adopted ghosts (rules.ts:1003-1018). Missing premises go only through propose_assumption and adoption, which re-freezes with the new card selected.
  - files: core/src/gate/rules.ts:267-341, 1003-1018; core/src/gate/permitted.ts
  - conflict/gap: Make the 'block' rule conditional, and make each new block an 'Add' item.
  - safety: High: a Claude-created ASSUMPTION carries `axiom X.holds` (a belief). Its .holds must never be permitted in a proof until the user accepts the card AND selects it as a premise ('only the person adds beliefs').
- **TRANSFORM 7 (prose instructions)** — current: Free text reaches Claude only as Feedback ('Feedback from the person on your previous result: "…"'). Prompt-only.
  - files: prompts.ts:246-253
  - conflict/gap: Put the instructions in the transform's first turn. The gate must ignore them: instructions can never authorise touching frozen content.
  - safety: Low, provided enforcement stays in the gate.
- **TRANSFORM 8 (submit transform)** — current: The analogue is starting a new round (Feedback or adoption): round+1, caps reset, attempt resolved 'superseded', proposal withdrawn.
  - files: manager.ts:1509-1522, 1244-1259
  - conflict/gap: The current review stage's items and statuses must be carried over into the new stage, not withdrawn.
  - safety: Low
- **FROZEN 2 (Claude can never edit a frozen card; mechanical)** — current: Claude's Edit and Write can write any file under ws/ (claudeCli.ts:75; the path guard checks paths, not contents). Protection is detective only: findings at check_lean, freeze and finish, 3 attempts, then a revert to the last passing commit. ALL of the user's pre-run content is protected regardless of any status, and nothing Claude wrote in an earlier round is protected.
  - files: runner/src/llm/claudeCli.ts:75-109; runner/src/llm/confinement.ts:86-113; core/src/gate/rules.ts; runner/src/gate/engine.ts:622-642
  - conflict/gap: Implement it as a gate input (RuleInput.frozen covering per-field raw text, the statement declaration text and docstring, .holds, elaborated type/value and the closure), checked in every purpose; optionally add a preventive PreToolUse check. Add a 'request unfreeze' tool that cannot unfreeze anything. Decide whether telelean's normalisation (pins and docstrings) may touch frozen cards. Rename to avoid the clash with freeze_statements and 'Statements frozen (round N)'.
  - safety: High. 'Never edit' can only be guaranteed as 'a violating state never reaches a proposal or the user's files', unless a preventive hook is added.
- **INITIATING EDIT SESSIONS 1** — current: 'These suffice ▶' / 'Self-evident?' call startRun only when no run is active.
  - files: extension/src/logic/boardSession.ts:342-349
  - conflict/gap: Compatible. The session becomes the run, with rounds as stages.
  - safety: none

## safety_invariants

- **Claude never writes the user's real files. It works only in the shadow ws/. The real files change only through set-premises at start and through Accept (ModelWorkspace.applyChanges).** — enforced: runner/src/llm/claudeCli.ts:75-77,106-109 (tools Read/Glob/Grep/Edit/Write; Bash, Web and Agent disallowed); runner/src/llm/confinement.ts (path guard, CLI fences, deny rules for .lake/.telelean/.git and dot-entries); manager.ts header 1-17, 857-866, 1723
  - spec could break it: Frozen statuses, blacklists or transform specs stored where Claude can read or write them (in ws/ or as editable block fields). 'Exit cancels all changes' while set-premises was already written to the real file at start.
- **The proposal shows, and Accept applies, only a state the gate judged.** — enforced: manager.ts settleAccepted 1087-1098, commitGatePass 2174-2183, settleReverted 1101-1129; Accept rebase, re-freeze and re-gate on drift 1667-1721
  - spec could break it: Applying a subset of Claude's changes (per-item accept) without rebuilding and re-gating exactly that subset. Changing statuses mid-turn so the judged frozen set differs from the one Claude worked against.
- **Accept is all-or-nothing (D-21), and every new definition on a statement path and every new presupposition needs the user's explicit yes.** — enforced: manager.ts acceptNow 1651-1652; proposal/service.ts:171-182; core/src/gate/rules.ts flagged 807-834
  - spec could break it: 'One item for all the vocabulary' absorbing definitions and presuppositions. Per-item accept applying items without their dependencies.
- **The user's words are byte-identical: no block field, id, lean: line, version, extension or body is changed by Claude (G5).** — enforced: core/src/gate/rules.ts markupFindings 836-1033 (COMPARED_FIELDS :60)
  - spec could break it: 'Change <card>' items and Claude-autofilled fuzzy fields let Claude write fields. This must be limited to unfrozen or fuzzy fields, marked worded_by: agent, and each change must be accepted before the final apply.
- **Claude never adds, deletes or moves blocks. Only telelean writes Claude-worded cards (adopted ghosts), exactly as checked, and they must stay as telelean wrote them.** — enforced: core/src/gate/rules.ts:899-907, 1003-1031; core/src/gate/adoption.ts; manager.ts adoptGhostNow 1530-1613
  - spec could break it: REVIEW STAGE 1 creation and deletion; TRANSFORM 6 'may add cards'; shaky reshuffles that split or remove cards; deletions bypassing D-18's dependents confirmation.
- **Every declaration that existed before the run keeps its text and its elaborated meaning (type/value), except the target's .holds.** — enforced: core/src/gate/rules.ts existing-changed 343-383 (B facts from the base check, engine.ts:436-437)
  - spec could break it: Unfrozen existing cards become editable. Changing one card's statement changes the meaning of every card whose statement mentions it, including frozen or accepted ones, unless closures are frozen or dependents are reopened.
- **Only the person adds beliefs: the only Prop-valued axioms allowed are the selected ASSUMPTION .holds; after the freeze no axiom may be added at all; missing premises go only through propose_assumption and the user's adoption.** — enforced: core/src/gate/rules.ts new-axiom 267-341; manager.ts toolProposeAssumption 2092-2140, adoptGhostNow 1530-1613
  - spec could break it: Claude-created ASSUMPTION cards (may add cards; 'Claude suggests' treated as regular new cards): their .holds must not be permitted in a proof until the user accepts the card AND selects it as a premise.
- **A proof rests only on the D-5 permitted set: standard axioms, signature, the selected premises' .holds, presuppositions, and footprints of the user's own pre-run proofs (never proofs Claude wrote in the run).** — enforced: core/src/gate/permitted.ts; rules.ts footprint 499-587; G4 lake comparator (engine.ts:704-720)
  - spec could break it: A 'these suffice' inside a session with a changed selection; treating accepted items as selected premises implicitly; counting proofs Claude wrote in earlier stages as derivation footprints.
- **D-19: statements are frozen before proving; frozen statements, vocabulary and definitions stay unchanged; finish(proved) needs a freeze in the same round.** — enforced: core/src/gate/rules.ts proof-before-freeze 710-750, statement-changed 466-497, not-frozen 782-790; manager.ts toolFreeze 1981-2016; engine.ts freezeNow 549-620 and the G4 comparator
  - spec could break it: The naming clash with the spec's FROZEN could tempt replacing the D-19 freeze with per-item statuses. The comparator's challenge is what certifies that the proved statement is the frozen one; a nested 'these suffice' needs its own freeze.
- **G0: no sorry/admit, forbidden # commands, metaprogramming, native code, set_option, outside imports or example; only the subject's .lean files change; no project-file changes or deletions.** — enforced: core/src/gate/g0.ts:137-222; rules.ts examples 752-780; engine.ts runCheck 407-411
  - spec could break it: Lean written into the shadow by telelean on Claude's behalf (fuzzy Lean fields) or from transforms skipping G0. Sessions spanning several subjects (outside-subject).
- **Lifecycle changes such as GOAL→DERIVATION are never silent: each is a separate item, applied only when ticked.** — enforced: proposal/service.ts:184-188, planAccept 358-375; manager.ts:1653-1654
  - spec could break it: Folding it into a generic 'Change' item that is accepted implicitly, or that cannot be declined sensibly.
- **Meaning before proof status: the result (report card) is revealed only after the statements were reviewed (D-19, automation bias).** — enforced: webview/src/run/Review.tsx ResultStep and 'Show result'; webview/src/model/run.ts pastStatements
  - spec could break it: A flat scrollable item list with a status table showing proof results next to the statements from the start.
- **Claude's guesses never reach the board before the user answers (D-20).** — enforced: manager.ts toolAskUser 2026-2039 (pendingAsk versus view); answerNow 1326-1327
  - spec could break it: A new 'request unfreeze' or question tool that does not follow the same pattern.
- **One active run per root, and user actions are serialised, so a turn's frozen context cannot change under Claude.** — enforced: preflight.ts:87-89 (busy); manager.ts startLock 821-833, exclusive 437-449; extension busyRefusal
  - spec could break it: FROZEN 4-5 (freeze or unfreeze at any time) and REVIEW STAGE 5 (these suffice mid-review) introduce user changes during Claude's turn. Snapshot the frozen set per round or interrupt the round.

## answers

Q1, the 'Fully explicit' checkbox:
- Where: the review's statement step ('Statement N'), under 'Lean statement <name>'. Its tooltip is 'No notation, every argument and universe shown, no coercion arrows' (packages/webview/src/run/Review.tsx:54-58).
- What it does: it switches the displayed Lean between two renderings of the same statement:
  - StatementReview.pretty: Lean's #print with the default notation;
  - StatementReview.explicit: rendered by the runner in a scratch Lean file with `set_option pp.explicit true in set_option pp.notation false in set_option pp.universes true in set_option pp.coercions false in` (packages/runner/src/gate/scratch.ts:112; engine.renderStatements engine.ts:785-799; core/src/run.ts:360-363).
- Effect: display only, remembered per statement (webview state/store.ts:243). It changes nothing in the files or in what Accept applies.
- Fallback: if Lean could not print the statement, both forms fall back to its source text (proposal/service.ts:224-233).
- Purpose (D-19): let you judge whether the Lean says what your sentence says without notation hiding implicit arguments, universes or coercions.

Q2, 'Statement 1, 2…' versus 'Claude suggests':
- 'Statement N' are the steps of the review stepper (label from Review.tsx:22-24).
  - There is one step per card on the proposed board whose Lean statement is new or changed compared with your files at run start (proposal/service.ts:211-239).
  - In practice these are formalisations of existing cards: the target, the selected premises and adopted ghosts.
  - Each step asks 'Does the Lean say what the sentence says?' and shows the sentence, the Lean, 'Fully explicit', the 'It uses' closure and 'Show on the board'.
  - It has no accept or decline: Accept takes the whole proposal.
- 'Claude suggests' cards are ghosts (core/src/run.ts:235-254).
  - They are new premises Claude proposed with propose_assumption. telelean checked in Lean that your selected premises plus the suggestion prove the target ('closes the gap (checked)').
  - They are not in the proposal's files; Claude is told 'do not write it into the files'.
  - They appear translucent at the top of the Assumptions column in the proposed view, and under 'Premises Claude suggests' in the report card.
  - You decide each one:
    - 'I hold this', then an optional 'Why do you hold it? (optional)', then 'Adopt'. telelean writes it as an ASSUMPTION card with worded_by: agent before the target's block, adds it to the target's premises, re-freezes the statements, and starts a new round in which Claude proves the target with it.
    - 'No': it is marked rejected, and Claude is not told.
- The difference in kind: a Statement step checks the meaning of a formalisation; a 'Claude suggests' card is a belief that only you may add.
- After adoption, the new card's statement shows up as a 'Statement N' step in the next round's review, worded by Claude and shown in italics.

Q3, where definitions show up:
- In the review: the 'Definitions' step lists the definition questions, i.e. new definitions your statements rely on and new existence presuppositions T.exists. Each has 'Yes, I endorse it' and 'No…' (Review.tsx:121-165). Accept needs a yes for every one, and a no opens prefilled Feedback.
- On the main board: definitions are not cards and have no arrows.
  - They are vocabulary items (kind 'definition') in the computed Vocabulary group at the top of the Assumptions column (webview board/Column.tsx:97; board/VocabularyGroup.tsx), in its section titled 'Definitions' (webview/src/labels.ts:67).
  - A definition on a statement path carries the flag 'definition on a statement path', with the tooltip 'A definition your statements rely on (D-4: needs your endorsement)' (VocabularyGroup.tsx:39).
  - A card's 'uses:' dropdown, or an identifier in its Lean code, can highlight them.
  - Presuppositions sit in the same group's 'Presuppositions' section.
  - In the proposed view, the group shows the proposal's vocabulary with diff marks and '+N new'.

## uncertainties

- The webview and extension behaviour was read only to quote strings (Review.tsx, GhostSuggestion.tsx, VocabularyGroup.tsx, runs.ts, boardSession.ts). I did not trace the webview review store end to end; another area should confirm the UI details in the answers.
- 'Stay in the subject's namespace' looks prompt-only: a grep of core/src/gate found no namespace rule. I did not read describe.ts, decls.ts or normalise.ts in full.
- 'autoImplicit is off' is presumably enforced by the project's lakefile, which Claude cannot change (G0 project-file), together with the set_option ban. I did not verify the lakefile setting.
- The path guard (bin/telelean-path-guard.mjs, 550 lines) was only grepped. It appears to decide on tool names and paths and never on edit contents; not fully read.
- lastFinish never being cleared between rounds, old suggested ghosts staying adoptable after Feedback, and a revert falling back to an earlier round's passing commit all come from reading the code; none was executed or tested.
- 'StatementReview change: changed is practically unreachable' is an inference from existing-changed and G5. I did not check whether the Accept-rebase path can produce it.
- The spec's 'its definition is FROZEN' (REVIEW STAGE 3) may mean the whole card or only its Lean definition. Which one changes what the frozen reference must cover.
- Whether an edit session may span several subjects is not addressed. The current gate (G0 outside-subject) and the run are single-subject.
- I did not check how the D-21 / IC-26 design wording in 01_consolidated_idea.md (IC-26) and the decisions-log weigh against a per-item model, beyond the quoted lines.
