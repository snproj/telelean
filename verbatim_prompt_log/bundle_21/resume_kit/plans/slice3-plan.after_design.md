# Slice 3 plan: FROZEN (spec v4.1)

*Integrator's plan, 2026-11-19, written on autopilot (the user is away and asked for the slices to be built without stopping; `verbatim_prompt_log/bundle_21/user_requested_documents/02_autopilot_decisions.md` logs every choice made without them). The specification is `verbatim_prompt_log/bundle_21/user_requested_documents/01_spec_v4.md`; clause IDs refer to it. The user's own words on freezing (`bundle_20/prompt20.md` lines 26–59: FROZEN 1–5, REVIEW 3, 5, 7, 8, INITIATING 2; `bundle_21/prompt21_midturn.md` message 1, ★D3) outrank every simplification here. Two designs fed this plan: the freeze engine and checks (core, runner), and the freeze UI, protocol and Undo (webview, host, core protocol); §7.1 resolves their conflicts. Every choice the spec leaves open, and every narrowing of it, is in §7.2 as an "AUTOPILOT DECISION" with its alternative and how to reverse it, cited as (D3-n). Slice 2's plan (`docs/slice2-plan.md`) is final: its §2 and §2.9 contracts are the interface this plan builds on, and its decisions are cited as (D2-n).*

*Designed for the simplest sound mechanism from the start (AP-24's lesson). There is one table of frozen targets with their expected values, and every state telelean judges is compared with it, whole-state. A state that breaks it is refused, never repaired. Slice 2's `judgeState`, reducer, session stack, write queue, base mask and end confirmation are reused, never paralleled.*

**Slice 3 = ★D8 (a) item 3, FROZEN:**
- **Freeze, Unfreeze, Freeze all other cards, Unfreeze all other cards** on cards (vocabulary cards included), single fields, arrows, "follows from nothing" marks and review items: on the Current view outside a session, and everywhere in a session, at any time, including while Claude works (FZ-1, FZ-2, FZ-6, FZ-9, FZ-10, FZ-13). Small narrowings, while Claude works, while the results are hidden, while telelean re-checks or applies, on Claude's suggested premises, for a freeze the running step can no longer meet, and for "your version" over several items, are logged (D3-6–D3-8, D3-30, D3-45, D3-46, D3-50).
- **The mechanical check** (FZ-3, FZ-4): every judged state, and Apply's backstop, compare every frozen and held target with its frozen value: text directly, meaning in Lean through a new facts field `meaningKey` (D3-2). A step never moves frozen content to anything but its frozen value (§3.4's two-value rule, D3-5). A freeze made while a step runs that the step can no longer meet ends that step at once, not counted (D3-50). No input the runner may forget turns a check off (D3-51).
- **Reasons** (FZ-7): standing, accepted (RV-4: Accept now freezes) and yours. Starting a session with Formalize makes no binding reason (D3-1); editing a card's sentence, Why, stance or source on the board outside a session freezes that field, as a standing freeze (FROZEN 1, D3-44).
- **Decisions that would change frozen content** ask first, or are refused, by one check over the items a write takes out or brings back (FZ-10, D3-48); Submit's take-out leaves frozen content where it is (D3-49).
- **Unfreeze requests** (FZ-5): `request_unfreeze` pauses the step like a question, with Select them, Continue and Keep frozen. "Allow this change" is not built: held content changes only after the person unfreezes what holds it (D3-9).
- **The end** (FZ-8, EN-2, EN-3): standing freezes come back as they were, except what the person ticks **keep**.
- **The look** (FZ-11), and "statements frozen" renamed "statements fixed" (FZ-12).
- **Undo** (UN-1, UN-2, UN-4, UN-5): standing freezes on the board stack, session freezes on the session stack.
- **What slice 2 deferred here:** Formalize's ▾ with **Open the whole model** and **Claude may add cards** (ES-2, D2-12); Change items of card fields, Delete, Remove arrow, Add of an intermediate card, Proof broken; the backstop's frozen and held rules (slice 2 §4.10's hook); the base mask, revisited (§3.10). They are built after FROZEN itself is complete and verified (§1): first the whole model open, then Claude may add cards. If that last part still has a blocker or major finding after its fix rounds, it moves to slice 4 with TR-7 (D3-43). A session's steps change only its own subject, and never what another subject's declarations mean, in every step (D3-41).

**Not in slice 3:**
- **The transform window (slice 4):** the reasons `session-start` and `transform` exist in the types and are never made; TR-15's revaluing and the "Transform cards…" banner are hooks (§3.12).
- **References (slice 5):** `heldFields()` returns `[]` (FZ-4's `#` holding, RF-5).
- **Not built, by decision:** "Allow this change" and the "meaning changed by X" items, so RV-7's b5 stays unused (D3-9); "make it pending" on Proof broken (TR-14, D3-10); re-proving a Proof broken card in the session that broke it (D3-47).
- **Consistency checking** (M3).

---

## 0. Rules for everyone working on slice 3

Slice 1's and slice 2's rules hold unchanged (§0 of both plans; the builder rules file is pasted into every builder's brief):
- no git changes, no installs, never real Claude (`TELELEAN_NO_REAL_CLAUDE=1`), never write `packages/extension/dist` or `out`;
- one heavy job at a time under `capped.sh`; vitest with one worker, the extension's with `--no-cache`, every run with `--fsModuleCachePath` in the scratch dir (V2A1-C6);
- binaries from `node_modules/.bin`; `TELELEAN_TEST_TMP` in the scratch dir;
- real Lean only for the files a change touches, above the 12 GB rule; otherwise listed as not run;
- webview test builds to `TELELEAN_WEBVIEW_OUT`; Playwright and the VS Code suite only by the integrator, when RAM allows.

Additions for slice 3:
- **Start.** 3a starts after slice 2's verified end ("slice 2 done" in the decisions log). The integrator first measures the baseline (tsc in every package, the vitest counts) and records it in §8.
- **Contracts.** §2 is the integrator's. A builder who must change a contract, or who finds that slice 2's built code differs from slice 2's §2 in a way that matters here, records it in §8 with the reason, and says so in the report.
- **Texts.** Every text quoted here is used verbatim. Core `freeze/texts.ts` holds them (`FREEZE_TEXTS` for the person, `CLAUDE_FREEZE_TEXTS` for Claude); 3a writes every one. A later sub-slice that needs an unquoted text reports it; the integrator adds it between sub-slices.
- **One builder at a time in core** (slice 2's rule): 3a, 3b, 3c1 and 3c2 run strictly one after another, with nothing beside them. 3p, 3d, 3e1, 3e2 and 3e3 change no core source file. 3a also adds one line each to webview `labels.ts` and runner `workspace/history.ts`, and the runner's `NO_FREEZES_YET` stopgap (below; §1.1), so that every package still compiles and its tests still pass; 3b may update runner test fixtures, never runner source, where its fail-closed Accept needs them (D3-51). 3f and 3g change only the webview (3f also the extension's `package.json` colours), so 3f may run beside 3d or 3e1, and 3g beside 3e1, when their files do not overlap. 3e2 and 3e3 also change the webview's Formalize ▾, so they run alone. A builder who finds it must change a core file stops and reports it.
- **Slice 2 stays green.** A slice-2 test this plan changes on purpose is changed by the sub-slice named, and listed in its report with the reason. These are D3-23's seal on answers, the `freeze` activity icon, Proof broken's Accept, the `formalize` validator's `options`, and one behaviour change: a re-ask of a target whose Result was accepted can no longer replace its proof (RV-4 freezes the proof; `frozenNeeds` warns, and the step keeps the proof as it is). Review round 2 adds three: an Accept needs the record's `heldAtJudge`, which reconcile sets from a judgement (D3-51; fixtures that build records or judgements by hand gain it, in 3b); a revert writes a block's derived `id:` (§3.10's Ids, R2-6), which is no difference to any item but changes byte-exact texts; and `existing-changed` compares meaningKey where both sides have one, in every step (§3.5, R2-13).
- **New contract fields stay optional where slice-2 code builds the object** (`JudgeInput.freezes`, `ReviewState.freezes`, `SessionRecords.freezes`, `StateJudgement.freezeAtAccept` and `held`, `BackstopInput.freezes`, `SessionViewInput.running`, `ItemRecord.heldAtJudge`, `planSubmit`'s `freezes`), so slice 2's fixtures and the runner still compile after 3a. But no absence turns a check off silently (D3-51; R2-5 of review round 2, slice 2's V2A-S5 rule):
  - judgeState always checks accepted items' `frozen` from the records, whatever `freezes` holds;
  - an Accept is refused without the record's `heldAtJudge`, which reconcile sets, never the runner;
  - the reducer refuses a freeze action, a decision with `freeze`, and their Undo and Redo, without `ReviewState.freezes`;
  - judgeState('final') and `applyBackstop` refuse without the session's freezes: "telelean could not read the session's freezes: reload the window."

  So that the runner's final check and Apply keep working from 3a to 3d, 3a makes the runner's builders of JudgeInput and BackstopInput pass `NO_FREEZES_YET` (no standing freeze and an empty SessionFreezes: none can exist before 3d) when the context has none. 3d deletes `NO_FREEZES_YET` and makes the runner's `SessionCheckContext.freezes` and the freezes of its Apply and Submit paths required, so tsc finds every call site, and a 3d spy test checks each one (§6.1).
- **FakeBackend.** New scripts go in `packages/runner/test/run/fixtures/sessions/` as `frozen-*.jsonl` and `whole-*.jsonl`; each cheat of §6.2 is also built by hand in `core/test/freeze/cheats.test.ts`.
- **Recordings.** The integrator regenerates `test-fixtures/semantic/recorded/*` with the meaning probe right after 3p, when RAM allows, so that no runner suite after 3b meets accepted names without `meaningKey` (which the final check refuses, §2.1).
- **Patches and reports.** After each sub-slice, `verbatim_prompt_log/bundle_21/evidence/patches/after_slice_3x.patch` and the builder's report in `bundle_21/subagent_reports/`.

## 1. Order of work

Each sub-slice ends with every package compiling, the unit tests of every package it touched passing, its entry in §8, and a saved patch. Each is sized for one builder.

| Sub-slice | What | Main clauses | After |
|---|---|---|---|
| 3a | Contracts and the frozen check (core): types, texts, freezes.json, values, the table, `frozenFindings`, the `other-subject` rule, judgeState and backstop integration | FZ-1–FZ-4, FZ-7, FZ-13, Appendix B (Replaced, Held sets, Backstop) | slice 2 |
| 3p | The meaning probe (runner; no core file), then the recordings regenerated | FZ-3/FZ-4 (meaning) | 3a |
| 3b | Freeze actions, the review hooks, the views and the protocol (core), with `unfreezeRequestProblems`, `frozenChangesOf`, `unmeetable`, `planIdWrites` and Submit's keep set | FZ-5 (records), FZ-6–FZ-10, RV-4, RV-5, UN-4, UN-5, A5, A6 | 3p |
| 3d | Freezes in the runner and host: standing freezes on disk, session freezes, unfreeze requests, freezing while Claude works, decisions over frozen content, turns, FZ-12 | FZ-3, FZ-5, FZ-9, FZ-10, FZ-12, ES-4, ES-9, UN-2 | 3b |
| 3e1 | The end (FZ-8) and the session's `ids` commit (runner, host) | FZ-8, EN-2, EN-3, UN-2, A6 | 3d |
| 3f | Webview: selecting and freezing, dialogs, the look | CM-2, CM-3, CM-7, FZ-9, FZ-10 (dialogs), FZ-11, FZ-13 | 3b (may run beside 3d, 3e1) |
| 3g | Webview: the session's freeze UI (request cards, the end, Undo, banner); the user guide's "Frozen" section | FZ-5, FZ-8, FZ-11, FZ-12, EN-2, UN-1, UN-4 | 3f; 3e1 for its routes |
| 3c1 | The whole model open (core): ownership of Change, Delete, Remove arrow and Proof broken, revert, whole-model step limits, G5, the after-freeze rule, the three tool validators | ES-2 (whole model), RV-1 (Change, Delete, Remove arrow, Proof broken), RV-5, TR-14 (part), B.3, B.4 | 3e1 and 3g, nothing beside it |
| 3e2 | The whole model in the runner and host, and Formalize's ▾ with **Open the whole model** (webview) | ES-2 (whole model), D3-37, D3-41, D3-42 | 3c1 |
| 3c2 | Claude may add cards (core): the `card` ledger kind, `addCardProblems`, intermediate inferences, DO-0's card decline, the mask | ES-2 (add cards), RV-1 (Add), DO-0, A25 | 3e2, nothing beside it |
| 3e3 | Claude may add cards in the runner, and its ▾ item (webview) | ES-2 (add cards), A25 | 3c2 |

- **FROZEN first** (F9 of review round 1). After 3g, FZ-1–FZ-13, RV-4 and FZ-8 are complete, and the integrator verifies them end to end before 3c1 starts. The whole model (3c1, 3e2) and Claude may add cards (3c2, 3e3) come after, the riskiest part last.
- **D3-43's fallback.** If 3c2 still has a blocker or major finding after its two fix rounds (AP-27), the integrator takes its files back to their state after 3e2 and does not build 3e3; if 3e3 has one, its own files go back the same way, and 3c2's core stays unused (no runner path passes `mayAddCards`; the host answers it `not-yet`). Either way "Claude may add cards" for Formalize moves to slice 4 with TR-7, the ▾ shows only Open the whole model, and the `card` ledger kind and the `add_card` tool stay unused (its validator stub stays).
- Until 3d and 3e1 land, the host answers a valid freeze message it does not route yet with `not-yet`, "Not built yet (slice 3)"; until 3e2, it answers `formalize.options` the same way. The user's installed extension is not affected: `dist` is rebuilt only at the verified slice end (AP-8).
- **3a, 3b, 3d and 3f are the largest.** If a builder reports running out of room: 3a splits after the values (3a1: contracts, texts, store, values, table; 3a2: the check, the `other-subject` rule, judgeState, backstop); 3b after the planner (R2-16 of review round 2; 3b1: `planFreeze`, `acceptCovers`, `frozenNeeds`, the views, `set-freezes` and the edit-node freeze with A6, the protocol; 3b2: the reducer, reconcile, `frozenChangesOf`, `unmeetable`, `planIdWrites`, `unfreezeRequestProblems`, the revert's ids and Submit's keep set); 3d after the standing freezes (3d1: standing freezes, host routing, FZ-12; 3d2: session freezes, requests, freezing while Claude works, decisions over frozen content); 3f after the store (3f1: selection, menus, dialogs; 3f2: the look).

### 1.1 Scope of each sub-slice

The files named are where the work lands; builders may add helper files next to them.

**3a: contracts and the frozen check.** Core, plus one line in the webview and small stopgaps in the runner (below).
- Contracts (§2.1–§2.4, §2.6's types, §2.9's signatures): new `core/src/freeze/` with `types.ts`, `keys.ts`, `store.ts`, `value.ts`, `table.ts`, `check.ts`, `texts.ts` and `index.ts`, which exports every core function of §2.9; those of 3b, 3c1 and 3c2 start as stubs throwing `NotImplementedError("‹name› (slice 3x)")`, and `core/src/index.ts` gains its line, so no later sub-slice edits an index. Additive fields in `facts.ts` (`meaningKey`), `gate/types.ts` (codes, `fresh`, `FrozenSnapshot`), `review/types.ts`, `review/view.ts` (types only), `run.ts`, `actions.ts`, `model.ts` (`TlGraph.freezes`) and `paths.ts` (`freezesPath`).
- **Keeping every package compiling** (F11 of review round 1): `BoardAction` gains `set-freezes` and `HistoryActionKind` gains `set-freezes`, so 3a also adds a `set-freezes` case to `edit/planAction.ts`'s exhaustive switch that throws `NotImplementedError("set-freezes (slice 3b)")`, the webview's `HISTORY_ACTION_LABEL` entry ("Freeze", `labels.ts`) and the runner's `HISTORY_ACTIONS` entry (`workspace/history.ts`). Likewise, a new `LedgerEntry` kind that meets an exhaustive switch in slice 2's built code gets a case there that throws `NotImplementedError` naming the sub-slice that builds it.
- The check (§3.2–§3.5): `addressValue`, `heldValue`, `heldMap`, `effectiveFreezes`, `frozenFindings`; the judgeState integration and `freezeAtAccept` (`review/judge.ts`); the `other-subject` rule, and `existing-changed` with meaningKey, in every step (§3.5, R2-13); `statement-changed` with meaningKey (`gate/rules.ts`); the backstop's codes, and its and judgeState('final')'s refusal without freezes (`review/backstop.ts`, D3-51); board sentences (`gate/describe.ts`).
- Runner (D3-51): `SessionCheckContext.freezes?` (`gate/types.ts`), and the `NO_FREEZES_YET` stopgap where `gate/engine.ts` builds JudgeInput and where Apply builds BackstopInput (§0).
- Test helper: `fakeFacts({ meaningKey: true })` (the sha256 of each declaration's text and type), with per-declaration `meaningKey` and `noMeaningKey` overrides.

**3p: the meaning probe.** Runner only; no core file (F20 of review round 1).
- The probe (§2.1): `semantic/checkFile.ts`, `refresh.ts`, `gate/scratch.ts`; `gate/engine.ts` (meaningKey into the facts; `checkBase` again when base-facts.json lacks meaningKey); the cost measured as 2b3 did. Then the integrator regenerates the recordings (§0).
- So from 3b on, when Accept starts to freeze, accepted names compare exactly, and slice 2's session tests that apply with an accepted item keep passing (AP-27 runs the full runner suite after every sub-slice).

**3b: freeze actions, review hooks, views, protocol.** Core only.
- `freeze/plan.ts` (`planFreeze`, `acceptCovers`, `freezeBoardOf`, `planIdWrites`), `freeze/needs.ts` (`frozenNeeds`), `freeze/view.ts` (`buildFreezesView`, `boardFreezesView`), `freeze/changes.ts` (`frozenChangesOf`, §3.7), `freeze/check.ts` (`unmeetable`, §3.8), `freeze/tools.ts` (`unfreezeRequestProblems` only; the others stay stubs).
- `review/reducer.ts`: the `freeze` action with per-key deltas, Accept's freeze from `heldAtJudge`, decisions over frozen content with RV-5's list of `frozen` items (§3.7), "your version", Undo and Redo of freeze actions under planFreeze's rules, `madeAt`, the `answer` seal, the decide request's `freeze` (§3.6, §3.7, §5.3); `review/reconcile.ts` keeps `frozen` (D3-4) and sets `heldAtJudge` (D3-51); `review/revert.ts`: a reverted block keeps its derived `id:` (§3.10's Ids, R2-6); `review/submit.ts`: the take-out's keep set (§3.10, D3-49); `review/view.ts`: `SessionView.freezes`, `ItemView.covers`, `Gate.frozen`, the stage report's requests, the frozen problems' texts, `undo`/`redo` during a step (§2.4).
- `project/subjectGraph.ts` and the build input: `TlGraph.freezes`, from the standing records the runner passes (as endorsements).
- `edit/planAction.ts`: `set-freezes` (§2.6); the edit-node freeze (D3-44); A6: `delete-node` and `remove-arrows` drop the records of what they delete.
- `protocol.ts`: §2.5's messages, validators, limits and routing lists.

**3c1: the whole model open.** Core only; nothing beside it.
- `review/items.ts` (ownership of Change, Delete, Remove arrow and Proof broken; origins from the ledger; the live ledger entries), `review/reconcile.ts` (a `card:` item's new version takes its draft's kind), `review/revert.ts`, `review/deps.ts` (rule 5 also for Proof broken), `review/classify.ts` (Proof broken is c1), `review/judge.ts` and `permitted.ts` (whole-model step limits, the after-freeze rule; the subject rule is 3a's, §3.5), `gate/rules.ts` (G5 in whole-model steps; card blocks after the freeze), `gate/normalise.ts` (the tools' ledger writes, `worded_by`, pins of whole-model fuzzy statements), `review/backstop.ts` (the new kinds' ownership), `review/mask.ts` (`dropArrows`: only Results' arrows, F19), `review/submit.ts` (D3-42's take-out, with D3-49's keep set), `review/formalize.ts` (D3-47's start check).
- `freeze/tools.ts`: `removeArrowProblems`, `deleteCardProblems`, `proofBrokenProblems` (a held `.holds` refused, D3-50), `proofMaterialOf`; `propose_arrow`'s validator refuses an arrow whose Remove arrow item is accepted (D3-50).

**3c2: Claude may add cards.** Core only; nothing beside it; D3-43's fallback applies.
- `review/items.ts` (ledger `card` → Add plus Result), `review/reducer.ts` (DO-0 on an intermediate card's arrow), `review/judge.ts` and `permitted.ts` (intermediate inferences), `review/mask.ts` (intermediates' `.holds` and arrows), `review/revert.ts` (an intermediate's Add).
- `freeze/tools.ts`: `addCardProblems`, `intermediateInferences`.

**3d: freezes in the runner and host.** Runner and host; no core file.
- Standing: `workspace/modelWorkspace.ts` reads freezes.json (on load, on its sidecar event, after an Apply and its Undo), passes it to the build and exposes `freezes(subject)`; `workspace/sidecars.ts` (`materialisePlan` writes `EditPlan.freezes`); `workspace/history.ts` (the `set-freezes` label); host `logic/actionMapping.ts` (`setFreezes` → `set-freezes`, ES-9-locked), `logic/boardSession.ts`, `logic/runs.ts`.
- The session: `run/session.ts` (`PersistedSession.freezes`: the start snapshot and `recover()`'s upgrade, which also sets `frozen` on accepted records, §5.2; `freeze()` through the write queue in a stage, and during a step a checked run.json write before the in-memory change; refused while judging; §3.8's rules; the pre-write check of decisions, §3.7; Submit's keep set and the feedback turn's "kept", D3-49; Back to review keeping the stack, §5.3; every `judge-apply` recomputing the frozen findings, §3.5), `run/step.ts` (notices in tool results, fresh attempts, the finish's re-check, the rollback to S₀, the early end of §3.8, D3-50), `run/manager.ts` (`request_unfreeze`, `answerUnfreeze`, the `answer` seal on every answer), `run/types.ts`, `run/persist.ts` (run.json text built when its write runs, §3.6), `run/prompts.ts`, `run/systemPrompt.ts` (with its fixture), `llm/toolSchemas.ts`, `llm/types.ts`, `gate/types.ts` and `gate/engine.ts` (`SessionCheckContext.freezes`, now required, into `JudgeInput.freezes` for check, freeze, gate, judge, finalCheck, `writePremise` and `complete`; `BackstopInput.freezes`; `NO_FREEZES_YET` deleted, D3-51).
- FZ-12's runner texts (§3.12). Host: the run messages `sessionFreeze` and `answerUnfreeze`; `session` and `run` posted before `actionResult` for every session message, and `session` posted after every freeze action (§2.4).

**3e1: the end, and the `ids` commit.** Runner and host; no core file.
- The `ids` commit (slice 2 §3.2's Start, step 2; D3-37): after the `base` commit and before the first `step-start`, telelean writes the `id:` of every derived-id card of the subject (`planIdWrites`); a session started before 3e1 gets it in its next `queue-start` write. A new shadow commit kind `ids`.
- The end (§5.4): `run/sessionEnd.ts` (the rows, `SessionFreezes.end`, the board step after Exit or an empty Apply, its replay in `recover()`, which also reads the ended run that still needs it, with `shadow/index.ts`'s `pruneRunDirs` keeping that run, R2-15; Apply's refusal of a kept freeze whose card has no written id in F, R2-6), `proposal/service.ts` (`planApply` with freezes.json), `workspace/modelWorkspace.ts` and `workspace/types.ts` (`applyChanges` accepts freezes.json; Apply's recovery compares it); host `endSession.keep` and `keepAll`.

**3e2: the whole model in the runner.** Runner, host and the webview's Formalize ▾; no core file.
- The whole model (§3.10): `run/session.ts`, `run/step.ts` (the options into StepScope, Submit steps taking their inference's options, the three tools, their ledger entries dropped by rollbacks, the `changed` ledger entries at a step's end), `run/prompts.ts`, `llm/toolSchemas.ts`; `gate/engine.ts` (the card blocks in the freeze snapshot of whole-model steps); host `formalize.options` (`wholeModel`).
- Webview: `header/ContextSection.tsx` and `board/useFormalize.ts` (Formalize's ▾ with Open the whole model, §4.8); "Filling now" for whole-model steps (§3.8); the user guide's whole-model section.

**3e3: Claude may add cards in the runner.** Runner, host and the webview's ▾; no core file; D3-43's fallback applies.
- `run/step.ts` (`add_card`, the comparator per proved intermediate), `run/prompts.ts`, `llm/toolSchemas.ts`; host `formalize.options` (`mayAddCards`); the ▾'s second item and its guide paragraph.

**3f: selecting and freezing, dialogs, the look.** Webview and `extension/package.json`.
- New `state/freeze.ts` (wired into `store.ts` and 2g's `state/session.ts`): field and vocabulary selection, routing, `freezeSelection`; `board/contextActions.ts`, `menu.ts`, `ContextMenu.tsx`, `runAction.ts`, `BoardInput.ts`, `header/ContextSection.tsx`; `board/FieldLock.tsx`, placed in `NodeCard.tsx`, `CardDetails.tsx` and `Vocabulary.tsx` (3g also places it in the review item detail's field rows, §4.2); `dialogs/Dialogs.tsx` (§4.4).
- The look: `model/freezeLook.ts`, `styles/board.css`, `board/EdgeEngine.ts`, `edges.ts`, `Board.tsx` (lock badges through 2h's `setBadges`), `header/legend.ts`, `board/diagnostics.ts`; the `telelean.frozen` colour with its theme and `packageJson` tests; the harness's colour variable.
- Fixtures in `test/shared/graphs.ts`; drafts `test/e2e/s3-look.spec.ts`, `s3-freeze.spec.ts` (not run).

**3g: the session's freeze UI.** Webview and `docs/user-guide.md`.
- `run/UnfreezeRequest.tsx`, `RunPanel.tsx`, `RunBadge.tsx`; 2g's `run/review/*` (Accept's RV-4 hint, Select them for `Gate.frozen`, the stage report's requests, the end confirmation's keep list with Keep all, the Exit list, lock slots in the item detail's field rows); `run/SessionBar.tsx` (banner by the queue's mode, may-change marks, stage problems); Undo during a step in `state/session.ts`; the four freeze actions disabled while judging; FZ-12's `milestone` icon (`RunPanel.tsx`, `model/run.ts`). Formalize's ▾ moved to 3e2 and 3e3.
- Fixtures in `test/shared/sessions.ts`; the user guide's "Frozen" section (which also says that editing a card's sentence, Why, stance or source on the board freezes that field, and how to lift it, D3-44; and that Apply writes the `id:` of every card of the subject into its files, even files no accepted item touched, D3-37) and the rename; drafts `s3-session.spec.ts`, `s3-undo.spec.ts` (not run).

## 2. Contracts (integrator's; builders implement them as written)

### 2.1 Facts and the freeze snapshot (the fields in 3a; the probe in 3p)

```ts
// core facts.ts: DeclFacts +
/** D3-2: sha256 of the `Repr` of the elaborated declaration: its type; a definition's value (`defnInfo` only); an
 *  inductive's constructors with their types; its level parameters; and the same, sorted by name, for every
 *  model-library constant the value walk reaches that is not probed itself (auxiliaries such as `match_1` count for
 *  their parent). Absent when the probe gave none (old facts, a Repr over 2 MB). */
meaningKey?: string;

// core gate/types.ts: FrozenSnapshot +
declarations: Record<string, { kind?: string; type?: string; value?: string; meaningKey?: string }>;
/** Whole-model steps (§3.10): each card block's field lines at the freeze, `premises:` and `follows_from:` left out. */
blocks?: Record<string, string>;
```
- **`statement-changed`** also compares meaningKey where both sides have one: after a step's freeze, no declaration's meaning can change silently (§3.10). This closes slice 2's §4.3 residual for fixed statements.
- **Missing meaningKey fails closed** (D2-25's pattern): the comparison falls back to `approx` (D2-41's printed type and value plus the sorted constant sets), the name is recorded as inexact, steps go on, and the final check and Apply refuse with "telelean could not compare what ‹name› means in Lean: reload the window to check the base again." (rule `frozen`).
- **The probe** (3p): the value probe's `#eval` prints one more line per declaration, `{"telelean-meaning-of":"<name>","text":"…"}`. The runner hashes the text and drops it; a text over 2 MB gives no key. Old recordings without these lines parse, with no meaningKey.
- **Base facts:** when base-facts.json lacks meaningKey (a session started before 3p), the next judge runs `checkBase` once more on the base commit (which never changes) and replaces the file.

### 2.2 Freeze types and stored formats (core `freeze/types.ts`, 3a)

```ts
/** CF-2. A whole-card freeze stores all eight fields (D3-20); an axiom shows six. */
export type CardField = 'sentence' | 'kind' | 'why' | 'stance' | 'source' | 'statement' | 'dependencies' | 'proof';
export type VocabField = 'declaration' | 'gloss';
export const CARD_FIELDS: Readonly<Record<NodeType, readonly CardField[]>>;   // AXIOM: 6, PROPOSITION: 8
export const ALL_CARD_FIELDS: readonly CardField[];

/** What is frozen: the unit of freezes.json, the check, the views and the keep ticks. RV-4's "may not re-add" after an
 *  accepted Delete or Remove arrow is that item's own check (§3.4), so no target names a card's existence. */
export type FreezeTarget =
  | { kind: 'field'; card: string; field: CardField }
  | { kind: 'vocab'; name: string; field: VocabField }      // fully qualified Lean name, any subject's (TR-10)
  | { kind: 'arrow'; source: string; target: string }       // FZ-13: Claude may not remove it
  | { kind: 'mark'; card: string };                         // FZ-13, AR-5: no premise may replace it
/** canonicalJson([kind, ...parts]) (review/hash.ts): unambiguous for any Lean name. */
export type FreezeKey = string;
export function freezeKey(t: FreezeTarget): FreezeKey;
export function parseFreezeKey(k: string): FreezeTarget | undefined;

/** What the person selected; planFreeze expands it (§3.6). */
export type FreezeSubject =
  | { kind: 'card'; card: string } | { kind: 'field'; card: string; field: CardField }
  | { kind: 'vocab'; name: string } | { kind: 'vocab-field'; name: string; field: VocabField }
  | { kind: 'arrow'; source: string; target: string } | { kind: 'mark'; card: string }
  /** Session only: what the item's Accept would freeze (RV-4), at Claude's proposal (D3-30). */
  | { kind: 'item'; item: string; rev: number };
export type FreezeOp = 'freeze' | 'unfreeze' | 'freeze-others' | 'unfreeze-others';

/** FZ-7. `session-start` and `transform` are slice 4's: typed, never made in slice 3 (D3-1). */
export type FreezeReason =
  | { kind: 'standing' } | { kind: 'accepted'; item: string } | { kind: 'yours'; at: string; proposal?: string }
  | { kind: 'session-start' } | { kind: 'transform'; at: string };

// ---- freezes.json: `.telelean/subjects/<S>/freezes.json` (paths.ts `freezesPath(S)`), the standing freezes
export interface StandingRecord { target: FreezeTarget; at: string }
export interface FreezesFile { format: 'telelean-freezes'; version: 1; freezes: StandingRecord[] }
/** Hand validator: a missing file is no freezes; an unreadable record is left out and listed in `problems` (A6);
 *  duplicates merge, keeping the earliest `at`. */
export function parseFreezesFile(text: string | null): { records: StandingRecord[]; problems: string[] };
/** Sorted by key, one record per line, so the board stack's backwards patches rarely conflict (§5.1). */
export function serialiseFreezes(records: readonly StandingRecord[]): string;

// ---- values (§3.2)
export interface AddressValue {
  /** sha256 of the canonical JSON of the value: texts exactly, Lean by meaningKey. */
  key: string;
  /** The same with D2-41's comparison in place of meaningKey (the fallback). */
  approx: string;
  /** Every Lean declaration it covers has a meaningKey. */
  exact: boolean;
  present: boolean;
  /** The Lean declarations it covers: the roots of its held closure. */
  decls: string[];
  /** What it must be, as Claude and the person are told ("(empty)", the sentence, the Lean text); ≤ 2,000 characters. */
  show: string;
}
/** (Round 2, R2-17: the text-only hashes of round 1 are gone; §3.7's check compares keys.) */
export interface HeldValue { key: string; approx: string; exact: boolean }

// ---- the session's freezes (PersistedSession.freezes in run.json; SessionRecords.freezes)
export interface SessionFreezes {
  format: 'telelean-session-freezes'; version: 1;
  /** freezes.json at the session's first run.json write: the standing reasons, and FZ-8's restore point. */
  standing: StandingRecord[];
  /** Keys of standing freezes the person unfroze in this session. */
  standingCleared: FreezeKey[];
  /** The person's own freezes in this session (reason `yours`). */
  own: OwnFreeze[];
  requests: UnfreezeRequestRecord[];
  /** How the session started: EN-2's summary line only (D3-1). The banner reads the queue's mode (§2.4, F16). */
  start: { wholeModel: boolean; mayAddCards: boolean };
  /** FZ-10 (F3 of review round 1): for each key, when a freeze action, an Undo or a Redo last gave it a standing or own
   *  reason; removed when its last standing and own reason goes. §3.4's `fresh` and §3.8's rollback read it, whatever the
   *  reasons' own `at` (an Undo restores an old reason with its old `at`). */
  madeAt: Record<FreezeKey, string>;
  /** FZ-8's writes, recorded before they are made (§5.4, F18): `keep`, the ticked changes; `freezes`, freezes.json's
   *  planned text, which Apply's recovery compares; `ids`, the cards whose `id:` the person's files get (D3-16); `written`,
   *  done. `recover()` reads the ended run whose `board-step` is not written and makes it, merging `keep` with
   *  freezes.json as it is then (§5.4). */
  end?: { how: 'apply' | 'board-step'; keep: { add: StandingRecord[]; remove: FreezeKey[] }; freezes: string; ids: string[];
    written: boolean };
}
export interface OwnFreeze {
  target: FreezeTarget;
  at: string;
  /** The stack action that made it (SessionAction.id). */
  action: number;
  /** The item whose proposal it froze (FZ-10), for the Shaky decline's dialog and the texts (§3.7). */
  proposal?: string;
  value: OwnValue;
}
/** `base`: B's value and B's held map ("your version", or a value and a held map both equal to B's, §3.6, R2-1);
 *  `state`: the judged state's when made, with its held map. */
export type OwnValue = { from: 'base' } | { from: 'state'; commit: string; value: AddressValue; held: Record<string, HeldValue> };
export interface UnfreezeRequestRecord {
  id: string; step: string; askedAt: string;
  items: RequestItem[];
  /** Claude's words. */
  change: string; why: string;
  answer?: { kind: 'continue' | 'keep-frozen' | 'withdrawn'; unfrozen: FreezeKey[]; stillFrozen: FreezeKey[]; at: string };
}
/** As request_unfreeze names them. `name`: a declaration, frozen as a vocabulary card's or held. */
export type RequestItem = { card: string; field: CardField } | { name: string } | { arrow: ArrowEnds } | { mark: string };
```

### 2.3 Additions to the review model and the gate (3a)

```ts
// ---- core review/types.ts
interface ItemRecord {
  /** RV-4 (§3.7): set by the person's Accept; cleared only by the person's own later status change of this item, an
   *  Unfreeze that covers it, or a cascade of the person's action that changes its status, which always lists it in
   *  RV-5's confirmation, whatever its status ("frozen: you accepted it"; R2-4 of review round 2); never by reconcile
   *  (D3-4). Checked exactly like an own freeze (F4 of review round 1): its content key, plus each held name against its
   *  stored value. */
  frozen?: { fingerprint: string;
    /** `heldValue` of every name in the meaning closure of the item's own declarations, its own names included (so their
     *  meaningKey too), on the stage judgement at the Accept (the record's `heldAtJudge`). A later change to an item of
     *  its SCC that is not accepted is caught here. */
    held: Record<string, HeldValue>;
    at: string };
  /** (R2-5 of review round 2, D3-51; slice 2's V2A-S5 rule) The item's held map in the last judgement reconcile applied
   *  while it was in review (`StateJudgement.freezeAtAccept`); set by reconcile, never by the runner or the reducer. An
   *  Accept copies it into `frozen.held`, and is refused without it: "‹item› has not been checked yet: wait for the check
   *  to finish." (`blocked` in a group). */
  heldAtJudge?: Record<string, HeldValue>;
}
/** `frozen` is restored by Undo with the rest, but slice 2's `decisionKey` (Undo's conflict check) ignores it, as it
 *  ignores `accepted.fingerprint`, since a premise write's step 4 rewrites it (R2-11 of review round 2). */
type ItemState = Pick<ItemRecord, 'status' | 'decline' | 'accepted' | 'redo' | 'markers' | 'rejectedFingerprints' | 'frozen'>
  & { rejectedRevs: number[] };

type LedgerEntry = /* slice 2's */
  /** remove_arrow: telelean takes the entry out of the target's `premises:` at the next normalise. */
  | { kind: 'unarrow'; source: string; target: string; step: string; why: string; written?: string }
  /** delete_card: the block, its bound declarations, its outgoing arrows and its mark; `removed` adds its proof
   *  material (`proofMaterialOf`), fixed when the tool is called. */
  | { kind: 'delete'; card: string; step: string; why: string; removed: string[]; written?: string }
  /** add_card: a PROPOSITION block in the subject's Inbox module (as the A|P box writes, D-16), with the id telelean
   *  chose (`card`), Claude's sentence and `worded_by: agent`. */
  | { kind: 'card'; card: string; target: string; step: string; sentence: string; why: string; written?: string }
  /** mark_proof_broken: telelean takes out `removed` (the card's `.holds` and its proof material). */
  | { kind: 'proof-broken'; card: string; step: string; error: string; removed: string[]; written?: string }
  /** The origin of a whole-model change that no other entry records (a `card:` Change, a `decl:` vocabulary change),
   *  written at a step's end with `created` (D2-43's rule), never re-derived: Submit's affected inferences read it (§3.10). */
  | { kind: 'changed'; key: string; step: string };

interface SessionInference {
  /** ES-2's switches of the request that added it; its steps, Submit's and Retry's too, copy them into StepScope (D3-42). */
  options?: { wholeModel?: true; mayAddCards?: true };
  /** Derived only (`intermediateInferences`, §3.10; 3c2), never persisted: the target whose step added this card. */
  intermediateOf?: string;
}
interface StepScope { wholeModel?: boolean; mayAddCards?: boolean }

/** Optional (§0): without it the reducer refuses a freeze action, a decision with `freeze`, and their Undo and Redo
 *  (D3-51). An Accept reads its held map from the record (`heldAtJudge`), never from here (R2-5). */
interface ReviewState { freezes?: SessionFreezes }
// ReviewOutcome's ok branch + freezes: SessionFreezes
type ReviewAction = /* slice 2's */
  /** §3.6. `plan`: planFreeze on the records; `values`: for each target it freezes, the value of the judged state the
   *  view shows, computed by the runner. */
  | { kind: 'freeze'; request: SessionFreezeRequest; plan: FreezePlan; values: Record<FreezeKey, OwnValue>; confirmed: boolean }
  /** `violates`: keys whose freeze the Undo/Redo would restore and that the judged state no longer keeps (runner, §5.3). */
  | { kind: 'undo' | 'redo'; step: number; confirmed: boolean; violates?: FreezeKey[] };
// The `decide` ReviewAction + freeze?: { how: 'unfreeze' | 'yours'; keys: FreezeKey[]; items: string[] }: the person's
// choice in §3.7's dialog, with what the runner's check before the write listed (`frozenChangesOf`): `keys`, the listed
// targets and the standing and own holders of listed held names, which the reducer drops or revalues; `items`, item
// holders, whose `frozen` `unfreeze` clears (an accepted one returns to review, FZ-7).
/** + 'answer': answering Claude's question or unfreeze request (UN-5, D3-23). */
type SealBy = 'submit' | 'formalize' | 'retry' | 'answer';
interface SessionFreezeRequest { op: FreezeOp; subjects: FreezeSubject[]; unaccept: boolean }
/** Per key (D3-22, R2-2 of review round 2): only the keys the action changed, each with its standing-cleared flag and its
 *  own freezes. Undo and Redo restore only these keys (§5.3). */
type FreezeDelta = Record<FreezeKey, { cleared: boolean; own: OwnFreeze[] }>;
type SessionAction = /* slice 2's */
  | { id: number; kind: 'freeze'; label: string; request: SessionFreezeRequest; before: FreezeDelta; after: FreezeDelta;
      /** Its un-accepts (§3.6), with the written premises they took out, as `decide` records them. */
      changes: Array<{ item: string; before: ItemState; after: ItemState }>;
      takenOut: Array<{ item: string; card: string; fingerprint: string; ledger: LedgerEntry[] }>;
      commits: string[]; at: string };
// The `decide` SessionAction + freezes?: { before: FreezeDelta; after: FreezeDelta }   (§3.7's decisions); its `request`
// ({ decisions, own }) + freeze?: 'unfreeze' | 'yours' and freezeSubjects?: FreezeSubject[], which Redo re-sends (R2-11).

// ItemDecision is unchanged: §3.7's choice is one per action, the `decideItems` message's `freeze` (§2.5).
// SessionRecords + freezes?: SessionFreezes (optional, §0); PersistedSession + freezes (run.json version 2, additive;
// `recover()` gives an older session one, §5.2)

interface JudgeInput {
  freezes?: {
    /** The session's snapshot minus standingCleared; outside sessions, the file's records. */
    standing: readonly StandingRecord[];
    session?: SessionFreezes;
    /** Step purposes: when Claude's previous tool result was sent (`fresh`, read against `SessionFreezes.madeAt`, §3.4). */
    since?: string;
  };
}
interface StateJudgement {
  /** Optional (§0). For every item in review or accepted, by item key: its held map. Reconcile copies an item in review's
   *  into its record's `heldAtJudge`, which its Accept records in `frozen.held` (§3.7); `recover()`'s upgrade reads the
   *  accepted ones (§5.2). */
  freezeAtAccept?: Record<string, Record<string, HeldValue>>;
  /** Optional (§0). Held declarations, with their holders' labels (the chain marks). */
  held?: Record<string, string[]>;
  // problems' code + 'frozen' (§3.5)
}

// ---- core gate/types.ts
// GateFindingCode: + 'frozen' | 'held';  GateFinding: + freezeKey?: FreezeKey (its target), holders?: FreezeKey[] (`held`),
// fresh?: true (FZ-10: its target, and each holder for `held`, got its reason after Claude's previous tool result:
// `SessionFreezes.madeAt` later than `since`)
// FinalCheckRule: + 'frozen'
// ---- core review/types.ts (where slice 2's backstop types live)
// BackstopInput: + freezes?: { standing: readonly StandingRecord[]; session: SessionFreezes } (optional, §0, but
// applyBackstop refuses without it, D3-51; 3d passes it on every Apply); BackstopRefusal.code: + 'frozen' | 'held' |
// 'other-subject'
```

**Tokens**, each with a board sentence in `describeFinding` and a message for Claude (§3.4): `frozen`: `field`, `keep-empty`, `meaning`, `arrow`, `dependencies`, `mark`, `deleted`, `accepted`, `declaration`, `gloss`; `held`: `changed`, `conflict`; `statement-changed`: `blocks` (a card's field lines after the freeze, §3.10); `existing-changed`: `other-subject` (what another subject's declaration means changed, at any purpose and in every step, §3.5, D3-41): "‹name› belongs to the subject ‹S›: a session changes only its own subject's cards and Lean, so leave it, and what it means, exactly as it was."; and, for a declaration of the session's subject that another subject relies on: "‹name› is used by “‹declaration›” of the subject ‹S›: a session never changes what another subject relies on, so leave it exactly as it was."

### 2.4 Views (types in 3a; built in 3b)

```ts
export type FreezeReasonView = { kind: 'standing' } | { kind: 'accepted'; item: string } | { kind: 'yours'; proposal?: string };
export interface SessionFreezesView {
  /** EN-2's summary line: how the session started. */
  start: { wholeModel: boolean; mayAddCards: boolean };
  /** FZ-11's banner (F16): the mode of the running queue, or else of the last one: whole model when any of its steps' StepScope
   *  has `wholeModel` (Claude may add cards likewise); the start's mode before any queue. */
  mode: { wholeModel: boolean; mayAddCards: boolean };
  /** Every frozen key with its reasons; while the results are hidden, reasons of Results and their parts are left out. */
  frozen: Record<FreezeKey, FreezeReasonView[]>;
  /** Held declarations with the labels of the frozen cards that hold them (FZ-4's chain mark). */
  held: Record<string, string[]>;
  /** While a narrow (preset) step runs: what it may change, from its question and the view's state, never from S₀, so
   *  never from a hidden outcome (§4.5). Null otherwise. */
  open: { target: string; fuzzy: string[]; arrowsInto: boolean } | null;
  /** The end confirmation's and Exit's rows (§4.7). */
  changes: FreezeChangeRow[];
  /** A6: records whose card, declaration or arrow is not in the view's state. */
  notFound: Array<{ key: FreezeKey; label: string }>;
}
export interface FreezeChangeRow {
  key: FreezeKey; label: string; card?: string;
  /** Whole-state (F14): `frozen`: frozen now (any reason) but not standing at the start; `unfrozen`: standing at the start but
   *  with no reason now. A key standing at the start and frozen now has no row, whatever happened in between. */
  change: 'frozen' | 'unfrozen';
  why: string[];
  keep: { apply: boolean; exit: boolean; reason?: string };
}
export interface BoardFreezesView { frozen: FreezeKey[]; held: Record<string, string[]>; notFound: Array<{ key: FreezeKey; label: string }> }
export interface UnfreezeRequestView {
  id: string; step: string; askedAt: string;
  /** Claude's words (AgentText). */
  change: string; why: string;
  /** Row states are derived live from `session.freezes`. `holders`: for a held declaration, the frozen keys holding it. */
  items: Array<{ key?: FreezeKey; name?: string; label: string; card?: string; holders?: FreezeKey[] }>;
}
```
- `SessionView.freezes: SessionFreezesView`; `ItemView.covers: FreezeKey[]` (what its Accept freezes; `[]` on a hidden Result); `Gate` gains `frozen?: FreezeKey[]` (its "Select them" selects those targets).
- **During a step** (F11 of review round 1; slice 2 made both null then): `SessionView.undo` and `redo` name the top freeze action above the newest seal, or are null. The runner posts `session` after every freeze action and its Undo and Redo, so the locks and the Undo button follow at once. A freeze-only change never raises `viewVersion`: the judged state the view shows is unchanged, so a second quick freeze is never refused as stale.
- `SessionViewInput` gains `running?: { step: string; scope: StepScope }` (optional, §0), which `buildFreezesView` reads.
- `StageReportView.requests: Array<UnfreezeRequestView & { ended: 'kept-frozen' | 'cancelled' | 'failed' | 'step-ended' }>`: requests kept frozen, or open when their step ended (RV-10, A3).
- `RunView.pendingUnfreeze?: UnfreezeRequestView`; `TlGraph.freezes?: BoardFreezesView` (graph.json never exports it: FZ-3).
- `ActionOutcome`: the error branch (shared by every code, as in M2) gains `freeze?: { standing?: number; yours?: number; accepted?: number; fillingNow?: Array<{ card: string; field: CardField }>; versions?: Array<{ key: FreezeKey; item: string; label: string; offers: Array<'proposal' | 'yours'>; yoursDisabled?: string }>; frozenChanges?: { rows: Array<{ key?: FreezeKey; name?: string; label: string; holders?: FreezeKey[]; items?: string[] }>; yours: boolean } }` (`frozenChanges`: §3.7's list, `yours` when "keep them frozen at your version" is offered). One `needs-confirmation` carries every list that applies at once (the counts, `versions`, `fillingNow`, RV-5's cascade with its `frozen` items, `frozenChanges`), and resending once with `confirmed` confirms them all (R2-11 of review round 2). The ok branch gains `freeze?: { left: Array<{ label: string; reason: string }> }`.

### 2.5 Protocol (core `protocol.ts`, 3b)

| Message | Payload | Validator rules |
|---|---|---|
| `setFreezes` (action message, ES-9-locked) | `{ op, subjects, confirmed?, requestId? }` | `op` one of the four; `subjects` 1–`LIMITS.freezeSubjects`, distinct by canonical key, never `item`; card ids by `id()`; field names from `CARD_FIELDS`/`VOCAB_FIELDS`; Lean names by a new `leanName()` (1–`LIMITS.leanName`, no control characters); an arrow joins two different cards |
| `sessionFreeze` (run message) | `{ runId, stage, view, op, subjects, unaccept?, confirmed?, requestId? }` | as `setFreezes`, plus `item` subjects (a token, `rev` 0–`LIMITS.revision`); `view` 0–1 000 000 000; `unaccept` only with `unfreeze` or `unfreeze-others` |
| `answerUnfreeze` (run message) | `{ runId, request, answer: 'continue' \| 'keep-frozen' }` | `request` a RUN_TOKEN_PATTERN token |
| `endSession` + | `keep?: FreezeKey[]`, `keepAll?: true` | only with `apply` or `exit`; `keep` ≤ `LIMITS.keepKeys`, distinct, each parsing as a FreezeKey; `keepAll` (F15: every offered row) not with `keep`. The host refuses a key it did not offer |
| `formalize` + | `options?: { wholeModel?: true; mayAddCards?: true }` | only these keys; `true` kept, anything else dropped |
| `decideItems` + | `freeze?: 'unfreeze' \| 'yours'`, `freezeSubjects?` | `freeze` (§3.7's choice, one for the action) only with at least one `declined` decision, `yours` only when every declined decision is a `reject` or `plain`; `freezeSubjects` (FZ-10's "your version") only with exactly one decision, a `reject`, 1–`LIMITS.freezeSubjects`, no `item` |

- Every validator returns a fresh object, drops unknown fields and refuses `__proto__` keys. LIMITS gain `freezeSubjects: 2000`, `leanName: 1024`, `keepKeys: 20000` (F15: after "Unfreeze all other cards" on a subject of 250 cards the rows reach 2,000 keys; Keep all sends `keepAll`).
- `RUN_MESSAGE_TYPES` gains `sessionFreeze`, `answerUnfreeze`; the extension's `ACTION_MESSAGE_TYPES` gains `setFreezes`.
- Host → webview light checks, when present: `graph.freezes.frozen` an array; `session.freezes.frozen` an object and `changes` an array; `run.pendingUnfreeze.items` an array.
- While a step runs, D2-62's refusal list exempts `sessionFreeze` and `answerUnfreeze`, and allows `sessionUndo`/`sessionRedo` when the action they name is a `freeze` action above the newest seal (D3-23).
- While the session is `judging`, in any phase, `sessionFreeze` and the `sessionUndo`/`sessionRedo` of a freeze action are refused (`refused`, "Re-checking the working copy: freeze again in a moment."), so no call waits for a judge (D2-74, D3-8). D2-27 still lets other Undos and Redos through.

### 2.6 Board actions, plans and paths (types in 3a; the planner in 3b)

```ts
// core actions.ts
type BoardAction = /* … */ | { kind: 'set-freezes'; subject: string; op: FreezeOp; subjects: FreezeSubject[]; confirmed?: boolean };
interface EditPlan {
  /** The subject's new freezes.json records; the runner's materialisePlan writes the file (as layout.json). */
  freezes?: { subject: string; records: StandingRecord[] };
  /** Doc widened: only telelean's sidecars change (layout.json, freezes.json): undoable, not snapshotted. */
  layoutOnly?: boolean;
}
// core paths.ts
export function freezesPath(subject: string): string;   // `.telelean/subjects/<S>/freezes.json`
```
- `planAction(set-freezes)` runs `planFreeze` on the file's records (`PlanContext` gains `freezes: Record<string, StandingRecord[]>`). `unfreeze-others` answers `needs-confirmation` with `freeze.standing` unless `confirmed` (D3-25). A card frozen while its id is derived gets its `id:` written in the same plan (`planIdWrites`, §2.9, built on `markup/edits.ts`), which then changes a model file and is snapshotted (D3-16); otherwise the plan is `layoutOnly: true`.
- Labels (Undo toast, History): "Freeze: ‹x›", "Unfreeze: ‹x›", "Freeze all other cards (‹n›)", "Unfreeze all other cards (‹n›)", with ‹x› the card's sentence, "‹card› › ‹field›", the vocabulary name, "‹s› → ‹t›", or "‹n› items". `HistoryActionKind` gains `set-freezes`, with entries in runner `workspace/history.ts` and webview `labels.ts`.
- A6: `delete-node` drops the deleted card's records (its fields, its mark, the arrows into and out of it), and `remove-arrows` those of the removed arrows and marks, in the same plan.
- FROZEN 1 (D3-44, R2-12 of review round 2): `planAction(edit-node)` adds a standing record for the edited field (`naturalName` → sentence, `rationale` → why, `stance`, `source`; an emptied field is frozen empty) to the edit's own plan, unless that field is standing-frozen already; one board step, so Undo takes back both. The edit already writes a derived id (TL112), so the record names a written id. No other board action freezes (new cards, arrows, marks, kind changes, moves: D3-44).
- `.telelean/frozen/` (an unused, gitignored M1 leftover) is not reused. freezes.json is not gitignored: like layout.json, it is the model's own metadata.

### 2.7 RunManager (runner `run/types.ts`)

```ts
freeze(runId: string, r: { stage: number; view: number; op: FreezeOp; subjects: readonly FreezeSubject[];
  unaccept: boolean; confirmed: boolean }): Promise<ActionOutcome>;
answerUnfreeze(runId: string, request: string, answer: 'continue' | 'keep-frozen'): Promise<ActionOutcome>;
// formalize(r) + options?; end(…) + keep?: readonly FreezeKey[], keepAll?: boolean;
// decide(…) + freeze?: 'unfreeze' | 'yours', freezeSubjects?
```
- Both resolve after their run.json write (D2-74); neither waits for a judge or Claude. `freeze` answers `conflict` when `stage` or `view` is not the current one: "What you see changed: look again.", and `refused` while judging (§2.5).
- The host runs both through `enqueueRun`; `finishRun` posts `session` and `run` before `actionResult` for every session message, so a re-enabled control already shows the new state.

### 2.8 Tools, tool results and turns (runner; texts in 3a)

| Tool | Arguments | Core validator | Allowed |
|---|---|---|---|
| `request_unfreeze` (3b, 3d) | `{ items: RequestItem[] (1–20), change, why }` | `unfreezeRequestProblems` | any step; pauses it (§3.9) |
| `remove_arrow` (3c1, 3e2) | `{ source, target, why }` | `removeArrowProblems` | whole model open, before freeze_statements; an arrow of the session's subject |
| `delete_card` (3c1, 3e2) | `{ card, why }` | `deleteCardProblems` | whole model open (or the step's own intermediate), before freeze_statements; a card of the session's subject |
| `add_card` (3c2, 3e3; D3-43) | `{ sentence, why }` | `addCardProblems` | Claude may add cards; before freeze_statements; ≤ 10 per step |
| `mark_proof_broken` (3c1, 3e2) | `{ card }` | `proofBrokenProblems` | whole model open, before freeze_statements; a card of the session's subject |

Each is checked at once; a refusal is the tool result's text, and none counts as a check. Refusal texts (`CLAUDE_FREEZE_TEXTS`):
- subject (D3-41): "“‹c›” is not a card of this session's subject: a session changes only its own subject."
- requests: "‹x› is not frozen: you may change it within this step's limits." · "‹x› is fixed by this step's question, not frozen: unfreezing would not let you change it in this step. Finish, and say in gap what you need; the person can open the whole model." · "‹x› is data telelean keeps: no one can unfreeze it."
- when: "This step's statements are fixed: change the model only before freeze_statements." · "Only with the whole model open." · "Only when the person lets you add cards." · "You may add at most 10 cards in a step."
- arrows: "“‹s›” → “‹t›” is frozen, or “‹t›”'s Dependencies are: ask with request_unfreeze first." · "“‹s›” → “‹t›” is selected by the person's question: it stays." · "A proof in the working copy uses “‹s›” → “‹t›”: it stays." (B.3)
- cards: "“‹c›” has frozen fields, or frozen arrows into it or out of it, or is held: ask with request_unfreeze first." · "“‹c›” is a target of this session, or at an end of a selected arrow or of your arrow: it stays." · "‹name› uses “‹c›”: change or delete that first; if it is another card's proof, mark it broken first."
- proofs: "“‹c›”'s proof is not broken: mark only a proof that no longer builds." · "“‹c›” is a target of this session: prove it, or finish not proved." · "“‹c›”'s proof is held by frozen ‹cards›: ask with request_unfreeze first." (D3-50)

Slice 2's tools change:
- **`propose_arrow`** also refuses an arrow into frozen Dependencies or into a card whose mark is frozen (the text above), and, from 3c1, an arrow whose Remove arrow item the person accepted: "“‹s›” → “‹t›” was removed, and the person accepted that: it may not come back." (RV-4; D3-50: its ledger entry could never pass). It accepts, with the whole model open, an arrow into any unfrozen proposition of the session's subject before freeze_statements (an Add arrow item, not part of a Result), and, with Claude may add cards, arrows into the step's intermediate cards and out of one once it has a `.holds` (exceptions to D2-50's `other-target` and `other-result`; D3-38).
- **`propose_assumption`** refuses a target whose Dependencies or mark is frozen: "“‹T›”'s Dependencies are frozen (or its “follows from nothing” is): ask with request_unfreeze first."; and a target whose Proof is frozen: "“‹T›”'s proof is frozen: a premise could not complete it; ask with request_unfreeze first." (D3-36)

What Claude is told:
- **Tool results** gain `personChangedFreezes?: string[]` while freezes changed since the last one: "The person froze ‹x›: keep it exactly as it was: ‹show›." / "The person unfroze ‹x›: you may change it within this step's limits." A check that failed only on such fresh freezes adds "(The person froze this while you were working; this failure is not counted.)"
- **Turns.** Each step turn and the resume turn gain, after their fixed first lines, "FROZEN BY THE PERSON:" (the frozen targets the step could otherwise change, with their values; with the whole model open, all of them, at most 100 lines, then "and ‹n› more") and "HELD:" (each held declaration and its holders).
- **System prompt** (and `system-prompt-5.1.txt`): "telelean refuses any state that changes what the person froze, or what frozen Lean relies on (held). To change one, call request_unfreeze and wait; never assume the answer." · "freeze_statements only fixes this step's statements; it has nothing to do with what the person froze." (FZ-12) · with the whole model open: "Change this subject's model (cards' sentences, Whys and statements, empty Lean statements, definitions, vocabulary; arrows through remove_arrow and propose_arrow; cards through delete_card) only before freeze_statements. Other subjects' cards and Lean stay exactly as they are, and so does what they mean. If your change breaks another card's proof, mark it with mark_proof_broken; never edit it." · with Claude may add cards: "add_card adds an intermediate proposition before freeze_statements: formalise its statement, propose the arrows into it, prove it, then propose its arrow into the target."

### 2.9 Core functions (signatures; stubbed in 3a)

```ts
// 3a: freeze/value.ts, table.ts, check.ts
export function addressValue(m: ProjectModel, t: FreezeTarget): AddressValue;
export function heldValue(m: ProjectModel, name: string): HeldValue;
/** reach(m, decls, 'meaning') without the roots, each with its held value; memoised per model. */
export function heldMap(m: ProjectModel, decls: readonly string[]): Record<string, HeldValue>;
export interface FreezeTableEntry { target: FreezeTarget; reasons: FreezeReason[];
  expect: Array<{ from: 'base' } | OwnValue | { from: 'item'; item: string }>;
  /** `SessionFreezes.madeAt` of the key, for §3.4's `fresh`. */
  madeAt?: string }
export interface FreezeTable { entries: ReadonlyMap<FreezeKey, FreezeTableEntry>; notFound: FreezeTarget[] }
export function effectiveFreezes(i: { standing: readonly StandingRecord[]; session?: SessionFreezes; items: readonly ItemRecord[];
  drafts: readonly ItemDraft[]; base: ProjectModel; current: ProjectModel }): FreezeTable;
export interface FrozenCheck { findings: GateFinding[]; held: Record<string, string[]>; inexact: string[] }
/** `stepStart` (step purposes only): S₀'s model and computeItems' drafts on it (with the ledger as it was at S₀), memoised
 *  per S₀ commit, for §3.4's two-value rule (F2 of review round 1). */
export function frozenFindings(i: { base: ProjectModel; current: ProjectModel;
  stepStart?: { model: ProjectModel; drafts: readonly ItemDraft[] }; table: FreezeTable;
  drafts: readonly ItemDraft[]; items: readonly ItemRecord[]; since?: string }): FrozenCheck;

// 3b: freeze/plan.ts, needs.ts, view.ts, changes.ts (and `unmeetable` in check.ts)
export interface FreezeBoard { cards: Array<{ id: string; type: NodeType; empty: CardField[]; provisional?: boolean }>;
  arrows: ArrowEnds[]; marks: string[]; vocab: string[] }
export function freezeBoardOf(graph: TlGraph): FreezeBoard;
export interface FreezePlan {
  add: FreezeTarget[]; remove: FreezeTarget[];
  /** Items an Unfreeze returns to review; the reducer adds RV-5's cascade. */
  unaccept: string[];
  counts: { standing: number; yours: number; accepted: number };
  versions: Array<{ key: FreezeKey; item: string; offers: Array<'proposal' | 'yours'> }>;
  left: Array<{ subject: FreezeSubject; reason: string }>;
  label: string;
  /** False: nothing to do (the entry is disabled). */
  changes: boolean;
}
export function planFreeze(i: { board: FreezeBoard; reasons: Readonly<Record<FreezeKey, readonly FreezeReason[]>>;
  op: FreezeOp; subjects: readonly FreezeSubject[]; unaccept?: boolean;
  session?: { phase: SessionPhase; judging: boolean; resultsHidden: boolean; targets: readonly string[]; queueTargets: readonly string[];
    items: ReadonlyArray<{ id: string; rev: number; kind: ItemKind; status: ItemStatus | null; covers: readonly FreezeKey[];
      cards: readonly string[] }> } }): FreezePlan;
/** RV-4: what an Accept of the draft freezes (§3.7). */
export function acceptCovers(d: ItemDraft): FreezeTarget[];
/** The frozen targets inside a Formalize request's exceptions (§3.11). */
export function frozenNeeds(i: { board: FreezeBoard; reasons: Readonly<Record<FreezeKey, readonly FreezeReason[]>>;
  inferences: ReadonlyArray<{ target: string; premises: readonly string[] }> }): Array<{ key: FreezeKey; text: string }>;
/** Called by buildSessionView. */
export function buildFreezesView(i: { records: SessionRecords; judgement: StateJudgement | null; base: ProjectModel;
  current: ProjectModel; resultsShown: boolean; running?: { step: string; scope: StepScope } }): SessionFreezesView;
export function boardFreezesView(m: ProjectModel, subject: string, records: readonly StandingRecord[]): BoardFreezesView;
/** TL112's write-back (D3-16, D3-37; F5 of review round 1): the `id:` line of every derived-id card of the subject in m,
 *  or of `cards` only, as whole-file changes; [] when every id is written already. */
export function planIdWrites(m: ProjectModel, subject: string, cards?: readonly string[]): FileChange[];
/** §3.7 (F6 of review round 1; item-based since round 2, R2-17): what a decision's write would change of frozen content,
 *  from the items it takes out (`out`: restored to B's version) and brings back (`back`), with no planned files and no
 *  Lean job. `drafts`: the stage judgement's; `table`: the table as the action would leave it. An item of `out` lists
 *  each frozen target and held name it owns (§3.7) whose expected value differs from B's (by keys, or `approx` when
 *  inexact, as §3.4 step 2); an item of `back` lists each one it owns, but the keys in `restored` (whose reasons the same
 *  Undo gives back). A held row names its holders: standing and own keys, and `items`, items with `frozen` outside
 *  `out` whose `frozen.held` holds it. `owner`: the item whose take-out or return changes it. */
export function frozenChangesOf(i: { base: ProjectModel; table: FreezeTable; drafts: readonly ItemDraft[];
  items: readonly ItemRecord[]; out: readonly string[]; back: readonly string[]; restored?: readonly FreezeKey[] }):
  Array<{ key?: FreezeKey; name?: string; holders: FreezeKey[]; items: string[]; owner: string }>;
/** §3.8 (R2-7 of review round 2, D3-50): the frozen and held findings the step cannot meet. Their key, or a holder, got
 *  its reason during the step (`madeAt` later than `stepStartedAt`), and either the step's freeze snapshot fixes their
 *  content (declarations in `snapshot.declarations`, or the card's lines in `snapshot.blocks`) while `statement-changed`
 *  passes for it, or one of the step's own live ledger entries (`step`) writes it. */
export function unmeetable(i: { findings: readonly GateFinding[]; madeAt: Readonly<Record<FreezeKey, string>>;
  stepStartedAt: string; snapshot?: FrozenSnapshot; ledger: readonly LedgerEntry[]; step: string }): GateFinding[];
// review/submit.ts (slice 2's planSubmit) input + freezes?: { table: FreezeTable; base: ProjectModel } (optional, §0):
// the take-out's keep set (§3.10, D3-49): 3b for D2-57's take-out, 3c1 for D3-42's.

// freeze/tools.ts: `unfreezeRequestProblems` in 3b; `removeArrowProblems`, `deleteCardProblems`, `proofBrokenProblems` and
// `proofMaterialOf` in 3c1; `addCardProblems` and `intermediateInferences` in 3c2 (D3-43). ToolInput = { current;
// stepStart; scope; statementsFixed: boolean; inferences; ledger; table; held: Record<string, string[]>;
// judgement: StateJudgement; stepIntermediates: readonly string[]; subject: string }
export function unfreezeRequestProblems(i: ToolInput & { items: readonly RequestItem[] }): string[];
export function removeArrowProblems(i: ToolInput & { source: string; target: string }): string[];
export function deleteCardProblems(i: ToolInput & { card: string }): string[];
export function addCardProblems(i: ToolInput & { sentence: string }): string[];
export function proofBrokenProblems(i: ToolInput & { card: string }): string[];
/** `holds` plus the declarations bound to no card, other than definitions, that only `holds` uses in m, transitively
 *  (a greatest fixpoint): the proof material that goes with it. */
export function proofMaterialOf(m: ProjectModel, holds: string): string[];
export function intermediateInferences(inferences: readonly SessionInference[], ledger: readonly LedgerEntry[]): SessionInference[];
```

## 3. The freeze engine and the checks (core; runner where named)

### 3.1 Invariants
- **One table.** At every judged state, `effectiveFreezes` turns the reasons into one table of frozen targets with their expected values, and `frozenFindings` compares the state with it and with the held maps. Nothing is incremental; nothing is repaired.
- **Out of Claude's reach** (FZ-3, S3). freezes.json sits in `.telelean/`, which the shadow never copies into ws/ and which the path guard (`HIDDEN_SEGMENTS`) and G0 refuse; session freezes sit in run.json in VS Code's storage. Claude learns of freezes only from turns and tool results, and every answer about them is computed from the store.
- **Only the person unfreezes** (FZ-6; FROZEN 2, 3). A reason goes only by the person's Unfreeze (or its Undo), the person's own status change of the covering item (a cascade they confirmed included), a dialog choice the person made (§3.7), or the session's end (FZ-8). Reconcile, judges, Claude's steps and requests never remove one (tested as a property).
- **Frozen binds Claude only** (FZ-1). The person's own edits outside a session keep their freezes (a record names a target, not a value), and an edit of a card's sentence, Why, stance or source freezes that field, as a standing freeze in the same board step (FROZEN 1, D3-44); the person's arrow into a card replaces its mark, even a frozen one (A22); deleting a card through telelean drops its records (A6, §2.6).
- **One subject** (D3-41; R2-13 of review round 2), in every step, narrow or whole-model. G0's `outside-subject` file rule (M2, kept by slice 2 at every purpose of a session) refuses any change to another subject's files, new declarations included, so their text never changes. The `other-subject` rule (§3.5) refuses, at every judged state, a change of the session's subject that changes what another subject's declarations mean: their meaningKeys, and the held values of the session's subject's declarations that they reach in B. So no other subject's standing freeze can be broken, although only the session's subject's freezes.json is in the table.
- **The base never moves** (ES-7). Nothing writes freezes.json during a session; kept freezes reach it only at Apply (inside its change set) or after Exit (one board step) (§5.4).

### 3.2 Values (`addressValue`, `heldValue`; 3a)
Each target's value, as canonical JSON hashed with `review/hash.ts`:
- **sentence, kind, why, stance, source:** the block's field lines as G5 reads them; absent is empty.
- **statement:** the binding mode, the bound statement's name, and each bound declaration (the statement abbrev with its docstring mirror; an AXIOM's `.holds`) as `{ name, text (trailing spaces trimmed), meaningKey }`. No binding is "empty": that is keep-empty (FZ-2).
- **dependencies:** the sorted `premises:` entries and `follows_from`.
- **proof:** empty, pending or proved, and the `.holds` text; its `decls` are `[T.holds]`, so its held closure is its type's (FZ-4).
- **vocabulary declaration:** its text without the docstring, its kind and meaningKey (constructors and fields are in meaningKey). **gloss:** the docstring. **arrow, mark:** present or absent.
- `approx` replaces meaningKey with D2-41's fields; `exact` holds when every covered declaration has a meaningKey.
- **`heldValue`** (FZ-4, Appendix B "Held sets", D3-3): a theorem, axiom, opaque or Prop-valued declaration by its type's meaning only; anything else by its text without the docstring (whitespace collapsed), its kind and meaningKey; `absent` when missing.

### 3.3 The table (`effectiveFreezes`; 3a)
- **Standing:** the session's snapshot minus `standingCleared` (outside sessions, the file's records); expected: B's value.
- **Accepted:** each record with `frozen` gives `acceptCovers` of its draft, always, read from `items`, whatever `freezes` holds (D3-51). The targets the item's content owns are checked through the item (§3.4 step 1); the others (a Formalize item's sentence) keep B's value.
- **Yours:** each OwnFreeze, with its value.
- Several reasons on one target make one entry whose `expect` lists every expectation. They agree by construction: once frozen, only the person changes a value, and the person edits only outside sessions, where the value is the file's. If they ever differ, the state must equal each (fail closed).
- **Not found** (A6): targets whose card, declaration or arrow is in neither B nor the state are listed in `notFound`; their expectation stays B's (absent).

### 3.4 The check (`frozenFindings`; 3a)
1. **Accepted items** (F4 of review round 1: checked exactly like an own freeze). Each record with `frozen`: its draft by key exists with `contentKey === frozen.fingerprint` (a Delete's or Remove arrow's draft too, so re-adding is refused, RV-4), else `frozen` (`accepted`); each name of `frozen.held` is checked in step 3 like an own freeze's.
2. **Every other entry.** `addressValue(current)` against each expected value: by exact keys when both are exact, else by `approx`, the names recorded in `inexact`. Tokens: `field`; `keep-empty` (expected empty); `meaning` (texts equal, meaning differs); `arrow`; `dependencies`; `mark`; `deleted` (the target's card is gone); `declaration`; `gloss`.
3. **Held** (FZ-4). Each name's expected held value comes from:
   - roots expected from B: `heldMap(B, decls)`, memoised (B is fixed);
   - own freezes and accepted items: their stored `held` maps.

   Each name is compared with `heldValue(current, name)`, token `changed`. Only names that an entry compares through its own AddressValue (the roots of standing and own entries) are left out. An accepted item's `frozen.held` names, its own included, are always compared, since step 1's content key has no meaningKey (R2-9 of review round 2). Two different expectations for one name give `held` (`conflict`), fail closed. Each `held` finding names its holders, which also feed the views' chain marks. FZ-4's exceptions hold by construction: a target's Proof (a `.holds` holds by its type), an empty statement (no declaration) and Dependencies additions (not Lean) are in no held closure. Slice 5 hook: `heldFields(model, entries)` returns `[]`.
4. **The two-value rule** (step purposes only; F2 of review round 1, D3-5). At step purposes, a frozen target, a held name or an accepted item gives a finding only when its value in the judged state differs both from its expected value and from its value at the step's S₀: the same functions applied to `stepStart` (`addressValue`, `heldValue`, and the content key of the item's draft among `stepStart.drafts`). So a step may leave a difference it found at its start, and may put back the frozen value, but can never move frozen content to anything else. A difference found at S₀ (an earlier step of the same queue changed what the person froze while it ran, a stage problem not resolved yet, a judge's revert) stays a stage problem: at `stage` and `final`, and in the backstop, only the expected value counts.
5. **Fresh** (FZ-10). A finding is `fresh` when the `madeAt` of its target (and of each holder, for `held`) is later than `since`. `madeAt` is set by every freeze action, Undo and Redo that gives a key a standing or own reason (§2.2), so a freeze restored by an Undo during a step is fresh too (F3 of review round 1).

Messages for Claude (`CLAUDE_FREEZE_TEXTS`):
- frozen: "“‹sentence›” (‹id›): its ‹field› is frozen (‹reasons›). Leave it exactly as it was: ‹show›. To change it, ask the person first with request_unfreeze."
- keep-empty: "“‹sentence›” (‹id›): its ‹field› is frozen empty: leave it empty (remove what you wrote)."
- meaning: "‹name› is frozen: its text is unchanged, but what it means in Lean changed (something placed before it, or something it uses, elaborates differently): restore what it meant."
- arrow, dependencies, mark: "The arrow “‹s›” → “‹t›” is frozen: put it back." · "“‹t›”'s Dependencies are frozen: add no arrow into it and remove none." · "“‹t›” is frozen as following from nothing: leave its mark."
- deleted: "“‹c›” has frozen fields, so it cannot be deleted: restore it."
- accepted: "The person accepted “‹label›”: it is frozen as accepted; restore it exactly."
- held: "‹name› is held by frozen ‹cards›: frozen Lean relies on it, so its text and meaning may not change. Restore it, or ask with request_unfreeze (the person can unfreeze what holds it)."

### 3.5 Where it runs (3a)
- **`judgeState`, every purpose** (`JudgeInput.freezes`; the table is built after computeItems):
  - step purposes and `final`: findings join `global` (refusals), at step purposes under the two-value rule (§3.4 step 4, with computeItems on `stepStart` memoised per S₀ commit; for `engine.complete`'s gate, which runs outside any step, S₀ is the `adopt` commit it starts from); at `final`, an `inexact` comparison refuses (rule `frozen`, §2.1), and so does a call without the session's freezes (D3-51);
  - `stage`: findings become `problems` with code `frozen` and the person's text: §3.8's for a change an earlier step of the queue made, and otherwise "“‹label›” is frozen, but the working copy differs from its frozen version (‹item› changed it): unfreeze it, or decline ‹item›." (without the item when none owns the difference). Apply is disabled until they go, Submit is not, and a later queue's steps keep them as they are (§3.4 step 4);
  - `existing-changed` drops its finding for a name that has a `frozen` or `held` finding (one message);
  - `freezeAtAccept` is filled for every item in review or accepted: the held map of the item's own declarations' meaning closure, own names included (§2.3); reconcile copies an item in review's entry into its record's `heldAtJudge` (D3-51).
- **Other subjects** (D3-41; R2-13 of review round 2), at every purpose and in every step, narrow ones too, beside the frozen findings and like them (under the two-value rule at step purposes, problems at `stage`, refusals at `final` and in the backstop), token `other-subject` (`existing-changed`):
  - every declaration of another subject keeps its meaningKey (where both sides have one; otherwise D2-41's comparison, recorded as inexact). G0's `outside-subject` already keeps its text; this catches what a declaration of the session's subject (an instance, a coercion) changes in how it elaborates;
  - every declaration of the session's subject that another subject's declarations reach in B keeps its held value (`heldMap` over those declarations, restricted to the session's subject, memoised: B is fixed).

  The same comparison makes slice 2's step limits exact (FZ-3: a step limit's value is compared in Lean): `existing-changed` compares meaningKey where both sides have one, for every declaration of S₀.
- **Every `judge-apply` write** (F12 of review round 1) runs `frozenFindings` once more, pure and with no Lean job, on the judged models with the store as it is when the write is planned inside the write queue, and replaces the judgement's frozen problems with its result. So a freeze made while the judge's Lean job ran (the last step of a queue had ended, the stage was not open yet) is never missed.
- **The judge's own reverts** ("no longer builds", a failed B.1, B.2 or footprint, slice 2 §3.6) are not asked about: they run, and any frozen or held content they change becomes a stage problem, fail closed (F6 of review round 1). The person resolves it by unfreezing, or by declining the item.
- **Apply's backstop** (never reused): `frozenFindings` on F with the end table, and the `other-subject` rule, codes `frozen`, `held` and `other-subject`; `inexact` refuses as `facts`; a call without `freezes` refuses as `frozen` (D3-51). This fills slice 2 §4.10's hook.
- **What a step may change** = slice 2's scope exceptions ∩ not frozen ∩ not held: a freeze of any reason wins over fuzzy and open (ES-2's "a standing freeze always wins", generalised).
- Outside sessions nothing is checked (Claude works only in sessions); the board's marks come from `boardFreezesView`.

### 3.6 Freeze actions (`planFreeze`, the reducer's `freeze`; 3b, written by 3d)
- **Expansion:** a card → its eight fields (D3-20); its Dependencies cover the arrows into it and its mark, not those out of it (FZ-1). A vocabulary card → declaration and gloss. An item → `acceptCovers` at Claude's proposal (D3-30); hidden Results and their parts are not listed, so never selected. Derived data (CF-7: statuses, bands, Used by, warning arrows) is never a subject.
- **Freeze** adds the view's reason: on the board, `standing`; in a session, `yours`, with the value of the judged state the view shows, unmasked, and its held map, which the runner computes: J during a queue, the stage judgement's commit in a stage, F in confirming. J is the stage judgement the queue started from; during the session's first queue, when there is none yet (stage 0), J is the base commit with the base facts (F12 of review round 1). A value equal to B's whose held map also equals `heldMap(B, decls)` is stored as `{ from: 'base' }`; otherwise as `{ from: 'state', commit, value, held }` (R2-1 of review round 2). So a card whose own text and meaningKey are B's, but which uses a definition a step changed, is frozen with that definition's new version, as the person saw it, and accepting or keeping that change raises no `held` problem. `{ from: 'base' }` is otherwise "your version" (§3.7, FZ-10): B's text and B's meaning.
- **Unfreeze** removes every reason (FZ-7): a standing one leaves the file (board) or goes into `standingCleared` (session); own freezes go; an accepted item covering the target returns to review with RV-5's list (`needs-confirmation` first), only in a stage (D3-7, D3-35); an item in review or to be redone whose `frozen` covers it (D3-4) loses its `frozen`, likewise only in a stage.
- **All other cards** (FZ-9): the containing cards are the selected cards, the cards of selected fields and items, both ends of each selected arrow, marked cards and selected vocabulary cards; the others are every axiom, proposition and vocabulary card of the subject outside them, each as a whole card. Unfreeze all other cards removes standing and own reasons, and accepted ones only with "also un-accept" (`unaccept`, stage only). It always asks first, with the counts (D3-25).
- **Versions** (FZ-10). Freezing a target that an item in review owns offers Claude's proposal (the item stays in review) or your version (the item is rejected, then the target frozen at B's value: one `decideItems` with `freezeSubjects`). By kind: Add, Add arrow, Proof broken, new vocabulary: proposal only; Formalize, Change, changed vocabulary, a shown Result: both; Delete, Remove arrow: yours only ("Freeze and reject the deletion"). When one freeze reaches targets of several items in review, one confirmation lists them all, with every other list the action needs (Filling now, RV-5's, the counts; §2.4), and resending with `confirmed` freezes Claude's proposal for every listed target; "your version" is offered only when exactly one item is involved, and goes through `decideItems` with `freezeSubjects` (R2-11 of review round 2, D3-30). A Delete or Remove arrow among several items is then left (`left`: "Freeze it on its own: freezing it rejects the deletion.").
- **Not freezable** (`left`, with the reason; D3-6): while the results are hidden, every target's Proof, Dependencies and mark; while a queue runs, those of its targets: "“‹T›”'s proof can be frozen once its result is shown."; a provisional card; a "Claude suggests" premise draft that is not accepted ("Accept it first: a suggested premise is not in the working copy.", D3-45); derived data.
- **Phases** (D3-7, D3-8, D3-46). In every phase, while the session is `judging` (a judge runs or is due, or the write queue holds a write), the four actions and the Undo and Redo of a freeze action are refused at once, "Re-checking the working copy: freeze again in a moment.", and the webview disables them with that reason; nothing waits (D2-74, F17 of review round 1).

| Phase | Freeze | Unfreeze standing, own | Unfreeze accepted, also un-accept | Your version |
|---|---|---|---|---|
| step, interrupted | yes, at J | yes | no: "Accepted content is unfrozen by returning it to review, which waits until Claude's step ends." | no: "Rejecting waits until Claude's step ends: freeze Claude's proposal now, or wait." |
| stage | yes | yes | yes, with RV-5's list | yes |
| confirming | yes, at F; while the final check builds F's facts afresh, refused like judging | yes | no: "Back to review first: unfreezing it returns “‹item›” to review." | no |
| applying (seconds, D3-46) | no: "Applying…" | no | no | no |

- **Writes** (3d). In a stage or confirming, a freeze action is a records-only write through the session's write queue, like Accept; an un-accepted written premise is taken out in it (slice 2 §3.8). During a step, ws/ and the item records are untouched (D2-62, D2-63): the runner writes a copy of the session with the new `freezes` through `writeStateChecked`, as one task of the run's chain of run.json writes, and only when that write succeeds sets the in-memory session's `freezes` to it, before the chain's next task runs. Every run.json write builds its text when its task runs, not when it is queued (`RunFiles` takes `() => string`; R2-10 of review round 2): a step write queued while the freeze's write is pending then serialises the session after it, and never puts run.json back without an acknowledged freeze. A writer that needs the file to hold a state before it acts awaits its write first, as slice 2's write queue does at steps 1 and 4; `dispose()`'s write after the one in flight builds its text the same way, and a checked write queued after `close()` rejects. A failed write refuses the action ("telelean could not save the session: ‹error›") and changes nothing in memory, so neither the step's next write nor `dispose()` can persist it (AF11; F11 of review round 1). The step's own later writes carry the new `freezes`, since they write the in-memory session.

### 3.7 Accept and the item's freeze (RV-4, FZ-7; 3b)
- **Accept** (own or group) sets `ItemRecord.frozen` to `{ fingerprint: the record's fingerprint, held: the record's heldAtJudge, at }`, and is refused (`blocked` in a group) when the record has no `heldAtJudge` (D3-51), so its covered targets are frozen: Add: the new card's fields; Add premise: those and its arrow; Add arrow: the arrow; Formalize, Change: sentence and statement plus the changed fields; Result: the proof; Proof broken: the proof, kept empty; Vocabulary: each term, a presupposition with its helper instance; Delete, Remove arrow: nothing, but the item's own check refuses re-adding.
- **It ends** with the person's own status change of the item (a decline, back to review), an Unfreeze that covers it (§3.6), or a cascade of the person's action that changes the item's status, whatever that status. RV-5's confirmation lists every such item, accepted or not, as "frozen: you accepted it" (D2-64's rule while the results are hidden), and confirming clears its `frozen` (R2-4 of review round 2). Reconcile's returns to review (D2-23, RV-11, the defensive RV-5 rule) keep it: the row reads "in review · frozen (you accepted it)" (D3-4). So when the person then rejects a returned definition, its returned dependents are in that one confirmation too, and none is left as a `frozen (accepted)` stage problem. Undo restores it with the rest of ItemState. A written premise's step 4 also sets `frozen.fingerprint` to the written key and `frozen.held` to the written item's `freezeAtAccept` entry from that write's judgement (slice 2 §3.8).
- **Decisions that would change frozen content** (FZ-10, FZ-1; F6 of review round 1, R2-17 of review round 2, D3-48). One rule, from items, replaces a rule for each path. Ownership is total and disjoint (computeItems), and every take-out restores B's version of exactly its items' content (`planItemRevert`), so what a decision's write changes of frozen content follows from the items it takes out and brings back, by meaning, with no planned files and no Lean job. Before the runner enqueues a decision's write, it runs `frozenChangesOf` on the stage judgement's drafts, with the table as the action would leave it:
  - an item the write **takes out** (a decline and its cascade, DO-0's included; a premise take-out; the Undo of an un-reject, or of a written premise's Accept) lists each frozen target and held name it owns whose expected value differs from B's. An accepted item's own content goes only with the item itself, which RV-5's confirmation asks about (it lists every `frozen` item the cascade changes, above), so its targets never appear here; only its `frozen.held` names count, and only for an item outside the cascade (an `items` holder, which itemDeps' walk normally puts in the cascade);
  - an item the write **brings back** (un-reject, the Undo of a decline) lists each frozen target and held name it owns, but the keys whose reasons the same Undo restores from the action's recorded `freezes` (`restored`).

  An item owns: a `card:<c>` item c's fields (a Delete also c's arrows out and its mark); a `proof:<c>` item c's Proof; an arrow, Remove arrow or premise item its arrow and its target's Dependencies (a premise item also its target's mark, its new card's fields, and, while its completion is written, its target's Proof); every item the vocabulary entries and held names among its `provides.decls`. Then:
  - **a decline** (Reject, plain, DO-0, with their cascades) whose list is not empty answers `needs-confirmation` with `freeze.frozenChanges`, in the same dialog as RV-5's list when there is one: "These are frozen and would change: ‹list›." [Unfreeze them and decline] [Keep them frozen at your version] [Cancel]. The person's choice comes back as the message's `freeze`. `unfreeze` removes, in the same action, every standing and own reason of the listed targets and of the listed held names' holders, and clears `frozen` on a listed item holder (an accepted one returns to review, FZ-7). `yours` revalues those own freezes as `{ from: 'base' }`, which is what the decline restores; it is offered when every declined decision is a Reject or plain and no row is held by an item, and if a listed freeze's held map still differs from B's afterwards (it rests on another change that stays), the next judge shows that as a stage problem, fail closed. The decide step records `freezes: { before, after }`, so Undo restores both. This is FZ-10's "Rejecting an item whose proposal you froze first asks whether to unfreeze it", and it also covers a cascade that reaches content the person froze, through any reason but an accepted one;
  - **a Shaky decline** changes no file and no freeze: what the person froze of the item stays frozen, and Claude reworks the rest at Submit, where the take-out leaves frozen content in place (§3.10, D3-49). So "decline it Shaky, but keep this field" works whichever the person does first; round 1's "[Shaky and unfreeze it]" dialog is gone;
  - **un-reject, back to review of a written premise, and the Undo or Redo of a decision**, whose list is not empty are refused: "‹list› is frozen (or held by frozen ‹cards›) and would change: unfreeze it first, or decide it by hand." Refusing is the simpler sound choice here: the person can unfreeze, then repeat. A Redo of a decline re-sends its recorded `freeze` choice (§2.3), so the check runs again and that choice applies to what it lists then; a Redo without one is refused when the list is not empty;
  - **the judge's reverts** are not asked about: they become stage problems (§3.5).

  The check reads the stage judgement's drafts and the table at the moment of the decision. If a write queued ahead of it moves the head (D2-27 lets decisions queue while judging), whatever more the write then changes is caught by the next judge's frozen check as a stage problem, fail closed.
- **An Add premise's Accept** (RV-1, AR-5, D3-36) is gated, with `Gate.frozen` (Select them), when its target's Dependencies or mark is frozen: "“‹T›”'s Dependencies are frozen: unfreeze them to accept this premise."; and when its target's Proof is frozen while the target is not proved in the stage judgement, since the Accept's completion would write it (F6): "“‹T›”'s proof is frozen: accepting this premise completes it." A due premise write or completion whose own judgement (`writePremise`, `complete`, both with the freezes) has a frozen or held finding fails like a write that could not be made: nothing of it is kept, and the stage gets the problem "“‹item›” was accepted, but writing it would change frozen ‹x›: unfreeze it, or decline the item.", fail closed (a freeze cannot interleave, since freezing is refused while the write queue holds a write, §3.6).

### 3.8 Freezing while Claude works (FZ-10, D3-5; runner in 3d)
- **The version you see.** A freeze during a queue keeps J's value, the state the person sees (D2-63; the base during the session's first queue, §3.6); `sessionFreeze.view` must equal `viewVersion`.
- **Claude is told** in its next tool result (`personChangedFreezes`), and the next turn's FROZEN section has it.
- **Checks.** Every later check, freeze, gate and the queue's end judge it. A gate that fails only on fresh findings is not counted as an attempt (`toolFinish` skips the count when every blocking finding is fresh, D3-19). After the gate passes, the finish runs `frozenFindings` again with the store as it is then, so a freeze made during the gate's Lean job is never missed; a finding fails the finish like a failed gate, counted unless fresh. The queue's end judge cannot miss one either (§3.5).
- **Rollback** (F3 of review round 1). A step during which any freeze action, Undo or Redo gave a key a reason (some `madeAt` later than the step's start) rolls back to S₀ when it gives up, not to `lastCommitSince`: a passing commit made before the freeze may hold Claude's change to the target, while at S₀ every target has J's value or a difference the step found there (§3.4 step 4).
- **A freeze the step cannot meet** (R2-7 of review round 2, D3-50). Some freezes made during a step cannot be met by any state the step may still reach: content its freeze_statements fixed (`statement-changed`, with `FrozenSnapshot.blocks` in whole-model steps, refuses changing it back), and content one of its own live ledger entries writes (every normalise re-applies an `unarrow`, `delete`, `proof-broken` or `arrow` entry, and Claude cannot withdraw one). At every check, freeze, gate and finish, core's `unmeetable` picks the frozen and held findings whose key, or a holder, got its reason during the step (`madeAt` later than the step's start) and that the step's freeze snapshot fixes, with `statement-changed` passing for them, or that one of the step's own live ledger entries writes. If there is one, the step ends at once as given up, not counted, rolled back to S₀ (above); its Result reads not proved, with "You froze ‹x› after Claude's step had already changed it." (shown as any outcome is, RV-6), and the queue goes on. Any other freeze made during a step costs Claude only the uncounted check (D3-19). `propose_arrow` and `mark_proof_broken` refuse at once the two entries that could only end this way (§2.8).
- **Earlier steps of the same queue.** The two-value rule (§3.4 step 4) lets a step leave a difference an earlier step of its queue made to what the person froze while the queue ran, so the step is not blamed for it; it may not change that content further. At the queue's end the stage gets the problem "“‹label›” is frozen at the version you saw when you froze it, but Claude's step for “‹T›” had already changed it: unfreeze it, or decline ‹item›.", with ‹item› and ‹T› taken from the item that owns the difference (its `origin`), and Apply waits until the person resolves it (a Reject restores B's version, which resolves it when B's is the frozen one). Later queues keep it as it is under the same rule, so their steps do not fail on it. D3-6 keeps Results' parts out of this, so the problem never names hidden content.
- **Filling now.** Freezing an empty field that the running queue may fill first asks (the runner's `needs-confirmation` with `fillingNow`, passed on by the host): "Claude may be filling “‹card›” › ‹field› now. Freeze it empty? Claude will be told that it must stay empty." Such a field is an empty Lean statement at a selected arrow of the queue; and, while any step of the queue has the whole model open, any empty Lean statement, Why, stance or source of a card of the subject (F8 of review round 1). The rule reads only the queue's StepScopes and J, never what Claude did. The dialog adds: "If Claude has already fixed its statements, its step ends without a result." (D3-50).
- **Unfreeze** during a step: Claude is told, and may then change the target within its step's limits. Accepted content waits for the step's end (D3-7).

### 3.9 Unfreeze requests (FZ-5; runner in 3d; D3-9, D3-24)
- `request_unfreeze { items, change, why }` is checked by `unfreezeRequestProblems` (§2.8's refusals): every item must be frozen or held now; CF-3 data never; a target that only the step's limits fix is refused with its text.
- The step pauses as for ask_user: `run.p.pendingUnfreeze = { id, args, askedAt }`, state `waiting-for-answer`, the agent clock paused, the same abort listener; at most one question or request is open at a time.
- `RunView.pendingUnfreeze` shows it; each row's state comes live from `session.freezes`: frozen (with its reasons), "held by ‹cards›", "no longer frozen", or "accepted: unfreeze it after this step ends" (D3-7).
- **Continue** answers `{ answer: 'continue', unfrozen, stillFrozen, note }`, computed from the table then, never from the button; a held item counts as unfrozen once nothing frozen holds it. **Keep frozen** answers `{ answer: 'keep-frozen', unfrozen: [], stillFrozen: all }` and is enabled only while every requested item is still frozen or held, so Claude is never told something false.
- **Select them** selects the requested targets and, for a held item, the frozen targets that hold it; the person then chooses Unfreeze in the Context Menu (FZ-6: mechanical).
- Answering seals the session stack (`answer`; UN-5, D3-23) and records the answer in `SessionFreezes.requests`; after a reload it is delivered with Resume, as answers are today.
- A request still open when its step ends (cancel, cap, failure) is recorded `withdrawn` and listed in the stage report (RV-10), with the requests the person kept frozen (A3).
- No "Allow this change" (D3-9): to let Claude change a held X, unfreeze what holds X. X's item then lists the statements that rely on it, as every definition change does ("Your statements rely on it", slice 2 §5.6). The cost, which the user guide states (F13 of review round 1): unfreezing a holder A also lets Claude rewrite A itself, and freezing A again holds X again, so "keep A's words but let X change" cannot be expressed; the person reviews A's rewrite as an item and can Reject it.

### 3.10 The whole model open, and new cards (ES-2's switches, D2-12; core in 3c1 and 3c2, runner in 3e2 and 3e3)
- **Switches.** `formalize.options` is stored on the request's inferences (`SessionInference.options`). Every step of such an inference copies them into its StepScope: its Formalize steps, its Submit steps and its Retry steps (D3-42). A mid-stage Formalize carries its own; the webview resets them when the session ends (D3-29).
- **Submit's take-out keeps frozen content** (R2-3 of review round 2, D3-49), in every Submit queue, narrow or whole-model. A take-out restores B's version of its items with no frozen check of its own, so `planSubmit` (given the table, §2.9) leaves in ws/ every item of the take-out that owns a frozen target or held name whose expected value differs from B's (§3.7's rule: `frozenChangesOf` with the take-out as `out`, each row's `owner`), and every item of the take-out that such an item depends on (itemDeps, transitively), so that what it rests on stays too. A kept item stays open to its own step (`openItems`), where every freeze wins (§3.5); the feedback turn quotes its frozen part under SHAKY (or TO BE REDONE) as "kept: the person froze it". The frozen part's held names keep what it rests on fixed, so D2-57's reason for the take-out does not arise for that part; the kept item's unfrozen parts stay fixed for the other steps of the queue (the limits below), which must then keep to them.
- **Submit with whole-model steps** (D3-42; F7 of review round 1). When any step of a Submit queue has `wholeModel`, `planSubmit` takes out every Shaky or to-be-redone item still in ws/, not only those D2-57 names, but those D3-49 keeps, in the same `submit-take-out` write: each becomes to be redone, reverted, and a Shaky one keeps its decline, note and DO-3 set. A whole-model step may change anything unfrozen, so no kept content of another step is left for it to break (but what D3-49 keeps, whose unfrozen parts stay fixed for it, below), and each item's own step proposes it again, with the tools if needed. D2-15 still holds for a Shaky set: no splits or merges of the declined cards.
- **Origins** (D2-43's rule, extended). An item whose content no `created`, `arrow`, `unarrow`, `delete`, `card` or `proof-broken` entry records (a `card:` Change, a `decl:` vocabulary change) takes its origin from a ledger `changed` entry. The run.json write that ends the step that first changed it writes that entry, beside `created`, and nothing re-derives it. Submit's affected inferences read these origins, so a Shaky Change is reworked by a step of the inference that made it.
- **Step limits with `wholeModel`** (relative to S₀) fix only:
  - every theorem of B other than the step's target's `.holds` (non-target proofs and their lemmas), except the removals that this step's own ledger `delete` and `proof-broken` entries record (telelean's own take-outs);
  - the declarations of other inferences' Results (proof material);
  - Claude's ledger arrows, premise drafts and written premises of other targets;
  - the content of items declined Shaky (and, from slice 4, Transform), except this step's own `openItems` (R2-8 of review round 2): RV-9 counts them as frozen for a mid-stage Formalize; in a Submit queue they were taken out first (above), but for those D3-49 keeps, so a Submit step reworks only its own;
  - everything outside the session's subject (D3-41; F1 of review round 1), as in every step: G0's `outside-subject` keeps the text of every file whose `subjectOfPath` is not the session's (other subjects' root files and module directories, the library root), and the `other-subject` rule (§3.5) what their declarations mean, a change in the session's subject that would change it included. Other subjects' vocabulary may be referenced and held, never changed (TR-10);
  - CF-3 data (G5); B.3; B.4.

  Everything else may change, subject to the frozen and held check (§3.4).
- **G5 in whole-model steps** allows the `natural_name`, `rationale`, `stance` and `source` lines of existing cards of the session's subject, and the text of their bound statement declarations (never the binding or pin). Normalise writes `worded_by: agent` when a sentence changed (CF-6).
- **Empty Lean statements** (ES-2; F8 of review round 1). A whole-model step's `fuzzyStatements` are every card of the session's subject whose Lean statement is empty at S₀ and not frozen (keep-empty wins, FZ-2), not only those at the selected arrows, and normalise pins them as it pins any fuzzy statement. So with the whole model open Claude may formalise any empty statement that is not frozen, before freeze_statements, as §4.8's ▾ text promises.
- **Ids** (D3-37; F5 of review round 1, R2-6 of review round 2). Every derived-id card of the session's subject gets its `id:` in ws/ from the session's `ids` commit, after `base` and before the first `step-start` (§1.1's 3e1), for every session, since a later mid-stage Formalize may open the whole model and kept freezes need written ids. On its own an id write-back is no difference (2a1's V2A1-C1), but 2a1 attaches it to the card's Formalize or Change item when the card has another change, so reverting that item to B's lines would take the `id:` out again. So every revert (`planItemRevert`: a decline and its cascade, Submit's take-out, the judge's reverts) restores B's version of a block with its derived `id:` written (`planIdWrites`' text), and removes an `id:` line only with its card (an Add's revert); the inverse merges then never meet a removed one. Content keys are unchanged. So a sentence change never changes a card's identity, and F holds every id, which keeps Apply's backstop on exactly F (§5.4).
- **After freeze_statements** (D3-12): the freeze snapshot also records the card blocks (`FrozenSnapshot.blocks`), `statement-changed` (with meaningKey) covers every declaration, and the tools refuse. So the proof phase changes only the target's and its intermediates' `.holds`, new proof material, and telelean's ledger writes: every visible change is made before Claude tries a proof (RV-6).
- **Ownership** (computeItems): card field changes → `card:<c>` Change; a ledger `delete` → `card:<c>` Delete (block, bound declarations, `removed`, outgoing arrows, mark); a ledger `unarrow` → `unarrow:<s>><t>`; a ledger `card` → `card:<I>` Add plus `proof:<I>` Result (3c2); a ledger `proof-broken` → `proof:<c>` Proof broken (`removed`); a removed existing declaration bound to no card that is not a theorem → `decl:<n>` vocabulary change with absent content. Anything else stays unowned. A `card:` item may turn from Formalize into Change, or into Delete, within a session, so reconcile's new version of a `card:` record also takes its draft's `kind` (slice 2 fixes it at creation; F21 of review round 1). A `proof:` item never changes kind (D3-47).
- **Live ledger entries.** An `unarrow`, `delete`, `card` or `proof-broken` entry counts while its item's content belongs in ws/: not declined by Reject or plain, and not to be redone with its content taken out. Normalise writes only those (the runner passes it the live entries), and judgeState's ownership and B.3 and the backstop read only those, as slice 2 reads arrow entries "whose item is not declined". Un-reject makes an entry count again. So a take-out (a Reject, a cascade, Submit's take-out, the judge's revert) is never redone by the next normalise, and a step that wants the change again calls its tool again, which makes a new entry.
- **Intermediate cards** (3c2; D3-13, D3-43). `intermediateInferences` derives one inference per ledger `card` entry: `intermediateOf` its step's target, judged before it, with an empty question (E(I), the ledger arrows into I, gives its permitted set), ended with its parent's step, never persisted in `inferences`. B.1, B.2, footprint and RV-5 apply to it as to any inference, and its Result is hidden like any Result. The step's gate runs the comparator for each proved intermediate as for the target, each with its own permitted set. It may end unproved; it then has no `.holds`, so no target can use it (A25).
- **Classes, dependencies, DO-0** (2a2's classify and deps are generic): Change and Delete are c1, and Proof broken joins c1; an intermediate's Add is a statement item, arrows into it are c4; Remove arrow has no class. Rule 5 ("mentioned before") now also covers Proof broken, so a change that broke a proof waits for that Proof broken item, and its Reject takes the change out with it. Declining an arrow item at an intermediate card's end also declines (Reject) that card's Add and its items, in the same action (DO-0; 3c2).
- **`planItemRevert`:** Delete → B's block (with its `id:`, Ids above), declarations, arrows and mark back; Remove arrow → the entry back; an intermediate's Add → the card, its declarations and its arrows removed; Proof broken → `removed` back with B's text; a field Change → B's lines, but its `id:`.
- **Proof broken** (D3-10, D3-47): Accept → the card loses its proof (unproved, never pending; own Accept, c1), and slice 2 §5.6's disabled Accept goes; Reject → B's proof back, with RV-5's cascade. A mid-stage Formalize may not target a card that has a Proof broken item in this session, whatever its status (`formalizeStartProblems`, a new session check; `FormalizeSession.proofBroken`): "“‹c›”'s proof broke in this session: re-prove it after the session ends (Apply, then Formalize for dependencies)." So `proof:<c>` is a Result or a Proof broken item for the whole session, never one then the other (F21 of review round 1). `mark_proof_broken` already refuses a target. "Make it pending" waits for slice 4.
- **The tools' rules** (`freeze/tools.ts`; texts in §2.8; D3-14), all on cards and arrows of the session's subject only (D3-41):
  - `remove_arrow`: only an arrow of B into a proposition, not selected by any question, neither the arrow nor its target's Dependencies frozen, and its source not in direct(target) on the step's current state (B.3);
  - `delete_card`: only a card of B or this step's own intermediate; not a target nor at an end of a selected arrow or a ledger arrow; no frozen field, no frozen arrow into or out of it, not held; nothing outside its own declarations and `proofMaterialOf` uses it;
  - `add_card` (3c2): a PROPOSITION worded and originated by the agent, in the subject's Inbox module, with an id telelean writes;
  - `mark_proof_broken`: a card that is not a target, whose `.holds` is an unchanged theorem of B with a Lean error in the last check, its proof not frozen and its `.holds` not held (D3-50); telelean takes out `proofMaterialOf(current, ‹c›.holds)`, so a lemma shared by two broken proofs goes with the second.
- **The backstop** re-derives the new kinds' ownership from B, F and the live ledger entries; `kind` refuses an intermediate that is not a PROPOSITION.
- **The base mask** (slice 2 §4.7; F19 of review round 1). `dropArrows` becomes the ledger arrows whose item is part of a Result (into a target, or, from 3c2, into an intermediate). A whole-model arrow into another proposition (D3-38) is a listed item that can be decided while the results are hidden, so it stays on the board (a twin test in 3c1). The third bullet needs no change: a same-text declaration's meaning can now change only through statement-phase items, which are visible (D3-12, and `statement-changed` with meaningKey, keep the proof phase from changing it). An intermediate's `.holds` and arrows are Result content and are dropped as a target's are (`holds`: absent in B, so absent; 3c2).

### 3.11 Formalize with frozen content (ES-2, FZ-1; 3b, 3g)
- `frozenNeeds` lists the frozen targets inside a request's exceptions: "Claude cannot prove “‹T›”: its proof is frozen."; an empty Lean statement at a selected arrow frozen empty; a target's frozen Dependencies or mark.
- The webview shows them before posting: "These stay frozen, so Claude cannot change them: ‹list›. Claude may ask you to unfreeze them while it works." [Formalize anyway] [Cancel] (D3-18). The person unfreezes them first in the Context Menu to lift them.

### 3.12 FZ-12, and the hooks
- **FZ-12** (3d runner, 3g webview): user-facing "statements frozen" becomes "statements fixed": the shadow commit label "Statements fixed (round N)" (seen in revert notices); the activity lines "freeze_statements: statements fixed (round N)" and "statements fixed again with it selected"; `TOOL_TITLES.freeze_statements` "Fix statements"; the tool's result "Statements fixed. Now prove them unchanged."; the G4 tooltip ("…the one fixed before the proof"); the user guide; the activity icon becomes `milestone`. The tool keeps its name (D3-17); tests grep user-facing texts for "statements frozen".
- **Slice 4:** the reasons `session-start` and `transform`; a `revalue` freeze op (TR-15: the person's own change to frozen content becomes its value); `SessionFreezes.start` gains the transform mode; D2-15 stays (no Shaky splits). **Slice 5:** `heldFields`.

## 4. The UI (webview; 3f, 3g)

### 4.1 Principles
- **The host owns the freeze state.** The webview renders `graph.freezes` (standing, on the Current view) and `session.freezes` (on the Proposed view, the review panel, dialogs, the end confirmation, request cards), and previews rules with the same core functions the host enforces with (`planFreeze`, `frozenNeeds`).
- **Not optimistic.** A lock appears or goes only when the host's graph or session shows it; the pressed control shows a spinner until `actionResult` (`freezeBusy`).
- **Never without a gesture.** No code path posts `setFreezes` or `sessionFreeze` on its own; FZ-8's restore is the host's.
- **Routing** (UN-1, ES-9): no session → `setFreezes` (board stack); a session, on the Proposed view or with the focus inside `data-undo-scope="session"` → `sessionFreeze` (session stack); a session, on the Current view → disabled, "During an edit session your files can't change: freeze on the Proposed view."; another subject's board during a session → slice 2's RunElsewhere text; phase applying → "Applying…".
- **RV-6 by construction:** the host builds the freeze views on the view's model; no reason, row or label comes from a hidden Result or a Result's part.

### 4.2 Selection (CM-2, CM-7; 3f)
- New state (`state/freeze.ts`): `selectedFields: FieldRef[]` (`{ card, field } | { vocab, field }`) and `selectedVocab: string[]`.
- Gestures: a field's lock slot, or Alt-click on the field, selects it; a vocabulary item's header selects it (its chevron still opens it); Ctrl adds; a plain click elsewhere replaces the selection; Esc clears every kind; the selection rectangle selects cards, arrows and marks only.
- Right click (CM-7): on a lock slot, or with Alt on a field, the field's menu; on a vocabulary item, its menu; elsewhere as today. Shift+F10 on a focused lock slot opens the field menu.
- Review items keep 2g's checkboxes. Freeze actions act on the board selection when it is not empty, else on the selected items (D3-34); the summary says which. `selectionSummary` gains "2 fields", "1 field: “‹card›” › Lean statement", "1 vocabulary card: ‹name›", "3 review items".
- **In the review item detail** (3g; F13 of review round 1): each field row (a Change's `FieldChangeView` rows, an Add's fields, a Formalize's statement) and a declaration item's code and gloss get the same lock slot, which selects `{ card, field }` or `{ vocab, field }` as on the board. So a single field shown only in a detail can be frozen or unfrozen too, not only the whole item (D3-30). A hidden Result's detail has none (D3-6).
- `applyGraph` and the `session` handler drop selected fields and vocabulary that no longer exist.

### 4.3 The four actions (FZ-9, CM-3; 3f)
- The Context Menu section and every right-click menu (cards, fields, vocabulary items, arrows, marks, items) show a group of four: Freeze (`lock`; "Freeze (keep empty)" when every selected field is empty), Unfreeze (`unlock`), Freeze all other cards (`lock` with a `layers` badge), Unfreeze all other cards (`unlock` with `layers`). They show whenever the selection holds anything freezable, disabled with the reason on hover (CM-3), from `planFreeze` on the view.
- Reasons (`FREEZE_TEXTS`): "Already frozen." / "You froze it already."; "Not frozen."; "Every other card is frozen already." / "No other card is frozen."; §4.1's context texts; `MENU_PROVISIONAL`; §3.6's target and judging texts ("Re-checking the working copy: freeze again in a moment." while `session.judging`); "Accept it first: a suggested premise is not in the working copy." (D3-45)
- `freezeSelection(op)` previews, then opens the dialog or posts; `confirmFreeze(answers)` resends once with `confirmed` and the choices; Cancel posts nothing; `Pending` gains `{ kind: 'freeze' }`, so a host `needs-confirmation` reopens the dialog.

### 4.4 Dialogs (3f)
- **Unfreeze all other cards**, always (D3-25): "Unfreeze ‹N› other cards?", with "This removes ‹n› standing freezes (made outside a session).", "‹m› of your freezes from this session", and in a stage the tick "Also un-accept: ‹k› accepted items return to review (with what depends on them)", off by default.
- **Unfreeze of accepted content:** slice 2's cascade dialog, lead-in "Unfreezing returns these accepted items to review:"; while the results are hidden, D2-64's sentence and rule.
- **Versions:** "“‹card›” has an item in review: ‹label›. Freeze which version?" [Claude's proposal (the item stays in review)] [Your version (rejects ‹label›)], the second disabled during a step with §3.6's text. With several items: "These have items in review: ‹labels›. Freezing keeps Claude's proposals, and the items stay in review." [Freeze Claude's proposals] [Cancel] (R2-11). A freeze's dialog shows every list its `needs-confirmation` carries, one under the other, with one confirm button.
- **Filling now:** §3.8's text, [Freeze it empty] [Cancel].
- **Decisions over frozen content** (§3.7, D3-48), from `freeze.frozenChanges`: a Reject or plain decline (DO-0 and the cascades too): "These are frozen and would change: ‹list›." with each row's label, and "held by “‹A›”" for a held declaration; [Unfreeze them and decline] [Keep them frozen at your version] (only when `yours`) [Cancel]. When every row is Claude's proposal of one item that the person froze, the lead reads "You froze Claude's proposal of “‹card›”. Rejecting restores your version." RV-5's list, in the same dialog, also names the items with `frozen` that are not accepted (returned to review by telelean), each "frozen: you accepted it" (R2-4). A Shaky decline asks nothing about freezes (D3-49). A refused un-reject, Undo or Redo shows its text as a toast, with [Select them].
- **Formalize with frozen content:** §3.11. **Stage problems** (§3.8) show in the session bar's second lines with [Select it] and [Show item] (3g).

### 4.5 The look (FZ-11; 3f, the banner and marks in 3g)
- **Colour** `telelean.frozen` in `contributes.colors`: "The aura and locks of frozen cards, fields and arrows (Claude may not change them). Never blue or green: those mean formalised and proved." Defaults, rose (D3-26): dark #F07CB8, light #B4236E, hc #FF8FD2, hcLight #9E1A5F. board.css: `--tl-frozen: var(--vscode-telelean-frozen, #e070b0)`. The theme test's whitelist and `diagnostics.ts themeColors` gain it.
- **`model/freezeLook.ts`** (pure): `cardFreezeLook(node, source)` → `{ whole, fields, keptEmpty, dependencies, held, title }`; the source is the board's (standing) or the session's (every reason shown, none from a hidden Result).
- **Aura:** a child `<span class="tl-card__frost" aria-hidden>` (`inset: 0`, `pointer-events: none`, `box-shadow: inset 0 0 0 2px var(--tl-frozen), inset 0 0 10px 1px color-mix(in srgb, var(--tl-frozen) 40%, transparent)`), so it combines with the outer glows and diff halos; only when every field of the card's kind has a reason (`whole`). Never dashing or translucency; not `::after`, which the drop edge uses.
- **Locks:** a card lock badge next to the kind glyph when whole, else a chip "🔒 ‹n›" (`tl-chip--frozen`). Field lock slots (`board/FieldLock.tsx`, 14 px buttons): a closed lock in `--tl-frozen` when frozen, else an open lock shown on hover or focus-within (`opacity`, still focusable); a click selects, never freezes (D3-28). Slots: sentence and Why on the face; Kind, Stance, Source, Lean statement, Proof and Dependencies ("Depends on") in the details; declaration and gloss on vocabulary items.
- **Keep-empty:** "— kept empty 🔒" on an individually frozen empty field (a wholly frozen card shows only the aura).
- **Review list** (3g): a row shows a lock when a target of its `covers` has a reason; the item detail shows, under Accept, RV-4's hint "Accepting freezes: ‹fields›" (Delete, Remove arrow: "Accepting freezes nothing, but Claude may not re-add it"), and after the Accept "Frozen while accepted: ‹fields›"; a gate with `frozen` offers Select them.
- **Arrows and marks:** EdgeEngine badges through 2h's `setBadges`: `{ kind: 'lock'; edge }` at the path's midpoint, `{ kind: 'lock-mark'; card }` at the ∅ stub's, `{ kind: 'deps'; card }` at the card's left edge above its topmost arrival slot; an SVG padlock stroked in `--tl-frozen`, beside a "+"/"−" badge when both apply, no pointer events. Frozen Dependencies also get the chip "dependencies frozen".
- **Held** (FZ-4): a `link` glyph and "held by “‹A›”" ("and ‹n› more") in descriptionForeground on vocabulary items and statement fields, never in the frozen colour.
- **High contrast:** `.tl-card__frost` hidden; a "frozen" chip; badges outlined with contrastBorder.
- **Legend** `frozen`: "Claude may not change it: a lock on frozen fields, arrows and marks; a whole frozen card also has an inner aura in its own colour. “held by …”: frozen Lean relies on it, so Claude may not change that either."
- **Session banner** (3g; 2g's SessionBar, a second line, both views): by `freezes.mode`, the mode of the running queue or else of the last one (F16 of review round 1: a session started narrow can run a whole-model Formalize later, and the reverse), "Only empty Lean statements at the selected arrows, the targets' proofs, and new arrows into the targets may change" or "Whole model open: only your own freezes and the selected arrows are kept", then "· ‹n› frozen by you · ‹k› standing". `start` feeds only EN-2's summary line. Standing and own freezes keep their aura; accepted content shows field locks (D3-27).
- **May change** (3g; only while a narrow step runs, from `freezes.open`): chips with `codicon-sparkle`: "Claude fills this" (fuzzy), "proof open" (the target), "arrows may be added" (unless its question is the mark).
- **A6:** a header chip "Frozen items not found (‹n›)" lists them, with [Unfreeze these] (one action).

### 4.6 Request cards (FZ-5; 3g)
- `run/UnfreezeRequest.tsx`, with Claude's pending questions in RunPanel, inside `data-undo-scope="session"`; the panel opens itself; RunBadge: "Edit session: Claude asks to unfreeze · ‹subject›".
- "Claude asks to change frozen content (step ‹i› of ‹n›: “‹T›”)", Claude's change and why, one row per item (state from `session.freezes`), and [Select them] [Continue] [Keep frozen] (§3.9); Continue's tooltip lists what it will report.
- Requests left open when their step ended show in the stage report, with Select them.

### 4.7 The end confirmation and Exit (FZ-8, EN-2; 3g)
- A section "Freezes after the session": rows from `session.freezes.changes` grouped by card, each with a [keep] tick ("stays frozen (standing)" / "stays unfrozen"), "Keep all", and the line "Claude's step limits end with the session; your other freezes return to how they were." Rows link to the board and are selectable.
- Ticks default off (D3-33), are kept in the webview state per runId (ES-6) and are sent as `endSession.keep`; with every row ticked ("Keep all", or one by one), the webview sends `keepAll` instead (F15). The host refuses a key it did not offer.
- The Exit dialog (D2-36) lists the same rows with the Exit ticks only; a row whose `keep.exit` is false reads "Claude's proposal is not in your files".
- After Apply: "Applied: the session's changes are in your files. One Undo takes the whole session back, with the freezes you kept."

### 4.8 Formalize's ▾ (ES-2, D2-12; 3e2, and 3e3 for its second item)
- ContextSection's Formalize becomes a split button [Formalize for dependencies][▾]. The ▾ has two check items: **Open the whole model** ("Claude may change any card, arrow, definition or vocabulary item of this subject that is not frozen, and fill any empty Lean statement that is not frozen, before it fixes the statements. Every change comes back as an item, belief and proof changes with their own Accept. Your standing freezes and the selected arrows still hold; proofs of other cards stay closed; other subjects stay as they are.") and **Claude may add cards** ("intermediate propositions, each proved in the step if it can be"; built by 3e3, absent under D3-43's fallback).
- With the whole model on, the label reads "Formalize for dependencies (whole model)", and the right-click entry follows.
- Store `formalizeOptions { runId, wholeModel, mayAddCards }`, persisted; it stays on for the session's mid-stage Formalizes and resets when the session ends or another runId appears (D3-29); sent as `formalize.options`.

### 4.9 Undo and phases (UN-1, UN-4; 3g)
- Board: `setFreezes` steps are ordinary board steps; the toast offers Undo. Session: freeze actions are labelled "Freeze: ‹x›", "Unfreeze: ‹x›", "Freeze all other cards (‹n›)", "Unfreeze all other cards (‹n›)".
- During a step, Ctrl+Z and the Undo button act only when `session.undo` names a freeze action (D3-23; §2.4); otherwise D2-62's text; after an answer, the UN-5 text. While `session.judging`, the Undo and Redo of a freeze action are disabled with §3.6's text.
- Slice 2's §5.13 table gains a column Freeze: yes in step, interrupted, stage and confirming, except while judging; no in applying (D3-46).

## 5. Undo and persistence

### 5.1 freezes.json and the board stack (UN-2; 3b, 3d)
- A board freeze: `set-freezes` → `planAction` → `materialisePlan` writes freezes.json → `UndoStacks` records it (in memory, per subject, as every board step); `layoutOnly` (no snapshot) unless it wrote an id (D3-16, D3-21). An edit of a card's sentence, Why, stance or source carries its field's new standing record in its own plan, so the edit and its freeze are one board step (D3-44).
- Undo and Redo apply the whole-file change backwards, all or nothing; a conflict refuses with "freezes.json changed since: freeze or unfreeze by hand".
- Not a History sidecar (`isSubjectSidecarFile` unchanged): History restores never touch it (D3-15). ModelWorkspace reads it on load, on its sidecar event, and after an Apply and its Undo, so a hand edit is read too; unreadable records are listed (A6), and the person's next board freeze change rewrites the file without them, its toast naming them.

### 5.2 The session's freezes in run.json (3d)
- `PersistedSession.freezes` is written with the session's first run.json write (the snapshot); `recover()` gives a slice-2 session one from freezes.json as it is then (nothing wrote it during the session), with empty `own`, `standingCleared`, `requests` and `madeAt`. The same upgrade sets `frozen` on every accepted record that has none, `{ fingerprint: its accepted fingerprint, held: the recomputed stage judgement's freezeAtAccept entry, at: now }` (R2-15 of review round 2), so RV-4 holds for what the session accepted before the upgrade, in a later whole-model step too.
- Freeze actions write as §3.6 says; requests are recorded when asked and when answered. Nothing writes freezes.json during a session (ES-7).

### 5.3 The session stack (UN-4, UN-5; 3b)
- A freeze action is one step: `before` and `after` hold, for each key it changes, the key's standing-cleared flag and its own freezes (D3-22, R2-2 of review round 2), with the item changes and taken-out premises of its un-accepts. Undo and Redo touch only those keys, so an Undo never changes a key that another action changed, on the stack or not. An Undo whose keys are no longer as its `after` left them is refused as `conflict` (fail closed; it cannot happen while every freeze change is on the stack).
- **Back to review** (from `confirming`) keeps the stack as it is: the freeze actions made in confirming stay on it, and in effect. D2-54's "the stack as it was before Submit" still holds for everything else, since going to `confirming` pushes nothing (R2-2).
- **Undo** restores `before` and the items' states through slice 2's checks (RV-5 and the rest). It follows planFreeze's rules, as UN-4 asks (R2-14 of review round 2): an Undo that would give a reason to a target planFreeze would leave now (D3-6's hidden and queued targets' Proof, Dependencies and mark; D3-45; D3-46; a provisional card) is refused with that target's text. It is also refused when `violates` is not empty: "“‹label›” changed since you unfroze it: freeze it again to freeze its new version." The runner computes `violates` with `frozenFindings` on the judged state the view shows (J during a step; the masked state while the results are hidden, RV-6), with the table the Undo would restore. Every key the Undo gives a standing or own reason gets `madeAt` = now (F3 of review round 1): during a step, Claude's work since the Unfreeze is not in J, so a check that then fails on the restored freeze is fresh and not counted, Claude is told in its next tool result, and a give-up rolls back to S₀ (§3.8). That is what freezing again by hand does (UN-4, FZ-10).
- **Redo** sends the request again through the reducer, with values computed then (D2-73), and sets `madeAt` the same way.
- **Seals:** slice 2's, plus `answer` (a question or a request). During a step a freeze action sits above the queue's seal, so its Undo and Redo are allowed; any other action stays refused (D2-62).
- Decisions that also change freezes (§3.7) record `freezes` on their `decide` step; Undo restores both. The stack is discarded at the end (UN-6). A5 holds: Ctrl+Z after an accidental "Unfreeze all other cards" restores the freezes, and in a stage the statuses too.

### 5.4 The end (FZ-8, EN-2, EN-3; rows in 3b, writes in 3e1)
- **Rows** (`changes`), whole-state (F14 of review round 1): the end state against the start snapshot. A key frozen at the end (any reason) that the start snapshot does not hold is "keep frozen"; a key the start snapshot holds that has no reason at the end is "keep unfrozen"; any other key has no row. So a standing freeze the person unfroze and froze again is no row. Exit offers keep only where the frozen value is `{ from: 'base' }` (B's text and B's held map, §3.6, R2-1), since Exit leaves the person's files as B; an unfreeze is always offered.
- **Apply:** `planApply` adds freezes.json: the file as it is on disk, merged by key with the ticked changes (kept freezes added, kept unfreezes removed), minus the records of cards, declarations and arrows F deletes (A6). F already holds every card's written id (the session's `ids` commit, which no revert takes out, D3-37; F5 of review round 1, R2-6 of review round 2), so Apply writes no `id:` line of its own: kept freezes add only freezes.json lines, the facts of F describe exactly what Apply writes, and the backstop runs on F as in slice 2. As a safety net, Apply refuses when a kept freeze names a card whose `id:` is not written in F: "“‹c›” has no written id in the session's files, so its freeze can't be kept: untick it." The file's planned text is recorded in `SessionFreezes.end` (`how: 'apply'`) before Apply writes (F18). `applyChanges` accepts freezes.json as a third sidecar, so Apply's one Undo step also takes the kept freezes back (D3-32). Apply's recovery (slice 2 §3.10 step 7) also compares freezes.json: with the planned text, applied; with the text before Apply, not; anything else, a notice.
- **The ids at Apply.** Since F holds the ids, an Apply that writes model files also writes the `id:` of every derived-id card of the subject, into every file of the subject that holds one, even files no accepted item touched; that is TL112's write-back, which every board edit of a block already makes, and no difference to any item. The user guide says so (D3-37).
- **An empty Apply (D2-39) with ticks, and Exit with ticks:** no model file changes with the session. telelean makes one board step, "Keep ‹n› freezes from the session": freezes.json merged as above, plus the `id:` of each kept derived-id card in the person's files (D3-16, `planIdWrites`; a snapshot when it writes one). Its ticked changes, planned freezes.json text and card list are recorded in `SessionFreezes.end` (`how: 'board-step'`, `written: false`) by the run.json write that ends the run; the board step then runs and sets `written: true`. `recover()`, which otherwise reads only runs that have not ended, also reads the ended session run whose `board-step` is not written (at most one: it makes it before a new session can start) and makes it once, merging the recorded changes with freezes.json as it is (F18 of review round 1); `pruneRunDirs` keeps such a run's directory until then (R2-15 of review round 2). A board step that fails then is reported as a notice and marked written, so it is not tried at every reload. So a window closed in between loses no kept freeze.
- **A failed or crashed session** writes nothing: the standing freezes are as at the start. Keep ticks never change the final check's id.

### 5.5 Reload and History
- freezes.json is on disk; session freezes and requests are in run.json. An open request comes back like an open question and is answered on Resume. Notices not yet sent are lost; the resume turn's FROZEN section replaces them.
- A History restore leaves freezes.json as it is; records that no longer match are listed (A6).

## 6. Tests

No test calls real Claude: FakeBackend scripts, recorded streams and the fake engine, with `TELELEAN_NO_REAL_CLAUDE=1`. Real Lean runs only in 3p's probe test and the capped engine tests, one file at a time, above the 12 GB rule.

### 6.1 Per sub-slice

**3a** (core; Spyro facts and edited copies, with `fakeFacts({ meaningKey: true })`):
- values: every target kind; keep-empty (no binding); a meaning-only change (equal texts, different keys); the `approx` fallback and `inexact`; `heldValue` by type only for theorems and `.holds`;
- store: unreadable records listed, duplicates merged, stable sorted one-per-line output, a missing file is no freezes;
- table: standing, accepted and own merged; standing minus cleared; accepted targets split into item-checked and B-checked; `notFound`; `madeAt` carried into the entries;
- check: every token; held through a definition (S2's `def HasDarkPast := False`), through another card's statement and through an instance placed before (meaningKey); `conflict`; an accepted item checked like an own freeze (its content key, and each stored held name: an item of its SCC in review that changes is refused; F4); reconcile returning an accepted vocabulary item and its accepted dependent to review together gives no finding while neither changes (F4); FZ-4's exceptions (a target's proof, a fuzzy fill and a Dependencies addition are never held); the two-value rule (F2): an own freeze whose target S₀ already breaks is no step finding and is a stage problem, a later step that changes that content further is refused (as a held name, and as an accepted item's content key, too), a step that puts back the frozen value passes, and a judge-reverted accepted item gives no step finding in the next queue; fresh by `madeAt`, an Undo-restored freeze included (F3);
- judgeState at each purpose (`global`, `problems`, `inexact` at final), existing-changed's single message, `freezeAtAccept` (own names included), `statement-changed` with meaningKey;
- backstop on tampered records: accepted content changed in F, a standing target changed in F, inexact facts.
- review round 2: an instance placed before an accepted statement, with equal text, printed type and constants, refused as `meaning` or `held changed` (R2-9); `other-subject` in a narrow step (an instance in the session's subject that another subject's statement picks up; an opened definition that another subject's statement uses), at `stage`, at `final` and in the backstop (R2-13); judgeState('final') and `applyBackstop` refusing without freezes, and accepted items' `frozen` checked with `freezes` absent (R2-5).

**3p** (runner): probe unit: the generated lines, the parsed meaning lines, old recordings without them. Real Lean (capped): an instance or attribute placed before a statement changes its meaningKey while its printed type stays equal; a change to a match auxiliary changes its parent's key; an identical rebuild gives identical keys; a definition body change changes the key, a theorem's proof change does not; the cost against 2b3's. Then the full runner suite on the regenerated recordings.

**3b** (core):
- planFreeze: expansion of each subject; the others rule (an arrow counts in both end cards; vocabulary cards; items); counts; un-accept only with the tick or a plain Unfreeze; versions per kind; hidden and queued targets left; idempotence; the same plan from view data and from records. acceptCovers per kind.
- reducer: every op; un-accept with RV-5's cascade, refused during a step; Accept sets `frozen` with its held map, and reconcile keeps it through every return to review (a property: no reconcile or judge output clears it); a decide action with `freeze` (`unfreeze` drops the listed keys' standing and own reasons and the holders'; `yours` values them at B) recording `freezes` on its step, Undo restoring both; a Shaky decline leaving every freeze as it is (D3-49); "your version" as one action; `madeAt` set by freeze actions, Undo and Redo, and removed with a key's last standing or own reason; Undo restores records and freezes exactly (a property, as F4); Undo refused with `violates`; Redo through the rules; the `answer` seal.
- `frozenChangesOf` (F6, item-based since R2-17): a Reject whose revert changes an own-frozen proposal (listed); a cascade that takes out content frozen through "Freeze all other cards" (listed); a premise take-out whose completion wrote a frozen Proof (listed); un-reject bringing back an item that owns a frozen field (listed); the Undo of "Unfreeze them and decline" (not listed: its keys come back with it); a revert that changes a held definition (listed with its holders); a revert that puts back the frozen value, or of an item that owns no frozen target (not listed); an accepted item the cascade takes (not listed: RV-5's list); an item outside the cascade whose `frozen.held` names a reverted definition (listed with that item; `yours` not offered).
- review round 2: an own freeze of a card whose definition a step changed is stored `{ from: 'state' }` with the definition's new held value, gives no stage problem, and a Reject of the definition's item then asks, listing it "held by" the card (R2-1); per-key Undo: with "Freeze: Y" missing from the stack, Undo "Freeze: X" leaves Y frozen (R2-2); `planSubmit` keeps a Shaky item with a frozen field, and the items it depends on, in ws/ (R2-3, D2-57's take-out); a D2-23 return of an accepted definition with an accepted dependent, then a Reject of the definition: one confirmation naming the dependent, and no stage problem after it (R2-4); an Accept without `heldAtJudge` refused, reconcile setting it (R2-5); a Reject of a derived-id card's Formalize keeps its `id:`, and a Delete's revert restores the block with it (R2-6); `unmeetable` for each ledger kind and for snapshot-fixed content, and none for a freeze made before the step (R2-7); a Redo of "Unfreeze them and decline" re-sending its choice, `decisionKey` ignoring `frozen` (an Undo of an Add premise's Accept after its step 4 is no conflict), and a freeze over two items in review giving one confirmation without "your version" (R2-11); edit-node adding a standing record for the edited field in its plan, and none for a field frozen already (R2-12); an Undo that would freeze a hidden target's Proof refused with D3-6's text, and `violates` on the masked state, a hidden twin pair answering alike (R2-14).
- `planIdWrites`: every derived-id card of the subject, only the given cards, none when all are written; the result parses with the same ids.
- planAction: `set-freezes` (the file, `layoutOnly`; a derived id written once, with a snapshot); `delete-node` and `remove-arrows` drop records (A6).
- views: reasons, held marks, `notFound`, rows (whole-state: unfrozen then frozen again gives no row; F14), requests, `mode` from the running or last queue (F16), `undo` during a step naming the top freeze action (F11); `open` from the question only; no reason from a hidden Result.
- protocol validators: every rule, fresh objects, `__proto__`, limits, `keepAll`, `keep` above 2,000 keys (F15), the action-level `freeze`.
- twins: freeze actions on slice 2's fixed outcome pairs give byte-identical SessionView JSON (RV-6).

**3c1** (core): ownership of Change, Delete, Remove arrow and Proof broken with stable keys and origins (the `changed` entry); a `card:` record that turns from Formalize into Change takes the new kind; revert then re-apply gives the same text for Delete, Remove arrow, Proof broken and a field Change; live ledger entries (a rejected Delete is not deleted again by the next normalise; un-reject makes it count again); `proofMaterialOf` (exclusive lemmas; a shared lemma goes with its last user); deps rules 3 and 5 with Proof broken, and A17; whole-model limits (sentence and statement changes of unfrozen cards pass; any empty, unfrozen statement of the subject may be filled and is pinned, a frozen-empty one may not; `type:`, `id:`, binding and `premises:` edits are refused; non-target proofs and lemmas stay fixed, except this step's own delete and proof-broken removals; Shaky items' content stays fixed; any change to another subject's file is refused by G0 (`outside-subject`), and any change to what another subject's declaration means as `other-subject`); the after-freeze rule (a sentence change after freeze_statements refused as `blocks`; a proof-phase instance that changes a statement's meaning refused); the three tool validators' texts, a card of another subject included; `planSubmit` taking out every kept Shaky and to-be-redone item when a step of the queue is whole-model (D3-42); the start check refusing a card with a Proof broken item (D3-47); the backstop's ownership of the new kinds; the mask keeps a whole-model arrow into a non-target and drops a target's (a twin, F19); narrow steps unchanged (every slice-2 gate suite green). Review round 2: a whole-model Submit step re-proposes its own Shaky Change, while another step's Shaky content stays fixed (R2-8); D3-42's widened take-out keeps a Shaky item with a frozen field (R2-3); `propose_arrow` of an arrow whose Remove arrow item is accepted, and `mark_proof_broken` of a held `.holds`, refused at once (R2-7).

**3c2** (core): ownership of a ledger `card` (Add plus Result) with stable keys; revert then re-apply of an intermediate's Add; DO-0 on an intermediate's arrow declines its Add; intermediates judged before their target, B.1 and B.2 through E(I), an unproved one contributing nothing; `addCardProblems`' texts; the mask drops an intermediate's `.holds` and arrows.

**3d** (runner, host; FakeBackend): cheats 2, 4–7, 9, 10, 16 and 19–23 of §6.2, and the narrow-step forms of 1, 3, 8 and 11; freezes.json written through `perform`, Undo and Redo restoring it, a History restore leaving it, a hand edit read again; the ES-9 lock, also while a start is on its way; the session snapshot and `recover()`'s upgrade; freezing in each phase of §3.6's table, refused while judging in every phase, its Undo and Redo too (F17); J is the base during the first queue (F12); a records-only write in a stage; during a step, a checked write before the in-memory change, a failed write refusing the action and leaving nothing for the step's next write or `dispose()` to persist (F11), and a later write by the step keeping a successful one; `request_unfreeze` with Continue (computed from the store), Keep frozen (disabled after an unfreeze), withdrawn at a cancel, and a reload during a pending request; notices drained into tool results; a fresh failure not counted, after an Undo of an Unfreeze too (F3); the finish's re-check; the rollback to S₀ after a freeze, an Undo or a Redo; a Submit queue started over an unresolved frozen stage problem passes its steps and keeps the problem (F2); a freeze made while the queue-end judge's Lean job runs is in the stage's problems (F12); `JudgeInput.freezes` plumbed into check, freeze, gate, judge, finalCheck, `writePremise` and `complete`, and `BackstopInput.freezes` into Apply, and `planSubmit`'s `freezes` into Submit (R2-3), each checked by a spy on `judgeState`, `applyBackstop` and `planSubmit` (F11); decisions over frozen content: a Reject asking, its `unfreeze` and `yours`, a refused un-reject, a refused Undo of a Reject, a premise Accept gated by a frozen proof, the judge's revert of frozen content as a stage problem (F6); the turns' FROZEN and HELD sections; FZ-12's grep; host routing, `session` posted before `actionResult` and after every freeze action. Review round 2: Back to review keeps the freeze actions made in confirming on the stack, and two Undos then restore each key alone (R2-2); a Submit queue over a Shaky item with a frozen field keeps it, its step keeps the field, and the feedback turn says "kept" (R2-3, path 23); `NO_FREEZES_YET` gone and every call site passing the session's freezes (R2-5); the person freezes empty a fuzzy statement Claude already filled and fixed: the step ends at once, not counted, rolled back to S₀, with its outcome (R2-7); a step write queued while a freeze's write is pending leaves run.json with the freeze (R2-10); `recover()`'s upgrade sets `frozen` on a slice-2 session's accepted records (R2-15); a board edit of a sentence writes its standing freeze, and its Undo removes both (R2-12).

**3e1** (runner, host): the `ids` commit at a session's start (no item, no difference; F holds every id) and in an older session's next `queue-start`; Apply without keep leaves freezes.json as on disk; with keeps (no `id:` write of its own, the backstop on exactly F); `keepAll`; an empty Apply with ticks and Exit with ticks make the board step, and a reload before it makes it once (F18); a failure writes nothing; Undo of Apply restores freezes.json; a crash during Apply recovers without writing twice, freezes.json compared with its planned text. Review round 2: Apply refuses a kept freeze of a card with no written id in F (R2-6); an ended run whose board step is not written: `recover()` makes it once, and `pruneRunDirs` keeps its directory until then (R2-15).

**3e2** (runner, host, webview; FakeBackend): cheats 12, 13, 15, 17 and 18 of §6.2, and the whole-model forms of 1, 3, 8 and 11; Retry and Cancel drop the tools' ledger entries; the `changed` entries at a step's end; a Submit queue with a whole-model step takes out every kept Shaky and to-be-redone item and reworks a Shaky Change and a Shaky Delete with the tools (D3-42); a whole-model Change of an axiom's statement is a belief item, with "proves a statement changed" on the Result; "Filling now" for a whole-model step's empty Why (F8); the ▾'s label and reset. Review round 2: `delete_card`, then the person freezes that card: the step ends at once, not counted (R2-7); a whole-model Submit queue with a frozen Shaky field (R2-3, path 23).

**3e3** (runner, host, webview; FakeBackend): cheat 14 of §6.2; an intermediate proved and used through its arrow gives Add, Result and arrow items; the ▾'s second item.

**3f** (webview): `freezeMenu` (entries, every disabled reason); `store-freeze` (gestures, routing, not optimistic, busy, dialogs resend once, Cancel posts nothing, stale selections dropped, nothing posted from the Current view during a session); `freezeLook`; legend; theme; edge badges. Playwright `s3-look`, `s3-freeze`: drafted, not run.

**3g** (webview): the request card (row states; Continue never posts a freeze; Keep frozen disabled after an unfreeze; Select them); the end confirmation's keep (rows, Keep all sending `keepAll`, Exit ticks only, persisted per runId); the item detail's lock slots selecting `{ card, field }` (F13); the banner by `freezes.mode`; the frozen-changes dialog and its three answers; Undo during a step only for freeze actions, and disabled while judging; the RV-6 fixed pairs give equal lock DOM. Playwright `s3-session`, `s3-undo`: drafted, not run.

### 6.2 Cheat scenarios
Each is a FakeBackend script, and the same state is built by hand in `core/test/freeze/cheats.test.ts`; each is refused with its token, counted unless fresh.
1. Claude edits a frozen sentence or statement, with the whole model open → `frozen` (`field`).
2. It fills a frozen-empty statement at a selected arrow's end → `keep-empty` (the freeze beats fuzzy).
3. It removes a frozen arrow with `remove_arrow` (refused at once) or by editing `premises:` (G5 and `frozen` `arrow`); it removes a frozen mark (G5).
4. `propose_arrow` into frozen Dependencies → refused at once; `propose_assumption` for a frozen mark → refused; an older draft's Accept stays gated.
5. It changes a held definition (S2: `def HasDarkPast := False`) → `held`; request_unfreeze, the person unfreezes the holder → it passes, and the definition's item lists the holder under "Your statements rely on it".
6. It changes a card's statement that a frozen statement mentions → `held`.
7. It places an instance or `@[instance]` before a frozen statement, the text unchanged → `meaning` (an `open` is also `stray-command`). Real Lean once, capped.
8. It deletes a card that has a frozen field: `delete_card` refused; a raw block removal → G5, unowned and `deleted`.
9. It edits frozen content and restores it before the check → passes.
10. Freeze races: (a) the person freezes before the next check: that check fails fresh, not counted; the next tool result tells Claude; it restores and passes. (b) a freeze during the gate's Lean job: the finish's re-check fails fresh. (c) a freeze of content an ended step of the same queue changed: no step finding; a stage problem; Apply waits until the person unfreezes or declines. (d) the person unfreezes, Claude changes the target, the person presses Ctrl+Z: the next check fails fresh, not counted, and a give-up rolls back to S₀ (F3). (e) the person freezes empty a fuzzy statement that Claude already filled and fixed (narrow), or a card Claude deleted with `delete_card` (whole model): the step ends at once, not counted, rolled back to S₀, "You froze ‹x› after Claude's step had already changed it." (D3-50).
11. It changes accepted content in a later whole-model step or a re-ask → `frozen` (`accepted`).
12. A whole-model change breaks a non-target proof → `build`; `mark_proof_broken` gives a Proof broken item; its Reject takes the breaking change out (RV-5).
13. `remove_arrow` on an arrow a proof uses, or on a selected arrow → refused.
14. `add_card` without the switch, or after freeze_statements → refused; an unproved intermediate: its Result reads not proved, and the target cannot use it (3c2, 3e3).
15. A sentence change in a whole-model step's proof phase → `statement-changed` (`blocks`).
16. It writes `.telelean/…` → the path guard and G0; the shadow's ws/ never holds freezes.json.
17. With the whole model open, it edits a card or a vocabulary item of another subject (one that subject's freezes.json freezes) → G0 (`outside-subject`); or it changes the session's subject so that another subject's statement means something else (an instance it picks up, a definition it uses) → `existing-changed` (`other-subject`), in a narrow step too (R2-13); `delete_card`, `remove_arrow` and `mark_proof_broken` on another subject's card → refused at once (F1, D3-41).
18. A second whole-model step of the same queue changes content an earlier step changed and the person froze meanwhile → `frozen`; leaving it as it was passes, and the stage gets the problem (F2).

Paths where telelean itself, not Claude, would change frozen content (F6, D3-48, D3-49). They are built by hand in `core/test/freeze/cheats.test.ts` and through the runner's actions in 3d; none may change frozen content without the person's answer:

19. A Reject whose cascade takes out a dependent that the person froze (through "Freeze all other cards", or a frozen field on Claude's proposal) → `needs-confirmation` with `frozenChanges`; [Cancel] changes nothing; `unfreeze` drops those freezes in the same action; Ctrl+Z restores both.
20. Un-reject whose merge would change a frozen field, and the Undo of a Reject that would → refused, with the list.
21. The judge's "no longer builds" revert of frozen content → a stage problem; Apply stays disabled until the person unfreezes or declines.
22. Accepting an Add premise while its target's Proof is frozen and the target is not proved → gated (`Gate.frozen`); `propose_assumption` for such a target → refused at once.
23. Submit review whose take-out (D2-57's, or D3-42's widened one) would revert a field the person froze on a Shaky item → that item, and the items it depends on, stay in ws/; its own step keeps the field and reworks the rest; no stage problem (D3-49).

### 6.3 The integrator, at the slice end
- The full core, webview and extension suites; the runner suite on a snapshot copy with real Lean when about 20 GB is free; the recordings regenerated with the meaning probe.
- A scratch webview build; Playwright one spec at a time (the s3 specs, and the slice-1 and slice-2 specs the NodeCard and CardDetails changes touch); the VS Code suite if RAM allows; anything not run is listed.
- After 3g, before 3c1 (§1): the same checks for FROZEN alone (FZ-1–FZ-13, RV-4, FZ-8), recorded in §8.
- Then, only if every check passes: the `dist` rebuild (AP-8), the AP entry and the patch. Under D3-43's fallback, the slice ends without 3c2 and 3e3, and the AP entry says so.

## 7. Decisions, conflicts, patches

### 7.1 How the two designs were reconciled

| Topic | Engine design | UI design | Resolved |
|---|---|---|---|
| What is frozen | `FreezeAddress`, also a card's existence; keys `field:<c>:<f>` | `FreezeTarget` (four kinds); canonical JSON keys | `FreezeTarget` with canonical JSON keys; "may not re-add" after an accepted Delete comes from the item's own content-key check (§3.4) |
| Whole card | all eight fields | the kind's fields | all eight stored (a later kind change keeps them); aura over the kind's fields (D3-20) |
| Board action | `freeze` / `unfreeze` with addresses | `set-freezes { op, subjects }` | `set-freezes` (§2.6) |
| Session state | entries with reasons, allowances, deferred reviews, binding start | standing, cleared, start, own, allowed | `SessionFreezes`: standing, cleared, own, requests, start (EN-2's line only), `madeAt`, `end` |
| Starting freezes | not binding | a reason `start`, shown | not binding: the step limits enforce the preset (D3-1) |
| Values while judging | `pending`, revalued later | freezing waits; the view's version is checked | refused while judging, freeze again; the version is checked (D3-8, revised in round 1) |
| A hidden target's proof | freeze the unseen proposal | refused | refused, extended to Dependencies, marks and the running queue's targets (D3-6) |
| Conflict with an ended step of the queue | cancel the queue from that step | — | the two-value rule: a stage problem; Apply waits (D3-5, revised in round 1) |
| Unfreezing accepted content during a step | deferred to the queue's end | — | waits for the step's end, as every status change (D3-7) |
| Allow this change | allowances and "meaning changed" items | Allow / Withdraw | not built (D3-9) |
| Rejecting a frozen proposal | keep, revalued later | `ItemDecision.freeze` | one check before every decision's write, from the items it takes out or brings back (round 2), the message's `freeze`, valued at B at once (§3.7, D3-48) |
| Requests | `SessionView.request` | `RunView.pendingUnfreeze` | RunView, like questions (D3-31) |
| Seal on answers | — | `answer` | `answer`, for questions too (D3-23) |
| Undo of freeze actions | deltas plus unfrozen values | whole state plus a value check | per-key deltas (round 2), under planFreeze's rules, with `violates` from the runner (D3-22) |
| Formalize over frozen content | "Unfreeze these and formalize" | a hint in the ▾ | a warning with "Formalize anyway" (D3-18) |
| Intermediates | proved or deleted at finish | — | may end unproved (A25, D3-13) |
| Whole-model changes | any time in the step | — | only before freeze_statements (D3-12) |
| Moved frozen declarations | refused (`moved`) | — | position is no part of a value (D3-39) |
| Proof broken | the card's `.holds` | — | the `.holds` and the proof material only it uses (D3-10) |
| Keep ticks | per address | per card, as target lists | one row per FreezeKey, grouped by card in the UI (D3-33) |
| Where `planFreeze` and the protocol live | 3a1 | 3U1 | core 3b, so runner, host and webview change no core file (D3-40) |
| Sub-slices | 10 | 7 | 7, with fallback splits (§1); 11 after review round 1: 3p added, 3c and 3e split, FROZEN first (D3-43) |

### 7.2 Autopilot decisions (for `02_autopilot_decisions.md`)

1. **D3-1** AUTOPILOT DECISION (ES-2, FZ-7): a session started by Formalize creates no binding "session-start" freeze reasons. ES-2's preset is enforced per step by slice 2's step limits, for the first queue and every later one; the start's switches are recorded only for EN-2's summary line (the banner shows the running or last queue's mode, F16 of review round 1). So a mid-stage Formalize runs at once on its own targets (REVIEW 5), Unfreeze acts only on real reasons, and a later whole-model Formalize is not blocked by the first one's preset. *Alternative:* the literal reading, the first preset as a binding reason (a predicate over B plus a cleared list); every later Formalize would first need its target's proof and fuzzy statements unfrozen. *To reverse:* make start entries at the session's first write; `frozenNeeds` already lists them.
2. **D3-2** AUTOPILOT DECISION (FZ-3, Appendix B): meaning in Lean is `meaningKey`, the sha256 of the elaborated declaration's `Repr` with the auxiliaries it reaches, compared exactly; D2-41's printed comparison is the fallback and refuses Apply; `statement-changed` compares it too. *Alternative:* D2-41's comparison alone (cheaper; two terms that print the same pass), or a comparator export per frozen declaration (exact, but one heavy Lean job per check).
3. **D3-3** AUTOPILOT DECISION (FZ-4): held content keeps its meaning and, but for theorems and `.holds`, its text (without the docstring, whitespace collapsed); held theorems and `.holds` keep their type only. *Alternative:* meaning only, so Claude may reformat held definitions.
4. **D3-4** AUTOPILOT DECISION (RV-4, FZ-7, FROZEN 2–3): Accept's freeze lasts until the person's own later status change of the item or an Unfreeze covering it; reconcile's automatic returns to review (D2-23, RV-11, the defensive RV-5 rule) keep the content frozen, so telelean never unfreezes. Since review round 1 (F4), the Accept records `{ fingerprint, held, at }`, with the held values of its own declarations' meaning closure, own names included, and is checked exactly like an own freeze. *Alternative:* the reason ends with any status change, as FZ-7's sentence reads. For the record: the first version's `meaning` and `heldItems`, checked by a separate walk, which an accepted vocabulary item returned to review with its accepted dependent turned into a stage problem that refused every later state. Since review round 2 (R2-4): a cascade of the person's action that changes the status of an item with `frozen`, whatever that status, lists it in RV-5's confirmation ("frozen: you accepted it"), and confirming clears it; so an item that reconcile returned to review never leaves a `frozen (accepted)` problem behind when the person declines what it rests on.
5. **D3-5** AUTOPILOT DECISION (FZ-10; revised in review round 1, F2): a freeze made while a queue runs keeps the value the person sees (the queue's start, or the base during the first queue). At step purposes, a frozen target, a held name or an accepted item counts only when its value differs both from its frozen value and from its value at the step's start (the two-value rule): a step may leave a difference it found there, or put back the frozen value, and do nothing else to it. Content an earlier step of the same queue had already changed, and a stage problem not yet resolved, stays a stage problem, and Apply waits until the person unfreezes it or declines the item. *Alternative:* cancel the queue from the earliest ended step whose scope holds the target (the engine design), discarding that work, with Retry later. Or the first version: per-freeze queue bookkeeping (`OwnFreeze.queue`, an `inherited` output), which a whole-model step could get past and which made every step of a later queue fail on an old stage problem.
6. **D3-6** AUTOPILOT DECISION (FZ-9 narrowed, RV-6): a target's Proof, Dependencies and mark cannot be frozen while the results are hidden, nor while that target's step is queued or running; the rest of its card can. *Alternative:* freeze Claude's unseen proposal after an outcome-independent dialog; the Exit list's availability would then tell the outcome.
7. **D3-7** AUTOPILOT DECISION (FZ-9, FZ-10 narrowed; consistent with D2-62): while Claude's step runs, "your version" (it rejects an item), unfreezing accepted content and "also un-accept" wait for the step's end; freezing, and unfreezing standing and own freezes, work at once. *Alternative:* record such un-accepts and apply them at the queue's end (the engine design's deferred review).
8. **D3-8** AUTOPILOT DECISION (FZ-9, a small narrowing; revised in review round 1, F17): while the working copy is re-checked (`judging`, in any phase), freezing, unfreezing and their Undo and Redo are refused at once, "Re-checking the working copy: freeze again in a moment.", so a freeze always takes the value of the judged state the person sees and no call waits for a judge (D2-74); `sessionFreeze` names the view's version, and a stale one is refused. *Alternative:* a pending value computed by the next judge. Or the first version, waiting inside the call, which would have blocked the host's run queue.
9. **D3-9** AUTOPILOT DECISION (FZ-5 narrowed, FROZEN 2): no "Allow this change" and no "meaning changed by X" items: held content changes only after the person unfreezes what holds it, mechanically; X's own item already lists the statements that rely on it; RV-7's b5 stays unused. Its cost, stated in the user guide: unfreezing a holder A lets Claude rewrite A too, and freezing A again holds X again, so "keep A's words but let X change" cannot be expressed; A's rewrite comes back as an item the person can Reject. *Alternative:* allowances that exempt a held X, one "meaning changed by X" item per frozen holder (b5 for an axiom, a new c5 otherwise), X accepted only after them, and declining any of them rejecting X.
10. **D3-10** AUTOPILOT DECISION (TR-14, ES-2): Claude marks a broken non-target proof with `mark_proof_broken` before freeze_statements; telelean takes out its `.holds` and the proof material only it uses. Accept: the card loses its proof (own Accept, c1); Reject restores it, cascading to the breaking change; re-proving waits until after the session (D3-47); "make it pending" waits for slice 4. *Alternative:* the gate takes broken proofs out itself, or a hold-as dialog on Accept writes a pending claim.
11. **D3-11** AUTOPILOT DECISION (ES-2, B.3): structural changes are asked for with tools (`remove_arrow`, `delete_card`, `add_card`, `mark_proof_broken`) and written by telelean through the ledger, as with propose_arrow (D2-1). *Alternative:* G5 exceptions, so Claude edits blocks and `premises:` itself, with ownership inferred from the diff.
12. **D3-12** AUTOPILOT DECISION (ES-2, RV-6): in a whole-model step the model changes only before freeze_statements; after it, card blocks and every declaration keep their text and meaning except the proofs and new proof material, so no visible change can follow the proof attempt. *Alternative:* changes at any time in the step; a visible item could then depend on whether the proof succeeded.
13. **D3-13** AUTOPILOT DECISION (ES-2, A25): an intermediate card is added before freeze_statements and judged as an inference with an empty question, its Result hidden like any; it may end unproved, and then no target can use it. Built last, in 3c2 and 3e3, under D3-43's fallback. *Alternative:* require it proved or deleted at finish (the engine design), whose Add item's existence would then show the outcome.
14. **D3-14** AUTOPILOT DECISION (B.3, FZ-1, CF-3): `remove_arrow` removes only an arrow of yours that no proof uses and no question selects; `delete_card` deletes only a card of yours or the step's own intermediate, never a target, a card at a selected or proposed arrow, a frozen or held card, or one something else still uses. *Alternative:* also remove Claude's own earlier arrows, and delete in Shaky steps (DO-3, with D2-15 lifted).
15. **D3-15** AUTOPILOT DECISION (UN-2): freezes.json is not part of History, so a History restore never changes what is frozen; Apply's Undo step includes it. *Alternative:* a History sidecar, so restores also restore old freezes.
16. **D3-16** AUTOPILOT DECISION (FZ-9 against Appendix B): freezing a card whose id is derived writes its `id:` first, so that plan changes a model file and is snapshotted (one History entry). *Alternative:* key the record by the derived id, which a hand edit of the sentence would orphan (failing open until noticed).
17. **D3-17** AUTOPILOT DECISION (FZ-12): only user-facing texts are renamed ("statements fixed", the `milestone` icon); the tool `freeze_statements` keeps its name, its description reworded. *Alternative:* rename it `fix_statements` and regenerate the FakeBackend scripts and the system-prompt fixture.
18. **D3-18** AUTOPILOT DECISION (ES-2, FZ-1): Formalize over frozen content warns, with [Formalize anyway] [Cancel]; the person unfreezes in the Context Menu. *Alternative:* an "Unfreeze these and formalize" button that unfreezes first.
19. **D3-19** AUTOPILOT DECISION (FZ-10): only a check failing solely on freezes made after Claude's previous tool result is not counted, so each such freeze gives Claude one free failure. "Made" is the key's `madeAt`, which every freeze action, Undo and Redo that gives the key a reason sets (F3 of review round 1), so a freeze restored by Ctrl+Z during a step is fresh too; a reason added to a key already frozen also sets it, which gives Claude one more free failure, never a passing state. *Alternative:* never count failures caused by any freeze made during the step (Claude could loop until a cap).
20. **D3-20** AUTOPILOT DECISION (FZ-1): freezing a card freezes all eight CF-2 fields, so it stays wholly frozen after a kind change; the aura shows when every field of its current kind is frozen. *Alternative:* its kind's fields only.
21. **D3-21** AUTOPILOT DECISION (FZ-9, UN-1): standing freezes are board-stack steps, as a sidecar-only plan (no History snapshot, no model file unless an id is written, D3-16); FZ-9's "change no file" is read as "no model file". *Alternative:* a separate, in-memory freeze stack.
22. **D3-22** AUTOPILOT DECISION (UN-4; revised in review round 2, R2-2, R2-14): a session freeze action records, for each key it changes, the key's standing-cleared flag and its own freezes, before and after; Undo and Redo touch only those keys. Undo is refused when a freeze it would restore no longer holds in the state the person sees, or when planFreeze would not allow that freeze now. Back to review keeps the freeze actions made in confirming on the stack. *Alternative:* the whole freeze state before and after (round 1's), which an Undo after Back to review could turn into a silent unfreeze; or per-target deltas with repair. *To reverse:* store whole states again, and restore a pre-Submit stack at Back to review only with no freeze action made in confirming.
23. **D3-23** AUTOPILOT DECISION (UN-4, UN-5; revises slice 2's "answer adds no seal"): freeze actions and their Undo and Redo work while a step runs (not while judging, D3-8), with `SessionView.undo` naming the top freeze action then (§2.4), and answering Claude's question or unfreeze request seals the session stack. *Alternative:* no Undo during a step; no seal on answers.
24. **D3-24** AUTOPILOT DECISION (FZ-5): Keep frozen is enabled only while every requested item is still frozen or held, and Continue reports what the store says. *Alternative:* Keep frozen re-freezes what the person unfroze.
25. **D3-25** AUTOPILOT DECISION (FZ-9): "Unfreeze all other cards" always asks, with the counts of standing, own and accepted freezes. *Alternative:* ask only when standing freezes would go (FZ-9's minimum).
26. **D3-26** AUTOPILOT DECISION (FZ-11): `telelean.frozen` is rose, drawn as an inner overlay; a partly frozen card gets field locks and a "🔒 n" chip, no aura. *Alternative:* frost silver (reads as disabled); a faint aura for partial freezes.
27. **D3-27** AUTOPILOT DECISION (FZ-11): in a session, standing and own freezes keep their aura and accepted content shows field locks; while a narrow step runs, the board marks what Claude may change, from the question and the visible state. *Alternative:* a "Show frozen" toggle.
28. **D3-28** AUTOPILOT DECISION (CM-2, FROZEN 2): a field's lock slot only selects the field; freezing is always a Context Menu action. *Alternative:* clicking the lock toggles the freeze.
29. **D3-29** AUTOPILOT DECISION (ES-2): Formalize's switches stay on for the session's mid-stage Formalizes and reset when it ends. *Alternative:* reset after every Formalize.
30. **D3-30** AUTOPILOT DECISION (FZ-9, RV-4, FZ-10; extended in review round 2, R2-11): Freeze on a review item freezes what its Accept would cover, at Claude's proposal; the item stays in review. When one freeze reaches targets of several items in review, one confirmation lists them all and freezes Claude's proposal of each; "your version" (which rejects the item) is offered only when one item is involved. *Alternative:* map items to cards and ask the version question; for several items, one `decideItems` that rejects them all with `freezeSubjects`. *To reverse:* allow `freezeSubjects` with several Reject decisions.
31. **D3-31** AUTOPILOT DECISION (FZ-5, RV-6): unfreeze requests travel in RunView, like questions; their words are an accepted residual channel while the results are hidden (added to slice 2 §4.7's list). *Alternative:* withhold the words until the results are shown, so the step pauses unexplained.
32. **D3-32** AUTOPILOT DECISION (EN-3, UN-2): kept freezes are written inside Apply's change set, so one Undo takes them back with the session; Exit's are one board step after it. *Alternative:* Exit's kept freezes cannot be undone.
33. **D3-33** AUTOPILOT DECISION (FZ-8, EN-2): keep ticks default off, one row per frozen target, grouped by card. *Alternative:* on by default for the person's own freezes.
34. **D3-34** AUTOPILOT DECISION (CM-2): with both a board selection and a review-item selection, freeze actions act on the board selection. *Alternative:* their union.
35. **D3-35** AUTOPILOT DECISION (EN-2): in the end confirmation, Freeze and Unfreeze change only the freeze list, and an Unfreeze that would un-accept is refused ("Back to review first"). *Alternative:* such an Unfreeze returns to the stage by itself.
36. **D3-36** AUTOPILOT DECISION (RV-1, AR-5, A10): a premise for a target whose Dependencies or mark is frozen is refused when proposed ("ask with request_unfreeze"); a draft made earlier has its Accept gated, with Select them. Since review round 1 (F6), the same holds for a target whose Proof is frozen while the target is not proved, since the Accept's completion would write that proof. *Alternative:* an automatic unfreeze request record per such draft (RV-1's wording).
37. **D3-37** AUTOPILOT DECISION (FZ-3, CF-3; revised in review round 1, F5): the session's `ids` commit, after `base` and before the first step, writes the `id:` of every derived-id card of the session's subject into the working copy (no difference by itself), so a sentence change never changes identity and F holds every id. Apply writes those ids into the person's files with the rest of F (TL112's usual write-back, which any board edit of a block also makes), and kept freezes add only freezes.json lines, so Apply's backstop runs on exactly F. An empty Apply or an Exit with keep ticks writes the kept derived-id cards' ids in its one board step. *Alternative:* write the ids only for the kept cards at Apply and rebuild F′ with Lean before Apply's backstop; or (the first version) write them at each whole-model step's start, which left Apply's own id writes outside F's facts; or refuse sentence changes of derived-id cards. Since review round 2 (R2-6): no revert takes an `id:` out (a reverted block keeps its derived `id:`, since 2a1 attaches the write-back to the card's item), and Apply refuses a kept freeze whose card has no written id in F. So Apply writes `id:` lines into every file of the subject that holds a card without one, even files no accepted item touched; the user guide says so.
38. **D3-38** AUTOPILOT DECISION (B.3): with the whole model open, `propose_arrow` may target any unfrozen proposition of the session's subject before freeze_statements; with Claude may add cards, the step's intermediates, and an intermediate may be the source of an arrow into the target. *Alternative:* only arrows into the targets (narrowing B.3).
39. **D3-39** AUTOPILOT DECISION (FZ-3): a declaration's position is no part of its frozen value; a move is caught when it changes meaning, and shows as a Change item. *Alternative:* refuse moves of frozen declarations (token `moved`).
40. **D3-40** AUTOPILOT DECISION (process): slice 3's contracts and protocol are written in the core sub-slices 3a and 3b, so the runner, host and webview sub-slices change no core file (slice 2's one-builder-in-core rule); the whole model's and the new cards' core work is in 3c1 and 3c2 (D3-43). *Alternative:* a separate core sub-slice for protocol and view types.
41. **D3-41** AUTOPILOT DECISION (ES-1, ES-2, FZ-9, TR-10; review round 1, F1): a session's steps change only its own subject, the whole model open included. Every file of another subject (and the library root) keeps its text, and its declarations their meaning, as under the preset, and the tools and `propose_arrow` work only on the session's subject's cards and arrows. So other subjects' standing freezes, which the session neither holds in its table nor shows, can never be broken; a change to this subject's vocabulary that another subject's statement relies on is refused (`other-subject`). This reads ES-2's "any other card" as "any other card of the session's subject", consistent with ES-1 (one subject per session), FZ-8 and FZ-9 (the session's subject) and TR-10. *Alternative:* snapshot every subject's freezes.json into the session, keyed by subject, show the other subjects as Proposed views, and extend FZ-8's rows to them. *To reverse:* build that, then drop the subject rule from §3.10's whole-model limits. Since review round 2 (R2-13), this holds in every step, narrow ones too: G0's `outside-subject` file rule (M2) already kept other subjects' files at every purpose; the `other-subject` rule now also refuses, at every judged state, a change of what their declarations mean (their meaningKeys, and the held values of this subject's declarations they reach in B), and slice 2's step limits compare meaningKey too.
42. **D3-42** AUTOPILOT DECISION (ES-2, RV-9, RV-12, DO-3, D2-57; review round 1, F7): every step of an inference takes the inference's switches, its Submit and Retry steps included. When a Submit queue has a whole-model step, telelean takes out every kept Shaky or to-be-redone item before it starts (D2-57's take-out, widened; but what D3-49 keeps for its frozen content), and each is proposed again by its own step, with the tools if needed. A whole-model step keeps the content of items declined Shaky fixed (RV-9), and its own delete and proof-broken removals are exempt from "non-target proofs stay fixed". A whole-model Change's origin is recorded by a ledger `changed` entry, so Submit knows which step reworks it. *Alternative:* the critic's first suggestion, Submit steps that never take the switches and rework their items under slice 2's narrow limits; a Shaky Change, Delete or intermediate from a whole-model step could then not be reworked at all (G5 and the tools are whole-model only), so Shaky on it would act as a Reject, against DO-3. *To reverse:* stop copying `options` into Submit steps and drop the widened take-out in `planSubmit`.
43. **D3-43** AUTOPILOT DECISION (ES-2, TR-7, process; review round 1, F9): FROZEN is built and verified first (3a, 3p, 3b, 3d, 3e1, 3f, 3g), then the whole model open (3c1, 3e2), and Claude may add cards last (3c2, 3e3), its intermediate inferences being the mechanism most like the per-Result reveal AP-24 removed. If 3c2 or 3e3 still has a blocker or major finding after its two fix rounds, "Claude may add cards" for Formalize moves to slice 4, beside TR-7's checkbox of the same name, and the ▾ offers only Open the whole model. *Alternative:* build it in slice 3 whatever its verification finds; or defer it to slice 4 now. *To reverse:* build 3c2 and 3e3 in slice 4 from this plan's §3.10.
44. **D3-44** AUTOPILOT DECISION (FROZEN 1, FZ-1, D1; review round 1, F10; reversed in review round 2, R2-12): editing a card's sentence, Why, stance or source on the board outside a session freezes that field, as a standing freeze in the same plan and the same Undo step (an emptied field is frozen empty), as the user's FROZEN 1 says ("applied … when the user manually edits a field"); the user's D1 answer re-allowed board edits outside sessions and did not withdraw it. Round 1 had chosen the opposite for usability (such freezes pile up as standing ones that a whole-model Formalize keeps); that narrowed an explicit instruction although a simple, sound way to follow it exists, so it is reversed. Not covered: a new card from the A|P box (a card created, not a field edited; and since every card starts there, freezing its sentence would freeze nearly every sentence and leave Open the whole model nothing to reword), arrows and marks (drawing them is how the person asks Claude for premises; freezing the Dependencies would forbid exactly that), kind changes (Claude never changes a kind), and moves (position is not a field). Typing in a transform freezes too (TR-5, slice 4). The user guide says how to lift these freezes: Unfreeze, or Unfreeze all other cards. *Alternative:* round 1's "board edits do not freeze"; or also freeze a new card's typed sentence. *To reverse:* drop the record from `planAction`'s edit-node plan (or add one to `add-node`'s).
45. **D3-45** AUTOPILOT DECISION (FZ-9 narrowed; review round 1, F13): a "Claude suggests" premise draft that is not accepted cannot be frozen ("Accept it first: a suggested premise is not in the working copy."); its Accept freezes it (RV-4). *Alternative:* freeze the draft's content on the draft, apply it as an own freeze at its premise write, and refuse a later version of the draft that differs. *To reverse:* add a draft subject to `FreezeSubject` and that rule to the premise write.
46. **D3-46** AUTOPILOT DECISION (FZ-9 narrowed; review round 1, F13): nothing can be frozen or unfrozen while Apply writes the files (phase applying, a few seconds): "Applying…". A session freeze made then would end with the session at once. *Alternative:* queue the action and make it a standing freeze change when Apply ends. *To reverse:* queue it in the host and post it as `setFreezes` when the board unlocks.
47. **D3-47** AUTOPILOT DECISION (TR-14, RV-1; review round 1, F21): a card that has a Proof broken item in a session cannot be a target of a mid-stage Formalize in that session, whatever the item's status: "re-prove it after the session ends". So `proof:<c>` is a Result or a Proof broken item for the whole session, and no record changes from one kind to the other. *Alternative:* allow it; once the person unfreezes the card's frozen-empty proof (which returns an accepted Proof broken item to review), the re-proving step's Result reuses the record (kind `result`, rev + 1, `partOf` its own target, hidden like any Result). *To reverse:* add that kind change to reconcile, and drop the start check.
48. **D3-48** AUTOPILOT DECISION (FZ-10, FZ-1, FROZEN 2; review round 1, F6; revised in review round 2, R2-17, R2-4): one check before the write covers every decision that would change frozen or held content. It reads the items the write takes out (restored to B's version) and brings back, with the table, by meaning, with no planned files and no Lean job, since ownership is total and disjoint; accepted content goes only with its item, which RV-5's confirmation asks about. A decline and its cascades ask [Unfreeze them and decline] [Keep them frozen at your version] [Cancel]; un-reject, back to review of a written premise, and the Undo or Redo of a decision are refused until the person unfreezes; an Add premise's Accept waits while its target's Proof is frozen (D3-36), and a due premise write whose own judgement finds frozen content fails; the judge's own reverts become stage problems, fail closed. *Alternative:* round 1's comparison of planned file texts (a model over the write's texts with the head's stale facts, and text-only hashes beside the keys); or let all of them through as stage problems that disable Apply until the person unfreezes or undoes (no dialog); or ask before un-reject and Undo too. *To reverse:* drop `frozenChangesOf` from the runner's decision path.
49. **D3-49** AUTOPILOT DECISION (DO-3, FZ-1, FROZEN 2, D2-57; review round 2, R2-3): Submit's take-out never changes frozen content. In every Submit queue (D2-57's take-out and D3-42's widened one), `planSubmit` leaves in ws/ every item whose take-out would change a frozen target or held name (§3.7's rule), with the items it depends on; its own step reworks the rest, and the feedback turn quotes the frozen part as "kept: the person froze it". A Shaky decline changes no file and no freeze, so "decline this card Shaky, but keep this field" works whichever the person does first; round 1's "[Shaky and unfreeze it]" dialog is gone. The cost: a kept item's unfrozen parts stay fixed for the queue's other steps, which must keep to them. *Alternative:* refuse Submit while a take-out would change frozen content, until the person unfreezes or rejects; or keep the Shaky dialog, which forces unfreezing before the decline. *To reverse:* drop the keep set from `planSubmit` and refuse Submit in that case instead (never let a take-out run over frozen content).
50. **D3-50** AUTOPILOT DECISION (FZ-10, FROZEN 2; review round 2, R2-7): a freeze made during a step that the step cannot meet, because its freeze_statements already fixed that content or one of its own ledger entries writes it, ends the step at once as given up, not counted, rolled back to S₀, with "You froze ‹x› after Claude's step had already changed it."; "Filling now" warns of it; `propose_arrow` refuses an arrow whose Remove arrow item is accepted, and `mark_proof_broken` a held `.holds`, since those entries could only end that way. FZ-10's promise (a freeze costs Claude only an uncounted check) holds for every freeze the step can still meet; for the others, Claude's step ends early instead of failing its remaining attempts. *Alternative:* a `withdraw` tool for the step's own ledger entries, and lifting `statement-changed` for content frozen after the step's freeze, so that Claude can comply and the step can still pass. *To reverse:* add that tool and that exemption, and drop `unmeetable` from the runner's checks.
51. **D3-51** AUTOPILOT DECISION (FZ-3, process; review round 2, R2-5; slice 2's V2A-S5 rule): no input the runner may forget turns FROZEN off. judgeState checks accepted items' `frozen` from the records whatever `freezes` holds; an Accept takes its held map from the record (`heldAtJudge`, which reconcile sets from the judgement) and is refused without one; the reducer's freeze paths refuse without the session's freezes; judgeState('final') and the backstop refuse without them; the runner passes a named stopgap, `NO_FREEZES_YET`, from 3a until 3d deletes it and makes the runner's types require the freezes, so tsc finds every call site. *Alternative:* the critic's: `ReviewState.freezeAtAccept`, passed by the runner, with an Accept refused without it (every Accept in the runner's slice-2 suites would then be refused from 3b to 3d); or optional fields with a spy test only (round 1's). *To reverse:* drop the refusals and the stopgap, and read held maps from ReviewState again.

### 7.3 Patches and logs
- After each sub-slice the integrator saves `bundle_21/evidence/patches/after_slice_3x.patch`: every file changed or created since the baseline, excluding `package-lock.json`.
- At the slice end the integrator logs §7.2 in `02_autopilot_decisions.md` (one AP entry listing D3-1–D3-51, with how to reverse each, and whether D3-43's fallback was used). The entry warns that reversing slice 3 while a session is open drops that session's freezes, which the older build ignores: Exit open sessions first. Then a "slice 3 done" entry.

## 8. Change log

- 2026-11-19 (integrator): plan written from the two slice-3 designs (the freeze engine and checks; the freeze UI, protocol and Undo); conflicts resolved in §7.1, decisions in §7.2.
- 2026-11-19 (plan fixer, review round 1). Source: the critic's round-1 findings, relayed by the workflow: 1 blocker, 9 major, 11 minor (F1–F21). Every blocker and major finding was fixed; every minor one too. Where the critic offered a choice, the choice is noted; F7(b) takes the critic's own alternative, for the reason given. New decisions: D3-41–D3-48; revised: D3-4, D3-5, D3-8, D3-9, D3-10, D3-13, D3-19, D3-23, D3-36, D3-37, D3-38, D3-40.
  - **Blocker. F1** (a whole-model step could rewrite another subject's standing-frozen content, which the table never held): a session's steps change only its subject; other subjects' files keep text and meaning in every step (`existing-changed` `other-subject`), and G5's exception, the ids, the three tools and `propose_arrow` work only on the session's subject. §0's header, §2.3 tokens, §2.8, §2.9 (`ToolInput.subject`), §3.1, §3.10, §4.8, D3-38, D3-41; cheat 17, tests in 3c1 and 3e2.
  - **Major:**
    - **F2** (the `inherited` rule failed for whole-model steps and left later queues stuck on old stage problems): the critic's fix, the whole-state two-value rule at step purposes; `OwnFreeze.queue`/`step`, `JudgeInput.freezes.queue` and `FrozenCheck.inherited` are gone; the stage problem's ‹T› comes from the owning item's origin. §2.2, §2.3, §2.9, §3.4 step 4, §3.5 (S₀ for a completion's gate), §3.8, D3-5; tests in 3a, cheat 18.
    - **F3** (an Undo of an Unfreeze during a step restored old reasons that were not fresh, and missed the rollback): `SessionFreezes.madeAt`, set by every freeze action, Undo and Redo that gives a key a reason; `fresh` and the rollback to S₀ read it. The critic's main fix, not its refusing alternative, so Undo stays the inverse by hand (UN-4). §2.2, §2.3, §2.9, §3.4 step 5, §3.8, §5.3, D3-19; tests in 3a, 3b, 3d, cheat 10(d).
    - **F4** (three held paths; a reconcile-returned accepted vocabulary item turned its accepted dependent into a `held (new)` stage problem): the critic's main fix: `ItemRecord.frozen = { fingerprint, held, at }`, checked exactly like an own freeze; `meaning`, `heldItems`, step 3's accepted sub-bullet and the tokens `new` and `item` are gone; `freezeAtAccept` holds held maps; the premise write sets `held` too. §2.3, §3.4, §3.5, §3.7, D3-4; tests in 3a.
    - **F5** (Apply's id writes for kept cards made F′ that F's facts do not describe): the critic's fix: the session's `ids` commit writes every derived-id card's `id:` of the subject once, after `base`; Apply writes no id of its own; an empty Apply or Exit with ticks makes one board step with freezes.json and the kept cards' ids. New core `planIdWrites` (3b). §1.1 (3b, 3e1), §2.2 (`end`), §2.6, §2.9, §3.10, §5.4, D3-37; tests in 3b and 3e1.
    - **F6** (cascades, un-reject's merge, the judge's reverts and a premise's completion changed frozen content without asking): one whole-state check before every decision's write, by text (`AddressValue.text`, `HeldValue.text`, core `frozenChangesOf`): a decline asks [Unfreeze them and decline] [Keep them frozen at your version] [Cancel] (the message's `freeze`, replacing `ItemDecision.freeze`); un-reject and the Undo or Redo of a decision are refused; an Add premise's Accept waits while its target's Proof is frozen and `propose_assumption` refuses such a target; the judge's reverts are stage problems. §2.2, §2.3, §2.4 (`frozenChanges`), §2.5, §2.7, §2.8, §2.9, §3.5, §3.7, §4.4, D3-36, D3-48; tests in 3b and 3d, paths 19–22 in §6.2.
    - **F7** (Shaky content not fixed in whole-model steps; Submit steps copying the switches broke D2-57's take-out; telelean's own removals blocked): (a) and (c) as the critic proposed. (b) by the critic's alternative: Submit and Retry steps keep their inference's switches, and `planSubmit` takes out every kept Shaky and to-be-redone item when a step of the queue is whole-model. Reason: under the narrow limits a Shaky Change, Delete or intermediate from a whole-model step could not be reworked at all, so Shaky would act as a Reject (DO-3). Needed with it, beyond the finding: a ledger `changed` entry gives whole-model Change items an origin (otherwise no Submit step would rework them), and the new ledger kinds count only while their item's content belongs in ws/, so a take-out is not redone by the next normalise. §2.3, §3.10, D3-42; tests in 3c1 and 3e2.
    - **F8** (whole-model steps could fill only the empty statements at the selected arrows): the critic's fix: a whole-model step's `fuzzyStatements` are every empty, unfrozen statement of the subject, pinned by normalise; "Filling now" covers every empty field such a step may fill. No narrowing remains, so no decision is needed. §2.8 (system prompt), §3.8, §3.10, §4.8; tests in 3c1 and 3e2.
    - **F9** (3c too big, intermediates risky, FROZEN not verifiable before the riskiest part): the critic's split and order: 3c1/3c2 and 3e1/3e2/3e3, with FROZEN complete and checked after 3g (§6.3), the whole model next, Claude may add cards last, and D3-43's pre-logged fallback to slice 4. `unfreezeRequestProblems` moved to 3b. §0, §1, §1.1, §2.8, §2.9, §3.10, §4.8, §6.1, §6.3, §7.1, D3-13, D3-40, D3-43.
    - **F10** (FROZEN 1 and board edits outside a session: no decision recorded): D3-44 as the critic recommended (board edits do not freeze), with the reason that FROZEN 1 predates D1's board edits, and the user guide says so. Header, §1.1 (3g), §3.1, D3-44.
  - **Minor:**
    - **F11** (contract gaps): (1) `undo`/`redo` during a step, `session` posted after every freeze action, no `viewVersion` rise (§2.4); (2) `SessionViewInput.running` (§2.4); (3) the new fields optional where slice-2 code builds the object, with a 3d call-site test (§0, §2.3); (4) 3a's `set-freezes` stub case, webview label and runner entry (§0, §1.1); (5) the re-ask behaviour change listed (§0); (6) freezes into `writePremise` and `complete` (§1.1, §6.1); (7) the checked write before the in-memory change during a step (§3.6). Tests in 3b and 3d.
    - **F12** (no J in the first queue; a freeze during the queue-end judge missed): J is the base during the first queue; every `judge-apply` recomputes the frozen findings with the store then; freezing while judging is also refused now (F17). §3.5, §3.6, §3.8; tests in 3d.
    - **F13** (unlogged narrowings): D3-45 (premise drafts) and D3-46 (applying) logged with alternatives; (c) fixed instead of logged: lock slots in the item detail's field rows (§4.2, §1.1 3f/3g); D3-9 states its cost (§3.9, D3-9).
    - **F14** (a key unfrozen then frozen again was offered "stays unfrozen"): rows are whole-state, end state against start snapshot. §2.4, §5.4; test in 3b.
    - **F15** (`keep` over 2,000 keys): `endSession.keepAll` and `LIMITS.keepKeys: 20000`. §2.5, §2.7, §4.7; tests in 3b, 3e1, 3g.
    - **F16** (the banner read only `start`): `SessionFreezesView.mode` from the running or last queue; `start` only for EN-2. §2.2, §2.4, §4.5; tests in 3b and 3g.
    - **F17** ("waits" against D2-74): refused while judging, in every phase, with its Undo and Redo; the webview disables the four actions. §2.5, §2.7, §3.6, §4.3, §4.9, D3-8, D3-23; tests in 3d and 3g.
    - **F18** (kept freezes lost by a reload before Exit's board step; Apply's recovery ignored freezes.json): `SessionFreezes.end` records the planned text before the write, `recover()` makes a pending board step, and Apply's recovery compares freezes.json. §2.2, §5.4; tests in 3e1.
    - **F19** (the mask dropped whole-model arrows into non-targets): `dropArrows` keeps only Results' arrows; `review/mask.ts` in 3c1 with a twin. §1.1, §3.10; test in 3c1.
    - **F20** (meaningKey only in 3e while Accept froze from 3b): the probe moved to a new runner sub-slice 3p right after 3a, with the recordings regenerated. §0, §1, §1.1, §2.1, §6.
    - **F21** (a Proof broken record turning into a Result): the critic's refusing alternative, widened to every status, since a rejected Proof broken record and a later Result would share the key as well: D3-47 (re-prove after the session). Also found while fixing it: a `card:` record can turn from Formalize into Change or Delete within a session, so reconcile's new version takes its draft's kind for `card:` items. §1.1 (3c1), §3.10, D3-10, D3-47; tests in 3c1.
  - **New sub-slice list** (core strictly one at a time: 3a, 3b, 3c1, 3c2): 3a → 3p → 3b → 3d (3f beside it) → 3e1 (3g beside it) → FROZEN verified → 3c1 → 3e2 → 3c2 → 3e3, the last two under D3-43's fallback.
- 2026-11-19 (plan fixer), review round 2: the critic's round-2 findings, relayed by the workflow: 7 major and 10 minor (R2-1–R2-17), no blocker. Every major and minor finding was fixed, R2-13 in part (its first claim was wrong, below); where a fix was adapted, the reason is given. Four claims were checked against slice 2's built code first: R2-6 (`review/items.ts` attaches the `id:` write-back to the card's item, V2A1-C1), R2-10 (`run/persist.ts`'s `RunFiles.writeState` takes text captured when queued), R2-11(2) (`review/records.ts`'s `decisionKey` picks its fields by name) and R2-15 (`run/manager.ts`'s `recover()` reads only runs that have not ended; `shadow/index.ts`'s `pruneRunDirs` deletes ended ones). New decisions: D3-49–D3-51; revised: D3-4, D3-22, D3-30, D3-37, D3-41, D3-48; reversed: D3-44.
  - **Major:**
    - **R2-1** (a freeze at a value equal to B's took its held map from B, so freezing a card that uses a definition a step changed left a `held` problem that accepting the change could not clear): the critic's fix. `{ from: 'base' }` only when the held map is B's too, otherwise `{ from: 'state' }`; Exit keeps only `{ from: 'base' }`. §2.2, §3.6, §5.4; test in 3b.
    - **R2-2** (Back to review restored a pre-Submit stack while freeze actions made in confirming stayed in effect, so a whole-state Undo could silently unfreeze): the critic's fix. Per-key FreezeDelta; Undo and Redo touch only their keys (`conflict` if they changed otherwise); Back to review keeps the stack as it is. §2.3, §5.3, §7.1, D3-22; tests in 3b and 3d.
    - **R2-3** (Submit's take-out reverted a field the person froze on a Shaky item): the critic's fix, plus the items a kept item depends on (so its unfrozen parts still build). The round-1 Shaky dialog ("[Shaky and unfreeze it]") is dropped, since Shaky with a freeze now works in either order. `planSubmit` gains an optional `freezes` input. §0, §1.1, §2.9, §3.7, §3.10, §4.4, §6.2 (path 23), D3-42, D3-49; tests in 3b, 3c1, 3d and 3e2.
    - **R2-4** (D2-23's returned dependents kept `frozen` through an unconfirmed cascade, leaving lasting stage problems): the critic's fix. RV-5's confirmation lists every `frozen` item a cascade changes, whatever its status, and confirming clears it; an item holder outside the cascade appears in §3.7's list, and "Unfreeze them and decline" clears its `frozen` (an accepted one returns to review). Also: Unfreeze clears `frozen` on an item in review or to be redone that it covers. §2.3, §3.6, §3.7, §4.4, D3-4; test in 3b.
    - **R2-5** (optional fields let a forgotten call site turn FROZEN off): fixed, with one part adapted. judgeState always checks accepted items' `frozen`; judgeState('final') and `applyBackstop` refuse without freezes; the reducer's freeze paths refuse without `ReviewState.freezes`; 3d makes the runner's types require them. The Accept's fail-closed check follows slice 2's own V2A-S5 rule instead of `ReviewState.freezeAtAccept`: reconcile sets `ItemRecord.heldAtJudge` from the judgement, and an Accept without it is refused. Reason: a ReviewState field passed by the runner would refuse every Accept in the runner's slice-2 suites from 3b until 3d, and is one more input to forget; `ReviewState.freezeAtAccept` is removed. The runner's `NO_FREEZES_YET` stopgap keeps the final check and Apply working from 3a to 3d, and 3d deletes it. §0, §1.1, §2.3, §3.3, §3.5, §3.7, D3-51; tests in 3a, 3b and 3d.
    - **R2-6** (reverts took out the `ids` commit's `id:` lines): the critic's fix. A reverted block keeps or regains its derived `id:` (`planItemRevert`, so Submit's take-out and the judge's reverts too), Apply refuses a kept freeze of a card with no written id in F, and D3-37 and the user guide say that Apply writes `id:` lines into every file of the subject. §0, §1.1, §3.10, §5.4, D3-37; tests in 3b and 3e1.
    - **R2-7** (FZ-10 could not be met for a freeze of content that freeze_statements fixed or the step's own ledger entries write): the critic's early end, with a simpler trigger: any such finding ends the step, not only when it is the only blocking one, since the step can never pass with it. Core's `unmeetable` (3b) decides it; `GateFinding` gains `freezeKey` and `holders` for it (and for Select them). The two tool refusals are added, and D3-50 is logged with the `withdraw` alternative. §2.3, §2.8, §2.9, §3.8, §3.10, §6.2 (cheat 10(e)), D3-50; tests in 3b, 3c1, 3d and 3e2.
  - **Minor:**
    - **R2-8** (whole-model limits fixed a step's own Shaky items): reworded as proposed. §3.10; test in 3c1.
    - **R2-9** (step 3 dropped an accepted item's own names from the held check): reworded as proposed. §3.4; test in 3a.
    - **R2-10** (a step write queued after a freeze's write could put run.json back without it): run.json text is built when its write runs; `dispose()`'s second write likewise, and a checked write after `close()` rejects. §1.1, §3.6; test in 3d.
    - **R2-11** (three contract gaps): (1) the decide request's `freeze` and `freezeSubjects`, which Redo re-sends; (2) `decisionKey` ignores `frozen`; (3) one `needs-confirmation` carries every list, `confirmed` freezes Claude's proposal of every listed target, and "your version" is offered for one item only (D3-30 extended; a Delete or Remove arrow among several items is left out with a reason). §2.3, §2.4, §3.6, §3.7, §4.4, D3-30; tests in 3b.
    - **R2-12** (D3-44 narrowed FROZEN 1 for usability): the critic's first option. D3-44 is reversed: editing a card's sentence, Why, stance or source on the board freezes that field (standing, same plan, same Undo step). New cards, arrows, marks, kind changes and moves are left out, each with its reason in D3-44. Header, §1.1, §2.6, §3.1, §5.1, D3-44; tests in 3b and 3d.
    - **R2-13** (the one-subject invariant enforced only in whole-model steps): in part. Its claim that preset steps may add declarations in another subject's module is wrong: G0's `outside-subject` file rule (core `gate/g0.ts`, M2), which slice 2 applies at every purpose of a session, refuses any change to another subject's files. The meaning part is right: the `other-subject` rule moves to 3a and applies at every judged state in every step, narrow ones included. It compares other subjects' declarations' meaningKeys, and the held values of this subject's declarations that they reach in B (the vocabulary they import, which meaningKey alone does not cover). `existing-changed` compares meaningKey in every step (FZ-3). §0, §1, §1.1, §2.3, §3.1, §3.5, §3.10, D3-41; tests in 3a.
    - **R2-14** (Undo and Redo skipped planFreeze's `left` rules): an Undo that would give a reason planFreeze would refuse now is refused with its text, and `violates` is computed on the masked state while the results are hidden. §5.3, D3-22; test in 3b.
    - **R2-15** (the board-step replay did not fit the built runner; upgraded sessions' accepted items lacked `frozen`): the critic's fix. `recover()` reads the ended run with an unwritten board step, `pruneRunDirs` keeps it, and a board step that fails then is a notice, marked written. The upgrade sets `frozen` on accepted records, and `freezeAtAccept` now covers accepted items too. §1.1, §2.2, §2.3, §5.2, §5.4; tests in 3d and 3e1.
    - **R2-16** (3b had no fallback split): 3b1 and 3b2 as proposed, with this round's additions placed. §1.
    - **R2-17** (§3.7's text comparison on a planned model): the critic's item-based rule, with two additions found while fixing it. A premise item owns its target's Proof while its completion is written, since the premise's take-out removes the completion. The Undo of "Unfreeze them and decline" lists nothing for the keys it restores itself. "Keep them frozen at your version" revalues as `{ from: 'base' }`; if a held name still rests on another change, the next judge shows it (fail closed). `AddressValue.text`, `HeldValue.text`, the planned model and the dialog's `shaky` flag are gone. §2.2, §2.4, §2.9, §3.2, §3.7, §4.4, §7.1, D3-48; tests in 3b.
  - Also corrected: slice 2's backstop types live in core `review/types.ts`, not `gate/types.ts` (§2.3).
